import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell, webContents } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PRINT_PREVIEW_VISIBLE } from '../src/featureFlags.js'

/** Shared guest session so all tabs share cookies and one `will-download` hook. */
const GUEST_SESSION_PARTITION = 'persist:browser-guest'

/** @type {Map<string, import('electron').DownloadItem>} */
const downloadItemsById = new Map()

/** Avoid duplicate `will-download` / IPC listeners if this module is evaluated more than once. */
let guestDownloadPipelineListenersAttached = false

const DOWNLOAD_HISTORY_MAX = 100
const DOWNLOAD_HISTORY_BASENAME = 'downloads-history.json'
const DOWNLOAD_SETTINGS_BASENAME = 'download-settings.json'

/** @type {{ askSaveLocation: boolean }} */
let downloadSettings = { askSaveLocation: false }

function downloadSettingsFilePath() {
  return path.join(app.getPath('userData'), DOWNLOAD_SETTINGS_BASENAME)
}

function readDownloadSettingsFromDisk() {
  try {
    const p = downloadSettingsFilePath()
    if (!fs.existsSync(p)) return { askSaveLocation: false }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return { askSaveLocation: Boolean(raw?.askSaveLocation) }
  } catch {
    return { askSaveLocation: false }
  }
}

/** @param {{ askSaveLocation?: boolean }} next */
function writeDownloadSettingsToDisk(next) {
  downloadSettings = {
    askSaveLocation: Boolean(next?.askSaveLocation),
  }
  try {
    fs.writeFileSync(downloadSettingsFilePath(), JSON.stringify(downloadSettings), 'utf8')
  } catch {
    /* ignore disk errors */
  }
}

/**
 * @typedef {{
 *   id: string,
 *   filename: string,
 *   url: string,
 *   savePath: string,
 *   state: string,
 *   receivedBytes: number,
 *   totalBytes: number,
 *   at: number,
 * }} DownloadHistoryRow
 */

/** @type {DownloadHistoryRow[]} */
let persistedDownloadRecords = []

function downloadHistoryFilePath() {
  return path.join(app.getPath('userData'), DOWNLOAD_HISTORY_BASENAME)
}

function readDownloadHistoryFromDisk() {
  try {
    const p = downloadHistoryFilePath()
    if (!fs.existsSync(p)) return []
    const raw = fs.readFileSync(p, 'utf8')
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    const allowed = new Set(['completed', 'cancelled', 'interrupted', 'progressing'])
    return arr
      .filter((x) => x && typeof x.id === 'string')
      .map((x) => ({
        id: String(x.id),
        filename: String(x.filename || 'download'),
        url: String(x.url || ''),
        savePath: String(x.savePath || ''),
        state: allowed.has(String(x.state)) ? String(x.state) : 'completed',
        receivedBytes: Number(x.receivedBytes) || 0,
        totalBytes: Number(x.totalBytes) || 0,
        at: typeof x.at === 'number' && Number.isFinite(x.at) ? x.at : Date.now(),
      }))
      .filter((row) => row.state !== 'progressing')
      .slice(0, DOWNLOAD_HISTORY_MAX)
  } catch {
    return []
  }
}

/** @param {DownloadHistoryRow[]} rows */
function writeDownloadHistoryToDisk(rows) {
  try {
    fs.writeFileSync(downloadHistoryFilePath(), JSON.stringify(rows.slice(0, DOWNLOAD_HISTORY_MAX)), 'utf8')
  } catch {
    /* ignore disk errors */
  }
}

/** @param {DownloadHistoryRow} row */
function upsertPersistedDownload(row) {
  const idx = persistedDownloadRecords.findIndex((r) => r.id === row.id)
  if (idx >= 0) persistedDownloadRecords[idx] = row
  else persistedDownloadRecords.unshift(row)
  persistedDownloadRecords = persistedDownloadRecords.slice(0, DOWNLOAD_HISTORY_MAX)
  writeDownloadHistoryToDisk(persistedDownloadRecords)
}

function registerDownloadHistoryIpc() {
  for (const ch of ['get-download-history', 'download-history-remove', 'download-history-clear-completed']) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      /* no prior handler */
    }
  }

  ipcMain.handle('get-download-history', () => [...persistedDownloadRecords])

  ipcMain.handle('download-history-remove', (_event, downloadId) => {
    const id = typeof downloadId === 'string' ? downloadId : ''
    if (!id) return false
    persistedDownloadRecords = persistedDownloadRecords.filter((r) => r.id !== id)
    writeDownloadHistoryToDisk(persistedDownloadRecords)
    return true
  })

  ipcMain.handle('download-history-clear-completed', () => {
    persistedDownloadRecords = []
    writeDownloadHistoryToDisk(persistedDownloadRecords)
    return []
  })
}

/**
 * @param {string} dir
 * @param {string} filename
 */
function uniqueSavePath(dir, filename) {
  const safe = filename.replace(/[/\\]/g, '_') || 'download'
  const ext = path.extname(safe)
  const base = path.basename(safe, ext)
  let candidate = path.join(dir, safe)
  let n = 1
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${n})${ext}`)
    n += 1
  }
  return candidate
}

/**
 * @param {Record<string, unknown>} payload
 */
function broadcastDownloadUpdate(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('shell-download-update', payload)
    } catch {
      /* window may be destroyed */
    }
  }
}

/**
 * @param {import('electron').DownloadItem} item
 * @param {string} savePath
 */
function trackGuestDownloadItem(item, savePath) {
  const id = randomUUID()
  item.setSavePath(savePath)
  downloadItemsById.set(id, item)

  const startedAt = Date.now()
  const basePayload = {
    id,
    filename: path.basename(savePath),
    url: item.getURL(),
    savePath,
    startedAt,
  }

  broadcastDownloadUpdate({
    ...basePayload,
    state: 'progressing',
    receivedBytes: item.getReceivedBytes(),
    totalBytes: item.getTotalBytes(),
    at: startedAt,
  })

  item.on('updated', (_e, state) => {
    const itemState = item.getState()
    const broadcastState =
      itemState === 'completed'
        ? 'completed'
        : state === 'interrupted' || itemState === 'interrupted'
          ? 'interrupted'
          : 'progressing'
    broadcastDownloadUpdate({
      ...basePayload,
      filename: path.basename(item.getSavePath() || savePath),
      savePath: item.getSavePath() || savePath,
      state: broadcastState,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      at: startedAt,
    })
  })

  item.on('done', (_e, doneState) => {
    downloadItemsById.delete(id)
    const finalState = doneState === 'completed' ? 'completed' : doneState
    const resolvedPath = item.getSavePath() || savePath
    const finalRow = {
      id,
      filename: path.basename(resolvedPath),
      url: basePayload.url,
      savePath: resolvedPath,
      state: finalState,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      at: startedAt,
    }
    broadcastDownloadUpdate(finalRow)
    if (finalState === 'completed') {
      upsertPersistedDownload(finalRow)
    }
  })
}

function registerDownloadSettingsIpc() {
  for (const ch of ['get-download-settings', 'set-download-settings']) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      /* no prior handler */
    }
  }

  ipcMain.handle('get-download-settings', () => ({ ...downloadSettings }))

  ipcMain.handle('set-download-settings', (_event, payload) => {
    writeDownloadSettingsToDisk({
      askSaveLocation: Boolean(payload?.askSaveLocation),
    })
    return { ...downloadSettings }
  })
}

function registerGuestDownloadPipeline() {
  persistedDownloadRecords = readDownloadHistoryFromDisk()
  downloadSettings = readDownloadSettingsFromDisk()
  registerDownloadHistoryIpc()
  registerDownloadSettingsIpc()

  if (guestDownloadPipelineListenersAttached) return
  guestDownloadPipelineListenersAttached = true

  const guestSession = session.fromPartition(GUEST_SESSION_PARTITION)

  guestSession.on('will-download', (_event, item, webContents) => {
    const downloadsDir = app.getPath('downloads')
    const suggested = item.getFilename() || 'download'

    if (downloadSettings.askSaveLocation) {
      const parent = mainWindow || BrowserWindow.fromWebContents(webContents)
      const defaultPath = path.join(downloadsDir, suggested.replace(/[/\\]/g, '_'))
      const filePath = dialog.showSaveDialogSync(parent ?? undefined, {
        title: 'Save As',
        defaultPath,
        buttonLabel: 'Save',
      })
      if (!filePath) {
        item.cancel()
        return
      }
      trackGuestDownloadItem(item, filePath)
      return
    }

    const savePath = uniqueSavePath(downloadsDir, suggested)
    trackGuestDownloadItem(item, savePath)
  })

  ipcMain.on('download-cancel', (event, payload) => {
    const downloadId = typeof payload?.id === 'string' ? payload.id : ''
    if (!downloadId) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const item = downloadItemsById.get(downloadId)
    item?.cancel()
  })

  ipcMain.on('download-show-in-folder', (event, payload) => {
    const filePath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    if (!filePath || !fs.existsSync(filePath)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    shell.showItemInFolder(filePath)
  })

  ipcMain.on('download-open-file', (event, payload) => {
    const filePath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    if (!filePath || !fs.existsSync(filePath)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    void shell.openPath(filePath)
  })

  ipcMain.handle('download-discard-file', async (_event, payload) => {
    const downloadId = typeof payload?.id === 'string' ? payload.id : ''
    const filePath = typeof payload?.path === 'string' ? payload.path.trim() : ''
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath)
      } catch {
        /* file may be in use */
      }
    }
    if (downloadId) {
      persistedDownloadRecords = persistedDownloadRecords.filter((r) => r.id !== downloadId)
      writeDownloadHistoryToDisk(persistedDownloadRecords)
    }
    return true
  })
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL)

function registerSearchResultLinkMenu() {
  ipcMain.on('show-search-result-link-menu', (event, payload) => {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
    if (!url || !/^https?:\/\//i.test(url)) return

    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    const notify = (action) => {
      event.sender.send('search-result-link-menu-action', { action, url })
    }

    Menu.buildFromTemplate([
      { label: 'Open link', click: () => notify('open') },
      { label: 'Open link in new tab', click: () => notify('openNewTab') },
      { type: 'separator' },
      { label: 'Copy link address', click: () => clipboard.writeText(url) },
    ]).popup({ window: win })
  })
}

/** @typedef {'find' | 'print' | 'zoom-in' | 'zoom-out' | 'zoom-reset'} PageToolsShortcutAction */

/** @type {import('electron').BrowserWindow | null} */
let mainWindow = null

/**
 * @param {Electron.Input} input
 * @returns {PageToolsShortcutAction | null}
 */
function pageToolsActionFromInput(input) {
  if (input.type !== 'keyDown') return null
  if (!(input.control || input.meta)) return null

  const code = String(input.code || '')
  const key = String(input.key || '')
  const keyLower = key.toLowerCase()

  if (key.length === 1) {
    const controlCode = key.charCodeAt(0)
    if (controlCode === 6) return 'find'
    if (PRINT_PREVIEW_VISIBLE && controlCode === 16) return 'print'
  }

  if (code === 'KeyF' || keyLower === 'f') return 'find'
  if (PRINT_PREVIEW_VISIBLE && (code === 'KeyP' || keyLower === 'p')) return 'print'
  if (code === 'Equal' || code === 'NumpadAdd' || keyLower === '=' || keyLower === '+') return 'zoom-in'
  if (code === 'Minus' || code === 'NumpadSubtract' || keyLower === '-') return 'zoom-out'
  if (code === 'Digit0' || code === 'Numpad0' || keyLower === '0') return 'zoom-reset'

  return null
}

/** @param {PageToolsShortcutAction} action */
function sendPageToolsShortcut(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('page-tools-shortcut', { action })
}

/** @type {import('electron').BrowserWindow | null} */
let printPreviewWindow = null
/** @type {string | null} */
let printPreviewTempPdfPath = null

function cleanupPrintPreviewTempFile() {
  if (!printPreviewTempPdfPath) return
  try {
    fs.unlinkSync(printPreviewTempPdfPath)
  } catch {
    /* ignore */
  }
  printPreviewTempPdfPath = null
}

function closePrintPreviewWindow() {
  const win = printPreviewWindow
  printPreviewWindow = null
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('closed')
    win.removeAllListeners('ready-to-show')
    win.close()
  }
  cleanupPrintPreviewTempFile()
}

/**
 * @param {{ pdfBuffer?: Buffer | null, shellHtml?: string }} options
 */
async function presentPrintPreviewWindow({ pdfBuffer = null, shellHtml = '' } = {}) {
  closePrintPreviewWindow()

  const hasPdf = pdfBuffer && pdfBuffer.length > 0
  const html = shellHtml.trim()
  if (!hasPdf && !html) {
    throw new Error('Nothing to preview')
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window unavailable')
  }

  const previewWin = new BrowserWindow({
    parent: mainWindow,
    modal: true,
    width: 980,
    height: 760,
    minWidth: 520,
    minHeight: 420,
    title: 'Print preview',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'print-preview-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  printPreviewWindow = previewWin

  const showPreview = () => {
    if (previewWin.isDestroyed()) return
    previewWin.show()
    previewWin.focus()
  }

  previewWin.once('ready-to-show', showPreview)
  previewWin.on('closed', () => {
    if (printPreviewWindow === previewWin) {
      printPreviewWindow = null
    }
    cleanupPrintPreviewTempFile()
  })

  let previewDoc = ''
  if (hasPdf) {
    printPreviewTempPdfPath = path.join(app.getPath('temp'), `print-preview-${randomUUID()}.pdf`)
    fs.writeFileSync(printPreviewTempPdfPath, pdfBuffer)
    previewDoc = buildPdfPreviewDocumentWithFile(pathToFileURL(printPreviewTempPdfPath).href)
  } else {
    previewDoc = buildShellPreviewDocument(html)
  }

  await previewWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewDoc)}`)

  if (!previewWin.isDestroyed() && !previewWin.isVisible()) {
    showPreview()
  }

  return true
}

/**
 * @param {string} bodyHtml
 */
function buildShellPreviewDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print preview</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; color: #111; background: #fff; }
    .toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid #d0d7de; background: #f6f8fa;
    }
    .toolbar h1 { margin: 0; font-size: 15px; font-weight: 600; }
    .toolbar-actions { display: flex; gap: 8px; }
    button {
      height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid #b0b8c8;
      background: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    button.primary { background: #2563eb; border-color: #1d4ed8; color: #fff; }
    .preview-body { height: calc(100% - 53px); overflow: auto; padding: 24px; background: #fff; }
  </style>
</head>
<body>
  <header class="toolbar">
    <h1>Print preview</h1>
    <div class="toolbar-actions">
      <button type="button" class="primary" id="print-btn">Print…</button>
      <button type="button" id="close-btn">Close</button>
    </div>
  </header>
  <main class="preview-body">${bodyHtml}</main>
  <script>
    document.getElementById('print-btn').addEventListener('click', () => {
      window.printPreview?.print?.()
    })
    document.getElementById('close-btn').addEventListener('click', () => {
      window.printPreview?.close?.()
    })
  </script>
</body>
</html>`
}

/**
 * @param {string} fileUrl
 */
function buildPdfPreviewDocumentWithFile(fileUrl) {
  const safeUrl = fileUrl.replace(/"/g, '&quot;')
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print preview</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #111; color: #fff; }
    .toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid #2a2f3a; background: #1e222a;
    }
    .toolbar h1 { margin: 0; font-size: 15px; font-weight: 600; }
    .toolbar-actions { display: flex; gap: 8px; }
    button {
      height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid #4a5266;
      background: #252a35; color: #e8eaed; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    button.primary { background: #2563eb; border-color: #1d4ed8; color: #fff; }
    .preview-body { height: calc(100% - 53px); background: #525659; }
    embed { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="toolbar">
    <h1>Print preview</h1>
    <div class="toolbar-actions">
      <button type="button" class="primary" id="print-btn">Print…</button>
      <button type="button" id="close-btn">Close</button>
    </div>
  </header>
  <main class="preview-body">
    <embed src="${safeUrl}" type="application/pdf" />
  </main>
  <script>
    document.getElementById('print-btn').addEventListener('click', () => {
      window.printPreview?.print?.()
    })
    document.getElementById('close-btn').addEventListener('click', () => {
      window.printPreview?.close?.()
    })
  </script>
</body>
</html>`
}

/**
 * @param {string} pdfBase64
 * @deprecated Use buildPdfPreviewDocumentWithFile for large page PDFs.
 */
function buildPdfPreviewDocument(pdfBase64) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print preview</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #111; color: #fff; }
    .toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 14px; border-bottom: 1px solid #2a2f3a; background: #1e222a;
    }
    .toolbar h1 { margin: 0; font-size: 15px; font-weight: 600; }
    .toolbar-actions { display: flex; gap: 8px; }
    button {
      height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid #4a5266;
      background: #252a35; color: #e8eaed; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    button.primary { background: #2563eb; border-color: #1d4ed8; color: #fff; }
    .preview-body { height: calc(100% - 53px); background: #525659; }
    embed { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <header class="toolbar">
    <h1>Print preview</h1>
    <div class="toolbar-actions">
      <button type="button" class="primary" id="print-btn">Print…</button>
      <button type="button" id="close-btn">Close</button>
    </div>
  </header>
  <main class="preview-body">
    <embed id="pdf-embed" type="application/pdf" />
  </main>
  <script>
    document.getElementById('pdf-embed').src = 'data:application/pdf;base64,${pdfBase64}'
    document.getElementById('print-btn').addEventListener('click', () => {
      window.printPreview?.print?.()
    })
    document.getElementById('close-btn').addEventListener('click', () => {
      window.printPreview?.close?.()
    })
  </script>
</body>
</html>`
}

function registerPrintPreviewIpc() {
  for (const ch of ['open-print-preview', 'print-preview-print', 'print-shell-html']) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      /* no prior handler */
    }
  }

  ipcMain.handle('open-print-preview', async (_event, payload) => {
    const guestId = typeof payload?.guestWebContentsId === 'number' ? payload.guestWebContentsId : null
    const shellHtml = typeof payload?.shellHtml === 'string' ? payload.shellHtml : ''
    const pdfData = payload?.pdfData

    /** @type {Buffer | null} */
    let pdfBuffer = null
    if (pdfData) {
      pdfBuffer = Buffer.isBuffer(pdfData) ? pdfData : Buffer.from(pdfData)
    } else if (guestId != null) {
      const guest = webContents.fromId(guestId)
      if (!guest || guest.isDestroyed()) {
        throw new Error('Page not ready for print preview')
      }
      pdfBuffer = await guest.printToPDF({ printBackground: true })
    }

    return presentPrintPreviewWindow({ pdfBuffer, shellHtml })
  })

  ipcMain.handle('print-preview-print', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    return await new Promise((resolve) => {
      win.webContents.print({ printBackground: true, silent: false }, (success) => {
        resolve(Boolean(success))
      })
    })
  })

  ipcMain.on('print-preview-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) win.close()
  })

  ipcMain.handle('print-shell-html', async (_event, html) => {
    if (typeof html !== 'string' || !html.trim()) return false
    return presentPrintPreviewWindow({ shellHtml: html })
  })
}

function registerPrintShellIpc() {
  registerPrintPreviewIpc()
}

function registerApplicationMenu() {
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        ...(PRINT_PREVIEW_VISIBLE
          ? [
              {
                label: 'Print Preview',
                accelerator: 'CmdOrCtrl+P',
                click: () => sendPageToolsShortcut('print'),
              },
              { type: 'separator' },
            ]
          : []),
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in Page',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendPageToolsShortcut('find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => sendPageToolsShortcut('zoom-in'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => sendPageToolsShortcut('zoom-out'),
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => sendPageToolsShortcut('zoom-reset'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/**
 * @param {Electron.Input} input
 * @param {Electron.Event<{ readonly defaultPrevented: boolean }>} event
 */
function handlePageToolsShortcutInput(input, event) {
  const action = pageToolsActionFromInput(input)
  if (!action) return
  event.preventDefault()
  sendPageToolsShortcut(action)
}

function registerPageToolsShortcutForwarding() {
  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() !== 'webview') return
    contents.on('before-input-event', (event, input) => {
      const action = pageToolsActionFromInput(input)
      if (!action) return
      event.preventDefault()
      sendPageToolsShortcut(action)
    })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  })

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.on('before-input-event', (event, input) => {
    handlePageToolsShortcutInput(input, event)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//i.test(url)) {
      win.webContents.send('shell-open-url-new-tab', url)
      return { action: 'deny' }
    }
    if (url) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow = win
  win.on('closed', () => {
    closePrintPreviewWindow()
    mainWindow = null
  })
  return win
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.basic-web-browser.app')
  }
  registerGuestDownloadPipeline()
  registerSearchResultLinkMenu()
  registerPrintShellIpc()
  registerPageToolsShortcutForwarding()
  registerApplicationMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
