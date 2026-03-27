import type { ReactNode } from 'react'
import { ShotSlotCard } from './ShotSlotCard'
import type { GuideSummaryBlock, ShotGroup } from './photoGuideData'

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

            {group.shots.length > 0 ? (
              <div className="shotGrid">
                {group.shots.map((slot) => (
                  <ShotSlotCard
                    key={slot.id}
                    slot={slot}
                    readonly={readonly}
                    onUploadImage={readonly ? undefined : onUploadImage}
                  />
                ))}
              </div>
            ) : (
              <div className="photoGuideSummaryCard is-empty">
                <h3>컷 슬롯 없음</h3>
                <p>이 그룹에는 아직 저장된 컷 슬롯이 없습니다.</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )

  return embedded ? content : <main className="photoGuideShell">{content}</main>
}
