import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { SubtitleVideoRecord, SubtitleVideosResponse, SubtitleRevisionRecord, SubtitleRevisionsResponse } from '../../shared/types'
import { api } from '../../shared/api/client'

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

const STATUS_COLORS: Record<string, string> = {
  '사용중': '#d4edda',
  '제작중': '#fff3cd',
  '보관': '#e2e3e5',
  '폐기': '#f8d7da',
}

const CATEGORIES = ['회사소개', '제품특장점', '클린임플란트', '행사 스케치(가로)', '행사 스케치(세로)', '유저 인터뷰', '행사 티저/홍보', '교육 영상']
const RESOLUTIONS = ['1920x1080', '1080x1920', '3840x2160']
const STATUSES = ['사용중', '제작중', '보관', '폐기']
const LANGS: Array<{ key: 'ko' | 'en' | 'zh' | 'ru'; label: string }> = [
  { key: 'ko', label: 'KO' },
  { key: 'en', label: 'EN' },
  { key: 'zh', label: 'ZH' },
  { key: 'ru', label: 'RU' },
]

// ---------------------------------------------------------------------------
// Subtitle status helper
// ---------------------------------------------------------------------------

type SubtitleLangStatus = { lang: string; hasContent: boolean }

function computeSubtitleStatus(revisions: SubtitleRevisionRecord[]): SubtitleLangStatus[] {
  if (revisions.length === 0) return LANGS.map((l) => ({ lang: l.label, hasContent: false }))
  const latest = revisions[0]
  const segments = latest.snapshot?.segments ?? []
  return LANGS.map((l) => ({
    lang: l.label,
    hasContent: segments.some((seg) => (seg[l.key] ?? '').trim().length > 0),
  }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoManagementView() {
  const [videos, setVideos] = useState<SubtitleVideoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterQ, setFilterQ] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [subtitleStatusMap, setSubtitleStatusMap] = useState<Record<string, SubtitleLangStatus[]>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const fetchRef = useRef(0)

  const fetchVideos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const seq = ++fetchRef.current
    try {
      const res = await api<SubtitleVideosResponse>('/subtitle-videos')
      if (seq !== fetchRef.current) return
      setVideos(res.videos)
    } catch (err) {
      if (seq !== fetchRef.current) return
      setError(toErrorMessage(err, '영상 목록을 불러오지 못했습니다'))
    } finally {
      if (seq === fetchRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVideos() }, [fetchVideos])

  // Fetch subtitle status when a video is expanded
  const fetchSubtitleStatus = useCallback(async (videoId: string) => {
    if (subtitleStatusMap[videoId]) return
    try {
      const res = await api<SubtitleRevisionsResponse>(`/subtitle-revisions?videoId=${videoId}`)
      setSubtitleStatusMap((prev) => ({ ...prev, [videoId]: computeSubtitleStatus(res.revisions) }))
    } catch {
      setSubtitleStatusMap((prev) => ({ ...prev, [videoId]: LANGS.map((l) => ({ lang: l.label, hasContent: false })) }))
    }
  }, [subtitleStatusMap])

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const v of videos) { if (v.category) cats.add(v.category) }
    return [...cats].sort()
  }, [videos])

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (filterCategory && v.category !== filterCategory) return false
      if (filterStatus && v.status !== filterStatus) return false
      if (filterQ) {
        const q = filterQ.toLowerCase()
        const source = `${v.videoName} ${v.videoCode ?? ''} ${v.talent ?? ''} ${v.creator ?? ''} ${v.eventNames.join(' ')} ${v.memo ?? ''}`.toLowerCase()
        if (!source.includes(q)) return false
      }
      return true
    })
  }, [videos, filterCategory, filterStatus, filterQ])

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => {
      const next = prev === id ? null : id
      if (next) fetchSubtitleStatus(next)
      return next
    })
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {error ? <div style={{ color: 'var(--error)', marginBottom: 8 }}>{error}</div> : null}

      {/* Filters + Add button */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="">카테고리 전체</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">상태 전체</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="검색 (이름, 코드, 출연자, 행사...)"
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          style={{ ...selectStyle, width: 240 }}
        />
        <span style={{ fontSize: '0.82em', color: 'var(--text-sub, #888)' }}>{filtered.length}건</span>
        <button type="button" onClick={fetchVideos} style={btnStyle}>새로고침</button>
        <button type="button" onClick={() => setShowCreateForm(true)} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff' }}>+ 영상 등록</button>
      </div>

      {/* Create form */}
      {showCreateForm ? (
        <CreateVideoForm
          onCreated={() => { setShowCreateForm(false); fetchVideos() }}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : null}

      {loading ? <div style={{ padding: 16, textAlign: 'center' }}>로딩 중...</div> : null}

      {!loading && filtered.length === 0 && !showCreateForm ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-sub, #888)' }}>
          {videos.length === 0 ? '등록된 영상이 없습니다' : '필터 조건에 맞는 영상이 없습니다'}
        </div>
      ) : null}

      {/* Video table */}
      {!loading && filtered.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
            <thead>
              <tr>
                <th style={thStyle}>영상 코드</th>
                <th style={thStyle}>영상명</th>
                <th style={thStyle}>카테고리</th>
                <th style={thStyle}>상태</th>
                <th style={thStyle}>Rev</th>
                <th style={thStyle}>최종 수정일</th>
                <th style={thStyle}>행사</th>
                <th style={thStyle}>원본 해상도</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <>
                  <tr key={v.id} onClick={() => toggleExpand(v.id)} style={{ cursor: 'pointer', background: expandedId === v.id ? 'rgba(59,130,246,0.05)' : undefined }}>
                    <td style={cellStyle}><code style={{ fontSize: '0.85em' }}>{v.videoCode ?? '-'}</code></td>
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{v.videoName}</td>
                    <td style={cellStyle}>{v.category ? <span style={badgeStyle}>{v.category}</span> : '-'}</td>
                    <td style={cellStyle}>
                      {v.status ? <span style={{ ...badgeStyle, background: STATUS_COLORS[v.status] ?? 'var(--border)' }}>{v.status}</span> : '-'}
                    </td>
                    <td style={cellStyle}>{v.revision != null ? `v${v.revision}` : '-'}</td>
                    <td style={cellStyle}>{v.lastModifiedDate ?? '-'}</td>
                    <td style={cellStyle}>{v.eventNames.length > 0 ? v.eventNames.join(', ') : '-'}</td>
                    <td style={cellStyle}>{v.resolution ?? '-'}</td>
                  </tr>
                  {expandedId === v.id ? (
                    <tr key={`${v.id}-detail`}>
                      <td colSpan={8} style={{ padding: '12px 16px', background: 'var(--surface1)', borderBottom: '1px solid var(--border)' }}>
                        <VideoDetail video={v} subtitleStatus={subtitleStatusMap[v.id]} />
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel — grouped cards
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '12px 16px',
  background: 'var(--bg, #fff)',
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '0.78em',
  fontWeight: 700,
  color: 'var(--text-sub, #888)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 8,
}

const fieldRow: React.CSSProperties = { display: 'flex', gap: 8, padding: '3px 0', fontSize: '0.85em' }
const fieldLabel: React.CSSProperties = { color: 'var(--text-sub, #888)', minWidth: 85, flexShrink: 0 }

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={fieldRow}>
      <span style={fieldLabel}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>{value || <span style={{ opacity: 0.35 }}>-</span>}</span>
    </div>
  )
}

function VideoDetail({ video: v, subtitleStatus }: { video: SubtitleVideoRecord; subtitleStatus?: SubtitleLangStatus[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {/* 식별 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>식별</div>
        <Field label="영상 코드" value={v.videoCode} />
        <Field label="카테고리" value={v.category} />
        <Field label="상태" value={v.status} />
      </div>

      {/* 영상 스펙 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>영상 스펙</div>
        <Field label="원본 해상도" value={v.resolution} />
        <Field label="변환 버전" value={v.resolutionVariants.length > 0 ? v.resolutionVariants.join(', ') : undefined} />
        <Field label="출연자" value={v.talent} />
      </div>

      {/* 버전 관리 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>버전 관리</div>
        <Field label="리비전" value={v.revision != null ? `v${v.revision}` : undefined} />
        <Field label="최종 수정일" value={v.lastModifiedDate} />
        <Field label="최근 변경" value={v.recentChanges} />
      </div>

      {/* 사람 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>사람</div>
        <Field label="제작자" value={v.creator} />
        <Field label="최종 수정자" value={v.lastModifier} />
        <Field label="제작일" value={v.productionDate} />
      </div>

      {/* 파일 위치 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>파일 위치</div>
        <Field label="파일명" value={v.fileName} />
        <Field label="NAS 경로" value={v.nasPath} />
        {v.gdriveLink ? (
          <div style={fieldRow}>
            <span style={fieldLabel}>GDrive</span>
            <a href={v.gdriveLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', wordBreak: 'break-all', fontSize: '0.9em' }}>링크 열기</a>
          </div>
        ) : <Field label="GDrive" />}
      </div>

      {/* 자막 상태 */}
      <div style={cardStyle}>
        <div style={cardTitleStyle}>자막 상태</div>
        {subtitleStatus ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {subtitleStatus.map((s) => (
              <span key={s.lang} style={{
                padding: '3px 10px',
                borderRadius: 6,
                fontSize: '0.85em',
                fontWeight: 600,
                background: s.hasContent ? '#d4edda' : '#f8d7da',
                color: s.hasContent ? '#155724' : '#721c24',
              }}>
                {s.lang} {s.hasContent ? '✓' : '✗'}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '0.85em', opacity: 0.5 }}>로딩 중...</span>
        )}
      </div>

      {/* 행사 + 메모 */}
      <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
        <div style={cardTitleStyle}>연결 · 메모</div>
        <Field label="행사" value={v.eventNames.length > 0 ? v.eventNames.join(', ') : undefined} />
        <Field label="메모" value={v.memo} />
        <div style={{ marginTop: 6 }}>
          <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82em', color: 'var(--primary)' }}>Notion에서 보기</a>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateVideoForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState('')
  const [resolution, setResolution] = useState('')
  const [status, setStatus] = useState('제작중')
  const [creator, setCreator] = useState('')
  const [memo, setMemo] = useState('')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setFormError('영상명을 입력하세요'); return }
    setSubmitting(true)
    setFormError(null)
    try {
      // Create via Notion API through our worker — we need a create endpoint
      // For now, use the subtitle-videos endpoint pattern
      await api('/subtitle-videos', {
        method: 'POST',
        body: JSON.stringify({
          videoName: name.trim(),
          videoCode: code.trim() || undefined,
          category: category || undefined,
          resolution: resolution || undefined,
          status: status || undefined,
          creator: creator.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      })
      onCreated()
    } catch (err) {
      setFormError(toErrorMessage(err, '영상 등록에 실패했습니다'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 16, maxWidth: 700 }}>
      <div style={cardTitleStyle}>영상 등록</div>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
          <label style={formLabelStyle}>
            영상명 *
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="회사소개영상 (인포O)" />
          </label>
          <label style={formLabelStyle}>
            영상 코드
            <input value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} placeholder="VID-2026-003" />
          </label>
          <label style={formLabelStyle}>
            카테고리
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="">선택</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={formLabelStyle}>
            원본 해상도
            <select value={resolution} onChange={(e) => setResolution(e.target.value)} style={inputStyle}>
              <option value="">선택</option>
              {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={formLabelStyle}>
            상태
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={formLabelStyle}>
            제작자
            <input value={creator} onChange={(e) => setCreator(e.target.value)} style={inputStyle} placeholder="이름" />
          </label>
          <label style={{ ...formLabelStyle, gridColumn: '1 / -1' }}>
            메모
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} style={{ ...inputStyle, minHeight: 50 }} placeholder="특이사항" />
          </label>
        </div>
        {formError ? <div style={{ color: 'var(--error)', fontSize: '0.82em', marginTop: 6 }}>{formError}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={btnStyle}>취소</button>
          <button type="submit" disabled={submitting} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff' }}>
            {submitting ? '등록 중...' : '등록'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cellStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.84em', verticalAlign: 'middle' }
const thStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: 'var(--surface1)', position: 'sticky', top: 0, textAlign: 'left' }
const selectStyle: React.CSSProperties = { padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.82em', background: 'var(--surface1)' }
const btnStyle: React.CSSProperties = { padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface1)', cursor: 'pointer', fontSize: '0.82em' }
const badgeStyle: React.CSSProperties = { fontSize: '0.8em', padding: '1px 6px', borderRadius: 4, background: 'var(--border)' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85em', boxSizing: 'border-box' }
const formLabelStyle: React.CSSProperties = { display: 'block', fontSize: '0.82em', fontWeight: 500 }
