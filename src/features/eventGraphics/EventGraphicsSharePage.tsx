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

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ShareRow {
  return {
    id: row.id,
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

  const eventName = useMemo(
    () => shareRows.find((row) => row.eventName.trim())?.eventName.trim() || databaseTitle.trim() || 'Event Graphics Timetable',
    [databaseTitle, shareRows],
  )

  const missingPreviewCount = useMemo(() => shareRows.filter((row) => !looksLikeImageUrl(row.previewHref)).length, [shareRows])
  const missingFileCount = useMemo(
    () => shareRows.filter((row) => toPrimaryFileLabel(row) === MISSING_FILE_LABEL).length,
    [shareRows],
  )

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
            <h1>{eventName}</h1>
            <p>미디어업체용 진행표입니다. 시간 순서대로 이미지와 파일명만 빠르게 확인할 수 있게 구성했습니다.</p>
          </div>
          <div className="eventGraphicsShareSummary" aria-label="진행표 요약">
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
          </div>
        </header>

        <div className="eventGraphicsShareList">
          {shareRows.map((row) => {
            const hasPreview = looksLikeImageUrl(row.previewHref)
            const isEntranceCue = row.cueTitle === ENTRANCE_LABEL
            const primaryFileLabel = toPrimaryFileLabel(row)
            const noteSummary =
              joinSummary([
                row.vendorNote,
                row.personnel && `무대 ${row.personnel}`,
                row.sourceAudio && `오디오 ${row.sourceAudio}`,
              ]) || '특이사항 없음'

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
                    <h2>{isEntranceCue ? '입장' : row.cueTitle}</h2>
                  </div>

                  <div className="eventGraphicsShareTimelineGrid">
                    <section className="eventGraphicsShareVisual">
                      <span className="eventGraphicsPanelLabel">이미지</span>
                      {hasPreview ? (
                        <div className="eventGraphicsSharePreview is-static">
                          <img src={row.previewHref ?? ''} alt={`${row.cueTitle} preview`} loading="lazy" />
                        </div>
                      ) : (
                        <div className="eventGraphicsPreviewPlaceholder">등록된 이미지가 없습니다.</div>
                      )}
                    </section>

                    <section className="eventGraphicsShareCore">
                      <div className="eventGraphicsShareCoreCard">
                        <span className="eventGraphicsPanelLabel">파일명</span>
                        <strong>{primaryFileLabel}</strong>
                        <p>{joinSummary([row.graphicType !== '-' && row.graphicType, row.sourceVideo && `원본 ${row.sourceVideo}`]) || '-'}</p>
                        {row.assetHref ? (
                          <a className="eventGraphicsInlineLink" href={row.assetHref} target="_blank" rel="noreferrer">
                            파일 열기
                          </a>
                        ) : null}
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
    </main>
  )
}
