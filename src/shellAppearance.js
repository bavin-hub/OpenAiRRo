/** 'dark' | 'light' — shell chrome + page backdrop */
export const COLOR_MODE_KEY = 'browser-shell-color-mode'

export const THEME_STORAGE_KEY = 'browser-shell-theme-strength'
export const DEFAULT_THEME_STRENGTH = 50

export function loadThemeStrength() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw == null || String(raw).trim() === '') return DEFAULT_THEME_STRENGTH
    const n = Number(raw)
    if (!Number.isFinite(n)) return DEFAULT_THEME_STRENGTH
    return Math.min(100, Math.max(0, n))
  } catch {
    return DEFAULT_THEME_STRENGTH
  }
}

export function loadColorMode() {
  try {
    const raw = localStorage.getItem(COLOR_MODE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    /* ignore */
  }
  return 'dark'
}

/**
 * @param {{ strength: number, colorMode: 'dark' | 'light' }} opts
 */
export function applyShellAppearance({ strength, colorMode }) {
  const root = document.documentElement
  root.dataset.shellColorMode = colorMode

  if (colorMode === 'light') {
    root.style.setProperty('--chrome-gradient-top', 'hsl(210, 38%, 96%)')
    root.style.setProperty('--chrome-gradient-bottom', 'hsl(215, 28%, 90%)')
    root.style.setProperty('--shell-accent', 'hsl(199, 78%, 42%)')
    root.style.setProperty('--shell-radial-center', 'hsl(210, 48%, 99%)')
    root.style.setProperty('--shell-radial-mid', 'hsl(214, 36%, 94%)')
    root.style.setProperty('--shell-radial-edge', 'hsl(218, 26%, 86%)')
    root.style.setProperty('--shell-chrome-border', '#b8c0d0')
    root.style.setProperty('--shell-foreground', '#0f172a')
    root.style.setProperty('--shell-foreground-muted', '#475569')
  } else {
    const t = strength / 100
    root.style.setProperty('--chrome-gradient-top', `hsl(215, ${16 + t * 14}%, ${9 + t * 10}%)`)
    root.style.setProperty('--chrome-gradient-bottom', `hsl(220, ${12 + t * 12}%, ${7 + t * 8}%)`)
    root.style.setProperty('--shell-accent', `hsl(${188 + t * 22}, ${55 + t * 15}%, ${42 + t * 12}%)`)
    root.style.setProperty('--shell-radial-center', `hsl(215, ${18 + t * 12}%, ${17 + t * 16}%)`)
    root.style.setProperty('--shell-radial-mid', `hsl(218, ${14 + t * 11}%, ${10 + t * 11}%)`)
    root.style.setProperty('--shell-radial-edge', `hsl(222, ${11 + t * 9}%, ${3 + t * 6}%)`)
    root.style.removeProperty('--shell-chrome-border')
    root.style.removeProperty('--shell-foreground')
    root.style.removeProperty('--shell-foreground-muted')
  }

  window.dispatchEvent(new CustomEvent('shell-appearance'))
}

/**
 * @param {() => void} onChange
 * @returns {() => void}
 */
export function subscribeShellAppearance(onChange) {
  const fn = () => onChange()
  window.addEventListener('shell-appearance', fn)
  return () => window.removeEventListener('shell-appearance', fn)
}

export function getShellColorMode() {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.shellColorMode === 'light' ? 'light' : 'dark'
}
