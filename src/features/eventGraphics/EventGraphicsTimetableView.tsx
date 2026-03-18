import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { api } from '../../shared/api/client'
import type { ScheduleColumn, ScheduleFile, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { EventGraphicsPrintDocument, EventGraphicsShareDocument } from './EventGraphicsDocuments'
import {
  exhibitionPlaybookExampleRows,
  type ExhibitionPlaybookRow,
} from './exhibitionPlaybookExample'
import {
  EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY,
  readStoredPreviewRatio,
  type EventGraphicsPreviewRatio,
} from './EventGraphicsPreviewRatioControl'
import { EventGraphicsPreviewMedia, hasVisualPreviewUrl } from './EventGraphicsPreviewMedia'
import { PRINT_COPY } from './EventGraphicsPrintPage'
import { SHARE_COPY } from './EventGraphicsSharePage'
import { AssetUploadControl, toUploadStateKey, type AssetUploadField, type UploadState } from './EventGraphicsUploadControl'
import {
  buildEventGraphicsEventRows,
  buildEventGraphicsSessionGroups,
  type EventGraphicsSessionGroup,
} from './eventGraphicsHierarchy'
import type { EventGraphicsShareLocale, EventGroup } from './eventGraphicsShareData'
import { syncEventGraphicsTitleNumbers } from './eventGraphicsTitleNumbers'
import { VideoThumbnailTool } from './VideoThumbnailTool'

type EventGraphicsTimetableViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  onRefresh?: () => Promise<void>
}

type TimetableMode = 'event' | 'exhibition'
type LayoutMode = 'compact' | 'masterfile'

type EventGraphicsFileUploadResponse = {
  ok: boolean
  pageId: string
  field: AssetUploadField
  propertyName: string
  fileName: string
}

type EventGraphicsPresetResponse = {
  ok: boolean
  pageId: string
  field: AssetUploadField
  value: string
}

type EventGraphicsPresetValue = 'speaker_ppt' | 'dj_ambient' | 'video_embedded' | 'mic_only' | 'not_applicable' | null

type ExhibitionDisplayRow = ExhibitionPlaybookRow & {
  captureFiles?: ScheduleFile[]
  audioFiles?: ScheduleFile[]
}

const EXTERNAL_SHARE_PATH = '/share/timetable'

function buildColumnIndex(columns: ScheduleColumn[]): Record<string, number> {
  return columns.reduce<Record<string, number>>((accumulator, column, index) => {
    accumulator[column.name] = index
    return accumulator
  }, {})
}

function readCellText(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): string {
  const index = columnIndex[columnName]
  if (index == null) return ''
  return row.cells[index]?.text?.trim() ?? ''
}

function readCellHref(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): string | null {
  const index = columnIndex[columnName]
  if (index == null) return null
  return row.cells[index]?.href ?? null
}

function readCellFiles(row: ScheduleRow, columnIndex: Record<string, number>, columnName: string): ScheduleFile[] {
  const index = columnIndex[columnName]
  if (index == null) return []
  return row.cells[index]?.files ?? []
}

function readFirstCellText(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): string {
  for (const columnName of columnNames) {
    const value = readCellText(row, columnIndex, columnName)
    if (value) return value
  }
  return ''
}

function readFirstCellHref(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): string | null {
  for (const columnName of columnNames) {
    const value = readCellHref(row, columnIndex, columnName) || readCellText(row, columnIndex, columnName)
    if (value) return value
  }
  return null
}

function readFirstCellFiles(row: ScheduleRow, columnIndex: Record<string, number>, columnNames: string[]): ScheduleFile[] {
  for (const columnName of columnNames) {
    const value = readCellFiles(row, columnIndex, columnName)
    if (value.length > 0) return value
  }
  return []
}

function resolveColumnIndex(columnIndex: Record<string, number>, columnNames: string[]): number | null {
  for (const columnName of columnNames) {
    const index = columnIndex[columnName]
    if (index != null) return index
  }
  return null
}

function replaceRowCell(
  row: ScheduleRow,
  columns: ScheduleColumn[],
  columnIndex: Record<string, number>,
  columnNames: string[],
  updater: (current: ScheduleRow['cells'][number] | undefined, columnId: string) => ScheduleRow['cells'][number],
): ScheduleRow {
  const targetIndex = resolveColumnIndex(columnIndex, columnNames)
  if (targetIndex == null) return row

  const cells = [...row.cells]
  const columnId = columns[targetIndex]?.id ?? row.cells[targetIndex]?.columnId ?? ''
  cells[targetIndex] = updater(cells[targetIndex], columnId)
  return { ...row, cells }
}

function buildLocalScheduleFile(file: File, field: AssetUploadField): ScheduleFile {
  const kind = field === 'capture' ? 'image' : 'audio'
  return {
    name: file.name,
    url: URL.createObjectURL(file),
    kind,
  }
}

function updateRowFilesLocally(
  row: ScheduleRow,
  columns: ScheduleColumn[],
  columnIndex: Record<string, number>,
  field: AssetUploadField,
  file: File,
): ScheduleRow {
  const fileEntry = buildLocalScheduleFile(file, field)
  const fileColumnNames = field === 'capture' ? ['캡쳐', '캡쳐(무조건 이미지형식)'] : ['오디오파일']
  const presetColumnNames = field === 'capture' ? ['메인 화면', '그래픽 자산명', 'Main Screen'] : ['오디오', '원본 Audio']

  let nextRow = replaceRowCell(row, columns, columnIndex, fileColumnNames, (current, columnId) => ({
    columnId,
    type: current?.type ?? 'files',
    text: file.name,
    href: current?.href ?? null,
    files: [fileEntry],
  }))

  nextRow = replaceRowCell(nextRow, columns, columnIndex, presetColumnNames, (current, columnId) => {
    const currentText = current?.text?.trim() ?? ''
    const shouldClearPreset =
      currentText === '강연자 PPT' ||
      currentText === 'Speaker PPT' ||
      currentText === 'DJ Ambient Music' ||
      currentText === '비디오에 포함' ||
      currentText === 'Included in Video' ||
      currentText === 'Mic Only' ||
      currentText === '해당없음' ||
      currentText === 'N/A'

    if (!shouldClearPreset) return current ?? { columnId, type: 'text', text: '', href: null }
    return {
      columnId,
      type: current?.type ?? 'text',
      text: '',
      href: current?.href ?? null,
      files: current?.files,
    }
  })

  return nextRow
}

function updateRowPresetLocally(
  row: ScheduleRow,
  columns: ScheduleColumn[],
  columnIndex: Record<string, number>,
  field: AssetUploadField,
  preset: EventGraphicsPresetValue,
): ScheduleRow {
  const presetText =
    preset === 'speaker_ppt'
      ? 'Speaker PPT'
      : preset === 'dj_ambient'
        ? 'DJ Ambient Music'
        : preset === 'video_embedded'
          ? 'Included in Video'
          : preset === 'mic_only'
            ? 'Mic Only'
          : preset === 'not_applicable'
            ? 'N/A'
            : ''
  const presetColumnNames = field === 'capture' ? ['메인 화면', '그래픽 자산명', 'Main Screen'] : ['오디오', '원본 Audio']

  return replaceRowCell(row, columns, columnIndex, presetColumnNames, (current, columnId) => ({
    columnId,
    type: current?.type ?? 'text',
    text: presetText,
    href: current?.href ?? null,
    files: current?.files,
  }))
}

function joinScheduleFileNames(files: ReadonlyArray<ScheduleFile>): string {
  return files.map((file) => file.name).join(' / ')
}

function normalizeTimetableMode(value: string): TimetableMode | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (['전체행사', '행사', 'event', 'seminar', 'hotel'].includes(normalized)) return 'event'
  if (['전시', 'exhibition', 'expo', 'booth'].includes(normalized)) return 'exhibition'
  return null
}

function toExhibitionRowModel(row: ScheduleRow, columnIndex: Record<string, number>): ExhibitionDisplayRow | null {
  const timetableMode = normalizeTimetableMode(readFirstCellText(row, columnIndex, ['타임테이블 유형', '운영 형식', 'Mode']))
  if (timetableMode !== 'exhibition') return null

  const orderText = readFirstCellText(row, columnIndex, ['정렬 순서', '운영 순서', 'Cue 순서', 'No'])
  const order = Number(orderText)
  const captureFiles = readFirstCellFiles(row, columnIndex, ['캡쳐', '캡쳐(무조건 이미지형식)'])
  const audioFiles = readFirstCellFiles(row, columnIndex, ['오디오파일'])
  const captureLabel = joinScheduleFileNames(captureFiles)
  const audioLabel = joinScheduleFileNames(audioFiles)
  const previewHref = captureFiles[0]?.url || readFirstCellHref(row, columnIndex, ['미리보기 링크'])

  return {
    id: row.id,
    order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
    numberLabel: Number.isFinite(order) ? String(order).padStart(2, '0') : '--',
    category: readFirstCellText(row, columnIndex, ['카테고리', 'Cue 제목']) || '-',
    trigger: readFirstCellText(row, columnIndex, ['트리거 상황', 'Trigger', '행 제목']) || '-',
    timeReference: readFirstCellText(row, columnIndex, ['시간 기준', 'Time']) || '-',
    mainScreen: captureLabel || readFirstCellText(row, columnIndex, ['메인 화면', 'Main Screen', '그래픽 자산명']) || '-',
    audio: audioLabel || readFirstCellText(row, columnIndex, ['오디오', '원본 Audio']) || '-',
    action: readFirstCellText(row, columnIndex, ['운영 액션', 'Action']) || 'Play',
    note: readFirstCellText(row, columnIndex, ['운영 메모', '업체 전달 메모', '원본 비고']) || '메모 없음',
    status: readFirstCellText(row, columnIndex, ['상태']) || 'planned',
    previewHref,
    assetHref: readFirstCellHref(row, columnIndex, ['자산 링크']) || captureFiles[0]?.url || null,
    captureFiles,
    audioFiles,
    source: 'db',
  }
}

function matchesExhibitionQuery(row: ExhibitionDisplayRow, query: string): boolean {
  if (!query) return true
  return [row.category, row.trigger, row.timeReference, row.mainScreen, row.audio, row.action, row.note, row.status]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function matchesEventGroup(group: EventGraphicsSessionGroup, query: string): boolean {
  if (!query) return true
  return [
    group.cueNumber,
    group.title,
    group.cueType,
    group.eventName,
    ...group.stages.flatMap((stage) => [stage.cueNumber, stage.label, stage.title, stage.graphicLabel, stage.audioLabel, stage.note]),
  ]
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function groupEventCues(groups: EventGraphicsSessionGroup[], untitledEvent: string): EventGroup[] {
  const grouped = new Map<string, EventGraphicsSessionGroup[]>()
  for (const group of groups) {
    const eventName = group.eventName.trim() || untitledEvent
    const current = grouped.get(eventName)
    if (current) current.push(group)
    else grouped.set(eventName, [group])
  }
  return Array.from(grouped.entries()).map(([eventName, cues]) => ({ eventName, cues }))
}

function ExhibitionPlaybookLayout({
  rows,
  isSample,
  uploadStateByKey,
  onUploadFile,
}: {
  rows: ExhibitionDisplayRow[]
  isSample: boolean
  uploadStateByKey: Record<string, UploadState>
  onUploadFile: (rowId: string, field: AssetUploadField, file: File) => Promise<void>
}) {
  return (
    <div className="eventGraphicsExhibitionShell">
      {isSample ? (
        <article className="eventGraphicsExhibitionNotice">
          <strong>AEEDC 2026 example</strong>
          <p>전시 운영 row가 아직 DB에 없어서 예시 화면을 먼저 보여주고 있습니다.</p>
        </article>
      ) : null}

      <div className="eventGraphicsExhibitionList">
        {rows.map((row) => {
          const hasPreview = hasVisualPreviewUrl(row.previewHref)
          return (
            <article key={row.id} className="eventGraphicsExhibitionCard">
              <div className="eventGraphicsExhibitionHead">
                <div>
                  <div className="eventGraphicsCueHead">
                    <span className="eventGraphicsOrder">EX-{row.numberLabel}</span>
                    <span className="eventGraphicsCueType cue-exhibition">{row.category}</span>
                  </div>
                  <h3>{row.trigger}</h3>
                  <p>{row.timeReference}</p>
                </div>
                <span className="eventGraphicsStatus">{row.status}</span>
              </div>

              <div className="eventGraphicsExhibitionGrid">
                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Main Screen</span>
                  <strong>{row.mainScreen}</strong>
                  {hasPreview ? (
                    <EventGraphicsPreviewMedia
                      src={row.previewHref ?? ''}
                      alt={`${row.category} preview`}
                      className="eventGraphicsPreviewInline"
                      noPreviewText="등록된 미리보기가 없습니다."
                    />
                  ) : (
                    <div className="eventGraphicsPreviewPlaceholder">등록된 미리보기가 없습니다.</div>
                  )}
                  {row.source === 'db' ? (
                    <AssetUploadControl
                      rowId={row.id}
                      field="capture"
                      accept="image/*"
                      uploadState={uploadStateByKey[toUploadStateKey(row.id, 'capture')]}
                      onUploadFile={onUploadFile}
                    />
                  ) : null}
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Audio</span>
                  <strong>{row.audio}</strong>
                  {row.source === 'db' ? (
                    <AssetUploadControl
                      rowId={row.id}
                      field="audio"
                      accept="audio/*"
                      uploadState={uploadStateByKey[toUploadStateKey(row.id, 'audio')]}
                      onUploadFile={onUploadFile}
                    />
                  ) : null}
                  <span className="eventGraphicsPanelLabel">Action</span>
                  <strong>{row.action}</strong>
                </section>

                <section className="eventGraphicsCueSheetPanel">
                  <span className="eventGraphicsPanelLabel">Operator Note</span>
                  <p>{row.note}</p>
                  {row.assetHref ? (
                    <a className="eventGraphicsInlineLink" href={row.assetHref} target="_blank" rel="noreferrer">
                      자산 링크 열기
                    </a>
                  ) : null}
                </section>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

export function EventGraphicsTimetableView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsTimetableViewProps) {
  const [timetableMode, setTimetableMode] = useState<TimetableMode>('event')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('compact')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [shareLocale, setShareLocale] = useState<EventGraphicsShareLocale>('ko')
  const [previewRatio, setPreviewRatio] = useState<EventGraphicsPreviewRatio>(() => readStoredPreviewRatio())
  const [localRows, setLocalRows] = useState<ScheduleRow[]>(rows)
  const [uploadStateByKey, setUploadStateByKey] = useState<Record<string, UploadState>>({})
  const [presetStateByKey, setPresetStateByKey] = useState<Record<string, UploadState>>({})

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY, JSON.stringify(previewRatio))
  }, [previewRatio])

  useEffect(() => {
    setLocalRows(rows)
  }, [rows])

  const normalizedQuery = query.trim().toLowerCase()
  const columnIndex = useMemo(() => buildColumnIndex(columns), [columns])
  const eventRows = useMemo(() => syncEventGraphicsTitleNumbers(buildEventGraphicsEventRows(columns, localRows)), [columns, localRows])
  const eventGroups = useMemo(() => buildEventGraphicsSessionGroups(eventRows), [eventRows])
  const eventStatusOptions = useMemo(() => [] as string[], [])
  const filteredEventGroups = useMemo(
    () => eventGroups.filter((group) => matchesEventGroup(group, normalizedQuery)),
    [eventGroups, normalizedQuery],
  )
  const untitledEvent = shareLocale === 'en' ? 'Untitled event' : '행사명 미정'
  const groupedEventCues = useMemo(() => groupEventCues(filteredEventGroups, untitledEvent), [filteredEventGroups, untitledEvent])

  const exhibitionRowsFromDb = useMemo(
    () =>
      localRows
        .map((row) => toExhibitionRowModel(row, columnIndex))
        .filter((row): row is ExhibitionDisplayRow => row != null)
        .sort((left, right) => left.order - right.order),
    [columnIndex, localRows],
  )
  const exhibitionRows = useMemo(
    () => (exhibitionRowsFromDb.length > 0 ? exhibitionRowsFromDb : exhibitionPlaybookExampleRows),
    [exhibitionRowsFromDb],
  )
  const exhibitionUsesSample = exhibitionRowsFromDb.length === 0
  const exhibitionStatusOptions = useMemo(
    () => Array.from(new Set(exhibitionRows.map((row) => row.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [exhibitionRows],
  )
  const filteredExhibitionRows = useMemo(
    () =>
      exhibitionRows.filter((row) => {
        if (statusFilter && row.status !== statusFilter) return false
        return matchesExhibitionQuery(row, normalizedQuery)
      }),
    [exhibitionRows, normalizedQuery, statusFilter],
  )

  const sessionCount = useMemo(() => eventGroups.length, [eventGroups])
  const stageCount = useMemo(() => eventGroups.reduce((sum, group) => sum + group.stages.length, 0), [eventGroups])
  const entranceCount = useMemo(
    () => eventGroups.reduce((sum, group) => sum + group.stages.filter((stage) => stage.stageKind === 'appearance').length, 0),
    [eventGroups],
  )
  const lectureSessionCount = useMemo(
    () => eventGroups.filter((group) => group.cueType === 'introduce' || group.cueType === 'lecture').length,
    [eventGroups],
  )
  const loopCount = useMemo(() => exhibitionRows.filter((row) => /loop/i.test(row.action)).length, [exhibitionRows])
  const seminarTransitionCount = useMemo(
    () => exhibitionRows.filter((row) => /seminar/i.test(row.category) || /발표|연자|seminar/i.test(row.trigger)).length,
    [exhibitionRows],
  )
  const liveSwitchCount = useMemo(() => exhibitionRows.filter((row) => /hold|switch/i.test(row.action)).length, [exhibitionRows])

  const isEventMode = timetableMode === 'event'
  const isVisualMode = isEventMode && layoutMode === 'masterfile'
  const visibleCount = isEventMode ? filteredEventGroups.length : filteredExhibitionRows.length
  const statusOptions = isEventMode ? eventStatusOptions : exhibitionStatusOptions
  const effectiveTitle = databaseTitle.trim() || '행사 그래픽 타임테이블'
  const printCopy = PRINT_COPY[shareLocale]
  const shareCopy = SHARE_COPY[shareLocale]
  const printHref = `${EXTERNAL_SHARE_PATH}/print?locale=${encodeURIComponent(shareLocale)}&orientation=portrait`
  const shareHref = `${EXTERNAL_SHARE_PATH}?locale=${encodeURIComponent(shareLocale)}`

  const onUploadFile = async (rowId: string, field: AssetUploadField, file: File) => {
    const stateKey = toUploadStateKey(rowId, field)
    setUploadStateByKey((current) => ({
      ...current,
      [stateKey]: {
        status: 'uploading',
        message: field === 'capture' ? '캡쳐 업로드 중...' : '오디오 업로드 중...',
      },
    }))

    try {
      const formData = new FormData()
      formData.append('field', field)
      formData.append('file', file)
      await api<EventGraphicsFileUploadResponse>(`/event-graphics-timetable/${encodeURIComponent(rowId)}/files`, {
        method: 'POST',
        body: formData,
      })
      setLocalRows((current) =>
        current.map((row) => (row.id === rowId ? updateRowFilesLocally(row, columns, columnIndex, field, file) : row)),
      )
      setUploadStateByKey((current) => ({
        ...current,
        [stateKey]: {
          status: 'success',
          message: `${file.name} 업로드 완료`,
        },
      }))
    } catch (uploadError: unknown) {
      const message = uploadError instanceof Error ? uploadError.message : '업로드에 실패했습니다.'
      setUploadStateByKey((current) => ({
        ...current,
        [stateKey]: {
          status: 'error',
          message,
        },
      }))
    }
  }

  const onSetPreset = async (rowId: string, field: AssetUploadField, preset: EventGraphicsPresetValue) => {
    const stateKey = toUploadStateKey(rowId, field)
    setPresetStateByKey((current) => ({
      ...current,
      [stateKey]: {
        status: 'uploading',
        message: preset ? '설정 저장 중...' : '설정 해제 중...',
      },
    }))

    try {
      await api<EventGraphicsPresetResponse>(`/event-graphics-timetable/${encodeURIComponent(rowId)}/preset`, {
        method: 'POST',
        body: JSON.stringify({ field, preset }),
      })
      setLocalRows((current) =>
        current.map((row) => (row.id === rowId ? updateRowPresetLocally(row, columns, columnIndex, field, preset) : row)),
      )
      setPresetStateByKey((current) => ({
        ...current,
        [stateKey]: {
          status: 'success',
          message: preset ? '설정 저장 완료' : '설정 해제 완료',
        },
      }))
    } catch (presetError: unknown) {
      const message = presetError instanceof Error ? presetError.message : '설정 저장에 실패했습니다.'
      setPresetStateByKey((current) => ({
        ...current,
        [stateKey]: {
          status: 'error',
          message,
        },
      }))
    }
  }

  if (loading) {
    return (
      <section className="eventGraphicsView">
        <div className="eventGraphicsHero">
          <div className="eventGraphicsHeroText">
            <p className="muted small">Event Graphics Timetable</p>
            <h2>타임테이블을 불러오는 중...</h2>
          </div>
        </div>
      </section>
    )
  }

  if (error) {
    return <EmptyState title="타임테이블을 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
  }

  if (!configured) {
    return (
      <EmptyState
        title="타임테이블 DB가 연결되지 않았습니다."
        message="Worker 환경변수와 Notion 공유 설정을 먼저 확인해 주세요."
        className="scheduleEmptyState"
      />
    )
  }

  return (
    <section className="eventGraphicsView">
      <div className="eventGraphicsHero">
        <div className="eventGraphicsHeroText">
          <p className="muted small">Event Graphics Timetable</p>
          <h2>{effectiveTitle}</h2>
          <p>{isEventMode ? '내부 시간표와 외부 공유 화면이 같은 DB 파일명을 기준으로 움직이도록 정리합니다.' : '전시 운영 row는 그래픽과 오디오 업로드를 바로 DB에 반영합니다.'}</p>
        </div>
        <div className="eventGraphicsHeroActions">
          <a className="linkButton" href={isVisualMode ? shareHref : printHref} target="_blank" rel="noreferrer">
            {isVisualMode ? 'External Visual View' : 'External Print View'}
          </a>
          {databaseUrl ? (
            <a className="linkButton secondary" href={databaseUrl} target="_blank" rel="noreferrer">
              Notion DB 열기
            </a>
          ) : null}
        </div>
      </div>

      <div className="eventGraphicsModeSwitch" role="group" aria-label="타임테이블 운영 모드">
        <button
          type="button"
          className={timetableMode === 'event' ? 'viewTab active' : 'viewTab'}
          aria-pressed={timetableMode === 'event'}
          onClick={() => {
            setTimetableMode('event')
            setStatusFilter('')
          }}
        >
          전체행사
        </button>
        <button
          type="button"
          className={timetableMode === 'exhibition' ? 'viewTab active' : 'viewTab'}
          aria-pressed={timetableMode === 'exhibition'}
          onClick={() => {
            setTimetableMode('exhibition')
            setStatusFilter('')
          }}
        >
          전시
        </button>
      </div>

      {isEventMode ? (
        <div className="eventGraphicsSummary" aria-label="행사 그래픽 요약">
          <article>
            <span>전체 Cue</span>
            <strong>{sessionCount}</strong>
          </article>
          <article>
            <span>입장 Cue</span>
            <strong>{entranceCount}</strong>
          </article>
          <article>
            <span>연결 Stage</span>
            <strong>{stageCount}</strong>
          </article>
          <article>
            <span>강연 세션</span>
            <strong>{lectureSessionCount}</strong>
          </article>
        </div>
      ) : (
        <div className="eventGraphicsSummary" aria-label="전시 운영 요약">
          <article>
            <span>상황 수</span>
            <strong>{exhibitionRows.length}</strong>
          </article>
          <article>
            <span>루프 운영</span>
            <strong>{loopCount}</strong>
          </article>
          <article>
            <span>세미나 전환</span>
            <strong>{seminarTransitionCount}</strong>
          </article>
          <article>
            <span>실시간 전환</span>
            <strong>{liveSwitchCount}</strong>
          </article>
        </div>
      )}

      <div className="eventGraphicsToolbar">
        <input
          type="search"
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          placeholder={isEventMode ? 'Cue 제목, 그래픽, 오디오, 메모 검색' : '카테고리, 트리거, 메인 화면, 오디오, 액션 검색'}
          aria-label="타임테이블 검색"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="상태 필터">
          <option value="">모든 상태</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {isEventMode ? (
        <div className="eventGraphicsLayoutSwitch" role="group" aria-label="타임테이블 보기 형태">
          <button
            type="button"
            className={layoutMode === 'compact' ? 'viewTab active' : 'viewTab'}
            aria-pressed={layoutMode === 'compact'}
            onClick={() => setLayoutMode('compact')}
          >
            시간표
          </button>
          <button
            type="button"
            className={layoutMode === 'masterfile' ? 'viewTab active' : 'viewTab'}
            aria-pressed={layoutMode === 'masterfile'}
            onClick={() => setLayoutMode('masterfile')}
          >
            시각화
          </button>
        </div>
      ) : null}

      {visibleCount === 0 ? (
        <EmptyState
          title={isEventMode ? '표시할 cue가 없습니다.' : '표시할 전시 운영 row가 없습니다.'}
          message={
            normalizedQuery || statusFilter
              ? isEventMode
                ? '현재 필터 조건과 일치하는 cue가 없습니다.'
                : '현재 필터 조건과 일치하는 전시 row가 없습니다.'
              : isEventMode
                ? 'DB에 아직 cue row가 없습니다.'
                : '전시 운영 row가 없으면 예시 화면만 표시됩니다.'
          }
          className="scheduleEmptyState"
        />
      ) : isEventMode && layoutMode === 'compact' ? (
        <EventGraphicsPrintDocument
          embedded
          showNotes={false}
          locale={shareLocale}
          onLocaleChange={setShareLocale}
          copy={{
            title: printCopy.title,
            print: printCopy.print,
            backLabel: printCopy.backToShare,
            cue: printCopy.cue,
            time: printCopy.time,
            stage: printCopy.stage,
            titleColumn: printCopy.titleColumn,
            graphic: printCopy.graphic,
            audio: printCopy.audio,
            note: printCopy.note,
            noNote: printCopy.noNote,
            noAsset: printCopy.noAsset,
          }}
          pageTitle={effectiveTitle}
          groupedCues={groupedEventCues}
          shareHref={shareHref}
        />
      ) : isEventMode ? (
        <EventGraphicsShareDocument
          embedded
          locale={shareLocale}
          onLocaleChange={setShareLocale}
          copy={{
            externalShare: shareCopy.externalShare,
            printView: shareCopy.printView,
            image: shareCopy.image,
            noPreview: shareCopy.noPreview,
            openFile: shareCopy.openFile,
            noSpecialNote: shareCopy.noSpecialNote,
            graphic: shareCopy.graphic,
            audio: shareCopy.audio,
            uploadRequired: shareCopy.uploadRequired ?? '업로드 필요',
          }}
          pageTitle={effectiveTitle}
          groupedCues={groupedEventCues}
          previewRatio={previewRatio}
          onPreviewRatioChange={setPreviewRatio}
          printHref={printHref}
          uploadStateByKey={uploadStateByKey}
          onUploadFile={onUploadFile}
          presetStateByKey={presetStateByKey}
          onSetPreset={onSetPreset}
        />
      ) : (
        <ExhibitionPlaybookLayout
          rows={filteredExhibitionRows}
          isSample={exhibitionUsesSample}
          uploadStateByKey={uploadStateByKey}
          onUploadFile={onUploadFile}
        />
      )}

      <VideoThumbnailTool suggestedTitle={effectiveTitle} />
    </section>
  )
}
