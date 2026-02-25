import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { emojiToTwemojiUrl, formatProjectIconLabel } from '../../shared/emoji'
import type { ProjectRecord, ProjectSort, ProjectTimelineGroup, ProjectTimelineTask } from '../../shared/types'
import { EmptyState, Skeleton } from '../../shared/ui'

type AxisSegment = {
  key: string
  label: string
  widthPct: number
}

type TimelineRange = {
  start: Date
  end: Date
  totalDays: number
}

type TimelineRow = {
  item: ProjectTimelineTask
  tone: 'gray' | 'red' | 'blue' | 'green'
  risk: 'delayed' | 'urgent' | 'normal' | 'done'
  barStyle: CSSProperties
  plannedBarStyle?: CSSProperties
  hasActualCompletion: boolean
  leftPct: number
  widthPct: number
  predecessor?: {
    id: string
    label: string
  }
  blockedByPredecessor?: boolean
  dependencyGuideStyle?: CSSProperties
  dependencyDirection?: 'left' | 'right'
}

type ProjectTimelineModel = {
  range: TimelineRange
  axisMode: 'day' | 'week'
  monthSegments: AxisSegment[]
  unitSegments: AxisSegment[]
  rows: TimelineRow[]
  eventMarkerStyle: CSSProperties | null
  todayMarkerStyle: CSSProperties | null
}

type ProjectsViewProps = {
  sortedProjectDbOptions: ProjectRecord[]
  projectSort: ProjectSort
  projectTimelineGroups: ProjectTimelineGroup[]
  projectTimelineRange: {
    start: Date
    end: Date
    totalDays: number
  }
  openProjectTimelineGroups: Record<string, boolean>
  loadingProjects: boolean
  onProjectSortChange: (nextSort: ProjectSort) => void
  onToggleProjectTimelineGroup: (projectId: string) => void
  onTaskOpen: (taskId: string) => void
  formatDateLabel: (value: string) => string
  toIsoDate: (value: Date) => string
  toNotionUrlById: (id: string | undefined) => string | null
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

type TimelineMode = 'report' | 'manage' | 'work'
type SummaryFilter = 'all' | 'delayed' | 'todayDue' | 'weekDue' | 'urgent' | 'progress' | 'done' | 'active' | 'conflict' | 'blocked'

const PROJECT_TYPE_PRIORITY = ['행사', '전시회', '교육', '내부업무', '제품개발', '기타', '미분류']

function normalizeProjectType(value: string | undefined): string {
  const normalized = (value ?? '').trim()
  return normalized || '미분류'
}

function compareProjectType(a: string, b: string): number {
  const aIndex = PROJECT_TYPE_PRIORITY.indexOf(a)
  const bIndex = PROJECT_TYPE_PRIORITY.indexOf(b)
  const aRank = aIndex >= 0 ? aIndex : 999
  const bRank = bIndex >= 0 ? bIndex : 999
  if (aRank !== bRank) return aRank - bRank
  return a.localeCompare(b, 'ko')
}

function formatMonthDotDay(date: Date | null): string {
  if (!date) return ''
  return `${date.getUTCMonth() + 1}.${date.getUTCDate()}`
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function diffUtcDays(from: Date, to: Date): number {
  const ms = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / ms)
}

function getIsoWeek(date: Date): number {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
  return Math.ceil((diffUtcDays(yearStart, copy) + 1) / 7)
}

function startOfIsoWeek(date: Date): Date {
  const day = date.getUTCDay() || 7
  return addUtcDays(date, 1 - day)
}

function buildMonthSegments(start: Date, end: Date, totalDays: number): AxisSegment[] {
  const segments: AxisSegment[] = []
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12, 0, 0))

  while (cursor <= end) {
    const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1, 12, 0, 0))
    const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 12, 0, 0))
    const segmentStart = monthStart < start ? start : monthStart
    const segmentEnd = monthEnd > end ? end : monthEnd
    const spanDays = Math.max(1, diffUtcDays(segmentStart, segmentEnd) + 1)

    segments.push({
      key: `month-${cursor.getUTCFullYear()}-${cursor.getUTCMonth() + 1}`,
      label: `${cursor.getUTCFullYear()}년 ${cursor.getUTCMonth() + 1}월`,
      widthPct: (spanDays / totalDays) * 100,
    })

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 12, 0, 0))
  }

  return segments
}

function buildDaySegments(start: Date, end: Date, totalDays: number): AxisSegment[] {
  const segments: AxisSegment[] = []
  let cursor = start
  let index = 0

  while (cursor <= end) {
    const month = cursor.getUTCMonth() + 1
    const day = cursor.getUTCDate()
    const label = day === 1 || index === 0 ? `${month}/${day}` : `${day}`

    segments.push({
      key: `day-${cursor.getUTCFullYear()}-${month}-${day}`,
      label,
      widthPct: (1 / totalDays) * 100,
    })

    cursor = addUtcDays(cursor, 1)
    index += 1
  }

  return segments
}

function buildWeekSegments(start: Date, end: Date, totalDays: number): AxisSegment[] {
  const segments: AxisSegment[] = []
  let cursor = startOfIsoWeek(start)

  while (cursor <= end) {
    const weekStart = cursor
    const weekEnd = addUtcDays(weekStart, 6)
    const segmentStart = weekStart < start ? start : weekStart
    const segmentEnd = weekEnd > end ? end : weekEnd
    const spanDays = Math.max(1, diffUtcDays(segmentStart, segmentEnd) + 1)
    const weekNumber = getIsoWeek(weekStart)

    segments.push({
      key: `week-${weekStart.getUTCFullYear()}-${weekNumber}`,
      label: `${weekNumber}주차`,
      widthPct: (spanDays / totalDays) * 100,
    })

    cursor = addUtcDays(cursor, 7)
  }

  return segments
}

function todayUtcDate(): Date {
  return parseIsoDate(new Date().toISOString().slice(0, 10)) ?? new Date()
}

function normalizeStatusKey(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
}

function isDelayExcludedStatus(status: string | undefined): boolean {
  const normalized = normalizeStatusKey(status)
  return normalized.includes('보류') || normalized.includes('보관')
}

function isInactiveStatus(status: string | undefined): boolean {
  const normalized = normalizeStatusKey(status)
  return normalized.includes('완료') || normalized.includes('보류') || normalized.includes('보관')
}

function isTaskDueToday(task: ProjectTimelineTask['task'], today: Date): boolean {
  if (!task.dueDate) return false
  const due = parseIsoDate(task.dueDate)
  if (!due) return false
  return diffUtcDays(today, due) === 0
}

function isTaskDueWithinWeek(task: ProjectTimelineTask['task'], today: Date): boolean {
  if (!task.dueDate) return false
  const due = parseIsoDate(task.dueDate)
  if (!due) return false
  const days = diffUtcDays(today, due)
  return days >= 1 && days <= 7
}

function riskBandForTask(
  task: ProjectTimelineTask['task'],
  tone: 'gray' | 'red' | 'blue' | 'green',
  today: Date,
): 'delayed' | 'urgent' | 'normal' | 'done' {
  if (tone === 'green') return 'done'
  if (isDelayExcludedStatus(task.status)) return 'normal'
  if (tone === 'red') return 'delayed'

  const dueDate = parseIsoDate(task.dueDate)
  if (dueDate) {
    const daysLeft = diffUtcDays(today, dueDate)
    if (daysLeft < 0) return 'delayed'
    if (daysLeft <= 7) return 'urgent'
  }

  if (tone === 'blue') return 'urgent'
  return 'normal'
}

function riskOrder(risk: 'delayed' | 'urgent' | 'normal' | 'done'): number {
  if (risk === 'delayed') return 0
  if (risk === 'urgent') return 1
  if (risk === 'normal') return 2
  return 3
}

function sortTaskByDue(a: ProjectTimelineTask['task'], b: ProjectTimelineTask['task']): number {
  const aDue = a.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : '9999-12-31'
  const bDue = b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate) ? b.dueDate : '9999-12-31'
  if (aDue !== bDue) return aDue.localeCompare(bDue)
  return a.taskName.localeCompare(b.taskName, 'ko')
}

function overloadReason(entry: { active: number; delayed: number; urgent: number }): string {
  const reasons: string[] = []
  if (entry.delayed >= 2) reasons.push(`지연 ${entry.delayed}건`)
  if (entry.urgent >= 4) reasons.push(`임박 ${entry.urgent}건`)
  if (entry.active >= 6) reasons.push(`활성 ${entry.active}건`)
  return reasons.join(' / ')
}

function buildTimelineRange(group: ProjectTimelineGroup): TimelineRange {
  const points: Date[] = []
  const eventDate = parseIsoDate(group.project.eventDate)
  if (eventDate) points.push(eventDate)

  for (const item of group.tasks) {
    const startDate = parseIsoDate(item.task.startDate)
    const dueDate = parseIsoDate(item.task.dueDate)
    const actualEndDate = parseIsoDate(item.task.actualEndDate)
    if (startDate) points.push(startDate)
    if (dueDate) points.push(dueDate)
    if (actualEndDate) points.push(actualEndDate)
  }

  const today = parseIsoDate(new Date().toISOString().slice(0, 10)) ?? new Date()
  let start = points.length > 0 ? new Date(Math.min(...points.map((point) => point.getTime()))) : eventDate ?? today
  let end = points.length > 0 ? new Date(Math.max(...points.map((point) => point.getTime()))) : eventDate ?? today

  start = addUtcDays(start, -1)
  end = addUtcDays(end, 1)

  if (end < start) {
    return { start, end: start, totalDays: 1 }
  }

  return {
    start,
    end,
    totalDays: Math.max(1, diffUtcDays(start, end) + 1),
  }
}

function markerStyleForDate(range: TimelineRange, date: Date | null): CSSProperties | null {
  if (date === null) return null
  const left = Math.max(0, Math.min(100, (diffUtcDays(range.start, date) / range.totalDays) * 100))
  return { left: `${left}%` }
}

function buildProjectTimelineModel(
  group: ProjectTimelineGroup,
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green',
): ProjectTimelineModel {
  const range = buildTimelineRange(group)
  const today = todayUtcDate()
  const axisMode: 'day' | 'week' = range.totalDays > 42 ? 'week' : 'day'
  const monthSegments = buildMonthSegments(range.start, range.end, range.totalDays)
  const unitSegments =
    axisMode === 'week'
      ? buildWeekSegments(range.start, range.end, range.totalDays)
      : buildDaySegments(range.start, range.end, range.totalDays)

  const toBarStyle = (start: Date, end: Date): { leftPct: number; widthPct: number; style: CSSProperties } => {
    const safeStart = start <= end ? start : end
    const safeEnd = end >= start ? end : start
    const offset = diffUtcDays(range.start, safeStart)
    const spanDays = Math.max(1, diffUtcDays(safeStart, safeEnd) + 1)
    const leftPct = Math.max(0, Math.min(100, (offset / range.totalDays) * 100))
    const widthPct = Math.max(2, Math.min(100 - leftPct, (spanDays / range.totalDays) * 100))
    return {
      leftPct,
      widthPct,
      style: {
        left: `${leftPct}%`,
        width: `${widthPct}%`,
      },
    }
  }

  const rows: TimelineRow[] = group.tasks.map((item) => {
    const tone = toStatusTone(item.task.status)
    const startAnchor = parseIsoDate(item.task.startDate) ?? parseIsoDate(item.task.dueDate) ?? parseIsoDate(item.task.actualEndDate) ?? range.start
    const dueAnchor = parseIsoDate(item.task.dueDate) ?? startAnchor
    const actualAnchor = parseIsoDate(item.task.actualEndDate) ?? dueAnchor
    const mainBar = toBarStyle(startAnchor, actualAnchor)
    const plannedBar =
      parseIsoDate(item.task.actualEndDate) !== null && parseIsoDate(item.task.dueDate) !== null
        ? toBarStyle(startAnchor, dueAnchor)
        : null

    return {
      item,
      tone,
      risk: riskBandForTask(item.task, tone, today),
      hasActualCompletion: parseIsoDate(item.task.actualEndDate) !== null,
      leftPct: mainBar.leftPct,
      widthPct: mainBar.widthPct,
      barStyle: mainBar.style,
      plannedBarStyle: plannedBar?.style,
    }
  })

  const rowByTaskId = new Map<string, TimelineRow>()
  for (const row of rows) {
    rowByTaskId.set(row.item.task.id, row)
  }

  for (const row of rows) {
    const predecessorTaskId = row.item.predecessorTaskId
    if (!predecessorTaskId) continue

    const predecessorRow = rowByTaskId.get(predecessorTaskId)
    if (!predecessorRow) continue

    const predecessorEnd = predecessorRow.leftPct + predecessorRow.widthPct
    const currentStart = row.leftPct
    const guideLeft = Math.min(predecessorEnd, currentStart)
    const guideWidth = Math.max(1, Math.abs(currentStart - predecessorEnd))

    row.predecessor = {
      id: predecessorRow.item.task.id,
      label: predecessorRow.item.task.taskName,
    }
    row.blockedByPredecessor = predecessorRow.tone !== 'green'
    row.dependencyDirection = predecessorEnd <= currentStart ? 'right' : 'left'
    row.dependencyGuideStyle = {
      left: `${guideLeft}%`,
      width: `${guideWidth}%`,
    }
  }

  const eventDate = parseIsoDate(group.project.eventDate)
  const eventMarkerStyle = markerStyleForDate(range, eventDate)
  const todayMarkerStyle = markerStyleForDate(range, today)

  return {
    range,
    axisMode,
    monthSegments,
    unitSegments,
    rows,
    eventMarkerStyle,
    todayMarkerStyle,
  }
}

function ProjectsSkeleton() {
  return (
    <section className="projectTimelineBoard" aria-hidden="true">
      <header className="projectTimelineBoardHeader">
        <div className="projectTimelineBoardTitle">
          <h3>프로젝트 타임라인</h3>
          <Skeleton width="260px" height="14px" />
        </div>
      </header>

      <div className="projectTimelineGroupList">
        {Array.from({ length: 3 }).map((_, groupIndex) => (
          <article key={`timeline-group-skeleton-${groupIndex}`} className="projectTimelineGroup">
            <div className="projectTimelineGroupRow projectTimelineProjectRow">
              <div className="projectTimelineIdentity">
                <Skeleton width="220px" height="16px" />
                <Skeleton width="180px" height="12px" />
              </div>
              <div className="projectTimelineTrack">
                <Skeleton width="100%" height="18px" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function renderAssigneeBadges(assignee: string[]) {
  if (assignee.length === 0) {
    return <span className="timelineAssigneeBadge">담당 미지정</span>
  }

  const visible = assignee.slice(0, 2)
  const hiddenCount = Math.max(0, assignee.length - visible.length)

  return (
    <>
      {visible.map((name) => (
        <span key={name} className="timelineAssigneeBadge">
          {name}
        </span>
      ))}
      {hiddenCount > 0 ? <span className="timelineAssigneeBadge">+{hiddenCount}</span> : null}
    </>
  )
}

export function ProjectsView({
  sortedProjectDbOptions,
  projectSort,
  projectTimelineGroups,
  projectTimelineRange,
  openProjectTimelineGroups,
  loadingProjects,
  onProjectSortChange,
  onToggleProjectTimelineGroup,
  onTaskOpen,
  formatDateLabel,
  toIsoDate,
  toNotionUrlById,
  joinOrDash,
  toStatusTone,
}: ProjectsViewProps) {
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('manage')
  const [workerAssignee, setWorkerAssignee] = useState('')
  const [showCompletedTasks, setShowCompletedTasks] = useState(false)
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all')

  const timelineAssigneeOptions = useMemo(() => {
    const uniqueNames = new Set<string>()
    for (const group of projectTimelineGroups) {
      for (const item of group.tasks) {
        for (const name of item.task.assignee) {
          if (name) uniqueNames.add(name)
        }
      }
    }
    return Array.from(uniqueNames).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [projectTimelineGroups])

  const effectiveWorkerAssignee = timelineMode === 'work' ? workerAssignee || timelineAssigneeOptions[0] || '' : workerAssignee

  useEffect(() => {
    setSummaryFilter('all')
  }, [timelineMode])

  const manageConflictTaskIds = useMemo(() => {
    const conflictCounter = new Map<string, number>()
    const conflictKeysByTaskId = new Map<string, string[]>()

    for (const group of projectTimelineGroups) {
      for (const item of group.tasks) {
        if (isInactiveStatus(item.task.status)) continue
        if (!item.task.dueDate) continue
        const names = item.task.assignee.length > 0 ? item.task.assignee : ['담당 미지정']
        const keys = names.map((name) => `${name}::${item.task.dueDate}`)
        conflictKeysByTaskId.set(item.task.id, keys)
        for (const key of keys) {
          conflictCounter.set(key, (conflictCounter.get(key) ?? 0) + 1)
        }
      }
    }

    const conflictTaskIds = new Set<string>()
    for (const [taskId, keys] of conflictKeysByTaskId) {
      if (keys.some((key) => (conflictCounter.get(key) ?? 0) > 1)) {
        conflictTaskIds.add(taskId)
      }
    }
    return conflictTaskIds
  }, [projectTimelineGroups])

  const timelineGroupsByMode = useMemo(() => {
    const today = todayUtcDate()

    return projectTimelineGroups
      .map((group) => {
        const byTaskTone = new Map<string, 'gray' | 'red' | 'blue' | 'green'>()
        for (const item of group.tasks) {
          byTaskTone.set(item.task.id, toStatusTone(item.task.status))
        }

        let tasks = [...group.tasks].filter((item) => {
          const tone = toStatusTone(item.task.status)
          const allowCompletedByFilter = summaryFilter === 'done'
          if (!showCompletedTasks && !allowCompletedByFilter && tone === 'green') return false
          if (timelineMode !== 'work') return true
          if (!effectiveWorkerAssignee) return true
          return item.task.assignee.includes(effectiveWorkerAssignee)
        })

        tasks.sort((a, b) => {
          const toneA = toStatusTone(a.task.status)
          const toneB = toStatusTone(b.task.status)
          const riskA = riskBandForTask(a.task, toneA, today)
          const riskB = riskBandForTask(b.task, toneB, today)
          const blockedA = a.predecessorTaskId ? byTaskTone.get(a.predecessorTaskId) !== 'green' : false
          const blockedB = b.predecessorTaskId ? byTaskTone.get(b.predecessorTaskId) !== 'green' : false

          if (timelineMode === 'manage') {
            if (blockedA !== blockedB) return blockedA ? -1 : 1
            if (riskOrder(riskA) !== riskOrder(riskB)) return riskOrder(riskA) - riskOrder(riskB)
            return sortTaskByDue(a.task, b.task)
          }

          if (timelineMode === 'work') {
            if (riskOrder(riskA) !== riskOrder(riskB)) return riskOrder(riskA) - riskOrder(riskB)
            return sortTaskByDue(a.task, b.task)
          }

          if (riskOrder(riskA) !== riskOrder(riskB)) return riskOrder(riskA) - riskOrder(riskB)
          return sortTaskByDue(a.task, b.task)
        })

        if (timelineMode === 'report' && summaryFilter === 'all') {
          const reportFocused = tasks.filter((item) => {
            const tone = toStatusTone(item.task.status)
            const risk = riskBandForTask(item.task, tone, today)
            if (showCompletedTasks && risk === 'done') return true
            return risk === 'delayed' || risk === 'urgent'
          })
          tasks = reportFocused.slice(0, 6)
        }

        return {
          project: group.project,
          tasks,
        }
      })
      .filter((group) => {
        if (timelineMode === 'work') return group.tasks.length > 0
        return true
      })
  }, [effectiveWorkerAssignee, projectTimelineGroups, showCompletedTasks, summaryFilter, timelineMode, toStatusTone])

  const timelineGroupsByType = useMemo(() => {
    const byType = new Map<string, typeof timelineGroupsByMode>()
    for (const group of timelineGroupsByMode) {
      const projectType = normalizeProjectType(group.project.projectType)
      const current = byType.get(projectType)
      if (current) current.push(group)
      else byType.set(projectType, [group])
    }

    return Array.from(byType.entries())
      .sort(([a], [b]) => compareProjectType(a, b))
      .map(([projectType, groups]) => ({ projectType, groups }))
  }, [timelineGroupsByMode])

  const allTimelineModels = useMemo(() => {
    const map = new Map<string, ProjectTimelineModel>()
    for (const group of projectTimelineGroups) {
      map.set(group.project.id, buildProjectTimelineModel(group, toStatusTone))
    }
    return map
  }, [projectTimelineGroups, toStatusTone])

  const timelineModels = useMemo(() => {
    const map = new Map<string, ProjectTimelineModel>()
    for (const group of timelineGroupsByMode) {
      map.set(group.project.id, buildProjectTimelineModel(group, toStatusTone))
    }
    return map
  }, [timelineGroupsByMode, toStatusTone])

  const totalTimelineTasks = useMemo(
    () => timelineGroupsByMode.reduce((sum, group) => sum + group.tasks.length, 0),
    [timelineGroupsByMode],
  )

  const timelineSummary = useMemo(() => {
    const today = todayUtcDate()
    const allRows = Array.from(allTimelineModels.values()).flatMap((model) => model.rows)
    const activeRows = allRows.filter((row) => !isInactiveStatus(row.item.task.status))
    const delayedCount = activeRows.filter((row) => row.risk === 'delayed').length
    const urgentCount = activeRows.filter((row) => row.risk === 'urgent').length
    const progressCount = activeRows.filter((row) => row.tone === 'blue' || row.tone === 'red').length
    const doneCount = allRows.filter((row) => row.tone === 'green').length
    const blockedCount = activeRows.filter((row) => row.blockedByPredecessor).length
    const todayDueCount = activeRows.filter((row) => isTaskDueToday(row.item.task, today)).length
    const undatedCount = activeRows.filter((row) => !parseIsoDate(row.item.task.dueDate)).length
    const totalCount = allRows.length
    const doneRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

    const assigneeStats = new Map<string, { name: string; active: number; delayed: number; urgent: number }>()
    const conflictCounter = new Map<string, number>()
    for (const group of projectTimelineGroups) {
      for (const item of group.tasks) {
        const tone = toStatusTone(item.task.status)
        if (isInactiveStatus(item.task.status)) continue
        const risk = riskBandForTask(item.task, tone, today)
        const names = item.task.assignee.length > 0 ? item.task.assignee : ['담당 미지정']
        for (const name of names) {
          const current = assigneeStats.get(name) ?? { name, active: 0, delayed: 0, urgent: 0 }
          current.active += 1
          if (risk === 'delayed') current.delayed += 1
          if (risk === 'urgent') current.urgent += 1
          assigneeStats.set(name, current)
          if (item.task.dueDate) {
            const conflictKey = `${name}::${item.task.dueDate}`
            conflictCounter.set(conflictKey, (conflictCounter.get(conflictKey) ?? 0) + 1)
          }
        }
      }
    }

    const overloadedAssignees = Array.from(assigneeStats.values())
      .filter((entry) => entry.active >= 6 || entry.delayed >= 2 || entry.urgent >= 4)
      .sort((a, b) => {
        if (a.delayed !== b.delayed) return b.delayed - a.delayed
        if (a.urgent !== b.urgent) return b.urgent - a.urgent
        return b.active - a.active
      })

    const conflictCount = Array.from(conflictCounter.values()).filter((count) => count > 1).length

    const reportMilestones = projectTimelineGroups
      .flatMap((group) =>
        group.tasks.map((item) => {
          const tone = toStatusTone(item.task.status)
          return {
            item,
            projectName: group.project.name,
            risk: riskBandForTask(item.task, tone, today),
          }
        }),
      )
      .filter((entry) => entry.risk !== 'done')
      .sort((a, b) => {
        if (riskOrder(a.risk) !== riskOrder(b.risk)) return riskOrder(a.risk) - riskOrder(b.risk)
        return sortTaskByDue(a.item.task, b.item.task)
      })
      .slice(0, 8)

    return {
      delayedCount,
      urgentCount,
      progressCount,
      doneCount,
      doneRate,
      blockedCount,
      todayDueCount,
      undatedCount,
      overloadedAssignees,
      conflictCount,
      reportMilestones,
    }
  }, [allTimelineModels, projectTimelineGroups, toStatusTone])

  const workSummary = useMemo(() => {
    if (timelineMode !== 'work') return null
    const today = todayUtcDate()
    const visibleRows = Array.from(timelineModels.values()).flatMap((model) => model.rows)
    const activeRows = visibleRows.filter((row) => !isInactiveStatus(row.item.task.status))
    const overdue = activeRows.filter((row) => row.risk === 'delayed').length
    const todayDue = activeRows.filter((row) => isTaskDueToday(row.item.task, today)).length
    const weekDue = activeRows.filter((row) => isTaskDueWithinWeek(row.item.task, today)).length
    const undated = activeRows.filter((row) => !parseIsoDate(row.item.task.dueDate)).length
    return { overdue, todayDue, weekDue, undated, total: activeRows.length }
  }, [timelineMode, timelineModels])

  const isSummaryFiltered = summaryFilter !== 'all'
  const summaryFilterToday = todayUtcDate()
  const summaryReferenceDate = toIsoDate(summaryFilterToday)
  const summaryReferenceMonthDay = formatMonthDotDay(summaryFilterToday)
  const summaryUndatedCount = timelineMode === 'work' && workSummary ? workSummary.undated : timelineSummary.undatedCount
  const matchesSummaryFilter = (row: TimelineRow): boolean => {
    if (summaryFilter === 'all') return true
    if (summaryFilter === 'done') return row.tone === 'green'
    if (isInactiveStatus(row.item.task.status)) return false
    if (summaryFilter === 'delayed') return row.risk === 'delayed'
    if (summaryFilter === 'urgent') return row.risk === 'urgent'
    if (summaryFilter === 'todayDue') return isTaskDueToday(row.item.task, summaryFilterToday)
    if (summaryFilter === 'weekDue') return isTaskDueWithinWeek(row.item.task, summaryFilterToday)
    if (summaryFilter === 'progress') return row.tone === 'blue' || row.tone === 'red'
    if (summaryFilter === 'active') return true
    if (summaryFilter === 'conflict') return manageConflictTaskIds.has(row.item.task.id)
    if (summaryFilter === 'blocked') return row.blockedByPredecessor === true
    return true
  }

  const onSummaryCardClick = (nextFilter: SummaryFilter) => {
    setSummaryFilter((prev) => (prev === nextFilter ? 'all' : nextFilter))
  }

  const hasVisibleTimelineGroup =
    !isSummaryFiltered ||
    timelineGroupsByMode.some((group) => {
      const model = timelineModels.get(group.project.id)
      if (!model) return false
      return model.rows.some((row) => matchesSummaryFilter(row))
    })

  return (
    <section className="projectSection">
      <header className="projectHeader">
        <h2>프로젝트 타임라인</h2>
        <span>{sortedProjectDbOptions.length}건</span>
      </header>

      <section className="filters compact">
        <label>
          정렬
          <select value={projectSort} onChange={(event) => onProjectSortChange(event.target.value as ProjectSort)}>
            <option value="name_asc">이름 오름차순</option>
            <option value="name_desc">이름 내림차순</option>
            <option value="date_asc">행사일 빠른순</option>
            <option value="date_desc">행사일 늦은순</option>
          </select>
        </label>
      </section>
      <section className="timelineModeBar">
        <strong>모드</strong>
        <div className="timelineModeButtons">
          <button type="button" className={timelineMode === 'report' ? 'viewTab active' : 'viewTab'} onClick={() => setTimelineMode('report')}>
            보고용
          </button>
          <button type="button" className={timelineMode === 'manage' ? 'viewTab active' : 'viewTab'} onClick={() => setTimelineMode('manage')}>
            운영용
          </button>
          <button type="button" className={timelineMode === 'work' ? 'viewTab active' : 'viewTab'} onClick={() => setTimelineMode('work')}>
            업무용
          </button>
        </div>
        <button type="button" className="secondary timelineDoneToggle" onClick={() => setShowCompletedTasks((prev) => !prev)}>
          {showCompletedTasks ? '완료업무 접기' : '완료업무 펼치기'}
        </button>
        {timelineMode === 'work' ? (
          <label className="timelineModeAssignee">
            담당자
            <select value={effectiveWorkerAssignee} onChange={(event) => setWorkerAssignee(event.target.value)}>
              <option value="">전체</option>
              {timelineAssigneeOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {loadingProjects ? (
        <ProjectsSkeleton />
      ) : (
        <section className="projectTimelineBoard">
          <header className="projectTimelineBoardHeader">
            <div className="projectTimelineBoardTitle">
              <h3>종속 업무 타임라인</h3>
              <span>
                프로젝트 {timelineGroupsByMode.length}건 · 종속 업무 {totalTimelineTasks}건
              </span>
            </div>
            <p className="muted small">
              전체 범위: {formatDateLabel(toIsoDate(projectTimelineRange.start))} ~ {formatDateLabel(toIsoDate(projectTimelineRange.end))}
            </p>
          </header>
          {timelineMode === 'report' ? (
            <section className="timelineSummary">
              <button
                type="button"
                className={`timelineSummaryCard danger ${summaryFilter === 'delayed' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('delayed')}
                aria-pressed={summaryFilter === 'delayed'}
              >
                <span>지연</span>
                <strong>{timelineSummary.delayedCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard warning ${summaryFilter === 'urgent' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('urgent')}
                aria-pressed={summaryFilter === 'urgent'}
              >
                <span>임박(7일)</span>
                <strong>{timelineSummary.urgentCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard info ${summaryFilter === 'progress' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('progress')}
                aria-pressed={summaryFilter === 'progress'}
              >
                <span>진행</span>
                <strong>{timelineSummary.progressCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard ok ${summaryFilter === 'done' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('done')}
                aria-pressed={summaryFilter === 'done'}
              >
                <span>완료율</span>
                <strong>{timelineSummary.doneRate}%</strong>
              </button>
            </section>
          ) : null}
          {timelineMode === 'report' ? (
            <section className="timelineMilestoneList">
              <h4>주요 마일스톤</h4>
              <ul>
                {timelineSummary.reportMilestones.map((entry) => (
                  <li key={entry.item.task.id}>
                    <button type="button" className="taskLink" onClick={() => onTaskOpen(entry.item.task.id)}>
                      [{entry.projectName}] {entry.item.task.taskName}
                    </button>
                    <span className={`timelineSummaryTag risk-${entry.risk}`}>{entry.risk === 'delayed' ? '지연' : entry.risk === 'urgent' ? '임박' : '일반'}</span>
                    <span className="timelineMilestoneDue">{entry.item.task.dueDate ? formatDateLabel(entry.item.task.dueDate) : '마감일 미정'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {timelineMode === 'manage' ? (
            <section className="timelineSummary">
              <button
                type="button"
                className={`timelineSummaryCard danger ${summaryFilter === 'delayed' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('delayed')}
                aria-pressed={summaryFilter === 'delayed'}
              >
                <span>지연</span>
                <strong>{timelineSummary.delayedCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard warning ${summaryFilter === 'todayDue' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('todayDue')}
                aria-pressed={summaryFilter === 'todayDue'}
              >
                <span>오늘 마감</span>
                <strong>{timelineSummary.todayDueCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard info ${summaryFilter === 'conflict' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('conflict')}
                aria-pressed={summaryFilter === 'conflict'}
              >
                <span>일정 충돌</span>
                <strong>{timelineSummary.conflictCount}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard ${summaryFilter === 'blocked' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('blocked')}
                aria-pressed={summaryFilter === 'blocked'}
              >
                <span>선행대기</span>
                <strong>{timelineSummary.blockedCount}</strong>
              </button>
            </section>
          ) : null}
          <p className="muted small timelineSummaryGuide">
            집계 기준일: {summaryReferenceDate} · 마감일 미정 {summaryUndatedCount}건 · 요약 카드를 누르면 해당 항목만 표시됩니다.
          </p>
          {timelineMode === 'manage' ? (
            <section className="timelineMilestoneList">
              <h4>담당자 과부하 TOP</h4>
              <p className="muted small">기준: 활성 6건 이상 또는 지연 2건 이상 또는 임박 4건 이상. 완료/보류/보관은 제외합니다.</p>
              {timelineSummary.overloadedAssignees.length === 0 ? (
                <p className="muted small">현재 기준에 해당하는 과부하 담당자가 없습니다.</p>
              ) : null}
              <ul>
                {timelineSummary.overloadedAssignees.map((entry) => (
                  <li key={entry.name}>
                    <strong>{entry.name}</strong>
                    <span>활성 {entry.active}</span>
                    <span>지연 {entry.delayed}</span>
                    <span>임박 {entry.urgent}</span>
                    <span>{overloadReason(entry)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {timelineMode === 'work' && workSummary ? (
            <section className="timelineSummary">
              <button
                type="button"
                className={`timelineSummaryCard danger ${summaryFilter === 'delayed' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('delayed')}
                aria-pressed={summaryFilter === 'delayed'}
              >
                <span>지연</span>
                <strong>{workSummary.overdue}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard warning ${summaryFilter === 'todayDue' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('todayDue')}
                aria-pressed={summaryFilter === 'todayDue'}
              >
                <span>오늘 마감</span>
                <strong>{workSummary.todayDue}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard info ${summaryFilter === 'weekDue' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('weekDue')}
                aria-pressed={summaryFilter === 'weekDue'}
              >
                <span>이번 주 마감</span>
                <strong>{workSummary.weekDue}</strong>
              </button>
              <button
                type="button"
                className={`timelineSummaryCard ${summaryFilter === 'active' ? 'is-active' : ''}`.trim()}
                onClick={() => onSummaryCardClick('active')}
                aria-pressed={summaryFilter === 'active'}
              >
                <span>내 활성 업무</span>
                <strong>{workSummary.total}</strong>
              </button>
            </section>
          ) : null}

          {timelineGroupsByMode.length === 0 || !hasVisibleTimelineGroup ? (
            <EmptyState message={isSummaryFiltered ? '해당 요약 조건의 업무가 없습니다.' : '프로젝트 데이터가 없습니다.'} />
          ) : (
            <div className="projectTimelineTypeSections">
              {timelineGroupsByType.map((section) => {
                const visibleGroups = section.groups.filter((group) => {
                  const model = timelineModels.get(group.project.id)
                  if (!model) return false
                  if (!isSummaryFiltered) return true
                  return model.rows.some((row) => matchesSummaryFilter(row))
                })
                if (visibleGroups.length === 0) return null

                return (
                  <section key={section.projectType} className="projectTimelineTypeSection">
                    <header className="projectTimelineTypeHeader">
                      <h4>{section.projectType}</h4>
                      <span>프로젝트 {visibleGroups.length}건</span>
                    </header>
                    <div className="projectTimelineGroupList">
                      {visibleGroups.map((group) => {
                        const model = timelineModels.get(group.project.id)
                        if (!model) return null
                        const visibleRows = isSummaryFiltered ? model.rows.filter((row) => matchesSummaryFilter(row)) : model.rows
                        if (visibleRows.length === 0) return null
                        const isOpen = isSummaryFiltered || openProjectTimelineGroups[group.project.id] !== false
                        const scheduledCount = visibleRows.filter((row) => row.tone === 'gray').length
                        const progressCount = visibleRows.filter((row) => row.tone === 'blue' || row.tone === 'red').length
                        const doneCount = visibleRows.filter((row) => row.tone === 'green').length
                        const undatedCount = visibleRows.filter((row) => !parseIsoDate(row.item.task.dueDate)).length
                        const projectTypeLabel = normalizeProjectType(group.project.projectType)
                        const eventMarkerDate = formatMonthDotDay(parseIsoDate(group.project.eventDate))
                        const projectIconEmojiUrl = emojiToTwemojiUrl(group.project.iconEmoji)
                        const projectIconLabel = formatProjectIconLabel(group.project.iconEmoji)

                        return (
                          <article key={group.project.id} className={isOpen ? 'projectTimelineGroup' : 'projectTimelineGroup is-collapsed'}>
                            <div className="projectTimelineGroupRow projectTimelineProjectRow">
                              <div className="projectTimelineIdentity">
                                <span className="projectTitle">
                                  {group.project.coverUrl ? <img className="projectCoverImage" src={group.project.coverUrl} alt="" /> : null}
                                  {group.project.iconUrl ? <img className="projectIconImage" src={group.project.iconUrl} alt="" /> : null}
                                  {group.project.iconEmoji ? (
                                    <span className="projectIconEmoji" title={projectIconLabel || group.project.iconEmoji}>
                                      {projectIconEmojiUrl ? (
                                        <img className="projectIconEmojiImage" src={projectIconEmojiUrl} alt={group.project.iconEmoji} />
                                      ) : (
                                        group.project.iconEmoji
                                      )}
                                    </span>
                                  ) : null}
                                  <span>{group.project.name}</span>
                                </span>
                                <div className="projectTimelineProjectMeta">
                                  <div className="projectTimelineProjectStats">
                                    <span>구분 {projectTypeLabel}</span>
                                    <span>{group.project.eventDate ? `행사일 ${formatDateLabel(group.project.eventDate)}` : '행사일 미정'}</span>
                                    <span>예정 {scheduledCount}</span>
                                    <span>진행 {progressCount}</span>
                                    <span>완료 {doneCount}</span>
                                    <span>마감 미정 {undatedCount}</span>
                                    <span>종속 {visibleRows.length}건</span>
                                  </div>
                                  <div className="projectTimelineProjectActions">
                                    {toNotionUrlById(group.project.id) ? (
                                      <a className="linkButton secondary mini" href={toNotionUrlById(group.project.id) ?? undefined} target="_blank" rel="noreferrer">
                                        Notion
                                      </a>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="timelineToggleButton"
                                      aria-expanded={isOpen}
                                      disabled={isSummaryFiltered}
                                      onClick={() => onToggleProjectTimelineGroup(group.project.id)}
                                    >
                                      {isSummaryFiltered ? '필터 적용 중' : isOpen ? '종속업무 접기' : '종속업무 펼치기'}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="projectTimelineTrack projectTimelineProjectTrack">
                                <div className="projectTimelineTrackGrid" aria-hidden="true" />
                                {model.todayMarkerStyle ? <span className="projectTimelineTodayBand" style={model.todayMarkerStyle} aria-hidden="true" /> : null}
                                {model.eventMarkerStyle ? <span className="projectTimelineEventBand" style={model.eventMarkerStyle} aria-hidden="true" /> : null}
                                {visibleRows.slice(0, 14).map((row) => (
                                  <span key={`${row.item.task.id}-mini`} className={`projectTimelineMiniBar tone-${row.tone}`} style={row.barStyle} />
                                ))}
                                {model.todayMarkerStyle ? (
                                  <span className="projectTimelineTodayLabel" style={model.todayMarkerStyle}>
                                    오늘
                                  </span>
                                ) : null}
                                {model.eventMarkerStyle ? (
                                  <span className="projectTimelineEventLabel" style={model.eventMarkerStyle}>
                                    진행일
                                  </span>
                                ) : null}
                                {model.todayMarkerStyle ? (
                                  <span className="projectTimelineMarkerDate projectTimelineTodayDate" style={model.todayMarkerStyle}>
                                    {summaryReferenceMonthDay}
                                  </span>
                                ) : null}
                                {model.eventMarkerStyle && eventMarkerDate ? (
                                  <span className="projectTimelineMarkerDate projectTimelineEventDate" style={model.eventMarkerStyle}>
                                    {eventMarkerDate}
                                  </span>
                                ) : null}
                                {model.todayMarkerStyle ? (
                                  <span className="projectTimelineTodayMarker" style={model.todayMarkerStyle} title={`오늘 ${summaryReferenceDate}`}>
                                    <span className="projectTimelineTodayDot" />
                                  </span>
                                ) : null}
                                {model.eventMarkerStyle ? (
                                  <span
                                    className="projectTimelineEventMarker"
                                    style={model.eventMarkerStyle}
                                    title={group.project.eventDate ? formatDateLabel(group.project.eventDate) : ''}
                                  >
                                    <span className="projectTimelineEventDot" />
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {isOpen ? (
                              <div className="projectTimelinePanel">
                                <div className="projectTimelineAxisGrid">
                                  <div className="projectTimelineAxisLabel">기간축</div>
                                  <div className="projectTimelineAxisTrack">
                                    <div className="projectTimelineAxisMonths">
                                      {model.monthSegments.map((segment) => (
                                        <span key={segment.key} style={{ flexBasis: `${segment.widthPct}%` }}>
                                          {segment.label}
                                        </span>
                                      ))}
                                    </div>
                                    <div className={`projectTimelineAxisUnits mode-${model.axisMode}`}>
                                      {model.unitSegments.map((segment) => (
                                        <span key={segment.key} style={{ flexBasis: `${segment.widthPct}%` }}>
                                          {segment.label}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {visibleRows.length === 0 ? (
                                  <div className="projectTimelineGroupRow projectTimelineTaskRow is-empty">
                                    <div className="projectTimelineTask">
                                      <span className="projectTimelineMeta">해당 필터의 종속 업무가 없습니다.</span>
                                    </div>
                                    <div className="projectTimelineTrack">
                                      <div className="projectTimelineTrackGrid" aria-hidden="true" />
                                      {model.todayMarkerStyle ? (
                                        <>
                                          <span className="projectTimelineTodayBand event-inline" style={model.todayMarkerStyle} aria-hidden="true" />
                                          <span className="projectTimelineTodayMarker event-inline" style={model.todayMarkerStyle} aria-hidden="true" />
                                        </>
                                      ) : null}
                                      {model.eventMarkerStyle ? (
                                        <>
                                          <span className="projectTimelineEventBand event-inline" style={model.eventMarkerStyle} aria-hidden="true" />
                                          <span className="projectTimelineEventMarker event-inline" style={model.eventMarkerStyle} aria-hidden="true" />
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  visibleRows.map((row) => {
                                    const task = row.item.task
                                    const riskClass =
                                      row.risk === 'delayed' ? 'risk-delayed' : row.risk === 'urgent' ? 'risk-urgent' : row.risk === 'done' ? 'risk-done' : ''
                                    const focusClass = timelineMode === 'work' && (row.risk === 'delayed' || row.risk === 'urgent') ? 'is-focus' : ''
                                    const startDateLabel = task.startDate ? formatDateLabel(task.startDate) : '-'
                                    const dueDateLabel = task.dueDate ? formatDateLabel(task.dueDate) : '-'
                                    const actualEndDateLabel = task.actualEndDate ? formatDateLabel(task.actualEndDate) : '-'

                                    return (
                                      <div
                                        key={task.id}
                                        id={`timeline-task-${task.id}`}
                                        className={`projectTimelineGroupRow projectTimelineTaskRow ${riskClass} ${focusClass}`.trim()}
                                      >
                                        <div className="projectTimelineTask">
                                          <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                                            {task.taskName}
                                          </button>
                                          <div className="projectTimelineTaskTags">
                                            <span className={`timelineStatusBadge tone-${row.tone}`}>{task.status || '상태 미정'}</span>
                                            {renderAssigneeBadges(task.assignee)}
                                          </div>
                                          <div className="projectTimelineMetaList">
                                            <span className="projectTimelineMetaItem">
                                              기간 {startDateLabel} ~ {dueDateLabel}
                                            </span>
                                            <span className="projectTimelineMetaItem">실제 종료 {actualEndDateLabel}</span>
                                            <span className="projectTimelineMetaItem">담당 {joinOrDash(task.assignee)}</span>
                                          </div>
                                          {row.predecessor ? (
                                            <a className="timelineDependencyLink" href={`#timeline-task-${row.predecessor.id}`}>
                                              ↖ 선행작업: {row.predecessor.label}
                                            </a>
                                          ) : null}
                                        </div>

                                        <div className="projectTimelineTrack">
                                          <div className="projectTimelineTrackGrid" aria-hidden="true" />
                                          {model.todayMarkerStyle ? (
                                            <>
                                              <span className="projectTimelineTodayBand event-inline" style={model.todayMarkerStyle} aria-hidden="true" />
                                              <span className="projectTimelineTodayMarker event-inline" style={model.todayMarkerStyle} aria-hidden="true" />
                                            </>
                                          ) : null}
                                          {model.eventMarkerStyle ? (
                                            <>
                                              <span className="projectTimelineEventBand event-inline" style={model.eventMarkerStyle} aria-hidden="true" />
                                              <span className="projectTimelineEventMarker event-inline" style={model.eventMarkerStyle} aria-hidden="true" />
                                            </>
                                          ) : null}
                                          {row.dependencyGuideStyle ? (
                                            <span
                                              className={`projectTimelineDependencyGuide dir-${row.dependencyDirection ?? 'right'}`}
                                              style={row.dependencyGuideStyle}
                                              aria-hidden="true"
                                            />
                                          ) : null}
                                          {row.plannedBarStyle ? <div className="projectTimelineBar planned" style={row.plannedBarStyle} /> : null}
                                          <div className={`projectTimelineBar tone-${row.tone} ${row.hasActualCompletion ? 'actual' : ''}`.trim()} style={row.barStyle} />
                                        </div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            ) : null}
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </section>
      )}
    </section>
  )
}
