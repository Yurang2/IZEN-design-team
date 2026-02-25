import { type ChangeEvent } from 'react'
import type {
  BoardColumn,
  Filters,
  ProjectRecord,
  TaskGroup,
  TaskLayoutMode,
  TaskQuickGroupBy,
  TaskSort,
  TaskViewFilters,
} from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { TaskFilters } from './TaskFilters'
import { TasksBoardView } from './TasksBoardView'
import { TasksListView } from './TasksListView'

type TasksViewProps = {
  taskLayout: TaskLayoutMode
  taskQuickGroupBy: TaskQuickGroupBy
  showTaskFilters: boolean
  projects: ProjectRecord[]
  filters: Filters
  statusOptions: string[]
  taskSort: TaskSort
  taskViewFilters: TaskViewFilters
  workTypeOptions: string[]
  assigneeOptions: string[]
  requesterOptions: string[]
  groupedTasks: TaskGroup[]
  boardColumns: BoardColumn[]
  projectByName: Map<string, ProjectRecord>
  openTaskGroups: Record<string, boolean>
  statusUpdatingIds: Record<string, boolean>
  loadingList: boolean
  listError: string | null
  unknownMessages: string[]
  onChangeFilter: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onTaskSortChange: (nextSort: TaskSort) => void
  onTaskViewFilterChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onTaskViewFilterReset: () => void
  onToggleTaskFilters: () => void
  onTaskFiltersResetAll: () => void
  onOpenTaskCreate: () => void
  onToggleTaskGroup: (groupKey: string) => void
  onTaskOpen: (taskId: string) => void
  onQuickStatusChange: (taskId: string, nextStatus: string) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
  joinOrDash: (values: string[]) => string
  unique: (values: string[]) => string[]
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

export function TasksView({
  taskLayout,
  taskQuickGroupBy,
  showTaskFilters,
  projects,
  filters,
  statusOptions,
  taskSort,
  taskViewFilters,
  workTypeOptions,
  assigneeOptions,
  requesterOptions,
  groupedTasks,
  boardColumns,
  projectByName,
  openTaskGroups,
  statusUpdatingIds,
  loadingList,
  listError,
  unknownMessages,
  onChangeFilter,
  onTaskSortChange,
  onTaskViewFilterChange,
  onTaskViewFilterReset,
  onToggleTaskFilters,
  onTaskFiltersResetAll,
  onOpenTaskCreate,
  onToggleTaskGroup,
  onTaskOpen,
  onQuickStatusChange,
  toProjectLabel,
  joinOrDash,
  unique,
  toStatusTone,
}: TasksViewProps) {
  const isEmpty = !loadingList && !listError && groupedTasks.length === 0

  return (
    <>
      <section className="taskFiltersShell">
        <header className="taskFiltersHeader">
          <strong>검색/필터</strong>
          <button type="button" className="secondary taskFiltersToggle" onClick={onToggleTaskFilters}>
            {showTaskFilters ? '검색/필터 숨기기' : '검색/필터 펼치기'}
          </button>
        </header>
        {showTaskFilters ? (
          <TaskFilters
            projects={projects}
            filters={filters}
            statusOptions={statusOptions}
            taskSort={taskSort}
            taskViewFilters={taskViewFilters}
            workTypeOptions={workTypeOptions}
            assigneeOptions={assigneeOptions}
            requesterOptions={requesterOptions}
            onChangeFilter={onChangeFilter}
            onTaskSortChange={onTaskSortChange}
            onTaskViewFilterChange={onTaskViewFilterChange}
            onTaskViewFilterReset={onTaskViewFilterReset}
            toProjectLabel={toProjectLabel}
          />
        ) : null}
      </section>

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

      {listError ? <p className="error">{listError}</p> : null}

      {taskLayout === 'list' ? (
        <TasksListView
          groupedTasks={groupedTasks}
          taskQuickGroupBy={taskQuickGroupBy}
          projectByName={projectByName}
          openTaskGroups={openTaskGroups}
          statusUpdatingIds={statusUpdatingIds}
          statusOptions={statusOptions}
          loadingList={loadingList}
          onToggleTaskGroup={onToggleTaskGroup}
          onTaskOpen={onTaskOpen}
          onQuickStatusChange={onQuickStatusChange}
          unique={unique}
          joinOrDash={joinOrDash}
          toStatusTone={toStatusTone}
        />
      ) : (
        <TasksBoardView
          layout={taskLayout}
          boardColumns={boardColumns}
          loadingList={loadingList}
          onTaskOpen={onTaskOpen}
          joinOrDash={joinOrDash}
          toStatusTone={toStatusTone}
        />
      )}

      {isEmpty ? (
        <EmptyState
          title="조건에 맞는 업무가 없습니다"
          message="필터를 조정하거나 새 업무를 생성해 시작해보세요."
          actions={[
            { label: '필터 초기화', variant: 'secondary', onClick: onTaskFiltersResetAll },
            { label: '새 업무 만들기', variant: 'primary', onClick: onOpenTaskCreate },
          ]}
        />
      ) : null}
    </>
  )
}
