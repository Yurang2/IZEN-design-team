import type {
  ChecklistAssignmentStatus,
  Env,
} from '../types'
import {
  asString,
  CHECKLIST_ASSIGNMENT_CACHE_URL,
  CHECKLIST_NOT_APPLICABLE_SENTINEL,
  hasChecklistDb,
  isLikelyNotionPageId,
  normalizeNotionId,
  parsePatchBody,
  parseIsoDate,
} from '../utils'

// ---- Module-level mutable state ----

let checklistDbInitInFlight: Promise<void> | null = null

export function pickChecklistOffset(
  item: Record<string, any>,
  operationMode: 'self' | 'dealer' | undefined,
  fulfillmentMode: 'domestic' | 'overseas' | 'dealer' | undefined,
): number | undefined {
  const normalizeOffset = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
    // Preserve DB sign semantics: negative = before base date, positive = after base date.
    return value
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

export function pickChecklistBaseDate(
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

export function resolveChecklistAssignedTaskId(taskPageId: string | null, validTaskIds?: Set<string>): string | null {
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

export function checklistAssignmentKey(eventCategory: string | undefined, itemId: string, projectId?: string): string {
  const projectKey = normalizeNotionId(projectId) || 'all_project'
  const category = (eventCategory ?? '').trim() || 'ALL'
  return `${projectKey}::${category}::${itemId}`
}

export function checklistMatrixKey(projectPageId: string, checklistItemPageId: string): string {
  return `${(projectPageId ?? '').trim()}::${(checklistItemPageId ?? '').trim()}`
}

export function decodeChecklistAssignmentValue(rawValue: string | undefined): { taskPageId: string | null; explicitNotApplicable: boolean } {
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

function checklistAssignmentCacheRequest(): Request {
  return new Request(CHECKLIST_ASSIGNMENT_CACHE_URL, { method: 'GET' })
}

export async function loadChecklistAssignmentsFromCache(): Promise<Record<string, string>> {
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

export async function writeChecklistAssignmentsToCache(assignments: Record<string, string>): Promise<void> {
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

export async function loadChecklistAssignmentsFromD1(env: Env): Promise<Record<string, string>> {
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

export async function loadChecklistAssignments(env: Env): Promise<{ assignments: Record<string, string>; mode: 'd1' | 'cache' }> {
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

export async function writeChecklistAssignmentToD1(
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

export async function listChecklistAssignmentLogs(
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

export function parseChecklistAssignmentBody(body: unknown): {
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
