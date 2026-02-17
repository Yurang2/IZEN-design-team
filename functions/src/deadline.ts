interface ParserResult {
  offsetDays: number
  source: 'text_parser'
}

const RULE_TABLE: Array<{ keyword: string; offsetDays: number }> = [
  { keyword: '메인', offsetDays: -21 },
  { keyword: '핵심', offsetDays: -21 },
  { keyword: '디자인', offsetDays: -14 },
  { keyword: '홍보', offsetDays: -14 },
  { keyword: '운영', offsetDays: -7 },
]

export function calculateDueDateFromEvent(eventDate: string | undefined, offsetDays: number): string | undefined {
  if (!eventDate) {
    return undefined
  }
  const date = new Date(eventDate)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export function resolveOffsetByRuleTable(workCategory: string): number {
  const hit = RULE_TABLE.find((rule) => workCategory.includes(rule.keyword))
  return hit?.offsetDays ?? -7
}

export function parseFinalDueText(input: string): ParserResult | undefined {
  const text = input.trim()
  if (!text) {
    return undefined
  }

  const dayMatch = text.match(/(\d+)\s*일\s*전/)
  if (dayMatch) {
    return { offsetDays: -Number(dayMatch[1]), source: 'text_parser' }
  }

  const weekMatch = text.match(/(\d+)\s*주\s*전/)
  if (weekMatch) {
    return { offsetDays: -Number(weekMatch[1]) * 7, source: 'text_parser' }
  }

  if (text.includes('당일')) {
    return { offsetDays: 0, source: 'text_parser' }
  }

  return undefined
}
