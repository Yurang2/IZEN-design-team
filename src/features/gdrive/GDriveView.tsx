import { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GDriveFile = {
  id: string
  name: string
  isDir: boolean
  mimeType: string
  thumbnailLink?: string
  webViewLink?: string
  size?: number
  createdTime?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function isPdf(mimeType: string): boolean {
  return mimeType === 'application/pdf'
}

function isVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const cardStyle: React.CSSProperties = {
  background: 'var(--surface1)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 16,
  boxShadow: 'var(--shadow-sm)',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 10,
}

const thumbCardStyle: React.CSSProperties = {
  background: 'var(--surface2, #f5f7fb)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  overflow: 'hidden',
  cursor: 'pointer',
}

const thumbImgStyle: React.CSSProperties = {
  width: '100%',
  height: 140,
  objectFit: 'cover',
  background: '#e5e7eb',
}

const thumbInfoStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '0.78em',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GDriveView() {
  const [files, setFiles] = useState<GDriveFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [folderId, setFolderId] = useState('root')
  const [folderStack, setFolderStack] = useState<Array<{ id: string; name: string }>>([{ id: 'root', name: 'Google Drive' }])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')

  const fetchFiles = useCallback(async (targetFolderId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api<{ ok: boolean; files?: GDriveFile[]; error?: string }>('/gdrive/list', {
        method: 'POST',
        body: JSON.stringify({ folderId: targetFolderId }),
      })
      if (res.ok && res.files) {
        const sorted = res.files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setFiles(sorted)
        setFolderId(targetFolderId)
      } else {
        setError(res.error ?? '파일을 불러올 수 없습니다')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles('root')
  }, [fetchFiles])

  function navigateToFolder(file: GDriveFile) {
    setFolderStack((prev) => [...prev, { id: file.id, name: file.name }])
    setSearch('')
    fetchFiles(file.id)
  }

  function navigateBack(index: number) {
    const target = folderStack[index]
    setFolderStack((prev) => prev.slice(0, index + 1))
    setSearch('')
    fetchFiles(target.id)
  }

  const thumbnailUrl = (fileId: string) => `${API_BASE}/gdrive/thumbnail?fileId=${fileId}`

  const filtered = search
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  const folders = filtered.filter((f) => f.isDir)
  const items = filtered.filter((f) => !f.isDir)

  return (
    <section className="workflowView" aria-label="Google Drive">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">Google Drive Library</span>
          <h2>구글 드라이브 (Library)</h2>
          <p>완성 배포본을 확인하고, 딜러 공유용 자료를 검색합니다.</p>
        </div>
      </header>

      {/* Breadcrumb + controls */}
      <div style={{ ...cardStyle, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82em', flexWrap: 'wrap' }}>
          {folderStack.map((folder, i) => (
            <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 ? <span style={{ color: 'var(--muted)' }}>/</span> : null}
              <span
                style={{ cursor: i < folderStack.length - 1 ? 'pointer' : 'default', color: i < folderStack.length - 1 ? 'var(--primary)' : 'var(--text1)', fontWeight: i === folderStack.length - 1 ? 700 : 400 }}
                onClick={() => i < folderStack.length - 1 && navigateBack(i)}
              >
                {folder.name}
              </span>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            style={{ background: 'var(--input-bg, var(--surface1))', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.82em', padding: '5px 8px', width: 160 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="파일명 검색..."
          />
          <button type="button" className={viewMode === 'grid' ? '' : 'secondary'} onClick={() => setViewMode('grid')} style={{ padding: '5px 10px', fontSize: '0.82em' }}>그리드</button>
          <button type="button" className={viewMode === 'list' ? '' : 'secondary'} onClick={() => setViewMode('list')} style={{ padding: '5px 10px', fontSize: '0.82em' }}>목록</button>
        </div>
      </div>

      {error ? <div style={{ padding: 12, fontSize: '0.82em', color: 'var(--danger)', background: '#fef2f2', borderRadius: 8 }}>{error}</div> : null}
      {loading ? <div style={{ padding: 20, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div> : null}

      {!loading && !error ? (
        <div style={cardStyle}>
          {/* Folders */}
          {folders.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.78em', color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>폴더</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {folders.map((f) => (
                  <div key={f.id} onClick={() => navigateToFolder(f)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                    background: 'var(--surface2, #f5f7fb)', border: '1px solid var(--border)', borderRadius: 8,
                    cursor: 'pointer', fontSize: '0.85em',
                  }}>
                    <span>📁</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Files */}
          {items.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.78em', color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>파일 ({items.length}개)</div>
              {viewMode === 'grid' ? (
                <div style={gridStyle}>
                  {items.map((f) => (
                    <a key={f.id} href={f.webViewLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={thumbCardStyle}>
                        {isImage(f.mimeType) || isPdf(f.mimeType) ? (
                          <img src={thumbnailUrl(f.id)} alt={f.name} style={thumbImgStyle} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        ) : (
                          <div style={{ ...thumbImgStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2em', color: 'var(--muted)' }}>
                            {isVideo(f.mimeType) ? '🎬' : '📄'}
                          </div>
                        )}
                        <div style={thumbInfoStyle}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                            {f.size ? formatBytes(f.size) : ''}
                            {f.createdTime ? ` · ${new Date(f.createdTime).toLocaleDateString('ko-KR')}` : ''}
                          </div>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  {items.map((f) => (
                    <a key={f.id} href={f.webViewLink} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: '0.85em' }}>
                        <span>{isImage(f.mimeType) ? '🖼' : isVideo(f.mimeType) ? '🎬' : isPdf(f.mimeType) ? '📕' : '📄'}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ fontSize: '0.82em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {f.size ? formatBytes(f.size) : ''}
                        </span>
                        <span style={{ fontSize: '0.78em', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {f.createdTime ? new Date(f.createdTime).toLocaleDateString('ko-KR') : ''}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {folders.length === 0 && items.length === 0 && !loading ? (
            <div style={{ padding: 30, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>빈 폴더</div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
