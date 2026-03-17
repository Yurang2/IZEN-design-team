import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { bangkokMasterfileManifest } from './generatedMasterfileManifest'
import { EventGraphicsPreviewMedia, hasVisualPreviewUrl } from './EventGraphicsPreviewMedia'

type EventGraphicsSharePageProps = {
  configured: boolean
  databaseTitle: string
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

type Locale = 'en' | 'ko'

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
  graphicType: string
  sourceVideo: string
  sourceAudio: string
  sourceRemark: string
  vendorNote: string
  personnel: string
  previewHref: string | null
  assetHref: string | null
}

type VendorCue = {
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

type EventGroup = {
  eventName: string
  cues: VendorCue[]
}

type AssetEntry = {
  name: string
  role: string
}

type CopySet = {
  externalShare: string
  loading: string
  loadErrorTitle: string
  notConnectedTitle: string
  notConnectedMessage: string
  emptyTitle: string
  emptyMessage: string
  image: string
  noPreview: string
  start: string
  thenHold: string
  main: string
  openFile: string
  fieldNote: string
  noSpecialNote: string
  graphic: string
  audio: string
  untitledEvent: string
}

const ENTRANCE_LABEL = '입장'
const MISSING_FILE_LABEL = '파일명 확인 필요'

const COPY: Record<Locale, CopySet> = {
  en: {
    externalShare: 'External Share',
    loading: 'Loading playback cues...',
    loadErrorTitle: 'Unable to load playback cues.',
    notConnectedTitle: 'The timetable database is not connected.',
    notConnectedMessage: 'The external share page could not read timetable data yet.',
    emptyTitle: 'No playback cues to display.',
    emptyMessage: 'There are no cues ready for the external playback view.',
    image: 'Image',
    noPreview: 'No preview image available.',
    start: 'Start',
    thenHold: 'Then / Hold',
    main: 'Main',
    openFile: 'Open file',
    fieldNote: 'Field note',
    noSpecialNote: 'No special note',
    graphic: 'Graphic',
    audio: 'Audio',
    untitledEvent: 'Untitled event',
  },
  ko: {
    externalShare: '외부 공유',
    loading: '운영 큐를 불러오는 중...',
    loadErrorTitle: '운영 큐를 불러오지 못했습니다.',
    notConnectedTitle: '타임테이블 DB가 연결되지 않았습니다.',
    notConnectedMessage: '외부 공유 페이지에서 타임테이블 데이터를 아직 읽어오지 못했습니다.',
    emptyTitle: '표시할 운영 큐가 없습니다.',
    emptyMessage: '업체용 운영 뷰에 표시할 큐 데이터가 없습니다.',
    image: '이미지',
    noPreview: '등록된 이미지가 없습니다.',
    start: '시작',
    thenHold: '이후 / 유지',
    main: '메인',
    openFile: '파일 열기',
    fieldNote: '현장 메모',
    noSpecialNote: '특이사항 없음',
    graphic: '그래픽',
    audio: '오디오',
    untitledEvent: '행사명 미지정',
  },
}

const CUE_TYPE_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    announcement: 'Announcement',
    opening: 'Opening',
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
    lecture: '강연',
    certificate: '증정',
    break: '브레이크',
    meal: '식사',
    closing: '클로징',
    other: '기타',
  },
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

function toCueTypeLabel(value: string, locale: Locale): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return locale === 'ko' ? '기타' : 'Other'
  return CUE_TYPE_LABELS[locale][trimmed] ?? trimmed.replace(/_/g, ' ')
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
  if (!['opening', 'lecture'].includes(mainRow.cueType)) return false
  if (entranceRow.eventName !== mainRow.eventName) return false
  if (entranceRow.cueOrder == null || mainRow.cueOrder == null) return false
  return Math.ceil(entranceRow.cueOrder) === Math.round(mainRow.cueOrder)
}

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ShareRow {
  const cueOrderText = readFirstCellText(row, columnIndex, ['정렬 순서', 'Cue 순서', '운영 순서', 'No'])
  const cueOrderNumeric = Number(cueOrderText)
  const cueNumber = Number.isFinite(cueOrderNumeric) ? `Q${String(Math.ceil(cueOrderNumeric)).padStart(2, '0')}` : null
  const manifestCue = cueNumber
    ? bangkokMasterfileManifest.cues.find((cue) => cue.cueNumber === cueNumber)
    : null

  return {
    id: row.id,
    rowTitle: readCellText(row, columnIndex, '행 제목') || '-',
    cueOrder: Number.isFinite(cueOrderNumeric) ? cueOrderNumeric : null,
    cueType: readFirstCellText(row, columnIndex, ['카테고리', 'Cue 유형']) || 'other',
    cueTitle: readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '행 제목') || '-',
    eventName: readCellText(row, columnIndex, '행사명'),
    startTime: readCellText(row, columnIndex, '시작 시각') || '-',
    endTime: readCellText(row, columnIndex, '종료 시각') || '-',
    runtime: readCellText(row, columnIndex, '러닝타임(분)'),
    graphicAsset: readFirstCellText(row, columnIndex, ['메인 화면', '그래픽 자산명', 'Main Screen']) || '-',
    graphicType: readFirstCellText(row, columnIndex, ['운영 액션', '그래픽 형식']) || '-',
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
  const runtimeMinutes =
    (toRuntimeMinutes(entranceRow.runtime) ?? 0) +
    (toRuntimeMinutes(mainRow.runtime) ?? 0)

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

function appendAssetEntry(entries: AssetEntry[], name: string, role: string) {
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName === '-' || trimmedName === MISSING_FILE_LABEL) return
  if (entries.some((entry) => entry.name === trimmedName)) return
  entries.push({ name: trimmedName, role })
}

function buildFallbackGraphicEntries(cue: VendorCue, copy: CopySet): AssetEntry[] {
  const entries: AssetEntry[] = []
  appendAssetEntry(entries, cue.startGraphic, cue.startGraphicAction ? `${copy.start} ${cue.startGraphicAction}` : copy.start)
  appendAssetEntry(entries, cue.nextGraphic, cue.nextGraphicAction ? `${copy.thenHold} ${cue.nextGraphicAction}` : copy.thenHold)
  return entries
}

function buildFallbackAudioEntries(cue: VendorCue, copy: CopySet): AssetEntry[] {
  const entries: AssetEntry[] = []
  appendAssetEntry(entries, cue.startAudio, cue.startAudioAction ? `${copy.start} ${cue.startAudioAction}` : copy.start)
  appendAssetEntry(entries, cue.nextAudio, cue.nextAudioAction ? `${copy.thenHold} ${cue.nextAudioAction}` : copy.thenHold)
  return entries
}

function ShareAssetPanel({
  title,
  files,
  missingFiles,
  href,
  copy,
}: {
  title: string
  files: AssetEntry[]
  missingFiles: string[]
  href: string | null
  copy: CopySet
}) {
  const hasMissingFiles = missingFiles.length > 0
  return (
    <section className={hasMissingFiles ? 'eventGraphicsAuditPanel is-missing' : 'eventGraphicsAuditPanel'}>
      <div className="eventGraphicsAuditPanelHead">
        <span className="eventGraphicsPanelLabel">{title}</span>
        {hasMissingFiles ? <span className="eventGraphicsAuditMissingFlag">missing</span> : null}
      </div>

      {files.length > 0 ? (
        <div className="eventGraphicsAuditChipList">
          {files.map((file) => (
            <span key={`${title}-${file.name}`} className="eventGraphicsAuditChip" title={file.role}>
              {file.name}
            </span>
          ))}
        </div>
      ) : (
        <span className="eventGraphicsSubline">-</span>
      )}

      {hasMissingFiles ? (
        <div className="eventGraphicsAuditMissing is-inline">
          <span className="eventGraphicsAuditMiniLabel">추가 필요</span>
          <div className="eventGraphicsAuditChipList is-missing">
            {missingFiles.map((file) => (
              <span key={`${title}-${file}`} className="eventGraphicsAuditChip is-missing">
                {file}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {href ? (
        <a className="eventGraphicsInlineLink" href={href} target="_blank" rel="noreferrer">
          {copy.openFile}
        </a>
      ) : null}
    </section>
  )
}

export function EventGraphicsSharePage({
  configured,
  databaseTitle,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsSharePageProps) {
  const [locale, setLocale] = useState<Locale>('en')

  const copy = COPY[locale]
  const columnIndex = useMemo(() => buildColumnIndex(columns), [columns])
  const normalizedRows = useMemo(
    () =>
      rows
        .map((row) => toRowModel(row, columnIndex))
        .sort((left, right) => {
          const timeDiff = toSortMinutes(left.startTime) - toSortMinutes(right.startTime)
          if (timeDiff !== 0) return timeDiff
          return (left.cueOrder ?? Number.MAX_SAFE_INTEGER) - (right.cueOrder ?? Number.MAX_SAFE_INTEGER)
        }),
    [columnIndex, rows],
  )

  const vendorCues = useMemo(() => buildVendorCues(normalizedRows), [normalizedRows])
  const manifestByCueNumber = useMemo(
    () => new Map<string, (typeof bangkokMasterfileManifest.cues)[number]>(bangkokMasterfileManifest.cues.map((cue) => [cue.cueNumber, cue])),
    [],
  )

  const groupedCues = useMemo(() => {
    const groups = new Map<string, VendorCue[]>()
    for (const cue of vendorCues) {
      const groupName = cue.eventName.trim() || copy.untitledEvent
      const current = groups.get(groupName)
      if (current) {
        current.push(cue)
        continue
      }
      groups.set(groupName, [cue])
    }
    return Array.from(groups.entries()).map<EventGroup>(([eventName, cues]) => ({ eventName, cues }))
  }, [copy.untitledEvent, vendorCues])

  const pageTitle = useMemo(() => {
    if (groupedCues.length === 1) return groupedCues[0]?.eventName || databaseTitle.trim() || 'Event Graphics Timetable'
    return databaseTitle.trim() || 'Event Graphics Timetable'
  }, [databaseTitle, groupedCues])

  if (loading) {
    return (
      <main className="eventGraphicsShareShell">
        <section className="eventGraphicsSharePage">
          <header className="eventGraphicsShareHero">
            <div className="eventGraphicsShareHeroTop">
              <p className="muted small">{copy.externalShare}</p>
            </div>
            <h1>{copy.loading}</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.loadErrorTitle} message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.notConnectedTitle} message={copy.notConnectedMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  if (vendorCues.length === 0) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  return (
    <main className="eventGraphicsShareShell">
      <section className="eventGraphicsSharePage">
        <header className="eventGraphicsShareHero">
          <div className="eventGraphicsShareHeroTop">
            <div className="eventGraphicsShareHeroText">
              <p className="muted small">{copy.externalShare}</p>
              <h1>{pageTitle}</h1>
            </div>
            <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
              <button
                type="button"
                className={locale === 'en' ? 'viewTab active' : 'viewTab'}
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={locale === 'ko' ? 'viewTab active' : 'viewTab'}
                aria-pressed={locale === 'ko'}
                onClick={() => setLocale('ko')}
              >
                KO
              </button>
            </div>
          </div>
        </header>

        <div className="eventGraphicsShareList">
          {groupedCues.map((group) => (
            <section key={group.eventName} className="eventGraphicsShareGroup">
              <header className="eventGraphicsShareGroupHead">
                <h2>{group.eventName}</h2>
              </header>

              <div className="eventGraphicsShareGroupList">
                {group.cues.map((cue) => {
                  const manifestCue = manifestByCueNumber.get(cue.cueNumber)
                  const registeredFiles = (manifestCue?.registeredFiles ?? []) as ReadonlyArray<{ name: string; kind: string; role: string }>
                  const missingFiles = (manifestCue?.missingFiles ?? []) as ReadonlyArray<{ kind: string; label: string; sourceName: string }>
                  const graphicFiles = manifestCue
                    ? registeredFiles.filter((file) => file.kind === 'image' || file.kind === 'video').map((file) => ({ name: file.name, role: file.role }))
                    : buildFallbackGraphicEntries(cue, copy)
                  const audioFiles = manifestCue
                    ? registeredFiles.filter((file) => file.kind === 'audio').map((file) => ({ name: file.name, role: file.role }))
                    : buildFallbackAudioEntries(cue, copy)
                  const missingGraphicFiles = manifestCue
                    ? missingFiles.filter((file) => file.kind !== 'audio').map((file) => file.sourceName || file.label)
                    : []
                  const missingAudioFiles = manifestCue
                    ? missingFiles.filter((file) => file.kind === 'audio').map((file) => file.sourceName || file.label)
                    : []
                  const previewHref = cue.previewHref || manifestCue?.previewUrl || null
                  const hasPreview = hasVisualPreviewUrl(previewHref)
                  return (
                    <article key={cue.id} className="eventGraphicsShareRow">
                      <div className="eventGraphicsShareTime">
                        <strong>{cue.startTime}</strong>
                        <span>{cue.endTime}</span>
                        <small>{cue.runtimeLabel}</small>
                      </div>

                      <div className="eventGraphicsShareBody">
                        <div className="eventGraphicsShareHead">
                          <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                          <span className="eventGraphicsShareSection">{toCueTypeLabel(cue.cueType, locale)}</span>
                          <h3>{cue.title}</h3>
                          <p>{cue.note || copy.noSpecialNote}</p>
                        </div>

                        <div className="eventGraphicsShareAssetGrid">
                          <section className="eventGraphicsAuditVisual">
                            <span className="eventGraphicsPanelLabel">{copy.image}</span>
                            {hasPreview ? (
                              <EventGraphicsPreviewMedia
                                src={previewHref ?? ''}
                                alt={`${cue.title} preview`}
                                className="eventGraphicsPreviewInline"
                                noPreviewText={copy.noPreview}
                              />
                            ) : (
                              <div className="eventGraphicsPreviewPlaceholder">{copy.noPreview}</div>
                            )}
                          </section>

                          <ShareAssetPanel
                            title={copy.graphic}
                            files={graphicFiles}
                            missingFiles={missingGraphicFiles}
                            href={cue.assetHref}
                            copy={copy}
                          />
                          <ShareAssetPanel
                            title={copy.audio}
                            files={audioFiles}
                            missingFiles={missingAudioFiles}
                            href={cue.assetHref}
                            copy={copy}
                          />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
