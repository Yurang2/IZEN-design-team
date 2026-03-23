import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type {
  FeedbackFilters,
  FeedbackListResponse,
  FeedbackRecord,
  FeedbackResponse,
  FeedbackSort,
  ProjectRecord,
} from '../../shared/types'
import { api } from '../../shared/api/client'
import { Button, EmptyState, Skeleton } from '../../shared/ui'

type FeedbackViewProps = {
  projects: ProjectRecord[]
  loadingProjects: boolean
  initialEventCategory?: string
}

const DOMAIN_OPTIONS = ['디자인', '물류', '현장운영', '커뮤니케이션', '제작', '영상', '인쇄', '기타']
const COLLECTION_METHOD_OPTIONS = ['메신저', '회의', '구두', '이메일', '기타']
const PRIORITY_OPTIONS = ['높음', '보통', '낮음']
const REFLECTION_STATUS_OPTIONS = ['미반영', '반영중', '반영완료']

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

type EditState = {
  content: string
  sourceProjectId: string
  eventCategory: string
  domainTags: string[]
  reporter: string
  collectionMethod: string
  priority: string
  reflectionStatus: string
  appliedProjectId: string
  recurring: boolean
  notes: string
}

function editStateFromRecord(item: FeedbackRecord): EditState {
  return {
    content: item.content ?? '',
    sourceProjectId: item.sourceProjectId ?? '',
    eventCategory: item.eventCategory ?? '',
    domainTags: [...(item.domainTags ?? [])],
    reporter: item.reporter ?? '',
    collectionMethod: item.collectionMethod ?? '',
    priority: item.priority ?? '',
    reflectionStatus: item.reflectionStatus ?? '',
    appliedProjectId: item.appliedProjectId ?? '',
    recurring: item.recurring ?? false,
    notes: item.notes ?? '',
  }
}

const labelStyle: React.CSSProperties = { fontSize: '0.8em', color: 'var(--text-sub, #888)', minWidth: 60, flexShrink: 0 }
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

export function FeedbackView({ projects, initialEventCategory }: FeedbackViewProps) {
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<FeedbackSort>('date_desc')
  const [filters, setFilters] = useState<FeedbackFilters>({
    eventCategory: initialEventCategory ?? '',
    domainTag: '',
    reflectionStatus: '',
    q: '',
  })

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newContent, setNewContent] = useState('')
  const [newSourceProjectId, setNewSourceProjectId] = useState('')
  const [newEventCategory, setNewEventCategory] = useState('')
  const [newDomainTags, setNewDomainTags] = useState<string[]>([])
  const [newReporter, setNewReporter] = useState('')
  const [newCollectionMethod, setNewCollectionMethod] = useState('')
  const [newPriority, setNewPriority] = useState('보통')
  const [newRecurring, setNewRecurring] = useState(false)
  const [newNotes, setNewNotes] = useState('')

  // Edit state — full fields
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchRef = useRef(0)

  const fetchFeedback = useCallback(async () => {
    setLoading(true)
    setError(null)
    const seq = ++fetchRef.current
    try {
      const params = new URLSearchParams()
      if (filters.eventCategory) params.set('eventCategory', filters.eventCategory)
      if (filters.domainTag) params.set('domainTag', filters.domainTag)
      if (filters.reflectionStatus) params.set('reflectionStatus', filters.reflectionStatus)
      if (filters.q) params.set('q', filters.q)
      const path = params.size > 0 ? `/feedback?${params.toString()}` : '/feedback'
      const response = await api<FeedbackListResponse>(path)
      if (seq !== fetchRef.current) return
      setFeedback(response.feedback)
    } catch (err: unknown) {
      if (seq !== fetchRef.current) return
      setError(toErrorMessage(err, '피드백을 불러오지 못했습니다'))
    } finally {
      if (seq === fetchRef.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchFeedback() }, [fetchFeedback])

  useEffect(() => {
    if (!newSourceProjectId) return
    const project = projects.find((p) => p.id === newSourceProjectId)
    if (project?.eventCategory) setNewEventCategory(project.eventCategory)
  }, [newSourceProjectId, projects])

  const sorted = useMemo(() => {
    const items = [...feedback]
    if (sort === 'date_desc') items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    else if (sort === 'date_asc') items.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    else if (sort === 'priority_desc') {
      const rank = (p?: string) => (p === '높음' ? 0 : p === '보통' ? 1 : 2)
      items.sort((a, b) => rank(a.priority) - rank(b.priority))
    }
    return items
  }, [feedback, sort])

  const eventCategories = useMemo(() => {
    const cats = new Set<string>()
    for (const p of projects) { if (p.eventCategory) cats.add(p.eventCategory) }
    return Array.from(cats).sort()
  }, [projects])

  const handleFilterChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const resetCreateForm = () => {
    setNewContent(''); setNewSourceProjectId(''); setNewEventCategory(''); setNewDomainTags([])
    setNewReporter(''); setNewCollectionMethod(''); setNewPriority('보통'); setNewRecurring(false)
    setNewNotes(''); setCreateError(null)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newContent.trim()) return
    setCreating(true); setCreateError(null)
    try {
      const today = new Date().toISOString().slice(0, 10)
      await api<FeedbackResponse>('/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newContent.trim(),
          sourceProjectId: newSourceProjectId || undefined,
          eventCategory: newEventCategory || undefined,
          domainTags: newDomainTags.length > 0 ? newDomainTags : undefined,
          reporter: newReporter || undefined,
          collectionMethod: newCollectionMethod || undefined,
          priority: newPriority || undefined,
          recurring: newRecurring || undefined,
          notes: newNotes || undefined,
          date: today,
        }),
      })
      resetCreateForm(); setShowCreateForm(false); fetchFeedback()
    } catch (err: unknown) {
      setCreateError(toErrorMessage(err, '피드백 등록에 실패했습니다'))
    } finally { setCreating(false) }
  }

  const handleDomainToggle = (tag: string, setter: (fn: (prev: string[]) => string[]) => void) => {
    setter((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const openEdit = (item: FeedbackRecord) => {
    setEditingId(item.id)
    setEdit(editStateFromRecord(item))
  }

  const handleSaveEdit = async (item: FeedbackRecord) => {
    if (!edit) return
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}
      if (edit.content !== (item.content ?? '')) patch.content = edit.content
      if (edit.sourceProjectId !== (item.sourceProjectId ?? '')) patch.sourceProjectId = edit.sourceProjectId || null
      if (edit.eventCategory !== (item.eventCategory ?? '')) patch.eventCategory = edit.eventCategory || null
      if (JSON.stringify(edit.domainTags) !== JSON.stringify(item.domainTags)) patch.domainTags = edit.domainTags
      if (edit.reporter !== (item.reporter ?? '')) patch.reporter = edit.reporter || null
      if (edit.collectionMethod !== (item.collectionMethod ?? '')) patch.collectionMethod = edit.collectionMethod || null
      if (edit.priority !== (item.priority ?? '')) patch.priority = edit.priority || null
      if (edit.reflectionStatus !== (item.reflectionStatus ?? '')) patch.reflectionStatus = edit.reflectionStatus || null
      if (edit.appliedProjectId !== (item.appliedProjectId ?? '')) patch.appliedProjectId = edit.appliedProjectId || null
      if (edit.recurring !== (item.recurring ?? false)) patch.recurring = edit.recurring
      if (edit.notes !== (item.notes ?? '')) patch.notes = edit.notes || null

      if (Object.keys(patch).length > 0) {
        await api<FeedbackResponse>(`/feedback/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        })
      }
      setEditingId(null); setEdit(null); fetchFeedback()
    } catch { /* silent */ } finally { setSaving(false) }
  }

  return (
    <div className="feedbackView">
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select name="eventCategory" value={filters.eventCategory} onChange={handleFilterChange} style={{ minWidth: 120 }}>
          <option value="">행사분류 전체</option>
          {eventCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <select name="domainTag" value={filters.domainTag} onChange={handleFilterChange} style={{ minWidth: 100 }}>
          <option value="">도메인 전체</option>
          {DOMAIN_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="reflectionStatus" value={filters.reflectionStatus} onChange={handleFilterChange} style={{ minWidth: 100 }}>
          <option value="">반영상태 전체</option>
          {REFLECTION_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="text" name="q" value={filters.q} onChange={handleFilterChange} placeholder="검색..." style={{ minWidth: 140 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value as FeedbackSort)} style={{ minWidth: 100 }}>
          <option value="date_desc">최신순</option>
          <option value="date_asc">오래된순</option>
          <option value="priority_desc">우선순위순</option>
        </select>
        <Button onClick={() => { setShowCreateForm(!showCreateForm); if (showCreateForm) resetCreateForm() }} size="mini">
          {showCreateForm ? '취소' : '+ 피드백 등록'}
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm ? (
        <form onSubmit={handleCreate} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'var(--surface-raised, var(--bg-card, #fff))' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="피드백 내용 (필수)" required rows={3} style={{ width: '100%', resize: 'vertical' }} />
            <div style={rowStyle}>
              <span style={labelStyle}>어디서 나온 피드백?</span>
              <select value={newSourceProjectId} onChange={(e) => setNewSourceProjectId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
                <option value="">출처 행사 (피드백이 발생한 행사)</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={newEventCategory} onChange={(e) => setNewEventCategory(e.target.value)} style={{ minWidth: 120 }}>
                <option value="">행사분류</option>
                {eventCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>수집 정보</span>
              <select value={newCollectionMethod} onChange={(e) => setNewCollectionMethod(e.target.value)} style={{ minWidth: 100 }}>
                <option value="">수집방법</option>
                {COLLECTION_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={{ minWidth: 80 }}>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <input value={newReporter} onChange={(e) => setNewReporter(e.target.value)} placeholder="제보자" style={{ minWidth: 80, flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85em', cursor: 'pointer' }}>
                <input type="checkbox" checked={newRecurring} onChange={(e) => setNewRecurring(e.target.checked)} />
                반복발생
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={labelStyle}>도메인</span>
              {DOMAIN_OPTIONS.map((tag) => (
                <label key={tag} style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newDomainTags.includes(tag)} onChange={() => handleDomainToggle(tag, setNewDomainTags)} />
                  {tag}
                </label>
              ))}
            </div>
            <textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="비고 (선택)" rows={2} style={{ width: '100%', resize: 'vertical' }} />
            {createError ? <div style={{ color: 'var(--error, #d32f2f)', fontSize: '0.85em' }}>{createError}</div> : null}
            <div><Button type="submit" disabled={creating || !newContent.trim()} size="mini">{creating ? '등록 중...' : '등록'}</Button></div>
          </div>
        </form>
      ) : null}

      {loading ? <div style={{ display: 'grid', gap: 6 }}><Skeleton height="40px" /><Skeleton height="40px" /><Skeleton height="40px" /></div> : null}
      {error ? <div style={{ color: 'var(--error, #d32f2f)', marginBottom: 8 }}>{error}</div> : null}
      {!loading && !error && sorted.length === 0 ? <EmptyState message="등록된 피드백이 없습니다" /> : null}

      {/* Feedback list */}
      {!loading && sorted.length > 0 ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {sorted.map((item) => {
            const isEditing = editingId === item.id && edit !== null

            return (
              <article
                key={item.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  background: item.reflectionStatus === '반영완료' ? 'var(--surface-muted, #f5f5f5)' : undefined,
                  opacity: item.reflectionStatus === '반영완료' ? 0.7 : 1,
                }}
              >
                {/* View mode */}
                {!isEditing ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, marginBottom: 4, wordBreak: 'break-word' }}>{item.content}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.8em', opacity: 0.75 }}>
                          {item.sourceProjectName ? <span title="출처 행사: 이 피드백이 발생한 행사">&#x1F4CD; {item.sourceProjectName}</span> : null}
                          {item.eventCategory ? <span style={{ background: 'var(--tag-bg, #e8eaed)', borderRadius: 4, padding: '1px 6px' }}>{item.eventCategory}</span> : null}
                          {item.domainTags.map((tag) => (
                            <span key={tag} style={{ background: 'var(--tag-bg, #e0e7ff)', borderRadius: 4, padding: '1px 6px' }}>{tag}</span>
                          ))}
                          {item.collectionMethod ? <span title="수집방법">{item.collectionMethod}</span> : null}
                          {item.reporter ? <span>({item.reporter})</span> : null}
                          {item.date ? <span>{item.date}</span> : null}
                          {item.recurring ? <span style={{ color: 'var(--warning, #e65100)', fontWeight: 600 }}>반복</span> : null}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {item.priority ? <span style={{ fontSize: '0.8em', fontWeight: 600, color: item.priority === '높음' ? 'var(--error, #d32f2f)' : 'var(--text-sub, #888)' }}>{item.priority}</span> : null}
                        <span style={{
                          fontSize: '0.8em', padding: '2px 8px', borderRadius: 4,
                          background: item.reflectionStatus === '반영완료' ? 'var(--success-bg, #e8f5e9)' : item.reflectionStatus === '반영중' ? 'var(--warning-bg, #fff3e0)' : 'var(--tag-bg, #f5f5f5)',
                        }}>{item.reflectionStatus || '미반영'}</span>
                        <Button onClick={() => openEdit(item)} size="mini">수정</Button>
                      </div>
                    </div>
                    {item.notes ? <div style={{ marginTop: 6, fontSize: '0.85em', opacity: 0.65 }}>{item.notes}</div> : null}
                    {item.appliedProjectName ? <div style={{ marginTop: 4, fontSize: '0.8em', opacity: 0.65 }} title="반영 행사: 이 피드백을 적용한/적용할 행사">&#x2705; 반영 행사: {item.appliedProjectName}</div> : null}
                  </>
                ) : null}

                {/* Edit mode — full fields */}
                {isEditing && edit ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <textarea
                      value={edit.content}
                      onChange={(e) => setEdit({ ...edit, content: e.target.value })}
                      rows={3}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                    <div style={rowStyle}>
                      <span style={labelStyle}>출처 행사</span>
                      <select value={edit.sourceProjectId} onChange={(e) => setEdit({ ...edit, sourceProjectId: e.target.value })} style={{ flex: 1, minWidth: 150 }}>
                        <option value="">피드백이 발생한 행사</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>반영 행사</span>
                      <select value={edit.appliedProjectId} onChange={(e) => setEdit({ ...edit, appliedProjectId: e.target.value })} style={{ flex: 1, minWidth: 150 }}>
                        <option value="">이 피드백을 적용한/적용할 행사</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>분류</span>
                      <select value={edit.eventCategory} onChange={(e) => setEdit({ ...edit, eventCategory: e.target.value })} style={{ minWidth: 120 }}>
                        <option value="">행사분류</option>
                        {eventCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <select value={edit.collectionMethod} onChange={(e) => setEdit({ ...edit, collectionMethod: e.target.value })} style={{ minWidth: 100 }}>
                        <option value="">수집방법</option>
                        {COLLECTION_METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} style={{ minWidth: 80 }}>
                        <option value="">우선순위</option>
                        {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <select value={edit.reflectionStatus} onChange={(e) => setEdit({ ...edit, reflectionStatus: e.target.value })} style={{ minWidth: 100 }}>
                        <option value="">반영상태</option>
                        {REFLECTION_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>제보자</span>
                      <input value={edit.reporter} onChange={(e) => setEdit({ ...edit, reporter: e.target.value })} placeholder="제보자" style={{ minWidth: 80, flex: 1 }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85em', cursor: 'pointer' }}>
                        <input type="checkbox" checked={edit.recurring} onChange={(e) => setEdit({ ...edit, recurring: e.target.checked })} />
                        반복발생
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={labelStyle}>도메인</span>
                      {DOMAIN_OPTIONS.map((tag) => (
                        <label key={tag} style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={edit.domainTags.includes(tag)}
                            onChange={() => setEdit({ ...edit, domainTags: edit.domainTags.includes(tag) ? edit.domainTags.filter((t) => t !== tag) : [...edit.domainTags, tag] })}
                          />
                          {tag}
                        </label>
                      ))}
                    </div>
                    <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="비고" rows={2} style={{ width: '100%', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button onClick={() => handleSaveEdit(item)} disabled={saving} size="mini">{saving ? '저장 중...' : '저장'}</Button>
                      <Button onClick={() => { setEditingId(null); setEdit(null) }} size="mini">취소</Button>
                    </div>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
