import { useCallback, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { emojiToTwemojiUrl, formatProjectIconLabel } from '../../shared/emoji'
import type { ProjectRecord, TaskGroup, TaskQuickGroupBy } from '../../shared/types'
import { Badge, Skeleton, TableWrap } from '../../shared/ui'

const GROUP_VIRTUALIZATION_THRESHOLD = 18
const GROUP_VIRTUAL_OVERSCAN = 3
const GROUP_ROW_ESTIMATE = 44
const GROUP_BASE_ESTIMATE = 84
const GROUP_COLLAPSED_ESTIMATE = 68
const GROUP_ESTIMATE_CAP = 12

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

function ListSkeleton() {
  return (
    <section className="projectGroups" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, idx) => (
        <article className="projectSection" key={`tasks-list-skeleton-${idx}`}>
          <header className="projectHeader">
            <Skeleton width="72px" height="28px" />
            <Skeleton width="220px" height="20px" />
            <Skeleton width="36px" height="18px" />
          </header>
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>요청주체</th>
                  <th>업무구분</th>
                  <th>업무</th>
                  <th>상태</th>
                  <th>담당자</th>
                  <th>시작일</th>
                  <th>마감일</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 4 }).map((__, rowIdx) => (
                  <tr key={`tasks-list-skeleton-row-${idx}-${rowIdx}`}>
                    {Array.from({ length: 7 }).map((___, colIdx) => (
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
    return (
      <article className="projectSection" key={group.key}>
        <header className="projectHeader">
          <button type="button" className="taskGroupToggle" onClick={() => onToggleTaskGroup(group.key)}>
            {openTaskGroups[group.key] === false ? '펼치기' : '접기'}
          </button>
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
          <span>{group.tasks.length}건</span>
        </header>

        {openTaskGroups[group.key] === false ? null : (
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>요청주체</th>
                  <th>업무구분</th>
                  <th>업무</th>
                  <th>상태</th>
                  <th>담당자</th>
                  <th>시작일</th>
                  <th>마감일</th>
                </tr>
              </thead>
              <tbody>
                {group.tasks.map((task) => (
                  <tr key={task.id}>
                    <td>{joinOrDash(task.requester)}</td>
                    <td>{task.workType || '-'}</td>
                    <td>
                      <button type="button" className="taskLink" onClick={() => onTaskOpen(task.id)}>
                        {task.taskName}
                      </button>
                    </td>
                    <td>
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
                    <td>{joinOrDash(task.assignee)}</td>
                    <td className="dateCell">{task.startDate || '-'}</td>
                    <td className="dateCell">{task.dueDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
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
