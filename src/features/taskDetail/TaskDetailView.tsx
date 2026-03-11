import { type ChangeEvent, type FormEvent } from 'react'
import type { DetailForm, ProjectRecord, TaskRecord } from '../../shared/types'
import { Button } from '../../shared/ui'

type TaskDetailViewProps = {
  detailTask: TaskRecord | null
  detailForm: DetailForm | null
  detailLoading: boolean
  detailSaving: boolean
  detailError: string | null
  unknownMessages: string[]
  projects: ProjectRecord[]
  statusOptions: string[]
  workTypeOptions: string[]
  onBack: () => void
  onDetailInput: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
  onDetailSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
}

export function TaskDetailView({
  detailTask,
  detailForm,
  detailLoading,
  detailSaving,
  detailError,
  unknownMessages,
  projects,
  statusOptions,
  workTypeOptions,
  onBack,
  onDetailInput,
  onDetailSubmit,
  toProjectLabel,
}: TaskDetailViewProps) {
  return (
    <div className="page">
      <header className="header">
        <h1>업무 상세</h1>
        <p>Notion DB 기반 단일 업무 조회/수정</p>
      </header>

      <div className="toolbar">
        <Button type="button" variant="secondary" onClick={onBack}>
          목록으로
        </Button>
        {detailTask?.url ? (
          <a className="linkButton" href={detailTask.url} target="_blank" rel="noreferrer">
            Notion 원본 열기
          </a>
        ) : null}
      </div>

      {unknownMessages.length > 0 ? (
        <section className="warningBox">
          <strong>스키마 경고 ([UNKNOWN] fallback)</strong>
          <ul>
            {unknownMessages.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {detailLoading ? <p className="muted">상세 로딩 중...</p> : null}
      {detailError ? <p className="error">{detailError}</p> : null}

      {!detailLoading && detailForm ? (
        <form className="detailForm" onSubmit={(event) => void onDetailSubmit(event)}>
          <label>
            귀속 프로젝트
            <select name="projectValue" value={detailForm.projectValue} onChange={onDetailInput}>
              <option value="">선택 안 함</option>
              {projects.map((project) => (
                <option key={project.id} value={project.bindingValue}>
                  {toProjectLabel(project)} {project.source === 'task_select' ? '(select)' : ''}
                </option>
              ))}
            </select>
          </label>

          <label>
            업무
            <input name="taskName" value={detailForm.taskName} onChange={onDetailInput} required />
          </label>

          <label>
            요청주체
            <input name="requesterText" value={detailForm.requesterText} onChange={onDetailInput} placeholder="쉼표로 구분" />
          </label>

          <label>
            업무구분
            <input name="workType" list="workTypeOptions" value={detailForm.workType} onChange={onDetailInput} />
          </label>

          <label>
            상태
            <input name="status" list="statusOptions" value={detailForm.status} onChange={onDetailInput} />
          </label>

          <label>
            담당자
            <input name="assigneeText" value={detailForm.assigneeText} onChange={onDetailInput} placeholder="쉼표로 구분" />
          </label>

          <label>
            접수일
            <input type="date" name="startDate" value={detailForm.startDate} onChange={onDetailInput} />
          </label>

          <label>
            마감일
            <input type="date" name="dueDate" value={detailForm.dueDate} onChange={onDetailInput} />
          </label>

          <label>
            우선순위
            <input name="priority" value={detailForm.priority} onChange={onDetailInput} />
          </label>

          <label className="checkboxLabel">
            <input type="checkbox" name="urgent" checked={detailForm.urgent} onChange={onDetailInput} />
            긴급
          </label>

          <label>
            이슈
            <textarea name="issue" value={detailForm.issue} onChange={onDetailInput} rows={3} />
          </label>

          <label className="fullWidth">
            업무상세
            <textarea name="detail" value={detailForm.detail} onChange={onDetailInput} rows={8} />
          </label>

          <div className="actions fullWidth">
            <Button type="submit" disabled={detailSaving}>
              {detailSaving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </form>
      ) : null}

      <datalist id="statusOptions">
        {statusOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <datalist id="workTypeOptions">
        {workTypeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}
