import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { API_BASE_URL, api } from '../../shared/api/client'
import { Button, TableWrap } from '../../shared/ui'
import { useRef } from 'react'

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
    notionPageUrl: string | null
  }
}

type UploadPresignResponse = {
  ok: boolean
  uploadId: string
  eventToken: string
  key: string
  putUrl: string
  uploadMode?: 'r2_presigned'
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
const MEETING_ACTION_TRACKING_KEY = 'meetings-pending-actions'
const MEETING_ACTION_STALE_MS = 10 * 60 * 1000

type UploadStage = 'idle' | 'presign' | 'upload' | 'transcript'
type MeetingActionKey = 'summaryRetryAt' | 'transcriptRewriteAt' | 'pageRegenerateAt'
type PendingMeetingActionMap = Record<string, Partial<Record<MeetingActionKey, number>>>

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

function readPendingMeetingActionMap(): PendingMeetingActionMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(MEETING_ACTION_TRACKING_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const entries = Object.entries(parsed as Record<string, unknown>)
    return Object.fromEntries(
      entries.flatMap(([transcriptId, value]) => {
        if (!value || typeof value !== 'object') return []
        const typedValue = value as Record<string, unknown>
        const next: Partial<Record<MeetingActionKey, number>> = {}
        if (typeof typedValue.summaryRetryAt === 'number') next.summaryRetryAt = typedValue.summaryRetryAt
        if (typeof typedValue.transcriptRewriteAt === 'number') next.transcriptRewriteAt = typedValue.transcriptRewriteAt
        if (typeof typedValue.pageRegenerateAt === 'number') next.pageRegenerateAt = typedValue.pageRegenerateAt
        return Object.keys(next).length > 0 ? [[transcriptId, next]] : []
      }),
    )
  } catch {
    return {}
  }
}

function writePendingMeetingActionMap(value: PendingMeetingActionMap): void {
  if (typeof window === 'undefined') return
  if (Object.keys(value).length === 0) {
    window.sessionStorage.removeItem(MEETING_ACTION_TRACKING_KEY)
    return
  }
  window.sessionStorage.setItem(MEETING_ACTION_TRACKING_KEY, JSON.stringify(value))
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

function formatTranscriptTimecode(value: number | null): string {
  if (!Number.isFinite(value) || value == null || value < 0) return '-'
  const totalSeconds = Math.floor(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
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

export function MeetingsView() {
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
  const [retryingSummary, setRetryingSummary] = useState(false)
  const [rewritingTranscript, setRewritingTranscript] = useState(false)
  const [regeneratingPage, setRegeneratingPage] = useState(false)
  const [pendingMeetingActions, setPendingMeetingActions] = useState<PendingMeetingActionMap>(() => readPendingMeetingActionMap())
  const [errorMessage, setErrorMessage] = useState('')
  const [loadingTranscripts, setLoadingTranscripts] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [deletingTranscriptId, setDeletingTranscriptId] = useState<string | null>(null)

  const updatePendingMeetingActions = useCallback(
    (updater: (current: PendingMeetingActionMap) => PendingMeetingActionMap) => {
      setPendingMeetingActions((current) => {
        const next = updater(current)
        writePendingMeetingActionMap(next)
        return next
      })
    },
    [],
  )

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
      const nextTranscript = response.transcript ?? null
      setTranscriptDetail(nextTranscript)
      setSpeakerMapDraft(nextTranscript?.speakerMap ?? {})
      if (nextTranscript) {
        updatePendingMeetingActions((current) => {
          const pending = current[transcriptId]
          if (!pending) return current
          let changed = false
          const nextPending: Partial<Record<MeetingActionKey, number>> = { ...pending }
          if (typeof nextPending.summaryRetryAt === 'number' && nextTranscript.updatedAt >= nextPending.summaryRetryAt) {
            delete nextPending.summaryRetryAt
            changed = true
          }
          if (typeof nextPending.transcriptRewriteAt === 'number' && nextTranscript.updatedAt >= nextPending.transcriptRewriteAt) {
            delete nextPending.transcriptRewriteAt
            changed = true
          }
          if (typeof nextPending.pageRegenerateAt === 'number' && nextTranscript.updatedAt >= nextPending.pageRegenerateAt) {
            delete nextPending.pageRegenerateAt
            changed = true
          }
          if (!changed) return current
          const next = { ...current }
          if (Object.keys(nextPending).length > 0) {
            next[transcriptId] = nextPending
          } else {
            delete next[transcriptId]
          }
          return next
        })
      }
      setErrorMessage('')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '회의록 상세를 불러오지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setLoadingDetail(false)
    }
  }, [updatePendingMeetingActions])

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
    void loadTranscripts()
    void loadUploadSessions()
  }, [loadTranscripts, loadUploadSessions])


  useEffect(() => {
    if (!selectedTranscriptId) {
      setTranscriptDetail(null)
      return
    }
    void loadTranscriptDetail(selectedTranscriptId)
  }, [loadTranscriptDetail, selectedTranscriptId])

  useEffect(() => {
    const pruneStaleActions = () => {
      const now = Date.now()
      updatePendingMeetingActions((current) => {
        const next = Object.fromEntries(
          Object.entries(current).flatMap(([transcriptId, pending]) => {
            const trimmed = Object.fromEntries(
              Object.entries(pending).filter(([, startedAt]) => typeof startedAt === 'number' && now - startedAt < MEETING_ACTION_STALE_MS),
            ) as Partial<Record<MeetingActionKey, number>>
            return Object.keys(trimmed).length > 0 ? [[transcriptId, trimmed]] : []
          }),
        )
        const currentJson = JSON.stringify(current)
        const nextJson = JSON.stringify(next)
        return currentJson === nextJson ? current : next
      })
    }

    pruneStaleActions()
    const timer = window.setInterval(pruneStaleActions, 60_000)
    return () => window.clearInterval(timer)
  }, [updatePendingMeetingActions])

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

  const inProgressTranscriptCount = useMemo(
    () => transcripts.filter((row) => isTranscriptInProgress(row.status)).length,
    [transcripts],
  )

  const inProgressUploadSessionCount = useMemo(
    () => sharedUploadSessions.filter((row) => isUploadSessionInProgress(row.state)).length,
    [sharedUploadSessions],
  )

  const selectedPendingActions = selectedTranscriptId ? pendingMeetingActions[selectedTranscriptId] : undefined
  const isSelectedTranscriptRetryPending = typeof selectedPendingActions?.summaryRetryAt === 'number'
  const isSelectedTranscriptRewritePending = typeof selectedPendingActions?.transcriptRewriteAt === 'number'
  const isSelectedTranscriptRegeneratePending = typeof selectedPendingActions?.pageRegenerateAt === 'number'

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
                credentials: 'omit',
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
      } else if (raw.includes('r2_presign_required') || raw.includes('r2_presign_config_missing')) {
        message = 'R2 presigned 업로드 설정이 완료되지 않았습니다. Cloudflare Worker에 R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY를 설정해야 합니다.'
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

  const onRetrySummary = async () => {
    if (!selectedTranscriptId || !transcriptDetail) return
    if (!transcriptDetail.bodySynced) {
      setErrorMessage('먼저 Notion 반영을 완료한 뒤 요약 재시도를 실행해 주세요.')
      return
    }
    if (transcriptDetail.status !== 'completed') {
      setErrorMessage('전사가 completed 상태일 때만 요약 재시도가 가능합니다.')
      return
    }
    const confirmed = window.confirm('정말 재시도하겠습니까? API 비용이 발생합니다.')
    if (!confirmed) return

    setRetryingSummary(true)
    setErrorMessage('')
    updatePendingMeetingActions((current) => ({
      ...current,
      [selectedTranscriptId]: {
        ...current[selectedTranscriptId],
        summaryRetryAt: Date.now(),
      },
    }))
    try {
      const retried = await api<TranscriptPublishResponse>(`/transcripts/${encodeURIComponent(selectedTranscriptId)}/retry-summary`, {
        method: 'POST',
      })
      if (retried.summaryGenerated) {
        setUploadMessage('요약을 다시 생성해 기존 Notion 회의록에 반영했습니다.')
      } else if (retried.summaryError) {
        setUploadMessage(`요약 재시도 후에도 생성되지 않았습니다: ${retried.summaryError}`)
      } else {
        setUploadMessage('요약 재시도를 완료했지만 새 요약이 생성되지는 않았습니다.')
      }
      if (retried.audioAttachmentError) {
        setUploadMessage((current) =>
          current
            ? `${current} 오디오 파일 첨부는 건너뛰었습니다: ${retried.audioAttachmentError}`
            : `요약 재시도는 완료되었지만 오디오 파일 첨부는 건너뛰었습니다: ${retried.audioAttachmentError}`,
        )
      }
      await loadTranscriptDetail(selectedTranscriptId)
      await loadTranscripts()
    } catch (error: unknown) {
      updatePendingMeetingActions((current) => {
        if (!current[selectedTranscriptId]?.summaryRetryAt) return current
        const next = { ...current }
        const pending = { ...(next[selectedTranscriptId] ?? {}) }
        delete pending.summaryRetryAt
        if (Object.keys(pending).length > 0) {
          next[selectedTranscriptId] = pending
        } else {
          delete next[selectedTranscriptId]
        }
        return next
      })
      const message = error instanceof Error ? error.message : '요약 재시도에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setRetryingSummary(false)
    }
  }

  const onRewriteTranscript = async () => {
    if (!selectedTranscriptId || !transcriptDetail) return
    if (!transcriptDetail.bodySynced) {
      setErrorMessage('먼저 Notion 반영을 완료한 뒤 전문 재기록을 실행해 주세요.')
      return
    }
    if (transcriptDetail.status !== 'completed') {
      setErrorMessage('전사가 completed 상태일 때만 전문 재기록이 가능합니다.')
      return
    }
    const confirmed = window.confirm('전문 섹션만 다시 기록합니다. 요약 API 비용은 발생하지 않습니다. 계속하시겠습니까?')
    if (!confirmed) return

    setRewritingTranscript(true)
    setErrorMessage('')
    updatePendingMeetingActions((current) => ({
      ...current,
      [selectedTranscriptId]: {
        ...current[selectedTranscriptId],
        transcriptRewriteAt: Date.now(),
      },
    }))
    try {
      await api<TranscriptPublishResponse>(`/transcripts/${encodeURIComponent(selectedTranscriptId)}/rewrite-transcript`, {
        method: 'POST',
      })
      setUploadMessage('전문 섹션만 다시 기록했습니다. 기존 요약은 유지됩니다.')
      await loadTranscriptDetail(selectedTranscriptId)
      await loadTranscripts()
    } catch (error: unknown) {
      updatePendingMeetingActions((current) => {
        if (!current[selectedTranscriptId]?.transcriptRewriteAt) return current
        const next = { ...current }
        const pending = { ...(next[selectedTranscriptId] ?? {}) }
        delete pending.transcriptRewriteAt
        if (Object.keys(pending).length > 0) {
          next[selectedTranscriptId] = pending
        } else {
          delete next[selectedTranscriptId]
        }
        return next
      })
      const message = error instanceof Error ? error.message : '전문 재기록에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setRewritingTranscript(false)
    }
  }

  const onRegeneratePage = async () => {
    if (!selectedTranscriptId || !transcriptDetail) return
    if (!transcriptDetail.bodySynced) {
      setErrorMessage('먼저 Notion 반영을 완료한 뒤 페이지 재생성을 실행해 주세요.')
      return
    }
    if (transcriptDetail.status !== 'completed') {
      setErrorMessage('전사가 completed 상태일 때만 페이지 재생성이 가능합니다.')
      return
    }
    const confirmed = window.confirm('새 Notion 페이지를 다시 생성하고 기존 페이지는 보관 처리합니다. 요약 API 비용이 발생할 수 있습니다. 계속하시겠습니까?')
    if (!confirmed) return

    setRegeneratingPage(true)
    setErrorMessage('')
    updatePendingMeetingActions((current) => ({
      ...current,
      [selectedTranscriptId]: {
        ...current[selectedTranscriptId],
        pageRegenerateAt: Date.now(),
      },
    }))
    try {
      const rebuilt = await api<TranscriptPublishResponse>(`/transcripts/${encodeURIComponent(selectedTranscriptId)}/regenerate-page`, {
        method: 'POST',
      })
      if (rebuilt.summaryGenerated) {
        setUploadMessage('새 Notion 페이지를 생성하고 기존 페이지를 보관 처리했습니다.')
      } else if (rebuilt.summaryError) {
        setUploadMessage(`페이지 재생성은 완료되었지만 요약은 다시 생성되지 않았습니다: ${rebuilt.summaryError}`)
      } else {
        setUploadMessage('새 Notion 페이지를 생성했습니다. (요약 미생성)')
      }
      if (rebuilt.audioAttachmentError) {
        setUploadMessage((current) =>
          current
            ? `${current} 오디오 파일 첨부는 건너뛰었습니다: ${rebuilt.audioAttachmentError}`
            : `페이지 재생성은 완료되었지만 오디오 파일 첨부는 건너뛰었습니다: ${rebuilt.audioAttachmentError}`,
        )
      }
      await loadTranscriptDetail(selectedTranscriptId)
      await loadTranscripts()
    } catch (error: unknown) {
      updatePendingMeetingActions((current) => {
        if (!current[selectedTranscriptId]?.pageRegenerateAt) return current
        const next = { ...current }
        const pending = { ...(next[selectedTranscriptId] ?? {}) }
        delete pending.pageRegenerateAt
        if (Object.keys(pending).length > 0) {
          next[selectedTranscriptId] = pending
        } else {
          delete next[selectedTranscriptId]
        }
        return next
      })
      const message = error instanceof Error ? error.message : '페이지 재생성에 실패했습니다.'
      setErrorMessage(message)
    } finally {
      setRegeneratingPage(false)
    }
  }


  const onDeleteTranscript = async () => {
    if (!selectedTranscriptId || !transcriptDetail) return
    const firstConfirmed = window.confirm('이 회의록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')
    if (!firstConfirmed) return
    const secondConfirmed = window.confirm('정말로 삭제합니다. Notion에서도 함께 삭제됩니다. 계속하시겠습니까?')
    if (!secondConfirmed) return

    setDeletingTranscriptId(selectedTranscriptId)
    setErrorMessage('')
    try {
      await api(`/transcripts/${encodeURIComponent(selectedTranscriptId)}`, {
        method: 'DELETE',
      })
      setUploadMessage('회의록을 삭제했습니다.')
      setTranscriptDetail(null)
      updatePendingMeetingActions((current) => {
        if (!current[selectedTranscriptId]) return current
        const next = { ...current }
        delete next[selectedTranscriptId]
        return next
      })
      await loadTranscripts()
      const remaining = transcripts.filter((row) => row.id !== selectedTranscriptId)
      setSelectedTranscriptId(remaining[0]?.id ?? '')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '회의록을 삭제하지 못했습니다.'
      setErrorMessage(message)
    } finally {
      setDeletingTranscriptId(null)
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
        <p className="meetingsUploadNamingRule muted small">네이밍 규칙: yymmdd_제목</p>
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
          {selectedTranscriptId && !loadingDetail && transcriptDetail ? (
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
          ) : null}
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
                {isSelectedTranscriptRetryPending || isSelectedTranscriptRewritePending || isSelectedTranscriptRegeneratePending ? (
                  <p className="muted small">
                    {isSelectedTranscriptRetryPending
                      ? '요약 재시도 진행 상태를 추적 중입니다.'
                      : isSelectedTranscriptRewritePending
                        ? '전문 재기록 진행 상태를 추적 중입니다.'
                        : '페이지 재생성 진행 상태를 추적 중입니다.'}{' '}
                    완료되면 상세 갱신 시 자동으로 해제됩니다.
                  </p>
                ) : null}
                <div className="meetingsActions">
                  <Button type="button" onClick={() => void onSaveSpeakerMap()} disabled={savingSpeakers || speakerLabels.length === 0}>
                    {savingSpeakers ? '저장 중...' : '매핑 저장'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onPublishToNotion()}
                    disabled={
                      publishingToNotion ||
                      retryingSummary ||
                      rewritingTranscript ||
                      regeneratingPage ||
                      isSelectedTranscriptRetryPending ||
                      isSelectedTranscriptRewritePending ||
                      isSelectedTranscriptRegeneratePending ||
                      savingSpeakers ||
                      transcriptDetail.bodySynced ||
                      transcriptDetail.status !== 'completed' ||
                      speakerLabels.length === 0
                    }
                  >
                    {publishingToNotion ? 'Notion 반영 중...' : transcriptDetail.bodySynced ? '이미 Notion 반영 완료' : '라벨 확정 후 Notion 반영'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (!transcriptDetail.meeting.notionPageUrl) return
                      window.open(transcriptDetail.meeting.notionPageUrl, '_blank', 'noopener,noreferrer')
                    }}
                    disabled={!transcriptDetail.meeting.notionPageUrl}
                  >
                    Notion에서 열기
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onDeleteTranscript()}
                    disabled={
                      deletingTranscriptId === selectedTranscriptId ||
                      publishingToNotion ||
                      retryingSummary ||
                      rewritingTranscript ||
                      regeneratingPage ||
                      savingSpeakers
                    }
                  >
                    {deletingTranscriptId === selectedTranscriptId ? '삭제 중...' : '회의록 삭제'}
                  </Button>
                </div>
                <section className="meetingsRepairPanel" aria-label="회의록 유지보수 작업">
                  <div className="meetingsRepairPanelHeader">
                    <strong>유지보수 작업</strong>
                    <p className="muted small">요약만 다시 만들거나, 전문만 다시 쓰거나, 둘 다 새 페이지로 재생성할 수 있습니다.</p>
                  </div>
                  <div className="meetingsRepairGrid">
                    <article className="meetingsRepairCard">
                      <strong>요약 재시도</strong>
                      <p className="muted small">요약 섹션만 다시 생성합니다. 전문은 유지됩니다.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void onRetrySummary()}
                        disabled={
                          retryingSummary ||
                          rewritingTranscript ||
                          regeneratingPage ||
                          publishingToNotion ||
                          savingSpeakers ||
                          isSelectedTranscriptRewritePending ||
                          isSelectedTranscriptRegeneratePending ||
                          !transcriptDetail.bodySynced ||
                          transcriptDetail.status !== 'completed'
                        }
                      >
                        {retryingSummary || isSelectedTranscriptRetryPending ? '요약 재시도 중...' : '요약 재시도'}
                      </Button>
                    </article>
                    <article className="meetingsRepairCard">
                      <strong>전문 재기록</strong>
                      <p className="muted small">전문 섹션만 다시 기록합니다. 요약 API 비용은 발생하지 않습니다.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void onRewriteTranscript()}
                        disabled={
                          rewritingTranscript ||
                          retryingSummary ||
                          regeneratingPage ||
                          publishingToNotion ||
                          savingSpeakers ||
                          isSelectedTranscriptRetryPending ||
                          isSelectedTranscriptRegeneratePending ||
                          !transcriptDetail.bodySynced ||
                          transcriptDetail.status !== 'completed'
                        }
                      >
                        {rewritingTranscript || isSelectedTranscriptRewritePending ? '전문 재기록 중...' : '전문 재기록'}
                      </Button>
                    </article>
                    <article className="meetingsRepairCard">
                      <strong>페이지 재생성</strong>
                      <p className="muted small">요약 재시도와 전문 재기록을 함께 적용한 새 Notion 페이지를 생성합니다.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void onRegeneratePage()}
                        disabled={
                          regeneratingPage ||
                          retryingSummary ||
                          rewritingTranscript ||
                          publishingToNotion ||
                          savingSpeakers ||
                          isSelectedTranscriptRetryPending ||
                          isSelectedTranscriptRewritePending ||
                          !transcriptDetail.bodySynced ||
                          transcriptDetail.status !== 'completed'
                        }
                      >
                        {regeneratingPage || isSelectedTranscriptRegeneratePending ? '페이지 재생성 중...' : '페이지 재생성'}
                      </Button>
                    </article>
                  </div>
                </section>
              </section>

              <section className="meetingsUtterances">
                <h4>Utterances</h4>
                {transcriptDetail.utterancesMapped.length === 0 ? <p className="muted">아직 전사 결과가 없습니다.</p> : null}
                {transcriptDetail.utterancesMapped.map((entry, index) => (
                  <article key={`${entry.speaker}-${index}`}>
                    <header>
                      <strong>{entry.displaySpeaker ?? entry.speaker}</strong>
                      <span className="muted small">
                        {formatTranscriptTimecode(entry.start)} ~ {formatTranscriptTimecode(entry.end)}
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

    </section>
  )
}
