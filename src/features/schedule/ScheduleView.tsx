import { useMemo, useState, type ChangeEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ScheduleViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

function matchesQuery(row: ScheduleRow, query: string): boolean {
  if (!query) return true
  const source = row.cells.map((cell) => cell.text).join(' ').toLowerCase()
  return source.includes(query)
}

function toCellLabel(cell: ScheduleRow['cells'][number] | undefined): string {
  const value = (cell?.text ?? '').trim()
  return value || '-'
}

function ScheduleSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <TableWrap>
      <table className="scheduleGridTable">
        <thead>
          <tr>
            {Array.from({ length: columnCount }).map((_, index) => (
              <th key={`schedule-skeleton-head-${index}`}>
                <Skeleton width="90px" height="14px" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <tr key={`schedule-skeleton-row-${rowIndex}`}>
              {Array.from({ length: columnCount }).map((__, columnIndex) => (
                <td key={`schedule-skeleton-cell-${rowIndex}-${columnIndex}`}>
                  <Skeleton width="100%" height="14px" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export function ScheduleView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
}: ScheduleViewProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => rows.filter((row) => matchesQuery(row, normalizedQuery)), [normalizedQuery, rows])
  const effectiveTitle = databaseTitle.trim() || 'Schedule DB'

  const onQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }

  if (loading) {
    return (
      <section className="scheduleView">
        <div className="scheduleSummary" aria-label="일정 요약">
          <article>
            <span>컬럼</span>
            <strong>...</strong>
          </article>
          <article>
            <span>행</span>
            <strong>...</strong>
          </article>
          <article>
            <span>검색 결과</span>
            <strong>...</strong>
          </article>
        </div>
        <ScheduleSkeleton columnCount={Math.max(columns.length, 4)} />
      </section>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="일정 DB를 불러오지 못했습니다."
        message={error}
        className="scheduleEmptyState"
      />
    )
  }

  if (!configured) {
    return (
      <EmptyState
        title="일정 DB가 연결되지 않았습니다."
        message="Cloudflare Workers 환경변수에 NOTION_SCHEDULE_DB_ID를 추가하면 일정 탭이 활성화됩니다."
        className="scheduleEmptyState"
      />
    )
  }

  if (columns.length === 0) {
    return (
      <EmptyState
        title="읽을 수 있는 일정 컬럼이 없습니다."
        message="노션 Schedule DB 속성을 확인해 주세요."
        className="scheduleEmptyState"
      />
    )
  }

  return (
    <section className="scheduleView">
      <div className="scheduleHero">
        <div className="scheduleHeroText">
          <p className="muted small">Notion Schedule DB</p>
          <h2>{effectiveTitle}</h2>
          <p>노션의 Schedule DB 컬럼과 행 값을 현재 스키마 그대로 읽어옵니다.</p>
        </div>
        {databaseUrl ? (
          <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">
            노션 DB 열기
          </a>
        ) : null}
      </div>

      <div className="scheduleSummary" aria-label="일정 요약">
        <article>
          <span>컬럼</span>
          <strong>{columns.length}</strong>
        </article>
        <article>
          <span>전체 행</span>
          <strong>{rows.length}</strong>
        </article>
        <article>
          <span>검색 결과</span>
          <strong>{filteredRows.length}</strong>
        </article>
      </div>

      <div className="scheduleToolbar">
        <input
          type="search"
          value={query}
          onChange={onQueryChange}
          placeholder="일정명, 상태, 메모 등으로 검색"
          aria-label="일정 검색"
        />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="표시할 일정이 없습니다."
          message={normalizedQuery ? '검색 조건에 맞는 일정이 없습니다.' : 'Schedule DB에 행이 없습니다.'}
          className="scheduleEmptyState"
        />
      ) : (
        <TableWrap>
          <table className="scheduleGridTable">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={column.id} className={index === 0 ? 'schedulePrimaryColumn' : undefined}>
                    <div className="scheduleColumnHeader">
                      <strong>{column.name}</strong>
                      <span>{column.type}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column, index) => {
                    const cell = row.cells[index]
                    const label = toCellLabel(cell)
                    const cellClassName = index === 0 ? 'schedulePrimaryColumn scheduleCell' : 'scheduleCell'

                    if (index === 0 && row.url) {
                      return (
                        <td key={`${row.id}-${column.id}`} className={cellClassName}>
                          <a className="schedulePrimaryLink" href={row.url} target="_blank" rel="noreferrer">
                            {label}
                          </a>
                        </td>
                      )
                    }

                    if (cell?.href) {
                      return (
                        <td key={`${row.id}-${column.id}`} className={cellClassName}>
                          <a href={cell.href} target="_blank" rel="noreferrer">
                            {label}
                          </a>
                        </td>
                      )
                    }

                    return (
                      <td key={`${row.id}-${column.id}`} className={cellClassName}>
                        {label}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </section>
  )
}
