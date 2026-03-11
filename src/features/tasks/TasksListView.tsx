import { useCallback, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { emojiToTwemojiUrl, formatProjectIconLabel } from '../../shared/emoji'
import type { ProjectRecord, TaskGroup, TaskQuickGroupBy } from '../../shared/types'
import { Badge, Pill, Skeleton, TableWrap } from '../../shared/ui'

const GROUP_VIRTUALIZATION_THRESHOLD = 18
const GROUP_VIRTUAL_OVERSCAN = 3
const GROUP_ROW_ESTIMATE = 44
const GROUP_BASE_ESTIMATE = 84
const GROUP_COLLAPSED_ESTIMATE = 68
const GROUP_ESTIMATE_CAP = 12

const ASSIGNEE_AVATARS: Record<string, string> = {
  강수민: '/assignees/kang-sumin.png',
  김지은: '/assignees/kim-jieun.png',
  이다경: '/assignees/lee-dagyeong.png',
  정현지: '/assignees/jeong-hyeonji.png',
  조정훈: '/assignees/jo-jeonghun.png',
}

type TasksListViewProps = {
  groupedTasks: TaskGroup[]
  taskQuickGroupBy: TaskQuickGroupBy
  projectByName: Map<string, ProjectRecord>
  openTaskGroups: Record<string, boolean>
  statusUpdatingIds: Record<string, boolean>
  statusOptions: string[]
  loadingList: boolean
  onToggleTaskGroup: (groupKey: string) => void
  onTaskOpen: (taskId: string) => void
  onQuickStatusChange: (taskId: string, nextStatus: string) => Promise<void>
  unique: (values: string[]) => string[]
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

function todayIso(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function compactText(value: string | undefined, max = 80): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '-'
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

function hasBlockingPredecessor(predecessorTask: string | undefined, predecessorPending: boolean | undefined): boolean {
  return Boolean(predecessorTask?.trim()) && predecessorPending === true
}

function isDoneStatus(status: string | undefined): boolean {
  const normalized = (status ?? '').trim()
  return normalized === '완료' || normalized === '보관'
}

function summarizeGroup(tasks: TaskGroup['tasks']): { delayed: number; todayDue: number; urgent: number; inProgress: number } {
  const today = todayIso()
  let delayed = 0
  let todayDue = 0
  let urgent = 0
  let inProgress = 0

  for (const task of tasks) {
    if (task.urgent) urgent += 1
    if (!isDoneStatus(task.status) && task.status && task.status !== '시작전') inProgress += 1
    if (!task.dueDate || isDoneStatus(task.status)) continue
    if (task.dueDate < today) delayed += 1
    if (task.dueDate === today) todayDue += 1
  }

  return { delayed, todayDue, urgent, inProgress }
}

function DateHeader({ scope, label }: { scope: 'plan' | 'actual'; label: string }) {
  return (
    <div className="taskColumnHeader">
      <span className={`taskColumnGroup taskColumnGroup-${scope}`}>{scope === 'plan' ? '계획' : '실제'}</span>
      <strong>{label}</strong>
    </div>
  )
}

function AssigneeCell({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="muted">-</span>

  return (
    <div className="taskAssigneeList">
      {names.map((name) => (
        <span key={name} className="taskAssigneeChip">
          {ASSIGNEE_AVATARS[name] ? <img className="taskAssigneeAvatar" src={ASSIGNEE_AVATARS[name]} alt="" /> : null}
          <span>{name}</span>
        </span>
      ))}
    </div>
  )
}

function LinkCell({ href }: { href: string | undefined }) {
  if (!href) return <span className="muted">-</span>
  return (
    <a className="taskOutputLink" href={href} target="_blank" rel="noreferrer">
      열기
    </a>
  )
}

function PredecessorPendingCell({ value, blocked }: { value: boolean | undefined; blocked: boolean }) {
  if (value === undefined) return <span className="muted">-</span>
  if (blocked) return <Badge tone="red">미완료</Badge>
  return <Badge tone="green">완료</Badge>
}

function ListSkeleton() {
  return (
    <section className="projectGroups" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, idx) => (
        <article className="projectSection" key={`tasks-list-skeleton-${idx}`}>
          <header className="taskGroupHeaderBar">
            <div className="taskGroupHeaderIdentity">
              <Skeleton width="30px" height="30px" />
              <div className="taskGroupTitleBlock">
                <Skeleton width="220px" height="18px" />
                <Skeleton width="140px" height="14px" />
              </div>
            </div>
            <div className="taskGroupHeaderStats">
              <Skeleton width="52px" height="22px" />
              <Skeleton width="66px" height="22px" />
              <Skeleton width="60px" height="22px" />
            </div>
          </header>
          <TableWrap>
            <table className="tasksListTable notionGridTable">
              <thead>
                <tr>
                  <th className="taskNameColumn">업무</th>
                  <th className="taskDetailColumn">업무상세</th>
                  <th className="taskIssueColumn">이슈</th>
                  <th className="taskCompactColumn">우선순위</th>
                  <th className="taskStatusColumn">상태</th>
                  <th className="taskAssigneeColumn">담당자</th>
                  <th className="taskDateCompactColumn">접수일</th>
                  <th className="taskDateCompactColumn">마감일</th>
                  <th className="taskDateCompactColumn">착수일</th>
                  <th className="taskDateCompactColumn">실제종료일</th>
                  <th className="taskDependencyColumn">선행 작업</th>
                  <th className="taskCompactColumn">선행 미완료</th>
                  <th className="taskCompactColumn">산출물 링크</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((__, rowIdx) => (
                  <tr key={`tasks-list-skeleton-row-${idx}-${rowIdx}`}>
                    {Array.from({ length: 13 }).map((___, colIdx) => (
                      <td key={`tasks-list-skeleton-col-${idx}-${rowIdx}-${colIdx}`}>
                        <Skeleton width="100%" height="14px" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </article>
      ))}
    </section>
  )
}

function estimateGroupHeight(group: TaskGroup, isOpen: boolean): number {
  if (!isOpen) return GROUP_COLLAPSED_ESTIMATE
  return GROUP_BASE_ESTIMATE + Math.min(group.tasks.length, GROUP_ESTIMATE_CAP) * GROUP_ROW_ESTIMATE
}

export function TasksListView({
  groupedTasks,
  taskQuickGroupBy,
  projectByName,
  openTaskGroups,
  statusUpdatingIds,
  statusOptions,
  loadingList,
  onToggleTaskGroup,
  onTaskOpen,
  onQuickStatusChange,
  unique,
  joinOrDash,
  toStatusTone,
}: TasksListViewProps) {
  const [groupsElement, setGroupsElement] = useState<HTMLElement | null>(null)
  const setGroupsRef = useCallback((element: HTMLElement | null) => {
    setGroupsElement(element)
  }, [])

  const shouldVirtualizeGroups = groupedTasks.length >= GROUP_VIRTUALIZATION_THRESHOLD
  const groupScrollMargin = groupsElement?.offsetTop ?? 0

  const groupVirtualizer = useWindowVirtualizer({
    count: groupedTasks.length,
    estimateSize: (index) => {
      const group = groupedTasks[index]
      if (!group) return GROUP_COLLAPSED_ESTIMATE
      const isOpen = openTaskGroups[group.key] !== false
      return estimateGroupHeight(group, isOpen)
    },
    overscan: GROUP_VIRTUAL_OVERSCAN,
    getItemKey: (index) => groupedTasks[index]?.key ?? `task-group-${index}`,
    scrollMargin: groupScrollMargin,
  })

  if (loadingList) {
    return <ListSkeleton />
  }

  const renderGroup = (group: TaskGroup) => {
    const groupProject = taskQuickGroupBy === 'project' ? projectByName.get(group.label) : undefined
    const groupProjectIconEmojiUrl = emojiToTwemojiUrl(groupProject?.iconEmoji)
    const groupProjectIconLabel = formatProjectIconLabel(groupProject?.iconEmoji)
    const isOpen = openTaskGroups[group.key] !== false
    const summary = summarizeGroup(group.tasks)

    return (
      <article className="projectSection taskGroupSection" key={group.key}>
        <header className="taskGroupHeaderBar">
          <div className="taskGroupHeaderIdentity">
            <button type="button" className="taskGroupToggleCompact" onClick={() => onToggleTaskGroup(group.key)} aria-expanded={isOpen}>
              {isOpen ? '▾' : '▸'}
            </button>
            <div className="taskGroupTitleBlock">
              <h2 className="projectTitle">
                {groupProject?.coverUrl ? <img className="projectCoverImage" src={groupProject.coverUrl} alt="" /> : null}
                {groupProject?.iconUrl ? <img className="projectIconImage" src={groupProject.iconUrl} alt="" /> : null}
                {groupProject?.iconEmoji ? (
                  <span className="projectIconEmoji" title={groupProjectIconLabel || groupProject.iconEmoji}>
                    {groupProjectIconEmojiUrl ? (
                      <img className="projectIconEmojiImage" src={groupProjectIconEmojiUrl} alt={groupProject.iconEmoji} />
                    ) : (
                      groupProject.iconEmoji
                    )}
                  </span>
                ) : null}
                <span>{group.label}</span>
              </h2>
              <p className="taskGroupMetaText">
                {taskQuickGroupBy === 'project' ? '프로젝트 기준 운영 그리드' : '현재 기준으로 묶인 업무'}
              </p>
            </div>
          </div>
          <div className="taskGroupHeaderStats">
            <Pill>{group.tasks.length}건</Pill>
            {summary.delayed > 0 ? <Pill className="pillDanger">지연 {summary.delayed}</Pill> : null}
            {summary.todayDue > 0 ? <Pill className="pillWarn">오늘 {summary.todayDue}</Pill> : null}
            {summary.urgent > 0 ? <Pill className="pillInfo">긴급 {summary.urgent}</Pill> : null}
            {summary.inProgress > 0 ? <Pill>진행 {summary.inProgress}</Pill> : null}
          </div>
        </header>

        {isOpen ? (
          <TableWrap>
            <table className="tasksListTable notionGridTable">
              <thead>
                <tr>
                  <th className="taskNameColumn">업무</th>
                  <th className="taskDetailColumn">업무상세</th>
                  <th className="taskIssueColumn">이슈</th>
                  <th className="taskCompactColumn">우선순위</th>
                  <th className="taskStatusColumn">상태</th>
                  <th className="taskAssigneeColumn">담당자</th>
                  <th className="taskDateCompactColumn">
                    <DateHeader scope="plan" label="접수일" />
                  </th>
                  <th className="taskDateCompactColumn">
                    <DateHeader scope="plan" label="마감일" />
                  </th>
                  <th className="taskDateCompactColumn">
                    <DateHeader scope="actual" label="착수일" />
                  </th>
                  <th className="taskDateCompactColumn">
                    <DateHeader scope="actual" label="실제종료일" />
                  </th>
                  <th className="taskDependencyColumn">선행 작업</th>
                  <th className="taskCompactColumn">선행 미완료</th>
                  <th className="taskCompactColumn">산출물 링크</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => {
                  const blockedByPredecessor = hasBlockingPredecessor(task.predecessorTask, task.predecessorPending)

                  return (
                  <tr key={task.id}>
                    <td className="taskNameColumn">
                      <div className="taskPrimaryCell">
                        <div className="taskPrimaryTopRow">
                          {task.workType ? (
                            <Badge tone="gray" notionColor={task.workTypeColor}>
                              {task.workType}
                            </Badge>
                          ) : null}
                          <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                            {task.taskName}
                          </button>
                        </div>
                        <div className="taskPrimaryMeta">
                          <span className="taskMiniMeta">{joinOrDash(task.requester)}</span>
                          {taskQuickGroupBy !== 'project' && task.projectName ? <span className="taskMiniMeta">{task.projectName}</span> : null}
                          {task.urgent ? <span className="taskMiniMeta taskMiniMeta-emphasis">긴급</span> : null}
                        </div>
                      </div>
                    </td>
                    <td className="taskDetailColumn">
                      <div className="taskTextPreviewCell clampTwoLines">{compactText(task.detail, 120)}</div>
                    </td>
                    <td className="taskIssueColumn">
                      <div className="taskTextPreviewCell clampTwoLines">{compactText(task.issue, 96)}</div>
                    </td>
                    <td className="taskCompactColumn">
                      <div className="taskPriorityCell">
                        {task.priority ? <Badge tone="gray">{task.priority}</Badge> : <span className="muted">-</span>}
                      </div>
                    </td>
                    <td className="taskStatusColumn">
                      <div className="taskStatusCell">
                        <Badge tone={toStatusTone(task.status)} notionColor={task.statusColor}>
                          {task.status || '미분류'}
                        </Badge>
                        <select
                          className="taskStatusSelect"
                          value={task.status}
                          disabled={Boolean(statusUpdatingIds[task.id])}
                          onChange={(event) => void onQuickStatusChange(task.id, event.target.value)}
                        >
                          {unique([...statusOptions, task.status]).map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td className="taskAssigneeColumn">
                      <AssigneeCell names={task.assignee} />
                    </td>
                    <td className="dateCell taskDateCompactColumn">{task.startDate || '-'}</td>
                    <td className="dateCell taskDateCompactColumn">{task.dueDate || '-'}</td>
                    <td className="dateCell taskDateCompactColumn">{task.actualStartDate || '-'}</td>
                    <td className="dateCell taskDateCompactColumn">{task.actualEndDate || '-'}</td>
                    <td className="taskDependencyColumn">
                      <div className={`taskTextPreviewCell clampTwoLines taskDependencyCell${blockedByPredecessor ? ' taskDependencyCell-blocked' : ''}`}>
                        {compactText(task.predecessorTask, 88)}
                      </div>
                    </td>
                    <td className="taskCompactColumn">
                      <div className={`taskDependencyFlag${blockedByPredecessor ? ' taskDependencyFlag-blocked' : ''}`}>
                        <PredecessorPendingCell value={task.predecessorPending} blocked={blockedByPredecessor} />
                      </div>
                    </td>
                    <td className="taskCompactColumn">
                      <LinkCell href={task.outputLink} />
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </article>
    )
  }

  if (!shouldVirtualizeGroups) {
    return <section className="projectGroups">{groupedTasks.map((group) => renderGroup(group))}</section>
  }

  const scrollMargin = groupVirtualizer.options.scrollMargin ?? groupScrollMargin

  return (
    <section className="projectGroups projectGroupsVirtualized" ref={setGroupsRef}>
      <div className="virtualListInner" style={{ height: `${groupVirtualizer.getTotalSize()}px` }}>
        {groupVirtualizer.getVirtualItems().map((virtualGroup) => {
          const group = groupedTasks[virtualGroup.index]
          if (!group) return null

          return (
            <div
              key={group.key}
              ref={groupVirtualizer.measureElement}
              data-index={virtualGroup.index}
              className="virtualListItem projectGroupVirtualItem"
              style={{ transform: `translateY(${virtualGroup.start - scrollMargin}px)` }}
            >
              {renderGroup(group)}
            </div>
          )
        })}
      </div>
    </section>
  )
}
