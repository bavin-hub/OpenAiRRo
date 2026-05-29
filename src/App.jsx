import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import BrowserPageTools from './components/BrowserPageTools.jsx'
import DownloadBar from './components/DownloadBar.jsx'
import Omnibox from './components/Omnibox.jsx'
import LeftNavBar from './pages/LeftNavBar.jsx'
import RightNavBar from './pages/RightNavBar.jsx'
import MainPage from './pages/MainPage.jsx'
import SearchResultsPage from './pages/SearchResultsPage.jsx'
import { abortAiForTab } from './aiStreamAbort.js'
import { applyShellAppearance, loadColorMode, loadThemeStrength } from './shellAppearance.js'
import { HOME_LABEL, fetchSearchResults, normalizeHttpUrl, parseNavigationInput } from './searchNavigation.js'
import { PRINT_PREVIEW_VISIBLE } from './featureFlags.js'
import './App.css'

/** @typedef {'home' | 'search' | 'browse'} NavigationPhase */

/** @param {KeyboardEvent} e */
function pageToolsActionFromKeyboardEvent(e) {
  if (!(e.ctrlKey || e.metaKey)) return null

  const code = e.code
  const key = e.key
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

const NAV_HISTORY_KEY = 'browser-nav-history'
const BOOKMARKS_KEY = 'browser-bookmarks'
const BOOKMARKS_MAX = 300

/**
 * Stable key for deduping bookmarks (origin + path + search; hash ignored).
 * @param {string} url
 */
function bookmarkKey(url) {
  const n = normalizeHttpUrl(url)
  try {
    const u = new URL(n)
    u.hash = ''
    let path = u.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`
  } catch {
    return n.toLowerCase()
  }
}

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && typeof x.url === 'string')
      .map((x) => ({
        title: String(x.title || x.url),
        url: String(x.url),
        at: typeof x.at === 'number' ? x.at : Date.now(),
      }))
      .slice(0, BOOKMARKS_MAX)
  } catch {
    return []
  }
}

function loadNavHistory() {
  try {
    const raw = localStorage.getItem(NAV_HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x) => x && typeof x.url === 'string')
      .map((x) => ({
        title: String(x.title || x.url),
        url: String(x.url),
        at: typeof x.at === 'number' ? x.at : Date.now(),
      }))
      .slice(0, 50)
  } catch {
    return []
  }
}

function newTabId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * @param {Record<string, unknown>} [overrides]
 */
function createTab(overrides = {}) {
  return {
    id: newTabId(),
    navigationPhase: /** @type {NavigationPhase} */ ('home'),
    address: '',
    displayUrl: HOME_LABEL,
    canGoBack: false,
    canGoForward: false,
    webviewLoading: false,
    searchLoading: false,
    error: null,
    searchPayload: /** @type {{ query: string, results: Array<{ title: string, url: string, snippet: string }> } | null} */ (
      null
    ),
    lastSearchQuery: '',
    browseRoot: /** @type {'search' | null} */ (null),
    browseFromShell: false,
    /** Right AI panel: open/closed */
    aiPanelExpanded: false,
    /** @type {Array<{ id: string, role: 'user' | 'assistant', content: string }>} */
    aiMessages: [],
    aiInput: '',
    aiError: /** @type {string | null} */ (null),
    aiStreaming: false,
    /** When set, this tab’s AI messages were loaded from a saved server chat. */
    aiRemoteChatId: /** @type {string | null} */ (null),
    ...overrides,
  }
}

/** @typedef {ReturnType<typeof createTab>} Tab */

export default function App() {
  useLayoutEffect(() => {
    applyShellAppearance({ strength: loadThemeStrength(), colorMode: loadColorMode() })
  }, [])

  /** @type {React.MutableRefObject<Record<string, HTMLElement | null>>} */
  const webviewRefs = useRef({})
  /** @type {React.MutableRefObject<{ handleShortcut: (action: string) => void } | null>} */
  const pageToolsRef = useRef(null)
  const [pageToolsOverlayEl, setPageToolsOverlayEl] = useState(/** @type {HTMLDivElement | null} */ (null))
  /** @type {React.RefObject<{ getValue: () => string, focus: () => void } | null>} */
  const omniboxRef = useRef(null)
  const tabsRef = useRef(/** @type {Tab[]} */ ([]))

  const [{ tabs, activeTabId }, setBrowser] = useState(() => {
    const t = createTab()
    return { tabs: [t], activeTabId: t.id }
  })

  tabsRef.current = tabs

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const webviewListenerKey = tabs
    .map((t) => `${t.id}:${t.navigationPhase === 'browse' ? 'b' : 's'}`)
    .join('|')

  const omniboxSeed = useMemo(() => {
    let next = activeTab.address
    if (!next && activeTab.navigationPhase === 'browse') {
      const disp = String(activeTab.displayUrl || '')
      if (/^https?:\/\//i.test(disp)) next = disp
    }
    return next || ''
  }, [activeTab.address, activeTab.displayUrl, activeTab.navigationPhase])

  const setTabs = useCallback((updater) => {
    setBrowser((b) => ({ ...b, tabs: typeof updater === 'function' ? updater(b.tabs) : updater }))
  }, [])

  const setActiveTabId = useCallback((id) => {
    setBrowser((b) => ({ ...b, activeTabId: id }))
  }, [])

  const updateTab = useCallback((tabId, partial) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ...partial } : t)))
  }, [setTabs])

  /** @type {(tabId: string, merger: (tab: Tab) => Partial<Tab>) => void} */
  const mergeTab = useCallback((tabId, merger) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t
        return { ...t, ...merger(t) }
      }),
    )
  }, [setTabs])

  const [navHistory, setNavHistory] = useState(
    /** @type {Array<{ title: string, url: string, at: number }>} */ (loadNavHistory),
  )

  const [bookmarks, setBookmarks] = useState(
    /** @type {Array<{ title: string, url: string, at: number }>} */ (loadBookmarks),
  )

  /** @type {Array<{ id: string, filename: string, url: string, savePath: string, state: string, receivedBytes: number, totalBytes: number, at: number }>} */
  const [downloads, setDownloads] = useState(() => [])
  /** Download shelf entries dismissed via Keep / Dismiss (Chrome-style bottom bar). */
  const [downloadShelfDismissedIds, setDownloadShelfDismissedIds] = useState(
    () => new Set()
  )
  /** Only downloads observed live this session appear on the bottom shelf (not sidebar history). */
  const [downloadShelfSessionIds, setDownloadShelfSessionIds] = useState(() => new Set())
  const [downloadAskSaveLocation, setDownloadAskSaveLocation] = useState(false)

  /**
   * Guest surface must be shown in layout before loadURL (see webview--hidden CSS).
   * clearGuestStack: drop prior entries (e.g. about:blank) so Back from the first loaded
   * page returns to the React shell instead of an empty guest page.
   */
  const scheduleWebviewLoadUrl = useCallback((tabId, url, options = {}) => {
    const { clearGuestStack = false } = options
    let tries = 0
    const maxTries = 60
    const run = () => {
      tries += 1
      if (tries > maxTries) return
      try {
        const wv = webviewRefs.current[tabId]
        if (!wv) {
          window.requestAnimationFrame(run)
          return
        }
        if (clearGuestStack) {
          try {
            wv.clearHistory()
          } catch {
            /* clearHistory not supported */
          }
        }
        wv.loadURL(url)
      } catch {
        window.requestAnimationFrame(run)
      }
    }
    window.requestAnimationFrame(run)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(NAV_HISTORY_KEY, JSON.stringify(navHistory.slice(0, 50)))
    } catch {
      /* ignore */
    }
  }, [navHistory])

  useEffect(() => {
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks.slice(0, BOOKMARKS_MAX)))
    } catch {
      /* ignore */
    }
  }, [bookmarks])

  const pushHistory = useCallback((title, url) => {
    if (!url || url === 'about:blank') return
    setNavHistory((prev) => {
      if (prev[0]?.url === url) return prev
      const entry = { title: title || url, url, at: Date.now() }
      return [entry, ...prev].slice(0, 50)
    })
  }, [])

  const removeHistoryEntry = useCallback((entry) => {
    setNavHistory((prev) => prev.filter((e) => !(e.at === entry.at && e.url === entry.url)))
  }, [])

  const clearAllHistory = useCallback(() => {
    setNavHistory([])
  }, [])

  const removeBookmarkEntry = useCallback((entry) => {
    setBookmarks((prev) => prev.filter((e) => !(e.at === entry.at && e.url === entry.url)))
  }, [])

  const clearAllBookmarks = useCallback(() => {
    setBookmarks([])
  }, [])

  const toggleBookmarkForActiveTab = useCallback(() => {
    const id = activeTabId
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab || tab.navigationPhase !== 'browse') return
    const rawUrl = String(tab.displayUrl || tab.address || '').trim()
    const url = normalizeHttpUrl(rawUrl) || normalizeHttpUrl(tab.address)
    if (!url || !/^https?:\/\//i.test(url)) return
    const key = bookmarkKey(url)

    setBookmarks((prev) => {
      const idx = prev.findIndex((b) => bookmarkKey(b.url) === key)
      if (idx >= 0) return prev.filter((_, i) => i !== idx)
      let title = url
      try {
        const wv = webviewRefs.current[id]
        if (wv) title = wv.getTitle() || url
      } catch {
        /* ignore */
      }
      return [{ title: title || url, url, at: Date.now() }, ...prev].slice(0, BOOKMARKS_MAX)
    })
  }, [activeTabId])

  const syncNavigationState = useCallback((tabId) => {
    const tab = tabsRef.current.find((t) => t.id === tabId)
    if (!tab || tab.navigationPhase !== 'browse') return
    const wv = webviewRefs.current[tabId]
    if (!wv) return
    try {
      const canBack = wv.canGoBack()
      const canFwd = wv.canGoForward()
      let url = ''
      try {
        url = wv.getURL() || ''
      } catch {
        /* ignore */
      }
      updateTab(tabId, {
        canGoBack: canBack,
        canGoForward: canFwd,
        ...(url ? { displayUrl: url } : {}),
      })
    } catch {
      /* webview not ready */
    }
  }, [updateTab])

  useLayoutEffect(() => {
    const cleanups = []

    for (const tab of tabs) {
      const wv = webviewRefs.current[tab.id]
      if (!wv) continue

      const tabId = tab.id
      const onStart = () => {
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.navigationPhase !== 'browse') return
        updateTab(tabId, { webviewLoading: true, error: null })
      }
      const onStop = () => {
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.navigationPhase !== 'browse') return
        updateTab(tabId, { webviewLoading: false })
        syncNavigationState(tabId)
      }
      const onNavigate = () => {
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.navigationPhase !== 'browse') return
        syncNavigationState(tabId)
        try {
          const u = wv.getURL()
          if (u) updateTab(tabId, { displayUrl: u })
          if (u && u !== 'about:blank') {
            let title = u
            try {
              title = wv.getTitle() || u
            } catch {
              /* ignore */
            }
            pushHistory(title, u)
          }
        } catch {
          /* ignore */
        }
      }
      const onFail = (e) => {
        const t = tabsRef.current.find((x) => x.id === tabId)
        if (!t || t.navigationPhase !== 'browse') return
        updateTab(tabId, {
          webviewLoading: false,
          error: e.errorDescription || 'Failed to load page',
        })
      }

      wv.addEventListener('did-start-loading', onStart)
      wv.addEventListener('did-stop-loading', onStop)
      wv.addEventListener('did-navigate', onNavigate)
      wv.addEventListener('did-navigate-in-page', onNavigate)
      wv.addEventListener('did-fail-load', onFail)

      cleanups.push(() => {
        wv.removeEventListener('did-start-loading', onStart)
        wv.removeEventListener('did-stop-loading', onStop)
        wv.removeEventListener('did-navigate', onNavigate)
        wv.removeEventListener('did-navigate-in-page', onNavigate)
        wv.removeEventListener('did-fail-load', onFail)
      })
    }

    return () => {
      for (const c of cleanups) c()
    }
  }, [webviewListenerKey, syncNavigationState, pushHistory, updateTab])

  const runSearch = useCallback(
    async (tabId, query) => {
      updateTab(tabId, { searchLoading: true, error: null, lastSearchQuery: query })
      try {
        const data = await fetchSearchResults(query)
        const q = data.query || query
        updateTab(tabId, {
          searchPayload: { query: q, results: data.results || [] },
          navigationPhase: 'search',
          displayUrl: `Search: ${q}`,
          searchLoading: false,
        })
        pushHistory(`Search: ${q}`, `search:${encodeURIComponent(q)}`)
      } catch (e) {
        updateTab(tabId, {
          error: e instanceof Error ? e.message : 'Search failed',
          navigationPhase: 'home',
          searchPayload: null,
          searchLoading: false,
        })
      }
    },
    [pushHistory, updateTab],
  )

  const go = useCallback(
    async (override) => {
      const id = activeTabId
      const tab = tabsRef.current.find((t) => t.id === id)
      if (!tab) return

      const raw =
        override !== undefined && override !== null ? String(override) : tab.address
      const parsed = parseNavigationInput(raw)
      if (!parsed) return

      if (parsed.type === 'search') {
        updateTab(id, { address: parsed.query })
        await runSearch(id, parsed.query)
        return
      }

      const fromShell = tab.navigationPhase === 'home' || tab.navigationPhase === 'search'
      updateTab(id, {
        browseRoot: null,
        browseFromShell: fromShell,
        address: parsed.url,
        navigationPhase: 'browse',
        searchPayload: null,
        error: null,
      })
      scheduleWebviewLoadUrl(id, parsed.url, { clearGuestStack: fromShell })
    },
    [activeTabId, runSearch, scheduleWebviewLoadUrl, updateTab],
  )

  const goHome = useCallback(() => {
    const id = activeTabId
    updateTab(id, {
      browseRoot: null,
      browseFromShell: false,
      navigationPhase: 'home',
      address: '',
      searchPayload: null,
      displayUrl: HOME_LABEL,
      error: null,
    })
    window.setTimeout(() => {
      try {
        const wv = webviewRefs.current[id]
        wv?.stop()
        wv?.loadURL('about:blank')
      } catch {
        /* webview not ready */
      }
    }, 0)
  }, [activeTabId, updateTab])

  const toolbarBack = useCallback(() => {
    const id = activeTabId
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab) return

    if (tab.navigationPhase === 'search') {
      goHome()
      return
    }
    if (tab.navigationPhase !== 'browse') return

    const wv = webviewRefs.current[id]
    if (!wv) return

    const peelBlankThen = (onBlank) => {
      try {
        wv.goBack()
      } catch {
        goHome()
        return
      }
      window.setTimeout(() => {
        try {
          const inner = webviewRefs.current[id]
          if (!inner) return
          let u = ''
          try {
            u = inner.getURL() || ''
          } catch {
            return
          }
          if (!u || u === 'about:blank' || /^about:/i.test(u)) {
            onBlank()
          }
        } catch {
          /* ignore */
        }
      }, 180)
    }

    try {
      const canBack = wv.canGoBack()
      const currentPayload = tabsRef.current.find((t) => t.id === id)?.searchPayload

      if (tab.browseRoot === 'search' && currentPayload && !canBack) {
        updateTab(id, { browseRoot: null, navigationPhase: 'search', displayUrl: `Search: ${currentPayload.query}` })
        return
      }

      if (tab.browseRoot === 'search' && canBack) {
        peelBlankThen(() => {
          const p = tabsRef.current.find((t) => t.id === id)?.searchPayload
          updateTab(id, { browseRoot: null })
          if (p) {
            updateTab(id, { navigationPhase: 'search', displayUrl: `Search: ${p.query}` })
          } else {
            goHome()
          }
        })
        return
      }

      if (tab.browseFromShell && canBack) {
        peelBlankThen(() => {
          updateTab(id, { browseFromShell: false })
          goHome()
        })
        return
      }

      if (canBack) {
        wv.goBack()
        return
      }

      updateTab(id, { browseRoot: null, browseFromShell: false })
      goHome()
    } catch {
      goHome()
    }
  }, [activeTabId, goHome, updateTab])

  const goForward = useCallback(() => {
    const id = activeTabId
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab || tab.navigationPhase !== 'browse') return
    try {
      webviewRefs.current[id]?.goForward()
    } catch {
      /* ignore */
    }
  }, [activeTabId])

  const reload = useCallback(() => {
    const id = activeTabId
    const tab = tabsRef.current.find((t) => t.id === id)
    if (!tab) return
    if (tab.navigationPhase === 'browse') {
      updateTab(id, { error: null })
      try {
        webviewRefs.current[id]?.reload()
      } catch {
        /* ignore */
      }
      return
    }
    if (tab.navigationPhase === 'search' && tab.lastSearchQuery) {
      void runSearch(id, tab.lastSearchQuery)
    }
  }, [activeTabId, runSearch, updateTab])

  const stop = useCallback(() => {
    const id = activeTabId
    try {
      webviewRefs.current[id]?.stop()
    } catch {
      /* ignore */
    }
  }, [activeTabId])

  const openResultUrl = useCallback(
    (url) => {
      const id = activeTabId
      const target = normalizeHttpUrl(url) || url
      updateTab(id, {
        browseFromShell: false,
        browseRoot: 'search',
        address: target,
        navigationPhase: 'browse',
        error: null,
      })
      scheduleWebviewLoadUrl(id, target, { clearGuestStack: true })
    },
    [activeTabId, scheduleWebviewLoadUrl, updateTab],
  )

  const openUrlInNewTab = useCallback(
    (rawUrl) => {
      const url = normalizeHttpUrl(rawUrl)
      if (!url) return
      const t = createTab({
        navigationPhase: 'browse',
        address: url,
        displayUrl: url,
        browseRoot: null,
        browseFromShell: false,
        searchPayload: null,
        error: null,
      })
      setBrowser((b) => ({ tabs: [...b.tabs, t], activeTabId: t.id }))
      scheduleWebviewLoadUrl(t.id, url, { clearGuestStack: true })
    },
    [scheduleWebviewLoadUrl],
  )

  useEffect(() => {
    const api = window.browserShell
    if (!api?.onOpenUrlInNewTab) return undefined
    return api.onOpenUrlInNewTab((url) => {
      openUrlInNewTab(url)
    })
  }, [openUrlInNewTab])

  useEffect(() => {
    const api = window.browserShell
    if (!api?.onSearchResultLinkMenuAction) return undefined
    return api.onSearchResultLinkMenuAction(({ action, url }) => {
      const u = normalizeHttpUrl(url) || url
      if (!u) return
      if (action === 'open') openResultUrl(u)
      else if (action === 'openNewTab') openUrlInNewTab(u)
    })
  }, [openResultUrl, openUrlInNewTab])

  useEffect(() => {
    const api = window.browserShell
    if (!api?.getDownloadSettings) return undefined
    let cancelled = false
    void api
      .getDownloadSettings()
      .then((settings) => {
        if (cancelled || !settings) return
        setDownloadAskSaveLocation(Boolean(settings.askSaveLocation))
      })
      .catch(() => {
        /* non-Electron */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const api = window.browserShell
    if (!api?.onDownloadUpdate) return undefined

    let cancelled = false
    if (api.getDownloadHistory) {
      void api
        .getDownloadHistory()
        .then((rows) => {
          if (cancelled || !Array.isArray(rows)) return
          setDownloads((prev) => {
            const byId = new Map(prev.map((d) => [d.id, d]))
            for (const raw of rows) {
              if (!raw || typeof raw.id !== 'string') continue
              const row = {
                id: raw.id,
                filename: String(raw.filename || 'download'),
                url: String(raw.url || ''),
                savePath: String(raw.savePath || ''),
                state: String(raw.state || 'completed'),
                receivedBytes: Number(raw.receivedBytes) || 0,
                totalBytes: Number(raw.totalBytes) || 0,
                at: typeof raw.at === 'number' && Number.isFinite(raw.at) ? raw.at : Date.now(),
              }
              if (!byId.has(row.id)) byId.set(row.id, row)
            }
            return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, 100)
          })
        })
        .catch(() => {
          /* invoke unavailable (e.g. non-Electron) */
        })
    }

    const unsub = api.onDownloadUpdate((data) => {
      if (!data || typeof data.id !== 'string') return
      const at =
        typeof data.at === 'number' && Number.isFinite(data.at)
          ? data.at
          : typeof data.startedAt === 'number' && Number.isFinite(data.startedAt)
            ? data.startedAt
            : Date.now()
      const row = {
        id: data.id,
        filename: String(data.filename || 'download'),
        url: String(data.url || ''),
        savePath: String(data.savePath || ''),
        state: String(data.state || 'progressing'),
        receivedBytes: Number(data.receivedBytes) || 0,
        totalBytes: Number(data.totalBytes) || 0,
        at,
      }
      setDownloads((prev) => {
        const idx = prev.findIndex((d) => d.id === data.id)
        if (idx === -1) return [row, ...prev].sort((a, b) => b.at - a.at).slice(0, 100)
        const next = [...prev]
        next[idx] = { ...next[idx], ...row, at: next[idx].at }
        return next.sort((a, b) => b.at - a.at)
      })
      setDownloadShelfSessionIds((prev) => {
        if (prev.has(data.id)) return prev
        const next = new Set(prev)
        next.add(data.id)
        return next
      })
      if (String(data.state) === 'progressing') {
        setDownloadShelfDismissedIds((prev) => {
          if (!prev.has(data.id)) return prev
          const next = new Set(prev)
          next.delete(data.id)
          return next
        })
      }
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  const removeDownloadEntry = useCallback((entry) => {
    void window.browserShell?.removeDownloadFromHistory?.(entry.id)
    setDownloads((prev) => prev.filter((d) => d.id !== entry.id))
  }, [])

  const cancelDownloadEntry = useCallback((entry) => {
    window.browserShell?.cancelDownload?.({ id: entry.id })
  }, [])

  const showDownloadInFolder = useCallback((entry) => {
    if (!entry.savePath) return
    window.browserShell?.showDownloadInFolder?.({ path: entry.savePath })
  }, [])

  const openDownloadEntry = useCallback((entry) => {
    if (!entry.savePath) return
    window.browserShell?.openDownload?.({ path: entry.savePath })
  }, [])

  const keepDownloadShelfEntry = useCallback((entry) => {
    setDownloadShelfDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(entry.id)
      return next
    })
  }, [])

  const discardDownloadEntry = useCallback((entry) => {
    void window.browserShell?.discardDownload?.({ id: entry.id, path: entry.savePath })
    setDownloads((prev) => prev.filter((d) => d.id !== entry.id))
    setDownloadShelfDismissedIds((prev) => {
      const next = new Set(prev)
      next.add(entry.id)
      return next
    })
  }, [])

  const setAskSaveLocation = useCallback((askSaveLocation) => {
    setDownloadAskSaveLocation(askSaveLocation)
    void window.browserShell?.setDownloadSettings?.({ askSaveLocation })
  }, [])

  const downloadShelfEntries = useMemo(
    () =>
      downloads.filter(
        (entry) =>
          downloadShelfSessionIds.has(entry.id) &&
          !downloadShelfDismissedIds.has(entry.id) &&
          (entry.state === 'progressing' ||
            entry.state === 'completed' ||
            entry.state === 'cancelled' ||
            entry.state === 'interrupted'),
      ),
    [downloads, downloadShelfDismissedIds, downloadShelfSessionIds],
  )

  const clearCompletedDownloads = useCallback(() => {
    void window.browserShell?.clearCompletedDownloadHistory?.()
    setDownloads((prev) => prev.filter((d) => d.state === 'progressing'))
  }, [])

  const openHistoryEntry = useCallback(
    (entry) => {
      const id = activeTabId
      const { url } = entry
      if (url.startsWith('search:')) {
        const q = decodeURIComponent(url.slice('search:'.length))
        void runSearch(id, q)
        return
      }
      const tab = tabsRef.current.find((t) => t.id === id)
      if (!tab) return
      const fromShell = tab.navigationPhase === 'home' || tab.navigationPhase === 'search'
      updateTab(id, {
        browseRoot: null,
        browseFromShell: fromShell,
        address: url,
        navigationPhase: 'browse',
        searchPayload: null,
        error: null,
      })
      scheduleWebviewLoadUrl(id, url, { clearGuestStack: fromShell })
    },
    [activeTabId, runSearch, scheduleWebviewLoadUrl, updateTab],
  )

  const addTab = useCallback(() => {
    const t = createTab()
    setBrowser((b) => ({ tabs: [...b.tabs, t], activeTabId: t.id }))
  }, [])

  const closeTab = useCallback((tabId, e) => {
    e?.stopPropagation?.()
    abortAiForTab(tabId)
    setBrowser((b) => {
      const prev = b.tabs
      if (prev.length <= 1) {
        const only = prev[0]
        if (!only) return b
        const resetId = only.id
        window.setTimeout(() => {
          try {
            const wv = webviewRefs.current[resetId]
            wv?.stop()
            wv?.loadURL('about:blank')
          } catch {
            /* ignore */
          }
        }, 0)
        return {
          tabs: [{ ...createTab(), id: resetId }],
          activeTabId: resetId,
        }
      }
      const idx = prev.findIndex((t) => t.id === tabId)
      if (idx === -1) return b
      const next = prev.filter((t) => t.id !== tabId)
      let nextActive = b.activeTabId
      if (b.activeTabId === tabId) {
        const pick = idx === 0 ? 0 : idx - 1
        nextActive = next[pick]?.id ?? next[0]?.id
      }
      return { tabs: next, activeTabId: nextActive }
    })
  }, [])

  const handleOmniboxSubmit = useCallback(
    (value) => {
      updateTab(activeTabId, { address: value })
      void go(value)
    },
    [activeTabId, go, updateTab],
  )

  const handleOmniboxDraftCommit = useCallback(
    (value) => {
      updateTab(activeTabId, { address: value })
    },
    [activeTabId, updateTab],
  )

  const handleOmniboxFocusChange = useCallback(
    (focused) => {
      const content = document.querySelector('.content')
      if (focused) {
        content?.classList.add('content--chrome-input-focused')
        try {
          webviewRefs.current[activeTabId]?.blur?.()
        } catch {
          /* webview not ready */
        }
        return
      }
      content?.classList.remove('content--chrome-input-focused')
    },
    [activeTabId],
  )

  const navigationPhase = activeTab.navigationPhase
  /** When true, React overlays home/search; webviews must not steal clicks (Electron native layer). */
  const shellOverlayVisible = navigationPhase === 'home' || navigationPhase === 'search'
  const prevShellOverlayRef = useRef(/** @type {boolean | null} */ (null))

  /** Unmount guest webviews while home/search is showing so hit-testing reaches the shell (links, context menu). */
  useLayoutEffect(() => {
    const prev = prevShellOverlayRef.current
    if (shellOverlayVisible) {
      prevShellOverlayRef.current = true
      return
    }
    prevShellOverlayRef.current = false
    if (prev !== true) return

    const id = window.requestAnimationFrame(() => {
      for (const tab of tabsRef.current) {
        if (tab.navigationPhase !== 'browse') continue
        const wv = webviewRefs.current[tab.id]
        if (!wv) continue
        const addr = normalizeHttpUrl(tab.address) || ''
        const dispRaw = tab.displayUrl && /^https?:\/\//i.test(String(tab.displayUrl)) ? String(tab.displayUrl) : ''
        const u = addr || dispRaw
        if (u) scheduleWebviewLoadUrl(tab.id, u, { clearGuestStack: false })
      }
    })
    return () => window.cancelAnimationFrame(id)
  }, [shellOverlayVisible, scheduleWebviewLoadUrl])

  const toolbarLoading = activeTab.searchLoading || (navigationPhase === 'browse' && activeTab.webviewLoading)
  const backDisabled = navigationPhase === 'home' || activeTab.searchLoading
  const forwardDisabled = navigationPhase !== 'browse' || !activeTab.canGoForward || activeTab.searchLoading
  const reloadDisabled =
    navigationPhase === 'home' ||
    activeTab.searchLoading ||
    (navigationPhase === 'browse' && activeTab.webviewLoading)

  const tabLabel = (tab) => {
    if (tab.navigationPhase === 'home') return 'Home'
    if (tab.navigationPhase === 'search') return tab.searchPayload ? `Search: ${tab.searchPayload.query}` : 'Search'
    try {
      const u = tab.displayUrl
      if (!u || u === HOME_LABEL) return 'New tab'
      return u.replace(/^https?:\/\//i, '').split('/')[0] || u
    } catch {
      return 'Tab'
    }
  }

  const bookmarkBarUrl =
    navigationPhase === 'browse'
      ? normalizeHttpUrl(String(activeTab.displayUrl || '').trim()) ||
        normalizeHttpUrl(String(activeTab.address || '').trim())
      : ''
  const showBookmarkStar =
    navigationPhase === 'browse' &&
    Boolean(bookmarkBarUrl) &&
    /^https?:\/\//i.test(bookmarkBarUrl) &&
    !/^about:/i.test(bookmarkBarUrl)
  const activePageBookmarked =
    showBookmarkStar && bookmarks.some((b) => bookmarkKey(b.url) === bookmarkKey(bookmarkBarUrl))

  useEffect(() => {
    const api = window.browserShell
    if (!api?.onPageToolsShortcut) return undefined
    return api.onPageToolsShortcut(({ action }) => {
      if (typeof action === 'string') pageToolsRef.current?.handleShortcut?.(action)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable) &&
        !(e.ctrlKey || e.metaKey)
      ) {
        return
      }

      const action = pageToolsActionFromKeyboardEvent(e)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      pageToolsRef.current?.handleShortcut?.(action)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="app">
      <header className="chrome">
        <div className="tab-strip" role="tablist" aria-label="Tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={tab.id === activeTabId}
              className={`tab-chip ${tab.id === activeTabId ? 'tab-chip--active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveTabId(tab.id)
                }
              }}
            >
              <span className="tab-chip-label" title={tabLabel(tab)}>
                {tabLabel(tab)}
              </span>
              <button
                type="button"
                className="tab-close"
                title="Close tab"
                aria-label={`Close ${tabLabel(tab)}`}
                onClick={(e) => closeTab(tab.id, e)}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="tab-new" onClick={addTab} title="New tab" aria-label="New tab">
            +
          </button>
        </div>
        <div className="toolbar">
          <div className="nav-buttons">
            <button
              type="button"
              className="icon-btn"
              onClick={toolbarBack}
              disabled={backDisabled}
              title="Back"
              aria-label="Back"
            >
              ←
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={goForward}
              disabled={forwardDisabled}
              title="Forward"
              aria-label="Forward"
            >
              →
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={reload}
              disabled={reloadDisabled}
              title="Reload"
              aria-label="Reload"
            >
              ↻
            </button>
            {toolbarLoading ? (
              <button type="button" className="icon-btn" onClick={stop} title="Stop" aria-label="Stop">
                ✕
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="toolbar-home-btn"
            onClick={goHome}
            disabled={navigationPhase === 'home' || activeTab.searchLoading}
            title={`Home — ${HOME_LABEL}`}
            aria-label={`Home — ${HOME_LABEL}`}
          >
            Home
          </button>
          <div className="omnibox-wrap">
            <Omnibox
              ref={omniboxRef}
              tabId={activeTabId}
              seedValue={omniboxSeed}
              onSubmit={handleOmniboxSubmit}
              onDraftCommit={handleOmniboxDraftCommit}
              onFocusChange={handleOmniboxFocusChange}
            />
            {showBookmarkStar ? (
              <button
                type="button"
                className={`bookmark-star-btn${activePageBookmarked ? ' bookmark-star-btn--on' : ''}`}
                onClick={toggleBookmarkForActiveTab}
                title={activePageBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                aria-label={activePageBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
                aria-pressed={activePageBookmarked}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill={activePageBookmarked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className="go-btn"
              onClick={() => {
                const value = omniboxRef.current?.getValue?.() ?? omniboxSeed
                handleOmniboxSubmit(value)
              }}
            >
              Go
            </button>
          </div>
          <BrowserPageTools
            ref={pageToolsRef}
            activeTabId={activeTabId}
            navigationPhase={navigationPhase}
            getWebview={() => webviewRefs.current[activeTabId]}
            overlayRoot={pageToolsOverlayEl}
          />
        </div>
        <div className="status-row">
          {toolbarLoading ? <span className="status loading">Loading…</span> : null}
          {activeTab.error ? <span className="status error">{activeTab.error}</span> : null}
          {!toolbarLoading && !activeTab.error ? (
            <span className="status url" title={activeTab.displayUrl}>
              {activeTab.displayUrl}
            </span>
          ) : null}
        </div>
      </header>
      <div className="app-body">
        <LeftNavBar
          history={navHistory}
          onOpenHistoryEntry={openHistoryEntry}
          onRemoveHistoryEntry={removeHistoryEntry}
          onClearAllHistory={clearAllHistory}
          bookmarks={bookmarks}
          onOpenBookmark={openHistoryEntry}
          onRemoveBookmark={removeBookmarkEntry}
          onClearAllBookmarks={clearAllBookmarks}
          downloads={downloads}
          onRemoveDownload={removeDownloadEntry}
          onCancelDownload={cancelDownloadEntry}
          onShowDownloadInFolder={showDownloadInFolder}
          onOpenDownload={openDownloadEntry}
          onClearCompletedDownloads={clearCompletedDownloads}
          downloadAskSaveLocation={downloadAskSaveLocation}
          onDownloadAskSaveLocationChange={setAskSaveLocation}
          onGoHome={goHome}
        />
        <main className={`content${shellOverlayVisible ? ' content--shell-overlay' : ''}`}>
          {navigationPhase === 'home' ? (
            <div className="home-layer">
              <MainPage onSubmitSearch={(q) => void go(q)} />
            </div>
          ) : null}
          {navigationPhase === 'search' && activeTab.searchPayload ? (
            <div className="home-layer">
              <SearchResultsPage
                query={activeTab.searchPayload.query}
                results={activeTab.searchPayload.results}
                onOpenUrl={openResultUrl}
                onOpenUrlInNewTab={openUrlInNewTab}
                onBackHome={goHome}
                onSubmitSearch={(q) => void go(q)}
              />
            </div>
          ) : null}
          {!shellOverlayVisible
            ? tabs.map((tab) => {
                const overlay = tab.navigationPhase === 'home' || tab.navigationPhase === 'search'
                const hidden = tab.id !== activeTabId || overlay
                return (
                  <webview
                    key={tab.id}
                    ref={(el) => {
                      if (el) webviewRefs.current[tab.id] = el
                      else delete webviewRefs.current[tab.id]
                    }}
                    className={hidden ? 'webview webview--hidden' : 'webview'}
                    hidden={hidden}
                    partition="persist:browser-guest"
                    src="about:blank"
                    allowpopups="true"
                  />
                )
              })
            : null}
          <div ref={setPageToolsOverlayEl} className="page-tools-overlay-host" />
          <DownloadBar
            entries={downloadShelfEntries}
            onOpen={openDownloadEntry}
            onOpenFolder={showDownloadInFolder}
            onKeep={keepDownloadShelfEntry}
            onDiscard={discardDownloadEntry}
            onCancel={cancelDownloadEntry}
          />
        </main>
        <RightNavBar
          tabId={activeTab.id}
          panelExpanded={Boolean(activeTab.aiPanelExpanded)}
          messages={activeTab.aiMessages ?? []}
          input={activeTab.aiInput ?? ''}
          error={activeTab.aiError ?? null}
          streaming={Boolean(activeTab.aiStreaming)}
          remoteChatId={activeTab.aiRemoteChatId ?? null}
          mergeTab={mergeTab}
        />
      </div>
    </div>
  )
}
