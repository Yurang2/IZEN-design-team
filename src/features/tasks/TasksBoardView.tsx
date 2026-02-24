import type { BoardColumn } from '../../shared/types'
import { Badge, EmptyState } from '../../shared/ui'

type TasksBoardViewProps = {
  boardColumns: BoardColumn[]
  loadingList: boolean
  onTaskOpen: (taskId: string) => void
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

export function TasksBoardView({ boardColumns, loadingList, onTaskOpen, joinOrDash, toStatusTone }: TasksBoardViewProps) {
  const hasRows = boardColumns.some((column) => column.items.length > 0)

  return (
    <section className="taskBoard">
      {boardColumns.map((column) => (
        <article key={column.key} className={`boardColumn boardColumn-${column.style}`}>
          <header className="boardColumnHeader">
            <strong>{column.label}</strong>
            <span>{column.items.length}</span>
          </header>
          <div className="boardCards">
            {column.items.map((task) => (
              <button type="button" key={task.id} className="boardCard" onClick={() => onTaskOpen(task.id)}>
                <Badge tone={toStatusTone(task.status)}>{task.status || '미분류'}</Badge>
                <span className="boardCardTitle">{task.taskName}</span>
                <span className="boardCardMeta">{task.projectName}</span>
                <span className="boardCardMeta">담당: {joinOrDash(task.assignee)}</span>
                <span className="boardCardMeta">마감: {task.dueDate || '-'}</span>
              </button>
            ))}
          </div>
        </article>
      ))}
      {!loadingList && !hasRows ? <EmptyState message="조건에 맞는 업무가 없습니다." /> : null}
    </section>
  )
}
