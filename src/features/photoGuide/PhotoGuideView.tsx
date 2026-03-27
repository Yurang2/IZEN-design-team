import { useMemo, useState } from 'react'
import { api } from '../../shared/api/client'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { PhotoGuideCreateModal } from './PhotoGuideCreateModal'
import { PhotoGuideDocument } from './PhotoGuideDocument'
import { buildShotGuideData } from './photoGuideData'

type PhotoGuideViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  shareHref: string
  onRefresh?: () => void | Promise<void>
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
  const documentData = useMemo(() => buildShotGuideData(columns, rows, pageTitle), [columns, pageTitle, rows])

  const onUploadImage = async (slotId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    await api(`/photo-guide/${encodeURIComponent(slotId)}/files`, {
      method: 'POST',
      body: formData,
    })
    // 백그라운드에서 데이터 갱신 — await하지 않아 UI 리셋/스크롤 점프 방지
    onRefresh?.()
  }

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
        message="Cloudflare Workers 환경변수에 NOTION_PHOTO_GUIDE_DB_ID를 추가하면 촬영가이드 화면이 활성화됩니다."
        className="scheduleEmptyState"
      />
    )
  }

  const actionButtons = (
    <>
      <button type="button" className="linkButton secondary mini" onClick={() => setCreateOpen(true)}>
        새 컷 슬롯
      </button>
      <a className="linkButton secondary mini" href={shareHref} target="_blank" rel="noreferrer">
        External Share
      </a>
      {databaseUrl ? (
        <a className="linkButton secondary mini" href={databaseUrl} target="_blank" rel="noreferrer">
          Notion DB
        </a>
      ) : null}
    </>
  )

  if (documentData.summaryBlocks.length === 0 && documentData.groups.length === 0) {
    return (
      <>
        <EmptyState
          title="표시할 촬영가이드가 없습니다."
          message="컷 설명부터 먼저 쌓아두고, 각 슬롯에 이미지는 나중에 업로드하면 됩니다."
          className="scheduleEmptyState"
        />
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button type="button" className="linkButton secondary mini" onClick={() => setCreateOpen(true)}>
            새 컷 슬롯
          </button>
        </div>
        <PhotoGuideCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => onRefresh?.()} />
      </>
    )
  }

  return (
    <>
      <PhotoGuideDocument
        embedded
        pageTitle={pageTitle}
        summaryBlocks={documentData.summaryBlocks}
        groups={documentData.groups}
        actionSlot={actionButtons}
        onUploadImage={onUploadImage}
      />
      <PhotoGuideCreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => onRefresh?.()} />
    </>
  )
}
