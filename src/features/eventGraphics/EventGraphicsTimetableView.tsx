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

function matchesQuery(row: ScheduleRow, query: string): boolean {
  if (!query) return true
  return row.cells.some((cell) => cell.text.toLowerCase().includes(query))
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
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((row) => readCellText(row, columnIndex, '상태')).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [columnIndex, rows],
  )

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter && readCellText(row, columnIndex, '상태') !== statusFilter) return false
        return matchesQuery(row, normalizedQuery)
      }),
    [columnIndex, normalizedQuery, rows, statusFilter],
  )

  const readyCount = useMemo(
    () => rows.filter((row) => ['ready', 'shared'].includes(readCellText(row, columnIndex, '상태'))).length,
    [columnIndex, rows],
  )

  const changedCount = useMemo(
    () => rows.filter((row) => readCellText(row, columnIndex, '상태') === 'changed_on_site').length,
    [columnIndex, rows],
  )

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
          <p>행사 cue별 그래픽 상태, 미리보기, 전달 링크를 한 화면에서 공유하는 운영판입니다.</p>
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
          <strong>{rows.length}</strong>
        </article>
        <article>
          <span>준비/공유 완료</span>
          <strong>{readyCount}</strong>
        </article>
        <article>
          <span>현장 변경</span>
          <strong>{changedCount}</strong>
        </article>
        <article>
          <span>현재 표시</span>
          <strong>{filteredRows.length}</strong>
        </article>
      </div>

      <div className="eventGraphicsToolbar">
        <input
          type="search"
          value={query}
          onChange={onQueryChange}
          placeholder="Cue 제목, 자산명, 비고 검색"
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
        <div className="eventGraphicsGrid">
          {filteredRows.map((row) => {
            const cueOrder = readCellText(row, columnIndex, 'Cue 순서') || '-'
            const cueTitle = readCellText(row, columnIndex, 'Cue 제목') || readCellText(row, columnIndex, '행 제목') || '-'
            const startTime = readCellText(row, columnIndex, '시작 시각') || '-'
            const endTime = readCellText(row, columnIndex, '종료 시각') || '-'
            const status = readCellText(row, columnIndex, '상태') || 'planned'
            const graphicAsset = readCellText(row, columnIndex, '그래픽 자산명') || '-'
            const graphicType = readCellText(row, columnIndex, '그래픽 형식') || '-'
            const runtime = readCellText(row, columnIndex, '러닝타임(분)')
            const personnel = readCellText(row, columnIndex, '무대 인원')
            const sourceVideo = readCellText(row, columnIndex, '원본 Video')
            const sourceAudio = readCellText(row, columnIndex, '원본 Audio')
            const remark = readCellText(row, columnIndex, '원본 비고')
            const vendorNote = readCellText(row, columnIndex, '업체 전달 메모')
            const previewHref = readCellHref(row, columnIndex, '미리보기 링크') || readCellText(row, columnIndex, '미리보기 링크') || null
            const assetHref = readCellHref(row, columnIndex, '자산 링크') || readCellText(row, columnIndex, '자산 링크') || null

            return (
              <article key={row.id} className={`eventGraphicsCard status-${status}`}>
                <header className="eventGraphicsCardHeader">
                  <div>
                    <span className="eventGraphicsOrder">#{cueOrder}</span>
                    <h3>{cueTitle}</h3>
                    <p className="muted small">
                      {startTime} - {endTime}
                      {runtime ? ` · ${runtime}분` : ''}
                    </p>
                  </div>
                  <span className="eventGraphicsStatus">{status}</span>
                </header>

                {looksLikeImageUrl(previewHref) ? (
                  <div className="eventGraphicsPreview">
                    <img src={previewHref ?? ''} alt={`${cueTitle} 미리보기`} loading="lazy" />
                  </div>
                ) : null}

                <div className="eventGraphicsMeta">
                  <span>{graphicType}</span>
                  {personnel ? <span>{personnel}</span> : null}
                </div>

                <dl className="eventGraphicsDetails">
                  <div>
                    <dt>그래픽</dt>
                    <dd>{graphicAsset}</dd>
                  </div>
                  {sourceVideo ? (
                    <div>
                      <dt>원본 Video</dt>
                      <dd>{sourceVideo}</dd>
                    </div>
                  ) : null}
                  {sourceAudio ? (
                    <div>
                      <dt>원본 Audio</dt>
                      <dd>{sourceAudio}</dd>
                    </div>
                  ) : null}
                  {remark ? (
                    <div>
                      <dt>원본 비고</dt>
                      <dd>{remark}</dd>
                    </div>
                  ) : null}
                  {vendorNote ? (
                    <div>
                      <dt>업체 메모</dt>
                      <dd>{vendorNote}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="eventGraphicsActions">
                  {previewHref ? (
                    <a className="linkButton secondary mini" href={previewHref} target="_blank" rel="noreferrer">
                      미리보기
                    </a>
                  ) : null}
                  {assetHref ? (
                    <a className="linkButton secondary mini" href={assetHref} target="_blank" rel="noreferrer">
                      자산 링크
                    </a>
                  ) : null}
                  {row.url ? (
                    <a className="linkButton secondary mini" href={row.url} target="_blank" rel="noreferrer">
                      Notion 행
                    </a>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
