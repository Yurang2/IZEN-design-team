import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DATABASE_TITLE = '\uCD2C\uC601 \uAC00\uC774\uB4DC DB'
const TITLE_FIELD = '\uC81C\uBAA9'

function buildPropertyDefinitions(projectDatabaseId) {
  return [
    {
      name: '\uADC0\uC18D \uD504\uB85C\uC81D\uD2B8',
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: '\uD589\uC0AC\uBA85', definition: { rich_text: {} } },
    { name: '\uC815\uB82C \uC21C\uC11C', definition: { number: { format: 'number' } } },
    { name: '\uC139\uC158', definition: { select: {} } },
    { name: '\uD589\uC0AC\uC77C', definition: { date: {} } },
    { name: '\uC7A5\uC18C', definition: { rich_text: {} } },
    { name: '\uCF5C\uD0C0\uC784', definition: { rich_text: {} } },
    { name: '\uD604\uC7A5 \uB2F4\uB2F9\uC790', definition: { rich_text: {} } },
    { name: '\uCD2C\uC601 \uBAA9\uC801', definition: { rich_text: {} } },
    { name: '\uD544\uC218 \uCEF7', definition: { rich_text: {} } },
    { name: '\uC2DC\uAC04\uB300\uBCC4 \uD3EC\uC778\uD2B8', definition: { rich_text: {} } },
    { name: '\uC8FC\uC758 \uC0AC\uD56D', definition: { rich_text: {} } },
    { name: '\uB0A9\uD488 \uADDC\uACA9', definition: { rich_text: {} } },
    { name: '\uCC38\uACE0 \uC790\uB8CC', definition: { rich_text: {} } },
    { name: '\uCC38\uACE0 \uB9C1\uD06C', definition: { url: {} } },
    { name: '\uCCA8\uBD80 \uC790\uB8CC', definition: { files: {} } },
  ]
}

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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const fileEnv = await readEnvFile(options.envPath)
  const env = { ...fileEnv, ...process.env }
  const notionToken = env.NOTION_TOKEN
  const projectDbId = env.NOTION_PROJECT_DB_ID
  const photoGuideDbId = env.NOTION_PHOTO_GUIDE_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!projectDbId) throw new Error('NOTION_PROJECT_DB_ID_missing')
  if (!photoGuideDbId) throw new Error('NOTION_PHOTO_GUIDE_DB_ID_missing')

  const db = await notionRequest(notionToken, `/databases/${photoGuideDbId}`)
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

  for (const field of buildPropertyDefinitions(projectDbId)) {
    if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
      existing.push(field.name)
      continue
    }
    updates[field.name] = field.definition
    created.push(field.name)
  }

  if (Object.keys(updates).length > 0) payload.properties = updates
  if (Object.keys(payload).length > 0) {
    await notionRequest(notionToken, `/databases/${photoGuideDbId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  console.log(JSON.stringify({ ok: true, databaseId: photoGuideDbId, created, existing, renamed }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
