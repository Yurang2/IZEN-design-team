import { useMemo, useState } from 'react'
import type { ProjectRecord, TaskRecord } from '../../shared/types'
import { Button } from '../../shared/ui'

type DashboardTopView =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'schedule'
  | 'screeningHistory'
  | 'screeningPlan'
  | 'eventGraphics'
  | 'photoGuide'
  | 'checklist'
  | 'meetings'
  | 'snsPost'
  | 'mailTemplate'
  | 'guide'

type DashboardViewProps = {
  tasks: TaskRecord[]
  projects: ProjectRecord[]
  lastSyncedAt: string
  onOpenView: (view: DashboardTopView) => void
  onOpenTask: (taskId: string) => void
  onCopyReportSummary: (text: string) => Promise<void>
  formatDateLabel: (value: string) => string
  joinOrDash: (values: string[]) => string
}

type RiskTag = '지연' | '오늘마감' | '긴급' | '미지정'
type FilterTag = '전체' | RiskTag

const RISK_TAGS: readonly RiskTag[] = ['지연', '오늘마감', '긴급', '미지정']
const FILTER_TABS: readonly FilterTag[] = ['전체', ...RISK_TAGS]

type DdayTone = 'red' | 'amber' | 'muted'
type DdayInfo = { label: string; tone: DdayTone }

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function isInactiveTask(task: TaskRecord): boolean {
  const normalized = normalizeStatus(task.status)
  return normalized === '완료' || normalized === '보관' || normalized === '보류'
}

function isCompletedTask(task: TaskRecord): boolean {
  const normalized = normalizeStatus(task.status)
  return normalized === '완료' || normalized === '보관'
}

function isDelayedTask(task: TaskRecord, today: Date): boolean {
  if (isInactiveTask(task) || !task.dueDate) return false
  const dueDate = parseIsoDate(task.dueDate)
  if (!dueDate) return false
  return dueDate.getTime() < today.getTime()
}

function isDueToday(task: TaskRecord, todayIso: string): boolean {
  return !isInactiveTask(task) && task.dueDate === todayIso
}

function isDueWithinWeek(task: TaskRecord, today: Date): boolean {
  if (isInactiveTask(task) || !task.dueDate) return false
  const dueDate = parseIsoDate(task.dueDate)
  if (!dueDate) return false
  const days = diffDays(today, dueDate)
  return days >= 0 && days <= 7
}

function getRiskTag(task: TaskRecord, today: Date, todayIso: string): RiskTag | null {
  if (isDelayedTask(task, today)) return '지연'
  if (isDueToday(task, todayIso)) return '오늘마감'
  if (task.urgent) return '긴급'
  if (task.assignee.length === 0) return '미지정'
  return null
}

function computeDday(eventDateIso: string | undefined, today: Date): DdayInfo | null {
  const target = parseIsoDate(eventDateIso)
  if (!target) return null
  const diff = diffDays(today, target)
  if (diff < 0) return { label: `D+${Math.abs(diff)}`, tone: 'red' }
  if (diff === 0) return { label: 'D-DAY', tone: 'red' }
  if (diff <= 7) return { label: `D-${diff}`, tone: 'red' }
  if (diff <= 30) return { label: `D-${diff}`, tone: 'amber' }
  return { label: `D-${diff}`, tone: 'muted' }
}

function riskToneClass(tag: RiskTag): string {
  switch (tag) {
    case '지연':
      return 'tone-red'
    case '오늘마감':
      return 'tone-amber'
    case '긴급':
      return 'tone-yellow'
    case '미지정':
      return 'tone-violet'
  }
}

function compareTaskPriority(a: TaskRecord, b: TaskRecord): number {
  const dueDiff = (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
  if (dueDiff !== 0) return dueDiff
  return a.taskName.localeCompare(b.taskName, 'ko')
}

type TaggedTask = { task: TaskRecord; tag: RiskTag }

type TaskGroup = {
  key: string
  name: string
  project: ProjectRecord | null
  dday: DdayInfo | null
  tasks: TaggedTask[]
}

export function DashboardView({
  tasks,
  projects,
  lastSyncedAt,
  onOpenView,
  onOpenTask,
  onCopyReportSummary,
  formatDateLabel,
  joinOrDash,
}: DashboardViewProps) {
  const today = useMemo(() => parseIsoDate(toIsoDate(new Date())) ?? new Date(), [])
  const todayIso = toIsoDate(today)

  const [activeTag, setActiveTag] = useState<FilterTag>('전체')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const summary = useMemo(() => {
    const activeTasks = tasks.filter((t) => !isInactiveTask(t))
    const delayed = activeTasks.filter((t) => isDelayedTask(t, today))
    const todayDue = activeTasks.filter((t) => isDueToday(t, todayIso))
    const urgent = activeTasks.filter((t) => Boolean(t.urgent))
    const unassigned = activeTasks.filter((t) => t.assignee.length === 0)
    const weekDue = activeTasks.filter((t) => isDueWithinWeek(t, today))
    const completedThisWeek = tasks.filter((t) => {
      if (!isCompletedTask(t) || !t.actualEndDate) return false
      const completedAt = parseIsoDate(t.actualEndDate)
      if (!completedAt) return false
      const days = diffDays(completedAt, today)
      return days >= 0 && days <= 7
    })
    const weeklyEfficiencyPct =
      weekDue.length > 0 ? Math.round((completedThisWeek.length / weekDue.length) * 100) : 0

    const upcomingProjects = projects
      .filter((p) => {
        const ed = parseIsoDate(p.eventDate)
        return Boolean(ed && ed.getTime() >= today.getTime())
      })
      .sort((a, b) => (a.eventDate ?? '9999-12-31').localeCompare(b.eventDate ?? '9999-12-31'))

    const activeTasksByProjectName = new Map<string, number>()
    for (const t of activeTasks) {
      const name = t.projectName.trim()
      if (!name) continue
      activeTasksByProjectName.set(name, (activeTasksByProjectName.get(name) ?? 0) + 1)
    }

    return {
      activeTasks,
      delayed,
      todayDue,
      urgent,
      unassigned,
      weekDue,
      completedThisWeek,
      weeklyEfficiencyPct,
      upcomingProjects,
      activeTasksByProjectName,
    }
  }, [projects, tasks, today, todayIso])

  const taggedTasks = useMemo<TaggedTask[]>(() => {
    return summary.activeTasks
      .map((task) => ({ task, tag: getRiskTag(task, today, todayIso) }))
      .filter((item): item is TaggedTask => item.tag !== null)
  }, [summary.activeTasks, today, todayIso])

  const tagCounts = useMemo<Record<FilterTag, number>>(() => {
    const counts: Record<FilterTag, number> = {
      전체: taggedTasks.length,
      지연: 0,
      오늘마감: 0,
      긴급: 0,
      미지정: 0,
    }
    for (const { tag } of taggedTasks) counts[tag] += 1
    return counts
  }, [taggedTasks])

  const filteredTasks = useMemo<TaggedTask[]>(() => {
    return activeTag === '전체' ? taggedTasks : taggedTasks.filter((item) => item.tag === activeTag)
  }, [activeTag, taggedTasks])

  const taskGroups = useMemo<TaskGroup[]>(() => {
    const projectByName = new Map(projects.map((p) => [p.name, p] as const))
    const groupMap = new Map<string, TaskGroup>()
    for (const item of filteredTasks) {
      const rawName = item.task.projectName.trim()
      const key = rawName || '기타'
      let bucket = groupMap.get(key)
      if (!bucket) {
        const project = rawName ? projectByName.get(rawName) ?? null : null
        bucket = {
          key,
          name: key,
          project,
          dday: project ? computeDday(project.eventDate, today) : null,
          tasks: [],
        }
        groupMap.set(key, bucket)
      }
      bucket.tasks.push(item)
    }
    for (const group of groupMap.values()) {
      group.tasks.sort((a, b) => compareTaskPriority(a.task, b.task))
    }
    return Array.from(groupMap.values()).sort((a, b) => {
      const ad = a.project?.eventDate ?? '9999-12-31'
      const bd = b.project?.eventDate ?? '9999-12-31'
      const cmp = ad.localeCompare(bd)
      if (cmp !== 0) return cmp
      return a.name.localeCompare(b.name, 'ko')
    })
  }, [filteredTasks, projects, today])

  const reportSummary = useMemo(() => {
    const dateLabel = formatDateLabel(todayIso)
    const headline = `활성 업무 ${summary.activeTasks.length}건 · 지연 ${summary.delayed.length}건 · 오늘 마감 ${summary.todayDue.length}건 · 미할당 ${summary.unassigned.length}건`
    const weekLine = `이번 주 완료 ${summary.completedThisWeek.length}건 / 마감 ${summary.weekDue.length}건 · 주간 완료율 ${summary.weeklyEfficiencyPct}%`
    const projectLine =
      summary.upcomingProjects.length > 0
        ? `주요 일정: ${summary.upcomingProjects
            .slice(0, 4)
            .map((p) => {
              const dd = computeDday(p.eventDate, today)
              return `${p.name}(${formatDateLabel(p.eventDate ?? '')}${dd ? ` ${dd.label}` : ''})`
            })
            .join(', ')}`
        : '주요 일정: 예정 없음'
    return `[DESIGN TEAM 운영 현황] ${dateLabel}\n${headline}\n${weekLine}\n${projectLine}`
  }, [formatDateLabel, summary, today, todayIso])

  const toggleGroup = (key: string) => setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <section className="dashboardView" aria-label="팀 운영 대시보드">
      <header className="dashboardHeader">
        <div className="dashboardHeaderMain">
          <span className="dashboardEyebrow">Design Team</span>
          <h2>팀 운영 대시보드</h2>
        </div>
        <div className="dashboardHeaderMeta">
          <span className="dashboardHeaderChip">마지막 동기화 {lastSyncedAt || '-'}</span>
          <Button type="button" onClick={() => onOpenView('tasks')}>
            업무 열기
          </Button>
        </div>
      </header>

      <section className="dashboardStatStrip" aria-label="핵심 지표">
        <StatCell label="활성 업무" value={summary.activeTasks.length} tone="plain" />
        <StatCell label="지연" value={summary.delayed.length} tone="red" />
        <StatCell label="오늘 마감" value={summary.todayDue.length} tone="amber" />
        <StatCell label="미할당" value={summary.unassigned.length} tone="green" />
      </section>

      <div className="dashboardPrimaryGrid">
        <article className="dashboardCard dashboardTasksPanel">
          <div className="dashboardTasksHeader">
            <div className="dashboardTasksHeaderTitle">
              <h3>지금 처리할 일</h3>
              <span className="dashboardTasksCount">{filteredTasks.length}건</span>
            </div>
            <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('tasks')}>
              전체 업무
            </Button>
          </div>
          <div className="dashboardFilterTabs" role="tablist" aria-label="업무 필터">
            {FILTER_TABS.map((tag) => {
              const isActive = activeTag === tag
              const count = tagCounts[tag]
              const toneCls = tag === '전체' ? 'tone-plain' : riskToneClass(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`dashboardFilterTab ${toneCls}${isActive ? ' is-active' : ''}`}
                  onClick={() => setActiveTag(tag)}
                >
                  <span>{tag}</span>
                  {count > 0 && <span className="dashboardFilterTabCount">{count}</span>}
                </button>
              )
            })}
          </div>

          <div className="dashboardTasksGroups">
            {taskGroups.length === 0 ? (
              <p className="dashboardEmptyState">해당하는 업무가 없습니다.</p>
            ) : (
              taskGroups.map((group) => {
                const isCollapsed = Boolean(collapsedGroups[group.key])
                return (
                  <div key={group.key} className="dashboardTaskGroup">
                    <button
                      type="button"
                      className="dashboardTaskGroupHeader"
                      aria-expanded={!isCollapsed}
                      onClick={() => toggleGroup(group.key)}
                    >
                      {group.dday ? (
                        <span className={`dashboardDdayPill tone-${group.dday.tone}`}>{group.dday.label}</span>
                      ) : (
                        <span className="dashboardDdayPill tone-muted">일정 미정</span>
                      )}
                      <span className="dashboardTaskGroupName">{group.name}</span>
                      <span className="dashboardTaskGroupCount">{group.tasks.length}건</span>
                      <span
                        className={`dashboardTaskGroupChevron${isCollapsed ? ' is-collapsed' : ''}`}
                        aria-hidden="true"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className="dashboardTaskList">
                        {group.tasks.map(({ task, tag }) => (
                          <button
                            key={task.id}
                            type="button"
                            className="dashboardTaskRow"
                            onClick={() => onOpenTask(task.id)}
                          >
                            <span className="dashboardTaskName">{task.taskName}</span>
                            {task.assignee.length > 0 ? (
                              <span className="dashboardTaskAssignee">{joinOrDash(task.assignee)}</span>
                            ) : (
                              <span className="dashboardTaskAssignee is-missing">미지정</span>
                            )}
                            <span className={`dashboardRiskTag ${riskToneClass(tag)}`}>{tag}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </article>

        <aside className="dashboardSidebar">
          <div className="dashboardWeekChips" aria-label="이번 주 완료 지표">
            <span>
              이번 주 완료 <strong>{summary.completedThisWeek.length}</strong>
            </span>
            <span className="dashboardWeekSeparator" aria-hidden="true">
              ·
            </span>
            <span>
              주간 완료율 <strong>{summary.weeklyEfficiencyPct}%</strong>
            </span>
          </div>

          <article className="dashboardCard dashboardProjectsRail">
            <div className="dashboardSectionHeader compact">
              <h3>프로젝트 일정</h3>
              <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('projects')}>
                전체
              </Button>
            </div>
            {summary.upcomingProjects.length > 0 ? (
              <div className="dashboardProjectsList">
                {summary.upcomingProjects.slice(0, 6).map((project) => {
                  const dd = computeDday(project.eventDate, today)
                  const taskCount = summary.activeTasksByProjectName.get(project.name) ?? 0
                  return (
                    <div key={project.id} className="dashboardProjectRow">
                      <div className="dashboardProjectRowMain">
                        <span className="dashboardProjectRowName">{project.name}</span>
                        <span className="dashboardProjectRowMeta">
                          활성 {taskCount}건 · {project.eventDate ? formatDateLabel(project.eventDate) : '-'}
                        </span>
                      </div>
                      {dd && <span className={`dashboardProjectRowDday tone-${dd.tone}`}>{dd.label}</span>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="dashboardEmptyState">가까운 프로젝트 일정이 없습니다.</p>
            )}
          </article>

          <article className="dashboardCard dashboardReportCard">
            <div className="dashboardSectionHeader compact">
              <h3>보고용 요약</h3>
              <Button type="button" variant="secondary" size="mini" onClick={() => void onCopyReportSummary(reportSummary)}>
                복사
              </Button>
            </div>
            <pre className="dashboardReportBox">{reportSummary}</pre>
          </article>
        </aside>
      </div>
    </section>
  )
}

type StatCellProps = {
  label: string
  value: number | string
  tone: 'plain' | 'red' | 'amber' | 'green'
}

function StatCell({ label, value, tone }: StatCellProps) {
  return (
    <div className={`dashboardStatCell tone-${tone}`}>
      <span className="dashboardStatValue">{value}</span>
      <span className="dashboardStatLabel">{label}</span>
    </div>
  )
}
