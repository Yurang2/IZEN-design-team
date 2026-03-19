import { useEffect, useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import {
  EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY,
  normalizePreviewRatio,
  readStoredPreviewRatio,
  type EventGraphicsPreviewRatio,
} from './EventGraphicsPreviewRatioControl'
import { EventGraphicsShareDocument } from './EventGraphicsDocuments'
import {
  buildEventGraphicsShareData,
  buildEventGraphicsSharePageTitle,
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
  uploadRequired?: string
  untitledEvent: string
}

export const SHARE_COPY: Record<EventGraphicsShareLocale, CopySet> = {
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
    uploadRequired: 'Upload required',
    untitledEvent: 'Untitled event',
  },
  ko: {
    externalShare: '외부 공유',
    loading: '운영 자막을 불러오는 중...',
    loadErrorTitle: '운영 자막을 불러오지 못했습니다.',
    notConnectedTitle: '타임테이블 DB가 연결되지 않았습니다.',
    notConnectedMessage: '외부 공유 페이지에서 타임테이블 데이터를 아직 읽어오지 못했습니다.',
    emptyTitle: '표시할 운영 큐가 없습니다.',
    emptyMessage: '외부 공유용으로 정리된 큐가 없습니다.',
    printView: '프린트 보기',
    image: '이미지',
    noPreview: '등록된 미리보기가 없습니다.',
    openFile: '파일 열기',
    noSpecialNote: 'N/A',
    graphic: '그래픽',
    audio: '오디오',
    untitledEvent: '행사명 미정',
  },
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
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY) return
      try {
        setPreviewRatio(normalizePreviewRatio(event.newValue ? JSON.parse(event.newValue) : null))
      } catch {
        setPreviewRatio(readStoredPreviewRatio())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const copy = SHARE_COPY[locale]
  const { groupedCues } = useMemo(() => buildEventGraphicsShareData(columns, rows, copy.untitledEvent), [columns, copy.untitledEvent, rows])
  const pageTitle = useMemo(() => buildEventGraphicsSharePageTitle(groupedCues, databaseTitle), [databaseTitle, groupedCues])
  const printHref = `/share/timetable/print?locale=${encodeURIComponent(locale)}&orientation=portrait`

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
    <EventGraphicsShareDocument
      locale={locale}
      onLocaleChange={setLocale}
      copy={{
        externalShare: copy.externalShare,
        printView: copy.printView,
        image: copy.image,
        noPreview: copy.noPreview,
        openFile: copy.openFile,
        noSpecialNote: copy.noSpecialNote,
        graphic: copy.graphic,
        audio: copy.audio,
        uploadRequired: copy.uploadRequired ?? (locale === 'ko' ? '업로드 필요' : 'Upload required'),
      }}
      pageTitle={pageTitle}
      groupedCues={groupedCues}
      previewRatio={previewRatio}
      onPreviewRatioChange={setPreviewRatio}
      previewRatioReadOnly
      printHref={printHref}
    />
  )
}
