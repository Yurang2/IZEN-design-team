import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ShotSlotCard } from './ShotSlotCard'
import type { GuideSummaryBlock, ShotGroup, ShotSlot } from './photoGuideData'

const CHECKED_STORAGE_KEY = 'photoGuide:checkedSlots'

function loadCheckedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(CHECKED_STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function saveCheckedSet(set: Set<string>) {
  try {
    localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch { /* ignore */ }
}

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

type GridColumns = 1 | 2

function ShotGrid({
  shots,
  readonly,
  columns,
  checkedIds,
  hideChecked,
  onToggleCheck,
  onUploadImage,
}: {
  shots: ShotSlot[]
  readonly: boolean
  columns: GridColumns
  checkedIds?: Set<string>
  hideChecked?: boolean
  onToggleCheck?: (id: string) => void
  onUploadImage?: (slotId: string, file: File) => Promise<void>
}) {
  if (shots.length === 0) return null
  const visible = hideChecked ? shots.filter((s) => !checkedIds?.has(s.id)) : shots
  if (visible.length === 0) return <p className="shotGridAllDone">모든 컷을 촬영 완료했습니다!</p>
  return (
    <div className={`shotGrid${columns === 1 ? ' is-single' : ''}`}>
      {visible.map((slot) => (
        <div key={slot.id} className={`shotSlotCheckWrap${checkedIds?.has(slot.id) ? ' is-checked' : ''}`}>
          {onToggleCheck ? (
            <label className="shotSlotCheckbox">
              <input type="checkbox" checked={checkedIds?.has(slot.id) ?? false} onChange={() => onToggleCheck(slot.id)} />
              <span>촬영 완료</span>
            </label>
          ) : null}
          <ShotSlotCard slot={slot} readonly={readonly} onUploadImage={readonly ? undefined : onUploadImage} />
        </div>
      ))}
    </div>
  )
}

function ShotSections({
  shots,
  readonly,
  columns,
  checkedIds,
  hideChecked,
  onToggleCheck,
  onUploadImage,
}: {
  shots: ShotSlot[]
  readonly: boolean
  columns: GridColumns
  checkedIds?: Set<string>
  hideChecked?: boolean
  onToggleCheck?: (id: string) => void
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
  if (videoShots.length === 0) {
    return (
      <div className="shotSectionWrap is-photo">
        <ShotGrid shots={photoShots} readonly={readonly} columns={columns} checkedIds={checkedIds} hideChecked={hideChecked} onToggleCheck={onToggleCheck} onUploadImage={onUploadImage} />
      </div>
    )
  }
  if (photoShots.length === 0) {
    return (
      <div className="shotSectionWrap is-video">
        <ShotGrid shots={videoShots} readonly={readonly} columns={columns} checkedIds={checkedIds} hideChecked={hideChecked} onToggleCheck={onToggleCheck} onUploadImage={onUploadImage} />
      </div>
    )
  }

  return (
    <>
      <div className="shotSectionWrap is-photo">
        <div className="shotSectionDivider">
          <span className="shotSectionLabel">사진 필수컷</span>
          <span className="shotSectionCount">{photoShots.length}</span>
        </div>
        <ShotGrid shots={photoShots} readonly={readonly} columns={columns} checkedIds={checkedIds} hideChecked={hideChecked} onToggleCheck={onToggleCheck} onUploadImage={onUploadImage} />
      </div>

      <div className="shotSectionWrap is-video">
        <div className="shotSectionDivider">
          <span className="shotSectionLabel">영상 필수컷</span>
          <span className="shotSectionCount">{videoShots.length}</span>
        </div>
        <ShotGrid shots={videoShots} readonly={readonly} columns={columns} checkedIds={checkedIds} hideChecked={hideChecked} onToggleCheck={onToggleCheck} onUploadImage={onUploadImage} />
      </div>
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
  const [columns, setColumns] = useState<GridColumns>(1)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => loadCheckedSet())
  const [hideChecked, setHideChecked] = useState(true)

  const onToggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveCheckedSet(next)
      return next
    })
  }, [])

  const totalShots = groups.reduce((sum, g) => sum + g.shots.length, 0)
  const checkedCount = groups.reduce((sum, g) => sum + g.shots.filter((s) => checkedIds.has(s.id)).length, 0)

  const content = (
    <section className={`photoGuidePage${embedded ? ' is-embedded' : ''}`}>
      <header className="photoGuideHero">
        <div className="photoGuideHeroTop">
          <div className="photoGuideHeroText">
            <p className="muted small">{embedded ? '촬영 가이드' : 'External Share'}</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className="photoGuideActions">
            <div className="shotGridToggle">
              <button type="button" className={`shotGridToggleBtn${columns === 1 ? ' is-active' : ''}`} onClick={() => setColumns(1)} aria-label="1열 보기">
                <span className="shotGridToggleIcon is-single" />
              </button>
              <button type="button" className={`shotGridToggleBtn${columns === 2 ? ' is-active' : ''}`} onClick={() => setColumns(2)} aria-label="2열 보기">
                <span className="shotGridToggleIcon is-double" />
              </button>
            </div>
            {actionSlot}
          </div>
        </div>
        {totalShots > 0 ? (
          <div className="shotCheckToolbar">
            <div className="shotCheckProgress">
              <span className="shotCheckProgressBar" style={{ width: `${totalShots > 0 ? (checkedCount / totalShots) * 100 : 0}%` }} />
            </div>
            <span className="shotCheckCount">{checkedCount}/{totalShots} 촬영 완료</span>
            <label className="shotCheckHideToggle">
              <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.target.checked)} />
              <span>완료 항목 숨기기</span>
            </label>
          </div>
        ) : null}
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

            <ShotSections shots={group.shots} readonly={readonly} columns={columns} checkedIds={checkedIds} hideChecked={hideChecked} onToggleCheck={onToggleCheck} onUploadImage={onUploadImage} />
          </section>
        ))}
      </div>
    </section>
  )

  return embedded ? content : <main className="photoGuideShell">{content}</main>
}
