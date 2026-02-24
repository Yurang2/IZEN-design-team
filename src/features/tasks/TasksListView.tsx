import type { ProjectRecord, TaskGroup } from '../../shared/types'
import { EmptyState, TableWrap } from '../../shared/ui'

type TasksListViewProps = {
  groupedTasks: TaskGroup[]
  projectByName: Map<string, ProjectRecord>
  openTaskGroups: Record<string, boolean>
  statusUpdatingIds: Record<string, boolean>
  statusOptions: string[]
  loadingList: boolean
  onToggleTaskGroup: (projectName: string) => void
  onTaskOpen: (taskId: string) => void
  onQuickStatusChange: (taskId: string, nextStatus: string) => Promise<void>
  unique: (values: string[]) => string[]
  joinOrDash: (values: string[]) => string
}

export function TasksListView({
  groupedTasks,
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
}: TasksListViewProps) {
  return (
    <section className="projectGroups">
      {groupedTasks.map((group) => {
        const groupProject = projectByName.get(group.projectName)
        return (
          <article className="projectSection" key={group.projectName}>
            <header className="projectHeader">
              <button type="button" className="taskGroupToggle" onClick={() => onToggleTaskGroup(group.projectName)}>
                {openTaskGroups[group.projectName] === false ? '펼치기' : '접기'}
              </button>
              <h2 className="projectTitle">
                {groupProject?.coverUrl ? <img className="projectCoverImage" src={groupProject.coverUrl} alt="" /> : null}
                {groupProject?.iconUrl ? <img className="projectIconImage" src={groupProject.iconUrl} alt="" /> : null}
                {groupProject?.iconEmoji ? <span className="projectIconEmoji">{groupProject.iconEmoji}</span> : null}
                <span>{group.projectName}</span>
              </h2>
              <span>{group.tasks.length}건</span>
            </header>

            {openTaskGroups[group.projectName] === false ? null : (
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
                          <select
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
                        </td>
                        <td>{joinOrDash(task.assignee)}</td>
                        <td>{task.startDate || '-'}</td>
                        <td>{task.dueDate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </article>
        )
      })}

      {!loadingList && groupedTasks.length === 0 ? <EmptyState message="조건에 맞는 업무가 없습니다." /> : null}
    </section>
  )
}
