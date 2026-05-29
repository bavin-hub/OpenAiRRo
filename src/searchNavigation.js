/** Cloud Flask API (see backend/main_server.py). No trailing slash. */
export const SEARCH_API_ORIGIN = 'https://airro.online'

export const HOME_LABEL = '__.Entity.__'

/**
 * @param {string} input
 * @returns {{ type: 'search', query: string } | { type: 'url', url: string } | null}
 */
export function parseNavigationInput(input) {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return { type: 'url', url: trimmed }
  if (trimmed.includes('.') && !trimmed.includes(' ')) {
    return { type: 'url', url: `https://${trimmed}` }
  }
  return { type: 'search', query: trimmed }
}

/**
 * Normalize a result or pasted URL string to an absolute http(s) URL for href / loadURL.
 * @param {string} raw
 * @returns {string} empty string if nothing usable
 */
export function normalizeHttpUrl(raw) {
  const u = String(raw || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  if (u.startsWith('//')) return `https:${u}`
  return `https://${u}`
}

/**
 * @param {string} query
 * @returns {Promise<{ query: string, results: Array<{ title: string, url: string, snippet: string }> }>}
 */
export async function fetchSearchResults(query) {
  const url = `${SEARCH_API_ORIGIN}/search?q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Search failed (${res.status})`)
  }
  return res.json()
}

/**
 * Streams plain-text assistant output from POST /ai/chat (stateless: send full `messages` each time).
 *
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ signal?: AbortSignal, onText?: (fullText: string) => void }} [options]
 * @returns {Promise<string>}
 */
export async function streamAiChatReply(messages, options = {}) {
  const { signal, onText } = options
  const res = await fetch(`${SEARCH_API_ORIGIN}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(errBody || `AI chat failed (${res.status})`)
  }
  if (!res.body) {
    throw new Error('AI chat response had no body')
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    full += decoder.decode(value, { stream: true })
    onText?.(full)
  }
  full += decoder.decode()
  onText?.(full)
  return full
}
