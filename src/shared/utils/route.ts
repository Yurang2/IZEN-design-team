import type {
  Filters,
  Route,
  TaskLayoutMode,
  TaskQuickGroupBy,
  TaskViewFilters,
  TopView,
} from '../types'
import { DEFAULT_FILTERS, DEFAULT_TASK_VIEW_FILTERS } from '../constants'

// ---------------------------------------------------------------------------
// View / parse helpers
// ---------------------------------------------------------------------------

export function parseTopView(value: string | null): TopView {
  if (
    value === 'dashboard' ||
    value === 'projects' ||
    value === 'tasks' ||
    value === 'schedule' ||
    value === 'screeningHistory' ||
    value === 'screeningPlan' ||
    value === 'workflowProcess' ||
    value === 'eventGraphics' ||
    value === 'photoGuide' ||
    value === 'equipment' ||
    value === 'checklist' ||
    value === 'meetings' ||
    value === 'snsPost' ||
    value === 'geminiImageTest' ||
    value === 'mailTemplate' ||
    value === 'feedback' ||
    value === 'nasGuide' ||
    value === 'nasUpload' ||
    value === 'nasExplorer' ||
    value === 'gdrive' ||
    value === 'subtitle' ||
    value === 'videoManagement' ||
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

export function createDefaultFilters(): Filters {
  return { ...DEFAULT_FILTERS }
}

export function createDefaultTaskViewFilters(): TaskViewFilters {
  return { ...DEFAULT_TASK_VIEW_FILTERS }
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
  if (view === 'workflowProcess') return 'Workflow Process'
  if (view === 'eventGraphics') return 'Event Graphics Timetable'
  if (view === 'photoGuide') return 'Photo Guide'
  if (view === 'equipment') return 'Equipment'
  if (view === 'feedback') return 'Feedback'
  if (view === 'nasGuide') return 'NAS Folder Guide'
  if (view === 'nasUpload') return 'NAS Upload'
  if (view === 'nasExplorer') return 'NAS Explorer'
  if (view === 'gdrive') return 'Google Drive'
  if (view === 'subtitle') return 'Subtitle Script'
  if (view === 'videoManagement') return 'Video Management'
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
  if (view === 'workflowProcess') return '업무진행 프로세스'
  if (view === 'eventGraphics') return '타임테이블'
  if (view === 'photoGuide') return '촬영가이드'
  if (view === 'equipment') return '촬영장비'
  if (view === 'feedback') return '피드백'
  if (view === 'nasGuide') return 'NAS 폴더 구조 가이드'
  if (view === 'nasUpload') return 'NAS 파일 업로드'
  if (view === 'nasExplorer') return 'NAS 탐색기'
  if (view === 'gdrive') return '구글 드라이브'
  if (view === 'subtitle') return '자막 스크립트'
  if (view === 'videoManagement') return '영상 관리'
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
  if (cleaned === '/share/subtitle') {
    return { kind: 'subtitleShare' }
  }
  if (cleaned.startsWith('/task/')) {
    const id = cleaned.slice('/task/'.length)
    if (id) {
      return { kind: 'task', id: decodeURIComponent(id) }
    }
  }
  return { kind: 'list' }
}
