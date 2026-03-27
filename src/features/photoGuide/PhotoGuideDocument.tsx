import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ScheduleFile } from '../../shared/types'
import type { PhotoGuideEntry, PhotoGuideGroup } from './photoGuideData'

function splitMultiline(value: string): string[] {
  return value
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function TextBlock({ value }: { value: string }) {
  const lines = splitMultiline(value)
  if (lines.length === 0) return <span className="photoGuideEmpty">-</span>
  if (lines.length === 1) return <p>{lines[0]}</p>
  return (
    <ul className="photoGuideBulletList">
      {lines.map((line, index) => (
        <li key={`${line}-${index}`}>{line}</li>
      ))}
    </ul>
  )
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

function ImageGallery({ images }: { images: ScheduleFile[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index)
            if (Number.isFinite(index)) setActiveIndex(index)
          }
        }
      },
      { root: container, threshold: 0.6 },
    )

    const items = container.querySelectorAll('[data-index]')
    for (const item of items) observer.observe(item)
    return () => observer.disconnect()
  }, [images.length])

  return (
    <div className="photoGuideGalleryWrap">
      <div className="photoGuideImageGallery" ref={scrollRef}>
        {images.map((file, index) => (
          <a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer" data-index={index}>
            <img src={file.url} alt={file.name} loading="lazy" />
          </a>
        ))}
      </div>
      {images.length > 1 && (
        <div className="photoGuideGalleryDots">
          {images.map((_, index) => (
            <span key={index} className={`photoGuideGalleryDot${index === activeIndex ? ' is-active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentList({ files }: { files: ScheduleFile[] }) {
  if (files.length === 0) return <span className="photoGuideEmpty">-</span>

  const images = files.filter((file) => file.kind === 'image')
  const others = files.filter((file) => file.kind !== 'image')

  return (
    <>
      {images.length > 0 && <ImageGallery images={images} />}
      {others.length > 0 && (
        <div className="photoGuideChipRow">
          {others.map((file) => (
            <a key={`${file.name}-${file.url}`} className={`photoGuideFileChip is-${file.kind}`} href={file.url} target="_blank" rel="noreferrer">
              {file.name}
            </a>
          ))}
        </div>
      )}
    </>
  )
}

function ReferenceLinks({ entry }: { entry: PhotoGuideEntry }) {
  if (entry.links.length === 0) return <span className="photoGuideEmpty">-</span>
  return (
    <div className="photoGuideChipRow">
      {entry.links.map((link) => (
        <a key={`${link.label}-${link.href}`} className="photoGuideLinkChip" href={link.href} target="_blank" rel="noreferrer">
          {link.label}
        </a>
      ))}
    </div>
  )
}

function GuideSection({ title, value, children }: { title: string; value?: string; children?: ReactNode }) {
  if (!value && !children) return null
  return (
    <section className="photoGuideSectionCard">
      <span className="photoGuideSectionLabel">{title}</span>
      {children ?? <TextBlock value={value ?? ''} />}
    </section>
  )
}

export function PhotoGuideDocument({
  embedded = false,
  pageTitle,
  groups,
  actionSlot,
}: {
  embedded?: boolean
  pageTitle: string
  groups: PhotoGuideGroup[]
  actionSlot?: ReactNode
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
        {groups.map((group) => (
          <section key={group.key} className="photoGuideGroup">
            <header className="photoGuideGroupHead">
              <div>
                <p className="photoGuideEyebrow">촬영 기사 공유용</p>
                <h2>{group.title}</h2>
              </div>
              <div className="photoGuideMetaRow">
                <MetaChip label="일자" value={group.eventDate} />
                <MetaChip label="장소" value={group.location} />
                <MetaChip label="콜타임" value={group.callTime} />
                <MetaChip label="담당" value={group.contact} href={group.contactHref} />
              </div>
            </header>

            <div className="photoGuideEntryList">
              {group.entries.map((entry) => (
                <article key={entry.id} className="photoGuideEntryCard">
                  <header className="photoGuideEntryHead">
                    <div className="photoGuideEntryTitleBlock">
                      <span className="photoGuideSectionPill">{entry.section}</span>
                      <h3>{entry.title}</h3>
                    </div>
                    {embedded && entry.url ? (
                      <a className="linkButton secondary mini" href={entry.url} target="_blank" rel="noreferrer">
                        노션 row
                      </a>
                    ) : null}
                  </header>

                  <div className="photoGuideEntryGrid">
                    <GuideSection title="촬영 목적" value={entry.purpose} />
                    <GuideSection title="필수 컷" value={entry.mustShoot} />
                    <GuideSection title="시간대별 포인트" value={entry.timeline} />
                    <GuideSection title="주의 사항" value={entry.cautions} />
                    <GuideSection title="납품 규격" value={entry.delivery} />
                    <GuideSection title="참고 메모" value={entry.references} />
                    <GuideSection title="링크">
                      <ReferenceLinks entry={entry} />
                    </GuideSection>
                    <GuideSection title="첨부 자료">
                      <AttachmentList files={entry.attachments} />
                    </GuideSection>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )

  return embedded ? content : <main className="photoGuideShell">{content}</main>
}
