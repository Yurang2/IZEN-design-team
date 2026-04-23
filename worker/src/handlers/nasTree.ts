import type { Env } from '../types'
import { LEGACY_NAS_TREE_SEED } from '../data/nasTreeSeed'
import { asString, readJsonBody } from '../utils'

export type SharedTreeNodeItem = {
  path: string
  name: string
  parentPath: string
  nodeType: 'folder' | 'file'
  comment?: string
  sortOrder: number
  updatedAt?: string
}

type Respond = {
  json: (body: unknown, status: number) => Response
  ok: (body: unknown) => Response
}

type StoredNasTreeRow = {
  tree_json?: unknown
  updated_at?: unknown
}

const NAS_TREE_STATE_KEY = 'shared'

let nasTreeDbInitInFlight: Promise<void> | null = null

function requireNasTreeDb(env: Env): NonNullable<Env['NAS_TREE_DB']> {
  if (!env.NAS_TREE_DB) {
    throw new Error('nas_tree_db_not_configured')
  }
  return env.NAS_TREE_DB
}

async function ensureNasTreeTables(env: Env): Promise<void> {
  const db = requireNasTreeDb(env)
  if (nasTreeDbInitInFlight) {
    await nasTreeDbInitInFlight
    return
  }

  nasTreeDbInitInFlight = (async () => {
    await db.prepare(
      `CREATE TABLE IF NOT EXISTS nas_tree_state (
        tree_key TEXT PRIMARY KEY,
        tree_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        updated_by TEXT,
        source TEXT NOT NULL DEFAULT 'manual'
      )`,
    ).bind().run()
  })()

  try {
    await nasTreeDbInitInFlight
  } catch (error) {
    nasTreeDbInitInFlight = null
    throw error
  }
}

function toActorLabel(request: Request): string {
  const accessEmail = asString(request.headers.get('CF-Access-Authenticated-User-Email'))
  if (accessEmail) return accessEmail.slice(0, 120)

  const userName = asString(request.headers.get('X-User-Name'))
  if (userName) return userName.slice(0, 120)

  return 'unknown'
}

function normalizeTreeItems(items: unknown[]): SharedTreeNodeItem[] {
  const normalized: SharedTreeNodeItem[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item: any = items[index]
    const path = asString(item?.path)
    const name = asString(item?.name)
    const parentPath = asString(item?.parentPath) ?? ''
    const sortOrder = Number(item?.sortOrder ?? index)
    if (!path || !name || !Number.isFinite(sortOrder)) continue
    normalized.push({
      path,
      name,
      parentPath,
      nodeType: asString(item?.nodeType) === 'file' ? 'file' : 'folder',
      comment: asString(item?.comment),
      sortOrder,
    })
  }

  normalized.sort((a, b) => {
    if (a.parentPath !== b.parentPath) return a.parentPath.localeCompare(b.parentPath)
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.path.localeCompare(b.path)
  })

  return normalized
}

function validateTreeItems(items: SharedTreeNodeItem[], respond: Respond): Response | null {
  const duplicatePath = items.find((item, index) => items.findIndex((candidate) => candidate.path === item.path) !== index)
  if (duplicatePath) {
    return respond.json({ ok: false, error: 'duplicate_path', path: duplicatePath.path }, 400)
  }

  const missingParent = items.find((item) => item.parentPath && !items.some((candidate) => candidate.path === item.parentPath))
  if (missingParent) {
    return respond.json({ ok: false, error: 'missing_parent', path: missingParent.path, parentPath: missingParent.parentPath }, 400)
  }

  return null
}

async function persistNasTreeState(
  env: Env,
  items: SharedTreeNodeItem[],
  updatedBy: string,
  source: 'manual' | 'seed',
): Promise<void> {
  const db = requireNasTreeDb(env)
  const now = Date.now()
  await db.prepare(
    `INSERT INTO nas_tree_state (tree_key, tree_json, updated_at, updated_by, source)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tree_key) DO UPDATE SET
       tree_json = excluded.tree_json,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by,
       source = excluded.source`,
  )
    .bind(NAS_TREE_STATE_KEY, JSON.stringify(items), now, updatedBy, source)
    .run()
}

async function readNasTreeState(env: Env): Promise<SharedTreeNodeItem[] | null> {
  const db = requireNasTreeDb(env)
  const result = await db.prepare(
    `SELECT tree_json, updated_at
     FROM nas_tree_state
     WHERE tree_key = ?
     LIMIT 1`,
  ).bind(NAS_TREE_STATE_KEY).first<StoredNasTreeRow>()

  const rawJson = typeof result?.tree_json === 'string' ? result.tree_json : null
  if (!rawJson) return null

  try {
    const parsed = JSON.parse(rawJson)
    const items = normalizeTreeItems(Array.isArray(parsed) ? parsed : [])
    const updatedAt = typeof result?.updated_at === 'number'
      ? new Date(result.updated_at).toISOString()
      : undefined
    return items.map((item) => ({ ...item, updatedAt }))
  } catch {
    throw new Error('nas_tree_invalid_json')
  }
}

async function readOrSeedNasTreeState(env: Env): Promise<SharedTreeNodeItem[]> {
  const seeded = normalizeTreeItems(LEGACY_NAS_TREE_SEED)
  const existing = await readNasTreeState(env)
  if (!existing || existing.length === 0) {
    await persistNasTreeState(env, seeded, 'system-legacy-seed', 'seed')
    return (await readNasTreeState(env)) ?? seeded
  }

  const existingPaths = new Set(existing.map((item) => item.path))
  const hasAllSeededPaths = seeded.every((item) => existingPaths.has(item.path))
  if (hasAllSeededPaths) return existing

  const mergedMap = new Map<string, SharedTreeNodeItem>()
  for (const item of seeded) mergedMap.set(item.path, item)
  for (const item of existing) mergedMap.set(item.path, item)
  const merged = normalizeTreeItems(Array.from(mergedMap.values()))
  await persistNasTreeState(env, merged, 'system-legacy-merge', 'seed')
  return (await readNasTreeState(env)) ?? merged
}

export async function handleNasTreeRoutes(
  request: Request,
  path: string,
  env: Env,
  respond: Respond,
): Promise<Response | null> {
  if (path !== '/nas-tree') return null

  if (request.method === 'GET') {
    await ensureNasTreeTables(env)
    const items = await readOrSeedNasTreeState(env)
    return respond.ok({ ok: true, items })
  }

  if (request.method === 'PUT') {
    await ensureNasTreeTables(env)
    const body = await readJsonBody(request) as Record<string, unknown>
    const items = Array.isArray(body.items) ? body.items : []
    const normalized = normalizeTreeItems(items)
    const validationError = validateTreeItems(normalized, respond)
    if (validationError) return validationError

    await persistNasTreeState(env, normalized, toActorLabel(request), 'manual')
    const stored = await readNasTreeState(env)
    return respond.ok({ ok: true, count: normalized.length, items: stored ?? [] })
  }

  return null
}
