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

function formatRuntimeLabel(runtime: string): string {
  return runtime ? `${runtime}분` : '-'
}

function toStatusClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
}

function toCueTypeClassName(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
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
          <p>시간 순서대로 cue, 등장 그래픽, 오디오, 현장 전달 메모를 함께 보는 운영용 일정표입니다.</p>
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

      {filteredRows.length === 0 ? (
        <EmptyState
          title="표시할 cue가 없습니다."
          message={normalizedQuery || statusFilter ? '현재 필터 조건과 일치하는 cue가 없습니다.' : 'DB에 아직 cue row가 없습니다.'}
          className="scheduleEmptyState"
        />
      ) : (
        <div className="eventGraphicsAgendaShell">
          <div className="eventGraphicsTableHint">
            <span>처음 보는 사람도 시간 흐름만 따라가면 이해할 수 있게 정리한 일정표 형식입니다.</span>
            <span>각 줄은 실제 현장에서 넘겨야 하는 하나의 화면 전환 단위입니다.</span>
          </div>

          <div className="eventGraphicsAgenda">
            {filteredRows.map((row) => {
              const statusClassName = toStatusClassName(row.status)
              const cueTypeClassName = toCueTypeClassName(row.cueType)
              const isEntranceCue = row.cueTitle === '등장'

              return (
                <article
                  key={row.id}
                  className={`eventGraphicsAgendaRow status-${statusClassName}${isEntranceCue ? ' is-entrance' : ''}`}
                >
                  <div className="eventGraphicsAgendaTime">
                    <strong>{row.startTime}</strong>
                    <span>{row.endTime}</span>
                    <small>{formatRuntimeLabel(row.runtime)}</small>
                  </div>

                  <div className="eventGraphicsAgendaBody">
                    <div className="eventGraphicsAgendaHead">
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

                    <div className="eventGraphicsAgendaGrid">
                      <section className="eventGraphicsAgendaPanel">
                        <span className="eventGraphicsPanelLabel">그래픽</span>
                        <strong>{row.graphicAsset}</strong>
                        <p>{row.graphicType}</p>
                        {row.sourceVideo ? <p className="eventGraphicsSubline">원본: {row.sourceVideo}</p> : null}
                        {looksLikeImageUrl(row.previewHref) ? (
                          <div className="eventGraphicsPreviewThumb">
                            <img src={row.previewHref ?? ''} alt={`${row.cueTitle} 미리보기`} loading="lazy" />
                          </div>
                        ) : null}
                        <div className="eventGraphicsLinkRow">
                          {row.previewHref ? (
                            <a className="linkButton secondary mini" href={row.previewHref} target="_blank" rel="noreferrer">
                              미리보기
                            </a>
                          ) : null}
                          {row.assetHref ? (
                            <a className="linkButton secondary mini" href={row.assetHref} target="_blank" rel="noreferrer">
                              자산 링크
                            </a>
                          ) : null}
                        </div>
                      </section>

                      <section className="eventGraphicsAgendaPanel">
                        <span className="eventGraphicsPanelLabel">오디오</span>
                        <strong>{row.sourceAudio || '-'}</strong>
                        {row.personnel ? <p>무대: {row.personnel}</p> : null}
                      </section>

                      <section className="eventGraphicsAgendaPanel">
                        <span className="eventGraphicsPanelLabel">현장 메모</span>
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
        </div>
      )}
    </section>
  )
}
