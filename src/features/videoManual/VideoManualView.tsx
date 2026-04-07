import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VideoManualItemRecord, VideoManualResponse } from '../../shared/types'
import { api } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'izen-video-manual-checks'

function loadChecked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveChecked(state: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = { marginBottom: 16 }

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 8,
  cursor: 'pointer',
  userSelect: 'none',
  border: 'none',
  background: 'var(--bg-secondary, #f5f5f5)',
  width: '100%',
  textAlign: 'left',
  color: 'inherit',
  font: 'inherit',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '8px 12px 8px 24px',
  borderRadius: 6,
}

const checkboxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  marginTop: 2,
  cursor: 'pointer',
  accentColor: 'var(--primary)',
  flexShrink: 0,
}

const progressWrapStyle: React.CSSProperties = {
  position: 'relative',
  height: 24,
  background: 'var(--bg-secondary, #f0f0f0)',
  borderRadius: 8,
  overflow: 'hidden',
  marginBottom: 16,
}

const progressBarStyle = (pct: number): React.CSSProperties => ({
  height: '100%',
  width: `${pct}%`,
  background: 'var(--primary)',
  borderRadius: 8,
  transition: 'width 0.3s ease',
})

const progressTextStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.78em',
  fontWeight: 600,
  color: 'var(--text-sub)',
  pointerEvents: 'none',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoManualView() {
  const [items, setItems] = useState<VideoManualItemRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<VideoManualResponse>('/video-manual')
      setItems(res.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : '체크리스트를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const grouped = useMemo(() => {
    const map = new Map<string, VideoManualItemRecord[]>()
    for (const item of items) {
      const list = map.get(item.category) ?? []
      list.push(item)
      map.set(item.category, list)
    }
    return [...map.entries()]
  }, [items])

  const totalCount = items.length
  const checkedCount = items.filter((i) => checked[i.id]).length
  const pct = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0

  function toggle(id: string) {
    setChecked((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      saveChecked(next)
      return next
    })
  }

  function resetAll() {
    setChecked({})
    saveChecked({})
  }

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {error ? <div style={{ color: 'var(--error)', marginBottom: 8, fontSize: '0.85em' }}>{error}</div> : null}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.82em', color: 'var(--text-sub, #888)' }}>{items.length}건</span>
        <button
          type="button"
          onClick={fetchItems}
          style={{
            padding: '4px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg)',
            cursor: 'pointer',
            fontSize: '0.82em',
          }}
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={resetAll}
          style={{
            padding: '4px 12px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg)',
            cursor: 'pointer',
            fontSize: '0.82em',
          }}
        >
          전체 초기화
        </button>
        <a
          href="izen-overlay://open"
          onClick={(e) => {
            e.preventDefault()
            window.open('izen-overlay://open', '_self')
          }}
          style={{
            marginLeft: 'auto',
            padding: '4px 12px',
            border: '1px solid var(--primary)',
            borderRadius: 6,
            background: 'rgba(59,130,246,0.08)',
            color: 'var(--primary)',
            cursor: 'pointer',
            fontSize: '0.82em',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ◐ 오버레이 실행
        </a>
      </div>

      {loading ? <div style={{ padding: 16, textAlign: 'center' }}>로딩 중...</div> : null}

      {/* Progress */}
      <div style={progressWrapStyle}>
        <div style={progressBarStyle(pct)} />
        <span style={progressTextStyle}>
          {checkedCount} / {totalCount} ({pct}%)
        </span>
      </div>

      {/* Checklist */}
      {grouped.map(([category, catItems]) => {
        const catChecked = catItems.filter((i) => checked[i.id]).length
        const isCollapsed = collapsed[category]
        const allDone = catChecked === catItems.length

        return (
          <div key={category} style={sectionStyle}>
            <button type="button" style={sectionHeaderStyle} onClick={() => toggleCategory(category)}>
              <span style={{ fontSize: 10, color: 'var(--text-sub)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
                ▶
              </span>
              <span style={{ fontWeight: 700, fontSize: '0.88em', color: 'var(--primary)', flex: 1 }}>
                {category}
              </span>
              <span style={{ fontSize: '0.78em', color: allDone ? 'var(--success, #22c55e)' : 'var(--text-sub, #888)' }}>
                {catChecked}/{catItems.length}
              </span>
            </button>

            {!isCollapsed ? (
              <div>
                {catItems.map((item) => {
                  const isChecked = !!checked[item.id]
                  return (
                    <label key={item.id} style={{ ...itemStyle, opacity: isChecked ? 0.45 : 1 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(item.id)}
                        style={checkboxStyle}
                      />
                      <span style={{ fontSize: '0.88em', lineHeight: 1.5, textDecoration: isChecked ? 'line-through' : 'none', cursor: 'pointer' }}>
                        {item.itemName}
                        {item.description ? (
                          <span style={{ display: 'block', fontSize: '0.85em', color: 'var(--text-sub, #888)', marginTop: 2 }}>
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
