import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Proposal = {
  id: string
  projectName: string
  taskName: string
  workCategory: string
  dueDate?: string
  finalDueText?: string
  aiDeadlineSuggestion?: {
    deadlineBasis: 'event_date'
    offsetDays: number
  }
}

const BASE_URL = (import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new Error('`VITE_FUNCTIONS_BASE_URL`가 설정되지 않았습니다.')
  }

  const url = `${BASE_URL}/${path}`
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const bodyPreview = (await response.text()).slice(0, 80).replace(/\s+/g, ' ')
    throw new Error(`API가 JSON이 아닌 응답을 반환했습니다 (${url}) - content-type: ${contentType || 'unknown'}, body: ${bodyPreview}`)
  }

  return response.json() as Promise<T>
}

function App() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectedCount = useMemo(
    () => proposals.filter((proposal) => selected[proposal.id]).length,
    [proposals, selected],
  )

  const loadProposals = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<{ proposals: Proposal[] }>('listPendingProposals')
      setProposals(data.proposals)
      setSelected({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!BASE_URL) {
      return
    }
    void loadProposals()
  }, [])

  const updateLocalProposal = (proposalId: string, patch: Partial<Proposal>) => {
    setProposals((prev) => prev.map((proposal) => (proposal.id === proposalId ? { ...proposal, ...patch } : proposal)))
  }

  const saveProposalPatch = async (proposalId: string, patch: Partial<Proposal>) => {
    await api<{ ok: boolean }>('updateProposal', {
      method: 'POST',
      body: JSON.stringify({ proposalId, patch }),
    })
  }

  const deleteProposal = async (proposalId: string) => {
    await api<{ ok: boolean }>('deleteProposal', {
      method: 'POST',
      body: JSON.stringify({ proposalId }),
    })
    setProposals((prev) => prev.filter((proposal) => proposal.id !== proposalId))
  }

  const approveSelected = async () => {
    const selectedProposals = proposals.filter((proposal) => selected[proposal.id])
    if (selectedProposals.length === 0) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const overrides = Object.fromEntries(
        selectedProposals.map((proposal) => [
          proposal.id,
          {
            taskName: proposal.taskName,
            workCategory: proposal.workCategory,
            dueDate: proposal.dueDate,
          },
        ]),
      )

      await api<{ ok: boolean }>('approveProposals', {
        method: 'POST',
        body: JSON.stringify({
          proposalIds: selectedProposals.map((proposal) => proposal.id),
          overrides,
        }),
      })

      await loadProposals()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'approve failed')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleSelection = (proposalId: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [proposalId]: checked }))
  }

  return (
    <main className="page">
      <header className="header">
        <h1>디자인팀 업무 제안 승인</h1>
        <p>새 프로젝트에서 생성된 제안을 확인하고 수정/삭제 후 승인합니다.</p>
      </header>

      <section className="toolbar">
        <button onClick={() => void loadProposals()} disabled={loading || submitting}>
          새로고침
        </button>
        <button onClick={() => void approveSelected()} disabled={submitting || selectedCount === 0}>
          선택 승인 ({selectedCount})
        </button>
      </section>

      {!BASE_URL && <p className="error">`VITE_FUNCTIONS_BASE_URL` 환경변수가 필요합니다.</p>}
      {error && <p className="error">오류: {error}</p>}
      {loading && <p>로딩 중...</p>}

      <section className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>선택</th>
              <th>프로젝트</th>
              <th>업무</th>
              <th>업무구분</th>
              <th>마감일</th>
              <th>최종 완료 시점</th>
              <th>AI 제안</th>
              <th>삭제</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((proposal) => (
              <tr key={proposal.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selected[proposal.id])}
                    onChange={(event) => toggleSelection(proposal.id, event.target.checked)}
                  />
                </td>
                <td>{proposal.projectName}</td>
                <td>
                  <input
                    value={proposal.taskName}
                    onChange={(event) => updateLocalProposal(proposal.id, { taskName: event.target.value })}
                    onBlur={() => void saveProposalPatch(proposal.id, { taskName: proposal.taskName })}
                  />
                </td>
                <td>
                  <input
                    value={proposal.workCategory}
                    onChange={(event) => updateLocalProposal(proposal.id, { workCategory: event.target.value })}
                    onBlur={() => void saveProposalPatch(proposal.id, { workCategory: proposal.workCategory })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={proposal.dueDate ?? ''}
                    onChange={(event) => updateLocalProposal(proposal.id, { dueDate: event.target.value })}
                    onBlur={() => void saveProposalPatch(proposal.id, { dueDate: proposal.dueDate })}
                  />
                </td>
                <td>{proposal.finalDueText || '-'}</td>
                <td>
                  {proposal.aiDeadlineSuggestion
                    ? `행사일 ${proposal.aiDeadlineSuggestion.offsetDays}일`
                    : '-'}
                </td>
                <td>
                  <button className="danger" onClick={() => void deleteProposal(proposal.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

export default App
