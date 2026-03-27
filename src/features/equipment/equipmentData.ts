import type { ScheduleColumn, ScheduleRow } from '../../shared/types'

export type EquipmentItem = {
  id: string
  url: string | null
  name: string
  category: string
  owner: string
  qty: number | null
  parentEquipment: string
  location: string
  note: string
  order: number | null
}

export type EquipmentGroup = {
  category: string
  items: EquipmentItem[]
}

const CATEGORY_ORDER = [
  '카메라', '렌즈', '순간광', '모노포드', '삼각대',
  '배터리', '충전기', 'CF카드', 'SD카드', '리더기',
  '블로워', '마이크',
]

function normalizeCol(name: string): string {
  return name.replace(/[\s_\-]/g, '').toLowerCase()
}

function findCol(columns: ScheduleColumn[], aliases: string[]): number {
  const set = new Set(aliases.map(normalizeCol))
  return columns.findIndex((c) => set.has(normalizeCol(c.name)))
}

function readText(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): string {
  const idx = findCol(columns, aliases)
  if (idx < 0) return ''
  return row.cells[idx]?.text?.trim() ?? ''
}

function readNumber(row: ScheduleRow, columns: ScheduleColumn[], aliases: string[]): number | null {
  const text = readText(row, columns, aliases)
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

export function buildEquipmentItems(columns: ScheduleColumn[], rows: ScheduleRow[]): EquipmentItem[] {
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    name: readText(row, columns, ['장비명', '이름', 'name']),
    category: readText(row, columns, ['카테고리', 'category']),
    owner: readText(row, columns, ['소유', 'owner', '소유자']),
    qty: readNumber(row, columns, ['수량', 'qty', 'quantity']),
    parentEquipment: readText(row, columns, ['귀속장비', 'parent']),
    location: readText(row, columns, ['물품 위치', '물품위치', 'location']),
    note: readText(row, columns, ['비고', 'note', 'notes']),
    order: readNumber(row, columns, ['정렬순서', 'order']),
  }))
}

export function groupByCategory(items: EquipmentItem[]): EquipmentGroup[] {
  const map = new Map<string, EquipmentItem[]>()
  for (const item of items) {
    const key = item.category || '기타'
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }

  const groups: EquipmentGroup[] = []
  for (const [category, groupItems] of map) {
    groupItems.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    groups.push({ category, items: groupItems })
  }

  groups.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category)
    const bi = CATEGORY_ORDER.indexOf(b.category)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })

  return groups
}
