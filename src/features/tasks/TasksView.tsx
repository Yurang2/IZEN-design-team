import { type ChangeEvent } from 'react'
import type {
  BoardColumn,
  Filters,
  ProjectRecord,
  TaskGroup,
  TaskLayoutMode,
  TaskSort,
  TaskViewFilters,
} from '../../shared/types'
import { TaskFilters } from './TaskFilters'
import { TasksBoardView } from './TasksBoardView'
import { TasksListView } from './TasksListView'

type TasksViewProps = {
  taskLayout: TaskLayoutMode
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
  onToggleTaskGroup: (projectName: string) => void
  onTaskOpen: (taskId: string) => void
  onQuickStatusChange: (taskId: string, nextStatus: string) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
  joinOrDash: (values: string[]) => string
  unique: (values: string[]) => string[]
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

export function TasksView({
  taskLayout,
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
  onToggleTaskGroup,
  onTaskOpen,
  onQuickStatusChange,
  toProjectLabel,
  joinOrDash,
  unique,
  toStatusTone,
}: TasksViewProps) {
  return (
    <>
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

      {loadingList ? <p className="muted">업무 목록 로딩 중...</p> : null}
      {listError ? <p className="error">{listError}</p> : null}

      {taskLayout === 'list' ? (
        <TasksListView
          groupedTasks={groupedTasks}
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
        />
      ) : (
        <TasksBoardView
          boardColumns={boardColumns}
          loadingList={loadingList}
          onTaskOpen={onTaskOpen}
          joinOrDash={joinOrDash}
          toStatusTone={toStatusTone}
        />
      )}
    </>
  )
}
