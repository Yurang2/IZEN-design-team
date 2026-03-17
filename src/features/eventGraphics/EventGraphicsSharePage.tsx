import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { EventGraphicsPreviewMedia, hasVisualPreviewUrl } from './EventGraphicsPreviewMedia'
import {
  MISSING_FILE_LABEL,
  buildEventGraphicsShareData,
  buildEventGraphicsSharePageTitle,
  eventGraphicsManifestByCueNumber,
  toCueTypeLabel,
  type EventGraphicsShareLocale,
  type VendorCue,
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
  start: string
  thenHold: string
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
    start: 'Start',
    thenHold: 'Then / Hold',
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
    emptyMessage: '업체용 운영 뷰에 표시할 큐 데이터가 없습니다.',
    printView: '인쇄 전용 보기',
    image: '이미지',
    noPreview: '등록된 이미지가 없습니다.',
    start: '시작',
    thenHold: '이후 / 유지',
    openFile: '파일 열기',
    noSpecialNote: '특이사항 없음',
    graphic: '그래픽',
    audio: '오디오',
    untitledEvent: '행사명 미정',
  },
}

function appendAssetEntry(entries: AssetEntry[], name: string, role: string) {
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName === '-' || trimmedName === MISSING_FILE_LABEL) return
  if (entries.some((entry) => entry.name === trimmedName)) return
  entries.push({ name: trimmedName, role })
}

function buildFallbackGraphicEntries(cue: VendorCue, copy: CopySet): AssetEntry[] {
  const entries: AssetEntry[] = []
  appendAssetEntry(entries, cue.startGraphic, cue.startGraphicAction ? `${copy.start} ${cue.startGraphicAction}` : copy.start)
  appendAssetEntry(entries, cue.nextGraphic, cue.nextGraphicAction ? `${copy.thenHold} ${cue.nextGraphicAction}` : copy.thenHold)
  return entries
}

function buildFallbackAudioEntries(cue: VendorCue, copy: CopySet): AssetEntry[] {
  const entries: AssetEntry[] = []
  appendAssetEntry(entries, cue.startAudio, cue.startAudioAction ? `${copy.start} ${cue.startAudioAction}` : copy.start)
  appendAssetEntry(entries, cue.nextAudio, cue.nextAudioAction ? `${copy.thenHold} ${cue.nextAudioAction}` : copy.thenHold)
  return entries
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

  const copy = COPY[locale]
  const { groupedCues } = useMemo(() => buildEventGraphicsShareData(columns, rows, copy.untitledEvent), [columns, copy.untitledEvent, rows])
  const pageTitle = useMemo(() => buildEventGraphicsSharePageTitle(groupedCues, databaseTitle), [databaseTitle, groupedCues])
  const printHref = `/share/timetable/print?locale=${encodeURIComponent(locale)}`

  if (loading) {
    return (
      <main className="eventGraphicsShareShell">
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
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.loadErrorTitle} message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.notConnectedTitle} message={copy.notConnectedMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  if (groupedCues.length === 0) {
    return (
      <main className="eventGraphicsShareShell">
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  return (
    <main className="eventGraphicsShareShell">
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
        </header>

        <div className="eventGraphicsShareList">
          {groupedCues.map((group) => (
            <section key={group.eventName} className="eventGraphicsShareGroup">
              <header className="eventGraphicsShareGroupHead">
                <h2>{group.eventName}</h2>
              </header>

              <div className="eventGraphicsShareGroupList">
                {group.cues.map((cue) => {
                  const manifestCue = eventGraphicsManifestByCueNumber.get(cue.cueNumber)
                  const registeredFiles = (manifestCue?.registeredFiles ?? []) as ReadonlyArray<{ name: string; kind: string; role: string }>
                  const missingFiles = (manifestCue?.missingFiles ?? []) as ReadonlyArray<{ kind: string; label: string; sourceName: string }>
                  const graphicFiles = manifestCue
                    ? registeredFiles.filter((file) => file.kind === 'image' || file.kind === 'video').map((file) => ({ name: file.name, role: file.role }))
                    : buildFallbackGraphicEntries(cue, copy)
                  const audioFiles = manifestCue
                    ? registeredFiles.filter((file) => file.kind === 'audio').map((file) => ({ name: file.name, role: file.role }))
                    : buildFallbackAudioEntries(cue, copy)
                  const missingGraphicFiles = manifestCue
                    ? missingFiles.filter((file) => file.kind !== 'audio').map((file) => file.sourceName || file.label)
                    : []
                  const missingAudioFiles = manifestCue
                    ? missingFiles.filter((file) => file.kind === 'audio').map((file) => file.sourceName || file.label)
                    : []
                  const previewHref = cue.previewHref || manifestCue?.previewUrl || null
                  const hasPreview = hasVisualPreviewUrl(previewHref)

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
                          <span className="eventGraphicsShareSection">{toCueTypeLabel(cue.cueType, locale)}</span>
                          <h3>{cue.title}</h3>
                          <p>{cue.note || copy.noSpecialNote}</p>
                        </div>

                        <div className="eventGraphicsShareAssetGrid">
                          <section className="eventGraphicsAuditVisual">
                            <span className="eventGraphicsPanelLabel">{copy.image}</span>
                            {hasPreview ? (
                              <EventGraphicsPreviewMedia
                                src={previewHref ?? ''}
                                alt={`${cue.title} preview`}
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
                            href={cue.assetHref}
                            copy={copy}
                          />
                          <ShareAssetPanel
                            title={copy.audio}
                            files={audioFiles}
                            missingFiles={missingAudioFiles}
                            href={cue.assetHref}
                            copy={copy}
                          />
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
