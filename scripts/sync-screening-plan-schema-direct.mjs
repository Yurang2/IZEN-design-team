import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DATABASE_TITLE = '\uC601\uC0C1 \uD3B8\uC131 \uC900\uBE44 DB'
const TITLE_FIELD = '\uC81C\uBAA9'
const PROJECT_FIELD = '\uADC0\uC18D \uD504\uB85C\uC81D\uD2B8'
const RELATED_TASK_FIELD = '\uAD00\uB828 \uC5C5\uBB34'
const EVENT_FIELD = '\uD589\uC0AC\uBA85'
const DATE_FIELD = '\uC0C1\uC601\uC77C'
const ORDER_FIELD = '\uC0C1\uC601 \uC21C\uC11C'
const SCREEN_FIELD = '\uC2A4\uD06C\uB9B0/\uAD6C\uC5ED'
const THUMBNAIL_FIELD = '\uB300\uD45C \uC774\uBBF8\uC9C0'
const SOURCE_NAME_FIELD = '\uBCC0\uD658 \uC804 \uD30C\uC77C\uBA85'
const TARGET_OUTPUT_FIELD = '\uBAA9\uD45C \uC0C1\uC601 \uD30C\uC77C\uBA85'
const ACTUAL_OUTPUT_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uD30C\uC77C\uBA85'
const ASPECT_RATIO_FIELD = '\uD654\uBA74 \uBE44\uC728'
const STATUS_FIELD = '\uC0C1\uD0DC'
const HISTORY_SYNCED_FIELD = '\uD788\uC2A4\uD1A0\uB9AC \uBC18\uC601'
const HISTORY_PAGE_ID_FIELD = '\uD788\uC2A4\uD1A0\uB9AC \uD398\uC774\uC9C0 ID'
const ACTUAL_PLAYED_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uC5EC\uBD80'
const ACTUAL_ORDER_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uC21C\uC11C'
const ISSUE_REASON_FIELD = '\uC774\uC288 \uC0AC\uC720'
const BASE_HISTORY_FIELD = '\uAE30\uC900 \uC0C1\uC601 \uAE30\uB85D'
const BASE_USAGE_MODE_FIELD = '\uAE30\uC900 \uD65C\uC6A9 \uBC29\uC2DD'
const REVIEW_STATUS_FIELD = '\uCD5C\uC2E0\uD654 \uAC80\uD1A0 \uC0C1\uD0DC'
const REVIEW_NOTE_FIELD = '\uCD5C\uC2E0\uD654 \uAC80\uD1A0 \uBA54\uBAA8'
const STATUS_OPTIONS = [
  { name: 'planned', color: 'gray' },
  { name: 'editing', color: 'yellow' },
  { name: 'ready', color: 'green' },
  { name: 'locked', color: 'blue' },
  { name: 'completed', color: 'purple' },
  { name: 'cancelled', color: 'red' },
]
const BASE_USAGE_MODE_OPTIONS = [
  { name: 'reference', color: 'gray' },
  { name: 'reuse_with_edit', color: 'blue' },
  { name: 'replace', color: 'red' },
]
const REVIEW_STATUS_OPTIONS = [
  { name: 'pending', color: 'gray' },
  { name: 'reviewed_ok', color: 'green' },
  { name: 'needs_update', color: 'orange' },
  { name: 'updated', color: 'blue' },
  { name: 'replaced', color: 'purple' },
]

function parseArgs(argv) {
  const options = { envPath: DEFAULT_ENV_PATH }
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
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }
  if (!response.ok) throw new Error(`notion_http_${response.status}:${payload?.message ?? text}`)
  return payload
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function parseDbTitle(db) {
  return (db?.title ?? []).map((item) => item?.plain_text ?? '').join('').trim()
}

function buildPropertyDefinitions(projectDatabaseId, taskDatabaseId, historyDatabaseId) {
  const definitions = [
    {
      name: PROJECT_FIELD,
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    {
      name: RELATED_TASK_FIELD,
      definition: {
        relation: {
          database_id: taskDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: EVENT_FIELD, definition: { rich_text: {} } },
    { name: DATE_FIELD, definition: { date: {} } },
    { name: ORDER_FIELD, definition: { number: { format: 'number' } } },
    { name: SCREEN_FIELD, definition: { rich_text: {} } },
    { name: THUMBNAIL_FIELD, definition: { files: {} } },
    { name: SOURCE_NAME_FIELD, definition: { rich_text: {} } },
    { name: TARGET_OUTPUT_FIELD, definition: { rich_text: {} } },
    { name: ACTUAL_OUTPUT_FIELD, definition: { rich_text: {} } },
    {
      name: ASPECT_RATIO_FIELD,
      definition: {
        select: {
          options: [
            { name: '16:9', color: 'blue' },
            { name: '9:16', color: 'green' },
            { name: '1:1', color: 'gray' },
            { name: '21:9', color: 'orange' },
            { name: '32:9', color: 'purple' },
            { name: '\uAE30\uD0C0', color: 'default' },
          ],
        },
      },
    },
    { name: STATUS_FIELD, definition: { select: { options: STATUS_OPTIONS } } },
    { name: HISTORY_SYNCED_FIELD, definition: { checkbox: {} } },
    { name: HISTORY_PAGE_ID_FIELD, definition: { rich_text: {} } },
    { name: ACTUAL_PLAYED_FIELD, definition: { checkbox: {} } },
    { name: ACTUAL_ORDER_FIELD, definition: { number: { format: 'number' } } },
    { name: ISSUE_REASON_FIELD, definition: { rich_text: {} } },
    { name: BASE_USAGE_MODE_FIELD, definition: { select: { options: BASE_USAGE_MODE_OPTIONS } } },
    { name: REVIEW_STATUS_FIELD, definition: { select: { options: REVIEW_STATUS_OPTIONS } } },
    { name: REVIEW_NOTE_FIELD, definition: { rich_text: {} } },
  ]

  if (historyDatabaseId) {
    definitions.splice(8, 0, {
      name: BASE_HISTORY_FIELD,
      definition: {
        relation: {
          database_id: historyDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    })
  }

  return definitions
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const fileEnv = await readEnvFile(options.envPath)
  const env = { ...fileEnv, ...process.env }
  const notionToken = env.NOTION_TOKEN
  const projectDbId = env.NOTION_PROJECT_DB_ID
  const taskDbId = env.NOTION_TASK_DB_ID
  const planDbId = env.NOTION_SCREENING_PLAN_DB_ID
  const historyDbId = env.NOTION_SCREENING_HISTORY_DB_ID || env.NOTION_SCREENING_VIDEO_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!projectDbId) throw new Error('NOTION_PROJECT_DB_ID_missing')
  if (!taskDbId) throw new Error('NOTION_TASK_DB_ID_missing')
  if (!planDbId) throw new Error('NOTION_SCREENING_PLAN_DB_ID_missing')

  const db = await notionRequest(notionToken, `/databases/${planDbId}`)
  const properties = db?.properties ?? {}
  const updates = {}
  const created = []
  const existing = []
  const renamed = []
  const plannedNames = new Set()
  const payload = {}

  const currentTitle = parseDbTitle(db)
  if (currentTitle !== DATABASE_TITLE) {
    payload.title = [{ type: 'text', text: { content: DATABASE_TITLE } }]
    renamed.push(`database_title:${currentTitle || '[EMPTY]'}->${DATABASE_TITLE}`)
  }

  const titleEntry = Object.entries(properties).find(([, prop]) => prop?.type === 'title')
  if (titleEntry) {
    const [titlePropertyName] = titleEntry
    if (titlePropertyName !== TITLE_FIELD && !hasOwn(properties, TITLE_FIELD)) {
      updates[titlePropertyName] = { name: TITLE_FIELD }
      renamed.push(`title:${titlePropertyName}->${TITLE_FIELD}`)
      plannedNames.add(TITLE_FIELD)
    } else {
      existing.push(TITLE_FIELD)
    }
  } else if (!hasOwn(properties, TITLE_FIELD)) {
    updates[TITLE_FIELD] = { title: {} }
    created.push(TITLE_FIELD)
    plannedNames.add(TITLE_FIELD)
  }

  for (const field of buildPropertyDefinitions(projectDbId, taskDbId, historyDbId || null)) {
    if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
      existing.push(field.name)
      continue
    }
    updates[field.name] = field.definition
    created.push(field.name)
  }

  if (Object.keys(updates).length > 0) payload.properties = updates
  if (Object.keys(payload).length > 0) {
    await notionRequest(notionToken, `/databases/${planDbId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  console.log(JSON.stringify({ ok: true, databaseId: planDbId, created, existing, renamed }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
