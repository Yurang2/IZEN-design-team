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
  NOTION_EQUIPMENT_DB_ID?: string
  NOTION_EQUIPMENT_CHECKOUT_DB_ID?: string
  NOTION_SCREENING_HISTORY_DB_ID?: string
  NOTION_SCREENING_PLAN_DB_ID?: string
  NOTION_SCREENING_VIDEO_DB_ID?: string
  NOTION_MEETING_DB_ID?: string
  NOTION_CHECKLIST_ASSIGNMENT_DB_ID?: string
  NOTION_FEEDBACK_DB_ID?: string
  NOTION_SUBTITLE_VIDEO_DB_ID?: string
  NOTION_SUBTITLE_REVISION_DB_ID?: string
  NOTION_VIDEO_MANUAL_DB_ID?: string
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
  GOOGLE_SERVICE_ACCOUNT_JSON?: string
  GOOGLE_CLOUD_PROJECT_ID?: string
  GOOGLE_CLOUD_LOCATION?: string
  SYNOLOGY_NAS_URL?: string
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

export type FeedbackSchema = {
  fields: {
    content: FieldSchema
    sourceProject: FieldSchema
    eventCategory: FieldSchema
    domain: FieldSchema
    reporter: FieldSchema
    collectionMethod: FieldSchema
    priority: FieldSchema
    reflectionStatus: FieldSchema
    appliedProject: FieldSchema
    recurring: FieldSchema
    notes: FieldSchema
    date: FieldSchema
  }
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

export type CreateFeedbackInput = {
  content: string
  sourceProjectId?: string
  eventCategory?: string
  domainTags?: string[]
  reporter?: string
  collectionMethod?: string
  priority?: string
  recurring?: boolean
  notes?: string
  date?: string
}

export type UpdateFeedbackInput = {
  content?: string | null
  sourceProjectId?: string | null
  eventCategory?: string | null
  domainTags?: string[] | null
  reporter?: string | null
  collectionMethod?: string | null
  priority?: string | null
  reflectionStatus?: string | null
  appliedProjectId?: string | null
  recurring?: boolean | null
  notes?: string | null
  date?: string | null
}

// ---------------------------------------------------------------------------
// Subtitle
// ---------------------------------------------------------------------------

export type SubtitleVideoSchema = {
  fields: {
    videoName: FieldSchema
    videoCode: FieldSchema
    category: FieldSchema
    resolution: FieldSchema
    resolutionVariants: FieldSchema
    talent: FieldSchema
    revision: FieldSchema
    lastModifiedDate: FieldSchema
    recentChanges: FieldSchema
    creator: FieldSchema
    lastModifier: FieldSchema
    productionDate: FieldSchema
    status: FieldSchema
    event: FieldSchema
    gdriveLink: FieldSchema
    nasPath: FieldSchema
    fileName: FieldSchema
    memo: FieldSchema
  }
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

export type SubtitleRevisionSchema = {
  fields: {
    revisionName: FieldSchema
    video: FieldSchema
    revisionNumber: FieldSchema
    modifiedDate: FieldSchema
    modifier: FieldSchema
    changeSummary: FieldSchema
    snapshotData: FieldSchema
  }
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

export type CreateSubtitleRevisionInput = {
  videoId: string
  revisionName: string
  revisionNumber: number
  modifier?: string
  changeSummary?: string
  snapshot: SubtitleSnapshotData
}

// ---------------------------------------------------------------------------
// Video Manual
// ---------------------------------------------------------------------------

export type VideoManualSchema = {
  fields: {
    itemName: FieldSchema
    category: FieldSchema
    sortOrder: FieldSchema
    description: FieldSchema
  }
}

export type VideoManualItemRecord = {
  id: string
  url: string
  itemName: string
  category: string
  sortOrder: number
  description?: string
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

export type CreateShotSlotInput = {
  title: string
  group?: string
  description?: string
  eventName?: string
  eventDate?: string
  location?: string
  callTime?: string
  contact?: string
  order?: number
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
  outputLink?: string | null
}
