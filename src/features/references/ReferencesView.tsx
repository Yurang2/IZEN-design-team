import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import type {
  ReferenceListResponse,
  ReferenceRecord,
  ReferenceResponse,
  ReferenceSourceType,
  ReferenceUsageType,
  TaskRecord,
} from '../../shared/types'
import { Button, EmptyState, UiGlyph } from '../../shared/ui'
import { RelatedTaskPickerModal } from '../tasks/RelatedTaskPickerModal'

type ReferencesViewProps = {
  tasks: TaskRecord[]
  configured: boolean
  databaseUrl?: string | null
}

type ReferenceForm = {
  title: string
  relatedTaskId: string
  link: string
  sourceType: ReferenceSourceType
  usageType: ReferenceUsageType
  memo: string
  tagsText: string
  imageDataUrl: string
  imageName: string
}

const SOURCE_LABELS: Record<ReferenceSourceType, string> = {
  image: '이미지',
  youtube: 'YouTube',
  link: '링크',
  other: '기타 자료',
}

const USAGE_TYPES: ReferenceUsageType[] = ['단순저장', '모작', '아이디어']

const USAGE_LABELS: Record<ReferenceUsageType, string> = {
  단순저장: '단순저장',
  모작: '모작',
  아이디어: '아이디어',
}

const SOURCE_META: Record<ReferenceSourceType, { label: string; shortLabel: string; className: string }> = {
  image: { label: '이미지', shortLabel: 'IMG', className: 'source-image' },
  youtube: { label: 'YouTube', shortLabel: '▶', className: 'source-youtube' },
  link: { label: '링크', shortLabel: 'LINK', className: 'source-link' },
  other: { label: '기타 자료', shortLabel: 'FILE', className: 'source-other' },
}

const EMPTY_FORM: ReferenceForm = {
  title: '',
  relatedTaskId: '',
  link: '',
  sourceType: 'other',
  usageType: '단순저장',
  memo: '',
  tagsText: '',
  imageDataUrl: '',
  imageName: '',
}

function isYoutubeUrl(value: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(value)
}

function inferSourceType(link: string, imageDataUrl: string): ReferenceSourceType {
  if (imageDataUrl) return 'image'
  if (isYoutubeUrl(link)) return 'youtube'
  if (/^https?:\/\//i.test(link.trim())) return 'link'
  return 'other'
}

function extractYoutubeId(value: string): string {
  try {
    const url = new URL(value)
    if (url.hostname.includes('youtu.be')) return url.pathname.replace('/', '')
    return url.searchParams.get('v') ?? ''
  } catch {
    return ''
  }
}

function splitTags(value: string): string[] {
  return value
    .split(/[,\n#]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function readCompressedImage(file: File): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('이미지를 처리하지 못했습니다.'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.naturalWidth * 0.5))
        canvas.height = Math.max(1, Math.round(img.naturalHeight * 0.5))
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('이미지를 처리하지 못했습니다.'))
          return
        }
        context.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.72),
          name: file.name.replace(/\.[^.]+$/, '.jpg') || `reference-${Date.now()}.jpg`,
        })
      }
      img.src = String(reader.result ?? '')
    }
    reader.readAsDataURL(file)
  })
}

function formFromRecord(item: ReferenceRecord): ReferenceForm {
  return {
    title: item.title,
    relatedTaskId: item.projectId ?? '',
    link: item.link ?? '',
    sourceType: item.sourceType,
    usageType: item.usageType,
    memo: item.memo ?? '',
    tagsText: item.tags.join(', '),
    imageDataUrl: '',
    imageName: item.imageName ?? '',
  }
}

export function ReferencesView({ tasks, configured, databaseUrl }: ReferencesViewProps) {
  const [items, setItems] = useState<ReferenceRecord[]>([])
  const [filters, setFilters] = useState({ q: '', sourceType: '', usageType: '' })
  const [form, setForm] = useState<ReferenceForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedTaskOption = useMemo(() => tasks.find((task) => task.id === form.relatedTaskId), [form.relatedTaskId, tasks])
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])

  const fetchReferences = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.q) params.set('q', filters.q)
      if (filters.sourceType) params.set('sourceType', filters.sourceType)
      if (filters.usageType) params.set('usageType', filters.usageType)
      const response = await api<ReferenceListResponse>(`/references${params.size ? `?${params.toString()}` : ''}`)
      setItems(response.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '레퍼런스를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [configured, filters.q, filters.sourceType, filters.usageType])

  useEffect(() => {
    void fetchReferences()
  }, [fetchReferences])

  const updateForm = (patch: Partial<ReferenceForm>) => {
    setForm((current) => {
      const next = { ...current, ...patch }
      if ('link' in patch || 'imageDataUrl' in patch) {
        next.sourceType = inferSourceType(next.link, next.imageDataUrl)
      }
      return next
    })
  }

  const handlePaste = async (event: ClipboardEvent<HTMLElement>) => {
    const imageFile = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'))
    if (!imageFile) return
    event.preventDefault()
    try {
      const image = await readCompressedImage(imageFile)
      updateForm({ imageDataUrl: image.dataUrl, imageName: image.name })
      setMessage('붙여넣은 이미지를 압축해서 준비했습니다.')
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 처리하지 못했습니다.')
    }
  }

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const image = await readCompressedImage(file)
      updateForm({ imageDataUrl: image.dataUrl, imageName: image.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지를 처리하지 못했습니다.')
    }
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormOpen(false)
    setMessage(null)
    setError(null)
  }

  const openNewForm = () => {
    if (formOpen && !editingId) {
      setFormOpen(false)
      return
    }
    setForm(EMPTY_FORM)
    setEditingId(null)
    setFormOpen(true)
    setMessage(null)
    setError(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        projectId: selectedTaskOption?.id || undefined,
        projectName: selectedTaskOption?.projectName || undefined,
        sourceType: form.sourceType,
        usageType: form.usageType,
        link: form.link || undefined,
        imageDataUrl: form.imageDataUrl || undefined,
        imageName: form.imageName || undefined,
        memo: form.memo || undefined,
        tags: splitTags(form.tagsText),
      }
      if (editingId) {
        await api<ReferenceResponse>(`/references/${encodeURIComponent(editingId)}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        setMessage('레퍼런스를 수정했습니다.')
      } else {
        await api<ReferenceResponse>('/references', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setMessage('레퍼런스를 저장했습니다.')
      }
      resetForm()
      await fetchReferences()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (item: ReferenceRecord) => {
    setEditingId(item.id)
    setForm(formFromRecord(item))
    setFormOpen(true)
    setMessage('기존 이미지는 유지됩니다. 새 이미지를 붙여넣거나 업로드하면 교체됩니다.')
  }

  const remove = async (item: ReferenceRecord) => {
    if (!window.confirm(`"${item.title}" 레퍼런스를 삭제할까요?`)) return
    await api(`/references/${encodeURIComponent(item.id)}`, { method: 'DELETE' })
    await fetchReferences()
  }

  if (!configured) {
    return (
      <EmptyState
        title="레퍼런스 DB가 연결되지 않았습니다."
        message="Cloudflare Workers 환경변수에 NOTION_REFERENCE_DB_ID를 추가하면 레퍼런스 자료함이 활성화됩니다."
        className="referencesEmptyState"
      />
    )
  }

  return (
    <section className="referencesView" aria-label="레퍼런스 자료함">
      <header className="referencesHeader">
        <div className="referencesTitleGroup">
          <div className="referencesTitleLine">
            <h2>레퍼런스 모음집</h2>
            <span>{items.length}</span>
          </div>
          <p>이미지, 영상, 링크 자료를 빠르게 저장하고 검색합니다.</p>
        </div>
        <div className="referencesHeaderActions">
          <div className="referencesViewToggle" aria-label="보기 방식">
            <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')}>
              격자
            </button>
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')}>
              목록
            </button>
          </div>
          {databaseUrl ? (
            <a className="uiButton secondary mini" href={databaseUrl} target="_blank" rel="noreferrer">
              Notion DB
            </a>
          ) : null}
          <Button type="button" size="mini" onClick={openNewForm} icon={<UiGlyph name="plus" />}>
            {formOpen && !editingId ? '접기' : '추가'}
          </Button>
        </div>
      </header>

      {message ? <p className="referencesMessage">{message}</p> : null}
      {error ? <p className="referencesMessage is-error">{error}</p> : null}

      {formOpen ? (
      <section className="referencesPanel" aria-label="레퍼런스 저장">
        <form className="referencesForm" onSubmit={submit} onPaste={handlePaste}>
          <label>
            제목
            <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="레퍼런스 제목" />
          </label>
          <label className="relatedTaskField">
            관련 업무
            <button type="button" className="relatedTaskPickButton" onClick={() => setTaskPickerOpen(true)}>
              {selectedTaskOption ? selectedTaskOption.taskName : '업무 선택'}
            </button>
            {selectedTaskOption ? (
              <span className="relatedTaskSelectedSummary">
                [{selectedTaskOption.projectName}] · 담당자 {selectedTaskOption.assignee.length > 0 ? selectedTaskOption.assignee.join(', ') : '-'}
              </span>
            ) : null}
          </label>
          <label>
            링크
            <input value={form.link} onChange={(event) => updateForm({ link: event.target.value })} placeholder="https://..." />
          </label>
          <label>
            분류
            <select value={form.usageType} onChange={(event) => updateForm({ usageType: event.target.value as ReferenceUsageType })}>
              {USAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            자료 유형
            <select value={form.sourceType} onChange={(event) => updateForm({ sourceType: event.target.value as ReferenceSourceType })}>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            태그
            <input value={form.tagsText} onChange={(event) => updateForm({ tagsText: event.target.value })} placeholder="브로슈어, 전시, LED" />
          </label>
          <label className="referencesMemo">
            메모
            <input value={form.memo} onChange={(event) => updateForm({ memo: event.target.value })} placeholder="간단한 메모" />
          </label>
          <div className="referencesPasteZone" onPaste={handlePaste}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void handleImageFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            {form.imageDataUrl ? <img src={form.imageDataUrl} alt="레퍼런스 미리보기" /> : <span>이미지 붙여넣기</span>}
            <Button type="button" variant="secondary" size="mini" onClick={() => fileInputRef.current?.click()} icon={<UiGlyph name="plus" />}>
              이미지 선택
            </Button>
          </div>
          <div className="referencesActions">
            <Button type="submit" disabled={saving}>
              {saving ? '저장 중' : editingId ? '수정 저장' : '저장'}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                취소
              </Button>
            ) : null}
          </div>
        </form>
      </section>
      ) : null}

      <RelatedTaskPickerModal
        open={taskPickerOpen}
        tasks={tasks}
        selectedTaskId={form.relatedTaskId}
        onClose={() => setTaskPickerOpen(false)}
        onSelect={(taskId) => updateForm({ relatedTaskId: taskId })}
      />

      <section className="referencesToolbar" aria-label="레퍼런스 필터">
        <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="제목, 태그, 프로젝트로 검색" />
        <select value={filters.sourceType} onChange={(event) => setFilters((current) => ({ ...current, sourceType: event.target.value }))}>
          <option value="">모든 자료</option>
          {Object.entries(SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={filters.usageType} onChange={(event) => setFilters((current) => ({ ...current, usageType: event.target.value }))}>
          <option value="">모든 분류</option>
          {USAGE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </section>

      <section className={viewMode === 'grid' ? 'referencesGrid' : 'referencesList'} aria-busy={loading}>
        {items.map((item) => {
          const youtubeId = item.link ? extractYoutubeId(item.link) : ''
          const sourceMeta = SOURCE_META[item.sourceType]
          const relatedTask = item.projectId ? taskById.get(item.projectId) : undefined
          const workTypeLabel = relatedTask?.workType || item.projectName || ''
          return (
            <article className={viewMode === 'grid' ? 'referenceCard' : 'referenceListItem'} key={item.id}>
              <div className="referenceMedia">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : null}
                {!item.imageUrl && youtubeId ? (
                  <iframe title={item.title} src={`https://www.youtube.com/embed/${youtubeId}`} loading="lazy" />
                ) : null}
                {!item.imageUrl && !youtubeId ? <span className={`referenceTypeThumb ${sourceMeta.className}`}>{sourceMeta.shortLabel}</span> : null}
                <span className="referenceMediaBadge">{sourceMeta.label}</span>
                <div className="referenceHoverActions">
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noreferrer">
                      열기
                    </a>
                  ) : null}
                  <button type="button" onClick={() => startEdit(item)}>
                    수정
                  </button>
                  <button type="button" className="is-danger" onClick={() => void remove(item)}>
                    삭제
                  </button>
                </div>
              </div>
              <div className="referenceBody">
                <div className="referenceBadges">
                  <strong>{USAGE_LABELS[item.usageType] ?? item.usageType}</strong>
                  {item.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <h3>{item.title}</h3>
                {workTypeLabel ? <p>{workTypeLabel}</p> : null}
                {item.memo ? <p>{item.memo}</p> : null}
              </div>
            </article>
          )
        })}
        {!loading && items.length === 0 ? <EmptyState title="저장된 레퍼런스가 없습니다." message="이미지를 붙여넣거나 링크를 입력해 저장해주세요." /> : null}
      </section>
    </section>
  )
}
