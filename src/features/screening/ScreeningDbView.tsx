import { useMemo, useState, type ChangeEvent } from 'react'
import type { ScheduleCell, ScheduleColumn, ScheduleRow } from '../../shared/types'
import { emojiToTwemojiUrl, formatProjectIconLabel } from '../../shared/emoji'
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
  presentation?: 'table' | 'gallery'
  groupByColumnName?: string
  thumbnailColumnName?: string
  detailColumnNames?: Array<string | { label: string; names: string[] }>
  relationColumnLabelMaps?: Record<string, Record<string, string>>
  groupVisualMap?: Record<string, { iconEmoji?: string; iconUrl?: string; coverUrl?: string }>
  syncActionLabel?: string
  syncActionBusy?: boolean
  onSyncAction?: () => void | Promise<void>
}

type GalleryGroup = {
  key: string
  label: string
  visual?: { iconEmoji?: string; iconUrl?: string; coverUrl?: string }
  items: Array<{
    row: ScheduleRow
    title: string
    thumbnailUrl: string | null
    details: Array<{ label: string; value: string }>
  }>
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/-/g, '').toLowerCase()
}

function matchesQuery(row: ScheduleRow, query: string): boolean {
  if (!query) return true
  const source = row.cells.map((cell) => cell.text).join(' ').toLowerCase()
  return source.includes(query)
}

function resolveCellText(
  cell: ScheduleCell | undefined,
  columnName: string | undefined,
  relationColumnLabelMaps: Record<string, Record<string, string>>,
): string {
  const raw = (cell?.text ?? '').trim()
  if (!raw) return '-'
  if (!columnName) return raw

  const relationMap = relationColumnLabelMaps[columnName]
  if (!relationMap) return raw

  const labels = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => relationMap[normalizeKey(value)] ?? relationMap[value] ?? value)

  return labels.join(', ') || '-'
}

function getColumnIndex(columns: ScheduleColumn[], targetName: string | undefined): number {
  if (!targetName) return -1
  return columns.findIndex((column) => column.name === targetName)
}

function getDetailColumnLabel(entry: string | { label: string; names: string[] }): string {
  return typeof entry === 'string' ? entry : entry.label
}

function getDetailColumnIndex(columns: ScheduleColumn[], entry: string | { label: string; names: string[] }): number {
  if (typeof entry === 'string') return getColumnIndex(columns, entry)
  for (const name of entry.names) {
    const index = getColumnIndex(columns, name)
    if (index >= 0) return index
  }
  return -1
}

function getTitleColumnIndex(columns: ScheduleColumn[]): number {
  const index = columns.findIndex((column) => column.type === 'title')
  return index >= 0 ? index : 0
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

function GallerySkeleton() {
  return (
    <div className="screeningGalleryGrid">
      {Array.from({ length: 6 }).map((_, index) => (
        <article key={`screening-gallery-skeleton-${index}`} className="screeningGalleryCard">
          <div className="screeningGalleryThumb">
            <Skeleton width="100%" height="180px" />
          </div>
          <div className="screeningGalleryBody">
            <Skeleton width="70%" height="18px" />
            <Skeleton width="100%" height="14px" />
            <Skeleton width="80%" height="14px" />
          </div>
        </article>
      ))}
    </div>
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
  presentation = 'table',
  groupByColumnName,
  thumbnailColumnName,
  detailColumnNames = [],
  relationColumnLabelMaps = {},
  groupVisualMap = {},
  syncActionLabel,
  syncActionBusy = false,
  onSyncAction,
}: ScreeningDbViewProps) {
  const [query, setQuery] = useState('')
  const [groupedGallery, setGroupedGallery] = useState(true)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => rows.filter((row) => matchesQuery(row, normalizedQuery)), [normalizedQuery, rows])
  const effectiveTitle = databaseTitle.trim() || eyebrow

  const groupIndex = getColumnIndex(columns, groupByColumnName)
  const thumbnailIndex = getColumnIndex(columns, thumbnailColumnName)
  const titleIndex = getTitleColumnIndex(columns)

  const galleryGroups = useMemo<GalleryGroup[]>(() => {
    if (presentation !== 'gallery') return []

    const detailIndexes = detailColumnNames
      .map((entry) => ({ label: getDetailColumnLabel(entry), index: getDetailColumnIndex(columns, entry) }))
      .filter((entry) => entry.index >= 0)

    const groups = new Map<string, GalleryGroup>()
    for (const row of filteredRows) {
      const groupCell = groupIndex >= 0 ? row.cells[groupIndex] : undefined
      const rawGroupLabel = resolveCellText(groupCell, groupByColumnName, relationColumnLabelMaps)
      const groupLabel = rawGroupLabel === '-' ? '미분류 프로젝트' : rawGroupLabel
      const groupKey = groupedGallery ? groupLabel : '전체'

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          label: groupedGallery ? groupLabel : '전체',
          visual: groupedGallery ? groupVisualMap[groupLabel] ?? groupVisualMap[groupLabel.toLowerCase()] : undefined,
          items: [],
        })
      }

      const title = resolveCellText(row.cells[titleIndex], columns[titleIndex]?.name, relationColumnLabelMaps)
      const thumbCell = thumbnailIndex >= 0 ? row.cells[thumbnailIndex] : undefined
      const details = detailIndexes
        .map(({ label, index }) => ({
          label,
          value: resolveCellText(row.cells[index], columns[index]?.name, relationColumnLabelMaps),
        }))
        .filter((entry) => entry.value !== '-')

      groups.get(groupKey)?.items.push({
        row,
        title,
        thumbnailUrl: thumbCell?.href ?? null,
        details,
      })
    }

    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [columns, detailColumnNames, filteredRows, groupByColumnName, groupIndex, groupVisualMap, groupedGallery, presentation, relationColumnLabelMaps, thumbnailIndex, titleIndex])

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
        {presentation === 'gallery' ? <GallerySkeleton /> : <ScreeningSkeleton columnCount={Math.max(columns.length, 4)} />}
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
    return <EmptyState title="표시할 컬럼이 없습니다." message="Notion DB 속성을 확인해 주세요." className="scheduleEmptyState" />
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
          {presentation === 'gallery' && groupByColumnName ? (
            <button type="button" className="secondary mini" onClick={() => setGroupedGallery((current) => !current)}>
              {groupedGallery ? '전체 보기' : `${groupByColumnName}별 그룹`}
            </button>
          ) : null}
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
        <input type="search" value={query} onChange={onQueryChange} placeholder="행사명, 파일명, 상태로 검색" aria-label={`${eyebrow} 검색`} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState
          title="표시할 데이터가 없습니다."
          message={normalizedQuery ? '검색 조건에 맞는 결과가 없습니다.' : '현재 DB에 데이터가 없습니다.'}
          className="scheduleEmptyState"
        />
      ) : presentation === 'gallery' ? (
        <div className="screeningGalleryGroups">
          {galleryGroups.map((group) => (
            <section key={group.key} className="screeningGallerySection" aria-label={group.label}>
              <div className="screeningGallerySectionHeader">
                <div className="screeningGallerySectionTitle">
                  {group.visual ? (
                    <span className="screeningGalleryProjectVisual" aria-hidden="true">
                      {group.visual.coverUrl ? <img className="screeningGalleryProjectCover" src={group.visual.coverUrl} alt="" /> : null}
                      {group.visual.iconUrl ? <img className="screeningGalleryProjectIcon" src={group.visual.iconUrl} alt="" /> : null}
                      {group.visual.iconEmoji ? (
                        <span className="screeningGalleryProjectEmoji" title={formatProjectIconLabel(group.visual.iconEmoji)}>
                          {emojiToTwemojiUrl(group.visual.iconEmoji) ? (
                            <img src={emojiToTwemojiUrl(group.visual.iconEmoji) ?? undefined} alt={group.visual.iconEmoji} />
                          ) : (
                            group.visual.iconEmoji
                          )}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  <h3>{group.label}</h3>
                </div>
                <span>{group.items.length}건</span>
              </div>
              <div className="screeningGalleryGrid">
                {group.items.map((item) => (
                  <article key={item.row.id} className="screeningGalleryCard">
                    {item.thumbnailUrl ? (
                      <a className="screeningGalleryThumb" href={item.row.url ?? item.thumbnailUrl} target="_blank" rel="noreferrer">
                        <img src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                      </a>
                    ) : (
                      <a className="screeningGalleryThumb is-empty" href={item.row.url ?? undefined} target="_blank" rel="noreferrer">
                        <span>대표 이미지 없음</span>
                      </a>
                    )}
                    <div className="screeningGalleryBody">
                      {item.row.url ? (
                        <a className="screeningGalleryTitle" href={item.row.url} target="_blank" rel="noreferrer">
                          {item.title}
                        </a>
                      ) : (
                        <strong className="screeningGalleryTitle">{item.title}</strong>
                      )}
                      <dl className="screeningGalleryMeta">
                        {item.details.map((detail) => (
                          <div key={`${item.row.id}-${detail.label}`} className="screeningGalleryMetaRow">
                            <dt>{detail.label}</dt>
                            <dd>{detail.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <TableWrap>
          <table className="scheduleGridTable">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={column.id} className={index === titleIndex ? 'schedulePrimaryColumn' : undefined}>
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
                    const label = resolveCellText(cell, column.name, relationColumnLabelMaps)
                    const cellClassName = index === titleIndex ? 'schedulePrimaryColumn scheduleCell' : 'scheduleCell'

                    if (index === titleIndex && row.url) {
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
