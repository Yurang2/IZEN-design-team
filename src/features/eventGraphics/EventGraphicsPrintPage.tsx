import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { EventGraphicsPrintDocument } from './EventGraphicsDocuments'
import {
  buildEventGraphicsShareData,
  buildEventGraphicsSharePageTitle,
  type EventGraphicsShareLocale,
} from './eventGraphicsShareData'

type EventGraphicsPrintPageProps = {
  configured: boolean
  databaseTitle: string
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

type PrintCopySet = {
  title: string
  loading: string
  loadErrorTitle: string
  notConnectedTitle: string
  notConnectedMessage: string
  emptyTitle: string
  emptyMessage: string
  print: string
  backToShare: string
  cue: string
  time: string
  stage: string
  titleColumn: string
  graphic: string
  audio: string
  note: string
  noNote: string
  noAsset: string
  untitledEvent: string
}

export const PRINT_COPY: Record<EventGraphicsShareLocale, PrintCopySet> = {
  en: {
    title: 'Print View',
    loading: 'Loading print document...',
    loadErrorTitle: 'Unable to load print document.',
    notConnectedTitle: 'The timetable database is not connected.',
    notConnectedMessage: 'The print page could not read timetable data yet.',
    emptyTitle: 'No playback cues to print.',
    emptyMessage: 'There are no cues ready for the print layout.',
    print: 'Print',
    backToShare: 'External Share',
    cue: 'Cue',
    time: 'Time',
    stage: 'Category',
    titleColumn: 'Title / Note',
    graphic: 'Graphic',
    audio: 'Audio',
    note: 'Note',
    noNote: '-',
    noAsset: '-',
    untitledEvent: 'Untitled event',
  },
  ko: {
    title: '인쇄 전용 보기',
    loading: '인쇄 문서를 불러오는 중...',
    loadErrorTitle: '인쇄 문서를 불러오지 못했습니다.',
    notConnectedTitle: '타임테이블 DB가 연결되지 않았습니다.',
    notConnectedMessage: '인쇄 전용 페이지에서 타임테이블 데이터를 아직 읽어오지 못했습니다.',
    emptyTitle: '인쇄할 운영 큐가 없습니다.',
    emptyMessage: '인쇄용 레이아웃에 표시할 큐가 없습니다.',
    print: '인쇄',
    backToShare: 'External Share',
    cue: '큐',
    time: '시간',
    stage: '카테고리',
    titleColumn: '제목 / 메모',
    graphic: '그래픽',
    audio: '오디오',
    note: '메모',
    noNote: '-',
    noAsset: '-',
    untitledEvent: '행사명 미정',
  },
}

function readLocaleFromSearch(): EventGraphicsShareLocale {
  if (typeof window === 'undefined') return 'ko'
  const raw = new URLSearchParams(window.location.search).get('locale')
  return raw === 'en' ? 'en' : 'ko'
}

function readOrientationFromSearch(): 'portrait' | 'landscape' {
  if (typeof window === 'undefined') return 'portrait'
  const raw = new URLSearchParams(window.location.search).get('orientation')
  return raw === 'landscape' ? 'landscape' : 'portrait'
}

export function EventGraphicsPrintPage({
  configured,
  databaseTitle,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsPrintPageProps) {
  const [locale, setLocale] = useState<EventGraphicsShareLocale>(() => readLocaleFromSearch())
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => readOrientationFromSearch())
  const copy = PRINT_COPY[locale]
  const { groupedCues } = useMemo(() => buildEventGraphicsShareData(columns, rows, copy.untitledEvent), [columns, copy.untitledEvent, rows])
  const pageTitle = useMemo(() => buildEventGraphicsSharePageTitle(groupedCues, databaseTitle), [databaseTitle, groupedCues])
  const shareHref = `/share/timetable?locale=${encodeURIComponent(locale)}`

  if (loading) {
    return (
      <main className="eventGraphicsPrintShell">
        <section className="eventGraphicsPrintPage">
          <header className="eventGraphicsPrintHeader">
            <h1>{copy.loading}</h1>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="eventGraphicsPrintShell">
        <EmptyState title={copy.loadErrorTitle} message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="eventGraphicsPrintShell">
        <EmptyState title={copy.notConnectedTitle} message={copy.notConnectedMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  if (groupedCues.length === 0) {
    return (
      <main className="eventGraphicsPrintShell">
        <EmptyState title={copy.emptyTitle} message={copy.emptyMessage} className="scheduleEmptyState" />
      </main>
    )
  }

  return (
    <EventGraphicsPrintDocument
      orientation={orientation}
      showNotes={false}
      locale={locale}
      onLocaleChange={setLocale}
      copy={{
        title: copy.title,
        print: copy.print,
        backLabel: copy.backToShare,
        cue: copy.cue,
        time: copy.time,
        stage: copy.stage,
        titleColumn: copy.titleColumn,
        graphic: copy.graphic,
        audio: copy.audio,
        note: copy.note,
        noNote: copy.noNote,
        noAsset: copy.noAsset,
      }}
      pageTitle={pageTitle}
      groupedCues={groupedCues}
      shareHref={shareHref}
      toolbarExtra={
        <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Print orientation">
          <button type="button" className={orientation === 'portrait' ? 'viewTab active' : 'viewTab'} aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')}>
            Portrait
          </button>
          <button type="button" className={orientation === 'landscape' ? 'viewTab active' : 'viewTab'} aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')}>
            Landscape
          </button>
        </div>
      }
      onPrint={() => window.print()}
    />
  )
}
