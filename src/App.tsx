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

declare global {
  interface Window {
    __APP_CONFIG__?: {
      FUNCTIONS_BASE_URL?: string
    }
  }
}

const queryBaseUrl =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('apiBase') ?? undefined : undefined

if (typeof window !== 'undefined' && queryBaseUrl) {
  window.localStorage.setItem('FUNCTIONS_BASE_URL', queryBaseUrl)
}

const localBaseUrl =
  typeof window !== 'undefined' ? window.localStorage.getItem('FUNCTIONS_BASE_URL') ?? undefined : undefined
const runtimeBaseUrl =
  typeof window !== 'undefined' ? window.__APP_CONFIG__?.FUNCTIONS_BASE_URL : undefined
const buildTimeBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined
const BASE_URL = (runtimeBaseUrl ?? queryBaseUrl ?? localBaseUrl ?? buildTimeBaseUrl)?.trim().replace(/\/+$/, '')

function normalizeApiBaseUrl(value: string): string {
  return value
    .trim()
    .replace(/\/(listPendingProposals|updateProposal|deleteProposal|approveProposals)\/?$/, '')
    .replace(/\/+$/, '')
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE_URL) {
    throw new Error(
      '`VITE_FUNCTIONS_BASE_URL` 또는 `/app-config.js`의 `FUNCTIONS_BASE_URL`가 설정되지 않았습니다. (?apiBase=https://...)',
    )
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
  const [apiBaseInput, setApiBaseInput] = useState(BASE_URL ?? '')
  const [projectIdInput, setProjectIdInput] = useState('izen-design-team')
  const [regionInput, setRegionInput] = useState('asia-northeast3')
  const [connectionHint, setConnectionHint] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)

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

  const saveApiBase = () => {
    const normalized = normalizeApiBaseUrl(apiBaseInput)
    if (!normalized) {
      window.localStorage.removeItem('FUNCTIONS_BASE_URL')
      window.location.reload()
      return
    }

    window.localStorage.setItem('FUNCTIONS_BASE_URL', normalized)
    window.location.reload()
  }

  const clearApiBase = () => {
    window.localStorage.removeItem('FUNCTIONS_BASE_URL')
    window.location.reload()
  }

  const fillByProjectId = () => {
    const projectId = projectIdInput.trim()
    const region = regionInput.trim() || 'asia-northeast3'
    if (!projectId) {
      setConnectionHint('프로젝트 ID를 먼저 입력하세요.')
      return
    }

    setApiBaseInput(`https://${region}-${projectId}.cloudfunctions.net`)
    setConnectionHint(null)
  }

  const testConnection = async () => {
    const base = normalizeApiBaseUrl(apiBaseInput)
    if (!base) {
      setConnectionHint('먼저 API URL을 입력하세요.')
      return
    }

    setTestingConnection(true)
    setConnectionHint(null)
    try {
      const response = await fetch(`${base}/listPendingProposals`)
      const contentType = response.headers.get('content-type') ?? ''

      if (!response.ok) {
        setConnectionHint(`연결 실패: HTTP ${response.status}`)
        return
      }
      if (!contentType.includes('application/json')) {
        setConnectionHint(`연결 실패: JSON 아님 (${contentType || 'unknown'})`)
        return
      }

      setConnectionHint('연결 성공: 이 URL을 저장해도 됩니다.')
    } catch {
      setConnectionHint('연결 실패: URL 또는 CORS/배포 상태를 확인하세요.')
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <main className="page">
      <header className="header">
        <h1>디자인팀 업무 제안 승인</h1>
        <p>새 프로젝트에서 생성된 제안을 확인하고 수정/삭제 후 승인합니다.</p>
      </header>

      <section className="toolbar">
        <button onClick={() => void loadProposals()} disabled={!BASE_URL || loading || submitting}>
          새로고침
        </button>
        <button onClick={() => void approveSelected()} disabled={!BASE_URL || submitting || selectedCount === 0}>
          선택 승인 ({selectedCount})
        </button>
      </section>

      <section className="configPanel">
        <p>Functions API Base URL</p>
        <div className="configRow">
          <input
            type="text"
            placeholder="firebase project id"
            value={projectIdInput}
            onChange={(event) => setProjectIdInput(event.target.value)}
          />
          <input
            type="text"
            placeholder="region (asia-northeast3)"
            value={regionInput}
            onChange={(event) => setRegionInput(event.target.value)}
          />
          <button onClick={fillByProjectId}>URL 자동생성</button>
        </div>
        <input
          type="text"
          placeholder="https://<region>-<project-id>.cloudfunctions.net"
          value={apiBaseInput}
          onChange={(event) => setApiBaseInput(event.target.value)}
        />
        <div className="configActions">
          <button onClick={() => void testConnection()} disabled={testingConnection}>
            {testingConnection ? '연결 테스트 중...' : '연결 테스트'}
          </button>
          <button onClick={saveApiBase}>저장 후 다시연결</button>
          <button className="danger" onClick={clearApiBase}>
            설정 초기화
          </button>
        </div>
        {connectionHint && <p className="hint">{connectionHint}</p>}
      </section>

      {!BASE_URL && <p className="error">먼저 위에 Functions API Base URL을 입력하고 저장하세요.</p>}
      {error && <p className="error">오류: {error}</p>}
      {error?.includes('JSON이 아닌 응답') && (
        <p className="error">입력한 URL이 API가 아니라 웹페이지 주소일 가능성이 큽니다. `...cloudfunctions.net` 주소를 넣어주세요.</p>
      )}
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
