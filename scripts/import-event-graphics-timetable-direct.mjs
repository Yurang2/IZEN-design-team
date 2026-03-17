import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DEFAULT_SITE_ORIGIN = 'https://izen-design-team.pages.dev'
const EVENT_GRAPHICS_CAPTURE_FILES_FIELD = '캡쳐(무조건 이미지형식)'
const EVENT_GRAPHICS_AUDIO_FILES_FIELD = '오디오파일'

function parseArgs(argv) {
  const options = {
    envPath: DEFAULT_ENV_PATH,
    input: DEFAULT_INPUT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--env') options.envPath = argv[index + 1] ?? options.envPath
    if (value === '--input') options.input = argv[index + 1] ?? options.input
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

function extractNumberValue(prop) {
  if (!prop || typeof prop !== 'object') return null
  if (prop.type === 'number' && Number.isFinite(prop.number)) return Number(prop.number)
  return null
}

function extractRelationIds(prop) {
  if (!prop || typeof prop !== 'object' || prop.type !== 'relation') return []
  return (prop.relation ?? []).map((entry) => entry?.id).filter(Boolean)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function buildOperationKey(mode, eventName, orderValue, category, cueTitle) {
  const slugify = (value) =>
    normalizeText(value)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const eventSlug = slugify(eventName) || 'event'
  const modeSlug = slugify(mode) || 'event'
  const orderSlug = normalizeNumber(orderValue) != null ? String(Math.round(Number(orderValue))).padStart(2, '0') : '00'
  const labelSlug = slugify(cueTitle || category) || 'item'
  return `${eventSlug}::${modeSlug}::${orderSlug}::${labelSlug}`
}

function normalizeRow(rawRow) {
  const rowTitle = normalizeText(rawRow['행 제목'])
  const timetableMode = normalizeText(rawRow['타임테이블 유형']) || '자체행사'
  const eventName = normalizeText(rawRow['행사명'])
  const eventDate = normalizeText(rawRow['행사일'])
  const sortOrder =
    normalizeNumber(rawRow['정렬 순서']) ??
    normalizeNumber(rawRow['Cue 순서']) ??
    normalizeNumber(rawRow['운영 순서']) ??
    normalizeNumber(rawRow['No'])
  const category = normalizeText(rawRow['카테고리']) || normalizeText(rawRow['Cue 유형'])
  const cueTitle = normalizeText(rawRow['Cue 제목'])
  const startTime = normalizeText(rawRow['시작 시각'])
  const endTime = normalizeText(rawRow['종료 시각'])
  const runtimeMinutes = normalizeNumber(rawRow['러닝타임(분)'])
  const personnel = normalizeText(rawRow['무대 인원'])
  const mainScreen =
    normalizeText(rawRow['메인 화면']) || normalizeText(rawRow['그래픽 자산명']) || normalizeText(rawRow['원본 Video'])
  const audio = normalizeText(rawRow['오디오']) || normalizeText(rawRow['원본 Audio'])
  const operationNote =
    normalizeText(rawRow['운영 메모']) || normalizeText(rawRow['업체 전달 메모']) || normalizeText(rawRow['원본 비고'])
  const operationAction = normalizeText(rawRow['운영 액션'])
  const trigger = normalizeText(rawRow['트리거 상황'])
  const timeReference = normalizeText(rawRow['시간 기준'])
  const previewLink = normalizeText(rawRow['미리보기 링크'])
  const assetLink = normalizeText(rawRow['자산 링크'])
  const status = normalizeText(rawRow['상태']) || 'planned'
  const operationKey =
    normalizeText(rawRow['운영 키']) || buildOperationKey(timetableMode, eventName, sortOrder, category, cueTitle || rowTitle)

  return {
    rowTitle,
    timetableMode,
    operationKey,
    eventName,
    eventDate,
    sortOrder,
    category,
    cueTitle,
    startTime,
    endTime,
    runtimeMinutes,
    personnel,
    mainScreen,
    audio,
    operationAction,
    operationNote,
    trigger,
    timeReference,
    previewLink,
    assetLink,
    status,
  }
}

function buildRichText(value) {
  const text = String(value ?? '').trim()
  return text ? [{ text: { content: text } }] : []
}

function toAbsoluteExternalUrl(value) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('/')) return `${DEFAULT_SITE_ORIGIN}${normalized}`
  return ''
}

function normalizeExternalFilesInput(value) {
  const buildEntry = (name, url) => {
    const absolute = toAbsoluteExternalUrl(url)
    if (!absolute) return null
    const basename = absolute.split('/').filter(Boolean).pop() ?? 'file'
    return {
      name: normalizeText(name) || basename,
      url: absolute,
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return buildEntry('', entry)
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
        return buildEntry(entry.name, entry.url)
      })
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    const normalized = normalizeText(value)
    if (!normalized) return []
    return normalized
      .split(/\s*,\s*/g)
      .map((entry) => buildEntry('', entry))
      .filter(Boolean)
  }

  return []
}

function buildProperties(row, projectId) {
  const captureFiles = normalizeExternalFilesInput(row[EVENT_GRAPHICS_CAPTURE_FILES_FIELD])
  const audioFiles = normalizeExternalFilesInput(row[EVENT_GRAPHICS_AUDIO_FILES_FIELD])
  return {
    '행 제목': {
      title: buildRichText(row.rowTitle || row.cueTitle || `Item ${row.sortOrder ?? ''}`.trim()),
    },
    '행사명': {
      rich_text: buildRichText(row.eventName),
    },
    '행사일': {
      date: row.eventDate ? { start: row.eventDate } : null,
    },
    '타임테이블 유형': {
      select: row.timetableMode ? { name: row.timetableMode } : { name: '자체행사' },
    },
    '운영 키': {
      rich_text: buildRichText(row.operationKey),
    },
    '정렬 순서': {
      number: row.sortOrder,
    },
    '카테고리': {
      select: row.category ? { name: row.category } : null,
    },
    'Cue 제목': {
      rich_text: buildRichText(row.cueTitle),
    },
    '트리거 상황': {
      rich_text: buildRichText(row.trigger),
    },
    '시작 시각': {
      rich_text: buildRichText(row.startTime),
    },
    '종료 시각': {
      rich_text: buildRichText(row.endTime),
    },
    '시간 기준': {
      rich_text: buildRichText(row.timeReference),
    },
    '러닝타임(분)': {
      number: row.runtimeMinutes,
    },
    '무대 인원': {
      rich_text: buildRichText(row.personnel),
    },
    '메인 화면': {
      rich_text: buildRichText(row.mainScreen),
    },
    [EVENT_GRAPHICS_CAPTURE_FILES_FIELD]: {
      files: captureFiles.map((entry) => ({
        name: entry.name,
        type: 'external',
        external: { url: entry.url },
      })),
    },
    '오디오': {
      rich_text: buildRichText(row.audio),
    },
    [EVENT_GRAPHICS_AUDIO_FILES_FIELD]: {
      files: audioFiles.map((entry) => ({
        name: entry.name,
        type: 'external',
        external: { url: entry.url },
      })),
    },
    '운영 메모': {
      rich_text: buildRichText(row.operationNote),
    },
    '운영 액션': {
      select: row.operationAction ? { name: row.operationAction } : null,
    },
    '미리보기 링크': {
      url: row.previewLink || null,
    },
    '자산 링크': {
      url: row.assetLink || null,
    },
    '상태': {
      select: row.status ? { name: row.status } : null,
    },
    '귀속 프로젝트': {
      relation: projectId ? [{ id: projectId }] : [],
    },
  }
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

  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')
  const rows = sourceRows.map(normalizeRow)

  const [projectPages, timetablePages] = await Promise.all([
    queryAllPages(notionToken, projectDbId),
    queryAllPages(notionToken, timetableDbId),
  ])

  const projectIdByName = new Map()
  for (const page of projectPages) {
    const title = extractTitleValue(page)
    if (!title) continue
    projectIdByName.set(title, page.id)
    projectIdByName.set(title.toLowerCase(), page.id)
  }

  const existingByKey = new Map()
  const existingByTitle = new Map()
  for (const page of timetablePages) {
    const properties = page?.properties ?? {}
    const operationKey = extractRichTextValue(properties['운영 키'])
    const legacySourceDocument = extractRichTextValue(properties['원본 문서'])
    const legacySourceSheet = extractRichTextValue(properties['원본 시트'])
    const legacySourceRowNumber = extractNumberValue(properties['원본 행번호'])
    const title = extractTitleValue(page)
    const key =
      operationKey ||
      (legacySourceDocument && legacySourceSheet && legacySourceRowNumber != null
        ? `${legacySourceDocument}::${legacySourceSheet}::${legacySourceRowNumber}`
        : title
      )
    if (key) existingByKey.set(key, page)
    if (title && !existingByTitle.has(title)) existingByTitle.set(title, page)
  }

  let created = 0
  let updated = 0

  for (const row of rows) {
    const key = row.operationKey || row.rowTitle
    if (!key) continue

    const existingPage = existingByKey.get(key) ?? existingByTitle.get(row.rowTitle)
    const existingRelationIds = extractRelationIds(existingPage?.properties?.['귀속 프로젝트'])
    const projectId =
      projectIdByName.get(row.eventName) ??
      projectIdByName.get(row.eventName.toLowerCase()) ??
      existingRelationIds[0] ??
      ''

    const properties = buildProperties(row, projectId)

    if (existingPage?.id) {
      await notionRequest(notionToken, `/pages/${existingPage.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      })
      updated += 1
    } else {
      const createdPage = await notionRequest(notionToken, '/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { database_id: timetableDbId },
          properties,
        }),
      })
      existingByKey.set(key, createdPage)
      created += 1
    }
  }

  console.log(JSON.stringify({ ok: true, total: rows.length, created, updated }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
