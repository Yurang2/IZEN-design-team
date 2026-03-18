import fs from 'node:fs/promises'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const CAPTURE_FIELD = '캡쳐'
const AUDIO_FILES_FIELD = '오디오파일'
const ENTRANCE_ALLOWED_TYPES = new Set(['introduce', 'lecture'])

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
  }

  return options
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function parseTime(value) {
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function formatTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return ''
  const minutes = Math.max(0, Math.round(totalMinutes))
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${hour}:${String(minute).padStart(2, '0')}`
}

function normalizeRow(rawRow) {
  return {
    original: { ...rawRow },
    rowTitle: String(rawRow['행 제목'] ?? '').trim(),
    eventName: String(rawRow['행사명'] ?? '').trim(),
    eventDate: String(rawRow['행사일'] ?? '').trim(),
    operationKey: String(rawRow['운영 키'] ?? '').trim(),
    cueOrder: Number.isFinite(Number(rawRow['정렬 순서'])) ? Number(rawRow['정렬 순서']) : null,
    cueType: String(rawRow['카테고리'] ?? '').trim(),
    cueTitle: String(rawRow['Cue 제목'] ?? '').trim(),
    startTime: String(rawRow['시작 시각'] ?? '').trim(),
    endTime: String(rawRow['종료 시각'] ?? '').trim(),
    runtimeMinutes: Number.isFinite(Number(rawRow['러닝타임(분)'])) ? Number(rawRow['러닝타임(분)']) : null,
    personnel: String(rawRow['무대 인원'] ?? '').trim(),
    operationNote: String(rawRow['운영 메모'] ?? '').trim(),
    projectName: String(rawRow['귀속 프로젝트'] ?? '').trim(),
  }
}

function denormalizeRow(headers, row) {
  const next = {
    ...(row.original ?? {}),
    '행 제목': row.rowTitle,
    행사명: row.eventName,
    행사일: row.eventDate,
    '운영 키': row.operationKey,
    '정렬 순서': row.cueOrder,
    카테고리: row.cueType,
    'Cue 제목': row.cueTitle,
    '시작 시각': row.startTime,
    '종료 시각': row.endTime,
    '러닝타임(분)': row.runtimeMinutes,
    '무대 인원': row.personnel,
    '메인 화면': '',
    오디오: '',
    '운영 메모': row.operationNote,
    '미리보기 링크': '',
    '자산 링크': '',
    '운영 액션': '',
    [CAPTURE_FIELD]: [],
    [AUDIO_FILES_FIELD]: [],
    '귀속 프로젝트': row.projectName,
  }

  return Object.fromEntries(headers.map((header) => [header, next[header] ?? '']))
}

function shouldInsertEntranceCue(row) {
  if (!ENTRANCE_ALLOWED_TYPES.has(row.cueType)) return false
  if (!row.personnel || row.personnel === '-') return false
  if (row.runtimeMinutes == null || row.runtimeMinutes <= 1) return false
  return true
}

function buildEntranceNote(row) {
  const base = '본 세션 직전 1분 등장 cue'
  return row.operationNote ? `${base} / ${row.operationNote}` : base
}

function expandRows(rows) {
  const expanded = []

  for (const row of rows) {
    if (!shouldInsertEntranceCue(row)) {
      expanded.push(row)
      continue
    }

    const startMinutes = parseTime(row.startTime)
    const endMinutes = parseTime(row.endTime)
    if (startMinutes == null || endMinutes == null) {
      expanded.push(row)
      continue
    }

    const entranceEnd = startMinutes + 1
    expanded.push({
      ...row,
      rowTitle: `[${row.eventName}] ${String(Math.round(row.cueOrder ?? 0)).padStart(2, '0')} 등장 - ${row.cueTitle}`.trim(),
      operationKey: row.operationKey ? `${row.operationKey}::entrance` : '',
      cueType: 'entrance',
      cueTitle: '등장',
      startTime: formatTime(startMinutes),
      endTime: formatTime(entranceEnd),
      runtimeMinutes: 1,
      operationNote: buildEntranceNote(row),
    })

    expanded.push({
      ...row,
      startTime: formatTime(entranceEnd),
      endTime: formatTime(endMinutes),
      runtimeMinutes: Math.max(1, (row.runtimeMinutes ?? 0) - 1),
    })
  }

  return expanded
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')

  const headers = Object.keys(sourceRows[0])
  const normalizedRows = sourceRows.map(normalizeRow)
  const expandedRows = expandRows(normalizedRows)
  const outputRows = expandedRows.map((row) => denormalizeRow(headers, row))

  const csvLines = [
    headers.join(','),
    ...outputRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ]

  parsed.generatedAt = new Date().toISOString()
  parsed.rowCount = outputRows.length
  parsed.rows = outputRows

  const outputPrefix = options.input.replace(/\.json$/i, '')
  await fs.writeFile(options.input, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await fs.writeFile(`${outputPrefix}.csv`, `${csvLines.join('\n')}\n`, 'utf8')
  console.log(`Expanded entrance cues: ${sourceRows.length} -> ${outputRows.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
