import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  SubtitleVideoRecord,
  SubtitleRevisionRecord,
  SubtitleSegment,
  SubtitleSnapshotData,
  SubtitleVideosResponse,
  SubtitleRevisionsResponse,
} from '../../shared/types'
import { api } from '../../shared/api/client'
import { matchAndClassify, compressDiffs, formatTimecodeShift, type SegmentDiff, type CompressedDiffEntry, type DiffToken } from './subtitleDiff'
import { parseSubtitleXlsx, exportSubtitleXlsx } from './subtitleXlsx'

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SubtitleView() {
  // Data
  const [videos, setVideos] = useState<SubtitleVideoRecord[]>([])
  const [revisions, setRevisions] = useState<SubtitleRevisionRecord[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Diff
  const [compareLeft, setCompareLeft] = useState<number | null>(null)
  const [compareRight, setCompareRight] = useState<number | null>(null)

  // Edit
  const [editing, setEditing] = useState(false)
  const [editSegments, setEditSegments] = useState<SubtitleSegment[]>([])

  // Import
  const [importPreview, setImportPreview] = useState<SubtitleSegment[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveSummary, setSaveSummary] = useState('')
  const [saveModifier, setSaveModifier] = useState('')
  const [saving, setSaving] = useState(false)

  // Pending segments to save (either from edit or import)
  const [pendingSegments, setPendingSegments] = useState<SubtitleSegment[] | null>(null)

  // Filter for diff view
  const [showTimecodeOnly, setShowTimecodeOnly] = useState(false)
  const [showUnchanged, setShowUnchanged] = useState(false)

  // Fetch videos
  const fetchVideos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<SubtitleVideosResponse>('/subtitle-videos')
      setVideos(res.videos)
    } catch (err) {
      setError(toErrorMessage(err, '영상 목록을 불러오지 못했습니다'))
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch revisions for selected video
  const fetchRevisions = useCallback(async (videoId: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = videoId ? `?videoId=${videoId}` : ''
      const res = await api<SubtitleRevisionsResponse>(`/subtitle-revisions${params}`)
      setRevisions(res.revisions)
    } catch (err) {
      setError(toErrorMessage(err, '리비전 목록을 불러오지 못했습니다'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVideos() }, [fetchVideos])

  useEffect(() => {
    if (selectedVideoId) {
      fetchRevisions(selectedVideoId)
      setCompareLeft(null)
      setCompareRight(null)
      setEditing(false)
      setImportPreview(null)
    }
  }, [selectedVideoId, fetchRevisions])

  // Current (latest) revision
  const latestRevision = revisions[0] ?? null
  const currentSegments = latestRevision?.snapshot?.segments ?? []

  // Diff computation
  const diffResult = useMemo<CompressedDiffEntry[] | null>(() => {
    if (compareLeft === null || compareRight === null) return null
    const leftRev = revisions.find((r) => r.revisionNumber === compareLeft)
    const rightRev = revisions.find((r) => r.revisionNumber === compareRight)
    if (!leftRev || !rightRev) return null
    const rawDiffs = matchAndClassify(leftRev.snapshot.segments, rightRev.snapshot.segments)
    return compressDiffs(rawDiffs)
  }, [compareLeft, compareRight, revisions])

  // Import preview diff
  const importDiff = useMemo<SegmentDiff[] | null>(() => {
    if (!importPreview) return null
    return matchAndClassify(currentSegments, importPreview)
  }, [importPreview, currentSegments])

  // Handlers
  const onFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const segments = parseSubtitleXlsx(ev.target!.result as ArrayBuffer)
        setImportPreview(segments)
        setEditing(false)
      } catch {
        setError('xlsx 파일을 파싱하지 못했습니다')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const onExport = () => {
    if (!currentSegments.length) return
    const video = videos.find((v) => v.id === selectedVideoId)
    const name = video?.videoName ?? 'subtitle'
    exportSubtitleXlsx(currentSegments, `${name}_v${latestRevision?.revisionNumber ?? 1}.xlsx`)
  }

  const onStartEdit = () => {
    setEditing(true)
    setEditSegments(currentSegments.map((s) => ({ ...s })))
    setImportPreview(null)
  }

  const onCancelEdit = () => {
    setEditing(false)
    setEditSegments([])
  }

  const onEditCell = (index: number, field: keyof SubtitleSegment, value: string) => {
    setEditSegments((prev) => prev.map((seg, i) => (i === index ? { ...seg, [field]: value } : seg)))
  }

  const onAddSegment = () => {
    setEditSegments((prev) => [
      ...prev,
      { index: prev.length + 1, label: '', startTime: '00:00:00', endTime: '00:00:00', ko: '', en: '', zh: '', ru: '' },
    ])
  }

  const onRemoveSegment = (index: number) => {
    setEditSegments((prev) => prev.filter((_, i) => i !== index).map((seg, i) => ({ ...seg, index: i + 1 })))
  }

  const onPrepSave = (segments: SubtitleSegment[]) => {
    setPendingSegments(segments)
    const nextNum = (latestRevision?.revisionNumber ?? 0) + 1
    setSaveName(`v${nextNum}`)
    setSaveSummary('')
    setSaveModifier('')
    setShowSaveModal(true)
  }

  const onSave = async () => {
    if (!pendingSegments || !selectedVideoId) return
    setSaving(true)
    try {
      const nextNum = (latestRevision?.revisionNumber ?? 0) + 1
      await api('/subtitle-revisions', {
        method: 'POST',
        body: JSON.stringify({
          videoId: selectedVideoId,
          revisionName: saveName || `v${nextNum}`,
          revisionNumber: nextNum,
          modifier: saveModifier,
          changeSummary: saveSummary,
          snapshot: { segments: pendingSegments } as SubtitleSnapshotData,
        }),
      })
      setShowSaveModal(false)
      setEditing(false)
      setImportPreview(null)
      setPendingSegments(null)
      await fetchRevisions(selectedVideoId)
    } catch (err) {
      setError(toErrorMessage(err, '리비전 저장에 실패했습니다'))
    } finally {
      setSaving(false)
    }
  }

  const onRevisionClick = (revNum: number) => {
    if (compareLeft === null) {
      setCompareLeft(revNum)
    } else if (compareRight === null && revNum !== compareLeft) {
      // Ensure left < right (older on left)
      if (revNum < compareLeft) {
        setCompareRight(compareLeft)
        setCompareLeft(revNum)
      } else {
        setCompareRight(revNum)
      }
    } else {
      setCompareLeft(revNum)
      setCompareRight(null)
    }
  }

  const clearCompare = () => {
    setCompareLeft(null)
    setCompareRight(null)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0 }}>
      {/* Left: Video list */}
      <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', paddingRight: 12, overflowY: 'auto' }}>
        <h3 style={{ fontSize: '0.9em', margin: '0 0 8px' }}>영상 목록</h3>
        {videos.length === 0 && !loading ? <p className="muted" style={{ fontSize: '0.85em' }}>등록된 영상이 없습니다</p> : null}
        {videos.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setSelectedVideoId(v.id)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              marginBottom: 4,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: v.id === selectedVideoId ? 'var(--primary)' : 'var(--surface1)',
              color: v.id === selectedVideoId ? '#fff' : 'var(--text1)',
              cursor: 'pointer',
              fontSize: '0.85em',
            }}
          >
            <div style={{ fontWeight: 600 }}>{v.videoName}</div>
            {v.videoCode ? <div style={{ fontSize: '0.75em', opacity: 0.6, fontFamily: 'monospace' }}>{v.videoCode}</div> : null}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              {v.category ? <span style={{ fontSize: '0.7em', padding: '1px 4px', borderRadius: 3, background: v.id === selectedVideoId ? 'rgba(255,255,255,0.2)' : 'var(--border)' }}>{v.category}</span> : null}
              {v.status ? <span style={{ fontSize: '0.7em', padding: '1px 4px', borderRadius: 3, background: v.status === '사용중' ? '#d4edda' : v.status === '제작중' ? '#fff3cd' : v.status === '폐기' ? '#f8d7da' : 'var(--border)', color: v.id === selectedVideoId ? '#fff' : undefined }}>{v.status}</span> : null}
            </div>
          </button>
        ))}
      </aside>

      {/* Center: Content area */}
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {error ? <div style={{ color: 'var(--error)', marginBottom: 8 }}>{error}</div> : null}
        {loading ? <div style={{ padding: 16, textAlign: 'center' }}>로딩 중...</div> : null}

        {!selectedVideoId && !loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-sub, #888)' }}>
            왼쪽에서 영상을 선택하세요
          </div>
        ) : null}

        {selectedVideoId && !loading ? (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onFileImport} style={{ display: 'none' }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={btnStyle}>
                가져오기 (xlsx)
              </button>
              <button type="button" onClick={onExport} disabled={!currentSegments.length} style={btnStyle}>
                내보내기 (xlsx)
              </button>
              {!editing && !importPreview && !diffResult ? (
                <button type="button" onClick={onStartEdit} style={btnStyle}>편집</button>
              ) : null}
              {editing ? (
                <>
                  <button type="button" onClick={onCancelEdit} style={btnStyle}>취소</button>
                  <button type="button" onClick={() => onPrepSave(editSegments)} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff' }}>
                    저장
                  </button>
                </>
              ) : null}
              {importPreview ? (
                <>
                  <button type="button" onClick={() => setImportPreview(null)} style={btnStyle}>취소</button>
                  <button type="button" onClick={() => onPrepSave(importPreview)} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff' }}>
                    이 내용으로 저장
                  </button>
                </>
              ) : null}
              {diffResult ? (
                <button type="button" onClick={clearCompare} style={btnStyle}>비교 닫기</button>
              ) : null}
            </div>

            {/* Diff view */}
            {diffResult ? (
              <DiffView entries={diffResult} showTimecodeOnly={showTimecodeOnly} showUnchanged={showUnchanged} onToggleTimecode={() => setShowTimecodeOnly(!showTimecodeOnly)} onToggleUnchanged={() => setShowUnchanged(!showUnchanged)} />
            ) : importPreview && importDiff ? (
              <>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.9em' }}>가져오기 미리보기 — 현재 자막과 비교</h4>
                <DiffView entries={compressDiffs(importDiff)} showTimecodeOnly={showTimecodeOnly} showUnchanged={showUnchanged} onToggleTimecode={() => setShowTimecodeOnly(!showTimecodeOnly)} onToggleUnchanged={() => setShowUnchanged(!showUnchanged)} />
              </>
            ) : editing ? (
              <EditTable segments={editSegments} onEditCell={onEditCell} onAddSegment={onAddSegment} onRemoveSegment={onRemoveSegment} />
            ) : (
              <SegmentTable segments={currentSegments} />
            )}
          </>
        ) : null}
      </main>

      {/* Right: Revision history */}
      {selectedVideoId ? (
        <aside style={{ width: 200, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 12, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.9em', margin: '0 0 8px' }}>리비전 히스토리</h3>
          <p style={{ fontSize: '0.75em', color: 'var(--text-sub, #888)', margin: '0 0 8px' }}>2개를 클릭하면 비교</p>
          {revisions.length === 0 ? <p className="muted" style={{ fontSize: '0.85em' }}>리비전 없음</p> : null}
          {revisions.map((rev) => {
            const isSelected = rev.revisionNumber === compareLeft || rev.revisionNumber === compareRight
            return (
              <button
                key={rev.id}
                type="button"
                onClick={() => onRevisionClick(rev.revisionNumber)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  marginBottom: 4,
                  border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 6,
                  background: isSelected ? 'rgba(59,130,246,0.1)' : 'var(--surface1)',
                  cursor: 'pointer',
                  fontSize: '0.8em',
                }}
              >
                <div style={{ fontWeight: 600 }}>{rev.revisionName}</div>
                <div style={{ opacity: 0.7 }}>{rev.modifiedDate ?? ''} {rev.modifier ? `· ${rev.modifier}` : ''}</div>
                {rev.changeSummary ? <div style={{ opacity: 0.6, marginTop: 2 }}>{rev.changeSummary}</div> : null}
              </button>
            )
          })}
        </aside>
      ) : null}

      {/* Save modal */}
      {showSaveModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface1)', borderRadius: 12, padding: 24, width: 360, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 12px' }}>새 리비전 저장</h3>
            <label style={labelStyle}>
              리비전명
              <input value={saveName} onChange={(e) => setSaveName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              수정자
              <input value={saveModifier} onChange={(e) => setSaveModifier(e.target.value)} style={inputStyle} placeholder="이름" />
            </label>
            <label style={labelStyle}>
              변경 요약
              <textarea value={saveSummary} onChange={(e) => setSaveSummary(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="무엇이 바뀌었는지" />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={() => setShowSaveModal(false)} disabled={saving} style={btnStyle}>취소</button>
              <button type="button" onClick={onSave} disabled={saving} style={{ ...btnStyle, background: 'var(--primary)', color: '#fff' }}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const cellStyle: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--border)', fontSize: '0.82em', verticalAlign: 'top' }
const thStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: 'var(--surface1)', position: 'sticky', top: 0 }
const btnStyle: React.CSSProperties = { padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface1)', cursor: 'pointer', fontSize: '0.82em' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.85em', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 10, fontSize: '0.85em' }

function SegmentTable({ segments }: { segments: SubtitleSegment[] }) {
  if (!segments.length) return <p className="muted" style={{ fontSize: '0.85em' }}>자막 구간이 없습니다</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>구간명</th>
            <th style={thStyle}>시작</th>
            <th style={thStyle}>끝</th>
            <th style={thStyle}>한국어</th>
            <th style={thStyle}>영어</th>
            <th style={thStyle}>중국어</th>
            <th style={thStyle}>러시아어</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr key={i}>
              <td style={cellStyle}>{seg.index}</td>
              <td style={cellStyle}>{seg.label}</td>
              <td style={cellStyle}>{seg.startTime}</td>
              <td style={cellStyle}>{seg.endTime}</td>
              <td style={cellStyle}>{seg.ko}</td>
              <td style={cellStyle}>{seg.en}</td>
              <td style={cellStyle}>{seg.zh}</td>
              <td style={cellStyle}>{seg.ru}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EditTable({
  segments,
  onEditCell,
  onAddSegment,
  onRemoveSegment,
}: {
  segments: SubtitleSegment[]
  onEditCell: (index: number, field: keyof SubtitleSegment, value: string) => void
  onAddSegment: () => void
  onRemoveSegment: (index: number) => void
}) {
  const smallInput: React.CSSProperties = { width: '100%', padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.82em', boxSizing: 'border-box' }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>구간명</th>
            <th style={thStyle}>시작</th>
            <th style={thStyle}>끝</th>
            <th style={thStyle}>한국어</th>
            <th style={thStyle}>영어</th>
            <th style={thStyle}>중국어</th>
            <th style={thStyle}>러시아어</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg, i) => (
            <tr key={i}>
              <td style={cellStyle}>{seg.index}</td>
              <td style={cellStyle}><input value={seg.label} onChange={(e) => onEditCell(i, 'label', e.target.value)} style={smallInput} /></td>
              <td style={cellStyle}><input value={seg.startTime} onChange={(e) => onEditCell(i, 'startTime', e.target.value)} style={smallInput} /></td>
              <td style={cellStyle}><input value={seg.endTime} onChange={(e) => onEditCell(i, 'endTime', e.target.value)} style={smallInput} /></td>
              <td style={cellStyle}><textarea value={seg.ko} onChange={(e) => onEditCell(i, 'ko', e.target.value)} style={{ ...smallInput, minHeight: 40 }} /></td>
              <td style={cellStyle}><textarea value={seg.en} onChange={(e) => onEditCell(i, 'en', e.target.value)} style={{ ...smallInput, minHeight: 40 }} /></td>
              <td style={cellStyle}><textarea value={seg.zh} onChange={(e) => onEditCell(i, 'zh', e.target.value)} style={{ ...smallInput, minHeight: 40 }} /></td>
              <td style={cellStyle}><textarea value={seg.ru} onChange={(e) => onEditCell(i, 'ru', e.target.value)} style={{ ...smallInput, minHeight: 40 }} /></td>
              <td style={cellStyle}>
                <button type="button" onClick={() => onRemoveSegment(i)} style={{ ...btnStyle, color: 'var(--error)', padding: '2px 6px' }}>X</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={onAddSegment} style={{ ...btnStyle, marginTop: 8 }}>+ 구간 추가</button>
    </div>
  )
}

function DiffTokenSpan({ tokens }: { tokens: DiffToken[] }) {
  return (
    <span>
      {tokens.map((t, i) => {
        if (t.type === 'removed') return <span key={i} style={{ background: '#fdd', color: '#b00', textDecoration: 'line-through' }}>{t.text}</span>
        if (t.type === 'added') return <span key={i} style={{ background: '#dfd', color: '#060' }}>{t.text}</span>
        return <span key={i}>{t.text}</span>
      })}
    </span>
  )
}

function DiffView({
  entries,
  showTimecodeOnly,
  showUnchanged,
  onToggleTimecode,
  onToggleUnchanged,
}: {
  entries: CompressedDiffEntry[]
  showTimecodeOnly: boolean
  showUnchanged: boolean
  onToggleTimecode: () => void
  onToggleUnchanged: () => void
}) {
  // Stats
  const stats = useMemo(() => {
    let content = 0, tc = 0, added = 0, removed = 0
    for (const e of entries) {
      if (e.kind === 'batch_shift') { tc += e.diffs.length; continue }
      const d = e.diff
      if (d.changeType === 'content_changed') content++
      else if (d.changeType === 'timecode_only') tc++
      else if (d.changeType === 'added') added++
      else if (d.changeType === 'removed') removed++
    }
    return { content, tc, added, removed }
  }, [entries])

  return (
    <div>
      <div style={{ fontSize: '0.82em', marginBottom: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>내용 변경 <strong>{stats.content}</strong></span>
        <span>타임코드 시프트 <strong>{stats.tc}</strong></span>
        <span>추가 <strong>{stats.added}</strong></span>
        <span>삭제 <strong>{stats.removed}</strong></span>
        <label style={{ fontSize: '0.9em' }}><input type="checkbox" checked={showTimecodeOnly} onChange={onToggleTimecode} /> 타임코드만 변경 표시</label>
        <label style={{ fontSize: '0.9em' }}><input type="checkbox" checked={showUnchanged} onChange={onToggleUnchanged} /> 변경 없음 표시</label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th style={thStyle}>구간명</th>
              <th style={thStyle}>타임코드</th>
              <th style={thStyle}>한국어</th>
              <th style={thStyle}>영어</th>
              <th style={thStyle}>중국어</th>
              <th style={thStyle}>러시아어</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, ei) => {
              if (entry.kind === 'batch_shift') {
                return (
                  <tr key={ei} style={{ background: '#e8f0fe' }}>
                    <td colSpan={7} style={{ ...cellStyle, fontStyle: 'italic', textAlign: 'center' }}>
                      구간 {entry.fromIndex}~{entry.toIndex}: 타임코드 {formatTimecodeShift(entry.delta)} (내용 변경 없음)
                    </td>
                  </tr>
                )
              }

              const d = entry.diff
              if (d.changeType === 'unchanged' && !showUnchanged) return null
              if (d.changeType === 'timecode_only' && !showTimecodeOnly) return null

              const seg = d.newSegment ?? d.oldSegment!
              const bg =
                d.changeType === 'content_changed' ? '#fef9e7'
                  : d.changeType === 'timecode_only' ? '#e8f0fe'
                    : d.changeType === 'added' ? '#e6f9e6'
                      : d.changeType === 'removed' ? '#fde8e8'
                        : undefined

              const langDiffMap = new Map(d.textDiffs.map((ld) => [ld.lang, ld.tokens]))

              return (
                <tr key={ei} style={{ background: bg, textDecoration: d.changeType === 'removed' ? 'line-through' : undefined }}>
                  <td style={cellStyle}>{seg.index}</td>
                  <td style={cellStyle}>
                    {seg.label}
                    {d.changeType === 'added' ? <span style={{ color: '#060', fontWeight: 600, marginLeft: 4 }}>[NEW]</span> : null}
                  </td>
                  <td style={cellStyle}>
                    {seg.startTime}~{seg.endTime}
                    {d.timecodeShift ? <div style={{ fontSize: '0.8em', color: '#36c' }}>{formatTimecodeShift(d.timecodeShift.startDelta)}</div> : null}
                  </td>
                  <td style={cellStyle}>{langDiffMap.has('ko') ? <DiffTokenSpan tokens={langDiffMap.get('ko')!} /> : seg.ko}</td>
                  <td style={cellStyle}>{langDiffMap.has('en') ? <DiffTokenSpan tokens={langDiffMap.get('en')!} /> : seg.en}</td>
                  <td style={cellStyle}>{langDiffMap.has('zh') ? <DiffTokenSpan tokens={langDiffMap.get('zh')!} /> : seg.zh}</td>
                  <td style={cellStyle}>{langDiffMap.has('ru') ? <DiffTokenSpan tokens={langDiffMap.get('ru')!} /> : seg.ru}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
