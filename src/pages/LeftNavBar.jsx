import { useCallback, useEffect, useId, useLayoutEffect, useState } from 'react'
import { AUTH_SESSION_KEY, clearAuthSession, loadAuthUser, readAuthToken } from '../authSession.js'
import {
  COLOR_MODE_KEY,
  THEME_STORAGE_KEY,
  applyShellAppearance,
  loadColorMode,
  loadThemeStrength,
} from '../shellAppearance.js'
import EnterUser from './EnterUser.jsx'
import AiRRoWordmark from '../AiRRoWordmark.jsx'

function loadSignedIn() {
  return readAuthToken().length > 0
}
const ACCOUNT_FIELD_ORDER = ['username', 'email', 'profilepic']
/** Omitted from the account details list (large or internal payloads). */
const ACCOUNT_FIELD_HIDDEN = new Set(['user_chats_info'])

/**
 * @param {Record<string, string>} u
 * @returns {string[]}
 */
function orderedAuthKeys(u) {
  const keys = new Set(Object.keys(u))
  const out = []
  for (const k of ACCOUNT_FIELD_ORDER) {
    if (keys.has(k) && !ACCOUNT_FIELD_HIDDEN.has(k)) out.push(k)
  }
  for (const k of [...keys].sort()) {
    if (!ACCOUNT_FIELD_ORDER.includes(k) && !ACCOUNT_FIELD_HIDDEN.has(k)) out.push(k)
  }
  return out
}

/**
 * @param {string} key
 */
function accountFieldLabel(key) {
  const labels = { username: 'Username', email: 'Email', profilepic: 'Profile picture' }
  return labels[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * @typedef {{ title: string, url: string, at: number }} HistoryEntry
 * @typedef {{ title: string, url: string, at: number }} BookmarkEntry
 * @typedef {{ id: string, filename: string, url: string, savePath: string, state: string, receivedBytes: number, totalBytes: number, at: number }} DownloadEntry
 * @param {{
 *   history: HistoryEntry[],
 *   onOpenHistoryEntry: (entry: HistoryEntry) => void,
 *   onRemoveHistoryEntry: (entry: HistoryEntry) => void,
 *   onClearAllHistory: () => void,
 *   bookmarks: BookmarkEntry[],
 *   onOpenBookmark: (entry: BookmarkEntry) => void,
 *   onRemoveBookmark: (entry: BookmarkEntry) => void,
 *   onClearAllBookmarks: () => void,
 *   downloads: DownloadEntry[],
 *   onRemoveDownload: (entry: DownloadEntry) => void,
 *   onCancelDownload: (entry: DownloadEntry) => void,
 *   onShowDownloadInFolder: (entry: DownloadEntry) => void,
 *   onOpenDownload: (entry: DownloadEntry) => void,
 *   onClearCompletedDownloads: () => void,
 *   downloadAskSaveLocation: boolean,
 *   onDownloadAskSaveLocationChange: (ask: boolean) => void,
 *   onGoHome?: () => void,
 * }} props
 */
export default function LeftNavBar({
  history,
  onOpenHistoryEntry,
  onRemoveHistoryEntry,
  onClearAllHistory,
  bookmarks,
  onOpenBookmark,
  onRemoveBookmark,
  onClearAllBookmarks,
  downloads,
  onRemoveDownload,
  onCancelDownload,
  onShowDownloadInFolder,
  onOpenDownload,
  onClearCompletedDownloads,
  downloadAskSaveLocation,
  onDownloadAskSaveLocationChange,
  onGoHome,
}) {
  const [expanded, setExpanded] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [signedIn, setSignedIn] = useState(loadSignedIn)
  const [authUser, setAuthUser] = useState(() => loadAuthUser())
  const [themeStrength, setThemeStrength] = useState(() => loadThemeStrength())
  const [colorMode, setColorMode] = useState(() => loadColorMode())
  const themeSliderId = useId()
  const colorModeSwitchId = useId()
  const historyPanelId = useId()
  const bookmarksPanelId = useId()
  const downloadsPanelId = useId()
  const downloadAskSaveSwitchId = useId()
  const [historyOpen, setHistoryOpen] = useState(true)
  const [bookmarksOpen, setBookmarksOpen] = useState(true)
  const [downloadsOpen, setDownloadsOpen] = useState(true)

  const completedDownloadCount = downloads.filter((d) => d.state !== 'progressing').length

  const refreshAuth = useCallback(() => {
    setSignedIn(loadSignedIn())
    setAuthUser(loadAuthUser())
  }, [])

  useEffect(() => {
    refreshAuth()
    const onStorage = (e) => {
      if (e.key === AUTH_SESSION_KEY) refreshAuth()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('shell-auth-changed', refreshAuth)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('shell-auth-changed', refreshAuth)
    }
  }, [refreshAuth])

  useLayoutEffect(() => {
    applyShellAppearance({ strength: themeStrength, colorMode })
  }, [themeStrength, colorMode])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, String(themeStrength))
    } catch {
      /* ignore */
    }
  }, [themeStrength])

  useEffect(() => {
    try {
      localStorage.setItem(COLOR_MODE_KEY, colorMode)
    } catch {
      /* ignore */
    }
  }, [colorMode])

  const isLight = colorMode === 'light'

  return (
    <aside
      className={`relative flex h-full min-h-0 shrink-0 flex-col border-r transition-[width] duration-200 ease-out ${
        expanded ? 'w-80' : 'w-12'
      } ${
        colorMode === 'light'
          ? 'border-slate-300/90 bg-slate-50/98 text-slate-900'
          : 'border-slate-700/90 bg-slate-950/95 text-slate-100'
      }`}
      aria-label="Side panel"
    >
      <div
        className={`flex shrink-0 flex-col border-b ${
          colorMode === 'light'
            ? 'border-slate-300/80 bg-slate-200/90'
            : 'border-slate-700/80 bg-slate-900/90'
        }`}
      >
        {expanded ? (
          <div className="flex shrink-0 items-center gap-1.5 px-2 py-1.5">
            <div className="flex min-h-10 min-w-0 flex-1 items-center overflow-hidden px-0.5">
              <AiRRoWordmark />
            </div>
            <button
              type="button"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg ${
                isLight ? 'text-slate-700 hover:bg-slate-300/60' : 'text-slate-400 hover:bg-slate-800/85'
              }`}
              onClick={() => setExpanded((v) => !v)}
              title="Collapse panel"
              aria-expanded
              aria-controls="left-nav-panel-body"
            >
              «
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`flex h-10 w-full items-center justify-center text-lg ${
              isLight ? 'text-slate-700 hover:bg-slate-300/60' : 'text-slate-400 hover:bg-slate-800/85'
            }`}
            onClick={() => setExpanded((v) => !v)}
            title="Expand panel"
            aria-expanded={false}
            aria-controls="left-nav-panel-body"
          >
            »
          </button>
        )}
        {!expanded ? (
          <>
            <button
              type="button"
              className={`flex h-10 w-full items-center justify-center border-t text-slate-500 hover:bg-slate-800/85 ${
                colorMode === 'light'
                  ? 'border-slate-300/80 text-slate-600 hover:bg-slate-300/55'
                  : 'border-slate-800/80'
              }`}
              onClick={() => setAuthOpen(true)}
              title={signedIn ? 'Account' : 'Sign in or create account'}
              aria-label={signedIn ? 'Account' : 'Sign in or create account'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <button
              type="button"
              className={`flex h-10 w-full items-center justify-center border-t ${
                colorMode === 'light'
                  ? 'border-slate-300/80 text-amber-600 hover:bg-slate-300/50'
                  : 'border-slate-800/80 text-amber-400/90 hover:bg-slate-800/90'
              }`}
              onClick={() => setColorMode((m) => (m === 'light' ? 'dark' : 'light'))}
              title={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              role="switch"
              aria-checked={colorMode === 'light'}
            >
              {colorMode === 'light' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M18.36 5.64l1.41-1.41" />
                </svg>
              )}
            </button>
          </>
        ) : null}
      </div>

      <div
        id="left-nav-panel-body"
        className={`flex min-h-0 flex-1 flex-col gap-5 overflow-hidden ${expanded ? '' : 'hidden'}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
          <section className="mb-5">
            <h2
              className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-500'
              }`}
            >
              Account
            </h2>
            {signedIn && authUser ? (
              <div
                className={`mb-4 rounded-xl border p-3 ${
                  isLight
                    ? 'border-slate-300/90 bg-white/80 shadow-sm'
                    : 'border-slate-700/80 bg-slate-900/60'
                }`}
              >
                <div className="flex gap-4">
                  <div
                    className={`relative h-14 w-[5.75rem] shrink-0 overflow-hidden rounded-md border shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] ring-1 ${
                      isLight
                        ? 'border-slate-300 bg-slate-200/90 ring-slate-300/80'
                        : 'border-slate-600 bg-slate-800/95 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] ring-slate-700/80'
                    }`}
                    role="img"
                    aria-label={authUser.profilepic ? 'Profile photo' : 'No profile photo'}
                  >
                    {authUser.profilepic ? (
                      <img
                        src={authUser.profilepic}
                        alt=""
                        className="h-full w-full object-cover object-top"
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center ${
                          isLight ? 'bg-slate-200/90' : 'bg-slate-800/90'
                        }`}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={isLight ? 'text-slate-500' : 'text-slate-500/85'}
                          aria-hidden
                        >
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <dl className="min-w-0 flex-1 space-y-2.5 text-sm">
                    {orderedAuthKeys(authUser).map((key) => {
                      const raw = authUser[key] ?? ''
                      const trimmed = raw.trim()
                      const display =
                        key === 'profilepic' && !trimmed ? 'Not set' : trimmed || '—'
                      return (
                        <div key={key}>
                          <dt
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              isLight ? 'text-slate-600' : 'text-slate-500'
                            }`}
                          >
                            {accountFieldLabel(key)}
                          </dt>
                          <dd
                            className={
                              key === 'username'
                                ? `truncate text-sm font-medium ${isLight ? 'text-slate-900' : 'text-slate-100'}`
                                : key === 'email'
                                  ? `break-all text-sm ${isLight ? 'text-slate-800' : 'text-slate-200/95'}`
                                  : `line-clamp-3 break-all text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`
                            }
                            title={trimmed || undefined}
                          >
                            {display}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearAuthSession()
                    refreshAuth()
                  }}
                  className={`mt-4 w-full rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    isLight
                      ? 'border-slate-400/80 text-slate-800 hover:bg-slate-200/90'
                      : 'border-slate-600/80 text-slate-300 hover:bg-slate-800/90'
                  }`}
                >
                  Sign out
                </button>
              </div>
            ) : signedIn ? (
              <p className={`mb-3 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>You are signed in.</p>
            ) : (
              <p className={`mb-3 text-xs ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                You are not signed in yet.
              </p>
            )}
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                isLight
                  ? 'border-blue-200 bg-blue-50/90 text-blue-950 hover:border-blue-300 hover:bg-blue-50'
                  : 'border-blue-500/35 bg-blue-950/35 text-blue-100 hover:border-blue-500/50 hover:bg-blue-950/55'
              }`}
            >
              {signedIn ? 'Account settings' : 'Sign in or create account'}
            </button>
          </section>

          <section className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pr-1 text-left transition-colors ${
                  isLight ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-500 hover:bg-slate-800/70'
                }`}
                aria-expanded={historyOpen}
                aria-controls={historyPanelId}
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-200 ${historyOpen ? 'rotate-0' : '-rotate-90'}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider">History</span>
              </button>
              <button
                type="button"
                onClick={onClearAllHistory}
                disabled={history.length === 0}
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide hover:border-red-500/50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30 ${
                  isLight
                    ? 'border-slate-400/80 bg-white/70 text-slate-600'
                    : 'border-slate-600/80 bg-slate-900/80 text-slate-400 hover:text-red-300'
                }`}
                title="Clear all history"
              >
                Clear all
              </button>
            </div>
            <div id={historyPanelId} role="region" aria-label="History list" hidden={!historyOpen}>
              {history.length === 0 ? (
                <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>No pages yet</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.map((entry) => (
                    <li
                      key={`${entry.at}-${entry.url}`}
                      className={`group flex items-stretch gap-0.5 rounded-lg ${
                        isLight ? 'hover:bg-slate-200/80' : 'hover:bg-slate-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm ${
                          isLight ? 'text-blue-800' : 'text-blue-300'
                        }`}
                        onClick={() => onOpenHistoryEntry(entry)}
                        title={entry.url}
                      >
                        <span className="line-clamp-2">{entry.title || entry.url}</span>
                      </button>
                      <button
                        type="button"
                        className={`flex shrink-0 items-center justify-center rounded-lg px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${
                          isLight ? 'text-slate-500 hover:text-red-600' : 'text-slate-500 hover:text-red-400'
                        }`}
                        aria-label="Remove from history"
                        title="Remove from history"
                        onClick={() => onRemoveHistoryEntry(entry)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pr-1 text-left transition-colors ${
                  isLight ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-500 hover:bg-slate-800/70'
                }`}
                aria-expanded={bookmarksOpen}
                aria-controls={bookmarksPanelId}
                onClick={() => setBookmarksOpen((o) => !o)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-200 ${bookmarksOpen ? 'rotate-0' : '-rotate-90'}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider">Bookmarks</span>
              </button>
              <button
                type="button"
                onClick={onClearAllBookmarks}
                disabled={bookmarks.length === 0}
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide hover:border-red-500/50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30 ${
                  isLight
                    ? 'border-slate-400/80 bg-white/70 text-slate-600'
                    : 'border-slate-600/80 bg-slate-900/80 text-slate-400 hover:text-red-300'
                }`}
                title="Clear all bookmarks"
              >
                Clear all
              </button>
            </div>
            <div id={bookmarksPanelId} role="region" aria-label="Bookmarks list" hidden={!bookmarksOpen}>
              {bookmarks.length === 0 ? (
                <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>No bookmarks yet</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {bookmarks.map((entry) => (
                    <li
                      key={`${entry.at}-${entry.url}`}
                      className={`group flex items-center gap-0.5 rounded-lg ${
                        isLight ? 'hover:bg-slate-200/80' : 'hover:bg-slate-800/80'
                      }`}
                    >
                      <button
                        type="button"
                        className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left ${
                          isLight ? 'text-amber-900' : 'text-amber-200/90'
                        }`}
                        onClick={() => onOpenBookmark(entry)}
                        title={entry.url}
                      >
                        <span className="line-clamp-2 text-sm font-normal">{entry.title || entry.url}</span>
                        <span
                          className={`mt-0.5 block line-clamp-2 break-all text-[10px] leading-snug ${
                            isLight ? 'text-slate-500' : 'text-slate-500'
                          }`}
                        >
                          {entry.url}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`flex shrink-0 items-center justify-center rounded-lg px-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 ${
                          isLight ? 'text-slate-500 hover:text-red-600' : 'text-slate-500 hover:text-red-400'
                        }`}
                        aria-label="Remove bookmark"
                        title="Remove bookmark"
                        onClick={() => onRemoveBookmark(entry)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 pr-1 text-left transition-colors ${
                  isLight ? 'text-slate-600 hover:bg-slate-200/70' : 'text-slate-500 hover:bg-slate-800/70'
                }`}
                aria-expanded={downloadsOpen}
                aria-controls={downloadsPanelId}
                onClick={() => setDownloadsOpen((o) => !o)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 transition-transform duration-200 ${downloadsOpen ? 'rotate-0' : '-rotate-90'}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wider">Downloads</span>
              </button>
              <button
                type="button"
                onClick={onClearCompletedDownloads}
                disabled={completedDownloadCount === 0}
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide hover:border-slate-500/50 disabled:pointer-events-none disabled:opacity-30 ${
                  isLight
                    ? 'border-slate-400/80 bg-white/70 text-slate-600'
                    : 'border-slate-600/80 bg-slate-900/80 text-slate-400'
                }`}
                title="Remove finished downloads from this list"
              >
                Clear done
              </button>
            </div>
            <div id={downloadsPanelId} role="region" aria-label="Downloads list" hidden={!downloadsOpen}>
              <div
                className={`mb-3 rounded-lg border px-2.5 py-2 ${
                  isLight ? 'border-slate-300/80 bg-white/70' : 'border-slate-700/80 bg-slate-900/50'
                }`}
              >
                <p
                  id={downloadAskSaveSwitchId}
                  className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
                >
                  Ask where to save each file
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-labelledby={downloadAskSaveSwitchId}
                  aria-checked={downloadAskSaveLocation}
                  onClick={() => onDownloadAskSaveLocationChange(!downloadAskSaveLocation)}
                  className={`mt-2 flex h-9 w-full max-w-[11rem] items-center rounded-full border p-0.5 shadow-inner ${
                    isLight
                      ? 'border-slate-300/90 bg-slate-200/90'
                      : 'border-slate-600/80 bg-slate-900/90'
                  }`}
                  title={
                    downloadAskSaveLocation
                      ? 'Save As dialog before each download'
                      : 'Save files directly to Downloads'
                  }
                >
                  <span
                    className={`flex flex-1 items-center justify-center rounded-full py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                      !downloadAskSaveLocation
                        ? isLight
                          ? 'bg-white text-slate-800 shadow'
                          : 'bg-slate-800 text-blue-100 shadow-sm'
                        : isLight
                          ? 'text-slate-500'
                          : 'text-slate-500'
                    }`}
                  >
                    Off
                  </span>
                  <span
                    className={`flex flex-1 items-center justify-center rounded-full py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                      downloadAskSaveLocation
                        ? isLight
                          ? 'bg-white text-slate-800 shadow'
                          : 'bg-slate-800 text-blue-100 shadow-sm'
                        : isLight
                          ? 'text-slate-500'
                          : 'text-slate-500'
                    }`}
                  >
                    On
                  </span>
                </button>
                <p className={`mt-1.5 text-[10px] leading-snug ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                  {downloadAskSaveLocation
                    ? 'You will pick folder and filename for each download.'
                    : 'Files save automatically to your Downloads folder.'}
                </p>
              </div>
              {downloads.length === 0 ? (
                <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                  No downloads yet — save a file from a page in the webview
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {downloads.map((entry) => {
                    const inProgress = entry.state === 'progressing'
                    const pct =
                      entry.totalBytes > 0
                        ? Math.min(100, Math.round((100 * entry.receivedBytes) / entry.totalBytes))
                        : 0
                    const stateLabel =
                      entry.state === 'completed'
                        ? 'Done'
                        : entry.state === 'cancelled'
                          ? 'Cancelled'
                          : entry.state === 'interrupted'
                            ? 'Failed'
                            : 'Downloading'
                    return (
                      <li
                        key={entry.id}
                        className={`rounded-lg border px-2 py-2 ${
                          isLight ? 'border-slate-300/80 bg-white/70' : 'border-slate-700/80 bg-slate-900/50'
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-1">
                          <div className="min-w-0 flex-1">
                            <p
                              className={`line-clamp-2 text-sm font-medium ${isLight ? 'text-slate-900' : 'text-slate-100'}`}
                              title={entry.filename}
                            >
                              {entry.filename}
                            </p>
                            <p
                              className={`mt-0.5 line-clamp-2 break-all text-[10px] leading-snug ${
                                isLight ? 'text-slate-500' : 'text-slate-500'
                              }`}
                              title={entry.url}
                            >
                              {entry.url}
                            </p>
                            {inProgress ? (
                              <div
                                className={`mt-2 h-1.5 overflow-hidden rounded-full ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`}
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                              >
                                <div
                                  className="h-full rounded-full bg-blue-500 transition-[width] duration-150"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            ) : null}
                            <p
                              className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                                entry.state === 'completed'
                                  ? isLight
                                    ? 'text-emerald-700'
                                    : 'text-emerald-400/90'
                                  : isLight
                                    ? 'text-slate-500'
                                    : 'text-slate-500'
                              }`}
                            >
                              {stateLabel}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col gap-0.5">
                            {entry.state === 'completed' && entry.savePath ? (
                              <>
                                <button
                                  type="button"
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    isLight ? 'text-blue-800 hover:bg-slate-200' : 'text-blue-400 hover:bg-slate-800'
                                  }`}
                                  title="Open file"
                                  onClick={() => onOpenDownload(entry)}
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    isLight ? 'text-blue-800 hover:bg-slate-200' : 'text-blue-400 hover:bg-slate-800'
                                  }`}
                                  title="Show in folder"
                                  onClick={() => onShowDownloadInFolder(entry)}
                                >
                                  Folder
                                </button>
                              </>
                            ) : null}
                            {inProgress ? (
                              <button
                                type="button"
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  isLight ? 'text-red-700 hover:bg-slate-200' : 'text-red-400 hover:bg-slate-800'
                                }`}
                                title="Cancel download"
                                onClick={() => onCancelDownload(entry)}
                              >
                                Cancel
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-500 hover:bg-slate-800'
                              }`}
                              title="Remove from list"
                              onClick={() => onRemoveDownload(entry)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2
              className={`mb-2 text-xs font-semibold uppercase tracking-wider ${
                isLight ? 'text-slate-600' : 'text-slate-500'
              }`}
            >
              Theme
            </h2>
            <p id={colorModeSwitchId} className={`mb-1.5 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Appearance
            </p>
            <button
              type="button"
              role="switch"
              aria-labelledby={colorModeSwitchId}
              aria-checked={isLight}
              onClick={() => setColorMode((m) => (m === 'light' ? 'dark' : 'light'))}
              className={`mb-4 flex h-9 w-full max-w-[11rem] items-center rounded-full border p-0.5 shadow-inner ${
                isLight
                  ? 'border-slate-300/90 bg-slate-200/90'
                  : 'border-slate-600/80 bg-slate-900/90'
              }`}
              title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              <span
                className={`flex flex-1 items-center justify-center rounded-full py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  !isLight ? 'bg-slate-800 text-blue-100 shadow-sm' : 'text-slate-500'
                }`}
              >
                Dark
              </span>
              <span
                className={`flex flex-1 items-center justify-center rounded-full py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  isLight ? 'bg-white text-slate-800 shadow' : 'text-slate-500'
                }`}
              >
                Light
              </span>
            </button>
            <label
              className={`mb-1 block text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}
              htmlFor={themeSliderId}
            >
              Shell warmth / contrast {isLight ? <span className="font-normal opacity-80">(dark mode)</span> : null}
            </label>
            <input
              id={themeSliderId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={themeStrength}
              onChange={(e) => setThemeStrength(Number(e.target.value))}
              disabled={isLight}
              className={`w-full accent-blue-500 ${isLight ? 'cursor-not-allowed opacity-45' : ''}`}
            />
            <div
              className={`mt-1 flex justify-between text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}
            >
              <span>Cool</span>
              <span>{themeStrength}</span>
              <span>Warm</span>
            </div>
          </section>
        </div>
      </div>

      <EnterUser
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onLoginSuccess={() => {
          setAuthOpen(false)
          onGoHome?.()
        }}
      />
    </aside>
  )
}
