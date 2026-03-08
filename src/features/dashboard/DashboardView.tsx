import { useMemo } from 'react'
import type { ChecklistAssignmentStatus, ProjectRecord, TaskRecord } from '../../shared/types'
import { Badge, Button } from '../../shared/ui'

type DashboardTopView = 'dashboard' | 'projects' | 'tasks' | 'schedule' | 'checklist' | 'meetings' | 'guide'

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
    const delayedTasks = activeTasks.filter((task) => isDelayedTask(task, today))
    const todayDueTasks = activeTasks.filter((task) => isDueToday(task, todayIso))
    const weekDueTasks = activeTasks.filter((task) => isDueWithinWeek(task, today))
    const unassignedTasks = activeTasks.filter((task) => task.assignee.length === 0)
    const urgentTasks = activeTasks.filter((task) => Boolean(task.urgent))
    const completedThisWeek = tasks.filter((task) => {
      if (!isCompletedTask(task) || !task.actualEndDate) return false
      const completedAt = parseIsoDate(task.actualEndDate)
      if (!completedAt) return false
      const days = diffDays(completedAt, today)
      return days >= 0 && days <= 7
    })

    const priorityTasks = activeTasks
      .filter((task) => isDelayedTask(task, today) || isDueToday(task, todayIso) || task.urgent || task.assignee.length === 0)
      .sort((a, b) => {
        const score = (task: TaskRecord) => {
          if (isDelayedTask(task, today)) return 0
          if (isDueToday(task, todayIso)) return 1
          if (task.urgent) return 2
          if (task.assignee.length === 0) return 3
          return 4
        }
        const scoreDiff = score(a) - score(b)
        if (scoreDiff !== 0) return scoreDiff
        return (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31')
      })
      .slice(0, 6)

    const upcomingProjects = projects
      .filter((project) => {
        if (!project.eventDate) return false
        const eventDate = parseIsoDate(project.eventDate)
        return Boolean(eventDate && eventDate.getTime() >= today.getTime())
      })
      .sort((a, b) => (a.eventDate ?? '9999-12-31').localeCompare(b.eventDate ?? '9999-12-31'))
      .slice(0, 6)

    const checklistUnassigned = checklistRows.filter((row) => row.assignmentStatus === 'unassigned')
    const checklistAssigned = checklistRows.filter((row) => row.assignmentStatus === 'assigned')
    const checklistFocusRows = checklistUnassigned
      .slice()
      .sort((a, b) => (a.computedDueDate ?? '9999-12-31').localeCompare(b.computedDueDate ?? '9999-12-31'))
      .slice(0, 5)

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
    }
  }, [checklistRows, projects, tasks, today, todayIso])

  const reportSummary = useMemo(() => {
    const headline = `${formatDateLabel(todayIso)} 기준 프로젝트 ${projects.length}건, 활성 업무 ${dashboardSummary.activeTasks.length}건, 오늘 마감 ${dashboardSummary.todayDueTasks.length}건, 지연 ${dashboardSummary.delayedTasks.length}건, 체크리스트 미할당 ${dashboardSummary.checklistUnassigned.length}건입니다.`
    const projectLine =
      dashboardSummary.upcomingProjects.length > 0
        ? `이번 주 주요 일정은 ${dashboardSummary.upcomingProjects
            .slice(0, 3)
            .map((project) => `${project.name}(${formatDateLabel(project.eventDate ?? '')})`)
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
  }, [dashboardSummary.activeTasks.length, dashboardSummary.checklistUnassigned.length, dashboardSummary.delayedTasks.length, dashboardSummary.priorityTasks, dashboardSummary.todayDueTasks.length, dashboardSummary.upcomingProjects, formatDateLabel, projects.length, today, todayIso])

  return (
    <section className="dashboardView" aria-label="팀 운영 대시보드">
      <article className="dashboardHero">
        <div className="dashboardHeroMain">
          <span className="dashboardEyebrow">Collaboration / Management / Reporting</span>
          <h2>팀원이 바로 써야 하는 화면을 한곳에 모았습니다.</h2>
          <p>
            업무는 실행 중심으로, 프로젝트는 운영 중심으로, 보고는 요약 중심으로 진입할 수 있게 구성했습니다.
            노션 원장을 유지하면서 웹에서는 오늘 처리할 일과 보고 포인트를 먼저 보게 합니다.
          </p>
          <div className="dashboardHeroActions">
            <Button type="button" onClick={() => onOpenView('tasks')}>
              협업 시작
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('projects')}>
              운영 현황 보기
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onCopyReportSummary(reportSummary)}>
              보고 문구 복사
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('guide')}>
              사용법 열기
            </Button>
          </div>
        </div>

        <div className="dashboardSnapshotGrid">
          <article className="dashboardSnapshotCard">
            <span>활성 업무</span>
            <strong>{dashboardSummary.activeTasks.length}</strong>
            <small>오늘 바로 처리 중인 작업 수</small>
          </article>
          <article className="dashboardSnapshotCard danger">
            <span>지연 업무</span>
            <strong>{dashboardSummary.delayedTasks.length}</strong>
            <small>완료/보류/보관 제외 기준</small>
          </article>
          <article className="dashboardSnapshotCard">
            <span>오늘 마감</span>
            <strong>{dashboardSummary.todayDueTasks.length}</strong>
            <small>{formatDateLabel(todayIso)} 마감 건수</small>
          </article>
          <article className="dashboardSnapshotCard warning">
            <span>체크리스트 미할당</span>
            <strong>{dashboardSummary.checklistUnassigned.length}</strong>
            <small>{selectedChecklistProject ? `${selectedChecklistProject.name} 기준` : '선택된 행사 기준'}</small>
          </article>
        </div>
      </article>

      <div className="dashboardWorkflowGrid">
        <article className="dashboardWorkflowCard">
          <span className="dashboardWorkflowTag">협업</span>
          <h3>실행할 업무를 바로 정리</h3>
          <p>담당 미지정, 오늘 마감, 회의 후속 액션을 먼저 처리하는 흐름입니다.</p>
          <dl className="dashboardMetricGrid">
            <div>
              <dt>담당 미지정</dt>
              <dd>{dashboardSummary.unassignedTasks.length}</dd>
            </div>
            <div>
              <dt>오늘 마감</dt>
              <dd>{dashboardSummary.todayDueTasks.length}</dd>
            </div>
            <div>
              <dt>긴급 표시</dt>
              <dd>{dashboardSummary.urgentTasks.length}</dd>
            </div>
          </dl>
          <div className="dashboardCardActions">
            <Button type="button" onClick={() => onOpenView('tasks')}>
              업무 열기
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('meetings')}>
              회의록 열기
            </Button>
          </div>
        </article>

        <article className="dashboardWorkflowCard">
          <span className="dashboardWorkflowTag">관리</span>
          <h3>프로젝트 리스크를 한 번에 확인</h3>
          <p>행사 일정, 지연 업무, 체크리스트 미할당을 같이 보는 운영용 흐름입니다.</p>
          <dl className="dashboardMetricGrid">
            <div>
              <dt>이번 주 일정</dt>
              <dd>{dashboardSummary.upcomingProjects.length}</dd>
            </div>
            <div>
              <dt>지연 업무</dt>
              <dd>{dashboardSummary.delayedTasks.length}</dd>
            </div>
            <div>
              <dt>미할당 항목</dt>
              <dd>{dashboardSummary.checklistUnassigned.length}</dd>
            </div>
          </dl>
          <div className="dashboardCardActions">
            <Button type="button" onClick={() => onOpenView('projects')}>
              프로젝트 열기
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('checklist')}>
              체크리스트 열기
            </Button>
          </div>
        </article>

        <article className="dashboardWorkflowCard">
          <span className="dashboardWorkflowTag">보고</span>
          <h3>관리자 공유용 문구를 즉시 생성</h3>
          <p>당일 현황을 복사해서 메신저나 회의 보고에 바로 붙일 수 있게 구성했습니다.</p>
          <dl className="dashboardMetricGrid">
            <div>
              <dt>주간 완료</dt>
              <dd>{dashboardSummary.completedThisWeek.length}</dd>
            </div>
            <div>
              <dt>이번 주 마감</dt>
              <dd>{dashboardSummary.weekDueTasks.length}</dd>
            </div>
            <div>
              <dt>복사 준비</dt>
              <dd>1</dd>
            </div>
          </dl>
          <div className="dashboardCardActions">
            <Button type="button" onClick={() => void onCopyReportSummary(reportSummary)}>
              보고 복사
            </Button>
            <Button type="button" variant="secondary" onClick={() => onOpenView('guide')}>
              사용 흐름 보기
            </Button>
          </div>
        </article>
      </div>

      <div className="dashboardColumns">
        <article className="dashboardCard">
          <div className="dashboardCardHeader">
            <div>
              <h3>오늘 바로 볼 업무</h3>
              <p>지연, 오늘 마감, 긴급, 담당 미지정 업무를 우선순위대로 정리했습니다.</p>
            </div>
            <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('tasks')}>
              전체 업무
            </Button>
          </div>
          {dashboardSummary.priorityTasks.length > 0 ? (
            <div className="dashboardList">
              {dashboardSummary.priorityTasks.map((task) => (
                <button key={task.id} type="button" className="dashboardListItem" onClick={() => onOpenTask(task.id)}>
                  <div className="dashboardListItemTop">
                    <strong>{task.taskName}</strong>
                    <Badge tone={toStatusTone(task.status)}>{task.status || '미분류'}</Badge>
                  </div>
                  <span className="dashboardListMeta">{task.projectName}</span>
                  <span className="dashboardListMeta">담당: {joinOrDash(task.assignee)}</span>
                  <span className="dashboardListMeta">
                    마감: {task.dueDate ? formatDateLabel(task.dueDate) : '-'} · {riskLabelForTask(task, today, todayIso)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">우선 확인이 필요한 업무가 없습니다.</p>
          )}
        </article>

        <article className="dashboardCard">
          <div className="dashboardCardHeader">
            <div>
              <h3>이번 주 프로젝트</h3>
              <p>행사일이 가까운 프로젝트부터 운영 포인트를 점검할 수 있습니다.</p>
            </div>
            <Button type="button" variant="secondary" size="mini" onClick={() => onOpenView('projects')}>
              프로젝트
            </Button>
          </div>
          {dashboardSummary.upcomingProjects.length > 0 ? (
            <div className="dashboardList">
              {dashboardSummary.upcomingProjects.map((project) => (
                <article key={project.id} className="dashboardListItem is-static">
                  <div className="dashboardListItemTop">
                    <strong>{project.name}</strong>
                    <span className="dashboardDateChip">{project.eventDate ? formatDateLabel(project.eventDate) : '-'}</span>
                  </div>
                  <span className="dashboardListMeta">{projectMetaLabel(project)}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">가까운 일정의 프로젝트가 없습니다.</p>
          )}
        </article>
      </div>

      <div className="dashboardColumns">
        <article className="dashboardCard">
          <div className="dashboardCardHeader">
            <div>
              <h3>체크리스트 할당 포커스</h3>
              <p>{selectedChecklistProject ? `${selectedChecklistProject.name} 기준` : '현재 선택된 행사 기준'} 미할당 항목입니다.</p>
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
                  <span className="dashboardListMeta">예정 마감: {row.computedDueDate ? formatDateLabel(row.computedDueDate) : '-'}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">미할당 체크리스트 항목이 없습니다.</p>
          )}
        </article>

        <article className="dashboardCard">
          <div className="dashboardCardHeader">
            <div>
              <h3>보고용 요약</h3>
              <p>메신저, 회의록, 일일보고에 바로 붙여넣을 수 있는 문구입니다.</p>
            </div>
            <Button type="button" variant="secondary" size="mini" onClick={() => void onCopyReportSummary(reportSummary)}>
              복사
            </Button>
          </div>
          <textarea className="dashboardSummaryBox" readOnly value={reportSummary} />
          <div className="dashboardSummaryFooter">
            <span className="muted small">마지막 동기화: {lastSyncedAt || '-'}</span>
            <span className="muted small">할당 완료 {dashboardSummary.checklistAssigned.length}건</span>
          </div>
        </article>
      </div>
    </section>
  )
}
