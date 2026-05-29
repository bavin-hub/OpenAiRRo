import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PRINT_PREVIEW_VISIBLE } from '../featureFlags.js'
import './BrowserPageTools.css'

const ZOOM_STORAGE_KEY = 'browser-page-zoom-factor'
const ZOOM_MODE_KEY = 'browser-zoom-mode'

/** @typedef {'page' | 'font'} ZoomMode */
/** @typedef {'find' | 'print' | 'zoom-in' | 'zoom-out' | 'zoom-reset'} PageToolsShortcutAction */

const PAGE_ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const FONT_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

function loadZoomMode() {
  try {
    const raw = localStorage.getItem(ZOOM_MODE_KEY)
    return raw === 'font' ? 'font' : 'page'
  } catch {
    return /** @type {ZoomMode} */ ('page')
  }
}

function loadZoomFactor() {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY)
    const n = raw ? Number(raw) : 1
    return Number.isFinite(n) && n > 0 ? n : 1
  } catch {
    return 1
  }
}

function nearestStep(steps, value) {
  let best = steps[0]
  let bestDist = Math.abs(value - best)
  for (const step of steps) {
    const dist = Math.abs(value - step)
    if (dist < bestDist) {
      best = step
      bestDist = dist
    }
  }
  return best
}

function stepZoom(steps, current, direction) {
  const idx = steps.indexOf(current)
  if (idx === -1) {
    const nearest = nearestStep(steps, current)
    const nearestIdx = steps.indexOf(nearest)
    const nextIdx = Math.min(Math.max(nearestIdx + direction, 0), steps.length - 1)
    return steps[nextIdx]
  }
  const nextIdx = Math.min(Math.max(idx + direction, 0), steps.length - 1)
  return steps[nextIdx]
}

function formatZoomPercent(factor) {
  return `${Math.round(factor * 100)}%`
}

const FONT_ZOOM_SCRIPT = `
(function(scale) {
  var id = '__browser_shell_font_zoom__';
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent =
    'html { font-size: ' + (scale * 100) + '% !important; }' +
    'html { -webkit-text-size-adjust: ' + (scale * 100) + '% !important; text-size-adjust: ' + (scale * 100) + '% !important; }';
})(__SCALE__)
`

function getShellLayer() {
  return document.querySelector('.home-layer')
}

function applyShellPageZoom(factor) {
  document.documentElement.style.setProperty('--shell-page-zoom', String(factor))
}

function applyShellFontZoom(factor) {
  document.documentElement.style.setProperty('--shell-font-zoom', String(factor))
}

function findInShell(text, backwards = false) {
  if (!text.trim()) return false
  try {
    return window.find(text, false, backwards, true, false, true, false)
  } catch {
    return false
  }
}

function stopShellFind() {
  try {
    window.getSelection()?.removeAllRanges()
  } catch {
    /* ignore */
  }
}

/**
 * @typedef {{
 *   handleShortcut: (action: PageToolsShortcutAction) => void,
 * }} BrowserPageToolsHandle
 */

/**
 * @param {{
 *   activeTabId: string,
 *   navigationPhase: 'home' | 'search' | 'browse',
 *   getWebview: () => HTMLElement | null | undefined,
 *   overlayRoot: HTMLElement | null,
 * }} props
 * @param {React.Ref<BrowserPageToolsHandle>} ref
 */
function BrowserPageTools({ activeTabId, navigationPhase, getWebview, overlayRoot }, ref) {
  const inBrowse = navigationPhase === 'browse'

  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [findMatches, setFindMatches] = useState({ current: 0, total: 0 })
  const [shellFindStatus, setShellFindStatus] = useState('')
  const findInputRef = useRef(/** @type {HTMLInputElement | null} */ (null))
  const findOpenRef = useRef(false)
  findOpenRef.current = findOpen

  const [zoomMode, setZoomMode] = useState(/** @type {ZoomMode} */ (loadZoomMode))
  const [zoomFactor, setZoomFactor] = useState(loadZoomFactor)
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false)
  const zoomMenuRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [printError, setPrintError] = useState(/** @type {string | null} */ (null))
  const printErrorTimerRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null))

  const zoomSteps = zoomMode === 'font' ? FONT_ZOOM_STEPS : PAGE_ZOOM_STEPS

  const applyFontZoomToWebview = useCallback((wv, factor) => {
    if (!wv || typeof wv.executeJavaScript !== 'function') return
    const script = FONT_ZOOM_SCRIPT.replace('__SCALE__', String(factor))
    try {
      wv.executeJavaScript(script, false)
    } catch {
      /* guest not ready */
    }
  }, [])

  const applyPageZoomToWebview = useCallback((wv, factor) => {
    if (!wv) return
    try {
      if (typeof wv.setZoomFactor === 'function') {
        wv.setZoomFactor(factor)
      }
    } catch {
      /* guest not ready */
    }
  }, [])

  const applyZoom = useCallback(
    (factor, mode = zoomMode) => {
      if (inBrowse) {
        const wv = getWebview()
        if (mode === 'page') applyPageZoomToWebview(wv, factor)
        else applyFontZoomToWebview(wv, factor)
        return
      }
      if (mode === 'page') applyShellPageZoom(factor)
      else applyShellFontZoom(factor)
    },
    [applyFontZoomToWebview, applyPageZoomToWebview, getWebview, inBrowse, zoomMode],
  )

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomFactor))
    } catch {
      /* ignore */
    }
  }, [zoomFactor])

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_MODE_KEY, zoomMode)
    } catch {
      /* ignore */
    }
  }, [zoomMode])

  useEffect(() => {
    applyZoom(zoomFactor, zoomMode)
  }, [activeTabId, applyZoom, inBrowse, navigationPhase, zoomFactor, zoomMode])

  useEffect(() => {
    if (!inBrowse) return undefined
    const wv = getWebview()
    if (!wv) return undefined

    const onNavigate = () => {
      if (zoomMode === 'font') {
        window.setTimeout(() => applyFontZoomToWebview(getWebview(), zoomFactor), 50)
      }
    }

    wv.addEventListener('did-stop-loading', onNavigate)
    wv.addEventListener('did-navigate-in-page', onNavigate)
    return () => {
      wv.removeEventListener('did-stop-loading', onNavigate)
      wv.removeEventListener('did-navigate-in-page', onNavigate)
    }
  }, [activeTabId, applyFontZoomToWebview, getWebview, inBrowse, zoomFactor, zoomMode])

  const stopFind = useCallback(() => {
    if (inBrowse) {
      const wv = getWebview()
      if (wv && typeof wv.stopFindInPage === 'function') {
        try {
          wv.stopFindInPage('clearSelection')
        } catch {
          /* ignore */
        }
      }
      setFindMatches({ current: 0, total: 0 })
    } else {
      stopShellFind()
      setShellFindStatus('')
    }
  }, [getWebview, inBrowse])

  const closeFind = useCallback(() => {
    stopFind()
    setFindOpen(false)
    setFindText('')
  }, [stopFind])

  const runWebviewFind = useCallback(
    (text, findNext = false) => {
      const wv = getWebview()
      if (!wv || !text.trim() || typeof wv.findInPage !== 'function') return
      try {
        wv.findInPage(text, { forward: true, findNext, matchCase: false })
      } catch {
        /* ignore */
      }
    },
    [getWebview],
  )

  const runFind = useCallback(
    (text, findNext = false, backwards = false) => {
      if (!text.trim()) return
      if (inBrowse) {
        if (backwards) {
          const wv = getWebview()
          if (!wv || typeof wv.findInPage !== 'function') return
          try {
            wv.findInPage(text, { forward: false, findNext: true, matchCase: false })
          } catch {
            /* ignore */
          }
          return
        }
        runWebviewFind(text, findNext)
        return
      }
      const found = findInShell(text, backwards)
      setShellFindStatus(found ? 'Match found' : 'No matches')
    },
    [getWebview, inBrowse, runWebviewFind],
  )

  useEffect(() => {
    if (!findOpen || !inBrowse) return undefined
    const wv = getWebview()
    if (!wv) return undefined

    /** @param {Event & { activeMatchOrdinal?: number, matches?: number, finalUpdate?: boolean }} e */
    const onFound = (e) => {
      setFindMatches({
        current: e.activeMatchOrdinal ?? 0,
        total: e.matches ?? 0,
      })
    }

    wv.addEventListener('found-in-page', onFound)
    return () => {
      wv.removeEventListener('found-in-page', onFound)
    }
  }, [findOpen, inBrowse, activeTabId, getWebview])

  useEffect(() => {
    if (!findOpen) return undefined
    const t = window.setTimeout(() => findInputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [findOpen])

  useEffect(() => {
    if (!findOpen || !findText.trim()) {
      if (!findText.trim()) stopFind()
      return undefined
    }
    const t = window.setTimeout(() => runFind(findText, false), 120)
    return () => window.clearTimeout(t)
  }, [findOpen, findText, runFind, stopFind])

  const openFind = useCallback(() => {
    setFindOpen(true)
  }, [])

  const changeZoom = useCallback(
    (direction) => {
      setZoomFactor((prev) => stepZoom(zoomSteps, prev, direction))
    },
    [zoomSteps],
  )

  const resetZoom = useCallback(() => {
    setZoomFactor(1)
  }, [])

  const switchZoomMode = useCallback((mode) => {
    setZoomMode(mode)
    const steps = mode === 'font' ? FONT_ZOOM_STEPS : PAGE_ZOOM_STEPS
    setZoomFactor((prev) => nearestStep(steps, prev))
    setZoomMenuOpen(false)
  }, [])

  const showPrintError = useCallback((message) => {
    setPrintError(message)
    if (printErrorTimerRef.current) clearTimeout(printErrorTimerRef.current)
    printErrorTimerRef.current = window.setTimeout(() => {
      printErrorTimerRef.current = null
      setPrintError(null)
    }, 5000)
  }, [])

  const openPrintPreview = useCallback(async () => {
    setPrintError(null)
    const api = window.browserShell
    if (!api?.openPrintPreview) {
      showPrintError('Print preview is unavailable')
      return
    }

    try {
      if (inBrowse) {
        document.querySelector('.content')?.classList.remove('content--chrome-input-focused')
        const wv = getWebview()
        if (!wv) {
          showPrintError('Page not ready for print preview')
          return
        }

        /** @type {Uint8Array | null} */
        let pdfData = null
        if (typeof wv.printToPDF === 'function') {
          pdfData = await wv.printToPDF({ printBackground: true })
        }

        if (!pdfData || pdfData.byteLength === 0) {
          const guestWebContentsId =
            typeof wv.getWebContentsId === 'function' ? wv.getWebContentsId() : null
          if (guestWebContentsId) {
            await api.openPrintPreview({ guestWebContentsId })
            return
          }
          showPrintError('Could not generate print preview for this page')
          return
        }

        await api.openPrintPreview({ pdfData })
        return
      }

      const layer = getShellLayer()
      if (!layer) {
        showPrintError('Nothing to preview on this screen')
        return
      }
      await api.openPrintPreview({ shellHtml: layer.innerHTML })
    } catch (e) {
      showPrintError(e instanceof Error ? e.message : 'Failed to open print preview')
    }
  }, [getWebview, inBrowse, showPrintError])

  const handleShortcut = useCallback(
    (action) => {
      if (action === 'find') {
        if (findOpenRef.current) findInputRef.current?.focus()
        else openFind()
        return
      }
      if (action === 'print') {
        if (PRINT_PREVIEW_VISIBLE) void openPrintPreview()
        return
      }
      if (action === 'zoom-in') changeZoom(1)
      else if (action === 'zoom-out') changeZoom(-1)
      else if (action === 'zoom-reset') resetZoom()
    },
    [changeZoom, openFind, openPrintPreview, resetZoom],
  )

  useImperativeHandle(ref, () => ({ handleShortcut }), [handleShortcut])

  useEffect(() => {
    if (!zoomMenuOpen) return undefined
    const onPointerDown = (e) => {
      if (!zoomMenuRef.current?.contains(/** @type {Node} */ (e.target))) {
        setZoomMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [zoomMenuOpen])

  useEffect(
    () => () => {
      if (printErrorTimerRef.current) clearTimeout(printErrorTimerRef.current)
    },
    [],
  )

  const findSummary = inBrowse
    ? findMatches.total > 0
      ? `${findMatches.current} of ${findMatches.total}`
      : findText.trim()
        ? 'No matches'
        : ''
    : shellFindStatus

  const overlayHost = overlayRoot
  const findOverlay =
    overlayHost &&
    findOpen &&
    createPortal(
      <div className="find-bar" role="search">
        <label className="find-bar-label" htmlFor="find-in-page-input">
          Find
        </label>
        <input
          id="find-in-page-input"
          ref={findInputRef}
          className="find-bar-input"
          type="text"
          value={findText}
          onChange={(e) => setFindText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              runFind(findText, true)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              closeFind()
            }
          }}
          placeholder={inBrowse ? 'Find in page…' : 'Find on this screen…'}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="find-bar-status" aria-live="polite">
          {findSummary}
        </span>
        <button
          type="button"
          className="page-tools-icon-btn"
          onClick={() => runFind(findText, true)}
          disabled={!findText.trim()}
          aria-label="Find next"
          title="Find next"
        >
          ↓
        </button>
        <button
          type="button"
          className="page-tools-icon-btn"
          onClick={() => runFind(findText, true, true)}
          disabled={!findText.trim()}
          aria-label="Find previous"
          title="Find previous"
        >
          ↑
        </button>
        <button type="button" className="find-bar-close" onClick={closeFind} aria-label="Close find bar">
          ×
        </button>
      </div>,
      overlayHost,
    )

  return (
    <>
      <div className="page-tools">
        <button
          type="button"
          className="page-tools-btn"
          onClick={openFind}
          title="Find in page (Ctrl+F)"
          aria-label="Find in page"
        >
          Find
        </button>

        <div className="page-tools-zoom" ref={zoomMenuRef}>
          <button
            type="button"
            className="page-tools-btn page-tools-btn--zoom"
            onClick={() => setZoomMenuOpen((v) => !v)}
            title={`Zoom — ${formatZoomPercent(zoomFactor)} (${zoomMode === 'page' ? 'page' : 'font'})`}
            aria-label="Zoom controls"
            aria-expanded={zoomMenuOpen}
          >
            {formatZoomPercent(zoomFactor)}
          </button>
          {zoomMenuOpen ? (
            <div className="page-tools-zoom-menu" role="menu">
              <div className="page-tools-zoom-mode" role="group" aria-label="Zoom type">
                <button
                  type="button"
                  className={`page-tools-mode-btn${zoomMode === 'page' ? ' page-tools-mode-btn--active' : ''}`}
                  onClick={() => switchZoomMode('page')}
                >
                  Page
                </button>
                <button
                  type="button"
                  className={`page-tools-mode-btn${zoomMode === 'font' ? ' page-tools-mode-btn--active' : ''}`}
                  onClick={() => switchZoomMode('font')}
                >
                  Font
                </button>
              </div>
              <div className="page-tools-zoom-actions">
                <button type="button" className="page-tools-icon-btn" onClick={() => changeZoom(-1)} aria-label="Zoom out">
                  −
                </button>
                <span className="page-tools-zoom-label">{formatZoomPercent(zoomFactor)}</span>
                <button type="button" className="page-tools-icon-btn" onClick={() => changeZoom(1)} aria-label="Zoom in">
                  +
                </button>
                <button type="button" className="page-tools-reset-btn" onClick={resetZoom}>
                  Reset
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`page-tools-btn page-tools-btn--print${PRINT_PREVIEW_VISIBLE ? '' : ' page-tools-btn--hidden'}`}
          onClick={() => void openPrintPreview()}
          title="Print preview (Ctrl+P)"
          aria-label="Print preview"
          aria-hidden={!PRINT_PREVIEW_VISIBLE}
          tabIndex={PRINT_PREVIEW_VISIBLE ? 0 : -1}
          hidden={!PRINT_PREVIEW_VISIBLE}
        >
          Print
        </button>
        {PRINT_PREVIEW_VISIBLE && printError ? <span className="page-tools-error">{printError}</span> : null}
      </div>
      {findOverlay}
    </>
  )
}

export default forwardRef(BrowserPageTools)
