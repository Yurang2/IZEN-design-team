export type Route =
  | {
      kind: 'list'
    }
  | {
      kind: 'eventGraphicsShare'
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

export type ScheduleCell = {
  columnId: string
  type: string
  text: string
  href?: string | null
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
    meeting?: { id: string; url: string | null }
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

export type TopView = 'dashboard' | 'projects' | 'tasks' | 'schedule' | 'eventGraphics' | 'checklist' | 'meetings' | 'snsPost' | 'guide'

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
  totalLeadDays?: number
  computedDueDate?: string
}
