import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AssignmentModal } from './features/checklist/AssignmentModal'
import { ChecklistView } from './features/checklist/ChecklistView'
import { EventGraphicsPrintPage } from './features/eventGraphics/EventGraphicsPrintPage'
import { EventGraphicsSharePage } from './features/eventGraphics/EventGraphicsSharePage'
import { DashboardView } from './features/dashboard/DashboardView'
import { EventGraphicsTimetableView } from './features/eventGraphics/EventGraphicsTimetableView'
import { MailTemplateView } from './features/mailTemplate/MailTemplateView'
import { MeetingsView } from './features/meetings/MeetingsView'
import { ProjectsView } from './features/projects/ProjectsView'
import { ScheduleView } from './features/schedule/ScheduleView'
import { ScreeningDbView } from './features/screening/ScreeningDbView'
import { ScreeningPlanImportModal, type ScreeningPlanImportForm } from './features/screening/ScreeningPlanImportModal'
import { SnsPostGeneratorView } from './features/snsPost/SnsPostGeneratorView'
import { TaskDetailView } from './features/taskDetail/TaskDetailView'
import { TaskCreateModal } from './features/tasks/TaskCreateModal'
import { TasksView } from './features/tasks/TasksView'
import { GeminiImageTestView } from './features/tools/GeminiImageTestView'
import { api, USE_MOCK_DATA } from './shared/api/client'
import { formatProjectIconLabel } from './shared/emoji'
import { useDebouncedValue } from './shared/hooks/useDebouncedValue'
import { useKeybinding } from './shared/hooks/useKeybinding'
import { ToastStack, type ToastItem, type ToastTone } from './shared/ui'
import './App.css'
import './shared/ui/ui.css'

type Route =
  | {
      kind: 'list'
    }
  | {
      kind: 'eventGraphicsShare'
    }
  | {
      kind: 'eventGraphicsPrint'
    }
  | {
      kind: 'task'
      id: string
    }

type AppVersionManifest = {
  id: string
  builtAt: string
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
  workTypeColor?: string
  taskName: string
  status: string
  statusColor?: string
  assignee: string[]
  startDate?: string
  dueDate?: string
  actualStartDate?: string
  actualEndDate?: string
  detail: string
  priority?: string
  urgent?: boolean
  issue?: string
  predecessorTask?: string
  predecessorPending?: boolean
  outputLink?: string
}

type ProjectRecord = {
  id: string
  key: string
  bindingValue: string
  name: string
  eventDate?: string
  shippingDate?: string
  operationMode?: 'self' | 'dealer'
  fulfillmentMode?: 'domestic' | 'overseas' | 'dealer'
  projectType?: string
  eventCategory?: string
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
  applicableProjectTypes: string[]
  applicableEventCategories: string[]
  designLeadDays?: number
  productionLeadDays?: number
  bufferDays?: number
  totalLeadDays?: number
  computedDueDate?: string
}

type ChecklistAssignmentStatus = 'not_applicable' | 'unassigned' | 'assigned'

type ChecklistAssignmentRow = {
  id: string
  key: string
  projectPageId: string
  checklistItemPageId: string
  taskPageId: string | null
  applicable: boolean
  assignmentStatus: ChecklistAssignmentStatus
  assignmentStatusText: string
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
  rows?: ChecklistAssignmentRow[]
  row?: ChecklistAssignmentRow
  assignments?: Record<string, string>
  storageMode?: 'notion_matrix' | 'd1' | 'cache'
  syncing?: boolean
}

type ScheduleColumn = {
  id: string
  name: string
  type: string
}

type ScheduleFile = {
  name: string
  url: string
  kind: 'image' | 'video' | 'audio' | 'file'
}

type ScheduleCell = {
  columnId: string
  type: string
  text: string
  href?: string | null
  files?: ScheduleFile[]
}

type ScheduleRow = {
  id: string
  url: string | null
  cells: ScheduleCell[]
}

type ScheduleResponse = {
  ok: boolean
  configured: boolean
  database: {
    id: string | null
    url: string | null
    title: string
  }
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  cacheTtlMs: number
}

function getScheduleColumnIndex(columns: ScheduleColumn[], columnName: string): number {
  return columns.findIndex((column) => column.name === columnName)
}

function readScheduleCellText(row: ScheduleRow, columns: ScheduleColumn[], columnName: string): string {
  const index = getScheduleColumnIndex(columns, columnName)
  return index >= 0 ? row.cells[index]?.text?.trim() ?? '' : ''
}

function readScheduleTitleText(row: ScheduleRow, columns: ScheduleColumn[]): string {
  const titleIndex = columns.findIndex((column) => column.type === 'title')
  const effectiveIndex = titleIndex >= 0 ? titleIndex : 0
  return row.cells[effectiveIndex]?.text?.trim() ?? ''
}

function normalizeScheduleKey(value: string): string {
  return value.trim().replace(/-/g, '').toLowerCase()
}

function resolveScheduleRelationText(raw: string, labelMap: Record<string, string>): string {
  const labels = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => labelMap[normalizeScheduleKey(value)] ?? labelMap[value] ?? value)
  return labels.join(', ')
}

type EventGraphicsTimetableResponse = {
  ok: boolean
  configured: boolean
  database: {
    id: string | null
    url: string | null
    title: string
  }
  columns: ScheduleColumn[]
  rows: ScheduleRow[]
  cacheTtlMs: number
}

type ScreeningPlanHistorySyncResponse = {
  ok: boolean
  configured: boolean
  planDatabaseId: string | null
  historyDatabaseId: string | null
  created: number
  updated: number
  skipped: number
  syncedPlanIds: string[]
}

type ScreeningPlanImportResponse = {
  ok: boolean
  configured: boolean
  planDatabaseId: string | null
  historyDatabaseId: string | null
  matched: number
  created: number
  skipped: number
  createdPlanIds: string[]
}

type MetaResponse = {
  ok: boolean
  databases: {
    project: { id: string; url: string | null }
    task: { id: string; url: string | null }
    checklist: { id: string | null; url: string | null }
    schedule?: { id: string | null; url: string | null }
    screeningHistory?: { id: string | null; url: string | null }
    screeningPlan?: { id: string | null; url: string | null }
    screeningVideo?: { id: string | null; url: string | null }
    eventGraphicsTimetable?: { id: string | null; url: string | null }
    meeting?: { id: string; url: string | null }
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

type CopyTextOptions = {
  successMessage?: string
  emptyMessage?: string
}

type GuideConfigRow = {
  name: string
  location: string
  secret: string
  billing: string
  impact: string
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

type TopView =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'schedule'
  | 'screeningHistory'
  | 'screeningPlan'
  | 'eventGraphics'
  | 'checklist'
  | 'meetings'
  | 'snsPost'
  | 'geminiImageTest'
  | 'mailTemplate'
  | 'guide'

type ProjectSort = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc'
type TaskSort = 'due_asc' | 'due_desc' | 'start_asc' | 'start_desc' | 'status_asc' | 'name_asc'
type ChecklistSort = 'due_asc' | 'due_desc' | 'name_asc' | 'name_desc' | 'lead_asc' | 'lead_desc'
type TaskLayoutMode = 'list' | 'board' | 'kanban'
type TaskQuickGroupBy = 'assignee' | 'project' | 'status' | 'due'
type ViewMenuGroupKey = 'operations' | 'events' | 'tools'

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

type QuickSearchScope = 'project' | 'task'
type ThemeKey = 'v1' | 'v2' | 'v3'

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
const TOAST_LIFETIME_MS = 3600
const AUTH_GATE_ENABLED = true
const THEME_QUERY_KEY = 'theme'
const THEME_STORAGE_KEY = 'izen_theme'
const DEFAULT_THEME: ThemeKey = 'v3'
const ENABLE_SYSTEM_THEME_FALLBACK = false
const INITIAL_SCREENING_PLAN_IMPORT_FORM: ScreeningPlanImportForm = {
  sourceEventName: '',
  targetProjectId: '',
}

const GUIDE_SECRET_ROWS: GuideConfigRow[] = [
  {
    name: 'PAGE_PASSWORD',
    location: '웹 로그인 비밀번호, /api/auth/login',
    secret: '예',
    billing: '없음',
    impact: '교체하면 웹 로그인 비밀번호가 즉시 바뀌고, 운영자 안내 없이 바꾸면 접속 문의가 생깁니다.',
  },
  {
    name: 'SESSION_SECRET',
    location: '세션 쿠키 서명, 업로드 토큰 서명 fallback',
    secret: '예',
    billing: '없음',
    impact: '교체하면 기존 로그인 세션이 무효화될 수 있고, 서명 검증 기준이 바뀝니다.',
  },
  {
    name: 'API_KEY',
    location: '서버간 호출용 X-API-Key 인증',
    secret: '예',
    billing: '없음',
    impact: '교체하면 외부 자동화 스크립트나 봇이 헤더 값을 같이 바꾸기 전까지 인증 실패가 납니다.',
  },
  {
    name: 'NOTION_TOKEN',
    location: '프로젝트/업무/체크리스트/일정/상영/회의록 Notion API 전체',
    secret: '예',
    billing: '직접 과금 없음',
    impact: '교체 후 권한이 부족하면 대부분의 데이터 조회/수정이 동시에 멈춥니다.',
  },
  {
    name: 'ASSEMBLYAI_API_KEY',
    location: '회의록 음성 전사 생성, transcript 조회',
    secret: '예',
    billing: '있음',
    impact: '교체하면 회의록 새 전사 생성과 전사 상세 동기화가 실패할 수 있습니다.',
  },
  {
    name: 'ASSEMBLYAI_WEBHOOK_SECRET',
    location: 'AssemblyAI webhook 검증',
    secret: '예',
    billing: '없음',
    impact: '교체 시 AssemblyAI 쪽 webhook secret도 같이 바꾸지 않으면 webhook이 거절됩니다.',
  },
  {
    name: 'OPENAI_API_KEY',
    location: '회의록 publish 시 요약 생성',
    secret: '예',
    billing: '있음',
    impact: '교체하거나 제거하면 회의록 본문 publish는 가능해도 요약 생성/재시도가 실패하거나 비활성화됩니다.',
  },
  {
    name: 'LINE_CHANNEL_ACCESS_TOKEN',
    location: 'LINE 리마인더 push 발송',
    secret: '예',
    billing: '플랜 의존',
    impact: '교체가 틀리면 아침/저녁 LINE 알림 발송이 멈춥니다.',
  },
  {
    name: 'LINE_CHANNEL_SECRET',
    location: 'LINE webhook 서명 검증',
    secret: '예',
    billing: '없음',
    impact: '교체 시 LINE Developers 설정과 맞지 않으면 webhook 검증 실패가 납니다.',
  },
  {
    name: 'R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY',
    location: '회의록 음성파일 R2 presigned URL 생성',
    secret: '부분',
    billing: '있음',
    impact: '교체가 어긋나면 오디오 업로드/다운로드 URL 발급이 깨져 STT 파이프라인이 막힙니다.',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    location: 'Wrangler 수동 배포/복구',
    secret: '예',
    billing: '없음',
    impact: '없으면 배포 CLI만 막히고, 이미 떠 있는 서비스 런타임에는 직접 영향이 없습니다.',
  },
]

const GUIDE_DB_ROWS: GuideConfigRow[] = [
  {
    name: 'NOTION_PROJECT_DB_ID',
    location: '프로젝트 탭, 전체 관계 기준 DB',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 프로젝트 목록과 관계 기준이 함께 바뀌어 다른 탭의 연결 해석도 흔들릴 수 있습니다.',
  },
  {
    name: 'NOTION_TASK_DB_ID',
    location: '업무 탭, 체크리스트 할당/상영 연계',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 업무 조회/수정이 끊기고 체크리스트 연동도 같이 깨질 수 있습니다.',
  },
  {
    name: 'NOTION_CHECKLIST_DB_ID',
    location: '행사 체크리스트 탭',
    secret: '아니오',
    billing: '없음',
    impact: '비우거나 오입력하면 체크리스트 항목 로딩이 비어 보입니다.',
  },
  {
    name: 'NOTION_CHECKLIST_ASSIGNMENT_DB_ID',
    location: '행사-체크리스트 할당 매트릭스 동기화',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 체크리스트의 할당/미할당/해당없음 저장 위치가 달라져 기존 기록이 안 보일 수 있습니다.',
  },
  {
    name: 'NOTION_SCHEDULE_DB_ID',
    location: '일정 탭',
    secret: '아니오',
    billing: '없음',
    impact: '비우거나 잘못 넣으면 일정 탭이 비활성화되거나 다른 DB를 읽습니다.',
  },
  {
    name: 'NOTION_SCREENING_HISTORY_DB_ID',
    location: '상영 기록 탭',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 상영 히스토리 원본이 바뀌고, 상영 준비 히스토리 반영 기준도 함께 달라집니다.',
  },
  {
    name: 'NOTION_SCREENING_PLAN_DB_ID',
    location: '상영 준비 탭',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 상영 준비 작업판이 다른 DB를 바라보고 히스토리 반영 대상도 바뀝니다.',
  },
  {
    name: 'NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID',
    location: '타임테이블 탭',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 cue별 그래픽 상태 화면이 다른 타임테이블 DB를 읽습니다.',
  },
  {
    name: 'NOTION_MEETING_DB_ID',
    location: '회의록 Notion 저장 대상',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 publish 결과가 다른 회의록 DB에 쌓입니다.',
  },
]

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

function createDefaultViewMenuOpenState(): Record<ViewMenuGroupKey, boolean> {
  return {
    operations: true,
    events: true,
    tools: true,
  }
}

function parseTopView(value: string | null): TopView {
  if (
    value === 'dashboard' ||
    value === 'projects' ||
    value === 'tasks' ||
    value === 'schedule' ||
    value === 'screeningHistory' ||
    value === 'screeningPlan' ||
    value === 'eventGraphics' ||
    value === 'checklist' ||
    value === 'meetings' ||
    value === 'snsPost' ||
    value === 'geminiImageTest' ||
    value === 'mailTemplate' ||
    value === 'guide'
  )
    return value
  return 'dashboard'
}

function parseTaskLayout(value: string | null): TaskLayoutMode {
  if (value === 'board' || value === 'kanban') return 'board'
  return 'list'
}

function parseTaskQuickGroupBy(value: string | null): TaskQuickGroupBy {
  if (value === 'assignee' || value === 'status' || value === 'due') return value
  return 'project'
}

function parseBooleanQuery(value: string | null): boolean {
  return value === '1' || value === 'true'
}

function parseThemeValue(value: string | null | undefined): ThemeKey | null {
  if (value === 'v1' || value === 'v2' || value === 'v3') return value
  return null
}

function resolveSystemTheme(): ThemeKey {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'v2' : 'v1'
  }
  return DEFAULT_THEME
}

function readStoredTheme(): ThemeKey | null {
  try {
    return parseThemeValue(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
}

function resolveThemeFromSearch(search: string): ThemeKey {
  const params = new URLSearchParams(search)
  const fromQuery = parseThemeValue(params.get(THEME_QUERY_KEY))
  if (fromQuery) return fromQuery

  const fromStorage = readStoredTheme()
  if (fromStorage) return fromStorage

  if (ENABLE_SYSTEM_THEME_FALLBACK) return resolveSystemTheme()
  return DEFAULT_THEME
}

function writeThemeToStorage(theme: ThemeKey): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage errors in restrictive browser contexts.
  }
}

function applyThemeToDocument(theme: ThemeKey): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme === 'v2' ? 'dark' : 'light'
}

function readListUiStateFromSearch(search: string): {
  activeView: TopView
  taskLayout: TaskLayoutMode
  taskQuickGroupBy: TaskQuickGroupBy
  showTaskFilters: boolean
  filters: Filters
  taskViewFilters: TaskViewFilters
} {
  const params = new URLSearchParams(search)
  const showTaskFiltersParam = params.get('showTaskFilters')
  return {
    activeView: parseTopView(params.get('view')),
    taskLayout: parseTaskLayout(params.get('taskLayout')),
    taskQuickGroupBy: parseTaskQuickGroupBy(params.get('taskGroupBy')),
    showTaskFilters: showTaskFiltersParam === null ? true : parseBooleanQuery(showTaskFiltersParam),
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
  | 'kanban'

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
  if (name === 'kanban') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1.1" {...common} />
        <path d="M6 2.5v11" {...common} />
        <path d="M10 2.5v11" {...common} />
        <path d="M2 6.5h12" {...common} />
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
  if (view === 'dashboard') return 'Team Dashboard'
  if (view === 'projects') return 'Projects'
  if (view === 'tasks') return 'Tasks'
  if (view === 'schedule') return 'Schedule'
  if (view === 'screeningHistory') return 'Screening History'
  if (view === 'screeningPlan') return 'Screening Plan'
  if (view === 'eventGraphics') return 'Event Graphics Timetable'
  if (view === 'meetings') return 'Meetings'
  if (view === 'snsPost') return 'SNS Post Generator'
  if (view === 'geminiImageTest') return 'Gemini Image Test'
  if (view === 'mailTemplate') return 'Mail Template'
  if (view === 'guide') return 'Usage Guide'
  return 'Event Checklist'
}

function toTopViewTitle(view: TopView): string {
  if (view === 'dashboard') return '팀 운영 대시보드'
  if (view === 'projects') return '프로젝트'
  if (view === 'tasks') return '업무'
  if (view === 'schedule') return '일정'
  if (view === 'screeningHistory') return '상영 기록'
  if (view === 'screeningPlan') return '상영 준비'
  if (view === 'eventGraphics') return '타임테이블'
  if (view === 'meetings') return '회의록'
  if (view === 'snsPost') return 'SNS 본문 생성'
  if (view === 'geminiImageTest') return 'Gemini 이미지 테스트'
  if (view === 'mailTemplate') return '메일 템플릿'
  if (view === 'checklist') return '행사 체크리스트'
  return '사용법'
}

function normalizeStatus(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
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
  if (cleaned === '/share/timetable') {
    return { kind: 'eventGraphicsShare' }
  }
  if (cleaned === '/share/timetable/print') {
    return { kind: 'eventGraphicsPrint' }
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

function formatBuildTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR', { hour12: false })
}

function toProjectLabel(project: ProjectRecord): string {
  const iconLabel = formatProjectIconLabel(project.iconEmoji)
  if (iconLabel) return `${iconLabel} ${project.name}`
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

function sanitizeChecklistTaskPageId(value: string | undefined | null): string {
  const taskPageId = (value ?? '').trim()
  if (!taskPageId) return ''
  if (taskPageId.includes('::')) return ''
  return taskPageId
}

function checklistItemLookupKey(value: string | undefined | null): string {
  return normalizeNotionId(value)
}

function checklistItemKeyFromAssignmentRow(row: ChecklistAssignmentRow): string {
  const fromRelation = checklistItemLookupKey(row.checklistItemPageId)
  if (fromRelation) return fromRelation
  const rawKey = (row.key ?? '').trim()
  if (!rawKey) return ''
  const parts = rawKey.split('::')
  if (parts.length < 2) return ''
  return checklistItemLookupKey(parts[parts.length - 1] ?? '')
}

function checklistAssignmentRowPriority(row: ChecklistAssignmentRow): number {
  const taskId = sanitizeChecklistTaskPageId(row.taskPageId)
  let score = 0
  if (row.assignmentStatus === 'assigned') score += taskId ? 300 : 160
  else if (row.assignmentStatus === 'unassigned') score += 100
  const statusText = (row.assignmentStatusText ?? '').trim().toLowerCase()
  if (statusText.includes('assigned') || statusText.includes('할당')) score += 10
  if (statusText.includes('unassigned') || statusText.includes('미할당')) score += 5
  return score
}

function toTimelineStatusRank(status: string | undefined): number {
  const tone = toStatusTone(status)
  if (tone === 'gray') return 0
  if (tone === 'blue' || tone === 'red') return 1
  if (tone === 'green') return 2
  return 1
}

function normalizeTaskLookupKey(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function extractPredecessorTokens(...sources: Array<string | undefined>): string[] {
  const patterns = [
    /(?:\uC120\uD589\uC791\uC5C5|\uC120\uD589|preced(?:ing|essor)?|depends?\s*on)\s*[:\uFF1A]\s*([^\n]+)/gi,
    /(?:after)\s*[:\uFF1A]\s*([^\n]+)/gi,
  ]
  const tokens: string[] = []

  for (const source of sources) {
    if (!source) continue
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const chunk = (match[1] ?? '').trim()
        if (chunk) {
          const split = chunk.split(/[,|/>\u2192]/g).map((entry) => entry.trim())
          for (const part of split) {
            const cleaned = part.replace(/^\s*[-*]\s*/, '').trim()
            if (cleaned) tokens.push(cleaned)
          }
        }
        match = pattern.exec(source)
      }
    }
  }

  return tokens
}

function diffDays(from: Date, to: Date): number {
  const ms = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / ms)
}

function asSortDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-12-31'
}

function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

function shiftBusinessDays(date: Date, offsetDays: number): Date {
  if (offsetDays === 0) return new Date(date.getTime())
  const direction = offsetDays > 0 ? 1 : -1
  let remaining = Math.abs(offsetDays)
  let current = new Date(date.getTime())
  while (remaining > 0) {
    current = addDays(current, direction)
    if (isBusinessDay(current)) {
      remaining -= 1
    }
  }
  return current
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
  return toIsoDate(parsed)
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
  return toIsoDate(shiftBusinessDays(base, -Math.abs(totalLead)))
}

function checklistMatrixKey(projectPageId: string, checklistItemPageId: string): string {
  return `${projectPageId}::${checklistItemPageId}`
}

function toChecklistAssignmentLabel(status: ChecklistAssignmentStatus): string {
  if (status === 'not_applicable') return '해당없음'
  if (status === 'assigned') return '할당됨'
  return '미할당'
}

function normalizeChecklistValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

function splitChecklistCandidates(value: string | undefined): string[] {
  const raw = (value ?? '').normalize('NFKC')
  return raw
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function includesChecklistValue(values: string[] | undefined, target: string | undefined): boolean {
  const normalizedTarget = normalizeChecklistValue(target)
  if (!normalizedTarget) return false
  return (values ?? []).some((entry) => {
    const normalizedEntry = normalizeChecklistValue(entry)
    if (!normalizedEntry) return false
    if (normalizedEntry === normalizedTarget) return true
    return splitChecklistCandidates(entry).some((candidate) => normalizeChecklistValue(candidate) === normalizedTarget)
  })
}

function isChecklistSelectableProject(project: ProjectRecord): boolean {
  const normalizedType = normalizeChecklistValue(project.projectType)
  return normalizedType === normalizeChecklistValue('행사') || normalizedType === normalizeChecklistValue('전시회')
}

function checklistAppliesToProject(item: ChecklistPreviewItem, project: ProjectRecord | undefined): boolean {
  if (!project) return false
  const byProjectType = !item.applicableProjectTypes?.length || includesChecklistValue(item.applicableProjectTypes, project.projectType)
  const categoryCandidates = item.applicableEventCategories?.length ? item.applicableEventCategories : item.eventCategories
  const byEventCategory =
    normalizeChecklistValue(project.eventCategory) === ''
      ? (categoryCandidates?.length ?? 0) === 0
      : includesChecklistValue(categoryCandidates, project.eventCategory)
  return Boolean(byProjectType && byEventCategory)
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
  const currentBuild = useMemo<AppVersionManifest>(
    () => ({
      id: __APP_BUILD_ID__,
      builtAt: __APP_BUILD_TIME__,
    }),
    [],
  )
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  const [latestAvailableBuild, setLatestAvailableBuild] = useState<AppVersionManifest | null>(null)
  const [theme, setTheme] = useState<ThemeKey>(() => resolveThemeFromSearch(window.location.search))
  const [activeView, setActiveView] = useState<TopView>(initialListUiState.activeView)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [viewMenuOpenState, setViewMenuOpenState] = useState<Record<ViewMenuGroupKey, boolean>>(createDefaultViewMenuOpenState)
  const [projectSort, setProjectSort] = useState<ProjectSort>('name_asc')
  const [taskSort, setTaskSort] = useState<TaskSort>('due_asc')
  const [taskLayout, setTaskLayout] = useState<TaskLayoutMode>(initialListUiState.taskLayout)
  const [taskQuickGroupBy, setTaskQuickGroupBy] = useState<TaskQuickGroupBy>(initialListUiState.taskQuickGroupBy)
  const [showTaskFilters, setShowTaskFilters] = useState(initialListUiState.showTaskFilters)
  const [checklistSort, setChecklistSort] = useState<ChecklistSort>('due_asc')
  const [checklistMode, setChecklistMode] = useState<'schedule_share' | 'assignment'>('assignment')
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
    schedule: string | null
    screeningHistory: string | null
    screeningPlan: string | null
    screeningVideo: string | null
    eventGraphics: string | null
  }>({
    project: null,
    task: null,
    checklist: null,
    schedule: null,
    screeningHistory: null,
    screeningPlan: null,
    screeningVideo: null,
    eventGraphics: null,
  })

  const [filters, setFilters] = useState<Filters>(initialListUiState.filters)
  const [taskViewFilters, setTaskViewFilters] = useState<TaskViewFilters>(initialListUiState.taskViewFilters)
  const debouncedFilterQ = useDebouncedValue(filters.q, 250)
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('authenticated')
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [loadingList, setLoadingList] = useState(true)
  const [loadingProjects, setLoadingProjects] = useState(true)
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
  const [checklistLoading, setChecklistLoading] = useState(false)
  const [checklistError, setChecklistError] = useState<string | null>(null)
  const [scheduleConfigured, setScheduleConfigured] = useState(false)
  const [scheduleDatabaseTitle, setScheduleDatabaseTitle] = useState('')
  const [scheduleColumns, setScheduleColumns] = useState<ScheduleColumn[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [screeningHistoryConfigured, setScreeningHistoryConfigured] = useState(false)
  const [screeningHistoryDatabaseTitle, setScreeningHistoryDatabaseTitle] = useState('')
  const [screeningHistoryColumns, setScreeningHistoryColumns] = useState<ScheduleColumn[]>([])
  const [screeningHistoryRows, setScreeningHistoryRows] = useState<ScheduleRow[]>([])
  const [screeningHistoryLoading, setScreeningHistoryLoading] = useState(false)
  const [screeningHistoryError, setScreeningHistoryError] = useState<string | null>(null)
  const [screeningPlanConfigured, setScreeningPlanConfigured] = useState(false)
  const [screeningPlanDatabaseTitle, setScreeningPlanDatabaseTitle] = useState('')
  const [screeningPlanColumns, setScreeningPlanColumns] = useState<ScheduleColumn[]>([])
  const [screeningPlanRows, setScreeningPlanRows] = useState<ScheduleRow[]>([])
  const [screeningPlanLoading, setScreeningPlanLoading] = useState(false)
  const [screeningPlanError, setScreeningPlanError] = useState<string | null>(null)
  const [screeningPlanSyncing, setScreeningPlanSyncing] = useState(false)
  const [screeningPlanImportOpen, setScreeningPlanImportOpen] = useState(false)
  const [screeningPlanImporting, setScreeningPlanImporting] = useState(false)
  const [screeningPlanImportForm, setScreeningPlanImportForm] = useState<ScreeningPlanImportForm>(INITIAL_SCREENING_PLAN_IMPORT_FORM)
  const [eventGraphicsConfigured, setEventGraphicsConfigured] = useState(false)
  const [eventGraphicsDatabaseTitle, setEventGraphicsDatabaseTitle] = useState('')
  const [eventGraphicsColumns, setEventGraphicsColumns] = useState<ScheduleColumn[]>([])
  const [eventGraphicsRows, setEventGraphicsRows] = useState<ScheduleRow[]>([])
  const [eventGraphicsLoading, setEventGraphicsLoading] = useState(false)
  const [eventGraphicsError, setEventGraphicsError] = useState<string | null>(null)
  const [assignmentSyncError, setAssignmentSyncError] = useState<string | null>(null)
  const [assignmentStorageMode, setAssignmentStorageMode] = useState<'notion_matrix' | 'd1' | 'cache'>('notion_matrix')
  const [assignmentRows, setAssignmentRows] = useState<ChecklistAssignmentRow[]>([])
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [assignmentSyncing, setAssignmentSyncing] = useState(false)
  const [checklistCreatingTaskIds, setChecklistCreatingTaskIds] = useState<Record<string, boolean>>({})
  const [checklistTaskOverrides, setChecklistTaskOverrides] = useState<Record<string, TaskRecord>>({})
  const [prioritizeUnassignedChecklist, setPrioritizeUnassignedChecklist] = useState(true)
  const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({})
  const [openProjectTimelineGroups, setOpenProjectTimelineGroups] = useState<Record<string, boolean>>({})
  const [assignmentTarget, setAssignmentTarget] = useState<ChecklistAssignmentTarget | null>(null)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentProjectFilter, setAssignmentProjectFilter] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastTimerRef = useRef<Record<number, number>>({})
  const projectSchemaSyncDoneRef = useRef(false)
  const checklistTaskFetchInFlightRef = useRef<Set<string>>(new Set())

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

  const copyText = useCallback(
    async (text: string, options?: CopyTextOptions) => {
      const normalized = text.trim()
      if (!normalized) {
        pushToast('error', options?.emptyMessage ?? '복사할 내용이 없습니다.')
        return
      }

      try {
        await navigator.clipboard.writeText(normalized)
        pushToast('success', options?.successMessage ?? '보고 문구를 복사했습니다.')
      } catch {
        pushToast('error', '클립보드 복사에 실패했습니다.')
      }
    },
    [pushToast],
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
    applyThemeToDocument(theme)
  }, [theme])

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

  const onThemeChange = useCallback((nextTheme: ThemeKey) => {
    setTheme(nextTheme)
    writeThemeToStorage(nextTheme)

    const params = new URLSearchParams(window.location.search)
    params.set(THEME_QUERY_KEY, nextTheme)
    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
    window.history.replaceState({}, '', nextUrl)
  }, [])

  const applyListUiStateFromSearch = useCallback((search: string) => {
    const next = readListUiStateFromSearch(search)
    setActiveView(next.activeView)
    setTaskLayout(next.taskLayout)
    setTaskQuickGroupBy(next.taskQuickGroupBy)
    setShowTaskFilters(next.showTaskFilters)
    setFilters(next.filters)
    setTaskViewFilters(next.taskViewFilters)
  }, [])

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = parseRoute(window.location.pathname)
      setRoute(nextRoute)
      setTheme(resolveThemeFromSearch(window.location.search))
      if (nextRoute.kind === 'list') {
        applyListUiStateFromSearch(window.location.search)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [applyListUiStateFromSearch])

  useEffect(() => {
    let disposed = false
    const versionUrl = new URL(/* @vite-ignore */ '../app-version.json', import.meta.url)

    const checkLatestBuild = async () => {
      try {
        const response = await fetch(`${versionUrl.toString()}?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const manifest = (await response.json()) as Partial<AppVersionManifest>
        if (!manifest.id || !manifest.builtAt || disposed) return
        if (manifest.id !== currentBuild.id) {
          setLatestAvailableBuild({
            id: manifest.id,
            builtAt: manifest.builtAt,
          })
          return
        }
        setLatestAvailableBuild(null)
      } catch {
        // Non-blocking: deployment checks should never break the workspace.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkLatestBuild()
      }
    }

    void checkLatestBuild()
    const timer = window.setInterval(() => {
      void checkLatestBuild()
    }, 30_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [currentBuild.id])

  useEffect(() => {
    if (route.kind !== 'list') return

    const params = new URLSearchParams(window.location.search)
    params.set('view', activeView)
    params.set('taskLayout', taskLayout)
    params.set('taskGroupBy', taskQuickGroupBy)
    params.delete('boardWorkflowMode')

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
    if (showTaskFilters) {
      params.delete('showTaskFilters')
    } else {
      params.set('showTaskFilters', '0')
    }

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    const currentUrl = `${window.location.pathname}${window.location.search}`
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [
    activeView,
    filters.projectId,
    filters.q,
    filters.status,
    route.kind,
    showTaskFilters,
    taskLayout,
    taskQuickGroupBy,
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
      if (!projectSchemaSyncDoneRef.current) {
        try {
          await api('/admin/notion/project-schema/sync', { method: 'POST' })
          projectSchemaSyncDoneRef.current = true
        } catch (error: unknown) {
          pushToast('error', toErrorMessage(error, '프로젝트 DB 속성 동기화에 실패했습니다. 노션 통합 권한을 확인해 주세요.'))
        }
      }

      const response = await api<ProjectsResponse>('/projects')
      setProjects(response.projects)
      setSchema(response.schema)
    } finally {
      setLoadingProjects(false)
    }
  }, [pushToast])

  const fetchMeta = useCallback(async () => {
    try {
      const response = await api<MetaResponse>('/meta')
      setDbLinks({
        project: response.databases.project.url ?? toNotionUrlById(response.databases.project.id),
        task: response.databases.task.url ?? toNotionUrlById(response.databases.task.id),
        checklist: response.databases.checklist.url ?? toNotionUrlById(response.databases.checklist.id ?? undefined),
        schedule: response.databases.schedule?.url ?? toNotionUrlById(response.databases.schedule?.id ?? undefined),
        screeningHistory: response.databases.screeningHistory?.url ?? toNotionUrlById(response.databases.screeningHistory?.id ?? undefined),
        screeningPlan: response.databases.screeningPlan?.url ?? toNotionUrlById(response.databases.screeningPlan?.id ?? undefined),
        screeningVideo: response.databases.screeningVideo?.url ?? toNotionUrlById(response.databases.screeningVideo?.id ?? undefined),
        eventGraphics: response.databases.eventGraphicsTimetable?.url ?? toNotionUrlById(response.databases.eventGraphicsTimetable?.id ?? undefined),
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
      const selectedProject = projects.find(
        (project) => project.source === 'project_db' && project.name === input.eventName && isChecklistSelectableProject(project),
      )
      if (input.eventName.trim()) params.set('eventName', input.eventName.trim())
      if (input.eventCategory.trim()) params.set('eventCategory', input.eventCategory.trim())
      if (selectedProject?.eventDate) params.set('eventDate', selectedProject.eventDate)
      if (parseIsoDate(input.shippingDate)) params.set('shippingDate', input.shippingDate)
      if (input.operationMode) params.set('operationMode', input.operationMode)
      if (input.fulfillmentMode) params.set('fulfillmentMode', input.fulfillmentMode)

      const path = params.size > 0 ? `/checklists?${params.toString()}` : '/checklists'
      const response = await api<ChecklistPreviewResponse>(path)
      setChecklistItems(response.items)
    } catch (error: unknown) {
      setChecklistError(toErrorMessage(error, '체크리스트 미리보기를 불러오지 못했습니다.'))
    } finally {
      setChecklistLoading(false)
    }
  }, [projects])

  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)

    try {
      const response = await api<ScheduleResponse>('/schedule')
      setScheduleConfigured(response.configured)
      setScheduleDatabaseTitle(response.database.title)
      setScheduleColumns(response.columns)
      setScheduleRows(response.rows)
      setDbLinks((prev) => ({
        ...prev,
        schedule: response.database.url ?? toNotionUrlById(response.database.id ?? undefined),
      }))
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
    } catch (error: unknown) {
      setScheduleConfigured(false)
      setScheduleColumns([])
      setScheduleRows([])
      setScheduleError(toErrorMessage(error, '일정 DB를 불러오지 못했습니다.'))
    } finally {
      setScheduleLoading(false)
    }
  }, [])

  const fetchScreeningHistory = useCallback(async () => {
    setScreeningHistoryLoading(true)
    setScreeningHistoryError(null)

    try {
      const response = await api<ScheduleResponse>('/screening-history')
      setScreeningHistoryConfigured(response.configured)
      setScreeningHistoryDatabaseTitle(response.database.title)
      setScreeningHistoryColumns(response.columns)
      setScreeningHistoryRows(response.rows)
      setDbLinks((prev) => ({
        ...prev,
        screeningHistory: response.database.url ?? toNotionUrlById(response.database.id ?? undefined),
      }))
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
    } catch (error: unknown) {
      setScreeningHistoryConfigured(false)
      setScreeningHistoryColumns([])
      setScreeningHistoryRows([])
      setScreeningHistoryError(toErrorMessage(error, '상영 기록 DB를 불러오지 못했습니다.'))
    } finally {
      setScreeningHistoryLoading(false)
    }
  }, [])

  const fetchScreeningPlan = useCallback(async () => {
    setScreeningPlanLoading(true)
    setScreeningPlanError(null)

    try {
      const response = await api<ScheduleResponse>('/screening-plan')
      setScreeningPlanConfigured(response.configured)
      setScreeningPlanDatabaseTitle(response.database.title)
      setScreeningPlanColumns(response.columns)
      setScreeningPlanRows(response.rows)
      setDbLinks((prev) => ({
        ...prev,
        screeningPlan: response.database.url ?? toNotionUrlById(response.database.id ?? undefined),
      }))
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
    } catch (error: unknown) {
      setScreeningPlanConfigured(false)
      setScreeningPlanColumns([])
      setScreeningPlanRows([])
      setScreeningPlanError(toErrorMessage(error, '상영 준비 DB를 불러오지 못했습니다.'))
    } finally {
      setScreeningPlanLoading(false)
    }
  }, [])

  const syncScreeningPlanHistory = useCallback(async () => {
    setScreeningPlanSyncing(true)
    try {
      const response = await api<ScreeningPlanHistorySyncResponse>('/admin/notion/screening-plan-history-sync', { method: 'POST' })
      const syncCount = response.created + response.updated
      pushToast(
        'success',
        syncCount > 0
          ? `상영 히스토리를 ${syncCount}건 반영했습니다.`
          : `상영 히스토리 반영 대상이 없습니다. ${response.skipped}건은 그대로 유지했습니다.`,
      )
      await Promise.all([fetchScreeningPlan(), fetchScreeningHistory()])
    } catch (error: unknown) {
      pushToast('error', toErrorMessage(error, '상영 히스토리 반영에 실패했습니다.'))
    } finally {
      setScreeningPlanSyncing(false)
    }
  }, [fetchScreeningHistory, fetchScreeningPlan, pushToast])

  const openScreeningPlanImportModal = useCallback(() => {
    setScreeningPlanImportForm(INITIAL_SCREENING_PLAN_IMPORT_FORM)
    setScreeningPlanImportOpen(true)
  }, [])

  const closeScreeningPlanImportModal = useCallback(() => {
    if (screeningPlanImporting) return
    setScreeningPlanImportOpen(false)
  }, [screeningPlanImporting])

  const updateScreeningPlanImportForm = useCallback(
    (key: keyof ScreeningPlanImportForm, value: string) => {
      setScreeningPlanImportForm((current) => ({ ...current, [key]: value }))
    },
    [],
  )

  const importScreeningPlanFromHistory = useCallback(async () => {
    setScreeningPlanImporting(true)
    try {
      const response = await api<ScreeningPlanImportResponse>('/admin/notion/screening-plan-import-from-history', {
        method: 'POST',
        body: JSON.stringify({
          sourceEventName: screeningPlanImportForm.sourceEventName.trim(),
          targetProjectId: screeningPlanImportForm.targetProjectId || null,
        }),
      })

      if (response.created > 0) {
        pushToast(
          'success',
          `${screeningPlanImportForm.sourceEventName} 기준 ${response.matched}건 중 ${response.created}건을 상영 준비 초안으로 만들었습니다.`,
        )
      } else {
        pushToast('success', `새로 생성된 항목은 없습니다. ${response.skipped}건은 기존 초안과 중복되어 건너뛰었습니다.`)
      }

      await Promise.all([fetchScreeningPlan(), fetchScreeningHistory()])
      setScreeningPlanImportOpen(false)
      setScreeningPlanImportForm(INITIAL_SCREENING_PLAN_IMPORT_FORM)
    } catch (error: unknown) {
      pushToast('error', toErrorMessage(error, '기준 행사 불러오기에 실패했습니다.'))
    } finally {
      setScreeningPlanImporting(false)
    }
  }, [fetchScreeningHistory, fetchScreeningPlan, pushToast, screeningPlanImportForm])

  const fetchEventGraphicsTimetable = useCallback(async () => {
    setEventGraphicsLoading(true)
    setEventGraphicsError(null)

    try {
      const response = await api<EventGraphicsTimetableResponse>('/event-graphics-timetable')
      setEventGraphicsConfigured(response.configured)
      setEventGraphicsDatabaseTitle(response.database.title)
      setEventGraphicsColumns(response.columns)
      setEventGraphicsRows(response.rows)
      setDbLinks((prev) => ({
        ...prev,
        eventGraphics: response.database.url ?? toNotionUrlById(response.database.id ?? undefined),
      }))
      setLastSyncedAt(new Date().toLocaleTimeString('ko-KR', { hour12: false }))
    } catch (error: unknown) {
      setEventGraphicsConfigured(false)
      setEventGraphicsColumns([])
      setEventGraphicsRows([])
      setEventGraphicsError(toErrorMessage(error, '행사 그래픽 타임테이블을 불러오지 못했습니다.'))
    } finally {
      setEventGraphicsLoading(false)
    }
  }, [])

  const fetchChecklistAssignments = useCallback(async (projectPageId?: string, options?: { ensure?: 'background' | 'sync' | 'none' }) => {
    if (!projectPageId) {
      setAssignmentRows([])
      setAssignmentLoading(false)
      setAssignmentSyncing(false)
      return
    }

    setAssignmentLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('projectId', projectPageId)
      if (options?.ensure === 'sync') params.set('ensure', 'sync')
      if (options?.ensure === 'none') params.set('ensure', 'none')
      const response = await api<ChecklistAssignmentsResponse>(`/checklist-assignments?${params.toString()}`)
      setAssignmentRows(response.rows ?? [])
      if (response.storageMode) setAssignmentStorageMode(response.storageMode)
      setAssignmentSyncing(Boolean(response.syncing))
      setAssignmentSyncError(null)
    } catch (error: unknown) {
      setAssignmentRows([])
      setAssignmentSyncing(false)
      setAssignmentSyncError(toErrorMessage(error, '체크리스트 할당 상태를 불러오지 못했습니다.'))
    } finally {
      setAssignmentLoading(false)
    }
  }, [])

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
    if (activeView !== 'schedule') return
    void fetchSchedule()
  }, [activeView, authState, fetchSchedule, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'screeningHistory') return
    void fetchScreeningHistory()
  }, [activeView, authState, fetchScreeningHistory, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'screeningPlan') return
    void fetchScreeningPlan()
    void fetchScreeningHistory()
  }, [activeView, authState, fetchScreeningHistory, fetchScreeningPlan, route.kind])

  useEffect(() => {
    if (route.kind === 'eventGraphicsShare' || route.kind === 'eventGraphicsPrint') {
      void fetchEventGraphicsTimetable()
      return
    }
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'eventGraphics') return
    void fetchEventGraphicsTimetable()
  }, [activeView, authState, fetchEventGraphicsTimetable, route.kind])

  const refreshListAndProjects = useCallback(async () => {
    const jobs: Array<Promise<unknown>> = [fetchProjects(), fetchTasks()]
    if (activeView === 'schedule') jobs.push(fetchSchedule())
    if (activeView === 'screeningHistory') jobs.push(fetchScreeningHistory())
    if (activeView === 'screeningPlan') jobs.push(fetchScreeningPlan(), fetchScreeningHistory())
    if (activeView === 'eventGraphics') jobs.push(fetchEventGraphicsTimetable())
    await Promise.all(jobs)
  }, [activeView, fetchEventGraphicsTimetable, fetchProjects, fetchSchedule, fetchScreeningHistory, fetchScreeningPlan, fetchTasks])

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

  const statusOptions = useMemo(() => {
    const fromSchema = schema?.fields.status?.options ?? []
    const fromTasks = tasks.map((task) => task.status).filter(Boolean)
    return unique([...fromSchema, ...fromTasks])
  }, [schema, tasks])

  const taskGroupBuckets = useMemo(() => {
    type TaskGroupBucket = {
      key: string
      label: string
      style: string
      order: number
      sortLabel: string
      items: TaskRecord[]
    }

    const statusOrder = new Map<string, number>()
    statusOptions.forEach((status, index) => {
      statusOrder.set(status, index)
    })

    const byKey = new Map<string, TaskGroupBucket>()
    const today = parseIsoDate(toIsoDate(new Date())) ?? new Date()
    const completedItems: TaskRecord[] = []

    const ensureBucket = (key: string, label: string, style: string, order: number, sortLabel: string): TaskGroupBucket => {
      const existing = byKey.get(key)
      if (existing) return existing

      const created: TaskGroupBucket = {
        key,
        label,
        style,
        order,
        sortLabel,
        items: [],
      }
      byKey.set(key, created)
      return created
    }

    for (const task of sortedFilteredTasks) {
      const tone = toStatusTone(task.status)
      if (tone === 'green') {
        completedItems.push(task)
        continue
      }

      if (taskQuickGroupBy === 'project') {
        const label = task.projectName || '[UNKNOWN]'
        ensureBucket(`project:${label}`, label, 'project', 0, label).items.push(task)
        continue
      }

      if (taskQuickGroupBy === 'assignee') {
        if (task.assignee.length === 0) {
          ensureBucket('assignee:unassigned', '담당자 미지정', 'assignee', 9_999, '담당자 미지정').items.push(task)
          continue
        }

        for (const name of task.assignee) {
          ensureBucket(`assignee:${name}`, name, 'assignee', 0, name).items.push(task)
        }
        continue
      }

      if (taskQuickGroupBy === 'status') {
        const label = task.status || '미분류'
        const order = statusOrder.get(label) ?? 9_999
        ensureBucket(`status:${label}`, label, 'status', order, label).items.push(task)
        continue
      }

      const due = task.dueDate ? parseIsoDate(task.dueDate) : null
      if (!due) {
        ensureBucket('due:none', '마감일 미정', 'due', 5, '마감일 미정').items.push(task)
        continue
      }

      const remaining = diffDays(today, due)
      if (remaining < 0) {
        ensureBucket('due:overdue', '지연', 'due', 0, '지연').items.push(task)
      } else if (remaining === 0) {
        ensureBucket('due:today', '오늘 마감', 'due', 1, '오늘 마감').items.push(task)
      } else if (remaining <= 7) {
        ensureBucket('due:week', '7일 이내', 'due', 2, '7일 이내').items.push(task)
      } else if (remaining <= 30) {
        ensureBucket('due:month', '30일 이내', 'due', 3, '30일 이내').items.push(task)
      } else {
        ensureBucket('due:later', '30일 이후', 'due', 4, '30일 이후').items.push(task)
      }
    }

    if (completedItems.length > 0) {
      ensureBucket('done:all', '완료', 'status', 10_000, '완료').items.push(...completedItems)
    }

    return Array.from(byKey.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.sortLabel.localeCompare(b.sortLabel, 'ko')
    })
  }, [sortedFilteredTasks, statusOptions, taskQuickGroupBy])

  const groupedTasks = useMemo(
    () =>
      taskGroupBuckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        tasks: bucket.items,
      })),
    [taskGroupBuckets],
  )

  const boardColumns = useMemo(
    () =>
      taskGroupBuckets.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        items: bucket.items,
        style: bucket.style,
      })),
    [taskGroupBuckets],
  )

  const projectDbOptions = useMemo(
    () =>
      projects
        .filter((project) => project.source === 'project_db')
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [projects],
  )

  const checklistProjectOptions = useMemo(
    () => projectDbOptions.filter((project) => isChecklistSelectableProject(project)),
    [projectDbOptions],
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

  useEffect(() => {
    setOpenProjectTimelineGroups((prev) => {
      let changed = false
      const next: Record<string, boolean> = { ...prev }
      const active = new Set(sortedProjectDbOptions.map((project) => project.id))

      for (const project of sortedProjectDbOptions) {
        if (next[project.id] === undefined) {
          next[project.id] = false
          changed = true
        }
      }

      for (const key of Object.keys(next)) {
        if (!active.has(key)) {
          delete next[key]
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [sortedProjectDbOptions])

  const projectTimelineGroups = useMemo(() => {
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
        const rankCompare = toTimelineStatusRank(a.status) - toTimelineStatusRank(b.status)
        if (rankCompare !== 0) return rankCompare
        const startCompare = asSortDate(a.startDate).localeCompare(asSortDate(b.startDate))
        if (startCompare !== 0) return startCompare
        const dueCompare = asSortDate(a.dueDate).localeCompare(asSortDate(b.dueDate))
        if (dueCompare !== 0) return dueCompare
        const actualEndCompare = asSortDate(a.actualEndDate).localeCompare(asSortDate(b.actualEndDate))
        if (actualEndCompare !== 0) return actualEndCompare
        return a.taskName.localeCompare(b.taskName, 'ko')
      })

      const taskById = new Map<string, TaskRecord>()
      const taskByName = new Map<string, TaskRecord>()
      for (const task of matched) {
        taskById.set(normalizeNotionId(task.id), task)
        taskByName.set(normalizeTaskLookupKey(task.taskName), task)
      }

      const timelineTasks = matched.map((task) => {
        let predecessorTaskId: string | undefined
        const tokens = extractPredecessorTokens(task.detail, task.issue)
        for (const token of tokens) {
          const normalizedToken = normalizeTaskLookupKey(token)
          if (!normalizedToken) continue

          const byId = taskById.get(normalizedToken)
          const byName = taskByName.get(normalizedToken)
          const found = byId ?? byName
          if (!found || found.id === task.id) continue
          predecessorTaskId = found.id
          break
        }

        return {
          task,
          predecessorTaskId,
        }
      })

      return { project, tasks: timelineTasks }
    })
  }, [sortedProjectDbOptions, tasks])

  const projectTimelineRange = useMemo(() => {
    const points: Date[] = []

    for (const group of projectTimelineGroups) {
      const projectDate = parseIsoDate(group.project.eventDate)
      if (projectDate) points.push(projectDate)

      for (const item of group.tasks) {
        const taskStart = parseIsoDate(item.task.startDate)
        const taskEnd = parseIsoDate(item.task.dueDate)
        const taskActualEnd = parseIsoDate(item.task.actualEndDate)
        if (taskStart) points.push(taskStart)
        if (taskEnd) points.push(taskEnd)
        if (taskActualEnd) points.push(taskActualEnd)
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
  }, [projectTimelineGroups])

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
    () => checklistProjectOptions.find((project) => project.name === checklistFilters.eventName),
    [checklistFilters.eventName, checklistProjectOptions],
  )

  useEffect(() => {
    setChecklistFilters((prev) => {
      if (!selectedChecklistProject) {
        if (prev.eventName.trim()) return prev
        if (!prev.eventCategory && !prev.shippingDate && !prev.operationMode && !prev.fulfillmentMode) return prev
        return {
          ...prev,
          eventCategory: '',
          shippingDate: '',
          operationMode: '',
          fulfillmentMode: '',
        }
      }

      const nextEventCategory = selectedChecklistProject.eventCategory ?? ''
      const nextShippingDate = selectedChecklistProject.shippingDate ?? ''
      const nextOperationMode = selectedChecklistProject.operationMode ?? ''
      const nextFulfillmentMode = selectedChecklistProject.fulfillmentMode ?? ''

      if (
        prev.eventCategory === nextEventCategory &&
        prev.shippingDate === nextShippingDate &&
        prev.operationMode === nextOperationMode &&
        prev.fulfillmentMode === nextFulfillmentMode
      ) {
        return prev
      }

      return {
        ...prev,
        eventCategory: nextEventCategory,
        shippingDate: nextShippingDate,
        operationMode: nextOperationMode,
        fulfillmentMode: nextFulfillmentMode,
      }
    })
  }, [
    selectedChecklistProject?.id,
    selectedChecklistProject?.eventCategory,
    selectedChecklistProject?.shippingDate,
    selectedChecklistProject?.operationMode,
    selectedChecklistProject?.fulfillmentMode,
  ])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'checklist') return
    if (checklistMode !== 'assignment') return
    void fetchChecklistAssignments(selectedChecklistProject?.id, { ensure: 'background' })
  }, [activeView, authState, checklistMode, fetchChecklistAssignments, route.kind, selectedChecklistProject?.id])

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
  const taskByNormalizedId = useMemo(() => {
    const map = new Map<string, TaskRecord>()
    for (const task of tasks) {
      map.set(normalizeNotionId(task.id), task)
    }
    return map
  }, [tasks])

  const assignmentRowByChecklistId = useMemo(() => {
    const map = new Map<string, ChecklistAssignmentRow>()
    for (const row of assignmentRows) {
      if (
        selectedChecklistProject &&
        normalizeNotionId(row.projectPageId) !== normalizeNotionId(selectedChecklistProject.id)
      ) {
        continue
      }
      const key = checklistItemKeyFromAssignmentRow(row)
      if (!key) continue
      const previous = map.get(key)
      if (!previous || checklistAssignmentRowPriority(row) >= checklistAssignmentRowPriority(previous)) {
        map.set(key, row)
      }
    }
    return map
  }, [assignmentRows, selectedChecklistProject])

  const checklistRows = useMemo(() => {
    const rows = sortedChecklistItems.map((item, index) => {
      const matrixRow = assignmentRowByChecklistId.get(checklistItemLookupKey(item.id))
      const fallbackApplicable = checklistAppliesToProject(item, selectedChecklistProject)
      const assignedTaskIdRaw = matrixRow?.taskPageId ?? ''
      const assignedTaskId = sanitizeChecklistTaskPageId(assignedTaskIdRaw)
      const normalizedAssignedTaskId = normalizeNotionId(assignedTaskId)
      const hasInvalidAssignedTaskId = Boolean(assignedTaskIdRaw && !assignedTaskId)
      const assignedTask = assignedTaskId
        ? taskById.get(assignedTaskId) ??
          taskByNormalizedId.get(normalizedAssignedTaskId) ??
          checklistTaskOverrides[assignedTaskId] ??
          checklistTaskOverrides[normalizedAssignedTaskId]
        : undefined
      const totalLeadDays = getChecklistTotalLeadDays(item)
      const computedDueDate = item.computedDueDate ?? computeChecklistDueDate(selectedChecklistProject?.eventDate, item)
      const assignmentStatusBase: ChecklistAssignmentStatus = matrixRow?.assignmentStatus ?? (fallbackApplicable ? 'unassigned' : 'not_applicable')
      const assignmentStatus: ChecklistAssignmentStatus =
        hasInvalidAssignedTaskId && assignmentStatusBase === 'assigned' ? 'unassigned' : assignmentStatusBase
      const assignmentStatusLabel = hasInvalidAssignedTaskId
        ? toChecklistAssignmentLabel('unassigned')
        : matrixRow?.assignmentStatusText?.trim() || toChecklistAssignmentLabel(assignmentStatus)

      return {
        item,
        matrixKey: matrixRow?.key ?? (selectedChecklistProject ? checklistMatrixKey(selectedChecklistProject.id, item.id) : undefined),
        assignmentStatus,
        assignmentStatusLabel,
        isApplicable: assignmentStatus !== 'not_applicable',
        assignedTaskId,
        assignedTaskLabel: assignedTask ? `[${assignedTask.projectName}] ${assignedTask.taskName} (${joinOrDash(assignedTask.assignee)})` : '',
        assignedTaskName: assignedTask?.taskName,
        assignedTaskStatus: assignedTask?.status,
        assignedTaskStartDate: assignedTask?.startDate,
        assignedTaskDueDate: assignedTask?.dueDate,
        assignedTaskActualEndDate: assignedTask?.actualEndDate,
        assignedTaskAssigneeText: assignedTask ? joinOrDash(assignedTask.assignee) : '',
        isAssigned: assignmentStatus === 'assigned',
        totalLeadDays,
        computedDueDate,
        __sortIndex: index,
      }
    })

    if (prioritizeUnassignedChecklist) {
      const rank = (status: ChecklistAssignmentStatus): number => {
        if (status === 'unassigned') return 0
        if (status === 'assigned') return 1
        return 2
      }
      rows.sort((a, b) => {
        const rankDiff = rank(a.assignmentStatus) - rank(b.assignmentStatus)
        if (rankDiff !== 0) return rankDiff
        return a.__sortIndex - b.__sortIndex
      })
    }

    return rows.map((entry) => {
      const copy = { ...entry }
      delete (copy as { __sortIndex?: number }).__sortIndex
      return copy
    })
  }, [assignmentRowByChecklistId, checklistTaskOverrides, prioritizeUnassignedChecklist, selectedChecklistProject, sortedChecklistItems, taskById, taskByNormalizedId])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'checklist' || checklistMode !== 'assignment') return
    if (!selectedChecklistProject) return

    const selectedProjectId = normalizeNotionId(selectedChecklistProject.id)
    const missingTaskIds: string[] = []
    const queued = new Set<string>()
    for (const row of assignmentRows) {
      if (normalizeNotionId(row.projectPageId) !== selectedProjectId) continue
      const taskId = sanitizeChecklistTaskPageId(row.taskPageId ?? '')
      if (!taskId) continue
      const normalizedTaskId = normalizeNotionId(taskId)
      const alreadyKnown =
        taskById.has(taskId) ||
        taskByNormalizedId.has(normalizedTaskId) ||
        Boolean(checklistTaskOverrides[taskId]) ||
        Boolean(checklistTaskOverrides[normalizedTaskId])
      if (alreadyKnown) continue
      if (checklistTaskFetchInFlightRef.current.has(normalizedTaskId)) continue
      if (queued.has(normalizedTaskId)) continue
      queued.add(normalizedTaskId)
      missingTaskIds.push(taskId)
    }

    if (missingTaskIds.length === 0) return

    let cancelled = false
    void Promise.allSettled(
      missingTaskIds.map(async (taskId) => {
        const normalizedTaskId = normalizeNotionId(taskId)
        checklistTaskFetchInFlightRef.current.add(normalizedTaskId)
        try {
          const response = await api<TaskResponse>(`/tasks/${encodeURIComponent(taskId)}`)
          if (cancelled) return
          setChecklistTaskOverrides((prev) => ({
            ...prev,
            [taskId]: response.task,
            [normalizedTaskId]: response.task,
            [response.task.id]: response.task,
            [normalizeNotionId(response.task.id)]: response.task,
          }))
        } catch {
          // Ignore missing/forbidden tasks and keep current timeline fallback.
        } finally {
          checklistTaskFetchInFlightRef.current.delete(normalizedTaskId)
        }
      }),
    )

    return () => {
      cancelled = true
    }
  }, [
    activeView,
    assignmentRows,
    authState,
    checklistMode,
    checklistTaskOverrides,
    route.kind,
    selectedChecklistProject,
    taskById,
    taskByNormalizedId,
  ])

  useEffect(() => {
    setOpenTaskGroups((prev) => {
      let changed = false
      const next: Record<string, boolean> = { ...prev }
      const activeKeys = new Set(groupedTasks.map((group) => group.key))

      for (const group of groupedTasks) {
        if (next[group.key] === undefined) {
          // Collapse by default to reduce initial render cost on large datasets.
          next[group.key] = false
          changed = true
        }
      }

      for (const key of Object.keys(next)) {
        if (!activeKeys.has(key)) {
          delete next[key]
          changed = true
        }
      }

      return changed ? next : prev
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

  const screeningProjectLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const project of projects) {
      const normalized = project.id.replace(/-/g, '').toLowerCase()
      map[normalized] = project.name
      map[project.id] = project.name
    }
    return map
  }, [projects])

  const screeningTaskLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const task of tasks) {
      const normalized = task.id.replace(/-/g, '').toLowerCase()
      map[normalized] = task.taskName
      map[task.id] = task.taskName
    }
    return map
  }, [tasks])

  const screeningHistoryLabelMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const row of screeningHistoryRows) {
      const title = readScheduleTitleText(row, screeningHistoryColumns)
      if (!title || title === '-') continue
      const normalized = row.id.replace(/-/g, '').toLowerCase()
      map[normalized] = title
      map[row.id] = title
    }
    return map
  }, [screeningHistoryColumns, screeningHistoryRows])

  const screeningHistoryEventOptions = useMemo(() => {
    return Array.from(
      new Set(
        screeningHistoryRows
          .map((row) => {
            const projectRaw = readScheduleCellText(row, screeningHistoryColumns, '귀속 프로젝트')
            const projectName = projectRaw ? resolveScheduleRelationText(projectRaw, screeningProjectLabelMap) : ''
            const eventName = readScheduleCellText(row, screeningHistoryColumns, '행사명')
            const title = readScheduleTitleText(row, screeningHistoryColumns)
            return [projectName, eventName, title].map((value) => value.trim()).find((value) => value && value !== '-') ?? ''
          })
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'ko'))
  }, [screeningHistoryColumns, screeningHistoryRows, screeningProjectLabelMap])

  const screeningPlanImportProjectOptions = useMemo(() => {
    return [...projects]
      .sort((left, right) => left.name.localeCompare(right.name, 'ko'))
      .map((project) => ({
        id: project.id,
        name: project.name,
        eventDate: project.eventDate,
      }))
  }, [projects])

  const screeningProjectVisualMap = useMemo(() => {
    const map: Record<string, { iconEmoji?: string; iconUrl?: string; coverUrl?: string }> = {}
    for (const project of projects) {
      const value = {
        iconEmoji: project.iconEmoji,
        iconUrl: project.iconUrl,
        coverUrl: project.coverUrl,
      }
      map[project.name] = value
      map[project.name.toLowerCase()] = value
    }
    return map
  }, [projects])

  const selectedViewDbUrl = useMemo(() => {
    if (activeView === 'dashboard') return null
    if (activeView === 'projects') return dbLinks.project
    if (activeView === 'tasks') return dbLinks.task
    if (activeView === 'schedule') return dbLinks.schedule
    if (activeView === 'screeningHistory') return dbLinks.screeningHistory
    if (activeView === 'screeningPlan') return dbLinks.screeningPlan
    if (activeView === 'eventGraphics') return dbLinks.eventGraphics
    if (activeView === 'checklist') return dbLinks.checklist
    return null
  }, [activeView, dbLinks.checklist, dbLinks.eventGraphics, dbLinks.project, dbLinks.schedule, dbLinks.screeningHistory, dbLinks.screeningPlan, dbLinks.task])

  const unknownMessages = schemaUnknownMessage(schema)
  const assignmentTargetCurrentTaskId = assignmentTarget
    ? assignmentRowByChecklistId.get(checklistItemLookupKey(assignmentTarget.itemId))?.taskPageId ?? ''
    : ''
  const projectTabCountLabel = loadingProjects ? '...' : String(projects.length)
  const taskTabCountLabel = loadingList ? '...' : String(tasks.length)
  const hasQuickSearchResults = quickSearchSections.projects.length > 0 || quickSearchSections.tasks.length > 0
  const viewMenuGroups: Array<{
    key: ViewMenuGroupKey
    label: string
    items: Array<{
      view: TopView
      title: string
      label: string
      icon: UiGlyphName
      count?: string
    }>
  }> = [
    {
      key: 'operations',
      label: '운영',
      items: [
        { view: 'dashboard', title: '팀 운영 대시보드', label: '대시보드', icon: 'pulse' },
        { view: 'projects', title: '프로젝트', label: '프로젝트', icon: 'grid', count: projectTabCountLabel },
        { view: 'tasks', title: '업무', label: '업무', icon: 'list', count: taskTabCountLabel },
        { view: 'schedule', title: '일정', label: '일정', icon: 'calendar' },
        { view: 'meetings', title: '회의록', label: '회의록', icon: 'list' },
      ],
    },
    {
      key: 'events',
      label: '행사',
      items: [
        { view: 'eventGraphics', title: '타임테이블', label: '타임테이블', icon: 'calendar' },
        { view: 'checklist', title: '행사 체크리스트', label: '행사 체크리스트', icon: 'checksquare' },
      ],
    },
    {
      key: 'tools',
      label: '도구',
      items: [
        { view: 'screeningHistory', title: '상영 기록', label: '상영 기록', icon: 'list' },
        { view: 'screeningPlan', title: '상영 준비', label: '상영 준비', icon: 'list' },
        { view: 'snsPost', title: 'SNS 본문 생성', label: 'SNS 본문 생성', icon: 'list' },
        { view: 'geminiImageTest', title: 'Gemini 이미지 테스트', label: 'Gemini 이미지', icon: 'list' },
        { view: 'mailTemplate', title: '메일 템플릿', label: '메일 템플릿', icon: 'list' },
        { view: 'guide', title: '사용법', label: '사용법', icon: 'list' },
      ],
    },
  ]

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

  const toggleViewMenuGroup = (groupKey: ViewMenuGroupKey) => {
    setViewMenuOpenState((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }))
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
    if (name === 'eventName') {
      // Prevent stale timeline rows from previous event before the next checklist query.
      setChecklistItems([])
      setAssignmentRows([])
      setAssignmentSyncError(null)
    }
    setChecklistFilters((prev) => ({
      ...prev,
      [name]: nextValue,
    }))
  }

  const onChecklistSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (checklistMode === 'assignment' && selectedChecklistProject?.id) {
      await Promise.all([
        fetchChecklistPreview(checklistFilters),
        fetchChecklistAssignments(selectedChecklistProject.id, { ensure: 'background' }),
      ])
      return
    }
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

  const onToggleTaskGroup = (groupKey: string) => {
    setOpenTaskGroups((prev) => ({
      ...prev,
      [groupKey]: prev[groupKey] === false ? true : false,
    }))
  }

  const onToggleProjectTimelineGroup = (projectId: string) => {
    setOpenProjectTimelineGroups((prev) => ({
      ...prev,
      [projectId]: prev[projectId] === false ? true : false,
    }))
  }

  const setChecklistAssignment = async (
    itemId: string,
    taskId: string,
    options?: {
      assignmentStatus?: ChecklistAssignmentStatus
      successMessage?: string
      silentSuccess?: boolean
    },
  ) => {
    const projectPageId = selectedChecklistProject?.id
    if (!projectPageId) {
      const message = '체크리스트 할당 전에 프로젝트를 먼저 선택해주세요.'
      setAssignmentSyncError(message)
      pushToast('error', message)
      return
    }

    const previousRows = assignmentRows
    const key = checklistMatrixKey(projectPageId, itemId)
    const nextTaskId = taskId.trim()
    const nextStatus: ChecklistAssignmentStatus = options?.assignmentStatus ?? (nextTaskId ? 'assigned' : 'unassigned')
    if (nextStatus === 'assigned' && !nextTaskId) {
      const message = '할당 상태를 저장하려면 업무를 선택해주세요.'
      setAssignmentSyncError(message)
      pushToast('error', message)
      return
    }

    setAssignmentRows((prev) => {
      const index = prev.findIndex(
        (row) =>
          normalizeNotionId(row.projectPageId) === normalizeNotionId(projectPageId) &&
          normalizeNotionId(row.checklistItemPageId) === normalizeNotionId(itemId),
      )

      const fallback: ChecklistAssignmentRow = {
        id: key,
        key,
        projectPageId,
        checklistItemPageId: itemId,
        taskPageId: null,
        applicable: true,
        assignmentStatus: 'unassigned',
        assignmentStatusText: '미할당',
      }

      const current = index >= 0 ? prev[index] : fallback
      const nextRow: ChecklistAssignmentRow = {
        ...current,
        taskPageId: nextStatus === 'assigned' ? nextTaskId : null,
        applicable: nextStatus !== 'not_applicable',
        assignmentStatus: nextStatus,
        assignmentStatusText: toChecklistAssignmentLabel(nextStatus),
      }

      if (index >= 0) {
        const copy = [...prev]
        copy[index] = nextRow
        return copy
      }

      return [...prev, nextRow]
    })
    setAssignmentSyncError(null)

    try {
      const response = await api<ChecklistAssignmentsResponse>('/checklist-assignments', {
        method: 'POST',
        body: JSON.stringify({
          projectPageId,
          checklistItemPageId: itemId,
          taskPageId: nextStatus === 'assigned' ? nextTaskId : null,
          assignmentStatus: nextStatus,
        }),
      })

      if (response.rows) {
        setAssignmentRows(response.rows)
      } else if (response.row) {
        setAssignmentRows((prev) => {
          const index = prev.findIndex((row) => row.id === response.row?.id)
          if (index < 0) return [...prev, response.row as ChecklistAssignmentRow]
          const copy = [...prev]
          copy[index] = response.row as ChecklistAssignmentRow
          return copy
        })
      } else {
        await fetchChecklistAssignments(projectPageId)
      }

      if (response.storageMode) setAssignmentStorageMode(response.storageMode)
      if (!options?.silentSuccess) {
        if (options?.successMessage) {
          pushToast('success', options.successMessage)
        } else if (nextStatus === 'assigned') {
          pushToast('success', '체크리스트 할당이 저장되었습니다.')
        } else if (nextStatus === 'not_applicable') {
          pushToast('success', '체크리스트 항목을 해당없음으로 처리했습니다.')
        } else {
          pushToast('success', '체크리스트 할당을 해제했습니다.')
        }
      }
    } catch (error: unknown) {
      setAssignmentRows(previousRows)
      const message = toErrorMessage(error, '체크리스트 할당 저장에 실패했습니다.')
      setAssignmentSyncError(message)
      pushToast('error', message)
    }
  }

  const onCreateTaskFromChecklist = async (
    row: {
      item: ChecklistPreviewItem
      computedDueDate?: string
      isApplicable: boolean
      isAssigned: boolean
    },
    assigneeText?: string,
  ) => {
    const project = selectedChecklistProject
    if (!project) {
      const message = '체크리스트에서 업무를 생성하려면 행사(프로젝트)를 먼저 선택해주세요.'
      setAssignmentSyncError(message)
      pushToast('error', message)
      return
    }
    if (row.isAssigned) {
      const message = '이미 할당된 항목입니다. 필요 시 변경 버튼을 사용해주세요.'
      pushToast('error', message)
      return
    }

    const itemId = row.item.id
    setChecklistCreatingTaskIds((prev) => ({ ...prev, [itemId]: true }))
    setAssignmentSyncError(null)

    try {
      const detailLines = [
        '[체크리스트 자동 생성]',
        project.name ? `행사: ${project.name}` : '',
        row.item.workCategory ? `작업분류: ${row.item.workCategory}` : '',
        row.item.finalDueText ? `체크리스트 기준: ${row.item.finalDueText}` : '',
      ].filter(Boolean)

      const payload: Record<string, unknown> = {
        taskName: row.item.productName?.trim() || row.item.workCategory?.trim() || '체크리스트 업무',
        workType: row.item.workCategory?.trim() || undefined,
        assignee: splitByComma(assigneeText ?? ''),
        dueDate: row.computedDueDate || undefined,
        detail: detailLines.join('\n') || undefined,
      }

      if (schema?.projectBindingMode === 'relation') {
        payload.projectId = project.id
      } else {
        payload.projectName = project.name
      }

      const created = await api<TaskResponse>('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setSchema(created.schema)
      setChecklistTaskOverrides((prev) => ({ ...prev, [created.task.id]: created.task }))

      await setChecklistAssignment(itemId, created.task.id, {
        assignmentStatus: 'assigned',
        successMessage: '체크리스트 기반 업무를 생성하고 할당했습니다.',
      })
    } catch (error: unknown) {
      const message = toErrorMessage(error, '체크리스트 기반 업무 생성에 실패했습니다.')
      setAssignmentSyncError(message)
      pushToast('error', message)
    } finally {
      setChecklistCreatingTaskIds((prev) => {
        if (!prev[itemId]) return prev
        const next = { ...prev }
        delete next[itemId]
        return next
      })
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
    const target = assignmentTarget
    if (!target) return
    setAssignmentTarget(null)
    setAssignmentSearch('')
    await setChecklistAssignment(target.itemId, taskId, {
      assignmentStatus: taskId ? 'assigned' : 'unassigned',
    })
  }

  const onSetChecklistNotApplicable = async (itemId: string) => {
    await setChecklistAssignment(itemId, '', {
      assignmentStatus: 'not_applicable',
    })
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

  if (AUTH_GATE_ENABLED && route.kind !== 'eventGraphicsShare' && route.kind !== 'eventGraphicsPrint' && authState !== 'authenticated') {
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
            <p className="authGateHint">IZEN1 Wifi password</p>
            <div className="authGateActions">
              <button type="submit" disabled={checking || authSubmitting}>
                {checking || authSubmitting ? '확인 중...' : '입장'}
              </button>
            </div>
          </form>
          {authError ? <p className="error">{authError}</p> : null}
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

  if (route.kind === 'eventGraphicsShare') {
    return (
      <EventGraphicsSharePage
        configured={eventGraphicsConfigured}
        databaseTitle={eventGraphicsDatabaseTitle}
        columns={eventGraphicsColumns}
        rows={eventGraphicsRows}
        loading={eventGraphicsLoading}
        error={eventGraphicsError}
      />
    )
  }

  if (route.kind === 'eventGraphicsPrint') {
    return (
      <EventGraphicsPrintPage
        configured={eventGraphicsConfigured}
        databaseTitle={eventGraphicsDatabaseTitle}
        columns={eventGraphicsColumns}
        rows={eventGraphicsRows}
        loading={eventGraphicsLoading}
        error={eventGraphicsError}
      />
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
            <div className="viewMenuGroups">
              {viewMenuGroups.map((group) => (
                <section key={group.label} className="viewMenuGroup" aria-label={group.label}>
                  {sidebarCollapsed ? null : (
                    <button
                      type="button"
                      className="viewMenuGroupToggle"
                      aria-expanded={viewMenuOpenState[group.key]}
                      onClick={() => toggleViewMenuGroup(group.key)}
                    >
                      <span className="viewMenuGroupTitle">{group.label}</span>
                      <span className="uiIcon">
                        <UiGlyph name={viewMenuOpenState[group.key] ? 'chevronDown' : 'chevronRight'} />
                      </span>
                    </button>
                  )}
                  {sidebarCollapsed || viewMenuOpenState[group.key] ? <div className="viewTabs">
                    {group.items.map((item) => (
                      <button
                        key={item.view}
                        type="button"
                        className={activeView === item.view ? 'viewTab active' : 'viewTab'}
                        onClick={() => setActiveView(item.view)}
                        title={item.title}
                      >
                        <span className="iconLabel">
                          <span className="uiIcon">
                            <UiGlyph name={item.icon} />
                          </span>
                          <span>{item.label}</span>
                        </span>
                        {item.count ? <span className="viewTabCount">{item.count}</span> : null}
                      </button>
                    ))}
                  </div> : null}
                </section>
              ))}
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
        <section className="sidebarControls">
          {activeView === 'tasks' ? (
            <article className="sidebarControlCard">
              <div className="sidebarControlHeader">
                <strong>현재 보기 설정</strong>
                <span className="muted small">업무 화면 전용</span>
              </div>
              <div className="sidebarControlGroup">
                <span className="sidebarControlLabel">보기 형태</span>
                <div className="sidebarControlButtons">
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
                </div>
              </div>
              <div className="sidebarControlGroup">
                <span className="sidebarControlLabel">구분 형태</span>
                <div className="sidebarControlButtons sidebarControlButtons-compact">
                  <button
                    type="button"
                    className={taskQuickGroupBy === 'assignee' ? 'viewTab active' : 'viewTab'}
                    onClick={() => setTaskQuickGroupBy('assignee')}
                  >
                    사람
                  </button>
                  <button
                    type="button"
                    className={taskQuickGroupBy === 'project' ? 'viewTab active' : 'viewTab'}
                    onClick={() => setTaskQuickGroupBy('project')}
                  >
                    귀속 프로젝트
                  </button>
                  <button
                    type="button"
                    className={taskQuickGroupBy === 'status' ? 'viewTab active' : 'viewTab'}
                    onClick={() => setTaskQuickGroupBy('status')}
                  >
                    상태
                  </button>
                  <button
                    type="button"
                    className={taskQuickGroupBy === 'due' ? 'viewTab active' : 'viewTab'}
                    onClick={() => setTaskQuickGroupBy('due')}
                  >
                    마감일
                  </button>
                </div>
              </div>
            </article>
          ) : null}

          {activeView === 'checklist' ? (
            <article className="sidebarControlCard">
              <div className="sidebarControlHeader">
                <strong>현재 보기 설정</strong>
                <span className="muted small">체크리스트 화면 전용</span>
              </div>
              <div className="sidebarControlGroup">
                <span className="sidebarControlLabel">보기 형태</span>
                <div className="sidebarControlButtons">
                  <button
                    type="button"
                    className={checklistMode === 'schedule_share' ? 'viewTab active' : 'viewTab'}
                    onClick={() => {
                      setChecklistMode('schedule_share')
                      setAssignmentTarget(null)
                    }}
                  >
                    일정공유용
                  </button>
                  <button
                    type="button"
                    className={checklistMode === 'assignment' ? 'viewTab active' : 'viewTab'}
                    onClick={() => setChecklistMode('assignment')}
                  >
                    할당용
                  </button>
                </div>
              </div>
            </article>
          ) : null}

          <article className="sidebarControlCard">
            <div className="sidebarControlHeader">
              <strong>동기화</strong>
              <span className="muted small">모든 화면 공통</span>
            </div>
            {latestAvailableBuild ? (
              <button type="button" onClick={() => window.location.reload()}>
                <span className="iconLabel">
                  <span className="uiIcon">
                    <UiGlyph name="refresh" />
                  </span>
                  <span>새 버전 적용</span>
                </span>
              </button>
            ) : null}
            <button type="button" className="secondary" onClick={() => void refreshListAndProjects()}>
              <span className="iconLabel">
                <span className="uiIcon">
                  <UiGlyph name="refresh" />
                </span>
                <span>데이터 새로고침</span>
              </span>
            </button>
            <div className="sidebarSyncBlock">
              <span className="muted small">마지막 동기화</span>
              <strong>{lastSyncedAt || '-'}</strong>
            </div>
          </article>

          <article className="sidebarControlCard">
            <div className="sidebarControlHeader">
              <strong>환경</strong>
              <span className="muted small">개인 보기 설정</span>
            </div>
            <div className="themePicker sidebarThemePicker" role="group" aria-label="Theme 선택">
              <span className="themePickerLabel">Theme</span>
              <div className="themePickerButtons">
                {(['v1', 'v2', 'v3'] as ThemeKey[]).map((themeOption) => (
                  <button
                    key={themeOption}
                    type="button"
                    className={theme === themeOption ? 'secondary mini is-active themeButton' : 'secondary mini themeButton'}
                    aria-pressed={theme === themeOption}
                    onClick={() => onThemeChange(themeOption)}
                  >
                    {themeOption.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {USE_MOCK_DATA ? <span className="apiModePill">DEMO DATA</span> : null}
          </article>
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
        </section>
        <div className="sidebarBuildStamp" aria-label="현재 빌드" title={`현재 빌드 ${currentBuild.id}`}>
          {currentBuild.id.slice(0, 7)}
        </div>
      </aside>
      <main className="mondayMain">
        <header className="header topbarHeader">
          <div className="topbarHeading">
            <p className="topbarPath">Design Team / {toTopViewPath(activeView)}</p>
            <h1>{toTopViewTitle(activeView)}</h1>
          </div>
        </header>

        {latestAvailableBuild ? (
          <section className="buildUpdateBanner" aria-live="polite">
            <div className="buildUpdateBannerText">
              <strong>새 버전이 배포되었습니다.</strong>
              <span>현재 열려 있는 화면은 최신이 아닐 수 있습니다. 왼쪽 보기바에서 새 버전 적용을 눌러 다시 열어 주세요.</span>
              <small>배포 시각 {formatBuildTimestamp(latestAvailableBuild.builtAt)}</small>
            </div>
          </section>
        ) : null}

        {activeView === 'tasks' ? (
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
        </section>
        ) : null}

      {activeView === 'dashboard' ? (
        <DashboardView
          tasks={tasks}
          projects={projects}
          checklistRows={checklistRows}
          selectedChecklistProject={selectedChecklistProject}
          lastSyncedAt={lastSyncedAt}
          onOpenView={setActiveView}
          onOpenTask={(taskId) => navigate(`/task/${encodeURIComponent(taskId)}`)}
          onCopyReportSummary={copyText}
          formatDateLabel={formatDateLabel}
          joinOrDash={joinOrDash}
          toStatusTone={toStatusTone}
        />
      ) : null}

      {activeView === 'tasks' ? (
        <TasksView
          taskLayout={taskLayout}
          taskQuickGroupBy={taskQuickGroupBy}
          showTaskFilters={showTaskFilters}
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
          onToggleTaskFilters={() => setShowTaskFilters((prev) => !prev)}
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
        <ScheduleView
          configured={scheduleConfigured}
          databaseTitle={scheduleDatabaseTitle}
          databaseUrl={dbLinks.schedule}
          columns={scheduleColumns}
          rows={scheduleRows}
          loading={scheduleLoading}
          error={scheduleError}
        />
      ) : null}

      {activeView === 'screeningHistory' ? (
        <ScreeningDbView
          configured={screeningHistoryConfigured}
          databaseTitle={screeningHistoryDatabaseTitle}
          databaseUrl={dbLinks.screeningHistory}
          columns={screeningHistoryColumns}
          rows={screeningHistoryRows}
          loading={screeningHistoryLoading}
          error={screeningHistoryError}
          eyebrow="Notion Screening History DB"
          emptyTitle="상영 기록 DB가 연결되지 않았습니다."
          emptyMessage="Cloudflare Workers 환경변수에 NOTION_SCREENING_HISTORY_DB_ID를 추가하면 상영 기록 화면이 활성화됩니다."
          description="이전 행사와 전시에서 실제로 무엇을 상영했는지 기록하는 원장입니다."
          presentation="gallery"
          groupByColumnName="귀속 프로젝트"
          thumbnailColumnName="대표 이미지"
          detailColumnNames={[
            '행사명',
            '상영일',
            '상영 순서',
            { label: '상영 당시 파일명', names: ['상영 당시 파일명', '실제 상영 파일명', '변환 후 파일명'] },
            '관련 업무',
          ]}
          relationColumnLabelMaps={{
            '귀속 프로젝트': screeningProjectLabelMap,
            '관련 업무': screeningTaskLabelMap,
            '기준 상영 기록': screeningHistoryLabelMap,
          }}
          groupVisualMap={screeningProjectVisualMap}
        />
      ) : null}

      {activeView === 'screeningPlan' ? (
        <ScreeningDbView
          configured={screeningPlanConfigured}
          databaseTitle={screeningPlanDatabaseTitle}
          databaseUrl={dbLinks.screeningPlan}
          columns={screeningPlanColumns}
          rows={screeningPlanRows}
          loading={screeningPlanLoading}
          error={screeningPlanError}
          eyebrow="Notion Screening Plan DB"
          emptyTitle="상영 준비 DB가 연결되지 않았습니다."
          emptyMessage="Cloudflare Workers 환경변수에 NOTION_SCREENING_PLAN_DB_ID를 추가하면 상영 준비 화면이 활성화됩니다."
          description="다음 행사에 어떤 영상을 어떤 상태로 준비 중인지 관리하는 작업판입니다."
          relationColumnLabelMaps={{
            '귀속 프로젝트': screeningProjectLabelMap,
            '관련 업무': screeningTaskLabelMap,
            '기준 상영 기록': screeningHistoryLabelMap,
          }}
          importActionLabel="기준 행사에서 불러오기"
          importActionBusy={screeningPlanImporting}
          onImportAction={openScreeningPlanImportModal}
          syncActionLabel="히스토리 반영 실행"
          syncActionBusy={screeningPlanSyncing}
          onSyncAction={syncScreeningPlanHistory}
        />
      ) : null}

      {activeView === 'eventGraphics' ? (
        <EventGraphicsTimetableView
          configured={eventGraphicsConfigured}
          databaseTitle={eventGraphicsDatabaseTitle}
          databaseUrl={dbLinks.eventGraphics}
          columns={eventGraphicsColumns}
          rows={eventGraphicsRows}
          loading={eventGraphicsLoading}
          error={eventGraphicsError}
          onRefresh={fetchEventGraphicsTimetable}
        />
      ) : null}

      {activeView === 'meetings' ? <MeetingsView /> : null}

      {activeView === 'snsPost' ? <SnsPostGeneratorView onCopy={copyText} /> : null}

      {activeView === 'geminiImageTest' ? <GeminiImageTestView /> : null}

      {activeView === 'mailTemplate' ? <MailTemplateView onCopy={copyText} /> : null}

      {activeView === 'guide' ? (
        <section className="guideView" aria-label="서비스 사용법">
          <article className="guideHero">
            <h2>처음 보는 분을 위한 간단 안내</h2>
            <p>
              이 페이지는 노션 DB를 읽어서 웹에서 보기 쉽게 정리하고, 웹에서 바꾼 값은 다시 노션에 기록하는 구조입니다.
              그래서 팀은 노션을 직접 뒤적이지 않아도 업무/행사 상태를 빠르게 확인할 수 있습니다.
            </p>
          </article>

          <article className="guideCard guideCardTabs">
            <h3>탭별 기능 안내</h3>
            <div className="guideTabGrid">
              <section className="guideTabItem">
                <h4>대시보드</h4>
                <p>협업, 관리, 보고 흐름을 한 화면에서 고를 수 있는 팀 운영 시작점입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('dashboard')}>
                  대시보드 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>프로젝트</h4>
                <p>행사/전시회 전체를 조망하는 탭입니다. 진행일, 분류, 대표 업무 타임라인을 확인합니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('projects')}>
                  프로젝트 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>업무</h4>
                <p>실제 작업 단위를 관리하는 탭입니다. 상태, 담당자, 접수일/마감일, 상세 내용을 수정합니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('tasks')}>
                  업무 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>일정</h4>
                <p>노션 Schedule DB를 그대로 읽어와 팀 일정과 운영 메모를 빠르게 확인하는 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('schedule')}>
                  일정 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>타임테이블</h4>
                <p>행사 cue별 그래픽 상태, 미리보기, 자산 링크를 한 화면에서 공유하는 운영 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('eventGraphics')}>
                  타임테이블 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>행사 체크리스트</h4>
                <p>행사 기준으로 제작물 체크리스트와 할당 상태를 확인/수정하는 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('checklist')}>
                  체크리스트 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>SNS 본문 생성</h4>
                <p>행사명, 국가명, 도시명, 날짜만 넣어 재사용 가능한 SNS 본문과 해시태그를 만드는 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('snsPost')}>
                  SNS 탭 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>메일 템플릿</h4>
                <p>반복 발송하는 메일 본문을 템플릿으로 만들고, 필요한 값만 넣어 바로 복사하는 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('mailTemplate')}>
                  메일 탭 열기
                </button>
              </section>
              <section className="guideTabItem">
                <h4>사용법</h4>
                <p>현재 페이지입니다. 데이터 흐름, 동기화 규칙, DB 위치를 빠르게 참고할 수 있습니다.</p>
              </section>
            </div>
          </article>

          <div className="guideGrid">
            <article className="guideCard">
              <h3>1) 데이터가 들어오는 순서</h3>
              <ol>
                <li>`프로젝트 DB`에서 행사 기본정보(행사일, 분류, 배송마감 등)를 읽습니다.</li>
                <li>`체크리스트 DB`에서 제작 항목과 소요일(영업일 기준)을 읽습니다.</li>
                <li>웹에서 행사별 체크리스트/할당 현황/타임라인으로 보여줍니다.</li>
              </ol>
            </article>

            <article className="guideCard">
              <h3>2) 할당 데이터가 저장되는 위치</h3>
              <p>
                체크리스트 탭의 할당/미할당/해당없음은 <strong>행사-체크리스트 할당 매트릭스 DB</strong>를 기준으로 동기화됩니다.
                웹에서 수정하면 이 매트릭스 DB가 먼저 업데이트되고, 화면이 다시 불러와집니다.
              </p>
            </article>

            <article className="guideCard">
              <h3>3) 날짜 계산 원리</h3>
              <p>
                체크리스트의 오프셋은 영업일 기준으로 계산됩니다. 행사일(또는 배송마감일)을 기준으로 `-` 값은 이전, `+` 값은 이후로
                완료예정일을 만들고, 타임라인 막대도 그 날짜를 기준으로 표시합니다.
              </p>
            </article>

            <article className="guideCard">
              <h3>4) 실제 DB 바로가기</h3>
              <div className="guideDbLinks">
                {dbLinks.project ? (
                  <a className="guideDbLink" href={dbLinks.project} target="_blank" rel="noreferrer">
                    프로젝트 DB: {dbLinks.project}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">프로젝트 DB: 연결 안 됨</span>
                )}
                {dbLinks.task ? (
                  <a className="guideDbLink" href={dbLinks.task} target="_blank" rel="noreferrer">
                    업무 DB: {dbLinks.task}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">업무 DB: 연결 안 됨</span>
                )}
                {dbLinks.checklist ? (
                  <a className="guideDbLink" href={dbLinks.checklist} target="_blank" rel="noreferrer">
                    체크리스트 DB: {dbLinks.checklist}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">체크리스트 DB: 연결 안 됨</span>
                )}
                {dbLinks.schedule ? (
                  <a className="guideDbLink" href={dbLinks.schedule} target="_blank" rel="noreferrer">
                    일정 DB: {dbLinks.schedule}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">일정 DB: 연결 안 됨</span>
                )}
                {dbLinks.screeningHistory ? (
                  <a className="guideDbLink" href={dbLinks.screeningHistory} target="_blank" rel="noreferrer">
                    상영 기록 DB: {dbLinks.screeningHistory}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">상영 기록 DB: 연결 안 됨</span>
                )}
                {dbLinks.screeningPlan ? (
                  <a className="guideDbLink" href={dbLinks.screeningPlan} target="_blank" rel="noreferrer">
                    상영 준비 DB: {dbLinks.screeningPlan}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">상영 준비 DB: 연결 안 됨</span>
                )}
                {dbLinks.screeningVideo ? (
                  <a className="guideDbLink" href={dbLinks.screeningVideo} target="_blank" rel="noreferrer">
                    상영 영상 DB: {dbLinks.screeningVideo}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">상영 영상 DB: 연결 안 됨</span>
                )}
                {dbLinks.eventGraphics ? (
                  <a className="guideDbLink" href={dbLinks.eventGraphics} target="_blank" rel="noreferrer">
                    타임테이블 DB: {dbLinks.eventGraphics}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">타임테이블 DB: 연결 안 됨</span>
                )}
              </div>
            </article>
            <article className="guideCard guideCardWide">
              <h3>5) 운영 키 / 시크릿 안내</h3>
              <p className="guideCaption">
                이 표는 2026-03-17 기준 운영 메모입니다. 실제 값은 화면에 노출하지 않고, 어떤 변수 하나를 바꾸면 어느 기능이
                영향을 받는지만 빠르게 확인할 수 있게 정리했습니다.
              </p>
              <div className="tableWrap guideTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>변수</th>
                      <th>연결 위치</th>
                      <th>Secret</th>
                      <th>과금</th>
                      <th>교체 영향</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GUIDE_SECRET_ROWS.map((row) => (
                      <tr key={row.name}>
                        <td className="guideTableKey">{row.name}</td>
                        <td>{row.location}</td>
                        <td>{row.secret}</td>
                        <td>{row.billing}</td>
                        <td>{row.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="guideCard guideCardWide">
              <h3>6) DB 연결 변수 안내</h3>
              <p className="guideCaption">
                DB ID 계열은 대부분 Secret은 아니지만, 잘못 바꾸면 특정 탭이 아예 다른 Notion DB를 읽거나 저장하게 됩니다.
              </p>
              <div className="tableWrap guideTableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>변수</th>
                      <th>연결 탭/기능</th>
                      <th>Secret</th>
                      <th>과금</th>
                      <th>교체 영향</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GUIDE_DB_ROWS.map((row) => (
                      <tr key={row.name}>
                        <td className="guideTableKey">{row.name}</td>
                        <td>{row.location}</td>
                        <td>{row.secret}</td>
                        <td>{row.billing}</td>
                        <td>{row.impact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="guideCard">
              <h3>7) 운영 메모</h3>
              <ul className="guideList">
                <li>현재 코드에는 Google API Key 연동이 없습니다.</li>
                <li>문서에 있는 Google Drive 항목은 서비스 계정 기반 업로드 초안이지, 현재 런타임에서 쓰는 API Key는 아닙니다.</li>
                <li>회의록 비용은 새 전사를 다시 만들 때는 AssemblyAI 비용이 다시 들고, 같은 전사에 publish만 반복하면 재전사 비용은 늘지 않습니다.</li>
                <li>`OPENAI_API_KEY`가 설정된 경우에는 publish나 summary retry 때 요약 호출 비용이 추가로 발생합니다.</li>
              </ul>
            </article>
            <article className="guideCard">
              <h3>8) 권장 사용 순서</h3>
              <ol>
                <li>프로젝트 탭에서 행사명/행사구분/행사진행일을 먼저 확인합니다.</li>
                <li>행사 체크리스트 탭에서 미할당 항목을 우선 정리합니다.</li>
                <li>업무 탭에서 담당자와 일정(시작/마감)을 실제 운영 기준으로 보정합니다.</li>
                <li>완료 처리 후 다시 행사 체크리스트 타임라인에서 위험 구간(빨간색)을 재확인합니다.</li>
              </ol>
            </article>
          </div>
        </section>
      ) : null}

      {activeView === 'checklist' ? (
        <ChecklistView
          mode={checklistMode}
          checklistFilters={checklistFilters}
          checklistSort={checklistSort}
          checklistLoading={checklistLoading}
          loadingProjects={loadingProjects}
          assignmentLoading={assignmentLoading}
          assignmentSyncing={assignmentSyncing}
          checklistError={checklistError}
          assignmentSyncError={assignmentSyncError}
          assignmentStorageMode={assignmentStorageMode}
          prioritizeUnassignedChecklist={prioritizeUnassignedChecklist}
          projectDbOptions={checklistProjectOptions}
          selectedChecklistProject={selectedChecklistProject}
          rows={checklistRows}
          onChecklistInput={onChecklistInput}
          onChecklistSubmit={onChecklistSubmit}
          onChecklistReset={onChecklistReset}
          onChecklistSortChange={setChecklistSort}
          onTogglePrioritizeUnassignedChecklist={setPrioritizeUnassignedChecklist}
          creatingTaskByChecklistId={checklistCreatingTaskIds}
          assigneeOptions={assigneeOptions}
          onCreateTaskFromChecklist={onCreateTaskFromChecklist}
          onTaskOpen={(taskId) => navigate(`/task/${encodeURIComponent(taskId)}`)}
          onOpenAssignmentPicker={onOpenAssignmentPicker}
          onSetNotApplicable={onSetChecklistNotApplicable}
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
          openProjectTimelineGroups={openProjectTimelineGroups}
          loadingProjects={loadingProjects}
          onProjectSortChange={setProjectSort}
          onToggleProjectTimelineGroup={onToggleProjectTimelineGroup}
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

      <ScreeningPlanImportModal
        open={screeningPlanImportOpen}
        busy={screeningPlanImporting}
        form={screeningPlanImportForm}
        sourceEventOptions={screeningHistoryEventOptions}
        projectOptions={screeningPlanImportProjectOptions}
        onClose={closeScreeningPlanImportModal}
        onChange={updateScreeningPlanImportForm}
        onSubmit={importScreeningPlanFromHistory}
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

