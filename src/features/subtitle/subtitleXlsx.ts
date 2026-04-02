import * as XLSX from 'xlsx'
import type { SubtitleSegment } from '../../shared/types'

const HEADERS = ['#', '구간명', '시작', '끝', '한국어', '영어', '중국어', '러시아어']

// ---------------------------------------------------------------------------
// Import (parse xlsx → segments)
// ---------------------------------------------------------------------------

export function parseSubtitleXlsx(file: ArrayBuffer): SubtitleSegment[] {
  const wb = XLSX.read(file, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length < 2) return []

  // Find header row (first row containing '#' or '구간명')
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i].map(String)
    if (row.some((cell) => cell === '#' || cell === '구간명' || cell.toLowerCase() === 'label')) {
      headerIdx = i
      break
    }
  }

  const segments: SubtitleSegment[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i].map(String)
    if (!row[0] && !row[1] && !row[4]) continue // skip empty rows

    segments.push({
      index: Number(row[0]) || segments.length + 1,
      label: row[1] ?? '',
      startTime: row[2] ?? '00:00:00',
      endTime: row[3] ?? '00:00:00',
      ko: row[4] ?? '',
      en: row[5] ?? '',
      zh: row[6] ?? '',
      ru: row[7] ?? '',
    })
  }

  return segments
}

// ---------------------------------------------------------------------------
// Export (segments → xlsx download)
// ---------------------------------------------------------------------------

export function exportSubtitleXlsx(segments: SubtitleSegment[], fileName: string): void {
  const data = [HEADERS, ...segments.map((seg) => [seg.index, seg.label, seg.startTime, seg.endTime, seg.ko, seg.en, seg.zh, seg.ru])]

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Set column widths
  ws['!cols'] = [
    { wch: 4 },  // #
    { wch: 12 }, // 구간명
    { wch: 10 }, // 시작
    { wch: 10 }, // 끝
    { wch: 30 }, // 한국어
    { wch: 30 }, // 영어
    { wch: 30 }, // 중국어
    { wch: 30 }, // 러시아어
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '자막')
  XLSX.writeFile(wb, fileName)
}
