import type { ScheduleColumn, ScheduleRow } from '../types'

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

export function getScheduleColumnIndex(columns: ScheduleColumn[], columnName: string): number {
  return columns.findIndex((column) => column.name === columnName)
}

export function readScheduleCellText(row: ScheduleRow, columns: ScheduleColumn[], columnName: string): string {
  const index = getScheduleColumnIndex(columns, columnName)
  return index >= 0 ? row.cells[index]?.text?.trim() ?? '' : ''
}

export function readScheduleTitleText(row: ScheduleRow, columns: ScheduleColumn[]): string {
  const titleIndex = columns.findIndex((column) => column.type === 'title')
  const effectiveIndex = titleIndex >= 0 ? titleIndex : 0
  return row.cells[effectiveIndex]?.text?.trim() ?? ''
}

export function normalizeScheduleKey(value: string): string {
  return value.trim().replace(/-/g, '').toLowerCase()
}

export function resolveScheduleRelationText(raw: string, labelMap: Record<string, string>): string {
  const labels = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => labelMap[normalizeScheduleKey(value)] ?? labelMap[value] ?? value)
  return labels.join(', ')
}
