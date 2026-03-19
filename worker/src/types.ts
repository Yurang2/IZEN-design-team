export type ChecklistDbBinding = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>
      first: <T = Record<string, unknown>>() => Promise<T | null>
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>
    }
  }
}

export type R2ObjectBody = {
  text: () => Promise<string>
  arrayBuffer: () => Promise<ArrayBuffer>
}

export type R2ObjectLike = {
  key: string
  httpEtag?: string
  size?: number
  uploaded?: Date
  body?: R2ObjectBody | null
}

export type R2BucketBinding = {
  put: (key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob, options?: Record<string, unknown>) => Promise<R2ObjectLike | null>
  get: (key: string, options?: Record<string, unknown>) => Promise<R2ObjectLike | null>
  delete: (key: string | string[]) => Promise<void>
}

export interface Env {
  NOTION_TOKEN: string
  NOTION_TASK_DB_ID: string
  NOTION_PROJECT_DB_ID: string
  NOTION_CHECKLIST_DB_ID?: string
  NOTION_SCHEDULE_DB_ID?: string
  NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID?: string
  NOTION_PHOTO_GUIDE_DB_ID?: string
  NOTION_SCREENING_HISTORY_DB_ID?: string
  NOTION_SCREENING_PLAN_DB_ID?: string
  NOTION_SCREENING_VIDEO_DB_ID?: string
  NOTION_MEETING_DB_ID?: string
  NOTION_CHECKLIST_ASSIGNMENT_DB_ID?: string
  PAGE_PASSWORD: string
  AUTH_DISABLED?: string
  SESSION_SECRET?: string
  SESSION_TTL_SECONDS?: string
  API_KEY?: string
  ALLOWED_ORIGINS?: string
  RATE_LIMIT_WINDOW_SECONDS?: string
  RATE_LIMIT_MAX_REQUESTS?: string
  RATE_LIMIT_BLOCK_SECONDS?: string
  REQUIRE_CF_ACCESS?: string
  ALLOWED_ACCESS_EMAILS?: string
  API_CACHE_TTL_SECONDS?: string
  CHECKLIST_DB?: ChecklistDbBinding
  MEETING_AUDIO_BUCKET?: R2BucketBinding
  MEETING_AUDIO_BUCKET_NAME?: string
  R2_ACCOUNT_ID?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  ASSEMBLYAI_API_KEY?: string
  ASSEMBLYAI_WEBHOOK_SECRET?: string
  ASSEMBLYAI_WEBHOOK_URL?: string
  ASSEMBLYAI_SPEECH_MODELS?: string
  MEETING_KEYWORD_LIMIT?: string
  GEMINI_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  GEMINI_IMAGE_MODEL?: string
  OPENAI_API_KEY?: string
  OPENAI_SUMMARY_MODEL?: string
  LINE_CHANNEL_ACCESS_TOKEN?: string
  LINE_CHANNEL_SECRET?: string
  LINE_NOTIFY_TARGET_USER_ID?: string
  LINE_NOTIFY_ASSIGNEE_NAME?: string
}

export type FieldStatus = 'exact' | 'fallback' | 'missing' | 'mismatch'

export type FieldSchema = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: FieldStatus
  optional?: boolean
  options: string[]
}

export type TaskSchema = {
  fields: {
    projectRelation: FieldSchema
    projectSelect: FieldSchema
    taskName: FieldSchema
    workType: FieldSchema
    status: FieldSchema
    assignee: FieldSchema
    startDate: FieldSchema
    dueDate: FieldSchema
    actualStartDate: FieldSchema
    actualEndDate: FieldSchema
    detail: FieldSchema
    requester: FieldSchema
    priority: FieldSchema
    urgent: FieldSchema
    issue: FieldSchema
    predecessorTask: FieldSchema
    predecessorPending: FieldSchema
    outputLink: FieldSchema
  }
}

export type ApiSchemaField = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: FieldStatus
  optional?: boolean
  options: string[]
}

export type ApiSchemaSummary = {
  fields: Record<string, ApiSchemaField>
  unknownFields: ApiSchemaField[]
  projectBindingMode: 'relation' | 'unknown'
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
  source: 'project_db'
}

export type TaskRecord = {
  id: string
  url: string
  projectKey: string
  projectName: string
  projectSource: 'relation' | 'unknown'
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

export type TaskSnapshot = {
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  schema: TaskSchema
  updatedAt: number
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
  dueBasis?: 'event_start' | 'event_end' | 'shipping'
  defaultOffsetBusinessDays?: number
  dealerOffsetBusinessDays?: number
  domesticOffsetBusinessDays?: number
  overseasOffsetBusinessDays?: number
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

export type CreateTaskInput = {
  taskName: string
  projectId?: string
  projectName?: string
  workType?: string
  status?: string
  assignee?: string[]
  requester?: string[]
  startDate?: string
  dueDate?: string
  detail?: string
  priority?: string
  urgent?: boolean
  issue?: string
}

export type UpdateTaskInput = {
  projectId?: string | null
  projectName?: string | null
  taskName?: string | null
  workType?: string | null
  status?: string | null
  assignee?: string[] | null
  requester?: string[] | null
  startDate?: string | null
  dueDate?: string | null
  detail?: string | null
  priority?: string | null
  urgent?: boolean | null
  issue?: string | null
}
