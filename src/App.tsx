import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react'
import { AssignmentModal } from './features/checklist/AssignmentModal'
import { ChecklistView } from './features/checklist/ChecklistView'
import { ProjectsView } from './features/projects/ProjectsView'
import { TaskDetailView } from './features/taskDetail/TaskDetailView'
import { TaskCreateModal } from './features/tasks/TaskCreateModal'
import { TasksView } from './features/tasks/TasksView'
import { api, API_BASE_URL, USE_MOCK_DATA } from './shared/api/client'
import { useDebouncedValue } from './shared/hooks/useDebouncedValue'
import { useKeybinding } from './shared/hooks/useKeybinding'
import { useLocalStorage } from './shared/hooks/useLocalStorage'
import { ToastStack, type ToastItem, type ToastTone } from './shared/ui'
import './App.css'
import './shared/ui/ui.css'

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
    projectId?: string
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

type AuthSessionResponse = {
  ok: boolean
  authenticated: boolean
}

type AuthLoginResponse = {
  ok: boolean
  authenticated: boolean
  expiresAt?: string
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
type BoardWorkflowMode = 'grouped' | 'status'

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
type QuickSearchScope = 'project' | 'task'
type BoardGroupKey = 'todo' | 'progress' | 'done' | 'other'

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
const TOAST_LIFETIME_MS = 3600
const AUTH_GATE_ENABLED = false

const DEFAULT_FILTERS: Filters = {
  projectId: '',
  status: '',
  q: '',
}

const DEFAULT_TASK_VIEW_FILTERS: TaskViewFilters = {
  workType: '',
  assignee: '',
  requester: '',
  dueFrom: '',
  dueTo: '',
  urgentOnly: false,
  hideDone: false,
}

function createDefaultFilters(): Filters {
  return { ...DEFAULT_FILTERS }
}

function createDefaultTaskViewFilters(): TaskViewFilters {
  return { ...DEFAULT_TASK_VIEW_FILTERS }
}

function parseTopView(value: string | null): TopView {
  if (value === 'projects' || value === 'tasks' || value === 'schedule' || value === 'checklist') return value
  return 'tasks'
}

function parseTaskLayout(value: string | null): TaskLayoutMode {
  return value === 'board' ? 'board' : 'list'
}

function parseBoardWorkflowMode(value: string | null): BoardWorkflowMode {
  return value === 'status' ? 'status' : 'grouped'
}

function parseBooleanQuery(value: string | null): boolean {
  return value === '1' || value === 'true'
}

function readListUiStateFromSearch(search: string): {
  activeView: TopView
  taskLayout: TaskLayoutMode
  boardWorkflowMode: BoardWorkflowMode
  filters: Filters
  taskViewFilters: TaskViewFilters
} {
  const params = new URLSearchParams(search)
  return {
    activeView: parseTopView(params.get('view')),
    taskLayout: parseTaskLayout(params.get('taskLayout')),
    boardWorkflowMode: parseBoardWorkflowMode(params.get('boardWorkflowMode')),
    filters: {
      projectId: params.get('projectId') ?? '',
      status: params.get('status') ?? '',
      q: params.get('q') ?? '',
    },
    taskViewFilters: {
      workType: params.get('workType') ?? '',
      assignee: params.get('assignee') ?? '',
      requester: params.get('requester') ?? '',
      dueFrom: params.get('dueFrom') ?? '',
      dueTo: params.get('dueTo') ?? '',
      urgentOnly: parseBooleanQuery(params.get('urgentOnly')),
      hideDone: parseBooleanQuery(params.get('hideDone')),
    },
  }
}

type UiGlyphName =
  | 'grid'
  | 'list'
  | 'calendar'
  | 'checksquare'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'external'
  | 'refresh'
  | 'pulse'
  | 'download'
  | 'plus'
  | 'search'
  | 'board'

function UiGlyph({ name }: { name: UiGlyphName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'grid') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" rx="1" {...common} />
        <rect x="9" y="2" width="5" height="5" rx="1" {...common} />
        <rect x="2" y="9" width="5" height="5" rx="1" {...common} />
        <rect x="9" y="9" width="5" height="5" rx="1" {...common} />
      </svg>
    )
  }
  if (name === 'list') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4h10" {...common} />
        <path d="M4 8h10" {...common} />
        <path d="M4 12h10" {...common} />
        <circle cx="2" cy="4" r="0.7" fill="currentColor" />
        <circle cx="2" cy="8" r="0.7" fill="currentColor" />
        <circle cx="2" cy="12" r="0.7" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'board') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
        <rect x="6.4" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
        <rect x="10.8" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" {...common} />
        <path d="M2 6.5h12" {...common} />
        <path d="M5 2v3" {...common} />
        <path d="M11 2v3" {...common} />
      </svg>
    )
  }
  if (name === 'checksquare') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="2" {...common} />
        <path d="M5 8.2l2.1 2.1L11.3 6" {...common} />
      </svg>
    )
  }
  if (name === 'chevronLeft') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.5 3.5L6 8l4.5 4.5" {...common} />
      </svg>
    )
  }
  if (name === 'chevronRight') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5.5 3.5L10 8l-4.5 4.5" {...common} />
      </svg>
    )
  }
  if (name === 'chevronDown') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 6l4.5 4.5L12.5 6" {...common} />
      </svg>
    )
  }
  if (name === 'external') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M9.5 2h4.5v4.5" {...common} />
        <path d="M14 2L7.8 8.2" {...common} />
        <path d="M7 3.5H4a2 2 0 0 0-2 2V12a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-3" {...common} />
      </svg>
    )
  }
  if (name === 'refresh') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.2 8a5.2 5.2 0 1 1-1.2-3.3" {...common} />
        <path d="M13.4 2.8v3.4H10" {...common} />
      </svg>
    )
  }
  if (name === 'pulse') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" {...common} />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'download') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.5v7" {...common} />
        <path d="M5.2 7.7L8 10.5l2.8-2.8" {...common} />
        <path d="M2.5 13.5h11" {...common} />
      </svg>
    )
  }
  if (name === 'plus') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10" {...common} />
        <path d="M3 8h10" {...common} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" {...common} />
      <path d="M10.5 10.5L14 14" {...common} />
    </svg>
  )
}

function toTopViewPath(view: TopView): string {
  if (view === 'projects') return 'Projects'
  if (view === 'tasks') return 'Tasks'
  if (view === 'schedule') return 'Schedule'
  return 'Event Checklist'
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
}

function toBoardGroup(status: string | undefined): BoardGroupKey {
  const normalized = normalizeStatus(status)
  if (normalized === '시작전' || normalized === '보류') return 'todo'
  if (normalized === '진행중' || normalized === '검토중' || normalized === '수정중') return 'progress'
  if (normalized === '완료' || normalized === '보관') return 'done'
  return 'other'
}

function toStatusTone(status: string | undefined): 'gray' | 'red' | 'blue' | 'green' {
  const normalized = normalizeStatus(status)
  if (normalized === '보류') return 'red'
  if (normalized === '진행중' || normalized === '검토중' || normalized === '수정중') return 'blue'
  if (normalized === '완료' || normalized === '보관') return 'green'
  return 'gray'
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

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
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

function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').trim().toLowerCase()
}

function diffDays(from: Date, to: Date): number {
  const ms = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / ms)
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

function toChecklistAssignmentKey(eventCategory: string, itemId: string, projectId?: string): string {
  const projectKey = projectId?.replace(/-/g, '').trim().toLowerCase() || 'ALL_PROJECT'
  const categoryKey = eventCategory.trim() || 'ALL'
  return `${projectKey}::${categoryKey}::${itemId}`
}

function toLegacyChecklistAssignmentKey(eventCategory: string, itemId: string): string {
  const categoryKey = eventCategory.trim() || 'ALL'
  return `${categoryKey}::${itemId}`
}

function getChecklistAssignmentTaskId(
  assignments: Record<string, string>,
  eventCategory: string,
  itemId: string,
  projectId?: string,
): string {
  const nextKey = toChecklistAssignmentKey(eventCategory, itemId, projectId)
  const legacyKey = toLegacyChecklistAssignmentKey(eventCategory, itemId)
  return assignments[nextKey] ?? assignments[legacyKey] ?? ''
}

function schemaUnknownMessage(schema: ApiSchemaSummary | null): string[] {
  if (!schema) return []
  return schema.unknownFields.map((field) => `${field.expectedName} (${field.expectedTypes.join('|')}) -> [UNKNOWN]`)
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function App() {
  const initialListUiState = readListUiStateFromSearch(window.location.search)
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [activeView, setActiveView] = useState<TopView>(initialListUiState.activeView)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [projectSort, setProjectSort] = useState<ProjectSort>('name_asc')
  const [taskSort, setTaskSort] = useState<TaskSort>('due_asc')
  const [taskLayout, setTaskLayout] = useState<TaskLayoutMode>(initialListUiState.taskLayout)
  const [boardWorkflowMode, setBoardWorkflowMode] = useState<BoardWorkflowMode>(initialListUiState.boardWorkflowMode)
  const [checklistSort, setChecklistSort] = useState<ChecklistSort>('due_asc')
  const [quickSearch, setQuickSearch] = useState('')
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const debouncedQuickSearch = useDebouncedValue(quickSearch, 250)
  const quickSearchInputRef = useRef<HTMLInputElement | null>(null)

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

  const [filters, setFilters] = useState<Filters>(initialListUiState.filters)
  const [taskViewFilters, setTaskViewFilters] = useState<TaskViewFilters>(initialListUiState.taskViewFilters)
  const debouncedFilterQ = useDebouncedValue(filters.q, 250)
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('authenticated')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [loadingList, setLoadingList] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)
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
  const [assignmentByChecklist, setAssignmentByChecklist] = useLocalStorage<Record<string, string>>(
    CHECKLIST_ASSIGNMENT_STORAGE_KEY,
    {},
  )
  const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({})
  const [assignmentTarget, setAssignmentTarget] = useState<ChecklistAssignmentTarget | null>(null)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentProjectFilter, setAssignmentProjectFilter] = useState('')
  const [apiCheckState, setApiCheckState] = useState<ApiCheckState>('idle')
  const [apiCheckMessage, setApiCheckMessage] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string>('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastTimerRef = useRef<Record<number, number>>({})

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

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timerId = toastTimerRef.current[id]
    if (timerId) {
      window.clearTimeout(timerId)
      delete toastTimerRef.current[id]
    }
  }, [])

  const pushToast = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((prev) => [...prev, { id, tone, message }].slice(-5))
      const timerId = window.setTimeout(() => {
        dismissToast(id)
      }, TOAST_LIFETIME_MS)
      toastTimerRef.current[id] = timerId
    },
    [dismissToast],
  )

  useEffect(() => {
    const toastTimers = toastTimerRef.current
    return () => {
      for (const timerId of Object.values(toastTimers)) {
        window.clearTimeout(timerId)
      }
    }
  }, [])

  useEffect(() => {
    if (!AUTH_GATE_ENABLED) {
      setAuthState('authenticated')
      setAuthError(null)
      return
    }

    if (USE_MOCK_DATA) {
      setAuthState('authenticated')
      return
    }

    let cancelled = false

    const checkSession = async () => {
      setAuthState('checking')
      setAuthError(null)
      try {
        const response = await api<AuthSessionResponse>('/auth/session')
        if (cancelled) return
        setAuthState(response.authenticated ? 'authenticated' : 'unauthenticated')
      } catch (error: unknown) {
        if (cancelled) return
        setAuthState('unauthenticated')
        setAuthError(toErrorMessage(error, '인증 상태를 확인하지 못했습니다.'))
      }
    }

    void checkSession()
    return () => {
      cancelled = true
    }
  }, [])

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setRoute(parseRoute(to))
  }, [])

  const applyListUiStateFromSearch = useCallback((search: string) => {
    const next = readListUiStateFromSearch(search)
    setActiveView(next.activeView)
    setTaskLayout(next.taskLayout)
    setBoardWorkflowMode(next.boardWorkflowMode)
    setFilters(next.filters)
    setTaskViewFilters(next.taskViewFilters)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = parseRoute(window.location.pathname)
      setRoute(nextRoute)
      if (nextRoute.kind === 'list') {
        applyListUiStateFromSearch(window.location.search)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyListUiStateFromSearch])

  useEffect(() => {
    if (route.kind !== 'list') return

    const params = new URLSearchParams(window.location.search)
    params.set('view', activeView)
    params.set('taskLayout', taskLayout)
    params.set('boardWorkflowMode', boardWorkflowMode)

    const setOptional = (key: string, value: string) => {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    const setOptionalBoolean = (key: string, value: boolean) => {
      if (value) params.set(key, '1')
      else params.delete(key)
    }

    setOptional('projectId', filters.projectId)
    setOptional('status', filters.status)
    setOptional('q', filters.q)
    setOptional('workType', taskViewFilters.workType)
    setOptional('assignee', taskViewFilters.assignee)
    setOptional('requester', taskViewFilters.requester)
    setOptional('dueFrom', taskViewFilters.dueFrom)
    setOptional('dueTo', taskViewFilters.dueTo)
    setOptionalBoolean('urgentOnly', taskViewFilters.urgentOnly)
    setOptionalBoolean('hideDone', taskViewFilters.hideDone)

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [
    activeView,
    boardWorkflowMode,
    filters.projectId,
    filters.q,
    filters.status,
    route.kind,
    taskLayout,
    taskViewFilters.assignee,
    taskViewFilters.dueFrom,
    taskViewFilters.dueTo,
    taskViewFilters.hideDone,
    taskViewFilters.requester,
    taskViewFilters.urgentOnly,
    taskViewFilters.workType,
  ])

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true)
    try {
      const response = await api<ProjectsResponse>('/projects')
      setProjects(response.projects)
      setSchema(response.schema)
    } finally {
      setLoadingProjects(false)
    }
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
        if (debouncedFilterQ) params.set('q', debouncedFilterQ)
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
    } catch (error: unknown) {
      setListError(toErrorMessage(error, '업무 목록을 불러오지 못했습니다.'))
    } finally {
      setLoadingList(false)
    }
  }, [debouncedFilterQ, filters.projectId, filters.status])

  useEffect(() => {
    if (authState !== 'authenticated') return
    void fetchProjects()
  }, [authState, fetchProjects])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    void fetchMeta()
  }, [authState, fetchMeta, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return

    void fetchTasks()
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return
      }
      void fetchTasks()
    }, POLLING_MS)

    return () => window.clearInterval(timer)
  }, [authState, fetchTasks, route.kind])

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
    } catch (error: unknown) {
      setChecklistError(toErrorMessage(error, '체크리스트 미리보기를 불러오지 못했습니다.'))
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
  }, [setAssignmentByChecklist])

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
    } catch (error: unknown) {
      setApiCheckState('error')
      setApiCheckMessage(toErrorMessage(error, 'API 연결 확인 실패'))
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
      const summary = `내보내기 완료: assignments ${response.counts.assignments}건, logs ${response.counts.logs}건 (${response.storageMode})`
      setExportMessage(
        response.storageMode === 'cache'
          ? `${summary} · D1 미연결이라 로그가 누적되지 않습니다.`
          : summary,
      )
      pushToast('success', summary)
    } catch (error: unknown) {
      const message = toErrorMessage(error, '내보내기에 실패했습니다.')
      setExportMessage(message)
      pushToast('error', message)
    } finally {
      setExporting(false)
    }
  }, [pushToast])

  const onAuthSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (USE_MOCK_DATA) {
        setAuthState('authenticated')
        return
      }

      const password = authPassword.trim()
      if (!password) {
        setAuthError('비밀번호를 입력해 주세요.')
        return
      }

      setAuthSubmitting(true)
      setAuthError(null)

      try {
        await api<AuthLoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ password }),
        })
        setAuthPassword('')
        setAuthState('authenticated')
        pushToast('success', '인증되었습니다.')
      } catch (error: unknown) {
        const message = toErrorMessage(error, '비밀번호가 올바르지 않습니다.')
        setAuthError(message)
        setAuthState('unauthenticated')
      } finally {
        setAuthSubmitting(false)
      }
    },
    [authPassword, pushToast],
  )

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    void fetchChecklistPreview(checklistFilters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, fetchChecklistPreview, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    void fetchChecklistAssignments()
  }, [authState, fetchChecklistAssignments, route.kind])

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

  const groupedBoardColumns = useMemo(() => {
    const baseColumns: Array<{ key: BoardGroupKey; label: string; items: TaskRecord[] }> = [
      { key: 'todo', label: '할 일', items: [] },
      { key: 'progress', label: '진행 중', items: [] },
      { key: 'done', label: '완료', items: [] },
      { key: 'other', label: '기타', items: [] },
    ]

    const byKey = new Map(baseColumns.map((column) => [column.key, column]))
    for (const task of sortedFilteredTasks) {
      const group = toBoardGroup(task.status)
      byKey.get(group)?.items.push(task)
    }

    return baseColumns.filter((column) => column.key !== 'other' || column.items.length > 0)
  }, [sortedFilteredTasks])

  const statusOptions = useMemo(() => {
    const fromSchema = schema?.fields.status?.options ?? []
    const fromTasks = tasks.map((task) => task.status).filter(Boolean)
    return unique([...fromSchema, ...fromTasks])
  }, [schema, tasks])

  const statusBoardColumns = useMemo(() => {
    const itemsByStatus = new Map<string, TaskRecord[]>()
    for (const task of sortedFilteredTasks) {
      if (!task.status) continue
      const bucket = itemsByStatus.get(task.status)
      if (bucket) bucket.push(task)
      else itemsByStatus.set(task.status, [task])
    }

    const seen = new Set(statusOptions)
    const columns = statusOptions
      .map((status) => {
        const items = itemsByStatus.get(status) ?? []
        return {
          key: `status:${status}`,
          label: status,
          items,
          tone: toStatusTone(status),
        }
      })
      .filter((column) => column.items.length > 0)

    const unknownStatuses = Array.from(itemsByStatus.keys())
      .filter((status) => !seen.has(status))
      .sort((a, b) => a.localeCompare(b, 'ko'))

    for (const status of unknownStatuses) {
      const items = itemsByStatus.get(status)
      if (!items || items.length === 0) continue
      columns.push({
        key: `status:${status}`,
        label: status,
        items,
        tone: toStatusTone(status),
      })
    }

    return columns
  }, [sortedFilteredTasks, statusOptions])

  const boardColumns = useMemo(() => {
    if (boardWorkflowMode === 'status') {
      return statusBoardColumns.map((column) => ({
        key: column.key,
        label: column.label,
        items: column.items,
        style: 'status' as const,
      }))
    }
    return groupedBoardColumns.map((column) => ({
      key: column.key,
      label: column.label,
      items: column.items,
      style: column.key,
    }))
  }, [boardWorkflowMode, groupedBoardColumns, statusBoardColumns])

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

  const projectTimelineTaskGroups = useMemo(() => {
    const byProjectKey = new Map<string, TaskRecord[]>()
    const byProjectName = new Map<string, TaskRecord[]>()

    for (const task of tasks) {
      const taskProjectKey = normalizeNotionId(task.projectKey)
      if (taskProjectKey) {
        const bucket = byProjectKey.get(taskProjectKey) ?? []
        bucket.push(task)
        byProjectKey.set(taskProjectKey, bucket)
      }

      const taskProjectName = task.projectName.trim().toLowerCase()
      if (taskProjectName) {
        const bucket = byProjectName.get(taskProjectName) ?? []
        bucket.push(task)
        byProjectName.set(taskProjectName, bucket)
      }
    }

    return sortedProjectDbOptions.map((project) => {
      const projectKey = normalizeNotionId(project.id)
      const projectName = project.name.trim().toLowerCase()
      const seen = new Set<string>()
      const matched: TaskRecord[] = []

      const appendTasks = (items: TaskRecord[] | undefined) => {
        if (!items) return
        for (const item of items) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          matched.push(item)
        }
      }

      appendTasks(byProjectKey.get(projectKey))
      appendTasks(byProjectName.get(projectName))

      matched.sort((a, b) => {
        const startCompare = asSortDate(a.startDate).localeCompare(asSortDate(b.startDate))
        if (startCompare !== 0) return startCompare
        const dueCompare = asSortDate(a.dueDate).localeCompare(asSortDate(b.dueDate))
        if (dueCompare !== 0) return dueCompare
        return a.taskName.localeCompare(b.taskName, 'ko')
      })

      return { project, tasks: matched }
    })
  }, [sortedProjectDbOptions, tasks])

  const projectTimelineRange = useMemo(() => {
    const points: Date[] = []

    for (const group of projectTimelineTaskGroups) {
      const projectDate = parseIsoDate(group.project.eventDate)
      if (projectDate) points.push(projectDate)

      for (const task of group.tasks) {
        const taskStart = parseIsoDate(task.startDate)
        const taskEnd = parseIsoDate(task.dueDate)
        if (taskStart) points.push(taskStart)
        if (taskEnd) points.push(taskEnd)
      }
    }

    const today = parseIsoDate(toIsoDate(new Date())) ?? new Date()
    let start = points.length > 0 ? new Date(Math.min(...points.map((point) => point.getTime()))) : today
    let end = points.length > 0 ? new Date(Math.max(...points.map((point) => point.getTime()))) : today

    start = addDays(start, -1)
    end = addDays(end, 1)

    if (end < start) {
      return { start, end: start, totalDays: 1 }
    }

    return {
      start,
      end,
      totalDays: Math.max(1, diffDays(start, end) + 1),
    }
  }, [projectTimelineTaskGroups])

  const projectTimelineGroups = useMemo(() => {
    const { start, totalDays } = projectTimelineRange

    return projectTimelineTaskGroups.map(({ project, tasks: groupedTasks }) => {
      const tasks = groupedTasks.map((task) => {
        const taskStartDate = parseIsoDate(task.startDate) ?? parseIsoDate(task.dueDate) ?? start
        const taskDueDate = parseIsoDate(task.dueDate) ?? parseIsoDate(task.startDate) ?? taskStartDate
        const safeStart = taskStartDate <= taskDueDate ? taskStartDate : taskDueDate
        const safeEnd = taskDueDate >= taskStartDate ? taskDueDate : taskStartDate

        const offset = diffDays(start, safeStart)
        const spanDays = Math.max(1, diffDays(safeStart, safeEnd) + 1)
        const leftPct = Math.max(0, Math.min(100, (offset / totalDays) * 100))
        const widthPct = Math.max(2, Math.min(100 - leftPct, (spanDays / totalDays) * 100))
        const barStyle: CSSProperties = {
          left: `${leftPct}%`,
          width: `${widthPct}%`,
        }

        return {
          task,
          barStyle,
        }
      })

      const eventDate = parseIsoDate(project.eventDate)
      let eventMarkerStyle: CSSProperties | null = null
      if (eventDate) {
        const eventOffset = diffDays(start, eventDate)
        const eventLeft = Math.max(0, Math.min(100, (eventOffset / totalDays) * 100))
        eventMarkerStyle = {
          left: `${eventLeft}%`,
        }
      }

      return {
        project,
        tasks,
        eventMarkerStyle,
      }
    })
  }, [projectTimelineRange, projectTimelineTaskGroups])

  const quickSearchSections = useMemo(() => {
    const keyword = debouncedQuickSearch.trim().toLowerCase()
    if (!keyword) {
      return { projects: [] as ProjectRecord[], tasks: [] as TaskRecord[] }
    }

    const projects = projectDbOptions
      .filter((project) => `${project.name} ${project.eventDate ?? ''}`.toLowerCase().includes(keyword))
      .slice(0, 6)

    const matchedTasks = tasks
      .filter((task) => `${task.projectName} ${task.taskName} ${task.workType} ${task.assignee.join(' ')}`.toLowerCase().includes(keyword))
      .slice(0, 8)

    return { projects, tasks: matchedTasks }
  }, [debouncedQuickSearch, projectDbOptions, tasks])

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

  const taskById = useMemo(() => {
    const map = new Map<string, TaskRecord>()
    for (const task of tasks) {
      map.set(task.id, task)
    }
    return map
  }, [tasks])

  const checklistRows = useMemo(() => {
    return sortedChecklistItems.map((item) => {
      const assignedTaskId = getChecklistAssignmentTaskId(
        assignmentByChecklist,
        checklistFilters.eventCategory,
        item.id,
        selectedChecklistProject?.id,
      )
      const assignedTask = assignedTaskId ? taskById.get(assignedTaskId) : undefined
      const totalLeadDays = getChecklistTotalLeadDays(item)
      const computedDueDate = item.computedDueDate ?? computeChecklistDueDate(selectedChecklistProject?.eventDate, item)

      return {
        item,
        assignedTaskId,
        assignedTaskLabel: assignedTask ? `[${assignedTask.projectName}] ${assignedTask.taskName} (${joinOrDash(assignedTask.assignee)})` : '',
        isAssigned: Boolean(assignedTaskId),
        totalLeadDays,
        computedDueDate,
      }
    })
  }, [assignmentByChecklist, checklistFilters.eventCategory, selectedChecklistProject?.eventDate, selectedChecklistProject?.id, sortedChecklistItems, taskById])

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
    ? getChecklistAssignmentTaskId(
        assignmentByChecklist,
        checklistFilters.eventCategory,
        assignmentTarget.itemId,
        selectedChecklistProject?.id,
      )
    : ''
  const hasQuickSearchResults = quickSearchSections.projects.length > 0 || quickSearchSections.tasks.length > 0

  const onQuickSearchPick = (scope: QuickSearchScope, id: string) => {
    if (scope === 'project') {
      const project = projectDbOptions.find((item) => item.id === id)
      if (project) {
        setFilters((prev) => ({
          ...prev,
          projectId: project.bindingValue,
          q: '',
        }))
        setActiveView('tasks')
      }
    } else {
      navigate(`/task/${encodeURIComponent(id)}`)
      setActiveView('tasks')
    }
    setQuickSearchOpen(false)
  }

  const onQuickSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (quickSearchSections.tasks[0]) {
      onQuickSearchPick('task', quickSearchSections.tasks[0].id)
      return
    }
    if (quickSearchSections.projects[0]) {
      onQuickSearchPick('project', quickSearchSections.projects[0].id)
    }
  }

  const openQuickSearch = useCallback(() => {
    setSidebarCollapsed(false)
    setQuickSearchOpen(true)
    window.setTimeout(() => {
      quickSearchInputRef.current?.focus()
      quickSearchInputRef.current?.select()
    }, 0)
  }, [])

  useKeybinding({
    key: 'k',
    ctrlOrMeta: true,
    onTrigger: openQuickSearch,
  })

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
    setTaskViewFilters(createDefaultTaskViewFilters())
  }

  const onTaskFiltersResetAll = () => {
    setFilters(createDefaultFilters())
    setTaskViewFilters(createDefaultTaskViewFilters())
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
    const key = toChecklistAssignmentKey(checklistFilters.eventCategory, itemId, selectedChecklistProject?.id)
    const legacyKey = toLegacyChecklistAssignmentKey(checklistFilters.eventCategory, itemId)
    const previous = assignmentByChecklist
    const next = { ...previous }
    delete next[legacyKey]
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
          projectId: selectedChecklistProject?.id ?? null,
          itemId,
          taskId: taskId || null,
        }),
      })
      setAssignmentByChecklist(response.assignments ?? next)
      if (response.storageMode) setAssignmentStorageMode(response.storageMode)
      if (taskId) {
        pushToast('success', '체크리스트 할당이 저장되었습니다.')
      } else {
        pushToast('success', '체크리스트 할당을 해제했습니다.')
      }
    } catch (error: unknown) {
      setAssignmentByChecklist(previous)
      const message = toErrorMessage(error, '체크리스트 할당 저장에 실패했습니다.')
      setAssignmentSyncError(message)
      pushToast('error', message)
    }
  }

  const onOpenAssignmentPicker = (item: ChecklistPreviewItem) => {
    setAssignmentTarget({
      itemId: item.id,
      productName: item.productName,
      workCategory: item.workCategory,
    })
    setAssignmentSearch('')
    setAssignmentProjectFilter(selectedChecklistProject?.name ?? '')
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
      pushToast('success', '업무 상태가 저장되었습니다.')
    } catch (error: unknown) {
      setTasks(previous)
      const message = toErrorMessage(error, '상태 변경에 실패했습니다.')
      setListError(message)
      pushToast('error', message)
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
      pushToast('success', '새 업무가 생성되었습니다.')
      navigate(`/task/${encodeURIComponent(created.task.id)}`)
    } catch (error: unknown) {
      const message = toErrorMessage(error, '업무 생성에 실패했습니다.')
      setListError(message)
      pushToast('error', message)
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
      } catch (error: unknown) {
        setDetailError(toErrorMessage(error, '업무 상세를 불러오지 못했습니다.'))
      } finally {
        setDetailLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'task') return
    void fetchTaskDetail(route.id)
  }, [authState, fetchTaskDetail, route])

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
      pushToast('success', '업무 변경사항이 저장되었습니다.')
    } catch (error: unknown) {
      const message = toErrorMessage(error, '업무 저장에 실패했습니다.')
      setDetailError(message)
      pushToast('error', message)
    } finally {
      setDetailSaving(false)
    }
  }

  if (AUTH_GATE_ENABLED && authState !== 'authenticated') {
    const checking = authState === 'checking'
    return (
      <div className="page authGateShell">
        <section className="authGateCard">
          <h1>보안 암호 확인</h1>
          <p className="muted">워크스페이스 접근을 위해 메인페이지 암호를 입력해 주세요.</p>
          <form className="authGateForm" onSubmit={onAuthSubmit}>
            <label>
              페이지 암호
              <input
                type="password"
                autoComplete="current-password"
                value={authPassword}
                disabled={checking || authSubmitting}
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="암호 입력"
              />
            </label>
            <div className="authGateActions">
              <button type="submit" disabled={checking || authSubmitting}>
                {checking || authSubmitting ? '확인 중...' : '입장'}
              </button>
            </div>
          </form>
          {authError ? <p className="error">{authError}</p> : null}
          <p className="authGateHint">API Base: {API_BASE_URL}</p>
        </section>
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    )
  }

  if (route.kind === 'task') {
    return (
      <>
        <TaskDetailView
          detailTask={detailTask}
          detailForm={detailForm}
          detailLoading={detailLoading}
          detailSaving={detailSaving}
          detailError={detailError}
          unknownMessages={unknownMessages}
          projects={projects}
          statusOptions={statusOptions}
          workTypeOptions={workTypeOptions}
          onBack={() => navigate('/')}
          onDetailInput={onDetailInput}
          onDetailSubmit={onDetailSubmit}
          toProjectLabel={toProjectLabel}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    )
  }

  return (
    <div className={`page mondayShell${sidebarCollapsed ? ' sidebarCollapsed' : ''}`}>
      <aside className={`mondaySidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebarWorkspace">
          <span className="workspaceMark">IZ</span>
          <div className="workspaceMeta">
            <strong>IZEN Design Team</strong>
            <span>Cloudflare + Notion Workspace</span>
          </div>
          <button
            type="button"
            className="secondary sidebarCollapseBtn"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            <span className="uiIcon">
              <UiGlyph name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} />
            </span>
          </button>
        </div>
        {sidebarCollapsed ? (
          <button
            type="button"
            className="secondary sidebarSearchIconBtn"
            onClick={openQuickSearch}
            title="빠른 이동 / 검색"
            aria-label="빠른 이동 / 검색"
          >
            <span className="uiIcon">
              <UiGlyph name="search" />
            </span>
          </button>
        ) : (
          <form className="quickSearchForm" onSubmit={onQuickSearchSubmit}>
            <label className="quickSearchInput">
              <span className="uiIcon">
                <UiGlyph name="search" />
              </span>
              <input
                ref={quickSearchInputRef}
                value={quickSearch}
                onFocus={() => setQuickSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setQuickSearchOpen(false), 130)}
                onChange={(event) => {
                  setQuickSearch(event.target.value)
                  setQuickSearchOpen(true)
                }}
                placeholder="프로젝트/업무 빠른 검색"
              />
              <span className="shortcutKey">⌘K</span>
            </label>

            {quickSearchOpen && quickSearch.trim() ? (
              <div className="quickSearchResults">
                {hasQuickSearchResults ? null : <p className="muted small quickSearchEmpty">검색 결과가 없습니다.</p>}
                {quickSearchSections.projects.length > 0 ? (
                  <div className="quickSearchGroup">
                    <strong>프로젝트</strong>
                    {quickSearchSections.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        className="quickSearchItem"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onQuickSearchPick('project', project.id)}
                      >
                        <span>{toProjectLabel(project)}</span>
                        <span>{project.eventDate || '-'}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {quickSearchSections.tasks.length > 0 ? (
                  <div className="quickSearchGroup">
                    <strong>업무</strong>
                    {quickSearchSections.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="quickSearchItem"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onQuickSearchPick('task', task.id)}
                      >
                        <span>{task.taskName}</span>
                        <span>{task.projectName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        )}
        <header className="sidebarBrand">
          <h1>디자인팀 업무 도우미</h1>
          <p>Plane-inspired Layout + Asana Workflow</p>
        </header>
        <section className="viewMenu">
          <div className="viewMenuHeader">
            <strong>Views</strong>
            <button type="button" className="secondary" onClick={() => setMenuCollapsed((prev) => !prev)}>
              <span className="iconLabel">
                <span className="uiIcon">
                  <UiGlyph name={menuCollapsed ? 'chevronRight' : 'chevronDown'} />
                </span>
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
                title="프로젝트"
              >
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="grid" />
                  </span>
                  <span>프로젝트</span>
                </span>
                <span className="viewTabCount">{projects.length}</span>
              </button>
              <button
                type="button"
                className={activeView === 'tasks' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('tasks')}
                title="업무"
              >
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="list" />
                  </span>
                  <span>업무</span>
                </span>
                <span className="viewTabCount">{tasks.length}</span>
              </button>
              <button
                type="button"
                className={activeView === 'schedule' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('schedule')}
                title="일정"
              >
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="calendar" />
                  </span>
                  <span>일정</span>
                </span>
              </button>
              <button
                type="button"
                className={activeView === 'checklist' ? 'viewTab active' : 'viewTab'}
                onClick={() => setActiveView('checklist')}
                title="행사 체크리스트"
              >
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="checksquare" />
                  </span>
                  <span>행사 체크리스트</span>
                </span>
              </button>
              {selectedViewDbUrl ? (
                <a className="linkButton secondary dbJump" href={selectedViewDbUrl} target="_blank" rel="noreferrer">
                  <span className="iconLabel">
                    <span className="uiIcon">
                      <UiGlyph name="external" />
                    </span>
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
            <p className="topbarPath">Design Team / {toTopViewPath(activeView)}</p>
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
                  <span className="uiIcon">
                    <UiGlyph name="list" />
                  </span>
                  <span>List</span>
                </span>
              </button>
              <button
                type="button"
                className={taskLayout === 'board' ? 'viewTab active' : 'viewTab'}
                onClick={() => setTaskLayout('board')}
              >
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="board" />
                  </span>
                  <span>Board</span>
                </span>
              </button>
              {taskLayout === 'board' ? (
                <label className="boardWorkflowMode">
                  워크플로우
                  <select value={boardWorkflowMode} onChange={(event) => setBoardWorkflowMode(event.target.value as BoardWorkflowMode)}>
                    <option value="grouped">그룹형(할 일/진행/완료)</option>
                    <option value="status">상태형(노션 상태 그대로)</option>
                  </select>
                </label>
              ) : null}
            </section>
          ) : null}
        </header>

        <section className="toolbar toolbarWrap">
          {activeView === 'tasks' ? (
            <button type="button" onClick={() => setCreateOpen(true)}>
              <span className="iconLabel">
                <span className="uiIcon">
                  <UiGlyph name="plus" />
                </span>
                <span>새 업무</span>
              </span>
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={() => void refreshListAndProjects()}>
            <span className="iconLabel">
              <span className="uiIcon">
                <UiGlyph name="refresh" />
              </span>
              <span>새로고침</span>
            </span>
          </button>
          <button type="button" className="secondary" onClick={() => void runApiConnectionTest()} disabled={apiCheckState === 'checking'}>
            <span className="iconLabel">
              <span className="uiIcon">
                <UiGlyph name="pulse" />
              </span>
              <span>{apiCheckState === 'checking' ? '연결 확인 중...' : 'API 연결 테스트'}</span>
            </span>
          </button>
          <button type="button" className="secondary" onClick={() => void onManualExport()} disabled={exporting}>
            <span className="iconLabel">
              <span className="uiIcon">
                <UiGlyph name="download" />
              </span>
              <span>{exporting ? '내보내는 중...' : '수동 Export'}</span>
            </span>
          </button>
          {USE_MOCK_DATA ? <span className="apiModePill">DEMO DATA</span> : null}
          <span className="apiBaseLabel">API Base: {API_BASE_URL}</span>
          <span className="syncLabel">마지막 동기화: {lastSyncedAt || '-'}</span>
        </section>

        {apiCheckMessage ? <p className={apiCheckState === 'error' ? 'error' : 'muted'}>{apiCheckMessage}</p> : null}
        {exportMessage ? <p className={exportMessage.includes('실패') ? 'error' : 'muted'}>{exportMessage}</p> : null}

      {activeView === 'tasks' ? (
        <TasksView
          taskLayout={taskLayout}
          projects={projects}
          filters={filters}
          statusOptions={statusOptions}
          taskSort={taskSort}
          taskViewFilters={taskViewFilters}
          workTypeOptions={workTypeOptions}
          assigneeOptions={assigneeOptions}
          requesterOptions={requesterOptions}
          groupedTasks={groupedTasks}
          boardColumns={boardColumns}
          projectByName={projectByName}
          openTaskGroups={openTaskGroups}
          statusUpdatingIds={statusUpdatingIds}
          loadingList={loadingList}
          listError={listError}
          unknownMessages={unknownMessages}
          onChangeFilter={onChangeFilter}
          onTaskSortChange={setTaskSort}
          onTaskViewFilterChange={onTaskViewFilterChange}
          onTaskViewFilterReset={onTaskViewFilterReset}
          onTaskFiltersResetAll={onTaskFiltersResetAll}
          onOpenTaskCreate={() => setCreateOpen(true)}
          onToggleTaskGroup={onToggleTaskGroup}
          onTaskOpen={(taskId) => navigate(`/task/${encodeURIComponent(taskId)}`)}
          onQuickStatusChange={onQuickStatusChange}
          toProjectLabel={toProjectLabel}
          joinOrDash={joinOrDash}
          unique={unique}
          toStatusTone={toStatusTone}
        />
      ) : null}

      {activeView === 'schedule' ? (
        <section className="checklistPreview">
          <div className="timelineWipBadge">일정 화면은 준비 중입니다.</div>
        </section>
      ) : null}

      {activeView === 'checklist' ? (
        <ChecklistView
          checklistFilters={checklistFilters}
          checklistCategories={checklistCategories}
          checklistSort={checklistSort}
          checklistLoading={checklistLoading}
          checklistError={checklistError}
          assignmentSyncError={assignmentSyncError}
          assignmentStorageMode={assignmentStorageMode}
          projectDbOptions={projectDbOptions}
          selectedChecklistProject={selectedChecklistProject}
          rows={checklistRows}
          onChecklistInput={onChecklistInput}
          onChecklistSubmit={onChecklistSubmit}
          onChecklistReset={onChecklistReset}
          onChecklistSortChange={setChecklistSort}
          onOpenAssignmentPicker={onOpenAssignmentPicker}
          onClearAssignment={(itemId) => setChecklistAssignment(itemId, '')}
          toProjectLabel={toProjectLabel}
          toProjectThumbUrl={toProjectThumbUrl}
          formatDateLabel={formatDateLabel}
        />
      ) : null}

      {activeView === 'projects' ? (
        <ProjectsView
          sortedProjectDbOptions={sortedProjectDbOptions}
          projectSort={projectSort}
          projectTimelineGroups={projectTimelineGroups}
          projectTimelineRange={projectTimelineRange}
          loadingProjects={loadingProjects}
          onProjectSortChange={setProjectSort}
          onTaskOpen={(taskId) => navigate(`/task/${encodeURIComponent(taskId)}`)}
          formatDateLabel={formatDateLabel}
          toIsoDate={toIsoDate}
          toNotionUrlById={toNotionUrlById}
          joinOrDash={joinOrDash}
          toStatusTone={toStatusTone}
        />
      ) : null}

      <AssignmentModal
        assignmentTarget={assignmentTarget}
        assignmentSearch={assignmentSearch}
        assignmentProjectFilter={assignmentProjectFilter}
        assignmentProjectOptions={assignmentProjectOptions}
        assignmentCandidates={assignmentCandidates}
        assignmentTargetCurrentTaskId={assignmentTargetCurrentTaskId}
        onClose={() => setAssignmentTarget(null)}
        onAssignmentSearchChange={setAssignmentSearch}
        onAssignmentProjectFilterChange={setAssignmentProjectFilter}
        onSelectAssignmentTask={onSelectAssignmentTask}
        joinOrDash={joinOrDash}
      />

      <TaskCreateModal
        createOpen={createOpen}
        createSubmitting={createSubmitting}
        createForm={createForm}
        projects={projects}
        onClose={() => setCreateOpen(false)}
        onCreateSubmit={onCreateSubmit}
        onCreateInput={onCreateInput}
        toProjectLabel={toProjectLabel}
      />

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
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App
