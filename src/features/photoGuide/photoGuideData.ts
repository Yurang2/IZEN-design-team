import type { ScheduleColumn, ScheduleFile, ScheduleRow } from '../../shared/types'

export type GuideSummaryBlock = {
  id: string
  title: string
  text: string
  order: number | null
}

export type ShotSlot = {
  id: string
  url: string | null
  title: string
  group: string
  order: number | null
  description: string
  image: ScheduleFile | null
  checked: boolean
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  contactHref: string | null
}

export type ShotGroup = {
  key: string
  title: string
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  contactHref: string | null
  summaryBlocks: GuideSummaryBlock[]
  shots: ShotSlot[]
}

export type ShotGuideDocumentData = {
  summaryBlocks: GuideSummaryBlock[]
  groups: ShotGroup[]
}

type ParsedGuideRow = {
  id: string
  url: string | null
  title: string
  group: string
  order: number | null
  description: string
  summaryText: string
  image: ScheduleFile | null
  checked: boolean
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  contactHref: string | null
  rowType: 'shot' | 'summary'
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/_()\-]+/g, '')
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function findColumnIndex(columns: ScheduleColumn[], aliases: string[]): number {
  const aliasSet = new Set(aliases.map(normalizeColumnName))
  return columns.findIndex((column) => aliasSet.has(normalizeColumnName(column.name)))
}

function readCell(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]) {
  const index = findColumnIndex(columns, aliases)
  return index >= 0 ? row.cells[index] : undefined
}

function readText(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): string {
  return normalizeText(readCell(row, columns, aliases)?.text)
}

function readFiles(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): ScheduleFile[] {
  return readCell(row, columns, aliases)?.files ?? []
}

function parseOrder(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRowType(value: string): 'shot' | 'summary' {
  const raw = normalizeText(value)
  const normalized = normalizeColumnName(value)
  if (!normalized) return 'shot'
  if (normalized === 'summary' || normalized.includes('summary') || raw.includes('\uC694\uC57D')) return 'summary'
  return 'shot'
}

function pickLeadImage(files: ScheduleFile[]): ScheduleFile | null {
  return files.find((file) => file.kind === 'image') ?? files[0] ?? null
}

function joinGroupKey(group: string, eventName: string, eventDate: string, location: string): string {
  return [group || eventName || '촬영 가이드', eventDate, location].join('::')
}

function readTitle(row: ScheduleRow, columns: ScheduleColumn[], fallback: string): string {
  const titleIndex = columns.findIndex((column) => column.type === 'title')
  const primary = normalizeText(row.cells[titleIndex >= 0 ? titleIndex : 0]?.text)
  if (primary) return primary
  return (
    readText(row, columns, ['컷 제목', '가이드 제목', 'section title', 'title']) ||
    readText(row, columns, ['제목']) ||
    fallback
  )
}

function toSummaryBlock(row: ParsedGuideRow): GuideSummaryBlock | null {
  const text = normalizeText(row.summaryText || row.description)
  if (!text) return null

  return {
    id: row.id,
    title: row.title || (row.group ? `${row.group} 요약` : '요약'),
    text,
    order: row.order,
  }
}

function compareOrderThenTitle(
  left: { order: number | null; title: string },
  right: { order: number | null; title: string },
): number {
  if (left.order != null && right.order != null && left.order !== right.order) return left.order - right.order
  if (left.order != null) return -1
  if (right.order != null) return 1
  return left.title.localeCompare(right.title, 'ko')
}

function smallestKnownOrder(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null)
  if (known.length === 0) return null
  return Math.min(...known)
}

function parseGuideRow(row: ScheduleRow, columns: ScheduleColumn[], fallbackTitle: string, index: number): ParsedGuideRow {
  const eventName =
    readText(row, columns, ['행사명', 'event name', '프로젝트명', 'project name']) || fallbackTitle
  const eventDate = readText(row, columns, ['행사일', '촬영일', 'date'])
  const location = readText(row, columns, ['장소', 'location', 'venue'])
  const callTime = readText(row, columns, ['콜타임', '집합 시간', 'call time'])
  const contactCell = readCell(row, columns, ['현장 담당자', '담당자', '연락처', 'contact'])
  const rowType = normalizeRowType(readText(row, columns, ['행 유형', 'row type', 'type']))
  const checkedText = readText(row, columns, ['촬영완료', 'checked', 'done', '완료'])
  const checked = checkedText === 'true' || checkedText === 'Yes' || checkedText === '✓'
  const rawGroup = readText(row, columns, ['그룹', '섹션', '카테고리', '구분', 'group', 'section'])
  const group = rawGroup || (rowType === 'summary' ? '' : eventName || '기타 컷')
  const title = readTitle(row, columns, rowType === 'summary' ? '요약' : `컷 ${index + 1}`)
  const description = readText(row, columns, ['설명', '촬영 목적', '목적', 'brief', 'description'])
  const summaryText =
    readText(row, columns, ['요약', 'summary', '요약 텍스트']) ||
    (rowType === 'summary' ? description : '')
  const image = pickLeadImage(readFiles(row, columns, ['컷 이미지', '첨부 자료', '참고 파일', 'files', 'image']))

  return {
    id: row.id,
    url: row.url,
    title,
    group,
    order: parseOrder(readText(row, columns, ['정렬 순서', '순서', 'order', 'no'])),
    description,
    summaryText,
    image,
    checked,
    eventName,
    eventDate,
    location,
    callTime,
    contact: normalizeText(contactCell?.text),
    contactHref: normalizeText(contactCell?.href) || null,
    rowType,
  }
}

function ensureGroup(groups: Map<string, ShotGroup>, row: ParsedGuideRow): ShotGroup {
  const key = joinGroupKey(row.group, row.eventName, row.eventDate, row.location)
  const current = groups.get(key)
  if (current) {
    if (!current.eventDate && row.eventDate) current.eventDate = row.eventDate
    if (!current.location && row.location) current.location = row.location
    if (!current.callTime && row.callTime) current.callTime = row.callTime
    if (!current.contact && row.contact) {
      current.contact = row.contact
      current.contactHref = row.contactHref
    }
    return current
  }

  const next: ShotGroup = {
    key,
    title: row.group || row.eventName || '촬영 가이드',
    eventName: row.eventName,
    eventDate: row.eventDate,
    location: row.location,
    callTime: row.callTime,
    contact: row.contact,
    contactHref: row.contactHref,
    summaryBlocks: [],
    shots: [],
  }
  groups.set(key, next)
  return next
}

export function buildShotGuideData(columns: ScheduleColumn[], rows: ScheduleRow[], fallbackTitle: string): ShotGuideDocumentData {
  const parsedRows = rows.map((row, index) => parseGuideRow(row, columns, fallbackTitle, index))
  const grouped = new Map<string, ShotGroup>()
  const summaryBlocks: GuideSummaryBlock[] = []

  for (const row of parsedRows) {
    if (row.rowType === 'summary') {
      const summary = toSummaryBlock(row)
      if (!summary) continue

      if (row.group) {
        ensureGroup(grouped, row).summaryBlocks.push(summary)
      } else {
        summaryBlocks.push(summary)
      }
      continue
    }

    ensureGroup(grouped, row).shots.push({
      id: row.id,
      url: row.url,
      title: row.title,
      group: row.group,
      order: row.order,
      description: row.description,
      image: row.image,
      checked: row.checked,
      eventName: row.eventName,
      eventDate: row.eventDate,
      location: row.location,
      callTime: row.callTime,
      contact: row.contact,
      contactHref: row.contactHref,
    })
  }

  const groups = Array.from(grouped.values())
    .map((group) => ({
      ...group,
      summaryBlocks: group.summaryBlocks.sort(compareOrderThenTitle),
      shots: group.shots.sort(compareOrderThenTitle),
    }))
    .sort((left, right) => {
      if (left.eventDate && right.eventDate && left.eventDate !== right.eventDate) {
        return left.eventDate.localeCompare(right.eventDate, 'ko')
      }

      const leftOrder = smallestKnownOrder([
        ...left.shots.map((shot) => shot.order),
        ...left.summaryBlocks.map((summary) => summary.order),
      ])
      const rightOrder = smallestKnownOrder([
        ...right.shots.map((shot) => shot.order),
        ...right.summaryBlocks.map((summary) => summary.order),
      ])
      if (leftOrder != null && rightOrder != null && leftOrder !== rightOrder) return leftOrder - rightOrder
      if (leftOrder != null) return -1
      if (rightOrder != null) return 1
      return left.title.localeCompare(right.title, 'ko')
    })

  return {
    summaryBlocks: summaryBlocks.sort(compareOrderThenTitle),
    groups,
  }
}
