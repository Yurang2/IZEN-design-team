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

  // Create form state
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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editReflectionStatus, setEditReflectionStatus] = useState('')
  const [editAppliedProjectId, setEditAppliedProjectId] = useState('')
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

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  // Auto-fill eventCategory when source project changes
  useEffect(() => {
    if (!newSourceProjectId) return
    const project = projects.find((p) => p.id === newSourceProjectId)
    if (project?.eventCategory) {
      setNewEventCategory(project.eventCategory)
    }
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
    for (const p of projects) {
      if (p.eventCategory) cats.add(p.eventCategory)
    }
    return Array.from(cats).sort()
  }, [projects])

  const handleFilterChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFilters((prev) => ({ ...prev, [name]: value }))
  }

  const resetCreateForm = () => {
    setNewContent('')
    setNewSourceProjectId('')
    setNewEventCategory('')
    setNewDomainTags([])
    setNewReporter('')
    setNewCollectionMethod('')
    setNewPriority('보통')
    setNewRecurring(false)
    setNewNotes('')
    setCreateError(null)
  }

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!newContent.trim()) return
    setCreating(true)
    setCreateError(null)

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
      resetCreateForm()
      setShowCreateForm(false)
      fetchFeedback()
    } catch (err: unknown) {
      setCreateError(toErrorMessage(err, '피드백 등록에 실패했습니다'))
    } finally {
      setCreating(false)
    }
  }

  const handleDomainToggle = (tag: string) => {
    setNewDomainTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleSaveReflection = async (item: FeedbackRecord) => {
    setSaving(true)
    try {
      await api<FeedbackResponse>(`/feedback/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reflectionStatus: editReflectionStatus || undefined,
          appliedProjectId: editAppliedProjectId || undefined,
        }),
      })
      setEditingId(null)
      fetchFeedback()
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (item: FeedbackRecord) => {
    setEditingId(item.id)
    setEditReflectionStatus(item.reflectionStatus ?? '')
    setEditAppliedProjectId(item.appliedProjectId ?? '')
  }

  return (
    <div className="feedbackView">
      {/* Filters */}
      <div className="feedbackFilters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <select name="eventCategory" value={filters.eventCategory} onChange={handleFilterChange} style={{ minWidth: 120 }}>
          <option value="">행사분류 전체</option>
          {eventCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select name="domainTag" value={filters.domainTag} onChange={handleFilterChange} style={{ minWidth: 100 }}>
          <option value="">도메인 전체</option>
          {DOMAIN_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select name="reflectionStatus" value={filters.reflectionStatus} onChange={handleFilterChange} style={{ minWidth: 100 }}>
          <option value="">반영상태 전체</option>
          {REFLECTION_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          name="q"
          value={filters.q}
          onChange={handleFilterChange}
          placeholder="검색..."
          style={{ minWidth: 140 }}
        />
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
        <form onSubmit={handleCreate} className="feedbackCreateForm" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 14, background: 'var(--surface-raised, var(--bg-card, #fff))' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="피드백 내용 (필수)"
              required
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={newSourceProjectId} onChange={(e) => setNewSourceProjectId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
                <option value="">출처 행사 선택</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select value={newEventCategory} onChange={(e) => setNewEventCategory(e.target.value)} style={{ flex: 1, minWidth: 120 }}>
                <option value="">행사분류</option>
                {eventCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <select value={newCollectionMethod} onChange={(e) => setNewCollectionMethod(e.target.value)} style={{ minWidth: 100 }}>
                <option value="">수집방법</option>
                {COLLECTION_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={{ minWidth: 80 }}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85em', opacity: 0.7 }}>도메인:</span>
              {DOMAIN_OPTIONS.map((tag) => (
                <label key={tag} style={{ fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newDomainTags.includes(tag)} onChange={() => handleDomainToggle(tag)} />
                  {tag}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={newReporter} onChange={(e) => setNewReporter(e.target.value)} placeholder="제보자" style={{ flex: 1, minWidth: 100 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85em', cursor: 'pointer' }}>
                <input type="checkbox" checked={newRecurring} onChange={(e) => setNewRecurring(e.target.checked)} />
                반복발생
              </label>
            </div>
            <textarea
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="비고 (선택)"
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            {createError ? <div style={{ color: 'var(--error, #d32f2f)', fontSize: '0.85em' }}>{createError}</div> : null}
            <div>
              <Button type="submit" disabled={creating || !newContent.trim()} size="mini">
                {creating ? '등록 중...' : '등록'}
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {/* Loading / Error */}
      {loading ? <div style={{ display: 'grid', gap: 6 }}><Skeleton height="40px" /><Skeleton height="40px" /><Skeleton height="40px" /></div> : null}
      {error ? <div style={{ color: 'var(--error, #d32f2f)', marginBottom: 8 }}>{error}</div> : null}

      {/* Empty state */}
      {!loading && !error && sorted.length === 0 ? (
        <EmptyState message="등록된 피드백이 없습니다" />
      ) : null}

      {/* Feedback list */}
      {!loading && sorted.length > 0 ? (
        <div className="feedbackList" style={{ display: 'grid', gap: 8 }}>
          {sorted.map((item) => (
            <article
              key={item.id}
              className="feedbackCard"
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                background: item.reflectionStatus === '반영완료' ? 'var(--surface-muted, #f5f5f5)' : undefined,
                opacity: item.reflectionStatus === '반영완료' ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, marginBottom: 4, wordBreak: 'break-word' }}>{item.content}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: '0.8em', opacity: 0.75 }}>
                    {item.sourceProjectName ? <span>{item.sourceProjectName}</span> : null}
                    {item.eventCategory ? <span style={{ background: 'var(--tag-bg, #e8eaed)', borderRadius: 4, padding: '1px 6px' }}>{item.eventCategory}</span> : null}
                    {item.domainTags.map((tag) => (
                      <span key={tag} style={{ background: 'var(--tag-bg, #e0e7ff)', borderRadius: 4, padding: '1px 6px' }}>{tag}</span>
                    ))}
                    {item.reporter ? <span>({item.reporter})</span> : null}
                    {item.date ? <span>{item.date}</span> : null}
                    {item.recurring ? <span style={{ color: 'var(--warning, #e65100)', fontWeight: 600 }}>반복</span> : null}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {item.priority === '높음' ? <span style={{ color: 'var(--error, #d32f2f)', fontSize: '0.8em', fontWeight: 600 }}>높음</span> : null}
                  <span
                    style={{
                      fontSize: '0.8em',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background:
                        item.reflectionStatus === '반영완료'
                          ? 'var(--success-bg, #e8f5e9)'
                          : item.reflectionStatus === '반영중'
                            ? 'var(--warning-bg, #fff3e0)'
                            : 'var(--tag-bg, #f5f5f5)',
                    }}
                  >
                    {item.reflectionStatus || '미반영'}
                  </span>
                  <Button onClick={() => openEdit(item)} size="mini">
                    수정
                  </Button>
                </div>
              </div>
              {item.notes ? <div style={{ marginTop: 6, fontSize: '0.85em', opacity: 0.65 }}>{item.notes}</div> : null}
              {item.appliedProjectName ? <div style={{ marginTop: 4, fontSize: '0.8em', opacity: 0.65 }}>반영: {item.appliedProjectName}</div> : null}

              {/* Inline edit */}
              {editingId === item.id ? (
                <div style={{ marginTop: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface-raised, #fafafa)' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={editReflectionStatus} onChange={(e) => setEditReflectionStatus(e.target.value)} style={{ minWidth: 100 }}>
                      <option value="">반영상태</option>
                      {REFLECTION_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select value={editAppliedProjectId} onChange={(e) => setEditAppliedProjectId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
                      <option value="">반영 행사 선택</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <Button onClick={() => handleSaveReflection(item)} disabled={saving} size="mini">
                      {saving ? '저장 중...' : '저장'}
                    </Button>
                    <Button onClick={() => setEditingId(null)} size="mini">
                      취소
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
