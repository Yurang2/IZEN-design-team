import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

const TARGET_TITLES = new Set([
  '[2026 IZEN Seminar in Bangkok] 04 등장 - Lecture 1 Certi',
  '[2026 IZEN Seminar in Bangkok] 07 등장 - Lecture 2 Certi',
  '[2026 IZEN Seminar in Bangkok] 10 등장 - Lecture 3 Certi',
  '[2026 IZEN Seminar in Bangkok] 13 등장 - Lecture 4 Certi',
  '[2026 IZEN Seminar in Bangkok] 14 등장 - Closing & Commemorative Photo',
])

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
    env[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim()
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
  const payload = text ? JSON.parse(text) : {}
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const env = await readEnvFile(options.envPath)
  const notionToken = env.NOTION_TOKEN
  const timetableDbId = env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!timetableDbId) throw new Error('NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID_missing')

  const pages = await queryAllPages(notionToken, timetableDbId)
  let archived = 0

  for (const page of pages) {
    if (!page?.id || page.archived || page.in_trash) continue
    const title = extractTitleValue(page)
    if (!TARGET_TITLES.has(title)) continue

    await notionRequest(notionToken, `/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    })
    archived += 1
  }

  console.log(JSON.stringify({ ok: true, archived }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
