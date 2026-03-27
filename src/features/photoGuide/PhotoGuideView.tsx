import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { PhotoGuideCreateModal } from './PhotoGuideCreateModal'
import { PhotoGuideDocument } from './PhotoGuideDocument'
import { buildPhotoGuideGroups } from './photoGuideData'

type PhotoGuideViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  shareHref: string
  onRefresh?: () => void
}

export function PhotoGuideView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
  shareHref,
  onRefresh,
}: PhotoGuideViewProps) {
  const [createOpen, setCreateOpen] = useState(false)
  const pageTitle = databaseTitle.trim() || '촬영 가이드'
  const groups = useMemo(() => buildPhotoGuideGroups(columns, rows, pageTitle), [columns, pageTitle, rows])

  if (loading) {
    return (
      <main className="photoGuideShell">
        <section className="photoGuidePage is-embedded">
          <header className="photoGuideHero">
            <div className="photoGuideHeroTop">
              <div className="photoGuideHeroText">
                <p className="muted small">촬영 가이드</p>
                <h1>촬영 가이드를 불러오는 중입니다.</h1>
              </div>
            </div>
          </header>
        </section>
      </main>
    )
  }

  if (error) {
    return <EmptyState title="촬영 가이드 DB를 불러오지 못했습니다." message={error} className="scheduleEmptyState" />
  }

  if (!configured) {
    return (
      <EmptyState
        title="촬영 가이드 DB가 연결되지 않았습니다."
        message="Cloudflare Workers 환경변수에 NOTION_PHOTO_GUIDE_DB_ID를 추가하면 촬영 가이드 화면이 활성화됩니다."
        className="scheduleEmptyState"
      />
    )
  }

  const actionButtons = (
    <>
      <button type="button" className="linkButton secondary mini" onClick={() => setCreateOpen(true)}>
        새 촬영가이드
      </button>
      <a className="linkButton secondary mini" href={shareHref} target="_blank" rel="noreferrer">
        External Share
      </a>
      {databaseUrl ? (
        <a className="linkButton secondary mini" href={databaseUrl} target="_blank" rel="noreferrer">
          노션 DB
        </a>
      ) : null}
    </>
  )

  if (groups.length === 0) {
    return (
      <>
        <EmptyState
          title="표시할 촬영 가이드가 없습니다."
          message="촬영가이드 DB 컬럼은 자동 생성됩니다. 아직 row가 없으면 이 화면은 비어 보입니다."
          className="scheduleEmptyState"
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button type="button" className="linkButton secondary mini" onClick={() => setCreateOpen(true)}>
            새 촬영가이드
          </button>
        </div>
        <PhotoGuideCreateModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => onRefresh?.()}
        />
      </>
    )
  }

  return (
    <>
      <PhotoGuideDocument
        embedded
        pageTitle={pageTitle}
        groups={groups}
        actionSlot={actionButtons}
      />
      <PhotoGuideCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => onRefresh?.()}
      />
    </>
  )
}
