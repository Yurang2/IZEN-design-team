import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import cors from 'cors'
import { config } from './config'
import { NotionWorkService } from './notionWork'

const corsHandler = cors({ origin: true, credentials: true })
const service = new NotionWorkService()

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CACHE_TTL_MS = Math.max(10_000, Math.min(30_000, Number(process.env.TASK_API_CACHE_MS ?? 15_000)))

type CacheEntry = {
  expiresAt: number
  value: unknown
}

const cache = new Map<string, CacheEntry>()

function getCached<T>(key: string): T | undefined {
  const now = Date.now()
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt < now) {
    cache.delete(key)
    return undefined
  }
  return hit.value as T
}

function setCached<T>(key: string, value: T): void {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  })
}

function invalidateCache(prefixes: string[]): void {
  for (const key of Array.from(cache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      cache.delete(key)
    }
  }
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function normalizePath(input: string): string {
  const cleaned = input.replace(/\/+$/, '') || '/'
  if (cleaned === '/api') return '/'
  if (cleaned.startsWith('/api/')) {
    return cleaned.slice(4) || '/'
  }
  return cleaned
}

function parsePageSize(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(100, Math.floor(parsed)))
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
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

function parseCreateBody(body: unknown): {
  taskName: string
  projectId?: string
  projectName?: string
  workType?: string
  status?: string
  assignee?: string[]
  requester?: string[]
  startDate?: string
  dueDate?: string
  detail?: string
  priority?: string
  urgent?: boolean
  issue?: string
} {
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

function parseUpdateBody(body: unknown): Record<string, unknown> {
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

  return parsed
}

function sendBadRequest(res: any, message: string): void {
  res.status(400).json({ ok: false, error: message })
}

async function handleApi(req: any, res: any): Promise<void> {
  const path = normalizePath(req.path ?? req.url ?? '/')

  if (req.method === 'GET' && path === '/projects') {
    const cacheKey = 'projects'
    const cached = getCached<any>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const data = await service.listProjects()
    const response = {
      ok: true,
      projects: data.projects,
      schema: service.getApiSchemaSummary(data.schema),
      cacheTtlMs: CACHE_TTL_MS,
    }

    setCached(cacheKey, response)
    res.json(response)
    return
  }

  if (req.method === 'GET' && path === '/tasks') {
    const projectId = asString(req.query?.projectId)
    const status = asString(req.query?.status)
    const q = asString(req.query?.q)
    const cursor = asString(req.query?.cursor)
    const pageSize = parsePageSize(req.query?.pageSize)

    const queryKey = JSON.stringify({ projectId, status, q, cursor, pageSize })
    const cacheKey = `tasks:${queryKey}`
    const cached = getCached<any>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const data = await service.listTasks({
      projectId,
      status,
      q,
      cursor,
      pageSize,
    })

    const response = {
      ok: true,
      tasks: data.tasks,
      nextCursor: data.nextCursor,
      hasMore: data.hasMore,
      schema: service.getApiSchemaSummary(data.schema),
      cacheTtlMs: CACHE_TTL_MS,
    }

    setCached(cacheKey, response)
    res.json(response)
    return
  }

  const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
  if (req.method === 'GET' && taskMatch) {
    const id = decodeURIComponent(taskMatch[1])
    const cacheKey = `task:${id}`
    const cached = getCached<any>(cacheKey)
    if (cached) {
      res.json(cached)
      return
    }

    const data = await service.getTask(id)
    const response = {
      ok: true,
      task: data.task,
      schema: service.getApiSchemaSummary(data.schema),
      cacheTtlMs: CACHE_TTL_MS,
    }

    setCached(cacheKey, response)
    res.json(response)
    return
  }

  if (req.method === 'POST' && path === '/tasks') {
    let payload: ReturnType<typeof parseCreateBody>
    try {
      payload = parseCreateBody(req.body)
    } catch (error: any) {
      sendBadRequest(res, error?.message ?? 'invalid_request')
      return
    }

    const created = await service.createTask(payload)
    invalidateCache(['tasks:', 'task:', 'projects'])

    res.status(201).json({
      ok: true,
      task: created.task,
      schema: service.getApiSchemaSummary(created.schema),
    })
    return
  }

  if (req.method === 'PATCH' && taskMatch) {
    const id = decodeURIComponent(taskMatch[1])
    let patch: Record<string, unknown>

    try {
      patch = parseUpdateBody(req.body)
    } catch (error: any) {
      sendBadRequest(res, error?.message ?? 'invalid_patch')
      return
    }

    const updated = await service.updateTask(id, patch)
    invalidateCache(['tasks:', 'projects'])
    cache.delete(`task:${id}`)

    res.json({
      ok: true,
      task: updated.task,
      schema: service.getApiSchemaSummary(updated.schema),
    })
    return
  }

  res.status(404).json({
    ok: false,
    error: 'not_found',
    path,
    supported: [
      'GET /api/projects',
      'GET /api/tasks?projectId=...&status=...&q=...&cursor=...&pageSize=...',
      'GET /api/tasks/:id',
      'POST /api/tasks',
      'PATCH /api/tasks/:id',
    ],
  })
}

export const api = onRequest({ region: config.region }, (req: any, res: any) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      await handleApi(req, res)
    } catch (error: any) {
      logger.error('api_error', {
        method: req.method,
        path: req.path,
        message: error?.message,
      })

      const status = error?.code === 'object_not_found' ? 404 : 500
      res.status(status).json({
        ok: false,
        error: status === 404 ? 'not_found' : 'internal_error',
        message: error?.message ?? 'unknown_error',
      })
    }
  })
})
