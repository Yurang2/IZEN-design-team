import { useMemo, useState, type ChangeEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'

type EventGraphicsTimetableViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

type LayoutMode = 'compact' | 'cueSheet'

type TimetableRow = {
  id: string
  url: string | null
  cueOrder: string
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

function toStatusClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function toCueTypeClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function formatRuntimeLabel(runtime: string): string {
  return runtime ? `${runtime}분` : '-'
}

function joinSummary(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(' / ')
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

function toRowModel(row: ScheduleRow, columnIndex: Record<string, number>): TimetableRow {
  return {
    id: row.id,
    url: row.url,
    cueOrder: readCellText(row, columnIndex, 'Cue 순서') || '-',
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
    previewHref: readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null,
    assetHref: readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || null,
  }
}

function CompactLayout({
  rows,
  onOpenPreview,
}: {
  rows: TimetableRow[]
  onOpenPreview: (row: TimetableRow) => void
}) {
  return (
    <div className="eventGraphicsCompactTableWrap">
      <table className="eventGraphicsCompactTable">
        <thead>
          <tr>
            <th>시간</th>
            <th>프로그램</th>
            <th>그래픽 / 오디오</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const statusClassName = toStatusClassName(row.status)
            const cueTypeClassName = toCueTypeClassName(row.cueType)
            const hasPreview = looksLikeImageUrl(row.previewHref)
            return (
              <tr key={row.id} className={`eventGraphicsCompactRow status-${statusClassName}`}>
                <td className="eventGraphicsCompactTimeCell">
                  <div className="eventGraphicsCompactCellInner">
                    <strong>
                      {row.startTime} - {row.endTime}
                    </strong>
                    <span>{formatRuntimeLabel(row.runtime)}</span>
                  </div>
                </td>
                <td className="eventGraphicsCompactCueCell">
                  <div className="eventGraphicsCompactCellInner">
                    <div className="eventGraphicsCueHead">
                      <span className="eventGraphicsOrder">#{row.cueOrder}</span>
                      <span className={`eventGraphicsCueType cue-${cueTypeClassName}`}>{row.cueType}</span>
                      {row.cueTitle === '등장' ? <span className="eventGraphicsEntranceFlag">등장</span> : null}
                    </div>
                    <strong>{row.cueTitle}</strong>
                    <p>{joinSummary([row.personnel && `무대 ${row.personnel}`, row.vendorNote || row.remark]) || '메모 없음'}</p>
                  </div>
                </td>
                <td className="eventGraphicsCompactMediaCell">
                  <div className="eventGraphicsCompactCellInner">
                    <strong>{row.graphicAsset}</strong>
                    <p>{joinSummary([row.graphicType, row.sourceAudio || row.sourceVideo]) || '-'}</p>
                    <div className="eventGraphicsLinkRow">
                      {hasPreview ? (
                        <button type="button" className="secondary mini" onClick={() => onOpenPreview(row)}>
                          이미지
                        </button>
                      ) : null}
                      {row.assetHref ? (
                        <a className="linkButton secondary mini" href={row.assetHref} target="_blank" rel="noreferrer">
                          자산
                        </a>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="eventGraphicsCompactStatusCell">
                  <div className="eventGraphicsCompactCellInner">
                    <span className={`eventGraphicsStatus status-${statusClassName}`}>{row.status}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CueSheetLayout({
  rows,
  onOpenPreview,
  activePreviewId,
  onClosePreview,
}: {
  rows: TimetableRow[]
  onOpenPreview: (row: TimetableRow) => void
  activePreviewId: string | null
  onClosePreview: () => void
}) {
  return (
    <div className="eventGraphicsCueSheet">
      {rows.map((row) => {
        const statusClassName = toStatusClassName(row.status)
        const cueTypeClassName = toCueTypeClassName(row.cueType)
        const isEntranceCue = row.cueTitle === '등장'
        const hasPreview = looksLikeImageUrl(row.previewHref)
        const previewOpen = activePreviewId === row.id && hasPreview

        return (
          <article key={row.id} className={`eventGraphicsCueSheetRow status-${statusClassName}${isEntranceCue ? ' is-entrance' : ''}`}>
            <div className="eventGraphicsCueSheetTime">
              <strong>{row.startTime}</strong>
              <span>{row.endTime}</span>
              <small>{formatRuntimeLabel(row.runtime)}</small>
            </div>

            <div className="eventGraphicsCueSheetBody">
              <div className="eventGraphicsCueSheetHead">
                <div>
                  <div className="eventGraphicsCueHead">
                    <span className="eventGraphicsOrder">#{row.cueOrder}</span>
                    <span className={`eventGraphicsCueType cue-${cueTypeClassName}`}>{row.cueType}</span>
                    {isEntranceCue ? <span className="eventGraphicsEntranceFlag">등장 화면</span> : null}
                  </div>
                  <h3>{row.cueTitle}</h3>
                </div>
                <span className={`eventGraphicsStatus status-${statusClassName}`}>{row.status}</span>
              </div>

              <div className="eventGraphicsCueSheetGrid">
                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Graphics</span>
                  <strong>{row.graphicAsset}</strong>
                  <p>{row.graphicType || '-'}</p>
                  {row.sourceVideo ? <p className="eventGraphicsSubline">파일명: {row.sourceVideo}</p> : null}
                  <div className="eventGraphicsLinkRow">
                    {hasPreview ? (
                      <button
                        type="button"
                        className={previewOpen ? 'secondary mini is-active' : 'secondary mini'}
                        onClick={() => {
                          if (previewOpen) {
                            onClosePreview()
                            return
                          }
                          onOpenPreview(row)
                        }}
                      >
                        {previewOpen ? '이미지 닫기' : '이미지 보기'}
                      </button>
                    ) : null}
                    {row.assetHref ? (
                      <a className="linkButton secondary mini" href={row.assetHref} target="_blank" rel="noreferrer">
                        자산 링크
                      </a>
                    ) : null}
                  </div>
                  {previewOpen ? (
                    <div className="eventGraphicsPreviewInline">
                      <img src={row.previewHref ?? ''} alt={`${row.cueTitle} 미리보기`} loading="lazy" />
                    </div>
                  ) : hasPreview ? (
                    <div className="eventGraphicsPreviewPlaceholder">이미지 보기를 누르면 여기에서 크게 확인할 수 있습니다.</div>
                  ) : (
                    <div className="eventGraphicsPreviewPlaceholder">등록된 미리보기 이미지가 없습니다.</div>
                  )}
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Audio</span>
                  <strong>{row.sourceAudio || '-'}</strong>
                  {row.personnel ? <p>무대: {row.personnel}</p> : null}
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Note</span>
                  <p>{row.vendorNote || '업체 전달 메모 없음'}</p>
                  {row.remark ? <p>비고: {row.remark}</p> : null}
                  {row.url ? (
                    <a className="eventGraphicsInlineLink" href={row.url} target="_blank" rel="noreferrer">
                      Notion 상세 보기
                    </a>
                  ) : null}
                </section>
              </div>
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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('compact')
  const [previewTarget, setPreviewTarget] = useState<TimetableRow | null>(null)

  const normalizedQuery = query.trim().toLowerCase()
  const columnIndex = useMemo(() => buildColumnIndex(columns), [columns])
  const tableRows = useMemo(() => rows.map((row) => toRowModel(row, columnIndex)), [columnIndex, rows])

  const statusOptions = useMemo(
    () => Array.from(new Set(tableRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [tableRows],
  )

  const filteredRows = useMemo(
    () =>
      tableRows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        return matchesQuery(row, normalizedQuery)
      }),
    [normalizedQuery, statusFilter, tableRows],
  )

  const readyCount = useMemo(() => tableRows.filter((row) => ['ready', 'shared'].includes(row.status)).length, [tableRows])
  const changedCount = useMemo(() => tableRows.filter((row) => row.status === 'changed_on_site').length, [tableRows])
  const entranceCount = useMemo(() => tableRows.filter((row) => row.cueTitle === '등장').length, [tableRows])
  const effectiveTitle = databaseTitle.trim() || '행사 그래픽 타임테이블'

  const onQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }

  const onStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value)
  }

  const openPreview = (row: TimetableRow) => {
    if (!looksLikeImageUrl(row.previewHref)) return
    setPreviewTarget(row)
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

  return (
    <section className="eventGraphicsView">
      <div className="eventGraphicsHero">
        <div className="eventGraphicsHeroText">
          <p className="muted small">Event Graphics Timetable</p>
          <h2>{effectiveTitle}</h2>
          <p>같은 데이터로 A안 압축형과 B안 큐시트형을 모두 비교할 수 있게 구성했습니다.</p>
        </div>
        {databaseUrl ? (
          <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">
            Notion DB 열기
          </a>
        ) : null}
      </div>

      <div className="eventGraphicsSummary" aria-label="행사 그래픽 요약">
        <article>
          <span>전체 Cue</span>
          <strong>{tableRows.length}</strong>
        </article>
        <article>
          <span>등장 Cue</span>
          <strong>{entranceCount}</strong>
        </article>
        <article>
          <span>준비·공유 완료</span>
          <strong>{readyCount}</strong>
        </article>
        <article>
          <span>현장 변경</span>
          <strong>{changedCount}</strong>
        </article>
      </div>

      <div className="eventGraphicsToolbar">
        <input
          type="search"
          value={query}
          onChange={onQueryChange}
          placeholder="Cue 제목, 그래픽, 오디오, 비고 검색"
          aria-label="타임테이블 검색"
        />
        <select value={statusFilter} onChange={onStatusChange} aria-label="상태 필터">
          <option value="">모든 상태</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="eventGraphicsLayoutSwitch" role="group" aria-label="타임테이블 보기 형태">
        <button
          type="button"
          className={layoutMode === 'compact' ? 'viewTab active' : 'viewTab'}
          aria-pressed={layoutMode === 'compact'}
          onClick={() => setLayoutMode('compact')}
        >
          A안 압축형
        </button>
        <button
          type="button"
          className={layoutMode === 'cueSheet' ? 'viewTab active' : 'viewTab'}
          aria-pressed={layoutMode === 'cueSheet'}
          onClick={() => setLayoutMode('cueSheet')}
        >
          B안 큐시트형
        </button>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="표시할 cue가 없습니다."
          message={normalizedQuery || statusFilter ? '현재 필터 조건과 일치하는 cue가 없습니다.' : 'DB에 아직 cue row가 없습니다.'}
          className="scheduleEmptyState"
        />
      ) : layoutMode === 'compact' ? (
        <CompactLayout rows={filteredRows} onOpenPreview={openPreview} />
      ) : (
        <CueSheetLayout
          rows={filteredRows}
          onOpenPreview={openPreview}
          activePreviewId={previewTarget?.id ?? null}
          onClosePreview={() => setPreviewTarget(null)}
        />
      )}

      {layoutMode === 'compact' && previewTarget && looksLikeImageUrl(previewTarget.previewHref) ? (
        <div className="eventGraphicsPreviewModal" role="dialog" aria-modal="true" aria-label="그래픽 미리보기">
          <button type="button" className="eventGraphicsPreviewBackdrop" aria-label="미리보기 닫기" onClick={() => setPreviewTarget(null)} />
          <div className="eventGraphicsPreviewDialog">
            <div className="eventGraphicsPreviewDialogHead">
              <div>
                <strong>{previewTarget.cueTitle}</strong>
                <p>{previewTarget.graphicAsset}</p>
              </div>
              <button type="button" className="secondary mini" onClick={() => setPreviewTarget(null)}>
                닫기
              </button>
            </div>
            <div className="eventGraphicsPreviewDialogBody">
              <img src={previewTarget.previewHref ?? ''} alt={`${previewTarget.cueTitle} 미리보기`} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
