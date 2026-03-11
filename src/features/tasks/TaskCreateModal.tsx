import { type ChangeEvent, type FormEvent } from 'react'
import type { CreateForm, ProjectRecord } from '../../shared/types'
import { Button, Modal } from '../../shared/ui'

type TaskCreateModalProps = {
  createOpen: boolean
  createSubmitting: boolean
  createForm: CreateForm
  projects: ProjectRecord[]
  onClose: () => void
  onCreateSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCreateInput: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
  toProjectLabel: (project: ProjectRecord) => string
}

export function TaskCreateModal({
  createOpen,
  createSubmitting,
  createForm,
  projects,
  onClose,
  onCreateSubmit,
  onCreateInput,
  toProjectLabel,
}: TaskCreateModalProps) {
  return (
    <Modal open={createOpen} onClose={onClose}>
      <h3>새 업무 만들기</h3>
      <form onSubmit={(event) => void onCreateSubmit(event)} className="createForm">
        <label>
          귀속 프로젝트
          <select name="projectValue" value={createForm.projectValue} onChange={onCreateInput}>
            <option value="">선택 안 함</option>
            {projects.map((project) => (
              <option key={project.id} value={project.bindingValue}>
                {toProjectLabel(project)}
              </option>
            ))}
          </select>
        </label>

        <label>
          업무
          <input name="taskName" value={createForm.taskName} onChange={onCreateInput} required />
        </label>

        <label>
          업무구분
          <input name="workType" list="workTypeOptions" value={createForm.workType} onChange={onCreateInput} />
        </label>

        <label>
          상태
          <input name="status" list="statusOptions" value={createForm.status} onChange={onCreateInput} />
        </label>

        <label>
          담당자
          <input name="assigneeText" value={createForm.assigneeText} onChange={onCreateInput} placeholder="쉼표로 구분" />
        </label>

        <label>
          접수일
          <input type="date" name="startDate" value={createForm.startDate} onChange={onCreateInput} />
        </label>

        <label>
          마감일
          <input type="date" name="dueDate" value={createForm.dueDate} onChange={onCreateInput} />
        </label>

        <label className="fullWidth">
          업무상세
          <textarea name="detail" rows={6} value={createForm.detail} onChange={onCreateInput} />
        </label>

        <div className="actions fullWidth">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" disabled={createSubmitting}>
            {createSubmitting ? '생성 중...' : '생성'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
