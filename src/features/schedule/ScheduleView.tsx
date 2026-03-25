import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { api } from '../../shared/api/client'
import { Button, EmptyState, Modal, Skeleton, TableWrap } from '../../shared/ui'

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

// ---------------------------------------------------------------------------
// Display column ordering
// ---------------------------------------------------------------------------

type DisplayColumn = {
  index: number
  column: ScheduleColumn
  role: 'title' | 'date' | 'type' | 'attendees' | 'other'
}

function buildDisplayColumns(columns: ScheduleColumn[]): DisplayColumn[] {
  const titleIdx = findColumnIndex(columns, ['일정명', '이름', 'name', 'Name'])
  const dateIdx = findColumnIndex(columns, ['일시', '날짜', '일정', 'date', 'Date'])
  const typeIdx = findColumnIndex(columns, ['유형', '종류', 'type', 'Type'])
  const attendeeIdx = findColumnIndex(columns, ['예정 참석자', '참석자', '담당자', 'attendees'])

  const prioritySet = new Set([titleIdx, dateIdx, typeIdx, attendeeIdx].filter((i) => i >= 0))
  const result: DisplayColumn[] = []

  if (titleIdx >= 0) result.push({ index: titleIdx, column: columns[titleIdx], role: 'title' })
  if (dateIdx >= 0) result.push({ index: dateIdx, column: columns[dateIdx], role: 'date' })
  if (typeIdx >= 0) result.push({ index: typeIdx, column: columns[typeIdx], role: 'type' })
  if (attendeeIdx >= 0) result.push({ index: attendeeIdx, column: columns[attendeeIdx], role: 'attendees' })

  for (let i = 0; i < columns.length; i++) {
    if (!prioritySet.has(i)) result.push({ index: i, column: columns[i], role: 'other' })
  }

  return result
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const DOW_SHORT = ['일', '월', '화', '수', '목', '금', '토']

function formatDateDisplay(dateText: string): string {
  const parts = dateText.split(/\s*->\s*/).map((s) => s.trim()).filter(Boolean)
  const startRaw = parts[0] ?? ''
  const endRaw = parts.length > 1 ? parts[parts.length - 1] : undefined

  const startDate = startRaw.slice(0, 10)
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return dateText

  const d = new Date(startDate + 'T00:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dow = DOW_SHORT[d.getDay()]

  const startTime = extractTime(startRaw)
  const endTime = endRaw ? extractTime(endRaw) : undefined
  const endDate = endRaw?.slice(0, 10)

  let result = `${month}/${day} (${dow})`

  if (startTime) {
    result += ` ${startTime}`
    if (endTime && (!endDate || endDate === startDate)) {
      result += `~${endTime}`
    }
  }

  if (endDate && endDate !== startDate) {
    const ed = new Date(endDate + 'T00:00:00')
    result += ` ~ ${ed.getMonth() + 1}/${ed.getDate()} (${DOW_SHORT[ed.getDay()]})`
    if (endTime) result += ` ${endTime}`
  }

  return result
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

function countScheduleStats(events: CalendarEvent[]): { thisWeek: number; thisMonth: number; total: number } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = fmt(monday)
  const weekEnd = fmt(sunday)

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  let thisWeek = 0
  let thisMonth = 0

  for (const event of events) {
    const eventEnd = event.dateEnd || event.date
    if (event.date <= weekEnd && eventEnd >= weekStart) thisWeek++
    if (event.date <= monthEnd && eventEnd >= monthStart) thisMonth++
  }

  return { thisWeek, thisMonth, total: events.length }
}

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

function getMonthDays(year: number, month: number): { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const days: { date: string; dayOfWeek: number; isCurrentMonth: boolean }[] = []

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: fmt(d), dayOfWeek: d.getDay(), isCurrentMonth: false })
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    days.push({ date: fmt(date), dayOfWeek: date.getDay(), isCurrentMonth: true })
  }

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
                    <span className="scheduleCalendarEventTitle">{(() => {
                      const isMultiDay = event.dateEnd && event.dateEnd !== event.date
                      if (!isMultiDay) return event.timeStart ? `${event.timeStart} ${event.title}` : event.title
                      if (day.date === event.date && event.timeStart) return `${event.timeStart}~ ${event.title}`
                      if (day.date === event.dateEnd && event.timeEnd) return `~${event.timeEnd} ${event.title}`
                      return event.title
                    })()}</span>
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
// Table cell renderers
// ---------------------------------------------------------------------------

function ScheduleTypeCell({ text }: { text: string }) {
  if (!text || text === '-') return <span>-</span>
  return (
    <span className="scheduleTypeBadge">
      <span className="scheduleTypeDot" style={{ background: TYPE_COLORS[text] ?? '#94a3b8' }} />
      {text}
    </span>
  )
}

function ScheduleDateCell({ text }: { text: string }) {
  if (!text || text === '-') return <span>-</span>
  return <span className="scheduleDateCell">{formatDateDisplay(text)}</span>
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
  const displayColumns = useMemo(() => buildDisplayColumns(columns), [columns])
  const stats = useMemo(() => countScheduleStats(calendarEvents), [calendarEvents])

  // Create form (Modal)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDateStart, setCreateDateStart] = useState('')
  const [createTimeStart, setCreateTimeStart] = useState('')
  const [createDateEnd, setCreateDateEnd] = useState('')
  const [createTimeEnd, setCreateTimeEnd] = useState('')
  const [createType, setCreateType] = useState('')
  const [createAttendees, setCreateAttendees] = useState('')
  const [createLocation, setCreateLocation] = useState('')
  const [createMemo, setCreateMemo] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const resetCreateForm = () => {
    setCreateTitle(''); setCreateDateStart(''); setCreateTimeStart('')
    setCreateDateEnd(''); setCreateTimeEnd(''); setCreateType('')
    setCreateAttendees(''); setCreateLocation(''); setCreateMemo('')
    setCreateError(null)
  }

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
          attendees: createAttendees.trim() || undefined,
          location: createLocation.trim() || undefined,
          memo: createMemo.trim() || undefined,
        }),
      })
      resetCreateForm()
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
          <article><span>이번 주</span><strong>...</strong></article>
          <article><span>이번 달</span><strong>...</strong></article>
          <article><span>전체</span><strong>...</strong></article>
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
      {/* Hero */}
      <div className="scheduleHero">
        <div className="scheduleHeroText">
          <h2>{effectiveTitle}</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button onClick={() => setShowCreateForm(true)} size="mini">+ 일정 등록</Button>
          {databaseUrl ? (
            <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">노션 DB 열기</a>
          ) : null}
        </div>
      </div>

      {/* Summary stats */}
      <div className="scheduleSummary" aria-label="일정 요약">
        <article><span>이번 주</span><strong>{stats.thisWeek}</strong></article>
        <article><span>이번 달</span><strong>{stats.thisMonth}</strong></article>
        <article><span>전체</span><strong>{stats.total}</strong></article>
      </div>

      {/* Calendar */}
      <ScheduleCalendar events={calendarEvents} />

      {/* Table toggle */}
      <div>
        <Button onClick={() => setShowTable(!showTable)} variant="secondary" size="mini">
          {showTable ? '일정 목록 접기' : `일정 목록 (${rows.length}건)`}
        </Button>
      </div>

      {/* Table */}
      {showTable ? (
        <>
          <div className="scheduleToolbar">
            <input type="search" value={query} onChange={onQueryChange} placeholder="일정명, 참석자, 메모 등으로 검색" aria-label="일정 검색" />
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState title="표시할 일정이 없습니다." message={normalizedQuery ? '검색 조건에 맞는 일정이 없습니다.' : 'Schedule DB에 행이 없습니다.'} className="scheduleEmptyState" />
          ) : (
            <TableWrap>
              <table className="scheduleGridTable">
                <thead>
                  <tr>
                    {displayColumns.map((dc, pos) => (
                      <th key={dc.column.id} className={pos === 0 ? 'schedulePrimaryColumn' : undefined}>
                        <div className="scheduleColumnHeader">
                          <strong>{dc.column.name}</strong>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      {displayColumns.map((dc, pos) => {
                        const cell = row.cells[dc.index]
                        const label = toCellLabel(cell)
                        const isPrimary = pos === 0

                        if (dc.role === 'title' && isPrimary && row.url) {
                          return (
                            <td key={`${row.id}-${dc.column.id}`} className="schedulePrimaryColumn scheduleCell">
                              <a className="schedulePrimaryLink" href={row.url} target="_blank" rel="noreferrer">{label}</a>
                            </td>
                          )
                        }

                        if (dc.role === 'title' && isPrimary) {
                          return (
                            <td key={`${row.id}-${dc.column.id}`} className="schedulePrimaryColumn scheduleCell">
                              <strong>{label}</strong>
                            </td>
                          )
                        }

                        if (dc.role === 'date') {
                          return (
                            <td key={`${row.id}-${dc.column.id}`} className="scheduleCell">
                              <ScheduleDateCell text={label} />
                            </td>
                          )
                        }

                        if (dc.role === 'type') {
                          return (
                            <td key={`${row.id}-${dc.column.id}`} className="scheduleCell">
                              <ScheduleTypeCell text={label} />
                            </td>
                          )
                        }

                        if (cell?.href) {
                          return (
                            <td key={`${row.id}-${dc.column.id}`} className={isPrimary ? 'schedulePrimaryColumn scheduleCell' : 'scheduleCell'}>
                              <a href={cell.href} target="_blank" rel="noreferrer">{label}</a>
                            </td>
                          )
                        }

                        return (
                          <td key={`${row.id}-${dc.column.id}`} className={isPrimary ? 'schedulePrimaryColumn scheduleCell' : 'scheduleCell'}>
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
        </>
      ) : null}

      {/* Create Modal */}
      <Modal open={showCreateForm} onClose={() => { setShowCreateForm(false); setCreateError(null) }} className="scheduleCreateModal">
        <h3 style={{ margin: '0 0 14px' }}>일정 등록</h3>
        <form onSubmit={handleCreateSubmit} className="createForm">
          <label className="fullWidth">
            일정명
            <input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="일정명을 입력하세요" required />
          </label>

          <label>
            시작
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={createDateStart} onChange={(e) => setCreateDateStart(e.target.value)} style={{ flex: 1 }} />
              <input type="time" value={createTimeStart} onChange={(e) => setCreateTimeStart(e.target.value)} style={{ width: 100 }} />
            </div>
          </label>
          <label>
            종료
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" value={createDateEnd} onChange={(e) => setCreateDateEnd(e.target.value)} style={{ flex: 1 }} />
              <input type="time" value={createTimeEnd} onChange={(e) => setCreateTimeEnd(e.target.value)} style={{ width: 100 }} />
            </div>
          </label>

          <label>
            유형
            <select value={createType} onChange={(e) => setCreateType(e.target.value)}>
              <option value="">선택</option>
              {SCHEDULE_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            참석자
            <input value={createAttendees} onChange={(e) => setCreateAttendees(e.target.value)} placeholder="홍길동, 김철수" />
          </label>

          <label className="fullWidth">
            장소 / 링크
            <input value={createLocation} onChange={(e) => setCreateLocation(e.target.value)} placeholder="회의실 또는 Zoom 링크" />
          </label>

          <label className="fullWidth">
            메모
            <textarea value={createMemo} onChange={(e) => setCreateMemo(e.target.value)} placeholder="참고 사항" rows={3} />
          </label>

          {createError ? <div className="fullWidth" style={{ color: 'var(--error, #d32f2f)', fontSize: '0.85em' }}>{createError}</div> : null}

          <div className="actions fullWidth">
            <Button type="button" variant="secondary" size="mini" onClick={() => { setShowCreateForm(false); setCreateError(null) }}>취소</Button>
            <Button type="submit" disabled={creating || !createTitle.trim()} size="mini">{creating ? '등록 중...' : '등록'}</Button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
