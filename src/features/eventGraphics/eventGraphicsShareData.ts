import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { bangkokMasterfileManifest } from './generatedMasterfileManifest'

export type EventGraphicsShareLocale = 'en' | 'ko'

export type VendorCue = {
  id: string
  eventName: string
  cueNumber: string
  cueType: string
  title: string
  startTime: string
  endTime: string
  runtimeLabel: string
  previewHref: string | null
  assetHref: string | null
  startGraphic: string
  startGraphicAction: string
  startAudio: string
  startAudioAction: string
  nextGraphic: string
  nextGraphicAction: string
  nextAudio: string
  nextAudioAction: string
  note: string
}

export type EventGroup = {
  eventName: string
  cues: VendorCue[]
}

type ShareRow = {
  id: string
  rowTitle: string
  cueOrder: number | null
  cueType: string
  cueTitle: string
  eventName: string
  startTime: string
  endTime: string
  runtime: string
  graphicAsset: string
  sourceVideo: string
  sourceAudio: string
  sourceRemark: string
  vendorNote: string
  personnel: string
  previewHref: string | null
  assetHref: string | null
}

const ENTRANCE_LABEL = '입장'
export const MISSING_FILE_LABEL = '파일명 확인 필요'

const CUE_TYPE_LABELS: Record<EventGraphicsShareLocale, Record<string, string>> = {
  en: {
    announcement: 'Announcement',
    opening: 'Opening',
    introduce: 'Introduce',
    lecture: 'Lecture',
    certificate: 'Certificate',
    break: 'Break',
    meal: 'Meal',
    closing: 'Closing',
    other: 'Other',
  },
  ko: {
    announcement: '공지',
    opening: '오프닝',
    introduce: '인트로듀스',
    lecture: '강연',
    certificate: '증정',
    break: '브레이크',
    meal: '식사',
    closing: '클로징',
    other: '기타',
  },
}

export const eventGraphicsManifestByCueNumber = new Map<string, (typeof bangkokMasterfileManifest.cues)[number]>(
  bangkokMasterfileManifest.cues.map((cue) => [cue.cueNumber, cue]),
)

export function normalizeEventCueType(rawType: string, title: string): string {
  const normalizedType = rawType.trim().toLowerCase()
  const normalizedTitle = title.trim().toLowerCase()
  if (normalizedType === 'lecture') return 'lecture'
  if (normalizedType === 'introduce') return 'introduce'
  if (/\bintroduction\b|\bintroduce\b/.test(normalizedTitle)) return 'introduce'
  return normalizedType || 'other'
}

export function supportsAppearanceStage(cueType: string): boolean {
  return cueType === 'introduce' || cueType === 'lecture'
}

function buildColumnIndex(columns: ScheduleColumn[]): Record<string, number> {
  return columns.reduce<Record<string, number>>((accumulator, column, index) => {
    accumulator[column.name] = index
    return accumulator
  }, {})
}

function readCellText(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): string {
  const index = columnIndex[columnName]
  if (index == null) return ''
  return row.cells[index]?.text?.trim() ?? ''
}

function readCellHref(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): string | null {
  const index = columnIndex[columnName]
  if (index == null) return null
  return row.cells[index]?.href ?? null
}

function readFirstCellText(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): string {
  for (const columnName of columnNames) {
    const value = readCellText(row, columnIndex, columnName)
    if (value) return value
  }
  return ''
}

function looksLikeVideoAsset(value: string): boolean {
  return /\.(mp4|mov|m4v|avi|wmv|mkv)\b/i.test(value) || /\bvideo\b/i.test(value)
}

function looksLikeLoopInstruction(value: string): boolean {
  return /\bloop\b/i.test(value)
}

function toRuntimeMinutes(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatRuntimeLabel(value: number | null): string {
  return value != null ? `${value} min` : '-'
}

function joinSummary(parts: Array<string | false | null | undefined>): string {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function toSortMinutes(value: string): number {
  const match = value.trim().match(/(\d{1,2})\s*:\s*(\d{2})/)
  if (!match) return Number.MAX_SAFE_INTEGER
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER
  return hours * 60 + minutes
}

function toPrimaryAsset(row: ShareRow): string {
  if (row.graphicAsset && row.graphicAsset !== '-') return row.graphicAsset
  if (row.sourceVideo) return row.sourceVideo
  if (row.sourceAudio) return row.sourceAudio
  return MISSING_FILE_LABEL
}

function toCueNumber(value: number | null): string {
  const numeric = value == null ? Number.NaN : Math.round(value)
  return Number.isFinite(numeric) ? `Q${String(numeric).padStart(2, '0')}` : 'Q--'
}

function isEntranceRow(row: ShareRow): boolean {
  return row.cueTitle.trim() === ENTRANCE_LABEL
}

function canMergeEntranceWithMainRow(entranceRow: ShareRow, mainRow: ShareRow | undefined): boolean {
  if (!mainRow) return false
  if (!isEntranceRow(entranceRow)) return false
  if (!supportsAppearanceStage(mainRow.cueType)) return false
  if (entranceRow.eventName !== mainRow.eventName) return false
  if (entranceRow.cueOrder == null || mainRow.cueOrder == null) return false
  return Math.ceil(entranceRow.cueOrder) === Math.round(mainRow.cueOrder)
}

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ShareRow {
  const cueOrderText = readFirstCellText(row, columnIndex, ['정렬 순서', 'Cue 순서', '운영 순서', 'No'])
  const cueOrderNumeric = Number(cueOrderText)
  const cueNumber = Number.isFinite(cueOrderNumeric) ? `Q${String(Math.ceil(cueOrderNumeric)).padStart(2, '0')}` : null
  const manifestCue = cueNumber ? eventGraphicsManifestByCueNumber.get(cueNumber) ?? null : null
  const cueTitle = readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '제목') || '-'

  return {
    id: row.id,
    rowTitle: readCellText(row, columnIndex, '제목') || '-',
    cueOrder: Number.isFinite(cueOrderNumeric) ? cueOrderNumeric : null,
    cueType: normalizeEventCueType(readFirstCellText(row, columnIndex, ['카테고리', 'Cue 유형']) || 'other', cueTitle),
    cueTitle,
    eventName: readCellText(row, columnIndex, '행사명'),
    startTime: readCellText(row, columnIndex, '시작 시각') || '-',
    endTime: readCellText(row, columnIndex, '종료 시각') || '-',
    runtime: readCellText(row, columnIndex, '상영시간(분)'),
    graphicAsset: readFirstCellText(row, columnIndex, ['메인 화면', '그래픽 자산명', 'Main Screen']) || '-',
    sourceVideo: readFirstCellText(row, columnIndex, ['메인 화면', '원본 Video', '그래픽 자산명']),
    sourceAudio: readFirstCellText(row, columnIndex, ['오디오', '원본 Audio']),
    sourceRemark: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']),
    vendorNote: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']),
    personnel: readCellText(row, columnIndex, '무대 인원'),
    previewHref:
      readCellHref(row, columnIndex, '미리보기 링크') ||
      readCellText(row, columnIndex, '미리보기 링크') ||
      manifestCue?.previewUrl ||
      null,
    assetHref: readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || null,
  }
}

function buildMergedVendorCue(entranceRow: ShareRow, mainRow: ShareRow): VendorCue {
  const runtimeMinutes = (toRuntimeMinutes(entranceRow.runtime) ?? 0) + (toRuntimeMinutes(mainRow.runtime) ?? 0)

  return {
    id: `${entranceRow.id}__${mainRow.id}`,
    eventName: mainRow.eventName,
    cueNumber: toCueNumber(mainRow.cueOrder),
    cueType: mainRow.cueType,
    title: mainRow.cueTitle,
    startTime: entranceRow.startTime,
    endTime: mainRow.endTime,
    runtimeLabel: formatRuntimeLabel(runtimeMinutes),
    previewHref: mainRow.previewHref ?? entranceRow.previewHref,
    assetHref: mainRow.assetHref ?? entranceRow.assetHref,
    startGraphic: toPrimaryAsset(entranceRow),
    startGraphicAction: 'Play',
    startAudio: entranceRow.sourceAudio,
    startAudioAction: entranceRow.sourceAudio ? 'Play' : '',
    nextGraphic: toPrimaryAsset(mainRow),
    nextGraphicAction: looksLikeVideoAsset(toPrimaryAsset(mainRow)) ? 'Play' : 'Hold',
    nextAudio: mainRow.sourceAudio,
    nextAudioAction: mainRow.sourceAudio ? (looksLikeLoopInstruction(mainRow.sourceAudio) ? 'Loop' : 'Play') : '',
    note: joinSummary([
      entranceRow.sourceRemark,
      mainRow.sourceRemark,
      mainRow.vendorNote,
      mainRow.personnel && `무대 ${mainRow.personnel}`,
    ]),
  }
}

function buildSingleVendorCue(row: ShareRow): VendorCue {
  const primaryAsset = toPrimaryAsset(row)
  const graphicAction =
    row.cueType === 'certificate' || row.cueType === 'closing' || row.cueType === 'break' || row.cueType === 'meal'
      ? 'Hold'
      : looksLikeVideoAsset(primaryAsset)
        ? 'Play'
        : 'Hold'

  return {
    id: row.id,
    eventName: row.eventName,
    cueNumber: toCueNumber(row.cueOrder),
    cueType: row.cueType,
    title: row.cueTitle,
    startTime: row.startTime,
    endTime: row.endTime,
    runtimeLabel: formatRuntimeLabel(toRuntimeMinutes(row.runtime)),
    previewHref: row.previewHref,
    assetHref: row.assetHref,
    startGraphic: primaryAsset,
    startGraphicAction: graphicAction,
    startAudio: row.sourceAudio,
    startAudioAction: row.sourceAudio ? (looksLikeLoopInstruction(row.sourceAudio) ? 'Loop' : 'Play') : '',
    nextGraphic: '',
    nextGraphicAction: '',
    nextAudio: '',
    nextAudioAction: '',
    note: joinSummary([row.sourceRemark, row.vendorNote, row.personnel && `무대 ${row.personnel}`]),
  }
}

function buildVendorCues(rows: ShareRow[]): VendorCue[] {
  const vendorCues: VendorCue[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    const next = rows[index + 1]

    if (canMergeEntranceWithMainRow(current, next)) {
      vendorCues.push(buildMergedVendorCue(current, next as ShareRow))
      index += 1
      continue
    }

    if (isEntranceRow(current)) continue
    vendorCues.push(buildSingleVendorCue(current))
  }

  return vendorCues
}

export function buildEventGraphicsShareData(columns: ScheduleColumn[], rows: ScheduleRow[], untitledEvent: string): {
  groupedCues: EventGroup[]
  vendorCues: VendorCue[]
} {
  const columnIndex = buildColumnIndex(columns)
  const normalizedRows = rows
    .map((row) => toRowModel(row, columnIndex))
    .sort((left, right) => {
      const timeDiff = toSortMinutes(left.startTime) - toSortMinutes(right.startTime)
      if (timeDiff !== 0) return timeDiff
      return (left.cueOrder ?? Number.MAX_SAFE_INTEGER) - (right.cueOrder ?? Number.MAX_SAFE_INTEGER)
    })

  const vendorCues = buildVendorCues(normalizedRows)
  const groups = new Map<string, VendorCue[]>()

  for (const cue of vendorCues) {
    const groupName = cue.eventName.trim() || untitledEvent
    const current = groups.get(groupName)
    if (current) {
      current.push(cue)
      continue
    }
    groups.set(groupName, [cue])
  }

  return {
    vendorCues,
    groupedCues: Array.from(groups.entries()).map<EventGroup>(([eventName, cues]) => ({ eventName, cues })),
  }
}

export function buildEventGraphicsSharePageTitle(groupedCues: EventGroup[], databaseTitle: string): string {
  if (groupedCues.length === 1) return groupedCues[0]?.eventName || databaseTitle.trim() || 'Event Graphics Timetable'
  return databaseTitle.trim() || 'Event Graphics Timetable'
}

export function toCueTypeLabel(value: string, locale: EventGraphicsShareLocale): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return locale === 'ko' ? '기타' : 'Other'
  return CUE_TYPE_LABELS[locale][trimmed] ?? trimmed.replace(/_/g, ' ')
}
