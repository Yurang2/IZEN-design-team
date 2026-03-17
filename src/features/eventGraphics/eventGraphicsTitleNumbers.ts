import type { EventGraphicsEventRow } from './eventGraphicsHierarchy'

function syncLeadingTitleNumber(value: string, cueOrderNumeric: number | null): string {
  const trimmed = value.trim()
  if (!trimmed || cueOrderNumeric == null) return value

  const cueOrderLabel = String(Math.round(cueOrderNumeric))
  if (/^\[\d+\]\s*/u.test(trimmed)) {
    return trimmed.replace(/^\[\d+\](\s*)/u, `[${cueOrderLabel}]$1`)
  }

  if (/^(?:Q\d+|\d+)(?:[.)]|-(?=\S)|:)?\s+/iu.test(trimmed)) {
    return trimmed.replace(/^(?:Q\d+|\d+)((?:[.)]|-(?=\S)|:)?\s+)/iu, `${cueOrderLabel}$1`)
  }

  return value
}

export function syncEventGraphicsTitleNumbers(rows: EventGraphicsEventRow[]): EventGraphicsEventRow[] {
  return rows.map((row) => ({
    ...row,
    rowTitle: syncLeadingTitleNumber(row.rowTitle, row.cueOrderNumeric),
    cueTitle: syncLeadingTitleNumber(row.cueTitle, row.cueOrderNumeric),
  }))
}
