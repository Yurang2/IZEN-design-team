import { useMemo } from 'react'
import type { ProjectRecord, ProjectSort, ProjectTimelineGroup } from '../../shared/types'
import { EmptyState, Skeleton } from '../../shared/ui'

type AxisSegment = {
  key: string
  label: string
  widthPct: number
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
  loadingProjects: boolean
  onProjectSortChange: (nextSort: ProjectSort) => void
  onTaskOpen: (taskId: string) => void
  formatDateLabel: (value: string) => string
  toIsoDate: (value: Date) => string
  toNotionUrlById: (id: string | undefined) => string | null
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
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

function ProjectsSkeleton() {
  return (
    <section className="projectTimelineBoard" aria-hidden="true">
      <header className="projectTimelineBoardHeader">
        <div className="projectTimelineBoardTitle">
          <h3>프로젝트 타임라인</h3>
          <Skeleton width="220px" height="14px" />
        </div>
        <Skeleton width="320px" height="14px" />
      </header>

      <div className="projectTimelineAxisGrid">
        <div className="projectTimelineAxisLabel">
          <Skeleton width="48px" height="14px" />
        </div>
        <div className="projectTimelineAxisTrack">
          <Skeleton width="100%" height="38px" />
        </div>
      </div>

      <div className="projectTimelineGroupList">
        {Array.from({ length: 3 }).map((_, groupIndex) => (
          <article key={`timeline-group-skeleton-${groupIndex}`} className="projectTimelineGroup">
            <div className="projectTimelineGroupRow projectTimelineProjectRow">
              <div className="projectTimelineIdentity">
                <Skeleton width="240px" height="16px" />
                <Skeleton width="180px" height="12px" />
              </div>
              <div className="projectTimelineTrack">
                <Skeleton width="100%" height="18px" />
              </div>
            </div>
            {Array.from({ length: 2 }).map((_, rowIndex) => (
              <div key={`timeline-row-skeleton-${groupIndex}-${rowIndex}`} className="projectTimelineGroupRow projectTimelineTaskRow">
                <div className="projectTimelineTask">
                  <Skeleton width="66%" height="14px" />
                  <Skeleton width="84%" height="12px" />
                </div>
                <div className="projectTimelineTrack">
                  <Skeleton width="100%" height="16px" />
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  )
}

export function ProjectsView({
  sortedProjectDbOptions,
  projectSort,
  projectTimelineGroups,
  projectTimelineRange,
  loadingProjects,
  onProjectSortChange,
  onTaskOpen,
  formatDateLabel,
  toIsoDate,
  toNotionUrlById,
  joinOrDash,
  toStatusTone,
}: ProjectsViewProps) {
  const axisMode: 'day' | 'week' = projectTimelineRange.totalDays > 42 ? 'week' : 'day'
  const monthSegments = useMemo(
    () => buildMonthSegments(projectTimelineRange.start, projectTimelineRange.end, projectTimelineRange.totalDays),
    [projectTimelineRange.end, projectTimelineRange.start, projectTimelineRange.totalDays],
  )
  const unitSegments = useMemo(
    () =>
      axisMode === 'week'
        ? buildWeekSegments(projectTimelineRange.start, projectTimelineRange.end, projectTimelineRange.totalDays)
        : buildDaySegments(projectTimelineRange.start, projectTimelineRange.end, projectTimelineRange.totalDays),
    [axisMode, projectTimelineRange.end, projectTimelineRange.start, projectTimelineRange.totalDays],
  )
  const totalTimelineTasks = useMemo(
    () => projectTimelineGroups.reduce((sum, group) => sum + group.tasks.length, 0),
    [projectTimelineGroups],
  )

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
              <h3>종속 업무 포함 전체 타임라인</h3>
              <span>
                프로젝트 {projectTimelineGroups.length}건 · 종속 업무 {totalTimelineTasks}건
              </span>
            </div>
            <p className="muted small">
              범위: {formatDateLabel(toIsoDate(projectTimelineRange.start))} ~ {formatDateLabel(toIsoDate(projectTimelineRange.end))} · 축 분류:{' '}
              {axisMode === 'week' ? '연/월/n주차' : '연/월/일'}
            </p>
          </header>

          {projectTimelineGroups.length === 0 ? (
            <EmptyState message="프로젝트 데이터가 없습니다." />
          ) : (
            <>
              <div className="projectTimelineAxisGrid">
                <div className="projectTimelineAxisLabel">기간축</div>
                <div className="projectTimelineAxisTrack">
                  <div className="projectTimelineAxisMonths">
                    {monthSegments.map((segment) => (
                      <span key={segment.key} style={{ flexBasis: `${segment.widthPct}%` }}>
                        {segment.label}
                      </span>
                    ))}
                  </div>
                  <div className={`projectTimelineAxisUnits mode-${axisMode}`}>
                    {unitSegments.map((segment) => (
                      <span key={segment.key} style={{ flexBasis: `${segment.widthPct}%` }}>
                        {segment.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="projectTimelineGroupList">
                {projectTimelineGroups.map(({ project, tasks, eventMarkerStyle }) => (
                  <article key={project.id} className="projectTimelineGroup">
                    <div className="projectTimelineGroupRow projectTimelineProjectRow">
                      <div className="projectTimelineIdentity">
                        <span className="projectTitle">
                          {project.coverUrl ? <img className="projectCoverImage" src={project.coverUrl} alt="" /> : null}
                          {project.iconUrl ? <img className="projectIconImage" src={project.iconUrl} alt="" /> : null}
                          {project.iconEmoji ? <span className="projectIconEmoji">{project.iconEmoji}</span> : null}
                          <span>{project.name}</span>
                        </span>
                        <div className="projectTimelineProjectMeta">
                          <span>{project.eventDate ? `행사일 ${project.eventDate}` : '행사일 미정'}</span>
                          <span>종속 업무 {tasks.length}건</span>
                          {toNotionUrlById(project.id) ? (
                            <a className="linkButton secondary mini" href={toNotionUrlById(project.id) ?? undefined} target="_blank" rel="noreferrer">
                              Notion
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="projectTimelineTrack projectTimelineProjectTrack">
                        <div className="projectTimelineTrackGrid" aria-hidden="true" />
                        {eventMarkerStyle ? (
                          <span className="projectTimelineEventMarker" style={eventMarkerStyle} title={project.eventDate ?? ''}>
                            <span className="projectTimelineEventDot" />
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {tasks.length === 0 ? (
                      <div className="projectTimelineGroupRow projectTimelineTaskRow is-empty">
                        <div className="projectTimelineTask">
                          <span className="projectTimelineMeta">종속 업무가 없습니다.</span>
                        </div>
                        <div className="projectTimelineTrack">
                          <div className="projectTimelineTrackGrid" aria-hidden="true" />
                        </div>
                      </div>
                    ) : (
                      tasks.map(({ task, barStyle }) => (
                        <div key={task.id} className="projectTimelineGroupRow projectTimelineTaskRow">
                          <div className="projectTimelineTask">
                            <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                              {task.taskName}
                            </button>
                            <span className="projectTimelineMeta">
                              담당: {joinOrDash(task.assignee)} · 상태: {task.status || '-'} · 기간: {task.startDate || '-'} ~ {task.dueDate || '-'}
                            </span>
                          </div>

                          <div className="projectTimelineTrack">
                            <div className="projectTimelineTrackGrid" aria-hidden="true" />
                            <div className={`projectTimelineBar tone-${toStatusTone(task.status)}`} style={barStyle} />
                          </div>
                        </div>
                      ))
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  )
}
