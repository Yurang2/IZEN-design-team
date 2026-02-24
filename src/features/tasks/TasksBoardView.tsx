import type { BoardColumn } from '../../shared/types'
import { Badge, Skeleton } from '../../shared/ui'

type TasksBoardViewProps = {
  boardColumns: BoardColumn[]
  loadingList: boolean
  onTaskOpen: (taskId: string) => void
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

function BoardSkeleton() {
  return (
    <section className="taskBoard" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, idx) => (
        <article key={`tasks-board-skeleton-${idx}`} className="boardColumn boardColumn-status">
          <header className="boardColumnHeader">
            <Skeleton width="88px" height="18px" />
            <Skeleton width="26px" height="16px" />
          </header>
          <div className="boardCards">
            {Array.from({ length: 3 }).map((__, cardIdx) => (
              <div key={`tasks-board-skeleton-card-${idx}-${cardIdx}`} className="boardCard" role="presentation">
                <Skeleton width="58px" height="18px" />
                <Skeleton width="96%" height="16px" />
                <Skeleton width="78%" height="12px" />
                <Skeleton width="64%" height="12px" />
                <Skeleton width="72%" height="12px" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  )
}

export function TasksBoardView({ boardColumns, loadingList, onTaskOpen, joinOrDash, toStatusTone }: TasksBoardViewProps) {
  if (loadingList) {
    return <BoardSkeleton />
  }

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
    </section>
  )
}
