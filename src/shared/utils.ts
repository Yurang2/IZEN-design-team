import { formatProjectIconLabel } from './emoji'
import type {
  ApiSchemaSummary,
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  ChecklistPreviewItem,
  Filters,
  ProjectRecord,
  Route,
  ScheduleColumn,
  ScheduleRow,
  TaskLayoutMode,
  TaskQuickGroupBy,
  TaskViewFilters,
  ThemeKey,
  TopView,
  ViewMenuGroupKey,
} from './types'
import {
  AUTH_GATE_STORAGE_KEY,
  DEFAULT_FILTERS,
  DEFAULT_TASK_VIEW_FILTERS,
  DEFAULT_THEME,
  ENABLE_SYSTEM_THEME_FALLBACK,
  THEME_QUERY_KEY,
  THEME_STORAGE_KEY,
} from './constants'

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

export function getScheduleColumnIndex(columns: ScheduleColumn[], columnName: string): number {
  return columns.findIndex((column) => column.name === columnName)
}

export function readScheduleCellText(row: ScheduleRow, columns: ScheduleColumn[], columnName: string): string {
  const index = getScheduleColumnIndex(columns, columnName)
  return index >= 0 ? row.cells[index]?.text?.trim() ?? '' : ''
}

export function readScheduleTitleText(row: ScheduleRow, columns: ScheduleColumn[]): string {
  const titleIndex = columns.findIndex((column) => column.type === 'title')
  const effectiveIndex = titleIndex >= 0 ? titleIndex : 0
  return row.cells[effectiveIndex]?.text?.trim() ?? ''
}

export function normalizeScheduleKey(value: string): string {
  return value.trim().replace(/-/g, '').toLowerCase()
}

export function resolveScheduleRelationText(raw: string, labelMap: Record<string, string>): string {
  const labels = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => labelMap[normalizeScheduleKey(value)] ?? labelMap[value] ?? value)
  return labels.join(', ')
}

// ---------------------------------------------------------------------------
// View / parse helpers
// ---------------------------------------------------------------------------

export function createDefaultFilters(): Filters {
  return { ...DEFAULT_FILTERS }
}

export function createDefaultTaskViewFilters(): TaskViewFilters {
  return { ...DEFAULT_TASK_VIEW_FILTERS }
}

export function createDefaultViewMenuOpenState(): Record<ViewMenuGroupKey, boolean> {
  return {
    operations: true,
    events: true,
    tools: true,
  }
}

export function parseTopView(value: string | null): TopView {
  if (
    value === 'dashboard' ||
    value === 'projects' ||
    value === 'tasks' ||
    value === 'schedule' ||
    value === 'screeningHistory' ||
    value === 'screeningPlan' ||
    value === 'eventGraphics' ||
    value === 'photoGuide' ||
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

export function parseTaskLayout(value: string | null): TaskLayoutMode {
  if (value === 'board' || value === 'kanban') return 'board'
  return 'list'
}

export function parseTaskQuickGroupBy(value: string | null): TaskQuickGroupBy {
  if (value === 'assignee' || value === 'status' || value === 'due') return value
  return 'project'
}

export function parseBooleanQuery(value: string | null): boolean {
  return value === '1' || value === 'true'
}

// ---------------------------------------------------------------------------
// Theme helpers
// ---------------------------------------------------------------------------

export function parseThemeValue(value: string | null | undefined): ThemeKey | null {
  if (value === 'v1' || value === 'v2' || value === 'v3') return value
  return null
}

export function resolveSystemTheme(): ThemeKey {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'v2' : 'v1'
  }
  return DEFAULT_THEME
}

export function readStoredTheme(): ThemeKey | null {
  try {
    return parseThemeValue(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return null
  }
}

export function resolveThemeFromSearch(search: string): ThemeKey {
  const params = new URLSearchParams(search)
  const fromQuery = parseThemeValue(params.get(THEME_QUERY_KEY))
  if (fromQuery) return fromQuery

  const fromStorage = readStoredTheme()
  if (fromStorage) return fromStorage

  if (ENABLE_SYSTEM_THEME_FALLBACK) return resolveSystemTheme()
  return DEFAULT_THEME
}

export function writeThemeToStorage(theme: ThemeKey): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage errors in restrictive browser contexts.
  }
}

export function applyThemeToDocument(theme: ThemeKey): void {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme === 'v2' ? 'dark' : 'light'
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export function readFrontGateAuthenticated(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(AUTH_GATE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeFrontGateAuthenticated(authenticated: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (authenticated) window.sessionStorage.setItem(AUTH_GATE_STORAGE_KEY, '1')
    else window.sessionStorage.removeItem(AUTH_GATE_STORAGE_KEY)
  } catch {
    // Ignore storage errors in restrictive browser contexts.
  }
}

// ---------------------------------------------------------------------------
// URL / route helpers
// ---------------------------------------------------------------------------

export function readListUiStateFromSearch(search: string): {
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

export function toTopViewPath(view: TopView): string {
  if (view === 'dashboard') return 'Team Dashboard'
  if (view === 'projects') return 'Projects'
  if (view === 'tasks') return 'Tasks'
  if (view === 'schedule') return 'Schedule'
  if (view === 'screeningHistory') return 'Screening History'
  if (view === 'screeningPlan') return 'Screening Plan'
  if (view === 'eventGraphics') return 'Event Graphics Timetable'
  if (view === 'photoGuide') return 'Photo Guide'
  if (view === 'meetings') return 'Meetings'
  if (view === 'snsPost') return 'SNS Post Generator'
  if (view === 'geminiImageTest') return 'Gemini Image Test'
  if (view === 'mailTemplate') return 'Mail Template'
  if (view === 'guide') return 'Usage Guide'
  return 'Event Checklist'
}

export function toTopViewTitle(view: TopView): string {
  if (view === 'dashboard') return '팀 운영 대시보드'
  if (view === 'projects') return '프로젝트'
  if (view === 'tasks') return '업무'
  if (view === 'schedule') return '일정'
  if (view === 'screeningHistory') return '상영 기록'
  if (view === 'screeningPlan') return '상영 준비'
  if (view === 'eventGraphics') return '타임테이블'
  if (view === 'photoGuide') return '촬영가이드'
  if (view === 'meetings') return '회의록'
  if (view === 'snsPost') return 'SNS 본문 생성'
  if (view === 'geminiImageTest') return 'Gemini 이미지 테스트'
  if (view === 'mailTemplate') return '메일 템플릿'
  if (view === 'checklist') return '행사 체크리스트'
  return '사용법'
}

export function parseRoute(pathname: string): Route {
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
  if (cleaned === '/share/photo-guide') {
    return { kind: 'photoGuideShare' }
  }
  if (cleaned.startsWith('/task/')) {
    const id = cleaned.slice('/task/'.length)
    if (id) {
      return { kind: 'task', id: decodeURIComponent(id) }
    }
  }
  return { kind: 'list' }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function normalizeStatus(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
}

export function toStatusTone(status: string | undefined): 'gray' | 'red' | 'blue' | 'green' {
  const normalized = normalizeStatus(status)
  if (normalized === '보류') return 'red'
  if (normalized === '진행중' || normalized === '검토중' || normalized === '수정중') return 'blue'
  if (normalized === '완료' || normalized === '보관') return 'green'
  return 'gray'
}

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function joinOrDash(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

export function splitByComma(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function formatBuildTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR', { hour12: false })
}

export function toProjectLabel(project: ProjectRecord): string {
  const iconLabel = formatProjectIconLabel(project.iconEmoji)
  if (iconLabel) return `${iconLabel} ${project.name}`
  return project.name
}

export function toProjectThumbUrl(project: ProjectRecord | undefined): string | undefined {
  if (!project) return undefined
  return project.coverUrl || project.iconUrl
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeIsoDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

export function diffDays(from: Date, to: Date): number {
  const ms = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / ms)
}

export function asSortDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-12-31'
}

export function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

export function shiftBusinessDays(date: Date, offsetDays: number): Date {
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

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateLabel(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return toIsoDate(parsed)
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------

export function toNotionUrlById(id: string | undefined): string | null {
  if (!id) return null
  const normalized = id.replace(/-/g, '').trim()
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

export function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// Checklist helpers
// ---------------------------------------------------------------------------

export function sanitizeChecklistTaskPageId(value: string | undefined | null): string {
  const taskPageId = (value ?? '').trim()
  if (!taskPageId) return ''
  if (taskPageId.includes('::')) return ''
  return taskPageId
}

export function checklistItemLookupKey(value: string | undefined | null): string {
  return normalizeNotionId(value)
}

export function checklistItemKeyFromAssignmentRow(row: ChecklistAssignmentRow): string {
  const fromRelation = checklistItemLookupKey(row.checklistItemPageId)
  if (fromRelation) return fromRelation
  const rawKey = (row.key ?? '').trim()
  if (!rawKey) return ''
  const parts = rawKey.split('::')
  if (parts.length < 2) return ''
  return checklistItemLookupKey(parts[parts.length - 1] ?? '')
}

export function checklistAssignmentRowPriority(row: ChecklistAssignmentRow): number {
  const taskId = sanitizeChecklistTaskPageId(row.taskPageId)
  let score = 0
  if (row.assignmentStatus === 'assigned') score += taskId ? 300 : 160
  else if (row.assignmentStatus === 'unassigned') score += 100
  const statusText = (row.assignmentStatusText ?? '').trim().toLowerCase()
  if (statusText.includes('assigned') || statusText.includes('할당')) score += 10
  if (statusText.includes('unassigned') || statusText.includes('미할당')) score += 5
  return score
}

export function toTimelineStatusRank(status: string | undefined): number {
  const tone = toStatusTone(status)
  if (tone === 'gray') return 0
  if (tone === 'blue' || tone === 'red') return 1
  if (tone === 'green') return 2
  return 1
}

export function normalizeTaskLookupKey(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function extractPredecessorTokens(...sources: Array<string | undefined>): string[] {
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

export function getChecklistTotalLeadDays(item: ChecklistPreviewItem): number | undefined {
  if (typeof item.totalLeadDays === 'number') return item.totalLeadDays
  const hasAny =
    typeof item.designLeadDays === 'number' || typeof item.productionLeadDays === 'number' || typeof item.bufferDays === 'number'
  if (!hasAny) return undefined
  return (item.designLeadDays ?? 0) + (item.productionLeadDays ?? 0) + (item.bufferDays ?? 0)
}

export function computeChecklistDueDate(eventDate: string | undefined, item: ChecklistPreviewItem): string | undefined {
  if (!eventDate) return undefined
  const base = parseIsoDate(eventDate)
  if (!base) return undefined
  const totalLead = getChecklistTotalLeadDays(item)
  if (typeof totalLead !== 'number') return undefined
  return toIsoDate(shiftBusinessDays(base, -Math.abs(totalLead)))
}

export function checklistMatrixKey(projectPageId: string, checklistItemPageId: string): string {
  return `${projectPageId}::${checklistItemPageId}`
}

export function toChecklistAssignmentLabel(status: ChecklistAssignmentStatus): string {
  if (status === 'not_applicable') return '해당없음'
  if (status === 'assigned') return '할당됨'
  return '미할당'
}

export function normalizeChecklistValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function splitChecklistCandidates(value: string | undefined): string[] {
  const raw = (value ?? '').normalize('NFKC')
  return raw
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function includesChecklistValue(values: string[] | undefined, target: string | undefined): boolean {
  const normalizedTarget = normalizeChecklistValue(target)
  if (!normalizedTarget) return false
  return (values ?? []).some((entry) => {
    const normalizedEntry = normalizeChecklistValue(entry)
    if (!normalizedEntry) return false
    if (normalizedEntry === normalizedTarget) return true
    return splitChecklistCandidates(entry).some((candidate) => normalizeChecklistValue(candidate) === normalizedTarget)
  })
}

export function isChecklistSelectableProject(project: ProjectRecord): boolean {
  const normalizedType = normalizeChecklistValue(project.projectType)
  return normalizedType === normalizeChecklistValue('행사') || normalizedType === normalizeChecklistValue('전시회')
}

export function checklistAppliesToProject(item: ChecklistPreviewItem, project: ProjectRecord | undefined): boolean {
  if (!project) return false
  const byProjectType = !item.applicableProjectTypes?.length || includesChecklistValue(item.applicableProjectTypes, project.projectType)
  const categoryCandidates = item.applicableEventCategories?.length ? item.applicableEventCategories : item.eventCategories
  const byEventCategory =
    normalizeChecklistValue(project.eventCategory) === ''
      ? (categoryCandidates?.length ?? 0) === 0
      : includesChecklistValue(categoryCandidates, project.eventCategory)
  return Boolean(byProjectType && byEventCategory)
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

export function schemaUnknownMessage(schema: ApiSchemaSummary | null): string[] {
  if (!schema) return []
  return schema.unknownFields.map((field) => `${field.expectedName} (${field.expectedTypes.join('|')}) -> [UNKNOWN]`)
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
