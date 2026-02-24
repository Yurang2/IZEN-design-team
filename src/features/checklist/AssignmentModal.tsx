import type { ChecklistAssignmentTarget, TaskRecord } from '../../shared/types'
import { Button, Modal } from '../../shared/ui'

type AssignmentModalProps = {
  assignmentTarget: ChecklistAssignmentTarget | null
  assignmentSearch: string
  assignmentProjectFilter: string
  assignmentProjectOptions: string[]
  assignmentCandidates: TaskRecord[]
  assignmentTargetCurrentTaskId: string
  onClose: () => void
  onAssignmentSearchChange: (value: string) => void
  onAssignmentProjectFilterChange: (value: string) => void
  onSelectAssignmentTask: (taskId: string) => Promise<void>
  joinOrDash: (values: string[]) => string
}

export function AssignmentModal({
  assignmentTarget,
  assignmentSearch,
  assignmentProjectFilter,
  assignmentProjectOptions,
  assignmentCandidates,
  assignmentTargetCurrentTaskId,
  onClose,
  onAssignmentSearchChange,
  onAssignmentProjectFilterChange,
  onSelectAssignmentTask,
  joinOrDash,
}: AssignmentModalProps) {
  return (
    <Modal open={Boolean(assignmentTarget)} onClose={onClose} className="assignmentModal">
      <h3>할당 업무 선택</h3>
      <p className="muted small">
        대상 제작물: <strong>{assignmentTarget?.productName || '-'}</strong> / 작업분류: {assignmentTarget?.workCategory || '-'}
      </p>

      <label>
        업무 검색
        <input
          value={assignmentSearch}
          onChange={(event) => onAssignmentSearchChange(event.target.value)}
          placeholder="프로젝트명, 업무명, 업무구분으로 검색"
        />
      </label>

      <label>
        프로젝트별 보기
        <select value={assignmentProjectFilter} onChange={(event) => onAssignmentProjectFilterChange(event.target.value)}>
          <option value="">전체 프로젝트</option>
          {assignmentProjectOptions.map((projectName) => (
            <option key={projectName} value={projectName}>
              {projectName}
            </option>
          ))}
        </select>
      </label>

      <div className="assignmentModalActions">
        <Button type="button" variant="secondary" onClick={() => void onSelectAssignmentTask('')}>
          미할당 처리
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          닫기
        </Button>
      </div>

      <div className="assignmentList">
        {assignmentCandidates.length === 0 ? <p className="muted">검색 결과가 없습니다.</p> : null}
        {assignmentCandidates.map((task) => {
          const selected = assignmentTargetCurrentTaskId === task.id
          return (
            <button
              key={task.id}
              type="button"
              className={selected ? 'assignmentItem selected' : 'assignmentItem'}
              onClick={() => void onSelectAssignmentTask(task.id)}
            >
              <strong>{task.taskName}</strong>
              <span>
                [{task.projectName}] · {task.workType || '-'} · {task.status}
              </span>
              <span>담당자: {joinOrDash(task.assignee)}</span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
