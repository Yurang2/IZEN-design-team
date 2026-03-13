import fs from 'node:fs/promises'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const EXCLUDED_CUE_TYPES = new Set(['announcement', 'break', 'meal'])
const ENTRANCE_USES_MAIN_AUDIO_TYPES = new Set(['certificate', 'closing'])

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

function splitAudio(value) {
  const segments = String(value ?? '')
    .split('/')
    .map((entry) => entry.trim())
    .filter(Boolean)

  const entrance = segments.filter((entry) => /entrance audio/i.test(entry))
  const remaining = segments.filter((entry) => !/entrance audio/i.test(entry))

  return {
    entrance: entrance.join(' / '),
    remaining: remaining.join(' / '),
  }
}

function buildEntranceAudio(row, audio) {
  if (audio.entrance) return audio.entrance
  if (ENTRANCE_USES_MAIN_AUDIO_TYPES.has(row.cueType)) return row.sourceAudio
  return 'Entrance Audio 확인 필요'
}

function buildEntranceRemark(row) {
  const base = '본 세션 직전 1분 등장 cue'
  if (ENTRANCE_USES_MAIN_AUDIO_TYPES.has(row.cueType) && row.sourceAudio) {
    return row.sourceRemark ? `${base} / 오디오는 본 큐와 동일 / ${row.sourceRemark}` : `${base} / 오디오는 본 큐와 동일`
  }
  return row.sourceRemark ? `${base} / ${row.sourceRemark}` : base
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

function denormalizeRow(headers, row) {
  const orderedValues = [
    row.rowTitle,
    '',
    row.projectSnapshot,
    row.eventName,
    row.eventDate,
    row.cueOrder,
    row.cueType,
    row.cueTitle,
    row.startTime,
    row.endTime,
    row.runtimeMinutes,
    row.personnel,
    row.sourceVideo,
    row.sourceAudio,
    row.sourceRemark,
    row.graphicAssetName,
    row.graphicType,
    row.previewLink,
    row.assetLink,
    row.status,
    row.owner,
    row.vendorNote,
    row.sourceDocument,
    row.sourceSheet,
    row.sourceRowNumber,
  ]

  return Object.fromEntries(headers.map((header, index) => [header, orderedValues[index] ?? '']))
}

function shouldInsertEntranceCue(row) {
  if (!row.cueType || EXCLUDED_CUE_TYPES.has(row.cueType)) return false
  if (!row.personnel || row.personnel === '-') return false
  if (row.runtimeMinutes == null || row.runtimeMinutes <= 1) return false
  return true
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
    const audio = splitAudio(row.sourceAudio)
    const introTitle = row.cueTitle ? `등장 - ${row.cueTitle}` : '등장'

    expanded.push({
      ...row,
      rowTitle: `[${row.eventName}] ${String(row.cueOrder ?? '').padStart(2, '0')} ${introTitle}`.trim(),
      cueOrder: Number((row.cueOrder - 0.1).toFixed(1)),
      cueType: 'other',
      cueTitle: '등장',
      startTime: formatTime(startMinutes),
      endTime: formatTime(entranceEnd),
      runtimeMinutes: 1,
      sourceVideo: `${row.cueTitle} 소개 그래픽`,
      sourceAudio: buildEntranceAudio(row, audio),
      sourceRemark: buildEntranceRemark(row),
      graphicAssetName: `${row.cueTitle} 소개 그래픽`,
      graphicType: 'unknown',
      previewLink: '',
      assetLink: '',
      sourceRowNumber: row.sourceRowNumber != null ? Number((row.sourceRowNumber - 0.1).toFixed(1)) : null,
    })

    expanded.push({
      ...row,
      startTime: formatTime(entranceEnd),
      endTime: formatTime(endMinutes),
      runtimeMinutes: row.runtimeMinutes - 1,
      sourceAudio: audio.remaining,
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
