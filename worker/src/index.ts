import { NotionApi } from './notionApi'
import { NotionWorkService } from './notionWork'
import type {
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  ChecklistPreviewItem,
  CreateTaskInput,
  Env,
  ProjectRecord,
  TaskRecord,
  TaskSnapshot,
  UpdateTaskInput,
} from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SNAPSHOT_CACHE_URL = 'https://cache.internal/notion-task-snapshot-v1'
const CHECKLIST_ASSIGNMENT_CACHE_URL = 'https://cache.internal/checklist-assignment-v1'
const CHECKLIST_NOT_APPLICABLE_SENTINEL = '__NOT_APPLICABLE__'
const DEFAULT_CACHE_TTL_MS = 60_000
const KR_HOLIDAY_JSON_URL = 'https://holidays.hyunbin.page/basic.json'
const KR_HOLIDAY_CACHE_MS = 12 * 60 * 60 * 1000
const DEFAULT_LOG_LIMIT = 100
const DEFAULT_EXPORT_LOG_LIMIT = 1000
const DEFAULT_RATE_LIMIT_WINDOW_MS = 10_000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 180
const DEFAULT_RATE_LIMIT_BLOCK_MS = 30_000
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12
const RATE_LIMIT_MAX_ENTRIES = 10_000
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 30_000
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const SESSION_COOKIE_NAME = 'izen_session'
const MEETING_AUDIO_PREFIX = 'meetings/audio'
const DEFAULT_MEETING_KEYWORD_LIMIT = 120
const MIN_MEETING_KEYWORD_LIMIT = 50
const MAX_MEETING_KEYWORD_LIMIT = 150
const DEFAULT_MIN_SPEAKERS = 2
const DEFAULT_MAX_SPEAKERS = 10
const MIN_ALLOWED_SPEAKERS = 1
const MAX_ALLOWED_SPEAKERS = 10
const TRANSCRIPT_POLL_LIMIT = 50
const MEETING_NOTION_SCHEMA_CACHE_MS = 5 * 60 * 1000
const NOTION_RICH_TEXT_CHUNK = 1800
const MAX_NOTION_FILE_UPLOAD_BYTES = 20 * 1024 * 1024
const MAX_TRANSCRIPT_BODY_UTTERANCE_BLOCKS = 150
const DEFAULT_OPENAI_SUMMARY_MODEL = 'gpt-5'
const MAX_SUMMARY_SOURCE_CHARS = 18_000
const FIXED_MEETING_NOTION_DB_ID = '3f3c1cc7ec278216b5e881744612ed6b'

let snapshotInFlight: Promise<TaskSnapshot> | null = null
let holidayCache: { expiresAt: number; dates: Set<string> } | null = null
let checklistDbInitInFlight: Promise<void> | null = null
let meetingDbInitInFlight: Promise<void> | null = null
let lastRateLimitCleanupAt = 0
let sessionSigningKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null
let meetingUploadSigningKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null
let meetingNotionSchemaCache: { databaseId: string; titlePropertyName: string; datePropertyName: string; checkedAt: number } | null = null

type RateLimitBucket = {
  count: number
  resetAt: number
  blockedUntil: number
}

const rateLimitBuckets = new Map<string, RateLimitBucket>()

type AuthSessionPayload = {
  exp: number
  iat: number
}

function requiredAuthEnv(env: Env): string | null {
  if (isAuthDisabled(env)) return null
  if (!env.PAGE_PASSWORD) return 'PAGE_PASSWORD'
  return null
}

function requiredNotionEnv(env: Env): string | null {
  if (!env.NOTION_TOKEN) return 'NOTION_TOKEN'
  if (!env.NOTION_TASK_DB_ID) return 'NOTION_TASK_DB_ID'
  if (!env.NOTION_PROJECT_DB_ID) return 'NOTION_PROJECT_DB_ID'
  return null
}

function normalizePath(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/, '') || '/'
  if (cleaned === '/api') return '/'
  if (cleaned.startsWith('/api/')) {
    return cleaned.slice(4) || '/'
  }
  return cleaned
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function isAuthDisabled(env: Env): boolean {
  return isTruthy(asString(env.AUTH_DISABLED))
}

function normalizeOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin.toLowerCase()
  } catch {
    return null
  }
}

function parseCsvSet(input: string | undefined): Set<string> {
  if (!input) return new Set<string>()
  const values = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(values)
}

type WildcardOriginRule = {
  protocol: 'http:' | 'https:'
  suffix: string
}

type AllowedOrigins = {
  exact: Set<string>
  wildcard: WildcardOriginRule[]
}

function parseWildcardOriginRule(value: string): WildcardOriginRule | null {
  const match = value.trim().toLowerCase().match(/^(https?):\/\/\*\.(.+)$/)
  if (!match) return null

  const protocol = (match[1] === 'http' ? 'http:' : 'https:') as 'http:' | 'https:'
  const hostCandidate = match[2].trim()
  if (!hostCandidate || hostCandidate.includes('*')) return null

  try {
    const parsed = new URL(`${protocol}//${hostCandidate}`)
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port) {
      return null
    }
    return {
      protocol,
      suffix: `.${parsed.hostname.toLowerCase()}`,
    }
  } catch {
    return null
  }
}

function isWildcardOriginMatch(origin: string, rule: WildcardOriginRule): boolean {
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== rule.protocol) return false
    const hostname = parsed.hostname.toLowerCase()
    return hostname.endsWith(rule.suffix) && hostname.length > rule.suffix.length
  } catch {
    return false
  }
}

function parseAllowedOrigins(env: Env): AllowedOrigins {
  const configured = parseCsvSet(asString(env.ALLOWED_ORIGINS))
  const exact = new Set<string>()
  const wildcard: WildcardOriginRule[] = []

  for (const value of configured) {
    const wildcardRule = parseWildcardOriginRule(value)
    if (wildcardRule) {
      wildcard.push(wildcardRule)
      continue
    }

    const origin = normalizeOrigin(value)
    if (origin) exact.add(origin)
  }

  return { exact, wildcard }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

function resolveAllowedOrigin(requestOrigin: string | null, env: Env): string | null {
  const normalizedOrigin = normalizeOrigin(requestOrigin ?? undefined)
  if (!normalizedOrigin) return null

  const allowlist = parseAllowedOrigins(env)
  if (allowlist.exact.size > 0 || allowlist.wildcard.length > 0) {
    if (allowlist.exact.has(normalizedOrigin)) return normalizedOrigin
    for (const wildcardRule of allowlist.wildcard) {
      if (isWildcardOriginMatch(normalizedOrigin, wildcardRule)) return normalizedOrigin
    }
    return null
  }

  // Safe default: allow only localhost when no explicit allowlist is configured.
  return isLocalhostOrigin(normalizedOrigin) ? normalizedOrigin : null
}

function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function getSessionSecret(env: Env): string {
  return asString(env.SESSION_SECRET) ?? env.PAGE_PASSWORD
}

function getSessionTtlSec(env: Env): number {
  return parseBoundedInt(asString(env.SESSION_TTL_SECONDS), DEFAULT_SESSION_TTL_SECONDS, 60, 7 * 24 * 60 * 60)
}

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function utf8Decode(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let idx = 0; idx < bytes.length; idx += 1) {
    binary += String.fromCharCode(bytes[idx])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!value) return null
  try {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) base64 += '='
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let idx = 0; idx < binary.length; idx += 1) {
      bytes[idx] = binary.charCodeAt(idx)
    }
    return bytes
  } catch {
    return null
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let idx = 0; idx < a.length; idx += 1) {
    diff |= a[idx] ^ b[idx]
  }
  return diff === 0
}

async function getSessionSigningKey(env: Env): Promise<CryptoKey> {
  const secret = getSessionSecret(env)
  if (sessionSigningKeyCache && sessionSigningKeyCache.secret === secret) {
    return sessionSigningKeyCache.key
  }

  const keyPromise = crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  sessionSigningKeyCache = {
    secret,
    key: keyPromise,
  }
  return keyPromise
}

async function signSessionPayload(payloadBase64: string, env: Env): Promise<string> {
  const key = await getSessionSigningKey(env)
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encode(payloadBase64))
  return base64UrlEncode(new Uint8Array(signature))
}

function getMeetingUploadSecret(env: Env): string {
  return (
    asString(env.SESSION_SECRET) ??
    asString(env.ASSEMBLYAI_WEBHOOK_SECRET) ??
    asString(env.PAGE_PASSWORD) ??
    asString(env.NOTION_TOKEN) ??
    'izen_meeting_upload_fallback_secret'
  )
}

async function getMeetingUploadSigningKey(env: Env): Promise<CryptoKey> {
  const secret = getMeetingUploadSecret(env)
  if (meetingUploadSigningKeyCache && meetingUploadSigningKeyCache.secret === secret) {
    return meetingUploadSigningKeyCache.key
  }

  const keyPromise = crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  meetingUploadSigningKeyCache = {
    secret,
    key: keyPromise,
  }
  return keyPromise
}

async function signMeetingUploadPayload(payloadBase64: string, env: Env): Promise<string> {
  const key = await getMeetingUploadSigningKey(env)
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encode(payloadBase64))
  return base64UrlEncode(new Uint8Array(signature))
}

async function createMeetingUploadToken(env: Env, params: { key: string; method: 'GET' | 'PUT'; expiresInSec: number }): Promise<string> {
  const payload = {
    key: params.key,
    method: params.method,
    exp: Date.now() + params.expiresInSec * 1000,
  }
  const payloadBase64 = base64UrlEncode(utf8Encode(JSON.stringify(payload)))
  const signatureBase64 = await signMeetingUploadPayload(payloadBase64, env)
  return `${payloadBase64}.${signatureBase64}`
}

async function verifyMeetingUploadToken(
  env: Env,
  token: string | undefined,
  expected: { key: string; method: 'GET' | 'PUT' },
): Promise<boolean> {
  if (!token) return false
  const [payloadBase64, signatureBase64] = token.split('.')
  if (!payloadBase64 || !signatureBase64) return false

  const expectedSignature = await signMeetingUploadPayload(payloadBase64, env)
  const expectedBytes = base64UrlDecode(expectedSignature)
  const providedBytes = base64UrlDecode(signatureBase64)
  if (!expectedBytes || !providedBytes) return false
  if (!timingSafeEqual(expectedBytes, providedBytes)) return false

  const payloadBytes = base64UrlDecode(payloadBase64)
  if (!payloadBytes) return false

  try {
    const parsed = JSON.parse(utf8Decode(payloadBytes)) as Partial<{ key: string; method: 'GET' | 'PUT'; exp: number }>
    if (parsed.key !== expected.key) return false
    if (parsed.method !== expected.method) return false
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return false
    return true
  } catch {
    return false
  }
}

function parseCookieHeader(raw: string): Record<string, string> {
  const pairs = raw.split(';')
  const output: Record<string, string> = {}
  for (const pair of pairs) {
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (!name) continue
    output[name] = value
  }
  return output
}

function getCookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie')
  if (!raw) return null
  const map = parseCookieHeader(raw)
  return map[name] ?? null
}

function buildSessionCookieValue(token: string, request: Request, maxAgeSec: number): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  const parts = [`${SESSION_COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (isSecure) parts.push('Secure')
  return parts.join('; ')
}

function buildSessionClearCookie(request: Request): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isSecure) parts.push('Secure')
  return parts.join('; ')
}

async function createSessionToken(env: Env): Promise<{ token: string; exp: number }> {
  const now = Date.now()
  const ttlSec = getSessionTtlSec(env)
  const payload: AuthSessionPayload = {
    iat: now,
    exp: now + ttlSec * 1000,
  }
  const payloadBase64 = base64UrlEncode(utf8Encode(JSON.stringify(payload)))
  const signatureBase64 = await signSessionPayload(payloadBase64, env)
  return {
    token: `${payloadBase64}.${signatureBase64}`,
    exp: payload.exp,
  }
}

async function readSessionToken(request: Request, env: Env): Promise<AuthSessionPayload | null> {
  const token = getCookieValue(request, SESSION_COOKIE_NAME)
  if (!token) return null

  const [payloadBase64, signatureBase64] = token.split('.')
  if (!payloadBase64 || !signatureBase64) return null

  const expectedSignature = await signSessionPayload(payloadBase64, env)
  const expectedBytes = base64UrlDecode(expectedSignature)
  const providedBytes = base64UrlDecode(signatureBase64)
  if (!expectedBytes || !providedBytes) return null
  if (!timingSafeEqual(expectedBytes, providedBytes)) return null

  const payloadBytes = base64UrlDecode(payloadBase64)
  if (!payloadBytes) return null

  try {
    const parsed = JSON.parse(utf8Decode(payloadBytes)) as Partial<AuthSessionPayload>
    if (typeof parsed.exp !== 'number' || typeof parsed.iat !== 'number') return null
    if (parsed.exp <= Date.now()) return null
    return {
      iat: parsed.iat,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

function getRateLimitConfig(env: Env): { windowMs: number; maxRequests: number; blockMs: number } {
  const windowSec = parseBoundedInt(asString(env.RATE_LIMIT_WINDOW_SECONDS), DEFAULT_RATE_LIMIT_WINDOW_MS / 1000, 1, 120)
  const maxRequests = parseBoundedInt(asString(env.RATE_LIMIT_MAX_REQUESTS), DEFAULT_RATE_LIMIT_MAX_REQUESTS, 30, 2_000)
  const blockSec = parseBoundedInt(asString(env.RATE_LIMIT_BLOCK_SECONDS), DEFAULT_RATE_LIMIT_BLOCK_MS / 1000, 1, 600)
  return {
    windowMs: windowSec * 1000,
    maxRequests,
    blockMs: blockSec * 1000,
  }
}

function getClientIp(request: Request): string {
  const cfIp = asString(request.headers.get('CF-Connecting-IP'))
  if (cfIp) return cfIp

  const xff = asString(request.headers.get('X-Forwarded-For'))
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'

  return 'unknown'
}

function cleanupRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size === 0) return
  if (rateLimitBuckets.size < RATE_LIMIT_MAX_ENTRIES && now - lastRateLimitCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) return

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now && bucket.blockedUntil <= now) {
      rateLimitBuckets.delete(key)
    }
  }

  lastRateLimitCleanupAt = now
}

function checkRateLimit(request: Request, env: Env): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now()
  cleanupRateLimitBuckets(now)

  const ip = getClientIp(request)
  const key = ip || 'unknown'
  const config = getRateLimitConfig(env)
  const current = rateLimitBuckets.get(key)

  if (current && current.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)) }
  }

  const bucket: RateLimitBucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + config.windowMs, blockedUntil: 0 }
      : { ...current, blockedUntil: 0 }

  bucket.count += 1
  if (bucket.count > config.maxRequests) {
    bucket.blockedUntil = now + config.blockMs
    rateLimitBuckets.set(key, bucket)
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(config.blockMs / 1000)) }
  }

  rateLimitBuckets.set(key, bucket)
  return { allowed: true }
}

function hasValidApiKey(request: Request, env: Env): boolean {
  const apiKey = asString(env.API_KEY)
  const provided = asString(request.headers.get('X-API-Key'))
  if (!apiKey || !provided) return false
  return provided === apiKey
}

function hasValidAccessIdentity(request: Request, env: Env): boolean {
  if (!isTruthy(asString(env.REQUIRE_CF_ACCESS))) return true
  const accessEmail = asString(request.headers.get('CF-Access-Authenticated-User-Email'))
  if (!accessEmail) return false

  const allowedEmails = parseCsvSet(asString(env.ALLOWED_ACCESS_EMAILS))
  if (allowedEmails.size === 0) return true
  const normalizedEmail = accessEmail.toLowerCase()
  const normalizedAllowlist = new Set(Array.from(allowedEmails).map((email) => email.toLowerCase()))
  return normalizedAllowlist.has(normalizedEmail)
}

async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (isAuthDisabled(env)) return true
  if (hasValidApiKey(request, env)) {
    return hasValidAccessIdentity(request, env)
  }

  const session = await readSessionToken(request, env)
  if (!session) return false
  return hasValidAccessIdentity(request, env)
}

function parsePageSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !ISO_DATE_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

function dateToIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

function isBusinessDay(date: Date, holidaySet: Set<string>): boolean {
  return !isWeekend(date) && !holidaySet.has(dateToIso(date))
}

function shiftBusinessDays(baseDate: Date, offsetBusinessDays: number, holidaySet: Set<string>): Date {
  if (offsetBusinessDays === 0) return new Date(baseDate.getTime())

  const direction = offsetBusinessDays > 0 ? 1 : -1
  let remaining = Math.abs(offsetBusinessDays)
  let current = new Date(baseDate.getTime())

  while (remaining > 0) {
    current = addDays(current, direction)
    if (isBusinessDay(current, holidaySet)) {
      remaining -= 1
    }
  }
  return current
}

async function getKoreanHolidaySet(): Promise<Set<string>> {
  if (holidayCache && holidayCache.expiresAt > Date.now()) {
    return holidayCache.dates
  }

  try {
    const response = await fetch(KR_HOLIDAY_JSON_URL, { method: 'GET' })
    if (!response.ok) throw new Error(`holiday_http_${response.status}`)
    const data = (await response.json()) as Record<string, unknown>
    const dates = new Set<string>()
    for (const key of Object.keys(data ?? {})) {
      if (ISO_DATE_RE.test(key)) dates.add(key)
    }

    holidayCache = {
      expiresAt: Date.now() + KR_HOLIDAY_CACHE_MS,
      dates,
    }
    return dates
  } catch {
    return new Set<string>()
  }
}

function pickChecklistOffset(
  item: Record<string, any>,
  operationMode: 'self' | 'dealer' | undefined,
  fulfillmentMode: 'domestic' | 'overseas' | 'dealer' | undefined,
): number | undefined {
  const normalizeOffset = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    // Positive lead-day input from checklist DB means "N business days before base date".
    return value > 0 ? -value : value
  }

  const defaultOffset = normalizeOffset(item.defaultOffsetBusinessDays)
  const pickPreferredOffset = (specific: unknown): number | undefined => {
    const normalizedSpecific = normalizeOffset(specific)
    // Treat zero specific offset as fallback to default when default is configured.
    if (normalizedSpecific === 0 && typeof defaultOffset === 'number' && defaultOffset !== 0) {
      return defaultOffset
    }
    return normalizedSpecific
  }

  if (fulfillmentMode === 'dealer') {
    const picked = pickPreferredOffset(item.dealerOffsetBusinessDays)
    if (typeof picked === 'number') return picked
  }
  if (fulfillmentMode === 'overseas') {
    const picked = pickPreferredOffset(item.overseasOffsetBusinessDays)
    if (typeof picked === 'number') return picked
  }
  if (fulfillmentMode === 'domestic') {
    const picked = pickPreferredOffset(item.domesticOffsetBusinessDays)
    if (typeof picked === 'number') return picked
  }
  if (operationMode === 'dealer') {
    const picked = pickPreferredOffset(item.dealerOffsetBusinessDays)
    if (typeof picked === 'number') return picked
  }
  if (typeof defaultOffset === 'number') return defaultOffset

  const totalLeadDays = normalizeOffset(item.totalLeadDays)
  if (typeof totalLeadDays === 'number') return totalLeadDays

  return undefined
}

function pickChecklistBaseDate(
  item: Record<string, any>,
  eventDate: string | undefined,
  shippingDate: string | undefined,
): Date | null {
  const basis = item.dueBasis ?? 'event_start'
  if (basis === 'shipping') {
    return parseIsoDate(shippingDate) ?? parseIsoDate(eventDate)
  }
  if (basis === 'event_end') return parseIsoDate(eventDate)
  return parseIsoDate(eventDate)
}

function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').toLowerCase()
}

function isLikelyNotionPageId(value: string | undefined | null): boolean {
  return /^[0-9a-f]{32}$/.test(normalizeNotionId(value))
}

function resolveChecklistAssignedTaskId(taskPageId: string | null, validTaskIds?: Set<string>): string | null {
  if (!taskPageId) return null

  if (isLikelyNotionPageId(taskPageId)) {
    const normalized = normalizeNotionId(taskPageId)
    if (!validTaskIds || validTaskIds.has(normalized)) return taskPageId
  }

  if (!taskPageId.includes('::')) return null

  const matched = taskPageId
    .split('::')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => isLikelyNotionPageId(entry))
    .filter((entry) => (validTaskIds ? validTaskIds.has(normalizeNotionId(entry)) : true))

  if (matched.length === 1) return matched[0]
  return null
}

function containsText(source: string, keyword?: string): boolean {
  if (!keyword) return true
  return source.toLowerCase().includes(keyword.toLowerCase())
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

function parseDate(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error('invalid_date')
  }
  return trimmed
}

function parsePatchBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('invalid_body')
  }
  return body as Record<string, unknown>
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function parseCreateBody(body: unknown): CreateTaskInput {
  const payload = parsePatchBody(body)
  const taskName = asString(payload.taskName)
  if (!taskName) {
    throw new Error('taskName_required')
  }

  const startDate = parseDate(payload.startDate)
  const dueDate = parseDate(payload.dueDate)

  const urgent = payload.urgent
  if (urgent !== undefined && typeof urgent !== 'boolean') {
    throw new Error('urgent_must_be_boolean')
  }

  return {
    taskName,
    projectId: asString(payload.projectId),
    projectName: asString(payload.projectName),
    workType: asString(payload.workType),
    status: asString(payload.status),
    assignee: parseStringArray(payload.assignee),
    requester: parseStringArray(payload.requester),
    startDate: startDate === null ? undefined : startDate,
    dueDate: dueDate === null ? undefined : dueDate,
    detail: asString(payload.detail),
    priority: asString(payload.priority),
    urgent: typeof urgent === 'boolean' ? urgent : undefined,
    issue: asString(payload.issue),
  }
}

function parseUpdateBody(body: unknown): UpdateTaskInput {
  const payload = parsePatchBody(body)

  if (Object.keys(payload).length === 0) {
    throw new Error('empty_patch')
  }

  const parsed: Record<string, unknown> = {}

  if (hasOwn(payload, 'taskName')) parsed.taskName = payload.taskName === null ? null : asString(payload.taskName)
  if (hasOwn(payload, 'projectId')) parsed.projectId = payload.projectId === null ? null : asString(payload.projectId)
  if (hasOwn(payload, 'projectName')) parsed.projectName = payload.projectName === null ? null : asString(payload.projectName)
  if (hasOwn(payload, 'workType')) parsed.workType = payload.workType === null ? null : asString(payload.workType)
  if (hasOwn(payload, 'status')) parsed.status = payload.status === null ? null : asString(payload.status)
  if (hasOwn(payload, 'detail')) parsed.detail = payload.detail === null ? null : asString(payload.detail)
  if (hasOwn(payload, 'priority')) parsed.priority = payload.priority === null ? null : asString(payload.priority)
  if (hasOwn(payload, 'issue')) parsed.issue = payload.issue === null ? null : asString(payload.issue)

  if (hasOwn(payload, 'assignee')) {
    parsed.assignee = payload.assignee === null ? null : parseStringArray(payload.assignee)
  }

  if (hasOwn(payload, 'requester')) {
    parsed.requester = payload.requester === null ? null : parseStringArray(payload.requester)
  }

  if (hasOwn(payload, 'urgent')) {
    if (payload.urgent !== null && typeof payload.urgent !== 'boolean') {
      throw new Error('urgent_must_be_boolean')
    }
    parsed.urgent = payload.urgent
  }

  if (hasOwn(payload, 'startDate')) {
    parsed.startDate = parseDate(payload.startDate)
  }

  if (hasOwn(payload, 'dueDate')) {
    parsed.dueDate = parseDate(payload.dueDate)
  }

  return parsed as UpdateTaskInput
}

function parseChecklistAssignmentBody(body: unknown): {
  projectPageId: string
  checklistItemPageId: string
  taskPageId: string | null
  assignmentStatus?: ChecklistAssignmentStatus
  actor?: string
} {
  const payload = parsePatchBody(body)
  const projectPageId = asString(payload.projectPageId) ?? asString(payload.projectId)
  const checklistItemPageId = asString(payload.checklistItemPageId) ?? asString(payload.itemId)
  const taskPageId = asString(payload.taskPageId) ?? asString(payload.taskId) ?? null
  const assignmentStatusRaw = asString(payload.assignmentStatus)
  const actor = asString(payload.actor)

  if (!projectPageId) throw new Error('projectPageId_required')
  if (!checklistItemPageId) throw new Error('checklistItemPageId_required')

  let assignmentStatus: ChecklistAssignmentStatus | undefined
  if (assignmentStatusRaw) {
    if (assignmentStatusRaw === 'assigned' || assignmentStatusRaw === 'unassigned' || assignmentStatusRaw === 'not_applicable') {
      assignmentStatus = assignmentStatusRaw
    } else {
      throw new Error('assignmentStatus_invalid')
    }
  }
  if (assignmentStatus === 'assigned' && !taskPageId) {
    throw new Error('assignmentStatus_requires_taskPageId')
  }
  if (taskPageId && !isLikelyNotionPageId(taskPageId)) {
    throw new Error('taskPageId_invalid')
  }

  return {
    projectPageId,
    checklistItemPageId,
    taskPageId,
    assignmentStatus,
    actor,
  }
}

function slugifyFilenamePart(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^\w.\- ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.toLowerCase()
}

function extractFileExtension(filename: string): string {
  const normalized = filename.trim()
  const idx = normalized.lastIndexOf('.')
  if (idx < 0 || idx === normalized.length - 1) return ''
  const ext = normalized.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!ext) return ''
  return `.${ext.slice(0, 8)}`
}

function buildMeetingAudioKey(filenameRaw: string): string {
  const filename = filenameRaw.trim()
  const extension = extractFileExtension(filename)
  const basename = extension ? filename.slice(0, -extension.length) : filename
  const safeBase = slugifyFilenamePart(basename).slice(0, 64) || 'audio'
  const date = new Date().toISOString().slice(0, 10)
  const id = crypto.randomUUID().replace(/-/g, '')
  return `${MEETING_AUDIO_PREFIX}/${date}/${id}-${safeBase}${extension}`
}

function isValidMeetingAudioKey(key: string): boolean {
  if (!key.startsWith(`${MEETING_AUDIO_PREFIX}/`)) return false
  return /^[a-zA-Z0-9/_\-.]+$/.test(key)
}

function parseMeetingKeywordLimit(env: Env): number {
  return parseBoundedInt(asString(env.MEETING_KEYWORD_LIMIT), DEFAULT_MEETING_KEYWORD_LIMIT, MIN_MEETING_KEYWORD_LIMIT, MAX_MEETING_KEYWORD_LIMIT)
}

function stripMeetingUploadKeyPrefix(filename: string): string {
  return filename.replace(/^[0-9a-f]{32}-/i, '')
}

function parseMeetingTranscriptBody(body: unknown): {
  key: string
  title: string
  meetingDate: string | null
  minSpeakers: number
  maxSpeakers: number
  keywordSetId: string | null
} {
  const payload = parsePatchBody(body)
  const key = asString(payload.key)
  if (!key) throw new Error('key_required')
  if (!isValidMeetingAudioKey(key)) throw new Error('key_invalid')

  const fallbackTitle = stripMeetingUploadKeyPrefix(key.split('/').pop() ?? '회의록')
  const titleInput = asString(payload.title) ?? fallbackTitle
  const parsedTitle = parseMeetingTitleMetadata(titleInput)
  const minSpeakersRaw = Number(payload.minSpeakers ?? DEFAULT_MIN_SPEAKERS)
  const maxSpeakersRaw = Number(payload.maxSpeakers ?? DEFAULT_MAX_SPEAKERS)

  if (!Number.isFinite(minSpeakersRaw) || !Number.isFinite(maxSpeakersRaw)) {
    throw new Error('speaker_range_invalid')
  }

  const minSpeakers = Math.max(MIN_ALLOWED_SPEAKERS, Math.min(MAX_ALLOWED_SPEAKERS, Math.floor(minSpeakersRaw)))
  const maxSpeakers = Math.max(MIN_ALLOWED_SPEAKERS, Math.min(MAX_ALLOWED_SPEAKERS, Math.floor(maxSpeakersRaw)))
  if (maxSpeakers < minSpeakers) {
    throw new Error('speaker_range_invalid')
  }

  return {
    key,
    title: parsedTitle.title.slice(0, 200),
    meetingDate: parsedTitle.meetingDate,
    minSpeakers,
    maxSpeakers,
    keywordSetId: asString(payload.keywordSetId) ?? null,
  }
}

function toIsoDateFromYyMmDd(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null
  const year = 2000 + Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return parseIsoDate(iso) ? iso : null
}

function parseMeetingTitleMetadata(input: string): { title: string; meetingDate: string | null } {
  const withoutExtension = input.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
  const compact = withoutExtension.replace(/\s+/g, ' ').trim()
  const match = compact.match(/^(\d{6})(?:[\s_-]+(.*))?$/)
  if (!match) {
    return {
      title: compact || '회의록',
      meetingDate: null,
    }
  }

  const isoDate = toIsoDateFromYyMmDd(match[1])
  const tailTitle = (match[2] ?? '').trim()
  if (!isoDate) {
    return {
      title: compact || '회의록',
      meetingDate: null,
    }
  }
  return {
    title: tailTitle || compact || '회의록',
    meetingDate: isoDate,
  }
}
type SpeakerMappingInput = {
  speakerLabel: string
  displayName: string
}

function parseSpeakerMappingsBody(body: unknown): SpeakerMappingInput[] {
  const payload = parsePatchBody(body)
  const mappings: SpeakerMappingInput[] = []

  if (Array.isArray(payload.mappings)) {
    for (const row of payload.mappings) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const item = row as Record<string, unknown>
      const speakerLabel = asString(item.speakerLabel) ?? asString(item.speaker) ?? ''
      const displayName = asString(item.displayName) ?? asString(item.name) ?? ''
      if (!speakerLabel || !displayName) continue
      mappings.push({ speakerLabel: speakerLabel.slice(0, 40), displayName: displayName.slice(0, 120) })
    }
  } else {
    const speakerLabel = asString(payload.speakerLabel) ?? asString(payload.speaker) ?? ''
    const displayName = asString(payload.displayName) ?? asString(payload.name) ?? ''
    if (speakerLabel && displayName) {
      mappings.push({ speakerLabel: speakerLabel.slice(0, 40), displayName: displayName.slice(0, 120) })
    }
  }

  if (mappings.length === 0) {
    throw new Error('speaker_mappings_required')
  }

  return mappings
}

function parseKeywordSetCreateBody(body: unknown): { name: string; isActive: boolean } {
  const payload = parsePatchBody(body)
  const name = asString(payload.name)
  if (!name) throw new Error('name_required')
  const isActive = payload.isActive === undefined ? true : Boolean(payload.isActive)
  return { name: name.slice(0, 120), isActive }
}

function parseKeywordSetPatchBody(body: unknown): { id: string; name?: string; isActive?: boolean } {
  const payload = parsePatchBody(body)
  const id = asString(payload.id)
  if (!id) throw new Error('id_required')
  const name = asString(payload.name)
  const hasIsActive = Object.prototype.hasOwnProperty.call(payload, 'isActive')
  const isActive = hasIsActive ? Boolean(payload.isActive) : undefined
  return {
    id,
    name: name?.slice(0, 120),
    isActive,
  }
}

function parseKeywordCreateBody(body: unknown): { setId: string; phrase: string; weight: number | null; tags: string | null } {
  const payload = parsePatchBody(body)
  const setId = asString(payload.setId)
  const phrase = asString(payload.phrase)
  if (!setId) throw new Error('setId_required')
  if (!phrase) throw new Error('phrase_required')
  const weightRaw = payload.weight
  const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) ? Math.max(0, Math.min(10, weightRaw)) : null
  const tags = asString(payload.tags) ?? null
  return {
    setId,
    phrase: phrase.slice(0, 200),
    weight,
    tags: tags?.slice(0, 400) ?? null,
  }
}

function parseKeywordPatchBody(body: unknown): { id: string; phrase?: string; weight?: number | null; tags?: string | null } {
  const payload = parsePatchBody(body)
  const id = asString(payload.id)
  if (!id) throw new Error('id_required')
  const phrase = asString(payload.phrase)
  const hasWeight = Object.prototype.hasOwnProperty.call(payload, 'weight')
  const weightRaw = payload.weight
  const weight = hasWeight
    ? weightRaw === null
      ? null
      : typeof weightRaw === 'number' && Number.isFinite(weightRaw)
        ? Math.max(0, Math.min(10, weightRaw))
        : undefined
    : undefined
  const hasTags = Object.prototype.hasOwnProperty.call(payload, 'tags')
  const tags = hasTags ? (asString(payload.tags) ?? null) : undefined

  return {
    id,
    phrase: phrase?.slice(0, 200),
    weight,
    tags: tags?.slice(0, 400) ?? null,
  }
}

function getCacheTtlMs(env: Env): number {
  const ttlSec = Number(env.API_CACHE_TTL_SECONDS ?? '60')
  if (!Number.isFinite(ttlSec)) return DEFAULT_CACHE_TTL_MS
  return Math.max(10_000, Math.floor(ttlSec * 1000))
}

function cacheRequest(): Request {
  return new Request(SNAPSHOT_CACHE_URL, { method: 'GET' })
}

function checklistAssignmentCacheRequest(): Request {
  return new Request(CHECKLIST_ASSIGNMENT_CACHE_URL, { method: 'GET' })
}

async function loadSnapshotFromCache(cacheTtlMs: number): Promise<TaskSnapshot | null> {
  const cached = await caches.default.match(cacheRequest())
  if (!cached) return null

  try {
    const payload = (await cached.json()) as { savedAt: number; snapshot: TaskSnapshot }
    if (!payload || typeof payload.savedAt !== 'number' || !payload.snapshot) return null
    if (Date.now() - payload.savedAt > cacheTtlMs) return null
    return payload.snapshot
  } catch {
    return null
  }
}

async function writeSnapshotToCache(snapshot: TaskSnapshot, cacheTtlMs: number): Promise<void> {
  const response = new Response(
    JSON.stringify({
      savedAt: Date.now(),
      snapshot,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${Math.floor(cacheTtlMs / 1000)}`,
      },
    },
  )

  await caches.default.put(cacheRequest(), response)
}

async function loadChecklistAssignmentsFromCache(): Promise<Record<string, string>> {
  const cached = await caches.default.match(checklistAssignmentCacheRequest())
  if (!cached) return {}

  try {
    const payload = (await cached.json()) as { assignments?: unknown }
    if (!payload || typeof payload.assignments !== 'object' || payload.assignments === null) return {}
    return Object.fromEntries(
      Object.entries(payload.assignments as Record<string, unknown>).filter(([, value]) => typeof value === 'string' && value.trim()),
    ) as Record<string, string>
  } catch {
    return {}
  }
}

async function writeChecklistAssignmentsToCache(assignments: Record<string, string>): Promise<void> {
  const response = new Response(
    JSON.stringify({
      savedAt: Date.now(),
      assignments,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000',
      },
    },
  )

  await caches.default.put(checklistAssignmentCacheRequest(), response)
}

function parseBoundedLimit(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}

function parseLogLimit(value: string | undefined): number {
  return parseBoundedLimit(value, DEFAULT_LOG_LIMIT, 200)
}

function parseExportLogLimit(value: string | undefined): number {
  return parseBoundedLimit(value, DEFAULT_EXPORT_LOG_LIMIT, 5000)
}

function hasChecklistDb(env: Env): boolean {
  return Boolean(env.CHECKLIST_DB)
}

async function ensureChecklistDbTables(env: Env): Promise<void> {
  const db = env.CHECKLIST_DB
  if (!db) return
  if (checklistDbInitInFlight) {
    await checklistDbInitInFlight
    return
  }

  checklistDbInitInFlight = (async () => {
    await db
      .prepare(
      `CREATE TABLE IF NOT EXISTS checklist_assignments (
        assignment_key TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        event_category TEXT NOT NULL,
        item_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by TEXT,
        updated_ip TEXT,
        updated_user_agent TEXT
      )`,
    )
      .bind()
      .run()

    await db
      .prepare(
      `CREATE TABLE IF NOT EXISTS checklist_assignment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_key TEXT NOT NULL,
        project_id TEXT NOT NULL DEFAULT '',
        event_category TEXT NOT NULL,
        item_id TEXT NOT NULL,
        previous_task_id TEXT,
        next_task_id TEXT,
        action TEXT NOT NULL,
        actor TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL
      )`,
      )
      .bind()
      .run()

    // Backward-compatible migration for already-created tables.
    try {
      await db.prepare(`ALTER TABLE checklist_assignments ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`).bind().run()
    } catch {}

    try {
      await db.prepare(`ALTER TABLE checklist_assignment_logs ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`).bind().run()
    } catch {}

    await db
      .prepare(
      `CREATE INDEX IF NOT EXISTS idx_checklist_assignment_logs_key_created_at
       ON checklist_assignment_logs(assignment_key, created_at DESC)`,
    )
      .bind()
      .run()
  })()

  try {
    await checklistDbInitInFlight
  } catch (error) {
    checklistDbInitInFlight = null
    throw error
  }
}

async function loadChecklistAssignmentsFromD1(env: Env): Promise<Record<string, string>> {
  if (!env.CHECKLIST_DB) return {}
  await ensureChecklistDbTables(env)
  const result = await env.CHECKLIST_DB.prepare(`SELECT assignment_key, task_id FROM checklist_assignments`).bind().all<{
    assignment_key?: unknown
    task_id?: unknown
  }>()

  const rows = Array.isArray(result.results) ? result.results : []
  const assignments: Record<string, string> = {}
  for (const row of rows) {
    const key = asString(typeof row.assignment_key === 'string' ? row.assignment_key : undefined)
    const taskId = asString(typeof row.task_id === 'string' ? row.task_id : undefined)
    if (!key || !taskId) continue
    assignments[key] = taskId
  }
  return assignments
}

async function loadChecklistAssignments(env: Env): Promise<{ assignments: Record<string, string>; mode: 'd1' | 'cache' }> {
  if (hasChecklistDb(env)) {
    return {
      assignments: await loadChecklistAssignmentsFromD1(env),
      mode: 'd1',
    }
  }
  return {
    assignments: await loadChecklistAssignmentsFromCache(),
    mode: 'cache',
  }
}

function toActorLabel(request: Request, explicitActor?: string): string {
  const actor = asString(explicitActor)
  if (actor) return actor.slice(0, 120)

  const accessEmail = asString(request.headers.get('CF-Access-Authenticated-User-Email'))
  if (accessEmail) return accessEmail.slice(0, 120)

  const userName = asString(request.headers.get('X-User-Name'))
  if (userName) return userName.slice(0, 120)

  return 'unknown'
}

function toIp(request: Request): string {
  return (asString(request.headers.get('CF-Connecting-IP')) ?? '-').slice(0, 64)
}

function toUserAgent(request: Request): string {
  return (asString(request.headers.get('User-Agent')) ?? '-').slice(0, 300)
}

async function writeChecklistAssignmentToD1(
  env: Env,
  request: Request,
  params: {
    key: string
    projectId: string
    eventCategory: string
    itemId: string
    taskId?: string
    previousTaskId?: string
    actor?: string
  },
): Promise<void> {
  if (!env.CHECKLIST_DB) return
  await ensureChecklistDbTables(env)

  const now = Date.now()
  const actor = toActorLabel(request, params.actor)
  const ip = toIp(request)
  const userAgent = toUserAgent(request)
  const action = params.taskId ? (params.previousTaskId ? 'reassign' : 'assign') : 'unassign'

  if (params.taskId) {
    await env.CHECKLIST_DB.prepare(
      `INSERT INTO checklist_assignments
       (assignment_key, project_id, event_category, item_id, task_id, updated_at, updated_by, updated_ip, updated_user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assignment_key) DO UPDATE SET
         project_id = excluded.project_id,
         event_category = excluded.event_category,
         item_id = excluded.item_id,
         task_id = excluded.task_id,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         updated_ip = excluded.updated_ip,
         updated_user_agent = excluded.updated_user_agent`,
    )
      .bind(params.key, params.projectId, params.eventCategory, params.itemId, params.taskId, now, actor, ip, userAgent)
      .run()
  } else {
    await env.CHECKLIST_DB.prepare(`DELETE FROM checklist_assignments WHERE assignment_key = ?`).bind(params.key).run()
  }

  await env.CHECKLIST_DB.prepare(
    `INSERT INTO checklist_assignment_logs
     (assignment_key, project_id, event_category, item_id, previous_task_id, next_task_id, action, actor, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      params.key,
      params.projectId,
      params.eventCategory,
      params.itemId,
      params.previousTaskId ?? null,
      params.taskId ?? null,
      action,
      actor,
      ip,
      userAgent,
      now,
    )
    .run()
}

async function listChecklistAssignmentLogs(
  env: Env,
  limit: number,
): Promise<
  Array<{
    id: number
    key: string
    projectId: string
    eventCategory: string
    itemId: string
    previousTaskId: string | null
    taskId: string | null
    action: string
    actor: string | null
    ip: string | null
    userAgent: string | null
    createdAt: number
  }>
> {
  if (!env.CHECKLIST_DB) return []
  await ensureChecklistDbTables(env)

  const result = await env.CHECKLIST_DB.prepare(
    `SELECT id, assignment_key, project_id, event_category, item_id, previous_task_id, next_task_id, action, actor, ip, user_agent, created_at
     FROM checklist_assignment_logs
     ORDER BY id DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all<{
      id?: unknown
      assignment_key?: unknown
      project_id?: unknown
      event_category?: unknown
      item_id?: unknown
      previous_task_id?: unknown
      next_task_id?: unknown
      action?: unknown
      actor?: unknown
      ip?: unknown
      user_agent?: unknown
      created_at?: unknown
    }>()

  const rows = Array.isArray(result.results) ? result.results : []
  return rows.map((row) => ({
    id: typeof row.id === 'number' ? row.id : Number(row.id ?? 0),
    key: typeof row.assignment_key === 'string' ? row.assignment_key : '',
    projectId: typeof row.project_id === 'string' ? row.project_id : '',
    eventCategory: typeof row.event_category === 'string' ? row.event_category : '',
    itemId: typeof row.item_id === 'string' ? row.item_id : '',
    previousTaskId: typeof row.previous_task_id === 'string' ? row.previous_task_id : null,
    taskId: typeof row.next_task_id === 'string' ? row.next_task_id : null,
    action: typeof row.action === 'string' ? row.action : '',
    actor: typeof row.actor === 'string' ? row.actor : null,
    ip: typeof row.ip === 'string' ? row.ip : null,
    userAgent: typeof row.user_agent === 'string' ? row.user_agent : null,
    createdAt: typeof row.created_at === 'number' ? row.created_at : Number(row.created_at ?? 0),
  }))
}

async function listKeywordSets(env: Env): Promise<
  Array<{
    id: string
    name: string
    isActive: boolean
    createdAt: number
    keywordCount: number
  }>
> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const result = await db
    .prepare(
      `SELECT s.id, s.name, s.is_active, s.created_at, COUNT(k.id) AS keyword_count
       FROM keyword_sets s
       LEFT JOIN keywords k ON k.set_id = s.id
       GROUP BY s.id, s.name, s.is_active, s.created_at
       ORDER BY s.created_at DESC`,
    )
    .bind()
    .all<{
      id?: unknown
      name?: unknown
      is_active?: unknown
      created_at?: unknown
      keyword_count?: unknown
    }>()
  const rows = Array.isArray(result.results) ? result.results : []
  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    name: typeof row.name === 'string' ? row.name : '',
    isActive: Number(row.is_active ?? 0) === 1,
    createdAt: Number(row.created_at ?? 0),
    keywordCount: Number(row.keyword_count ?? 0),
  }))
}

async function listKeywords(env: Env, setId?: string): Promise<
  Array<{
    id: string
    setId: string
    phrase: string
    weight: number | null
    tags: string | null
    createdAt: number
  }>
> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const hasSetId = Boolean(setId)
  const query = hasSetId
    ? `SELECT id, set_id, phrase, weight, tags, created_at FROM keywords WHERE set_id = ? ORDER BY created_at DESC`
    : `SELECT id, set_id, phrase, weight, tags, created_at FROM keywords ORDER BY created_at DESC`
  const stmt = db.prepare(query)
  const result = hasSetId ? await stmt.bind(setId).all() : await stmt.bind().all()
  const rows = Array.isArray(result.results) ? result.results : []
  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    setId: typeof row.set_id === 'string' ? row.set_id : '',
    phrase: typeof row.phrase === 'string' ? row.phrase : '',
    weight: typeof row.weight === 'number' ? row.weight : row.weight === null ? null : null,
    tags: typeof row.tags === 'string' ? row.tags : row.tags === null ? null : null,
    createdAt: Number(row.created_at ?? 0),
  }))
}

async function readKeywordPhrasesBySetId(env: Env, setId: string | null): Promise<{ phrases: string[]; truncated: boolean; total: number }> {
  if (!setId) return { phrases: [], truncated: false, total: 0 }
  const keywords = await listKeywords(env, setId)
  const keywordLimit = parseMeetingKeywordLimit(env)
  const phrases = keywords
    .map((entry) => entry.phrase.trim())
    .filter(Boolean)
  const uniquePhrases = Array.from(new Set(phrases))
  return {
    phrases: uniquePhrases.slice(0, keywordLimit),
    truncated: uniquePhrases.length > keywordLimit,
    total: uniquePhrases.length,
  }
}

async function readSpeakerMap(env: Env, transcriptId: string): Promise<Record<string, string>> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const result = await db
    .prepare(
      `SELECT speaker_label, display_name
       FROM speaker_maps
       WHERE transcript_id = ?`,
    )
    .bind(transcriptId)
    .all<{
      speaker_label?: unknown
      display_name?: unknown
    }>()
  const rows = Array.isArray(result.results) ? result.results : []
  const map: Record<string, string> = {}
  for (const row of rows) {
    const speaker = asString(typeof row.speaker_label === 'string' ? row.speaker_label : undefined)
    const display = asString(typeof row.display_name === 'string' ? row.display_name : undefined)
    if (!speaker || !display) continue
    map[speaker] = display
  }
  return map
}

function normalizeUtterances(raw: unknown): Array<{ speaker: string; text: string; start: number | null; end: number | null }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const item = entry as Record<string, unknown>
      const speaker = asString(item.speaker) ?? asString(item.speaker_label) ?? 'Speaker [UNKNOWN]'
      const text = asString(item.text) ?? ''
      const start = typeof item.start === 'number' && Number.isFinite(item.start) ? item.start : null
      const end = typeof item.end === 'number' && Number.isFinite(item.end) ? item.end : null
      return {
        speaker,
        text,
        start,
        end,
      }
    })
    .filter((entry): entry is { speaker: string; text: string; start: number | null; end: number | null } => Boolean(entry))
}

async function updateTranscriptFromAssembly(env: Env, assemblyId: string): Promise<void> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = asString(detail.status) ?? 'processing'
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)
  const now = Date.now()
  await db
    .prepare(
      `UPDATE transcripts
       SET status = ?, raw_json = ?, utterances_json = ?, text = ?, updated_at = ?, error_message = ?
       WHERE assembly_id = ?`,
    )
    .bind(
      status,
      JSON.stringify(detail),
      JSON.stringify(utterances),
      text,
      now,
      asString(detail.error) ?? null,
      assemblyId,
    )
    .run()
}

function checklistAssignmentKey(eventCategory: string | undefined, itemId: string, projectId?: string): string {
  const projectKey = normalizeNotionId(projectId) || 'all_project'
  const category = (eventCategory ?? '').trim() || 'ALL'
  return `${projectKey}::${category}::${itemId}`
}

function checklistMatrixKey(projectPageId: string, checklistItemPageId: string): string {
  return `${(projectPageId ?? '').trim()}::${(checklistItemPageId ?? '').trim()}`
}

function normalizeChecklistValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function splitChecklistCandidates(value: string | undefined): string[] {
  const raw = (value ?? '').normalize('NFKC')
  return raw
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function expandChecklistValues(values: string[] | undefined): Set<string> {
  const expanded = new Set<string>()
  for (const value of values ?? []) {
    const normalized = normalizeChecklistValue(value)
    if (normalized) expanded.add(normalized)
    for (const candidate of splitChecklistCandidates(value)) {
      const normalizedCandidate = normalizeChecklistValue(candidate)
      if (normalizedCandidate) expanded.add(normalizedCandidate)
    }
  }
  return expanded
}

function normalizedSet(values: string[] | undefined): Set<string> {
  return expandChecklistValues(values)
}

function checklistAppliesToProject(item: ChecklistPreviewItem, project: ProjectRecord): boolean {
  const projectType = normalizeChecklistValue(project.projectType)
  const eventCategory = normalizeChecklistValue(project.eventCategory)
  const applicableTypes = normalizedSet(item.applicableProjectTypes)
  const categoryCandidates = item.applicableEventCategories.length > 0 ? item.applicableEventCategories : item.eventCategories
  const applicableCategories = normalizedSet(categoryCandidates)

  const byType = applicableTypes.size === 0 || (projectType && applicableTypes.has(projectType))
  const byCategory = eventCategory
    ? applicableCategories.size > 0 && applicableCategories.has(eventCategory)
    : applicableCategories.size === 0
  return Boolean(byType && byCategory)
}

function toChecklistAssignmentStatus(
  applicable: boolean,
  taskPageId: string | null,
): { assignmentStatus: ChecklistAssignmentStatus; assignmentStatusText: string } {
  if (!applicable) {
    return {
      assignmentStatus: 'not_applicable',
      assignmentStatusText: '해당없음',
    }
  }
  if (taskPageId) {
    return {
      assignmentStatus: 'assigned',
      assignmentStatusText: '할당됨',
    }
  }
  return {
    assignmentStatus: 'unassigned',
    assignmentStatusText: '미할당',
  }
}

function requireMeetingsDb(env: Env): NonNullable<Env['CHECKLIST_DB']> {
  if (!env.CHECKLIST_DB) {
    throw new Error('meetings_db_not_configured')
  }
  return env.CHECKLIST_DB
}

async function ensureMeetingDbTables(env: Env): Promise<void> {
  const db = requireMeetingsDb(env)
  if (meetingDbInitInFlight) {
    await meetingDbInitInFlight
    return
  }

  meetingDbInitInFlight = (async () => {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS meetings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          audio_key TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS transcripts (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          assembly_id TEXT,
          status TEXT NOT NULL,
          raw_json TEXT,
          utterances_json TEXT,
          text TEXT,
          keywords_used_json TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS speaker_maps (
          transcript_id TEXT NOT NULL,
          speaker_label TEXT NOT NULL,
          display_name TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(transcript_id, speaker_label)
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS keyword_sets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS keywords (
          id TEXT PRIMARY KEY,
          set_id TEXT NOT NULL,
          phrase TEXT NOT NULL,
          weight REAL,
          tags TEXT,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    try {
      await db.prepare(`ALTER TABLE transcripts ADD COLUMN keywords_used_json TEXT`).bind().run()
    } catch {}
    try {
      await db.prepare(`ALTER TABLE transcripts ADD COLUMN error_message TEXT`).bind().run()
    } catch {}

    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
         ON transcripts(created_at DESC)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_transcripts_assembly_id
         ON transcripts(assembly_id)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_keywords_set_id
         ON keywords(set_id)`,
      )
      .bind()
      .run()
  })()

  try {
    await meetingDbInitInFlight
  } catch (error) {
    meetingDbInitInFlight = null
    throw error
  }
}

function getAssemblyApiKey(env: Env): string {
  const apiKey = asString(env.ASSEMBLYAI_API_KEY)
  if (!apiKey) throw new Error('assemblyai_api_key_missing')
  return apiKey
}

function getAssemblyWebhookSecret(env: Env): string {
  const secret = asString(env.ASSEMBLYAI_WEBHOOK_SECRET)
  if (!secret) throw new Error('assemblyai_webhook_secret_missing')
  return secret
}

function getMeetingAudioBucket(env: Env): NonNullable<Env['MEETING_AUDIO_BUCKET']> {
  const bucket = env.MEETING_AUDIO_BUCKET
  if (!bucket) throw new Error('meeting_audio_bucket_missing')
  return bucket
}

async function readR2ObjectForResponse(object: unknown): Promise<{ body: BodyInit; contentType?: string } | null> {
  if (!object || typeof object !== 'object') return null
  const value = object as {
    body?: BodyInit
    arrayBuffer?: () => Promise<ArrayBuffer>
    httpMetadata?: Record<string, unknown>
  }
  const httpMetadata = value.httpMetadata
  const contentType = asString(httpMetadata?.contentType)

  const stream = value.body
  if (stream && typeof stream === 'object') {
    // Workers R2 runtime commonly exposes a ReadableStream body directly.
    return {
      body: stream,
      contentType,
    }
  }

  if (typeof value.arrayBuffer === 'function') {
    const buffer = await value.arrayBuffer()
    return {
      body: buffer,
      contentType,
    }
  }

  return null
}

async function readR2ObjectAsArrayBuffer(object: unknown): Promise<{ bytes: ArrayBuffer; contentType?: string } | null> {
  if (!object || typeof object !== 'object') return null
  const value = object as {
    body?: BodyInit
    arrayBuffer?: () => Promise<ArrayBuffer>
    httpMetadata?: Record<string, unknown>
  }
  const httpMetadata = value.httpMetadata
  const contentType = asString(httpMetadata?.contentType)

  if (typeof value.arrayBuffer === 'function') {
    const bytes = await value.arrayBuffer()
    return { bytes, contentType }
  }

  const stream = value.body
  if (stream) {
    const bytes = await new Response(stream as BodyInit).arrayBuffer()
    return { bytes, contentType }
  }
  return null
}

async function createR2PresignedUrl(
  env: Env,
  key: string,
  method: 'GET' | 'PUT',
  options?: {
    expiresIn?: number
    contentType?: string
  },
): Promise<{ url: string; requiredHeaders?: Record<string, string> }> {
  const bucket = getMeetingAudioBucket(env)
  const r2Bucket = bucket as {
    createPresignedUrl?: (request: Request, options?: { expiresIn?: number }) => Promise<URL | string>
  }
  if (typeof r2Bucket.createPresignedUrl !== 'function') {
    throw new Error('r2_presign_not_supported_[UNKNOWN]')
  }

  const headers = new Headers()
  if (options?.contentType) {
    headers.set('content-type', options.contentType)
  }
  const unsigned = new Request(`https://r2-upload.local/${key}`, {
    method,
    headers,
  })
  const signed = await r2Bucket.createPresignedUrl(unsigned, { expiresIn: options?.expiresIn ?? 60 * 15 })
  const url = typeof signed === 'string' ? signed : signed.toString()
  const requiredHeaders = options?.contentType ? { 'Content-Type': options.contentType } : undefined
  return {
    url,
    requiredHeaders,
  }
}

async function resolveMeetingUploadTarget(
  env: Env,
  requestUrl: URL,
  key: string,
  contentType: string | undefined,
): Promise<{ url: string; requiredHeaders?: Record<string, string>; uploadMode: 'r2_presigned' | 'worker_direct' }> {
  try {
    const signed = await createR2PresignedUrl(env, key, 'PUT', {
      expiresIn: 15 * 60,
      contentType,
    })
    return {
      url: signed.url,
      requiredHeaders: signed.requiredHeaders ?? {},
      uploadMode: 'r2_presigned',
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    if (message !== 'r2_presign_not_supported_[UNKNOWN]') {
      throw error
    }

    const directUrl = new URL('/api/uploads/direct', requestUrl.origin)
    directUrl.searchParams.set('key', key)
    directUrl.searchParams.set('token', await createMeetingUploadToken(env, { key, method: 'PUT', expiresInSec: 15 * 60 }))
    const requiredHeaders: Record<string, string> = {}
    if (contentType) requiredHeaders['Content-Type'] = contentType
    return {
      url: directUrl.toString(),
      requiredHeaders,
      uploadMode: 'worker_direct',
    }
  }
}

async function resolveMeetingFetchUrl(env: Env, requestUrl: URL, key: string): Promise<string> {
  try {
    const signed = await createR2PresignedUrl(env, key, 'GET', {
      expiresIn: 60 * 60,
    })
    return signed.url
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    if (message !== 'r2_presign_not_supported_[UNKNOWN]') {
      throw error
    }
    const fetchUrl = new URL('/api/uploads/fetch', requestUrl.origin)
    fetchUrl.searchParams.set('key', key)
    fetchUrl.searchParams.set('token', await createMeetingUploadToken(env, { key, method: 'GET', expiresInSec: 60 * 60 }))
    return fetchUrl.toString()
  }
}

function inferAudioContentType(key: string): string {
  const lower = key.toLowerCase()
  if (lower.endsWith('.m4a')) return 'audio/mp4'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.aac')) return 'audio/aac'
  if (lower.endsWith('.flac')) return 'audio/flac'
  if (lower.endsWith('.ogg')) return 'audio/ogg'
  if (lower.endsWith('.mp4')) return 'audio/mp4'
  return 'application/octet-stream'
}

async function assemblyRequest<T>(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.assemblyai.com/v2${path}`, {
    ...init,
    headers: {
      Authorization: getAssemblyApiKey(env),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const text = (await response.text()).trim()
    throw new Error(`assemblyai_http_${response.status}${text ? `:${text.slice(0, 180)}` : ''}`)
  }
  return (await response.json()) as T
}

function decodeChecklistAssignmentValue(rawValue: string | undefined): { taskPageId: string | null; explicitNotApplicable: boolean } {
  const value = asString(rawValue)
  if (!value) {
    return {
      taskPageId: null,
      explicitNotApplicable: false,
    }
  }
  if (value === CHECKLIST_NOT_APPLICABLE_SENTINEL) {
    return {
      taskPageId: null,
      explicitNotApplicable: true,
    }
  }
  return {
    taskPageId: value,
    explicitNotApplicable: false,
  }
}

function notionDatabaseUrl(databaseId: string | undefined): string | null {
  const normalized = normalizeNotionId(databaseId)
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

async function getSnapshot(service: NotionWorkService, env: Env, ctx: ExecutionContext): Promise<TaskSnapshot> {
  const cacheTtlMs = getCacheTtlMs(env)
  const cached = await loadSnapshotFromCache(cacheTtlMs)
  if (cached) return cached

  if (!snapshotInFlight) {
    snapshotInFlight = (async () => {
      const fresh = await service.fetchSnapshot()
      ctx.waitUntil(writeSnapshotToCache(fresh, cacheTtlMs))
      return fresh
    })().finally(() => {
      snapshotInFlight = null
    })
  }

  return snapshotInFlight
}

function invalidateSnapshotCache(ctx: ExecutionContext): void {
  ctx.waitUntil(caches.default.delete(cacheRequest()))
}

type ResponseContext = {
  requestOrigin: string | null
  corsOrigin: string | null
  path: string
}

function isSensitivePath(path: string): boolean {
  return (
    path === '/projects' ||
    path === '/meta' ||
    path === '/tasks' ||
    path === '/uploads/presign' ||
    path === '/uploads/direct' ||
    path === '/uploads/fetch' ||
    path === '/transcripts' ||
    path === '/keyword-sets' ||
    path === '/keywords' ||
    path === '/assemblyai/webhook' ||
    path === '/meetings' ||
    path === '/admin/notion/project-schema/sync' ||
    /^\/tasks\/[^/]+$/.test(path) ||
    /^\/transcripts\/[^/]+$/.test(path) ||
    /^\/transcripts\/[^/]+\/speakers$/.test(path)
  )
}

function buildResponseHeaders(context: ResponseContext): Headers {
  const headers = new Headers()

  if (context.requestOrigin) {
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, CF-Access-Authenticated-User-Email')
    headers.set('Access-Control-Allow-Origin', context.corsOrigin ?? 'null')
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Vary', 'Origin')
  }

  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')

  if (isSensitivePath(context.path)) {
    headers.set('Cache-Control', 'no-store')
  }

  return headers
}

function jsonResponse(body: unknown, status: number, context: ResponseContext): Response {
  const headers = buildResponseHeaders(context)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

function emptyResponse(status: number, context: ResponseContext): Response {
  const headers = buildResponseHeaders(context)
  return new Response('', { status, headers })
}

function filterTasks(tasks: TaskRecord[], projectId?: string, status?: string, q?: string): TaskRecord[] {
  const normalizedProjectId = projectId ? normalizeNotionId(projectId) : undefined

  return tasks.filter((task) => {
    if (normalizedProjectId) {
      const idMatched = normalizeNotionId(task.projectKey) === normalizedProjectId
      if (!idMatched) return false
    }

    if (status && task.status !== status) {
      return false
    }

    if (q) {
      const source = `${task.taskName} ${task.detail} ${task.projectName} ${task.workType} ${task.status} ${task.assignee.join(' ')} ${task.requester.join(' ')}`
      if (!containsText(source, q)) return false
    }

    return true
  })
}

function paginate<T>(items: T[], cursor: string | undefined, pageSize: number): {
  items: T[]
  nextCursor?: string
  hasMore: boolean
} {
  const offset = Number(cursor ?? '0')
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const slice = items.slice(safeOffset, safeOffset + pageSize)
  const next = safeOffset + pageSize
  return {
    items: slice,
    nextCursor: next < items.length ? String(next) : undefined,
    hasMore: next < items.length,
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('content_type_must_be_application_json')
  }
  return request.json()
}

function serviceFromEnv(env: Env): NotionWorkService {
  const api = new NotionApi(env)
  return new NotionWorkService(api, env)
}

async function handleMeetingRoutes(
  request: Request,
  path: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  respond: {
    json: (body: unknown, status: number) => Response
    ok: (body: unknown) => Response
  },
): Promise<Response | null> {
  if (isMeetingRoutePath(path)) return handleMeetingRoutesNotion(request, path, url, env, ctx, respond)

  const toErrorStatus = (message: string): number => {
    if (
      message.includes('_required') ||
      message.includes('_invalid') ||
      message.includes('speaker_range_invalid') ||
      message.includes('mappings_required')
    ) {
      return 400
    }
    if (message.includes('not_found')) return 404
    if (message.includes('assemblyai_http_')) return 502
    return 500
  }
  const fail = (error: unknown): Response => {
    const message = error instanceof Error && error.message ? error.message : 'unknown_error'
    return respond.json({ ok: false, error: message }, toErrorStatus(message))
  }

  const transcriptMatch = path.match(/^\/transcripts\/([^/]+)$/)
  const speakerMatch = path.match(/^\/transcripts\/([^/]+)\/speakers$/)

  try {
    if (request.method === 'POST' && path === '/uploads/presign') {
      const payload = parsePatchBody(await readJsonBody(request))
      const filename = asString(payload.filename) ?? asString(payload.name) ?? 'recording.m4a'
      const contentType = asString(payload.contentType) ?? asString(payload.mimeType) ?? 'audio/m4a'
      const key = buildMeetingAudioKey(filename)
      const signed = await createR2PresignedUrl(env, key, 'PUT', {
        expiresIn: 15 * 60,
        contentType,
      })
      return respond.ok({
        ok: true,
        key,
        putUrl: signed.url,
        requiredHeaders: signed.requiredHeaders ?? {},
      })
    }

    if (request.method === 'POST' && path === '/transcripts') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseMeetingTranscriptBody(await readJsonBody(request))
      const keywordInfo = await readKeywordPhrasesBySetId(env, payload.keywordSetId)
      const getSigned = await createR2PresignedUrl(env, payload.key, 'GET', {
        expiresIn: 60 * 60,
      })

      const meetingId = crypto.randomUUID()
      const transcriptId = crypto.randomUUID()
      const now = Date.now()

      await db
        .prepare(
          `INSERT INTO meetings (id, title, audio_key, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(meetingId, payload.title, payload.key, now)
        .run()

      await db
        .prepare(
          `INSERT INTO transcripts (id, meeting_id, assembly_id, status, raw_json, utterances_json, text, keywords_used_json, error_message, created_at, updated_at)
           VALUES (?, ?, NULL, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
        )
        .bind(transcriptId, meetingId, 'queued', JSON.stringify(keywordInfo.phrases), now, now)
        .run()

      const webhookUrl = asString(env.ASSEMBLYAI_WEBHOOK_URL) ?? `${url.origin}/api/assemblyai/webhook`
      const webhookSecret = getAssemblyWebhookSecret(env)
      const assemblyPayload: Record<string, unknown> = {
        audio_url: getSigned.url,
        language_code: 'ko',
        speaker_labels: true,
        webhook_url: webhookUrl,
        webhook_auth_header_name: 'x-assemblyai-webhook-secret',
        webhook_auth_header_value: webhookSecret,
      }
      if (keywordInfo.phrases.length > 0) {
        assemblyPayload.word_boost = keywordInfo.phrases
      }
      // [UNKNOWN] AssemblyAI diarization range field compatibility may differ by API version.
      assemblyPayload.speaker_options = {
        min_speakers: payload.minSpeakers,
        max_speakers: payload.maxSpeakers,
      }

      let created: Record<string, unknown>
      try {
        created = await assemblyRequest<Record<string, unknown>>(env, '/transcript', {
          method: 'POST',
          body: JSON.stringify(assemblyPayload),
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'assembly_request_failed'
        await db
          .prepare(
            `UPDATE transcripts
             SET status = ?, error_message = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind('failed', message.slice(0, 600), Date.now(), transcriptId)
          .run()
        throw error
      }

      const assemblyId = asString(created.id)
      if (!assemblyId) {
        await db
          .prepare(
            `UPDATE transcripts
             SET status = ?, error_message = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind('failed', 'assembly_transcript_id_missing_[UNKNOWN]', Date.now(), transcriptId)
          .run()
        throw new Error('assembly_transcript_id_missing_[UNKNOWN]')
      }
      const status = asString(created.status) ?? 'queued'

      await db
        .prepare(
          `UPDATE transcripts
           SET assembly_id = ?, status = ?, raw_json = ?, error_message = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(assemblyId, status, JSON.stringify(created), Date.now(), transcriptId)
        .run()

      return respond.json(
        {
          ok: true,
          transcriptId,
          meetingId,
          assemblyId,
          keywordsUsed: keywordInfo.phrases,
          keywordsTruncated: keywordInfo.truncated,
          keywordsTotal: keywordInfo.total,
        },
        201,
      )
    }

    if (request.method === 'GET' && path === '/transcripts') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const limit = parseBoundedLimit(asString(url.searchParams.get('limit')), 20, TRANSCRIPT_POLL_LIMIT)
      const result = await db
        .prepare(
          `SELECT t.id, t.meeting_id, t.assembly_id, t.status, t.created_at, t.updated_at, m.title, m.audio_key
           FROM transcripts t
           JOIN meetings m ON m.id = t.meeting_id
           ORDER BY t.created_at DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id?: unknown
          meeting_id?: unknown
          assembly_id?: unknown
          status?: unknown
          created_at?: unknown
          updated_at?: unknown
          title?: unknown
          audio_key?: unknown
        }>()

      const rows = Array.isArray(result.results) ? result.results : []
      return respond.ok({
        ok: true,
        transcripts: rows.map((row) => ({
          id: typeof row.id === 'string' ? row.id : '',
          meetingId: typeof row.meeting_id === 'string' ? row.meeting_id : '',
          assemblyId: typeof row.assembly_id === 'string' ? row.assembly_id : null,
          status: typeof row.status === 'string' ? row.status : 'unknown',
          createdAt: Number(row.created_at ?? 0),
          updatedAt: Number(row.updated_at ?? 0),
          title: typeof row.title === 'string' ? row.title : '',
          audioKey: typeof row.audio_key === 'string' ? row.audio_key : '',
        })),
      })
    }

    if (request.method === 'GET' && transcriptMatch) {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const transcriptId = decodeURIComponent(transcriptMatch[1])
      const row = await db
        .prepare(
          `SELECT t.id, t.meeting_id, t.assembly_id, t.status, t.raw_json, t.utterances_json, t.text, t.keywords_used_json, t.error_message, t.created_at, t.updated_at, m.title, m.audio_key
           FROM transcripts t
           JOIN meetings m ON m.id = t.meeting_id
           WHERE t.id = ?`,
        )
        .bind(transcriptId)
        .first<{
          id?: unknown
          meeting_id?: unknown
          assembly_id?: unknown
          status?: unknown
          raw_json?: unknown
          utterances_json?: unknown
          text?: unknown
          keywords_used_json?: unknown
          error_message?: unknown
          created_at?: unknown
          updated_at?: unknown
          title?: unknown
          audio_key?: unknown
        }>()

      if (!row) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      const utterances = (() => {
        try {
          return normalizeUtterances(typeof row.utterances_json === 'string' ? JSON.parse(row.utterances_json) : [])
        } catch {
          return [] as Array<{ speaker: string; text: string; start: number | null; end: number | null }>
        }
      })()
      const speakerMap = await readSpeakerMap(env, transcriptId)
      const mappedUtterances = utterances.map((entry) => ({
        ...entry,
        displaySpeaker: speakerMap[entry.speaker] ?? entry.speaker,
      }))
      const keywordsUsed = (() => {
        try {
          const parsed = typeof row.keywords_used_json === 'string' ? JSON.parse(row.keywords_used_json) : []
          if (!Array.isArray(parsed)) return [] as string[]
          return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        } catch {
          return [] as string[]
        }
      })()

      return respond.ok({
        ok: true,
        transcript: {
          id: typeof row.id === 'string' ? row.id : '',
          meetingId: typeof row.meeting_id === 'string' ? row.meeting_id : '',
          assemblyId: typeof row.assembly_id === 'string' ? row.assembly_id : null,
          status: typeof row.status === 'string' ? row.status : 'unknown',
          text: typeof row.text === 'string' ? row.text : '',
          rawJson: typeof row.raw_json === 'string' ? row.raw_json : null,
          utterances,
          utterancesMapped: mappedUtterances,
          speakerMap,
          keywordsUsed,
          errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
          createdAt: Number(row.created_at ?? 0),
          updatedAt: Number(row.updated_at ?? 0),
          meeting: {
            title: typeof row.title === 'string' ? row.title : '',
            audioKey: typeof row.audio_key === 'string' ? row.audio_key : '',
          },
        },
      })
    }

    if ((request.method === 'POST' || request.method === 'PATCH') && speakerMatch) {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const transcriptId = decodeURIComponent(speakerMatch[1])
      const mappings = parseSpeakerMappingsBody(await readJsonBody(request))
      const now = Date.now()

      const existingTranscript = await db.prepare(`SELECT id FROM transcripts WHERE id = ?`).bind(transcriptId).first<{ id?: unknown }>()
      if (!existingTranscript || typeof existingTranscript.id !== 'string') {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      for (const entry of mappings) {
        await db
          .prepare(
            `INSERT INTO speaker_maps (transcript_id, speaker_label, display_name, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(transcript_id, speaker_label) DO UPDATE SET
               display_name = excluded.display_name,
               updated_at = excluded.updated_at`,
          )
          .bind(transcriptId, entry.speakerLabel, entry.displayName, now)
          .run()
      }

      const speakerMap = await readSpeakerMap(env, transcriptId)
      return respond.ok({
        ok: true,
        transcriptId,
        speakerMap,
      })
    }

    if (request.method === 'GET' && path === '/keyword-sets') {
      const sets = await listKeywordSets(env)
      return respond.ok({
        ok: true,
        sets,
      })
    }

    if (request.method === 'POST' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordSetCreateBody(await readJsonBody(request))
      const id = crypto.randomUUID()
      const now = Date.now()
      await db
        .prepare(
          `INSERT INTO keyword_sets (id, name, is_active, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(id, payload.name, payload.isActive ? 1 : 0, now)
        .run()
      return respond.json(
        {
          ok: true,
          set: {
            id,
            name: payload.name,
            isActive: payload.isActive,
            createdAt: now,
            keywordCount: 0,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordSetPatchBody(await readJsonBody(request))
      if (payload.name !== undefined) {
        await db.prepare(`UPDATE keyword_sets SET name = ? WHERE id = ?`).bind(payload.name, payload.id).run()
      }
      if (payload.isActive !== undefined) {
        await db.prepare(`UPDATE keyword_sets SET is_active = ? WHERE id = ?`).bind(payload.isActive ? 1 : 0, payload.id).run()
      }
      const sets = await listKeywordSets(env)
      const updated = sets.find((entry) => entry.id === payload.id)
      if (!updated) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      return respond.ok({ ok: true, set: updated })
    }

    if (request.method === 'DELETE' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      await db.prepare(`DELETE FROM keywords WHERE set_id = ?`).bind(id).run()
      await db.prepare(`DELETE FROM keyword_sets WHERE id = ?`).bind(id).run()
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'GET' && path === '/keywords') {
      const setId = asString(url.searchParams.get('setId'))
      const keywords = await listKeywords(env, setId)
      return respond.ok({
        ok: true,
        keywords,
      })
    }

    if (request.method === 'POST' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordCreateBody(await readJsonBody(request))
      const id = crypto.randomUUID()
      const now = Date.now()
      await db
        .prepare(
          `INSERT INTO keywords (id, set_id, phrase, weight, tags, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, payload.setId, payload.phrase, payload.weight, payload.tags, now)
        .run()
      return respond.json(
        {
          ok: true,
          keyword: {
            id,
            setId: payload.setId,
            phrase: payload.phrase,
            weight: payload.weight,
            tags: payload.tags,
            createdAt: now,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordPatchBody(await readJsonBody(request))
      if (payload.phrase !== undefined) {
        await db.prepare(`UPDATE keywords SET phrase = ? WHERE id = ?`).bind(payload.phrase, payload.id).run()
      }
      if (payload.weight !== undefined) {
        await db.prepare(`UPDATE keywords SET weight = ? WHERE id = ?`).bind(payload.weight, payload.id).run()
      }
      if (payload.tags !== undefined) {
        await db.prepare(`UPDATE keywords SET tags = ? WHERE id = ?`).bind(payload.tags, payload.id).run()
      }
      const list = await listKeywords(env)
      const keyword = list.find((entry) => entry.id === payload.id)
      if (!keyword) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      return respond.ok({ ok: true, keyword })
    }

    if (request.method === 'DELETE' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      await db.prepare(`DELETE FROM keywords WHERE id = ?`).bind(id).run()
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'POST' && path === '/assemblyai/webhook') {
      await ensureMeetingDbTables(env)
      const secret = getAssemblyWebhookSecret(env)
      const headerSecret = asString(request.headers.get('x-assemblyai-webhook-secret'))
      if (!headerSecret || headerSecret !== secret) {
        return respond.json({ ok: false, error: 'webhook_forbidden' }, 403)
      }

      const body = parsePatchBody(await readJsonBody(request))
      const assemblyId = asString(body.transcript_id) ?? asString(body.id)
      if (!assemblyId) {
        return respond.json({ ok: false, error: 'transcript_id_required' }, 400)
      }
      const status = (asString(body.status) ?? 'processing').toLowerCase()
      const errorMessage = asString(body.error) ?? null
      const now = Date.now()
      const db = requireMeetingsDb(env)

      await db
        .prepare(
          `UPDATE transcripts
           SET status = ?, updated_at = ?, error_message = ?
           WHERE assembly_id = ?`,
        )
        .bind(status, now, errorMessage, assemblyId)
        .run()

      if (status === 'completed') {
        ctx.waitUntil(updateTranscriptFromAssembly(env, assemblyId))
      }

      return respond.ok({
        ok: true,
        assemblyId,
        status,
      })
    }
  } catch (error: unknown) {
    return fail(error)
  }

  return null
}

const MEETING_NOTION_FIELD = {
  date: '날짜',
  recordType: 'Record Type',
  transcriptId: 'Transcript ID',
  meetingId: 'Meeting ID',
  assemblyId: 'Assembly ID',
  status: 'Status',
  audioKey: 'Audio Key',
  speakerMapJson: 'Speaker Map JSON',
  keywordsUsedJson: 'Keywords Used JSON',
  errorMessage: 'Error Message',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  minSpeakers: 'Min Speakers',
  maxSpeakers: 'Max Speakers',
  keywordSetId: 'Keyword Set ID',
  keywordSetName: 'Keyword Set Name',
  keywordId: 'Keyword ID',
  phrase: 'Phrase',
  weight: 'Weight',
  tags: 'Tags',
  isActive: 'Is Active',
  bodySynced: 'Body Synced',
  textPreview: 'Text Preview',
} as const

const MEETING_RECORD_TYPE = {
  transcript: 'transcript',
  keywordSet: 'keyword_set',
  keyword: 'keyword',
} as const

const MEETING_STATUS_VALUES = new Set(['queued', 'submitted', 'processing', 'completed', 'failed', 'error'])

function normalizeMeetingStatus(value: string | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'processing'
  return MEETING_STATUS_VALUES.has(normalized) ? normalized : 'processing'
}

type MeetingNotionContext = {
  api: NotionApi
  databaseId: string
  titlePropertyName: string
  datePropertyName: string
}

type MeetingNotionTranscriptRow = {
  pageId: string
  id: string
  meetingId: string
  meetingDate: string | null
  assemblyId: string | null
  status: string
  createdAt: number
  updatedAt: number
  title: string
  audioKey: string
  speakerMap: Record<string, string>
  keywordsUsed: string[]
  errorMessage: string | null
  bodySynced: boolean
  textPreview: string
}

function getMeetingNotionDbId(env: Env): string {
  const configured = asString(env.NOTION_MEETING_DB_ID)
  if (configured && normalizeNotionId(configured) !== normalizeNotionId(FIXED_MEETING_NOTION_DB_ID)) {
    throw new Error('notion_meeting_db_id_mismatch')
  }
  return FIXED_MEETING_NOTION_DB_ID
}

function toNotionRichText(text: string, maxChars = 6000): Array<{ type: 'text'; text: { content: string } }> {
  const trimmed = text.trim()
  if (!trimmed) return []
  const safe = trimmed.slice(0, maxChars)
  const chunks: Array<{ type: 'text'; text: { content: string } }> = []
  for (let i = 0; i < safe.length; i += NOTION_RICH_TEXT_CHUNK) {
    chunks.push({ type: 'text', text: { content: safe.slice(i, i + NOTION_RICH_TEXT_CHUNK) } })
  }
  return chunks
}

function notionRichTextValue(text: string, maxChars = 6000): { rich_text: Array<{ type: 'text'; text: { content: string } }> } {
  return { rich_text: toNotionRichText(text, maxChars) }
}

function notionReadRichText(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  const rich = Array.isArray(value.rich_text) ? value.rich_text : []
  return rich
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const item = entry as Record<string, unknown>
      return asString(item.plain_text) ?? ''
    })
    .join('')
    .trim()
}

function notionReadTitle(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  const title = Array.isArray(value.title) ? value.title : []
  return title
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const item = entry as Record<string, unknown>
      return asString(item.plain_text) ?? ''
    })
    .join('')
    .trim()
}

function notionReadSelect(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  if (!value.select || typeof value.select !== 'object') return ''
  return asString((value.select as Record<string, unknown>).name) ?? ''
}

function notionReadNumber(prop: unknown): number {
  if (!prop || typeof prop !== 'object') return 0
  const value = prop as Record<string, unknown>
  const n = value.number
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function notionReadCheckbox(prop: unknown): boolean {
  if (!prop || typeof prop !== 'object') return false
  const value = prop as Record<string, unknown>
  return Boolean(value.checkbox)
}

function notionReadDateStart(prop: unknown): string | null {
  if (!prop || typeof prop !== 'object') return null
  const value = prop as Record<string, unknown>
  if (!value.date || typeof value.date !== 'object') return null
  const start = asString((value.date as Record<string, unknown>).start)
  if (!start) return null
  if (ISO_DATE_RE.test(start)) return start
  return null
}

function safeParseSpeakerMap(value: string): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, string> = {}
    for (const [key, item] of Object.entries(parsed)) {
      const speaker = asString(key)
      const name = asString(typeof item === 'string' ? item : undefined)
      if (!speaker || !name) continue
      map[speaker] = name
    }
    return map
  } catch {
    return {}
  }
}

function safeParseStringArray(value: string): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  } catch {
    return []
  }
}

function resolveMeetingDatePropertyName(properties: Record<string, unknown>): string {
  const aliases = [MEETING_NOTION_FIELD.date, '일자', 'Date']
  for (const name of aliases) {
    const prop = properties[name]
    if (!prop || typeof prop !== 'object') continue
    if ((prop as Record<string, unknown>).type === 'date') return name
  }
  const firstDate = Object.entries(properties).find(([, prop]) => {
    if (!prop || typeof prop !== 'object') return false
    return (prop as Record<string, unknown>).type === 'date'
  })?.[0]
  return firstDate || MEETING_NOTION_FIELD.date
}

async function ensureMeetingNotionSchema(env: Env): Promise<MeetingNotionContext> {
  const databaseId = getMeetingNotionDbId(env)
  const now = Date.now()
  if (
    meetingNotionSchemaCache &&
    meetingNotionSchemaCache.databaseId === databaseId &&
    now - meetingNotionSchemaCache.checkedAt < MEETING_NOTION_SCHEMA_CACHE_MS
  ) {
    return {
      api: new NotionApi(env),
      databaseId,
      titlePropertyName: meetingNotionSchemaCache.titlePropertyName,
      datePropertyName: meetingNotionSchemaCache.datePropertyName,
    }
  }

  const api = new NotionApi(env)
  const db = await api.retrieveDatabase(databaseId)
  const properties = (db?.properties ?? {}) as Record<string, unknown>
  const titlePropertyName =
    Object.entries(properties).find(([, prop]) => {
      if (!prop || typeof prop !== 'object') return false
      return (prop as Record<string, unknown>).type === 'title'
    })?.[0] ?? ''
  if (!titlePropertyName) throw new Error('notion_meeting_db_title_property_missing')
  const datePropertyName = resolveMeetingDatePropertyName(properties)

  const patch: Record<string, unknown> = {}
  const ensure = (name: string, spec: Record<string, unknown>): void => {
    if (!properties[name]) patch[name] = spec
  }

  ensure(MEETING_NOTION_FIELD.recordType, {
    select: {
      options: [{ name: MEETING_RECORD_TYPE.transcript }, { name: MEETING_RECORD_TYPE.keywordSet }, { name: MEETING_RECORD_TYPE.keyword }],
    },
  })
  ensure(MEETING_NOTION_FIELD.transcriptId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.meetingId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.assemblyId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.status, {
    select: {
      options: [{ name: 'queued' }, { name: 'submitted' }, { name: 'processing' }, { name: 'completed' }, { name: 'failed' }, { name: 'error' }],
    },
  })
  ensure(MEETING_NOTION_FIELD.audioKey, { rich_text: {} })
  ensure(datePropertyName, { date: {} })
  ensure(MEETING_NOTION_FIELD.speakerMapJson, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordsUsedJson, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.errorMessage, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.createdAt, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.updatedAt, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.minSpeakers, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.maxSpeakers, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.keywordSetId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordSetName, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.phrase, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.weight, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.tags, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.isActive, { checkbox: {} })
  ensure(MEETING_NOTION_FIELD.bodySynced, { checkbox: {} })
  ensure(MEETING_NOTION_FIELD.textPreview, { rich_text: {} })

  if (Object.keys(patch).length > 0) {
    await api.updateDatabase(databaseId, { properties: patch })
  }

  meetingNotionSchemaCache = {
    databaseId,
    titlePropertyName,
    datePropertyName,
    checkedAt: now,
  }

  return { api, databaseId, titlePropertyName, datePropertyName }
}

async function queryAllMeetingNotionPages(ctx: MeetingNotionContext, input: Record<string, unknown>): Promise<any[]> {
  const pages: any[] = []
  let cursor: string | undefined
  for (let i = 0; i < 50; i += 1) {
    const payload: Record<string, unknown> = { ...input, page_size: 100 }
    if (cursor) payload.start_cursor = cursor
    const result = await ctx.api.queryDatabase(ctx.databaseId, payload)
    const rows = Array.isArray(result?.results) ? result.results : []
    pages.push(...rows.filter((page) => page && !page.archived && !page.in_trash))
    cursor = result?.has_more ? asString(result?.next_cursor) : undefined
    if (!cursor) break
  }
  return pages
}

function transcriptFilterById(transcriptId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.transcript } },
      { property: MEETING_NOTION_FIELD.transcriptId, rich_text: { equals: transcriptId } },
    ],
  }
}

function transcriptFilterByAssemblyId(assemblyId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.transcript } },
      { property: MEETING_NOTION_FIELD.assemblyId, rich_text: { equals: assemblyId } },
    ],
  }
}

function mapMeetingNotionTranscriptPage(page: any, titlePropertyName: string, datePropertyName: string): MeetingNotionTranscriptRow {
  const props = (page?.properties ?? {}) as Record<string, unknown>
  const transcriptId = notionReadRichText(props[MEETING_NOTION_FIELD.transcriptId]) || asString(page?.id) || ''
  return {
    pageId: asString(page?.id) ?? '',
    id: transcriptId,
    meetingId: notionReadRichText(props[MEETING_NOTION_FIELD.meetingId]),
    meetingDate: notionReadDateStart(props[datePropertyName]),
    assemblyId: notionReadRichText(props[MEETING_NOTION_FIELD.assemblyId]) || null,
    status: notionReadSelect(props[MEETING_NOTION_FIELD.status]) || 'queued',
    createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
    updatedAt: notionReadNumber(props[MEETING_NOTION_FIELD.updatedAt]),
    title: notionReadTitle(props[titlePropertyName]) || transcriptId || 'Untitled meeting',
    audioKey: notionReadRichText(props[MEETING_NOTION_FIELD.audioKey]),
    speakerMap: safeParseSpeakerMap(notionReadRichText(props[MEETING_NOTION_FIELD.speakerMapJson])),
    keywordsUsed: safeParseStringArray(notionReadRichText(props[MEETING_NOTION_FIELD.keywordsUsedJson])),
    errorMessage: notionReadRichText(props[MEETING_NOTION_FIELD.errorMessage]) || null,
    bodySynced: notionReadCheckbox(props[MEETING_NOTION_FIELD.bodySynced]),
    textPreview: notionReadRichText(props[MEETING_NOTION_FIELD.textPreview]),
  }
}

async function getMeetingNotionTranscriptById(env: Env, transcriptId: string): Promise<{ row: MeetingNotionTranscriptRow; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pages = await queryAllMeetingNotionPages(ctx, { filter: transcriptFilterById(transcriptId) })
  if (pages.length === 0) return null
  return { row: mapMeetingNotionTranscriptPage(pages[0], ctx.titlePropertyName, ctx.datePropertyName), ctx }
}

async function getMeetingNotionTranscriptByAssemblyId(env: Env, assemblyId: string): Promise<{ row: MeetingNotionTranscriptRow; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pages = await queryAllMeetingNotionPages(ctx, { filter: transcriptFilterByAssemblyId(assemblyId) })
  if (pages.length === 0) return null
  return { row: mapMeetingNotionTranscriptPage(pages[0], ctx.titlePropertyName, ctx.datePropertyName), ctx }
}

async function listMeetingNotionTranscripts(env: Env, limit: number): Promise<MeetingNotionTranscriptRow[]> {
  const ctx = await ensureMeetingNotionSchema(env)
  const result = await ctx.api.queryDatabase(ctx.databaseId, {
    filter: {
      property: MEETING_NOTION_FIELD.recordType,
      select: { equals: MEETING_RECORD_TYPE.transcript },
    },
    sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
    page_size: Math.max(1, Math.min(100, limit)),
  })
  const pages = Array.isArray(result?.results) ? result.results : []
  return pages
    .filter((page) => page && !page.archived && !page.in_trash)
    .map((page) => mapMeetingNotionTranscriptPage(page, ctx.titlePropertyName, ctx.datePropertyName))
}

function keywordSetFilterById(setId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keywordSet } },
      { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
    ],
  }
}

function keywordFilterBySetId(setId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
      { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
    ],
  }
}

function keywordFilterById(keywordId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
      { property: MEETING_NOTION_FIELD.keywordId, rich_text: { equals: keywordId } },
    ],
  }
}

async function findMeetingNotionKeywordSetPageById(
  env: Env,
  setId: string,
): Promise<{ page: any; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pages = await queryAllMeetingNotionPages(ctx, { filter: keywordSetFilterById(setId) })
  if (pages.length > 0) return { page: pages[0], ctx }
  try {
    const page = await ctx.api.retrievePage(setId)
    if (!page || page.archived || page.in_trash) return null
    const props = (page.properties ?? {}) as Record<string, unknown>
    const recordType = notionReadSelect(props[MEETING_NOTION_FIELD.recordType])
    if (recordType !== MEETING_RECORD_TYPE.keywordSet) return null
    return { page, ctx }
  } catch {
    return null
  }
}

async function findMeetingNotionKeywordPageById(
  env: Env,
  keywordId: string,
): Promise<{ page: any; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pages = await queryAllMeetingNotionPages(ctx, { filter: keywordFilterById(keywordId) })
  if (pages.length > 0) return { page: pages[0], ctx }
  try {
    const page = await ctx.api.retrievePage(keywordId)
    if (!page || page.archived || page.in_trash) return null
    const props = (page.properties ?? {}) as Record<string, unknown>
    const recordType = notionReadSelect(props[MEETING_NOTION_FIELD.recordType])
    if (recordType !== MEETING_RECORD_TYPE.keyword) return null
    return { page, ctx }
  } catch {
    return null
  }
}

function paragraphBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK) },
  }
}

function headingBlock(level: 'heading_2' | 'heading_3', text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: level,
    [level]: { rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK) },
  }
}

function bulletBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK) },
  }
}

function buildMeetingSummarySource(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
  rawText: string,
): string {
  const lines: string[] = []
  for (const row of utterances) {
    const speaker = asString(speakerMap[row.speaker])?.trim() || row.speaker
    const text = row.text.trim()
    if (!text) continue
    lines.push(`${speaker}: ${text}`)
    if (lines.join('\n').length >= MAX_SUMMARY_SOURCE_CHARS) break
  }

  const fromUtterances = lines.join('\n').trim()
  if (fromUtterances) return fromUtterances.slice(0, MAX_SUMMARY_SOURCE_CHARS)
  return rawText.trim().slice(0, MAX_SUMMARY_SOURCE_CHARS)
}

function extractOpenAiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  const direct = asString(obj.output_text)
  if (direct) return direct

  const output = Array.isArray(obj.output) ? obj.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]) : []
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const text = asString((block as Record<string, unknown>).text)
      if (text) chunks.push(text)
    }
  }
  return chunks.join('\n').trim()
}

async function generateMeetingSummary(
  env: Env,
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
  rawText: string,
): Promise<string | null> {
  const apiKey = asString(env.OPENAI_API_KEY)
  if (!apiKey) return null

  const source = buildMeetingSummarySource(utterances, speakerMap, rawText)
  if (!source) return null

  const model = asString(env.OPENAI_SUMMARY_MODEL) ?? DEFAULT_OPENAI_SUMMARY_MODEL
  const systemPrompt =
    '당신은 한국어 회의록 요약 보조 도우미다. 핵심 결정/이슈/액션아이템 중심으로 간결하게 정리한다.'
  const userPrompt = [
    '다음 회의 발화를 요약해 주세요.',
    '- 형식: 한국어',
    '- 섹션: 핵심 논의 / 결정사항 / 액션아이템',
    '- 액션아이템은 담당자(알 수 없으면 미지정)와 기한(없으면 미정) 포함',
    '- 불필요한 장식 문구 금지',
    '',
    source,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
        { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
      ],
      max_output_tokens: 700,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`openai_summary_failed:${response.status}:${detail.slice(0, 200)}`)
  }

  const payload = (await response.json()) as unknown
  const summary = extractOpenAiResponseText(payload)
  if (!summary) {
    throw new Error('openai_summary_empty')
  }
  return summary.slice(0, 6000)
}

function findUnmappedSpeakers(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
): string[] {
  const uniqueSpeakers = Array.from(new Set(utterances.map((row) => row.speaker).filter(Boolean)))
  return uniqueSpeakers.filter((speakerLabel) => {
    const mapped = asString(speakerMap[speakerLabel])?.trim()
    return !mapped
  })
}

function buildTranscriptBodyBlocks(
  detail: Record<string, unknown>,
  speakerMap: Record<string, string>,
  summaryText: string | null,
): Record<string, unknown>[] {
  const status = asString(detail.status) ?? 'completed'
  const utterances = normalizeUtterances(detail.utterances)
  const blocks: Record<string, unknown>[] = []
  blocks.push(headingBlock('heading_2', '요약'))
  if (summaryText && summaryText.trim()) {
    const paragraphs = summaryText
      .split(/\n{2,}/g)
      .map((entry) => entry.trim())
      .filter(Boolean)
    if (paragraphs.length === 0) {
      blocks.push(paragraphBlock(summaryText))
    } else {
      for (const paragraph of paragraphs.slice(0, 12)) {
        blocks.push(paragraphBlock(paragraph))
      }
    }
  } else {
    blocks.push(paragraphBlock('요약 생성 전입니다. GPT-5 연동 후 이 섹션에 자동 요약을 기록합니다.'))
  }
  blocks.push(headingBlock('heading_2', '전문'))
  blocks.push(paragraphBlock(`status=${status} generated_at=${new Date().toISOString()}`))

  if (utterances.length > 0) {
    blocks.push(headingBlock('heading_3', `화자별 발화 (${Math.min(utterances.length, MAX_TRANSCRIPT_BODY_UTTERANCE_BLOCKS)}/${utterances.length})`))
    for (const row of utterances.slice(0, MAX_TRANSCRIPT_BODY_UTTERANCE_BLOCKS)) {
      const displaySpeaker = asString(speakerMap[row.speaker])?.trim() || row.speaker
      blocks.push(bulletBlock(`${displaySpeaker}: ${row.text}`))
    }
  } else {
    blocks.push(paragraphBlock('화자별 발화가 아직 없습니다.'))
  }
  return blocks
}

async function appendBlocksInChunks(api: NotionApi, pageId: string, blocks: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < blocks.length; i += 80) {
    await api.appendBlockChildren(pageId, blocks.slice(i, i + 80))
  }
}

async function clearPageBlocks(api: NotionApi, pageId: string): Promise<void> {
  let cursor: string | undefined
  do {
    const response = await api.listBlockChildren(pageId, cursor)
    const blocks = Array.isArray(response?.results) ? response.results : []
    for (const block of blocks) {
      const blockId = asString((block as Record<string, unknown>)?.id)
      if (!blockId) continue
      await api.updateBlock(blockId, { archived: true })
    }
    const nextCursor = asString(response?.next_cursor)
    cursor = response?.has_more && nextCursor ? nextCursor : undefined
  } while (cursor)
}

function extractFilenameFromAudioKey(audioKey: string): string {
  const raw = audioKey.split('/').filter(Boolean).pop() ?? 'recording.m4a'
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

async function buildMeetingAudioFileBlock(api: NotionApi, env: Env, audioKey: string): Promise<Record<string, unknown>> {
  const bucket = getMeetingAudioBucket(env)
  const object = await bucket.get(audioKey)
  const resolved = await readR2ObjectAsArrayBuffer(object)
  if (!resolved) {
    throw new Error('audio_not_found')
  }
  if (resolved.bytes.byteLength > MAX_NOTION_FILE_UPLOAD_BYTES) {
    throw new Error('notion_file_too_large')
  }

  const filename = extractFilenameFromAudioKey(audioKey)
  const contentType = resolved.contentType ?? inferAudioContentType(audioKey)
  const created = await api.createFileUpload(filename, contentType)
  const fileUploadId = asString((created as Record<string, unknown>)?.id)
  if (!fileUploadId) {
    throw new Error('notion_file_upload_create_failed')
  }

  await api.sendFileUpload(fileUploadId, resolved.bytes, filename, contentType)
  const uploaded = await api.retrieveFileUpload(fileUploadId)
  const status = asString((uploaded as Record<string, unknown>)?.status)
  if (status && status !== 'uploaded') {
    throw new Error('notion_file_upload_send_failed')
  }

  return {
    object: 'block',
    type: 'file',
    file: {
      type: 'file_upload',
      file_upload: { id: fileUploadId },
      caption: toNotionRichText('원본 녹음 파일', 120),
    },
  }
}

async function listNotionKeywordSets(
  env: Env,
): Promise<
  Array<{
    id: string
    name: string
    isActive: boolean
    createdAt: number
    keywordCount: number
  }>
> {
  const ctx = await ensureMeetingNotionSchema(env)
  const [setPages, keywordPages] = await Promise.all([
    queryAllMeetingNotionPages(ctx, {
      filter: { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keywordSet } },
      sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
    }),
    queryAllMeetingNotionPages(ctx, {
      filter: { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
    }),
  ])

  const counts = new Map<string, number>()
  for (const page of keywordPages) {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const setId = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId])
    if (!setId) continue
    counts.set(setId, (counts.get(setId) ?? 0) + 1)
  }

  return setPages.map((page) => {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const id = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId]) || asString(page?.id) || ''
    const name = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetName]) || notionReadTitle(props[ctx.titlePropertyName]) || 'Untitled set'
    return {
      id,
      name,
      isActive: notionReadCheckbox(props[MEETING_NOTION_FIELD.isActive]),
      createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
      keywordCount: counts.get(id) ?? 0,
    }
  })
}

async function listNotionKeywords(
  env: Env,
  setId?: string,
): Promise<
  Array<{
    id: string
    setId: string
    phrase: string
    weight: number | null
    tags: string | null
    createdAt: number
  }>
> {
  const ctx = await ensureMeetingNotionSchema(env)
  const filter = setId
    ? {
        and: [
          { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
          { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
        ],
      }
    : { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } }
  const pages = await queryAllMeetingNotionPages(ctx, {
    filter,
    sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
  })

  return pages.map((page) => {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const id = notionReadRichText(props[MEETING_NOTION_FIELD.keywordId]) || asString(page?.id) || ''
    const setIdValue = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId]) || ''
    const phrase = notionReadRichText(props[MEETING_NOTION_FIELD.phrase]) || notionReadTitle(props[ctx.titlePropertyName]) || ''
    const weight = notionReadNumber(props[MEETING_NOTION_FIELD.weight])
    return {
      id,
      setId: setIdValue,
      phrase,
      weight: Number.isFinite(weight) ? weight : null,
      tags: notionReadRichText(props[MEETING_NOTION_FIELD.tags]) || null,
      createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
    }
  })
}

async function readKeywordPhrasesBySetIdFromNotion(
  env: Env,
  setId: string | null,
): Promise<{ phrases: string[]; truncated: boolean; total: number }> {
  if (!setId) return { phrases: [], truncated: false, total: 0 }
  const keywords = await listNotionKeywords(env, setId)
  const keywordLimit = parseMeetingKeywordLimit(env)
  const phrases = keywords.map((entry) => entry.phrase.trim()).filter(Boolean)
  const uniquePhrases = Array.from(new Set(phrases))
  return {
    phrases: uniquePhrases.slice(0, keywordLimit),
    truncated: uniquePhrases.length > keywordLimit,
    total: uniquePhrases.length,
  }
}

async function updateMeetingNotionTranscriptFromAssembly(
  env: Env,
  assemblyId: string,
): Promise<{ status: string; utteranceCount: number; unmappedSpeakers: string[]; audioFileAttached: boolean }> {
  const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
  if (!found) throw new Error('transcript_not_found')
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = normalizeMeetingStatus(asString(detail.status) ?? 'processing')
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)
  const inferredMeetingDate =
    found.row.meetingDate ||
    parseMeetingTitleMetadata(stripMeetingUploadKeyPrefix(extractFilenameFromAudioKey(found.row.audioKey))).meetingDate

  const statusPatch: Record<string, unknown> = {
    [MEETING_NOTION_FIELD.status]: { select: { name: status } },
    [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
    [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(asString(detail.error) ?? '', 1200),
    [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
  }
  if (inferredMeetingDate) {
    statusPatch[found.ctx.datePropertyName] = { date: { start: inferredMeetingDate } }
  }

  await found.ctx.api.updatePage(found.row.pageId, {
    properties: statusPatch,
  })

  if (status !== 'completed') {
    throw new Error('transcript_not_completed')
  }

  const unmappedSpeakers = findUnmappedSpeakers(utterances, found.row.speakerMap)
  if (unmappedSpeakers.length > 0) {
    throw new Error(`speaker_mapping_incomplete:${unmappedSpeakers.join(',')}`)
  }

  let summaryText: string | null = null
  try {
    summaryText = await generateMeetingSummary(env, utterances, found.row.speakerMap, text)
  } catch {}

  const audioBlock = await buildMeetingAudioFileBlock(found.ctx.api, env, found.row.audioKey)
  const blocks = [audioBlock, ...buildTranscriptBodyBlocks(detail, found.row.speakerMap, summaryText)]
  await clearPageBlocks(found.ctx.api, found.row.pageId)
  if (blocks.length > 0) {
    await appendBlocksInChunks(found.ctx.api, found.row.pageId, blocks)
  }
  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
      [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
    },
  })
  return {
    status,
    utteranceCount: utterances.length,
    unmappedSpeakers: [],
    audioFileAttached: true,
  }
}

function isMeetingRoutePath(path: string): boolean {
  return (
    path === '/uploads/presign' ||
    path === '/uploads/direct' ||
    path === '/uploads/fetch' ||
    path === '/transcripts' ||
    path === '/keyword-sets' ||
    path === '/keywords' ||
    path === '/assemblyai/webhook' ||
    /^\/transcripts\/[^/]+$/.test(path) ||
    /^\/transcripts\/[^/]+\/speakers$/.test(path) ||
    /^\/transcripts\/[^/]+\/publish$/.test(path)
  )
}

function isMeetingPreAuthRoute(method: string, path: string): boolean {
  return (
    (method === 'POST' && path === '/assemblyai/webhook') ||
    (method === 'PUT' && path === '/uploads/direct') ||
    (method === 'GET' && path === '/uploads/fetch')
  )
}

async function handleMeetingRoutesNotion(
  request: Request,
  path: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  respond: {
    json: (body: unknown, status: number) => Response
    ok: (body: unknown) => Response
  },
): Promise<Response | null> {
  if (!isMeetingRoutePath(path)) {
    return null
  }

  const toErrorStatus = (message: string): number => {
    if (
      message.includes('_required') ||
      message.includes('_invalid') ||
      message.includes('speaker_range_invalid') ||
      message.includes('mappings_required') ||
      message.includes('speaker_mapping_incomplete')
    ) {
      return 400
    }
    if (message.includes('notion_file_too_large')) return 413
    if (message.includes('notion_file_upload_')) return 502
    if (message.includes('transcript_not_completed')) return 409
    if (message.includes('not_found') || message.includes('object_not_found')) return 404
    if (message.includes('assemblyai_http_')) return 502
    if (message.includes('notion_http_')) return 502
    return 500
  }
  const fail = (error: unknown): Response => {
    const message = error instanceof Error && error.message ? error.message : 'unknown_error'
    return respond.json({ ok: false, error: message }, toErrorStatus(message))
  }

  const transcriptMatch = path.match(/^\/transcripts\/([^/]+)$/)
  const speakerMatch = path.match(/^\/transcripts\/([^/]+)\/speakers$/)
  const publishMatch = path.match(/^\/transcripts\/([^/]+)\/publish$/)

  try {
    if (request.method === 'POST' && path === '/uploads/presign') {
      const payload = parsePatchBody(await readJsonBody(request))
      const filename = asString(payload.filename) ?? asString(payload.name) ?? 'recording.m4a'
      const contentType = asString(payload.contentType) ?? asString(payload.mimeType) ?? 'audio/m4a'
      const key = buildMeetingAudioKey(filename)
      const upload = await resolveMeetingUploadTarget(env, url, key, contentType)
      return respond.ok({
        ok: true,
        key,
        putUrl: upload.url,
        requiredHeaders: upload.requiredHeaders ?? {},
        uploadMode: upload.uploadMode,
      })
    }

    if (request.method === 'PUT' && path === '/uploads/direct') {
      const key = asString(url.searchParams.get('key'))
      if (!key) return respond.json({ ok: false, error: 'key_required' }, 400)
      if (!isValidMeetingAudioKey(key)) return respond.json({ ok: false, error: 'key_invalid' }, 400)

      const token = asString(url.searchParams.get('token'))
      const validToken = await verifyMeetingUploadToken(env, token, { key, method: 'PUT' })
      if (!validToken) return respond.json({ ok: false, error: 'upload_token_invalid' }, 401)

      const body = await request.arrayBuffer()
      if (!body || body.byteLength <= 0) {
        return respond.json({ ok: false, error: 'upload_body_required' }, 400)
      }
      const contentType = asString(request.headers.get('content-type')) ?? inferAudioContentType(key)
      const bucket = getMeetingAudioBucket(env)
      await bucket.put(key, body, {
        httpMetadata: {
          contentType,
        },
      })
      return respond.ok({
        ok: true,
        key,
        bytes: body.byteLength,
        uploadMode: 'worker_direct',
      })
    }

    if (request.method === 'GET' && path === '/uploads/fetch') {
      const key = asString(url.searchParams.get('key'))
      if (!key) return respond.json({ ok: false, error: 'key_required' }, 400)
      if (!isValidMeetingAudioKey(key)) return respond.json({ ok: false, error: 'key_invalid' }, 400)

      const token = asString(url.searchParams.get('token'))
      const validToken = await verifyMeetingUploadToken(env, token, { key, method: 'GET' })
      if (!validToken) return respond.json({ ok: false, error: 'upload_token_invalid' }, 401)

      const bucket = getMeetingAudioBucket(env)
      const object = await bucket.get(key)
      const resolved = await readR2ObjectForResponse(object)
      if (!resolved) {
        return respond.json({ ok: false, error: 'audio_not_found' }, 404)
      }
      return new Response(resolved.body, {
        status: 200,
        headers: {
          'Content-Type': resolved.contentType ?? inferAudioContentType(key),
          'Cache-Control': 'private, max-age=300',
        },
      })
    }

    if (request.method === 'POST' && path === '/transcripts') {
      const payload = parseMeetingTranscriptBody(await readJsonBody(request))
      const keywordInfo = await readKeywordPhrasesBySetIdFromNotion(env, payload.keywordSetId)
      const audioUrl = await resolveMeetingFetchUrl(env, url, payload.key)
      const notionCtx = await ensureMeetingNotionSchema(env)

      const meetingId = crypto.randomUUID()
      const transcriptId = crypto.randomUUID()
      const now = Date.now()
      let keywordSetName = ''
      if (payload.keywordSetId) {
        const keywordSet = await findMeetingNotionKeywordSetPageById(env, payload.keywordSetId)
        if (keywordSet) {
          const props = (keywordSet.page?.properties ?? {}) as Record<string, unknown>
          keywordSetName =
            notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetName]) ||
            notionReadTitle(props[keywordSet.ctx.titlePropertyName]) ||
            ''
        }
      }

      const createdPage = await notionCtx.api.createPage({
        parent: { database_id: notionCtx.databaseId },
        properties: {
          [notionCtx.titlePropertyName]: { title: toNotionRichText(payload.title || transcriptId, 300) },
          [notionCtx.datePropertyName]: payload.meetingDate ? { date: { start: payload.meetingDate } } : { date: null },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.transcript } },
          [MEETING_NOTION_FIELD.transcriptId]: notionRichTextValue(transcriptId, 200),
          [MEETING_NOTION_FIELD.meetingId]: notionRichTextValue(meetingId, 200),
          [MEETING_NOTION_FIELD.status]: { select: { name: 'queued' } },
          [MEETING_NOTION_FIELD.audioKey]: notionRichTextValue(payload.key, 600),
          [MEETING_NOTION_FIELD.speakerMapJson]: notionRichTextValue('{}', 2000),
          [MEETING_NOTION_FIELD.keywordsUsedJson]: notionRichTextValue(JSON.stringify(keywordInfo.phrases), 6000),
          [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('', 200),
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
          [MEETING_NOTION_FIELD.minSpeakers]: { number: payload.minSpeakers },
          [MEETING_NOTION_FIELD.maxSpeakers]: { number: payload.maxSpeakers },
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(payload.keywordSetId ?? '', 200),
          [MEETING_NOTION_FIELD.keywordSetName]: notionRichTextValue(keywordSetName, 500),
          [MEETING_NOTION_FIELD.bodySynced]: { checkbox: false },
          [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue('', 200),
        },
      })

      const transcriptPageId = asString(createdPage?.id)
      if (!transcriptPageId) {
        throw new Error('notion_transcript_create_failed_[UNKNOWN]')
      }

      const webhookUrl = asString(env.ASSEMBLYAI_WEBHOOK_URL) ?? `${url.origin}/api/assemblyai/webhook`
      const webhookSecret = getAssemblyWebhookSecret(env)
      const assemblyPayload: Record<string, unknown> = {
        audio_url: audioUrl,
        language_code: 'ko',
        speaker_labels: true,
        webhook_url: webhookUrl,
        webhook_auth_header_name: 'x-assemblyai-webhook-secret',
        webhook_auth_header_value: webhookSecret,
      }
      if (keywordInfo.phrases.length > 0) {
        assemblyPayload.word_boost = keywordInfo.phrases
      }
      // [UNKNOWN] AssemblyAI diarization range field compatibility may differ by API version.
      assemblyPayload.speaker_options = {
        min_speakers: payload.minSpeakers,
        max_speakers: payload.maxSpeakers,
      }

      let created: Record<string, unknown>
      try {
        created = await assemblyRequest<Record<string, unknown>>(env, '/transcript', {
          method: 'POST',
          body: JSON.stringify(assemblyPayload),
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'assembly_request_failed'
        await notionCtx.api.updatePage(transcriptPageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: 'failed' } },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(message.slice(0, 1200), 1200),
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
          },
        })
        throw error
      }

      const assemblyId = asString(created.id)
      if (!assemblyId) {
        await notionCtx.api.updatePage(transcriptPageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: 'failed' } },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('assembly_transcript_id_missing_[UNKNOWN]', 1200),
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
          },
        })
        throw new Error('assembly_transcript_id_missing_[UNKNOWN]')
      }
      const status = normalizeMeetingStatus(asString(created.status))

      await notionCtx.api.updatePage(transcriptPageId, {
        properties: {
          [MEETING_NOTION_FIELD.assemblyId]: notionRichTextValue(assemblyId, 200),
          [MEETING_NOTION_FIELD.status]: { select: { name: status } },
          [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('', 1200),
          [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
        },
      })

      return respond.json(
        {
          ok: true,
          transcriptId,
          meetingId,
          assemblyId,
          keywordsUsed: keywordInfo.phrases,
          keywordsTruncated: keywordInfo.truncated,
          keywordsTotal: keywordInfo.total,
        },
        201,
      )
    }

    if (request.method === 'GET' && path === '/transcripts') {
      const limit = parseBoundedLimit(asString(url.searchParams.get('limit')), 20, TRANSCRIPT_POLL_LIMIT)
      const rows = await listMeetingNotionTranscripts(env, limit)
      return respond.ok({
        ok: true,
        transcripts: rows.map((row) => ({
          id: row.id,
          meetingId: row.meetingId,
          meetingDate: row.meetingDate,
          assemblyId: row.assemblyId,
          status: row.status,
          bodySynced: row.bodySynced,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          title: row.title,
          audioKey: row.audioKey,
        })),
      })
    }

    if (request.method === 'GET' && transcriptMatch) {
      const transcriptId = decodeURIComponent(transcriptMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      let status = found.row.status
      let text = found.row.textPreview
      let utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }> = []
      let errorMessage = found.row.errorMessage
      let rawJson: string | null = null

      if (found.row.assemblyId) {
        try {
          const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(found.row.assemblyId)}`)
          rawJson = JSON.stringify(detail)
          status = normalizeMeetingStatus(asString(detail.status) ?? found.row.status)
          text = asString(detail.text) ?? found.row.textPreview
          utterances = normalizeUtterances(detail.utterances)
          errorMessage = asString(detail.error) ?? found.row.errorMessage

          if (
            status !== found.row.status ||
            text.slice(0, 4000) !== found.row.textPreview ||
            (errorMessage ?? '') !== (found.row.errorMessage ?? '')
          ) {
            ctx.waitUntil(
              found.ctx.api.updatePage(found.row.pageId, {
                properties: {
                  [MEETING_NOTION_FIELD.status]: { select: { name: status } },
                  [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
                  [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(errorMessage ?? '', 1200),
                  [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
                },
              }),
            )
          }
        } catch {
          // Keep last synced Notion state when AssemblyAI detail fetch fails.
        }
      }

      const speakerMap = found.row.speakerMap
      const mappedUtterances = utterances.map((entry) => ({
        ...entry,
        displaySpeaker: speakerMap[entry.speaker] ?? entry.speaker,
      }))

      return respond.ok({
        ok: true,
        transcript: {
          id: found.row.id,
          meetingId: found.row.meetingId,
          meetingDate: found.row.meetingDate,
          assemblyId: found.row.assemblyId,
          status,
          bodySynced: found.row.bodySynced,
          text,
          rawJson,
          utterances,
          utterancesMapped: mappedUtterances,
          speakerMap,
          keywordsUsed: found.row.keywordsUsed,
          errorMessage,
          createdAt: found.row.createdAt,
          updatedAt: found.row.updatedAt,
          meeting: {
            title: found.row.title,
            audioKey: found.row.audioKey,
          },
        },
      })
    }

    if ((request.method === 'POST' || request.method === 'PATCH') && speakerMatch) {
      const transcriptId = decodeURIComponent(speakerMatch[1])
      const mappings = parseSpeakerMappingsBody(await readJsonBody(request))
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      const speakerMap = { ...found.row.speakerMap }
      for (const entry of mappings) {
        speakerMap[entry.speakerLabel] = entry.displayName
      }
      await found.ctx.api.updatePage(found.row.pageId, {
        properties: {
          [MEETING_NOTION_FIELD.speakerMapJson]: notionRichTextValue(JSON.stringify(speakerMap), 6000),
          [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
        },
      })
      return respond.ok({
        ok: true,
        transcriptId,
        speakerMap,
      })
    }

    if (request.method === 'POST' && publishMatch) {
      const transcriptId = decodeURIComponent(publishMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      if (!found.row.assemblyId) {
        return respond.json({ ok: false, error: 'assembly_id_missing' }, 400)
      }
      const published = await updateMeetingNotionTranscriptFromAssembly(env, found.row.assemblyId)
      return respond.ok({
        ok: true,
        transcriptId,
        assemblyId: found.row.assemblyId,
        status: published.status,
        utteranceCount: published.utteranceCount,
        audioFileAttached: published.audioFileAttached,
      })
    }

    if (request.method === 'GET' && path === '/keyword-sets') {
      const sets = await listNotionKeywordSets(env)
      return respond.ok({
        ok: true,
        sets,
      })
    }

    if (request.method === 'POST' && path === '/keyword-sets') {
      const payload = parseKeywordSetCreateBody(await readJsonBody(request))
      const notionCtx = await ensureMeetingNotionSchema(env)
      const id = crypto.randomUUID()
      const now = Date.now()
      await notionCtx.api.createPage({
        parent: { database_id: notionCtx.databaseId },
        properties: {
          [notionCtx.titlePropertyName]: { title: toNotionRichText(payload.name, 120) },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.keywordSet } },
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(id, 200),
          [MEETING_NOTION_FIELD.keywordSetName]: notionRichTextValue(payload.name, 300),
          [MEETING_NOTION_FIELD.isActive]: { checkbox: payload.isActive },
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
        },
      })
      return respond.json(
        {
          ok: true,
          set: {
            id,
            name: payload.name,
            isActive: payload.isActive,
            createdAt: now,
            keywordCount: 0,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keyword-sets') {
      const payload = parseKeywordSetPatchBody(await readJsonBody(request))
      const found = await findMeetingNotionKeywordSetPageById(env, payload.id)
      if (!found) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      const patch: Record<string, unknown> = {
        [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      }
      if (payload.name !== undefined) {
        patch[found.ctx.titlePropertyName] = { title: toNotionRichText(payload.name, 120) }
        patch[MEETING_NOTION_FIELD.keywordSetName] = notionRichTextValue(payload.name, 300)
      }
      if (payload.isActive !== undefined) {
        patch[MEETING_NOTION_FIELD.isActive] = { checkbox: payload.isActive }
      }
      await found.ctx.api.updatePage(asString(found.page?.id) ?? payload.id, {
        properties: patch,
      })
      const sets = await listNotionKeywordSets(env)
      const updated = sets.find((entry) => entry.id === payload.id)
      if (!updated) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      return respond.ok({ ok: true, set: updated })
    }

    if (request.method === 'DELETE' && path === '/keyword-sets') {
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      const found = await findMeetingNotionKeywordSetPageById(env, id)
      if (found) {
        const keywords = await queryAllMeetingNotionPages(found.ctx, {
          filter: keywordFilterBySetId(id),
        })
        for (const keywordPage of keywords) {
          const keywordPageId = asString(keywordPage?.id)
          if (!keywordPageId) continue
          await found.ctx.api.updatePage(keywordPageId, { archived: true })
        }
        const setPageId = asString(found.page?.id) ?? id
        await found.ctx.api.updatePage(setPageId, { archived: true })
      }
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'GET' && path === '/keywords') {
      const setId = asString(url.searchParams.get('setId'))
      const keywords = await listNotionKeywords(env, setId)
      return respond.ok({
        ok: true,
        keywords,
      })
    }

    if (request.method === 'POST' && path === '/keywords') {
      const payload = parseKeywordCreateBody(await readJsonBody(request))
      const setFound = await findMeetingNotionKeywordSetPageById(env, payload.setId)
      if (!setFound) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      const id = crypto.randomUUID()
      const now = Date.now()
      await setFound.ctx.api.createPage({
        parent: { database_id: setFound.ctx.databaseId },
        properties: {
          [setFound.ctx.titlePropertyName]: { title: toNotionRichText(payload.phrase, 200) },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.keyword } },
          [MEETING_NOTION_FIELD.keywordId]: notionRichTextValue(id, 200),
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(payload.setId, 200),
          [MEETING_NOTION_FIELD.phrase]: notionRichTextValue(payload.phrase, 300),
          [MEETING_NOTION_FIELD.weight]: { number: payload.weight },
          [MEETING_NOTION_FIELD.tags]: notionRichTextValue(payload.tags ?? '', 400),
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
        },
      })
      return respond.json(
        {
          ok: true,
          keyword: {
            id,
            setId: payload.setId,
            phrase: payload.phrase,
            weight: payload.weight,
            tags: payload.tags,
            createdAt: now,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keywords') {
      const payload = parseKeywordPatchBody(await readJsonBody(request))
      const found = await findMeetingNotionKeywordPageById(env, payload.id)
      if (!found) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      const patch: Record<string, unknown> = {
        [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      }
      if (payload.phrase !== undefined) {
        patch[found.ctx.titlePropertyName] = { title: toNotionRichText(payload.phrase, 200) }
        patch[MEETING_NOTION_FIELD.phrase] = notionRichTextValue(payload.phrase, 300)
      }
      if (payload.weight !== undefined) {
        patch[MEETING_NOTION_FIELD.weight] = { number: payload.weight }
      }
      if (payload.tags !== undefined) {
        patch[MEETING_NOTION_FIELD.tags] = notionRichTextValue(payload.tags ?? '', 400)
      }
      await found.ctx.api.updatePage(asString(found.page?.id) ?? payload.id, {
        properties: patch,
      })
      const list = await listNotionKeywords(env)
      const keyword = list.find((entry) => entry.id === payload.id)
      if (!keyword) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      return respond.ok({ ok: true, keyword })
    }

    if (request.method === 'DELETE' && path === '/keywords') {
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      const found = await findMeetingNotionKeywordPageById(env, id)
      if (found) {
        await found.ctx.api.updatePage(asString(found.page?.id) ?? id, { archived: true })
      }
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'POST' && path === '/assemblyai/webhook') {
      const secret = getAssemblyWebhookSecret(env)
      const headerSecret = asString(request.headers.get('x-assemblyai-webhook-secret'))
      if (!headerSecret || headerSecret !== secret) {
        return respond.json({ ok: false, error: 'webhook_forbidden' }, 403)
      }

      const body = parsePatchBody(await readJsonBody(request))
      const assemblyId = asString(body.transcript_id) ?? asString(body.id)
      if (!assemblyId) {
        return respond.json({ ok: false, error: 'transcript_id_required' }, 400)
      }
      const status = normalizeMeetingStatus(asString(body.status) ?? 'processing')
      const errorMessage = asString(body.error) ?? null
      const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
      if (found) {
        await found.ctx.api.updatePage(found.row.pageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: status } },
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(errorMessage ?? '', 1200),
          },
        })
      }

      return respond.ok({
        ok: true,
        assemblyId,
        status,
      })
    }
  } catch (error: unknown) {
    return fail(error)
  }

  return null
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
    const origin = request.headers.get('Origin')
    const allowedOrigin = resolveAllowedOrigin(origin, env)

    const json = (body: unknown, status: number, _origin?: string | null, responsePath = path): Response =>
      jsonResponse(body, status, { requestOrigin: origin, corsOrigin: allowedOrigin, path: responsePath })
    const ok = (body: unknown, _origin?: string | null, responsePath = path): Response =>
      jsonResponse(body, 200, { requestOrigin: origin, corsOrigin: allowedOrigin, path: responsePath })

    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigin) {
        return jsonResponse(
          { ok: false, error: 'cors_forbidden', message: 'Origin is not allowed.' },
          403,
          { requestOrigin: origin, corsOrigin: null, path },
        )
      }
      return emptyResponse(204, { requestOrigin: origin, corsOrigin: allowedOrigin, path })
    }

    if (origin && !allowedOrigin) {
      return jsonResponse(
        { ok: false, error: 'cors_forbidden', message: 'Origin is not allowed.' },
        403,
        { requestOrigin: origin, corsOrigin: null, path },
      )
    }

    const missingAuth = requiredAuthEnv(env)
    if (missingAuth) {
      return json({ ok: false, error: 'config_missing', message: `Missing environment variable: ${missingAuth}` }, 500, origin)
    }

    const rateLimit = checkRateLimit(request, env)
    if (!rateLimit.allowed) {
      const retryAfterSec = 'retryAfterSec' in rateLimit ? rateLimit.retryAfterSec : 1
      const response = json(
        {
          ok: false,
          error: 'rate_limited',
          message: 'Too many requests. Please retry later.',
          retryAfterSec,
        },
        429,
        origin,
      )
      response.headers.set('Retry-After', String(retryAfterSec))
      return response
    }

    if (request.method === 'GET' && path === '/auth/session') {
      const authenticated = await isAuthenticated(request, env)
      return ok(
        {
          ok: true,
          authenticated,
        },
        origin,
      )
    }

    if (request.method === 'POST' && path === '/auth/login') {
      if (isAuthDisabled(env)) {
        return ok(
          {
            ok: true,
            authenticated: true,
            authDisabled: true,
          },
          origin,
        )
      }

      if (!hasValidAccessIdentity(request, env)) {
        return json(
          { ok: false, error: 'access_forbidden', message: 'Cloudflare Access policy check failed.' },
          403,
          origin,
        )
      }

      let payload: Record<string, unknown>
      try {
        payload = parsePatchBody(await readJsonBody(request))
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : 'invalid_request'
        return json({ ok: false, error: message }, 400, origin)
      }

      const providedPassword = asString(payload.password)
      if (!providedPassword) {
        return json({ ok: false, error: 'password_required' }, 400, origin)
      }

      if (providedPassword !== env.PAGE_PASSWORD) {
        return json({ ok: false, error: 'invalid_password', message: 'Password is incorrect.' }, 401, origin)
      }

      const session = await createSessionToken(env)
      const response = ok(
        {
          ok: true,
          authenticated: true,
          expiresAt: new Date(session.exp).toISOString(),
        },
        origin,
      )
      response.headers.append('Set-Cookie', buildSessionCookieValue(session.token, request, getSessionTtlSec(env)))
      return response
    }

    if (request.method === 'POST' && path === '/auth/logout') {
      const response = ok(
        {
          ok: true,
          authenticated: false,
        },
        origin,
      )
      response.headers.append('Set-Cookie', buildSessionClearCookie(request))
      return response
    }

    if (isMeetingPreAuthRoute(request.method, path)) {
      const meetingHandled = await handleMeetingRoutes(request, path, url, env, ctx, {
        json: (body, status) => json(body, status, origin),
        ok: (body) => ok(body, origin),
      })
      if (meetingHandled) return meetingHandled
    }

    if (!(await isAuthenticated(request, env))) {
      return json(
        { ok: false, error: 'unauthorized', message: 'Missing or invalid credentials.' },
        401,
        origin,
      )
    }

    if (!isMeetingPreAuthRoute(request.method, path)) {
      const meetingHandled = await handleMeetingRoutes(request, path, url, env, ctx, {
        json: (body, status) => json(body, status, origin),
        ok: (body) => ok(body, origin),
      })
      if (meetingHandled) return meetingHandled
    }

    const missingNotion = requiredNotionEnv(env)
    if (missingNotion) {
      return json({ ok: false, error: 'config_missing', message: `Missing environment variable: ${missingNotion}` }, 500, origin)
    }

    const service = serviceFromEnv(env)
    const cacheTtlMs = getCacheTtlMs(env)

    try {
      if (request.method === 'GET' && path === '/projects') {
        const snapshot = await getSnapshot(service, env, ctx)
        return ok(
          {
            ok: true,
            projects: snapshot.projects,
            schema: service.getApiSchemaSummary(snapshot.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/meta') {
        return ok(
          {
            ok: true,
            databases: {
              project: {
                id: env.NOTION_PROJECT_DB_ID,
                url: notionDatabaseUrl(env.NOTION_PROJECT_DB_ID),
              },
              task: {
                id: env.NOTION_TASK_DB_ID,
                url: notionDatabaseUrl(env.NOTION_TASK_DB_ID),
              },
              checklist: {
                id: env.NOTION_CHECKLIST_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_CHECKLIST_DB_ID),
              },
              meeting: {
                id: getMeetingNotionDbId(env),
                url: notionDatabaseUrl(getMeetingNotionDbId(env)),
              },
            },
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/project-schema/sync') {
        const sync = await service.syncProjectDatabaseProperties(true)
        invalidateSnapshotCache(ctx)
        return ok(
          {
            ok: true,
            projectDatabaseId: env.NOTION_PROJECT_DB_ID,
            created: sync.created,
            existing: sync.existing,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/tasks') {
        const projectId = asString(url.searchParams.get('projectId'))
        const status = asString(url.searchParams.get('status'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const snapshot = await getSnapshot(service, env, ctx)
        const filtered = filterTasks(snapshot.tasks, projectId, status, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok(
          {
            ok: true,
            tasks: paged.items,
            nextCursor: paged.nextCursor,
            hasMore: paged.hasMore,
            schema: service.getApiSchemaSummary(snapshot.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklists') {
        const eventName = asString(url.searchParams.get('eventName')) ?? ''
        const eventCategory = asString(url.searchParams.get('eventCategory')) ?? ''
        const normalizedEventCategory = normalizeChecklistValue(eventCategory)
        const eventDate = asString(url.searchParams.get('eventDate'))
        const shippingDate = asString(url.searchParams.get('shippingDate'))
        const operationModeRaw = asString(url.searchParams.get('operationMode'))
        const fulfillmentModeRaw = asString(url.searchParams.get('fulfillmentMode'))
        const operationMode = operationModeRaw === 'dealer' ? 'dealer' : operationModeRaw === 'self' ? 'self' : undefined
        const fulfillmentMode =
          fulfillmentModeRaw === 'overseas'
            ? 'overseas'
            : fulfillmentModeRaw === 'domestic'
              ? 'domestic'
              : fulfillmentModeRaw === 'dealer'
                ? 'dealer'
                : undefined

        const allItems = await service.listChecklists()
        const holidaySet = await getKoreanHolidaySet()
        const availableCategories = unique(
          allItems.flatMap((item) => [...(item.eventCategories ?? []), ...(item.applicableEventCategories ?? [])].filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b, 'ko'))

        const items = allItems
          .filter((item) => {
            const normalizedItemCategories = expandChecklistValues([...(item.eventCategories ?? []), ...(item.applicableEventCategories ?? [])])
            const byCategory = normalizedEventCategory
              ? normalizedItemCategories.size > 0 && normalizedItemCategories.has(normalizedEventCategory)
              : true
            if (!byCategory) return false
            return true
          })
          .map((item) => {
            const baseDate = pickChecklistBaseDate(item, eventDate, shippingDate)
            const offsetDays = pickChecklistOffset(item, operationMode, fulfillmentMode)
            if (!baseDate || typeof offsetDays !== 'number') return item
            return {
              ...item,
              computedDueDate: dateToIso(shiftBusinessDays(baseDate, offsetDays, holidaySet)),
            }
          })

        return ok(
          {
            ok: true,
            eventName,
            eventCategory,
            eventDate: eventDate ?? '',
            shippingDate: shippingDate ?? '',
            operationMode: operationMode ?? '',
            fulfillmentMode: fulfillmentMode ?? '',
            availableCategories,
            count: items.length,
            items,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignments') {
        const projectPageId = asString(url.searchParams.get('projectId')) ?? asString(url.searchParams.get('projectPageId'))

        if (projectPageId && env.NOTION_CHECKLIST_ASSIGNMENT_DB_ID) {
          const ensureModeRaw = (asString(url.searchParams.get('ensure')) ?? '').toLowerCase()
          const shouldEnsureSync = ensureModeRaw === 'sync' || ensureModeRaw === '1' || ensureModeRaw === 'true'
          const shouldEnsureBackground = !(
            ensureModeRaw === 'none' ||
            ensureModeRaw === 'off' ||
            ensureModeRaw === '0' ||
            ensureModeRaw === 'false'
          )

          const rows = shouldEnsureSync
            ? await service.ensureChecklistAssignmentsForProject(projectPageId)
            : await service.listChecklistAssignments(projectPageId)

          if (!shouldEnsureSync && shouldEnsureBackground) {
            ctx.waitUntil(
              service.ensureChecklistAssignmentsForProject(projectPageId).catch(() => {
                // Non-blocking best effort sync.
              }),
            )
          }

          return ok(
            {
              ok: true,
              projectPageId,
              rows,
              storageMode: 'notion_matrix',
              syncing: !shouldEnsureSync && shouldEnsureBackground,
            },
            origin,
          )
        }

        if (projectPageId) {
          const [loaded, projects, checklists, snapshot] = await Promise.all([
            loadChecklistAssignments(env),
            service.listProjects(),
            service.listChecklists(),
            getSnapshot(service, env, ctx),
          ])
          const normalizedProjectId = normalizeNotionId(projectPageId)
          const project = projects.find((entry) => normalizeNotionId(entry.id) === normalizedProjectId)
          if (!project) {
            return json({ ok: false, error: 'project_not_found' }, 404, origin)
          }

          const knownTaskIds = new Set(snapshot.tasks.map((task) => normalizeNotionId(task.id)))
          const assignmentEntries = Object.entries(loaded.assignments)
          const rows: ChecklistAssignmentRow[] = checklists.map((item) => {
            const key = checklistMatrixKey(project.id, item.id)
            const storedEntry = assignmentEntries.find(([entryKey]) => {
              const parts = entryKey.split('::')
              if (parts.length < 2) return false
              const itemId = parts[parts.length - 1]
              const projectKey = (parts[0] ?? '').toLowerCase()
              if (itemId !== item.id) return false
              return projectKey === normalizeNotionId(project.id) || projectKey === 'all_project'
            })
            const decoded = decodeChecklistAssignmentValue(storedEntry?.[1])
            const resolvedTaskPageId = resolveChecklistAssignedTaskId(decoded.taskPageId, knownTaskIds)
            const fallbackApplicable = checklistAppliesToProject(item, project)
            const applicable = decoded.explicitNotApplicable ? false : fallbackApplicable
            const status = decoded.explicitNotApplicable
              ? { assignmentStatus: 'not_applicable' as const, assignmentStatusText: '해당없음' }
              : toChecklistAssignmentStatus(applicable, resolvedTaskPageId)

            return {
              id: key,
              key,
              projectPageId: project.id,
              checklistItemPageId: item.id,
              taskPageId: resolvedTaskPageId,
              applicable,
              assignmentStatus: status.assignmentStatus,
              assignmentStatusText: status.assignmentStatusText,
            }
          })

          return ok(
            {
              ok: true,
              projectPageId: project.id,
              rows,
              storageMode: loaded.mode,
            },
            origin,
          )
        }

        const loaded = await loadChecklistAssignments(env)
        return ok(
          {
            ok: true,
            assignments: loaded.assignments,
            storageMode: loaded.mode,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignment-logs') {
        const limit = parseLogLimit(asString(url.searchParams.get('limit')))
        const logs = await listChecklistAssignmentLogs(env, limit)
        return ok(
          {
            ok: true,
            storageMode: hasChecklistDb(env) ? 'd1' : 'cache',
            logs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignments/export') {
        const loaded = await loadChecklistAssignments(env)
        const logLimit = parseExportLogLimit(asString(url.searchParams.get('logLimit')))
        const logs = loaded.mode === 'd1' ? await listChecklistAssignmentLogs(env, logLimit) : []

        return ok(
          {
            ok: true,
            exportedAt: new Date().toISOString(),
            storageMode: loaded.mode,
            counts: {
              assignments: Object.keys(loaded.assignments).length,
              logs: logs.length,
            },
            limits: {
              logLimit,
            },
            assignments: loaded.assignments,
            logs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/checklist-assignments') {
        let payload: {
          projectPageId: string
          checklistItemPageId: string
          taskPageId: string | null
          assignmentStatus?: ChecklistAssignmentStatus
          actor?: string
        }
        try {
          payload = parseChecklistAssignmentBody(await readJsonBody(request))
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'invalid_request'
          return json({ ok: false, error: message }, 400, origin)
        }

        if (env.NOTION_CHECKLIST_ASSIGNMENT_DB_ID) {
          if (payload.taskPageId) {
            try {
              await service.getTask(payload.taskPageId)
            } catch {
              return json({ ok: false, error: 'task_not_found' }, 404, origin)
            }
          }
          const row = await service.upsertChecklistAssignment({
            projectPageId: payload.projectPageId,
            checklistItemPageId: payload.checklistItemPageId,
            taskPageId: payload.taskPageId,
            assignmentStatus: payload.assignmentStatus,
          })
          const rows = await service.listChecklistAssignments(payload.projectPageId)
          return ok(
            {
              ok: true,
              row,
              rows,
              projectPageId: payload.projectPageId,
              storageMode: 'notion_matrix',
            },
            origin,
          )
        }

        const itemId = payload.checklistItemPageId
        const projectId = payload.projectPageId
        const taskId = payload.taskPageId ?? undefined
        const assignmentStatus: ChecklistAssignmentStatus = payload.assignmentStatus ?? (taskId ? 'assigned' : 'unassigned')
        const eventCategory = ''
        const loaded = await loadChecklistAssignments(env)
        const assignments = loaded.assignments
        if (taskId) {
          const snapshot = await getSnapshot(service, env, ctx)
          const existsInSnapshot = snapshot.tasks.some((task) => normalizeNotionId(task.id) === normalizeNotionId(taskId))
          if (!existsInSnapshot) {
            try {
              await service.getTask(taskId)
            } catch {
              return json({ ok: false, error: 'task_not_found' }, 404, origin)
            }
          }
        }
        const key = checklistAssignmentKey(eventCategory, itemId, projectId)
        const legacyKey = `${(eventCategory ?? '').trim() || 'ALL'}::${itemId}`
        const previousRaw = assignments[key] ?? assignments[legacyKey]
        const previousDecoded = decodeChecklistAssignmentValue(previousRaw)
        const previousTaskId = previousDecoded.taskPageId
        if (key !== legacyKey) {
          delete assignments[legacyKey]
        }
        if (assignmentStatus === 'not_applicable') {
          assignments[key] = CHECKLIST_NOT_APPLICABLE_SENTINEL
        } else if (taskId) {
          assignments[key] = taskId
        } else {
          delete assignments[key]
        }

        if (loaded.mode === 'd1') {
          await writeChecklistAssignmentToD1(env, request, {
            key,
            projectId: normalizeNotionId(projectId),
            eventCategory: eventCategory ?? '',
            itemId,
            taskId: assignmentStatus === 'assigned' ? taskId : undefined,
            previousTaskId,
            actor: payload.actor,
          })
        } else {
          ctx.waitUntil(writeChecklistAssignmentsToCache(assignments))
        }

        let row: ChecklistAssignmentRow | undefined
        try {
          const [projects, checklists] = await Promise.all([service.listProjects(), service.listChecklists()])
          const project = projects.find((entry) => normalizeNotionId(entry.id) === normalizeNotionId(projectId))
          const checklist = checklists.find((entry) => entry.id === itemId)
          const decoded = decodeChecklistAssignmentValue(assignments[key])
          const fallbackApplicable = project && checklist ? checklistAppliesToProject(checklist, project) : true
          const applicable = decoded.explicitNotApplicable ? false : fallbackApplicable
          const status = decoded.explicitNotApplicable
            ? { assignmentStatus: 'not_applicable' as const, assignmentStatusText: '해당없음' }
            : toChecklistAssignmentStatus(applicable, decoded.taskPageId)
          row = {
            id: key,
            key: checklistMatrixKey(projectId, itemId),
            projectPageId: projectId,
            checklistItemPageId: itemId,
            taskPageId: decoded.taskPageId,
            applicable,
            assignmentStatus: status.assignmentStatus,
            assignmentStatusText: status.assignmentStatusText,
          }
        } catch {
          // Fallback row mapping is best-effort only.
        }

        return ok(
          {
            ok: true,
            key,
            taskId: decodeChecklistAssignmentValue(assignments[key]).taskPageId,
            row,
            assignments,
            storageMode: loaded.mode,
          },
          origin,
        )
      }

      const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
      if (request.method === 'GET' && taskMatch) {
        const id = decodeURIComponent(taskMatch[1])
        const snapshot = await getSnapshot(service, env, ctx)
        const fromSnapshot = snapshot.tasks.find((task) => task.id === id)

        if (fromSnapshot) {
          return ok(
            {
              ok: true,
              task: fromSnapshot,
              schema: service.getApiSchemaSummary(snapshot.schema),
              cacheTtlMs,
            },
            origin,
          )
        }

        const data = await service.getTask(id)
        return ok(
          {
            ok: true,
            task: data.task,
            schema: service.getApiSchemaSummary(data.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/tasks') {
        let payload: CreateTaskInput
        try {
          payload = parseCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const created = await service.createTask(payload)
        invalidateSnapshotCache(ctx)

        return json(
          {
            ok: true,
            task: created.task,
            schema: service.getApiSchemaSummary(created.schema),
          },
          201,
          origin,
        )
      }

      if (request.method === 'PATCH' && taskMatch) {
        const id = decodeURIComponent(taskMatch[1])
        let patch: UpdateTaskInput

        try {
          patch = parseUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateTask(id, patch)
        invalidateSnapshotCache(ctx)

        return ok(
          {
            ok: true,
            task: updated.task,
            schema: service.getApiSchemaSummary(updated.schema),
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/') {
        return ok(
          {
            ok: true,
            supported: [
              'GET /api/auth/session',
              'POST /api/auth/login',
              'POST /api/auth/logout',
              'GET /api/projects',
              'GET /api/meta',
              'GET /api/checklists?eventName=...&eventCategory=...',
              'GET /api/checklist-assignments?projectId=...',
              'GET /api/checklist-assignments/export?logLimit=1000',
              'GET /api/checklist-assignment-logs?limit=100',
              'POST /api/checklist-assignments',
              'POST /api/uploads/presign',
              'PUT /api/uploads/direct?key=...&token=...',
              'GET /api/uploads/fetch?key=...&token=...',
              'GET /api/transcripts?limit=20',
              'POST /api/transcripts',
              'GET /api/transcripts/:id',
              'POST|PATCH /api/transcripts/:id/speakers',
              'POST /api/transcripts/:id/publish',
              'GET|POST|PATCH|DELETE /api/keyword-sets',
              'GET|POST|PATCH|DELETE /api/keywords',
              'POST /api/assemblyai/webhook',
              'GET /api/tasks?projectId=...&status=...&q=...&cursor=...&pageSize=...',
              'GET /api/tasks/:id',
              'POST /api/tasks',
              'PATCH /api/tasks/:id',
            ],
          },
          origin,
        )
      }

      return json({ ok: false, error: 'not_found', path: url.pathname }, 404, origin)
    } catch (error: any) {
      const status = error?.code === 'object_not_found' ? 404 : 500
      return json(
        {
          ok: false,
          error: status === 404 ? 'not_found' : 'internal_error',
          message: error?.message ?? 'unknown_error',
        },
        status,
        origin,
      )
    }
  },
}


