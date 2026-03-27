import { useMemo, type ReactNode } from 'react'
import { ShotSlotCard } from './ShotSlotCard'
import type { GuideSummaryBlock, ShotGroup, ShotSlot } from './photoGuideData'

function isVideoShot(slot: ShotSlot): boolean {
  return slot.title.includes('(영상)') || slot.title.includes('[영상]') || slot.description.startsWith('[영상]')
}

function splitPhotoVideo(shots: ShotSlot[]): { photoShots: ShotSlot[]; videoShots: ShotSlot[] } {
  const photoShots: ShotSlot[] = []
  const videoShots: ShotSlot[] = []
  for (const shot of shots) {
    if (isVideoShot(shot)) videoShots.push(shot)
    else photoShots.push(shot)
  }
  return { photoShots, videoShots }
}

function MetaChip({ label, value, href }: { label: string; value: string; href?: string | null }) {
  if (!value) return null

  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  )

  if (href) {
    return (
      <a className="photoGuideMetaChip" href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    )
  }

  return <div className="photoGuideMetaChip">{content}</div>
}

function SummaryCards({ title, blocks }: { title: string; blocks: GuideSummaryBlock[] }) {
  if (blocks.length === 0) return null

  return (
    <section className="photoGuideSummaryBlock">
      <div className="photoGuideSummaryHead">
        <span className="photoGuideSectionLabel">{title}</span>
      </div>
      <div className="photoGuideSummaryGrid">
        {blocks.map((block) => (
          <article key={block.id} className="photoGuideSummaryCard">
            <h3>{block.title}</h3>
            <p>{block.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ShotGrid({
  shots,
  readonly,
  onUploadImage,
}: {
  shots: ShotSlot[]
  readonly: boolean
  onUploadImage?: (slotId: string, file: File) => Promise<void>
}) {
  if (shots.length === 0) return null
  return (
    <div className="shotGrid">
      {shots.map((slot) => (
        <ShotSlotCard key={slot.id} slot={slot} readonly={readonly} onUploadImage={readonly ? undefined : onUploadImage} />
      ))}
    </div>
  )
}

function ShotSections({
  shots,
  readonly,
  onUploadImage,
}: {
  shots: ShotSlot[]
  readonly: boolean
  onUploadImage?: (slotId: string, file: File) => Promise<void>
}) {
  const { photoShots, videoShots } = useMemo(() => splitPhotoVideo(shots), [shots])

  if (shots.length === 0) {
    return (
      <div className="photoGuideSummaryCard is-empty">
        <h3>컷 슬롯 없음</h3>
        <p>이 그룹에는 아직 저장된 컷 슬롯이 없습니다.</p>
      </div>
    )
  }

  // 사진만 또는 영상만 있는 경우 서브헤더 없이 표시
  if (videoShots.length === 0) return <ShotGrid shots={photoShots} readonly={readonly} onUploadImage={onUploadImage} />
  if (photoShots.length === 0) return <ShotGrid shots={videoShots} readonly={readonly} onUploadImage={onUploadImage} />

  return (
    <>
      <div className="shotSectionDivider">
        <span className="shotSectionLabel">사진 필수컷</span>
        <span className="shotSectionCount">{photoShots.length}</span>
      </div>
      <ShotGrid shots={photoShots} readonly={readonly} onUploadImage={onUploadImage} />

      <div className="shotSectionDivider">
        <span className="shotSectionLabel">영상 필수컷</span>
        <span className="shotSectionCount">{videoShots.length}</span>
      </div>
      <ShotGrid shots={videoShots} readonly={readonly} onUploadImage={onUploadImage} />
    </>
  )
}

export function PhotoGuideDocument({
  embedded = false,
  pageTitle,
  summaryBlocks,
  groups,
  readonly = false,
  actionSlot,
  onUploadImage,
}: {
  embedded?: boolean
  pageTitle: string
  summaryBlocks: GuideSummaryBlock[]
  groups: ShotGroup[]
  readonly?: boolean
  actionSlot?: ReactNode
  onUploadImage?: (slotId: string, file: File) => Promise<void>
}) {
  const content = (
    <section className={`photoGuidePage${embedded ? ' is-embedded' : ''}`}>
      <header className="photoGuideHero">
        <div className="photoGuideHeroTop">
          <div className="photoGuideHeroText">
            <p className="muted small">{embedded ? '촬영 가이드' : 'External Share'}</p>
            <h1>{pageTitle}</h1>
          </div>
          {actionSlot ? <div className="photoGuideActions">{actionSlot}</div> : null}
        </div>
      </header>

      <div className="photoGuideList">
        <SummaryCards title="운영 요약" blocks={summaryBlocks} />

        {groups.map((group) => (
          <section key={group.key} className="photoGuideGroup">
            <header className="photoGuideGroupHead">
              <div>
                <p className="photoGuideEyebrow">Shot Group</p>
                <h2>{group.title}</h2>
              </div>
              <div className="photoGuideMetaRow">
                <MetaChip label="행사" value={group.eventName} />
                <MetaChip label="일자" value={group.eventDate} />
                <MetaChip label="장소" value={group.location} />
                <MetaChip label="콜타임" value={group.callTime} />
                <MetaChip label="담당" value={group.contact} href={group.contactHref} />
              </div>
            </header>

            <SummaryCards title="그룹 메모" blocks={group.summaryBlocks} />

            <ShotSections shots={group.shots} readonly={readonly} onUploadImage={onUploadImage} />
          </section>
        ))}
      </div>
    </section>
  )

  return embedded ? content : <main className="photoGuideShell">{content}</main>
}
