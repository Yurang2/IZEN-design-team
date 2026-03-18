import fs from 'node:fs/promises'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_OUTPUT_PREFIX = 'ops/generated/bangkok-event-graphics-timetable'
const EVENT_NAME = '2026 IZEN Seminar in Bangkok'
const CAPTURE_FIELD = '캡쳐'
const AUDIO_FILES_FIELD = '오디오파일'

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

function clearMediaFields(row) {
  return {
    ...row,
    '메인 화면': '',
    오디오: '',
    '미리보기 링크': '',
    '자산 링크': '',
    '운영 액션': '',
    [CAPTURE_FIELD]: [],
    [AUDIO_FILES_FIELD]: [],
  }
}

function buildRow(baseRow, overrides) {
  const next = clearMediaFields({ ...baseRow, ...overrides })
  next['행 제목'] = buildTitle(next['정렬 순서'], next['Cue 제목'])
  next['운영 키'] = buildOperationKey(next['정렬 순서'], next['Cue 제목'])
  return next
}

function findBreakRow(rows, expectedOrder) {
  return rows.find((row) => row['Cue 제목'] === 'Coffee Break' && Number(row['정렬 순서']) === expectedOrder)
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
  const break1 = findBreakRow(sourceRows, 5)
  const lecture2 = rowsByTitle.get('Lecture 2')
  const lecture2Certi = rowsByTitle.get('Lecture 2 Certi')
  const lunch = rowsByTitle.get('Lunch (Buffet)')
  const lecture3 = rowsByTitle.get('Lecture 3')
  const lecture3Certi = rowsByTitle.get('Lecture 3 Certi')
  const break2 = findBreakRow(sourceRows, 11)
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
  if (requiredRows.some((row) => !row)) throw new Error('required_rows_missing')

  const rebuiltRows = [
    buildRow(announcement, {
      '정렬 순서': 1,
      카테고리: 'announcement',
      'Cue 제목': 'Announcement',
      '시작 시각': '9:30',
      '종료 시각': '9:40',
      '러닝타임(분)': 10,
      '무대 인원': '-',
      '운영 메모': '무대 -',
    }),
    buildRow(openingCombined, {
      '정렬 순서': 2,
      카테고리: 'opening',
      'Cue 제목': 'Opening',
      '시작 시각': '9:40',
      '종료 시각': '9:42',
      '러닝타임(분)': 2,
      '무대 인원': 'Liam Im, Jusuk Kim (CEO)',
      '운영 메모': '무대 Liam Im, Jusuk Kim (CEO)',
    }),
    buildRow(openingCombined, {
      '정렬 순서': 3,
      카테고리: 'introduce',
      'Cue 제목': 'IZEN Product & Business Introduction (CEO)',
      '시작 시각': '9:42',
      '종료 시각': '10:00',
      '러닝타임(분)': 18,
      '무대 인원': 'Liam Im, Jusuk Kim (CEO)',
      '운영 메모': '무대 Liam Im, Jusuk Kim (CEO)',
    }),
    buildRow(lecture1, {
      '정렬 순서': 4,
      카테고리: 'lecture',
      'Cue 제목': 'Lecture 1',
      '시작 시각': '10:00',
      '종료 시각': '11:27',
      '러닝타임(분)': 87,
      '무대 인원': 'Liam Im, Prof. Eshamsul Sulaiman',
      '운영 메모': '무대 Liam Im, Prof. Eshamsul Sulaiman',
    }),
    buildRow(lecture1Certi, {
      '정렬 순서': 5,
      카테고리: 'certificate',
      'Cue 제목': 'Lecture 1 Certi',
      '시작 시각': '11:27',
      '종료 시각': '11:30',
      '러닝타임(분)': 3,
      '무대 인원': 'Liam Im, Jusuk Kim (CEO), Prof. Eshamsul Sulaiman',
      '운영 메모': '무대 Liam Im, Jusuk Kim (CEO), Prof. Eshamsul Sulaiman',
    }),
    buildRow(break1, {
      '정렬 순서': 6,
      카테고리: 'break',
      'Cue 제목': 'Coffee Break',
      '시작 시각': '11:30',
      '종료 시각': '11:50',
      '러닝타임(분)': 20,
      '무대 인원': 'Liam Im',
      '운영 메모': '무대 Liam Im',
    }),
    buildRow(lecture2, {
      '정렬 순서': 7,
      카테고리: 'lecture',
      'Cue 제목': 'Lecture 2',
      '시작 시각': '11:50',
      '종료 시각': '13:17',
      '러닝타임(분)': 87,
      '무대 인원': 'Liam Im, Dr. Yerkebulan Abdakhin',
      '운영 메모': '무대 Liam Im, Dr. Yerkebulan Abdakhin',
    }),
    buildRow(lecture2Certi, {
      '정렬 순서': 8,
      카테고리: 'certificate',
      'Cue 제목': 'Lecture 2 Certi',
      '시작 시각': '13:17',
      '종료 시각': '13:20',
      '러닝타임(분)': 3,
      '무대 인원': 'Liam Im, Jusuk Kim (CEO), Dr. Yerkebulan Abdakhin',
      '운영 메모': '무대 Liam Im, Jusuk Kim (CEO), Dr. Yerkebulan Abdakhin',
    }),
    buildRow(lunch, {
      '정렬 순서': 9,
      카테고리: 'meal',
      'Cue 제목': 'Lunch (Buffet)',
      '시작 시각': '13:20',
      '종료 시각': '14:30',
      '러닝타임(분)': 70,
      '무대 인원': 'Liam Im',
      '운영 메모': '무대 Liam Im',
    }),
    buildRow(lecture3, {
      '정렬 순서': 10,
      카테고리: 'lecture',
      'Cue 제목': 'Lecture 3',
      '시작 시각': '14:30',
      '종료 시각': '15:57',
      '러닝타임(분)': 87,
      '무대 인원': 'Liam Im, Dr. Dias Kulbayev',
      '운영 메모': '무대 Liam Im, Dr. Dias Kulbayev',
    }),
    buildRow(lecture3Certi, {
      '정렬 순서': 11,
      카테고리: 'certificate',
      'Cue 제목': 'Lecture 3 Certi',
      '시작 시각': '15:57',
      '종료 시각': '16:00',
      '러닝타임(분)': 3,
      '무대 인원': 'Liam Im, Dr. Dias Kulbayev',
      '운영 메모': '무대 Liam Im, Dr. Dias Kulbayev',
    }),
    buildRow(break2, {
      '정렬 순서': 12,
      카테고리: 'break',
      'Cue 제목': 'Coffee Break',
      '시작 시각': '16:00',
      '종료 시각': '16:20',
      '러닝타임(분)': 20,
      '무대 인원': 'Liam Im',
      '운영 메모': '무대 Liam Im',
    }),
    buildRow(lecture4, {
      '정렬 순서': 13,
      카테고리: 'lecture',
      'Cue 제목': 'Lecture 4',
      '시작 시각': '16:20',
      '종료 시각': '17:37',
      '러닝타임(분)': 77,
      '무대 인원': 'Liam Im, Dr. Gaurav Ahuja',
      '운영 메모': '무대 Liam Im, Dr. Gaurav Ahuja',
    }),
    buildRow(lecture4Certi, {
      '정렬 순서': 14,
      카테고리: 'certificate',
      'Cue 제목': 'Lecture 4 Certi',
      '시작 시각': '17:37',
      '종료 시각': '17:40',
      '러닝타임(분)': 3,
      '무대 인원': 'Liam Im, Jusuk Kim (CEO), Dr. Gaurav Ahuja',
      '운영 메모': '무대 Liam Im, Jusuk Kim (CEO), Dr. Gaurav Ahuja',
    }),
    buildRow(closing, {
      '정렬 순서': 15,
      카테고리: 'closing',
      'Cue 제목': 'Closing & Commemorative Photo',
      '시작 시각': '17:40',
      '종료 시각': '18:00',
      '러닝타임(분)': 20,
      '무대 인원': 'Liam Im',
      '운영 메모': '오디오 루프로 / 돌릴만하게 설정 / 무대 Liam Im',
    }),
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
