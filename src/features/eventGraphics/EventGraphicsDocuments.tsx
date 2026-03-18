import type { ReactNode } from 'react'
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
}

type EventGraphicsPresetValue = EventGraphicsGraphicPreset | EventGraphicsAudioPreset | null
const SPEAKER_PPT_DISPLAY = 'Speaker PPT'
const VIDEO_INCLUDED_DISPLAY = 'Included in Video'
const MIC_ONLY_DISPLAY = 'Mic Only'
const NOT_APPLICABLE_DISPLAY = 'N/A'

function formatEndTimeLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-') return '-'
  return trimmed.startsWith('~') ? trimmed : `~${trimmed}`
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

function confirmPresetChange(label: string, active: boolean): boolean {
  if (typeof window === 'undefined') return true
  const message = active ? `${label} 설정을 해제하시겠습니까?` : `${label}로 변경하시겠습니까?`
  return window.confirm(message)
}

function ShareAssetPanel({
  title,
  files,
  missingFiles,
  href,
  openFileLabel,
  tone = 'default',
}: {
  title: string
  files: AssetEntry[]
  missingFiles: string[]
  href: string | null
  openFileLabel: string
  tone?: 'default' | 'ambient'
}) {
  const hasMissingFiles = missingFiles.length > 0

  return (
    <section className={`eventGraphicsAuditPanel${hasMissingFiles ? ' is-missing' : ''}${tone === 'ambient' ? ' is-ambient' : ''}`}>
      <div className="eventGraphicsAuditPanelHead">
        <span className="eventGraphicsPanelLabel">{title}</span>
        {hasMissingFiles ? <span className="eventGraphicsAuditMissingFlag">missing</span> : null}
      </div>

      {files.length > 0 ? (
        <div className="eventGraphicsAuditChipList">
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

      {href ? (
        <a className="eventGraphicsInlineLink" href={href} target="_blank" rel="noreferrer">
          {openFileLabel}
        </a>
      ) : null}
    </section>
  )
}

export function EventGraphicsPrintDocument({
  embedded = false,
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
  locale: EventGraphicsShareLocale
  onLocaleChange?: (locale: EventGraphicsShareLocale) => void
  copy: EventGraphicsPrintStrings
  pageTitle: string
  groupedCues: EventGroup[]
  shareHref?: string | null
  onPrint?: () => void
  toolbarExtra?: ReactNode
}) {
  const pageClassName = embedded ? 'eventGraphicsPrintPage is-embedded' : 'eventGraphicsPrintPage'
  const content = (
    <section className={pageClassName}>
      <header className="eventGraphicsPrintHeader">
        <div>
          <p className="muted small">{copy.title}</p>
          <h1>{pageTitle}</h1>
        </div>
        <div className="eventGraphicsPrintToolbar">
          {onLocaleChange ? (
            <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
              <button type="button" className={locale === 'ko' ? 'viewTab active' : 'viewTab'} aria-pressed={locale === 'ko'} onClick={() => onLocaleChange('ko')}>
                KO
              </button>
              <button type="button" className={locale === 'en' ? 'viewTab active' : 'viewTab'} aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>
                EN
              </button>
            </div>
          ) : null}
          {toolbarExtra}
          {onPrint ? (
            <button type="button" className="linkButton secondary" onClick={onPrint}>
              {copy.print}
            </button>
          ) : null}
          {shareHref && copy.backLabel ? (
            <a className="linkButton secondary" href={shareHref}>
              {copy.backLabel}
            </a>
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
                    <th>{copy.stage}</th>
                    <th>{copy.titleColumn}</th>
                    <th>{copy.graphic}</th>
                    <th>{copy.audio}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.cues.flatMap((cue) =>
                    cue.stages.map((stage, index) => (
                      <tr key={stage.id}>
                        {index === 0 ? (
                          <>
                            <td className="eventGraphicsPrintTimeCell" rowSpan={cue.stages.length}>
                              <strong>{cue.startTime}</strong>
                              <span>{formatEndTimeLabel(cue.endTime)}</span>
                              <small>{cue.runtimeLabel}</small>
                            </td>
                            <td className="eventGraphicsPrintCueCell" rowSpan={cue.stages.length}>
                              <strong>{cue.cueNumber}</strong>
                              <span>{toCueTypeLabel(cue.cueType, locale)}</span>
                            </td>
                          </>
                        ) : null}
                        <td className="eventGraphicsPrintCueCell">
                          <strong>{stage.label}</strong>
                          <span>{stage.cueNumber}</span>
                        </td>
                        <td className="eventGraphicsPrintTitleCell">
                          <strong>{stage.title}</strong>
                          <p>
                            <span>{copy.note}</span>
                            {stage.note || copy.noNote}
                          </p>
                        </td>
                        <td>{stage.graphicPreset === 'speaker_ppt' ? SPEAKER_PPT_DISPLAY : stage.graphicLabel || copy.noAsset}</td>
                        <td>{stage.audioPreset === 'video_embedded' ? VIDEO_INCLUDED_DISPLAY : stage.audioPreset === 'not_applicable' ? copy.noAsset : stage.audioLabel || copy.noAsset}</td>
                      </tr>
                    )),
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
            {printHref && copy.printView ? (
              <a className="linkButton secondary" href={printHref} target="_blank" rel="noreferrer">
                {copy.printView}
              </a>
            ) : null}
            {actionSlot}
            {onLocaleChange ? (
              <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
                <button type="button" className={locale === 'en' ? 'viewTab active' : 'viewTab'} aria-pressed={locale === 'en'} onClick={() => onLocaleChange('en')}>
                  EN
                </button>
                <button type="button" className={locale === 'ko' ? 'viewTab active' : 'viewTab'} aria-pressed={locale === 'ko'} onClick={() => onLocaleChange('ko')}>
                  KO
                </button>
              </div>
            ) : null}
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

                return (
                  <article key={cue.id} className={`eventGraphicsShareRow${cueHasMissing ? ' is-missing' : ''}`}>
                    <div className="eventGraphicsShareTime">
                      <strong>{cue.startTime}</strong>
                      <span>{formatEndTimeLabel(cue.endTime)}</span>
                      <small>{cue.runtimeLabel}</small>
                    </div>

                    <div className="eventGraphicsShareBody">
                      <div className="eventGraphicsShareHead">
                        <span className="eventGraphicsOrder">{cue.cueNumber}</span>
                        <span className="eventGraphicsShareSection">{toCueTypeLabel(cue.cueType, locale)}</span>
                        <h3>{cue.title}</h3>
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
                            ? stage.captureFiles.map((file) => ({ name: file.name, role: stage.label }))
                            : []
                        const audioFiles =
                          stage.audioPreset != null
                            ? stage.audioPreset === 'not_applicable'
                              ? []
                              : [{ name: stage.audioPreset === 'video_embedded' ? VIDEO_INCLUDED_DISPLAY : stage.audioLabel, role: stage.label }]
                            : stage.audioFiles.length > 0
                              ? stage.audioFiles.map((file) => ({ name: file.name, role: stage.label }))
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

                        return (
                          <section key={stage.id} className={`eventGraphicsShareStage${graphicMissing || audioMissing ? ' is-missing' : ''}`}>
                            <div className="eventGraphicsShareStageHead">
                              <strong>{stage.title}</strong>
                              <span className="eventGraphicsShareStageMeta">{hasStageNote ? stage.note : ''}</span>
                            </div>
                            <div className="eventGraphicsShareAssetGrid">
                              <section className="eventGraphicsAuditVisual">
                                {showSpeakerPpt ? (
                                  <div className="eventGraphicsPreviewInline">
                                    <div className="eventGraphicsSpeakerPptPlaceholder">{SPEAKER_PPT_DISPLAY}</div>
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
                                href={stage.assetHref}
                                openFileLabel={copy.openFile}
                              />
                              <ShareAssetPanel
                                title={copy.audio}
                                files={audioFiles}
                                missingFiles={audioAlerts}
                                href={stage.assetHref}
                                openFileLabel={copy.openFile}
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
                                          if (!confirmPresetChange(SPEAKER_PPT_DISPLAY, hasSpeakerPptPreset)) return
                                          void onSetPreset?.(stage.id, 'capture', hasSpeakerPptPreset ? null : 'speaker_ppt')
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
