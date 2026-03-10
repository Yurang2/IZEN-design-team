import { useMemo } from 'react'
import type { ChecklistAssignmentStatus, ProjectRecord, TaskRecord } from '../../shared/types'
import { Badge, Button } from '../../shared/ui'

type DashboardTopView = 'dashboard' | 'projects' | 'tasks' | 'schedule' | 'checklist' | 'meetings' | 'guide'
type FocusBucketTone = 'red' | 'blue' | 'green' | 'gray'

type DashboardChecklistRow = {
  item: {
    id: string
    productName: string
    workCategory: string
  }
  assignmentStatus: ChecklistAssignmentStatus
  assignedTaskId?: string
  computedDueDate?: string
}

type DashboardViewProps = {
  tasks: TaskRecord[]
  projects: ProjectRecord[]
  checklistRows: DashboardChecklistRow[]
  selectedChecklistProject?: ProjectRecord
  lastSyncedAt: string
  onOpenView: (view: DashboardTopView) => void
  onOpenTask: (taskId: string) => void
  onCopyReportSummary: (text: string) => Promise<void>
  formatDateLabel: (value: string) => string
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

type FocusBucket = {
  key: string
  label: string
  helper: string
  tone: FocusBucketTone
  tasks: TaskRecord[]
}

type UpcomingProjectItem = {
  project: ProjectRecord
  activeTaskCount: number
}

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

function riskLabelForTask(task: TaskRecord, today: Date, todayIso: string): string {
  if (isDelayedTask(task, today)) return '지연'
  if (isDueToday(task, todayIso)) return '오늘 마감'
  if (task.urgent) return '긴급'
  if (task.assignee.length === 0) return '담당 미지정'
  return '확인 필요'
}

function projectMetaLabel(project: ProjectRecord): string {
  const bits = [project.projectType, project.eventCategory].filter(Boolean)
  return bits.length > 0 ? bits.join(' / ') : '기본 정보 없음'
}

function compareTaskPriority(a: TaskRecord, b: TaskRecord, today: Date, todayIso: string): number {
  const score = (task: TaskRecord) => {
    if (isDelayedTask(task, today)) return 0
    if (isDueToday(task, todayIso)) return 1
    if (task.urgent) return 2
    if (task.assignee.length === 0) return 3
    return 4
  }

  const scoreDiff = score(a) - score(b)
  if (scoreDiff !== 0) return scoreDiff

  const dueDiff = (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
  if (dueDiff !== 0) return dueDiff

  return a.taskName.localeCompare(b.taskName, 'ko')
}

function uniqueTaskList(tasks: TaskRecord[], today: Date, todayIso: string, limit: number): TaskRecord[] {
  return Array.from(new Map(tasks.map((task) => [task.id, task])).values())
    .sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    .slice(0, limit)
}

function formatTaskDueLabel(task: TaskRecord, formatDateLabel: (value: string) => string): string {
  return task.dueDate ? formatDateLabel(task.dueDate) : '미정'
}

export function DashboardView({
  tasks,
  projects,
  checklistRows,
  selectedChecklistProject,
  lastSyncedAt,
  onOpenView,
  onOpenTask,
  onCopyReportSummary,
  formatDateLabel,
  joinOrDash,
  toStatusTone,
}: DashboardViewProps) {
  const today = useMemo(() => parseIsoDate(toIsoDate(new Date())) ?? new Date(), [])
  const todayIso = toIsoDate(today)

  const dashboardSummary = useMemo(() => {
    const activeTasks = tasks.filter((task) => !isInactiveTask(task))
    const delayedTasks = activeTasks.filter((task) => isDelayedTask(task, today)).sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    const todayDueTasks = activeTasks.filter((task) => isDueToday(task, todayIso)).sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    const weekDueTasks = activeTasks.filter((task) => isDueWithinWeek(task, today)).sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    const unassignedTasks = activeTasks.filter((task) => task.assignee.length === 0).sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    const urgentTasks = activeTasks.filter((task) => Boolean(task.urgent)).sort((a, b) => compareTaskPriority(a, b, today, todayIso))
    const completedThisWeek = tasks.filter((task) => {
      if (!isCompletedTask(task) || !task.actualEndDate) return false
      const completedAt = parseIsoDate(task.actualEndDate)
      if (!completedAt) return false
      const days = diffDays(completedAt, today)
      return days >= 0 && days <= 7
    })

    const priorityTasks = uniqueTaskList([...delayedTasks, ...todayDueTasks, ...urgentTasks, ...unassignedTasks], today, todayIso, 8)

    const activeTasksByProjectName = new Map<string, number>()
    for (const task of activeTasks) {
      const projectName = task.projectName.trim()
      if (!projectName) continue
      activeTasksByProjectName.set(projectName, (activeTasksByProjectName.get(projectName) ?? 0) + 1)
    }

    const upcomingProjects: UpcomingProjectItem[] = projects
      .filter((project) => {
        if (!project.eventDate) return false
        const eventDate = parseIsoDate(project.eventDate)
        return Boolean(eventDate && eventDate.getTime() >= today.getTime())
      })
      .sort((a, b) => (a.eventDate ?? '9999-12-31').localeCompare(b.eventDate ?? '9999-12-31'))
      .slice(0, 6)
      .map((project) => ({
        project,
        activeTaskCount: activeTasksByProjectName.get(project.name) ?? 0,
      }))

    const checklistUnassigned = checklistRows
      .filter((row) => row.assignmentStatus === 'unassigned')
      .sort((a, b) => (a.computedDueDate ?? '9999-12-31').localeCompare(b.computedDueDate ?? '9999-12-31'))
    const checklistAssigned = checklistRows.filter((row) => row.assignmentStatus === 'assigned')
    const checklistFocusRows = checklistUnassigned.slice(0, 6)

    const focusBuckets: FocusBucket[] = [
      {
        key: 'delayed',
        label: '지연',
        helper: '먼저 정리해야 하는 업무',
        tone: 'red',
        tasks: delayedTasks.slice(0, 4),
      },
      {
        key: 'todayDue',
        label: '오늘 마감',
        helper: '오늘 안에 닫아야 하는 업무',
        tone: 'blue',
        tasks: todayDueTasks.slice(0, 4),
      },
      {
        key: 'urgent',
        label: '긴급',
        helper: '별도 긴급 표시가 붙은 업무',
        tone: 'green',
        tasks: urgentTasks.slice(0, 4),
      },
      {
        key: 'unassigned',
        label: '담당 미지정',
        helper: '바로 담당자를 붙여야 하는 업무',
        tone: 'gray',
        tasks: unassignedTasks.slice(0, 4),
      },
    ]

    const checklistCoveragePct =
      checklistRows.length > 0 ? Math.round((checklistAssigned.length / checklistRows.length) * 100) : 0

    return {
      activeTasks,
      delayedTasks,
      todayDueTasks,
      weekDueTasks,
      unassignedTasks,
      urgentTasks,
      completedThisWeek,
      priorityTasks,
      upcomingProjects,
      checklistUnassigned,
      checklistAssigned,
      checklistFocusRows,
      focusBuckets,
      checklistCoveragePct,
    }
  }, [checklistRows, projects, tasks, today, todayIso])

  const reportSummary = useMemo(() => {
    const headline = `${formatDateLabel(todayIso)} 기준 프로젝트 ${projects.length}건, 활성 업무 ${dashboardSummary.activeTasks.length}건, 오늘 마감 ${dashboardSummary.todayDueTasks.length}건, 지연 ${dashboardSummary.delayedTasks.length}건, 체크리스트 미할당 ${dashboardSummary.checklistUnassigned.length}건입니다.`
    const projectLine =
      dashboardSummary.upcomingProjects.length > 0
        ? `이번 주 주요 일정은 ${dashboardSummary.upcomingProjects
            .slice(0, 3)
            .map(({ project }) => `${project.name}(${formatDateLabel(project.eventDate ?? '')})`)
            .join(', ')}입니다.`
        : '이번 주 예정된 프로젝트 일정은 아직 없습니다.'
    const riskLine =
      dashboardSummary.priorityTasks.length > 0
        ? `우선 확인 업무는 ${dashboardSummary.priorityTasks
            .slice(0, 3)
            .map((task) => `${task.taskName}(${riskLabelForTask(task, today, todayIso)})`)
            .join(', ')}입니다.`
        : '즉시 확인이 필요한 업무는 현재 없습니다.'
    return [headline, projectLine, riskLine].join(' ')
  }, [
    dashboardSummary.activeTasks.length,
    dashboardSummary.checklistUnassigned.length,
    dashboardSummary.delayedTasks.length,
    dashboardSummary.priorityTasks,
    dashboardSummary.todayDueTasks.length,
    dashboardSummary.upcomingProjects,
    formatDateLabel,
    projects.length,
    today,
    todayIso,
  ])

  return (
    <section className="dashboardView" aria-label="팀 운영 대시보드">
      <header className="dashboardHeader">
        <div className="dashboardHeaderMain">
          <span className="dashboardEyebrow">Team Home</span>
          <h2>오늘 운영 현황</h2>
          <p>업무 우선순위, 이번 주 일정, 체크리스트 리스크를 한 화면에서 바로 확인할 수 있게 정리했습니다.</p>
        </div>
        <div className="dashboardHeaderMeta">
          <span className="dashboardHeaderChip">마지막 동기화 {lastSyncedAt || '-'}</span>
          <div className="dashboardHeaderActions">
            <Button type="button" onClick={() => onOpenView('tasks')}>
              업무 열기
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('projects')}>
              프로젝트 보기
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onCopyReportSummary(reportSummary)}>
              보고 복사
            </Button>
          </div>
        </div>
      </header>

      <div className="dashboardPrimaryGrid">
        <div className="dashboardMainColumn">
          <section className="dashboardMetricStrip" aria-label="핵심 지표">
            <article className="dashboardMetricCard">
              <span className="dashboardMetricLabel">활성 업무</span>
              <strong>{dashboardSummary.activeTasks.length}</strong>
              <small>오늘 진행 중인 전체 업무</small>
            </article>
            <article className="dashboardMetricCard tone-red">
              <span className="dashboardMetricLabel">지연 업무</span>
              <strong>{dashboardSummary.delayedTasks.length}</strong>
              <small>완료, 보류, 보관 제외</small>
            </article>
            <article className="dashboardMetricCard tone-blue">
              <span className="dashboardMetricLabel">오늘 마감</span>
              <strong>{dashboardSummary.todayDueTasks.length}</strong>
              <small>{formatDateLabel(todayIso)} 기준</small>
            </article>
            <article className="dashboardMetricCard tone-amber">
              <span className="dashboardMetricLabel">체크리스트 미할당</span>
              <strong>{dashboardSummary.checklistUnassigned.length}</strong>
              <small>{selectedChecklistProject ? `${selectedChecklistProject.name} 기준` : '선택 행사 기준'}</small>
            </article>
          </section>

          <article className="dashboardCard dashboardFocusBoard">
            <div className="dashboardSectionHeader">
              <div>
                <span className="dashboardSectionEyebrow">Today Focus</span>
                <h3>한눈에 보는 우선순위 보드</h3>
                <p>Asana처럼 지금 바로 봐야 하는 일만 묶어서 보여줍니다.</p>
              </div>
              <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('tasks')}>
                전체 업무
              </Button>
            </div>

            <div className="dashboardFocusGrid">
              {dashboardSummary.focusBuckets.map((bucket) => (
                <article key={bucket.key} className={`dashboardFocusLane tone-${bucket.tone}`}>
                  <div className="dashboardFocusLaneHeader">
                    <div className="dashboardFocusLaneHeaderMain">
                      <span className="dashboardFocusLaneLabel">{bucket.label}</span>
                      <span className="dashboardFocusLaneCount">{bucket.tasks.length}건</span>
                    </div>
                    <span className="dashboardFocusLaneHelper">{bucket.helper}</span>
                  </div>
                  {bucket.tasks.length > 0 ? (
                    <div className="dashboardLaneList">
                      {bucket.tasks.map((task) => (
                        <button key={task.id} type="button" className="dashboardTaskCard" onClick={() => onOpenTask(task.id)}>
                          <div className="dashboardTaskCardTop">
                            <strong>{task.taskName}</strong>
                            <Badge tone={toStatusTone(task.status)}>{task.status || '미분류'}</Badge>
                          </div>
                          <span className="dashboardListMeta">{task.projectName || '프로젝트 미지정'}</span>
                          <span className="dashboardListMeta">
                            마감 {formatTaskDueLabel(task, formatDateLabel)} · {riskLabelForTask(task, today, todayIso)}
                          </span>
                          <span className="dashboardListMeta">담당 {joinOrDash(task.assignee)}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="dashboardEmptyState">현재 항목이 없습니다.</p>
                  )}
                </article>
              ))}
            </div>
          </article>

          <div className="dashboardSplitGrid">
            <article className="dashboardCard">
              <div className="dashboardSectionHeader">
                <div>
                  <span className="dashboardSectionEyebrow">This Week</span>
                  <h3>이번 주 프로젝트</h3>
                  <p>행사일이 가까운 프로젝트부터 운영 포인트를 확인합니다.</p>
                </div>
                <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('projects')}>
                  프로젝트
                </Button>
              </div>
              {dashboardSummary.upcomingProjects.length > 0 ? (
                <div className="dashboardList">
                  {dashboardSummary.upcomingProjects.map(({ project, activeTaskCount }) => (
                    <article key={project.id} className="dashboardListItem is-static">
                      <div className="dashboardListItemTop">
                        <strong>{project.name}</strong>
                        <span className="dashboardDateChip">{project.eventDate ? formatDateLabel(project.eventDate) : '-'}</span>
                      </div>
                      <span className="dashboardListMeta">{projectMetaLabel(project)}</span>
                      <span className="dashboardListMeta">활성 업무 {activeTaskCount}건</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="dashboardEmptyState">가까운 일정의 프로젝트가 없습니다.</p>
              )}
            </article>

            <article className="dashboardCard">
              <div className="dashboardSectionHeader">
                <div>
                  <span className="dashboardSectionEyebrow">Checklist Risk</span>
                  <h3>체크리스트 할당 포커스</h3>
                  <p>{selectedChecklistProject ? `${selectedChecklistProject.name} 기준` : '현재 선택 행사 기준'} 미할당 항목입니다.</p>
                </div>
                <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('checklist')}>
                  체크리스트
                </Button>
              </div>
              {dashboardSummary.checklistFocusRows.length > 0 ? (
                <div className="dashboardList">
                  {dashboardSummary.checklistFocusRows.map((row) => (
                    <article key={row.item.id} className="dashboardListItem is-static">
                      <div className="dashboardListItemTop">
                        <strong>{row.item.productName}</strong>
                        <Badge tone="red">미할당</Badge>
                      </div>
                      <span className="dashboardListMeta">{row.item.workCategory || '분류 미지정'}</span>
                      <span className="dashboardListMeta">예정 마감 {row.computedDueDate ? formatDateLabel(row.computedDueDate) : '-'}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="dashboardEmptyState">미할당 체크리스트 항목이 없습니다.</p>
              )}
            </article>
          </div>
        </div>

        <aside className="dashboardSidebar">
          <article className="dashboardCard dashboardQuickAccess">
            <div className="dashboardSectionHeader compact">
              <div>
                <span className="dashboardSectionEyebrow">Quick Access</span>
                <h3>바로 이동</h3>
              </div>
            </div>
            <div className="dashboardNavGrid">
              <button type="button" className="dashboardNavButton" onClick={() => onOpenView('tasks')}>
                <strong>업무</strong>
                <span>실행과 수정</span>
              </button>
              <button type="button" className="dashboardNavButton" onClick={() => onOpenView('projects')}>
                <strong>프로젝트</strong>
                <span>운영 일정 확인</span>
              </button>
              <button type="button" className="dashboardNavButton" onClick={() => onOpenView('checklist')}>
                <strong>체크리스트</strong>
                <span>미할당 정리</span>
              </button>
              <button type="button" className="dashboardNavButton" onClick={() => onOpenView('meetings')}>
                <strong>회의록</strong>
                <span>후속 액션 확인</span>
              </button>
            </div>
          </article>

          <article className="dashboardCard dashboardPulseCard">
            <div className="dashboardSectionHeader compact">
              <div>
                <span className="dashboardSectionEyebrow">Team Pulse</span>
                <h3>운영 스냅샷</h3>
                <p>숫자로 현재 팀 상태를 빠르게 읽습니다.</p>
              </div>
            </div>
            <div className="dashboardPulseGrid">
              <div>
                <span>주간 완료</span>
                <strong>{dashboardSummary.completedThisWeek.length}</strong>
              </div>
              <div>
                <span>이번 주 마감</span>
                <strong>{dashboardSummary.weekDueTasks.length}</strong>
              </div>
              <div>
                <span>긴급 표시</span>
                <strong>{dashboardSummary.urgentTasks.length}</strong>
              </div>
              <div>
                <span>체크리스트 할당률</span>
                <strong>{dashboardSummary.checklistCoveragePct}%</strong>
              </div>
            </div>
          </article>

          <article className="dashboardCard dashboardSummaryCard">
            <div className="dashboardSectionHeader compact">
              <div>
                <span className="dashboardSectionEyebrow">Reporting</span>
                <h3>보고용 요약</h3>
                <p>메신저, 회의, 일일보고에 바로 붙여넣을 수 있습니다.</p>
              </div>
              <Button type="button" variant="secondary" size="mini" onClick={() => void onCopyReportSummary(reportSummary)}>
                복사
              </Button>
            </div>
            <textarea className="dashboardSummaryBox" readOnly value={reportSummary} />
            <div className="dashboardSummaryFooter">
              <span className="dashboardSummaryChip">할당 완료 {dashboardSummary.checklistAssigned.length}건</span>
              <span className="dashboardSummaryChip">사용법은 가이드 탭에서 확인</span>
              <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('guide')}>
                사용법
              </Button>
            </div>
          </article>
        </aside>
      </div>
    </section>
  )
}
