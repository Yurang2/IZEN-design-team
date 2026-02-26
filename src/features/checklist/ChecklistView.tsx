import { useMemo, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useState, type CSSProperties } from 'react'
import type {
  ChecklistPreviewFilters,
  ChecklistPreviewItem,
  ChecklistSort,
  ChecklistTableRow,
  ProjectRecord,
} from '../../shared/types'
import { Button, EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ChecklistViewProps = {
  mode: 'schedule_share' | 'assignment'
  checklistFilters: ChecklistPreviewFilters
  checklistSort: ChecklistSort
  checklistLoading: boolean
  checklistError: string | null
  assignmentSyncError: string | null
  assignmentStorageMode: 'notion_matrix' | 'd1' | 'cache'
  prioritizeUnassignedChecklist: boolean
  projectDbOptions: ProjectRecord[]
  selectedChecklistProject: ProjectRecord | undefined
  rows: ChecklistTableRow[]
  onChecklistInput: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onChecklistSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onChecklistReset: () => Promise<void>
  onChecklistSortChange: (nextSort: ChecklistSort) => void
  onTogglePrioritizeUnassignedChecklist: (nextValue: boolean) => void
  creatingTaskByChecklistId: Record<string, boolean>
  onCreateTaskFromChecklist: (row: ChecklistTableRow) => Promise<void>
  onTaskOpen: (taskId: string) => void
  onOpenAssignmentPicker: (item: ChecklistPreviewItem) => void
  onSetNotApplicable: (itemId: string) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
  toProjectThumbUrl: (project: ProjectRecord | undefined) => string | undefined
  formatDateLabel: (value: string) => string
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

function shiftBusinessDays(date: Date, offsetDays: number): Date {
  if (offsetDays === 0) return new Date(date.getTime())
  const step = offsetDays > 0 ? 1 : -1
  let remaining = Math.abs(offsetDays)
  let cursor = new Date(date.getTime())
  while (remaining > 0) {
    cursor = addDays(cursor, step)
    if (isBusinessDay(cursor)) {
      remaining -= 1
    }
  }
  return cursor
}

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toMonthDayLabel(value: Date): string {
  return `${value.getUTCMonth() + 1}/${value.getUTCDate()}`
}

function getIsoWeekNumber(value: Date): number {
  const copy = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  const dayNum = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

type AssignmentTimelineRange = {
  start: Date
  end: Date
  spanMs: number
}

function buildAssignmentTimelineRange(points: Date[]): AssignmentTimelineRange | null {
  if (points.length === 0) return null

  const times = points.map((date) => date.getTime()).filter((time) => Number.isFinite(time))
  if (times.length === 0) return null

  let start = new Date(Math.min(...times))
  let end = new Date(Math.max(...times))
  const minSpanMs = 14 * 86_400_000
  if (end.getTime() - start.getTime() < minSpanMs) {
    start = addDays(start, -7)
    end = addDays(end, 7)
  } else {
    start = addDays(start, -3)
    end = addDays(end, 3)
  }
  const spanMs = Math.max(end.getTime() - start.getTime(), 86_400_000)
  return { start, end, spanMs }
}

function markerStyleForDate(range: AssignmentTimelineRange | null, date: Date | null): CSSProperties | undefined {
  if (!range || !date) return undefined
  const raw = ((date.getTime() - range.start.getTime()) / range.spanMs) * 100
  const left = Math.max(0, Math.min(100, raw))
  return { left: `${left}%` }
}

function barStyleForDateRange(range: AssignmentTimelineRange | null, startDate: Date | null, endDate: Date | null): CSSProperties | undefined {
  if (!range) return undefined
  if (!startDate && !endDate) return undefined

  const first = startDate ?? endDate
  const second = endDate ?? startDate
  if (!first || !second) return undefined

  const start = first.getTime() <= second.getTime() ? first : second
  const end = first.getTime() <= second.getTime() ? second : first
  const startRaw = ((start.getTime() - range.start.getTime()) / range.spanMs) * 100
  const endRaw = ((end.getTime() - range.start.getTime()) / range.spanMs) * 100
  const left = Math.max(0, Math.min(100, startRaw))
  const right = Math.max(0, Math.min(100, endRaw))
  const width = Math.max(1.4, right - left)
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
}

function toOperationModeLabel(value: ProjectRecord['operationMode']): string {
  if (value === 'self') return '자체'
  if (value === 'dealer') return '딜러'
  return '-'
}

function toFulfillmentModeLabel(value: ProjectRecord['fulfillmentMode']): string {
  if (value === 'domestic') return '국내'
  if (value === 'overseas') return '해외'
  if (value === 'dealer') return '딜러'
  return '-'
}

function toEventLeadLabel(dueDate: string | undefined, eventDate: string | undefined): string {
  const due = parseIsoDate(dueDate)
  const event = parseIsoDate(eventDate)
  if (!due || !event) return '-'

  const leadDays = diffDays(due, event)
  if (leadDays === 0) return 'D-Day'
  if (leadDays > 0) return `D-${leadDays}`
  return `D+${Math.abs(leadDays)}`
}

function toTodayLeadLabel(targetDate: string | undefined, todayDate: Date | null): string {
  const target = parseIsoDate(targetDate)
  if (!target || !todayDate) return '-'

  const leadDays = diffDays(todayDate, target)
  if (leadDays === 0) return 'D-Day'
  if (leadDays > 0) return `D-${leadDays}`
  return `D+${Math.abs(leadDays)}`
}

type AssignmentTimelineBar = {
  id: string
  label: string
  assignmentStatusLabel: string
  startDate: Date
  dueDate: Date
  startDateIso: string
  dueDateIso: string
  lane: number
  assignmentStatus: ChecklistTableRow['assignmentStatus']
  isOverdue: boolean
  isDueToday: boolean
}

function ChecklistSkeletonTable({ isAssignmentMode }: { isAssignmentMode: boolean }) {
  const columnCount = isAssignmentMode ? 11 : 8
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>제작물</th>
            <th>작업분류</th>
            <th>디자인 소요(일)</th>
            <th>실물 제작 소요(일)</th>
            <th>총 소요(일)</th>
            <th>역산 완료 예정일</th>
            <th>최종 완료 시점</th>
            {!isAssignmentMode ? <th>행사일 기준</th> : null}
            {isAssignmentMode ? <th>오늘 기준</th> : null}
            {isAssignmentMode ? <th>작업할당여부</th> : null}
            {isAssignmentMode ? <th>할당 업무</th> : null}
            {isAssignmentMode ? <th>액션</th> : null}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, idx) => (
            <tr key={`checklist-skeleton-row-${idx}`}>
              {Array.from({ length: columnCount }).map((__, colIdx) => (
                <td key={`checklist-skeleton-col-${idx}-${colIdx}`}>
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

export function ChecklistView({
  mode,
  checklistFilters,
  checklistSort,
  checklistLoading,
  checklistError,
  assignmentSyncError,
  assignmentStorageMode,
  prioritizeUnassignedChecklist,
  projectDbOptions,
  selectedChecklistProject,
  rows,
  onChecklistInput,
  onChecklistSubmit,
  onChecklistReset,
  onChecklistSortChange,
  onTogglePrioritizeUnassignedChecklist,
  creatingTaskByChecklistId,
  onCreateTaskFromChecklist,
  onTaskOpen,
  onOpenAssignmentPicker,
  onSetNotApplicable,
  toProjectLabel,
  toProjectThumbUrl,
  formatDateLabel,
}: ChecklistViewProps) {
  const eventNameRef = useRef<HTMLSelectElement | null>(null)
  const isAssignmentMode = mode === 'assignment'
  const [showAssignmentTimeline, setShowAssignmentTimeline] = useState(true)
  const [timelineFocusedRowId, setTimelineFocusedRowId] = useState<string | null>(null)
  const todayIso = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const todayDate = useMemo(() => parseIsoDate(todayIso), [todayIso])

  const scheduleSummary = useMemo(() => {
    let overdue = 0
    let dueToday = 0
    let upcoming = 0
    for (const row of rows) {
      if (!row.computedDueDate) continue
      if (row.computedDueDate < todayIso) overdue += 1
      else if (row.computedDueDate === todayIso) dueToday += 1
      else upcoming += 1
    }

    return {
      total: rows.length,
      overdue,
      dueToday,
      upcoming,
    }
  }, [rows, todayIso])

  const assignmentTimelineModel = useMemo(() => {
    if (!isAssignmentMode) {
      return {
        bars: [] as AssignmentTimelineBar[],
        laneCount: 0,
        totalCount: 0,
        unscheduledCount: 0,
        overdueCount: 0,
      }
    }

    const targetRows = rows.filter((row) => row.assignmentStatus !== 'not_applicable')
    const preparedBars: Array<Omit<AssignmentTimelineBar, 'lane'>> = []
    let unscheduledCount = 0

    for (const row of targetRows) {
      const dueDate = parseIsoDate(row.computedDueDate)
      if (!dueDate || !row.computedDueDate) {
        unscheduledCount += 1
        continue
      }

      const leadDaysRaw = typeof row.totalLeadDays === 'number' ? Math.round(row.totalLeadDays) : 1
      const leadDays = Math.max(1, leadDaysRaw)
      const startDate = shiftBusinessDays(dueDate, -(leadDays - 1))
      preparedBars.push({
        id: row.item.id,
        label: row.item.productName || row.item.workCategory || '-',
        assignmentStatusLabel: row.assignmentStatusLabel || (row.assignmentStatus === 'assigned' ? '할당' : '미할당'),
        startDate,
        dueDate,
        startDateIso: toIsoDate(startDate),
        dueDateIso: row.computedDueDate,
        assignmentStatus: row.assignmentStatus,
        isOverdue: row.computedDueDate < todayIso,
        isDueToday: row.computedDueDate === todayIso,
      })
    }

    preparedBars.sort((a, b) => {
      const byStart = a.startDateIso.localeCompare(b.startDateIso)
      if (byStart !== 0) return byStart
      const byDue = a.dueDateIso.localeCompare(b.dueDateIso)
      if (byDue !== 0) return byDue
      return a.label.localeCompare(b.label, 'ko')
    })

    const laneEndTimes: number[] = []
    const bars: AssignmentTimelineBar[] = []
    for (const entry of preparedBars) {
      const startTime = entry.startDate.getTime()
      const dueTime = entry.dueDate.getTime()
      let lane = laneEndTimes.findIndex((endTime) => endTime <= startTime)
      if (lane < 0) {
        laneEndTimes.push(dueTime)
        lane = laneEndTimes.length - 1
      } else {
        laneEndTimes[lane] = dueTime
      }
      bars.push({
        ...entry,
        lane,
      })
    }

    return {
      bars,
      laneCount: laneEndTimes.length,
      totalCount: targetRows.length,
      unscheduledCount,
      overdueCount: bars.filter((bar) => bar.isOverdue).length,
    }
  }, [isAssignmentMode, rows, todayIso])

  const assignmentTimelineRange = useMemo(() => {
    if (!isAssignmentMode || assignmentTimelineModel.bars.length === 0) return null
    const points: Date[] = []
    for (const entry of assignmentTimelineModel.bars) {
      points.push(entry.startDate)
      points.push(entry.dueDate)
    }
    if (todayDate) points.push(todayDate)
    const eventDate = parseIsoDate(selectedChecklistProject?.eventDate)
    if (eventDate) points.push(eventDate)
    return buildAssignmentTimelineRange(points)
  }, [assignmentTimelineModel.bars, isAssignmentMode, selectedChecklistProject?.eventDate, todayDate])

  const assignmentTodayMarkerStyle = useMemo(
    () => markerStyleForDate(assignmentTimelineRange, todayDate),
    [assignmentTimelineRange, todayDate],
  )
  const assignmentEventMarkerStyle = useMemo(
    () => markerStyleForDate(assignmentTimelineRange, parseIsoDate(selectedChecklistProject?.eventDate)),
    [assignmentTimelineRange, selectedChecklistProject?.eventDate],
  )
  const assignmentTimelineLaneHeight = 48
  const assignmentTimelineTrackHeight = useMemo(
    () => Math.max(72, assignmentTimelineModel.laneCount * assignmentTimelineLaneHeight + 16),
    [assignmentTimelineModel.laneCount],
  )
  const assignmentTimelineAxisRows = useMemo(() => {
    if (!assignmentTimelineRange) return [] as Array<{ key: string; label: string; ticks: Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }> }>

    const rows = {
      year: [] as Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }>,
      month: [] as Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }>,
      week: [] as Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }>,
      day: [] as Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }>,
    }

    const dayMs = 86_400_000
    const totalDays = Math.max(1, Math.round((assignmentTimelineRange.end.getTime() - assignmentTimelineRange.start.getTime()) / dayMs))
    const dayStep = totalDays <= 45 ? 1 : totalDays <= 120 ? 2 : 3
    const startIso = toIsoDate(assignmentTimelineRange.start)
    const endIso = toIsoDate(assignmentTimelineRange.end)

    let cursor = new Date(assignmentTimelineRange.start.getTime())
    let dayIndex = 0
    while (cursor.getTime() <= assignmentTimelineRange.end.getTime()) {
      const iso = toIsoDate(cursor)
      const left = String(markerStyleForDate(assignmentTimelineRange, cursor)?.left ?? '0%')
      const isStart = iso === startIso
      const isEnd = iso === endIso
      const month = cursor.getUTCMonth() + 1
      const day = cursor.getUTCDate()
      const dayOfWeek = cursor.getUTCDay()

      if (isStart || (month === 1 && day === 1)) {
        rows.year.push({ key: `year-${iso}`, label: `${cursor.getUTCFullYear()}년`, left, isStart, isEnd })
      }
      if (isStart || day === 1) {
        rows.month.push({ key: `month-${iso}`, label: `${month}월`, left, isStart, isEnd })
      }
      if (isStart || dayOfWeek === 1) {
        const mondayOffset = (dayOfWeek || 7) - 1
        const weekStart = addDays(cursor, -mondayOffset)
        const weekEnd = addDays(weekStart, 6)
        const rangeStart = weekStart.getTime() < assignmentTimelineRange.start.getTime() ? assignmentTimelineRange.start : weekStart
        const rangeEnd = weekEnd.getTime() > assignmentTimelineRange.end.getTime() ? assignmentTimelineRange.end : weekEnd
        rows.week.push({
          key: `week-${iso}`,
          label: `${getIsoWeekNumber(cursor)}주차 (${toMonthDayLabel(rangeStart)}-${toMonthDayLabel(rangeEnd)})`,
          left,
          isStart,
          isEnd,
        })
      }
      if (isStart || dayIndex % dayStep === 0) {
        rows.day.push({
          key: `day-${iso}`,
          label: `${day}일`,
          left,
          isStart,
          isEnd,
        })
      }

      cursor = addDays(cursor, 1)
      dayIndex += 1
    }

    const ensureEndTick = (list: Array<{ key: string; label: string; left: string; isStart: boolean; isEnd: boolean }>, label: string, prefix: string) => {
      if (list.some((entry) => entry.isEnd)) return
      list.push({
        key: `${prefix}-${endIso}`,
        label,
        left: String(markerStyleForDate(assignmentTimelineRange, assignmentTimelineRange.end)?.left ?? '100%'),
        isStart: false,
        isEnd: true,
      })
    }

    ensureEndTick(rows.year, `${assignmentTimelineRange.end.getUTCFullYear()}년`, 'year')
    ensureEndTick(rows.month, `${assignmentTimelineRange.end.getUTCMonth() + 1}월`, 'month')
    const endWeekDow = assignmentTimelineRange.end.getUTCDay() || 7
    const endWeekStart = addDays(assignmentTimelineRange.end, -(endWeekDow - 1))
    const endWeekEnd = addDays(endWeekStart, 6)
    const endWeekRangeStart = endWeekStart.getTime() < assignmentTimelineRange.start.getTime() ? assignmentTimelineRange.start : endWeekStart
    const endWeekRangeEnd = endWeekEnd.getTime() > assignmentTimelineRange.end.getTime() ? assignmentTimelineRange.end : endWeekEnd
    ensureEndTick(
      rows.week,
      `${getIsoWeekNumber(assignmentTimelineRange.end)}주차 (${toMonthDayLabel(endWeekRangeStart)}-${toMonthDayLabel(endWeekRangeEnd)})`,
      'week',
    )
    ensureEndTick(
      rows.day,
      `${assignmentTimelineRange.end.getUTCDate()}일`,
      'day',
    )

    return [
      { key: 'year', label: '연도', ticks: rows.year },
      { key: 'month', label: '월', ticks: rows.month },
      { key: 'week', label: '주차', ticks: rows.week },
      { key: 'day', label: '일', ticks: rows.day },
    ]
  }, [assignmentTimelineRange])
  const assignmentTimelineWeekBands = useMemo(() => {
    if (!assignmentTimelineRange) return [] as Array<{ key: string; left: string; width: string; alt: boolean }>

    const segments: Array<{ key: string; left: string; width: string; alt: boolean }> = []
    const start = assignmentTimelineRange.start
    const end = assignmentTimelineRange.end
    const startDow = start.getUTCDay() || 7
    let weekCursor = addDays(start, -(startDow - 1))
    let index = 0

    while (weekCursor.getTime() < end.getTime()) {
      const nextWeek = addDays(weekCursor, 7)
      const segStart = weekCursor.getTime() < start.getTime() ? start : weekCursor
      const segEnd = nextWeek.getTime() > end.getTime() ? end : nextWeek
      if (segEnd.getTime() > segStart.getTime()) {
        const left = ((segStart.getTime() - start.getTime()) / assignmentTimelineRange.spanMs) * 100
        const right = ((segEnd.getTime() - start.getTime()) / assignmentTimelineRange.spanMs) * 100
        segments.push({
          key: `week-band-${toIsoDate(weekCursor)}-${index}`,
          left: `${Math.max(0, Math.min(100, left))}%`,
          width: `${Math.max(1, Math.min(100, right) - Math.max(0, Math.min(100, left)))}%`,
          alt: index % 2 === 1,
        })
      }
      weekCursor = nextWeek
      index += 1
    }

    return segments
  }, [assignmentTimelineRange])
  const assignmentTimelineWeekendBands = useMemo(() => {
    if (!assignmentTimelineRange) return [] as Array<{ key: string; left: string; width: string }>

    const segments: Array<{ key: string; left: string; width: string }> = []
    let cursor = new Date(assignmentTimelineRange.start.getTime())
    while (cursor.getTime() <= assignmentTimelineRange.end.getTime()) {
      const dayOfWeek = cursor.getUTCDay()
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        const nextDay = addDays(cursor, 1)
        const start = cursor.getTime() < assignmentTimelineRange.start.getTime() ? assignmentTimelineRange.start : cursor
        const end = nextDay.getTime() > assignmentTimelineRange.end.getTime() ? assignmentTimelineRange.end : nextDay
        if (end.getTime() > start.getTime()) {
          const left = ((start.getTime() - assignmentTimelineRange.start.getTime()) / assignmentTimelineRange.spanMs) * 100
          const right = ((end.getTime() - assignmentTimelineRange.start.getTime()) / assignmentTimelineRange.spanMs) * 100
          segments.push({
            key: `weekend-band-${toIsoDate(cursor)}-${dayOfWeek}`,
            left: `${Math.max(0, Math.min(100, left))}%`,
            width: `${Math.max(0.8, Math.min(100, right) - Math.max(0, Math.min(100, left)))}%`,
          })
        }
      }
      cursor = addDays(cursor, 1)
    }

    return segments
  }, [assignmentTimelineRange])

  return (
    <section className="checklistPreview">
      <div className="checklistPreviewHeader">
        <h2>{isAssignmentMode ? '행사 할당 관리' : '행사 일정공유'}</h2>
        <p>
          {isAssignmentMode
            ? '노션 프로젝트 DB 값을 기준으로 항목을 생성/할당/해당없음 처리합니다.'
            : '행사진행일 기준으로 D-day 역산 일정을 빠르게 공유할 수 있습니다.'}
        </p>
      </div>

      <form className="checklistPreviewFilters" onSubmit={(event) => void onChecklistSubmit(event)}>
        <label>
          행사명
          <select ref={eventNameRef} name="eventName" value={checklistFilters.eventName} onChange={onChecklistInput}>
            <option value="">프로젝트 선택 안 함</option>
            {projectDbOptions.map((project) => (
              <option key={project.id} value={project.name}>
                {toProjectLabel(project)}
              </option>
            ))}
          </select>
        </label>

        <label>
          정렬
          <select value={checklistSort} onChange={(event) => onChecklistSortChange(event.target.value as ChecklistSort)}>
            <option value="due_asc">완료예정일 빠른순</option>
            <option value="due_desc">완료예정일 늦은순</option>
            <option value="name_asc">제작물 이름 오름차순</option>
            <option value="name_desc">제작물 이름 내림차순</option>
            <option value="lead_asc">총 소요일 짧은순</option>
            <option value="lead_desc">총 소요일 긴순</option>
          </select>
        </label>

        <div className="checklistPreviewActions">
          <Button type="submit" disabled={checklistLoading}>
            {checklistLoading ? '조회 중...' : '체크리스트 보기'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onChecklistReset()} disabled={checklistLoading}>
            초기화
          </Button>
        </div>
      </form>
      <p className="muted small">행사명을 선택하면 행사분류/배송마감일/운영방식/배송방식은 프로젝트 DB 값을 자동으로 사용합니다.</p>

      {isAssignmentMode ? (
        <>
          <label className="checkboxLabel flat">
            <input
              type="checkbox"
              checked={prioritizeUnassignedChecklist}
              onChange={(event) => onTogglePrioritizeUnassignedChecklist(event.target.checked)}
            />
            미할당 우선 정렬
          </label>
          <p className="muted small">
            할당 저장소:{' '}
            {assignmentStorageMode === 'notion_matrix'
              ? '노션 행사-체크리스트 할당 매트릭스(단일 소스)'
              : assignmentStorageMode === 'd1'
                ? 'D1(레거시 보조)'
                : 'Cache(레거시 보조)'}
          </p>
        </>
      ) : null}

      {selectedChecklistProject ? (
        <p className="muted small projectPreviewLine">
          {toProjectThumbUrl(selectedChecklistProject) ? <img className="projectPreviewImage" src={toProjectThumbUrl(selectedChecklistProject)} alt="" /> : null}
          선택 행사: {selectedChecklistProject.name}
        </p>
      ) : null}

      {selectedChecklistProject ? (
        <section className="checklistProjectMeta">
          <article>
            <span>행사분류</span>
            <strong>{selectedChecklistProject.eventCategory || '-'}</strong>
          </article>
          <article>
            <span>배송마감일</span>
            <strong>{selectedChecklistProject.shippingDate ? formatDateLabel(selectedChecklistProject.shippingDate) : '-'}</strong>
          </article>
          <article>
            <span>운영방식</span>
            <strong>{toOperationModeLabel(selectedChecklistProject.operationMode)}</strong>
          </article>
          <article>
            <span>배송방식</span>
            <strong>{toFulfillmentModeLabel(selectedChecklistProject.fulfillmentMode)}</strong>
          </article>
          <article>
            <span>행사진행일</span>
            <strong>{selectedChecklistProject.eventDate ? formatDateLabel(selectedChecklistProject.eventDate) : '-'}</strong>
          </article>
        </section>
      ) : null}

      {!isAssignmentMode && selectedChecklistProject ? (
        <section className="scheduleSummary" aria-label="일정 요약">
          <article>
            <span>전체 항목</span>
            <strong>{scheduleSummary.total}</strong>
          </article>
          <article>
            <span>오늘 마감</span>
            <strong>{scheduleSummary.dueToday}</strong>
          </article>
          <article>
            <span>지난 마감</span>
            <strong>{scheduleSummary.overdue}</strong>
          </article>
          <article>
            <span>남은 마감</span>
            <strong>{scheduleSummary.upcoming}</strong>
          </article>
        </section>
      ) : null}
      {isAssignmentMode && selectedChecklistProject ? (
        <section className="scheduleSummary" aria-label="할당 기준 요약">
          <article>
            <span>오늘</span>
            <strong>{formatDateLabel(todayIso)}</strong>
          </article>
          <article>
            <span>행사진행일</span>
            <strong>{selectedChecklistProject.eventDate ? formatDateLabel(selectedChecklistProject.eventDate) : '-'}</strong>
          </article>
          <article>
            <span>행사일까지</span>
            <strong>{toTodayLeadLabel(selectedChecklistProject.eventDate, todayDate)}</strong>
          </article>
          <article>
            <span>배송마감일까지</span>
            <strong>{toTodayLeadLabel(selectedChecklistProject.shippingDate, todayDate)}</strong>
          </article>
        </section>
      ) : null}
      {isAssignmentMode && selectedChecklistProject ? (
        <section className="assignmentTimelineSection" aria-label="고려 업무 타임라인">
          <div className="assignmentTimelineHeader">
            <h3>고려 업무 타임라인</h3>
            <Button type="button" variant="secondary" size="mini" onClick={() => setShowAssignmentTimeline((prev) => !prev)}>
              {showAssignmentTimeline ? '타임라인 접기' : '타임라인 펼치기'}
            </Button>
          </div>
          {showAssignmentTimeline ? (
            <>
              <p className="muted small assignmentTimelineGuide">
                해당없음 제외 · 할당여부 무관 전체 표시 · 위험(역산 경과) 업무는 빨간색 강조 · 사선 밴드는 주말입니다.
              </p>
              <p className="muted small assignmentTimelineGuide">
                전체 {assignmentTimelineModel.totalCount}건 / 표시 {assignmentTimelineModel.bars.length}건 / 날짜 미확정 {assignmentTimelineModel.unscheduledCount}건 /
                위험 {assignmentTimelineModel.overdueCount}건
              </p>
              {assignmentTimelineModel.bars.length === 0 || !assignmentTimelineRange ? (
                <p className="muted small">타임라인으로 표시 가능한 일정 데이터가 없습니다.</p>
              ) : (
                <div className="assignmentAsanaBoard">
                  <div className="assignmentAsanaAxis">
                    {assignmentTimelineAxisRows.map((row) => (
                      <div key={row.key} className="assignmentAsanaAxisRow">
                        <span className="assignmentAsanaAxisLabel">{row.label}</span>
                        <div className="assignmentAsanaAxisTrack">
                          {row.ticks.map((tick) => (
                            <span
                              key={tick.key}
                              className={`assignmentAsanaTick ${tick.isStart ? 'is-start' : tick.isEnd ? 'is-end' : ''}`.trim()}
                              style={{ left: tick.left }}
                            >
                              {tick.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="assignmentAsanaTrackRow">
                    <span className="assignmentAsanaAxisLabel" aria-hidden="true">
                      바
                    </span>
                    <div className="assignmentAsanaTrack" style={{ height: `${assignmentTimelineTrackHeight}px` }}>
                      <div className="assignmentAsanaWeekendBands" aria-hidden="true">
                        {assignmentTimelineWeekendBands.map((band) => (
                          <span key={band.key} className="assignmentAsanaWeekendBand" style={{ left: band.left, width: band.width }} />
                        ))}
                      </div>
                      <div className="assignmentAsanaWeekBands" aria-hidden="true">
                        {assignmentTimelineWeekBands.map((band) => (
                          <span key={band.key} className={`assignmentAsanaWeekBand ${band.alt ? 'is-alt' : ''}`.trim()} style={{ left: band.left, width: band.width }} />
                        ))}
                      </div>
                      <div className="projectTimelineTrackGrid" aria-hidden="true" />
                      {assignmentTodayMarkerStyle ? (
                        <span className="projectTimelineTodayMarker event-inline" style={assignmentTodayMarkerStyle} aria-hidden="true" />
                      ) : null}
                      {assignmentEventMarkerStyle ? (
                        <span className="projectTimelineEventMarker event-inline" style={assignmentEventMarkerStyle} aria-hidden="true" />
                      ) : null}
                      {assignmentTimelineModel.bars.map((entry) => {
                        const position = barStyleForDateRange(assignmentTimelineRange, entry.startDate, entry.dueDate)
                        if (!position) return null
                        const widthPercent =
                          typeof position.width === 'number'
                            ? position.width
                            : Number.parseFloat(typeof position.width === 'string' ? position.width : '0')
                        const isCompact = Number.isFinite(widthPercent) && widthPercent < 7
                        const className = [
                          'assignmentAsanaBar',
                          entry.assignmentStatus === 'unassigned' ? 'is-unassigned' : '',
                          entry.isDueToday ? 'is-due-today' : '',
                          entry.isOverdue ? 'is-overdue' : '',
                          isCompact ? 'is-compact' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')
                        const style: CSSProperties = {
                          ...position,
                          top: `${8 + entry.lane * assignmentTimelineLaneHeight}px`,
                        }
                        const title = `${entry.label} (${entry.assignmentStatusLabel}) | ${entry.startDateIso} ~ ${entry.dueDateIso} | ${toTodayLeadLabel(entry.dueDateIso, todayDate)}`
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            className={className}
                            style={style}
                            title={title}
                            data-full-label={`${entry.label} · ${entry.assignmentStatusLabel}`}
                            onClick={() => {
                              const target = document.getElementById(`checklist-assignment-row-${entry.id}`)
                              if (!target) return
                              target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              setTimelineFocusedRowId(entry.id)
                              window.setTimeout(() => {
                                setTimelineFocusedRowId((current) => (current === entry.id ? null : current))
                              }, 1800)
                          }}
                        >
                            {isCompact ? <span className="assignmentAsanaBarCompactDot" aria-hidden="true" /> : null}
                            <span className="assignmentAsanaBarName">{entry.label}</span>
                            <span className="assignmentAsanaBarStatus">{entry.assignmentStatusLabel}</span>
                            {isCompact ? (
                              <span className="assignmentAsanaBarOutsideLabel">{entry.label} · {entry.assignmentStatusLabel}</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {checklistError ? <p className="error">{checklistError}</p> : null}
      {assignmentSyncError ? <p className="error">{assignmentSyncError}</p> : null}
      {!checklistError ? <p className="muted">조회 결과: {rows.length}건</p> : null}

      {checklistLoading ? <ChecklistSkeletonTable isAssignmentMode={isAssignmentMode} /> : null}

      {!checklistLoading && !checklistError && rows.length === 0 ? (
        <EmptyState
          title="체크리스트 항목이 없습니다"
          message="행사명을 선택한 뒤 체크리스트를 조회해 주세요."
          actions={[
            {
              label: '행사명 선택',
              variant: 'secondary',
              onClick: () => eventNameRef.current?.focus(),
            },
          ]}
        />
      ) : null}

      {!checklistLoading && rows.length > 0 ? (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>제작물</th>
                <th>작업분류</th>
                <th>디자인 소요(일)</th>
                <th>실물 제작 소요(일)</th>
                <th>총 소요(일)</th>
                <th>역산 완료 예정일</th>
                <th>최종 완료 시점</th>
                {!isAssignmentMode ? <th>행사일 기준</th> : null}
                {isAssignmentMode ? <th>오늘 기준</th> : null}
                {isAssignmentMode ? <th>작업할당여부</th> : null}
                {isAssignmentMode ? <th>할당 업무</th> : null}
                {isAssignmentMode ? <th>액션</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const creating = creatingTaskByChecklistId[row.item.id] === true
                const rowClassName = [
                  'checklistRow',
                  row.assignmentStatus === 'not_applicable' ? 'isNotApplicable' : '',
                  timelineFocusedRowId === row.item.id ? 'isTimelineFocus' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr id={`checklist-assignment-row-${row.item.id}`} key={row.item.id} className={rowClassName}>
                    <td>{row.item.productName || '-'}</td>
                    <td>{row.item.workCategory || '-'}</td>
                    <td>{row.item.designLeadDays ?? '-'}</td>
                    <td>{row.item.productionLeadDays ?? '-'}</td>
                    <td>{row.totalLeadDays ?? '-'}</td>
                    <td className="dateCell">{row.computedDueDate ? formatDateLabel(row.computedDueDate) : '-'}</td>
                    <td>{row.item.finalDueText || '-'}</td>
                    {!isAssignmentMode ? <td>{toEventLeadLabel(row.computedDueDate, selectedChecklistProject?.eventDate)}</td> : null}
                    {isAssignmentMode ? <td>{toTodayLeadLabel(row.computedDueDate, todayDate)}</td> : null}

                    {isAssignmentMode ? (
                      <td>
                        <span
                          className={`assignmentBadge ${
                            row.assignmentStatus === 'not_applicable'
                              ? 'notApplicable'
                              : row.assignmentStatus === 'assigned'
                                ? 'assigned'
                                : 'unassigned'
                          }`}
                        >
                          {row.assignmentStatusLabel}
                        </span>
                      </td>
                    ) : null}

                    {isAssignmentMode ? (
                      <td className="assignmentCell">
                        {row.assignedTaskId ? (
                          <button type="button" className="taskLink" onClick={() => onTaskOpen(row.assignedTaskId)}>
                            {row.assignedTaskLabel || row.assignedTaskId}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                    ) : null}

                    {isAssignmentMode ? (
                      <td className="actionCell">
                        <Button type="button" variant="secondary" size="mini" disabled={creating || row.isAssigned} onClick={() => void onCreateTaskFromChecklist(row)}>
                          {creating ? '생성 중...' : '생성'}
                        </Button>
                        <Button type="button" variant="secondary" size="mini" disabled={creating} onClick={() => onOpenAssignmentPicker(row.item)}>
                          {row.isAssigned ? '재할당' : '할당'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="mini"
                          className={row.assignmentStatus === 'not_applicable' ? 'is-active' : ''}
                          disabled={creating || row.assignmentStatus === 'not_applicable'}
                          onClick={() => void onSetNotApplicable(row.item.id)}
                        >
                          해당없음
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : null}
    </section>
  )
}
