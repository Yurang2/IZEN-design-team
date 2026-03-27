import { useMemo } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { PhotoGuideDocument } from './PhotoGuideDocument'
import { buildShotGuideData } from './photoGuideData'

type PhotoGuideSharePageProps = {
  configured: boolean
  databaseTitle: string
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
}

export function PhotoGuideSharePage({
  configured,
  databaseTitle,
  columns,
  rows,
  loading,
  error,
}: PhotoGuideSharePageProps) {
  const pageTitle = databaseTitle.trim() || '촬영 가이드'
  const documentData = useMemo(() => buildShotGuideData(columns, rows, pageTitle), [columns, pageTitle, rows])

  if (loading) {
    return (
      <main className="photoGuideShell">
        <section className="photoGuidePage">
          <header className="photoGuideHero">
            <div className="photoGuideHeroTop">
              <div className="photoGuideHeroText">
                <p className="muted small">External Share</p>
                <h1>촬영 가이드를 불러오는 중입니다.</h1>
              </div>
            </div>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return (
      <main className="photoGuideShell">
        <EmptyState title="촬영 가이드를 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="photoGuideShell">
        <EmptyState
          title="촬영 가이드 DB가 연결되지 않았습니다."
          message="Cloudflare Workers 환경변수에 NOTION_PHOTO_GUIDE_DB_ID를 추가하면 외부 공유 페이지가 활성화됩니다."
          className="scheduleEmptyState"
        />
      </main>
    )
  }

  if (documentData.summaryBlocks.length === 0 && documentData.groups.length === 0) {
    return (
      <main className="photoGuideShell">
        <EmptyState
          title="표시할 촬영 가이드가 없습니다."
          message="아직 외부 공유용으로 보여줄 컷 슬롯이나 요약이 없습니다."
          className="scheduleEmptyState"
        />
      </main>
    )
  }

  return (
    <PhotoGuideDocument
      pageTitle={pageTitle}
      summaryBlocks={documentData.summaryBlocks}
      groups={documentData.groups}
      readonly
    />
  )
}
