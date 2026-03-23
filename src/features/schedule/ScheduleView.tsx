import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { api } from '../../shared/api/client'
import { Button, EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ScheduleViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  onRefresh?: () => void
}

const SCHEDULE_TYPE_OPTIONS = ['회의', '보고', '외부미팅', '웨비나', '휴가', '외근', '출장', '기타']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesQuery(row: ScheduleRow, query: string): boolean {
  if (!query) return true
  const source = row.cells.map((cell) => cell.text).join(' ').toLowerCase()
  return source.includes(query)
}

function toCellLabel(cell: ScheduleRow['cells'][number] | undefined): string {
  const value = (cell?.text ?? '').trim()
  return value || '-'
}

function findColumnIndex(columns: ScheduleColumn[], names: string[]): number {
  for (const name of names) {
    const idx = columns.findIndex((c) => c.name === name)
    if (idx >= 0) return idx
  }
  return -1
}

type CalendarEvent = {
  id: string
  url: string | null
  title: string
  type: string
  attendees: string
  date: string
  dateEnd?: string
  timeStart?: string
  timeEnd?: string
}

const TYPE_COLORS: Record<string, string> = {
  '회의': '#3b82f6',
  '보고': '#22c55e',
  '외부미팅': '#8b5cf6',
  '웨비나': '#eab308',
  '휴가': '#ef4444',
  '외근': '#f97316',
  '출장': '#ec4899',
  '기타': '#94a3b8',
}

function extractTime(isoLike: string): string | undefined {
  // "2026-04-16T21:30:00.000+09:00" → "21:30"
  const match = isoLike.match(/T(\d{2}:\d{2})/)
  if (!match) return undefined
  return match[1] === '00:00' ? undefined : match[1]
}

function parseCalendarEvents(columns: ScheduleColumn[], rows: ScheduleRow[]): CalendarEvent[] {
  const titleIdx = findColumnIndex(columns, ['일정명', '이름', 'name', 'Name'])
  const dateIdx = findColumnIndex(columns, ['일시', '날짜', '일정', 'date', 'Date'])
  const typeIdx = findColumnIndex(columns, ['유형', '종류', 'type', 'Type'])
  const attendeeIdx = findColumnIndex(columns, ['예정 참석자', '참석자', '담당자', 'attendees'])

  if (dateIdx < 0) return []

  const results: CalendarEvent[] = []

  for (const row of rows) {
    const dateText = (row.cells[dateIdx]?.text ?? '').trim()
    if (!dateText) continue

    // Worker formats as "start -> end" or just "start"
    const dateParts = dateText.split(/\s*->\s*/).map((s) => s.trim()).filter(Boolean)
    const startRaw = dateParts[0] ?? ''
    const endRaw = dateParts.length > 1 ? dateParts[dateParts.length - 1] : undefined

    const dateStart = startRaw.slice(0, 10)
    if (!dateStart || !/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) continue

    const dateEnd = endRaw ? endRaw.slice(0, 10) : undefined
    const validEnd = dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd) && dateEnd !== dateStart ? dateEnd : undefined

    results.push({
      id: row.id,
      url: row.url,
      title: titleIdx >= 0 ? (row.cells[titleIdx]?.text ?? '').trim() || '(제목 없음)' : '(제목 없음)',
      type: typeIdx >= 0 ? (row.cells[typeIdx]?.text ?? '').trim() : '',
      attendees: attendeeIdx >= 0 ? (row.cells[attendeeIdx]?.text ?? '').trim() : '',
      date: dateStart,
      dateEnd: validEnd,
      timeStart: extractTime(startRaw),
      timeEnd: endRaw ? extractTime(endRaw) : undefined,
    })
  }

  return results
}

function getMonthDays(year: number, month: number): { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const days: { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] = []

  // Fill leading days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: fmt(d), dayOfWeek: d.getDay(), isCurrentMonth: false })
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({ date: fmt(date), dayOfWeek: date.getDay(), isCurrentMonth: true })
  }

  // Fill trailing days
  while (days.length % 7 !== 0) {
    const d = new Date(year, month + 1, days.length - daysInMonth - startDow + 1)
    days.push({ date: fmt(d), dayOfWeek: d.getDay(), isCurrentMonth: false })
  }

  return days
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isEventOnDate(event: CalendarEvent, date: string): boolean {
  if (!event.dateEnd) return event.date === date
  return event.date <= date && date <= event.dateEnd
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

// ---------------------------------------------------------------------------
// Calendar component
// ---------------------------------------------------------------------------

function ScheduleCalendar({ events }: { events: CalendarEvent[] }) {
  const today = useMemo(() => fmt(new Date()), [])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())

  const days = useMemo(() => getMonthDays(year, month), [year, month])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) {
      const dayEvents = events.filter((e) => isEventOnDate(e, day.date))
      if (dayEvents.length > 0) map.set(day.date, dayEvents)
    }
    return map
  }, [events, days])

  const goPrev = () => {
    if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1)
  }
  const goNext = () => {
    if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1)
  }
  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear()); setMonth(now.getMonth())
  }

  return (
    <div className="scheduleCalendar">
      <div className="scheduleCalendarNav">
        <button type="button" onClick={goPrev} className="scheduleCalendarNavBtn">&lt;</button>
        <strong className="scheduleCalendarTitle">{year}년 {month + 1}월</strong>
        <button type="button" onClick={goNext} className="scheduleCalendarNavBtn">&gt;</button>
        <button type="button" onClick={goToday} className="scheduleCalendarTodayBtn">오늘</button>
      </div>

      <div className="scheduleCalendarGrid">
        {DOW_LABELS.map((dow, i) => (
          <div key={dow} className="scheduleCalendarDow" style={{ color: i === 0 ? 'var(--error, #d32f2f)' : i === 6 ? '#3b82f6' : undefined }}>
            {dow}
          </div>
        ))}

        {days.map((day) => {
          const dayEvents = eventsByDate.get(day.date) ?? []
          const isToday = day.date === today
          const dayNum = parseInt(day.date.slice(8), 10)

          return (
            <div
              key={day.date}
              className={`scheduleCalendarDay${day.isCurrentMonth ? '' : ' scheduleCalendarDayOther'}${isToday ? ' scheduleCalendarDayToday' : ''}`}
            >
              <span className={`scheduleCalendarDayNum${day.dayOfWeek === 0 ? ' scheduleCalendarSun' : day.dayOfWeek === 6 ? ' scheduleCalendarSat' : ''}`}>
                {dayNum}
              </span>
              <div className="scheduleCalendarEvents">
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="scheduleCalendarEvent"
                    style={{ borderLeftColor: TYPE_COLORS[event.type] ?? '#94a3b8' }}
                    title={`${event.title}${event.attendees ? `\n${event.attendees}` : ''}${event.type ? `\n[${event.type}]` : ''}`}
                  >
                    <span className="scheduleCalendarEventTitle">{event.timeStart ? `${event.timeStart} ` : ''}{event.title}</span>
                    {event.attendees ? <span className="scheduleCalendarEventAttendees">{event.attendees}</span> : null}
                  </div>
                ))}
                {dayEvents.length > 3 ? (
                  <div className="scheduleCalendarEventMore">+{dayEvents.length - 3}건</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="scheduleCalendarLegend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="scheduleCalendarLegendItem">
            <span className="scheduleCalendarLegendDot" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ScheduleSkeleton({ columnCount }: { columnCount: number }) {
  return (
    <TableWrap>
      <table className="scheduleGridTable">
        <thead>
          <tr>
            {Array.from({ length: columnCount }).map((_, index) => (
              <th key={`schedule-skeleton-head-${index}`}><Skeleton width="90px" height="14px" /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <tr key={`schedule-skeleton-row-${rowIndex}`}>
              {Array.from({ length: columnCount }).map((__, columnIndex) => (
                <td key={`schedule-skeleton-cell-${rowIndex}-${columnIndex}`}><Skeleton width="100%" height="14px" /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function ScheduleView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
  onRefresh,
}: ScheduleViewProps) {
  const [query, setQuery] = useState('')
  const [showTable, setShowTable] = useState(false)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredRows = useMemo(() => rows.filter((row) => matchesQuery(row, normalizedQuery)), [normalizedQuery, rows])
  const effectiveTitle = databaseTitle.trim() || 'Schedule DB'

  const calendarEvents = useMemo(() => parseCalendarEvents(columns, rows), [columns, rows])

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDateStart, setCreateDateStart] = useState('')
  const [createTimeStart, setCreateTimeStart] = useState('')
  const [createDateEnd, setCreateDateEnd] = useState('')
  const [createTimeEnd, setCreateTimeEnd] = useState('')
  const [createType, setCreateType] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!createTitle.trim()) return
    setCreating(true); setCreateError(null)
    try {
      const dateStart = createDateStart
        ? createTimeStart ? `${createDateStart}T${createTimeStart}:00` : createDateStart
        : undefined
      const dateEnd = createDateEnd
        ? createTimeEnd ? `${createDateEnd}T${createTimeEnd}:00` : createDateEnd
        : createTimeEnd && createDateStart
          ? `${createDateStart}T${createTimeEnd}:00`
          : undefined

      await api<{ ok: boolean }>('/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          dateStart,
          dateEnd,
          type: createType || undefined,
        }),
      })
      setCreateTitle(''); setCreateDateStart(''); setCreateTimeStart('')
      setCreateDateEnd(''); setCreateTimeEnd(''); setCreateType('')
      setShowCreateForm(false)
      onRefresh?.()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : '일정 등록에 실패했습니다')
    } finally { setCreating(false) }
  }

  const onQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
  }

  if (loading) {
    return (
      <section className="scheduleView">
        <div className="scheduleSummary" aria-label="일정 요약">
          <article><span>컬럼</span><strong>...</strong></article>
          <article><span>행</span><strong>...</strong></article>
          <article><span>검색 결과</span><strong>...</strong></article>
        </div>
        <ScheduleSkeleton columnCount={Math.max(columns.length, 4)} />
      </section>
    )
  }

  if (error) {
    return <EmptyState title="일정 DB를 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
  }

  if (!configured) {
    return <EmptyState title="일정 DB가 연결되지 않았습니다." message="Cloudflare Workers 환경변수에 NOTION_SCHEDULE_DB_ID를 추가하면 일정 탭이 활성화됩니다." className="scheduleEmptyState" />
  }

  if (columns.length === 0) {
    return <EmptyState title="읽을 수 있는 일정 컬럼이 없습니다." message="노션 Schedule DB 속성을 확인해 주세요." className="scheduleEmptyState" />
  }

  return (
    <section className="scheduleView">
      <div className="scheduleHero">
        <div className="scheduleHeroText">
          <h2>{effectiveTitle}</h2>
        </div>
        {databaseUrl ? (
          <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">노션 DB 열기</a>
        ) : null}
      </div>

      {/* Calendar — primary view */}
      <ScheduleCalendar events={calendarEvents} />

      {/* Create form */}
      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} size="mini">
          {showCreateForm ? '취소' : '+ 일정 등록'}
        </Button>
      </div>
      {showCreateForm ? (
        <form onSubmit={handleCreateSubmit} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'var(--surface-raised, var(--bg-card, #fff))' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="일정명 (필수)" required style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 4 }}>
                시작
                <input type="date" value={createDateStart} onChange={(e) => setCreateDateStart(e.target.value)} style={{ minWidth: 130 }} />
                <input type="time" value={createTimeStart} onChange={(e) => setCreateTimeStart(e.target.value)} style={{ minWidth: 90 }} />
              </label>
              <label style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 4 }}>
                종료
                <input type="date" value={createDateEnd} onChange={(e) => setCreateDateEnd(e.target.value)} style={{ minWidth: 130 }} />
                <input type="time" value={createTimeEnd} onChange={(e) => setCreateTimeEnd(e.target.value)} style={{ minWidth: 90 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={createType} onChange={(e) => setCreateType(e.target.value)} style={{ minWidth: 100 }}>
                <option value="">유형 선택</option>
                {SCHEDULE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {createError ? <div style={{ color: 'var(--error, #d32f2f)', fontSize: '0.85em' }}>{createError}</div> : null}
            <div><Button type="submit" disabled={creating || !createTitle.trim()} size="mini">{creating ? '등록 중...' : '등록'}</Button></div>
          </div>
        </form>
      ) : null}

      {/* Table toggle */}
      <div style={{ marginTop: 16, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9em', color: 'var(--primary, #1976d2)', textDecoration: 'underline', padding: 0 }}
        >
          {showTable ? '일정 목록 접기' : `일정 목록 펼치기 (${rows.length}건)`}
        </button>
      </div>

      {/* Table — secondary view */}
      {showTable ? (
        <>
          <div className="scheduleSummary" aria-label="일정 요약">
            <article><span>전체 행</span><strong>{rows.length}</strong></article>
            <article><span>검색 결과</span><strong>{filteredRows.length}</strong></article>
          </div>

          <div className="scheduleToolbar">
            <input type="search" value={query} onChange={onQueryChange} placeholder="일정명, 상태, 메모 등으로 검색" aria-label="일정 검색" />
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState title="표시할 일정이 없습니다." message={normalizedQuery ? '검색 조건에 맞는 일정이 없습니다.' : 'Schedule DB에 행이 없습니다.'} className="scheduleEmptyState" />
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
                              <a className="schedulePrimaryLink" href={row.url} target="_blank" rel="noreferrer">{label}</a>
                            </td>
                          )
                        }

                        if (cell?.href) {
                          return (
                            <td key={`${row.id}-${column.id}`} className={cellClassName}>
                              <a href={cell.href} target="_blank" rel="noreferrer">{label}</a>
                            </td>
                          )
                        }

                        return <td key={`${row.id}-${column.id}`} className={cellClassName}>{label}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      ) : null}
    </section>
  )
}
