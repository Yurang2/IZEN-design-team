import { useCallback, useEffect, useState } from 'react'
import { api } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NasFile = { name: string; path: string; isDir: boolean; size?: number; mtime?: number }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAS_BASE = '/Izenimplant/Marketing'
const PROJECT_ROOT = NAS_BASE + '/01_PROJECT'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
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

const inputStyle: React.CSSProperties = {
  background: 'var(--input-bg, var(--surface1))',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text1)',
  fontSize: 13,
  padding: '8px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NasExplorerView() {
  // auth
  const [sid, setSid] = useState('')
  const [account, setAccount] = useState('')
  const [passwd, setPasswd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  // search
  const [searchQuery, setSearchQuery] = useState('')
  const [projects, setProjects] = useState<NasFile[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)

  // browse
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<NasFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------

  const nasLogin = useCallback(async () => {
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await api<{ ok: boolean; sid?: string; error?: string }>('/nas/login', {
        method: 'POST',
        body: JSON.stringify({ account, passwd }),
      })
      if (res.ok && res.sid) {
        setSid(res.sid)
        setLoggedIn(true)
      } else {
        setLoginError(res.error === 'nas_login_failed_invalid_credentials' ? '아이디 또는 비밀번호가 틀렸습니다' : res.error ?? '로그인 실패')
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '연결 실패')
    } finally {
      setLoginLoading(false)
    }
  }, [account, passwd])

  const nasLogout = useCallback(async () => {
    if (sid) await api('/nas/logout', { method: 'POST', body: JSON.stringify({ sid }) }).catch(() => {})
    setSid('')
    setLoggedIn(false)
    setProjects([])
    setFiles([])
    setCurrentPath('')
  }, [sid])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const res = await api<{ ok: boolean; files?: NasFile[] }>('/nas/list', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath: PROJECT_ROOT }),
      })
      if (res.ok && res.files) {
        setProjects(res.files.filter((f) => f.isDir).sort((a, b) => a.name.localeCompare(b.name)))
      }
    } catch { /* */ }
    finally { setProjectsLoading(false) }
  }, [sid])

  const browseFolder = useCallback(async (folderPath: string) => {
    setFilesLoading(true)
    try {
      const res = await api<{ ok: boolean; files?: NasFile[] }>('/nas/list', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath }),
      })
      if (res.ok && res.files) {
        setFiles(res.files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        }))
        setCurrentPath(folderPath)
      }
    } catch { /* */ }
    finally { setFilesLoading(false) }
  }, [sid])

  // load projects after login
  useEffect(() => {
    if (loggedIn && sid) loadProjects()
  }, [loggedIn, sid, loadProjects])

  // ---------------------------------------------------------------------------
  // Filtered projects
  // ---------------------------------------------------------------------------

  const filteredProjects = searchQuery
    ? projects.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : projects

  // breadcrumb
  const pathParts = currentPath ? currentPath.replace(NAS_BASE + '/', '').split('/').filter(Boolean) : []

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="workflowView" aria-label="NAS 탐색기">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">NAS Explorer</span>
          <h2>NAS 파일 탐색기</h2>
          <p>프로젝트를 검색하고 폴더 내용을 확인합니다. 읽기 전용입니다.</p>
        </div>
        {loggedIn ? (
          <button type="button" className="secondary mini" onClick={nasLogout} style={{ alignSelf: 'flex-start' }}>
            로그아웃
          </button>
        ) : null}
      </header>

      {/* Login */}
      {!loggedIn ? (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95em' }}>NAS 로그인</h3>
          <div style={{ display: 'grid', gap: 10, maxWidth: 340 }}>
            <div>
              <label style={{ fontSize: '0.82em', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>아이디</label>
              <input style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="NAS 아이디" onKeyDown={(e) => e.key === 'Enter' && nasLogin()} />
            </div>
            <div>
              <label style={{ fontSize: '0.82em', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>비밀번호</label>
              <input type="password" style={inputStyle} value={passwd} onChange={(e) => setPasswd(e.target.value)} placeholder="NAS 비밀번호" onKeyDown={(e) => e.key === 'Enter' && nasLogin()} />
            </div>
            {loginError ? <div style={{ fontSize: '0.82em', color: 'var(--danger)' }}>{loginError}</div> : null}
            <button type="button" onClick={nasLogin} disabled={loginLoading || !account || !passwd}>
              {loginLoading ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Main content */}
      {loggedIn ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Left: Project search */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.88em' }}>프로젝트 검색</h3>
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="프로젝트명 검색 (예: AEEDC, CIS, 카달로그...)"
            />
            {projectsLoading ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div>
            ) : (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10,
                maxHeight: 500, overflowY: 'auto',
              }}>
                {filteredProjects.map((p) => (
                  <div
                    key={p.name}
                    style={{
                      padding: '8px 12px', fontSize: '0.85em', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: currentPath.includes(p.name) ? 'var(--control-accent-bg, #eaf2ff)' : undefined,
                      borderBottom: '1px solid var(--border)',
                    }}
                    onClick={() => browseFolder(PROJECT_ROOT + '/' + p.name)}
                  >
                    <span>📁</span>
                    <span style={{ fontWeight: currentPath.includes(p.name) ? 700 : 400 }}>{p.name}</span>
                  </div>
                ))}
                {filteredProjects.length === 0 && !projectsLoading ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: '0.82em', color: 'var(--muted)' }}>
                    {searchQuery ? `"${searchQuery}" 검색 결과 없음` : '프로젝트가 없습니다'}
                  </div>
                ) : null}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: '0.78em', color: 'var(--muted)' }}>
              {filteredProjects.length}개 프로젝트{searchQuery ? ` (검색: "${searchQuery}")` : ''}
            </div>
          </div>

          {/* Right: Folder browser */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.88em' }}>폴더 내용</h3>

            {/* Breadcrumb */}
            {currentPath ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78em', marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }} onClick={() => { setCurrentPath(''); setFiles([]) }}>
                  PROJECT
                </span>
                {pathParts.slice(1).map((part, i) => {
                  const full = NAS_BASE + '/' + pathParts.slice(0, i + 2).join('/')
                  const isLast = i === pathParts.length - 2
                  return (
                    <span key={full} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>/</span>
                      <span
                        style={{ cursor: isLast ? 'default' : 'pointer', color: isLast ? 'var(--text1)' : 'var(--primary)' }}
                        onClick={() => !isLast && browseFolder(full)}
                      >
                        {part}
                      </span>
                    </span>
                  )
                })}
              </div>
            ) : null}

            {!currentPath ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>
                왼쪽에서 프로젝트를 선택하세요
              </div>
            ) : filesLoading ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div>
            ) : (
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10,
                maxHeight: 500, overflowY: 'auto',
              }}>
                {/* Parent */}
                {currentPath !== PROJECT_ROOT ? (
                  <div
                    style={{ padding: '6px 12px', fontSize: '0.85em', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}
                    onClick={() => {
                      const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
                      if (parent && parent !== NAS_BASE) browseFolder(parent)
                      else { setCurrentPath(''); setFiles([]) }
                    }}
                  >
                    📁 ..
                  </div>
                ) : null}
                {files.map((f) => (
                  <div
                    key={f.path || f.name}
                    style={{
                      padding: '6px 12px', fontSize: '0.85em',
                      display: 'flex', alignItems: 'center', gap: 6,
                      cursor: f.isDir ? 'pointer' : 'default',
                      color: f.isDir ? 'var(--primary)' : 'var(--text1)',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onClick={() => f.isDir && browseFolder(currentPath + '/' + f.name)}
                  >
                    {f.isDir ? '📁' : '📄'} {f.name}
                    {!f.isDir && f.size ? (
                      <span style={{ marginLeft: 'auto', fontSize: '0.78em', color: 'var(--muted)' }}>{formatBytes(f.size)}</span>
                    ) : null}
                  </div>
                ))}
                {files.length === 0 ? (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: '0.82em', color: 'var(--muted)' }}>빈 폴더</div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
