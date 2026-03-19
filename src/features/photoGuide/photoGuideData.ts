import type { ScheduleColumn, ScheduleFile, ScheduleRow } from '../../shared/types'

export type PhotoGuideLink = {
  label: string
  href: string
}

export type PhotoGuideEntry = {
  id: string
  url: string | null
  title: string
  section: string
  order: number | null
  eventName: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  contactHref: string | null
  purpose: string
  mustShoot: string
  timeline: string
  cautions: string
  delivery: string
  references: string
  links: PhotoGuideLink[]
  attachments: ScheduleFile[]
}

export type PhotoGuideGroup = {
  key: string
  title: string
  eventDate: string
  location: string
  callTime: string
  contact: string
  contactHref: string | null
  entries: PhotoGuideEntry[]
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

function readHref(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): string | null {
  return normalizeText(readCell(row, columns, aliases)?.href) || null
}

function readFiles(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): ScheduleFile[] {
  return readCell(row, columns, aliases)?.files ?? []
}

function parseOrder(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function joinGroupKey(eventName: string, eventDate: string, location: string): string {
  return [eventName || '촬영 가이드', eventDate, location].join('::')
}

function pushLink(links: PhotoGuideLink[], label: string, href: string | null) {
  const normalizedHref = normalizeText(href)
  if (!normalizedHref) return
  if (links.some((entry) => entry.href === normalizedHref)) return
  links.push({ label, href: normalizedHref })
}

function collectReferenceLinks(row: ScheduleRow, columns: ScheduleColumn[]): PhotoGuideLink[] {
  const links: PhotoGuideLink[] = []
  pushLink(links, '참고 링크', readHref(row, columns, ['참고 링크', '레퍼런스 링크', 'guide link', 'reference link']))
  pushLink(links, '장소 링크', readHref(row, columns, ['장소 링크', '지도 링크', 'map link']))
  pushLink(links, '행사 링크', readHref(row, columns, ['행사 링크', 'event link']))

  for (const column of columns) {
    const normalized = normalizeColumnName(column.name)
    if (!['참고이미지', '참고자료', '첨부자료', '레퍼런스자료', '레퍼런스이미지'].includes(normalized)) continue
    const href = readHref(row, columns, [column.name])
    pushLink(links, column.name, href)
  }

  return links
}

function collectAttachments(row: ScheduleRow, columns: ScheduleColumn[]): ScheduleFile[] {
  const attachments = new Map<string, ScheduleFile>()
  for (const column of columns) {
    const normalized = normalizeColumnName(column.name)
    if (!normalized.includes('참고') && !normalized.includes('레퍼런스') && !normalized.includes('첨부') && !normalized.includes('파일')) {
      continue
    }
    const files = readFiles(row, columns, [column.name])
    for (const file of files) {
      const key = `${file.name}::${file.url}`
      if (!attachments.has(key)) attachments.set(key, file)
    }
  }
  return Array.from(attachments.values())
}

export function buildPhotoGuideGroups(columns: ScheduleColumn[], rows: ScheduleRow[], fallbackTitle: string): PhotoGuideGroup[] {
  const titleIndex = columns.findIndex((column) => column.type === 'title')
  const entries = rows.map((row, index) => {
    const eventName =
      readText(row, columns, ['행사명', 'event name', '프로젝트명', 'project name']) || fallbackTitle
    const eventDate = readText(row, columns, ['행사일', '촬영일', 'date'])
    const location = readText(row, columns, ['장소', 'location', 'venue'])
    const callTime = readText(row, columns, ['콜타임', '집합 시간', 'call time'])
    const contactCell = readCell(row, columns, ['현장 담당자', '담당자', '연락처', 'contact'])
    const contact = normalizeText(contactCell?.text)
    const section = readText(row, columns, ['섹션', '카테고리', '구분', 'section']) || '가이드'
    const title =
      normalizeText(row.cells[titleIndex >= 0 ? titleIndex : 0]?.text) ||
      readText(row, columns, ['가이드 제목', '섹션명', 'section title']) ||
      `가이드 ${index + 1}`
    const order = parseOrder(readText(row, columns, ['정렬 순서', '순서', 'order', 'no']))

    return {
      id: row.id,
      url: row.url,
      title,
      section,
      order,
      eventName,
      eventDate,
      location,
      callTime,
      contact,
      contactHref: normalizeText(contactCell?.href) || null,
      purpose: readText(row, columns, ['핵심 목적', '촬영 목적', '목적', 'brief']),
      mustShoot: readText(row, columns, ['필수 컷', '필수 촬영 컷', 'must shots']),
      timeline: readText(row, columns, ['시간대별 포인트', '타임라인', '일정 포인트', 'timeline']),
      cautions: readText(row, columns, ['주의 사항', '금지/주의', '주의', 'caution']),
      delivery: readText(row, columns, ['납품 규격', '납품 방식', 'deliverables', 'delivery']),
      references: readText(row, columns, ['참고 자료', '레퍼런스', 'reference note']),
      links: collectReferenceLinks(row, columns),
      attachments: collectAttachments(row, columns),
    } satisfies PhotoGuideEntry
  })

  const grouped = new Map<string, PhotoGuideGroup>()
  for (const entry of entries) {
    const key = joinGroupKey(entry.eventName, entry.eventDate, entry.location)
    const current = grouped.get(key)
    if (current) {
      current.entries.push(entry)
      if (!current.eventDate && entry.eventDate) current.eventDate = entry.eventDate
      if (!current.location && entry.location) current.location = entry.location
      if (!current.callTime && entry.callTime) current.callTime = entry.callTime
      if (!current.contact && entry.contact) {
        current.contact = entry.contact
        current.contactHref = entry.contactHref
      }
      continue
    }

    grouped.set(key, {
      key,
      title: entry.eventName || fallbackTitle,
      eventDate: entry.eventDate,
      location: entry.location,
      callTime: entry.callTime,
      contact: entry.contact,
      contactHref: entry.contactHref,
      entries: [entry],
    })
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      entries: group.entries.sort((left, right) => {
        if (left.order != null && right.order != null && left.order !== right.order) return left.order - right.order
        if (left.order != null) return -1
        if (right.order != null) return 1
        return left.title.localeCompare(right.title, 'ko')
      }),
    }))
    .sort((left, right) => {
      if (left.eventDate && right.eventDate && left.eventDate !== right.eventDate) {
        return left.eventDate.localeCompare(right.eventDate, 'ko')
      }
      return left.title.localeCompare(right.title, 'ko')
    })
}
