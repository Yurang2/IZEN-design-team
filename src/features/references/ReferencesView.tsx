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
import { formatTaskOptionLabel, getTaskAssigneeOptions, isActiveTaskOption, matchesTaskAssignee } from '../../shared/utils/taskOptions'

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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const activeTaskOptions = useMemo(() => tasks.filter(isActiveTaskOption), [tasks])
  const taskAssigneeOptions = useMemo(() => getTaskAssigneeOptions(activeTaskOptions), [activeTaskOptions])
  const taskOptions = useMemo(
    () =>
      activeTaskOptions
        .filter((task) => matchesTaskAssignee(task, taskAssigneeFilter))
        .sort((a, b) => `${a.projectName} ${a.taskName}`.localeCompare(`${b.projectName} ${b.taskName}`, 'ko')),
    [activeTaskOptions, taskAssigneeFilter],
  )
  const selectedTaskOption = useMemo(() => activeTaskOptions.find((task) => task.id === form.relatedTaskId), [activeTaskOptions, form.relatedTaskId])
  const visibleTaskOptions = useMemo(
    () => (selectedTaskOption && !taskOptions.some((task) => task.id === selectedTaskOption.id) ? [selectedTaskOption, ...taskOptions] : taskOptions),
    [selectedTaskOption, taskOptions],
  )

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

  const handlePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
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
        <div>
          <h2>레퍼런스 자료함</h2>
          <p>이미지는 붙여넣기/업로드로 저장하고, YouTube 링크는 영상 레퍼런스로 자동 분류합니다.</p>
        </div>
        {databaseUrl ? (
          <a className="uiButton secondary mini" href={databaseUrl} target="_blank" rel="noreferrer">
            Notion DB
          </a>
        ) : null}
      </header>

      {message ? <p className="referencesMessage">{message}</p> : null}
      {error ? <p className="referencesMessage is-error">{error}</p> : null}

      <section className="referencesPanel" aria-label="레퍼런스 저장">
        <form className="referencesForm" onSubmit={submit}>
          <label>
            담당자 필터
            <select value={taskAssigneeFilter} onChange={(event) => setTaskAssigneeFilter(event.target.value)}>
              <option value="">전체 담당자</option>
              {taskAssigneeOptions.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </label>
          <label>
            제목
            <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="레퍼런스 제목" />
          </label>
          <label>
            관련 업무
            <select value={form.relatedTaskId} onChange={(event) => updateForm({ relatedTaskId: event.target.value })}>
              <option value="">업무 선택</option>
              {visibleTaskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {formatTaskOptionLabel(task)}
                </option>
              ))}
            </select>
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
            <textarea value={form.memo} onChange={(event) => updateForm({ memo: event.target.value })} rows={3} />
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
              {saving ? '저장 중' : editingId ? '수정 저장' : '레퍼런스 저장'}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                취소
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="referencesToolbar" aria-label="레퍼런스 필터">
        <input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="검색" />
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

      <section className="referencesGrid" aria-busy={loading}>
        {items.map((item) => {
          const youtubeId = item.link ? extractYoutubeId(item.link) : ''
          return (
            <article className="referenceCard" key={item.id}>
              <div className="referenceMedia">
                {item.imageUrl ? <img src={item.imageUrl} alt={item.title} /> : null}
                {!item.imageUrl && youtubeId ? (
                  <iframe title={item.title} src={`https://www.youtube.com/embed/${youtubeId}`} loading="lazy" />
                ) : null}
                {!item.imageUrl && !youtubeId ? <span>{SOURCE_LABELS[item.sourceType]}</span> : null}
              </div>
              <div className="referenceBody">
                <div className="referenceMetaLine">
                  <span>{SOURCE_LABELS[item.sourceType]}</span>
                  <strong>{item.usageType}</strong>
                </div>
                <h3>{item.title}</h3>
                {item.projectName ? <p>{item.projectName}</p> : null}
                {item.memo ? <p>{item.memo}</p> : null}
                {item.tags.length > 0 ? <div className="referenceTags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                <div className="referenceActions">
                  {item.link ? (
                    <a className="uiButton secondary mini" href={item.link} target="_blank" rel="noreferrer">
                      링크 열기
                    </a>
                  ) : null}
                  <Button type="button" variant="secondary" size="mini" onClick={() => startEdit(item)}>
                    수정
                  </Button>
                  <Button type="button" variant="secondary" size="mini" onClick={() => void remove(item)}>
                    삭제
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
        {!loading && items.length === 0 ? <EmptyState title="저장된 레퍼런스가 없습니다." message="이미지를 붙여넣거나 링크를 입력해 저장해주세요." /> : null}
      </section>
    </section>
  )
}
