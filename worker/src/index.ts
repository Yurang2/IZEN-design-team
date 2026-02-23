import { NotionApi } from './notionApi'
import { NotionWorkService } from './notionWork'
import type { CreateTaskInput, Env, TaskRecord, TaskSnapshot, UpdateTaskInput } from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SNAPSHOT_CACHE_URL = 'https://cache.internal/notion-task-snapshot-v1'
const DEFAULT_CACHE_TTL_MS = 60_000

let snapshotInFlight: Promise<TaskSnapshot> | null = null

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
        const keyword = asString(url.searchParams.get('q')) ?? ''

        const allItems = await service.listChecklists()
        const availableCategories = unique(allItems.flatMap((item) => item.eventCategories)).sort((a, b) =>
          a.localeCompare(b, 'ko'),
        )

        const items = allItems.filter((item) => {
          const byCategory = eventCategory ? item.eventCategories.includes(eventCategory) : true
          if (!byCategory) return false
          if (!keyword) return true
          const source = `${item.productName} ${item.workCategory} ${item.finalDueText} ${item.eventCategories.join(' ')}`
          return containsText(source, keyword)
        })

        return ok(
          {
            ok: true,
            eventName,
            eventCategory,
            keyword,
            availableCategories,
            count: items.length,
            items,
            cacheTtlMs,
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
              'GET /api/checklists?eventName=...&eventCategory=...&q=...',
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
