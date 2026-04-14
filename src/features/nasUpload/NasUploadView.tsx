import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../shared/api/client'
import type { TaskRecord } from '../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NasFile = { name: string; path: string; isDir: boolean; size?: number; mtime?: number }
type Step = 'login' | 'task' | 'configure' | 'upload' | 'done'

type ListTasksResponse = {
  tasks: TaskRecord[]
  hasMore: boolean
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAS_BASE = '/Izenimplant/Marketing'

const SUBFOLDER_MAP: Record<string, string> = {
  '기획': '00_기획-문서',
  '인쇄': '01_인쇄물',
  '인쇄물': '01_인쇄물',
  '포스터': '01_인쇄물/포스터',
  '리플렛': '01_인쇄물/리플렛',
  '브로슈어': '01_인쇄물/브로슈어',
  '카달로그': '01_인쇄물/카달로그',
  '배너': '01_인쇄물/배너-현수막',
  '현수막': '01_인쇄물/배너-현수막',
  'certificate': '01_인쇄물/certificate',
  '부스': '02_부스',
  '부스디자인': '02_부스/부스디자인',
  '부스그래픽': '02_부스/부스그래픽',
  '디지털': '03_디지털',
  'SNS': '03_디지털/SNS-이미지',
  'PPT': '03_디지털/PPT',
  '렌더링': '03_디지털/렌더링',
  '영상': '04_영상',
  '촬영': '04_영상/자체촬영',
  '편집': '04_영상/편집-프로젝트',
  '모션': '04_영상/2D-모션',
  '3D': '04_영상/3D-모션',
  '사진': '05_사진',
}

const SUBFOLDER_OPTIONS = [
  { label: '00 기획-문서', value: '00_기획-문서' },
  { label: '01 인쇄물', value: '01_인쇄물' },
  { label: '  포스터', value: '01_인쇄물/포스터' },
  { label: '  리플렛', value: '01_인쇄물/리플렛' },
  { label: '  브로슈어', value: '01_인쇄물/브로슈어' },
  { label: '  카달로그', value: '01_인쇄물/카달로그' },
  { label: '  배너-현수막', value: '01_인쇄물/배너-현수막' },
  { label: '  certificate', value: '01_인쇄물/certificate' },
  { label: '02 부스', value: '02_부스' },
  { label: '  부스디자인', value: '02_부스/부스디자인' },
  { label: '  부스그래픽', value: '02_부스/부스그래픽' },
  { label: '03 디지털', value: '03_디지털' },
  { label: '  SNS-이미지', value: '03_디지털/SNS-이미지' },
  { label: '  PPT', value: '03_디지털/PPT' },
  { label: '  렌더링', value: '03_디지털/렌더링' },
  { label: '04 영상', value: '04_영상' },
  { label: '  편집-프로젝트', value: '04_영상/편집-프로젝트' },
  { label: '  3D-모션', value: '04_영상/3D-모션' },
  { label: '  최종본', value: '04_영상/최종본' },
  { label: '05 사진', value: '05_사진' },
  { label: '  자체촬영', value: '05_사진/자체촬영' },
  { label: '  선별', value: '05_사진/선별' },
  { label: '  보정', value: '05_사진/보정' },
]

const BRANDS = ['IZEN', 'IAM', 'ZENEX', 'Cleanimplant', '']
const LANGUAGES = ['', 'EN', 'RU', 'ZH', 'KO']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`
}

function extractVersion(filename: string): { num: number; type: 'v' | 'Rev' } | null {
  const vMatch = filename.match(/_v(\d+)/)
  if (vMatch) return { num: parseInt(vMatch[1], 10), type: 'v' }
  const revMatch = filename.match(/_Rev(\d+)/)
  if (revMatch) return { num: parseInt(revMatch[1], 10), type: 'Rev' }
  return null
}

function suggestNextVersion(files: NasFile[], type: 'v' | 'Rev'): number {
  let max = 0
  for (const f of files) {
    if (f.isDir) continue
    const v = extractVersion(f.name)
    if (v && v.type === type) max = Math.max(max, v.num)
  }
  return max + 1
}

function guessSubfolder(workType: string): string {
  const lower = workType.toLowerCase()
  for (const [keyword, folder] of Object.entries(SUBFOLDER_MAP)) {
    if (lower.includes(keyword.toLowerCase())) return folder
  }
  return '00_기획-문서'
}

function buildFilename(parts: {
  brand: string
  contentName: string
  lang: string
  spec: string
  versionType: 'v' | 'Rev'
  versionNum: number
  ext: string
}): string {
  const segs: string[] = []
  if (parts.brand) segs.push(parts.brand)
  if (parts.contentName) segs.push(parts.contentName)
  if (parts.lang) segs.push(parts.lang)
  if (parts.spec) segs.push(parts.spec)
  const vStr = parts.versionType === 'v'
    ? `v${String(parts.versionNum).padStart(2, '0')}`
    : `Rev${String(parts.versionNum).padStart(2, '0')}`
  segs.push(vStr)
  return segs.join('_') + (parts.ext.startsWith('.') ? parts.ext : `.${parts.ext}`)
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

const selectStyle: React.CSSProperties = { ...inputStyle }

const labelStyle: React.CSSProperties = {
  fontSize: '0.82em',
  fontWeight: 600,
  color: 'var(--text2)',
  marginBottom: 4,
  display: 'block',
}

const previewStyle: React.CSSProperties = {
  background: 'var(--surface2, #f5f7fb)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontFamily: "'Courier New', monospace",
  fontSize: '0.82em',
  wordBreak: 'break-all',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NasUploadView() {
  const [step, setStep] = useState<Step>('login')

  // auth
  const [sid, setSid] = useState('')
  const [account, setAccount] = useState('')
  const [passwd, setPasswd] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // tasks
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null)
  const [myTaskCount, setMyTaskCount] = useState(0)

  // file naming
  const [subfolder, setSubfolder] = useState('')
  const [brand, setBrand] = useState('IZEN')
  const [contentName, setContentName] = useState('')
  const [lang, setLang] = useState('')
  const [spec, setSpec] = useState('')
  const [versionType, setVersionType] = useState<'v' | 'Rev'>('v')
  const [versionNum, setVersionNum] = useState(1)
  const [ext, setExt] = useState('.ai')

  // NAS files in target folder
  const [targetFiles, setTargetFiles] = useState<NasFile[]>([])
  const [targetLoading, setTargetLoading] = useState(false)

  // upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadReason, setUploadReason] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const projectFolder = selectedTask
    ? `01_PROJECT/${selectedTask.projectKey || selectedTask.projectName || 'unknown'}`
    : '01_PROJECT'

  const fullNasPath = `${NAS_BASE}/${projectFolder}${subfolder ? `/${subfolder}` : ''}`

  const generatedFilename = buildFilename({ brand, contentName, lang, spec, versionType, versionNum, ext })

  // ---------------------------------------------------------------------------
  // API calls
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
        setStep('task')
        fetchTasks(account)
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
    setStep('login')
    setSelectedTask(null)
    setTasks([])
  }, [sid])

  const fetchTasks = useCallback(async (assigneeName: string) => {
    setTasksLoading(true)
    try {
      const res = await api<ListTasksResponse>('/tasks?pageSize=200')
      // exclude 완료/보관 only
      const active = res.tasks.filter((t) =>
        !['완료', '보관'].some((s) => t.status.includes(s)),
      )
      // sort: my tasks first, then others
      const mine = active.filter((t) => t.assignee.some((a) => a.includes(assigneeName)))
      const others = active.filter((t) => !t.assignee.some((a) => a.includes(assigneeName)))
      setTasks([...mine, ...others])
      setMyTaskCount(mine.length)
    } catch {
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [])

  const loadTargetFiles = useCallback(async (folderPath: string) => {
    setTargetLoading(true)
    try {
      const res = await api<{ ok: boolean; files?: NasFile[] }>('/nas/list', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath }),
      })
      if (res.ok && res.files) {
        const sorted = res.files.filter((f) => !f.isDir).sort((a, b) => a.name.localeCompare(b.name))
        setTargetFiles(sorted)
        // auto-suggest version
        const nextV = suggestNextVersion(sorted, versionType)
        setVersionNum(nextV)
      } else {
        setTargetFiles([])
      }
    } catch {
      setTargetFiles([])
    } finally {
      setTargetLoading(false)
    }
  }, [sid, versionType])

  const nasUpload = useCallback(async () => {
    if (!selectedFile) return
    setUploading(true)
    setUploadResult(null)
    try {
      // create parent folders if needed
      await api('/nas/create-folder', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath: fullNasPath.substring(0, fullNasPath.lastIndexOf('/')), name: fullNasPath.substring(fullNasPath.lastIndexOf('/') + 1) }),
      }).catch(() => {})

      const fd = new FormData()
      fd.append('sid', sid)
      fd.append('dest_folder_path', fullNasPath)
      fd.append('create_parents', 'true')
      // upload with generated filename, not original
      fd.append('file', selectedFile, generatedFilename)

      const res = await api<{ ok: boolean; filename?: string; error?: string }>('/nas/upload', {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        setUploadResult({ ok: true, message: `${generatedFilename} 업로드 완료!` })
        setStep('done')
        loadTargetFiles(fullNasPath)

        // auto-fill outputLink in Notion task
        if (selectedTask) {
          const nasLink = `${fullNasPath}/${generatedFilename}`
          const existing = selectedTask.outputLink
          const newLink = existing ? `${existing}\n${nasLink}` : nasLink
          api(`/tasks/${encodeURIComponent(selectedTask.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ outputLink: newLink }),
          }).catch(() => {})
        }
      } else if (res.error?.includes('already_exists')) {
        setUploadResult({ ok: false, message: `${generatedFilename} 이(가) 이미 존재합니다. 버전 번호를 올려주세요.` })
      } else {
        setUploadResult({ ok: false, message: res.error ?? '업로드 실패' })
      }
    } catch (err) {
      setUploadResult({ ok: false, message: err instanceof Error ? err.message : '업로드 실패' })
    } finally {
      setUploading(false)
    }
  }, [selectedFile, sid, fullNasPath, generatedFilename, loadTargetFiles])

  // (tasks are loaded immediately after login via fetchTasks(account))

  // load target files when path changes
  useEffect(() => {
    if (sid && subfolder && selectedTask) {
      loadTargetFiles(fullNasPath)
    }
  }, [fullNasPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-fill from task selection
  function selectTask(task: TaskRecord) {
    setSelectedTask(task)
    // guess subfolder from workType
    setSubfolder(guessSubfolder(task.workType))
    // guess content name from task name
    setContentName(task.taskName.replace(/\s+/g, '-'))
    setStep('configure')
  }

  // auto-detect extension from file
  function onFileSelect(file: File | null) {
    setSelectedFile(file)
    setUploadResult(null)
    if (file) {
      const dotIdx = file.name.lastIndexOf('.')
      if (dotIdx > 0) setExt(file.name.substring(dotIdx))
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="workflowView" aria-label="NAS 업로드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">NAS Upload</span>
          <h2>NAS 파일 업로드</h2>
          <p>업무를 선택하면 경로와 파일명이 자동으로 설정됩니다. 파일을 선택하면 규칙에 맞는 이름으로 업로드됩니다.</p>
        </div>
        {sid ? (
          <button type="button" className="secondary mini" onClick={nasLogout} style={{ alignSelf: 'flex-start' }}>
            로그아웃
          </button>
        ) : null}
      </header>

      {/* ── Step 1: Login ── */}
      {step === 'login' ? (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 12px', fontSize: '0.95em' }}>NAS 로그인</h3>
          <div style={{ display: 'grid', gap: 10, maxWidth: 340 }}>
            <div>
              <label style={labelStyle}>아이디</label>
              <input style={inputStyle} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="NAS 아이디" onKeyDown={(e) => e.key === 'Enter' && nasLogin()} />
            </div>
            <div>
              <label style={labelStyle}>비밀번호</label>
              <input type="password" style={inputStyle} value={passwd} onChange={(e) => setPasswd(e.target.value)} placeholder="NAS 비밀번호" onKeyDown={(e) => e.key === 'Enter' && nasLogin()} />
            </div>
            {loginError ? <div style={{ fontSize: '0.82em', color: 'var(--danger)' }}>{loginError}</div> : null}
            <button type="button" onClick={nasLogin} disabled={loginLoading || !account || !passwd}>
              {loginLoading ? '로그인 중...' : '로그인'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 2: Task selection ── */}
      {step === 'task' ? (
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 8px', fontSize: '0.95em' }}>업무 선택 — {account}님 담당 {myTaskCount}건</h3>
          <p style={{ fontSize: '0.82em', color: 'var(--text2)', margin: '0 0 12px' }}>
            내 업무가 상단에 표시됩니다. 업무를 선택하면 경로와 파일명이 자동 설정됩니다.
          </p>
          {tasksLoading ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>업무 불러오는 중...</div>
          ) : (
            <div style={{ display: 'grid', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
              {tasks.map((task, i) => {
                const isMine = task.assignee.some((a) => a.includes(account))
                return (
                  <div key={task.id}>
                    {i === myTaskCount && myTaskCount > 0 ? (
                      <div style={{ fontSize: '0.75em', color: 'var(--muted)', padding: '8px 0 4px', borderTop: '1px solid var(--border)', marginTop: 4 }}>
                        다른 업무
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="secondary"
                      style={{
                        textAlign: 'left', padding: '10px 12px', display: 'grid', gap: 2, width: '100%',
                        borderLeft: isMine ? '3px solid var(--primary)' : undefined,
                      }}
                      onClick={() => selectTask(task)}
                    >
                      <span style={{ fontWeight: 600, fontSize: '0.88em' }}>{task.taskName}</span>
                      <span style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
                        {task.projectName} · {task.workType} · {task.status} · {task.assignee.join(', ')}
                      </span>
                    </button>
                  </div>
                )
              })}
              {tasks.length === 0 ? (
                <div style={{ padding: 12, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>
                  진행중 업무가 없습니다
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Step 3: Configure filename + upload ── */}
      {step === 'configure' || step === 'upload' || step === 'done' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Selected task info */}
          {selectedTask ? (
            <div style={{ ...cardStyle, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.88em' }}>{selectedTask.taskName}</span>
                <span style={{ fontSize: '0.78em', color: 'var(--muted)', marginLeft: 8 }}>
                  {selectedTask.projectName} · {selectedTask.workType}
                </span>
              </div>
              <button type="button" className="secondary mini" onClick={() => { setSelectedTask(null); setStep('task') }}>
                업무 변경
              </button>
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Left: filename builder */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.88em' }}>파일명 설정</h3>

              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <label style={labelStyle}>저장 위치 (하위 폴더)</label>
                  <select style={selectStyle} value={subfolder} onChange={(e) => setSubfolder(e.target.value)}>
                    <option value="">-- 선택 --</option>
                    {SUBFOLDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>브랜드</label>
                    <select style={selectStyle} value={brand} onChange={(e) => setBrand(e.target.value)}>
                      {BRANDS.map((b) => <option key={b} value={b}>{b || '(없음)'}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>언어</label>
                    <select style={selectStyle} value={lang} onChange={(e) => setLang(e.target.value)}>
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l || '(없음)'}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>콘텐츠명 (하이픈 구분)</label>
                  <input style={inputStyle} value={contentName} onChange={(e) => setContentName(e.target.value)} placeholder="CIS2026_포스터" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>규격 (선택)</label>
                    <input style={inputStyle} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="A1, 16x9" />
                  </div>
                  <div>
                    <label style={labelStyle}>버전 종류</label>
                    <select style={selectStyle} value={versionType} onChange={(e) => { setVersionType(e.target.value as 'v' | 'Rev'); }}>
                      <option value="v">v (내부)</option>
                      <option value="Rev">Rev (배포)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>버전 번호</label>
                    <input type="number" min={1} style={inputStyle} value={versionNum} onChange={(e) => setVersionNum(parseInt(e.target.value) || 1)} />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>생성될 파일명</label>
                <div style={previewStyle}>{generatedFilename}</div>
              </div>
              <div style={{ marginTop: 6 }}>
                <label style={labelStyle}>업로드 경로</label>
                <div style={{ ...previewStyle, fontSize: '0.75em' }}>{fullNasPath}/</div>
              </div>
            </div>

            {/* Right: file select + existing files + upload */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.88em' }}>파일 선택 & 업로드</h3>

              {/* File input */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>파일 선택 (내용만 사용, 파일명은 왼쪽 설정대로)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ fontSize: '0.85em' }}
                  onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
                />
              </div>

              {selectedFile ? (
                <div style={{ fontSize: '0.82em', color: 'var(--text2)', marginBottom: 8 }}>
                  원본: <strong>{selectedFile.name}</strong> ({formatBytes(selectedFile.size)})
                  <br />
                  업로드명: <strong style={{ color: 'var(--primary)' }}>{generatedFilename}</strong>
                </div>
              ) : null}

              {/* Upload reason */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>수정/업로드 사유</label>
                <input style={inputStyle} value={uploadReason} onChange={(e) => setUploadReason(e.target.value)} placeholder="예: 자막 오타 수정 + 컬러 변경" />
              </div>

              {/* Upload button */}
              <button type="button" onClick={nasUpload} disabled={uploading || !selectedFile || !contentName} style={{ width: '100%' }}>
                {uploading ? '업로드 중...' : `${generatedFilename} 업로드`}
              </button>

              {/* Result */}
              {uploadResult ? (
                <div style={{
                  marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.85em',
                  background: uploadResult.ok ? '#dcfce7' : '#fef2f2',
                  color: uploadResult.ok ? '#166534' : '#b91c1c',
                  border: `1px solid ${uploadResult.ok ? '#22c55e' : '#fca5a5'}`,
                }}>
                  {uploadResult.message}
                </div>
              ) : null}

              {step === 'done' ? (
                <button type="button" className="secondary" style={{ marginTop: 8, width: '100%' }} onClick={() => {
                  setSelectedFile(null)
                  setUploadResult(null)
                  setUploadReason('')
                  setStep('configure')
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}>
                  다른 파일 업로드
                </button>
              ) : null}

              {/* Existing files in target folder */}
              <div style={{ marginTop: 14 }}>
                <label style={labelStyle}>
                  현재 폴더의 파일 목록
                  {targetLoading ? ' (불러오는 중...)' : ` (${targetFiles.length}개)`}
                </label>
                <div style={{
                  background: 'var(--surface2, #f5f7fb)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '4px 0', maxHeight: 160, overflowY: 'auto',
                }}>
                  {targetFiles.map((f) => (
                    <div key={f.name} style={{ padding: '3px 10px', fontSize: '0.78em', display: 'flex', justifyContent: 'space-between' }}>
                      <span>📄 {f.name}</span>
                      {f.size ? <span style={{ color: 'var(--muted)' }}>{formatBytes(f.size)}</span> : null}
                    </div>
                  ))}
                  {targetFiles.length === 0 && !targetLoading ? (
                    <div style={{ padding: '8px 10px', fontSize: '0.78em', color: 'var(--muted)', textAlign: 'center' }}>
                      {subfolder ? '빈 폴더 (첫 업로드)' : '하위 폴더를 선택하세요'}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
