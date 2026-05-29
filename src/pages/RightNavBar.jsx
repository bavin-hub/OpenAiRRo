import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { abortAiForTab, abortAllAiStreams, releaseAiAbort, replaceAiAbort } from '../aiStreamAbort.js'
import { loadUserChatsInfo, readAuthToken } from '../authSession.js'
import { SEARCH_API_ORIGIN, streamAiChatReply } from '../searchNavigation.js'
import { useShellLightMode } from '../useShellLightMode.js'

function userApiBase() {
  return import.meta.env.DEV ? '' : SEARCH_API_ORIGIN
}

/**
 * @typedef {{ id: string, role: 'user' | 'assistant', content: string }} ChatMessage
 */

function newMessageId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const AI_PANEL_WIDTH_KEY = 'browser-ai-panel-width'
const AI_PANEL_MIN = 260
const AI_PANEL_MAX = 720
const AI_PANEL_DEFAULT = 432

function clampWidth(n) {
  if (!Number.isFinite(n)) return AI_PANEL_DEFAULT
  return Math.min(AI_PANEL_MAX, Math.max(AI_PANEL_MIN, Math.round(n)))
}

function readStoredPanelWidth() {
  try {
    const raw = localStorage.getItem(AI_PANEL_WIDTH_KEY)
    const n = raw != null ? Number(raw) : AI_PANEL_DEFAULT
    return clampWidth(n)
  } catch {
    return AI_PANEL_DEFAULT
  }
}

/**
 * @param {unknown} raw
 * @returns {ChatMessage[]}
 */
function conversationHistoryToMessages(raw) {
  if (!Array.isArray(raw)) return []
  /** @type {ChatMessage[]} */
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const role = /** @type {{ role?: unknown }} */ (item).role
    const content = /** @type {{ content?: unknown }} */ (item).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string') continue
    out.push({ id: newMessageId(), role, content })
  }
  return out
}

/**
 * Retractable right panel: AI mode chat. State lives on each browser tab in App (not shared).
 * Each send posts the full `messages` array to the stateless Flask `/ai/chat` endpoint.
 *
 * @param {{
 *   tabId: string,
 *   panelExpanded: boolean,
 *   messages: ChatMessage[],
 *   input: string,
 *   error: string | null,
 *   streaming: boolean,
 *   remoteChatId: string | null,
 *   mergeTab: (tabId: string, merger: (tab: Record<string, unknown>) => Record<string, unknown>) => void,
 * }} props
 */
export default function RightNavBar({
  tabId,
  panelExpanded,
  messages,
  input,
  error,
  streaming,
  remoteChatId,
  mergeTab,
}) {
  const panelId = useId()
  const shellLight = useShellLightMode()
  const listEndRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [panelWidthPx, setPanelWidthPx] = useState(readStoredPanelWidth)
  const [resizing, setResizing] = useState(false)
  const [userChats, setUserChats] = useState(() => loadUserChatsInfo())
  const [loadingChatId, setLoadingChatId] = useState(/** @type {string | null} */ (null))

  const refreshUserChats = useCallback(() => {
    setUserChats(loadUserChatsInfo())
  }, [])

  useEffect(() => {
    refreshUserChats()
    window.addEventListener('shell-auth-changed', refreshUserChats)
    return () => window.removeEventListener('shell-auth-changed', refreshUserChats)
  }, [refreshUserChats])

  useEffect(() => {
    return () => {
      abortAllAiStreams()
    }
  }, [])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streaming, tabId])

  useEffect(() => {
    try {
      localStorage.setItem(AI_PANEL_WIDTH_KEY, String(panelWidthPx))
    } catch {
      /* ignore */
    }
  }, [panelWidthPx])

  const onResizePointerDown = useCallback(
    (e) => {
      if (!panelExpanded || e.button !== 0) return
      e.preventDefault()
      const el = /** @type {HTMLElement} */ (e.currentTarget)
      el.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startW = panelWidthPx
      setResizing(true)

      const onMove = (ev) => {
        if (!ev.isPrimary) return
        const dx = startX - ev.clientX
        setPanelWidthPx(clampWidth(startW + dx))
      }
      const onUp = (ev) => {
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        setResizing(false)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
    },
    [panelExpanded, panelWidthPx],
  )

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const tid = tabId
    const ac = new AbortController()
    replaceAiAbort(tid, ac)

    const userMsg = /** @type {ChatMessage} */ ({ id: newMessageId(), role: 'user', content: text })
    const assistantMsg = /** @type {ChatMessage} */ ({
      id: newMessageId(),
      role: 'assistant',
      content: '',
    })

    mergeTab(tid, (t) => ({
      aiInput: '',
      aiError: null,
      aiMessages: [...(/** @type {ChatMessage[]} */ (t.aiMessages) || []), userMsg, assistantMsg],
      aiStreaming: true,
    }))

    const apiMessages = [...messages, userMsg].map(({ role, content }) => ({ role, content }))

    try {
      await streamAiChatReply(apiMessages, {
        signal: ac.signal,
        onText: (full) => {
          mergeTab(tid, (t) => {
            const list = [...(/** @type {ChatMessage[]} */ (t.aiMessages) || [])]
            const idx = list.findIndex((m) => m.id === assistantMsg.id)
            if (idx === -1) return {}
            list[idx] = { ...list[idx], content: full }
            return { aiMessages: list }
          })
        },
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        mergeTab(tid, (t) => {
          const list = [...(/** @type {ChatMessage[]} */ (t.aiMessages) || [])]
          const idx = list.findIndex((m) => m.id === assistantMsg.id)
          if (idx === -1) return { aiStreaming: false }
          if (!list[idx].content.trim()) {
            return { aiMessages: list.filter((m) => m.id !== assistantMsg.id), aiStreaming: false }
          }
          return { aiStreaming: false }
        })
        return
      }
      const msg = e instanceof Error ? e.message : 'Request failed'
      mergeTab(tid, (t) => {
        const list = (/** @type {ChatMessage[]} */ (t.aiMessages) || []).filter((m) => m.id !== assistantMsg.id)
        return { aiError: msg, aiMessages: list, aiStreaming: false }
      })
    } finally {
      mergeTab(tid, () => ({ aiStreaming: false }))
      releaseAiAbort(tid, ac)
    }
  }, [input, messages, mergeTab, streaming, tabId])

  const onSubmit = (e) => {
    e.preventDefault()
    void send()
  }

  const stop = () => {
    abortAiForTab(tabId)
  }

  const onSelectSavedChat = useCallback(
    async (chatId) => {
      if (!chatId || streaming || loadingChatId) return
      const token = readAuthToken()
      if (!token) {
        mergeTab(tabId, () => ({
          aiError: 'Sign in to load saved chats.',
        }))
        return
      }

      setLoadingChatId(chatId)
      mergeTab(tabId, () => ({ aiError: null }))
      try {
        const url = `${userApiBase()}/user/get_full_chat`
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ chat_id: chatId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const err = typeof data?.error === 'string' ? data.error : `Could not load chat (${res.status})`
          throw new Error(err)
        }
        if (!data?.success || !Array.isArray(data.conversation_history)) {
          throw new Error('Unexpected response from server')
        }
        const loaded = conversationHistoryToMessages(data.conversation_history)
        mergeTab(tabId, () => ({
          aiMessages: loaded,
          aiRemoteChatId: chatId,
          aiInput: '',
          aiError: null,
        }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load chat'
        mergeTab(tabId, () => ({ aiError: msg }))
      } finally {
        setLoadingChatId(null)
      }
    },
    [loadingChatId, mergeTab, streaming, tabId],
  )

  return (
    <aside
      style={panelExpanded ? { width: panelWidthPx } : undefined}
      className={`relative flex h-full min-h-0 shrink-0 flex-col border-l ${
        shellLight
          ? 'border-slate-200 bg-slate-50 text-slate-900 shadow-[inset_1px_0_0_rgba(255,255,255,0.6)]'
          : 'border-slate-800/95 bg-slate-950 text-slate-100'
      } ${panelExpanded ? (resizing ? '' : 'transition-[width] duration-200 ease-out') : 'w-11 transition-[width] duration-200 ease-out'}`}
      aria-label="AI assistant panel"
    >
      {panelExpanded ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={AI_PANEL_MIN}
          aria-valuemax={AI_PANEL_MAX}
          aria-valuenow={panelWidthPx}
          aria-label="Drag to resize AI panel"
          title="Drag to resize"
          className="absolute bottom-0 left-0 top-10 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none hover:bg-blue-500/18 active:bg-blue-500/28"
          onPointerDown={onResizePointerDown}
        />
      ) : null}
      <button
        type="button"
        className={`flex h-10 w-full shrink-0 items-center justify-center border-b text-lg tracking-tight transition ${
          shellLight
            ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            : 'border-slate-800/95 bg-slate-900 text-slate-400 hover:bg-slate-800/95'
        }`}
        onClick={() => mergeTab(tabId, (t) => ({ aiPanelExpanded: !t.aiPanelExpanded }))}
        title={panelExpanded ? 'Collapse AI panel' : 'Expand AI panel'}
        aria-expanded={panelExpanded}
        aria-controls={panelId}
      >
        {panelExpanded ? '»' : '«'}
      </button>

      <div
        id={panelId}
        className={`flex min-h-0 flex-1 flex-row overflow-hidden ${panelExpanded ? '' : 'hidden'}`}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className={`shrink-0 border-b px-3.5 py-3 ${shellLight ? 'border-slate-200 bg-white/80' : 'border-slate-800/95 bg-slate-950/50'}`}>
            <h2 className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}>
              AI assistant
            </h2>
            <p className={`mt-1 text-xs leading-snug ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}>
              One thread per tab. Messages stream from your local API. Saved conversations load from the sidebar.
            </p>
          </div>

          <div className={`min-h-0 flex-1 overflow-y-auto px-3.5 py-3 ${shellLight ? 'bg-slate-50' : ''}`}>
            {messages.length === 0 ? (
              <p className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${shellLight ? 'border-slate-200 bg-white text-slate-600 shadow-sm' : 'border-white/10 bg-white/[0.03] text-slate-400'}`}>
                Ask a question here, or open a saved thread from the right after you sign in.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {messages.map((m) => (
                  <li
                    key={m.id}
                    className={`max-w-[min(95%,34rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? shellLight
                          ? 'ml-auto border border-blue-200 bg-blue-50 text-slate-900'
                          : 'ml-auto border border-blue-500/35 bg-blue-950/65 text-blue-50'
                        : shellLight
                          ? 'mr-auto border border-slate-200 bg-white text-slate-700'
                          : 'mr-auto border border-slate-700/90 bg-slate-900 text-slate-200'
                    }`}
                  >
                    <span
                      className={`mb-1 block text-[10px] font-semibold uppercase tracking-wider ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}
                    >
                      {m.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                    <p className="whitespace-pre-wrap break-words">{m.content || (streaming ? '…' : '')}</p>
                  </li>
                ))}
              </ul>
            )}
            <div ref={listEndRef} />
          </div>

          {error ? (
            <div
              className={`shrink-0 border-t px-3 py-2.5 text-xs leading-relaxed ${
                shellLight ? 'border-red-200 bg-red-50 text-red-900' : 'border-red-950/55 bg-red-950/55 text-red-100'
              }`}
            >
              {error}
            </div>
          ) : null}

          <form
            onSubmit={onSubmit}
            className={`shrink-0 border-t px-3 py-2.5 ${shellLight ? 'border-slate-200 bg-white' : 'border-slate-800/95 bg-slate-950/90'}`}
          >
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => mergeTab(tabId, () => ({ aiInput: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={2}
                placeholder="Write a message… (Enter sends, Shift+Enter newline)"
                spellCheck={true}
                disabled={streaming}
                aria-label="AI chat message"
                className={`min-h-11 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-50 ${
                  shellLight
                    ? 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400'
                    : 'border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500'
                }`}
              />
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-35 ${
                    shellLight ? 'bg-blue-600 shadow-blue-900/10' : 'bg-blue-600 shadow-black/30'
                  }`}
                >
                  Send
                </button>
                {streaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-medium transition ${
                      shellLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100' : 'border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Stop
                  </button>
                ) : null}
              </div>
            </div>
          </form>
        </div>

        <div
          className={`flex w-[7.75rem] shrink-0 flex-col border-l ${shellLight ? 'border-slate-200 bg-slate-100/90' : 'border-slate-800/95 bg-slate-900/50'}`}
          aria-label="Saved chats"
        >
          <div className={`shrink-0 border-b px-2.5 py-2.5 ${shellLight ? 'border-slate-200 bg-white/75' : 'border-slate-800/95'}`}>
            <h3 className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Saved
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {userChats.length === 0 ? (
              <p className={`rounded-lg px-2 py-2 text-[10px] leading-snug ${shellLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Sign in to see saved threads.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {userChats.map((c, i) => {
                  const id = String(c.chat_id ?? '')
                  const title = String(c.chat_title || c.chat_name || 'Chat')
                  const active = remoteChatId != null && remoteChatId === id
                  const busy = loadingChatId === id
                  return (
                    <li key={`${id}-${i}`}>
                      <button
                        type="button"
                        disabled={Boolean(streaming || loadingChatId)}
                        onClick={() => void onSelectSavedChat(id)}
                        title={title}
                        className={`w-full rounded-xl px-2 py-2 text-left text-[11px] leading-snug transition ${
                          active
                            ? shellLight
                              ? 'border border-blue-400/55 bg-blue-50 text-blue-950 shadow-sm'
                              : 'border border-blue-500/35 bg-blue-950/65 text-blue-50'
                            : shellLight
                              ? 'text-slate-700 hover:bg-white'
                              : 'text-slate-300 hover:bg-slate-800/75'
                        } disabled:pointer-events-none disabled:opacity-40`}
                      >
                        <span className="line-clamp-3">{busy ? 'Loading…' : title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}
