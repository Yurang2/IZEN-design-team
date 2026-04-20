export type Route =
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
      kind: 'photoGuideShare'
    }
  | {
      kind: 'subtitleShare'
    }
  | {
      kind: 'task'
      id: string
    }

export type ApiSchemaField = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: 'exact' | 'fallback' | 'missing' | 'mismatch'
  optional?: boolean
  options: string[]
}

export type ApiSchemaSummary = {
  fields: Record<string, ApiSchemaField>
  unknownFields: ApiSchemaField[]
  projectBindingMode: 'relation' | 'select' | 'unknown'
}

export type TaskRecord = {
  id: string
  url: string
  projectKey: string
  projectName: string
  projectSerialCode?: string
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

export type ProjectRecord = {
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

export type ListTasksResponse = {
  ok: boolean
  tasks: TaskRecord[]
  nextCursor?: string
  hasMore: boolean
  schema: ApiSchemaSummary
  cacheTtlMs: number
}

export type TaskResponse = {
  ok: boolean
  task: TaskRecord
  schema: ApiSchemaSummary
  cacheTtlMs?: number
}

export type ProjectsResponse = {
  ok: boolean
  projects: ProjectRecord[]
  schema: ApiSchemaSummary
  cacheTtlMs: number
}

export type ChecklistPreviewItem = {
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

export type ChecklistAssignmentStatus = 'not_applicable' | 'unassigned' | 'assigned'

export type ChecklistAssignmentRow = {
  id: string
  key: string
  projectPageId: string
  checklistItemPageId: string
  taskPageId: string | null
  applicable: boolean
  assignmentStatus: ChecklistAssignmentStatus
  assignmentStatusText: string
  updatedAt?: string
}

export type ChecklistPreviewResponse = {
  ok: boolean
  eventName: string
  eventCategory: string
  availableCategories: string[]
  count: number
  items: ChecklistPreviewItem[]
  cacheTtlMs: number
}

export type ChecklistAssignmentsResponse = {
  ok: boolean
  rows?: ChecklistAssignmentRow[]
  row?: ChecklistAssignmentRow
  assignments?: Record<string, string>
  storageMode?: 'notion_matrix' | 'd1' | 'cache'
  syncing?: boolean
}

export type ChecklistAssignmentsExportResponse = {
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

export type ScheduleColumn = {
  id: string
  name: string
  type: string
}

export type ScheduleFile = {
  name: string
  url: string
  kind: 'image' | 'video' | 'audio' | 'file'
}

export type ScheduleCell = {
  columnId: string
  type: string
  text: string
  href?: string | null
  files?: ScheduleFile[]
}

export type ScheduleRow = {
  id: string
  url: string | null
  cells: ScheduleCell[]
}

export type ScheduleResponse = {
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

export type EventGraphicsTimetableResponse = {
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

export type MetaResponse = {
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
    photoGuide?: { id: string | null; url: string | null }
    meeting?: { id: string; url: string | null }
    feedback?: { id: string | null; url: string | null }
    programIssues?: { id: string | null; url: string | null }
    videoManual?: { id: string | null; url: string | null }
  }
}

export type Filters = {
  projectId: string
  status: string
  q: string
}

export type TaskViewFilters = {
  workType: string
  assignee: string
  requester: string
  dueFrom: string
  dueTo: string
  urgentOnly: boolean
  hideDone: boolean
}

export type FeedbackRecord = {
  id: string
  url: string
  content: string
  sourceProjectId?: string
  sourceProjectName?: string
  eventCategory?: string
  domainTags: string[]
  reporter?: string
  collectionMethod?: string
  priority?: string
  reflectionStatus?: string
  appliedProjectId?: string
  appliedProjectName?: string
  recurring?: boolean
  notes?: string
  date?: string
}

export type FeedbackSummaryItem = {
  id: string
  content: string
  domainTags: string[]
  priority?: string
  recurring?: boolean
  reflectionStatus?: string
}

export type FeedbackListResponse = {
  ok: boolean
  feedback: FeedbackRecord[]
  nextCursor?: string
  hasMore: boolean
  cacheTtlMs: number
}

export type FeedbackResponse = {
  ok: boolean
  feedback: FeedbackRecord
}

export type FeedbackSummaryResponse = {
  ok: boolean
  eventCategory: string
  count: number
  items: FeedbackSummaryItem[]
}

export type FeedbackFilters = {
  eventCategory: string
  domainTag: string
  reflectionStatus: string
  q: string
}

export type FeedbackSort = 'date_desc' | 'date_asc' | 'priority_desc'

export type ProgramIssueType = '버그' | '개선' | '질문' | '제안' | '기타'
export type ProgramIssueStatus = '미해결' | '확인중' | '진행중' | '보류' | '해결'
export type ProgramIssuePriority = '낮음' | '보통' | '높음' | '긴급'

export type ProgramIssueRecord = {
  id: string
  url: string
  title: string
  description?: string
  issueType?: string
  screenName?: string
  priority?: string
  status?: string
  reporter?: string
  assignee?: string
  holdReason?: string
  reproductionSteps?: string
  notes?: string
  date?: string
  resolvedDate?: string
}

export type ProgramIssueListResponse = {
  ok: boolean
  items: ProgramIssueRecord[]
  nextCursor?: string
  hasMore: boolean
  cacheTtlMs: number
}

export type ProgramIssueResponse = {
  ok: boolean
  item: ProgramIssueRecord
}

export type ProgramIssueFilters = {
  status: string
  issueType: string
  priority: string
  q: string
}

export type ProgramIssueSort = 'date_desc' | 'date_asc' | 'priority_desc' | 'status'

// ---------------------------------------------------------------------------
// Subtitle
// ---------------------------------------------------------------------------

export type SubtitleSegment = {
  index: number
  label: string
  startTime: string
  endTime: string
  ko: string
  en: string
  zh: string
  ru: string
}

export type SubtitleSnapshotData = {
  segments: SubtitleSegment[]
}

export type SubtitleVideoRecord = {
  id: string
  url: string
  videoName: string
  videoCode?: string
  category?: string
  resolution?: string
  resolutionVariants: string[]
  talent?: string
  revision?: number
  lastModifiedDate?: string
  recentChanges?: string
  creator?: string
  lastModifier?: string
  productionDate?: string
  status?: string
  eventIds: string[]
  eventNames: string[]
  gdriveLink?: string
  nasPath?: string
  fileName?: string
  memo?: string
}

export type SubtitleRevisionRecord = {
  id: string
  url: string
  revisionName: string
  videoId?: string
  videoName?: string
  revisionNumber: number
  modifiedDate?: string
  modifier?: string
  changeSummary?: string
  snapshot: SubtitleSnapshotData
}

export type SubtitleVideosResponse = {
  ok: boolean
  videos: SubtitleVideoRecord[]
  cacheTtlMs: number
}

export type SubtitleRevisionsResponse = {
  ok: boolean
  revisions: SubtitleRevisionRecord[]
  cacheTtlMs: number
}

// ---------------------------------------------------------------------------
// Video Manual
// ---------------------------------------------------------------------------

export type VideoManualItemRecord = {
  id: string
  url: string
  itemName: string
  category: string
  sortOrder: number
  description?: string
}

export type VideoManualResponse = {
  ok: boolean
  items: VideoManualItemRecord[]
  cacheTtlMs: number
}

export type TopView =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'schedule'
  | 'screeningHistory'
  | 'screeningPlan'
  | 'workflowProcess'
  | 'eventGraphics'
  | 'photoGuide'
  | 'equipment'
  | 'checklist'
  | 'meetings'
  | 'snsPost'
  | 'geminiImageTest'
  | 'mailTemplate'
  | 'feedback'
  | 'programIssues'
  | 'subtitle'
  | 'videoManagement'
  | 'videoManual'
  | 'nasGuide'
  | 'nasUpload'
  | 'nasExplorer'
  | 'gdrive'
  | 'guide'

export type ProjectSort = 'name_asc' | 'name_desc' | 'date_asc' | 'date_desc'
export type TaskSort = 'due_asc' | 'due_desc' | 'start_asc' | 'start_desc' | 'status_asc' | 'name_asc'
export type ChecklistSort = 'due_asc' | 'due_desc' | 'name_asc' | 'name_desc' | 'lead_asc' | 'lead_desc'
export type TaskLayoutMode = 'list' | 'board' | 'kanban'
export type TaskQuickGroupBy = 'assignee' | 'project' | 'status' | 'due'

export type ChecklistPreviewFilters = {
  eventName: string
  eventCategory: string
  shippingDate: string
  operationMode: '' | 'self' | 'dealer'
  fulfillmentMode: '' | 'domestic' | 'overseas' | 'dealer'
}

export type ChecklistAssignmentTarget = {
  itemId: string
  productName: string
  workCategory: string
}

export type CreateForm = {
  projectValue: string
  taskName: string
  workType: string
  status: string
  assigneeText: string
  startDate: string
  dueDate: string
  detail: string
}

export type DetailForm = {
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

export type ApiCheckState = 'idle' | 'checking' | 'ok' | 'error'
export type QuickSearchScope = 'project' | 'task'
export type BoardGroupKey = 'todo' | 'progress' | 'done' | 'other'

export type TaskGroup = {
  key: string
  label: string
  tasks: TaskRecord[]
}

export type BoardColumn = {
  key: string
  label: string
  items: TaskRecord[]
  style: string
}

export type ProjectTimelineTask = {
  task: TaskRecord
  predecessorTaskId?: string
}

export type ProjectTimelineGroup = {
  project: ProjectRecord
  tasks: ProjectTimelineTask[]
}

export type ChecklistTableRow = {
  item: ChecklistPreviewItem
  matrixKey?: string
  assignmentStatus: ChecklistAssignmentStatus
  assignmentStatusLabel: string
  isApplicable: boolean
  assignedTaskId: string
  assignedTaskLabel: string
  assignedTaskName?: string
  assignedTaskStatus?: string
  assignedTaskStartDate?: string
  assignedTaskDueDate?: string
  assignedTaskActualEndDate?: string
  assignedTaskAssigneeText?: string
  isAssigned: boolean
  hasAssignee: boolean
  totalLeadDays?: number
  computedDueDate?: string
}

export type EquipmentCheckoutStatus = 'pending' | 'checked_out' | 'returned' | 'removed'

export type EquipmentCheckoutRow = {
  id: string
  projectPageId: string
  equipmentPageId: string
  status: EquipmentCheckoutStatus
  checkoutDate: string
  returnDate: string
  memo: string
}

export type EquipmentCheckoutsResponse = {
  ok: boolean
  projectId: string
  rows: EquipmentCheckoutRow[]
}

export type AppVersionManifest = {
  id: string
  builtAt: string
}

export type PhotoGuideResponse = ScheduleResponse

export type ScreeningPlanHistorySyncResponse = {
  ok: boolean
  configured: boolean
  planDatabaseId: string | null
  historyDatabaseId: string | null
  created: number
  updated: number
  skipped: number
  syncedPlanIds: string[]
}

export type ScreeningPlanImportResponse = {
  ok: boolean
  configured: boolean
  planDatabaseId: string | null
  historyDatabaseId: string | null
  matched: number
  created: number
  skipped: number
  createdPlanIds: string[]
}

export type CopyTextOptions = {
  successMessage?: string
  emptyMessage?: string
}

export type GuideConfigRow = {
  name: string
  location: string
  secret: string
  billing: string
  impact: string
}

export type ViewMenuGroupKey = 'operations' | 'events' | 'tools'

export type ThemeKey = 'v1' | 'v2' | 'v3'
