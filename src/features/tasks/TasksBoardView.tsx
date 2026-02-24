import { useCallback, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { BoardColumn } from '../../shared/types'
import { Badge, Skeleton } from '../../shared/ui'

const BOARD_CARD_VIRTUALIZATION_THRESHOLD = 60
const BOARD_CARD_OVERSCAN = 6
const BOARD_CARD_ESTIMATE = 152

type TasksBoardViewProps = {
  boardColumns: BoardColumn[]
  loadingList: boolean
  onTaskOpen: (taskId: string) => void
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

type BoardCardButtonProps = {
  task: BoardColumn['items'][number]
  onTaskOpen: (taskId: string) => void
  joinOrDash: (values: string[]) => string
  toStatusTone: (status: string | undefined) => 'gray' | 'red' | 'blue' | 'green'
}

type BoardColumnCardsProps = {
  column: BoardColumn
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

function BoardCardButton({ task, onTaskOpen, joinOrDash, toStatusTone }: BoardCardButtonProps) {
  return (
    <button type="button" className="boardCard" onClick={() => onTaskOpen(task.id)}>
      <Badge tone={toStatusTone(task.status)}>{task.status || '미분류'}</Badge>
      <span className="boardCardTitle">{task.taskName}</span>
      <span className="boardCardMeta">{task.projectName}</span>
      <span className="boardCardMeta">담당: {joinOrDash(task.assignee)}</span>
      <span className="boardCardMeta">마감: {task.dueDate || '-'}</span>
    </button>
  )
}

function BoardColumnCards({ column, onTaskOpen, joinOrDash, toStatusTone }: BoardColumnCardsProps) {
  const [cardsElement, setCardsElement] = useState<HTMLDivElement | null>(null)
  const setCardsRef = useCallback((element: HTMLDivElement | null) => {
    setCardsElement(element)
  }, [])

  const shouldVirtualizeCards = column.items.length >= BOARD_CARD_VIRTUALIZATION_THRESHOLD
  const cardScrollMargin = cardsElement?.offsetTop ?? 0

  const cardVirtualizer = useWindowVirtualizer({
    count: column.items.length,
    estimateSize: () => BOARD_CARD_ESTIMATE,
    overscan: BOARD_CARD_OVERSCAN,
    getItemKey: (index) => column.items[index]?.id ?? `${column.key}-${index}`,
    scrollMargin: cardScrollMargin,
  })

  if (!shouldVirtualizeCards) {
    return (
      <div className="boardCards">
        {column.items.map((task) => (
          <BoardCardButton
            key={task.id}
            task={task}
            onTaskOpen={onTaskOpen}
            joinOrDash={joinOrDash}
            toStatusTone={toStatusTone}
          />
        ))}
      </div>
    )
  }

  const scrollMargin = cardVirtualizer.options.scrollMargin ?? cardScrollMargin

  return (
    <div className="boardCards boardCardsVirtualized" ref={setCardsRef}>
      <div className="virtualListInner" style={{ height: `${cardVirtualizer.getTotalSize()}px` }}>
        {cardVirtualizer.getVirtualItems().map((virtualCard) => {
          const task = column.items[virtualCard.index]
          if (!task) return null

          return (
            <div
              key={task.id}
              ref={cardVirtualizer.measureElement}
              data-index={virtualCard.index}
              className="virtualListItem boardCardVirtualItem"
              style={{ transform: `translateY(${virtualCard.start - scrollMargin}px)` }}
            >
              <BoardCardButton task={task} onTaskOpen={onTaskOpen} joinOrDash={joinOrDash} toStatusTone={toStatusTone} />
            </div>
          )
        })}
      </div>
    </div>
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
          <BoardColumnCards column={column} onTaskOpen={onTaskOpen} joinOrDash={joinOrDash} toStatusTone={toStatusTone} />
        </article>
      ))}
    </section>
  )
}
