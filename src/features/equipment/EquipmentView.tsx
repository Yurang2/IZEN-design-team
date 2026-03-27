import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EquipmentCheckoutRow, EquipmentCheckoutsResponse, ProjectRecord, ScheduleColumn, ScheduleRow } from '../../shared/types'
import { EmptyState } from '../../shared/ui'
import { api } from '../../shared/api/client'
import { buildEquipmentItems, groupByCategory } from './equipmentData'
import type { EquipmentGroup, EquipmentItem } from './equipmentData'

type EquipmentViewProps = {
  configured: boolean
  databaseTitle: string
  databaseUrl: string | null
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  loading: boolean
  error: string | null
  projects: ProjectRecord[]
  onRefresh?: () => void
}

type OwnerFilter = 'all' | 'IZEN' | '개인'

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  checked_out: '반출',
  returned: '반납',
}

const STATUS_CYCLE: Record<string, string> = {
  pending: 'checked_out',
  checked_out: 'returned',
  returned: 'pending',
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function EquipmentView({
  configured,
  databaseTitle,
  databaseUrl,
  columns,
  rows,
  loading,
  error,
  projects,
  onRefresh,
}: EquipmentViewProps) {
  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all')
  const [showLocation, setShowLocation] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [checkouts, setCheckouts] = useState<EquipmentCheckoutRow[]>([])
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})
  const [hidePastEvents, setHidePastEvents] = useState(true)

  const isCheckMode = Boolean(selectedProjectId)

  const items = useMemo(() => buildEquipmentItems(columns, rows), [columns, rows])
  const filtered = useMemo(
    () => (ownerFilter === 'all' ? items : items.filter((i) => i.owner === ownerFilter)),
    [items, ownerFilter],
  )
  const groups = useMemo(() => groupByCategory(filtered), [filtered])
  const pageTitle = databaseTitle.trim() || '촬영장비'

  // Project options: sorted by eventDate descending, past events optionally hidden
  const today = useMemo(() => todayIso(), [])
  const sortedProjects = useMemo(() => {
    const copy = [...projects]
    copy.sort((a, b) => (b.eventDate ?? '').localeCompare(a.eventDate ?? ''))
    return copy
  }, [projects])

  const upcomingProjects = useMemo(
    () => sortedProjects.filter((p) => {
      if (p.id === selectedProjectId) return true
      const d = p.eventDate ?? ''
      if (!d) return true
      return d >= today
    }),
    [sortedProjects, selectedProjectId, today],
  )
  const pastProjects = useMemo(
    () => sortedProjects.filter((p) => {
      if (p.id === selectedProjectId) return false
      const d = p.eventDate ?? ''
      return d && d < today
    }),
    [sortedProjects, selectedProjectId, today],
  )

  const checkoutMap = useMemo(() => {
    const map = new Map<string, EquipmentCheckoutRow>()
    for (const row of checkouts) {
      map.set(row.equipmentPageId.replace(/-/g, '').toLowerCase(), row)
    }
    return map
  }, [checkouts])

  const selectedCount = checkouts.filter((r) => r.status !== 'removed').length
  const checkedOutCount = checkouts.filter((r) => r.status === 'checked_out').length

  const fetchCheckouts = useCallback(async (projectId: string) => {
    if (!projectId) {
      setCheckouts([])
      return
    }
    setCheckoutLoading(true)
    try {
      const res = await api<EquipmentCheckoutsResponse>(`/equipment-checkouts?projectId=${projectId}`)
      setCheckouts(res.rows ?? [])
    } catch {
      setCheckouts([])
    } finally {
      setCheckoutLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchCheckouts(selectedProjectId)
  }, [selectedProjectId, fetchCheckouts])

  const handleToggleCheck = useCallback(async (item: EquipmentItem) => {
    if (!selectedProjectId) return
    const normalizedId = item.id.replace(/-/g, '').toLowerCase()
    const existing = checkoutMap.get(normalizedId)
    const isSaving = savingIds[item.id]
    if (isSaving) return

    setSavingIds((prev) => ({ ...prev, [item.id]: true }))
    try {
      const body: Record<string, unknown> = {
        projectPageId: selectedProjectId,
        equipmentPageId: item.id,
        status: existing ? 'remove' : 'pending',
      }

      const res = await api<{ ok: boolean; row: EquipmentCheckoutRow }>('/equipment-checkouts', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.row) {
        setCheckouts((prev) => {
          const rest = prev.filter((r) => r.equipmentPageId.replace(/-/g, '').toLowerCase() !== normalizedId)
          if (res.row.status !== 'removed') rest.push(res.row)
          return rest
        })
      }
    } finally {
      setSavingIds((prev) => ({ ...prev, [item.id]: false }))
    }
  }, [selectedProjectId, checkoutMap, savingIds])

  const handleStatusCycle = useCallback(async (item: EquipmentItem) => {
    if (!selectedProjectId) return
    const normalizedId = item.id.replace(/-/g, '').toLowerCase()
    const existing = checkoutMap.get(normalizedId)
    if (!existing || existing.status === 'removed') return
    if (savingIds[item.id]) return

    const nextStatus = STATUS_CYCLE[existing.status] || 'pending'
    setSavingIds((prev) => ({ ...prev, [item.id]: true }))
    try {
      const body: Record<string, unknown> = {
        projectPageId: selectedProjectId,
        equipmentPageId: item.id,
        status: nextStatus,
      }
      if (nextStatus === 'checked_out' && !existing.checkoutDate) {
        body.checkoutDate = todayIso()
      }
      if (nextStatus === 'returned' && !existing.returnDate) {
        body.returnDate = todayIso()
      }

      const res = await api<{ ok: boolean; row: EquipmentCheckoutRow }>('/equipment-checkouts', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (res.row) {
        setCheckouts((prev) =>
          prev.map((r) => (r.equipmentPageId.replace(/-/g, '').toLowerCase() === normalizedId ? res.row : r)),
        )
      }
    } finally {
      setSavingIds((prev) => ({ ...prev, [item.id]: false }))
    }
  }, [selectedProjectId, checkoutMap, savingIds])

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
        <EmptyState title="촬영장비 DB 미연결" message="NOTION_EQUIPMENT_DB_ID 환경변수를 설정해주세요." />
      </main>
    )
  }

  if (error) {
    return (
      <main className="equipmentShell">
        <EmptyState title="오류 발생" message={error} />
      </main>
    )
  }

  const selectedProject = sortedProjects.find((p) => p.id === selectedProjectId)

  return (
    <main className="equipmentShell">
      <section className="equipmentPage">
        <header className="equipmentHeader">
          <div className="equipmentHeaderTop">
            <h1>{pageTitle}</h1>
            <span className="muted small">{items.length}건</span>
          </div>

          {/* Project selector */}
          <div className="equipmentProjectBar">
            <select
              className="equipmentProjectSelect"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">-- 행사를 선택하세요 --</option>
              {upcomingProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.eventDate ? ` (${p.eventDate})` : ''}
                </option>
              ))}
              {!hidePastEvents && pastProjects.length > 0 ? (
                <optgroup label="지난 행사">
                  {pastProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.eventDate ? ` (${p.eventDate})` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <label className="equipmentToggle">
              <input
                type="checkbox"
                checked={hidePastEvents}
                onChange={(e) => setHidePastEvents(e.target.checked)}
              />
              <span>지난 행사 접기</span>
            </label>
          </div>

          {/* Check mode banner */}
          {!isCheckMode ? (
            <div className="equipmentBanner">
              행사를 선택하면 가져갈 장비를 체크하고 반출/반납 상태를 관리할 수 있습니다.
            </div>
          ) : (
            <div className="equipmentBanner is-active">
              <strong>{selectedProject?.name ?? '선택된 행사'}</strong>
              {selectedProject?.eventDate ? <span className="muted"> · {selectedProject.eventDate}</span> : null}
              <span className="equipmentBannerStats">
                {' '}— 선택 {selectedCount}건
                {checkedOutCount > 0 ? ` · 반출 ${checkedOutCount}건` : ''}
                {checkoutLoading ? ' · 로딩 중...' : ''}
              </span>
            </div>
          )}

          {/* Filters */}
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
          <EmptyState title="장비 없음" message="등록된 장비가 없습니다." />
        ) : (
          <div className="equipmentGroups">
            {groups.map((group) => (
              <EquipmentGroupSection
                key={group.category}
                group={group}
                showLocation={showLocation}
                isCheckMode={isCheckMode}
                checkoutMap={checkoutMap}
                savingIds={savingIds}
                onToggleCheck={handleToggleCheck}
                onStatusCycle={handleStatusCycle}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function EquipmentGroupSection({
  group,
  showLocation,
  isCheckMode,
  checkoutMap,
  savingIds,
  onToggleCheck,
  onStatusCycle,
}: {
  group: EquipmentGroup
  showLocation: boolean
  isCheckMode: boolean
  checkoutMap: Map<string, EquipmentCheckoutRow>
  savingIds: Record<string, boolean>
  onToggleCheck: (item: EquipmentItem) => void
  onStatusCycle: (item: EquipmentItem) => void
}) {
  const checkedCount = isCheckMode
    ? group.items.filter((i) => checkoutMap.has(i.id.replace(/-/g, '').toLowerCase())).length
    : 0

  return (
    <div className="equipmentGroup">
      <h2 className="equipmentGroupTitle">
        {group.category}
        <span className="muted small"> ({group.items.length})</span>
        {isCheckMode && checkedCount > 0 ? (
          <span className="equipmentCheckedCount"> · {checkedCount} 선택</span>
        ) : null}
      </h2>
      <table className="equipmentTable">
        <thead>
          <tr>
            <th className="equipmentCheckCol">선택</th>
            <th>장비명</th>
            <th>소유</th>
            <th>수량</th>
            <th>귀속장비</th>
            {showLocation ? <th>물품 위치</th> : null}
            <th>상태</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {group.items.map((item) => {
            const normalizedId = item.id.replace(/-/g, '').toLowerCase()
            const checkout = checkoutMap.get(normalizedId)
            const isChecked = Boolean(checkout)
            const isSaving = savingIds[item.id] ?? false

            return (
              <tr key={item.id} className={isChecked ? 'is-checked' : ''}>
                <td className="equipmentCheckCol">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={!isCheckMode || isSaving}
                    onChange={() => onToggleCheck(item)}
                  />
                </td>
                <td className="equipmentName">{item.name || '-'}</td>
                <td>
                  <span className={`equipmentOwnerBadge ${item.owner === 'IZEN' ? 'is-company' : 'is-personal'}`}>
                    {item.owner || '-'}
                  </span>
                </td>
                <td className="equipmentQty">{item.qty ?? '-'}</td>
                <td>{item.parentEquipment || '-'}</td>
                {showLocation ? <td>{item.location || '-'}</td> : null}
                <td>
                  {isChecked && checkout ? (
                    <button
                      type="button"
                      className={`equipmentStatusBtn is-${checkout.status}`}
                      disabled={isSaving}
                      onClick={() => onStatusCycle(item)}
                      title="클릭하여 상태 변경: 대기 → 반출 → 반납"
                    >
                      {isSaving ? '...' : STATUS_LABELS[checkout.status] || checkout.status}
                    </button>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
                <td className="muted">{item.note || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
