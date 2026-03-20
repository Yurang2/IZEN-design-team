import { NotionApi } from '../notionApi'
import { NotionWorkService } from '../notionWork'
import type {
  CreateTaskInput,
  Env,
  TaskRecord,
  TaskSnapshot,
  UpdateTaskInput,
} from '../types'
import {
  asString,
  containsText,
  getCacheTtlMs,
  hasOwn,
  normalizeNotionId,
  parseDate,
  parsePatchBody,
  parseStringArray,
  SNAPSHOT_CACHE_URL,
} from '../utils'

// ---- Module-level mutable state ----

let snapshotInFlight: Promise<TaskSnapshot> | null = null

export function cacheRequest(): Request {
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

export async function getSnapshot(service: NotionWorkService, env: Env, ctx: ExecutionContext): Promise<TaskSnapshot> {
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

export function invalidateSnapshotCache(ctx: ExecutionContext): void {
  ctx.waitUntil(caches.default.delete(cacheRequest()))
}

type ResponseContext = {
  requestOrigin: string | null
  corsOrigin: string | null
  path: string
}

export function filterTasks(tasks: TaskRecord[], projectId?: string, status?: string, q?: string): TaskRecord[] {
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
      const source = `${task.taskName} ${task.detail} ${task.issue ?? ''} ${task.predecessorTask ?? ''} ${task.outputLink ?? ''} ${task.projectName} ${task.workType} ${task.status} ${task.assignee.join(' ')} ${task.requester.join(' ')}`
      if (!containsText(source, q)) return false
    }

    return true
  })
}

export function paginate<T>(items: T[], cursor: string | undefined, pageSize: number): {
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

export function serviceFromEnv(env: Env): NotionWorkService {
  const api = new NotionApi(env)
  return new NotionWorkService(api, env)
}

export function parseCreateBody(body: unknown): CreateTaskInput {
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

export function parseUpdateBody(body: unknown): UpdateTaskInput {
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
