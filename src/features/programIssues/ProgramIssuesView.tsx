import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import type {
  ProgramIssueFilters,
  ProgramIssueListResponse,
  ProgramIssuePriority,
  ProgramIssueRecord,
  ProgramIssueResponse,
  ProgramIssueSort,
  ProgramIssueStatus,
  ProgramIssueType,
} from '../../shared/types'
import { api } from '../../shared/api/client'
import { Button, EmptyState, Skeleton } from '../../shared/ui'

const ISSUE_TYPE_OPTIONS: ProgramIssueType[] = ['버그', '개선', '질문', '제안', '기타']
const STATUS_OPTIONS: ProgramIssueStatus[] = ['미해결', '확인중', '진행중', '보류', '해결']
const PRIORITY_OPTIONS: ProgramIssuePriority[] = ['낮음', '보통', '높음', '긴급']

type ProgramIssuesViewProps = {
  configured: boolean
}

type EditState = {
  title: string
  description: string
  issueType: string
  screenName: string
  priority: string
  status: string
  reporter: string
  assignee: string
  holdReason: string
  reproductionSteps: string
  notes: string
  date: string
  resolvedDate: string
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function editStateFromRecord(item: ProgramIssueRecord): EditState {
  return {
    title: item.title ?? '',
    description: item.description ?? '',
    issueType: item.issueType ?? '',
    screenName: item.screenName ?? '',
    priority: item.priority ?? '보통',
    status: item.status ?? '미해결',
    reporter: item.reporter ?? '',
    assignee: item.assignee ?? '',
    holdReason: item.holdReason ?? '',
    reproductionSteps: item.reproductionSteps ?? '',
    notes: item.notes ?? '',
    date: item.date ?? '',
    resolvedDate: item.resolvedDate ?? '',
  }
}

function priorityRank(value?: string): number {
  if (value === '긴급') return 0
  if (value === '높음') return 1
  if (value === '보통') return 2
  return 3
}

function statusRank(value?: string): number {
  if (value === '미해결') return 0
  if (value === '확인중') return 1
  if (value === '진행중') return 2
  if (value === '보류') return 3
  if (value === '해결') return 4
  return 5
}

function statusStyle(value?: string): CSSProperties {
  if (value === '해결') return { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }
  if (value === '보류') return { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
  if (value === '진행중') return { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }
  if (value === '확인중') return { background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd' }
  return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
}

function priorityStyle(value?: string): CSSProperties {
  if (value === '긴급') return { background: '#7f1d1d', color: '#fff', border: '1px solid #991b1b' }
  if (value === '높음') return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
  if (value === '보통') return { background: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' }
  return { background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' }
}

const labelStyle: CSSProperties = { fontSize: '0.8em', color: 'var(--text-sub, #888)', minWidth: 64, flexShrink: 0 }
const rowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

export function ProgramIssuesView({ configured }: ProgramIssuesViewProps) {
  const [items, setItems] = useState<ProgramIssueRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<ProgramIssueSort>('date_desc')
  const [filters, setFilters] = useState<ProgramIssueFilters>({
    status: '',
    issueType: '',
    priority: '',
    q: '',
  })

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newIssueType, setNewIssueType] = useState<ProgramIssueType>('개선')
  const [newScreenName, setNewScreenName] = useState('')
  const [newPriority, setNewPriority] = useState<ProgramIssuePriority>('보통')
  const [newStatus, setNewStatus] = useState<ProgramIssueStatus>('미해결')
  const [newReporter, setNewReporter] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [newHoldReason, setNewHoldReason] = useState('')
  const [newReproductionSteps, setNewReproductionSteps] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newResolvedDate, setNewResolvedDate] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchRef = useRef(0)

  const fetchItems = useCallback(async () => {
    if (!configured) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    const seq = ++fetchRef.current
    try {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.issueType) params.set('issueType', filters.issueType)
      if (filters.priority) params.set('priority', filters.priority)
      if (filters.q) params.set('q', filters.q)
      const path = params.size > 0 ? `/program-issues?${params.toString()}` : '/program-issues'
      const response = await api<ProgramIssueListResponse>(path)
      if (seq !== fetchRef.current) return
      setItems(response.items)
    } catch (err: unknown) {
      if (seq !== fetchRef.current) return
      setError(toErrorMessage(err, '프로그램 이슈를 불러오지 못했습니다.'))
    } finally {
      if (seq === fetchRef.current) setLoading(false)
    }
  }, [configured, filters])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const sortedItems = useMemo(() => {
    const next = [...items]
    if (sort === 'date_desc') {
      next.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    } else if (sort === 'date_asc') {
      next.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    } else if (sort === 'priority_desc') {
      next.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    } else {
      next.sort((a, b) => statusRank(a.status) - statusRank(b.status))
    }
    return next
  }, [items, sort])

  const resetCreateForm = () => {
    setNewTitle('')
    setNewDescription('')
    setNewIssueType('개선')
    setNewScreenName('')
    setNewPriority('보통')
    setNewStatus('미해결')
    setNewReporter('')
    setNewAssignee('')
    setNewHoldReason('')
    setNewReproductionSteps('')
    setNewNotes('')
    setNewResolvedDate('')
    setCreateError(null)
  }

  const handleFilterChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!newTitle.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await api<ProgramIssueResponse>('/program-issues', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim() || undefined,
          issueType: newIssueType,
          screenName: newScreenName.trim() || undefined,
          priority: newPriority,
          status: newStatus,
          reporter: newReporter.trim() || undefined,
          assignee: newAssignee.trim() || undefined,
          holdReason: newHoldReason.trim() || undefined,
          reproductionSteps: newReproductionSteps.trim() || undefined,
          notes: newNotes.trim() || undefined,
          date: today,
          resolvedDate: newStatus === '해결' ? newResolvedDate || today : newResolvedDate || undefined,
        }),
      })
      resetCreateForm()
      setShowCreateForm(false)
      void fetchItems()
    } catch (err: unknown) {
      setCreateError(toErrorMessage(err, '프로그램 이슈 등록에 실패했습니다.'))
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (item: ProgramIssueRecord) => {
    setEditingId(item.id)
    setEdit(editStateFromRecord(item))
  }

  const handleSaveEdit = async (item: ProgramIssueRecord) => {
    if (!edit) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      if (edit.title !== (item.title ?? '')) patch.title = edit.title
      if (edit.description !== (item.description ?? '')) patch.description = edit.description || null
      if (edit.issueType !== (item.issueType ?? '')) patch.issueType = edit.issueType || null
      if (edit.screenName !== (item.screenName ?? '')) patch.screenName = edit.screenName || null
      if (edit.priority !== (item.priority ?? '')) patch.priority = edit.priority || null
      if (edit.status !== (item.status ?? '')) patch.status = edit.status || null
      if (edit.reporter !== (item.reporter ?? '')) patch.reporter = edit.reporter || null
      if (edit.assignee !== (item.assignee ?? '')) patch.assignee = edit.assignee || null
      if (edit.holdReason !== (item.holdReason ?? '')) patch.holdReason = edit.holdReason || null
      if (edit.reproductionSteps !== (item.reproductionSteps ?? '')) patch.reproductionSteps = edit.reproductionSteps || null
      if (edit.notes !== (item.notes ?? '')) patch.notes = edit.notes || null
      if (edit.date !== (item.date ?? '')) patch.date = edit.date || null
      if (edit.resolvedDate !== (item.resolvedDate ?? '')) patch.resolvedDate = edit.resolvedDate || null
      if (edit.status === '해결' && !edit.resolvedDate && !item.resolvedDate) {
        patch.resolvedDate = new Date().toISOString().slice(0, 10)
      }

      if (Object.keys(patch).length > 0) {
        await api<ProgramIssueResponse>(`/program-issues/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        })
      }
      setEditingId(null)
      setEdit(null)
      void fetchItems()
    } catch {
      // Keep the current editor state visible.
    } finally {
      setSaving(false)
    }
  }

  if (!configured) {
    return (
      <EmptyState
        title="프로그램 이슈 DB 미연결"
        message="Cloudflare Workers 환경변수에 NOTION_PROGRAM_ISSUES_DB_ID를 추가하면 프로그램 이슈 트래커가 활성화됩니다."
      />
    )
  }

  return (
    <div className="feedbackView">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select name="status" value={filters.status} onChange={handleFilterChange} style={{ minWidth: 110 }}>
          <option value="">상태 전체</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select name="issueType" value={filters.issueType} onChange={handleFilterChange} style={{ minWidth: 110 }}>
          <option value="">구분 전체</option>
          {ISSUE_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select name="priority" value={filters.priority} onChange={handleFilterChange} style={{ minWidth: 110 }}>
          <option value="">중요도 전체</option>
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>
              {priority}
            </option>
          ))}
        </select>
        <input type="text" name="q" value={filters.q} onChange={handleFilterChange} placeholder="검색.." style={{ minWidth: 160 }} />
        <select value={sort} onChange={(event) => setSort(event.target.value as ProgramIssueSort)} style={{ minWidth: 120 }}>
          <option value="date_desc">최신순</option>
          <option value="date_asc">오래된순</option>
          <option value="priority_desc">중요도순</option>
          <option value="status">상태순</option>
        </select>
        <Button onClick={() => { setShowCreateForm(!showCreateForm); if (showCreateForm) resetCreateForm() }} size="mini">
          {showCreateForm ? '취소' : '+ 이슈 등록'}
        </Button>
      </div>

      {showCreateForm ? (
        <form
          onSubmit={handleCreate}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 14,
            marginBottom: 14,
            background: 'var(--surface-raised, var(--bg-card, #fff))',
          }}
        >
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="이슈 제목 (필수)" required />
            <textarea
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              placeholder="상세 내용"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={rowStyle}>
              <span style={labelStyle}>기본 정보</span>
              <select value={newIssueType} onChange={(event) => setNewIssueType(event.target.value as ProgramIssueType)} style={{ minWidth: 110 }}>
                {ISSUE_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select value={newPriority} onChange={(event) => setNewPriority(event.target.value as ProgramIssuePriority)} style={{ minWidth: 110 }}>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <select value={newStatus} onChange={(event) => setNewStatus(event.target.value as ProgramIssueStatus)} style={{ minWidth: 110 }}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <input value={newScreenName} onChange={(event) => setNewScreenName(event.target.value)} placeholder="화면/기능" style={{ flex: 1, minWidth: 180 }} />
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>담당 정보</span>
              <input value={newReporter} onChange={(event) => setNewReporter(event.target.value)} placeholder="제보자" style={{ minWidth: 120, flex: 1 }} />
              <input value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)} placeholder="담당자" style={{ minWidth: 120, flex: 1 }} />
              <input
                type="date"
                value={newResolvedDate}
                onChange={(event) => setNewResolvedDate(event.target.value)}
                style={{ minWidth: 150 }}
              />
            </div>
            <textarea
              value={newReproductionSteps}
              onChange={(event) => setNewReproductionSteps(event.target.value)}
              placeholder="재현 방법"
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <textarea
              value={newHoldReason}
              onChange={(event) => setNewHoldReason(event.target.value)}
              placeholder="보류 사유"
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <textarea
              value={newNotes}
              onChange={(event) => setNewNotes(event.target.value)}
              placeholder="비고"
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            {createError ? <div style={{ color: 'var(--error, #d32f2f)', fontSize: '0.85em' }}>{createError}</div> : null}
            <div>
              <Button type="submit" disabled={creating || !newTitle.trim()} size="mini">
                {creating ? '등록 중..' : '등록'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <Skeleton height="52px" />
          <Skeleton height="52px" />
          <Skeleton height="52px" />
        </div>
      ) : null}
      {error ? <div style={{ color: 'var(--error, #d32f2f)', marginBottom: 8 }}>{error}</div> : null}
      {!loading && !error && sortedItems.length === 0 ? <EmptyState message="등록된 프로그램 이슈가 없습니다." /> : null}

      {!loading && sortedItems.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {sortedItems.map((item) => {
            const isEditing = editingId === item.id && edit !== null
            const currentStatusStyle = statusStyle(item.status)
            const currentPriorityStyle = priorityStyle(item.priority)

            return (
              <article
                key={item.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  background: item.status === '해결' ? 'var(--surface-muted, #f5f5f5)' : undefined,
                  opacity: item.status === '해결' ? 0.78 : 1,
                }}
              >
                {!isEditing ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6, wordBreak: 'break-word' }}>{item.title}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.8em', opacity: 0.85, marginBottom: 8 }}>
                          {item.issueType ? <span>{item.issueType}</span> : null}
                          {item.screenName ? <span>{item.screenName}</span> : null}
                          {item.reporter ? <span>제보 {item.reporter}</span> : null}
                          {item.assignee ? <span>담당 {item.assignee}</span> : null}
                          {item.date ? <span>등록 {item.date}</span> : null}
                          {item.resolvedDate ? <span>해결 {item.resolvedDate}</span> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={{ borderRadius: 999, padding: '2px 8px', fontSize: '0.78em', ...currentPriorityStyle }}>{item.priority ?? '보통'}</span>
                        <span style={{ borderRadius: 999, padding: '2px 8px', fontSize: '0.78em', ...currentStatusStyle }}>{item.status ?? '미해결'}</span>
                        <Button size="mini" onClick={() => openEdit(item)}>편집</Button>
                      </div>
                    </div>
                    {item.description ? <div style={{ fontSize: '0.9em', whiteSpace: 'pre-wrap', marginBottom: 8 }}>{item.description}</div> : null}
                    {item.reproductionSteps ? (
                      <div style={{ fontSize: '0.82em', color: 'var(--text-sub, #666)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                        <strong>재현 방법:</strong> {item.reproductionSteps}
                      </div>
                    ) : null}
                    {item.holdReason ? (
                      <div style={{ fontSize: '0.82em', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                        <strong>보류 사유:</strong> {item.holdReason}
                      </div>
                    ) : null}
                    {item.notes ? (
                      <div style={{ fontSize: '0.82em', color: 'var(--text-sub, #666)', whiteSpace: 'pre-wrap' }}>
                        <strong>비고:</strong> {item.notes}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <input value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} />
                    <textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} rows={3} style={{ width: '100%', resize: 'vertical' }} />
                    <div style={rowStyle}>
                      <select value={edit.issueType} onChange={(event) => setEdit({ ...edit, issueType: event.target.value })} style={{ minWidth: 110 }}>
                        <option value="">구분 미지정</option>
                        {ISSUE_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select value={edit.priority} onChange={(event) => setEdit({ ...edit, priority: event.target.value })} style={{ minWidth: 110 }}>
                        <option value="">중요도 미지정</option>
                        {PRIORITY_OPTIONS.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                      <select value={edit.status} onChange={(event) => setEdit({ ...edit, status: event.target.value })} style={{ minWidth: 110 }}>
                        <option value="">상태 미지정</option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <input value={edit.screenName} onChange={(event) => setEdit({ ...edit, screenName: event.target.value })} placeholder="화면/기능" style={{ flex: 1, minWidth: 180 }} />
                    </div>
                    <div style={rowStyle}>
                      <input value={edit.reporter} onChange={(event) => setEdit({ ...edit, reporter: event.target.value })} placeholder="제보자" style={{ minWidth: 120, flex: 1 }} />
                      <input value={edit.assignee} onChange={(event) => setEdit({ ...edit, assignee: event.target.value })} placeholder="담당자" style={{ minWidth: 120, flex: 1 }} />
                      <input type="date" value={edit.date} onChange={(event) => setEdit({ ...edit, date: event.target.value })} style={{ minWidth: 150 }} />
                      <input type="date" value={edit.resolvedDate} onChange={(event) => setEdit({ ...edit, resolvedDate: event.target.value })} style={{ minWidth: 150 }} />
                    </div>
                    <textarea value={edit.reproductionSteps} onChange={(event) => setEdit({ ...edit, reproductionSteps: event.target.value })} placeholder="재현 방법" rows={2} style={{ width: '100%', resize: 'vertical' }} />
                    <textarea value={edit.holdReason} onChange={(event) => setEdit({ ...edit, holdReason: event.target.value })} placeholder="보류 사유" rows={2} style={{ width: '100%', resize: 'vertical' }} />
                    <textarea value={edit.notes} onChange={(event) => setEdit({ ...edit, notes: event.target.value })} placeholder="비고" rows={2} style={{ width: '100%', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="mini" disabled={saving || !edit.title.trim()} onClick={() => void handleSaveEdit(item)}>
                        {saving ? '저장 중..' : '저장'}
                      </Button>
                      <Button size="mini" variant="secondary" onClick={() => { setEditingId(null); setEdit(null) }}>
                        취소
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
