import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { API_BASE_URL, api } from '../../shared/api/client'
import { Button, TableWrap } from '../../shared/ui'
import { useRef } from 'react'

type KeywordSetRow = {
  id: string
  name: string
  isActive: boolean
  createdAt: number
  keywordCount: number
}

type KeywordRow = {
  id: string
  setId: string
  phrase: string
  weight: number | null
  tags: string | null
  createdAt: number
}

type TranscriptListRow = {
  id: string
  meetingId: string
  assemblyId: string | null
  status: string
  bodySynced: boolean
  createdAt: number
  updatedAt: number
  title: string
  audioKey: string
}

type TranscriptUtterance = {
  speaker: string
  displaySpeaker?: string
  text: string
  start: number | null
  end: number | null
}

type TranscriptDetail = {
  id: string
  meetingId: string
  assemblyId: string | null
  status: string
  bodySynced: boolean
  text: string
  utterances: TranscriptUtterance[]
  utterancesMapped: TranscriptUtterance[]
  speakerMap: Record<string, string>
  keywordsUsed: string[]
  errorMessage: string | null
  createdAt: number
  updatedAt: number
  meeting: {
    title: string
    audioKey: string
  }
}

type UploadPresignResponse = {
  ok: boolean
  uploadId: string
  eventToken: string
  key: string
  putUrl: string
  uploadMode?: 'r2_presigned' | 'worker_direct'
  requiredHeaders?: Record<string, string>
}

type TranscriptCreateResponse = {
  ok: boolean
  transcriptId: string
  meetingId: string
  assemblyId: string
  keywordsUsed: string[]
  keywordsTruncated: boolean
  keywordsTotal: number
}

type TranscriptPublishResponse = {
  ok: boolean
  transcriptId: string
  assemblyId: string
  status: string
  utteranceCount: number
  audioFileAttached: boolean
  audioAttachmentError: string | null
  summaryGenerated: boolean
  summaryError: string | null
}

const POLL_INTERVAL_MS = 4_000
const PRESIGN_TIMEOUT_MS = 20_000
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000
const MAX_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000
const TRANSCRIPT_CREATE_TIMEOUT_MS = 45_000
const ASSUMED_MIN_UPLOAD_BYTES_PER_SEC = 128 * 1024
const UPLOAD_TIMEOUT_BUFFER_MS = 30_000

type UploadStage = 'idle' | 'presign' | 'upload' | 'transcript'

type ActiveUploadSession = {
  id: string
  key: string
  token: string
}

type UploadSessionRow = {
  id: string
  key: string
  filename: string
  contentType: string | null
  uploadMode: string | null
  stage: string
  state: string
  reasonCode: string | null
  reasonMessage: string | null
  transcriptId: string | null
  meetingId: string | null
  createdAt: number
  updatedAt: number
  lastEventType: string | null
  lastEventAt: number | null
}

function toDateTimeLabel(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '-'
  return new Date(timestamp).toLocaleString('ko-KR', { hour12: false })
}

function toTranscriptStatusLabel(status: string, bodySynced: boolean): string {
  const normalized = status.trim().toLowerCase()
  if (normalized === 'completed') return bodySynced ? '반영 완료' : '라벨링 필요'
  if (normalized === 'queued' || normalized === 'submitted' || normalized === 'processing') return '전사 진행중'
  if (normalized === 'failed' || normalized === 'error') return '처리 실패'
  return status
}

function isTranscriptInProgress(status: string): boolean {
  const normalized = status.trim().toLowerCase()
  return normalized === 'queued' || normalized === 'submitted' || normalized === 'processing'
}

function sanitizeSpeakerMap(values: Record<string, string>): Array<{ speakerLabel: string; displayName: string }> {
  return Object.entries(values)
    .map(([speakerLabel, displayName]) => ({
      speakerLabel: speakerLabel.trim(),
      displayName: displayName.trim(),
    }))
    .filter((entry) => entry.speakerLabel && entry.displayName)
}

function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0s'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

function getUploadStageLabel(stage: UploadStage): string {
  if (stage === 'presign') return '1/3 업로드 준비'
  if (stage === 'upload') return '2/3 파일 업로드'
  if (stage === 'transcript') return '3/3 전사 요청 생성'
  return '대기'
}

function computeUploadTimeoutMs(fileSizeBytes: number): number {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) return UPLOAD_TIMEOUT_MS
  const estimatedMs = Math.ceil(fileSizeBytes / ASSUMED_MIN_UPLOAD_BYTES_PER_SEC) * 1000 + UPLOAD_TIMEOUT_BUFFER_MS
  return Math.max(UPLOAD_TIMEOUT_MS, Math.min(MAX_UPLOAD_TIMEOUT_MS, estimatedMs))
}

function isRetryableUploadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('upload_cancelled') || message.includes('AbortError')) return false
  if (message.includes('upload_timeout')) return true
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return true
  const statusMatch = message.match(/HTTP\s+(\d{3})/)
  if (!statusMatch) return false
  const status = Number(statusMatch[1])
  return status >= 500 || status === 408 || status === 429
}

function toUploadSessionStageLabel(stage: string): string {
  if (stage === 'presign') return '업로드 준비'
  if (stage === 'upload') return '파일 업로드'
  if (stage === 'transcript') return '전사 요청'
  if (stage === 'done') return '완료'
  return stage || '-'
}

function toUploadSessionStateLabel(state: string): string {
  if (state === 'presigned') return '준비됨'
  if (state === 'uploading') return '업로드 중'
  if (state === 'uploaded') return '업로드 완료'
  if (state === 'transcript_requested') return '전사 요청됨'
  if (state === 'completed') return '완료'
  if (state === 'cancelled') return '취소'
  if (state === 'failed') return '실패'
  return state || '-'
}

function isUploadSessionInProgress(state: string): boolean {
  return state === 'presigned' || state === 'uploading' || state === 'uploaded' || state === 'transcript_requested'
}

function isAbortError(error: unknown): boolean {
  if (!error) return false
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('AbortError')
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (list: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === 'function') return anyFn(signals)

  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort()
  }

  for (const signal of signals) {
    if (signal.aborted) {
      abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

function ActionIcon({ kind }: { kind: 'edit' | 'delete' | 'loading' }) {
  if (kind === 'loading') {
    return (
      <svg className="meetingsActionIcon is-spinning" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
        <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'edit') {
    return (
      <svg className="meetingsActionIcon" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.8 2.4l2.8 2.8-7.6 7.6H3.2V10z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9.8 3.4l2.8 2.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className="meetingsActionIcon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4.5h8M6 4.5v-1h4v1M6 6.2v5.3M8 6.2v5.3M10 6.2v5.3M5.2 4.5l.4 8h4.8l.4-8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MeetingsView() {
  const [keywordSets, setKeywordSets] = useState<KeywordSetRow[]>([])
  const [selectedKeywordSetId, setSelectedKeywordSetId] = useState('')
  const [keywords, setKeywords] = useState<KeywordRow[]>([])
  const [keywordSetName, setKeywordSetName] = useState('')
  const [keywordPhrase, setKeywordPhrase] = useState('')
  const [keywordWeight, setKeywordWeight] = useState('')
  const [keywordTags, setKeywordTags] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [minSpeakers, setMinSpeakers] = useState(2)
  const [maxSpeakers, setMaxSpeakers] = useState(10)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [uploadErrorMessage, setUploadErrorMessage] = useState('')
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle')
  const [uploadElapsedSec, setUploadElapsedSec] = useState(0)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const uploadStartedAtRef = useRef<number | null>(null)
  const uploadSessionRef = useRef<ActiveUploadSession | null>(null)
  const [sharedUploadSessions, setSharedUploadSessions] = useState<UploadSessionRow[]>([])

  const [transcripts, setTranscripts] = useState<TranscriptListRow[]>([])
  const [selectedTranscriptId, setSelectedTranscriptId] = useState('')
  const [transcriptDetail, setTranscriptDetail] = useState<TranscriptDetail | null>(null)
  const [speakerMapDraft, setSpeakerMapDraft] = useState<Record<string, string>>({})
  const [savingSpeakers, setSavingSpeakers] = useState(false)
  const [publishingToNotion, setPublishingToNotion] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingTranscripts, setLoadingTranscripts] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [creatingKeywordSet, setCreatingKeywordSet] = useState(false)
  const [creatingKeyword, setCreatingKeyword] = useState(false)
  const [renamingKeywordSetId, setRenamingKeywordSetId] = useState<string | null>(null)
  const [deletingKeywordSetId, setDeletingKeywordSetId] = useState<string | null>(null)
  const [editingKeywordId, setEditingKeywordId] = useState<string | null>(null)
  const [deletingKeywordId, setDeletingKeywordId] = useState<string | null>(null)

  const loadKeywordSets = useCallback(async () => {
    try {
      const response = await api<{ ok: boolean; sets: KeywordSetRow[] }>('/keyword-sets')
      setKeywordSets(response.sets ?? [])
      if (!selectedKeywordSetId && response.sets.length > 0) {
        setSelectedKeywordSetId(response.sets[0].id)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트를 불러오지 못했습니다.'
      setErrorMessage(message)
    }
  }, [selectedKeywordSetId])

  const loadKeywords = useCallback(async (setId?: string) => {
    try {
      const query = setId ? `?setId=${encodeURIComponent(setId)}` : ''
      const response = await api<{ ok: boolean; keywords: KeywordRow[] }>(`/keywords${query}`)
      setKeywords(response.keywords ?? [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드를 불러오지 못했습니다.'
      setErrorMessage(message)
    }
  }, [])

  const loadTranscripts = useCallback(async () => {
    setLoadingTranscripts(true)
    try {
      const response = await api<{ ok: boolean; transcripts: TranscriptListRow[] }>('/transcripts?limit=20')
      setTranscripts(response.transcripts ?? [])
      if (!selectedTranscriptId && response.transcripts.length > 0) {
        setSelectedTranscriptId(response.transcripts[0].id)
      }
    } finally {
      setLoadingTranscripts(false)
    }
  }, [selectedTranscriptId])

  const loadTranscriptDetail = useCallback(async (transcriptId: string) => {
    if (!transcriptId) return
    setLoadingDetail(true)
    try {
      const response = await api<{ ok: boolean; transcript: TranscriptDetail }>(`/transcripts/${encodeURIComponent(transcriptId)}`)
      setTranscriptDetail(response.transcript ?? null)
      setSpeakerMapDraft(response.transcript?.speakerMap ?? {})
      setErrorMessage('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '회의록 상세를 불러오지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const reportUploadEvent = useCallback(
    async (
      session: ActiveUploadSession,
      event: {
        eventType: string
        stage?: string
        state?: string
        reasonCode?: string
        reasonMessage?: string
        elapsedMs?: number
        payload?: unknown
      },
      keepalive = false,
    ) => {
      if (!session.id || !session.key || !session.token) return
      if (API_BASE_URL.startsWith('mock://')) return

      const endpoint = `${API_BASE_URL}/uploads/events`
      const body = JSON.stringify({
        uploadId: session.id,
        key: session.key,
        token: session.token,
        eventType: event.eventType,
        stage: event.stage,
        state: event.state,
        reasonCode: event.reasonCode,
        reasonMessage: event.reasonMessage,
        elapsedMs: event.elapsedMs,
        payload: event.payload,
      })

      try {
        await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          keepalive,
          headers: {
            'Content-Type': 'application/json',
          },
          body,
        })
      } catch {
        // Best-effort logging only.
      }
    },
    [],
  )

  const loadUploadSessions = useCallback(async () => {
    try {
      const response = await api<{ ok: boolean; sessions: UploadSessionRow[] }>('/uploads/sessions?limit=20')
      setSharedUploadSessions(response.sessions ?? [])
    } catch {
      // Keep upload status board non-blocking.
    }
  }, [])

  useEffect(() => {
    void loadKeywordSets()
    void loadTranscripts()
    void loadUploadSessions()
  }, [loadKeywordSets, loadTranscripts, loadUploadSessions])

  useEffect(() => {
    if (!selectedKeywordSetId) {
      setKeywords([])
      return
    }
    void loadKeywords(selectedKeywordSetId)
  }, [loadKeywords, selectedKeywordSetId])

  useEffect(() => {
    if (!selectedTranscriptId) {
      setTranscriptDetail(null)
      return
    }
    void loadTranscriptDetail(selectedTranscriptId)
  }, [loadTranscriptDetail, selectedTranscriptId])

  useEffect(() => {
    if (!selectedTranscriptId) return
    if (!transcriptDetail) return
    if (!(transcriptDetail.status === 'queued' || transcriptDetail.status === 'processing' || transcriptDetail.status === 'submitted')) return
    const timer = window.setInterval(() => {
      void loadTranscriptDetail(selectedTranscriptId)
      void loadTranscripts()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [loadTranscriptDetail, loadTranscripts, selectedTranscriptId, transcriptDetail])

  const speakerLabels = useMemo(() => {
    if (!transcriptDetail) return []
    return Array.from(new Set(transcriptDetail.utterances.map((entry) => entry.speaker).filter(Boolean)))
  }, [transcriptDetail])

  const keywordSetOptions = useMemo(
    () => keywordSets.map((set) => ({ ...set, label: `${set.name} (${set.keywordCount})` })),
    [keywordSets],
  )

  const inProgressTranscriptCount = useMemo(
    () => transcripts.filter((row) => isTranscriptInProgress(row.status)).length,
    [transcripts],
  )

  const inProgressUploadSessionCount = useMemo(
    () => sharedUploadSessions.filter((row) => isUploadSessionInProgress(row.state)).length,
    [sharedUploadSessions],
  )

  const onSubmitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setUploadErrorMessage('업로드할 음성 파일을 선택해 주세요.')
      return
    }
    if (maxSpeakers < minSpeakers) {
      setUploadErrorMessage('최대 화자 수는 최소 화자 수 이상이어야 합니다.')
      return
    }

    setUploading(true)
    setUploadStage('presign')
    uploadStartedAtRef.current = Date.now()
    setUploadElapsedSec(0)
    if (uploadAbortRef.current) uploadAbortRef.current.abort()
    const flowAbort = new AbortController()
    uploadAbortRef.current = flowAbort
    uploadSessionRef.current = null

    setUploadMessage('')
    setUploadErrorMessage('')
    setErrorMessage('')
    const selectedFile = file
    let currentStage: UploadStage = 'presign'
    let activeSession: ActiveUploadSession | null = null

    const runStageWithTimeout = async <T,>(
      runner: (signal: AbortSignal) => Promise<T>,
      timeoutMs: number,
      timeoutCode: string,
    ): Promise<T> => {
      const timeoutController = new AbortController()
      const timeoutTimer = window.setTimeout(() => timeoutController.abort(), timeoutMs)
      const signal = combineAbortSignals([flowAbort.signal, timeoutController.signal])
      try {
        return await runner(signal)
      } catch (error) {
        if (flowAbort.signal.aborted) throw new Error('upload_cancelled')
        if (timeoutController.signal.aborted) throw new Error(timeoutCode)
        throw error
      } finally {
        window.clearTimeout(timeoutTimer)
      }
    }

    try {
      const presign = await runStageWithTimeout(
        (signal) =>
          api<UploadPresignResponse>('/uploads/presign', {
            method: 'POST',
            signal,
            body: JSON.stringify({
              filename: selectedFile.name,
              contentType: selectedFile.type || 'audio/m4a',
            }),
          }),
        PRESIGN_TIMEOUT_MS,
        'presign_timeout',
      )
      if (presign.uploadId && presign.eventToken) {
        activeSession = {
          id: presign.uploadId,
          key: presign.key,
          token: presign.eventToken,
        }
        uploadSessionRef.current = activeSession
      }

      const putHeaders = new Headers(presign.requiredHeaders ?? {})
      if (!putHeaders.has('Content-Type')) {
        putHeaders.set('Content-Type', selectedFile.type || 'audio/m4a')
      }
      if (presign.uploadMode === 'worker_direct') {
        setUploadMessage('현재 업로드 경로가 fallback(worker_direct)입니다. 대용량 파일은 업로드 시간이 길어질 수 있습니다.')
      }

      setUploadStage('upload')
      currentStage = 'upload'
      const uploadStartedAt = uploadStartedAtRef.current
      const uploadTimeoutMs = computeUploadTimeoutMs(selectedFile.size)
      if (activeSession) {
        void reportUploadEvent(activeSession, {
          eventType: 'upload_started',
          stage: 'upload',
          state: 'uploading',
          elapsedMs: uploadStartedAt ? Math.max(0, Date.now() - uploadStartedAt) : undefined,
          payload: {
            uploadMode: presign.uploadMode ?? 'unknown',
            uploadTimeoutMs,
          },
        })
      }
      let uploadResponse: Response | null = null
      let lastUploadError: unknown = null
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          uploadResponse = await runStageWithTimeout(
            (signal) =>
              fetch(presign.putUrl, {
                method: 'PUT',
                signal,
                headers: putHeaders,
                credentials: 'include',
                body: selectedFile,
              }),
            uploadTimeoutMs,
            'upload_timeout',
          )
          if (!uploadResponse.ok) {
            throw new Error(`오디오 업로드 실패: HTTP ${uploadResponse.status}`)
          }
          break
        } catch (uploadError: unknown) {
          lastUploadError = uploadError
          if (attempt >= 2 || !isRetryableUploadError(uploadError)) {
            throw uploadError
          }
          if (activeSession) {
            const startedAt = uploadStartedAtRef.current
            void reportUploadEvent(activeSession, {
              eventType: 'upload_retry',
              stage: 'upload',
              state: 'uploading',
              reasonCode: 'retry_once',
              reasonMessage: 'upload_retry_after_failure',
              elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
            })
          }
        }
      }
      if (!uploadResponse?.ok && lastUploadError) throw lastUploadError
      if (activeSession) {
        const startedAt = uploadStartedAtRef.current
        void reportUploadEvent(activeSession, {
          eventType: 'upload_completed',
          stage: 'upload',
          state: 'uploaded',
          elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
        })
      }

      setUploadStage('transcript')
      currentStage = 'transcript'
      if (activeSession) {
        const startedAt = uploadStartedAtRef.current
        void reportUploadEvent(activeSession, {
          eventType: 'transcript_create_started',
          stage: 'transcript',
          state: 'transcript_requested',
          elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
        })
      }
      const created = await runStageWithTimeout(
        (signal) =>
          api<TranscriptCreateResponse>('/transcripts', {
            method: 'POST',
            signal,
            body: JSON.stringify({
              key: presign.key,
              title: selectedFile.name,
              minSpeakers,
              maxSpeakers,
              keywordSetId: selectedKeywordSetId || null,
              uploadId: activeSession?.id ?? null,
            }),
          }),
        TRANSCRIPT_CREATE_TIMEOUT_MS,
        'transcript_create_timeout',
      )
      if (activeSession) {
        const startedAt = uploadStartedAtRef.current
        void reportUploadEvent(activeSession, {
          eventType: 'transcript_create_succeeded',
          stage: 'transcript',
          state: 'transcript_requested',
          elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
          payload: { transcriptId: created.transcriptId },
        })
      }

      setUploadMessage(`전사 요청이 생성되었습니다. Transcript ID: ${created.transcriptId}`)
      setSelectedTranscriptId(created.transcriptId)
      setFile(null)
      await loadTranscripts()
      await loadTranscriptDetail(created.transcriptId)
      await loadUploadSessions()
    } catch (error: unknown) {
      const raw = error instanceof Error ? error.message : '전사 요청 중 오류가 발생했습니다.'
      let message = raw
      let reasonCode = 'upload_failed'
      let failedState: 'failed' | 'cancelled' = 'failed'
      if (raw.includes('presign_timeout')) {
        message = '업로드 준비 단계가 지연되었습니다. 잠시 후 다시 시도해 주세요.'
        reasonCode = 'presign_timeout'
      } else if (raw.includes('r2_presign_required')) {
        message = '현재 배포 환경에서는 R2 presigned 업로드가 필요합니다. Worker direct 업로드는 비활성화되어 있어 스토리지 설정을 먼저 확인해야 합니다.'
        reasonCode = 'r2_presign_required'
      } else if (raw.includes('upload_timeout')) {
        message = '파일 업로드 시간이 너무 오래 걸립니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'
        reasonCode = 'upload_timeout'
      } else if (raw.includes('transcript_create_timeout')) {
        message = '전사 요청 생성이 지연되고 있습니다. 새로고침 후 최근 전사 목록을 확인해 주세요.'
        reasonCode = 'transcript_create_timeout'
      } else if (raw.includes('upload_cancelled') || isAbortError(error)) {
        message = '요청을 취소했습니다.'
        reasonCode = 'upload_cancelled'
        failedState = 'cancelled'
      }
      if (activeSession) {
        const startedAt = uploadStartedAtRef.current
        void reportUploadEvent(activeSession, {
          eventType: failedState === 'cancelled' ? 'upload_cancelled' : 'upload_failed',
          stage: currentStage,
          state: failedState,
          reasonCode,
          reasonMessage: message,
          elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
        })
      }
      setUploadErrorMessage(message)
      await loadUploadSessions()
    } finally {
      uploadAbortRef.current = null
      uploadStartedAtRef.current = null
      uploadSessionRef.current = null
      setUploadStage('idle')
      setUploadElapsedSec(0)
      setUploading(false)
    }
  }

  const onCancelUploadFlow = () => {
    if (!uploading || !uploadAbortRef.current) return
    const activeSession = uploadSessionRef.current
    if (activeSession) {
      const startedAt = uploadStartedAtRef.current
      void reportUploadEvent(activeSession, {
        eventType: 'upload_cancelled',
        stage: uploadStage === 'idle' ? 'upload' : uploadStage,
        state: 'cancelled',
        reasonCode: 'user_cancelled',
        reasonMessage: 'user_requested_cancel',
        elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : undefined,
      })
    }
    uploadAbortRef.current.abort()
  }

  useEffect(() => {
    if (!uploading) return
    const timer = window.setInterval(() => {
      const startedAt = uploadStartedAtRef.current
      if (!startedAt) return
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setUploadElapsedSec(elapsed)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [uploading])

  useEffect(() => {
    const hasActiveSharedUpload = sharedUploadSessions.some((row) => isUploadSessionInProgress(row.state))
    if (!uploading && !hasActiveSharedUpload) return
    const timer = window.setInterval(() => {
      void loadUploadSessions()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [loadUploadSessions, sharedUploadSessions, uploading])

  useEffect(() => {
    const onPageHide = () => {
      const session = uploadSessionRef.current
      if (!session) return
      const startedAt = uploadStartedAtRef.current
      const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : undefined
      void reportUploadEvent(
        session,
        {
          eventType: 'browser_unload',
          stage: uploadStage === 'idle' ? 'upload' : uploadStage,
          state: 'cancelled',
          reasonCode: 'browser_closed',
          reasonMessage: 'browser_closed_during_upload',
          elapsedMs,
        },
        true,
      )
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [reportUploadEvent, uploadStage])

  useEffect(() => {
    if (inProgressTranscriptCount <= 0) return
    const timer = window.setInterval(() => {
      void loadTranscripts()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [inProgressTranscriptCount, loadTranscripts])

  const persistSpeakerMap = useCallback(
    async (transcriptId: string) => {
      await api(`/transcripts/${encodeURIComponent(transcriptId)}/speakers`, {
        method: 'PATCH',
        body: JSON.stringify({
          mappings: sanitizeSpeakerMap(speakerMapDraft),
        }),
      })
    },
    [speakerMapDraft],
  )

  const onSaveSpeakerMap = async () => {
    if (!selectedTranscriptId) return
    setSavingSpeakers(true)
    setErrorMessage('')
    try {
      await persistSpeakerMap(selectedTranscriptId)
      await loadTranscriptDetail(selectedTranscriptId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '화자 이름 저장에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setSavingSpeakers(false)
    }
  }

  const onPublishToNotion = async () => {
    if (!selectedTranscriptId || !transcriptDetail) return
    if (transcriptDetail.status !== 'completed') {
      setErrorMessage('전사가 completed 상태가 된 뒤 Notion 반영이 가능합니다.')
      return
    }

    const missingMappings = speakerLabels.filter((speaker) => !(speakerMapDraft[speaker] ?? '').trim())
    if (missingMappings.length > 0) {
      setErrorMessage(`아직 이름이 지정되지 않은 화자가 있습니다: ${missingMappings.join(', ')}`)
      return
    }

    setPublishingToNotion(true)
    setErrorMessage('')
    try {
      await persistSpeakerMap(selectedTranscriptId)
      const published = await api<TranscriptPublishResponse>(`/transcripts/${encodeURIComponent(selectedTranscriptId)}/publish`, {
        method: 'POST',
      })
      if (published.summaryGenerated) {
        setUploadMessage('라벨링된 화자 발화와 요약을 Notion에 반영했습니다.')
      } else if (published.summaryError) {
        setUploadMessage(`Notion 반영은 완료되었지만 요약은 생성되지 않았습니다: ${published.summaryError}`)
      } else {
        setUploadMessage('라벨링된 화자 발화를 Notion에 반영했습니다. (요약 미생성)')
      }
      if (published.audioAttachmentError) {
        setUploadMessage((current) =>
          current
            ? `${current} 오디오 파일 첨부는 건너뛰었습니다: ${published.audioAttachmentError}`
            : `Notion 반영은 완료되었지만 오디오 파일 첨부는 건너뛰었습니다: ${published.audioAttachmentError}`,
        )
      }
      await loadTranscriptDetail(selectedTranscriptId)
      await loadTranscripts()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Notion 반영에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setPublishingToNotion(false)
    }
  }

  const onCreateKeywordSet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!keywordSetName.trim()) {
      setErrorMessage('키워드 세트 이름을 입력해 주세요.')
      return
    }
    setCreatingKeywordSet(true)
    setErrorMessage('')
    try {
      await api('/keyword-sets', {
        method: 'POST',
        body: JSON.stringify({ name: keywordSetName.trim(), isActive: true }),
      })
      setKeywordSetName('')
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트를 생성하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setCreatingKeywordSet(false)
    }
  }

  const onCreateKeyword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedKeywordSetId) {
      setErrorMessage('키워드 세트를 먼저 선택해 주세요.')
      return
    }
    if (!keywordPhrase.trim()) {
      setErrorMessage('키워드 문구를 입력해 주세요.')
      return
    }
    setCreatingKeyword(true)
    setErrorMessage('')
    try {
      await api('/keywords', {
        method: 'POST',
        body: JSON.stringify({
          setId: selectedKeywordSetId,
          phrase: keywordPhrase.trim(),
          weight: keywordWeight.trim() ? Number(keywordWeight) : null,
          tags: keywordTags.trim() || null,
        }),
      })
      setKeywordPhrase('')
      setKeywordWeight('')
      setKeywordTags('')
      await loadKeywords(selectedKeywordSetId)
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드를 추가하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setCreatingKeyword(false)
    }
  }

  const onDeleteKeyword = async (keywordId: string) => {
    setDeletingKeywordId(keywordId)
    try {
      await api(`/keywords?id=${encodeURIComponent(keywordId)}`, { method: 'DELETE' })
      await loadKeywords(selectedKeywordSetId || undefined)
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드를 삭제하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setDeletingKeywordId(null)
    }
  }

  const onEditKeyword = async (keyword: KeywordRow) => {
    const phrase = window.prompt('키워드 문구', keyword.phrase)
    if (phrase === null) return
    const weightRaw = window.prompt('가중치(선택)', keyword.weight == null ? '' : String(keyword.weight))
    if (weightRaw === null) return
    const tags = window.prompt('태그(선택)', keyword.tags ?? '')
    if (tags === null) return
    setEditingKeywordId(keyword.id)
    try {
      await api('/keywords', {
        method: 'PATCH',
        body: JSON.stringify({
          id: keyword.id,
          phrase: phrase.trim(),
          weight: weightRaw.trim() ? Number(weightRaw.trim()) : null,
          tags: tags.trim() || null,
        }),
      })
      await loadKeywords(selectedKeywordSetId || undefined)
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드를 수정하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setEditingKeywordId(null)
    }
  }

  const onToggleKeywordSetActive = async (set: KeywordSetRow) => {
    try {
      await api('/keyword-sets', {
        method: 'PATCH',
        body: JSON.stringify({
          id: set.id,
          isActive: !set.isActive,
        }),
      })
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트 상태를 변경하지 못했습니다.'
      setErrorMessage(message)
    }
  }

  const onRenameKeywordSet = async (set: KeywordSetRow) => {
    const nextName = window.prompt('세트 이름', set.name)
    if (nextName === null) return
    if (!nextName.trim()) return
    setRenamingKeywordSetId(set.id)
    try {
      await api('/keyword-sets', {
        method: 'PATCH',
        body: JSON.stringify({
          id: set.id,
          name: nextName.trim(),
        }),
      })
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트 이름을 수정하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setRenamingKeywordSetId(null)
    }
  }

  const onDeleteKeywordSet = async (id: string) => {
    setDeletingKeywordSetId(id)
    try {
      await api(`/keyword-sets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (selectedKeywordSetId === id) {
        setSelectedKeywordSetId('')
      }
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트를 삭제하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setDeletingKeywordSetId(null)
    }
  }

  return (
    <section className="meetingsView">
      <article className="meetingsCard">
        <h2>회의록 업로드 및 전사</h2>
        <form className="meetingsUploadForm" onSubmit={onSubmitUpload}>
          <label>
            녹음 파일
            <input
              type="file"
              accept=".m4a,.mp3,.wav,.mp4,.aac,.flac,.ogg"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            최소 화자 수
            <input type="number" min={1} max={10} value={minSpeakers} onChange={(event) => setMinSpeakers(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} />
          </label>
          <label>
            최대 화자 수
            <input type="number" min={1} max={10} value={maxSpeakers} onChange={(event) => setMaxSpeakers(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} />
          </label>
          <label>
            키워드 세트
            <select value={selectedKeywordSetId} onChange={(event) => setSelectedKeywordSetId(event.target.value)}>
              <option value="">선택 안 함</option>
              {keywordSetOptions.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.label}
                </option>
              ))}
            </select>
          </label>
          <div className="meetingsActions">
            <Button type="submit" disabled={uploading}>
              {uploading ? '전사 요청 중...' : '업로드 후 전사 시작'}
            </Button>
            {uploading ? (
              <Button type="button" variant="secondary" onClick={onCancelUploadFlow}>
                요청 취소
              </Button>
            ) : null}
          </div>
        </form>
        {uploading ? (
          <div className="meetingsUploadStatus" role="status" aria-live="polite">
            <strong>{getUploadStageLabel(uploadStage)}</strong>
            <span>경과 {formatDurationSeconds(uploadElapsedSec)}</span>
          </div>
        ) : null}
        {uploadMessage ? <p className="muted small">{uploadMessage}</p> : null}
        {uploadErrorMessage ? <p className="error">{uploadErrorMessage}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </article>

      <article className="meetingsCard">
        <div className="meetingsCardHeader">
          <h3>공유 업로드 상태</h3>
          <Button type="button" variant="secondary" size="mini" onClick={() => void loadUploadSessions()}>
            새로고침
          </Button>
        </div>
        {inProgressUploadSessionCount > 0 ? <p className="muted small">진행중 {inProgressUploadSessionCount}건</p> : null}
        <TableWrap className="meetingsListTable">
          <table>
            <thead>
              <tr>
                <th>파일</th>
                <th>단계</th>
                <th>상태</th>
                <th>사유</th>
                <th>갱신</th>
              </tr>
            </thead>
            <tbody>
              {sharedUploadSessions.map((row) => (
                <tr key={row.id}>
                  <td>{row.filename}</td>
                  <td>{toUploadSessionStageLabel(row.stage)}</td>
                  <td>{toUploadSessionStateLabel(row.state)}</td>
                  <td>{row.reasonMessage ?? row.reasonCode ?? '-'}</td>
                  <td>{toDateTimeLabel(row.updatedAt)}</td>
                </tr>
              ))}
              {sharedUploadSessions.length === 0 ? (
                <tr>
                  <td colSpan={5}>공유 업로드 상태가 없습니다.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableWrap>
      </article>

      <div className="meetingsWorkbench">
        <article className="meetingsCard meetingsListCard">
          <div className="meetingsCardHeader">
            <h3>최근 전사</h3>
            <Button type="button" variant="secondary" size="mini" onClick={() => void loadTranscripts()} disabled={loadingTranscripts}>
              새로고침
            </Button>
          </div>
          {inProgressTranscriptCount > 0 ? <p className="muted small">진행중 {inProgressTranscriptCount}건 · 목록 자동 갱신 중</p> : null}
          <TableWrap className="meetingsListTable">
            <table>
              <thead>
                <tr>
                  <th>제목</th>
                  <th>상태</th>
                  <th>생성</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.map((row) => (
                  <tr
                    key={row.id}
                    className={selectedTranscriptId === row.id ? 'isTimelineFocus' : ''}
                    onClick={() => setSelectedTranscriptId(row.id)}
                  >
                    <td>{row.title || row.audioKey}</td>
                    <td>{toTranscriptStatusLabel(row.status, row.bodySynced)}</td>
                    <td>{toDateTimeLabel(row.createdAt)}</td>
                  </tr>
                ))}
                {transcripts.length === 0 ? (
                  <tr>
                    <td colSpan={3}>전사 내역이 없습니다.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableWrap>
        </article>
        <article className="meetingsCard meetingsDetailCard">
          <div className="meetingsCardHeader">
            <h3>Transcript 상세 / 화자 매핑</h3>
          </div>
          {!selectedTranscriptId ? (
            <p className="muted">좌측 목록에서 transcript를 선택해 주세요.</p>
          ) : loadingDetail ? (
            <p className="muted">상세 조회 중...</p>
          ) : transcriptDetail ? (
            <>
              <section className="meetingsMetaGrid">
                <article>
                  <span>상태</span>
                  <strong>{toTranscriptStatusLabel(transcriptDetail.status, transcriptDetail.bodySynced)}</strong>
                </article>
                <article>
                  <span>생성 시각</span>
                  <strong>{toDateTimeLabel(transcriptDetail.createdAt)}</strong>
                </article>
                <article>
                  <span>최종 갱신</span>
                  <strong>{toDateTimeLabel(transcriptDetail.updatedAt)}</strong>
                </article>
                <article>
                  <span>Notion 반영</span>
                  <strong>{transcriptDetail.bodySynced ? '완료' : '대기'}</strong>
                </article>
              </section>

              {transcriptDetail.keywordsUsed.length > 0 ? (
                <p className="muted small">전사에 적용된 Word Boost: {transcriptDetail.keywordsUsed.join(', ')}</p>
              ) : null}
              {transcriptDetail.errorMessage ? <p className="error">{transcriptDetail.errorMessage}</p> : null}

              <section className="meetingsSpeakerMap">
                <h4>화자 이름 매핑</h4>
                {speakerLabels.length === 0 ? <p className="muted small">화자 라벨이 아직 생성되지 않았습니다.</p> : null}
                {speakerLabels.map((speaker) => (
                  <label key={speaker}>
                    {speaker}
                    <input
                      value={speakerMapDraft[speaker] ?? ''}
                      onChange={(event) =>
                        setSpeakerMapDraft((prev) => ({
                          ...prev,
                          [speaker]: event.target.value,
                        }))
                      }
                      placeholder={`예: ${speaker}`}
                    />
                  </label>
                ))}
                <div className="meetingsActions">
                  <Button type="button" onClick={() => void onSaveSpeakerMap()} disabled={savingSpeakers || speakerLabels.length === 0}>
                    {savingSpeakers ? '저장 중...' : '매핑 저장'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onPublishToNotion()}
                    disabled={publishingToNotion || savingSpeakers || transcriptDetail.status !== 'completed' || speakerLabels.length === 0}
                  >
                    {publishingToNotion ? 'Notion 반영 중...' : '라벨 확정 후 Notion 반영'}
                  </Button>
                </div>
              </section>

              <section className="meetingsUtterances">
                <h4>Utterances</h4>
                {transcriptDetail.utterancesMapped.length === 0 ? <p className="muted">아직 전사 결과가 없습니다.</p> : null}
                {transcriptDetail.utterancesMapped.map((entry, index) => (
                  <article key={`${entry.speaker}-${index}`}>
                    <header>
                      <strong>{entry.displaySpeaker ?? entry.speaker}</strong>
                      <span className="muted small">
                        {entry.start ?? '-'} ~ {entry.end ?? '-'}
                      </span>
                    </header>
                    <p>{entry.text}</p>
                  </article>
                ))}
              </section>
            </>
          ) : (
            <p className="muted">선택한 transcript를 찾을 수 없습니다.</p>
          )}
        </article>
      </div>

      <article className="meetingsCard meetingsKeywordCard">
        <div className="meetingsCardHeader">
          <h3>키워드 세트 / Word Boost</h3>
        </div>
        <form className="meetingsInlineForm meetingsKeywordCreateSetForm" onSubmit={onCreateKeywordSet}>
          <input value={keywordSetName} onChange={(event) => setKeywordSetName(event.target.value)} placeholder="세트 이름" />
          <Button type="submit" size="mini" disabled={creatingKeywordSet}>
            {creatingKeywordSet ? '추가 중...' : '추가'}
          </Button>
        </form>
        <div className="meetingsKeywordSets meetingsKeywordSetsCompact">
          {keywordSets.map((set) => (
            <div key={set.id} className={selectedKeywordSetId === set.id ? 'meetingsKeywordSetItem is-active' : 'meetingsKeywordSetItem'}>
              <button type="button" className="linkButton secondary mini" onClick={() => setSelectedKeywordSetId(set.id)}>
                {set.name} ({set.keywordCount})
              </button>
              <div className="meetingsKeywordSetActions">
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  onClick={() => void onRenameKeywordSet(set)}
                  title="이름 수정"
                  aria-label="이름 수정"
                  disabled={renamingKeywordSetId === set.id || deletingKeywordSetId === set.id}
                >
                  <span className="meetingsIconButtonContent">
                    <ActionIcon kind={renamingKeywordSetId === set.id ? 'loading' : 'edit'} />
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  onClick={() => void onToggleKeywordSetActive(set)}
                  disabled={renamingKeywordSetId === set.id || deletingKeywordSetId === set.id}
                >
                  {set.isActive ? 'Off' : 'On'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  onClick={() => void onDeleteKeywordSet(set.id)}
                  title="세트 삭제"
                  aria-label="세트 삭제"
                  disabled={deletingKeywordSetId === set.id}
                >
                  <span className="meetingsIconButtonContent">
                    <ActionIcon kind={deletingKeywordSetId === set.id ? 'loading' : 'delete'} />
                  </span>
                </Button>
              </div>
            </div>
          ))}
        </div>
        <form className="meetingsInlineForm meetingsKeywordCreateKeywordForm" onSubmit={onCreateKeyword}>
          <input value={keywordPhrase} onChange={(event) => setKeywordPhrase(event.target.value)} placeholder="키워드" />
          <input value={keywordWeight} onChange={(event) => setKeywordWeight(event.target.value)} placeholder="w" />
          <input value={keywordTags} onChange={(event) => setKeywordTags(event.target.value)} placeholder="tags" />
          <Button type="submit" size="mini" disabled={!selectedKeywordSetId || creatingKeyword}>
            {creatingKeyword ? '추가 중...' : '추가'}
          </Button>
        </form>
        {!selectedKeywordSetId ? <p className="muted small">세트를 선택해야 키워드 추가가 가능합니다.</p> : null}
        <div className="meetingsKeywordList meetingsKeywordListCompact">
          {keywords.map((keyword) => (
            <div key={keyword.id} className="meetingsKeywordItem">
              <div className="meetingsKeywordItemHeader">
                <strong className="meetingsKeywordPhrase">{keyword.phrase}</strong>
                <span className="muted small">
                  {keyword.weight != null ? `w:${keyword.weight}` : '-'} / {keyword.tags || '-'}
                </span>
              </div>
              <div className="meetingsKeywordSetActions">
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  onClick={() => void onEditKeyword(keyword)}
                  title="키워드 수정"
                  aria-label="키워드 수정"
                  disabled={editingKeywordId === keyword.id || deletingKeywordId === keyword.id}
                >
                  <span className="meetingsIconButtonContent">
                    <ActionIcon kind={editingKeywordId === keyword.id ? 'loading' : 'edit'} />
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="mini"
                  onClick={() => void onDeleteKeyword(keyword.id)}
                  title="키워드 삭제"
                  aria-label="키워드 삭제"
                  disabled={editingKeywordId === keyword.id || deletingKeywordId === keyword.id}
                >
                  <span className="meetingsIconButtonContent">
                    <ActionIcon kind={deletingKeywordId === keyword.id ? 'loading' : 'delete'} />
                  </span>
                </Button>
              </div>
            </div>
          ))}
          {selectedKeywordSetId && keywords.length === 0 ? <p className="muted small">등록된 키워드가 없습니다.</p> : null}
        </div>
      </article>
    </section>
  )
}

