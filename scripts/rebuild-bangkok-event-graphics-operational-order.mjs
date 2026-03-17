import fs from 'node:fs/promises'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_OUTPUT_PREFIX = 'ops/generated/bangkok-event-graphics-timetable'
const EVENT_NAME = '2026 IZEN Seminar in Bangkok'

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    outputPrefix: DEFAULT_OUTPUT_PREFIX,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--output-prefix') options.outputPrefix = argv[index + 1] ?? options.outputPrefix
  }

  return options
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildOperationKey(order, title) {
  return `${slugify(EVENT_NAME)}::event::${String(order).padStart(2, '0')}::${slugify(title) || 'item'}`
}

function buildTitle(order, cueTitle) {
  return `[${EVENT_NAME}] ${String(order).padStart(2, '0')} ${cueTitle}`
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildRow(baseRow, overrides) {
  const next = { ...baseRow, ...overrides }
  next['행 제목'] = buildTitle(next['정렬 순서'], next['Cue 제목'])
  next['운영 키'] = buildOperationKey(next['정렬 순서'], next['Cue 제목'])
  return next
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')

  const rowsByTitle = new Map(sourceRows.map((row) => [String(row['Cue 제목'] ?? '').trim(), row]))
  const announcement = rowsByTitle.get('Announcement')
  const openingCombined =
    rowsByTitle.get('Opening / IZEN Product & Business Introduction (CEO)') ??
    rowsByTitle.get('Opening') ??
    rowsByTitle.get('IZEN Product & Business Introduction (CEO)')
  const lecture1 = rowsByTitle.get('Lecture 1')
  const lecture1Certi = rowsByTitle.get('Lecture 1 Certi')
  const break1 = sourceRows.find((row) => row['Cue 제목'] === 'Coffee Break' && Number(row['정렬 순서']) === 5)
  const lecture2 = rowsByTitle.get('Lecture 2')
  const lecture2Certi = rowsByTitle.get('Lecture 2 Certi')
  const lunch = rowsByTitle.get('Lunch (Buffet)')
  const lecture3 = rowsByTitle.get('Lecture 3')
  const lecture3Certi = rowsByTitle.get('Lecture 3 Certi')
  const break2 = sourceRows.find((row) => row['Cue 제목'] === 'Coffee Break' && Number(row['정렬 순서']) === 11)
  const lecture4 = rowsByTitle.get('Lecture 4')
  const lecture4Certi = rowsByTitle.get('Lecture 4 Certi')
  const closing = rowsByTitle.get('Closing & Commemorative Photo')

  const requiredRows = [
    announcement,
    openingCombined,
    lecture1,
    lecture1Certi,
    break1,
    lecture2,
    lecture2Certi,
    lunch,
    lecture3,
    lecture3Certi,
    break2,
    lecture4,
    lecture4Certi,
    closing,
  ]
  if (requiredRows.some((row) => !row)) {
    throw new Error('required_rows_missing')
  }

  const openingRow = buildRow(openingCombined, {
    '정렬 순서': 2,
    '카테고리': 'opening',
    'Cue 제목': 'Opening',
    '시작 시각': '9:40',
    '종료 시각': '9:42',
    '러닝타임(분)': 2,
    '무대 인원': 'Liam Im, Jusuk Kim (CEO)',
    '메인 화면': 'Opening Cinematic Video',
    '오디오': '',
    '운영 액션': 'Play',
    '운영 메모': '',
  })

  const ceoIntroRow = buildRow(openingCombined, {
    '정렬 순서': 3,
    '카테고리': 'introduce',
    'Cue 제목': 'IZEN Product & Business Introduction (CEO)',
    '시작 시각': '9:42',
    '종료 시각': '10:00',
    '러닝타임(분)': 18,
    '무대 인원': 'Liam Im, Jusuk Kim (CEO)',
    '메인 화면': 'IZEN Product & Business Introduction (CEO)',
    '오디오': 'Entrance Audio',
    '운영 액션': 'Hold',
    '운영 메모': '',
  })

  const rebuiltRows = [
    buildRow(announcement, { '정렬 순서': 1 }),
    openingRow,
    ceoIntroRow,
    buildRow(lecture1, { '정렬 순서': 4 }),
    buildRow(lecture1Certi, { '정렬 순서': 4 }),
    buildRow(break1, { '정렬 순서': 5 }),
    buildRow(lecture2, { '정렬 순서': 6 }),
    buildRow(lecture2Certi, { '정렬 순서': 6 }),
    buildRow(lunch, { '정렬 순서': 7 }),
    buildRow(lecture3, { '정렬 순서': 8 }),
    buildRow(lecture3Certi, { '정렬 순서': 8 }),
    buildRow(break2, { '정렬 순서': 9 }),
    buildRow(lecture4, { '정렬 순서': 10 }),
    buildRow(lecture4Certi, { '정렬 순서': 10 }),
    buildRow(closing, { '정렬 순서': 11 }),
  ]

  const headers = Object.keys(rebuiltRows[0] ?? {})
  const csvLines = [
    headers.join(','),
    ...rebuiltRows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ]

  const nextPayload = {
    ...parsed,
    generatedAt: new Date().toISOString(),
    rowCount: rebuiltRows.length,
    rows: rebuiltRows,
  }

  await fs.writeFile(`${options.outputPrefix}.json`, `${JSON.stringify(nextPayload, null, 2)}\n`, 'utf8')
  await fs.writeFile(`${options.outputPrefix}.csv`, `${csvLines.join('\n')}\n`, 'utf8')
  console.log(`Rebuilt Bangkok operational order: ${rebuiltRows.length} rows`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
