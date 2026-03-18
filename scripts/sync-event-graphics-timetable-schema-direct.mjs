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

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key)
}

const EVENT_GRAPHICS_CAPTURE_FILES_FIELD = '캡쳐'
const EVENT_GRAPHICS_AUDIO_FILES_FIELD = '오디오파일'
const EVENT_GRAPHICS_DEPRECATED_FIELDS = [
  'Cue 순서',
  'Cue 유형',
  '원본 Video',
  '원본 Audio',
  '원본 비고',
  '그래픽 자산명',
  '업체 전달 메모',
  '프로젝트명 스냅샷',
  '원본 문서',
  '원본 시트',
  '원본 행번호',
  '담당자',
  '운영 액션',
  '상태',
]

function buildPropertyDefinitions(projectDatabaseId) {
  return [
    {
      name: '귀속 프로젝트',
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: '행사명', definition: { rich_text: {} } },
    { name: '행사일', definition: { date: {} } },
    {
      name: '타임테이블 유형',
      definition: {
        select: {
          options: [
            { name: '자체행사', color: 'blue' },
            { name: '전시회', color: 'green' },
          ],
        },
      },
    },
    { name: '운영 키', definition: { rich_text: {} } },
    { name: '정렬 순서', definition: { number: { format: 'number' } } },
    {
      name: '카테고리',
      definition: {
        select: {
          options: [
            { name: 'announcement', color: 'gray' },
            { name: 'opening', color: 'blue' },
            { name: 'entrance', color: 'orange' },
            { name: 'introduce', color: 'purple' },
            { name: 'lecture', color: 'purple' },
            { name: 'certificate', color: 'yellow' },
            { name: 'break', color: 'orange' },
            { name: 'meal', color: 'green' },
            { name: 'closing', color: 'red' },
            { name: 'other', color: 'default' },
            { name: 'Regular Operation', color: 'gray' },
            { name: 'Seminar Starting Soon', color: 'blue' },
            { name: 'In Seminar', color: 'purple' },
            { name: 'Lucky Draw', color: 'yellow' },
          ],
        },
      },
    },
    { name: 'Cue 제목', definition: { rich_text: {} } },
    { name: '트리거 상황', definition: { rich_text: {} } },
    { name: '시작 시각', definition: { rich_text: {} } },
    { name: '종료 시각', definition: { rich_text: {} } },
    { name: '시간 기준', definition: { rich_text: {} } },
    { name: '러닝타임(분)', definition: { number: { format: 'number' } } },
    { name: '메인 화면', definition: { rich_text: {} } },
    { name: EVENT_GRAPHICS_CAPTURE_FILES_FIELD, definition: { files: {} } },
    { name: '오디오', definition: { rich_text: {} } },
    { name: EVENT_GRAPHICS_AUDIO_FILES_FIELD, definition: { files: {} } },
    { name: '무대 인원', definition: { rich_text: {} } },
    { name: '운영 메모', definition: { rich_text: {} } },
    { name: '미리보기 링크', definition: { url: {} } },
    { name: '자산 링크', definition: { url: {} } },
  ]
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const env = await readEnvFile(options.envPath)
  const notionToken = env.NOTION_TOKEN
  const projectDbId = env.NOTION_PROJECT_DB_ID
  const timetableDbId = env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!projectDbId) throw new Error('NOTION_PROJECT_DB_ID_missing')
  if (!timetableDbId) throw new Error('NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID_missing')

  const db = await notionRequest(notionToken, `/databases/${timetableDbId}`)
  const properties = db?.properties ?? {}
  const updates = {}
  const created = []
  const existing = []
  const renamed = []
  const plannedNames = new Set()

  const titleEntry = Object.entries(properties).find(([, prop]) => prop?.type === 'title')
  if (titleEntry) {
    const [titlePropertyName] = titleEntry
    if (titlePropertyName !== '행 제목' && !hasOwn(properties, '행 제목')) {
      updates[titlePropertyName] = { name: '행 제목' }
      renamed.push(`title:${titlePropertyName}->행 제목`)
      plannedNames.add('행 제목')
    } else {
      existing.push('행 제목')
    }
  }

  const renameIfPresent = (fromName, toName) => {
    if (fromName === toName) return
    if (hasOwn(properties, toName) || plannedNames.has(toName) || !hasOwn(properties, fromName)) return
    updates[fromName] = { name: toName }
    renamed.push(`${fromName}->${toName}`)
    plannedNames.add(toName)
  }

  renameIfPresent('Cue 순서', '정렬 순서')
  renameIfPresent('Cue 유형', '카테고리')
  renameIfPresent('원본 Video', '메인 화면')
  renameIfPresent('원본 Audio', '오디오')
  renameIfPresent('원본 비고', '운영 메모')
  renameIfPresent('캡쳐(무조건 이미지형식)', EVENT_GRAPHICS_CAPTURE_FILES_FIELD)

  for (const field of buildPropertyDefinitions(projectDbId)) {
    if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
      existing.push(field.name)
      continue
    }
    updates[field.name] = field.definition
    created.push(field.name)
  }

  for (const fieldName of EVENT_GRAPHICS_DEPRECATED_FIELDS) {
    if (hasOwn(updates, fieldName)) continue
    if (!hasOwn(properties, fieldName)) continue
    updates[fieldName] = null
  }

  if (Object.keys(updates).length > 0) {
    await notionRequest(notionToken, `/databases/${timetableDbId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: updates }),
    })
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        databaseId: timetableDbId,
        created,
        existing,
        renamed,
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
