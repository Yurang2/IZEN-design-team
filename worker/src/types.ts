export type ChecklistDbBinding = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      run: () => Promise<unknown>
      first: <T = Record<string, unknown>>() => Promise<T | null>
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>
    }
  }
}

export interface Env {
  NOTION_TOKEN: string
  NOTION_TASK_DB_ID: string
  NOTION_PROJECT_DB_ID: string
  NOTION_CHECKLIST_DB_ID?: string
  PAGE_PASSWORD: string
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
    detail: FieldSchema
    requester: FieldSchema
    priority: FieldSchema
    urgent: FieldSchema
    issue: FieldSchema
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

export type TaskSnapshot = {
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  schema: TaskSchema
  updatedAt: number
}

export type ChecklistPreviewItem = {
  id: string
  productName: string
  workCategory: string
  finalDueText: string
  eventCategories: string[]
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
