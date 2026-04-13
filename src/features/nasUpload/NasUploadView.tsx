import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NasFile = { name: string; path: string; isDir: boolean; size?: number; mtime?: number }
type Step = 'login' | 'select' | 'upload' | 'done'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAS_BASE_PATH = '/Izenimplant/Marketing'

const PROJECT_SUBFOLDERS = [
  '00_기획-문서',
  '01_인쇄물',
  '02_부스',
  '03_디지털',
  '04_영상',
  '05_사진',
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function extractVersion(filename: string): { prefix: string; num: number; type: 'v' | 'Rev' } | null {
  const vMatch = filename.match(/_v(\d+)/)
  if (vMatch) return { prefix: 'v', num: parseInt(vMatch[1], 10), type: 'v' }
  const revMatch = filename.match(/_Rev(\d+)/)
  if (revMatch) return { prefix: 'Rev', num: parseInt(revMatch[1], 10), type: 'Rev' }
  return null
}

function suggestNextVersion(files: NasFile[], type: 'v' | 'Rev'): string {
  let max = 0
  for (const f of files) {
    if (f.isDir) continue
    const v = extractVersion(f.name)
    if (v && v.type === type) max = Math.max(max, v.num)
  }
  const next = String(max + 1).padStart(2, '0')
  return type === 'v' ? `v${next}` : `Rev${next}`
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

const labelStyle: React.CSSProperties = {
  fontSize: '0.82em',
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 4,
  display: 'block',
}

const fileListStyle: React.CSSProperties = {
  background: 'var(--surface2, var(--bg))',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 0',
  maxHeight: 240,
  overflowY: 'auto',
}

const fileItemStyle = (isDir: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 12px',
  fontSize: '0.85em',
  cursor: isDir ? 'pointer' : 'default',
  color: isDir ? 'var(--primary)' : 'var(--text1)',
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NasUploadView() {
  const [step, setStep] = useState<Step>('login')
  const [sid, setSid] = useState('')
  const [account, setAccount] = useState('')
  const [passwd, setPasswd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // folder navigation
  const [currentPath, setCurrentPath] = useState(NAS_BASE_PATH + '/01_PROJECT')
  const [files, setFiles] = useState<NasFile[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')

  // upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadReason, setUploadReason] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // new folder
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)

  // ---------------------------------------------------------------------------
  // NAS API calls
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
        setStep('select')
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
    if (sid) {
      await api('/nas/logout', { method: 'POST', body: JSON.stringify({ sid }) }).catch(() => {})
    }
    setSid('')
    setStep('login')
    setFiles([])
    setCurrentPath(NAS_BASE_PATH + '/01_PROJECT')
  }, [sid])

  const nasList = useCallback(async (folderPath: string) => {
    setListLoading(true)
    setListError('')
    try {
      const res = await api<{ ok: boolean; files?: NasFile[]; error?: string }>('/nas/list', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath }),
      })
      if (res.ok && res.files) {
        // sort: folders first, then files. alphabetical within each group
        const sorted = res.files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        setFiles(sorted)
        setCurrentPath(folderPath)
      } else {
        setListError(res.error ?? '폴더를 열 수 없습니다')
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : '목록 조회 실패')
    } finally {
      setListLoading(false)
    }
  }, [sid])

  const nasCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return
    setCreatingFolder(true)
    try {
      await api('/nas/create-folder', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath: currentPath, name: newFolderName.trim() }),
      })
      setNewFolderName('')
      await nasList(currentPath)
    } catch {
      // ignore — will show in list refresh
    } finally {
      setCreatingFolder(false)
    }
  }, [sid, currentPath, newFolderName, nasList])

  const nasUpload = useCallback(async () => {
    if (!selectedFile) return
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('sid', sid)
      fd.append('dest_folder_path', currentPath)
      fd.append('create_parents', 'true')
      fd.append('file', selectedFile, selectedFile.name)

      const res = await api<{ ok: boolean; filename?: string; error?: string }>('/nas/upload', {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        setUploadResult({ ok: true, message: `${res.filename} 업로드 완료` })
        setStep('done')
        await nasList(currentPath)
      } else if (res.error?.includes('already_exists')) {
        setUploadResult({ ok: false, message: `같은 이름의 파일이 이미 존재합니다. 파일명의 버전 번호를 올려주세요 (예: ${nextV})` })
      } else {
        setUploadResult({ ok: false, message: res.error ?? '업로드 실패' })
      }
    } catch (err) {
      setUploadResult({ ok: false, message: err instanceof Error ? err.message : '업로드 실패' })
    } finally {
      setUploading(false)
    }
  }, [selectedFile, sid, currentPath, nasList])

  // auto-load file list when entering select step
  useEffect(() => {
    if (step === 'select' && sid) {
      nasList(currentPath)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // version hint
  const nextV = files.length ? suggestNextVersion(files, 'v') : 'v01'
  const nextRev = files.length ? suggestNextVersion(files, 'Rev') : 'Rev01'

  // breadcrumb
  const pathParts = currentPath.replace(NAS_BASE_PATH, '').split('/').filter(Boolean)

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="workflowView" aria-label="NAS 업로드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">NAS Upload</span>
          <h2>NAS 파일 업로드</h2>
          <p>Synology NAS에 파일을 업로드합니다. 업로드와 폴더 생성만 가능하며, 기존 파일 수정/삭제는 불가합니다.</p>
        </div>
        {sid ? (
          <button type="button" className="secondary mini" onClick={nasLogout} style={{ alignSelf: 'flex-start' }}>
            로그아웃
          </button>
        ) : null}
      </header>

      {/* Step 1: Login */}
      {step === 'login' ? (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95em' }}>NAS 로그인</h3>
          <p style={{ fontSize: '0.82em', color: 'var(--text2)', margin: '0 0 12px' }}>
            Synology NAS 계정으로 로그인하세요. 본인 계정의 권한만 사용됩니다.
          </p>
          <div style={{ display: 'grid', gap: 10, maxWidth: 340 }}>
            <div>
              <label style={labelStyle}>아이디</label>
              <input
                style={inputStyle}
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="NAS 아이디"
                onKeyDown={(e) => e.key === 'Enter' && nasLogin()}
              />
            </div>
            <div>
              <label style={labelStyle}>비밀번호</label>
              <input
                type="password"
                style={inputStyle}
                value={passwd}
                onChange={(e) => setPasswd(e.target.value)}
                placeholder="NAS 비밀번호"
                onKeyDown={(e) => e.key === 'Enter' && nasLogin()}
              />
            </div>
            {loginError ? (
              <div style={{ fontSize: '0.82em', color: 'var(--danger)' }}>{loginError}</div>
            ) : null}
            <button type="button" onClick={nasLogin} disabled={loginLoading || !account || !passwd}>
              {loginLoading ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Step 2: Select folder */}
      {step === 'select' || step === 'upload' || step === 'done' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Breadcrumb */}
          <div style={{ ...cardStyle, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82em', flexWrap: 'wrap' }}>
              <span
                style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}
                onClick={() => nasList(NAS_BASE_PATH)}
              >
                Marketing
              </span>
              {pathParts.map((part, i) => {
                const fullPath = NAS_BASE_PATH + '/' + pathParts.slice(0, i + 1).join('/')
                return (
                  <span key={fullPath} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>/</span>
                    <span
                      style={{ cursor: 'pointer', color: i === pathParts.length - 1 ? 'var(--text1)' : 'var(--primary)' }}
                      onClick={() => nasList(fullPath)}
                    >
                      {part}
                    </span>
                  </span>
                )
              })}
            </div>
          </div>

          {/* File list + upload side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Left: folder browser */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: '0.88em' }}>폴더 탐색</h3>
                <button type="button" className="secondary mini" onClick={() => nasList(currentPath)} disabled={listLoading}>
                  새로고침
                </button>
              </div>

              {listError ? (
                <div style={{ fontSize: '0.82em', color: 'var(--danger)', marginBottom: 8 }}>{listError}</div>
              ) : null}

              {listLoading ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div>
              ) : (
                <div style={fileListStyle}>
                  {/* Parent folder */}
                  {currentPath !== NAS_BASE_PATH ? (
                    <div
                      style={{ ...fileItemStyle(true), fontWeight: 600 }}
                      onClick={() => {
                        const parent = currentPath.substring(0, currentPath.lastIndexOf('/'))
                        nasList(parent || NAS_BASE_PATH)
                      }}
                    >
                      📁 ..
                    </div>
                  ) : null}
                  {files.map((f) => (
                    <div
                      key={f.path || f.name}
                      style={fileItemStyle(f.isDir)}
                      onClick={() => f.isDir && nasList(currentPath + '/' + f.name)}
                    >
                      {f.isDir ? '📁' : '📄'} {f.name}
                      {!f.isDir && f.size ? (
                        <span style={{ marginLeft: 'auto', fontSize: '0.78em', color: 'var(--muted)' }}>
                          {formatBytes(f.size)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {files.length === 0 && !listLoading ? (
                    <div style={{ padding: '12px 12px', fontSize: '0.82em', color: 'var(--muted)', textAlign: 'center' }}>
                      빈 폴더
                    </div>
                  ) : null}
                </div>
              )}

              {/* Create folder */}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="새 폴더 이름"
                  onKeyDown={(e) => e.key === 'Enter' && nasCreateFolder()}
                />
                <button type="button" className="secondary mini" onClick={nasCreateFolder} disabled={creatingFolder || !newFolderName.trim()}>
                  생성
                </button>
              </div>

              {/* Quick folder buttons */}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {PROJECT_SUBFOLDERS.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    className="secondary mini"
                    style={{ fontSize: '0.72em', padding: '3px 6px' }}
                    onClick={() => {
                      setNewFolderName(sub)
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: upload panel */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.88em' }}>파일 업로드</h3>
              <p style={{ fontSize: '0.78em', color: 'var(--muted)', margin: '0 0 12px' }}>
                현재 위치: <code style={{ fontSize: '0.9em' }}>{currentPath.replace(NAS_BASE_PATH + '/', '')}</code>
              </p>

              {/* Version hint */}
              <div style={{
                display: 'flex', gap: 8, marginBottom: 12, fontSize: '0.78em',
              }}>
                <span style={{ background: '#dcfce7', border: '1px solid #22c55e', borderRadius: 4, padding: '2px 6px', color: '#166534' }}>
                  다음 내부버전: {nextV}
                </span>
                <span style={{ background: '#fff7ed', border: '1px solid #f97316', borderRadius: 4, padding: '2px 6px', color: '#9a3412' }}>
                  다음 배포버전: {nextRev}
                </span>
              </div>

              {/* File input */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>파일 선택</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ fontSize: '0.85em' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setSelectedFile(f)
                    setUploadResult(null)
                    if (f) setStep('upload')
                  }}
                />
              </div>

              {selectedFile ? (
                <div style={{ fontSize: '0.82em', color: 'var(--text2)', marginBottom: 10 }}>
                  <strong>{selectedFile.name}</strong> ({formatBytes(selectedFile.size)})
                </div>
              ) : null}

              {/* Upload reason */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>수정/업로드 사유 (선택)</label>
                <input
                  style={inputStyle}
                  value={uploadReason}
                  onChange={(e) => setUploadReason(e.target.value)}
                  placeholder="예: 자막 오타 수정 + 컬러 변경"
                />
              </div>

              {/* Upload button */}
              <button
                type="button"
                onClick={nasUpload}
                disabled={uploading || !selectedFile}
                style={{ width: '100%' }}
              >
                {uploading ? '업로드 중...' : '업로드'}
              </button>

              {/* Result */}
              {uploadResult ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: '0.85em',
                    background: uploadResult.ok ? '#dcfce7' : '#fef2f2',
                    color: uploadResult.ok ? '#166534' : '#b91c1c',
                    border: `1px solid ${uploadResult.ok ? '#22c55e' : '#fca5a5'}`,
                  }}
                >
                  {uploadResult.message}
                </div>
              ) : null}

              {/* Done: upload another */}
              {step === 'done' ? (
                <button
                  type="button"
                  className="secondary"
                  style={{ marginTop: 8, width: '100%' }}
                  onClick={() => {
                    setSelectedFile(null)
                    setUploadResult(null)
                    setUploadReason('')
                    setStep('select')
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                >
                  다른 파일 업로드
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
