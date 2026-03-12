import { useMemo, useState } from 'react'
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

function toCueTypeClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function formatRuntimeLabel(runtime: string): string {
  return runtime ? `${runtime}분` : '-'
}

function joinSummary(parts: Array<string | false | null | undefined>): string {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function toDisplayCueOrder(row: ShareRow): string {
  const numeric = Number(row.cueOrder)
  if (row.cueTitle === '등장' && Number.isFinite(numeric)) {
    return `${Math.ceil(numeric)}-등장`
  }
  return row.cueOrder || '-'
}

function toNumericCueOrder(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
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
  const [openPreviewId, setOpenPreviewId] = useState<string | null>(null)

  const columnIndex = useMemo(() => buildColumnIndex(columns), [columns])
  const shareRows = useMemo(
    () =>
      rows
        .map((row) => toRowModel(row, columnIndex))
        .sort((left, right) => toNumericCueOrder(left.cueOrder) - toNumericCueOrder(right.cueOrder)),
    [columnIndex, rows],
  )

  const eventName = useMemo(
    () => shareRows.find((row) => row.eventName.trim())?.eventName.trim() || databaseTitle.trim() || '행사 그래픽 타임테이블',
    [databaseTitle, shareRows],
  )

  const entranceCount = useMemo(() => shareRows.filter((row) => row.cueTitle === '등장').length, [shareRows])

  if (loading) {
    return (
      <main className="eventGraphicsShareShell">
        <section className="eventGraphicsSharePage">
          <header className="eventGraphicsShareHero">
            <p className="muted small">External Share</p>
            <h1>타임테이블 불러오는 중...</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="타임테이블을 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState
          title="타임테이블 DB가 연결되지 않았습니다."
          message="공유용 타임테이블 데이터를 아직 읽어오지 못했습니다."
          className="scheduleEmptyState"
        />
      </main>
    )
  }

  if (shareRows.length === 0) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title="표시할 cue가 없습니다." message="DB에 아직 cue row가 없습니다." className="scheduleEmptyState" />
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
            <p>외부 공유용 행사 그래픽 타임테이블</p>
          </div>
          <div className="eventGraphicsShareSummary" aria-label="타임테이블 요약">
            <article>
              <span>전체 Cue</span>
              <strong>{shareRows.length}</strong>
            </article>
            <article>
              <span>등장 Cue</span>
              <strong>{entranceCount}</strong>
            </article>
          </div>
        </header>

        <div className="eventGraphicsShareList">
          {shareRows.map((row) => {
            const hasPreview = looksLikeImageUrl(row.previewHref)
            const previewOpen = openPreviewId === row.id && hasPreview
            const cueTypeClassName = toCueTypeClassName(row.cueType)

            return (
              <article key={row.id} className={`eventGraphicsShareRow${row.cueTitle === '등장' ? ' is-entrance' : ''}`}>
                <div className="eventGraphicsShareTime">
                  <strong>{row.startTime}</strong>
                  <span>{row.endTime}</span>
                  <small>{formatRuntimeLabel(row.runtime)}</small>
                </div>

                <div className="eventGraphicsShareBody">
                  <div className="eventGraphicsShareHead">
                    <div>
                      <div className="eventGraphicsCueHead">
                        <span className="eventGraphicsOrder">{toDisplayCueOrder(row)}</span>
                        <span className={`eventGraphicsCueType cue-${cueTypeClassName}`}>{row.cueType}</span>
                        {row.cueTitle === '등장' ? <span className="eventGraphicsEntranceFlag">등장</span> : null}
                      </div>
                      <h2>{row.cueTitle}</h2>
                    </div>
                  </div>

                  <div className="eventGraphicsShareGrid">
                    <section className="eventGraphicsSharePanel">
                      <span className="eventGraphicsPanelLabel">Graphics</span>
                      <strong>{row.graphicAsset}</strong>
                      <p>{joinSummary([row.graphicType, row.sourceVideo && `파일명 ${row.sourceVideo}`]) || '-'}</p>
                      {row.assetHref ? (
                        <a className="eventGraphicsInlineLink" href={row.assetHref} target="_blank" rel="noreferrer">
                          파일 링크 열기
                        </a>
                      ) : null}
                    </section>

                    <section className="eventGraphicsSharePanel">
                      <span className="eventGraphicsPanelLabel">Audio</span>
                      <strong>{row.sourceAudio || '-'}</strong>
                      <p>{row.personnel ? `무대 ${row.personnel}` : '무대 정보 없음'}</p>
                    </section>

                    <section className="eventGraphicsSharePanel">
                      <span className="eventGraphicsPanelLabel">Image</span>
                      {hasPreview ? (
                        <>
                          <button
                            type="button"
                            className={previewOpen ? 'secondary mini is-active' : 'secondary mini'}
                            onClick={() => setOpenPreviewId((current) => (current === row.id ? null : row.id))}
                          >
                            {previewOpen ? '이미지 닫기' : '이미지 보기'}
                          </button>
                          {previewOpen ? (
                            <div className="eventGraphicsSharePreview">
                              <img src={row.previewHref ?? ''} alt={`${row.cueTitle} 미리보기`} loading="lazy" />
                            </div>
                          ) : (
                            <div className="eventGraphicsPreviewPlaceholder">필요할 때만 이미지를 열어 확인할 수 있습니다.</div>
                          )}
                        </>
                      ) : (
                        <div className="eventGraphicsPreviewPlaceholder">등록된 미리보기 이미지가 없습니다.</div>
                      )}
                    </section>

                    {row.vendorNote ? (
                      <section className="eventGraphicsSharePanel eventGraphicsSharePanel-note">
                        <span className="eventGraphicsPanelLabel">Note</span>
                        <p>{row.vendorNote}</p>
                      </section>
                    ) : null}
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
