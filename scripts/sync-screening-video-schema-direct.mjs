import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DATABASE_TITLE = '\uC0C1\uC601 \uC601\uC0C1 \uAE30\uB85D DB'
const TITLE_FIELD = '\uC81C\uBAA9'
const PROJECT_FIELD = '\uADC0\uC18D \uD504\uB85C\uC81D\uD2B8'
const EVENT_FIELD = '\uD589\uC0AC\uBA85'
const DATE_FIELD = '\uC0C1\uC601\uC77C'
const ORDER_FIELD = '\uC0C1\uC601 \uC21C\uC11C'
const SCREEN_FIELD = '\uC2A4\uD06C\uB9B0/\uAD6C\uC5ED'
const SOURCE_NAME_FIELD = '\uBCC0\uD658 \uC804 \uD30C\uC77C\uBA85'
const PLAYED_FILE_NAME_FIELD = '\uC0C1\uC601 \uB2F9\uC2DC \uD30C\uC77C\uBA85'
const ASPECT_RATIO_FIELD = '\uD654\uBA74 \uBE44\uC728'
const THUMBNAIL_FIELD = '\uB300\uD45C \uC774\uBBF8\uC9C0'
const RELATED_TASK_FIELD = '\uAD00\uB828 \uC5C5\uBB34'
const SOURCE_PLAN_ID_FIELD = '\uC6D0\uBCF8 \uC900\uBE44 Row ID'
const PLAYED_FILE_NAME_ALIASES = ['\uC2E4\uC81C \uC0C1\uC601 \uD30C\uC77C\uBA85', '\uBCC0\uD658 \uD6C4 \uD30C\uC77C\uBA85']

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

function buildPropertyDefinitions(projectDatabaseId, taskDatabaseId) {
  return [
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
    { name: PLAYED_FILE_NAME_FIELD, definition: { rich_text: {} }, aliases: PLAYED_FILE_NAME_ALIASES },
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
    { name: SOURCE_PLAN_ID_FIELD, definition: { rich_text: {} } },
  ]
}

function getPropertyDefinitionType(definition) {
  return Object.keys(definition).find((key) => key !== 'name' && key !== 'aliases') ?? ''
}

function findAliasName(properties, field, plannedNames) {
  const aliases = field.aliases ?? []
  const expectedType = getPropertyDefinitionType(field.definition)
  for (const alias of aliases) {
    if (!alias || alias === field.name || plannedNames.has(alias)) continue
    const prop = properties[alias]
    if (!prop) continue
    if (!expectedType || prop?.type === expectedType) return alias
  }
  return null
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const fileEnv = await readEnvFile(options.envPath)
  const env = { ...fileEnv, ...process.env }
  const notionToken = env.NOTION_TOKEN
  const projectDbId = env.NOTION_PROJECT_DB_ID
  const taskDbId = env.NOTION_TASK_DB_ID
  const historyDbId = env.NOTION_SCREENING_HISTORY_DB_ID || env.NOTION_SCREENING_VIDEO_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!projectDbId) throw new Error('NOTION_PROJECT_DB_ID_missing')
  if (!taskDbId) throw new Error('NOTION_TASK_DB_ID_missing')
  if (!historyDbId) throw new Error('NOTION_SCREENING_HISTORY_DB_ID_missing')

  const db = await notionRequest(notionToken, `/databases/${historyDbId}`)
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

  for (const field of buildPropertyDefinitions(projectDbId, taskDbId)) {
    if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
      existing.push(field.name)
      continue
    }
    const aliasName = findAliasName(properties, field, plannedNames)
    if (aliasName) {
      updates[aliasName] = { name: field.name }
      renamed.push(`${aliasName}->${field.name}`)
      plannedNames.add(field.name)
      continue
    }
    updates[field.name] = field.definition
    created.push(field.name)
  }

  if (Object.keys(updates).length > 0) payload.properties = updates
  if (Object.keys(payload).length > 0) {
    await notionRequest(notionToken, `/databases/${historyDbId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  console.log(JSON.stringify({ ok: true, databaseId: historyDbId, created, existing, renamed }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
