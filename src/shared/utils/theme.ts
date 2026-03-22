import type { ThemeKey } from '../types'
import {
  AUTH_GATE_STORAGE_KEY,
  DEFAULT_THEME,
  ENABLE_SYSTEM_THEME_FALLBACK,
  THEME_QUERY_KEY,
  THEME_STORAGE_KEY,
} from '../constants'

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

export function parseThemeValue(value: string | null | undefined): ThemeKey | null {
  if (value === 'v1' || value === 'v2' || value === 'v3') return value
  return null
}

export function resolveSystemTheme(): ThemeKey {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'v2' : 'v1'
  }
  return DEFAULT_THEME
}

export function readStoredTheme(): ThemeKey | null {
  try {
    return parseThemeValue(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
}

export function resolveThemeFromSearch(search: string): ThemeKey {
  const params = new URLSearchParams(search)
  const fromQuery = parseThemeValue(params.get(THEME_QUERY_KEY))
  if (fromQuery) return fromQuery

  const fromStorage = readStoredTheme()
  if (fromStorage) return fromStorage

  if (ENABLE_SYSTEM_THEME_FALLBACK) return resolveSystemTheme()
  return DEFAULT_THEME
}

export function writeThemeToStorage(theme: ThemeKey): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage errors in restrictive browser contexts.
  }
}

export function applyThemeToDocument(theme: ThemeKey): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme === 'v2' ? 'dark' : 'light'
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export function readFrontGateAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(AUTH_GATE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeFrontGateAuthenticated(authenticated: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (authenticated) window.sessionStorage.setItem(AUTH_GATE_STORAGE_KEY, '1')
    else window.sessionStorage.removeItem(AUTH_GATE_STORAGE_KEY)
  } catch {
    // Ignore storage errors in restrictive browser contexts.
  }
}
