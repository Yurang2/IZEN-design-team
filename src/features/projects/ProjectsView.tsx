import { useMemo, type CSSProperties } from 'react'
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
  barStyle: CSSProperties
  leftPct: number
  widthPct: number
  predecessor?: {
    id: string
    label: string
  }
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

function buildTimelineRange(group: ProjectTimelineGroup): TimelineRange {
  const points: Date[] = []
  const eventDate = parseIsoDate(group.project.eventDate)
  if (eventDate) points.push(eventDate)

  for (const item of group.tasks) {
    const startDate = parseIsoDate(item.task.startDate)
    const dueDate = parseIsoDate(item.task.dueDate)
    if (startDate) points.push(startDate)
    if (dueDate) points.push(dueDate)
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

function buildProjectTimelineModel(
  group: ProjectTimelineGroup,
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green',
): ProjectTimelineModel {
  const range = buildTimelineRange(group)
  const axisMode: 'day' | 'week' = range.totalDays > 42 ? 'week' : 'day'
  const monthSegments = buildMonthSegments(range.start, range.end, range.totalDays)
  const unitSegments =
    axisMode === 'week'
      ? buildWeekSegments(range.start, range.end, range.totalDays)
      : buildDaySegments(range.start, range.end, range.totalDays)

  const rows: TimelineRow[] = group.tasks.map((item) => {
    const taskStart = parseIsoDate(item.task.startDate) ?? parseIsoDate(item.task.dueDate) ?? range.start
    const taskEnd = parseIsoDate(item.task.dueDate) ?? parseIsoDate(item.task.startDate) ?? taskStart
    const safeStart = taskStart <= taskEnd ? taskStart : taskEnd
    const safeEnd = taskEnd >= taskStart ? taskEnd : taskStart

    const offset = diffUtcDays(range.start, safeStart)
    const spanDays = Math.max(1, diffUtcDays(safeStart, safeEnd) + 1)
    const leftPct = Math.max(0, Math.min(100, (offset / range.totalDays) * 100))
    const widthPct = Math.max(2, Math.min(100 - leftPct, (spanDays / range.totalDays) * 100))

    return {
      item,
      tone: toStatusTone(item.task.status),
      leftPct,
      widthPct,
      barStyle: {
        left: `${leftPct}%`,
        width: `${widthPct}%`,
      },
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
    row.dependencyDirection = predecessorEnd <= currentStart ? 'right' : 'left'
    row.dependencyGuideStyle = {
      left: `${guideLeft}%`,
      width: `${guideWidth}%`,
    }
  }

  const eventDate = parseIsoDate(group.project.eventDate)
  const eventMarkerStyle =
    eventDate !== null
      ? {
          left: `${Math.max(0, Math.min(100, (diffUtcDays(range.start, eventDate) / range.totalDays) * 100))}%`,
        }
      : null

  return {
    range,
    axisMode,
    monthSegments,
    unitSegments,
    rows,
    eventMarkerStyle,
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
  const totalTimelineTasks = useMemo(
    () => projectTimelineGroups.reduce((sum, group) => sum + group.tasks.length, 0),
    [projectTimelineGroups],
  )

  const timelineModels = useMemo(() => {
    const map = new Map<string, ProjectTimelineModel>()
    for (const group of projectTimelineGroups) {
      map.set(group.project.id, buildProjectTimelineModel(group, toStatusTone))
    }
    return map
  }, [projectTimelineGroups, toStatusTone])

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

      {loadingProjects ? (
        <ProjectsSkeleton />
      ) : (
        <section className="projectTimelineBoard">
          <header className="projectTimelineBoardHeader">
            <div className="projectTimelineBoardTitle">
              <h3>종속 업무 타임라인</h3>
              <span>
                프로젝트 {projectTimelineGroups.length}건 · 종속 업무 {totalTimelineTasks}건
              </span>
            </div>
            <p className="muted small">
              전체 범위: {formatDateLabel(toIsoDate(projectTimelineRange.start))} ~ {formatDateLabel(toIsoDate(projectTimelineRange.end))}
            </p>
          </header>

          {projectTimelineGroups.length === 0 ? (
            <EmptyState message="프로젝트 데이터가 없습니다." />
          ) : (
            <div className="projectTimelineGroupList">
              {projectTimelineGroups.map((group) => {
                const model = timelineModels.get(group.project.id)
                if (!model) return null
                const isOpen = openProjectTimelineGroups[group.project.id] !== false
                const scheduledCount = model.rows.filter((row) => row.tone === 'gray').length
                const progressCount = model.rows.filter((row) => row.tone === 'blue' || row.tone === 'red').length
                const doneCount = model.rows.filter((row) => row.tone === 'green').length

                return (
                  <article key={group.project.id} className={isOpen ? 'projectTimelineGroup' : 'projectTimelineGroup is-collapsed'}>
                    <div className="projectTimelineGroupRow projectTimelineProjectRow">
                      <div className="projectTimelineIdentity">
                        <span className="projectTitle">
                          {group.project.coverUrl ? <img className="projectCoverImage" src={group.project.coverUrl} alt="" /> : null}
                          {group.project.iconUrl ? <img className="projectIconImage" src={group.project.iconUrl} alt="" /> : null}
                          {group.project.iconEmoji ? <span className="projectIconEmoji">{group.project.iconEmoji}</span> : null}
                          <span>{group.project.name}</span>
                        </span>
                        <div className="projectTimelineProjectMeta">
                          <span>{group.project.eventDate ? `행사일 ${group.project.eventDate}` : '행사일 미정'}</span>
                          <span>예정 {scheduledCount}</span>
                          <span>진행 {progressCount}</span>
                          <span>완료 {doneCount}</span>
                          <span>종속 {group.tasks.length}건</span>
                          {toNotionUrlById(group.project.id) ? (
                            <a className="linkButton secondary mini" href={toNotionUrlById(group.project.id) ?? undefined} target="_blank" rel="noreferrer">
                              Notion
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="timelineToggleButton"
                            aria-expanded={isOpen}
                            onClick={() => onToggleProjectTimelineGroup(group.project.id)}
                          >
                            {isOpen ? '종속업무 접기' : '종속업무 펼치기'}
                          </button>
                        </div>
                      </div>

                      <div className="projectTimelineTrack projectTimelineProjectTrack">
                        <div className="projectTimelineTrackGrid" aria-hidden="true" />
                        {model.rows.slice(0, 14).map((row) => (
                          <span key={`${row.item.task.id}-mini`} className={`projectTimelineMiniBar tone-${row.tone}`} style={row.barStyle} />
                        ))}
                        {model.eventMarkerStyle ? (
                          <span className="projectTimelineEventMarker" style={model.eventMarkerStyle} title={group.project.eventDate ?? ''}>
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

                        {model.rows.length === 0 ? (
                          <div className="projectTimelineGroupRow projectTimelineTaskRow is-empty">
                            <div className="projectTimelineTask">
                              <span className="projectTimelineMeta">종속 업무가 없습니다.</span>
                            </div>
                            <div className="projectTimelineTrack">
                              <div className="projectTimelineTrackGrid" aria-hidden="true" />
                            </div>
                          </div>
                        ) : (
                          model.rows.map((row) => {
                            const task = row.item.task
                            return (
                              <div key={task.id} id={`timeline-task-${task.id}`} className="projectTimelineGroupRow projectTimelineTaskRow">
                                <div className="projectTimelineTask">
                                  <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                                    {task.taskName}
                                  </button>
                                  <div className="projectTimelineTaskTags">
                                    <span className={`timelineStatusBadge tone-${row.tone}`}>{task.status || '상태 미정'}</span>
                                    {renderAssigneeBadges(task.assignee)}
                                  </div>
                                  <span className="projectTimelineMeta">
                                    기간 {task.startDate || '-'} ~ {task.dueDate || '-'} · 담당 {joinOrDash(task.assignee)}
                                  </span>
                                  {row.predecessor ? (
                                    <a className="timelineDependencyLink" href={`#timeline-task-${row.predecessor.id}`}>
                                      ↖ 선행작업: {row.predecessor.label}
                                    </a>
                                  ) : null}
                                </div>

                                <div className="projectTimelineTrack">
                                  <div className="projectTimelineTrackGrid" aria-hidden="true" />
                                  {row.dependencyGuideStyle ? (
                                    <span
                                      className={`projectTimelineDependencyGuide dir-${row.dependencyDirection ?? 'right'}`}
                                      style={row.dependencyGuideStyle}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <div className={`projectTimelineBar tone-${row.tone}`} style={row.barStyle} />
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
          )}
        </section>
      )}
    </section>
  )
}
