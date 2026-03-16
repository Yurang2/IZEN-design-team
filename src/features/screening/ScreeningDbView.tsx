import { useMemo, useState, type ChangeEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ScreeningDbViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  eyebrow: string
  emptyTitle: string
  emptyMessage: string
  description: string
  syncActionLabel?: string
  syncActionBusy?: boolean
  onSyncAction?: () => void | Promise<void>
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

function ScreeningSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <TableWrap>
      <table className="scheduleGridTable">
        <thead>
          <tr>
            {Array.from({ length: columnCount }).map((_, index) => (
              <th key={`screening-skeleton-head-${index}`}>
                <Skeleton width="90px" height="14px" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <tr key={`screening-skeleton-row-${rowIndex}`}>
              {Array.from({ length: columnCount }).map((__, columnIndex) => (
                <td key={`screening-skeleton-cell-${rowIndex}-${columnIndex}`}>
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

export function ScreeningDbView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
  eyebrow,
  emptyTitle,
  emptyMessage,
  description,
  syncActionLabel,
  syncActionBusy = false,
  onSyncAction,
}: ScreeningDbViewProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => rows.filter((row) => matchesQuery(row, normalizedQuery)), [normalizedQuery, rows])
  const effectiveTitle = databaseTitle.trim() || eyebrow

  const onQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }

  if (loading) {
    return (
      <section className="scheduleView">
        <div className="scheduleSummary" aria-label={`${eyebrow} 요약`}>
          <article>
            <span>컬럼</span>
            <strong>...</strong>
          </article>
          <article>
            <span>전체 행</span>
            <strong>...</strong>
          </article>
          <article>
            <span>검색 결과</span>
            <strong>...</strong>
          </article>
        </div>
        <ScreeningSkeleton columnCount={Math.max(columns.length, 4)} />
      </section>
    )
  }

  if (error) {
    return <EmptyState title={`${eyebrow}를 불러오지 못했습니다.`} message={error} className="scheduleEmptyState" />
  }

  if (!configured) {
    return <EmptyState title={emptyTitle} message={emptyMessage} className="scheduleEmptyState" />
  }

  if (columns.length === 0) {
    return (
      <EmptyState
        title="표시할 컬럼이 없습니다."
        message="Notion DB 속성을 확인해 주세요."
        className="scheduleEmptyState"
      />
    )
  }

  return (
    <section className="scheduleView">
      <div className="scheduleHero">
        <div className="scheduleHeroText">
          <p className="muted small">{eyebrow}</p>
          <h2>{effectiveTitle}</h2>
          <p>{description}</p>
        </div>
        <div className="scheduleHeroActions">
          {onSyncAction ? (
            <button type="button" className="secondary mini" onClick={() => void onSyncAction()} disabled={syncActionBusy}>
              {syncActionBusy ? '동기화 중...' : syncActionLabel ?? '동기화'}
            </button>
          ) : null}
          {databaseUrl ? (
            <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">
              노션 DB 열기
            </a>
          ) : null}
        </div>
      </div>

      <div className="scheduleSummary" aria-label={`${eyebrow} 요약`}>
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
          placeholder="행사명, 파일명, 상태로 검색"
          aria-label={`${eyebrow} 검색`}
        />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="표시할 데이터가 없습니다."
          message={normalizedQuery ? '검색 조건에 맞는 결과가 없습니다.' : '현재 DB에 데이터가 없습니다.'}
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
