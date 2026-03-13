import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import {
  exhibitionPlaybookExampleRows,
  exhibitionSchemaFields,
  type ExhibitionPlaybookRow,
} from './exhibitionPlaybookExample'
import { bangkokMasterfileManifest } from './generatedMasterfileManifest'

type EventGraphicsTimetableViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

type TimetableMode = 'event' | 'exhibition'
type LayoutMode = 'compact' | 'masterfile'

type TimetableRow = {
  id: string
  url: string | null
  timetableMode: TimetableMode
  rowTitle: string
  cueOrder: string
  cueOrderNumeric: number | null
  cueType: string
  cueTitle: string
  startTime: string
  endTime: string
  runtime: string
  status: string
  graphicAsset: string
  graphicType: string
  sourceVideo: string
  sourceAudio: string
  personnel: string
  remark: string
  vendorNote: string
  previewHref: string | null
  assetHref: string | null
}

type MasterfileCue = (typeof bangkokMasterfileManifest.cues)[number]
type DriveChecklistState = Record<string, { graphic: boolean; audio: boolean }>
type SessionStage = {
  id: string
  cueNumber: string
  sortOrder: number
  label: string
  title: string
  cueType: string
  startTime: string
  endTime: string
  runtimeMinutes: number
  runtimeLabel: string
  status: string
  graphicLabel: string
  audioLabel: string
  note: string
  previewHref: string | null
}
type SessionGroup = {
  id: string
  cueNumber: string
  title: string
  cueType: string
  startTime: string
  endTime: string
  runtimeLabel: string
  stages: SessionStage[]
}

const EXTERNAL_SHARE_PATH = '/share/timetable'
const ENTRANCE_LABEL = '입장'
const APPEARANCE_LABEL = '등장'
const DRIVE_CHECKLIST_STORAGE_KEY = 'event-graphics-drive-checklist:v1'

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

function readFirstCellHref(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): string | null {
  for (const columnName of columnNames) {
    const value = readCellHref(row, columnIndex, columnName) || readCellText(row, columnIndex, columnName)
    if (value) return value
  }
  return null
}

function looksLikeImageUrl(value: string | null): boolean {
  if (!value) return false
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|#|$)/i.test(value)
}

function toStatusClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function toCueTypeClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function normalizeTimetableMode(value: string): TimetableMode | null {
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

function toDisplayCueOrder(row: TimetableRow): string {
  const numeric = row.cueOrderNumeric
  const cueNumber = numeric != null ? `Q${String(Math.ceil(numeric)).padStart(2, '0')}` : row.cueOrder
  if (isEntranceRow(row) && numeric != null) {
    return `${cueNumber}-등장`
  }
  return cueNumber
}

function matchesQuery(row: TimetableRow, query: string): boolean {
  if (!query) return true
  const source = [
    row.cueTitle,
    row.graphicAsset,
    row.sourceVideo,
    row.sourceAudio,
    row.personnel,
    row.remark,
    row.vendorNote,
    row.status,
  ]
    .join(' ')
    .toLowerCase()
  return source.includes(query)
}

function matchesMasterfileQuery(cue: MasterfileCue, query: string): boolean {
  if (!query) return true
  const source = [
    cue.cueNumber,
    cue.title,
    cue.cueType,
    cue.personnel,
    ...cue.registeredFiles.map((file) => file.name),
    ...cue.missingFiles.map((file) => file.label),
  ]
    .join(' ')
    .toLowerCase()
  return source.includes(query)
}

function matchesExhibitionQuery(row: ExhibitionPlaybookRow, query: string): boolean {
  if (!query) return true
  const source = [row.category, row.trigger, row.timeReference, row.mainScreen, row.audio, row.action, row.note, row.status]
    .join(' ')
    .toLowerCase()
  return source.includes(query)
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

function isEntranceRow(row: TimetableRow): boolean {
  const cueTitle = row.cueTitle.trim()
  const rowTitle = row.rowTitle.trim()
  return cueTitle === ENTRANCE_LABEL || cueTitle === APPEARANCE_LABEL || /등장\s*-/u.test(rowTitle)
}

function toSessionTitle(row: TimetableRow): string {
  if (isEntranceRow(row)) return normalizeSessionTitle(row.rowTitle || row.cueTitle) || row.cueTitle
  return normalizeSessionTitle(row.cueTitle || row.rowTitle) || row.cueTitle
}

function toBaseCueNumber(value: number | null): string {
  return value != null ? `Q${String(Math.ceil(value)).padStart(2, '0')}` : 'Q--'
}

function toSessionStageLabel(row: TimetableRow): string {
  if (isEntranceRow(row)) return '등장'
  if (/\bcerti\b/i.test(row.cueTitle) || row.cueType === 'certificate') return '서티 증정'
  if (row.cueType === 'lecture') return '강연'
  return '메인'
}

function toStageGraphicLabel(row: TimetableRow): string {
  return row.graphicAsset && row.graphicAsset !== '-' ? row.graphicAsset : row.sourceVideo || '-'
}

function buildSessionGroups(rows: TimetableRow[]): SessionGroup[] {
  const groups: SessionGroup[] = []

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const previousGroup = groups[groups.length - 1]
    const title = toSessionTitle(row)
    const stage: SessionStage = {
      id: row.id,
      cueNumber: toDisplayCueOrder(row),
      sortOrder: row.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER,
      label: toSessionStageLabel(row),
      title: row.cueTitle,
      cueType: row.cueType,
      startTime: row.startTime,
      endTime: row.endTime,
      runtimeMinutes: toRuntimeMinutes(row.runtime),
      runtimeLabel: formatRuntimeLabel(row.runtime),
      status: row.status,
      graphicLabel: toStageGraphicLabel(row),
      audioLabel: row.sourceAudio || '-',
      note: joinSummary([row.vendorNote, row.remark, row.personnel && `무대 ${row.personnel}`]) || '메모 없음',
      previewHref: row.previewHref,
    }
    const rowCueNumber = toBaseCueNumber(row.cueOrderNumeric)

    if (isEntranceRow(row)) {
      const nextRow = rows[index + 1]
      const nextTitle = nextRow ? toSessionTitle(nextRow) : title
      const nextCueNumber = toBaseCueNumber(nextRow?.cueOrderNumeric ?? row.cueOrderNumeric)
      groups.push({
        id: nextRow?.id ?? row.id,
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

    const shouldAttachToPreviousLecture =
      row.cueType === 'certificate' &&
      previousGroup &&
      previousGroup.cueType === 'lecture' &&
      normalizeSessionTitle(row.cueTitle) === previousGroup.title

    if (shouldAttachToPreviousLecture) {
      previousGroup.stages.push(stage)
      previousGroup.endTime = row.endTime
      previousGroup.runtimeLabel = formatRuntimeLabel(
        String(previousGroup.stages.reduce((sum, currentStage) => sum + currentStage.runtimeMinutes, 0)),
      )
      continue
    }

    const shouldAttachToPreviousOpeningOrLecture =
      previousGroup &&
      previousGroup.title === title &&
      previousGroup.cueNumber === rowCueNumber &&
      ['opening', 'lecture'].includes(row.cueType)

    if (shouldAttachToPreviousOpeningOrLecture) {
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

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): TimetableRow {
  const timetableMode =
    normalizeTimetableMode(readFirstCellText(row, columnIndex, ['타임테이블 유형', '운영 형식', 'Mode'])) ?? 'event'
  const cueOrderText = readCellText(row, columnIndex, 'Cue 순서')
  const cueOrderNumeric = Number(cueOrderText)
  const displayCueNumber = Number.isFinite(cueOrderNumeric) ? `Q${String(Math.ceil(cueOrderNumeric)).padStart(2, '0')}` : null
  const manifestCue = displayCueNumber
    ? bangkokMasterfileManifest.cues.find((cue) => cue.cueNumber === displayCueNumber)
    : null
  const previewHrefFromNotion =
    readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null

  return {
    id: row.id,
    url: row.url,
    timetableMode,
    rowTitle: readCellText(row, columnIndex, '행 제목') || '-',
    cueOrder: cueOrderText || '-',
    cueOrderNumeric: Number.isFinite(cueOrderNumeric) ? cueOrderNumeric : null,
    cueType: readCellText(row, columnIndex, 'Cue 유형') || 'other',
    cueTitle: readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '행 제목') || '-',
    startTime: readCellText(row, columnIndex, '시작 시각') || '-',
    endTime: readCellText(row, columnIndex, '종료 시각') || '-',
    runtime: readCellText(row, columnIndex, '러닝타임(분)'),
    status: readCellText(row, columnIndex, '상태') || 'planned',
    graphicAsset: readCellText(row, columnIndex, '그래픽 자산명') || '-',
    graphicType: readCellText(row, columnIndex, '그래픽 형식') || '-',
    sourceVideo: readCellText(row, columnIndex, '원본 Video'),
    sourceAudio: readCellText(row, columnIndex, '원본 Audio'),
    personnel: readCellText(row, columnIndex, '무대 인원'),
    remark: readCellText(row, columnIndex, '원본 비고'),
    vendorNote: readCellText(row, columnIndex, '업체 전달 메모'),
    previewHref: previewHrefFromNotion || manifestCue?.previewUrl || null,
    assetHref: readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || null,
  }
}

function toExhibitionRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ExhibitionPlaybookRow | null {
  const timetableMode = normalizeTimetableMode(readFirstCellText(row, columnIndex, ['타임테이블 유형', '운영 형식', 'Mode']))
  if (timetableMode !== 'exhibition') return null

  const orderText = readFirstCellText(row, columnIndex, ['운영 순서', 'Cue 순서', 'No'])
  const order = Number(orderText)
  const mainScreen = readFirstCellText(row, columnIndex, ['메인 화면', 'Main Screen', '그래픽 자산명'])
  const previewHref = readFirstCellHref(row, columnIndex, ['미리보기 링크'])

  return {
    id: row.id,
    order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
    numberLabel: Number.isFinite(order) ? String(order).padStart(2, '0') : '--',
    category: readFirstCellText(row, columnIndex, ['카테고리', 'Cue 제목']) || '-',
    trigger: readFirstCellText(row, columnIndex, ['트리거 상황', 'Trigger', '행 제목']) || '-',
    timeReference: readFirstCellText(row, columnIndex, ['시간 기준', 'Time']) || '-',
    mainScreen: mainScreen || '-',
    audio: readFirstCellText(row, columnIndex, ['오디오', '원본 Audio']) || '-',
    action: readFirstCellText(row, columnIndex, ['운영 액션', 'Action']) || 'Play',
    note: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']) || '메모 없음',
    status: readFirstCellText(row, columnIndex, ['상태']) || 'planned',
    previewHref,
    assetHref: readFirstCellHref(row, columnIndex, ['자산 링크']),
    source: 'db',
  }
}

function TimelineLayout({
  rows,
}: {
  rows: TimetableRow[]
}) {
  const groups = buildSessionGroups(rows)
  return (
    <div className="eventGraphicsTimelineList">
      {groups.map((group) => {
        const sessionTypeClassName = toCueTypeClassName(group.cueType)
        return (
          <article key={group.id} className="eventGraphicsTimelineCard">
            <div className="eventGraphicsTimelineHead">
              <div>
                <div className="eventGraphicsCueHead">
                  <span className="eventGraphicsOrder">{group.cueNumber}</span>
                  <span className={`eventGraphicsCueType cue-${sessionTypeClassName}`}>{group.cueType}</span>
                </div>
                <h3>{group.title}</h3>
                <p>
                  {group.startTime} - {group.endTime} / {group.runtimeLabel}
                </p>
              </div>
            </div>

            <div className="eventGraphicsTimelineStageList">
              {group.stages.map((stage) => {
                const stageStatusClassName = toStatusClassName(stage.status)
                const hasPreview = looksLikeImageUrl(stage.previewHref)
                return (
                  <div key={stage.id} className={`eventGraphicsTimelineStage status-${stageStatusClassName}`}>
                    <div className="eventGraphicsTimelineTime">
                      <strong>{stage.startTime}</strong>
                      <span>{stage.endTime}</span>
                      <small>{stage.runtimeLabel}</small>
                    </div>
                    <div className="eventGraphicsTimelineBody">
                      <div className="eventGraphicsTimelineMeta">
                        <div className="eventGraphicsCueHead">
                          <span className="eventGraphicsEntranceFlag">{stage.label}</span>
                          <span className={`eventGraphicsStatus status-${stageStatusClassName}`}>{stage.status}</span>
                        </div>
                        <strong>{stage.title}</strong>
                        <p>{stage.note}</p>
                      </div>
                      <div className="eventGraphicsTimelineAssets">
                        <div className="eventGraphicsCueSheetPanel">
                          <span className="eventGraphicsPanelLabel">그래픽</span>
                          <strong>{stage.graphicLabel}</strong>
                          {hasPreview ? (
                            <div className="eventGraphicsPreviewThumb">
                              <img src={stage.previewHref ?? ''} alt={`${stage.title} 미리보기`} loading="lazy" />
                            </div>
                          ) : (
                            <div className="eventGraphicsPreviewPlaceholder">등록된 이미지가 없습니다.</div>
                          )}
                        </div>
                        <div className="eventGraphicsCueSheetPanel">
                          <span className="eventGraphicsPanelLabel">오디오</span>
                          <strong>{stage.audioLabel}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ExhibitionPlaybookLayout({
  rows,
  isSample,
}: {
  rows: ExhibitionPlaybookRow[]
  isSample: boolean
}) {
  return (
    <div className="eventGraphicsExhibitionShell">
      {isSample ? (
        <article className="eventGraphicsExhibitionNotice">
          <strong>AEEDC 2026 example</strong>
          <p>전시회용 row가 아직 DB에 없어서, 전달하신 형식을 바탕으로 예시 화면을 먼저 보여주고 있습니다.</p>
        </article>
      ) : null}

      <div className="eventGraphicsExhibitionList">
        {rows.map((row) => {
          const statusClassName = toStatusClassName(row.status)
          const hasPreview = looksLikeImageUrl(row.previewHref)
          return (
            <article key={row.id} className={`eventGraphicsExhibitionCard status-${statusClassName}`}>
              <div className="eventGraphicsExhibitionHead">
                <div>
                  <div className="eventGraphicsCueHead">
                    <span className="eventGraphicsOrder">EX-{row.numberLabel}</span>
                    <span className="eventGraphicsCueType cue-exhibition">{row.category}</span>
                  </div>
                  <h3>{row.trigger}</h3>
                  <p>{row.timeReference}</p>
                </div>
                <span className={`eventGraphicsStatus status-${statusClassName}`}>{row.status}</span>
              </div>

              <div className="eventGraphicsExhibitionGrid">
                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Main Screen</span>
                  <strong>{row.mainScreen}</strong>
                  {hasPreview ? (
                    <div className="eventGraphicsPreviewInline">
                      <img src={row.previewHref ?? ''} alt={`${row.category} 미리보기`} loading="lazy" />
                    </div>
                  ) : (
                    <div className="eventGraphicsPreviewPlaceholder">등록된 미리보기가 없습니다.</div>
                  )}
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Audio</span>
                  <strong>{row.audio}</strong>
                  <span className="eventGraphicsPanelLabel">Action</span>
                  <strong>{row.action}</strong>
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Operator Note</span>
                  <p>{row.note}</p>
                  {row.assetHref ? (
                    <a className="eventGraphicsInlineLink" href={row.assetHref} target="_blank" rel="noreferrer">
                      자산 링크 열기
                    </a>
                  ) : null}
                </section>
              </div>
            </article>
          )
        })}
      </div>

      <article className="eventGraphicsExhibitionSchema">
        <div className="eventGraphicsExhibitionSchemaHead">
          <div>
            <p className="muted small">Recommended Notion Schema</p>
            <h3>전시회용 데이터 포맷</h3>
          </div>
        </div>

        <div className="eventGraphicsExhibitionSchemaGrid">
          {exhibitionSchemaFields.map((field) => (
            <section key={field.name} className="eventGraphicsCueSheetPanel">
              <span className="eventGraphicsPanelLabel">{field.type}</span>
              <strong>{field.name}</strong>
              <p>{field.description}</p>
              <span className="eventGraphicsSubline">{field.required ? 'Required' : 'Optional'}</span>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}

function MasterfileAssetPanel({
  title,
  cueNumber,
  field,
  driveChecked,
  expected,
  registeredFiles,
  missingFiles,
  onToggleDriveCheck,
}: {
  title: string
  cueNumber: string
  field: 'graphic' | 'audio'
  driveChecked: boolean
  expected: boolean
  registeredFiles: ReadonlyArray<{ name: string; kind: string; role: string }>
  missingFiles: ReadonlyArray<{ kind: string; label: string; sourceName: string }>
  onToggleDriveCheck: (cueNumber: string, field: 'graphic' | 'audio', checked: boolean) => void
}) {
  const hasLocalFiles = registeredFiles.length > 0
  const hasMissingFiles = missingFiles.length > 0
  const panelClassName = hasMissingFiles ? 'eventGraphicsAuditPanel is-missing' : 'eventGraphicsAuditPanel'

  return (
    <section className={panelClassName}>
      <div className="eventGraphicsAuditPanelHead">
        <span className="eventGraphicsPanelLabel">{title}</span>
        {hasMissingFiles ? <span className="eventGraphicsAuditMissingFlag">missing</span> : null}
      </div>

      <div className="eventGraphicsAuditInlineRow">
        <label className="eventGraphicsAuditCheck is-compact">
          <input type="checkbox" checked={expected && hasLocalFiles} disabled />
          <span>로컬</span>
        </label>
        {hasLocalFiles ? (
          <div className="eventGraphicsAuditChipList">
            {registeredFiles.map((file) => (
              <span key={file.name} className="eventGraphicsAuditChip" title={file.role}>
                {file.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="eventGraphicsAuditInlineRow">
        <label className="eventGraphicsAuditCheck is-compact">
          <input
            type="checkbox"
            checked={driveChecked}
            onChange={(event) => onToggleDriveCheck(cueNumber, field, event.target.checked)}
          />
          <span>드라이브</span>
        </label>
      </div>

      {hasMissingFiles ? (
        <div className="eventGraphicsAuditMissing is-inline">
          <span className="eventGraphicsAuditMiniLabel">추가 필요</span>
          <div className="eventGraphicsAuditChipList is-missing">
            {missingFiles.map((file) => (
              <span key={`${cueNumber}-${field}-${file.label}`} className="eventGraphicsAuditChip is-missing" title={file.label}>
                {file.sourceName || file.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MasterfileAuditLayout({
  cues,
  driveChecklist,
  onToggleDriveCheck,
}: {
  cues: MasterfileCue[]
  driveChecklist: DriveChecklistState
  onToggleDriveCheck: (cueNumber: string, field: 'graphic' | 'audio', checked: boolean) => void
}) {
  return (
    <div className="eventGraphicsAuditList">
      {cues.map((cue) => {
        const statusClassName = toStatusClassName(cue.status)
        const registeredFiles = cue.registeredFiles as ReadonlyArray<{ name: string; kind: string; role: string }>
        const missingFiles = cue.missingFiles as ReadonlyArray<{ kind: string; label: string; sourceName: string }>
        const graphicFiles = registeredFiles.filter((file) => file.kind === 'image' || file.kind === 'video')
        const audioFiles = registeredFiles.filter((file) => file.kind === 'audio')
        const missingGraphicFiles = missingFiles.filter((file) => file.kind !== 'audio')
        const missingAudioFiles = missingFiles.filter((file) => file.kind === 'audio')
        const expectedGraphic =
          graphicFiles.length > 0 || missingGraphicFiles.length > 0
        const expectedAudio = audioFiles.length > 0 || missingAudioFiles.length > 0
        const driveState = driveChecklist[cue.cueNumber] ?? { graphic: false, audio: false }

        return (
          <article key={cue.cueNumber} className={`eventGraphicsAuditCard status-${statusClassName}`}>
            <div className="eventGraphicsAuditHead">
              <div className="eventGraphicsCueHead">
                <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                <span className={`eventGraphicsCueType cue-${toCueTypeClassName(cue.cueType)}`}>{cue.cueType}</span>
              </div>
              <span className={`eventGraphicsStatus status-${statusClassName}`}>{cue.status}</span>
            </div>

            <div className="eventGraphicsAuditMeta">
              <h3>{cue.title}</h3>
              <p>
                {cue.startTime} - {cue.endTime} / {cue.runtimeLabel}
              </p>
              {cue.personnel && cue.personnel !== '-' ? <p>무대: {cue.personnel}</p> : null}
            </div>

            <div className="eventGraphicsAuditGrid">
              <section className="eventGraphicsAuditVisual">
                <span className="eventGraphicsPanelLabel">등록 이미지</span>
                {cue.previewUrl ? (
                  <>
                    <div className="eventGraphicsPreviewInline">
                      <img src={cue.previewUrl} alt={`${cue.title} 등록 이미지`} loading="lazy" />
                    </div>
                  </>
                ) : (
                  <div className="eventGraphicsPreviewPlaceholder">등록된 이미지가 없습니다.</div>
                )}
              </section>

              <MasterfileAssetPanel
                title="Graphics Check"
                cueNumber={cue.cueNumber}
                field="graphic"
                driveChecked={driveState.graphic}
                expected={expectedGraphic}
                registeredFiles={graphicFiles}
                missingFiles={missingGraphicFiles}
                onToggleDriveCheck={onToggleDriveCheck}
              />
              <MasterfileAssetPanel
                title="Audio Check"
                cueNumber={cue.cueNumber}
                field="audio"
                driveChecked={driveState.audio}
                expected={expectedAudio}
                registeredFiles={audioFiles}
                missingFiles={missingAudioFiles}
                onToggleDriveCheck={onToggleDriveCheck}
              />
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function EventGraphicsTimetableView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsTimetableViewProps) {
  const [timetableMode, setTimetableMode] = useState<TimetableMode>('event')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('compact')
  const [driveChecklist, setDriveChecklist] = useState<DriveChecklistState>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(DRIVE_CHECKLIST_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as DriveChecklistState
      setDriveChecklist(parsed)
    } catch {
      // Ignore malformed saved checklist state.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(DRIVE_CHECKLIST_STORAGE_KEY, JSON.stringify(driveChecklist))
  }, [driveChecklist])

  const normalizedQuery = query.trim().toLowerCase()
  const columnIndex = useMemo(() => buildColumnIndex(columns), [columns])
  const normalizedRows = useMemo(
    () =>
      rows
        .map((row) => toRowModel(row, columnIndex))
        .sort((left, right) => {
          const orderDiff = (left.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER) - (right.cueOrderNumeric ?? Number.MAX_SAFE_INTEGER)
          if (orderDiff !== 0) return orderDiff
          return left.startTime.localeCompare(right.startTime, 'en')
        }),
    [columnIndex, rows],
  )
  const tableRows = useMemo(() => normalizedRows.filter((row) => row.timetableMode === 'event'), [normalizedRows])
  const exhibitionRowsFromDb = useMemo(
    () =>
      rows
        .map((row) => toExhibitionRowModel(row, columnIndex))
        .filter((row): row is ExhibitionPlaybookRow => row != null)
        .sort((left, right) => left.order - right.order),
    [columnIndex, rows],
  )
  const exhibitionRows = useMemo(
    () => (exhibitionRowsFromDb.length > 0 ? exhibitionRowsFromDb : exhibitionPlaybookExampleRows),
    [exhibitionRowsFromDb],
  )
  const exhibitionUsesSample = exhibitionRowsFromDb.length === 0

  const rowStatusOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [tableRows],
  )
  const masterfileStatusOptions = useMemo(
    () => Array.from(new Set(bangkokMasterfileManifest.cues.map((cue) => cue.status))),
    [],
  )
  const exhibitionStatusOptions = useMemo(
    () => Array.from(new Set(exhibitionRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [exhibitionRows],
  )

  const filteredRows = useMemo(
    () =>
      tableRows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        return matchesQuery(row, normalizedQuery)
      }),
    [normalizedQuery, statusFilter, tableRows],
  )

  const filteredMasterfileCues = useMemo(
    () =>
      bangkokMasterfileManifest.cues.filter((cue) => {
        if (statusFilter && cue.status !== statusFilter) return false
        return matchesMasterfileQuery(cue, normalizedQuery)
      }),
    [normalizedQuery, statusFilter],
  )
  const filteredExhibitionRows = useMemo(
    () =>
      exhibitionRows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        return matchesExhibitionQuery(row, normalizedQuery)
      }),
    [exhibitionRows, normalizedQuery, statusFilter],
  )

  const readyCount = useMemo(() => tableRows.filter((row) => ['ready', 'shared'].includes(row.status)).length, [tableRows])
  const changedCount = useMemo(() => tableRows.filter((row) => row.status === 'changed_on_site').length, [tableRows])
  const entranceCount = useMemo(() => tableRows.filter((row) => isEntranceRow(row)).length, [tableRows])
  const loopCount = useMemo(() => exhibitionRows.filter((row) => /loop/i.test(row.action)).length, [exhibitionRows])
  const seminarTransitionCount = useMemo(
    () => exhibitionRows.filter((row) => /seminar/i.test(row.category) || /발표|연자|seminar/i.test(row.trigger)).length,
    [exhibitionRows],
  )
  const liveSwitchCount = useMemo(() => exhibitionRows.filter((row) => /hold|switch/i.test(row.action)).length, [exhibitionRows])
  const effectiveTitle = databaseTitle.trim() || '행사 그래픽 타임테이블'

  const onQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }

  const onStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value)
  }

  const onLayoutChange = (nextLayout: LayoutMode) => {
    setLayoutMode(nextLayout)
    setStatusFilter('')
  }

  const onTimetableModeChange = (nextMode: TimetableMode) => {
    setTimetableMode(nextMode)
    setQuery('')
    setStatusFilter('')
  }

  const onToggleDriveCheck = (cueNumber: string, field: 'graphic' | 'audio', checked: boolean) => {
    setDriveChecklist((current) => ({
      ...current,
      [cueNumber]: {
        graphic: current[cueNumber]?.graphic ?? false,
        audio: current[cueNumber]?.audio ?? false,
        [field]: checked,
      },
    }))
  }

  if (loading) {
    return (
      <section className="eventGraphicsView">
        <div className="eventGraphicsHero">
          <div className="eventGraphicsHeroText">
            <p className="muted small">Event Graphics Timetable</p>
            <h2>타임테이블 불러오는 중...</h2>
          </div>
        </div>
      </section>
    )
  }

  if (error) {
    return <EmptyState title="타임테이블을 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
  }

  if (!configured) {
    return (
      <EmptyState
        title="타임테이블 DB가 연결되지 않았습니다."
        message="Worker 환경변수와 Notion 공유 설정을 먼저 확인해 주세요."
        className="scheduleEmptyState"
      />
    )
  }

  const isEventMode = timetableMode === 'event'
  const isMasterfileMode = isEventMode && layoutMode === 'masterfile'
  const statusOptions = isEventMode ? (isMasterfileMode ? masterfileStatusOptions : rowStatusOptions) : exhibitionStatusOptions
  const visibleCount = isEventMode
    ? layoutMode === 'masterfile'
      ? filteredMasterfileCues.length
      : filteredRows.length
    : filteredExhibitionRows.length

  return (
    <section className="eventGraphicsView">
      <div className="eventGraphicsHero">
        <div className="eventGraphicsHeroText">
          <p className="muted small">Event Graphics Timetable</p>
          <h2>{effectiveTitle}</h2>
          <p>자체행사는 시간 기준, 전시회는 상황 기준으로 분리해서 운영할 수 있게 구성했습니다.</p>
        </div>
        <div className="eventGraphicsHeroActions">
          <a className="linkButton" href={EXTERNAL_SHARE_PATH} target="_blank" rel="noreferrer">
            External Share Page
          </a>
          {databaseUrl ? (
            <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">
              Notion DB 열기
            </a>
          ) : null}
        </div>
      </div>

      <div className="eventGraphicsModeSwitch" role="group" aria-label="타임테이블 운영 모드">
        <button
          type="button"
          className={timetableMode === 'event' ? 'viewTab active' : 'viewTab'}
          aria-pressed={timetableMode === 'event'}
          onClick={() => onTimetableModeChange('event')}
        >
          자체행사
        </button>
        <button
          type="button"
          className={timetableMode === 'exhibition' ? 'viewTab active' : 'viewTab'}
          aria-pressed={timetableMode === 'exhibition'}
          onClick={() => onTimetableModeChange('exhibition')}
        >
          전시회
        </button>
      </div>

      {isEventMode && isMasterfileMode ? (
        <div className="eventGraphicsSummary" aria-label="마스터파일 점검 요약">
          <article>
            <span>점검 Cue</span>
            <strong>{bangkokMasterfileManifest.totalCueCount}</strong>
          </article>
          <article>
            <span>완료</span>
            <strong>{bangkokMasterfileManifest.completeCueCount}</strong>
          </article>
          <article>
            <span>부분 등록</span>
            <strong>{bangkokMasterfileManifest.partialCueCount}</strong>
          </article>
          <article>
            <span>미등록</span>
            <strong>{bangkokMasterfileManifest.missingCueCount}</strong>
          </article>
        </div>
      ) : isEventMode ? (
        <div className="eventGraphicsSummary" aria-label="행사 그래픽 요약">
          <article>
            <span>전체 Cue</span>
            <strong>{tableRows.length}</strong>
          </article>
          <article>
            <span>입장 Cue</span>
            <strong>{entranceCount}</strong>
          </article>
          <article>
            <span>준비완료 / 공유</span>
            <strong>{readyCount}</strong>
          </article>
          <article>
            <span>현장 변경</span>
            <strong>{changedCount}</strong>
          </article>
        </div>
      ) : (
        <div className="eventGraphicsSummary" aria-label="전시회 운영표 요약">
          <article>
            <span>상황 수</span>
            <strong>{exhibitionRows.length}</strong>
          </article>
          <article>
            <span>루프 운영</span>
            <strong>{loopCount}</strong>
          </article>
          <article>
            <span>세미나 전환</span>
            <strong>{seminarTransitionCount}</strong>
          </article>
          <article>
            <span>실시간 입력 전환</span>
            <strong>{liveSwitchCount}</strong>
          </article>
        </div>
      )}

      <div className="eventGraphicsToolbar">
        <input
          type="search"
          value={query}
          onChange={onQueryChange}
          placeholder={
            isEventMode
              ? isMasterfileMode
                ? '큐 번호, 제목, 등록 파일명 검색'
                : 'Cue 제목, 그래픽, 오디오, 비고 검색'
              : '카테고리, 트리거, 메인 화면, 오디오, 액션 검색'
          }
          aria-label="타임테이블 검색"
        />
        <select value={statusFilter} onChange={onStatusChange} aria-label="상태 필터">
          <option value="">{isEventMode && isMasterfileMode ? '모든 점검 상태' : '모든 상태'}</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {isEventMode ? (
        <div className="eventGraphicsLayoutSwitch" role="group" aria-label="타임테이블 보기 형태">
          <button
            type="button"
            className={layoutMode === 'compact' ? 'viewTab active' : 'viewTab'}
            aria-pressed={layoutMode === 'compact'}
            onClick={() => onLayoutChange('compact')}
          >
            시간표
          </button>
          <button
            type="button"
            className={layoutMode === 'masterfile' ? 'viewTab active' : 'viewTab'}
            aria-pressed={layoutMode === 'masterfile'}
            onClick={() => onLayoutChange('masterfile')}
          >
            Masterfile Check
          </button>
        </div>
      ) : null}

      {visibleCount === 0 ? (
        <EmptyState
          title={isEventMode ? (isMasterfileMode ? '표시할 파일 점검 항목이 없습니다.' : '표시할 cue가 없습니다.') : '표시할 운영 상황이 없습니다.'}
          message={
            isEventMode
              ? normalizedQuery || statusFilter
                ? isMasterfileMode
                  ? '현재 필터 조건과 일치하는 점검 항목이 없습니다.'
                  : '현재 필터 조건과 일치하는 cue가 없습니다.'
                : isMasterfileMode
                  ? '생성된 마스터파일 점검 데이터가 없습니다.'
                  : 'DB에 아직 cue row가 없습니다.'
              : normalizedQuery || statusFilter
                ? '현재 필터 조건과 일치하는 전시회 운영 row가 없습니다.'
                : '전시회 운영 row가 없으면 예시 화면을 먼저 표시합니다.'
          }
          className="scheduleEmptyState"
        />
      ) : isEventMode && layoutMode === 'compact' ? (
        <TimelineLayout rows={filteredRows} />
      ) : isEventMode ? (
        <MasterfileAuditLayout
          cues={filteredMasterfileCues}
          driveChecklist={driveChecklist}
          onToggleDriveCheck={onToggleDriveCheck}
        />
      ) : (
        <ExhibitionPlaybookLayout rows={filteredExhibitionRows} isSample={exhibitionUsesSample} />
      )}
    </section>
  )
}
