import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SubtitleVideoRecord, SubtitleVideosResponse } from '../../shared/types'
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

export function VideoManagementView() {
  const [videos, setVideos] = useState<SubtitleVideoRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterQ, setFilterQ] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  const categories = useMemo(() => {
    const cats = new Set<string>()
    for (const v of videos) { if (v.category) cats.add(v.category) }
    return [...cats].sort()
  }, [videos])

  const statuses = useMemo(() => {
    const sts = new Set<string>()
    for (const v of videos) { if (v.status) sts.add(v.status) }
    return [...sts].sort()
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
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {error ? <div style={{ color: 'var(--error)', marginBottom: 8 }}>{error}</div> : null}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="">카테고리 전체</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">상태 전체</option>
          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
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
      </div>

      {loading ? <div style={{ padding: 16, textAlign: 'center' }}>로딩 중...</div> : null}

      {!loading && filtered.length === 0 ? (
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
                        <VideoDetail video={v} />
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
// Detail panel
// ---------------------------------------------------------------------------

function VideoDetail({ video: v }: { video: SubtitleVideoRecord }) {
  const rows: Array<[string, string | undefined]> = [
    ['영상 코드', v.videoCode],
    ['카테고리', v.category],
    ['원본 해상도', v.resolution],
    ['변환 버전', v.resolutionVariants.length > 0 ? v.resolutionVariants.join(', ') : undefined],
    ['출연자', v.talent],
    ['리비전', v.revision != null ? `v${v.revision}` : undefined],
    ['최종 수정일', v.lastModifiedDate],
    ['최근 변경사항', v.recentChanges],
    ['제작자', v.creator],
    ['최종 수정자', v.lastModifier],
    ['제작일', v.productionDate],
    ['상태', v.status],
    ['행사', v.eventNames.length > 0 ? v.eventNames.join(', ') : undefined],
    ['파일명', v.fileName],
    ['NAS 경로', v.nasPath],
    ['메모', v.memo],
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px', fontSize: '0.85em' }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
          <span style={{ color: 'var(--text-sub, #888)', minWidth: 90, flexShrink: 0 }}>{label}</span>
          <span style={{ wordBreak: 'break-all' }}>{value ?? <span style={{ opacity: 0.4 }}>-</span>}</span>
        </div>
      ))}
      {v.gdriveLink ? (
        <div style={{ display: 'flex', gap: 8, padding: '2px 0', gridColumn: '1 / -1' }}>
          <span style={{ color: 'var(--text-sub, #888)', minWidth: 90, flexShrink: 0 }}>구글 드라이브</span>
          <a href={v.gdriveLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', wordBreak: 'break-all' }}>{v.gdriveLink}</a>
        </div>
      ) : null}
      <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
        <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.85em', color: 'var(--primary)' }}>Notion에서 보기</a>
      </div>
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
