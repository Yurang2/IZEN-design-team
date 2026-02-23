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
  iconEmoji?: string
  iconUrl?: string
  coverUrl?: string
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

type ChecklistPreviewItem = {
  id: string
  productName: string
  workCategory: string
  finalDueText: string
  eventCategories: string[]
  designLeadDays?: number
  productionLeadDays?: number
  bufferDays?: number
  totalLeadDays?: number
  computedDueDate?: string
}

type ChecklistPreviewResponse = {
  ok: boolean
  eventName: string
  eventCategory: string
  availableCategories: string[]
  count: number
  items: ChecklistPreviewItem[]
  cacheTtlMs: number
}

type ChecklistAssignmentsResponse = {
  ok: boolean
  assignments: Record<string, string>
  storageMode?: 'd1' | 'cache'
}

type ChecklistAssignmentsExportResponse = {
  ok: boolean
  exportedAt: string
  storageMode: 'd1' | 'cache'
  counts: {
    assignments: number
    logs: number
  }
  limits: {
    logLimit: number
  }
  assignments: Record<string, string>
  logs: Array<{
    id: number
    key: string
    eventCategory: string
    itemId: string
    previousTaskId: string | null
    taskId: string | null
    action: string
    actor: string | null
    ip: string | null
    userAgent: string | null
    createdAt: number
  }>
}

type MetaResponse = {
  ok: boolean
  databases: {
    project: { id: string; url: string | null }
    task: { id: string; url: string | null }
    checklist: { id: string | null; url: string | null }
  }
}

type Filters = {
  projectId: string
  status: string
  q: string
}

type TaskViewFilters = {
  workType: string
  assignee: string
  requester: string
  dueFrom: string
  dueTo: string
  urgentOnly: boolean
  hideDone: boolean
}

type TopView = 'projects' | 'tasks' | 'schedule' | 'checklist'

type ProjectSort = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc'
type TaskSort = 'due_asc' | 'due_desc' | 'start_asc' | 'start_desc' | 'status_asc' | 'name_asc'
type ChecklistSort = 'due_asc' | 'due_desc' | 'name_asc' | 'name_desc' | 'lead_asc' | 'lead_desc'
type TaskLayoutMode = 'list' | 'board'

type ChecklistPreviewFilters = {
  eventName: string
  eventCategory: string
  shippingDate: string
  operationMode: '' | 'self' | 'dealer'
  fulfillmentMode: '' | 'domestic' | 'overseas' | 'dealer'
}

type ChecklistAssignmentTarget = {
  itemId: string
  productName: string
  workCategory: string
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

type ApiCheckState = 'idle' | 'checking' | 'ok' | 'error'

declare global {
  interface Window {
    __APP_CONFIG__?: {
      API_BASE_URL?: string
      FUNCTIONS_BASE_URL?: string
    }
  }
}

const POLLING_MS = 60_000
const TASK_PAGE_SIZE = 100
const MAX_TASK_PAGES = 30
const CHECKLIST_ASSIGNMENT_STORAGE_KEY = 'checklist-assignment-v1'

function toNonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function normalizeApiBase(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return '/api'
  if (trimmed === '/api' || trimmed.endsWith('/api')) return trimmed
  if (trimmed.startsWith('/')) return `${trimmed}/api`
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

function toProjectLabel(project: ProjectRecord): string {
  if (project.iconEmoji) return `${project.iconEmoji} ${project.name}`
  return project.name
}

function toProjectThumbUrl(project: ProjectRecord | undefined): string | undefined {
  if (!project) return undefined
  return project.coverUrl || project.iconUrl
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

function normalizeIsoDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function toNotionUrlById(id: string | undefined): string | null {
  if (!id) return null
  const normalized = id.replace(/-/g, '').trim()
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

function asSortDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-12-31'
}

function toExportFilename(prefix: string): string {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${prefix}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.json`
}

function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLabel(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(parsed)
}

function getChecklistTotalLeadDays(item: ChecklistPreviewItem): number | undefined {
  if (typeof item.totalLeadDays === 'number') return item.totalLeadDays
  const hasAny =
    typeof item.designLeadDays === 'number' || typeof item.productionLeadDays === 'number' || typeof item.bufferDays === 'number'
  if (!hasAny) return undefined
  return (item.designLeadDays ?? 0) + (item.productionLeadDays ?? 0) + (item.bufferDays ?? 0)
}

function computeChecklistDueDate(eventDate: string | undefined, item: ChecklistPreviewItem): string | undefined {
  if (!eventDate) return undefined
  const base = parseIsoDate(eventDate)
  if (!base) return undefined
  const totalLead = getChecklistTotalLeadDays(item)
  if (typeof totalLead !== 'number') return undefined
  return toIsoDate(addDays(base, -totalLead))
}

function toChecklistAssignmentKey(eventCategory: string, itemId: string): string {
  const categoryKey = eventCategory.trim() || 'ALL'
  return `${categoryKey}::${itemId}`
}

function getApiBaseFromRuntime(): string {
  const buildTimeBaseUrl =
    toNonEmpty(import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    toNonEmpty(import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined) ??
    '/api'

  if (typeof window === 'undefined') {
    return normalizeApiBase(buildTimeBaseUrl)
  }

  const queryValue = toNonEmpty(new URLSearchParams(window.location.search).get('apiBase'))
  if (queryValue) {
    const normalized = normalizeApiBase(queryValue)
    window.localStorage.setItem('API_BASE_URL', normalized)
    window.localStorage.setItem('FUNCTIONS_BASE_URL', normalized)
    return normalized
  }

  const runtimeBaseUrl =
    toNonEmpty(window.__APP_CONFIG__?.API_BASE_URL) ?? toNonEmpty(window.__APP_CONFIG__?.FUNCTIONS_BASE_URL)
  if (runtimeBaseUrl) return normalizeApiBase(runtimeBaseUrl)

  const stored =
    toNonEmpty(window.localStorage.getItem('API_BASE_URL')) ??
    toNonEmpty(window.localStorage.getItem('FUNCTIONS_BASE_URL'))
  if (stored) return normalizeApiBase(stored)

  return normalizeApiBase(buildTimeBaseUrl)
}

const API_BASE_URL = getApiBaseFromRuntime()

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const headers = new Headers(init?.headers ?? undefined)
  const method = (init?.method ?? 'GET').toUpperCase()
  if (!headers.has('Content-Type') && init?.body != null && method !== 'GET' && method !== 'HEAD') {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...init,
    headers,
  })
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase()
  const raw = await response.text()
  const trimmed = raw.trim()
  const looksHtml = trimmed.toLowerCase().startsWith('<!doctype') || trimmed.toLowerCase().startsWith('<html')

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = JSON.parse(raw) as { error?: string; message?: string }
      if (body.message) message = `${message}: ${body.message}`
      else if (body.error) message = `${message}: ${body.error}`
    } catch {
      if (looksHtml) {
        message = `${message}: API가 HTML을 반환했습니다. VITE_API_BASE_URL(${API_BASE_URL})이 Worker API를 가리키는지 확인하세요.`
      } else if (trimmed) {
        message = `${message}: ${trimmed.slice(0, 120)}`
      }
    }
    throw new Error(message)
  }

  if (!contentType.includes('application/json')) {
    if (looksHtml) {
      throw new Error(`API가 JSON 대신 HTML을 반환했습니다. VITE_API_BASE_URL(${API_BASE_URL})이 Worker API 주소인지 확인하세요.`)
    }
    throw new Error(`API 응답 타입이 JSON이 아닙니다: ${contentType || 'unknown'}`)
  }

  return JSON.parse(raw) as T
}

function schemaUnknownMessage(schema: ApiSchemaSummary | null): string[] {
  if (!schema) return []
  return schema.unknownFields.map((field) => `${field.expectedName} (${field.expectedTypes.join('|')}) -> [UNKNOWN]`)
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [activeView, setActiveView] = useState<TopView>('tasks')
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [projectSort, setProjectSort] = useState<ProjectSort>('name_asc')
  const [taskSort, setTaskSort] = useState<TaskSort>('due_asc')
  const [taskLayout, setTaskLayout] = useState<TaskLayoutMode>('list')
  const [checklistSort, setChecklistSort] = useState<ChecklistSort>('due_asc')

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [schema, setSchema] = useState<ApiSchemaSummary | null>(null)
  const [dbLinks, setDbLinks] = useState<{
    project: string | null
    task: string | null
    checklist: string | null
  }>({
    project: null,
    task: null,
    checklist: null,
  })

  const [filters, setFilters] = useState<Filters>({
    projectId: '',
    status: '',
    q: '',
  })
  const [taskViewFilters, setTaskViewFilters] = useState<TaskViewFilters>({
    workType: '',
    assignee: '',
    requester: '',
    dueFrom: '',
    dueTo: '',
    urgentOnly: false,
    hideDone: false,
  })

  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('')
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Record<string, boolean>>({})
  const [checklistFilters, setChecklistFilters] = useState<ChecklistPreviewFilters>({
    eventName: '',
    eventCategory: '',
    shippingDate: '',
    operationMode: '',
    fulfillmentMode: '',
  })
  const [checklistItems, setChecklistItems] = useState<ChecklistPreviewItem[]>([])
  const [checklistCategories, setChecklistCategories] = useState<string[]>([])
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [assignmentSyncError, setAssignmentSyncError] = useState<string | null>(null)
  const [assignmentStorageMode, setAssignmentStorageMode] = useState<'d1' | 'cache'>('cache')
  const [assignmentByChecklist, setAssignmentByChecklist] = useState<Record<string, string>>({})
  const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({})
  const [assignmentTarget, setAssignmentTarget] = useState<ChecklistAssignmentTarget | null>(null)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentProjectFilter, setAssignmentProjectFilter] = useState('')
  const [apiCheckState, setApiCheckState] = useState<ApiCheckState>('idle')
  const [apiCheckMessage, setApiCheckMessage] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string>('')

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

  const fetchMeta = useCallback(async () => {
    try {
      const response = await api<MetaResponse>('/meta')
      setDbLinks({
        project: response.databases.project.url ?? toNotionUrlById(response.databases.project.id),
        task: response.databases.task.url ?? toNotionUrlById(response.databases.task.id),
        checklist: response.databases.checklist.url ?? toNotionUrlById(response.databases.checklist.id ?? undefined),
      })
    } catch {
      // Ignore meta failures; app can run without DB deep-links.
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    setLoadingList(true)
    setListError(null)

    try {
      const allTasks: TaskRecord[] = []
      let cursor: string | undefined
      let page = 0
      let lastSchema: ApiSchemaSummary | null = null
      let hasMore = false

      do {
        const params = new URLSearchParams()
        if (filters.projectId) params.set('projectId', filters.projectId)
        if (filters.status) params.set('status', filters.status)
        if (filters.q) params.set('q', filters.q)
        params.set('pageSize', String(TASK_PAGE_SIZE))
        if (cursor) params.set('cursor', cursor)

        const path = `/tasks?${params.toString()}`
        const response = await api<ListTasksResponse>(path)
        allTasks.push(...response.tasks)
        lastSchema = response.schema
        hasMore = response.hasMore
        cursor = response.nextCursor
        page += 1
      } while (hasMore && cursor && page < MAX_TASK_PAGES)

      const dedupedTasks = Array.from(new Map(allTasks.map((task) => [task.id, task])).values())

      setTasks(dedupedTasks)
      if (lastSchema) {
        setSchema(lastSchema)
      }
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))

      if (hasMore && page >= MAX_TASK_PAGES) {
        setListError('업무가 매우 많아 일부만 표시될 수 있습니다. 필터를 좁혀 주세요.')
      }
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
    void fetchMeta()
  }, [fetchMeta, route.kind])

  useEffect(() => {
    if (route.kind !== 'list') return

    void fetchTasks()
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      void fetchTasks()
    }, POLLING_MS)

    return () => window.clearInterval(timer)
  }, [fetchTasks, route.kind])

  const fetchChecklistPreview = useCallback(async (input: ChecklistPreviewFilters) => {
    setChecklistLoading(true)
    setChecklistError(null)

    try {
      const params = new URLSearchParams()
      const selectedProject = projects.find((project) => project.source === 'project_db' && project.name === input.eventName)
      if (input.eventName.trim()) params.set('eventName', input.eventName.trim())
      if (input.eventCategory.trim()) params.set('eventCategory', input.eventCategory.trim())
      if (selectedProject?.eventDate) params.set('eventDate', selectedProject.eventDate)
      if (parseIsoDate(input.shippingDate)) params.set('shippingDate', input.shippingDate)
      if (input.operationMode) params.set('operationMode', input.operationMode)
      if (input.fulfillmentMode) params.set('fulfillmentMode', input.fulfillmentMode)

      const path = params.size > 0 ? `/checklists?${params.toString()}` : '/checklists'
      const response = await api<ChecklistPreviewResponse>(path)
      setChecklistItems(response.items)
      setChecklistCategories(response.availableCategories)
    } catch (error: any) {
      setChecklistError(error?.message ?? '체크리스트 미리보기를 불러오지 못했습니다.')
    } finally {
      setChecklistLoading(false)
    }
  }, [projects])

  const fetchChecklistAssignments = useCallback(async () => {
    try {
      const response = await api<ChecklistAssignmentsResponse>('/checklist-assignments')
      setAssignmentByChecklist(response.assignments ?? {})
      if (response.storageMode) setAssignmentStorageMode(response.storageMode)
    } catch {
      // Server assignment store is optional; keep local cache fallback.
    }
  }, [])

  const runApiConnectionTest = useCallback(async () => {
    setApiCheckState('checking')
    setApiCheckMessage('API 연결 확인 중...')
    try {
      const [projects, checklists] = await Promise.all([
        api<ProjectsResponse>('/projects'),
        api<ChecklistPreviewResponse>('/checklists'),
      ])
      setApiCheckState('ok')
      setApiCheckMessage(`정상 연결: 프로젝트 ${projects.projects.length}건, 체크리스트 ${checklists.items.length}건`)
    } catch (error: any) {
      setApiCheckState('error')
      setApiCheckMessage(error?.message ?? 'API 연결 확인 실패')
    }
  }, [])

  const onManualExport = useCallback(async () => {
    setExporting(true)
    setExportMessage('')
    try {
      const response = await api<ChecklistAssignmentsExportResponse>('/checklist-assignments/export?logLimit=5000')
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = toExportFilename('checklist-assignments-export')
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setExportMessage(
        `내보내기 완료: assignments ${response.counts.assignments}건, logs ${response.counts.logs}건 (${response.storageMode})`,
      )
    } catch (error: any) {
      setExportMessage(error?.message ?? '내보내기에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }, [])

  useEffect(() => {
    if (route.kind !== 'list') return
    void fetchChecklistPreview(checklistFilters)
  }, [fetchChecklistPreview, route.kind])

  useEffect(() => {
    if (route.kind !== 'list') return
    void fetchChecklistAssignments()
  }, [fetchChecklistAssignments, route.kind])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(CHECKLIST_ASSIGNMENT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed && typeof parsed === 'object') {
        setAssignmentByChecklist(parsed)
      }
    } catch {
      // ignore broken local cache
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CHECKLIST_ASSIGNMENT_STORAGE_KEY, JSON.stringify(assignmentByChecklist))
  }, [assignmentByChecklist])

  const refreshListAndProjects = useCallback(async () => {
    await Promise.all([fetchProjects(), fetchTasks()])
  }, [fetchProjects, fetchTasks])

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (taskViewFilters.workType && task.workType !== taskViewFilters.workType) return false
      if (taskViewFilters.assignee && !task.assignee.includes(taskViewFilters.assignee)) return false
      if (taskViewFilters.requester && !task.requester.includes(taskViewFilters.requester)) return false
      if (taskViewFilters.urgentOnly && !task.urgent) return false
      if (taskViewFilters.hideDone && (task.status === '완료' || task.status === '보관')) return false

      if (taskViewFilters.dueFrom) {
        if (!task.dueDate || task.dueDate < taskViewFilters.dueFrom) return false
      }
      if (taskViewFilters.dueTo) {
        if (!task.dueDate || task.dueDate > taskViewFilters.dueTo) return false
      }

      return true
    })
  }, [taskViewFilters.assignee, taskViewFilters.dueFrom, taskViewFilters.dueTo, taskViewFilters.hideDone, taskViewFilters.requester, taskViewFilters.urgentOnly, taskViewFilters.workType, tasks])

  const sortedFilteredTasks = useMemo(() => {
    const copy = [...filteredTasks]
    copy.sort((a, b) => {
      if (taskSort === 'due_asc') return asSortDate(a.dueDate).localeCompare(asSortDate(b.dueDate))
      if (taskSort === 'due_desc') return asSortDate(b.dueDate).localeCompare(asSortDate(a.dueDate))
      if (taskSort === 'start_asc') return asSortDate(a.startDate).localeCompare(asSortDate(b.startDate))
      if (taskSort === 'start_desc') return asSortDate(b.startDate).localeCompare(asSortDate(a.startDate))
      if (taskSort === 'status_asc') return (a.status || '').localeCompare(b.status || '', 'ko')
      return (a.taskName || '').localeCompare(b.taskName || '', 'ko')
    })
    return copy
  }, [filteredTasks, taskSort])

  const groupedTasks = useMemo(() => {
    const map = new Map<string, { projectName: string; tasks: TaskRecord[] }>()

    for (const task of sortedFilteredTasks) {
      const key = task.projectName || '[UNKNOWN]'
      const current = map.get(key)
      if (current) {
        current.tasks.push(task)
      } else {
        map.set(key, { projectName: key, tasks: [task] })
      }
    }

    return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName, 'ko'))
  }, [sortedFilteredTasks])

  const tasksByStatus = useMemo(() => {
    const map = new Map<string, TaskRecord[]>()
    for (const task of sortedFilteredTasks) {
      const key = task.status || '미분류'
      const current = map.get(key)
      if (current) current.push(task)
      else map.set(key, [task])
    }
    return Array.from(map.entries())
      .map(([status, items]) => ({ status, items }))
      .sort((a, b) => a.status.localeCompare(b.status, 'ko'))
  }, [sortedFilteredTasks])

  const projectDbOptions = useMemo(
    () =>
      projects
        .filter((project) => project.source === 'project_db')
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [projects],
  )

  const sortedProjectDbOptions = useMemo(() => {
    const copy = [...projectDbOptions]
    copy.sort((a, b) => {
      if (projectSort === 'name_asc') return a.name.localeCompare(b.name, 'ko')
      if (projectSort === 'name_desc') return b.name.localeCompare(a.name, 'ko')
      if (projectSort === 'date_asc') return asSortDate(a.eventDate).localeCompare(asSortDate(b.eventDate))
      return asSortDate(b.eventDate).localeCompare(asSortDate(a.eventDate))
    })
    return copy
  }, [projectDbOptions, projectSort])

  const selectedChecklistProject = useMemo(
    () => projectDbOptions.find((project) => project.name === checklistFilters.eventName),
    [checklistFilters.eventName, projectDbOptions],
  )

  const sortedChecklistItems = useMemo(() => {
    const copy = [...checklistItems]
    copy.sort((a, b) => {
      const aDue = a.computedDueDate ?? computeChecklistDueDate(selectedChecklistProject?.eventDate, a) ?? '9999-12-31'
      const bDue = b.computedDueDate ?? computeChecklistDueDate(selectedChecklistProject?.eventDate, b) ?? '9999-12-31'
      const aLead = getChecklistTotalLeadDays(a) ?? -1
      const bLead = getChecklistTotalLeadDays(b) ?? -1

      if (checklistSort === 'due_asc') return aDue.localeCompare(bDue)
      if (checklistSort === 'due_desc') return bDue.localeCompare(aDue)
      if (checklistSort === 'name_asc') return (a.productName || '').localeCompare(b.productName || '', 'ko')
      if (checklistSort === 'name_desc') return (b.productName || '').localeCompare(a.productName || '', 'ko')
      if (checklistSort === 'lead_asc') return aLead - bLead
      return bLead - aLead
    })
    return copy
  }, [checklistItems, checklistSort, selectedChecklistProject?.eventDate])

  const projectByName = useMemo(() => {
    const map = new Map<string, ProjectRecord>()
    for (const project of projectDbOptions) {
      if (!map.has(project.name)) map.set(project.name, project)
    }
    return map
  }, [projectDbOptions])

  const taskById = useMemo(() => Object.fromEntries(tasks.map((task) => [task.id, task])) as Record<string, TaskRecord>, [tasks])

  useEffect(() => {
    setOpenTaskGroups((prev) => {
      const next: Record<string, boolean> = { ...prev }
      for (const group of groupedTasks) {
        if (next[group.projectName] === undefined) {
          // Collapse by default to reduce initial render cost on large datasets.
          next[group.projectName] = false
        }
      }
      return next
    })
  }, [groupedTasks])

  const assignmentCandidates = useMemo(() => {
    if (!assignmentTarget) return []

    const keyword = assignmentSearch.trim().toLowerCase()
    return tasks
      .filter((task) => {
        if (assignmentProjectFilter && task.projectName !== assignmentProjectFilter) {
          return false
        }
        if (!keyword) return true
        return `${task.projectName} ${task.taskName} ${task.workType} ${task.assignee.join(' ')}`.toLowerCase().includes(keyword)
      })
      .sort((a, b) => {
        const sameWorkTypeA = a.workType === assignmentTarget.workCategory ? 0 : 1
        const sameWorkTypeB = b.workType === assignmentTarget.workCategory ? 0 : 1
        if (sameWorkTypeA !== sameWorkTypeB) return sameWorkTypeA - sameWorkTypeB
        return `${a.projectName} ${a.taskName}`.localeCompare(`${b.projectName} ${b.taskName}`, 'ko')
      })
      .slice(0, 120)
  }, [assignmentProjectFilter, assignmentSearch, assignmentTarget, tasks])

  const assignmentProjectOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.projectName).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko')),
    [tasks],
  )

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

  const assigneeOptions = useMemo(() => unique(tasks.flatMap((task) => task.assignee).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'ko')), [tasks])

  const requesterOptions = useMemo(
    () => unique(tasks.flatMap((task) => task.requester).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'ko')),
    [tasks],
  )

  const selectedViewDbUrl = useMemo(() => {
    if (activeView === 'projects') return dbLinks.project
    if (activeView === 'tasks') return dbLinks.task
    if (activeView === 'checklist') return dbLinks.checklist
    return null
  }, [activeView, dbLinks.checklist, dbLinks.project, dbLinks.task])

  const unknownMessages = schemaUnknownMessage(schema)
  const assignmentTargetCurrentTaskId = assignmentTarget
    ? assignmentByChecklist[toChecklistAssignmentKey(checklistFilters.eventCategory, assignmentTarget.itemId)] ?? ''
    : ''

  const onChangeFilter = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const onTaskViewFilterChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    const checked = (event.target as HTMLInputElement).checked
    setTaskViewFilters((prev) => ({
      ...prev,
      [name]: name === 'urgentOnly' || name === 'hideDone' ? checked : value,
    }))
  }

  const onTaskViewFilterReset = () => {
    setTaskViewFilters({
      workType: '',
      assignee: '',
      requester: '',
      dueFrom: '',
      dueTo: '',
      urgentOnly: false,
      hideDone: false,
    })
  }

  const onCreateInput = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setCreateForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const onChecklistInput = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    const nextValue = name === 'shippingDate' ? normalizeIsoDateInput(value) : value
    setChecklistFilters((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const onChecklistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await fetchChecklistPreview(checklistFilters)
  }

  const onChecklistReset = async () => {
    const next: ChecklistPreviewFilters = {
      eventName: '',
      eventCategory: '',
      shippingDate: '',
      operationMode: '',
      fulfillmentMode: '',
    }
    setChecklistFilters(next)
    await fetchChecklistPreview(next)
  }

  const onToggleTaskGroup = (projectName: string) => {
    setOpenTaskGroups((prev) => ({
      ...prev,
      [projectName]: !prev[projectName],
    }))
  }

  const setChecklistAssignment = async (itemId: string, taskId: string) => {
    const key = toChecklistAssignmentKey(checklistFilters.eventCategory, itemId)
    const previous = assignmentByChecklist
    const next = { ...previous }
    if (!taskId) {
      delete next[key]
    } else {
      next[key] = taskId
    }
    setAssignmentByChecklist(next)
    setAssignmentSyncError(null)

    try {
      const response = await api<ChecklistAssignmentsResponse>('/checklist-assignments', {
        method: 'POST',
        body: JSON.stringify({
          eventCategory: checklistFilters.eventCategory,
          itemId,
          taskId: taskId || null,
        }),
      })
      setAssignmentByChecklist(response.assignments ?? next)
      if (response.storageMode) setAssignmentStorageMode(response.storageMode)
    } catch (error: any) {
      setAssignmentByChecklist(previous)
      setAssignmentSyncError(error?.message ?? '체크리스트 할당 저장에 실패했습니다.')
    }
  }

  const onOpenAssignmentPicker = (item: ChecklistPreviewItem) => {
    setAssignmentTarget({
      itemId: item.id,
      productName: item.productName,
      workCategory: item.workCategory,
    })
    setAssignmentSearch('')
    setAssignmentProjectFilter('')
  }

  const onSelectAssignmentTask = async (taskId: string) => {
    if (!assignmentTarget) return
    await setChecklistAssignment(assignmentTarget.itemId, taskId)
    setAssignmentTarget(null)
    setAssignmentSearch('')
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
                    {toProjectLabel(project)} {project.source === 'task_select' ? '(select)' : ''}
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
    <div className="page mondayShell">
      <aside className="mondaySidebar">
        <div className="sidebarWorkspace">
          <span className="workspaceMark">IZ</span>
          <div className="workspaceMeta">
            <strong>IZEN Design Team</strong>
            <span>Cloudflare + Notion Workspace</span>
          </div>
        </div>
        <button type="button" className="secondary sidebarSearchBtn">
          <span className="iconLabel">
            <span className="uiIcon">⌕</span>
            <span>빠른 이동 / 검색</span>
          </span>
          <span className="shortcutKey">⌘K</span>
        </button>
        <header className="sidebarBrand">
          <h1>디자인팀 업무 도우미</h1>
          <p>Plane-inspired Layout + Asana Workflow</p>
        </header>
        <section className="viewMenu">
          <div className="viewMenuHeader">
            <strong>Views</strong>
            <button type="button" className="secondary" onClick={() => setMenuCollapsed((prev) => !prev)}>
              <span className="iconLabel">
                <span className="uiIcon">{menuCollapsed ? '▸' : '▾'}</span>
                <span>{menuCollapsed ? '메뉴 펼치기' : '메뉴 접기'}</span>
              </span>
            </button>
          </div>
          {menuCollapsed ? null : (
            <div className="viewTabs">
              <button
                type="button"
                className={activeView === 'projects' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('projects')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">▦</span>
                  <span>프로젝트</span>
                </span>
                <span className="viewTabCount">{projects.length}</span>
              </button>
              <button
                type="button"
                className={activeView === 'tasks' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('tasks')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">☰</span>
                  <span>업무</span>
                </span>
                <span className="viewTabCount">{tasks.length}</span>
              </button>
              <button
                type="button"
                className={activeView === 'schedule' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('schedule')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">◷</span>
                  <span>일정</span>
                </span>
              </button>
              <button
                type="button"
                className={activeView === 'checklist' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('checklist')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">☑</span>
                  <span>행사 체크리스트</span>
                </span>
              </button>
              {selectedViewDbUrl ? (
                <a className="linkButton secondary dbJump" href={selectedViewDbUrl} target="_blank" rel="noreferrer">
                  <span className="iconLabel">
                    <span className="uiIcon">↗</span>
                    <span>현재 탭 노션 DB 열기</span>
                  </span>
                </a>
              ) : (
                <span className="muted small dbJump">현재 탭 DB 링크 없음</span>
              )}
            </div>
          )}
        </section>
        <section className="sidebarMeta">
          <article className="metaCard">
            <span className="muted small">프로젝트</span>
            <strong>{projects.length}</strong>
          </article>
          <article className="metaCard">
            <span className="muted small">업무</span>
            <strong>{tasks.length}</strong>
          </article>
          <article className="metaCard">
            <span className="muted small">마지막 동기화</span>
            <strong>{lastSyncedAt || '-'}</strong>
          </article>
        </section>
      </aside>
      <main className="mondayMain">
        <header className="header topbarHeader">
          <div className="topbarHeading">
            <p className="topbarPath">Design Team / {activeView === 'checklist' ? 'Event Checklist' : activeView}</p>
            <h1>
              {activeView === 'projects'
                ? '프로젝트'
                : activeView === 'tasks'
                  ? '업무'
                  : activeView === 'schedule'
                    ? '일정'
                    : '행사 체크리스트'}
            </h1>
          </div>
          {activeView === 'tasks' ? (
            <section className="taskViewMode">
              <button
                type="button"
                className={taskLayout === 'list' ? 'viewTab active' : 'viewTab'}
                onClick={() => setTaskLayout('list')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">☰</span>
                  <span>List</span>
                </span>
              </button>
              <button
                type="button"
                className={taskLayout === 'board' ? 'viewTab active' : 'viewTab'}
                onClick={() => setTaskLayout('board')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">▥</span>
                  <span>Board</span>
                </span>
              </button>
            </section>
          ) : null}
        </header>

        <section className="toolbar toolbarWrap">
          {activeView === 'tasks' ? (
            <button type="button" onClick={() => setCreateOpen(true)}>
              <span className="iconLabel">
                <span className="uiIcon">＋</span>
                <span>새 업무</span>
              </span>
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => void refreshListAndProjects()}>
            <span className="iconLabel">
              <span className="uiIcon">↻</span>
              <span>새로고침</span>
            </span>
          </button>
          <button type="button" className="secondary" onClick={() => void runApiConnectionTest()} disabled={apiCheckState === 'checking'}>
            <span className="iconLabel">
              <span className="uiIcon">◌</span>
              <span>{apiCheckState === 'checking' ? '연결 확인 중...' : 'API 연결 테스트'}</span>
            </span>
          </button>
          <button type="button" className="secondary" onClick={() => void onManualExport()} disabled={exporting}>
            <span className="iconLabel">
              <span className="uiIcon">⭳</span>
              <span>{exporting ? '내보내는 중...' : '수동 Export'}</span>
            </span>
          </button>
          <span className="apiBaseLabel">API Base: {API_BASE_URL}</span>
          <span className="syncLabel">마지막 동기화: {lastSyncedAt || '-'}</span>
        </section>

        {apiCheckMessage ? <p className={apiCheckState === 'error' ? 'error' : 'muted'}>{apiCheckMessage}</p> : null}
        {exportMessage ? <p className={exportMessage.includes('실패') ? 'error' : 'muted'}>{exportMessage}</p> : null}

      {activeView === 'tasks' ? (
        <section className="filters">
          <label>
            프로젝트
            <select name="projectId" value={filters.projectId} onChange={onChangeFilter}>
              <option value="">전체</option>
              {projects.map((project) => (
                <option key={project.id} value={project.bindingValue}>
                  {toProjectLabel(project)}
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

          <label>
            정렬
            <select name="taskSort" value={taskSort} onChange={(event) => setTaskSort(event.target.value as TaskSort)}>
              <option value="due_asc">마감일 빠른순</option>
              <option value="due_desc">마감일 늦은순</option>
              <option value="start_asc">시작일 빠른순</option>
              <option value="start_desc">시작일 늦은순</option>
              <option value="status_asc">상태 오름차순</option>
              <option value="name_asc">업무명 오름차순</option>
            </select>
          </label>

          <label>
            업무구분
            <select name="workType" value={taskViewFilters.workType} onChange={onTaskViewFilterChange}>
              <option value="">전체</option>
              {workTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            담당자
            <select name="assignee" value={taskViewFilters.assignee} onChange={onTaskViewFilterChange}>
              <option value="">전체</option>
              {assigneeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            요청주체
            <select name="requester" value={taskViewFilters.requester} onChange={onTaskViewFilterChange}>
              <option value="">전체</option>
              {requesterOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            마감일 시작
            <input type="date" name="dueFrom" value={taskViewFilters.dueFrom} onChange={onTaskViewFilterChange} />
          </label>

          <label>
            마감일 끝
            <input type="date" name="dueTo" value={taskViewFilters.dueTo} onChange={onTaskViewFilterChange} />
          </label>

          <label className="checkboxLabel flat">
            <input type="checkbox" name="urgentOnly" checked={taskViewFilters.urgentOnly} onChange={onTaskViewFilterChange} />
            긴급만 보기
          </label>

          <label className="checkboxLabel flat">
            <input type="checkbox" name="hideDone" checked={taskViewFilters.hideDone} onChange={onTaskViewFilterChange} />
            완료/보관 숨기기
          </label>

          <div className="filtersActions">
            <button type="button" className="secondary" onClick={onTaskViewFilterReset}>
              업무 필터 초기화
            </button>
          </div>
        </section>
      ) : null}

      {activeView === 'schedule' ? (
        <section className="checklistPreview">
          <div className="timelineWipBadge">일정 화면은 준비 중입니다.</div>
        </section>
      ) : null}

      {activeView === 'checklist' ? (
        <section className="checklistPreview">
          <div className="checklistPreviewHeader">
            <h2>행사 체크리스트</h2>
            <p>행사구분으로 항목을 고르고 결과를 확인합니다. 노션 체크리스트 DB의 계산용 오프셋을 사용합니다.</p>
          </div>

          <form className="checklistPreviewFilters" onSubmit={onChecklistSubmit}>
            <label>
              행사명
              <select name="eventName" value={checklistFilters.eventName} onChange={onChecklistInput}>
                <option value="">프로젝트 선택 안 함</option>
                {projectDbOptions.map((project) => (
                  <option key={project.id} value={project.name}>
                    {toProjectLabel(project)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              행사구분
              <select name="eventCategory" value={checklistFilters.eventCategory} onChange={onChecklistInput}>
                <option value="">전체</option>
                {checklistCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              배송일(해외 출고 기준)
              <input
                type="text"
                name="shippingDate"
                value={checklistFilters.shippingDate}
                onChange={onChecklistInput}
                placeholder="YYYY-MM-DD"
                inputMode="numeric"
                maxLength={10}
              />
            </label>

            <label>
              운영 방식
              <select name="operationMode" value={checklistFilters.operationMode} onChange={onChecklistInput}>
                <option value="">전체</option>
                <option value="self">자체</option>
                <option value="dealer">딜러</option>
              </select>
            </label>

            <label>
              배송 방식
              <select name="fulfillmentMode" value={checklistFilters.fulfillmentMode} onChange={onChecklistInput}>
                <option value="">전체</option>
                <option value="domestic">국내</option>
                <option value="overseas">해외</option>
                <option value="dealer">딜러</option>
              </select>
            </label>

            <label>
              정렬
              <select value={checklistSort} onChange={(event) => setChecklistSort(event.target.value as ChecklistSort)}>
                <option value="due_asc">완료예정일 빠른순</option>
                <option value="due_desc">완료예정일 늦은순</option>
                <option value="name_asc">제작물 이름 오름차순</option>
                <option value="name_desc">제작물 이름 내림차순</option>
                <option value="lead_asc">총 소요일 짧은순</option>
                <option value="lead_desc">총 소요일 긴순</option>
              </select>
            </label>

            <div className="checklistPreviewActions">
              <button type="submit" disabled={checklistLoading}>
                {checklistLoading ? '조회 중...' : '체크리스트 보기'}
              </button>
              <button type="button" className="secondary" onClick={() => void onChecklistReset()} disabled={checklistLoading}>
                초기화
              </button>
            </div>
          </form>
          <p className="muted small">
            행사명은 프로젝트 DB에서 선택합니다. 영업일 역산은 주말/한국 공휴일을 제외해 계산하며, 오프셋은 DB에 숫자로 관리합니다.
          </p>
          <p className="muted small">할당 저장소: {assignmentStorageMode === 'd1' ? 'D1(영구저장 + 로그)' : 'Cache(임시저장)'}</p>
          {selectedChecklistProject ? (
            <p className="muted small projectPreviewLine">
              {toProjectThumbUrl(selectedChecklistProject) ? (
                <img className="projectPreviewImage" src={toProjectThumbUrl(selectedChecklistProject)} alt="" />
              ) : null}
              선택 행사: {selectedChecklistProject.name}
            </p>
          ) : null}
          {selectedChecklistProject?.eventDate ? (
            <p className="muted small">
              기준 행사일: {formatDateLabel(selectedChecklistProject.eventDate)} ({selectedChecklistProject.eventDate})
            </p>
          ) : null}

          {checklistError ? <p className="error">{checklistError}</p> : null}
          {assignmentSyncError ? <p className="error">{assignmentSyncError}</p> : null}
          {!checklistError ? <p className="muted">조회 결과: {sortedChecklistItems.length}건</p> : null}

          {sortedChecklistItems.length > 0 ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>제작물</th>
                    <th>작업분류</th>
                    <th>디자인 소요(일)</th>
                    <th>실물 제작 소요(일)</th>
                    <th>총 소요(일)</th>
                    <th>역산 완료 예정일</th>
                    <th>최종 완료 시점</th>
                    <th>작업할당여부</th>
                    <th>할당 업무</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedChecklistItems.map((item) => {
                    const assignmentKey = toChecklistAssignmentKey(checklistFilters.eventCategory, item.id)
                    const assignedTaskId = assignmentByChecklist[assignmentKey] ?? ''
                    const assignedTask = assignedTaskId ? taskById[assignedTaskId] : undefined
                    const isAssigned = Boolean(assignedTaskId)
                    const totalLeadDays = getChecklistTotalLeadDays(item)
                    const computedDueDate = item.computedDueDate ?? computeChecklistDueDate(selectedChecklistProject?.eventDate, item)
                    return (
                      <tr key={item.id}>
                        <td>{item.productName || '-'}</td>
                        <td>{item.workCategory || '-'}</td>
                        <td>{item.designLeadDays ?? '-'}</td>
                        <td>{item.productionLeadDays ?? '-'}</td>
                        <td>{totalLeadDays ?? '-'}</td>
                        <td>{computedDueDate ? `${formatDateLabel(computedDueDate)} (${computedDueDate})` : '-'}</td>
                        <td>{item.finalDueText || '-'}</td>
                        <td>
                          <span className={isAssigned ? 'assignmentBadge assigned' : 'assignmentBadge unassigned'}>
                            {isAssigned ? '할당됨' : '미할당'}
                          </span>
                        </td>
                        <td className="assignmentCell">
                          {assignedTask ? `[${assignedTask.projectName}] ${assignedTask.taskName} (${joinOrDash(assignedTask.assignee)})` : '-'}
                        </td>
                        <td>
                          <button type="button" className="secondary mini" onClick={() => onOpenAssignmentPicker(item)}>
                            {isAssigned ? '변경' : '할당'}
                          </button>
                          {isAssigned ? (
                            <button type="button" className="secondary mini" onClick={() => void setChecklistAssignment(item.id, '')}>
                              해제
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === 'projects' ? (
        <section className="projectSection">
          <header className="projectHeader">
            <h2>프로젝트 목록</h2>
            <span>{sortedProjectDbOptions.length}건</span>
          </header>
          <section className="filters compact">
            <label>
              정렬
              <select value={projectSort} onChange={(event) => setProjectSort(event.target.value as ProjectSort)}>
                <option value="name_asc">이름 오름차순</option>
                <option value="name_desc">이름 내림차순</option>
                <option value="date_asc">행사일 빠른순</option>
                <option value="date_desc">행사일 늦은순</option>
              </select>
            </label>
          </section>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>프로젝트</th>
                  <th>행사일</th>
                  <th>Notion</th>
                </tr>
              </thead>
              <tbody>
                {sortedProjectDbOptions.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <span className="projectTitle">
                        {project.coverUrl ? <img className="projectCoverImage" src={project.coverUrl} alt="" /> : null}
                        {project.iconUrl ? <img className="projectIconImage" src={project.iconUrl} alt="" /> : null}
                        {project.iconEmoji ? <span className="projectIconEmoji">{project.iconEmoji}</span> : null}
                        <span>{project.name}</span>
                      </span>
                    </td>
                    <td>{project.eventDate ? `${formatDateLabel(project.eventDate)} (${project.eventDate})` : '-'}</td>
                    <td>
                      {toNotionUrlById(project.id) ? (
                        <a className="linkButton secondary mini" href={toNotionUrlById(project.id) ?? undefined} target="_blank" rel="noreferrer">
                          열기
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeView === 'tasks' && unknownMessages.length > 0 ? (
        <section className="warningBox">
          <strong>스키마 경고 ([UNKNOWN] fallback)</strong>
          <ul>
            {unknownMessages.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeView === 'tasks' ? <>{loadingList ? <p className="muted">업무 목록 로딩 중...</p> : null}</> : null}
      {activeView === 'tasks' ? <>{listError ? <p className="error">{listError}</p> : null}</> : null}

      {activeView === 'tasks' ? (
        taskLayout === 'list' ? (
          <section className="projectGroups">
            {groupedTasks.map((group) => {
              const groupProject = projectByName.get(group.projectName)
              return (
              <article className="projectSection" key={group.projectName}>
                <header className="projectHeader">
                  <button type="button" className="taskGroupToggle" onClick={() => onToggleTaskGroup(group.projectName)}>
                    {openTaskGroups[group.projectName] === false ? '펼치기' : '접기'}
                  </button>
                  <h2 className="projectTitle">
                    {groupProject?.coverUrl ? <img className="projectCoverImage" src={groupProject.coverUrl} alt="" /> : null}
                    {groupProject?.iconUrl ? <img className="projectIconImage" src={groupProject.iconUrl} alt="" /> : null}
                    {groupProject?.iconEmoji ? <span className="projectIconEmoji">{groupProject.iconEmoji}</span> : null}
                    <span>{group.projectName}</span>
                  </h2>
                  <span>{group.tasks.length}건</span>
                </header>

                {openTaskGroups[group.projectName] === false ? null : (
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
                )}
              </article>
              )
            })}

            {!loadingList && groupedTasks.length === 0 ? <p className="muted">조건에 맞는 업무가 없습니다.</p> : null}
          </section>
        ) : (
          <section className="taskBoard">
            {tasksByStatus.map((column) => (
              <article key={column.status} className="boardColumn">
                <header className="boardColumnHeader">
                  <strong>{column.status}</strong>
                  <span>{column.items.length}</span>
                </header>
                <div className="boardCards">
                  {column.items.map((task) => (
                    <button
                      type="button"
                      key={task.id}
                      className="boardCard"
                      onClick={() => navigate(`/task/${encodeURIComponent(task.id)}`)}
                    >
                      <span className="boardCardTitle">{task.taskName}</span>
                      <span className="boardCardMeta">{task.projectName}</span>
                      <span className="boardCardMeta">담당: {joinOrDash(task.assignee)}</span>
                      <span className="boardCardMeta">마감: {task.dueDate || '-'}</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
            {!loadingList && tasksByStatus.length === 0 ? <p className="muted">조건에 맞는 업무가 없습니다.</p> : null}
          </section>
        )
      ) : null}

      {assignmentTarget ? (
        <div className="modalBackdrop" role="presentation" onClick={() => setAssignmentTarget(null)}>
          <div className="modal assignmentModal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h3>할당 업무 선택</h3>
            <p className="muted small">
              대상 제작물: <strong>{assignmentTarget.productName || '-'}</strong> / 작업분류: {assignmentTarget.workCategory || '-'}
            </p>

            <label>
              업무 검색
              <input
                value={assignmentSearch}
                onChange={(event) => setAssignmentSearch(event.target.value)}
                placeholder="프로젝트명, 업무명, 업무구분으로 검색"
              />
            </label>

            <label>
              프로젝트별 보기
              <select value={assignmentProjectFilter} onChange={(event) => setAssignmentProjectFilter(event.target.value)}>
                <option value="">전체 프로젝트</option>
                {assignmentProjectOptions.map((projectName) => (
                  <option key={projectName} value={projectName}>
                    {projectName}
                  </option>
                ))}
              </select>
            </label>

            <div className="assignmentModalActions">
              <button type="button" className="secondary" onClick={() => void onSelectAssignmentTask('')}>
                미할당 처리
              </button>
              <button type="button" className="secondary" onClick={() => setAssignmentTarget(null)}>
                닫기
              </button>
            </div>

            <div className="assignmentList">
              {assignmentCandidates.length === 0 ? <p className="muted">검색 결과가 없습니다.</p> : null}
              {assignmentCandidates.map((task) => {
                const selected = assignmentTargetCurrentTaskId === task.id
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={selected ? 'assignmentItem selected' : 'assignmentItem'}
                    onClick={() => void onSelectAssignmentTask(task.id)}
                  >
                    <strong>{task.taskName}</strong>
                    <span>
                      [{task.projectName}] · {task.workType || '-'} · {task.status}
                    </span>
                    <span>담당자: {joinOrDash(task.assignee)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

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
                      {toProjectLabel(project)}
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
    </main>
    </div>
  )
}

export default App
