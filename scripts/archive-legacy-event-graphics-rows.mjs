import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function parseArgs(argv) {
  const options = {
    envPath: DEFAULT_ENV_PATH,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--env') options.envPath = argv[index + 1] ?? options.envPath
  }

  return options
}

async function readEnvFile(envPath) {
  const raw = await fs.readFile(envPath, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    env[key] = value
  }
  return env
}

async function notionRequest(token, path, init = {}) {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`notion_http_${response.status}:${payload?.message ?? text}`)
  }

  return payload
}

async function queryAllPages(token, databaseId) {
  const results = []
  let startCursor = undefined

  while (true) {
    const payload = await notionRequest(token, `/databases/${databaseId}/query`, {
      method: 'POST',
      body: JSON.stringify(startCursor ? { start_cursor: startCursor, page_size: 100 } : { page_size: 100 }),
    })

    results.push(...(payload.results ?? []))
    if (!payload.has_more || !payload.next_cursor) break
    startCursor = payload.next_cursor
  }

  return results
}

function joinRichText(items) {
  if (!Array.isArray(items)) return ''
  return items.map((item) => item?.plain_text ?? '').join('').trim()
}

function extractTitleValue(page) {
  const properties = page?.properties ?? {}
  for (const prop of Object.values(properties)) {
    if (prop?.type === 'title') return joinRichText(prop.title ?? [])
  }
  return ''
}

function extractRichTextValue(prop) {
  if (!prop || typeof prop !== 'object') return ''
  if (prop.type === 'rich_text') return joinRichText(prop.rich_text ?? [])
  if (prop.type === 'title') return joinRichText(prop.title ?? [])
  return ''
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const env = await readEnvFile(options.envPath)
  const notionToken = env.NOTION_TOKEN
  const timetableDbId = env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!timetableDbId) throw new Error('NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID_missing')

  const pages = await queryAllPages(notionToken, timetableDbId)
  const operationTitles = new Set()
  for (const page of pages) {
    const operationKey = extractRichTextValue(page?.properties?.['운영 키'])
    const title = extractTitleValue(page)
    if (operationKey && title) operationTitles.add(title)
  }

  const archiveTargets = pages.filter((page) => {
    const title = extractTitleValue(page)
    const operationKey = extractRichTextValue(page?.properties?.['운영 키'])
    return !operationKey && title && operationTitles.has(title)
  })

  for (const page of archiveTargets) {
    await notionRequest(notionToken, `/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    })
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        total: pages.length,
        archived: archiveTargets.length,
        archivedTitles: archiveTargets.map((page) => extractTitleValue(page)),
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
