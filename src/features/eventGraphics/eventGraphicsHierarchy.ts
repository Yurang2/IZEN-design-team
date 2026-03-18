import type { ScheduleColumn, ScheduleFile, ScheduleRow } from '../../shared/types'
import { bangkokMasterfileManifest } from './generatedMasterfileManifest'

export type EventGraphicsTimetableMode = 'event' | 'exhibition'
export type EventGraphicsStageKind = 'appearance' | 'main' | 'certificate'
export type EventGraphicsGraphicPreset = 'speaker_ppt'
export type EventGraphicsAudioPreset = 'dj_ambient' | 'video_embedded'

type MasterfileCue = (typeof bangkokMasterfileManifest.cues)[number]

export type EventGraphicsEventRow = {
  id: string
  url: string | null
  timetableMode: EventGraphicsTimetableMode
  rowTitle: string
  operationKey: string
  cueOrder: string
  cueOrderNumeric: number | null
  cueType: string
  cueTitle: string
  eventName: string
  startTime: string
  endTime: string
  runtime: string
  graphicAsset: string
  sourceAudio: string
  personnel: string
  remark: string
  vendorNote: string
  captureFiles: ScheduleFile[]
  audioFiles: ScheduleFile[]
  graphicPreset: EventGraphicsGraphicPreset | null
  audioPreset: EventGraphicsAudioPreset | null
  graphicLabel: string
  audioLabel: string
  note: string
  previewHref: string | null
  assetHref: string | null
}

export type EventGraphicsSessionStage = {
  id: string
  cueNumber: string
  manifestKey: string | null
  stageKind: EventGraphicsStageKind
  sortOrder: number
  label: string
  title: string
  cueType: string
  eventName: string
  startTime: string
  endTime: string
  runtimeMinutes: number
  runtimeLabel: string
  captureFiles: ScheduleFile[]
  audioFiles: ScheduleFile[]
  graphicPreset: EventGraphicsGraphicPreset | null
  audioPreset: EventGraphicsAudioPreset | null
  graphicLabel: string
  audioLabel: string
  note: string
  previewHref: string | null
  assetHref: string | null
}

export type EventGraphicsSessionGroup = {
  id: string
  eventName: string
  cueNumber: string
  title: string
  cueType: string
  startTime: string
  endTime: string
  runtimeLabel: string
  stages: EventGraphicsSessionStage[]
}

const SPEAKER_PPT_LABEL = '강연자 PPT'
const DJ_AMBIENT_MUSIC_LABEL = 'DJ Ambient Music'
const VIDEO_INCLUDED_LABEL = '비디오에 포함'
const ENTRANCE_LABELS = new Set(['등장', '입장'])
const masterfileCueByKey = new Map<string, MasterfileCue>(
  bangkokMasterfileManifest.cues.flatMap((cue) => {
    const keys = [typeof cue.operationKey === 'string' ? cue.operationKey.trim() : '', cue.cueNumber.trim()].filter(Boolean)
    return keys.map((key) => [key, cue] as const)
  }),
)

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

function readCellFiles(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): ScheduleFile[] {
  const index = columnIndex[columnName]
  if (index == null) return []
  return row.cells[index]?.files ?? []
}

function readFirstCellText(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): string {
  for (const columnName of columnNames) {
    const value = readCellText(row, columnIndex, columnName)
    if (value) return value
  }
  return ''
}

function readFirstCellFiles(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): ScheduleFile[] {
  for (const columnName of columnNames) {
    const files = readCellFiles(row, columnIndex, columnName)
    if (files.length > 0) return files
  }
  return []
}

function normalizeTimetableMode(value: string): EventGraphicsTimetableMode | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (['자체행사', '행사', 'event', 'seminar', 'hotel'].includes(normalized)) return 'event'
  if (['전시회', 'exhibition', 'expo', 'booth'].includes(normalized)) return 'exhibition'
  return null
}

function formatRuntimeLabel(runtime: string): string {
  return runtime ? `${runtime}분` : '-'
}

function toRuntimeMinutes(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function joinSummary(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' / ')
}

function joinScheduleFileNames(files: ReadonlyArray<ScheduleFile>): string {
  return files.map((file) => file.name).join(' / ')
}

function getPreviewFileUrl(files: ReadonlyArray<ScheduleFile>): string | null {
  const visualFile = files.find((file) => file.kind === 'image' || file.kind === 'video')
  if (visualFile) return visualFile.url
  return files[0]?.url ?? null
}

function getMasterfileCue(operationKey: string, cueNumber: string | null): MasterfileCue | null {
  if (operationKey) {
    const cue = masterfileCueByKey.get(operationKey)
    if (cue) return cue
  }
  if (cueNumber) {
    const cue = masterfileCueByKey.get(cueNumber)
    if (cue) return cue
  }
  return null
}

function normalizeGraphicPreset(value: string): EventGraphicsGraphicPreset | null {
  return value.trim().toLowerCase() === SPEAKER_PPT_LABEL.toLowerCase() ? 'speaker_ppt' : null
}

function normalizeAudioPreset(value: string): EventGraphicsAudioPreset | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === DJ_AMBIENT_MUSIC_LABEL.toLowerCase()) return 'dj_ambient'
  if (normalized === VIDEO_INCLUDED_LABEL.toLowerCase()) return 'video_embedded'
  return null
}

export function normalizeEventCueType(rawType: string, title: string): string {
  const normalizedType = rawType.trim().toLowerCase()
  const normalizedTitle = title.trim().toLowerCase()
  if (normalizedType === 'entrance') return 'entrance'
  if (normalizedType === 'lecture') return 'lecture'
  if (normalizedType === 'introduce') return 'introduce'
  if (ENTRANCE_LABELS.has(title.trim())) return 'entrance'
  if (/\bintroduction\b|\bintroduce\b/.test(normalizedTitle)) return 'introduce'
  return normalizedType || 'other'
}

export function supportsAppearanceStage(cueType: string): boolean {
  return cueType === 'introduce' || cueType === 'lecture'
}

export function usesSpeakerPptPlaceholder(cueType: string, stageKind: EventGraphicsStageKind): boolean {
  return stageKind === 'main' && (cueType === 'introduce' || cueType === 'lecture')
}

export function toCueSortValue(value: string): number {
  const match = value.match(/(\d+(?:\.\d+)?)/)
  if (!match) return Number.MAX_SAFE_INTEGER
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function isAppearanceRow(row: Pick<EventGraphicsEventRow, 'cueTitle' | 'cueType' | 'rowTitle'>): boolean {
  const cueTitle = row.cueTitle.trim()
  const rowTitle = row.rowTitle.trim()
  return row.cueType === 'entrance' || ENTRANCE_LABELS.has(cueTitle) || /등장\s*-/u.test(rowTitle) || /입장\s*-/u.test(rowTitle)
}

function normalizeSessionTitle(value: string): string {
  return value
    .replace(/^\[[^\]]+\]\s*/u, '')
    .replace(/^\d+\s*/u, '')
    .replace(/^등장\s*-\s*/u, '')
    .replace(/^입장\s*-\s*/u, '')
    .replace(/\s+Certi$/u, '')
    .trim()
}

function toSessionTitle(row: EventGraphicsEventRow): string {
  if (isAppearanceRow(row)) return normalizeSessionTitle(row.rowTitle || row.cueTitle) || row.cueTitle
  return normalizeSessionTitle(row.cueTitle || row.rowTitle) || row.cueTitle
}

function toDisplayCueNumber(value: number | null, fallback: string): string {
  if (value == null) return fallback || 'Q--'
  return `Q${String(Math.round(value)).padStart(2, '0')}`
}

function toStageKind(row: EventGraphicsEventRow): EventGraphicsStageKind {
  if (isAppearanceRow(row)) return 'appearance'
  if (/\bcerti\b/i.test(row.cueTitle) || row.cueType === 'certificate') return 'certificate'
  return 'main'
}

function toSessionStageLabel(row: EventGraphicsEventRow): string {
  const stageKind = toStageKind(row)
  if (stageKind === 'appearance') return '등장'
  if (stageKind === 'certificate') return '서티 증정'
  if (row.cueType === 'introduce' || row.cueType === 'lecture') return '강연'
  return '메인'
}

function toStageSortOrder(row: EventGraphicsEventRow): number {
  const baseOrder = row.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER
  const stageKind = toStageKind(row)
  const stageOffset = stageKind === 'appearance' ? 0 : stageKind === 'main' ? 1 : 2
  return baseOrder * 10 + stageOffset
}

function findLinkedMainRow(rows: EventGraphicsEventRow[], index: number): EventGraphicsEventRow | null {
  const appearanceRow = rows[index]
  const appearanceCueNumber = toDisplayCueNumber(appearanceRow.cueOrderNumeric, appearanceRow.cueOrder)

  for (let offset = index + 1; offset < rows.length; offset += 1) {
    const candidate = rows[offset]
    if (candidate.eventName !== appearanceRow.eventName) return null
    if (isAppearanceRow(candidate)) continue
    if (!supportsAppearanceStage(candidate.cueType)) return null
    const candidateCueNumber = toDisplayCueNumber(candidate.cueOrderNumeric, candidate.cueOrder)
    if (candidateCueNumber !== appearanceCueNumber) return null
    return candidate
  }

  return null
}

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): EventGraphicsEventRow {
  const timetableMode =
    normalizeTimetableMode(readFirstCellText(row, columnIndex, ['타임테이블 유형', '운영 형식', 'Mode'])) ?? 'event'
  const cueOrderText = readFirstCellText(row, columnIndex, ['정렬 순서', 'Cue 순서', '운영 순서', 'No'])
  const cueOrderNumeric = Number(cueOrderText)
  const cueNumber = Number.isFinite(cueOrderNumeric) ? toDisplayCueNumber(cueOrderNumeric, cueOrderText) : null
  const cueTitle = readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '행 제목') || '-'
  const normalizedCueType = normalizeEventCueType(readFirstCellText(row, columnIndex, ['카테고리', 'Cue 유형']) || 'other', cueTitle)
  const operationKey = readCellText(row, columnIndex, '운영 키')
  const captureFiles = readFirstCellFiles(row, columnIndex, ['캡쳐', '캡쳐(무조건 이미지형식)'])
  const audioFiles = readFirstCellFiles(row, columnIndex, ['오디오파일'])
  const previewHrefFromNotion =
    readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null
  const notionGraphicAsset = readFirstCellText(row, columnIndex, ['메인 화면', '그래픽 자산명', 'Main Screen']) || '-'
  const notionSourceAudio = readFirstCellText(row, columnIndex, ['오디오', '원본 Audio']) || ''
  const eventName = readFirstCellText(row, columnIndex, ['행사명', '귀속 프로젝트']) || ''
  const manifestCue = getMasterfileCue(operationKey, cueNumber)
  const captureLabel = joinScheduleFileNames(captureFiles)
  const audioFileLabel = joinScheduleFileNames(audioFiles)
  const graphicPreset = normalizeGraphicPreset(notionGraphicAsset)
  const audioPreset = normalizeAudioPreset(notionSourceAudio)
  const note = joinSummary([
    readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']),
    readCellText(row, columnIndex, '무대 인원') ? `무대 ${readCellText(row, columnIndex, '무대 인원')}` : '',
  ])

  return {
    id: row.id,
    url: row.url,
    timetableMode,
    rowTitle: readCellText(row, columnIndex, '행 제목') || '-',
    operationKey,
    cueOrder: cueOrderText || '-',
    cueOrderNumeric: Number.isFinite(cueOrderNumeric) ? cueOrderNumeric : null,
    cueType: normalizedCueType,
    cueTitle,
    eventName,
    startTime: readCellText(row, columnIndex, '시작 시각') || '-',
    endTime: readCellText(row, columnIndex, '종료 시각') || '-',
    runtime: readCellText(row, columnIndex, '러닝타임(분)') || readCellText(row, columnIndex, '예상시간(분)'),
    graphicAsset: graphicPreset ? SPEAKER_PPT_LABEL : captureLabel || '-',
    sourceAudio: audioPreset ? (audioPreset === 'dj_ambient' ? DJ_AMBIENT_MUSIC_LABEL : VIDEO_INCLUDED_LABEL) : audioFileLabel || '-',
    personnel: readCellText(row, columnIndex, '무대 인원'),
    remark: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']),
    vendorNote: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']),
    captureFiles,
    audioFiles,
    graphicPreset,
    audioPreset,
    graphicLabel: graphicPreset ? SPEAKER_PPT_LABEL : captureLabel || '-',
    audioLabel: audioPreset ? (audioPreset === 'dj_ambient' ? DJ_AMBIENT_MUSIC_LABEL : VIDEO_INCLUDED_LABEL) : audioFileLabel || '-',
    note: note || '메모 없음',
    previewHref: getPreviewFileUrl(captureFiles) || manifestCue?.previewUrl || previewHrefFromNotion || null,
    assetHref: readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || captureFiles[0]?.url || null,
  }
}

export function buildEventGraphicsEventRows(columns: ScheduleColumn[], rows: ScheduleRow[]): EventGraphicsEventRow[] {
  const columnIndex = buildColumnIndex(columns)
  const normalizedRows = rows
    .map((row) => toRowModel(row, columnIndex))
    .sort((left, right) => {
      const orderDiff = (left.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER) - (right.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER)
      if (orderDiff !== 0) return orderDiff
      return left.startTime.localeCompare(right.startTime, 'en')
    })

  return normalizedRows
    .filter((row) => row.timetableMode === 'event')
    .filter((row, index, allRows) => {
      if (!isAppearanceRow(row)) return true
      return Boolean(findLinkedMainRow(allRows, index))
    })
}

export function buildEventGraphicsSessionGroups(rows: EventGraphicsEventRow[]): EventGraphicsSessionGroup[] {
  const groups: EventGraphicsSessionGroup[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const previousGroup = groups[groups.length - 1]
    const title = toSessionTitle(row)
    const stageKind = toStageKind(row)
    const rowCueNumber = toDisplayCueNumber(row.cueOrderNumeric, row.cueOrder)
    const stage: EventGraphicsSessionStage = {
      id: row.id,
      cueNumber: rowCueNumber,
      manifestKey: stageKind === 'appearance' ? null : row.operationKey || rowCueNumber,
      stageKind,
      sortOrder: toStageSortOrder(row),
      label: toSessionStageLabel(row),
      title: row.cueTitle,
      cueType: row.cueType,
      eventName: row.eventName,
      startTime: row.startTime,
      endTime: row.endTime,
      runtimeMinutes: toRuntimeMinutes(row.runtime),
      runtimeLabel: formatRuntimeLabel(row.runtime),
      captureFiles: row.captureFiles,
      audioFiles: row.audioFiles,
      graphicPreset: row.graphicPreset,
      audioPreset: row.audioPreset,
      graphicLabel: row.graphicLabel,
      audioLabel: row.audioLabel,
      note: row.note,
      previewHref: row.previewHref,
      assetHref: row.assetHref,
    }

    if (stageKind === 'appearance') {
      const nextRow = findLinkedMainRow(rows, index)
      const nextTitle = nextRow ? toSessionTitle(nextRow) : title
      const nextCueNumber = toDisplayCueNumber(nextRow?.cueOrderNumeric ?? row.cueOrderNumeric, row.cueOrder)
      groups.push({
        id: nextRow?.id ?? row.id,
        eventName: nextRow?.eventName ?? row.eventName,
        cueNumber: nextCueNumber,
        title: nextTitle,
        cueType: nextRow?.cueType ?? row.cueType,
        startTime: row.startTime,
        endTime: nextRow?.endTime ?? row.endTime,
        runtimeLabel: nextRow ? formatRuntimeLabel(String(stage.runtimeMinutes + toRuntimeMinutes(nextRow.runtime))) : stage.runtimeLabel,
        stages: [stage],
      })
      continue
    }

    const shouldAttachCertificate =
      stageKind === 'certificate' &&
      previousGroup &&
      previousGroup.eventName === row.eventName &&
      ['introduce', 'lecture'].includes(previousGroup.cueType) &&
      previousGroup.cueNumber === rowCueNumber &&
      normalizeSessionTitle(row.cueTitle) === previousGroup.title

    if (shouldAttachCertificate) {
      previousGroup.stages.push(stage)
      previousGroup.endTime = row.endTime
      previousGroup.runtimeLabel = formatRuntimeLabel(
        String(previousGroup.stages.reduce((sum, currentStage) => sum + currentStage.runtimeMinutes, 0)),
      )
      continue
    }

    const shouldAttachMainStage =
      previousGroup &&
      previousGroup.eventName === row.eventName &&
      previousGroup.title === title &&
      previousGroup.cueNumber === rowCueNumber &&
      supportsAppearanceStage(row.cueType)

    if (shouldAttachMainStage) {
      previousGroup.stages.push(stage)
      previousGroup.endTime = row.endTime
      previousGroup.cueType = row.cueType
      previousGroup.runtimeLabel = formatRuntimeLabel(
        String(previousGroup.stages.reduce((sum, currentStage) => sum + currentStage.runtimeMinutes, 0)),
      )
      continue
    }

    groups.push({
      id: row.id,
      eventName: row.eventName,
      cueNumber: rowCueNumber,
      title,
      cueType: row.cueType,
      startTime: row.startTime,
      endTime: row.endTime,
      runtimeLabel: formatRuntimeLabel(row.runtime),
      stages: [stage],
    })
  }

  return groups.map((group) => {
    const sortedStages = [...group.stages].sort((left, right) => left.sortOrder - right.sortOrder)
    const runtimeTotal = sortedStages.reduce((sum, currentStage) => sum + currentStage.runtimeMinutes, 0)
    return {
      ...group,
      stages: sortedStages,
      startTime: sortedStages[0]?.startTime ?? group.startTime,
      endTime: sortedStages[sortedStages.length - 1]?.endTime ?? group.endTime,
      runtimeLabel: runtimeTotal > 0 ? `${runtimeTotal}분` : group.runtimeLabel,
    }
  })
}
