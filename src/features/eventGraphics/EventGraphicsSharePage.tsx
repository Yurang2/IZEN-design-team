import { useMemo } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'

type EventGraphicsSharePageProps = {
  configured: boolean
  databaseTitle: string
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
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

const ENTRANCE_LABEL = '등장'
const MISSING_FILE_LABEL = '파일명 확인 필요'

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

function looksLikeImageUrl(value: string | null): boolean {
  if (!value) return false
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|#|$)/i.test(value)
}

function looksLikeVideoAsset(value: string): boolean {
  return /\.(mp4|mov|m4v|avi|wmv|mkv)\b/i.test(value) || /\bvideo\b/i.test(value)
}

function looksLikeLoopInstruction(value: string): boolean {
  return /\bloop\b/i.test(value)
}

function toCueTypeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '기타'
  return trimmed.replace(/_/g, ' ')
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
  return Number.isFinite(numeric) ? String(numeric).padStart(2, '0') : '--'
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
  const cueOrderText = readCellText(row, columnIndex, 'Cue 순서')
  const cueOrderNumeric = Number(cueOrderText)

  return {
    id: row.id,
    rowTitle: readCellText(row, columnIndex, '행 제목') || '-',
    cueOrder: Number.isFinite(cueOrderNumeric) ? cueOrderNumeric : null,
    cueType: readCellText(row, columnIndex, 'Cue 유형') || 'other',
    cueTitle: readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '행 제목') || '-',
    eventName: readCellText(row, columnIndex, '행사명'),
    startTime: readCellText(row, columnIndex, '시작 시각') || '-',
    endTime: readCellText(row, columnIndex, '종료 시각') || '-',
    runtime: readCellText(row, columnIndex, '러닝타임(분)'),
    graphicAsset: readCellText(row, columnIndex, '그래픽 자산명') || '-',
    graphicType: readCellText(row, columnIndex, '그래픽 형식') || '-',
    sourceVideo: readCellText(row, columnIndex, '원본 Video'),
    sourceAudio: readCellText(row, columnIndex, '원본 Audio'),
    sourceRemark: readCellText(row, columnIndex, '원본 비고'),
    vendorNote: readCellText(row, columnIndex, '업체 전달 메모'),
    personnel: readCellText(row, columnIndex, '무대 인원'),
    previewHref: readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null,
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
    note:
      joinSummary([
        entranceRow.sourceRemark,
        mainRow.sourceRemark,
        mainRow.vendorNote,
        mainRow.personnel && `무대 ${mainRow.personnel}`,
      ]) || '특이사항 없음',
  }
}

function buildSingleVendorCue(row: ShareRow): VendorCue {
  const primaryAsset = toPrimaryAsset(row)
  const graphicAction = row.cueType === 'certificate' || row.cueType === 'closing' || row.cueType === 'break' || row.cueType === 'meal'
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
    note: joinSummary([row.sourceRemark, row.vendorNote, row.personnel && `무대 ${row.personnel}`]) || '특이사항 없음',
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

    if (isEntranceRow(current)) {
      // Orphan entrance rows should not become vendor-visible standalone cues.
      continue
    }

    vendorCues.push(buildSingleVendorCue(current))
  }

  return vendorCues
}

function ActionCard({
  title,
  graphic,
  graphicAction,
  audio,
  audioAction,
  href,
}: {
  title: string
  graphic: string
  graphicAction: string
  audio: string
  audioAction: string
  href: string | null
}) {
  return (
    <div className="eventGraphicsShareCoreCard">
      <span className="eventGraphicsPanelLabel">{title}</span>
      <div className="eventGraphicsShareActionList">
        <div className="eventGraphicsShareActionItem">
          <span>Graphic</span>
          <strong>{graphic || '-'}</strong>
          <p>{graphicAction || '-'}</p>
        </div>
        <div className="eventGraphicsShareActionItem">
          <span>Audio</span>
          <strong>{audio || '-'}</strong>
          <p>{audioAction || '-'}</p>
        </div>
      </div>
      {href ? (
        <a className="eventGraphicsInlineLink" href={href} target="_blank" rel="noreferrer">
          파일 열기
        </a>
      ) : null}
    </div>
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

  const groupedCues = useMemo(() => {
    const groups = new Map<string, VendorCue[]>()
    for (const cue of vendorCues) {
      const groupName = cue.eventName.trim() || '행사명 미지정'
      const current = groups.get(groupName)
      if (current) {
        current.push(cue)
        continue
      }
      groups.set(groupName, [cue])
    }
    return Array.from(groups.entries()).map<EventGroup>(([eventName, cues]) => ({ eventName, cues }))
  }, [vendorCues])

  const pageTitle = useMemo(() => {
    if (groupedCues.length === 1) return groupedCues[0]?.eventName || databaseTitle.trim() || 'Event Graphics Timetable'
    return databaseTitle.trim() || 'Event Graphics Timetable'
  }, [databaseTitle, groupedCues])

  const missingPreviewCount = useMemo(() => vendorCues.filter((cue) => !looksLikeImageUrl(cue.previewHref)).length, [vendorCues])
  const missingGraphicCount = useMemo(() => vendorCues.filter((cue) => !cue.startGraphic || cue.startGraphic === MISSING_FILE_LABEL).length, [vendorCues])
  const missingAudioCount = useMemo(
    () => vendorCues.filter((cue) => !cue.startAudio && !cue.nextAudio).length,
    [vendorCues],
  )

  if (loading) {
    return (
      <main className="eventGraphicsShareShell">
        <section className="eventGraphicsSharePage">
          <header className="eventGraphicsShareHero">
            <p className="muted small">External Share</p>
            <h1>운영 큐를 불러오는 중...</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="운영 큐를 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState
          title="타임테이블 DB가 연결되지 않았습니다."
          message="외부 공유 페이지에서 타임테이블 데이터를 아직 읽어오지 못했습니다."
          className="scheduleEmptyState"
        />
      </main>
    )
  }

  if (vendorCues.length === 0) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="표시할 큐가 없습니다." message="업체용 운영 큐로 표시할 데이터가 없습니다." className="scheduleEmptyState" />
      </main>
    )
  }

  return (
    <main className="eventGraphicsShareShell">
      <section className="eventGraphicsSharePage">
        <header className="eventGraphicsShareHero">
          <div className="eventGraphicsShareHeroText">
            <p className="muted small">External Share</p>
            <h1>{pageTitle}</h1>
            <p>입장과 본세션을 한 운영 큐로 합친 미디어업체용 오더입니다. 각 큐에서 Start와 Then/Hold만 보면 되게 구성했습니다.</p>
          </div>
          <div className="eventGraphicsShareSummary" aria-label="운영 큐 요약">
            <article>
              <span>행사 수</span>
              <strong>{groupedCues.length}</strong>
            </article>
            <article>
              <span>운영 큐</span>
              <strong>{vendorCues.length}</strong>
            </article>
            <article>
              <span>이미지 없음</span>
              <strong>{missingPreviewCount}</strong>
            </article>
            <article>
              <span>그래픽 확인 필요</span>
              <strong>{missingGraphicCount}</strong>
            </article>
            <article>
              <span>오디오 없음</span>
              <strong>{missingAudioCount}</strong>
            </article>
          </div>
        </header>

        <div className="eventGraphicsShareList">
          {groupedCues.map((group) => (
            <section key={group.eventName} className="eventGraphicsShareGroup">
              <header className="eventGraphicsShareGroupHead">
                <h2>{group.eventName}</h2>
                <p>총 {group.cues.length}개 운영 큐</p>
              </header>

              <div className="eventGraphicsShareGroupList">
                {group.cues.map((cue) => {
                  const hasPreview = looksLikeImageUrl(cue.previewHref)
                  return (
                    <article key={cue.id} className="eventGraphicsShareRow">
                      <div className="eventGraphicsShareTime">
                        <strong>{cue.startTime}</strong>
                        <span>{cue.endTime}</span>
                        <small>{cue.runtimeLabel}</small>
                      </div>

                      <div className="eventGraphicsShareBody">
                        <div className="eventGraphicsShareHead">
                          <div className="eventGraphicsCueHead">
                            <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                            <span className="eventGraphicsShareSection">{toCueTypeLabel(cue.cueType)}</span>
                          </div>
                          <h3>{cue.title}</h3>
                        </div>

                        <div className="eventGraphicsShareTimelineGrid">
                          <section className="eventGraphicsShareVisual">
                            <span className="eventGraphicsPanelLabel">이미지</span>
                            {hasPreview ? (
                              <div className="eventGraphicsSharePreview is-static">
                                <img src={cue.previewHref ?? ''} alt={`${cue.title} preview`} loading="lazy" />
                              </div>
                            ) : (
                              <div className="eventGraphicsPreviewPlaceholder">등록된 이미지가 없습니다.</div>
                            )}
                          </section>

                          <section className="eventGraphicsShareCore">
                            <ActionCard
                              title="Start"
                              graphic={cue.startGraphic}
                              graphicAction={cue.startGraphicAction}
                              audio={cue.startAudio}
                              audioAction={cue.startAudioAction}
                              href={cue.assetHref}
                            />
                            <ActionCard
                              title={cue.nextGraphic || cue.nextAudio ? 'Then / Hold' : 'Main'}
                              graphic={cue.nextGraphic || cue.startGraphic}
                              graphicAction={cue.nextGraphicAction || cue.startGraphicAction}
                              audio={cue.nextAudio}
                              audioAction={cue.nextAudioAction}
                              href={cue.assetHref}
                            />
                            <div className="eventGraphicsShareCoreCard">
                              <span className="eventGraphicsPanelLabel">현장 메모</span>
                              <p>{cue.note}</p>
                            </div>
                          </section>
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
