import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AssignmentModal } from './features/checklist/AssignmentModal'
import { ScreeningPlanImportModal, type ScreeningPlanImportForm } from './features/screening/ScreeningPlanImportModal'
import { TaskCreateModal } from './features/tasks/TaskCreateModal'

const ChecklistView = lazy(() => import('./features/checklist/ChecklistView').then((m) => ({ default: m.ChecklistView })))
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })))
const EventGraphicsPrintPage = lazy(() => import('./features/eventGraphics/EventGraphicsPrintPage').then((m) => ({ default: m.EventGraphicsPrintPage })))
const EventGraphicsSharePage = lazy(() => import('./features/eventGraphics/EventGraphicsSharePage').then((m) => ({ default: m.EventGraphicsSharePage })))
const EventGraphicsTimetableView = lazy(() => import('./features/eventGraphics/EventGraphicsTimetableView').then((m) => ({ default: m.EventGraphicsTimetableView })))
const GeminiImageTestView = lazy(() => import('./features/tools/GeminiImageTestView').then((m) => ({ default: m.GeminiImageTestView })))
const MailTemplateView = lazy(() => import('./features/mailTemplate/MailTemplateView').then((m) => ({ default: m.MailTemplateView })))
const MeetingsView = lazy(() => import('./features/meetings/MeetingsView').then((m) => ({ default: m.MeetingsView })))
const PhotoGuideSharePage = lazy(() => import('./features/photoGuide/PhotoGuideSharePage').then((m) => ({ default: m.PhotoGuideSharePage })))
const PhotoGuideView = lazy(() => import('./features/photoGuide/PhotoGuideView').then((m) => ({ default: m.PhotoGuideView })))
const ProjectsView = lazy(() => import('./features/projects/ProjectsView').then((m) => ({ default: m.ProjectsView })))
const ScheduleView = lazy(() => import('./features/schedule/ScheduleView').then((m) => ({ default: m.ScheduleView })))
const ScreeningDbView = lazy(() => import('./features/screening/ScreeningDbView').then((m) => ({ default: m.ScreeningDbView })))
const SnsPostGeneratorView = lazy(() => import('./features/snsPost/SnsPostGeneratorView').then((m) => ({ default: m.SnsPostGeneratorView })))
const TaskDetailView = lazy(() => import('./features/taskDetail/TaskDetailView').then((m) => ({ default: m.TaskDetailView })))
const TasksView = lazy(() => import('./features/tasks/TasksView').then((m) => ({ default: m.TasksView })))
const WorkflowProcessView = lazy(() => import('./features/process/WorkflowProcessView').then((m) => ({ default: m.WorkflowProcessView })))
import { api, USE_MOCK_DATA } from './shared/api/client'
import {
  AUTH_GATE_ENABLED,
  GUIDE_DB_ROWS,
  GUIDE_SECRET_ROWS,
  INITIAL_SCREENING_PLAN_IMPORT_FORM,
  MAX_TASK_PAGES,
  POLLING_MS,
  TASK_PAGE_SIZE,
  THEME_QUERY_KEY,
} from './shared/constants'
import { useDebouncedValue } from './shared/hooks/useDebouncedValue'
import { useKeybinding } from './shared/hooks/useKeybinding'
import { useToast } from './shared/hooks/useToast'
import { useAuth } from './shared/hooks/useAuth'
import { useAppVersion } from './shared/hooks/useAppVersion'
import { useAppRouter } from './shared/hooks/useAppRouter'
import { useNotionTableView } from './shared/hooks/useNotionTableView'
import type {
  ApiSchemaSummary,
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  ChecklistAssignmentsResponse,
  ChecklistPreviewFilters,
  ChecklistPreviewItem,
  ChecklistPreviewResponse,
  ChecklistSort,
  CreateForm,
  DetailForm,
  ListTasksResponse,
  MetaResponse,
  ProjectRecord,
  ProjectSort,
  ProjectsResponse,
  QuickSearchScope,
  ScreeningPlanHistorySyncResponse,
  ScreeningPlanImportResponse,
  TaskRecord,
  TaskResponse,
  TaskSort,
  ThemeKey,
  TopView,
  ViewMenuGroupKey,
  ChecklistAssignmentTarget,
} from './shared/types'
import { ToastStack, UiGlyph, ErrorBoundary } from './shared/ui'
import type { UiGlyphName } from './shared/ui'
import {
  addDays,
  applyThemeToDocument,
  asSortDate,
  checklistAppliesToProject,
  checklistAssignmentRowPriority,
  checklistItemKeyFromAssignmentRow,
  checklistItemLookupKey,
  checklistMatrixKey,
  computeChecklistDueDate,
  createDefaultFilters,
  createDefaultTaskViewFilters,
  createDefaultViewMenuOpenState,
  diffDays,
  extractPredecessorTokens,
  formatBuildTimestamp,
  formatDateLabel,
  getChecklistTotalLeadDays,
  isChecklistSelectableProject,
  joinOrDash,
  normalizeIsoDateInput,
  normalizeNotionId,
  normalizeTaskLookupKey,
  parseIsoDate,
  readListUiStateFromSearch,
  readScheduleCellText,
  readScheduleTitleText,
  resolveScheduleRelationText,
  resolveThemeFromSearch,
  sanitizeChecklistTaskPageId,
  schemaUnknownMessage,
  splitByComma,
  toChecklistAssignmentLabel,
  toErrorMessage,
  toIsoDate,
  toNotionUrlById,
  toProjectLabel,
  toProjectThumbUrl,
  toStatusTone,
  toTimelineStatusRank,
  toTopViewPath,
  toTopViewTitle,
  unique,
  writeThemeToStorage,
} from './shared/utils'
import './App.css'
import './shared/ui/ui.css'

function App() {
  const initialListUiState = readListUiStateFromSearch(window.location.search)
  const { toasts, pushToast, dismissToast, copyText } = useToast()
  const { authState, authPassword, authSubmitting, authError, setAuthPassword, onAuthSubmit } = useAuth(pushToast)
  const { currentBuild, latestAvailableBuild } = useAppVersion()
  const [theme, setTheme] = useState<ThemeKey>(() => resolveThemeFromSearch(window.location.search))
  const {
    route,
    activeView,
    setActiveView,
    taskLayout,
    setTaskLayout,
    taskQuickGroupBy,
    setTaskQuickGroupBy,
    showTaskFilters,
    setShowTaskFilters,
    filters,
    setFilters,
    taskViewFilters,
    setTaskViewFilters,
    navigate,
  } = useAppRouter({ initialListUiState, setTheme })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [menuCollapsed, setMenuCollapsed] = useState(false)
  const [viewMenuOpenState, setViewMenuOpenState] = useState<Record<ViewMenuGroupKey, boolean>>(createDefaultViewMenuOpenState)
  const [projectSort, setProjectSort] = useState<ProjectSort>('name_asc')
  const [taskSort, setTaskSort] = useState<TaskSort>('due_asc')
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
    screeningVideo: string | null
  }>({
    project: null,
    task: null,
    checklist: null,
    screeningVideo: null,
  })

  const debouncedFilterQ = useDebouncedValue(filters.q, 250)

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
  const schedule = useNotionTableView('/schedule', '일정 DB를 불러오지 못했습니다.')
  const screeningHistory = useNotionTableView('/screening-history', '상영 기록 DB를 불러오지 못했습니다.')
  const screeningPlan = useNotionTableView('/screening-plan', '상영 준비 DB를 불러오지 못했습니다.')
  const [screeningPlanSyncing, setScreeningPlanSyncing] = useState(false)
  const [screeningPlanImportOpen, setScreeningPlanImportOpen] = useState(false)
  const [screeningPlanImporting, setScreeningPlanImporting] = useState(false)
  const [screeningPlanImportForm, setScreeningPlanImportForm] = useState<ScreeningPlanImportForm>(INITIAL_SCREENING_PLAN_IMPORT_FORM)
  const eventGraphics = useNotionTableView('/event-graphics-timetable', '행사 그래픽 타임테이블을 불러오지 못했습니다.')
  const photoGuide = useNotionTableView('/photo-guide', '촬영 가이드를 불러오지 못했습니다.')
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

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  const onThemeChange = useCallback((nextTheme: ThemeKey) => {
    setTheme(nextTheme)
    writeThemeToStorage(nextTheme)

    const params = new URLSearchParams(window.location.search)
    params.set(THEME_QUERY_KEY, nextTheme)
    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
    window.history.replaceState({}, '', nextUrl)
  }, [])

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
        screeningVideo: response.databases.screeningVideo?.url ?? toNotionUrlById(response.databases.screeningVideo?.id ?? undefined),
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
      await Promise.all([screeningPlan.fetch(), screeningHistory.fetch()])
    } catch (error: unknown) {
      pushToast('error', toErrorMessage(error, '상영 히스토리 반영에 실패했습니다.'))
    } finally {
      setScreeningPlanSyncing(false)
    }
  }, [screeningHistory.fetch, screeningPlan.fetch, pushToast])

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

      await Promise.all([screeningPlan.fetch(), screeningHistory.fetch()])
      setScreeningPlanImportOpen(false)
      setScreeningPlanImportForm(INITIAL_SCREENING_PLAN_IMPORT_FORM)
    } catch (error: unknown) {
      pushToast('error', toErrorMessage(error, '기준 행사 불러오기에 실패했습니다.'))
    } finally {
      setScreeningPlanImporting(false)
    }
  }, [screeningHistory.fetch, screeningPlan.fetch, pushToast, screeningPlanImportForm])


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
    void schedule.fetch()
  }, [activeView, authState, schedule.fetch, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'screeningHistory') return
    void screeningHistory.fetch()
  }, [activeView, authState, screeningHistory.fetch, route.kind])

  useEffect(() => {
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'screeningPlan') return
    void screeningPlan.fetch()
    void screeningHistory.fetch()
  }, [activeView, authState, screeningHistory.fetch, screeningPlan.fetch, route.kind])

  useEffect(() => {
    if (route.kind === 'eventGraphicsShare' || route.kind === 'eventGraphicsPrint') {
      void eventGraphics.fetch()
      return
    }
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'eventGraphics') return
    void eventGraphics.fetch()
  }, [activeView, authState, eventGraphics.fetch, route.kind])

  useEffect(() => {
    if (route.kind === 'photoGuideShare') {
      void photoGuide.fetch()
      return
    }
    if (authState !== 'authenticated') return
    if (route.kind !== 'list') return
    if (activeView !== 'photoGuide') return
    void photoGuide.fetch()
  }, [activeView, authState, photoGuide.fetch, route.kind])

  const refreshListAndProjects = useCallback(async () => {
    const jobs: Array<Promise<unknown>> = [fetchProjects(), fetchTasks()]
    if (activeView === 'schedule') jobs.push(schedule.fetch())
    if (activeView === 'screeningHistory') jobs.push(screeningHistory.fetch())
    if (activeView === 'screeningPlan') jobs.push(screeningPlan.fetch(), screeningHistory.fetch())
    if (activeView === 'eventGraphics') jobs.push(eventGraphics.fetch())
    if (activeView === 'photoGuide') jobs.push(photoGuide.fetch())
    await Promise.all(jobs)
  }, [activeView, eventGraphics.fetch, fetchProjects, fetchTasks, photoGuide.fetch, schedule.fetch, screeningHistory.fetch, screeningPlan.fetch])

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
    for (const row of screeningHistory.rows) {
      const title = readScheduleTitleText(row, screeningHistory.columns)
      if (!title || title === '-') continue
      const normalized = row.id.replace(/-/g, '').toLowerCase()
      map[normalized] = title
      map[row.id] = title
    }
    return map
  }, [screeningHistory.columns, screeningHistory.rows])

  const screeningHistoryEventOptions = useMemo(() => {
    return Array.from(
      new Set(
        screeningHistory.rows
          .map((row) => {
            const projectRaw = readScheduleCellText(row, screeningHistory.columns, '귀속 프로젝트')
            const projectName = projectRaw ? resolveScheduleRelationText(projectRaw, screeningProjectLabelMap) : ''
            const eventName = readScheduleCellText(row, screeningHistory.columns, '행사명')
            const title = readScheduleTitleText(row, screeningHistory.columns)
            return [projectName, eventName, title].map((value) => value.trim()).find((value) => value && value !== '-') ?? ''
          })
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, 'ko'))
  }, [screeningHistory.columns, screeningHistory.rows, screeningProjectLabelMap])

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
    if (activeView === 'schedule') return schedule.databaseUrl
    if (activeView === 'screeningHistory') return screeningHistory.databaseUrl
    if (activeView === 'screeningPlan') return screeningPlan.databaseUrl
    if (activeView === 'eventGraphics') return eventGraphics.databaseUrl
    if (activeView === 'photoGuide') return photoGuide.databaseUrl
    if (activeView === 'checklist') return dbLinks.checklist
    return null
  }, [activeView, dbLinks.checklist, dbLinks.project, dbLinks.task, eventGraphics.databaseUrl, photoGuide.databaseUrl, schedule.databaseUrl, screeningHistory.databaseUrl, screeningPlan.databaseUrl])

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
        { view: 'photoGuide', title: '촬영가이드', label: '촬영가이드', icon: 'list' },
        { view: 'checklist', title: '행사 체크리스트', label: '행사 체크리스트', icon: 'checksquare' },
      ],
    },
    {
      key: 'tools',
      label: '도구',
      items: [
        { view: 'screeningHistory', title: '상영 기록', label: '상영 기록', icon: 'list' },
        { view: 'screeningPlan', title: '상영 준비', label: '상영 준비', icon: 'list' },
        { view: 'workflowProcess', title: '업무진행 프로세스', label: '업무진행 프로세스', icon: 'list' },
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

  if (
    AUTH_GATE_ENABLED &&
    route.kind !== 'eventGraphicsShare' &&
    route.kind !== 'eventGraphicsPrint' &&
    route.kind !== 'photoGuideShare' &&
    authState !== 'authenticated'
  ) {
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
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
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
      </Suspense>
    )
  }

  if (route.kind === 'eventGraphicsShare') {
    return (
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
        <EventGraphicsSharePage
          configured={eventGraphics.configured}
          databaseTitle={eventGraphics.databaseTitle}
          columns={eventGraphics.columns}
          rows={eventGraphics.rows}
          loading={eventGraphics.loading}
          error={eventGraphics.error}
        />
      </Suspense>
    )
  }

  if (route.kind === 'eventGraphicsPrint') {
    return (
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
        <EventGraphicsPrintPage
          configured={eventGraphics.configured}
          databaseTitle={eventGraphics.databaseTitle}
          columns={eventGraphics.columns}
          rows={eventGraphics.rows}
          loading={eventGraphics.loading}
          error={eventGraphics.error}
        />
      </Suspense>
    )
  }

  if (route.kind === 'photoGuideShare') {
    return (
      <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
        <PhotoGuideSharePage
          configured={photoGuide.configured}
          databaseTitle={photoGuide.databaseTitle}
          columns={photoGuide.columns}
          rows={photoGuide.rows}
          loading={photoGuide.loading}
          error={photoGuide.error}
        />
      </Suspense>
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
        <ErrorBoundary>
        <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>로딩 중...</div>}>
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
          configured={schedule.configured}
          databaseTitle={schedule.databaseTitle}
          databaseUrl={schedule.databaseUrl}
          columns={schedule.columns}
          rows={schedule.rows}
          loading={schedule.loading}
          error={schedule.error}
        />
      ) : null}

      {activeView === 'screeningHistory' ? (
        <ScreeningDbView
          configured={screeningHistory.configured}
          databaseTitle={screeningHistory.databaseTitle}
          databaseUrl={screeningHistory.databaseUrl}
          columns={screeningHistory.columns}
          rows={screeningHistory.rows}
          loading={screeningHistory.loading}
          error={screeningHistory.error}
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
          configured={screeningPlan.configured}
          databaseTitle={screeningPlan.databaseTitle}
          databaseUrl={screeningPlan.databaseUrl}
          columns={screeningPlan.columns}
          rows={screeningPlan.rows}
          loading={screeningPlan.loading}
          error={screeningPlan.error}
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
          configured={eventGraphics.configured}
          databaseTitle={eventGraphics.databaseTitle}
          databaseUrl={eventGraphics.databaseUrl}
          columns={eventGraphics.columns}
          rows={eventGraphics.rows}
          loading={eventGraphics.loading}
          error={eventGraphics.error}
          onRefresh={eventGraphics.fetch}
        />
      ) : null}

      {activeView === 'photoGuide' ? (
        <PhotoGuideView
          configured={photoGuide.configured}
          databaseTitle={photoGuide.databaseTitle}
          databaseUrl={photoGuide.databaseUrl}
          columns={photoGuide.columns}
          rows={photoGuide.rows}
          loading={photoGuide.loading}
          error={photoGuide.error}
          shareHref="/share/photo-guide"
        />
      ) : null}

      {activeView === 'meetings' ? <MeetingsView /> : null}

      {activeView === 'snsPost' ? <SnsPostGeneratorView onCopy={copyText} /> : null}

      {activeView === 'geminiImageTest' ? <GeminiImageTestView /> : null}

      {activeView === 'mailTemplate' ? <MailTemplateView onCopy={copyText} /> : null}

      {activeView === 'workflowProcess' ? <WorkflowProcessView onOpenGuide={() => setActiveView('guide')} /> : null}

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
                <h4>촬영가이드</h4>
                <p>촬영 기사에게 공유할 브리프를 내부 화면과 외부 공유 페이지로 함께 정리하는 탭입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('photoGuide')}>
                  촬영가이드 열기
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
                <h4>업무진행 프로세스</h4>
                <p>요청 접수부터 컨셉 승인, 본작업, 최종 업로드까지의 표준 업무 절차를 정리한 페이지입니다.</p>
                <button type="button" className="secondary mini" onClick={() => setActiveView('workflowProcess')}>
                  프로세스 열기
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
                {schedule.databaseUrl ? (
                  <a className="guideDbLink" href={schedule.databaseUrl} target="_blank" rel="noreferrer">
                    일정 DB: {schedule.databaseUrl}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">일정 DB: 연결 안 됨</span>
                )}
                {screeningHistory.databaseUrl ? (
                  <a className="guideDbLink" href={screeningHistory.databaseUrl} target="_blank" rel="noreferrer">
                    상영 기록 DB: {screeningHistory.databaseUrl}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">상영 기록 DB: 연결 안 됨</span>
                )}
                {screeningPlan.databaseUrl ? (
                  <a className="guideDbLink" href={screeningPlan.databaseUrl} target="_blank" rel="noreferrer">
                    상영 준비 DB: {screeningPlan.databaseUrl}
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
                {eventGraphics.databaseUrl ? (
                  <a className="guideDbLink" href={eventGraphics.databaseUrl} target="_blank" rel="noreferrer">
                    타임테이블 DB: {eventGraphics.databaseUrl}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">타임테이블 DB: 연결 안 됨</span>
                )}
                {photoGuide.databaseUrl ? (
                  <a className="guideDbLink" href={photoGuide.databaseUrl} target="_blank" rel="noreferrer">
                    촬영가이드 DB: {photoGuide.databaseUrl}
                  </a>
                ) : (
                  <span className="guideDbLink is-muted">촬영가이드 DB: 연결 안 됨</span>
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
        </Suspense>
        </ErrorBoundary>
    </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

export default App

