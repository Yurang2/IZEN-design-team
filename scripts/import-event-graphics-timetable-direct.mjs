import fs from 'node:fs/promises'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

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

function normalizeRow(rawRow) {
  const values = Object.values(rawRow)
  const [
    rowTitle,
    _projectRelation,
    projectSnapshot,
    eventName,
    eventDate,
    cueOrder,
    cueType,
    cueTitle,
    startTime,
    endTime,
    runtimeMinutes,
    personnel,
    sourceVideo,
    sourceAudio,
    sourceRemark,
    graphicAssetName,
    graphicType,
    previewLink,
    assetLink,
    status,
    owner,
    vendorNote,
    sourceDocument,
    sourceSheet,
    sourceRowNumber,
  ] = values

  return {
    rowTitle: String(rowTitle ?? '').trim(),
    projectSnapshot: String(projectSnapshot ?? '').trim(),
    eventName: String(eventName ?? '').trim(),
    eventDate: String(eventDate ?? '').trim(),
    cueOrder: Number.isFinite(Number(cueOrder)) ? Number(cueOrder) : null,
    cueType: String(cueType ?? '').trim(),
    cueTitle: String(cueTitle ?? '').trim(),
    startTime: String(startTime ?? '').trim(),
    endTime: String(endTime ?? '').trim(),
    runtimeMinutes: Number.isFinite(Number(runtimeMinutes)) ? Number(runtimeMinutes) : null,
    personnel: String(personnel ?? '').trim(),
    sourceVideo: String(sourceVideo ?? '').trim(),
    sourceAudio: String(sourceAudio ?? '').trim(),
    sourceRemark: String(sourceRemark ?? '').trim(),
    graphicAssetName: String(graphicAssetName ?? '').trim(),
    graphicType: String(graphicType ?? '').trim(),
    previewLink: String(previewLink ?? '').trim(),
    assetLink: String(assetLink ?? '').trim(),
    status: String(status ?? '').trim(),
    owner: String(owner ?? '').trim(),
    vendorNote: String(vendorNote ?? '').trim(),
    sourceDocument: String(sourceDocument ?? '').trim(),
    sourceSheet: String(sourceSheet ?? '').trim(),
    sourceRowNumber: Number.isFinite(Number(sourceRowNumber)) ? Number(sourceRowNumber) : null,
  }
}

function buildRichText(value) {
  const text = String(value ?? '').trim()
  return text ? [{ text: { content: text } }] : []
}

function buildProperties(row, projectId) {
  return {
    '행 제목': {
      title: buildRichText(row.rowTitle || row.cueTitle || `Cue ${row.cueOrder ?? ''}`.trim()),
    },
    '행사명': {
      rich_text: buildRichText(row.eventName),
    },
    '프로젝트명 스냅샷': {
      rich_text: buildRichText(row.projectSnapshot),
    },
    '행사일': {
      date: row.eventDate ? { start: row.eventDate } : null,
    },
    'Cue 순서': {
      number: row.cueOrder,
    },
    'Cue 유형': {
      select: row.cueType ? { name: row.cueType } : null,
    },
    'Cue 제목': {
      rich_text: buildRichText(row.cueTitle),
    },
    '시작 시각': {
      rich_text: buildRichText(row.startTime),
    },
    '종료 시각': {
      rich_text: buildRichText(row.endTime),
    },
    '러닝타임(분)': {
      number: row.runtimeMinutes,
    },
    '무대 인원': {
      rich_text: buildRichText(row.personnel),
    },
    '원본 Video': {
      rich_text: buildRichText(row.sourceVideo),
    },
    '원본 Audio': {
      rich_text: buildRichText(row.sourceAudio),
    },
    '원본 비고': {
      rich_text: buildRichText(row.sourceRemark),
    },
    '그래픽 자산명': {
      rich_text: buildRichText(row.graphicAssetName),
    },
    '그래픽 형식': {
      select: row.graphicType ? { name: row.graphicType } : null,
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
    '담당자': {
      rich_text: buildRichText(row.owner),
    },
    '업체 전달 메모': {
      rich_text: buildRichText(row.vendorNote),
    },
    '원본 문서': {
      rich_text: buildRichText(row.sourceDocument),
    },
    '원본 시트': {
      rich_text: buildRichText(row.sourceSheet),
    },
    '원본 행번호': {
      number: row.sourceRowNumber,
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
  for (const page of timetablePages) {
    const properties = page?.properties ?? {}
    const sourceDocument = extractRichTextValue(properties['원본 문서'])
    const sourceSheet = extractRichTextValue(properties['원본 시트'])
    const sourceRowNumber = extractNumberValue(properties['원본 행번호'])
    const title = extractTitleValue(page)
    const key =
      sourceDocument && sourceSheet && sourceRowNumber != null
        ? `${sourceDocument}::${sourceSheet}::${sourceRowNumber}`
        : title
    if (key) existingByKey.set(key, page)
  }

  let created = 0
  let updated = 0

  for (const row of rows) {
    const key =
      row.sourceDocument && row.sourceSheet && row.sourceRowNumber != null
        ? `${row.sourceDocument}::${row.sourceSheet}::${row.sourceRowNumber}`
        : row.rowTitle
    if (!key) continue

    const existingPage = existingByKey.get(key)
    const existingRelationIds = extractRelationIds(existingPage?.properties?.['귀속 프로젝트'])
    const projectId =
      projectIdByName.get(row.projectSnapshot) ??
      projectIdByName.get(row.projectSnapshot.toLowerCase()) ??
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
