/** localStorage session (user payload + mirror token if cookie unavailable). */
export const AUTH_SESSION_KEY = 'browser-shell-session'

/** Cookie name for JWT; Path=/ for shell-wide access. */
export const AUTH_COOKIE_NAME = 'entity_auth_token'

export const USER_STORAGE_KEY = 'browser-shell-user'

/**
 * @returns {string}
 */
export function getCookieToken() {
  if (typeof document === 'undefined') return ''
  const prefix = `${AUTH_COOKIE_NAME}=`
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const t = part.trim()
    if (t.startsWith(prefix)) return decodeURIComponent(t.slice(prefix.length))
  }
  return ''
}

/**
 * @param {string} token
 */
export function setAuthCookieToken(token) {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 14
  const secure = window.location?.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

export function clearAuthCookieToken() {
  if (typeof document === 'undefined') return
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

/**
 * Prefer cookie, then persisted session.
 * @returns {string}
 */
export function readAuthToken() {
  const fromCookie = getCookieToken()
  if (fromCookie) return fromCookie
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return ''
    const p = JSON.parse(raw)
    const t = p?.accessToken
    return typeof t === 'string' ? t : ''
  } catch {
    return ''
  }
}

/**
 * @returns {Record<string, string> | null}
 */
export function loadAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    const u = p?.user
    if (!u || typeof u !== 'object') return null
    /** @type {Record<string, string>} */
    const out = {}
    for (const [k, v] of Object.entries(u)) {
      if (v === null || v === undefined) out[k] = ''
      else if (typeof v === 'object') out[k] = JSON.stringify(v)
      else out[k] = String(v)
    }
    return out
  } catch {
    return null
  }
}

/**
 * @param {string} token
 * @param {Record<string, unknown>} user
 */
export function persistLoginSession(token, user) {
  const raw = user && typeof user === 'object' ? user : {}
  /** @type {Record<string, string>} */
  const safeUser = {}
  for (const [key, val] of Object.entries(raw)) {
    if (val === null || val === undefined) safeUser[key] = ''
    else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      safeUser[key] = String(val)
    } else if (typeof val === 'object') {
      try {
        safeUser[key] = JSON.stringify(val)
      } catch {
        safeUser[key] = ''
      }
    }
  }

  try {
    localStorage.setItem(
      AUTH_SESSION_KEY,
      JSON.stringify({
        accessToken: token,
        user: safeUser,
      }),
    )
  } catch {
    /* ignore */
  }

  const username = safeUser.username ?? ''
  const email = safeUser.email ?? ''

  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ displayName: username, email }))
  } catch {
    /* ignore */
  }

  setAuthCookieToken(token)
  window.dispatchEvent(new CustomEvent('shell-auth-changed'))
}

/**
 * Saved chat summaries from login (`user.user_chats_info`).
 * @returns {Array<{ chat_id: string, chat_name: string, chat_title: string }>}
 */
export function loadUserChatsInfo() {
  const u = loadAuthUser()
  if (!u?.user_chats_info) return []
  try {
    const parsed = JSON.parse(u.user_chats_info)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function clearAuthSession() {
  clearAuthCookieToken()
  try {
    localStorage.removeItem(AUTH_SESSION_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('shell-auth-changed'))
}
