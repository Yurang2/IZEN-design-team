import { mockApiRequest } from '../../mock/mockApi'

declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL?: string
      FUNCTIONS_BASE_URL?: string
    }
  }
}

function toNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return '/api'
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed
  if (trimmed.startsWith('/')) return `${trimmed}/api`
  return `${trimmed}/api`
}

function getApiBaseFromRuntime(): string {
  const buildTimeBaseUrl =
    toNonEmpty(import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    toNonEmpty(import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined) ??
    '/api'

  if (typeof window === 'undefined') {
    return normalizeApiBase(buildTimeBaseUrl)
  }

  const queryValue = toNonEmpty(new URLSearchParams(window.location.search).get('apiBase'))
  if (queryValue) {
    const normalized = normalizeApiBase(queryValue)
    window.localStorage.setItem('API_BASE_URL', normalized)
    window.localStorage.setItem('FUNCTIONS_BASE_URL', normalized)
    return normalized
  }

  const runtimeBaseUrl =
    toNonEmpty(window.__APP_CONFIG__?.API_BASE_URL) ?? toNonEmpty(window.__APP_CONFIG__?.FUNCTIONS_BASE_URL)
  if (runtimeBaseUrl) return normalizeApiBase(runtimeBaseUrl)

  const stored =
    toNonEmpty(window.localStorage.getItem('API_BASE_URL')) ??
    toNonEmpty(window.localStorage.getItem('FUNCTIONS_BASE_URL'))
  if (stored) return normalizeApiBase(stored)

  return normalizeApiBase(buildTimeBaseUrl)
}

function getMockDataModeFromRuntime(): boolean {
  const envFlag = toNonEmpty(import.meta.env.VITE_USE_MOCK_DATA as string | undefined)
  if (envFlag && ['1', 'true', 'yes', 'on'].includes(envFlag.toLowerCase())) return true
  if (typeof window === 'undefined') return false

  const query = new URLSearchParams(window.location.search)
  const queryFlag = toNonEmpty(query.get('demo')) ?? toNonEmpty(query.get('mock'))
  if (queryFlag && ['1', 'true', 'yes', 'on'].includes(queryFlag.toLowerCase())) return true

  const stored = toNonEmpty(window.localStorage.getItem('USE_MOCK_DATA'))
  return Boolean(stored && ['1', 'true', 'yes', 'on'].includes(stored.toLowerCase()))
}

export const USE_MOCK_DATA = getMockDataModeFromRuntime()
export const API_BASE_URL = USE_MOCK_DATA ? 'mock://local' : getApiBaseFromRuntime()

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (USE_MOCK_DATA) {
    return mockApiRequest<T>(normalizedPath, init)
  }

  const headers = new Headers(init?.headers ?? undefined)
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!headers.has('Content-Type') && init?.body != null && method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  })
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
  const raw = await response.text()
  const trimmed = raw.trim()
  const looksHtml = trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = JSON.parse(raw) as { error?: string; message?: string }
      if (body.message) message = `${message}: ${body.message}`
      else if (body.error) message = `${message}: ${body.error}`
    } catch {
      if (looksHtml) {
        message = `${message}: API가 HTML을 반환했습니다. VITE_API_BASE_URL(${API_BASE_URL})이 Worker API를 가리키는지 확인하세요.`
      } else if (trimmed) {
        message = `${message}: ${trimmed.slice(0, 120)}`
      }
    }
    throw new Error(message)
  }

  if (!contentType.includes('application/json')) {
    if (looksHtml) {
      throw new Error(`API가 JSON 대신 HTML을 반환했습니다. VITE_API_BASE_URL(${API_BASE_URL})이 Worker API 주소인지 확인하세요.`)
    }
    throw new Error(`API 응답 타입이 JSON이 아닙니다: ${contentType || 'unknown'}`)
  }

  return JSON.parse(raw) as T
}
