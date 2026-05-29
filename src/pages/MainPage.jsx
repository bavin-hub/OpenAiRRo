import { useState } from 'react'
import { HOME_LABEL } from '../searchNavigation.js'
import { useShellLightMode } from '../useShellLightMode.js'

/**
 * @param {{ onSubmitSearch: (query: string) => void }} props
 */
export default function MainPage({ onSubmitSearch }) {
  const [query, setQuery] = useState('')
  const shellLight = useShellLightMode()

  const submit = (e) => {
    e.preventDefault()
    const t = query.trim()
    if (!t) return
    onSubmitSearch(t)
  }

  return (
    <div
      className={`flex min-h-full flex-col items-center justify-center bg-transparent px-6 py-20 ${
        shellLight ? 'text-slate-800' : 'text-slate-100'
      }`}
    >
      <div className="w-full max-w-xl">
        <div className="text-center">
          <h1 className="mb-2 flex justify-center">
            <span
              className={`inline-flex items-center justify-center rounded-lg border px-6 py-3 font-mono text-3xl font-bold italic tracking-[0.2em] shadow-sm sm:text-4xl ${
                shellLight
                  ? 'border-sky-400/45 bg-sky-500/15 text-sky-700'
                  : 'border-cyan-500/35 bg-cyan-500/20 text-cyan-200'
              }`}
            >
              {HOME_LABEL}
            </span>
          </h1>
          <p className={`mb-10 text-sm ${shellLight ? 'text-slate-600' : 'text-slate-500'}`}>
            Search routes through your local Flask backend
          </p>
        </div>

        <form
          onSubmit={submit}
          className={`flex flex-col gap-3 rounded-2xl border p-2 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:gap-2 sm:p-2.5 ${
            shellLight
              ? 'border-slate-200/95 bg-white/90'
              : 'border-white/[0.08] bg-slate-950/35'
          }`}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything or paste a topic…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Home search"
            className={`min-h-12 flex-1 rounded-xl border border-transparent px-4 py-3 text-[15px] outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/35 ${
              shellLight
                ? 'bg-slate-50 text-slate-900 placeholder:text-slate-400'
                : 'bg-black/25 text-slate-100 placeholder:text-slate-500'
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
      </div>
    </div>
  )
}
