import { useMemo, useState } from 'react'
import type { TaskRecord } from '../../shared/types'
import { Button, Modal } from '../../shared/ui'
import { getTaskAssigneeOptions, isActiveTaskOption, matchesTaskAssignee } from '../../shared/utils/taskOptions'

type RelatedTaskPickerModalProps = {
  open: boolean
  tasks: TaskRecord[]
  selectedTaskId: string
  title?: string
  projectNameFilter?: string
  onClose: () => void
  onSelect: (taskId: string) => void
}

function joinOrDash(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

export function RelatedTaskPickerModal({
  open,
  tasks,
  selectedTaskId,
  title = '관련 업무 선택',
  projectNameFilter = '',
  onClose,
  onSelect,
}: RelatedTaskPickerModalProps) {
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const activeTasks = useMemo(() => {
    const base = tasks.filter(isActiveTaskOption)
    return projectNameFilter ? base.filter((task) => task.projectName === projectNameFilter) : base
  }, [projectNameFilter, tasks])

  const assigneeOptions = useMemo(() => getTaskAssigneeOptions(activeTasks), [activeTasks])

  const candidates = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return activeTasks
      .filter((task) => matchesTaskAssignee(task, assigneeFilter))
      .filter((task) => {
        if (!keyword) return true
        return `${task.projectName} ${task.taskName} ${task.workType} ${task.assignee.join(' ')}`.toLowerCase().includes(keyword)
      })
      .sort((a, b) => `${a.projectName} ${a.taskName}`.localeCompare(`${b.projectName} ${b.taskName}`, 'ko'))
  }, [activeTasks, assigneeFilter, search])

  const selectTask = (taskId: string) => {
    onSelect(taskId)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="assignmentModal relatedTaskModal">
      <h3>{title}</h3>
      <p className="muted small">완료/보관 업무는 제외됩니다.</p>

      <label>
        업무 검색
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="프로젝트명, 업무명, 담당자로 검색" />
      </label>

      <label>
        담당자별 보기
        <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
          <option value="">전체 담당자</option>
          {assigneeOptions.map((assignee) => (
            <option key={assignee} value={assignee}>
              {assignee}
            </option>
          ))}
        </select>
      </label>

      <div className="assignmentModalActions">
        <Button type="button" variant="secondary" onClick={() => selectTask('')}>
          연결 해제
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className="assignmentList">
        {candidates.length === 0 ? <p className="muted">검색 결과가 없습니다.</p> : null}
        {candidates.map((task) => {
          const selected = selectedTaskId === task.id
          return (
            <button key={task.id} type="button" className={selected ? 'assignmentItem selected' : 'assignmentItem'} onClick={() => selectTask(task.id)}>
              <strong>{task.taskName}</strong>
              <span>
                [{task.projectName}] · {task.workType || '-'} · {task.status || '-'}
              </span>
              <span>담당자: {joinOrDash(task.assignee)}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
