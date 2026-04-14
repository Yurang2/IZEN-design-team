import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../shared/api/client'
import type { TaskRecord } from '../../shared/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NasFile = { name: string; path: string; isDir: boolean; size?: number; mtime?: number }
type Step = 'login' | 'mode' | 'task' | 'configure' | 'upload' | 'done' | 'free-browse' | 'free-upload' | 'free-done'

type ListTasksResponse = {
  tasks: TaskRecord[]
  hasMore: boolean
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAS_BASE = '/Izenimplant/Marketing'

// Fallback mapping (used until DB loads)
const DEFAULT_SUBFOLDER_MAP: Record<string, string> = {
  '기획': '00_기획-문서',
  '포스터': '01_인쇄물/포스터',
  '리플렛': '01_인쇄물/리플렛',
  '브로슈어': '01_인쇄물/브로슈어',
  '카달로그': '01_인쇄물/카달로그',
  '배너': '01_인쇄물/배너-현수막',
  '부스': '02_부스',
  'SNS': '03_디지털/SNS',
  '영상': '04_영상',
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
  { label: '  SNS', value: '03_디지털/SNS' },
  { label: '  PPT', value: '03_디지털/PPT' },
  { label: '  행사운영', value: '03_디지털/행사운영' },
  { label: '  렌더링', value: '03_디지털/렌더링' },
  { label: '  홈페이지', value: '03_디지털/홈페이지' },
  { label: '04 영상', value: '04_영상' },
  { label: '  자체촬영', value: '04_영상/자체촬영' },
  { label: '  수신/외주', value: '04_영상/수신/외주' },
  { label: '  수신/타팀', value: '04_영상/수신/타팀' },
  { label: '  편집-프로젝트', value: '04_영상/편집-프로젝트' },
  { label: '  2D-모션', value: '04_영상/2D-모션' },
  { label: '  3D-모션', value: '04_영상/3D-모션' },
  { label: '  SNS-영상', value: '04_영상/SNS-영상' },
  { label: '  최종본', value: '04_영상/최종본' },
  { label: '05 사진', value: '05_사진' },
  { label: '  자체촬영', value: '05_사진/자체촬영' },
  { label: '  수신/외주', value: '05_사진/수신/외주' },
  { label: '  수신/타팀', value: '05_사진/수신/타팀' },
  { label: '  선별', value: '05_사진/선별' },
  { label: '  보정', value: '05_사진/보정' },
  { label: '06 현장수집', value: '06_현장수집' },
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

function guessSubfolder(text: string, mappings: Record<string, string>): string {
  const lower = text.toLowerCase()
  for (const [keyword, folder] of Object.entries(mappings)) {
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
  seq?: number
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
  if (parts.seq != null && parts.seq > 0) {
    segs.push(String(parts.seq).padStart(2, '0'))
  }
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
// Upload path helper (Y/N wizard)
// ---------------------------------------------------------------------------

type HelperNode = {
  question: string
  yes: HelperNode | { mode: 'task' | 'free' | 'back'; path?: string; label: string; namingTip?: string }
  no: HelperNode | { mode: 'task' | 'free' | 'back'; path?: string; label: string; namingTip?: string }
}

const HELPER_TREE: HelperNode = {
  question: '이 파일은 내가(디자인팀이) 직접 만든 작업물인가요?',
  yes: {
    question: '이 작업물은 Notion에 등록된 업무와 관련 있나요?',
    yes: { mode: 'task', label: '→ "업무 결과물" 모드로 업로드하세요', namingTip: '파일명이 자동 생성됩니다' },
    no: {
      question: '현장에서 촬영/수집한 레퍼런스인가요?',
      yes: { mode: 'free', path: '/01_PROJECT', label: '→ 해당 프로젝트의 06_현장수집/ 폴더에 넣으세요', namingTip: '파일명 그대로 업로드' },
      no: { mode: 'free', path: '/01_PROJECT', label: '→ 해당 프로젝트의 알맞은 하위 폴더에 넣으세요', namingTip: '파일명 그대로 업로드' },
    },
  },
  no: {
    question: '타팀이나 외부에서 받은 파일인가요?',
    yes: {
      question: '이 파일을 수정해서 돌려보내야 하나요?',
      yes: { mode: 'free', path: '/01_PROJECT', label: '→ 해당 프로젝트의 00_기획-문서/ 에 넣으세요', namingTip: '회신 시 파일명 뒤에 _이름v01 을 붙이세요 (예: 기획서_{{name}}v01.docx)' },
      no: { mode: 'free', path: '/01_PROJECT', label: '→ 해당 프로젝트의 00_기획-문서/ 에 원본 그대로 넣으세요', namingTip: '파일명 변경 없이 그대로 업로드' },
    },
    no: {
      question: '여러 프로젝트에서 반복 사용하는 소스(로고, 폰트, 템플릿 등)인가요?',
      yes: { mode: 'free', path: '/02_ASSET', label: '→ 02_ASSET/ 해당 카테고리에 넣으세요', namingTip: '파일명 그대로 업로드' },
      no: { mode: 'back', label: '→ 잘 모르겠으면 팀장에게 문의하세요' },
    },
  },
}

function UploadHelper({ onResult, onBack, accountName }: {
  onResult: (r: { mode: 'task' | 'free' | 'back'; path?: string }) => void
  onBack: () => void
  accountName: string
}) {
  const [path, setPath] = useState<Array<'yes' | 'no'>>([])

  let current: HelperNode | { mode: string; path?: string; label: string; namingTip?: string } = HELPER_TREE
  for (const p of path) {
    if ('question' in current) current = p === 'yes' ? current.yes : current.no
  }

  const isResult = !('question' in current)
  const namingTip = isResult ? (current as any).namingTip?.replace('{{name}}', accountName) : ''

  return (
    <div style={{
      background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 14,
      padding: 20, boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: '0.95em' }}>어디에 넣을까요?</h3>
        <button type="button" className="secondary mini" onClick={onBack}>닫기</button>
      </div>

      {/* Progress */}
      {path.length > 0 ? (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
          {path.map((p, i) => (
            <span key={i} style={{
              background: p === 'yes' ? '#dcfce7' : '#fef2f2',
              color: p === 'yes' ? '#166534' : '#b91c1c',
              border: `1px solid ${p === 'yes' ? '#22c55e' : '#fca5a5'}`,
              borderRadius: 999, padding: '2px 8px', fontSize: '0.72em', cursor: 'pointer',
            }} onClick={() => setPath(path.slice(0, i))}>
              {p === 'yes' ? 'Y' : 'N'}
            </span>
          ))}
        </div>
      ) : null}

      {isResult ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{
            background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8,
            padding: '12px 16px', fontSize: '0.88em', color: '#1d4ed8', fontWeight: 600,
          }}>
            {(current as any).label}
          </div>
          {namingTip ? (
            <div style={{
              background: 'var(--surface2, #f5f7fb)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 14px', fontSize: '0.82em', color: 'var(--text2)',
            }}>
              <span style={{ fontWeight: 600 }}>파일명:</span> {namingTip}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 6 }}>
            {(current as any).mode !== 'back' ? (
              <button type="button" onClick={() => onResult(current as any)} style={{ fontSize: '0.82em', padding: '6px 14px' }}>
                이동
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={() => setPath([])} style={{ fontSize: '0.82em', padding: '6px 14px' }}>
              처음부터
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ fontSize: '0.9em', fontWeight: 600, margin: 0 }}>{(current as HelperNode).question}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setPath([...path, 'yes'])}
              style={{ padding: '8px 24px', fontSize: '0.88em', background: '#dcfce7', border: '1px solid #22c55e', color: '#166534', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              네
            </button>
            <button type="button" onClick={() => setPath([...path, 'no'])}
              style={{ padding: '8px 24px', fontSize: '0.88em', background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              아니오
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NasUploadView() {
  const [step, setStep] = useState<Step>('login')

  // path mapping from Notion DB (loaded once)
  const [subfolderMap, setSubfolderMap] = useState<Record<string, string>>(DEFAULT_SUBFOLDER_MAP)
  useEffect(() => {
    api<{ ok: boolean; mappings: Array<{ keyword: string; path: string }> }>('/path-mapping')
      .then((res) => {
        if (res.ok && res.mappings.length > 0) {
          const map: Record<string, string> = {}
          for (const m of res.mappings) map[m.keyword] = m.path
          setSubfolderMap(map)
        }
      })
      .catch(() => {})
  }, [])

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
  const [ext, setExt] = useState('')

  // NAS files in target folder
  const [targetFiles, setTargetFiles] = useState<NasFile[]>([])
  const [targetLoading, setTargetLoading] = useState(false)

  // upload (multi-file)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [seqStart, setSeqStart] = useState(0) // 0 = single file (no seq), 1+ = carousel
  const [uploadReason, setUploadReason] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ ok: boolean; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // free upload mode
  const [freePath, setFreePath] = useState(NAS_BASE + '/01_PROJECT')
  const [freeFiles, setFreeFiles] = useState<NasFile[]>([])
  const [freeLoading, setFreeLoading] = useState(false)
  const [freeSelectedFile, setFreeSelectedFile] = useState<File | null>(null)
  const [freeResult, setFreeResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [freeUploading, setFreeUploading] = useState(false)
  const freeInputRef = useRef<HTMLInputElement>(null)
  const [freeNewFolder, setFreeNewFolder] = useState('')
  const [freeCreating, setFreeCreating] = useState(false)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const hasSerialCode = !!selectedTask?.projectSerialCode
  const projectFolderName = selectedTask
    ? selectedTask.projectSerialCode
      ? `${selectedTask.projectSerialCode}_${selectedTask.projectName.replace(/\s+/g, '-')}`
      : selectedTask.projectName
    : ''
  const projectFolder = selectedTask ? `01_PROJECT/${projectFolderName}` : '01_PROJECT'

  const fullNasPath = `${NAS_BASE}/${projectFolder}${subfolder ? `/${subfolder}` : ''}`

  const isMulti = selectedFiles.length > 1
  const generatedFilename = buildFilename({ brand, contentName, lang, spec, versionType, versionNum, seq: isMulti ? (seqStart || 1) : undefined, ext })

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
        setStep('mode')
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
      // fetch all pages
      const allTasks: TaskRecord[] = []
      let cursor: string | undefined
      let hasMore = true
      let page = 0
      while (hasMore && page < 30) {
        const params = new URLSearchParams({ pageSize: '100' })
        if (cursor) params.set('cursor', cursor)
        const res = await api<ListTasksResponse>(`/tasks?${params.toString()}`)
        allTasks.push(...res.tasks)
        hasMore = res.hasMore
        cursor = res.nextCursor
        page++
      }
      // exclude 완료/보관 only
      const active = allTasks.filter((t) =>
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
    if (selectedFiles.length === 0) return
    setUploading(true)
    setUploadResult(null)
    try {
      // create parent folders if needed
      await api('/nas/create-folder', {
        method: 'POST',
        body: JSON.stringify({ sid, folderPath: fullNasPath.substring(0, fullNasPath.lastIndexOf('/')), name: fullNasPath.substring(fullNasPath.lastIndexOf('/') + 1) }),
      }).catch(() => {})

      const uploadedNames: string[] = []
      const errors: string[] = []

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const dotIdx = file.name.lastIndexOf('.')
        const fileExt = dotIdx > 0 ? file.name.substring(dotIdx) : ext
        const seqNum = selectedFiles.length > 1 ? (seqStart || 1) + i : undefined
        const filename = buildFilename({ brand, contentName, lang, spec, versionType, versionNum, seq: seqNum, ext: fileExt })

        const fd = new FormData()
        fd.append('sid', sid)
        fd.append('dest_folder_path', fullNasPath)
        fd.append('create_parents', 'true')
        fd.append('file', file, filename)

        const res = await api<{ ok: boolean; filename?: string; error?: string }>('/nas/upload', {
          method: 'POST',
          body: fd,
        })

        if (res.ok) {
          uploadedNames.push(filename)
        } else if (res.error?.includes('already_exists')) {
          errors.push(`${filename} 이미 존재`)
        } else {
          errors.push(`${filename} 실패`)
        }
      }

      if (errors.length > 0) {
        setUploadResult({ ok: false, message: `${uploadedNames.length}개 성공, ${errors.length}개 실패: ${errors.join(', ')}` })
      } else {
        setUploadResult({ ok: true, message: `${uploadedNames.length}개 파일 업로드 완료!` })
        setStep('done')
      }
      loadTargetFiles(fullNasPath)

      // auto-fill outputLink + changeReason in Notion task
      if (selectedTask && uploadedNames.length > 0) {
        const newLinks = uploadedNames.map((n) => `${fullNasPath}/${n}`).join('\n')
        const existing = selectedTask.outputLink
        const combined = existing ? `${existing}\n${newLinks}` : newLinks
        const patch: Record<string, unknown> = { outputLink: combined }
        if (uploadReason.trim()) {
          const timestamp = new Date().toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
          const entry = `[${timestamp} ${uploadedNames[0]}${uploadedNames.length > 1 ? ` 외 ${uploadedNames.length - 1}건` : ''}] ${uploadReason.trim()}`
          patch.changeReasonAppend = entry
        }
        api(`/tasks/${encodeURIComponent(selectedTask.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        }).catch(() => {})
      }
    } catch (err) {
      setUploadResult({ ok: false, message: err instanceof Error ? err.message : '업로드 실패' })
    } finally {
      setUploading(false)
    }
  }, [selectedFiles, sid, fullNasPath, brand, contentName, lang, spec, versionType, versionNum, seqStart, ext, loadTargetFiles, selectedTask, uploadReason])

  // (tasks are loaded when entering task step)

  // free upload helpers
  const freeList = useCallback(async (folderPath: string) => {
    setFreeLoading(true)
    try {
      const res = await api<{ ok: boolean; files?: NasFile[] }>('/nas/list', {
        method: 'POST', body: JSON.stringify({ sid, folderPath }),
      })
      if (res.ok && res.files) {
        setFreeFiles(res.files.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name)
        }))
        setFreePath(folderPath)
      }
    } catch { /* */ }
    finally { setFreeLoading(false) }
  }, [sid])

  const freeCreateFolder = useCallback(async () => {
    if (!freeNewFolder.trim()) return
    setFreeCreating(true)
    await api('/nas/create-folder', { method: 'POST', body: JSON.stringify({ sid, folderPath: freePath, name: freeNewFolder.trim() }) }).catch(() => {})
    setFreeNewFolder('')
    await freeList(freePath)
    setFreeCreating(false)
  }, [sid, freePath, freeNewFolder, freeList])

  const freeUpload = useCallback(async () => {
    if (!freeSelectedFile) return
    setFreeUploading(true)
    setFreeResult(null)
    try {
      const fd = new FormData()
      fd.append('sid', sid)
      fd.append('dest_folder_path', freePath)
      fd.append('create_parents', 'false')
      fd.append('file', freeSelectedFile, freeSelectedFile.name)
      const res = await api<{ ok: boolean; filename?: string; error?: string }>('/nas/upload', { method: 'POST', body: fd })
      if (res.ok) {
        setFreeResult({ ok: true, message: `${freeSelectedFile.name} 업로드 완료` })
        setStep('free-done')
        freeList(freePath)
      } else if (res.error?.includes('already_exists')) {
        setFreeResult({ ok: false, message: `같은 이름의 파일이 이미 존재합니다.` })
      } else {
        setFreeResult({ ok: false, message: res.error ?? '업로드 실패' })
      }
    } catch (err) {
      setFreeResult({ ok: false, message: err instanceof Error ? err.message : '실패' })
    } finally { setFreeUploading(false) }
  }, [freeSelectedFile, sid, freePath, freeList])

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
    setSubfolder(guessSubfolder(task.workType, subfolderMap))
    // guess content name from task name
    setContentName(task.taskName.replace(/\s+/g, '-'))
    setStep('configure')
  }

  // (file selection handled inline in input onChange)

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

      {/* ── Step 1.5: Mode selection ── */}
      {step === 'mode' || step === 'helper' as string ? (
        <div style={{ display: 'grid', gap: 12, maxWidth: 600 }}>
          {step === 'mode' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <button type="button" className="secondary" style={{ padding: '24px 16px', display: 'grid', gap: 6, textAlign: 'center', borderRadius: 14 }}
                  onClick={() => { setStep('task'); fetchTasks(account) }}>
                  <span style={{ fontSize: '1.5em' }}>📁</span>
                  <span style={{ fontWeight: 700, fontSize: '0.95em' }}>업무 결과물</span>
                  <span style={{ fontSize: '0.78em', color: 'var(--muted)' }}>파일명 자동 생성 + 업무 연동</span>
                </button>
                <button type="button" className="secondary" style={{ padding: '24px 16px', display: 'grid', gap: 6, textAlign: 'center', borderRadius: 14 }}
                  onClick={() => { setStep('free-browse'); freeList(freePath) }}>
                  <span style={{ fontSize: '1.5em' }}>📄</span>
                  <span style={{ fontWeight: 700, fontSize: '0.95em' }}>기타 파일</span>
                  <span style={{ fontSize: '0.78em', color: 'var(--muted)' }}>수신 파일, 참고자료 등 (파일명 그대로)</span>
                </button>
              </div>
              <button type="button" className="secondary" style={{ padding: '12px 16px', fontSize: '0.85em', borderRadius: 10 }}
                onClick={() => setStep('helper' as Step)}>
                어디에 넣어야 할지 모르겠어요
              </button>
            </>
          ) : null}
          {(step as string) === 'helper' ? <UploadHelper accountName={account} onResult={(result) => {
            if (result.mode === 'task') { setStep('task'); fetchTasks(account) }
            else if (result.mode === 'free') { setFreePath(NAS_BASE + result.path); setStep('free-browse'); freeList(NAS_BASE + result.path) }
            else setStep('mode')
          }} onBack={() => setStep('mode')} /> : null}
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
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              {!hasSerialCode ? (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: '0.82em',
                  background: '#fff7ed', border: '1px solid #f97316', color: '#9a3412',
                }}>
                  이 프로젝트에 일련번호가 없습니다. Notion Project DB에서 "{selectedTask.projectName}"의 "일련번호" 컬럼을 먼저 채워주세요. (예: IZ250001)
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: '0.78em', color: 'var(--text2)' }}>
                  NAS 폴더: <code style={{ fontSize: '0.95em' }}>{projectFolderName}</code>
                </div>
              )}
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

              {/* File input (multiple) */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>파일 선택 (여러 개 가능 — 캐러셀 등)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ fontSize: '0.85em' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? [])
                    setSelectedFiles(files)
                    setUploadResult(null)
                    if (files.length > 1) setSeqStart(1)
                    else setSeqStart(0)
                    if (files.length > 0) {
                      const f = files[0]
                      const dotIdx = f.name.lastIndexOf('.')
                      if (dotIdx > 0) setExt(f.name.substring(dotIdx))
                      setStep('upload')
                    }
                  }}
                />
              </div>

              {selectedFiles.length > 0 ? (
                <div style={{ fontSize: '0.82em', color: 'var(--text2)', marginBottom: 8 }}>
                  {selectedFiles.length === 1 ? (
                    <>
                      원본: <strong>{selectedFiles[0].name}</strong> ({formatBytes(selectedFiles[0].size)})
                      <br />
                      업로드명: <strong style={{ color: 'var(--primary)' }}>{generatedFilename}</strong>
                    </>
                  ) : (
                    <>
                      <strong>{selectedFiles.length}개 파일 선택됨</strong>
                      <br />
                      {selectedFiles.map((f, i) => {
                        const dotIdx = f.name.lastIndexOf('.')
                        const fileExt = dotIdx > 0 ? f.name.substring(dotIdx) : ext
                        const name = buildFilename({ brand, contentName, lang, spec, versionType, versionNum, seq: (seqStart || 1) + i, ext: fileExt })
                        return (
                          <div key={i} style={{ marginTop: 2 }}>
                            <span style={{ color: 'var(--muted)' }}>{f.name}</span> → <strong style={{ color: 'var(--primary)' }}>{name}</strong>
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              ) : null}

              {/* Sequence start (for multi-file) */}
              {selectedFiles.length > 1 ? (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>순번 시작 번호</label>
                  <input type="number" min={1} style={{ ...inputStyle, width: 80 }} value={seqStart || 1} onChange={(e) => setSeqStart(parseInt(e.target.value) || 1)} />
                  <span style={{ fontSize: '0.78em', color: 'var(--muted)', marginLeft: 8 }}>
                    → _{String(seqStart || 1).padStart(2, '0')}, _{String((seqStart || 1) + 1).padStart(2, '0')}, ...
                  </span>
                </div>
              ) : null}

              {/* Upload reason */}
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>수정/업로드 사유</label>
                <input style={inputStyle} value={uploadReason} onChange={(e) => setUploadReason(e.target.value)} placeholder="예: 자막 오타 수정 + 컬러 변경" />
              </div>

              {/* Upload button */}
              <button type="button" onClick={nasUpload} disabled={uploading || selectedFiles.length === 0 || !contentName || !hasSerialCode} style={{ width: '100%' }}>
                {uploading ? '업로드 중...' : selectedFiles.length > 1 ? `${selectedFiles.length}개 파일 업로드` : `${generatedFilename} 업로드`}
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
                  setSelectedFiles([])
                  setSeqStart(0)
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

      {/* ── Free upload mode ── */}
      {step === 'free-browse' || step === 'free-upload' || step === 'free-done' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Back + breadcrumb */}
          <div style={{ ...cardStyle, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="secondary mini" onClick={() => setStep('mode')}>← 뒤로</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82em', flexWrap: 'wrap' }}>
              <span style={{ cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }} onClick={() => freeList(NAS_BASE)}>Marketing</span>
              {freePath.replace(NAS_BASE, '').split('/').filter(Boolean).map((part, i, arr) => {
                const full = NAS_BASE + '/' + arr.slice(0, i + 1).join('/')
                return (
                  <span key={full} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--muted)' }}>/</span>
                    <span style={{ cursor: 'pointer', color: i === arr.length - 1 ? 'var(--text1)' : 'var(--primary)' }} onClick={() => freeList(full)}>{part}</span>
                  </span>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Left: folder browser */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: '0.88em' }}>폴더 탐색</h3>
                <button type="button" className="secondary mini" onClick={() => freeList(freePath)} disabled={freeLoading}>새로고침</button>
              </div>
              {freeLoading ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div>
              ) : (
                <div style={{ background: 'var(--surface2, var(--bg))', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 0', maxHeight: 300, overflowY: 'auto' }}>
                  {freePath !== NAS_BASE ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: '0.85em', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}
                      onClick={() => freeList(freePath.substring(0, freePath.lastIndexOf('/')) || NAS_BASE)}>
                      📁 ..
                    </div>
                  ) : null}
                  {freeFiles.map((f) => (
                    <div key={f.path || f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: '0.85em', cursor: f.isDir ? 'pointer' : 'default', color: f.isDir ? 'var(--primary)' : 'var(--text1)' }}
                      onClick={() => f.isDir && freeList(freePath + '/' + f.name)}>
                      {f.isDir ? '📁' : '📄'} {f.name}
                      {!f.isDir && f.size ? <span style={{ marginLeft: 'auto', fontSize: '0.78em', color: 'var(--muted)' }}>{formatBytes(f.size)}</span> : null}
                    </div>
                  ))}
                  {freeFiles.length === 0 && !freeLoading ? <div style={{ padding: '12px', fontSize: '0.82em', color: 'var(--muted)', textAlign: 'center' }}>빈 폴더</div> : null}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} value={freeNewFolder} onChange={(e) => setFreeNewFolder(e.target.value)} placeholder="새 폴더 이름" onKeyDown={(e) => e.key === 'Enter' && freeCreateFolder()} />
                <button type="button" className="secondary mini" onClick={freeCreateFolder} disabled={freeCreating || !freeNewFolder.trim()}>생성</button>
              </div>
            </div>

            {/* Right: upload */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.88em' }}>파일 업로드 (파일명 그대로)</h3>
              <p style={{ fontSize: '0.78em', color: 'var(--muted)', margin: '0 0 12px' }}>
                현재 위치: <code style={{ fontSize: '0.9em' }}>{freePath.replace(NAS_BASE + '/', '')}</code>
              </p>
              <div style={{ marginBottom: 10 }}>
                <input ref={freeInputRef} type="file" style={{ fontSize: '0.85em' }} onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFreeSelectedFile(f)
                  setFreeResult(null)
                  if (f) {
                    setStep('free-upload')
                    // guess folder from filename
                    const suggested = guessSubfolder(f.name, subfolderMap)
                    if (suggested !== '00_기획-문서') {
                      const basePath = freePath.includes('/01_PROJECT/') ? freePath.split('/').slice(0, 4).join('/') : freePath
                      setFreePath(basePath + '/' + suggested)
                      freeList(basePath + '/' + suggested)
                    }
                  }
                }} />
              </div>
              {freeSelectedFile ? (
                <div style={{ fontSize: '0.82em', color: 'var(--text2)', marginBottom: 8 }}>
                  <strong>{freeSelectedFile.name}</strong> ({formatBytes(freeSelectedFile.size)})
                </div>
              ) : null}
              <button type="button" onClick={freeUpload} disabled={freeUploading || !freeSelectedFile} style={{ width: '100%' }}>
                {freeUploading ? '업로드 중...' : '업로드'}
              </button>
              {freeResult ? (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: '0.85em', background: freeResult.ok ? '#dcfce7' : '#fef2f2', color: freeResult.ok ? '#166534' : '#b91c1c', border: `1px solid ${freeResult.ok ? '#22c55e' : '#fca5a5'}` }}>
                  {freeResult.message}
                </div>
              ) : null}
              {step === 'free-done' ? (
                <button type="button" className="secondary" style={{ marginTop: 8, width: '100%' }} onClick={() => { setFreeSelectedFile(null); setFreeResult(null); setStep('free-browse'); if (freeInputRef.current) freeInputRef.current.value = '' }}>
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
