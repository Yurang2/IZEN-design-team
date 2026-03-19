import type { ReactNode } from 'react'
import type { ScheduleFile } from '../../shared/types'
import {
  EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY,
  EventGraphicsPreviewRatioControl,
  toPreviewAspectRatioValue,
  type EventGraphicsPreviewRatio,
} from './EventGraphicsPreviewRatioControl'
import { EventGraphicsPreviewMedia, hasVisualPreviewUrl } from './EventGraphicsPreviewMedia'
import {
  usesSpeakerPptPlaceholder,
  type EventGraphicsAudioPreset,
  type EventGraphicsGraphicPreset,
  type EventGraphicsStageKind,
} from './eventGraphicsHierarchy'
import { toEventGraphicsDisplayFile } from './eventGraphicsFileDisplay'
import { eventGraphicsManifestByKey, toCueTypeLabel, type EventGraphicsShareLocale, type EventGroup } from './eventGraphicsShareData'
import { AssetUploadControl, toUploadStateKey, type AssetUploadField, type UploadState } from './EventGraphicsUploadControl'

type EventGraphicsPrintStrings = {
  title: string
  print: string
  backLabel?: string
  cue: string
  time: string
  stage: string
  titleColumn: string
  graphic: string
  audio: string
  note: string
  noNote: string
  noAsset: string
}

type EventGraphicsShareStrings = {
  externalShare: string
  printView?: string
  image: string
  noPreview: string
  openFile: string
  noSpecialNote: string
  graphic: string
  audio: string
  uploadRequired: string
}

type AssetEntry = {
  name: string
  role: string
  mediaKind?: ScheduleFile['kind']
  showImagePreviewBadge?: boolean
}

type EventGraphicsPresetValue = EventGraphicsGraphicPreset | EventGraphicsAudioPreset | null
const SPEAKER_PPT_DISPLAY = 'Speaker PPT'
const VIDEO_INCLUDED_DISPLAY = 'Included in Video'
const MIC_ONLY_DISPLAY = 'Mic Only'
const NOT_APPLICABLE_DISPLAY = 'N/A'
const TOOLBAR_COPY = {
  action: 'Action',
  format: 'Format',
  view: 'View',
} as const

function formatEndTimeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-') return '-'
  return trimmed.startsWith('~') ? trimmed : `~${trimmed}`
}

function formatRuntimeDisplay(value: string, locale: EventGraphicsShareLocale): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-') return '-'
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:분|min)$/i)
  if (!match) return trimmed
  return locale === 'en' ? `${match[1]} min` : `${match[1]}분`
}

function getStageAssetState(stage: {
  manifestKey: string | null
  cueType: string
  stageKind: EventGraphicsStageKind
  captureFiles: ReadonlyArray<unknown>
  audioFiles: ReadonlyArray<unknown>
  graphicPreset: EventGraphicsGraphicPreset | null
  audioPreset: EventGraphicsAudioPreset | null
}) {
  const manifestCue = stage.manifestKey ? eventGraphicsManifestByKey.get(stage.manifestKey) ?? null : null
  const hasSpeakerPptPreset = stage.graphicPreset === 'speaker_ppt'
  const hasDjAmbientPreset = stage.audioPreset === 'dj_ambient'
  const hasVideoIncludedPreset = stage.audioPreset === 'video_embedded'
  const hasMicOnlyPreset = stage.audioPreset === 'mic_only'
  const hasNotApplicablePreset = stage.audioPreset === 'not_applicable'
  const showSpeakerPpt = hasSpeakerPptPreset || usesSpeakerPptPlaceholder(stage.cueType, stage.stageKind)
  const graphicMissing = !showSpeakerPpt && stage.captureFiles.length === 0
  const audioMissing = !hasDjAmbientPreset && !hasVideoIncludedPreset && !hasMicOnlyPreset && !hasNotApplicablePreset && stage.audioFiles.length === 0

  return {
    manifestCue,
    hasSpeakerPptPreset,
    hasDjAmbientPreset,
    hasVideoIncludedPreset,
    hasMicOnlyPreset,
    hasNotApplicablePreset,
    showSpeakerPpt,
    graphicMissing,
    audioMissing,
  }
}

function PresetToggleButton({
  label,
  active,
  pending,
  onClick,
}: {
  label: string
  active: boolean
  pending?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`secondary mini eventGraphicsPresetToggle${active ? ' is-active' : ''}`}
      aria-pressed={active}
      disabled={pending}
      onClick={onClick}
    >
      {pending ? '저장 중...' : label}
    </button>
  )
}

function AssetKindBadge({ kind }: { kind: ScheduleFile['kind'] }) {
  return <span className={`eventGraphicsAssetKindBadge is-${kind}`}>{kind}</span>
}

function SpeakerPptSurface({
  interactive = false,
  active = false,
  pending = false,
  onClick,
}: {
  interactive?: boolean
  active?: boolean
  pending?: boolean
  onClick?: () => void
}) {
  const className = `eventGraphicsSpeakerPptPlaceholder${interactive ? ' is-clickable' : ''}${active ? ' is-active' : ''}`

  if (interactive) {
    return (
      <button type="button" className={className} disabled={pending} onClick={onClick}>
        {pending ? 'Saving...' : SPEAKER_PPT_DISPLAY}
      </button>
    )
  }

  return <div className={className}>{SPEAKER_PPT_DISPLAY}</div>
}

function confirmPresetChange(label: string, active: boolean): boolean {
  if (typeof window === 'undefined') return true
  const message = active ? `${label} 설정을 해제하시겠습니까?` : `${label}로 변경하시겠습니까?`
  return window.confirm(message)
}

function ToolbarGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="eventGraphicsToolbarGroup">
      <span className="eventGraphicsToolbarGroupLabel">{label}</span>
      <div className="eventGraphicsToolbarGroupControls">{children}</div>
    </div>
  )
}

function resolveVisualCueHeadingTitle(cue: EventGroup['cues'][number]): string {
  return cue.stages.find((stage) => stage.stageKind !== 'appearance')?.title || cue.title
}

function toAssetKindLabel(kind: ScheduleFile['kind']): string {
  if (kind === 'image') return 'Image'
  if (kind === 'video') return 'Video'
  if (kind === 'audio') return 'Audio'
  return 'File'
}

function ShareAssetPanel({
  title,
  files,
  missingFiles,
  href,
  openFileLabel,
  tone = 'default',
  showOpenFileLink = true,
  presetAction,
}: {
  title: string
  files: AssetEntry[]
  missingFiles: string[]
  href: string | null
  openFileLabel: string
  tone?: 'default' | 'ambient'
  showOpenFileLink?: boolean
  presetAction?: {
    label: string
    active: boolean
    pending?: boolean
    onClick?: () => void
  }
}) {
  const hasMissingFiles = missingFiles.length > 0
  const hasContent = files.length > 0 || presetAction
  const mediaKinds = Array.from(new Set(files.flatMap((file) => (file.mediaKind ? [file.mediaKind] : []))))

  return (
    <section className={`eventGraphicsAuditPanel${hasMissingFiles ? ' is-missing' : ''}${tone === 'ambient' ? ' is-ambient' : ''}`}>
      <div className="eventGraphicsAuditPanelHead">
        <span className="eventGraphicsPanelLabel">{title}</span>
        {hasMissingFiles ? <span className="eventGraphicsAuditMissingFlag">missing</span> : null}
      </div>

      {hasContent ? (
        <div className="eventGraphicsAuditChipList">
          {presetAction ? (
            presetAction.onClick ? (
              <button
                type="button"
                className={`eventGraphicsAuditChip eventGraphicsAuditChipButton${presetAction.active ? ' is-active' : ''}`}
                title={presetAction.label}
                disabled={presetAction.pending}
                onClick={presetAction.onClick}
              >
                {presetAction.label}
              </button>
            ) : (
              <span className={`eventGraphicsAuditChip${presetAction.active ? ' is-active' : ''}`} title={presetAction.label}>
                {presetAction.label}
              </span>
            )
          ) : null}
          {files.map((file) => (
            <span key={`${title}-${file.name}-${file.role}`} className="eventGraphicsAuditChip" title={file.role}>
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

      {showOpenFileLink && href ? (
        <a className="eventGraphicsInlineLink" href={href} target="_blank" rel="noreferrer">
          {openFileLabel}
        </a>
      ) : null}

      {!showOpenFileLink && mediaKinds.length > 0 ? (
        <div className="eventGraphicsAssetModeRow" aria-label={`${title} asset kinds`}>
          {mediaKinds.map((kind) => (
            <span key={`${title}-${kind}`} className={`eventGraphicsAssetModePill is-${kind}`}>
              {toAssetKindLabel(kind)}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function FileNameInlineList({
  files,
  fallback,
}: {
  files: ReadonlyArray<ScheduleFile>
  fallback: string
}) {
  if (files.length === 0) return <>{fallback}</>

  return (
    <span className="eventGraphicsInlineFileList">
      {files.map((file) => {
        const display = toEventGraphicsDisplayFile(file)
        return (
          <span key={`${file.name}-${file.url}`} className="eventGraphicsInlineFileItem">
            <span>{display.displayName}</span>
            <AssetKindBadge kind={display.emphasisKind} />
            {display.showImagePreviewBadge ? <span className="eventGraphicsAssetBadge">image preview</span> : null}
          </span>
        )
      })}
    </span>
  )
}

export function EventGraphicsPrintDocument({
  embedded = false,
  orientation = 'portrait',
  showNotes = true,
  locale,
  onLocaleChange,
  copy,
  pageTitle,
  groupedCues,
  shareHref,
  onPrint,
  toolbarExtra,
}: {
  embedded?: boolean
  orientation?: 'portrait' | 'landscape'
  showNotes?: boolean
  locale: EventGraphicsShareLocale
  onLocaleChange?: (locale: EventGraphicsShareLocale) => void
  copy: EventGraphicsPrintStrings
  pageTitle: string
  groupedCues: EventGroup[]
  shareHref?: string | null
  onPrint?: () => void
  toolbarExtra?: ReactNode
}) {
  const pageClassName = `eventGraphicsPrintPage${embedded ? ' is-embedded' : ''}${orientation === 'landscape' ? ' is-landscape' : ' is-portrait'}`
  const content = (
    <section className={pageClassName}>
      <header className="eventGraphicsPrintHeader">
        <div>
          <p className="muted small">{copy.title}</p>
          <h1>{pageTitle}</h1>
        </div>
        <div className="eventGraphicsPrintToolbar">
          <ToolbarGroup label={TOOLBAR_COPY.view}>
            <span className="eventGraphicsToolbarStatic">{copy.title}</span>
            {shareHref && copy.backLabel ? (
              <a className="linkButton secondary mini eventGraphicsToolbarOption" href={shareHref}>
                {copy.backLabel}
              </a>
            ) : null}
          </ToolbarGroup>
          {onLocaleChange || toolbarExtra ? (
            <ToolbarGroup label={TOOLBAR_COPY.format}>
              {onLocaleChange ? (
                <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
                  <button
                    type="button"
                    className={locale === 'ko' ? 'secondary mini eventGraphicsToolbarOption is-active' : 'secondary mini eventGraphicsToolbarOption'}
                    aria-pressed={locale === 'ko'}
                    onClick={() => onLocaleChange('ko')}
                  >
                    KO
                  </button>
                  <button
                    type="button"
                    className={locale === 'en' ? 'secondary mini eventGraphicsToolbarOption is-active' : 'secondary mini eventGraphicsToolbarOption'}
                    aria-pressed={locale === 'en'}
                    onClick={() => onLocaleChange('en')}
                  >
                    EN
                  </button>
                </div>
              ) : null}
              {toolbarExtra}
            </ToolbarGroup>
          ) : null}
          {onPrint ? (
            <ToolbarGroup label={TOOLBAR_COPY.action}>
              <button type="button" className="secondary mini eventGraphicsToolbarOption" onClick={onPrint}>
                {copy.print}
              </button>
            </ToolbarGroup>
          ) : null}
        </div>
      </header>

      <div className="eventGraphicsPrintList">
        {groupedCues.map((group) => (
          <section key={group.eventName} className="eventGraphicsPrintSection">
            <header className="eventGraphicsPrintSectionHead">
              <h2>{group.eventName}</h2>
            </header>
            <div className="tableWrap eventGraphicsPrintTableWrap">
              <table className="eventGraphicsPrintTable">
                <thead>
                  <tr>
                    <th>{copy.time}</th>
                    <th>{copy.cue}</th>
                    <th>{showNotes ? copy.titleColumn : copy.titleColumn.split('/')[0]?.trim() || copy.titleColumn}</th>
                    <th>{copy.graphic}</th>
                    <th>{copy.audio}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.cues.flatMap((cue) =>
                    cue.stages.map((stage, index) => {
                      const { showSpeakerPpt } = getStageAssetState(stage)

                      return (
                        <tr key={stage.id}>
                          {index === 0 ? (
                            <>
                              <td className="eventGraphicsPrintTimeCell" rowSpan={cue.stages.length}>
                                <strong>{cue.startTime}</strong>
                                <span>{formatEndTimeLabel(cue.endTime)}</span>
                                <small>{formatRuntimeDisplay(cue.runtimeLabel, locale)}</small>
                              </td>
                              <td className="eventGraphicsPrintCueCell" rowSpan={cue.stages.length}>
                                <strong>{cue.cueNumber}</strong>
                                <span>{toCueTypeLabel(cue.cueType, locale)}</span>
                              </td>
                            </>
                          ) : null}
                          <td className="eventGraphicsPrintTitleCell">
                            <div className="eventGraphicsPrintTitleMain">
                              {stage.captureFiles.length > 0 && hasVisualPreviewUrl(stage.previewHref) ? (
                                <EventGraphicsPreviewMedia
                                  src={stage.previewHref ?? ''}
                                  alt={`${stage.title} thumbnail`}
                                  className="eventGraphicsPrintThumb"
                                  noPreviewText=""
                                />
                              ) : showSpeakerPpt ? (
                                <div className="eventGraphicsPrintThumb">
                                  <div className="eventGraphicsSpeakerPptPlaceholder">{SPEAKER_PPT_DISPLAY}</div>
                                </div>
                              ) : null}
                              <strong>{stage.title}</strong>
                            </div>
                            {showNotes ? (
                              <p>
                                <span>{copy.note}</span>
                                {stage.note || copy.noNote}
                              </p>
                            ) : null}
                          </td>
                          <td className={showSpeakerPpt ? 'eventGraphicsPrintAssetCell is-speaker-ppt' : 'eventGraphicsPrintAssetCell'}>
                            {showSpeakerPpt ? (
                              SPEAKER_PPT_DISPLAY
                            ) : (
                              <FileNameInlineList files={stage.captureFiles} fallback={stage.graphicLabel || copy.noAsset} />
                            )}
                          </td>
                          <td className={stage.audioPreset === 'dj_ambient' ? 'eventGraphicsPrintAssetCell is-ambient-audio' : 'eventGraphicsPrintAssetCell'}>
                            {stage.audioPreset === 'video_embedded' ? VIDEO_INCLUDED_DISPLAY : stage.audioPreset === 'not_applicable' ? copy.noAsset : stage.audioLabel || copy.noAsset}
                          </td>
                        </tr>
                      )
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </section>
  )

  return embedded ? content : <main className="eventGraphicsPrintShell">{content}</main>
}

export function EventGraphicsShareDocument({
  embedded = false,
  locale,
  onLocaleChange,
  copy,
  pageTitle,
  groupedCues,
  previewRatio,
  onPreviewRatioChange,
  printHref,
  actionSlot,
  uploadStateByKey,
  onUploadFile,
  presetStateByKey,
  onSetPreset,
}: {
  embedded?: boolean
  locale: EventGraphicsShareLocale
  onLocaleChange?: (locale: EventGraphicsShareLocale) => void
  copy: EventGraphicsShareStrings
  pageTitle: string
  groupedCues: EventGroup[]
  previewRatio: EventGraphicsPreviewRatio
  onPreviewRatioChange: (value: EventGraphicsPreviewRatio) => void
  printHref?: string | null
  actionSlot?: ReactNode
  uploadStateByKey?: Record<string, UploadState>
  onUploadFile?: (rowId: string, field: AssetUploadField, file: File) => Promise<void>
  presetStateByKey?: Record<string, UploadState>
  onSetPreset?: (rowId: string, field: AssetUploadField, preset: EventGraphicsPresetValue) => Promise<void>
}) {
  const previewRatioStyle = { ['--event-graphics-preview-ratio' as string]: toPreviewAspectRatioValue(previewRatio) }
  const pageClassName = embedded ? 'eventGraphicsSharePage is-embedded' : 'eventGraphicsSharePage'
  const content = (
    <section className={pageClassName}>
      <header className="eventGraphicsShareHero">
        <div className="eventGraphicsShareHeroTop">
          <div className="eventGraphicsShareHeroText">
            <p className="muted small">{copy.externalShare}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="eventGraphicsShareActions">
            <ToolbarGroup label={TOOLBAR_COPY.view}>
              <span className="eventGraphicsToolbarStatic">{copy.externalShare}</span>
              {printHref && copy.printView ? (
                <a className="linkButton secondary mini eventGraphicsToolbarOption" href={printHref} target="_blank" rel="noreferrer">
                  {copy.printView}
                </a>
              ) : null}
            </ToolbarGroup>
            {onLocaleChange ? (
              <ToolbarGroup label={TOOLBAR_COPY.format}>
                <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
                  <button
                    type="button"
                    className={locale === 'en' ? 'secondary mini eventGraphicsToolbarOption is-active' : 'secondary mini eventGraphicsToolbarOption'}
                    aria-pressed={locale === 'en'}
                    onClick={() => onLocaleChange('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={locale === 'ko' ? 'secondary mini eventGraphicsToolbarOption is-active' : 'secondary mini eventGraphicsToolbarOption'}
                    aria-pressed={locale === 'ko'}
                    onClick={() => onLocaleChange('ko')}
                  >
                    KO
                  </button>
                </div>
              </ToolbarGroup>
            ) : null}
            {actionSlot}
          </div>
        </div>
        <EventGraphicsPreviewRatioControl value={previewRatio} onChange={onPreviewRatioChange} />
      </header>

      <div className="eventGraphicsShareList">
        {groupedCues.map((group) => (
          <section key={group.eventName} className="eventGraphicsShareGroup">
            <header className="eventGraphicsShareGroupHead">
              <h2>{group.eventName}</h2>
            </header>

            <div className="eventGraphicsShareGroupList">
              {group.cues.map((cue) => {
                const cueHasMissing = cue.stages.some((stage) => {
                  const { graphicMissing, audioMissing } = getStageAssetState(stage)
                  return graphicMissing || audioMissing
                })
                const cueHeadingTitle = resolveVisualCueHeadingTitle(cue)

                return (
                  <article key={cue.id} className={`eventGraphicsShareRow${cueHasMissing ? ' is-missing' : ''}`}>
                    <div className="eventGraphicsShareTime">
                      <strong>{cue.startTime}</strong>
                      <span>{formatEndTimeLabel(cue.endTime)}</span>
                      <small>{formatRuntimeDisplay(cue.runtimeLabel, locale)}</small>
                    </div>

                    <div className="eventGraphicsShareBody">
                      <div className="eventGraphicsShareHead">
                        <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                        <h3>{cueHeadingTitle}</h3>
                      </div>

                      <div className="eventGraphicsShareStageList">
                        {cue.stages.map((stage) => {
                          const {
                            manifestCue,
                            hasSpeakerPptPreset,
                            hasDjAmbientPreset,
                            hasVideoIncludedPreset,
                            hasMicOnlyPreset,
                            hasNotApplicablePreset,
                            showSpeakerPpt,
                            graphicMissing,
                            audioMissing,
                          } = getStageAssetState(stage)
                        const hasStageNote = Boolean(stage.note && stage.note !== copy.noSpecialNote && stage.note !== '메모 없음')
                        const graphicFiles =
                          showSpeakerPpt
                            ? []
                            : stage.captureFiles.length > 0
                            ? stage.captureFiles.map((file) => {
                                const display = toEventGraphicsDisplayFile(file)
                                return {
                                  name: display.displayName,
                                  role: stage.label,
                                  mediaKind: display.emphasisKind,
                                  showImagePreviewBadge: display.showImagePreviewBadge,
                                }
                              })
                            : []
                        const audioFiles =
                          stage.audioPreset != null
                            ? stage.audioPreset === 'not_applicable'
                              ? []
                              : [
                                  {
                                    name: stage.audioPreset === 'video_embedded' ? VIDEO_INCLUDED_DISPLAY : stage.audioLabel,
                                    role: stage.label,
                                    mediaKind: stage.audioPreset === 'video_embedded' ? ('video' as const) : ('audio' as const),
                                  },
                                ]
                            : stage.audioFiles.length > 0
                              ? stage.audioFiles.map((file) => ({ name: file.name, role: stage.label, mediaKind: file.kind }))
                              : []
                        const missingGraphicFiles =
                          graphicMissing
                            ? (
                                ((manifestCue?.missingFiles as ReadonlyArray<{ kind: string; label: string; sourceName: string }>) ?? [])
                                .filter((file) => file.kind !== 'audio')
                                .map((file) => file.sourceName || file.label)
                              )
                            : []
                        const missingAudioFiles =
                          audioMissing
                            ? (
                                ((manifestCue?.missingFiles as ReadonlyArray<{ kind: string; label: string; sourceName: string }>) ?? [])
                                .filter((file) => file.kind === 'audio')
                                .map((file) => file.sourceName || file.label)
                              )
                            : []
                        const graphicAlerts = graphicMissing ? (missingGraphicFiles.length > 0 ? missingGraphicFiles : [copy.uploadRequired]) : []
                        const audioAlerts = audioMissing ? (missingAudioFiles.length > 0 ? missingAudioFiles : [copy.uploadRequired]) : []
                        const previewHref = stage.previewHref || manifestCue?.previewUrl || null
                        const hasPreview = hasVisualPreviewUrl(previewHref)
                        const canUpload = Boolean(onUploadFile && uploadStateByKey)
                        const canSetPreset = Boolean(onSetPreset && presetStateByKey)
                        const capturePresetState = presetStateByKey?.[toUploadStateKey(stage.id, 'capture')]
                        const audioPresetState = presetStateByKey?.[toUploadStateKey(stage.id, 'audio')]
                        const handleSpeakerPptClick = () => {
                          if (!confirmPresetChange(SPEAKER_PPT_DISPLAY, hasSpeakerPptPreset)) return
                          void onSetPreset?.(stage.id, 'capture', hasSpeakerPptPreset ? null : 'speaker_ppt')
                        }

                        return (
                          <section key={stage.id} className={`eventGraphicsShareStage${graphicMissing || audioMissing ? ' is-missing' : ''}`}>
                            <div className="eventGraphicsShareStageHead">
                              <div className="eventGraphicsShareStageTitleBlock">
                                <span className="eventGraphicsShareStageCategory">
                                  {stage.category || toCueTypeLabel(stage.cueType, locale)}
                                </span>
                                <strong>{stage.title}</strong>
                              </div>
                              <span className="eventGraphicsShareStageMeta">{hasStageNote ? stage.note : ''}</span>
                            </div>
                            <div className="eventGraphicsShareAssetGrid">
                              <section className="eventGraphicsAuditVisual">
                                {showSpeakerPpt ? (
                                  <div className="eventGraphicsPreviewInline">
                                    <SpeakerPptSurface
                                      interactive={canSetPreset}
                                      active={hasSpeakerPptPreset}
                                      pending={capturePresetState?.status === 'uploading'}
                                      onClick={canSetPreset ? handleSpeakerPptClick : undefined}
                                    />
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
                                missingFiles={graphicAlerts}
                                href={embedded ? stage.assetHref : null}
                                openFileLabel={copy.openFile}
                                showOpenFileLink={embedded}
                                presetAction={
                                  showSpeakerPpt
                                    ? {
                                        label: SPEAKER_PPT_DISPLAY,
                                        active: embedded ? hasSpeakerPptPreset : true,
                                        pending: canSetPreset ? capturePresetState?.status === 'uploading' : undefined,
                                        onClick: canSetPreset ? handleSpeakerPptClick : undefined,
                                      }
                                    : undefined
                                }
                              />
                              <ShareAssetPanel
                                title={copy.audio}
                                files={audioFiles}
                                missingFiles={audioAlerts}
                                href={embedded ? stage.assetHref : null}
                                openFileLabel={copy.openFile}
                                showOpenFileLink={embedded}
                                tone={hasDjAmbientPreset ? 'ambient' : 'default'}
                              />
                            </div>

                            {canUpload ? (
                              <div className="eventGraphicsTimelineAssets">
                                <div className="eventGraphicsCueSheetPanel">
                                  <div className="eventGraphicsAssetUploadRow">
                                    {canSetPreset ? (
                                      <PresetToggleButton
                                        label={SPEAKER_PPT_DISPLAY}
                                        active={hasSpeakerPptPreset}
                                        pending={capturePresetState?.status === 'uploading'}
                                        onClick={() => {
                                          handleSpeakerPptClick()
                                        }}
                                      />
                                    ) : null}
                                    <AssetUploadControl
                                      rowId={stage.id}
                                      field="capture"
                                      accept="image/*"
                                      uploadState={uploadStateByKey?.[toUploadStateKey(stage.id, 'capture')]}
                                      onUploadFile={onUploadFile!}
                                    />
                                  </div>
                                </div>
                                <div className="eventGraphicsCueSheetPanel">
                                  <div className="eventGraphicsAssetUploadRow">
                                    {canSetPreset ? (
                                      <div className="eventGraphicsPresetToggleGroup">
                                        <PresetToggleButton
                                          label="DJ Ambient Music"
                                          active={hasDjAmbientPreset}
                                          pending={audioPresetState?.status === 'uploading'}
                                          onClick={() => {
                                            if (!confirmPresetChange('DJ Ambient Music', hasDjAmbientPreset)) return
                                            void onSetPreset?.(stage.id, 'audio', hasDjAmbientPreset ? null : 'dj_ambient')
                                          }}
                                        />
                                        <PresetToggleButton
                                          label={VIDEO_INCLUDED_DISPLAY}
                                          active={hasVideoIncludedPreset}
                                          pending={audioPresetState?.status === 'uploading'}
                                          onClick={() => {
                                            if (!confirmPresetChange(VIDEO_INCLUDED_DISPLAY, hasVideoIncludedPreset)) return
                                            void onSetPreset?.(stage.id, 'audio', hasVideoIncludedPreset ? null : 'video_embedded')
                                          }}
                                        />
                                        <PresetToggleButton
                                          label={MIC_ONLY_DISPLAY}
                                          active={hasMicOnlyPreset}
                                          pending={audioPresetState?.status === 'uploading'}
                                          onClick={() => {
                                            if (!confirmPresetChange(MIC_ONLY_DISPLAY, hasMicOnlyPreset)) return
                                            void onSetPreset?.(stage.id, 'audio', hasMicOnlyPreset ? null : 'mic_only')
                                          }}
                                        />
                                        <PresetToggleButton
                                          label={NOT_APPLICABLE_DISPLAY}
                                          active={hasNotApplicablePreset}
                                          pending={audioPresetState?.status === 'uploading'}
                                          onClick={() => {
                                            if (!confirmPresetChange(NOT_APPLICABLE_DISPLAY, hasNotApplicablePreset)) return
                                            void onSetPreset?.(stage.id, 'audio', hasNotApplicablePreset ? null : 'not_applicable')
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                    <AssetUploadControl
                                      rowId={stage.id}
                                      field="audio"
                                      accept="audio/*"
                                      uploadState={uploadStateByKey?.[toUploadStateKey(stage.id, 'audio')]}
                                      onUploadFile={onUploadFile!}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : null}
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
  )

  return embedded ? (
    <div style={previewRatioStyle}>
      {content}
    </div>
  ) : (
    <main className="eventGraphicsShareShell" style={previewRatioStyle}>
      {content}
    </main>
  )
}

export { EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY }
