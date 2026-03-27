import { useMemo, useState } from 'react'
import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { buildEquipmentItems, groupByCategory } from './equipmentData'
import type { EquipmentGroup } from './equipmentData'

type EquipmentViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  onRefresh?: () => void
}

type OwnerFilter = 'all' | 'IZEN' | '개인'

export function EquipmentView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
  onRefresh,
}: EquipmentViewProps) {
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [showLocation, setShowLocation] = useState(false)

  const items = useMemo(() => buildEquipmentItems(columns, rows), [columns, rows])
  const filtered = useMemo(
    () => (ownerFilter === 'all' ? items : items.filter((i) => i.owner === ownerFilter)),
    [items, ownerFilter],
  )
  const groups = useMemo(() => groupByCategory(filtered), [filtered])
  const pageTitle = databaseTitle.trim() || '촬영장비'

  if (loading) {
    return (
      <main className="equipmentShell">
        <section className="equipmentPage">
          <header className="equipmentHeader">
            <h1>{pageTitle}</h1>
            <p className="muted small">불러오는 중...</p>
          </header>
        </section>
      </main>
    )
  }

  if (!configured) {
    return (
      <main className="equipmentShell">
        <EmptyState
          title="촬영장비 DB 미연결"
          description="NOTION_EQUIPMENT_DB_ID 환경변수를 설정해주세요."
        />
      </main>
    )
  }

  if (error) {
    return (
      <main className="equipmentShell">
        <EmptyState title="오류 발생" description={error} />
      </main>
    )
  }

  return (
    <main className="equipmentShell">
      <section className="equipmentPage">
        <header className="equipmentHeader">
          <div className="equipmentHeaderTop">
            <h1>{pageTitle}</h1>
            <span className="muted small">{items.length}건</span>
          </div>
          <div className="equipmentToolbar">
            <div className="equipmentFilterGroup">
              {(['all', 'IZEN', '개인'] as OwnerFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`equipmentFilterBtn${ownerFilter === value ? ' is-active' : ''}`}
                  onClick={() => setOwnerFilter(value)}
                >
                  {value === 'all' ? '전체' : value}
                </button>
              ))}
            </div>
            <label className="equipmentToggle">
              <input type="checkbox" checked={showLocation} onChange={(e) => setShowLocation(e.target.checked)} />
              <span>물품 위치</span>
            </label>
            <div className="equipmentToolbarRight">
              {databaseUrl ? (
                <a href={databaseUrl} target="_blank" rel="noopener noreferrer" className="equipmentNotionLink">
                  Notion
                </a>
              ) : null}
              {onRefresh ? (
                <button type="button" className="equipmentRefreshBtn" onClick={onRefresh}>
                  새로고침
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {groups.length === 0 ? (
          <EmptyState title="장비 없음" description="등록된 장비가 없습니다." />
        ) : (
          <div className="equipmentGroups">
            {groups.map((group) => (
              <EquipmentGroupSection key={group.category} group={group} showLocation={showLocation} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function EquipmentGroupSection({ group, showLocation }: { group: EquipmentGroup; showLocation: boolean }) {
  return (
    <div className="equipmentGroup">
      <h2 className="equipmentGroupTitle">{group.category}<span className="muted small"> ({group.items.length})</span></h2>
      <table className="equipmentTable">
        <thead>
          <tr>
            <th>장비명</th>
            <th>소유</th>
            <th>수량</th>
            <th>귀속장비</th>
            {showLocation ? <th>물품 위치</th> : null}
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((item) => (
            <tr key={item.id}>
              <td className="equipmentName">{item.name || '-'}</td>
              <td>
                <span className={`equipmentOwnerBadge ${item.owner === 'IZEN' ? 'is-company' : 'is-personal'}`}>
                  {item.owner || '-'}
                </span>
              </td>
              <td className="equipmentQty">{item.qty ?? '-'}</td>
              <td>{item.parentEquipment || '-'}</td>
              {showLocation ? <td>{item.location || '-'}</td> : null}
              <td className="muted">{item.note || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
