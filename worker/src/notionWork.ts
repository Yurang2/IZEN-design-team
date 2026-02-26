import { NotionApi } from './notionApi'
import type {
  ApiSchemaField,
  ApiSchemaSummary,
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  ChecklistPreviewItem,
  CreateTaskInput,
  Env,
  FieldSchema,
  FieldStatus,
  ProjectRecord,
  TaskRecord,
  TaskSchema,
  TaskSnapshot,
  UpdateTaskInput,
} from './types'

type AnyMap = Record<string, any>

type SchemaCache = {
  schema: TaskSchema
  updatedAt: number
}

type ProjectSchemaSyncResult = {
  created: string[]
  existing: string[]
}

type ChecklistAssignmentSchema = {
  fields: {
    key: FieldSchema
    project: FieldSchema
    checklistItem: FieldSchema
    task: FieldSchema
    applicable: FieldSchema
    assignmentStatus: FieldSchema
  }
}

const SCHEMA_TTL_MS = 5 * 60 * 1000
let schemaCache: SchemaCache | undefined
const PROJECT_DB_SCHEMA_TTL_MS = 10 * 60 * 1000
let projectDbSchemaCheckedAt = 0
let projectDbSchemaPromise: Promise<ProjectSchemaSyncResult> | null = null
let projectDbSchemaLastResult: ProjectSchemaSyncResult | null = null
const CHECKLIST_ASSIGNMENT_SCHEMA_TTL_MS = 10 * 60 * 1000
let checklistAssignmentSchemaCheckedAt = 0
let checklistAssignmentSchemaPromise: Promise<void> | null = null

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

function parseCategoryText(value: string): string[] {
  return value
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalizeFieldName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function isLikelyImageUrl(value: string): boolean {
  return /(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)(\?|$)/i.test(value)
}

function extractFileUrl(file: any): string | undefined {
  if (!file || typeof file !== 'object') return undefined
  if (file.type === 'external') return normalizeText(file.external?.url) || undefined
  if (file.type === 'file') return normalizeText(file.file?.url) || undefined
  return undefined
}

function extractImageFromFilesProperty(prop: any): string | undefined {
  if (!prop || typeof prop !== 'object' || prop.type !== 'files') return undefined
  const files = Array.isArray(prop.files) ? prop.files : []
  for (const file of files) {
    const url = extractFileUrl(file)
    if (!url) continue
    if (isLikelyImageUrl(url)) return url
  }
  for (const file of files) {
    const url = extractFileUrl(file)
    if (url) return url
  }
  return undefined
}

function pickProjectCoverFromProperties(props: AnyMap): string | undefined {
  const preferredKeywords = ['대표', '썸네일', '이미지', '사진', 'photo', 'image', 'cover', 'thumbnail']
  const entries = Object.entries(props)
  for (const [name, prop] of entries) {
    const normalizedName = normalizeFieldName(name)
    if (!preferredKeywords.some((keyword) => normalizedName.includes(normalizeFieldName(keyword)))) continue
    const found = extractImageFromFilesProperty(prop)
    if (found) return found
  }

  for (const [, prop] of entries) {
    const found = extractImageFromFilesProperty(prop)
    if (found) return found
  }
  return undefined
}

function pickPropertyByNames(props: AnyMap, names: string[]): any | undefined {
  for (const name of names) {
    if (props[name]) return props[name]
  }

  const byNormalized = new Map<string, any>()
  for (const [name, prop] of Object.entries(props)) {
    byNormalized.set(normalizeFieldName(name), prop)
  }
  for (const name of names) {
    const hit = byNormalized.get(normalizeFieldName(name))
    if (hit) return hit
  }
  return undefined
}

function extractNumberFromProperty(prop: any): number | undefined {
  if (!prop || typeof prop !== 'object') return undefined

  if (prop.type === 'number') {
    return Number.isFinite(prop.number) ? Number(prop.number) : undefined
  }

  if (prop.type === 'formula') {
    const formula = prop.formula
    if (formula?.type === 'number' && Number.isFinite(formula.number)) {
      return Number(formula.number)
    }
    if (formula?.type === 'string' && typeof formula.string === 'string') {
      const parsed = Number(formula.string.trim())
      return Number.isFinite(parsed) ? parsed : undefined
    }
  }

  return undefined
}

function extractTextFromProperty(prop: any): string | undefined {
  if (!prop || typeof prop !== 'object') return undefined
  if (prop.type === 'rich_text') return normalizeText(joinRichText(prop.rich_text ?? [])) || undefined
  if (prop.type === 'select') return normalizeText(prop.select?.name) || undefined
  if (prop.type === 'multi_select') {
    const firstValue = normalizeText((prop.multi_select ?? [])[0]?.name)
    return firstValue || undefined
  }
  if (prop.type === 'status') return normalizeText(prop.status?.name) || undefined
  if (prop.type === 'title') return normalizeText(joinRichText(prop.title ?? [])) || undefined
  if (prop.type === 'formula' && prop.formula?.type === 'string') return normalizeText(prop.formula.string) || undefined
  return undefined
}

function normalizeCompactText(value: string | undefined): string {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase()
}

function parseOperationMode(value: string | undefined): 'self' | 'dealer' | undefined {
  const normalized = normalizeCompactText(value)
  if (!normalized) return undefined
  if (normalized.includes('딜러') || normalized === 'dealer') return 'dealer'
  if (normalized.includes('자체') || normalized.includes('직영') || normalized === 'self') return 'self'
  return undefined
}

function parseFulfillmentMode(value: string | undefined): 'domestic' | 'overseas' | 'dealer' | undefined {
  const normalized = normalizeCompactText(value)
  if (!normalized) return undefined
  if (normalized.includes('딜러') || normalized === 'dealer') return 'dealer'
  if (normalized.includes('해외') || normalized.includes('국외') || normalized === 'overseas') return 'overseas'
  if (normalized.includes('국내') || normalized === 'domestic') return 'domestic'
  return undefined
}

function extractSelectOrStatusColor(prop: any): string | undefined {
  if (!prop || typeof prop !== 'object') return undefined
  const color =
    prop.type === 'status'
      ? normalizeText(prop.status?.color)
      : prop.type === 'select'
        ? normalizeText(prop.select?.color)
        : ''
  return color || undefined
}

function toIsoDateOnly(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)
  if (!normalized) return undefined
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : undefined
}

function extractBooleanFromProperty(prop: any): boolean | undefined {
  if (!prop || typeof prop !== 'object') return undefined
  if (prop.type === 'checkbox') return Boolean(prop.checkbox)
  if (prop.type === 'formula') {
    if (prop.formula?.type === 'boolean') return Boolean(prop.formula.boolean)
    if (prop.formula?.type === 'string') {
      const normalized = normalizeText(prop.formula.string).toLowerCase()
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
      if (normalized === 'false' || normalized === '0' || normalized === 'no') return false
    }
  }
  return undefined
}

function normalizeChecklistStatusText(value: string | undefined): string {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase()
}

function checklistStatusFromValues(
  assignmentStatusText: string | undefined,
  applicable: boolean | undefined,
  taskPageId: string | null,
): ChecklistAssignmentStatus {
  const normalized = normalizeChecklistStatusText(assignmentStatusText)
  if (normalized.includes('해당없음')) return 'not_applicable'
  if (applicable === false) return 'not_applicable'
  if (taskPageId) return 'assigned'
  if (normalized.includes('unassigned') || normalized.includes('미할당')) return 'unassigned'
  if (normalized.includes('assigned') || normalized.includes('할당')) return 'assigned'
  return 'unassigned'
}

function toChecklistStatusText(status: ChecklistAssignmentStatus): string {
  if (status === 'not_applicable') return '해당없음'
  if (status === 'assigned') return '할당됨'
  return '미할당'
}

function valuesInclude(targets: string[], value: string | undefined): boolean {
  const normalizedValue = normalizeFieldName(value ?? '')
  if (!normalizedValue) return false
  return targets.some((entry) => normalizeFieldName(entry) === normalizedValue)
}

function parseDueBasis(value: string | undefined): 'event_start' | 'event_end' | 'shipping' | undefined {
  const normalized = normalizeText(value).replace(/\s+/g, '').toLowerCase()
  if (!normalized) return undefined
  if (['행사시작일', '시작일', 'eventstart', 'event_start', 'start'].includes(normalized)) return 'event_start'
  if (['행사종료일', '종료일', 'eventend', 'event_end', 'end'].includes(normalized)) return 'event_end'
  if (['배송마감일', '배송마감', '배송일', '배송', 'shipping', 'ship'].includes(normalized)) return 'shipping'
  return undefined
}

function extractCategoryValuesFromProp(prop: any): string[] {
  if (!prop || typeof prop !== 'object') return []

  if (prop.type === 'multi_select') {
    return (prop.multi_select ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
  }

  if (prop.type === 'select') {
    return prop.select?.name ? [normalizeText(prop.select.name)] : []
  }

  if (prop.type === 'status') {
    return prop.status?.name ? [normalizeText(prop.status.name)] : []
  }

  if (prop.type === 'rich_text') {
    return parseCategoryText(joinRichText(prop.rich_text ?? []))
  }

  if (prop.type === 'title') {
    return parseCategoryText(joinRichText(prop.title ?? []))
  }

  if (prop.type === 'formula' && prop.formula?.type === 'string') {
    return parseCategoryText(prop.formula.string ?? '')
  }

  if (prop.type === 'rollup') {
    if (prop.rollup?.type === 'array') {
      return unique((prop.rollup.array ?? []).flatMap((entry: any) => extractCategoryValuesFromProp(entry)))
    }
    if (prop.rollup?.type === 'string') {
      return parseCategoryText(prop.rollup.string ?? '')
    }
  }

  return []
}

function extractCategoryValues(props: AnyMap, ...names: string[]): string[] {
  const prop = pickPropertyByNames(props, names)
  return unique(extractCategoryValuesFromProp(prop))
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

function applyTitleLike(properties: AnyMap, field: FieldSchema, value: string): void {
  if (!isKnownField(field)) return
  const normalized = normalizeText(value)
  if (field.actualType === 'title') {
    properties[field.actualName] = normalized ? { title: [{ text: { content: normalized } }] } : { title: [] }
    return
  }
  if (field.actualType === 'rich_text') {
    properties[field.actualName] = normalized ? { rich_text: [{ text: { content: normalized } }] } : { rich_text: [] }
  }
}

function applyRelationIds(properties: AnyMap, field: FieldSchema, ids: string[]): void {
  if (!isKnownField(field)) return
  if (field.actualType !== 'relation') return
  const relation = ids.map((id) => normalizeText(id)).filter(Boolean).map((id) => ({ id }))
  properties[field.actualName] = { relation }
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

function findFirstByTypes(entries: Array<[string, any]>, types: string[]): [string, any] | undefined {
  return entries.find(([, prop]) => types.includes(prop?.type))
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

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function isActiveNotionPage(page: any): boolean {
  if (!page || page.object !== 'page') return false
  if (page.archived === true) return false
  if (page.in_trash === true) return false
  return true
}

export class NotionWorkService {
  constructor(
    private readonly api: NotionApi,
    private readonly env: Env,
  ) {}

  private async queryAll(databaseId: string): Promise<any[]> {
    const pages: any[] = []
    let cursor: string | undefined

    while (true) {
      const result: any = await this.api.queryDatabase(databaseId, {
        start_cursor: cursor,
        page_size: 100,
      })

      const activeResults = (result.results ?? []).filter((entry: any) => isActiveNotionPage(entry))
      pages.push(...activeResults)

      if (!result.has_more || !result.next_cursor) {
        break
      }

      cursor = result.next_cursor
    }

    return pages
  }

  private async ensureProjectDatabaseProperties(options?: { force?: boolean }): Promise<ProjectSchemaSyncResult> {
    const force = options?.force === true
    const now = Date.now()
    if (!force && projectDbSchemaCheckedAt > 0 && now - projectDbSchemaCheckedAt < PROJECT_DB_SCHEMA_TTL_MS && projectDbSchemaLastResult) {
      return projectDbSchemaLastResult
    }

    if (projectDbSchemaPromise) {
      return projectDbSchemaPromise
    }

    projectDbSchemaPromise = (async () => {
      const db: any = await this.api.retrieveDatabase(this.env.NOTION_PROJECT_DB_ID)
      const properties = (db.properties ?? {}) as AnyMap
      const updates: AnyMap = {}
      const created: string[] = []
      const existing: string[] = []

      const ensurePropertyExact = (name: string, definition: AnyMap) => {
        if (hasOwn(properties, name)) {
          existing.push(name)
          return
        }
        updates[name] = definition
        created.push(name)
      }

      // Keep exact names stable because checklist UI reads these property names directly.
      ensurePropertyExact('행사분류', { select: {} })
      ensurePropertyExact('배송마감일', { date: {} })
      ensurePropertyExact('운영방식', { select: {} })
      ensurePropertyExact('배송방식', { select: {} })

      if (Object.keys(updates).length > 0) {
        await this.api.updateDatabase(this.env.NOTION_PROJECT_DB_ID, { properties: updates })
      }

      const result: ProjectSchemaSyncResult = { created, existing }
      projectDbSchemaCheckedAt = Date.now()
      projectDbSchemaLastResult = result
      return result
    })()

    try {
      return await projectDbSchemaPromise
    } finally {
      projectDbSchemaPromise = null
    }
  }

  async syncProjectDatabaseProperties(force = true): Promise<ProjectSchemaSyncResult> {
    return this.ensureProjectDatabaseProperties({ force })
  }

  private buildTaskSchema(properties: Record<string, any>): TaskSchema {
    const relationFallback = (entries: Array<[string, any]>) => {
      const byTargetDb = entries.find(
        ([, prop]) => prop?.type === 'relation' && normalizeNotionId(prop?.relation?.database_id) === normalizeNotionId(this.env.NOTION_PROJECT_DB_ID),
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
        actualEndDate: pickField('actualEndDate', properties, '실제 종료일', ['date'], true, (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              prop?.type === 'date' &&
              (name.includes('실제 종료') || name.includes('실제종료') || name.includes('실제 완료') || name.includes('실제완료') || name.includes('완료일')),
          )
          if (byName) return byName
          return entries.find(([name, prop]) => prop?.type === 'date' && name.includes('종료'))
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

  async getTaskSchema(force = false): Promise<TaskSchema> {
    const now = Date.now()
    if (!force && schemaCache && now - schemaCache.updatedAt < SCHEMA_TTL_MS) {
      return schemaCache.schema
    }

    const taskDb: any = await this.api.retrieveDatabase(this.env.NOTION_TASK_DB_ID)
    const properties = (taskDb.properties ?? {}) as Record<string, any>
    const schema = this.buildTaskSchema(properties)

    schemaCache = {
      schema,
      updatedAt: now,
    }

    return schema
  }

  getApiSchemaSummary(schema: TaskSchema): ApiSchemaSummary {
    const fields = Object.fromEntries(
      Object.entries(schema.fields).map(([key, field]) => [key, fieldToApi(field)]),
    ) as Record<string, ApiSchemaField>

    const unknownFields = Object.values(fields).filter((field) => field.status === 'missing' || field.status === 'mismatch')

    const projectBindingMode: 'relation' | 'unknown' = isKnownField(schema.fields.projectRelation) ? 'relation' : 'unknown'

    return {
      fields,
      unknownFields,
      projectBindingMode,
    }
  }

  async listProjects(): Promise<ProjectRecord[]> {
    await this.ensureProjectDatabaseProperties()
    const projectPages = await this.queryAll(this.env.NOTION_PROJECT_DB_ID)

    return projectPages
      .map((page) => {
        const props = (page.properties ?? {}) as AnyMap
        const projectTypeProp = pickPropertyByNames(props, [
          '프로젝트 유형',
          '프로젝트유형',
          '프로젝트 타입',
          '유형',
          '행사속성',
          '행사 속성',
          'event type',
          'project type',
        ])
        const projectEventCategoryDetailedProp = pickPropertyByNames(props, [
          '행사분류',
          '행사 분류',
          '행사분류상세',
          '행사 분류 상세',
        ])
        const projectEventCategoryFallbackProp = projectEventCategoryDetailedProp
          ? undefined
          : pickPropertyByNames(props, [
              '행사속성',
              '행사 속성',
              '행사속성(상세)',
              '행사 속성(상세)',
              '행사구분',
              '행사 구분',
              'event category',
            ])
        const titleProp = pickPropertyByNames(props, ['프로젝트명', '프로젝트 이름', '이름', 'name'])
        const eventDateProp = pickPropertyByNames(props, ['행사진행일', '행사 진행일', '진행일', 'event date'])
        const shippingDateProp = pickPropertyByNames(props, ['배송마감일', '배송 마감일', '배송일', '배송 일', '출고일', 'shipping date'])
        const operationModeProp = pickPropertyByNames(props, ['운영방식', '운영 방식', '운영모드', 'operation mode'])
        const fulfillmentModeProp = pickPropertyByNames(props, ['배송방식', '배송 방식', '배송모드', 'fulfillment mode'])

        const name =
          titleProp?.type === 'title'
            ? joinRichText(titleProp.title ?? []) || '(이름 없음 프로젝트)'
            : parseDbTitle(page) || '(이름 없음 프로젝트)'

        const eventDateRaw =
          eventDateProp?.type === 'date' ? eventDateProp.date?.start ?? undefined : extractTextFromProperty(eventDateProp)
        const shippingDateRaw =
          shippingDateProp?.type === 'date' ? shippingDateProp.date?.start ?? undefined : extractTextFromProperty(shippingDateProp)

        const eventDate = toIsoDateOnly(eventDateRaw)
        const shippingDate = toIsoDateOnly(shippingDateRaw)
        const projectType = extractTextFromProperty(projectTypeProp)
        const eventCategory =
          extractTextFromProperty(projectEventCategoryDetailedProp) ??
          extractTextFromProperty(projectEventCategoryFallbackProp)
        const operationMode = parseOperationMode(extractTextFromProperty(operationModeProp))
        const fulfillmentMode = parseFulfillmentMode(extractTextFromProperty(fulfillmentModeProp))
        const icon = page.icon
        const cover = page.cover
        const iconEmoji = icon?.type === 'emoji' ? icon.emoji ?? undefined : undefined
        const iconUrl =
          icon?.type === 'external'
            ? icon.external?.url ?? undefined
            : icon?.type === 'file'
              ? icon.file?.url ?? undefined
              : undefined
        const coverUrl =
          cover?.type === 'external'
            ? cover.external?.url ?? undefined
            : cover?.type === 'file'
              ? cover.file?.url ?? undefined
              : pickProjectCoverFromProperties(props)

        return {
          id: page.id,
          key: page.id,
          bindingValue: page.id,
          name,
          eventDate,
          shippingDate,
          operationMode,
          fulfillmentMode,
          projectType,
          eventCategory,
          iconEmoji,
          iconUrl,
          coverUrl,
          source: 'project_db' as const,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  async listChecklists(): Promise<ChecklistPreviewItem[]> {
    if (!this.env.NOTION_CHECKLIST_DB_ID) return []

    const checklistPages = await this.queryAll(this.env.NOTION_CHECKLIST_DB_ID)

    return checklistPages.map((page) => {
      const props = (page.properties ?? {}) as AnyMap
      const productTitle = props['제작물']
      const productName =
        productTitle?.type === 'title'
          ? joinRichText(productTitle.title ?? []) || '제작물'
          : parseDbTitle(page) || '제작물'

      const workCategoryProp = props['작업 분류']
      const finalDueProp = props['최종 완료 시점']
      const applicableProjectTypesProp = pickPropertyByNames(props, ['적용 프로젝트 유형', '적용유형', '적용 프로젝트타입'])
      const applicableEventCategoriesProp = pickPropertyByNames(props, ['적용 행사분류', '적용 행사 분류', '적용행사분류', '적용 행사구분', '적용행사구분'])
      const designLeadProp = pickPropertyByNames(props, ['디자인 소요 기간', '디자인 소요 기간(일)', '디자인소요기간'])
      const productionLeadProp = pickPropertyByNames(props, ['실물 제작 소요 기간', '실물 제작 소요 기간(일)', '실물제작소요기간'])
      const bufferProp = pickPropertyByNames(props, ['버퍼', '버퍼(일)', '버퍼 기간', '버퍼기간'])
      const totalLeadProp = pickPropertyByNames(props, ['총 소요 기간', '총 소요 기간(일)', '총소요기간'])
      const dueBasisProp = pickPropertyByNames(props, ['최종 완료 기준', '완료 기준', '마감 기준'])
      const defaultOffsetProp = pickPropertyByNames(props, ['기본 오프셋(영업일)', '기본 오프셋', '오프셋(영업일)', '마감 오프셋(영업일)'])
      const dealerOffsetProp = pickPropertyByNames(props, ['딜러 오프셋(영업일)', '딜러 오프셋'])
      const domesticOffsetProp = pickPropertyByNames(props, ['국내 오프셋(영업일)', '국내 오프셋'])
      const overseasOffsetProp = pickPropertyByNames(props, ['해외 오프셋(영업일)', '해외 배송 오프셋(영업일)', '해외 오프셋'])

      const workCategory =
        workCategoryProp?.type === 'rich_text'
          ? joinRichText(workCategoryProp.rich_text ?? [])
          : workCategoryProp?.type === 'select'
            ? workCategoryProp.select?.name ?? ''
            : ''

      const finalDueText =
        finalDueProp?.type === 'rich_text'
          ? joinRichText(finalDueProp.rich_text ?? [])
          : finalDueProp?.type === 'select'
            ? finalDueProp.select?.name ?? ''
            : ''

      const designLeadDays = extractNumberFromProperty(designLeadProp)
      const productionLeadDays = extractNumberFromProperty(productionLeadProp)
      const bufferDays = extractNumberFromProperty(bufferProp)
      const totalLeadFromProp = extractNumberFromProperty(totalLeadProp)
      const dueBasis = parseDueBasis(extractTextFromProperty(dueBasisProp))
      const defaultOffsetBusinessDays = extractNumberFromProperty(defaultOffsetProp)
      const dealerOffsetBusinessDays = extractNumberFromProperty(dealerOffsetProp)
      const domesticOffsetBusinessDays = extractNumberFromProperty(domesticOffsetProp)
      const overseasOffsetBusinessDays = extractNumberFromProperty(overseasOffsetProp)
      const totalLeadDays =
        totalLeadFromProp ??
        (designLeadDays !== undefined || productionLeadDays !== undefined || bufferDays !== undefined
          ? (designLeadDays ?? 0) + (productionLeadDays ?? 0) + (bufferDays ?? 0)
          : undefined)

      const applicableProjectTypes = (() => {
        if (!applicableProjectTypesProp) return []
        if (applicableProjectTypesProp.type === 'multi_select') {
          return (applicableProjectTypesProp.multi_select ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
        }
        if (applicableProjectTypesProp.type === 'select') {
          const value = normalizeText(applicableProjectTypesProp.select?.name)
          return value ? [value] : []
        }
        if (applicableProjectTypesProp.type === 'rich_text') {
          return parseCsvText(joinRichText(applicableProjectTypesProp.rich_text ?? []))
        }
        return []
      })()

      const applicableEventCategories = (() => {
        if (!applicableEventCategoriesProp) return []
        if (applicableEventCategoriesProp.type === 'multi_select') {
          return (applicableEventCategoriesProp.multi_select ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean)
        }
        if (applicableEventCategoriesProp.type === 'select') {
          const value = normalizeText(applicableEventCategoriesProp.select?.name)
          return value ? [value] : []
        }
        if (applicableEventCategoriesProp.type === 'rich_text') {
          return parseCsvText(joinRichText(applicableEventCategoriesProp.rich_text ?? []))
        }
        return []
      })()

      return {
        id: page.id,
        productName,
        workCategory,
        finalDueText,
        eventCategories: extractCategoryValues(props, '행사분류', '행사 분류', '행사구분', '행사 구분'),
        applicableProjectTypes,
        applicableEventCategories,
        designLeadDays,
        productionLeadDays,
        bufferDays,
        totalLeadDays,
        dueBasis,
        defaultOffsetBusinessDays,
        dealerOffsetBusinessDays,
        domesticOffsetBusinessDays,
        overseasOffsetBusinessDays,
      }
    })
  }

  private checklistAssignmentKey(projectPageId: string, checklistItemPageId: string): string {
    return `${normalizeText(projectPageId)}::${normalizeText(checklistItemPageId)}`
  }

  private isChecklistAssignmentExplicitKeyField(field: FieldSchema): boolean {
    if (!isKnownField(field)) return false
    const normalized = normalizeFieldName(field.actualName)
    return normalized === 'key' || normalized.includes('키')
  }

  private resolveChecklistAssignmentTitle(
    schema: ChecklistAssignmentSchema,
    key: string,
    preferredLabel: string | undefined,
  ): string {
    if (!isKnownField(schema.fields.key)) return key
    if (this.isChecklistAssignmentExplicitKeyField(schema.fields.key)) return key
    return normalizeText(preferredLabel) || key
  }

  private getChecklistAssignmentDbId(): string {
    const dbId = normalizeText(this.env.NOTION_CHECKLIST_ASSIGNMENT_DB_ID)
    if (!dbId) throw new Error('checklist_assignment_db_not_configured')
    return dbId
  }

  private async ensureChecklistAssignmentDatabaseProperties(options?: { force?: boolean }): Promise<void> {
    const force = options?.force === true
    const now = Date.now()
    if (!force && checklistAssignmentSchemaCheckedAt > 0 && now - checklistAssignmentSchemaCheckedAt < CHECKLIST_ASSIGNMENT_SCHEMA_TTL_MS) {
      return
    }

    if (checklistAssignmentSchemaPromise) {
      return checklistAssignmentSchemaPromise
    }

    checklistAssignmentSchemaPromise = (async () => {
      const databaseId = this.getChecklistAssignmentDbId()
      const db: any = await this.api.retrieveDatabase(databaseId)
      const properties = (db.properties ?? {}) as AnyMap
      const updates: AnyMap = {}

      if (!hasOwn(properties, '적용여부')) {
        updates['적용여부'] = { checkbox: {} }
      }
      if (!hasOwn(properties, '할당상태')) {
        updates['할당상태'] = { select: {} }
      }

      if (Object.keys(updates).length > 0) {
        await this.api.updateDatabase(databaseId, { properties: updates })
      }

      checklistAssignmentSchemaCheckedAt = Date.now()
    })().finally(() => {
      checklistAssignmentSchemaPromise = null
    })

    return checklistAssignmentSchemaPromise
  }

  private buildChecklistAssignmentSchema(properties: Record<string, any>): ChecklistAssignmentSchema {
    const relationByTargetDbId = (entries: Array<[string, any]>, targetDbId: string | undefined) => {
      const normalizedTarget = normalizeNotionId(targetDbId)
      if (!normalizedTarget) return undefined
      return entries.find(
        ([, prop]) => prop?.type === 'relation' && normalizeNotionId(prop?.relation?.database_id) === normalizedTarget,
      )
    }

    const relationByTaskPriority = (entries: Array<[string, any]>, targetDbId: string | undefined) => {
      const normalizedTarget = normalizeNotionId(targetDbId)
      let best: [string, any] | undefined
      let bestScore = -1

      for (const entry of entries) {
        const [name, prop] = entry
        if (prop?.type !== 'relation') continue

        const normalizedName = normalizeFieldName(name)
        let score = 0

        if (normalizedName === normalizeFieldName('할당 업무') || normalizedName === normalizeFieldName('assignment task')) {
          score += 120
        }
        if (
          (normalizedName.includes('할당') && normalizedName.includes('업무')) ||
          (normalizedName.includes('assignment') && normalizedName.includes('task'))
        ) {
          score += 80
        }
        if (normalizedName.includes('업무') || normalizedName.includes('task')) score += 35
        if (normalizedName.includes('할당') || normalizedName.includes('assignment')) score += 25

        if (normalizedTarget && normalizeNotionId(prop?.relation?.database_id) === normalizedTarget) {
          score += 20
        }

        if (score > bestScore) {
          bestScore = score
          best = entry
        }
      }

      return bestScore > 0 ? best : undefined
    }

    const relationByName = (entries: Array<[string, any]>, keywords: string[]) =>
      entries.find(
        ([name, prop]) =>
          prop?.type === 'relation' &&
          keywords.some((keyword) => normalizeFieldName(name).includes(normalizeFieldName(keyword))),
      )

    return {
      fields: {
        key: pickField('key', properties, '키', ['title', 'rich_text'], false, (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              ['title', 'rich_text'].includes(prop?.type) &&
              (normalizeFieldName(name).includes('키') ||
                normalizeFieldName(name).includes('이름') ||
                normalizeFieldName(name).includes('name')),
          )
          if (byName) return byName
          return findFirstByTypes(entries, ['title', 'rich_text'])
        }),
        project: pickField('project', properties, '프로젝트', ['relation'], false, (entries) => {
          const byTarget = relationByTargetDbId(entries, this.env.NOTION_PROJECT_DB_ID)
          if (byTarget) return byTarget
          const byName = relationByName(entries, ['프로젝트'])
          if (byName) return byName
          return findFirstByTypes(entries, ['relation'])
        }),
        checklistItem: pickField('checklistItem', properties, '체크리스트 항목', ['relation'], false, (entries) => {
          const byTarget = relationByTargetDbId(entries, this.env.NOTION_CHECKLIST_DB_ID)
          if (byTarget) return byTarget
          const byName = relationByName(entries, ['체크리스트', '항목'])
          if (byName) return byName
          return findFirstByTypes(entries, ['relation'])
        }),
        task: pickField('task', properties, '할당 업무', ['relation'], true, (entries) => {
          const byPriority = relationByTaskPriority(entries, this.env.NOTION_TASK_DB_ID)
          if (byPriority) return byPriority
          const byName = relationByName(entries, ['할당', '업무', 'task', 'assignment'])
          if (byName) return byName
          return relationByTargetDbId(entries, this.env.NOTION_TASK_DB_ID)
        }),
        applicable: pickField('applicable', properties, '적용여부', ['checkbox', 'formula'], true, (entries) => {
          // Optional field: only bind when the name clearly indicates applicability.
          const byName = entries.find(
            ([name, prop]) =>
              ['checkbox', 'formula'].includes(prop?.type) &&
              (normalizeFieldName(name).includes('적용여부') ||
                normalizeFieldName(name).includes('해당여부') ||
                (normalizeFieldName(name).includes('적용') && normalizeFieldName(name).includes('여부')) ||
                (normalizeFieldName(name).includes('해당') && normalizeFieldName(name).includes('여부'))),
          )
          return byName
        }),
        assignmentStatus: pickField('assignmentStatus', properties, '할당상태', ['formula', 'rich_text', 'select', 'status'], true, (entries) => {
          // Optional field: avoid falling back to unrelated select/rich_text columns.
          const byName = entries.find(
            ([name, prop]) =>
              ['formula', 'rich_text', 'select', 'status'].includes(prop?.type) &&
              (normalizeFieldName(name).includes('할당상태') ||
                (normalizeFieldName(name).includes('할당') && normalizeFieldName(name).includes('상태')) ||
                (normalizeFieldName(name).includes('assignment') && normalizeFieldName(name).includes('status'))),
          )
          return byName
        }),
      },
    }
  }

  private async getChecklistAssignmentSchema(): Promise<ChecklistAssignmentSchema> {
    await this.ensureChecklistAssignmentDatabaseProperties()
    const databaseId = this.getChecklistAssignmentDbId()
    const db: any = await this.api.retrieveDatabase(databaseId)
    const properties = (db.properties ?? {}) as Record<string, any>
    return this.buildChecklistAssignmentSchema(properties)
  }

  private mapChecklistAssignmentPage(page: any, schema: ChecklistAssignmentSchema): ChecklistAssignmentRow {
    const props = (page.properties ?? {}) as AnyMap
    const projectPageId = first(extractRelationIds(props, schema.fields.project)) ?? ''
    const checklistItemPageId = first(extractRelationIds(props, schema.fields.checklistItem)) ?? ''
    const taskPageId = first(extractRelationIds(props, schema.fields.task)) ?? null
    const keyText = isKnownField(schema.fields.key) ? extractTextLike(props, schema.fields.key, '') : ''
    const assignmentStatusTextRaw = isKnownField(schema.fields.assignmentStatus)
      ? extractTextLike(props, schema.fields.assignmentStatus, '')
      : ''
    const applicableRaw =
      isKnownField(schema.fields.applicable) && schema.fields.applicable.actualName !== '[UNKNOWN]'
        ? extractBooleanFromProperty(props[schema.fields.applicable.actualName])
        : undefined
    const assignmentStatus = checklistStatusFromValues(assignmentStatusTextRaw, applicableRaw, taskPageId)
    const normalizedAssignmentStatusText = normalizeText(assignmentStatusTextRaw)
    const assignmentStatusText =
      normalizedAssignmentStatusText && normalizedAssignmentStatusText !== '[UNKNOWN]'
        ? normalizedAssignmentStatusText
        : toChecklistStatusText(assignmentStatus)
    const normalizedKeyText = normalizeText(keyText)
    const key =
      normalizedKeyText && normalizedKeyText !== '[UNKNOWN]'
        ? normalizedKeyText
        : this.checklistAssignmentKey(projectPageId, checklistItemPageId)

    return {
      id: page.id,
      key,
      projectPageId,
      checklistItemPageId,
      taskPageId,
      applicable: assignmentStatus !== 'not_applicable',
      assignmentStatus,
      assignmentStatusText,
    }
  }

  private async listChecklistAssignmentPagesByProject(
    schema: ChecklistAssignmentSchema,
    projectPageId: string,
  ): Promise<any[]> {
    const databaseId = this.getChecklistAssignmentDbId()
    const projectId = normalizeNotionId(projectPageId)
    const pages = await this.queryAll(databaseId)
    return pages.filter((page) => {
      const props = (page.properties ?? {}) as AnyMap
      const relationIds = extractRelationIds(props, schema.fields.project)
      return relationIds.some((id) => normalizeNotionId(id) === projectId)
    })
  }

  private isChecklistApplicableToProject(item: ChecklistPreviewItem, project: ProjectRecord): boolean {
    const byProjectType =
      item.applicableProjectTypes.length === 0 || valuesInclude(item.applicableProjectTypes, project.projectType)
    const categoryCandidates =
      item.applicableEventCategories.length > 0 ? item.applicableEventCategories : item.eventCategories
    const byEventCategory =
      normalizeText(project.eventCategory) === ''
        ? categoryCandidates.length === 0
        : valuesInclude(categoryCandidates, project.eventCategory)
    return byProjectType && byEventCategory
  }

  async listChecklistAssignments(projectPageId: string): Promise<ChecklistAssignmentRow[]> {
    const schema = await this.getChecklistAssignmentSchema()
    const pages = await this.listChecklistAssignmentPagesByProject(schema, projectPageId)
    return pages
      .map((page) => this.mapChecklistAssignmentPage(page, schema))
      .sort((a, b) => a.key.localeCompare(b.key, 'ko'))
  }

  async ensureChecklistAssignmentsForProject(projectPageId: string): Promise<ChecklistAssignmentRow[]> {
    const [schema, projects, checklists] = await Promise.all([
      this.getChecklistAssignmentSchema(),
      this.listProjects(),
      this.listChecklists(),
    ])

    if (!isKnownField(schema.fields.project) || !isKnownField(schema.fields.checklistItem)) {
      throw new Error('checklist_assignment_schema_invalid')
    }

    const normalizedProjectId = normalizeNotionId(projectPageId)
    const project = projects.find((entry) => normalizeNotionId(entry.id) === normalizedProjectId)
    if (!project) {
      throw new Error('project_not_found')
    }

    const checklistApplicability = checklists.map((item) => ({
      item,
      applicable: this.isChecklistApplicableToProject(item, project),
    }))

    const existingPages = await this.listChecklistAssignmentPagesByProject(schema, project.id)
    const existingRows = existingPages.map((page) => this.mapChecklistAssignmentPage(page, schema))
    const existingChecklistIdSet = new Set(existingRows.map((row) => normalizeNotionId(row.checklistItemPageId)))

    for (const entry of checklistApplicability) {
      const checklistItemId = entry.item.id
      if (existingChecklistIdSet.has(normalizeNotionId(checklistItemId))) continue

      const key = this.checklistAssignmentKey(project.id, checklistItemId)
      const titleValue = this.resolveChecklistAssignmentTitle(
        schema,
        key,
        entry.item.productName || entry.item.workCategory,
      )
      const properties: AnyMap = {}
      applyTitleLike(properties, schema.fields.key, titleValue)
      applyRelationIds(properties, schema.fields.project, [project.id])
      applyRelationIds(properties, schema.fields.checklistItem, [checklistItemId])
      if (isKnownField(schema.fields.task)) {
        applyRelationIds(properties, schema.fields.task, [])
      }
      applyCheckbox(properties, schema.fields.applicable, entry.applicable)
      applySelectLike(properties, schema.fields.assignmentStatus, toChecklistStatusText(entry.applicable ? 'unassigned' : 'not_applicable'))

      await this.api.createPage({
        parent: { database_id: this.getChecklistAssignmentDbId() },
        properties,
      })
    }

    const refreshedPages = await this.listChecklistAssignmentPagesByProject(schema, project.id)
    return refreshedPages
      .map((page) => this.mapChecklistAssignmentPage(page, schema))
      .sort((a, b) => a.key.localeCompare(b.key, 'ko'))
  }

  async upsertChecklistAssignment(params: {
    projectPageId: string
    checklistItemPageId: string
    taskPageId?: string | null
    assignmentStatus?: ChecklistAssignmentStatus
  }): Promise<ChecklistAssignmentRow> {
    const schema = await this.getChecklistAssignmentSchema()
    if (!isKnownField(schema.fields.project) || !isKnownField(schema.fields.checklistItem)) {
      throw new Error('checklist_assignment_schema_invalid')
    }
    if (params.taskPageId && !isKnownField(schema.fields.task)) {
      throw new Error('checklist_assignment_task_relation_missing')
    }

    const projectPageId = normalizeText(params.projectPageId)
    const checklistItemPageId = normalizeText(params.checklistItemPageId)
    const key = this.checklistAssignmentKey(projectPageId, checklistItemPageId)
    const taskPageIdInput = normalizeText(params.taskPageId ?? '') || null
    const assignmentStatus: ChecklistAssignmentStatus = params.assignmentStatus ?? (taskPageIdInput ? 'assigned' : 'unassigned')
    if (assignmentStatus === 'assigned' && !taskPageIdInput) {
      throw new Error('checklist_assignment_status_requires_task')
    }
    const taskPageId = assignmentStatus === 'assigned' ? taskPageIdInput : null
    const shouldUseKeyAsTitle = this.isChecklistAssignmentExplicitKeyField(schema.fields.key)
    let preferredLabel: string | undefined
    if (!shouldUseKeyAsTitle) {
      const checklists = await this.listChecklists()
      preferredLabel = checklists.find((entry) => normalizeNotionId(entry.id) === normalizeNotionId(checklistItemPageId))?.productName
    }

    const pages = await this.listChecklistAssignmentPagesByProject(schema, projectPageId)
    const existingPage = pages.find((page) => {
      const row = this.mapChecklistAssignmentPage(page, schema)
      if (normalizeText(row.key) === key) return true
      return (
        normalizeNotionId(row.projectPageId) === normalizeNotionId(projectPageId) &&
        normalizeNotionId(row.checklistItemPageId) === normalizeNotionId(checklistItemPageId)
      )
    })
    let targetPage = existingPage

    if (!targetPage && isKnownField(schema.fields.key)) {
      const databaseId = this.getChecklistAssignmentDbId()
      const allPages = await this.queryAll(databaseId)
      targetPage = allPages.find((page) => {
        const props = (page.properties ?? {}) as AnyMap
        const keyText = extractTextLike(props, schema.fields.key, '')
        return normalizeText(keyText) === key
      })
    }

    if (targetPage?.id) {
      const properties: AnyMap = {}
      if (shouldUseKeyAsTitle) {
        applyTitleLike(properties, schema.fields.key, key)
      } else if (preferredLabel) {
        applyTitleLike(properties, schema.fields.key, preferredLabel)
      }
      applyRelationIds(properties, schema.fields.project, [projectPageId])
      applyRelationIds(properties, schema.fields.checklistItem, [checklistItemPageId])
      if (isKnownField(schema.fields.task)) {
        applyRelationIds(properties, schema.fields.task, taskPageId ? [taskPageId] : [])
      }
      applyCheckbox(properties, schema.fields.applicable, assignmentStatus !== 'not_applicable')
      applySelectLike(properties, schema.fields.assignmentStatus, toChecklistStatusText(assignmentStatus))
      await this.api.updatePage(targetPage.id, { properties })
      const refreshed = await this.api.retrievePage(targetPage.id)
      return this.mapChecklistAssignmentPage(refreshed, schema)
    }

    const properties: AnyMap = {}
    const titleValue = this.resolveChecklistAssignmentTitle(schema, key, preferredLabel)
    applyTitleLike(properties, schema.fields.key, titleValue)
    applyRelationIds(properties, schema.fields.project, [projectPageId])
    applyRelationIds(properties, schema.fields.checklistItem, [checklistItemPageId])
    if (isKnownField(schema.fields.task)) {
      applyRelationIds(properties, schema.fields.task, taskPageId ? [taskPageId] : [])
    }
    applyCheckbox(properties, schema.fields.applicable, assignmentStatus !== 'not_applicable')
    applySelectLike(properties, schema.fields.assignmentStatus, toChecklistStatusText(assignmentStatus))

    const created = await this.api.createPage({
      parent: { database_id: this.getChecklistAssignmentDbId() },
      properties,
    })
    return this.mapChecklistAssignmentPage(created, schema)
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
    const statusColor = extractSelectOrStatusColor(props[schema.fields.status.actualName])
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
      statusColor,
      assignee,
      startDate: extractDate(props, schema.fields.startDate),
      dueDate: extractDate(props, schema.fields.dueDate),
      actualEndDate: extractDate(props, schema.fields.actualEndDate),
      detail,
      priority,
      urgent: extractCheckbox(props, schema.fields.urgent),
      issue,
    }
  }

  async fetchSnapshot(): Promise<TaskSnapshot> {
    const [schema, projects, taskPages] = await Promise.all([
      this.getTaskSchema(),
      this.listProjects(),
      this.queryAll(this.env.NOTION_TASK_DB_ID),
    ])

    const projectNameMap: Record<string, string> = {}
    for (const project of projects) {
      projectNameMap[project.id] = project.name
      projectNameMap[normalizeNotionId(project.id)] = project.name
    }

    const tasks = taskPages.map((page) => this.mapTaskPage(page, schema, projectNameMap))

    return {
      projects,
      tasks,
      schema,
      updatedAt: Date.now(),
    }
  }

  async getTask(id: string): Promise<{ task: TaskRecord; schema: TaskSchema }> {
    const [schema, projects, page] = await Promise.all([
      this.getTaskSchema(),
      this.listProjects(),
      this.api.retrievePage(id),
    ])

    const projectNameMap: Record<string, string> = {}
    for (const project of projects) {
      projectNameMap[project.id] = project.name
      projectNameMap[normalizeNotionId(project.id)] = project.name
    }

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

    const created: any = await this.api.createPage({
      parent: { database_id: this.env.NOTION_TASK_DB_ID },
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

    await this.api.updatePage(id, { properties })
    return this.getTask(id)
  }
}
