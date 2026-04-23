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

const TREE_JSON_KEYWORD = '__NAS_TREE_JSON__'
const LEGACY_TREE_KEYWORD = '__NAS_TREE__'
const TREE_JSON_PATH = '__nas_tree_json__'
const NOTION_RICH_TEXT_CHUNK = 1800

function notionHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }
}

function getPathMappingDbId(env: Env): string | null {
  return env.NOTION_PATH_MAPPING_DB_ID ?? null
}

function getTextProperty(prop: any): string {
  if (!prop) return ''
  if (prop.type === 'title') return (prop.title ?? []).map((entry: any) => entry.plain_text ?? '').join('')
  if (prop.type === 'rich_text') return (prop.rich_text ?? []).map((entry: any) => entry.plain_text ?? '').join('')
  return ''
}

function buildRichTextChunks(text: string): Array<{ text: { content: string } }> {
  const source = text || '[]'
  const chunks: Array<{ text: { content: string } }> = []
  for (let i = 0; i < source.length; i += NOTION_RICH_TEXT_CHUNK) {
    chunks.push({ text: { content: source.slice(i, i + NOTION_RICH_TEXT_CHUNK) } })
  }
  return chunks.length > 0 ? chunks : [{ text: { content: '[]' } }]
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

function toTreeItemFromLegacyRow(page: any): SharedTreeNodeItem | null {
  const props = (page?.properties ?? {}) as Record<string, any>
  const keyword = getTextProperty(props['키워드'])
  if (keyword !== LEGACY_TREE_KEYWORD) return null

  const pathValue = getTextProperty(props['추천 경로'])
  if (!pathValue) return null

  const rawMeta = getTextProperty(props['비고'])
  let meta: Record<string, unknown> = {}
  try {
    meta = rawMeta ? JSON.parse(rawMeta) : {}
  } catch {
    meta = {}
  }

  const pathSegments = pathValue.split('/').filter(Boolean)
  const derivedName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : ''
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

async function notionJson(target: string, init: RequestInit, errorCode: string): Promise<any> {
  const res = await fetch(target, init)
  const data: any = await res.json().catch(() => null)
  if (!res.ok) {
    const message = asString(data?.message) || asString(data?.code) || errorCode
    throw new Error(`${errorCode}:${message}`)
  }
  return data
}

async function findStoragePage(env: Env): Promise<any | null> {
  const dbId = getPathMappingDbId(env)
  if (!dbId) return null

  const data = await notionJson(
    `https://api.notion.com/v1/databases/${dbId}/query`,
    {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify({
        page_size: 10,
        filter: {
          property: '키워드',
          title: { equals: TREE_JSON_KEYWORD },
        },
      }),
    },
    'nas_tree_storage_query_failed',
  )

  return Array.isArray(data?.results) ? data.results[0] ?? null : null
}

async function loadLegacySeedItems(env: Env): Promise<SharedTreeNodeItem[]> {
  const dbId = getPathMappingDbId(env)
  if (!dbId) return []

  const data = await notionJson(
    `https://api.notion.com/v1/databases/${dbId}/query`,
    {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify({
        page_size: 100,
        filter: {
          property: '키워드',
          title: { equals: LEGACY_TREE_KEYWORD },
        },
      }),
    },
    'nas_tree_seed_query_failed',
  )

  const items = Array.isArray(data?.results)
    ? data.results.map((page: any) => toTreeItemFromLegacyRow(page)).filter((item): item is SharedTreeNodeItem => Boolean(item))
    : []
  return normalizeTreeItems(items)
}

async function createStoragePage(env: Env, items: SharedTreeNodeItem[], actor: string, source: string): Promise<any> {
  const dbId = getPathMappingDbId(env)
  if (!dbId) throw new Error('nas_tree_notion_db_not_configured')

  const payload = JSON.stringify(items)
  return notionJson(
    'https://api.notion.com/v1/pages',
    {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          '키워드': { title: [{ text: { content: TREE_JSON_KEYWORD } }] },
          '추천 경로': { rich_text: [{ text: { content: TREE_JSON_PATH } }] },
          '비고': { rich_text: buildRichTextChunks(payload) },
        },
      }),
    },
    `nas_tree_create_failed:${source}:${actor}`,
  )
}

async function updateStoragePage(env: Env, pageId: string, items: SharedTreeNodeItem[], actor: string): Promise<any> {
  const payload = JSON.stringify(items)
  return notionJson(
    `https://api.notion.com/v1/pages/${pageId}`,
    {
      method: 'PATCH',
      headers: notionHeaders(env),
      body: JSON.stringify({
        properties: {
          '키워드': { title: [{ text: { content: TREE_JSON_KEYWORD } }] },
          '추천 경로': { rich_text: [{ text: { content: TREE_JSON_PATH } }] },
          '비고': { rich_text: buildRichTextChunks(payload) },
        },
      }),
    },
    `nas_tree_update_failed:${actor}`,
  )
}

async function ensureStoragePage(env: Env): Promise<any | null> {
  const existing = await findStoragePage(env)
  if (existing) return existing

  const seedItems = await loadLegacySeedItems(env)
  return createStoragePage(env, seedItems, 'notion-bootstrap', 'seed')
}

async function readNasTreeState(env: Env): Promise<SharedTreeNodeItem[]> {
  const storagePage = await ensureStoragePage(env)
  if (!storagePage) return []

  const props = (storagePage.properties ?? {}) as Record<string, any>
  const rawJson = getTextProperty(props['비고'])
  if (!rawJson) return []

  try {
    const parsed = JSON.parse(rawJson)
    const items = normalizeTreeItems(Array.isArray(parsed) ? parsed : [])
    const updatedAt = asString(storagePage.last_edited_time) ?? undefined
    return items.map((item) => ({ ...item, updatedAt }))
  } catch {
    throw new Error('nas_tree_invalid_json')
  }
}

export async function handleNasTreeRoutes(
  request: Request,
  path: string,
  env: Env,
  respond: Respond,
): Promise<Response | null> {
  if (path !== '/nas-tree') return null

  if (request.method === 'GET') {
    const items = await readNasTreeState(env)
    return respond.ok({ ok: true, items })
  }

  if (request.method === 'PUT') {
    const body = await readJsonBody(request) as Record<string, unknown>
    const items = Array.isArray(body.items) ? body.items : []
    const normalized = normalizeTreeItems(items)
    const validationError = validateTreeItems(normalized, respond)
    if (validationError) return validationError

    const storagePage = await ensureStoragePage(env)
    if (!storagePage?.id) throw new Error('nas_tree_storage_missing')

    await updateStoragePage(env, storagePage.id, normalized, toActorLabel(request))
    const stored = await readNasTreeState(env)
    return respond.ok({ ok: true, count: normalized.length, items: stored })
  }

  return null
}
