import fs from 'node:fs/promises'
import path from 'node:path'
import XLSX from 'xlsx'

const DEFAULT_INPUT = 'files/IZEN Seminar in Bangkok Timetable.xlsx'
const DEFAULT_OUTPUT_PREFIX = 'ops/generated/bangkok-event-graphics-timetable'

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputPrefix: DEFAULT_OUTPUT_PREFIX,
    sheet: '',
    eventName: '',
    projectName: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--output-prefix') options.outputPrefix = argv[index + 1] ?? options.outputPrefix
    if (value === '--sheet') options.sheet = argv[index + 1] ?? options.sheet
    if (value === '--event-name') options.eventName = argv[index + 1] ?? options.eventName
    if (value === '--project-name') options.projectName = argv[index + 1] ?? options.projectName
  }

  return options
}

function normalizeCell(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' / ')
    .replace(/\s+\/\s+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findHeaderRow(rows) {
  return rows.findIndex((row) => {
    const first = normalizeCell(row[0]).toLowerCase()
    const second = normalizeCell(row[1]).toLowerCase()
    const third = normalizeCell(row[2]).toLowerCase()
    return first === 'no' && second === 'category' && third === 'time'
  })
}

function parseTimeRange(value) {
  const normalized = normalizeCell(value)
  const [start = '', end = ''] = normalized.split('~').map((item) => item.trim())
  return { start, end }
}

function deriveCueType(title) {
  const normalized = normalizeCell(title).toLowerCase()
  if (!normalized) return 'other'
  if (normalized.includes('announcement')) return 'announcement'
  if (normalized.includes('opening')) return 'opening'
  if (normalized.includes('certi')) return 'certificate'
  if (normalized.includes('lecture')) return 'lecture'
  if (normalized.includes('coffee break')) return 'break'
  if (normalized.includes('lunch')) return 'meal'
  if (normalized.includes('closing')) return 'closing'
  return 'other'
}

function deriveGraphicFormat(sourceVideo) {
  const normalized = normalizeCell(sourceVideo).toLowerCase()
  if (!normalized) return 'none'
  if (normalized.includes('show room') || normalized.includes('showroom')) return 'hold'

  const hasImage = /\.(png|jpg|jpeg|gif|webp|bmp|tif|tiff)\b/.test(normalized)
  const hasVideoFile = /\.(mp4|mov|m4v|avi|wmv|mkv)\b/.test(normalized)
  const hasVideoWord = /\bvideo\b/.test(normalized)
  const hasVideo = hasVideoFile || hasVideoWord

  if (hasImage && hasVideo) return 'mixed'
  if (hasVideo) return 'video'
  if (hasImage) return 'image'
  return 'unknown'
}

function toNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : ''
}

function padOrder(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '00'
  return String(numeric).padStart(2, '0')
}

function slugify(value) {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildOperationKey(eventName, cueOrder, cueTitle) {
  const eventSlug = slugify(eventName) || 'event'
  const orderSlug = padOrder(cueOrder)
  const titleSlug = slugify(cueTitle) || 'item'
  return `${eventSlug}::event::${orderSlug}::${titleSlug}`
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildRows(sheetRows, options) {
  const headerRowIndex = findHeaderRow(sheetRows)
  if (headerRowIndex < 0) {
    throw new Error('header_row_not_found')
  }

  const eventName = normalizeCell(options.eventName) || normalizeCell(sheetRows[0]?.[0]) || path.basename(options.input, path.extname(options.input))
  const projectName = normalizeCell(options.projectName) || eventName

  return sheetRows
    .slice(headerRowIndex + 1)
    .map((row) => {
      const cueOrder = toNumber(row[0])
      if (cueOrder === '') return null

      const cueTitle = normalizeCell(row[1])
      const sourceVideo = normalizeCell(row[5])
      const sourceAudio = normalizeCell(row[6])
      const remarks = normalizeCell(row[7])
      const timeRange = parseTimeRange(row[2])

      return {
        '행 제목': `[${eventName}] ${padOrder(cueOrder)} ${cueTitle}`,
        '행사명': eventName,
        '행사일': '',
        '타임테이블 유형': '자체행사',
        '운영 키': buildOperationKey(eventName, cueOrder, cueTitle),
        '정렬 순서': cueOrder,
        '카테고리': deriveCueType(cueTitle),
        'Cue 제목': cueTitle,
        '트리거 상황': '',
        '시작 시각': timeRange.start,
        '종료 시각': timeRange.end,
        '시간 기준': '',
        '러닝타임(분)': toNumber(row[3]),
        '무대 인원': normalizeCell(row[4]),
        '메인 화면': sourceVideo,
        '오디오': sourceAudio,
        '운영 액션': deriveGraphicFormat(sourceVideo) === 'video' ? 'Play' : sourceVideo ? 'Hold' : '',
        '운영 메모': remarks,
        '미리보기 링크': '',
        '자산 링크': '',
        '상태': 'planned',
        '귀속 프로젝트': projectName,
      }
    })
    .filter(Boolean)
}

async function writeOutputs(rows, options) {
  const outputDirectory = path.dirname(options.outputPrefix)
  await fs.mkdir(outputDirectory, { recursive: true })

  const headers = Object.keys(rows[0] ?? {})
  const csvLines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ]

  const metadata = {
    generatedAt: new Date().toISOString(),
    input: options.input,
    sheet: options.sheet,
    rowCount: rows.length,
    rows,
  }

  await fs.writeFile(`${options.outputPrefix}.csv`, `${csvLines.join('\n')}\n`, 'utf8')
  await fs.writeFile(`${options.outputPrefix}.json`, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const workbook = XLSX.readFile(options.input)
  const sheetName = options.sheet || workbook.SheetNames[0]
  if (!sheetName) throw new Error('sheet_not_found')
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) throw new Error(`sheet_not_found:${sheetName}`)

  options.sheet = sheetName
  const sheetRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })
  const rows = buildRows(sheetRows, options)
  if (rows.length === 0) throw new Error('data_rows_not_found')

  await writeOutputs(rows, options)
  console.log(`Generated ${rows.length} rows from ${options.input} (${sheetName})`)
  console.log(`CSV: ${options.outputPrefix}.csv`)
  console.log(`JSON: ${options.outputPrefix}.json`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
