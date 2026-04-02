import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SubtitleRevisionRecord, SubtitleRevisionsResponse } from '../../shared/types'
import { api } from '../../shared/api/client'
import { matchAndClassify, compressDiffs, formatTimecodeShift, type CompressedDiffEntry, type DiffToken } from './subtitleDiff'

function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

export function SubtitleSharePage() {
  const [revisions, setRevisions] = useState<SubtitleRevisionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(window.location.search)
      const videoId = params.get('videoId') ?? ''
      const qs = videoId ? `?videoId=${videoId}` : ''
      const res = await api<SubtitleRevisionsResponse>(`/subtitle-share${qs}`)
      setRevisions(res.revisions)
    } catch (err) {
      setError(toErrorMessage(err, '데이터를 불러오지 못했습니다'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const latest = revisions[0] ?? null
  const previous = revisions[1] ?? null
  const segments = latest?.snapshot?.segments ?? []

  const diffEntries = useMemo<CompressedDiffEntry[] | null>(() => {
    if (!latest || !previous) return null
    const diffs = matchAndClassify(previous.snapshot.segments, latest.snapshot.segments)
    return compressDiffs(diffs)
  }, [latest, previous])

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}>로딩 중...</div>
  if (error) return <div style={{ padding: 32, textAlign: 'center', color: 'red' }}>{error}</div>
  if (!latest) return <div style={{ padding: 32, textAlign: 'center' }}>등록된 자막이 없습니다</div>

  const cellStyle: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #ddd', fontSize: '0.85em', verticalAlign: 'top' }
  const thStyle: React.CSSProperties = { ...cellStyle, fontWeight: 600, background: '#f5f5f5', position: 'sticky', top: 0 }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.3em', margin: '0 0 4px' }}>자막 스크립트 — {latest.videoName ?? ''}</h1>
      <p style={{ color: '#666', fontSize: '0.85em', margin: '0 0 16px' }}>
        {latest.revisionName} · {latest.modifiedDate ?? ''} {latest.modifier ? `· ${latest.modifier}` : ''}
        {latest.changeSummary ? ` — ${latest.changeSummary}` : ''}
      </p>

      {diffEntries ? (
        <>
          <h2 style={{ fontSize: '1em', margin: '0 0 8px' }}>변경 사항 (이전 대비)</h2>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
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
                {diffEntries.map((entry, ei) => {
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
                  if (d.changeType === 'unchanged') return null

                  const seg = d.newSegment ?? d.oldSegment!
                  const bg =
                    d.changeType === 'content_changed' ? '#fef9e7'
                      : d.changeType === 'timecode_only' ? '#e8f0fe'
                        : d.changeType === 'added' ? '#e6f9e6'
                          : d.changeType === 'removed' ? '#fde8e8' : undefined

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
        </>
      ) : null}

      <h2 style={{ fontSize: '1em', margin: '0 0 8px' }}>현재 자막</h2>
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
