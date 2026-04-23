import type { Env } from '../types'
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
const TREE_KEYWORD = '__NAS_TREE__'

let nasTreeDbInitInFlight: Promise<void> | null = null

function requireNasTreeDb(env: Env): NonNullable<Env['CHECKLIST_DB']> {
  if (!env.CHECKLIST_DB) {
    throw new Error('nas_tree_db_not_configured')
  }
  return env.CHECKLIST_DB
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
  const normalized = items
    .map((item: any, index: number) => ({
      path: asString(item?.path),
      name: asString(item?.name),
      parentPath: asString(item?.parentPath) ?? '',
      nodeType: asString(item?.nodeType) === 'file' ? 'file' : 'folder',
      comment: asString(item?.comment),
      sortOrder: Number(item?.sortOrder ?? index),
    }))
    .filter((item): item is SharedTreeNodeItem => (
      typeof item.path === 'string'
      && item.path.length > 0
      && typeof item.name === 'string'
      && item.name.length > 0
      && typeof item.parentPath === 'string'
      && Number.isFinite(item.sortOrder)
    ))

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

function getTextProperty(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return (prop.title ?? []).map((entry: any) => entry.plain_text ?? '').join('')
  if (prop.type === 'rich_text') return (prop.rich_text ?? []).map((entry: any) => entry.plain_text ?? '').join('')
  return ''
}

function toTreeItemFromNotion(page: any): SharedTreeNodeItem | null {
  const props = (page?.properties ?? {}) as Record<string, any>
  const keyword = getTextProperty(props['키워드'])
  if (keyword !== TREE_KEYWORD) return null

  const pathValue = getTextProperty(props['추천 경로'])
  if (!pathValue) return null

  const rawMeta = getTextProperty(props['비고'])
  let meta: Record<string, unknown> = {}
  try {
    meta = rawMeta ? JSON.parse(rawMeta) : {}
  } catch {
    meta = {}
  }

  const derivedName = pathValue.split('/').filter(Boolean).at(-1) ?? ''
  const name = asString(meta.name) ?? derivedName
  if (!name) return null

  return {
    path: pathValue,
    name,
    parentPath: asString(meta.parentPath) ?? '',
    nodeType: asString(meta.nodeType) === 'file' ? 'file' : 'folder',
    comment: asString(meta.comment),
    sortOrder: Number(meta.sortOrder ?? 0),
    updatedAt: asString(page?.last_edited_time) ?? '',
  }
}

async function loadSeedItemsFromNotion(env: Env): Promise<SharedTreeNodeItem[]> {
  const dbId = env.NOTION_PATH_MAPPING_DB_ID
  const notionToken = env.NOTION_TOKEN
  if (!dbId || !notionToken) return []

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      page_size: 100,
      filter: {
        property: '키워드',
        title: { equals: TREE_KEYWORD },
      },
    }),
  })
  const data: any = await res.json().catch(() => null)
  if (!res.ok) {
    const message = asString(data?.message) || asString(data?.code) || 'notion_query_failed'
    throw new Error(`nas_tree_seed_failed:${message}`)
  }

  const items = Array.isArray(data?.results)
    ? data.results.map((page: any) => toTreeItemFromNotion(page)).filter((item): item is SharedTreeNodeItem => Boolean(item))
    : []
  return normalizeTreeItems(items)
}

async function persistNasTreeState(
  env: Env,
  items: SharedTreeNodeItem[],
  updatedBy: string,
  source: 'manual' | 'notion_bootstrap',
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
    return []
  }
}

async function loadNasTreeItems(env: Env): Promise<SharedTreeNodeItem[]> {
  await ensureNasTreeTables(env)
  const existing = await readNasTreeState(env)
  if (existing) return existing

  const seedItems = await loadSeedItemsFromNotion(env)
  await persistNasTreeState(env, seedItems, 'notion-bootstrap', 'notion_bootstrap')
  return (await readNasTreeState(env)) ?? []
}

export async function handleNasTreeRoutes(
  request: Request,
  path: string,
  env: Env,
  respond: Respond,
): Promise<Response | null> {
  if (path !== '/nas-tree') return null

  if (request.method === 'GET') {
    const items = await loadNasTreeItems(env)
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
