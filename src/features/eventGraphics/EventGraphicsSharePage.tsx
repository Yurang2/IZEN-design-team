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
  cueOrder: string
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
  vendorNote: string
  personnel: string
  previewHref: string | null
  assetHref: string | null
}

type EventGroup = {
  eventName: string
  rows: ShareRow[]
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

function formatRuntimeLabel(runtime: string): string {
  return runtime ? `${runtime} min` : '-'
}

function joinSummary(parts: Array<string | false | null | undefined>): string {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function toDisplayCueOrder(row: ShareRow): string {
  const numeric = Number(row.cueOrder)
  if (row.cueTitle === ENTRANCE_LABEL && Number.isFinite(numeric)) {
    return `${Math.ceil(numeric)}-ENT`
  }
  return row.cueOrder || '-'
}

function toSortMinutes(value: string): number {
  const match = value.trim().match(/(\d{1,2})\s*:\s*(\d{2})/)
  if (!match) return Number.MAX_SAFE_INTEGER
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.MAX_SAFE_INTEGER
  return hours * 60 + minutes
}

function toNumericCueOrder(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

function toCueTypeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '기타'
  return trimmed.replace(/_/g, ' ')
}

function toPrimaryFileLabel(row: ShareRow): string {
  if (row.graphicAsset && row.graphicAsset !== '-') return row.graphicAsset
  if (row.sourceVideo) return row.sourceVideo
  if (row.sourceAudio) return row.sourceAudio
  return MISSING_FILE_LABEL
}

function toEntranceDetailFromRowTitle(rowTitle: string): string {
  return rowTitle
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^\d+(?:\.\d+)?\s+/, '')
    .replace(/^등장\s*-\s*/, '')
    .trim()
}

function toDisplayCueTitle(row: ShareRow): string {
  const title = row.cueTitle.trim()
  if (title && title !== ENTRANCE_LABEL) return title

  const fromRowTitle = toEntranceDetailFromRowTitle(row.rowTitle)
  if (fromRowTitle) return `입장 - ${fromRowTitle}`

  const entranceDetail = [row.graphicAsset !== '-' ? row.graphicAsset : '', row.sourceVideo, row.personnel, row.eventName]
    .map((value) => value.trim())
    .find(Boolean)

  return entranceDetail ? `입장 - ${entranceDetail}` : ENTRANCE_LABEL
}

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ShareRow {
  return {
    id: row.id,
    rowTitle: readCellText(row, columnIndex, '행 제목') || '-',
    cueOrder: readCellText(row, columnIndex, 'Cue 순서') || '-',
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
    vendorNote: readCellText(row, columnIndex, '업체 전달 메모'),
    personnel: readCellText(row, columnIndex, '무대 인원'),
    previewHref: readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null,
    assetHref: readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || null,
  }
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
  const shareRows = useMemo(
    () =>
      rows
        .map((row) => toRowModel(row, columnIndex))
        .sort((left, right) => {
          const timeDiff = toSortMinutes(left.startTime) - toSortMinutes(right.startTime)
          if (timeDiff !== 0) return timeDiff
          return toNumericCueOrder(left.cueOrder) - toNumericCueOrder(right.cueOrder)
        }),
    [columnIndex, rows],
  )

  const groupedRows = useMemo(() => {
    const groups = new Map<string, ShareRow[]>()
    for (const row of shareRows) {
      const groupName = row.eventName.trim() || '행사명 미지정'
      const current = groups.get(groupName)
      if (current) {
        current.push(row)
        continue
      }
      groups.set(groupName, [row])
    }
    return Array.from(groups.entries()).map<EventGroup>(([eventName, eventRows]) => ({
      eventName,
      rows: eventRows,
    }))
  }, [shareRows])

  const pageTitle = useMemo(() => {
    if (groupedRows.length === 1) return groupedRows[0]?.eventName || databaseTitle.trim() || 'Event Graphics Timetable'
    return databaseTitle.trim() || 'Event Graphics Timetable'
  }, [databaseTitle, groupedRows])

  const missingPreviewCount = useMemo(() => shareRows.filter((row) => !looksLikeImageUrl(row.previewHref)).length, [shareRows])
  const missingFileCount = useMemo(
    () => shareRows.filter((row) => toPrimaryFileLabel(row) === MISSING_FILE_LABEL).length,
    [shareRows],
  )
  const missingAudioCount = useMemo(() => shareRows.filter((row) => !row.sourceAudio.trim()).length, [shareRows])

  if (loading) {
    return (
      <main className="eventGraphicsShareShell">
        <section className="eventGraphicsSharePage">
          <header className="eventGraphicsShareHero">
            <p className="muted small">External Share</p>
            <h1>진행표를 불러오는 중...</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="진행표를 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
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

  if (shareRows.length === 0) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="표시할 큐가 없습니다." message="타임테이블에 아직 큐 행이 없습니다." className="scheduleEmptyState" />
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
            <p>미디어업체용 진행표입니다. 행사별로 구분해 시간 순서대로 이미지, 그래픽 파일, 오디오 파일을 확인할 수 있게 구성했습니다.</p>
          </div>
          <div className="eventGraphicsShareSummary" aria-label="진행표 요약">
            <article>
              <span>행사 수</span>
              <strong>{groupedRows.length}</strong>
            </article>
            <article>
              <span>전체 큐</span>
              <strong>{shareRows.length}</strong>
            </article>
            <article>
              <span>이미지 없음</span>
              <strong>{missingPreviewCount}</strong>
            </article>
            <article>
              <span>파일명 확인 필요</span>
              <strong>{missingFileCount}</strong>
            </article>
            <article>
              <span>오디오 없음</span>
              <strong>{missingAudioCount}</strong>
            </article>
          </div>
        </header>

        <div className="eventGraphicsShareList">
          {groupedRows.map((group) => (
            <section key={group.eventName} className="eventGraphicsShareGroup">
              <header className="eventGraphicsShareGroupHead">
                <h2>{group.eventName}</h2>
                <p>총 {group.rows.length}개 큐</p>
              </header>

              <div className="eventGraphicsShareGroupList">
                {group.rows.map((row) => {
                  const hasPreview = looksLikeImageUrl(row.previewHref)
                  const isEntranceCue = row.cueTitle === ENTRANCE_LABEL
                  const primaryFileLabel = toPrimaryFileLabel(row)
                  const displayCueTitle = toDisplayCueTitle(row)
                  const noteSummary = joinSummary([row.vendorNote, row.personnel && `무대 ${row.personnel}`]) || '특이사항 없음'

                  return (
                    <article key={row.id} className={`eventGraphicsShareRow${isEntranceCue ? ' is-entrance' : ''}`}>
                      <div className="eventGraphicsShareTime">
                        <strong>{row.startTime}</strong>
                        <span>{row.endTime}</span>
                        <small>{formatRuntimeLabel(row.runtime)}</small>
                      </div>

                      <div className="eventGraphicsShareBody">
                        <div className="eventGraphicsShareHead">
                          <div className="eventGraphicsCueHead">
                            <span className="eventGraphicsOrder">{toDisplayCueOrder(row)}</span>
                            <span className="eventGraphicsShareSection">{toCueTypeLabel(row.cueType)}</span>
                            {isEntranceCue ? <span className="eventGraphicsEntranceFlag">입장</span> : null}
                          </div>
                          <h3>{displayCueTitle}</h3>
                        </div>

                        <div className="eventGraphicsShareTimelineGrid">
                          <section className="eventGraphicsShareVisual">
                            <span className="eventGraphicsPanelLabel">이미지</span>
                            {hasPreview ? (
                              <div className="eventGraphicsSharePreview is-static">
                                <img src={row.previewHref ?? ''} alt={`${displayCueTitle} preview`} loading="lazy" />
                              </div>
                            ) : (
                              <div className="eventGraphicsPreviewPlaceholder">등록된 이미지가 없습니다.</div>
                            )}
                          </section>

                          <section className="eventGraphicsShareCore">
                            <div className="eventGraphicsShareCoreCard">
                              <span className="eventGraphicsPanelLabel">그래픽 파일</span>
                              <strong>{primaryFileLabel}</strong>
                              <p>{joinSummary([row.graphicType !== '-' && row.graphicType, row.sourceVideo && `원본 ${row.sourceVideo}`]) || '-'}</p>
                              {row.assetHref ? (
                                <a className="eventGraphicsInlineLink" href={row.assetHref} target="_blank" rel="noreferrer">
                                  파일 열기
                                </a>
                              ) : null}
                            </div>

                            <div className="eventGraphicsShareCoreCard">
                              <span className="eventGraphicsPanelLabel">오디오 파일</span>
                              <strong>{row.sourceAudio || '오디오 없음'}</strong>
                              <p>{row.sourceAudio ? '현장 송출 오디오 확인용' : '등록된 오디오 파일이 없습니다.'}</p>
                            </div>

                            <div className="eventGraphicsShareCoreCard">
                              <span className="eventGraphicsPanelLabel">현장 메모</span>
                              <p>{noteSummary}</p>
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
