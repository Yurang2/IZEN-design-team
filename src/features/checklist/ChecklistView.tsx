import { useMemo, useRef, type ChangeEvent, type FormEvent } from 'react'
import type {
  ChecklistPreviewFilters,
  ChecklistPreviewItem,
  ChecklistSort,
  ChecklistTableRow,
  ProjectRecord,
} from '../../shared/types'
import { Button, EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ChecklistViewProps = {
  mode: 'schedule_share' | 'assignment'
  checklistFilters: ChecklistPreviewFilters
  checklistSort: ChecklistSort
  checklistLoading: boolean
  checklistError: string | null
  assignmentSyncError: string | null
  assignmentStorageMode: 'notion_matrix' | 'd1' | 'cache'
  prioritizeUnassignedChecklist: boolean
  projectDbOptions: ProjectRecord[]
  selectedChecklistProject: ProjectRecord | undefined
  rows: ChecklistTableRow[]
  onChecklistInput: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void
  onChecklistSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onChecklistReset: () => Promise<void>
  onChecklistSortChange: (nextSort: ChecklistSort) => void
  onTogglePrioritizeUnassignedChecklist: (nextValue: boolean) => void
  creatingTaskByChecklistId: Record<string, boolean>
  onCreateTaskFromChecklist: (row: ChecklistTableRow) => Promise<void>
  onTaskOpen: (taskId: string) => void
  onOpenAssignmentPicker: (item: ChecklistPreviewItem) => void
  onSetNotApplicable: (itemId: string) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
  toProjectThumbUrl: (project: ProjectRecord | undefined) => string | undefined
  formatDateLabel: (value: string) => string
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function toOperationModeLabel(value: ProjectRecord['operationMode']): string {
  if (value === 'self') return '자체'
  if (value === 'dealer') return '딜러'
  return '-'
}

function toFulfillmentModeLabel(value: ProjectRecord['fulfillmentMode']): string {
  if (value === 'domestic') return '국내'
  if (value === 'overseas') return '해외'
  if (value === 'dealer') return '딜러'
  return '-'
}

function toEventLeadLabel(dueDate: string | undefined, eventDate: string | undefined): string {
  const due = parseIsoDate(dueDate)
  const event = parseIsoDate(eventDate)
  if (!due || !event) return '-'

  const leadDays = diffDays(due, event)
  if (leadDays === 0) return 'D-Day'
  if (leadDays > 0) return `D-${leadDays}`
  return `D+${Math.abs(leadDays)}`
}

function ChecklistSkeletonTable({ isAssignmentMode }: { isAssignmentMode: boolean }) {
  const columnCount = isAssignmentMode ? 10 : 8
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>제작물</th>
            <th>작업분류</th>
            <th>디자인 소요(일)</th>
            <th>실물 제작 소요(일)</th>
            <th>총 소요(일)</th>
            <th>역산 완료 예정일</th>
            <th>최종 완료 시점</th>
            {!isAssignmentMode ? <th>행사일 기준</th> : null}
            {isAssignmentMode ? <th>작업할당여부</th> : null}
            {isAssignmentMode ? <th>할당 업무</th> : null}
            {isAssignmentMode ? <th>액션</th> : null}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, idx) => (
            <tr key={`checklist-skeleton-row-${idx}`}>
              {Array.from({ length: columnCount }).map((__, colIdx) => (
                <td key={`checklist-skeleton-col-${idx}-${colIdx}`}>
                  <Skeleton width="100%" height="14px" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

export function ChecklistView({
  mode,
  checklistFilters,
  checklistSort,
  checklistLoading,
  checklistError,
  assignmentSyncError,
  assignmentStorageMode,
  prioritizeUnassignedChecklist,
  projectDbOptions,
  selectedChecklistProject,
  rows,
  onChecklistInput,
  onChecklistSubmit,
  onChecklistReset,
  onChecklistSortChange,
  onTogglePrioritizeUnassignedChecklist,
  creatingTaskByChecklistId,
  onCreateTaskFromChecklist,
  onTaskOpen,
  onOpenAssignmentPicker,
  onSetNotApplicable,
  toProjectLabel,
  toProjectThumbUrl,
  formatDateLabel,
}: ChecklistViewProps) {
  const eventNameRef = useRef<HTMLSelectElement | null>(null)
  const isAssignmentMode = mode === 'assignment'

  const scheduleSummary = useMemo(() => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    let overdue = 0
    let dueToday = 0
    let upcoming = 0
    for (const row of rows) {
      if (!row.computedDueDate) continue
      if (row.computedDueDate < today) overdue += 1
      else if (row.computedDueDate === today) dueToday += 1
      else upcoming += 1
    }

    return {
      total: rows.length,
      overdue,
      dueToday,
      upcoming,
    }
  }, [rows])

  return (
    <section className="checklistPreview">
      <div className="checklistPreviewHeader">
        <h2>{isAssignmentMode ? '행사 할당 관리' : '행사 일정공유'}</h2>
        <p>
          {isAssignmentMode
            ? '노션 프로젝트 DB 값을 기준으로 항목을 생성/할당/해당없음 처리합니다.'
            : '행사진행일 기준으로 D-day 역산 일정을 빠르게 공유할 수 있습니다.'}
        </p>
      </div>

      <form className="checklistPreviewFilters" onSubmit={(event) => void onChecklistSubmit(event)}>
        <label>
          행사명
          <select ref={eventNameRef} name="eventName" value={checklistFilters.eventName} onChange={onChecklistInput}>
            <option value="">프로젝트 선택 안 함</option>
            {projectDbOptions.map((project) => (
              <option key={project.id} value={project.name}>
                {toProjectLabel(project)}
              </option>
            ))}
          </select>
        </label>

        <label>
          정렬
          <select value={checklistSort} onChange={(event) => onChecklistSortChange(event.target.value as ChecklistSort)}>
            <option value="due_asc">완료예정일 빠른순</option>
            <option value="due_desc">완료예정일 늦은순</option>
            <option value="name_asc">제작물 이름 오름차순</option>
            <option value="name_desc">제작물 이름 내림차순</option>
            <option value="lead_asc">총 소요일 짧은순</option>
            <option value="lead_desc">총 소요일 긴순</option>
          </select>
        </label>

        <div className="checklistPreviewActions">
          <Button type="submit" disabled={checklistLoading}>
            {checklistLoading ? '조회 중...' : '체크리스트 보기'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void onChecklistReset()} disabled={checklistLoading}>
            초기화
          </Button>
        </div>
      </form>
      <p className="muted small">행사명을 선택하면 행사분류/배송마감일/운영방식/배송방식은 프로젝트 DB 값을 자동으로 사용합니다.</p>

      {isAssignmentMode ? (
        <>
          <label className="checkboxLabel flat">
            <input
              type="checkbox"
              checked={prioritizeUnassignedChecklist}
              onChange={(event) => onTogglePrioritizeUnassignedChecklist(event.target.checked)}
            />
            미할당 우선 정렬
          </label>
          <p className="muted small">
            할당 저장소:{' '}
            {assignmentStorageMode === 'notion_matrix'
              ? '노션 행사-체크리스트 할당 매트릭스(단일 소스)'
              : assignmentStorageMode === 'd1'
                ? 'D1(레거시 보조)'
                : 'Cache(레거시 보조)'}
          </p>
        </>
      ) : null}

      {selectedChecklistProject ? (
        <p className="muted small projectPreviewLine">
          {toProjectThumbUrl(selectedChecklistProject) ? <img className="projectPreviewImage" src={toProjectThumbUrl(selectedChecklistProject)} alt="" /> : null}
          선택 행사: {selectedChecklistProject.name}
        </p>
      ) : null}

      {selectedChecklistProject ? (
        <section className="checklistProjectMeta">
          <article>
            <span>행사분류</span>
            <strong>{selectedChecklistProject.eventCategory || '-'}</strong>
          </article>
          <article>
            <span>배송마감일</span>
            <strong>{selectedChecklistProject.shippingDate ? formatDateLabel(selectedChecklistProject.shippingDate) : '-'}</strong>
          </article>
          <article>
            <span>운영방식</span>
            <strong>{toOperationModeLabel(selectedChecklistProject.operationMode)}</strong>
          </article>
          <article>
            <span>배송방식</span>
            <strong>{toFulfillmentModeLabel(selectedChecklistProject.fulfillmentMode)}</strong>
          </article>
          <article>
            <span>행사진행일</span>
            <strong>{selectedChecklistProject.eventDate ? formatDateLabel(selectedChecklistProject.eventDate) : '-'}</strong>
          </article>
        </section>
      ) : null}

      {!isAssignmentMode && selectedChecklistProject ? (
        <section className="scheduleSummary" aria-label="일정 요약">
          <article>
            <span>전체 항목</span>
            <strong>{scheduleSummary.total}</strong>
          </article>
          <article>
            <span>오늘 마감</span>
            <strong>{scheduleSummary.dueToday}</strong>
          </article>
          <article>
            <span>지난 마감</span>
            <strong>{scheduleSummary.overdue}</strong>
          </article>
          <article>
            <span>남은 마감</span>
            <strong>{scheduleSummary.upcoming}</strong>
          </article>
        </section>
      ) : null}

      {checklistError ? <p className="error">{checklistError}</p> : null}
      {assignmentSyncError ? <p className="error">{assignmentSyncError}</p> : null}
      {!checklistError ? <p className="muted">조회 결과: {rows.length}건</p> : null}

      {checklistLoading ? <ChecklistSkeletonTable isAssignmentMode={isAssignmentMode} /> : null}

      {!checklistLoading && !checklistError && rows.length === 0 ? (
        <EmptyState
          title="체크리스트 항목이 없습니다"
          message="행사명을 선택한 뒤 체크리스트를 조회해 주세요."
          actions={[
            {
              label: '행사명 선택',
              variant: 'secondary',
              onClick: () => eventNameRef.current?.focus(),
            },
          ]}
        />
      ) : null}

      {!checklistLoading && rows.length > 0 ? (
        <TableWrap>
          <table>
            <thead>
              <tr>
                <th>제작물</th>
                <th>작업분류</th>
                <th>디자인 소요(일)</th>
                <th>실물 제작 소요(일)</th>
                <th>총 소요(일)</th>
                <th>역산 완료 예정일</th>
                <th>최종 완료 시점</th>
                {!isAssignmentMode ? <th>행사일 기준</th> : null}
                {isAssignmentMode ? <th>작업할당여부</th> : null}
                {isAssignmentMode ? <th>할당 업무</th> : null}
                {isAssignmentMode ? <th>액션</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const creating = creatingTaskByChecklistId[row.item.id] === true
                return (
                  <tr key={row.item.id} className={row.assignmentStatus === 'not_applicable' ? 'checklistRow isNotApplicable' : 'checklistRow'}>
                    <td>{row.item.productName || '-'}</td>
                    <td>{row.item.workCategory || '-'}</td>
                    <td>{row.item.designLeadDays ?? '-'}</td>
                    <td>{row.item.productionLeadDays ?? '-'}</td>
                    <td>{row.totalLeadDays ?? '-'}</td>
                    <td className="dateCell">{row.computedDueDate ? formatDateLabel(row.computedDueDate) : '-'}</td>
                    <td>{row.item.finalDueText || '-'}</td>
                    {!isAssignmentMode ? <td>{toEventLeadLabel(row.computedDueDate, selectedChecklistProject?.eventDate)}</td> : null}

                    {isAssignmentMode ? (
                      <td>
                        <span
                          className={`assignmentBadge ${
                            row.assignmentStatus === 'not_applicable'
                              ? 'notApplicable'
                              : row.assignmentStatus === 'assigned'
                                ? 'assigned'
                                : 'unassigned'
                          }`}
                        >
                          {row.assignmentStatusLabel}
                        </span>
                      </td>
                    ) : null}

                    {isAssignmentMode ? (
                      <td className="assignmentCell">
                        {row.assignedTaskId ? (
                          <button type="button" className="taskLink" onClick={() => onTaskOpen(row.assignedTaskId)}>
                            {row.assignedTaskLabel || row.assignedTaskId}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                    ) : null}

                    {isAssignmentMode ? (
                      <td className="actionCell">
                        <Button type="button" variant="secondary" size="mini" disabled={creating || row.isAssigned} onClick={() => void onCreateTaskFromChecklist(row)}>
                          {creating ? '생성 중...' : '생성'}
                        </Button>
                        <Button type="button" variant="secondary" size="mini" disabled={creating} onClick={() => onOpenAssignmentPicker(row.item)}>
                          {row.isAssigned ? '재할당' : '할당'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="mini"
                          className={row.assignmentStatus === 'not_applicable' ? 'is-active' : ''}
                          disabled={creating || row.assignmentStatus === 'not_applicable'}
                          onClick={() => void onSetNotApplicable(row.item.id)}
                        >
                          해당없음
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrap>
      ) : null}
    </section>
  )
}
