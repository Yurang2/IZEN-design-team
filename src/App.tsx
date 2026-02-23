import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import './App.css'

type Route =
  | {
      kind: 'list'
    }
  | {
      kind: 'task'
      id: string
    }

type ApiSchemaField = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: 'exact' | 'fallback' | 'missing' | 'mismatch'
  optional?: boolean
  options: string[]
}

type ApiSchemaSummary = {
  fields: Record<string, ApiSchemaField>
  unknownFields: ApiSchemaField[]
  projectBindingMode: 'relation' | 'select' | 'unknown'
}

type TaskRecord = {
  id: string
  url: string
  projectKey: string
  projectName: string
  projectSource: 'relation' | 'select' | 'unknown'
  requester: string[]
  workType: string
  taskName: string
  status: string
  assignee: string[]
  startDate?: string
  dueDate?: string
  detail: string
  priority?: string
  urgent?: boolean
  issue?: string
}

type ProjectRecord = {
  id: string
  key: string
  bindingValue: string
  name: string
  eventDate?: string
  source: 'project_db' | 'task_select'
}

type ListTasksResponse = {
  ok: boolean
  tasks: TaskRecord[]
  nextCursor?: string
  hasMore: boolean
  schema: ApiSchemaSummary
  cacheTtlMs: number
}

type TaskResponse = {
  ok: boolean
  task: TaskRecord
  schema: ApiSchemaSummary
  cacheTtlMs?: number
}

type ProjectsResponse = {
  ok: boolean
  projects: ProjectRecord[]
  schema: ApiSchemaSummary
  cacheTtlMs: number
}

type Filters = {
  projectId: string
  status: string
  q: string
}

type CreateForm = {
  projectValue: string
  taskName: string
  workType: string
  status: string
  assigneeText: string
  startDate: string
  dueDate: string
  detail: string
}

type DetailForm = {
  projectValue: string
  taskName: string
  requesterText: string
  workType: string
  status: string
  assigneeText: string
  startDate: string
  dueDate: string
  detail: string
  priority: string
  urgent: boolean
  issue: string
}

declare global {
  interface Window {
    __APP_CONFIG__?: {
      FUNCTIONS_BASE_URL?: string
    }
  }
}

const POLLING_MS = 60_000

function toNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeFunctionsBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) {
    return trimmed
  }
  return `${trimmed}/api`
}

function parseRoute(pathname: string): Route {
  const cleaned = pathname.replace(/\/+$/, '') || '/'
  if (cleaned === '/') {
    return { kind: 'list' }
  }
  if (cleaned.startsWith('/task/')) {
    const id = cleaned.slice('/task/'.length)
    if (id) {
      return { kind: 'task', id: decodeURIComponent(id) }
    }
  }
  return { kind: 'list' }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function joinOrDash(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

function splitByComma(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const queryBaseUrl =
  typeof window !== 'undefined' ? toNonEmpty(new URLSearchParams(window.location.search).get('apiBase')) : undefined

if (typeof window !== 'undefined' && queryBaseUrl) {
  window.localStorage.setItem('FUNCTIONS_BASE_URL', queryBaseUrl)
}

const runtimeBaseUrl = typeof window !== 'undefined' ? toNonEmpty(window.__APP_CONFIG__?.FUNCTIONS_BASE_URL) : undefined
const localBaseUrl =
  typeof window !== 'undefined' ? toNonEmpty(window.localStorage.getItem('FUNCTIONS_BASE_URL')) : undefined
const buildTimeBaseUrl = toNonEmpty(import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined)
const RAW_FUNCTIONS_BASE_URL = runtimeBaseUrl ?? queryBaseUrl ?? localBaseUrl ?? buildTimeBaseUrl
const API_BASE_URL = RAW_FUNCTIONS_BASE_URL ? normalizeFunctionsBaseUrl(RAW_FUNCTIONS_BASE_URL) : undefined

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('`VITE_FUNCTIONS_BASE_URL` 또는 `window.__APP_CONFIG__.FUNCTIONS_BASE_URL` 설정이 필요합니다.')
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...init,
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      if (body.message) message = `${message}: ${body.message}`
      else if (body.error) message = `${message}: ${body.error}`
    } catch {
      const text = (await response.text()).trim()
      if (text) message = `${message}: ${text.slice(0, 120)}`
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function schemaUnknownMessage(schema: ApiSchemaSummary | null): string[] {
  if (!schema) return []
  return schema.unknownFields.map((field) => `${field.expectedName} (${field.expectedTypes.join('|')}) -> [UNKNOWN]`)
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [schema, setSchema] = useState<ApiSchemaSummary | null>(null)

  const [filters, setFilters] = useState<Filters>({
    projectId: '',
    status: '',
    q: '',
  })

  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('')
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Record<string, boolean>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>({
    projectValue: '',
    taskName: '',
    workType: '',
    status: '',
    assigneeText: '',
    startDate: '',
    dueDate: '',
    detail: '',
  })

  const [detailTask, setDetailTask] = useState<TaskRecord | null>(null)
  const [detailForm, setDetailForm] = useState<DetailForm | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setRoute(parseRoute(to))
  }, [])

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute(window.location.pathname))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const fetchProjects = useCallback(async () => {
    const response = await api<ProjectsResponse>('/projects')
    setProjects(response.projects)
    setSchema(response.schema)
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoadingList(true)
    setListError(null)

    try {
      const params = new URLSearchParams()
      if (filters.projectId) params.set('projectId', filters.projectId)
      if (filters.status) params.set('status', filters.status)
      if (filters.q) params.set('q', filters.q)

      const path = params.size > 0 ? `/tasks?${params.toString()}` : '/tasks'
      const response = await api<ListTasksResponse>(path)
      setTasks(response.tasks)
      setSchema(response.schema)
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
    } catch (error: any) {
      setListError(error?.message ?? '업무 목록을 불러오지 못했습니다.')
    } finally {
      setLoadingList(false)
    }
  }, [filters.projectId, filters.q, filters.status])

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  useEffect(() => {
    if (route.kind !== 'list') return

    void fetchTasks()
    const timer = window.setInterval(() => {
      void fetchTasks()
    }, POLLING_MS)

    return () => window.clearInterval(timer)
  }, [fetchTasks, route.kind])

  const refreshListAndProjects = useCallback(async () => {
    await Promise.all([fetchProjects(), fetchTasks()])
  }, [fetchProjects, fetchTasks])

  const groupedTasks = useMemo(() => {
    const map = new Map<string, { projectName: string; tasks: TaskRecord[] }>()

    for (const task of tasks) {
      const key = task.projectName || '[UNKNOWN]'
      const current = map.get(key)
      if (current) {
        current.tasks.push(task)
      } else {
        map.set(key, { projectName: key, tasks: [task] })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko'))
  }, [tasks])

  const statusOptions = useMemo(() => {
    const fromSchema = schema?.fields.status?.options ?? []
    const fromTasks = tasks.map((task) => task.status).filter(Boolean)
    return unique([...fromSchema, ...fromTasks])
  }, [schema, tasks])

  const workTypeOptions = useMemo(() => {
    const fromSchema = schema?.fields.workType?.options ?? []
    const fromTasks = tasks.map((task) => task.workType).filter(Boolean)
    return unique([...fromSchema, ...fromTasks])
  }, [schema, tasks])

  const unknownMessages = schemaUnknownMessage(schema)

  const onChangeFilter = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const onCreateInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setCreateForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const onQuickStatusChange = async (taskId: string, nextStatus: string) => {
    const previous = tasks
    setStatusUpdatingIds((prev) => ({ ...prev, [taskId]: true }))
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)))

    try {
      const response = await api<TaskResponse>(`/tasks/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })

      setTasks((prev) => prev.map((task) => (task.id === taskId ? response.task : task)))
      setSchema(response.schema)
    } catch (error: any) {
      setTasks(previous)
      setListError(error?.message ?? '상태 변경에 실패했습니다.')
    } finally {
      setStatusUpdatingIds((prev) => ({ ...prev, [taskId]: false }))
    }
  }

  const onCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!createForm.taskName.trim()) {
      setListError('새 업무 생성 시 `업무`는 필수입니다.')
      return
    }

    setCreateSubmitting(true)
    setListError(null)

    try {
      const payload: Record<string, unknown> = {
        taskName: createForm.taskName.trim(),
        workType: createForm.workType.trim() || undefined,
        status: createForm.status.trim() || undefined,
        assignee: splitByComma(createForm.assigneeText),
        startDate: createForm.startDate || undefined,
        dueDate: createForm.dueDate || undefined,
        detail: createForm.detail.trim() || undefined,
      }

      if (schema?.projectBindingMode === 'relation') {
        payload.projectId = createForm.projectValue || undefined
      } else {
        payload.projectName = createForm.projectValue || undefined
      }

      const created = await api<TaskResponse>('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setSchema(created.schema)
      setCreateOpen(false)
      setCreateForm({
        projectValue: '',
        taskName: '',
        workType: '',
        status: '',
        assigneeText: '',
        startDate: '',
        dueDate: '',
        detail: '',
      })

      await refreshListAndProjects()
      navigate(`/task/${encodeURIComponent(created.task.id)}`)
    } catch (error: any) {
      setListError(error?.message ?? '업무 생성에 실패했습니다.')
    } finally {
      setCreateSubmitting(false)
    }
  }

  const fetchTaskDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true)
      setDetailError(null)

      try {
        const response = await api<TaskResponse>(`/tasks/${encodeURIComponent(id)}`)
        setSchema(response.schema)
        setDetailTask(response.task)
        setDetailForm({
          projectValue: response.task.projectKey,
          taskName: response.task.taskName,
          requesterText: response.task.requester.join(', '),
          workType: response.task.workType === '[UNKNOWN]' ? '' : response.task.workType,
          status: response.task.status === '[UNKNOWN]' ? '' : response.task.status,
          assigneeText: response.task.assignee.join(', '),
          startDate: response.task.startDate ?? '',
          dueDate: response.task.dueDate ?? '',
          detail: response.task.detail,
          priority: response.task.priority ?? '',
          urgent: Boolean(response.task.urgent),
          issue: response.task.issue ?? '',
        })
      } catch (error: any) {
        setDetailError(error?.message ?? '업무 상세를 불러오지 못했습니다.')
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (route.kind !== 'task') return
    void fetchTaskDetail(route.id)
  }, [fetchTaskDetail, route])

  const onDetailInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (!detailForm) return

    const { name, value } = event.target
    if (name === 'urgent') {
      const checkbox = event.target as HTMLInputElement
      setDetailForm({
        ...detailForm,
        urgent: checkbox.checked,
      })
      return
    }

    setDetailForm({
      ...detailForm,
      [name]: value,
    })
  }

  const onDetailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!route || route.kind !== 'task' || !detailForm) return

    setDetailSaving(true)
    setDetailError(null)

    try {
      const payload: Record<string, unknown> = {
        taskName: detailForm.taskName.trim(),
        requester: splitByComma(detailForm.requesterText),
        workType: detailForm.workType.trim() || null,
        status: detailForm.status.trim() || null,
        assignee: splitByComma(detailForm.assigneeText),
        startDate: detailForm.startDate || null,
        dueDate: detailForm.dueDate || null,
        detail: detailForm.detail.trim() || null,
        priority: detailForm.priority.trim() || null,
        urgent: detailForm.urgent,
        issue: detailForm.issue.trim() || null,
      }

      if (schema?.projectBindingMode === 'relation') {
        payload.projectId = detailForm.projectValue || null
      } else {
        payload.projectName = detailForm.projectValue || null
      }

      const response = await api<TaskResponse>(`/tasks/${encodeURIComponent(route.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      setDetailTask(response.task)
      setSchema(response.schema)
      await refreshListAndProjects()
    } catch (error: any) {
      setDetailError(error?.message ?? '업무 저장에 실패했습니다.')
    } finally {
      setDetailSaving(false)
    }
  }

  if (route.kind === 'task') {
    return (
      <div className="page">
        <header className="header">
          <h1>업무 상세</h1>
          <p>Notion DB 기반 단일 업무 조회/수정</p>
        </header>

        <div className="toolbar">
          <button type="button" className="secondary" onClick={() => navigate('/')}>
            목록으로
          </button>
          {detailTask?.url ? (
            <a className="linkButton" href={detailTask.url} target="_blank" rel="noreferrer">
              Notion 원본 열기
            </a>
          ) : null}
        </div>

        {unknownMessages.length > 0 ? (
          <section className="warningBox">
            <strong>스키마 경고 ([UNKNOWN] fallback)</strong>
            <ul>
              {unknownMessages.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {detailLoading ? <p className="muted">상세 로딩 중...</p> : null}
        {detailError ? <p className="error">{detailError}</p> : null}

        {!detailLoading && detailForm ? (
          <form className="detailForm" onSubmit={onDetailSubmit}>
            <label>
              귀속 프로젝트
              <select name="projectValue" value={detailForm.projectValue} onChange={onDetailInput}>
                <option value="">선택 안 함</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.bindingValue}>
                    {project.name} {project.source === 'task_select' ? '(select)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              업무
              <input name="taskName" value={detailForm.taskName} onChange={onDetailInput} required />
            </label>

            <label>
              요청주체
              <input name="requesterText" value={detailForm.requesterText} onChange={onDetailInput} placeholder="쉼표로 구분" />
            </label>

            <label>
              업무구분
              <input name="workType" list="workTypeOptions" value={detailForm.workType} onChange={onDetailInput} />
            </label>

            <label>
              상태
              <input name="status" list="statusOptions" value={detailForm.status} onChange={onDetailInput} />
            </label>

            <label>
              담당자
              <input name="assigneeText" value={detailForm.assigneeText} onChange={onDetailInput} placeholder="쉼표로 구분" />
            </label>

            <label>
              시작일
              <input type="date" name="startDate" value={detailForm.startDate} onChange={onDetailInput} />
            </label>

            <label>
              마감일
              <input type="date" name="dueDate" value={detailForm.dueDate} onChange={onDetailInput} />
            </label>

            <label>
              우선순위
              <input name="priority" value={detailForm.priority} onChange={onDetailInput} />
            </label>

            <label className="checkboxLabel">
              <input type="checkbox" name="urgent" checked={detailForm.urgent} onChange={onDetailInput} />
              긴급
            </label>

            <label>
              이슈
              <textarea name="issue" value={detailForm.issue} onChange={onDetailInput} rows={3} />
            </label>

            <label className="fullWidth">
              업무상세
              <textarea name="detail" value={detailForm.detail} onChange={onDetailInput} rows={8} />
            </label>

            <div className="actions fullWidth">
              <button type="submit" disabled={detailSaving}>
                {detailSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        ) : null}

        <datalist id="statusOptions">
          {statusOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <datalist id="workTypeOptions">
          {workTypeOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="header">
        <h1>노션 스타일 업무 협업툴 (MVP)</h1>
        <p>60초 폴링 + Optimistic 업데이트</p>
      </header>

      <section className="toolbar toolbarWrap">
        <button type="button" onClick={() => setCreateOpen(true)}>
          + 새 업무
        </button>
        <button type="button" className="secondary" onClick={() => void refreshListAndProjects()}>
          새로고침
        </button>
        <span className="syncLabel">마지막 동기화: {lastSyncedAt || '-'}</span>
      </section>

      <section className="filters">
        <label>
          프로젝트
          <select name="projectId" value={filters.projectId} onChange={onChangeFilter}>
            <option value="">전체</option>
            {projects.map((project) => (
              <option key={project.id} value={project.bindingValue}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          상태
          <select name="status" value={filters.status} onChange={onChangeFilter}>
            <option value="">전체</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label>
          검색
          <input name="q" value={filters.q} onChange={onChangeFilter} placeholder="업무/상세 검색" />
        </label>
      </section>

      {unknownMessages.length > 0 ? (
        <section className="warningBox">
          <strong>스키마 경고 ([UNKNOWN] fallback)</strong>
          <ul>
            {unknownMessages.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {loadingList ? <p className="muted">업무 목록 로딩 중...</p> : null}
      {listError ? <p className="error">{listError}</p> : null}

      <section className="projectGroups">
        {groupedTasks.map((group) => (
          <article className="projectSection" key={group.projectName}>
            <header className="projectHeader">
              <h2>{group.projectName}</h2>
              <span>{group.tasks.length}건</span>
            </header>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>요청주체</th>
                    <th>업무구분</th>
                    <th>업무</th>
                    <th>상태</th>
                    <th>담당자</th>
                    <th>시작일</th>
                    <th>마감일</th>
                  </tr>
                </thead>
                <tbody>
                  {group.tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{joinOrDash(task.requester)}</td>
                      <td>{task.workType || '-'}</td>
                      <td>
                        <button type="button" className="taskLink" onClick={() => navigate(`/task/${encodeURIComponent(task.id)}`)}>
                          {task.taskName}
                        </button>
                      </td>
                      <td>
                        <select
                          value={task.status}
                          disabled={Boolean(statusUpdatingIds[task.id])}
                          onChange={(event) => void onQuickStatusChange(task.id, event.target.value)}
                        >
                          {unique([...statusOptions, task.status]).map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{joinOrDash(task.assignee)}</td>
                      <td>{task.startDate || '-'}</td>
                      <td>{task.dueDate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}

        {!loadingList && groupedTasks.length === 0 ? <p className="muted">조건에 맞는 업무가 없습니다.</p> : null}
      </section>

      {createOpen ? (
        <div className="modalBackdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>새 업무 만들기</h3>
            <form onSubmit={onCreateSubmit} className="createForm">
              <label>
                귀속 프로젝트
                <select name="projectValue" value={createForm.projectValue} onChange={onCreateInput}>
                  <option value="">선택 안 함</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.bindingValue}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                업무
                <input name="taskName" value={createForm.taskName} onChange={onCreateInput} required />
              </label>

              <label>
                업무구분
                <input name="workType" list="workTypeOptions" value={createForm.workType} onChange={onCreateInput} />
              </label>

              <label>
                상태
                <input name="status" list="statusOptions" value={createForm.status} onChange={onCreateInput} />
              </label>

              <label>
                담당자
                <input name="assigneeText" value={createForm.assigneeText} onChange={onCreateInput} placeholder="쉼표로 구분" />
              </label>

              <label>
                시작일
                <input type="date" name="startDate" value={createForm.startDate} onChange={onCreateInput} />
              </label>

              <label>
                마감일
                <input type="date" name="dueDate" value={createForm.dueDate} onChange={onCreateInput} />
              </label>

              <label className="fullWidth">
                업무상세
                <textarea name="detail" rows={6} value={createForm.detail} onChange={onCreateInput} />
              </label>

              <div className="actions fullWidth">
                <button type="button" className="secondary" onClick={() => setCreateOpen(false)}>
                  취소
                </button>
                <button type="submit" disabled={createSubmitting}>
                  {createSubmitting ? '생성 중...' : '생성'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <datalist id="statusOptions">
        {statusOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <datalist id="workTypeOptions">
        {workTypeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}

export default App
