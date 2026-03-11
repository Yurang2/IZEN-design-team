import { type ChangeEvent } from 'react'
import type { Filters, ProjectRecord, TaskSort, TaskViewFilters } from '../../shared/types'
import { Button } from '../../shared/ui'

type TaskFiltersProps = {
  projects: ProjectRecord[]
  filters: Filters
  statusOptions: string[]
  taskSort: TaskSort
  taskViewFilters: TaskViewFilters
  workTypeOptions: string[]
  assigneeOptions: string[]
  requesterOptions: string[]
  onChangeFilter: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onTaskSortChange: (nextSort: TaskSort) => void
  onTaskViewFilterChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onTaskViewFilterReset: () => void
  toProjectLabel: (project: ProjectRecord) => string
}

export function TaskFilters({
  projects,
  filters,
  statusOptions,
  taskSort,
  taskViewFilters,
  workTypeOptions,
  assigneeOptions,
  requesterOptions,
  onChangeFilter,
  onTaskSortChange,
  onTaskViewFilterChange,
  onTaskViewFilterReset,
  toProjectLabel,
}: TaskFiltersProps) {
  return (
    <section className="filters">
      <label>
        프로젝트
        <select name="projectId" value={filters.projectId} onChange={onChangeFilter}>
          <option value="">전체</option>
          {projects.map((project) => (
            <option key={project.id} value={project.bindingValue}>
              {toProjectLabel(project)}
            </option>
          ))}
        </select>
      </label>

      <label>
        상태
        <select name="status" value={filters.status} onChange={onChangeFilter}>
          <option value="">전체</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label>
        검색
        <input name="q" value={filters.q} onChange={onChangeFilter} placeholder="업무/상세 검색" />
      </label>

      <label>
        정렬
        <select name="taskSort" value={taskSort} onChange={(event) => onTaskSortChange(event.target.value as TaskSort)}>
          <option value="due_asc">마감일 빠른순</option>
          <option value="due_desc">마감일 늦은순</option>
          <option value="start_asc">접수일 빠른순</option>
          <option value="start_desc">접수일 늦은순</option>
          <option value="status_asc">상태 오름차순</option>
          <option value="name_asc">업무명 오름차순</option>
        </select>
      </label>

      <label>
        업무구분
        <select name="workType" value={taskViewFilters.workType} onChange={onTaskViewFilterChange}>
          <option value="">전체</option>
          {workTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        담당자
        <select name="assignee" value={taskViewFilters.assignee} onChange={onTaskViewFilterChange}>
          <option value="">전체</option>
          {assigneeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        요청주체
        <select name="requester" value={taskViewFilters.requester} onChange={onTaskViewFilterChange}>
          <option value="">전체</option>
          {requesterOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        마감일 시작
        <input type="date" name="dueFrom" value={taskViewFilters.dueFrom} onChange={onTaskViewFilterChange} />
      </label>

      <label>
        마감일 끝
        <input type="date" name="dueTo" value={taskViewFilters.dueTo} onChange={onTaskViewFilterChange} />
      </label>

      <label className="checkboxLabel flat">
        <input type="checkbox" name="urgentOnly" checked={taskViewFilters.urgentOnly} onChange={onTaskViewFilterChange} />
        긴급만 보기
      </label>

      <label className="checkboxLabel flat">
        <input type="checkbox" name="hideDone" checked={taskViewFilters.hideDone} onChange={onTaskViewFilterChange} />
        완료/보관 숨기기
      </label>

      <div className="filtersActions">
        <Button type="button" variant="secondary" onClick={onTaskViewFilterReset}>
          업무 필터 초기화
        </Button>
      </div>
    </section>
  )
}
