import { NotionApi } from './notionApi'
import { NotionWorkService } from './notionWork'
import type { CreateTaskInput, Env, TaskRecord, TaskSnapshot, UpdateTaskInput } from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SNAPSHOT_CACHE_URL = 'https://cache.internal/notion-task-snapshot-v1'
const CHECKLIST_ASSIGNMENT_CACHE_URL = 'https://cache.internal/checklist-assignment-v1'
const DEFAULT_CACHE_TTL_MS = 60_000
const KR_HOLIDAY_JSON_URL = 'https://holidays.hyunbin.page/basic.json'
const KR_HOLIDAY_CACHE_MS = 12 * 60 * 60 * 1000
const DEFAULT_LOG_LIMIT = 100
const DEFAULT_EXPORT_LOG_LIMIT = 1000

let snapshotInFlight: Promise<TaskSnapshot> | null = null
let holidayCache: { expiresAt: number; dates: Set<string> } | null = null
let checklistDbInitInFlight: Promise<void> | null = null

function requiredEnv(env: Env): string | null {
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
  if (fulfillmentMode === 'dealer' && typeof item.dealerOffsetBusinessDays === 'number') {
    return item.dealerOffsetBusinessDays
  }
  if (fulfillmentMode === 'overseas' && typeof item.overseasOffsetBusinessDays === 'number') {
    return item.overseasOffsetBusinessDays
  }
  if (fulfillmentMode === 'domestic' && typeof item.domesticOffsetBusinessDays === 'number') {
    return item.domesticOffsetBusinessDays
  }
  if (operationMode === 'dealer' && typeof item.dealerOffsetBusinessDays === 'number') {
    return item.dealerOffsetBusinessDays
  }
  if (typeof item.defaultOffsetBusinessDays === 'number') {
    return item.defaultOffsetBusinessDays
  }
  if (typeof item.totalLeadDays === 'number') {
    return -item.totalLeadDays
  }
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

function checklistAssignmentKey(eventCategory: string | undefined, itemId: string, projectId?: string): string {
  const projectKey = normalizeNotionId(projectId) || 'all_project'
  const category = (eventCategory ?? '').trim() || 'ALL'
  return `${projectKey}::${category}::${itemId}`
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

function makeCorsHeaders(origin: string | null): Headers {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', origin ?? '*')
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Vary', 'Origin')
  return headers
}

function json(body: unknown, status: number, origin: string | null): Response {
  const headers = makeCorsHeaders(origin)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status, headers })
}

function ok(body: unknown, origin: string | null): Response {
  return json(body, 200, origin)
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin')

    if (request.method === 'OPTIONS') {
      return new Response('', { status: 204, headers: makeCorsHeaders(origin) })
    }

    const missing = requiredEnv(env)
    if (missing) {
      return json({ ok: false, error: 'config_missing', message: `Missing environment variable: ${missing}` }, 500, origin)
    }

    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
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
            },
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
        const availableCategories = unique(allItems.flatMap((item) => item.eventCategories)).sort((a, b) =>
          a.localeCompare(b, 'ko'),
        )

        const items = allItems
          .filter((item) => {
            const byCategory = eventCategory ? item.eventCategories.includes(eventCategory) : true
            if (!byCategory) return false
            return true
          })
          .map((item) => {
            const baseDate = pickChecklistBaseDate(item, eventDate, undefined, shippingDate)
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
        let payload: Record<string, unknown>
        try {
          payload = parsePatchBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const itemId = asString(payload.itemId)
        const eventCategory = asString(payload.eventCategory)
        const projectId = asString(payload.projectId)
        const taskId = asString(payload.taskId)
        if (!itemId) {
          return json({ ok: false, error: 'itemId_required' }, 400, origin)
        }

        const loaded = await loadChecklistAssignments(env)
        const assignments = loaded.assignments
        const key = checklistAssignmentKey(eventCategory, itemId, projectId)
        const legacyKey = `${(eventCategory ?? '').trim() || 'ALL'}::${itemId}`
        const previousTaskId = assignments[key] ?? assignments[legacyKey]
        if (key !== legacyKey) {
          delete assignments[legacyKey]
        }
        if (taskId) assignments[key] = taskId
        else delete assignments[key]

        if (loaded.mode === 'd1') {
          const actor = asString(payload.actor)
          await writeChecklistAssignmentToD1(env, request, {
            key,
            projectId: normalizeNotionId(projectId),
            eventCategory: eventCategory ?? '',
            itemId,
            taskId,
            previousTaskId,
            actor,
          })
        } else {
          ctx.waitUntil(writeChecklistAssignmentsToCache(assignments))
        }

        return ok(
          {
            ok: true,
            key,
            taskId: assignments[key] ?? null,
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
              'GET /api/projects',
              'GET /api/meta',
              'GET /api/checklists?eventName=...&eventCategory=...',
              'GET /api/checklist-assignments',
              'GET /api/checklist-assignments/export?logLimit=1000',
              'GET /api/checklist-assignment-logs?limit=100',
              'POST /api/checklist-assignments',
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
