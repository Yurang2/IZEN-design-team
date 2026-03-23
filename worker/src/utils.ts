import type {
  ChecklistAssignmentStatus,
  ChecklistPreviewItem,
  Env,
  ProjectRecord,
} from './types'

// ---- Constants ----

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const SNAPSHOT_CACHE_URL = 'https://cache.internal/notion-task-snapshot-v1'
export const CHECKLIST_ASSIGNMENT_CACHE_URL = 'https://cache.internal/checklist-assignment-v1'
export const CHECKLIST_NOT_APPLICABLE_SENTINEL = '__NOT_APPLICABLE__'
export const DEFAULT_CACHE_TTL_MS = 60_000
export const KR_HOLIDAY_JSON_URL = 'https://holidays.hyunbin.page/basic.json'
export const KR_HOLIDAY_CACHE_MS = 12 * 60 * 60 * 1000
export const DEFAULT_LOG_LIMIT = 100
export const DEFAULT_EXPORT_LOG_LIMIT = 1000
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12
export const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
export const SESSION_COOKIE_NAME = 'izen_session'
export const MEETING_AUDIO_PREFIX = 'meetings/audio'
export const DEFAULT_MEETING_KEYWORD_LIMIT = 120
export const MIN_MEETING_KEYWORD_LIMIT = 50
export const MAX_MEETING_KEYWORD_LIMIT = 150
export const LARGE_NOTION_IMPORT_POLL_ATTEMPTS = 8
export const LARGE_NOTION_IMPORT_POLL_MS = 1_500
export const NOTION_MULTIPART_COMPLETE_POLL_ATTEMPTS = 20
export const NOTION_MULTIPART_COMPLETE_POLL_MS = 1_500
export const DEFAULT_MIN_SPEAKERS = 2
export const DEFAULT_MAX_SPEAKERS = 10
export const MIN_ALLOWED_SPEAKERS = 1
export const MAX_ALLOWED_SPEAKERS = 10
export const TRANSCRIPT_POLL_LIMIT = 50
export const UPLOAD_SESSION_LIST_LIMIT = 100
export const MEETING_NOTION_SCHEMA_CACHE_MS = 5 * 60 * 1000
export const NOTION_RICH_TEXT_CHUNK = 1800
export const MAX_NOTION_FILE_UPLOAD_BYTES = 20 * 1024 * 1024
export const NOTION_MULTIPART_MIN_BYTES = 5 * 1024 * 1024
export const NOTION_MULTIPART_CHUNK_BYTES = 10 * 1024 * 1024
export const NOTION_MULTIPART_MAX_BYTES = 20 * 1024 * 1024
export const MAX_TRANSCRIPT_PARAGRAPH_CHARS = 1_500
export const MAX_TRANSCRIPT_PARAGRAPH_LINES = 12
export const MAX_TRANSCRIPT_REPLACEMENT_ARCHIVE_BLOCKS = 20
export const EVENT_GRAPHICS_CAPTURE_FILES_FIELD = '\uCEA1\uCDD0'
export const EVENT_GRAPHICS_CAPTURE_FILES_FIELD_LEGACY = '\uCEA1\uCDD0(\uBB34\uC870\uAC74 \uC774\uBBF8\uC9C0\uD615\uC2DD)'
export const EVENT_GRAPHICS_AUDIO_FILES_FIELD = '\uC624\uB514\uC624\uD30C\uC77C'
export const EVENT_GRAPHICS_MAIN_SCREEN_FIELD = '\uBA54\uC778 \uD654\uBA74'
export const EVENT_GRAPHICS_AUDIO_TEXT_FIELD = '\uC624\uB514\uC624'
export const EVENT_GRAPHICS_SPEAKER_PPT_LABEL = '\uAC15\uC5F0\uC790 PPT'
export const EVENT_GRAPHICS_SPEAKER_PPT_LABEL_DISPLAY = 'Speaker PPT'
export const EVENT_GRAPHICS_DJ_AMBIENT_LABEL = 'DJ Ambient Music'
export const EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL = '\uBE44\uB514\uC624\uC5D0 \uD3EC\uD568'
export const EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL_DISPLAY = 'Included in Video'
export const EVENT_GRAPHICS_MIC_ONLY_LABEL_DISPLAY = 'Mic Only'
export const EVENT_GRAPHICS_NOT_APPLICABLE_LABEL = '\uD574\uB2F9\uC5C6\uC74C'
export const EVENT_GRAPHICS_NOT_APPLICABLE_LABEL_DISPLAY = 'N/A'
export const DEFAULT_OPENAI_SUMMARY_MODEL = 'gpt-5-mini'
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'
export const GOOGLE_GENERATIVE_LANGUAGE_API_URL = 'https://generativelanguage.googleapis.com/v1beta'
export const MAX_SUMMARY_SOURCE_CHARS = 180_000
export const SUMMARY_RETRY_SOURCE_CHARS = 120_000
export const SUMMARY_OUTPUT_TOKENS = 12_000
export const SUMMARY_RETRY_OUTPUT_TOKENS = 16_000
export const FIXED_MEETING_NOTION_DB_ID = '3f3c1cc7ec278216b5e881744612ed6b'
export const DEFAULT_ASSEMBLY_SPEECH_MODELS = ['universal-2']
export const R2_PRESIGN_ALGORITHM = 'AWS4-HMAC-SHA256'
export const R2_PRESIGN_REGION = 'auto'
export const R2_PRESIGN_SERVICE = 's3'
export const R2_UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'
export const DEFAULT_MEETING_AUDIO_BUCKET_NAME = 'izen-meeting-audio'
export const SEOUL_TIME_ZONE = 'Asia/Seoul'
export const LINE_PUSH_API_URL = 'https://api.line.me/v2/bot/message/push'
export const LINE_MORNING_CRON_UTC = '55 23 * * *'
export const LINE_EVENING_CRON_UTC = '30 8 * * *'
export const SCREENING_PLAN_HISTORY_SYNC_CRON_UTC = '*/30 * * * *'
export const DEFAULT_LINE_NOTIFY_ASSIGNEE_NAME = '\uC870\uC815\uD6C8'
export const MAX_LINE_REMINDER_TASKS = 20

export const textEncoder = new TextEncoder()

// ---- Local types ----

export type WildcardOriginRule = {
  protocol: 'http:' | 'https:'
  suffix: string
}

export type AllowedOrigins = {
  exact: Set<string>
  wildcard: WildcardOriginRule[]
}

export type ThumbnailInlineImageInput = {
  name?: string
  mimeType: string
  dataUrl: string
}

export type VideoThumbnailRenderInput = {
  outputSlug: string
  eventName: string
  model?: string
  outputFormats?: string[]
  dateText: string
  locationText: string
  subtitleText: string
  supportText: string
  titleFont: string
  detailFont: string
  fontDirection: string
  compositionNotes: string
  customPrompt: string
  aspectRatio?: string
  backgroundImage: ThumbnailInlineImageInput | null
  styleReferenceImages: ThumbnailInlineImageInput[]
}

export type GeminiPromptImageRenderInput = {
  prompt: string
  model?: string
  aspectRatio?: string
}

export type ResponseContext = {
  requestOrigin: string | null
  corsOrigin: string | null
  path: string
}

export type SpeakerMappingInput = {
  speakerLabel: string
  displayName: string
}

export type MeetingUploadEventBody = {
  uploadId: string
  key: string
  token: string
  eventType: string
  stage: string | null
  state: string | null
  reasonCode: string | null
  reasonMessage: string | null
  elapsedMs: number | null
  payloadJson: string | null
}

// ---- Pure utility functions ----

export function normalizePath(pathname: string): string {
  const cleaned = pathname.replace(/\/+$/, '') || '/'
  if (cleaned === '/api') return '/'
  if (cleaned.startsWith('/api/')) {
    return cleaned.slice(4) || '/'
  }
  return cleaned
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isAuthDisabled(env: Env): boolean {
  return isTruthy(asString(env.AUTH_DISABLED))
}

export function normalizeOrigin(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin.toLowerCase()
  } catch {
    return null
  }
}

export function parseCsvSet(input: string | undefined): Set<string> {
  if (!input) return new Set<string>()
  const values = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(values)
}

export function parseWildcardOriginRule(value: string): WildcardOriginRule | null {
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

export function isWildcardOriginMatch(origin: string, rule: WildcardOriginRule): boolean {
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== rule.protocol) return false
    const hostname = parsed.hostname.toLowerCase()
    return hostname.endsWith(rule.suffix) && hostname.length > rule.suffix.length
  } catch {
    return false
  }
}

export function parseAllowedOrigins(env: Env): AllowedOrigins {
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

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return LOCALHOST_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}

export function resolveAllowedOrigin(requestOrigin: string | null, env: Env): string | null {
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

export function parseBoundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export function parsePageSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !ISO_DATE_RE.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

export function dateToIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

export function isBusinessDay(date: Date, holidaySet: Set<string>): boolean {
  return !isWeekend(date) && !holidaySet.has(dateToIso(date))
}

export function shiftBusinessDays(baseDate: Date, offsetBusinessDays: number, holidaySet: Set<string>): Date {
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

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

export function parseDate(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error('invalid_date')
  }
  return trimmed
}

export function parsePatchBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('invalid_body')
  }
  return body as Record<string, unknown>
}

export function containsText(source: string, keyword?: string): boolean {
  if (!keyword) return true
  return source.toLowerCase().includes(keyword.toLowerCase())
}

export function getSeoulDateParts(date: Date): { year: string; month: string; day: string; hour: string; minute: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const read = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '00'
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  }
}

export function toSeoulDateIso(date: Date): string {
  const parts = getSeoulDateParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function toSeoulTimeLabel(date: Date): string {
  const parts = getSeoulDateParts(date)
  return `${parts.hour}:${parts.minute}`
}

export function normalizeNameToken(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

export function isTaskClosed(status: string | undefined): boolean {
  const normalized = normalizeNameToken(status)
  return normalized.includes('\uC644\uB8CC') || normalized.includes('\uBCF4\uAD00') || normalized.includes('done') || normalized.includes('archive')
}

export function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').toLowerCase()
}

export function isLikelyNotionPageId(value: string | undefined | null): boolean {
  return /^[0-9a-f]{32}$/.test(normalizeNotionId(value))
}

export function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function parseBoundedLimit(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}

export function parseLogLimit(value: string | undefined): number {
  return parseBoundedLimit(value, DEFAULT_LOG_LIMIT, 200)
}

export function parseExportLogLimit(value: string | undefined): number {
  return parseBoundedLimit(value, DEFAULT_EXPORT_LOG_LIMIT, 5000)
}

export function getCacheTtlMs(env: Env): number {
  const ttlSec = Number(env.API_CACHE_TTL_SECONDS ?? '60')
  if (!Number.isFinite(ttlSec)) return DEFAULT_CACHE_TTL_MS
  return Math.max(10_000, Math.floor(ttlSec * 1000))
}

export function notionDatabaseUrl(databaseId: string | undefined): string | null {
  const normalized = normalizeNotionId(databaseId)
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

export function notionPageUrl(pageId: string | undefined): string | null {
  const normalized = normalizeNotionId(pageId)
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

export function normalizeChecklistValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function splitChecklistCandidates(value: string | undefined): string[] {
  const raw = (value ?? '').normalize('NFKC')
  return raw
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function expandChecklistValues(values: string[] | undefined): Set<string> {
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

export function normalizedSet(values: string[] | undefined): Set<string> {
  return expandChecklistValues(values)
}

export function checklistAppliesToProject(item: ChecklistPreviewItem, project: ProjectRecord): boolean {
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

export function toChecklistAssignmentStatus(
  applicable: boolean,
  taskPageId: string | null,
): { assignmentStatus: ChecklistAssignmentStatus; assignmentStatusText: string } {
  if (!applicable) {
    return {
      assignmentStatus: 'not_applicable',
      assignmentStatusText: '\uD574\uB2F9\uC5C6\uC74C',
    }
  }
  if (taskPageId) {
    return {
      assignmentStatus: 'assigned',
      assignmentStatusText: '\uD560\uB2F9\uB428',
    }
  }
  return {
    assignmentStatus: 'unassigned',
    assignmentStatusText: '\uBBF8\uD560\uB2F9',
  }
}

export function truncateText(value: string | undefined | null, max: number): string | null {
  const text = asString(value ?? undefined)
  if (!text) return null
  return text.slice(0, max)
}

export function slugifyFilenamePart(value: string): string {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[^\w.\- ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.toLowerCase()
}

export function extractFileExtension(filename: string): string {
  const normalized = filename.trim()
  const idx = normalized.lastIndexOf('.')
  if (idx < 0 || idx === normalized.length - 1) return ''
  const ext = normalized.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!ext) return ''
  return `.${ext.slice(0, 8)}`
}

export function buildMeetingAudioKey(filenameRaw: string): string {
  const filename = filenameRaw.trim()
  const extension = extractFileExtension(filename)
  const basename = extension ? filename.slice(0, -extension.length) : filename
  const safeBase = slugifyFilenamePart(basename).slice(0, 64) || 'audio'
  const date = new Date().toISOString().slice(0, 10)
  const id = crypto.randomUUID().replace(/-/g, '')
  return `${MEETING_AUDIO_PREFIX}/${date}/${id}-${safeBase}${extension}`
}

export function isValidMeetingAudioKey(key: string): boolean {
  if (!key.startsWith(`${MEETING_AUDIO_PREFIX}/`)) return false
  return /^[a-zA-Z0-9/_\-.]+$/.test(key)
}

export function stripMeetingUploadKeyPrefix(filename: string): string {
  return filename.replace(/^[0-9a-f]{32}-/i, '')
}

export function inferAudioContentType(key: string): string {
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

export function normalizeAudioContentType(value: string | undefined, hintKeyOrFilename: string): string {
  const fallback = inferAudioContentType(hintKeyOrFilename)
  const base = (value ?? '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (!base) return fallback
  if (base === 'audio/x-m4a' || base === 'audio/m4a') return 'audio/mp4'
  if (base === 'audio/x-wav') return 'audio/wav'
  return base
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return toHex(digest)
}

export async function signHmacSha256(secret: string | Uint8Array, value: string): Promise<Uint8Array> {
  const keyData = typeof secret === 'string' ? textEncoder.encode(secret) : secret
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value))
  return new Uint8Array(signature)
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

export function encodeR2ObjectKey(key: string): string {
  return key
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeRfc3986(segment))
    .join('/')
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('Content-Type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error('content_type_must_be_application_json')
  }
  return request.json()
}

export async function readFlexibleJsonBody(request: Request): Promise<unknown> {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    return request.json()
  }
  const raw = (await request.text()).trim()
  if (!raw) throw new Error('invalid_body')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('invalid_body')
  }
}

export function requiredAuthEnv(env: Env): string | null {
  if (isAuthDisabled(env)) return null
  if (!env.PAGE_PASSWORD) return 'PAGE_PASSWORD'
  return null
}

export function requiredNotionEnv(env: Env): string | null {
  if (!env.NOTION_TOKEN) return 'NOTION_TOKEN'
  if (!env.NOTION_TASK_DB_ID) return 'NOTION_TASK_DB_ID'
  if (!env.NOTION_PROJECT_DB_ID) return 'NOTION_PROJECT_DB_ID'
  return null
}

export function isSensitivePath(path: string): boolean {
  return (
    path === '/line/webhook' ||
    path === '/projects' ||
    path === '/meta' ||
    path === '/admin/line/reminders/send' ||
    path === '/tasks' ||
    path === '/uploads/presign' ||
    path === '/uploads/events' ||
    path === '/uploads/sessions' ||
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

export function buildResponseHeaders(context: ResponseContext): Headers {
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

export function jsonResponse(body: unknown, status: number, context: ResponseContext): Response {
  const headers = buildResponseHeaders(context)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

export function emptyResponse(status: number, context: ResponseContext): Response {
  const headers = buildResponseHeaders(context)
  return new Response('', { status, headers })
}

export function isSimpleAlphabetDisplayName(value: string | undefined): boolean {
  if (!value) return false
  return /^[A-Za-z]$/.test(value.trim())
}

export function toIsoDateFromYyMmDd(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null
  const year = 2000 + Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return parseIsoDate(iso) ? iso : null
}

export function parseMeetingTitleMetadata(input: string): { title: string; meetingDate: string | null } {
  const withoutExtension = input.replace(/\.[a-z0-9]{2,5}$/i, '').trim()
  const compact = withoutExtension.replace(/\s+/g, ' ').trim()
  const match = compact.match(/^(\d{6})(?:[\s_-]+(.*))?$/)
  if (!match) {
    return {
      title: compact || '\uD68C\uC758\uB85D',
      meetingDate: null,
    }
  }

  const isoDate = toIsoDateFromYyMmDd(match[1])
  const tailTitle = (match[2] ?? '').trim()
  if (!isoDate) {
    return {
      title: compact || '\uD68C\uC758\uB85D',
      meetingDate: null,
    }
  }
  return {
    title: tailTitle || compact || '\uD68C\uC758\uB85D',
    meetingDate: isoDate,
  }
}

export function extractFilenameFromAudioKey(audioKey: string): string {
  const raw = audioKey.split('/').filter(Boolean).pop() ?? 'recording.m4a'
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function parseMeetingKeywordLimit(env: Env): number {
  return parseBoundedInt(asString(env.MEETING_KEYWORD_LIMIT), DEFAULT_MEETING_KEYWORD_LIMIT, MIN_MEETING_KEYWORD_LIMIT, MAX_MEETING_KEYWORD_LIMIT)
}

export function parseAssemblySpeechModels(env: Env): string[] {
  const configured = asString(env.ASSEMBLYAI_SPEECH_MODELS)
  if (!configured) return [...DEFAULT_ASSEMBLY_SPEECH_MODELS]
  const list = configured
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  return list.length > 0 ? Array.from(new Set(list)) : [...DEFAULT_ASSEMBLY_SPEECH_MODELS]
}

export function getAssemblyApiKey(env: Env): string {
  const apiKey = asString(env.ASSEMBLYAI_API_KEY)
  if (!apiKey) throw new Error('assemblyai_api_key_missing')
  return apiKey
}

export function getAssemblyWebhookSecret(env: Env): string {
  const secret = asString(env.ASSEMBLYAI_WEBHOOK_SECRET)
  if (!secret) throw new Error('assemblyai_webhook_secret_missing')
  return secret
}

export function getMeetingAudioBucket(env: Env): NonNullable<Env['MEETING_AUDIO_BUCKET']> {
  const bucket = env.MEETING_AUDIO_BUCKET
  if (!bucket) throw new Error('meeting_audio_bucket_missing')
  return bucket
}

export function requireMeetingsDb(env: Env): NonNullable<Env['CHECKLIST_DB']> {
  if (!env.CHECKLIST_DB) {
    throw new Error('meetings_db_not_configured')
  }
  return env.CHECKLIST_DB
}

export function hasChecklistDb(env: Env): boolean {
  return Boolean(env.CHECKLIST_DB)
}

export async function assemblyRequest<T>(
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

export function getGeminiApiKey(env: Env): string {
  const apiKey = asString(env.GOOGLE_AI_API_KEY) ?? asString(env.GEMINI_API_KEY)
  if (!apiKey) throw new Error('google_ai_studio_api_key_missing')
  return apiKey
}

export function getGeminiImageModel(env: Env): string {
  return asString(env.GEMINI_IMAGE_MODEL) ?? DEFAULT_GEMINI_IMAGE_MODEL
}

export function getMeetingNotionDbId(env: Env): string {
  const configured = asString(env.NOTION_MEETING_DB_ID)
  if (configured && normalizeNotionId(configured) !== normalizeNotionId(FIXED_MEETING_NOTION_DB_ID)) {
    throw new Error('notion_meeting_db_id_mismatch')
  }
  return FIXED_MEETING_NOTION_DB_ID
}

export function normalizeUtterances(raw: unknown): Array<{ speaker: string; text: string; start: number | null; end: number | null }> {
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

export function toTimestampLabel(ms: number | null): string {
  if (!Number.isFinite(ms ?? NaN) || (ms ?? -1) < 0) return ''
  const totalSeconds = Math.floor((ms as number) / 1000)
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export function toUtteranceTimestampRange(start: number | null, end: number | null): string {
  const from = toTimestampLabel(start)
  const to = toTimestampLabel(end)
  if (from && to) return `[${from}-${to}] `
  if (from) return `[${from}] `
  return ''
}

export function serializeRichTextPlainText(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const propRecord = prop as Record<string, unknown>
  if (asString(propRecord.type) !== 'rich_text') return ''
  const richText = Array.isArray(propRecord.rich_text) ? (propRecord.rich_text as unknown[]) : []
  return richText
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      return asString((entry as Record<string, unknown>).plain_text) ?? ''
    })
    .join('')
    .trim()
}
