import { useEffect, useState } from 'react'
import { HOME_LABEL, normalizeHttpUrl } from '../searchNavigation.js'
import { useShellLightMode } from '../useShellLightMode.js'

/**
 * @param {{
 *   query: string
 *   results: Array<{ title: string, url: string, snippet: string }>
 *   onOpenUrl: (url: string) => void
 *   onOpenUrlInNewTab: (url: string) => void
 *   onBackHome: () => void
 *   onSubmitSearch: (q: string) => void
 * }} props
 */
export default function SearchResultsPage({
  query,
  results,
  onOpenUrl,
  onOpenUrlInNewTab,
  onBackHome,
  onSubmitSearch,
}) {
  const shellLight = useShellLightMode()
  const [searchInput, setSearchInput] = useState(query)

  useEffect(() => {
    setSearchInput(query)
  }, [query])

  const submitSearch = (e) => {
    e.preventDefault()
    const t = searchInput.trim()
    if (!t) return
    onSubmitSearch(t)
  }

  return (
    <div className={`min-h-full bg-transparent px-4 py-10 sm:px-10 ${shellLight ? 'text-slate-900' : 'text-slate-100'}`}>
      <div className="mx-auto max-w-3xl">
        <header className="mb-10 flex flex-col gap-8 border-b pb-10 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <p
              className={`inline-flex rounded-lg border px-4 py-2 font-mono text-base font-bold italic uppercase tracking-[0.18em] shadow-sm sm:text-lg sm:tracking-[0.22em] ${
                shellLight
                  ? 'border-sky-400/45 bg-sky-500/15 text-sky-700'
                  : 'border-cyan-500/35 bg-cyan-500/20 text-cyan-200'
              }`}
            >
              {HOME_LABEL}
            </p>
            <h1 className={`mt-4 text-2xl font-semibold tracking-tight ${shellLight ? 'text-slate-900' : 'text-white'}`}>
              Search results
            </h1>
            <p className={`mt-2 max-w-xl text-[15px] leading-relaxed ${shellLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Showing answers for{' '}
              <span className={`font-medium ${shellLight ? 'text-slate-800' : 'text-slate-200'}`}>
                &ldquo;{query}&rdquo;
              </span>
              {' '}
              <span className={shellLight ? 'text-slate-400' : 'text-slate-500'}>via local API</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onBackHome}
            className={`inline-flex shrink-0 items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-medium transition hover:brightness-[1.02] active:scale-[0.99] ${
              shellLight
                ? 'border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300'
                : 'border-white/10 bg-white/[0.06] text-slate-100 hover:border-white/15'
            }`}
          >
            ← Back home
          </button>
        </header>

        <form
          onSubmit={submitSearch}
          className={`mb-10 flex flex-col gap-3 rounded-2xl border p-2 shadow-sm sm:flex-row sm:items-center sm:gap-2 sm:p-2.5 ${
            shellLight ? 'border-slate-200/95 bg-white/90' : 'border-white/[0.08] bg-slate-950/35'
          }`}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Refine your search…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Search from results"
            className={`min-h-12 flex-1 rounded-xl border border-transparent px-4 py-3 text-[15px] outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/35 ${
              shellLight ? 'bg-slate-50 text-slate-900 placeholder:text-slate-400' : 'bg-black/25 text-slate-100 placeholder:text-slate-500'
            }`}
          />
          <button
            type="submit"
            className={`min-h-12 shrink-0 rounded-xl px-8 py-3 text-[15px] font-semibold text-white shadow-md transition hover:brightness-110 active:scale-[0.99] ${
              shellLight ? 'bg-blue-600 shadow-blue-900/10' : 'bg-blue-600 shadow-black/40'
            }`}
          >
            Search
          </button>
        </form>

        <ul className="flex flex-col gap-3">
          {results.map((item) => {
            const href = normalizeHttpUrl(item.url)
            const safeHref = href || '#'

            const onResultClick = (e) => {
              if (!href) {
                e.preventDefault()
                return
              }
              if (e.button !== 0) return
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
                e.preventDefault()
                onOpenUrlInNewTab(item.url)
                return
              }
              e.preventDefault()
              onOpenUrl(item.url)
            }

            const onResultAuxClick = (e) => {
              if (!href) return
              if (e.button === 1) {
                e.preventDefault()
                onOpenUrlInNewTab(item.url)
              }
            }

            const onResultContextMenu = (e) => {
              if (!href) return
              const shell = window.browserShell
              if (shell?.showSearchResultLinkMenu) {
                e.preventDefault()
                shell.showSearchResultLinkMenu({ url: href })
              }
            }

            return (
              <li key={item.url}>
                <a
                  href={safeHref}
                  rel="noopener noreferrer"
                  className={`group block rounded-2xl border p-5 text-left no-underline shadow-sm outline-none ring-blue-500/0 transition hover:ring-blue-500/20 focus-visible:ring-2 ${
                    shellLight
                      ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                      : 'border-white/[0.07] bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
                  }`}
                  onClick={onResultClick}
                  onAuxClick={onResultAuxClick}
                  onContextMenu={onResultContextMenu}
                >
                  <span
                    className={`text-lg font-semibold leading-snug text-blue-600 decoration-transparent underline-offset-4 group-hover:underline ${
                      shellLight ? '' : 'text-blue-400'
                    }`}
                  >
                    {item.title}
                  </span>
                  <p className={`mt-1 break-all font-mono text-xs leading-snug ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}>
                    {item.url}
                  </p>
                  <p className={`mt-3 text-sm leading-relaxed ${shellLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {item.snippet}
                  </p>
                </a>
              </li>
            )
          })}
        </ul>

        {results.length === 0 ? (
          <p
            className={`rounded-2xl border border-dashed p-12 text-center text-[15px] leading-relaxed ${
              shellLight ? 'border-slate-300 bg-slate-50 text-slate-600' : 'border-white/10 bg-black/20 text-slate-400'
            }`}
          >
            Nothing came back from the backend for this query. Try different keywords.
          </p>
        ) : null}
      </div>
    </div>
  )
}
