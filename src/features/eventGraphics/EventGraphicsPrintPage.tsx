import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import {
  buildEventGraphicsShareData,
  buildEventGraphicsSharePageTitle,
  toCueTypeLabel,
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

const COPY: Record<EventGraphicsShareLocale, PrintCopySet> = {
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
    stage: 'Stage',
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
    stage: '단계',
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

export function EventGraphicsPrintPage({
  configured,
  databaseTitle,
  columns,
  rows,
  loading,
  error,
}: EventGraphicsPrintPageProps) {
  const [locale, setLocale] = useState<EventGraphicsShareLocale>(() => readLocaleFromSearch())
  const copy = COPY[locale]
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
    <main className="eventGraphicsPrintShell">
      <section className="eventGraphicsPrintPage">
        <header className="eventGraphicsPrintHeader">
          <div>
            <p className="muted small">{copy.title}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="eventGraphicsPrintToolbar">
            <div className="eventGraphicsLocaleSwitch" role="group" aria-label="Language selector">
              <button
                type="button"
                className={locale === 'ko' ? 'viewTab active' : 'viewTab'}
                aria-pressed={locale === 'ko'}
                onClick={() => setLocale('ko')}
              >
                KO
              </button>
              <button
                type="button"
                className={locale === 'en' ? 'viewTab active' : 'viewTab'}
                aria-pressed={locale === 'en'}
                onClick={() => setLocale('en')}
              >
                EN
              </button>
            </div>
            <button type="button" className="linkButton secondary" onClick={() => window.print()}>
              {copy.print}
            </button>
            <a className="linkButton secondary" href={shareHref}>
              {copy.backToShare}
            </a>
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
                                <span>{cue.endTime}</span>
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
                          <td>{stage.graphicLabel || copy.noAsset}</td>
                          <td>{stage.audioLabel || copy.noAsset}</td>
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
    </main>
  )
}
