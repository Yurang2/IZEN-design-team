import { useEffect, useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import {
  EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY,
  EventGraphicsPreviewRatioControl,
  readStoredPreviewRatio,
  toPreviewAspectRatioValue,
  type EventGraphicsPreviewRatio,
} from './EventGraphicsPreviewRatioControl'
import { EventGraphicsPreviewMedia, hasVisualPreviewUrl } from './EventGraphicsPreviewMedia'
import { usesSpeakerPptPlaceholder } from './eventGraphicsHierarchy'
import {
  buildEventGraphicsShareData,
  buildEventGraphicsSharePageTitle,
  eventGraphicsManifestByCueNumber,
  toCueTypeLabel,
  type EventGraphicsShareLocale,
} from './eventGraphicsShareData'

type EventGraphicsSharePageProps = {
  configured: boolean
  databaseTitle: string
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

type AssetEntry = {
  name: string
  role: string
}

type CopySet = {
  externalShare: string
  loading: string
  loadErrorTitle: string
  notConnectedTitle: string
  notConnectedMessage: string
  emptyTitle: string
  emptyMessage: string
  printView: string
  image: string
  noPreview: string
  openFile: string
  noSpecialNote: string
  graphic: string
  audio: string
  untitledEvent: string
}

const COPY: Record<EventGraphicsShareLocale, CopySet> = {
  en: {
    externalShare: 'External Share',
    loading: 'Loading playback cues...',
    loadErrorTitle: 'Unable to load playback cues.',
    notConnectedTitle: 'The timetable database is not connected.',
    notConnectedMessage: 'The external share page could not read timetable data yet.',
    emptyTitle: 'No playback cues to display.',
    emptyMessage: 'There are no cues ready for the external playback view.',
    printView: 'Print View',
    image: 'Image',
    noPreview: 'No preview image available.',
    openFile: 'Open file',
    noSpecialNote: 'No special note',
    graphic: 'Graphic',
    audio: 'Audio',
    untitledEvent: 'Untitled event',
  },
  ko: {
    externalShare: '외부 공유',
    loading: '운영 큐를 불러오는 중...',
    loadErrorTitle: '운영 큐를 불러오지 못했습니다.',
    notConnectedTitle: '타임테이블 DB가 연결되지 않았습니다.',
    notConnectedMessage: '외부 공유 페이지에서 타임테이블 데이터를 아직 읽어오지 못했습니다.',
    emptyTitle: '표시할 운영 큐가 없습니다.',
    emptyMessage: '외부 공유용으로 정리된 큐가 없습니다.',
    printView: '인쇄 전용 보기',
    image: '이미지',
    noPreview: '등록된 이미지가 없습니다.',
    openFile: '파일 열기',
    noSpecialNote: '특이사항 없음',
    graphic: '그래픽',
    audio: '오디오',
    untitledEvent: '행사명 미정',
  },
}

function ShareAssetPanel({
  title,
  files,
  missingFiles,
  href,
  copy,
}: {
  title: string
  files: AssetEntry[]
  missingFiles: string[]
  href: string | null
  copy: CopySet
}) {
  const hasMissingFiles = missingFiles.length > 0
  return (
    <section className={hasMissingFiles ? 'eventGraphicsAuditPanel is-missing' : 'eventGraphicsAuditPanel'}>
      <div className="eventGraphicsAuditPanelHead">
        <span className="eventGraphicsPanelLabel">{title}</span>
        {hasMissingFiles ? <span className="eventGraphicsAuditMissingFlag">missing</span> : null}
      </div>

      {files.length > 0 ? (
        <div className="eventGraphicsAuditChipList">
          {files.map((file) => (
            <span key={`${title}-${file.name}`} className="eventGraphicsAuditChip" title={file.role}>
              {file.name}
            </span>
          ))}
        </div>
      ) : (
        <span className="eventGraphicsSubline">-</span>
      )}

      {hasMissingFiles ? (
        <div className="eventGraphicsAuditMissing is-inline">
          <span className="eventGraphicsAuditMiniLabel">추가 필요</span>
          <div className="eventGraphicsAuditChipList is-missing">
            {missingFiles.map((file) => (
              <span key={`${title}-${file}`} className="eventGraphicsAuditChip is-missing">
                {file}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {href ? (
        <a className="eventGraphicsInlineLink" href={href} target="_blank" rel="noreferrer">
          {copy.openFile}
        </a>
      ) : null}
    </section>
  )
}

export function EventGraphicsSharePage({
  configured,
  databaseTitle,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsSharePageProps) {
  const [locale, setLocale] = useState<EventGraphicsShareLocale>('en')
  const [previewRatio, setPreviewRatio] = useState<EventGraphicsPreviewRatio>(() => readStoredPreviewRatio())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY, JSON.stringify(previewRatio))
  }, [previewRatio])

  const copy = COPY[locale]
  const { groupedCues } = useMemo(() => buildEventGraphicsShareData(columns, rows, copy.untitledEvent), [columns, copy.untitledEvent, rows])
  const pageTitle = useMemo(() => buildEventGraphicsSharePageTitle(groupedCues, databaseTitle), [databaseTitle, groupedCues])
  const printHref = `/share/timetable/print?locale=${encodeURIComponent(locale)}`
  const previewRatioStyle = useMemo(
    () => ({ ['--event-graphics-preview-ratio' as string]: toPreviewAspectRatioValue(previewRatio) }),
    [previewRatio],
  )

  if (loading) {
    return (
      <main className="eventGraphicsShareShell" style={previewRatioStyle}>
        <section className="eventGraphicsSharePage">
          <header className="eventGraphicsShareHero">
            <div className="eventGraphicsShareHeroTop">
              <p className="muted small">{copy.externalShare}</p>
            </div>
            <h1>{copy.loading}</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsShareShell" style={previewRatioStyle}>
        <EmptyState title={copy.loadErrorTitle} message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsShareShell" style={previewRatioStyle}>
        <EmptyState title={copy.notConnectedTitle} message={copy.notConnectedMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  if (groupedCues.length === 0) {
    return (
      <main className="eventGraphicsShareShell" style={previewRatioStyle}>
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  return (
    <main className="eventGraphicsShareShell" style={previewRatioStyle}>
      <section className="eventGraphicsSharePage">
        <header className="eventGraphicsShareHero">
          <div className="eventGraphicsShareHeroTop">
            <div className="eventGraphicsShareHeroText">
              <p className="muted small">{copy.externalShare}</p>
              <h1>{pageTitle}</h1>
            </div>
            <div className="eventGraphicsShareActions">
              <a className="linkButton secondary" href={printHref} target="_blank" rel="noreferrer">
                {copy.printView}
              </a>
              <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
                <button
                  type="button"
                  className={locale === 'en' ? 'viewTab active' : 'viewTab'}
                  aria-pressed={locale === 'en'}
                  onClick={() => setLocale('en')}
                >
                  EN
                </button>
                <button
                  type="button"
                  className={locale === 'ko' ? 'viewTab active' : 'viewTab'}
                  aria-pressed={locale === 'ko'}
                  onClick={() => setLocale('ko')}
                >
                  KO
                </button>
              </div>
            </div>
          </div>
          <EventGraphicsPreviewRatioControl value={previewRatio} onChange={setPreviewRatio} />
        </header>

        <div className="eventGraphicsShareList">
          {groupedCues.map((group) => (
            <section key={group.eventName} className="eventGraphicsShareGroup">
              <header className="eventGraphicsShareGroupHead">
                <h2>{group.eventName}</h2>
              </header>

              <div className="eventGraphicsShareGroupList">
                {group.cues.map((cue) => {
                  const cueTypeLabel = toCueTypeLabel(cue.cueType, locale)
                  return (
                    <article key={cue.id} className="eventGraphicsShareRow">
                      <div className="eventGraphicsShareTime">
                        <strong>{cue.startTime}</strong>
                        <span>{cue.endTime}</span>
                        <small>{cue.runtimeLabel}</small>
                      </div>

                      <div className="eventGraphicsShareBody">
                        <div className="eventGraphicsShareHead">
                          <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                          <span className="eventGraphicsShareSection">{cueTypeLabel}</span>
                          <h3>{cue.title}</h3>
                        </div>

                        <div className="eventGraphicsShareStageList">
                          {cue.stages.map((stage) => {
                            const manifestCue = stage.manifestCueNumber
                              ? eventGraphicsManifestByCueNumber.get(stage.manifestCueNumber) ?? null
                              : null
                            const graphicFiles =
                              manifestCue != null
                                ? (manifestCue.registeredFiles as ReadonlyArray<{ name: string; kind: string; role: string }>)
                                    .filter((file) => file.kind === 'image' || file.kind === 'video')
                                    .map((file) => ({ name: file.name, role: file.role }))
                                : stage.graphicLabel && stage.graphicLabel !== '-'
                                  ? [{ name: stage.graphicLabel, role: stage.label }]
                                  : []
                            const audioFiles =
                              manifestCue != null
                                ? (manifestCue.registeredFiles as ReadonlyArray<{ name: string; kind: string; role: string }>)
                                    .filter((file) => file.kind === 'audio')
                                    .map((file) => ({ name: file.name, role: file.role }))
                                : stage.audioLabel && stage.audioLabel !== '-'
                                  ? [{ name: stage.audioLabel, role: stage.label }]
                                  : []
                            const missingGraphicFiles =
                              manifestCue != null
                                ? ((manifestCue.missingFiles as ReadonlyArray<{ kind: string; label: string; sourceName: string }>) ?? [])
                                    .filter((file) => file.kind !== 'audio')
                                    .map((file) => file.sourceName || file.label)
                                : []
                            const missingAudioFiles =
                              manifestCue != null
                                ? ((manifestCue.missingFiles as ReadonlyArray<{ kind: string; label: string; sourceName: string }>) ?? [])
                                    .filter((file) => file.kind === 'audio')
                                    .map((file) => file.sourceName || file.label)
                                : []
                            const previewHref = stage.previewHref || manifestCue?.previewUrl || null
                            const hasPreview = hasVisualPreviewUrl(previewHref)
                            const showSpeakerPpt = usesSpeakerPptPlaceholder(stage.cueType, stage.stageKind)

                            return (
                              <section key={stage.id} className="eventGraphicsShareStage">
                                <div className="eventGraphicsShareStageHead">
                                  <div className="eventGraphicsCueHead">
                                    <span className="eventGraphicsEntranceFlag">{stage.label}</span>
                                    <span className="eventGraphicsOrder">{stage.cueNumber}</span>
                                  </div>
                                  <p>{stage.note || copy.noSpecialNote}</p>
                                </div>

                                <div className="eventGraphicsShareAssetGrid">
                                  <section className="eventGraphicsAuditVisual">
                                    <span className="eventGraphicsPanelLabel">{copy.image}</span>
                                    <strong>{showSpeakerPpt ? '강연자PPT' : stage.title}</strong>
                                    {showSpeakerPpt ? (
                                      <div className="eventGraphicsPreviewInline">
                                        <div className="eventGraphicsSpeakerPptPlaceholder">강연자PPT</div>
                                      </div>
                                    ) : hasPreview ? (
                                      <EventGraphicsPreviewMedia
                                        src={previewHref ?? ''}
                                        alt={`${stage.title} preview`}
                                        className="eventGraphicsPreviewInline"
                                        noPreviewText={copy.noPreview}
                                      />
                                    ) : (
                                      <div className="eventGraphicsPreviewPlaceholder">{copy.noPreview}</div>
                                    )}
                                  </section>

                                  <ShareAssetPanel
                                    title={copy.graphic}
                                    files={graphicFiles}
                                    missingFiles={missingGraphicFiles}
                                    href={stage.assetHref}
                                    copy={copy}
                                  />
                                  <ShareAssetPanel
                                    title={copy.audio}
                                    files={audioFiles}
                                    missingFiles={missingAudioFiles}
                                    href={stage.assetHref}
                                    copy={copy}
                                  />
                                </div>
                              </section>
                            )
                          })}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
