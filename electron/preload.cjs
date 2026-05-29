const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('browserMeta', {
  platform: process.platform,
})

contextBridge.exposeInMainWorld('browserShell', {
  /**
   * Subscribe to URLs the shell should open in a new in-app tab (window.open / link context menu).
   * @param {(url: string) => void} handler
   * @returns {() => void} unsubscribe
   */
  onOpenUrlInNewTab(handler) {
    const channel = 'shell-open-url-new-tab'
    const listener = (_event, url) => {
      if (typeof url === 'string') handler(url)
    }
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /**
   * Show the app menu for a search-result link (native menu often fails when webviews overlap the shell).
   * @param {{ url: string }} payload
   */
  showSearchResultLinkMenu(payload) {
    ipcRenderer.send('show-search-result-link-menu', payload)
  },

  /**
   * @param {(data: { action: 'open' | 'openNewTab', url: string }) => void} handler
   * @returns {() => void} unsubscribe
   */
  onSearchResultLinkMenuAction(handler) {
    const channel = 'search-result-link-menu-action'
    const listener = (_event, data) => handler(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /**
   * @param {(data: {
   *   id: string,
   *   filename: string,
   *   url: string,
   *   savePath: string,
   *   state: 'progressing' | 'completed' | 'cancelled' | 'interrupted',
   *   receivedBytes: number,
   *   totalBytes: number,
   * }) => void} handler
   * @returns {() => void} unsubscribe
   */
  onDownloadUpdate(handler) {
    const channel = 'shell-download-update'
    const listener = (_event, data) => handler(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /** @param {{ id: string }} payload */
  cancelDownload(payload) {
    ipcRenderer.send('download-cancel', payload)
  },

  /** @param {{ path: string }} payload */
  showDownloadInFolder(payload) {
    ipcRenderer.send('download-show-in-folder', payload)
  },

  /** @returns {Promise<Array<Record<string, unknown>>>} */
  getDownloadHistory() {
    return ipcRenderer.invoke('get-download-history')
  },

  /** @param {string} id */
  removeDownloadFromHistory(id) {
    return ipcRenderer.invoke('download-history-remove', id)
  },

  /** @returns {Promise<unknown[]>} */
  clearCompletedDownloadHistory() {
    return ipcRenderer.invoke('download-history-clear-completed')
  },

  /** @param {{ path: string }} payload */
  openDownload(payload) {
    ipcRenderer.send('download-open-file', payload)
  },

  /**
   * Delete a completed download file and remove it from persisted history.
   * @param {{ id: string, path: string }} payload
   */
  discardDownload(payload) {
    return ipcRenderer.invoke('download-discard-file', payload)
  },

  /** @returns {Promise<{ askSaveLocation: boolean }>} */
  getDownloadSettings() {
    return ipcRenderer.invoke('get-download-settings')
  },

  /** @param {{ askSaveLocation: boolean }} payload */
  setDownloadSettings(payload) {
    return ipcRenderer.invoke('set-download-settings', payload)
  },

  /**
   * Keyboard shortcuts forwarded from the main process (needed when a webview has focus).
   * @param {(data: { action: 'find' | 'print' | 'zoom-in' | 'zoom-out' | 'zoom-reset' }) => void} handler
   * @returns {() => void} unsubscribe
   */
  onPageToolsShortcut(handler) {
    const channel = 'page-tools-shortcut'
    const listener = (_event, data) => handler(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  /** @param {string} html */
  printShellHtml(html) {
    return ipcRenderer.invoke('print-shell-html', html)
  },

  /**
   * Open a modal print-preview window above the main browser window.
   * @param {{ guestWebContentsId?: number, shellHtml?: string, pdfData?: Uint8Array | ArrayBuffer }} payload
   */
  openPrintPreview(payload) {
    return ipcRenderer.invoke('open-print-preview', payload)
  },
})
