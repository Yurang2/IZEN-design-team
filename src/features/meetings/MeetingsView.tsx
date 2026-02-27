import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button, TableWrap } from '../../shared/ui'

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
  key: string
  putUrl: string
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

const POLL_INTERVAL_MS = 4_000

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

function sanitizeSpeakerMap(values: Record<string, string>): Array<{ speakerLabel: string; displayName: string }> {
  return Object.entries(values)
    .map(([speakerLabel, displayName]) => ({
      speakerLabel: speakerLabel.trim(),
      displayName: displayName.trim(),
    }))
    .filter((entry) => entry.speakerLabel && entry.displayName)
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

  useEffect(() => {
    void loadKeywordSets()
    void loadTranscripts()
  }, [loadKeywordSets, loadTranscripts])

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

  const onSubmitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) {
      setErrorMessage('업로드할 음성 파일을 선택해 주세요.')
      return
    }
    if (maxSpeakers < minSpeakers) {
      setErrorMessage('최대 화자 수는 최소 화자 수 이상이어야 합니다.')
      return
    }

    setUploading(true)
    setUploadMessage('')
    setErrorMessage('')
    try {
      const presign = await api<UploadPresignResponse>('/uploads/presign', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'audio/m4a',
        }),
      })

      const putHeaders = new Headers(presign.requiredHeaders ?? {})
      if (!putHeaders.has('Content-Type')) {
        putHeaders.set('Content-Type', file.type || 'audio/m4a')
      }

      const uploadResponse = await fetch(presign.putUrl, {
        method: 'PUT',
        headers: putHeaders,
        credentials: 'include',
        body: file,
      })
      if (!uploadResponse.ok) {
        throw new Error(`오디오 업로드 실패: HTTP ${uploadResponse.status}`)
      }

      const created = await api<TranscriptCreateResponse>('/transcripts', {
        method: 'POST',
        body: JSON.stringify({
          key: presign.key,
          title: file.name,
          minSpeakers,
          maxSpeakers,
          keywordSetId: selectedKeywordSetId || null,
        }),
      })

      setUploadMessage(`전사 요청이 생성되었습니다. Transcript ID: ${created.transcriptId}`)
      setSelectedTranscriptId(created.transcriptId)
      setFile(null)
      await loadTranscripts()
      await loadTranscriptDetail(created.transcriptId)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '전사 요청 중 오류가 발생했습니다.'
      setErrorMessage(message)
    } finally {
      setUploading(false)
    }
  }

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
      await api(`/transcripts/${encodeURIComponent(selectedTranscriptId)}/publish`, {
        method: 'POST',
      })
      setUploadMessage('라벨링된 화자 발화를 Notion에 반영했습니다.')
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
    try {
      await api(`/keywords?id=${encodeURIComponent(keywordId)}`, { method: 'DELETE' })
      await loadKeywords(selectedKeywordSetId || undefined)
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드를 삭제하지 못했습니다.'
      setErrorMessage(message)
    }
  }

  const onEditKeyword = async (keyword: KeywordRow) => {
    const phrase = window.prompt('키워드 문구', keyword.phrase)
    if (phrase === null) return
    const weightRaw = window.prompt('가중치(선택)', keyword.weight == null ? '' : String(keyword.weight))
    if (weightRaw === null) return
    const tags = window.prompt('태그(선택)', keyword.tags ?? '')
    if (tags === null) return
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
    }
  }

  const onDeleteKeywordSet = async (id: string) => {
    try {
      await api(`/keyword-sets?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (selectedKeywordSetId === id) {
        setSelectedKeywordSetId('')
      }
      await loadKeywordSets()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '키워드 세트를 삭제하지 못했습니다.'
      setErrorMessage(message)
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
          </div>
        </form>
        {uploadMessage ? <p className="muted small">{uploadMessage}</p> : null}
        {errorMessage ? <p className="error">{errorMessage}</p> : null}
      </article>

      <div className="meetingsWorkbench">
        <article className="meetingsCard meetingsListCard">
          <div className="meetingsCardHeader">
            <h3>최근 전사</h3>
            <Button type="button" variant="secondary" size="mini" onClick={() => void loadTranscripts()} disabled={loadingTranscripts}>
              새로고침
            </Button>
          </div>
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
                <Button type="button" variant="secondary" size="mini" onClick={() => void onRenameKeywordSet(set)}>
                  편집
                </Button>
                <Button type="button" variant="secondary" size="mini" onClick={() => void onToggleKeywordSetActive(set)}>
                  {set.isActive ? 'Off' : 'On'}
                </Button>
                <Button type="button" variant="secondary" size="mini" onClick={() => void onDeleteKeywordSet(set.id)}>
                  Del
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
                <Button type="button" variant="secondary" size="mini" onClick={() => void onEditKeyword(keyword)}>
                  편집
                </Button>
                <Button type="button" variant="secondary" size="mini" onClick={() => void onDeleteKeyword(keyword.id)}>
                  Del
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

