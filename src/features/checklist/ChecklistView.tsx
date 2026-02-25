import { useRef, type ChangeEvent, type FormEvent } from 'react'
import type {
  ChecklistPreviewFilters,
  ChecklistPreviewItem,
  ChecklistSort,
  ChecklistTableRow,
  ProjectRecord,
} from '../../shared/types'
import { Button, EmptyState, Skeleton, TableWrap } from '../../shared/ui'

type ChecklistViewProps = {
  checklistFilters: ChecklistPreviewFilters
  checklistCategories: string[]
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
  onClearAssignment: (itemId: string) => Promise<void>
  toProjectLabel: (project: ProjectRecord) => string
  toProjectThumbUrl: (project: ProjectRecord | undefined) => string | undefined
  formatDateLabel: (value: string) => string
}

function ChecklistSkeletonTable() {
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
            <th>작업할당여부</th>
            <th>할당 업무</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, idx) => (
            <tr key={`checklist-skeleton-row-${idx}`}>
              {Array.from({ length: 10 }).map((__, colIdx) => (
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
  checklistFilters,
  checklistCategories,
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
  onClearAssignment,
  toProjectLabel,
  toProjectThumbUrl,
  formatDateLabel,
}: ChecklistViewProps) {
  const eventNameRef = useRef<HTMLSelectElement | null>(null)
  const eventCategoryRef = useRef<HTMLSelectElement | null>(null)

  return (
    <section className="checklistPreview">
      <div className="checklistPreviewHeader">
        <h2>행사 체크리스트</h2>
        <p>행사구분으로 항목을 고르고 결과를 확인합니다. 노션 체크리스트 DB의 계산용 오프셋을 사용합니다.</p>
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
          행사구분
          <select ref={eventCategoryRef} name="eventCategory" value={checklistFilters.eventCategory} onChange={onChecklistInput}>
            <option value="">전체</option>
            {checklistCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          배송마감일(해외 출고 기준)
          <input
            type="text"
            name="shippingDate"
            value={checklistFilters.shippingDate}
            onChange={onChecklistInput}
            placeholder="YYYY-MM-DD"
            inputMode="numeric"
            maxLength={10}
          />
        </label>

        <label>
          운영 방식
          <select name="operationMode" value={checklistFilters.operationMode} onChange={onChecklistInput}>
            <option value="">전체</option>
            <option value="self">자체</option>
            <option value="dealer">딜러</option>
          </select>
        </label>

        <label>
          배송 방식
          <select name="fulfillmentMode" value={checklistFilters.fulfillmentMode} onChange={onChecklistInput}>
            <option value="">전체</option>
            <option value="domestic">국내</option>
            <option value="overseas">해외</option>
            <option value="dealer">딜러</option>
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
      <p className="muted small">행사명은 프로젝트 DB에서 선택합니다. 영업일 역산은 주말/한국 공휴일을 제외해 계산하며, 오프셋은 DB에 숫자로 관리합니다.</p>
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
      {selectedChecklistProject ? (
        <p className="muted small projectPreviewLine">
          {toProjectThumbUrl(selectedChecklistProject) ? <img className="projectPreviewImage" src={toProjectThumbUrl(selectedChecklistProject)} alt="" /> : null}
          선택 행사: {selectedChecklistProject.name}
        </p>
      ) : null}
      {selectedChecklistProject?.eventDate ? (
        <p className="muted small">
          기준 행사일: {formatDateLabel(selectedChecklistProject.eventDate)}
        </p>
      ) : null}

      {checklistError ? <p className="error">{checklistError}</p> : null}
      {assignmentSyncError ? <p className="error">{assignmentSyncError}</p> : null}
      {!checklistError ? <p className="muted">조회 결과: {rows.length}건</p> : null}

      {checklistLoading ? <ChecklistSkeletonTable /> : null}

      {!checklistLoading && !checklistError && rows.length === 0 ? (
        <EmptyState
          title="체크리스트 항목이 없습니다"
          message="행사명 또는 행사구분을 선택해 조건을 좁혀보세요."
          actions={[
            {
              label: '행사명 선택',
              variant: 'secondary',
              onClick: () => eventNameRef.current?.focus(),
            },
            {
              label: '행사구분 선택',
              variant: 'secondary',
              onClick: () => eventCategoryRef.current?.focus(),
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
                <th>작업할당여부</th>
                <th>할당 업무</th>
                <th>액션</th>
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
                    <td className="assignmentCell">
                      {row.assignedTaskId ? (
                        <button type="button" className="taskLink" onClick={() => onTaskOpen(row.assignedTaskId)}>
                          {row.assignedTaskLabel || row.assignedTaskId}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="actionCell">
                      {row.isApplicable && !row.isAssigned ? (
                        <Button type="button" variant="secondary" size="mini" disabled={creating} onClick={() => void onCreateTaskFromChecklist(row)}>
                          {creating ? '생성 중...' : '생성'}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        size="mini"
                        disabled={!row.isApplicable || creating}
                        onClick={() => onOpenAssignmentPicker(row.item)}
                      >
                        {row.isApplicable ? (row.isAssigned ? '변경' : '할당') : '미해당'}
                      </Button>
                      {row.isApplicable && row.isAssigned && !creating ? (
                        <Button type="button" variant="secondary" size="mini" disabled={creating} onClick={() => void onClearAssignment(row.item.id)}>
                          해제
                        </Button>
                      ) : null}
                    </td>
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
