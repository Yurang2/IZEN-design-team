import { Client } from '@notionhq/client'
import { config } from './config'

type AnyMap = Record<string, any>

type FieldStatus = 'exact' | 'fallback' | 'missing' | 'mismatch'

type FieldSchema = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: FieldStatus
  optional?: boolean
  options: string[]
}

type TaskSchema = {
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

type ProjectRecord = {
  id: string
  key: string
  bindingValue: string
  name: string
  eventDate?: string
  source: 'project_db' | 'task_select'
}

type TaskRecord = {
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

type ListTasksResult = {
  tasks: TaskRecord[]
  nextCursor?: string
  hasMore: boolean
  schema: TaskSchema
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
  projectBindingMode: 'relation' | 'select' | 'unknown'
}

type ListProjectsResult = {
  projects: ProjectRecord[]
  schema: TaskSchema
}

type TaskQuery = {
  projectId?: string
  status?: string
  q?: string
  cursor?: string
  pageSize: number
}

type CreateTaskInput = {
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

type UpdateTaskInput = {
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

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').trim()
}

function joinRichText(items: any[]): string {
  if (!Array.isArray(items)) return ''
  return items
    .map((item) => item?.plain_text ?? '')
    .join('')
    .trim()
}

function first<T>(values: T[]): T | undefined {
  return values.length > 0 ? values[0] : undefined
}

function parseCsvText(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function pickOptions(property: any): string[] {
  if (!property || typeof property !== 'object') return []

  if (property.type === 'select') {
    return (property.select?.options ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
  }

  if (property.type === 'status') {
    return (property.status?.options ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
  }

  if (property.type === 'multi_select') {
    return (property.multi_select?.options ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
  }

  return []
}

function extractDate(props: AnyMap, field: FieldSchema): string | undefined {
  if (field.status === 'missing' || field.status === 'mismatch') return undefined
  const prop = props[field.actualName]
  if (!prop || prop.type !== 'date') return undefined
  return prop.date?.start ?? undefined
}

function extractCheckbox(props: AnyMap, field: FieldSchema): boolean | undefined {
  if (field.status === 'missing' || field.status === 'mismatch') return undefined
  const prop = props[field.actualName]
  if (!prop || prop.type !== 'checkbox') return undefined
  return Boolean(prop.checkbox)
}

function extractTitle(props: AnyMap, field: FieldSchema): string {
  if (field.status === 'missing' || field.status === 'mismatch') return '[UNKNOWN]'
  const prop = props[field.actualName]
  if (!prop) return '[UNKNOWN]'

  if (prop.type === 'title') {
    const value = joinRichText(prop.title ?? [])
    return value || '[UNKNOWN]'
  }

  if (prop.type === 'rich_text') {
    const value = joinRichText(prop.rich_text ?? [])
    return value || '[UNKNOWN]'
  }

  if (prop.type === 'select') {
    return prop.select?.name ?? '[UNKNOWN]'
  }

  return '[UNKNOWN]'
}

function extractTextLike(props: AnyMap, field: FieldSchema, fallback = ''): string {
  if (field.status === 'missing' || field.status === 'mismatch') return '[UNKNOWN]'
  const prop = props[field.actualName]
  if (!prop) return fallback

  if (prop.type === 'rich_text') {
    return joinRichText(prop.rich_text ?? []) || fallback
  }

  if (prop.type === 'select') {
    return prop.select?.name ?? fallback
  }

  if (prop.type === 'status') {
    return prop.status?.name ?? fallback
  }

  if (prop.type === 'title') {
    return joinRichText(prop.title ?? []) || fallback
  }

  if (prop.type === 'multi_select') {
    return (prop.multi_select ?? []).map((entry: any) => entry?.name).filter(Boolean).join(', ')
  }

  return '[UNKNOWN]'
}

function extractStringArray(props: AnyMap, field: FieldSchema): string[] {
  if (field.status === 'missing' || field.status === 'mismatch') return ['[UNKNOWN]']
  const prop = props[field.actualName]
  if (!prop) return []

  if (prop.type === 'people') {
    return (prop.people ?? [])
      .map((person: any) => normalizeText(person?.name ?? person?.person?.email ?? person?.id))
      .filter(Boolean)
  }

  if (prop.type === 'multi_select') {
    return (prop.multi_select ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
  }

  if (prop.type === 'select') {
    return prop.select?.name ? [prop.select.name] : []
  }

  if (prop.type === 'rich_text') {
    return parseCsvText(joinRichText(prop.rich_text ?? []))
  }

  if (prop.type === 'title') {
    return parseCsvText(joinRichText(prop.title ?? []))
  }

  return ['[UNKNOWN]']
}

function extractRelationIds(props: AnyMap, field: FieldSchema): string[] {
  if (field.status === 'missing' || field.status === 'mismatch') return []
  const prop = props[field.actualName]
  if (!prop || prop.type !== 'relation') return []
  return (prop.relation ?? []).map((entry: any) => entry?.id).filter(Boolean)
}

function parseDbTitle(db: any): string {
  return (db?.title ?? []).map((item: any) => item?.plain_text ?? '').join('').trim()
}

function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').toLowerCase()
}

function fieldToApi(field: FieldSchema): ApiSchemaField {
  return {
    key: field.key,
    expectedName: field.expectedName,
    expectedTypes: [...field.expectedTypes],
    actualName: field.actualName,
    actualType: field.actualType,
    status: field.status,
    optional: field.optional,
    options: [...field.options],
  }
}

function isKnownField(field: FieldSchema): boolean {
  return field.status === 'exact' || field.status === 'fallback'
}

function applySelectLike(properties: AnyMap, field: FieldSchema, value: string | null | undefined): void {
  if (!isKnownField(field)) return
  const normalized = normalizeText(value ?? '')

  if (field.actualType === 'status') {
    properties[field.actualName] = normalized ? { status: { name: normalized } } : { status: null }
    return
  }

  if (field.actualType === 'select') {
    properties[field.actualName] = normalized ? { select: { name: normalized } } : { select: null }
    return
  }

  if (field.actualType === 'rich_text') {
    properties[field.actualName] = normalized ? { rich_text: [{ text: { content: normalized } }] } : { rich_text: [] }
    return
  }

  if (field.actualType === 'title' && normalized) {
    properties[field.actualName] = { title: [{ text: { content: normalized } }] }
  }
}

function applyStringArray(properties: AnyMap, field: FieldSchema, values: string[] | null | undefined): void {
  if (!isKnownField(field)) return
  const normalized = (values ?? []).map((entry) => normalizeText(entry)).filter(Boolean)

  if (field.actualType === 'multi_select') {
    properties[field.actualName] = { multi_select: normalized.map((name) => ({ name })) }
    return
  }

  if (field.actualType === 'people') {
    const uuidLike = normalized.filter((entry) => /^[0-9a-fA-F-]{32,36}$/.test(entry))
    properties[field.actualName] = { people: uuidLike.map((id) => ({ id })) }
    return
  }

  if (field.actualType === 'select') {
    properties[field.actualName] = normalized[0] ? { select: { name: normalized[0] } } : { select: null }
    return
  }

  if (field.actualType === 'rich_text') {
    properties[field.actualName] =
      normalized.length > 0 ? { rich_text: [{ text: { content: normalized.join(', ') } }] } : { rich_text: [] }
    return
  }

  if (field.actualType === 'title') {
    properties[field.actualName] =
      normalized.length > 0 ? { title: [{ text: { content: normalized.join(', ') } }] } : { title: [] }
  }
}

function applyDate(properties: AnyMap, field: FieldSchema, value: string | null | undefined): void {
  if (!isKnownField(field)) return
  if (field.actualType !== 'date') return
  const normalized = normalizeText(value ?? '')
  properties[field.actualName] = normalized ? { date: { start: normalized } } : { date: null }
}

function applyRichText(properties: AnyMap, field: FieldSchema, value: string | null | undefined): void {
  if (!isKnownField(field)) return
  const normalized = normalizeText(value ?? '')

  if (field.actualType === 'rich_text') {
    properties[field.actualName] = normalized ? { rich_text: [{ text: { content: normalized } }] } : { rich_text: [] }
    return
  }

  if (field.actualType === 'title' && normalized) {
    properties[field.actualName] = { title: [{ text: { content: normalized } }] }
    return
  }

  if (field.actualType === 'select') {
    properties[field.actualName] = normalized ? { select: { name: normalized } } : { select: null }
  }
}

function applyCheckbox(properties: AnyMap, field: FieldSchema, value: boolean | null | undefined): void {
  if (!isKnownField(field)) return
  if (field.actualType !== 'checkbox') return
  if (value === null || value === undefined) return
  properties[field.actualName] = { checkbox: Boolean(value) }
}

function createFallbackField(
  key: string,
  expectedName: string,
  expectedTypes: string[],
  optional = false,
): FieldSchema {
  return {
    key,
    expectedName,
    expectedTypes,
    actualName: '[UNKNOWN]',
    actualType: '[UNKNOWN]',
    status: 'missing',
    optional,
    options: [],
  }
}

function pickField(
  key: string,
  properties: Record<string, any>,
  expectedName: string,
  expectedTypes: string[],
  optional = false,
  fallback?: (entries: Array<[string, any]>) => [string, any] | undefined,
): FieldSchema {
  const entries = Object.entries(properties)
  const exact = properties[expectedName]

  if (exact) {
    const status: FieldStatus = expectedTypes.includes(exact.type) ? 'exact' : 'mismatch'
    return {
      key,
      expectedName,
      expectedTypes,
      actualName: expectedName,
      actualType: exact.type ?? '[UNKNOWN]',
      status,
      optional,
      options: pickOptions(exact),
    }
  }

  const fallbackEntry = fallback?.(entries)
  if (fallbackEntry) {
    const [name, prop] = fallbackEntry
    const status: FieldStatus = expectedTypes.includes(prop.type) ? 'fallback' : 'mismatch'
    return {
      key,
      expectedName,
      expectedTypes,
      actualName: name,
      actualType: prop.type ?? '[UNKNOWN]',
      status,
      optional,
      options: pickOptions(prop),
    }
  }

  return createFallbackField(key, expectedName, expectedTypes, optional)
}

function findFirstByTypes(entries: Array<[string, any]>, types: string[]): [string, any] | undefined {
  return entries.find(([, prop]) => types.includes(prop?.type))
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export class NotionWorkService {
  private client = new Client({ auth: config.notionToken })

  private schemaCache?: {
    task: TaskSchema
    updatedAt: number
  }

  private readonly schemaTtlMs = 5 * 60 * 1000

  private readonly pageSizeMin = 1

  private readonly pageSizeMax = 100

  private async queryAll(databaseId: string): Promise<any[]> {
    const pages: any[] = []
    let cursor: string | undefined

    while (true) {
      const result: any = await this.client.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      })

      pages.push(...(result.results ?? []))

      if (!result.has_more || !result.next_cursor) {
        break
      }

      cursor = result.next_cursor
    }

    return pages
  }

  private buildTaskSchema(properties: Record<string, any>): TaskSchema {
    const relationFallback = (entries: Array<[string, any]>) => {
      const byTargetDb = entries.find(
        ([, prop]) => prop?.type === 'relation' && normalizeNotionId(prop?.relation?.database_id) === normalizeNotionId(config.projectDbId),
      )
      if (byTargetDb) return byTargetDb

      return entries.find(
        ([name, prop]) =>
          prop?.type === 'relation' && (name.includes('귀속 프로젝트') || (name.includes('귀속') && name.includes('프로젝트'))),
      )
    }

    const projectSelectFallback = (entries: Array<[string, any]>) => {
      const byName = entries.find(([name, prop]) => name.includes('프로젝트') && ['select', 'multi_select', 'rich_text'].includes(prop?.type))
      if (byName) return byName
      return findFirstByTypes(entries, ['select', 'multi_select'])
    }

    const statusFallback = (entries: Array<[string, any]>) => {
      const byName = entries.find(([name, prop]) => name.includes('상태') && ['status', 'select'].includes(prop?.type))
      if (byName) return byName
      return findFirstByTypes(entries, ['status', 'select'])
    }

    const assigneeFallback = (entries: Array<[string, any]>) => {
      const byName = entries.find(([name, prop]) => name.includes('담당') && ['people', 'multi_select', 'rich_text', 'select', 'title'].includes(prop?.type))
      if (byName) return byName
      return findFirstByTypes(entries, ['people', 'multi_select', 'select'])
    }

    const requesterFallback = (entries: Array<[string, any]>) => {
      const byName = entries.find(([name, prop]) => name.includes('요청') && ['people', 'multi_select', 'rich_text', 'select'].includes(prop?.type))
      if (byName) return byName
      return findFirstByTypes(entries, ['people', 'multi_select', 'select'])
    }

    return {
      fields: {
        projectRelation: pickField('projectRelation', properties, '귀속 프로젝트', ['relation'], false, relationFallback),
        projectSelect: pickField('projectSelect', properties, '프로젝트', ['select', 'multi_select', 'rich_text'], true, projectSelectFallback),
        taskName: pickField('taskName', properties, '업무', ['title', 'rich_text'], false, (entries) => findFirstByTypes(entries, ['title'])),
        workType: pickField('workType', properties, '업무구분', ['select', 'multi_select', 'rich_text', 'title'], false, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('구분') && ['select', 'multi_select', 'rich_text', 'title'].includes(prop?.type))
          if (byName) return byName
          return findFirstByTypes(entries, ['select', 'multi_select', 'rich_text'])
        }),
        status: pickField('status', properties, '상태', ['status', 'select', 'rich_text'], false, statusFallback),
        assignee: pickField('assignee', properties, '담당자', ['people', 'multi_select', 'select', 'rich_text', 'title'], false, assigneeFallback),
        startDate: pickField('startDate', properties, '시작일', ['date'], false, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('시작') && prop?.type === 'date')
          if (byName) return byName
          return findFirstByTypes(entries, ['date'])
        }),
        dueDate: pickField('dueDate', properties, '마감일', ['date'], false, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('마감') && prop?.type === 'date')
          if (byName) return byName
          return findFirstByTypes(entries, ['date'])
        }),
        detail: pickField('detail', properties, '업무상세', ['rich_text', 'title'], false, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('상세') && ['rich_text', 'title'].includes(prop?.type))
          if (byName) return byName
          return findFirstByTypes(entries, ['rich_text'])
        }),
        requester: pickField('requester', properties, '요청주체', ['people', 'multi_select', 'select', 'rich_text'], true, requesterFallback),
        priority: pickField('priority', properties, '우선순위', ['select', 'status', 'rich_text'], true, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('우선') && ['select', 'status', 'rich_text'].includes(prop?.type))
          if (byName) return byName
          return findFirstByTypes(entries, ['select'])
        }),
        urgent: pickField('urgent', properties, '긴급', ['checkbox', 'select', 'status'], true, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('긴급') && ['checkbox', 'select', 'status'].includes(prop?.type))
          if (byName) return byName
          return findFirstByTypes(entries, ['checkbox'])
        }),
        issue: pickField('issue', properties, '이슈', ['rich_text', 'title', 'select'], true, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('이슈') && ['rich_text', 'title', 'select'].includes(prop?.type))
          if (byName) return byName
          return findFirstByTypes(entries, ['rich_text'])
        }),
      },
    }
  }

  private async getTaskSchema(force = false): Promise<TaskSchema> {
    const now = Date.now()
    if (!force && this.schemaCache && now - this.schemaCache.updatedAt < this.schemaTtlMs) {
      return this.schemaCache.task
    }

    const taskDb: any = await this.client.databases.retrieve({ database_id: config.taskDbId })
    const properties = (taskDb.properties ?? {}) as Record<string, any>
    const schema = this.buildTaskSchema(properties)

    this.schemaCache = {
      task: schema,
      updatedAt: now,
    }

    return schema
  }

  getApiSchemaSummary(schema: TaskSchema): ApiSchemaSummary {
    const fields = Object.fromEntries(
      Object.entries(schema.fields).map(([key, field]) => [key, fieldToApi(field)]),
    ) as Record<string, ApiSchemaField>

    const unknownFields = Object.values(fields).filter((field) => field.status === 'missing' || field.status === 'mismatch')

    const projectBindingMode: 'relation' | 'select' | 'unknown' = isKnownField(schema.fields.projectRelation) ? 'relation' : 'unknown'

    return {
      fields,
      unknownFields,
      projectBindingMode,
    }
  }

  private mapTaskPage(page: any, schema: TaskSchema, projectNameMap: Record<string, string>): TaskRecord {
    const props = (page.properties ?? {}) as AnyMap

    const relationIds = extractRelationIds(props, schema.fields.projectRelation)
    const relationProjectId = first(relationIds)

    const projectNameFromRelation = relationProjectId
      ? projectNameMap[normalizeNotionId(relationProjectId)] ?? projectNameMap[relationProjectId] ?? relationProjectId
      : undefined
    const projectName = projectNameFromRelation || '[UNKNOWN]'

    const projectSource: 'relation' | 'unknown' = projectNameFromRelation ? 'relation' : 'unknown'

    const projectKey = relationProjectId ?? '[UNKNOWN]'

    const taskName = extractTitle(props, schema.fields.taskName)
    const workType = extractTextLike(props, schema.fields.workType, '[UNKNOWN]') || '[UNKNOWN]'
    const status = extractTextLike(props, schema.fields.status, '[UNKNOWN]') || '[UNKNOWN]'
    const assignee = unique(extractStringArray(props, schema.fields.assignee))
    const requester = unique(extractStringArray(props, schema.fields.requester))
    const detail = extractTextLike(props, schema.fields.detail, '')
    const priority = extractTextLike(props, schema.fields.priority, '') || undefined
    const issue = extractTextLike(props, schema.fields.issue, '') || undefined

    return {
      id: page.id,
      url: page.url,
      projectKey,
      projectName,
      projectSource,
      requester,
      workType,
      taskName,
      status,
      assignee,
      startDate: extractDate(props, schema.fields.startDate),
      dueDate: extractDate(props, schema.fields.dueDate),
      detail,
      priority,
      urgent: extractCheckbox(props, schema.fields.urgent),
      issue,
    }
  }

  async listProjects(): Promise<ListProjectsResult> {
    const [schema, projectPages] = await Promise.all([this.getTaskSchema(), this.queryAll(config.projectDbId)])

    const projectsFromDb: ProjectRecord[] = projectPages.map((page) => {
      const props = (page.properties ?? {}) as AnyMap
      const titleProp = props['프로젝트명']
      const eventDateProp = props['행사 진행일']
      const name =
        titleProp?.type === 'title'
          ? joinRichText(titleProp.title ?? []) || '(이름 없음 프로젝트)'
          : parseDbTitle(page) || '(이름 없음 프로젝트)'
      const eventDate = eventDateProp?.type === 'date' ? eventDateProp.date?.start ?? undefined : undefined

      return {
        id: page.id,
        key: page.id,
        bindingValue: page.id,
        name,
        eventDate,
        source: 'project_db',
      }
    })

    return {
      projects: projectsFromDb.sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      schema,
    }
  }

  async listTasks(query: TaskQuery): Promise<ListTasksResult> {
    const schema = await this.getTaskSchema()
    const projects = await this.listProjects()
    const projectNameMap: Record<string, string> = {}

    for (const project of projects.projects) {
      if (project.source === 'project_db') {
        projectNameMap[project.id] = project.name
        projectNameMap[normalizeNotionId(project.id)] = project.name
      }
    }

    const filters: any[] = []

    if (query.projectId) {
      if (isKnownField(schema.fields.projectRelation) && schema.fields.projectRelation.actualType === 'relation') {
        filters.push({
          property: schema.fields.projectRelation.actualName,
          relation: { contains: query.projectId },
        })
      }
    }

    if (query.status && isKnownField(schema.fields.status)) {
      if (schema.fields.status.actualType === 'status') {
        filters.push({
          property: schema.fields.status.actualName,
          status: { equals: query.status },
        })
      } else if (schema.fields.status.actualType === 'select') {
        filters.push({
          property: schema.fields.status.actualName,
          select: { equals: query.status },
        })
      } else if (schema.fields.status.actualType === 'rich_text') {
        filters.push({
          property: schema.fields.status.actualName,
          rich_text: { contains: query.status },
        })
      }
    }

    if (query.q) {
      const qFilters: any[] = []
      if (isKnownField(schema.fields.taskName)) {
        if (schema.fields.taskName.actualType === 'title') {
          qFilters.push({ property: schema.fields.taskName.actualName, title: { contains: query.q } })
        } else if (schema.fields.taskName.actualType === 'rich_text') {
          qFilters.push({ property: schema.fields.taskName.actualName, rich_text: { contains: query.q } })
        }
      }

      if (isKnownField(schema.fields.detail)) {
        if (schema.fields.detail.actualType === 'rich_text') {
          qFilters.push({ property: schema.fields.detail.actualName, rich_text: { contains: query.q } })
        } else if (schema.fields.detail.actualType === 'title') {
          qFilters.push({ property: schema.fields.detail.actualName, title: { contains: query.q } })
        }
      }

      if (qFilters.length > 0) {
        filters.push({ or: qFilters })
      }
    }

    const filter = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { and: filters }

    const pageSize = Math.max(this.pageSizeMin, Math.min(this.pageSizeMax, query.pageSize))

    const result: any = await this.client.databases.query({
      database_id: config.taskDbId,
      start_cursor: query.cursor,
      page_size: pageSize,
      filter,
    })

    const tasks = (result.results ?? []).map((page: any) => this.mapTaskPage(page, schema, projectNameMap))

    return {
      tasks,
      nextCursor: result.next_cursor ?? undefined,
      hasMore: Boolean(result.has_more),
      schema,
    }
  }

  async getTask(id: string): Promise<{ task: TaskRecord; schema: TaskSchema }> {
    const schema = await this.getTaskSchema()
    const projects = await this.listProjects()
    const projectNameMap: Record<string, string> = {}

    for (const project of projects.projects) {
      if (project.source === 'project_db') {
        projectNameMap[project.id] = project.name
        projectNameMap[normalizeNotionId(project.id)] = project.name
      }
    }

    const page: any = await this.client.pages.retrieve({ page_id: id })
    return {
      task: this.mapTaskPage(page, schema, projectNameMap),
      schema,
    }
  }

  async createTask(input: CreateTaskInput): Promise<{ task: TaskRecord; schema: TaskSchema }> {
    const schema = await this.getTaskSchema()
    const properties: AnyMap = {}

    if (!isKnownField(schema.fields.taskName)) {
      throw new Error('task_name_property_[UNKNOWN]')
    }

    const title = normalizeText(input.taskName)
    if (!title) {
      throw new Error('task_name_required')
    }

    if (schema.fields.taskName.actualType === 'title') {
      properties[schema.fields.taskName.actualName] = { title: [{ text: { content: title } }] }
    } else if (schema.fields.taskName.actualType === 'rich_text') {
      properties[schema.fields.taskName.actualName] = { rich_text: [{ text: { content: title } }] }
    } else {
      throw new Error('task_name_type_[UNKNOWN]')
    }

    const useRelation = isKnownField(schema.fields.projectRelation) && schema.fields.projectRelation.actualType === 'relation'
    if (useRelation && input.projectId) {
      properties[schema.fields.projectRelation.actualName] = { relation: [{ id: input.projectId }] }
    } else if (input.projectId) {
      throw new Error('project_relation_property_[UNKNOWN]')
    }

    applySelectLike(properties, schema.fields.workType, input.workType)
    applySelectLike(properties, schema.fields.status, input.status)
    applyStringArray(properties, schema.fields.assignee, input.assignee)
    applyStringArray(properties, schema.fields.requester, input.requester)
    applyDate(properties, schema.fields.startDate, input.startDate)
    applyDate(properties, schema.fields.dueDate, input.dueDate)
    applyRichText(properties, schema.fields.detail, input.detail)
    applySelectLike(properties, schema.fields.priority, input.priority)
    applyCheckbox(properties, schema.fields.urgent, input.urgent)
    applyRichText(properties, schema.fields.issue, input.issue)

    const created: any = await this.client.pages.create({
      parent: { database_id: config.taskDbId },
      properties,
    })

    return this.getTask(created.id)
  }

  async updateTask(id: string, patch: UpdateTaskInput): Promise<{ task: TaskRecord; schema: TaskSchema }> {
    const schema = await this.getTaskSchema()
    const properties: AnyMap = {}

    if (hasOwn(patch as Record<string, unknown>, 'taskName')) {
      const value = normalizeText(patch.taskName ?? '')
      if (value) {
        if (isKnownField(schema.fields.taskName) && schema.fields.taskName.actualType === 'title') {
          properties[schema.fields.taskName.actualName] = { title: [{ text: { content: value } }] }
        } else if (isKnownField(schema.fields.taskName) && schema.fields.taskName.actualType === 'rich_text') {
          properties[schema.fields.taskName.actualName] = { rich_text: [{ text: { content: value } }] }
        }
      }
    }

    if (hasOwn(patch as Record<string, unknown>, 'projectId') || hasOwn(patch as Record<string, unknown>, 'projectName')) {
      const useRelation = isKnownField(schema.fields.projectRelation) && schema.fields.projectRelation.actualType === 'relation'
      if (useRelation) {
        const value = normalizeText((patch.projectId ?? '') as string)
        properties[schema.fields.projectRelation.actualName] = value ? { relation: [{ id: value }] } : { relation: [] }
      } else if (patch.projectId || patch.projectName) {
        throw new Error('project_relation_property_[UNKNOWN]')
      }
    }

    if (hasOwn(patch as Record<string, unknown>, 'workType')) {
      applySelectLike(properties, schema.fields.workType, patch.workType)
    }

    if (hasOwn(patch as Record<string, unknown>, 'status')) {
      applySelectLike(properties, schema.fields.status, patch.status)
    }

    if (hasOwn(patch as Record<string, unknown>, 'assignee')) {
      applyStringArray(properties, schema.fields.assignee, patch.assignee)
    }

    if (hasOwn(patch as Record<string, unknown>, 'requester')) {
      applyStringArray(properties, schema.fields.requester, patch.requester)
    }

    if (hasOwn(patch as Record<string, unknown>, 'startDate')) {
      applyDate(properties, schema.fields.startDate, patch.startDate)
    }

    if (hasOwn(patch as Record<string, unknown>, 'dueDate')) {
      applyDate(properties, schema.fields.dueDate, patch.dueDate)
    }

    if (hasOwn(patch as Record<string, unknown>, 'detail')) {
      applyRichText(properties, schema.fields.detail, patch.detail)
    }

    if (hasOwn(patch as Record<string, unknown>, 'priority')) {
      applySelectLike(properties, schema.fields.priority, patch.priority)
    }

    if (hasOwn(patch as Record<string, unknown>, 'urgent')) {
      applyCheckbox(properties, schema.fields.urgent, patch.urgent)
    }

    if (hasOwn(patch as Record<string, unknown>, 'issue')) {
      applyRichText(properties, schema.fields.issue, patch.issue)
    }

    await this.client.pages.update({ page_id: id, properties })
    return this.getTask(id)
  }
}
