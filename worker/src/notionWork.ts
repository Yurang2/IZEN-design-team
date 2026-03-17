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
  ScheduleCell,
  ScheduleColumn,
  ScheduleRow,
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

function extractCheckboxFromProperty(prop: any): boolean | undefined {
  if (!prop || typeof prop !== 'object') return undefined
  if (prop.type === 'checkbox') return prop.checkbox === true
  if (prop.type === 'formula' && prop.formula?.type === 'boolean') return prop.formula.boolean === true
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

function extractBooleanLike(props: AnyMap, field: FieldSchema): boolean | undefined {
  if (field.status === 'missing' || field.status === 'mismatch') return undefined
  const prop = props[field.actualName]
  if (!prop || typeof prop !== 'object') return undefined

  const direct = extractBooleanFromProperty(prop)
  if (direct !== undefined) return direct

  if (prop.type === 'select') {
    const normalized = normalizeCompactText(prop.select?.name)
    if (['true', 'yes', 'y', '1', '완료', '있음'].includes(normalized)) return true
    if (['false', 'no', 'n', '0', '없음'].includes(normalized)) return false
  }

  if (prop.type === 'status') {
    const normalized = normalizeCompactText(prop.status?.name)
    if (['true', 'yes', 'y', '1', '완료', '있음'].includes(normalized)) return true
    if (['false', 'no', 'n', '0', '없음'].includes(normalized)) return false
  }

  if (prop.type === 'rich_text') {
    const normalized = normalizeCompactText(joinRichText(prop.rich_text ?? []))
    if (['true', 'yes', 'y', '1', '완료', '있음'].includes(normalized)) return true
    if (['false', 'no', 'n', '0', '없음'].includes(normalized)) return false
  }

  return undefined
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

  if (prop.type === 'url') {
    return normalizeText(prop.url) || fallback
  }

  if (prop.type === 'formula' && prop.formula?.type === 'string') {
    return normalizeText(prop.formula.string) || fallback
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

function extractRelationOrText(props: AnyMap, field: FieldSchema, relationNameMap: Record<string, string>, fallback = ''): string | undefined {
  if (field.status === 'missing' || field.status === 'mismatch') return undefined
  const prop = props[field.actualName]
  if (!prop) return fallback || undefined

  if (prop.type === 'relation') {
    const labels = (prop.relation ?? [])
      .map((entry: any) => normalizeText(relationNameMap[normalizeNotionId(entry?.id)] ?? relationNameMap[entry?.id] ?? ''))
      .filter(Boolean)
    return labels.join(', ') || fallback || undefined
  }

  const text = extractTextLike(props, field, fallback)
  return text && text !== '[UNKNOWN]' ? text : fallback || undefined
}

function extractUrlLike(props: AnyMap, field: FieldSchema): string | undefined {
  if (field.status === 'missing' || field.status === 'mismatch') return undefined
  const prop = props[field.actualName]
  if (!prop || typeof prop !== 'object') return undefined

  if (prop.type === 'url') {
    return normalizeText(prop.url) || undefined
  }

  if (prop.type === 'rich_text') {
    for (const entry of prop.rich_text ?? []) {
      const href = normalizeText(entry?.href)
      if (href) return href
      const plain = normalizeText(entry?.plain_text)
      if (/^https?:\/\//i.test(plain)) return plain
    }
    return undefined
  }

  if (prop.type === 'formula' && prop.formula?.type === 'string') {
    const value = normalizeText(prop.formula.string)
    return /^https?:\/\//i.test(value) ? value : undefined
  }

  return undefined
}

function formatNotionDateRange(value: { start?: string | null; end?: string | null } | undefined | null): string {
  if (!value) return ''
  const start = normalizeText(value.start ?? undefined)
  const end = normalizeText(value.end ?? undefined)
  if (start && end) return `${start} -> ${end}`
  return start || end
}

function firstNonEmptyText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function serializeScheduleArrayValue(values: any[]): string {
  return values
    .map((value) => serializeScheduleInlineValue(value))
    .filter(Boolean)
    .join(', ')
}

function serializeScheduleInlineValue(value: any): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return serializeScheduleArrayValue(value)
  }
  if (typeof value !== 'object') return ''

  const typed = value as AnyMap
  if (typed.type === 'title') return joinRichText(typed.title ?? [])
  if (typed.type === 'rich_text') return joinRichText(typed.rich_text ?? [])
  if (typed.type === 'number') return typed.number == null ? '' : String(typed.number)
  if (typed.type === 'select') return normalizeText(typed.select?.name)
  if (typed.type === 'multi_select') return (typed.multi_select ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean).join(', ')
  if (typed.type === 'status') return normalizeText(typed.status?.name)
  if (typed.type === 'date') return formatNotionDateRange(typed.date)
  if (typed.type === 'checkbox') return typed.checkbox === true ? 'true' : typed.checkbox === false ? 'false' : ''
  if (typed.type === 'url') return normalizeText(typed.url)
  if (typed.type === 'email') return normalizeText(typed.email)
  if (typed.type === 'phone_number') return normalizeText(typed.phone_number)
  if (typed.type === 'people') return (typed.people ?? []).map((entry: any) => normalizeText(entry?.name)).filter(Boolean).join(', ')
  if (typed.type === 'relation') return (typed.relation ?? []).map((entry: any) => normalizeText(entry?.id)).filter(Boolean).join(', ')
  if (typed.type === 'files') {
    return (typed.files ?? [])
      .map((entry: any) => firstNonEmptyText(entry?.name, extractFileUrl(entry)))
      .filter(Boolean)
      .join(', ')
  }
  if (typed.type === 'created_by') return normalizeText(typed.created_by?.name)
  if (typed.type === 'last_edited_by') return normalizeText(typed.last_edited_by?.name)
  if (typed.type === 'created_time') return normalizeText(typed.created_time)
  if (typed.type === 'last_edited_time') return normalizeText(typed.last_edited_time)
  if (typed.type === 'unique_id') {
    const number = typed.unique_id?.number
    const prefix = normalizeText(typed.unique_id?.prefix)
    if (number == null) return prefix
    return prefix ? `${prefix}-${number}` : String(number)
  }
  if (typed.type === 'formula') {
    if (typed.formula?.type === 'string') return normalizeText(typed.formula.string)
    if (typed.formula?.type === 'number') return typed.formula.number == null ? '' : String(typed.formula.number)
    if (typed.formula?.type === 'boolean') return typed.formula.boolean === true ? 'true' : typed.formula.boolean === false ? 'false' : ''
    if (typed.formula?.type === 'date') return formatNotionDateRange(typed.formula.date)
    return ''
  }
  if (typed.type === 'rollup') {
    if (typed.rollup?.type === 'array') return serializeScheduleArrayValue(typed.rollup.array ?? [])
    if (typed.rollup?.type === 'number') return typed.rollup.number == null ? '' : String(typed.rollup.number)
    if (typed.rollup?.type === 'date') return formatNotionDateRange(typed.rollup.date)
    if (typed.rollup?.type === 'incomplete') return '[incomplete]'
    if (typed.rollup?.type === 'unsupported') return '[unsupported]'
  }
  if (typed.type === 'button') return normalizeText(typed.button?.label)
  if (typed.type === 'verification') return normalizeText(typed.verification?.state)

  return firstNonEmptyText(extractTextFromProperty(typed), typed.id ? String(typed.id) : undefined)
}

function serializeScheduleCell(prop: any, column: ScheduleColumn): ScheduleCell {
  const href =
    prop?.type === 'url'
      ? normalizeText(prop.url) || null
      : prop?.type === 'email'
        ? normalizeText(prop.email)
          ? `mailto:${normalizeText(prop.email)}`
          : null
        : prop?.type === 'phone_number'
          ? normalizeText(prop.phone_number)
            ? `tel:${normalizeText(prop.phone_number)}`
            : null
          : prop?.type === 'files'
            ? (() => {
                const firstFile = (prop.files ?? []).find((entry: any) => Boolean(extractFileUrl(entry)))
                return firstFile ? extractFileUrl(firstFile) ?? null : null
              })()
            : prop?.type === 'rich_text' || prop?.type === 'title'
              ? (() => {
                  const entries = prop.type === 'rich_text' ? prop.rich_text ?? [] : prop.title ?? []
                  for (const entry of entries) {
                    const candidate = normalizeText(entry?.href)
                    if (candidate) return candidate
                  }
                  return null
                })()
              : null

  return {
    columnId: column.id,
    type: column.type,
    text: serializeScheduleInlineValue(prop),
    href,
  }
}

function parseDbTitle(db: any): string {
  return (db?.title ?? []).map((item: any) => item?.plain_text ?? '').join('').trim()
}

const SCREENING_HISTORY_DATABASE_TITLE = '\uC0C1\uC601 \uC601\uC0C1 \uAE30\uB85D DB'
const SCREENING_PLAN_DATABASE_TITLE = '\uC601\uC0C1 \uD3B8\uC131 \uC900\uBE44 DB'
const SCREENING_COMMON_TITLE_FIELD = '\uC81C\uBAA9'
const SCREENING_COMMON_PROJECT_FIELD = '\uADC0\uC18D \uD504\uB85C\uC81D\uD2B8'
const SCREENING_COMMON_EVENT_FIELD = '\uD589\uC0AC\uBA85'
const SCREENING_COMMON_DATE_FIELD = '\uC0C1\uC601\uC77C'
const SCREENING_COMMON_ORDER_FIELD = '\uC0C1\uC601 \uC21C\uC11C'
const SCREENING_COMMON_SCREEN_FIELD = '\uC2A4\uD06C\uB9B0/\uAD6C\uC5ED'
const SCREENING_COMMON_SOURCE_NAME_FIELD = '\uBCC0\uD658 \uC804 \uD30C\uC77C\uBA85'
const SCREENING_HISTORY_PLAYED_FILE_NAME_FIELD = '\uC0C1\uC601 \uB2F9\uC2DC \uD30C\uC77C\uBA85'
const SCREENING_PLAN_ACTUAL_OUTPUT_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uD30C\uC77C\uBA85'
const SCREENING_COMMON_ASPECT_RATIO_FIELD = '\uD654\uBA74 \uBE44\uC728'
const SCREENING_COMMON_THUMBNAIL_FIELD = '\uB300\uD45C \uC774\uBBF8\uC9C0'
const SCREENING_COMMON_RELATED_TASK_FIELD = '\uAD00\uB828 \uC5C5\uBB34'
const SCREENING_HISTORY_SOURCE_PLAN_ID_FIELD = '\uC6D0\uBCF8 \uC900\uBE44 Row ID'
const SCREENING_PLAN_TARGET_OUTPUT_FIELD = '\uBAA9\uD45C \uC0C1\uC601 \uD30C\uC77C\uBA85'
const SCREENING_PLAN_STATUS_FIELD = '\uC0C1\uD0DC'
const SCREENING_PLAN_HISTORY_SYNCED_FIELD = '\uD788\uC2A4\uD1A0\uB9AC \uBC18\uC601'
const SCREENING_PLAN_HISTORY_PAGE_ID_FIELD = '\uD788\uC2A4\uD1A0\uB9AC \uD398\uC774\uC9C0 ID'
const SCREENING_PLAN_ACTUAL_PLAYED_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uC5EC\uBD80'
const SCREENING_PLAN_ACTUAL_ORDER_FIELD = '\uC2E4\uC81C \uC0C1\uC601 \uC21C\uC11C'
const SCREENING_PLAN_ISSUE_REASON_FIELD = '\uC774\uC288 \uC0AC\uC720'
const SCREENING_PLAN_BASE_HISTORY_FIELD = '\uAE30\uC900 \uC0C1\uC601 \uAE30\uB85D'
const SCREENING_PLAN_BASE_USAGE_MODE_FIELD = '\uAE30\uC900 \uD65C\uC6A9 \uBC29\uC2DD'
const SCREENING_PLAN_REVIEW_STATUS_FIELD = '\uCD5C\uC2E0\uD654 \uAC80\uD1A0 \uC0C1\uD0DC'
const SCREENING_PLAN_REVIEW_NOTE_FIELD = '\uCD5C\uC2E0\uD654 \uAC80\uD1A0 \uBA54\uBAA8'

const SCREENING_HISTORY_PLAYED_FILE_NAME_ALIASES = ['\uC2E4\uC81C \uC0C1\uC601 \uD30C\uC77C\uBA85', '\uBCC0\uD658 \uD6C4 \uD30C\uC77C\uBA85']
const SCREENING_PLAN_ACTUAL_OUTPUT_ALIASES = ['\uBCC0\uD658 \uD6C4 \uD30C\uC77C\uBA85']

const SCREENING_PLAN_STATUS_OPTIONS = [
  { name: 'planned', color: 'gray' },
  { name: 'editing', color: 'yellow' },
  { name: 'ready', color: 'green' },
  { name: 'locked', color: 'blue' },
  { name: 'completed', color: 'purple' },
  { name: 'cancelled', color: 'red' },
]

const SCREENING_PLAN_BASE_USAGE_MODE_OPTIONS = [
  { name: 'reference', color: 'gray' },
  { name: 'reuse_with_edit', color: 'blue' },
  { name: 'replace', color: 'red' },
]

const SCREENING_PLAN_REVIEW_STATUS_OPTIONS = [
  { name: 'pending', color: 'gray' },
  { name: 'reviewed_ok', color: 'green' },
  { name: 'needs_update', color: 'orange' },
  { name: 'updated', color: 'blue' },
  { name: 'replaced', color: 'purple' },
]

// Backward-compatible aliases for the older screening-video naming.
const SCREENING_VIDEO_DATABASE_TITLE = SCREENING_HISTORY_DATABASE_TITLE
const SCREENING_VIDEO_TITLE_FIELD = SCREENING_COMMON_TITLE_FIELD
const SCREENING_VIDEO_PROJECT_FIELD = SCREENING_COMMON_PROJECT_FIELD
const SCREENING_VIDEO_EXHIBITION_FIELD = SCREENING_COMMON_EVENT_FIELD
const SCREENING_VIDEO_SOURCE_NAME_FIELD = SCREENING_COMMON_SOURCE_NAME_FIELD
const SCREENING_VIDEO_OUTPUT_NAME_FIELD = SCREENING_HISTORY_PLAYED_FILE_NAME_FIELD
const SCREENING_VIDEO_ASPECT_RATIO_FIELD = SCREENING_COMMON_ASPECT_RATIO_FIELD
const SCREENING_VIDEO_THUMBNAIL_FIELD = SCREENING_COMMON_THUMBNAIL_FIELD

const EVENT_GRAPHICS_TIMETABLE_FIELD_ORDER = [
  '행 제목',
  '행사명',
  '타임테이블 유형',
  '운영 키',
  '정렬 순서',
  '카테고리',
  'Cue 제목',
  '트리거 상황',
  '시작 시각',
  '종료 시각',
  '시간 기준',
  '러닝타임(분)',
  '메인 화면',
  '오디오',
  '무대 인원',
  '운영 액션',
  '운영 메모',
  '상태',
  '미리보기 링크',
  '자산 링크',
  '행사일',
  '귀속 프로젝트',
]

type EventGraphicsSchemaSyncResult = {
  configured: boolean
  databaseId: string | null
  created: string[]
  existing: string[]
  renamed: string[]
}

type ScreeningSchemaSyncResult = {
  configured: boolean
  databaseId: string | null
  created: string[]
  existing: string[]
  renamed: string[]
}

type EventGraphicsImportResult = {
  configured: boolean
  databaseId: string | null
  created: number
  updated: number
  skipped: number
  total: number
}

function buildEventGraphicsTimetablePropertyDefinitions(projectDatabaseId: string): Array<{ name: string; definition: AnyMap }> {
  return [
    {
      name: '귀속 프로젝트',
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: '행사명', definition: { rich_text: {} } },
    { name: '행사일', definition: { date: {} } },
    {
      name: '타임테이블 유형',
      definition: {
        select: {
          options: [
            { name: '자체행사', color: 'blue' },
            { name: '전시회', color: 'green' },
          ],
        },
      },
    },
    { name: '운영 키', definition: { rich_text: {} } },
    { name: '정렬 순서', definition: { number: { format: 'number' } } },
    {
      name: '카테고리',
      definition: {
        select: {
          options: [
            { name: 'announcement', color: 'gray' },
            { name: 'opening', color: 'blue' },
            { name: 'lecture', color: 'purple' },
            { name: 'certificate', color: 'yellow' },
            { name: 'break', color: 'orange' },
            { name: 'meal', color: 'green' },
            { name: 'closing', color: 'red' },
            { name: 'other', color: 'default' },
            { name: 'Regular Operation', color: 'gray' },
            { name: 'Seminar Starting Soon', color: 'blue' },
            { name: 'In Seminar', color: 'purple' },
            { name: 'Lucky Draw', color: 'yellow' },
          ],
        },
      },
    },
    { name: 'Cue 제목', definition: { rich_text: {} } },
    { name: '트리거 상황', definition: { rich_text: {} } },
    { name: '시작 시각', definition: { rich_text: {} } },
    { name: '종료 시각', definition: { rich_text: {} } },
    { name: '시간 기준', definition: { rich_text: {} } },
    { name: '러닝타임(분)', definition: { number: { format: 'number' } } },
    { name: '무대 인원', definition: { rich_text: {} } },
    { name: '메인 화면', definition: { rich_text: {} } },
    { name: '오디오', definition: { rich_text: {} } },
    { name: '운영 메모', definition: { rich_text: {} } },
    {
      name: '운영 액션',
      definition: {
        select: {
          options: [
            { name: 'Play', color: 'blue' },
            { name: 'Hold', color: 'brown' },
            { name: 'Loop', color: 'purple' },
            { name: 'Switch', color: 'green' },
          ],
        },
      },
    },
    { name: '미리보기 링크', definition: { url: {} } },
    { name: '자산 링크', definition: { url: {} } },
    {
      name: '상태',
      definition: {
        select: {
          options: [
            { name: 'planned', color: 'gray' },
            { name: 'designing', color: 'blue' },
            { name: 'ready', color: 'green' },
            { name: 'shared', color: 'purple' },
            { name: 'changed_on_site', color: 'red' },
          ],
        },
      },
    },
  ]
}

type ScreeningFieldDefinition = {
  name: string
  definition: AnyMap
  aliases?: string[]
}

function buildScreeningHistoryPropertyDefinitions(projectDatabaseId: string, taskDatabaseId: string): ScreeningFieldDefinition[] {
  return [
    {
      name: SCREENING_COMMON_PROJECT_FIELD,
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    {
      name: SCREENING_COMMON_RELATED_TASK_FIELD,
      definition: {
        relation: {
          database_id: taskDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: SCREENING_COMMON_EVENT_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_COMMON_DATE_FIELD, definition: { date: {} } },
    { name: SCREENING_COMMON_ORDER_FIELD, definition: { number: { format: 'number' } } },
    { name: SCREENING_COMMON_SCREEN_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_COMMON_THUMBNAIL_FIELD, definition: { files: {} } },
    { name: SCREENING_COMMON_SOURCE_NAME_FIELD, definition: { rich_text: {} } },
    {
      name: SCREENING_HISTORY_PLAYED_FILE_NAME_FIELD,
      definition: { rich_text: {} },
      aliases: SCREENING_HISTORY_PLAYED_FILE_NAME_ALIASES,
    },
    {
      name: SCREENING_COMMON_ASPECT_RATIO_FIELD,
      definition: {
        select: {
          options: [
            { name: '16:9', color: 'blue' },
            { name: '9:16', color: 'green' },
            { name: '1:1', color: 'gray' },
            { name: '21:9', color: 'orange' },
            { name: '32:9', color: 'purple' },
            { name: '\uAE30\uD0C0', color: 'default' },
          ],
        },
      },
    },
    { name: SCREENING_HISTORY_SOURCE_PLAN_ID_FIELD, definition: { rich_text: {} } },
  ]
}

function buildScreeningPlanPropertyDefinitions(
  projectDatabaseId: string,
  taskDatabaseId: string,
  historyDatabaseId: string | null,
): ScreeningFieldDefinition[] {
  const fields: ScreeningFieldDefinition[] = [
    {
      name: SCREENING_COMMON_PROJECT_FIELD,
      definition: {
        relation: {
          database_id: projectDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    {
      name: SCREENING_COMMON_RELATED_TASK_FIELD,
      definition: {
        relation: {
          database_id: taskDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
    { name: SCREENING_COMMON_EVENT_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_COMMON_DATE_FIELD, definition: { date: {} } },
    { name: SCREENING_COMMON_ORDER_FIELD, definition: { number: { format: 'number' } } },
    { name: SCREENING_COMMON_SCREEN_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_COMMON_THUMBNAIL_FIELD, definition: { files: {} } },
    { name: SCREENING_COMMON_SOURCE_NAME_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_PLAN_TARGET_OUTPUT_FIELD, definition: { rich_text: {} } },
    {
      name: SCREENING_PLAN_ACTUAL_OUTPUT_FIELD,
      definition: { rich_text: {} },
      aliases: SCREENING_PLAN_ACTUAL_OUTPUT_ALIASES,
    },
    {
      name: SCREENING_COMMON_ASPECT_RATIO_FIELD,
      definition: {
        select: {
          options: [
            { name: '16:9', color: 'blue' },
            { name: '9:16', color: 'green' },
            { name: '1:1', color: 'gray' },
            { name: '21:9', color: 'orange' },
            { name: '32:9', color: 'purple' },
            { name: '\uAE30\uD0C0', color: 'default' },
          ],
        },
      },
    },
    {
      name: SCREENING_PLAN_STATUS_FIELD,
      definition: {
        select: {
          options: SCREENING_PLAN_STATUS_OPTIONS,
        },
      },
    },
    { name: SCREENING_PLAN_HISTORY_SYNCED_FIELD, definition: { checkbox: {} } },
    { name: SCREENING_PLAN_HISTORY_PAGE_ID_FIELD, definition: { rich_text: {} } },
    { name: SCREENING_PLAN_ACTUAL_PLAYED_FIELD, definition: { checkbox: {} } },
    { name: SCREENING_PLAN_ACTUAL_ORDER_FIELD, definition: { number: { format: 'number' } } },
    { name: SCREENING_PLAN_ISSUE_REASON_FIELD, definition: { rich_text: {} } },
    {
      name: SCREENING_PLAN_BASE_USAGE_MODE_FIELD,
      definition: {
        select: {
          options: SCREENING_PLAN_BASE_USAGE_MODE_OPTIONS,
        },
      },
    },
    {
      name: SCREENING_PLAN_REVIEW_STATUS_FIELD,
      definition: {
        select: {
          options: SCREENING_PLAN_REVIEW_STATUS_OPTIONS,
        },
      },
    },
    { name: SCREENING_PLAN_REVIEW_NOTE_FIELD, definition: { rich_text: {} } },
  ]

  if (historyDatabaseId) {
    fields.splice(8, 0, {
      name: SCREENING_PLAN_BASE_HISTORY_FIELD,
      definition: {
        relation: {
          database_id: historyDatabaseId,
          type: 'single_property',
          single_property: {},
        },
      },
    })
  }

  return fields
}

function getPropertyDefinitionType(definition: AnyMap): string {
  return Object.keys(definition).find((key) => key !== 'name' && key !== 'aliases') ?? ''
}

function findScreeningFieldAliasName(
  properties: Record<string, any>,
  field: ScreeningFieldDefinition,
  plannedNames: Set<string>,
): string | null {
  const aliases = field.aliases ?? []
  if (aliases.length === 0) return null

  const expectedType = getPropertyDefinitionType(field.definition)
  for (const alias of aliases) {
    if (!alias || alias === field.name || plannedNames.has(alias)) continue
    const prop = properties[alias]
    if (!prop) continue
    if (!expectedType || prop?.type === expectedType) return alias
  }

  return null
}

function extractRelationIdsFromProperty(prop: any): string[] {
  if (!prop || typeof prop !== 'object' || prop.type !== 'relation') return []
  return (prop.relation ?? []).map((entry: any) => normalizeText(entry?.id)).filter(Boolean)
}

function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').toLowerCase()
}

function normalizeScreeningEventKey(value: string | undefined | null): string {
  return normalizeText(value).replace(/\s+/g, ' ').toLowerCase()
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

  private async queryAll(
    databaseId: string,
    options?: {
      filter?: AnyMap
    },
  ): Promise<any[]> {
    const pages: any[] = []
    let cursor: string | undefined

    while (true) {
      const queryInput: AnyMap = {
        start_cursor: cursor,
        page_size: 100,
      }
      if (options?.filter) {
        queryInput.filter = options.filter
      }

      const result: any = await this.api.queryDatabase(databaseId, queryInput)

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
        startDate: pickField('startDate', properties, '접수일', ['date'], false, (entries) => {
          const byName = entries.find(([name, prop]) => prop?.type === 'date' && (name.includes('접수') || name.includes('시작')))
          if (byName) return byName
          return findFirstByTypes(entries, ['date'])
        }),
        dueDate: pickField('dueDate', properties, '마감일', ['date'], false, (entries) => {
          const byName = entries.find(([name, prop]) => name.includes('마감') && prop?.type === 'date')
          if (byName) return byName
          return findFirstByTypes(entries, ['date'])
        }),
        actualStartDate: pickField('actualStartDate', properties, '\uCC29\uC218\uC77C', ['date'], true, (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              prop?.type === 'date' &&
              (name.includes('\uCC29\uC218') || name.includes('\uC2E4\uC81C \uCC29\uC218') || name.includes('\uC2E4\uC81C\uCC29\uC218')),
          )
          if (byName) return byName
          return entries.find(([name, prop]) => prop?.type === 'date' && name.includes('\uCC29\uC218'))
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
        predecessorTask: pickField(
          'predecessorTask',
          properties,
          '\uC120\uD589 \uC791\uC5C5',
          ['relation', 'rich_text', 'title', 'select'],
          true,
          (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              (name.includes('\uC120\uD589') || name.includes('\uC120\uD589\uC791\uC5C5')) &&
              ['relation', 'rich_text', 'title', 'select'].includes(prop?.type),
          )
          if (byName) return byName
          return entries.find(
            ([name, prop]) => name.includes('\uC120\uD589') && ['relation', 'rich_text', 'title', 'select'].includes(prop?.type),
          )
        }),
        predecessorPending: pickField(
          'predecessorPending',
          properties,
          '\uC120\uD589 \uBBF8\uC644\uB8CC',
          ['checkbox', 'formula', 'select', 'status', 'rich_text'],
          true,
          (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              (name.includes('\uBBF8\uC644\uB8CC') || name.includes('\uC120\uD589')) &&
              ['checkbox', 'formula', 'select', 'status', 'rich_text'].includes(prop?.type),
          )
          if (byName) return byName
          return findFirstByTypes(entries, ['checkbox', 'formula'])
        }),
        outputLink: pickField('outputLink', properties, '\uC0B0\uCD9C\uBB3C \uB9C1\uD06C', ['url', 'rich_text', 'formula'], true, (entries) => {
          const byName = entries.find(
            ([name, prop]) =>
              (name.includes('\uC0B0\uCD9C\uBB3C') || name.includes('\uB9C1\uD06C')) && ['url', 'rich_text', 'formula'].includes(prop?.type),
          )
          if (byName) return byName
          return findFirstByTypes(entries, ['url'])
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

  async listScheduleView(): Promise<{
    configured: boolean
    database: {
      id: string | null
      title: string
    }
    columns: ScheduleColumn[]
    rows: ScheduleRow[]
  }> {
    const databaseId = normalizeText(this.env.NOTION_SCHEDULE_DB_ID)
    if (!databaseId) {
      return {
        configured: false,
        database: {
          id: null,
          title: '',
        },
        columns: [],
        rows: [],
      }
    }

    const db: any = await this.api.retrieveDatabase(databaseId)
    const properties = (db.properties ?? {}) as Record<string, any>
    const columns = Object.entries(properties).map(([name, prop]) => ({
      id: normalizeText(String(prop?.id ?? name)) || name,
      name,
      type: normalizeText(String(prop?.type ?? 'unknown')) || 'unknown',
    }))

    const pages = await this.queryAll(databaseId)
    const rows = pages.map((page) => {
      const props = (page.properties ?? {}) as AnyMap
      return {
        id: page.id,
        url: normalizeText(page.url) || null,
        cells: columns.map((column) => serializeScheduleCell(props[column.name], column)),
      }
    })

    return {
      configured: true,
      database: {
        id: databaseId,
        title: parseDbTitle(db),
      },
      columns,
      rows,
    }
  }

  private async listDatabaseGridView(databaseId: string | null): Promise<{
    configured: boolean
    database: {
      id: string | null
      title: string
    }
    columns: ScheduleColumn[]
    rows: ScheduleRow[]
  }> {
    if (!databaseId) {
      return {
        configured: false,
        database: {
          id: null,
          title: '',
        },
        columns: [],
        rows: [],
      }
    }

    const db: any = await this.api.retrieveDatabase(databaseId)
    const properties = (db.properties ?? {}) as Record<string, any>
    const columns = Object.entries(properties).map(([name, prop]) => ({
      id: normalizeText(String(prop?.id ?? name)) || name,
      name,
      type: normalizeText(String(prop?.type ?? 'unknown')) || 'unknown',
    }))

    const pages = await this.queryAll(databaseId)
    const rows = pages.map((page) => {
      const props = (page.properties ?? {}) as AnyMap
      return {
        id: page.id,
        url: normalizeText(page.url) || null,
        cells: columns.map((column) => serializeScheduleCell(props[column.name], column)),
      }
    })

    return {
      configured: true,
      database: {
        id: databaseId,
        title: parseDbTitle(db),
      },
      columns,
      rows,
    }
  }

  async listScreeningHistoryView(): Promise<{
    configured: boolean
    schema: ScreeningSchemaSyncResult
    database: {
      id: string | null
      title: string
    }
    columns: ScheduleColumn[]
    rows: ScheduleRow[]
  }> {
    const schema = await this.syncScreeningHistoryDatabaseProperties()
    const view = await this.listDatabaseGridView(schema.databaseId)
    return {
      configured: view.configured,
      schema,
      database: view.database,
      columns: view.columns,
      rows: view.rows,
    }
  }

  async listScreeningPlanView(): Promise<{
    configured: boolean
    schema: ScreeningSchemaSyncResult
    database: {
      id: string | null
      title: string
    }
    columns: ScheduleColumn[]
    rows: ScheduleRow[]
  }> {
    const schema = await this.syncScreeningPlanDatabaseProperties()
    const view = await this.listDatabaseGridView(schema.databaseId)
    return {
      configured: view.configured,
      schema,
      database: view.database,
      columns: view.columns,
      rows: view.rows,
    }
  }

  private getScreeningHistoryDbId(): string {
    return normalizeText(this.env.NOTION_SCREENING_HISTORY_DB_ID) || normalizeText(this.env.NOTION_SCREENING_VIDEO_DB_ID)
  }

  private getScreeningPlanDbId(): string {
    return normalizeText(this.env.NOTION_SCREENING_PLAN_DB_ID)
  }

  private async syncScreeningDatabaseProperties(
    databaseId: string,
    databaseTitle: string,
    fieldDefinitions: ScreeningFieldDefinition[],
  ): Promise<ScreeningSchemaSyncResult> {
    if (!databaseId) {
      return {
        configured: false,
        databaseId: null,
        created: [],
        existing: [],
        renamed: [],
      }
    }

    const relationTargets = fieldDefinitions
      .filter((field) => field.definition?.relation?.database_id)
      .map((field) => `${field.name}=>${normalizeText(field.definition.relation.database_id)}`)
    let db: any
    try {
      db = await this.api.retrieveDatabase(databaseId)
    } catch (error: any) {
      const cause = normalizeText(error?.message) || normalizeText(error?.code) || 'unknown_error'
      throw new Error(
        `screening_schema_sync_failed:stage=retrieveDatabase:db_title=${databaseTitle}:db_id=${databaseId}:relations=${relationTargets.join(',') || 'none'}:cause=${cause}`,
      )
    }
    const properties = (db.properties ?? {}) as Record<string, any>
    const updates: AnyMap = {}
    const created: string[] = []
    const existing: string[] = []
    const renamed: string[] = []
    const plannedNames = new Set<string>()

    const currentTitle = parseDbTitle(db)
    const payload: AnyMap = {}
    if (currentTitle !== databaseTitle) {
      payload.title = [{ type: 'text', text: { content: databaseTitle } }]
      renamed.push(`database_title:${currentTitle || '[EMPTY]'}->${databaseTitle}`)
    }

    const titleEntry = Object.entries(properties).find(([, prop]) => prop?.type === 'title')
    if (titleEntry) {
      const [titlePropertyName] = titleEntry
      if (titlePropertyName !== SCREENING_COMMON_TITLE_FIELD && !hasOwn(properties, SCREENING_COMMON_TITLE_FIELD)) {
        updates[titlePropertyName] = { name: SCREENING_COMMON_TITLE_FIELD }
        renamed.push(`title:${titlePropertyName}->${SCREENING_COMMON_TITLE_FIELD}`)
        plannedNames.add(SCREENING_COMMON_TITLE_FIELD)
      } else {
        existing.push(SCREENING_COMMON_TITLE_FIELD)
      }
    } else if (!hasOwn(properties, SCREENING_COMMON_TITLE_FIELD)) {
      updates[SCREENING_COMMON_TITLE_FIELD] = { title: {} }
      created.push(SCREENING_COMMON_TITLE_FIELD)
      plannedNames.add(SCREENING_COMMON_TITLE_FIELD)
    }

    for (const field of fieldDefinitions) {
      if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
        existing.push(field.name)
        continue
      }
      const aliasName = findScreeningFieldAliasName(properties, field, plannedNames)
      if (aliasName) {
        updates[aliasName] = { name: field.name }
        renamed.push(`${aliasName}->${field.name}`)
        plannedNames.add(field.name)
        continue
      }
      updates[field.name] = field.definition
      created.push(field.name)
    }

    if (Object.keys(updates).length > 0) {
      payload.properties = updates
    }

    if (Object.keys(payload).length > 0) {
      try {
        await this.api.updateDatabase(databaseId, payload)
      } catch (error: any) {
        const cause = normalizeText(error?.message) || normalizeText(error?.code) || 'unknown_error'
        const updateNames =
          Object.keys(updates).length > 0 ? Object.keys(updates).join(',') : payload.title ? 'database_title' : 'none'
        throw new Error(
          `screening_schema_sync_failed:stage=updateDatabase:db_title=${databaseTitle}:db_id=${databaseId}:fields=${updateNames}:relations=${relationTargets.join(',') || 'none'}:cause=${cause}`,
        )
      }
    }

    return {
      configured: true,
      databaseId,
      created,
      existing,
      renamed,
    }
  }

  async syncScreeningHistoryDatabaseProperties(): Promise<ScreeningSchemaSyncResult> {
    return this.syncScreeningDatabaseProperties(
      this.getScreeningHistoryDbId(),
      SCREENING_HISTORY_DATABASE_TITLE,
      buildScreeningHistoryPropertyDefinitions(this.env.NOTION_PROJECT_DB_ID, this.env.NOTION_TASK_DB_ID),
    )
  }

  async syncScreeningPlanDatabaseProperties(): Promise<ScreeningSchemaSyncResult> {
    return this.syncScreeningDatabaseProperties(
      this.getScreeningPlanDbId(),
      SCREENING_PLAN_DATABASE_TITLE,
      buildScreeningPlanPropertyDefinitions(
        this.env.NOTION_PROJECT_DB_ID,
        this.env.NOTION_TASK_DB_ID,
        this.getScreeningHistoryDbId() || null,
      ),
    )
  }

  async syncCompletedScreeningPlansToHistory(): Promise<{
    configured: boolean
    planDatabaseId: string | null
    historyDatabaseId: string | null
    created: number
    updated: number
    skipped: number
    syncedPlanIds: string[]
  }> {
    const historySchema = await this.syncScreeningHistoryDatabaseProperties()
    const planSchema = await this.syncScreeningPlanDatabaseProperties()
    const historyDatabaseId = historySchema.databaseId
    const planDatabaseId = planSchema.databaseId

    if (!historyDatabaseId || !planDatabaseId) {
      return {
        configured: false,
        planDatabaseId,
        historyDatabaseId,
        created: 0,
        updated: 0,
        skipped: 0,
        syncedPlanIds: [],
      }
    }

    const [planPages, historyPages] = await Promise.all([this.queryAll(planDatabaseId), this.queryAll(historyDatabaseId)])
    const historyBySourcePlanId = new Map<string, any>()
    for (const page of historyPages) {
      const props = (page.properties ?? {}) as AnyMap
      const sourcePlanId = extractTextFromProperty(props[SCREENING_HISTORY_SOURCE_PLAN_ID_FIELD])
      if (sourcePlanId) historyBySourcePlanId.set(sourcePlanId, page)
    }

    let created = 0
    let updated = 0
    let skipped = 0
    const syncedPlanIds: string[] = []

    for (const page of planPages) {
      const props = (page.properties ?? {}) as AnyMap
      const status = normalizeText(extractTextFromProperty(props[SCREENING_PLAN_STATUS_FIELD])).toLowerCase()
      const historySynced = extractCheckboxFromProperty(props[SCREENING_PLAN_HISTORY_SYNCED_FIELD]) === true
      if (status !== 'completed' || historySynced) {
        skipped += 1
        continue
      }

      const title = joinRichText(props[SCREENING_COMMON_TITLE_FIELD]?.title ?? []) || 'Untitled screening'
      const eventName = extractTextFromProperty(props[SCREENING_COMMON_EVENT_FIELD])
      const screeningDate =
        props[SCREENING_COMMON_DATE_FIELD]?.type === 'date' ? props[SCREENING_COMMON_DATE_FIELD]?.date?.start ?? null : null
      const plannedOrder = extractNumberFromProperty(props[SCREENING_COMMON_ORDER_FIELD])
      const actualOrder = extractNumberFromProperty(props[SCREENING_PLAN_ACTUAL_ORDER_FIELD])
      const screenLabel = extractTextFromProperty(props[SCREENING_COMMON_SCREEN_FIELD])
      const sourceFileName = extractTextFromProperty(props[SCREENING_COMMON_SOURCE_NAME_FIELD])
      const actualOutputFileName =
        extractTextFromProperty(props[SCREENING_PLAN_ACTUAL_OUTPUT_FIELD]) ||
        extractTextFromProperty(props[SCREENING_PLAN_TARGET_OUTPUT_FIELD])
      const aspectRatio = extractTextFromProperty(props[SCREENING_COMMON_ASPECT_RATIO_FIELD])
      const taskIds = extractRelationIdsFromProperty(props[SCREENING_COMMON_RELATED_TASK_FIELD])
      const projectIds = extractRelationIdsFromProperty(props[SCREENING_COMMON_PROJECT_FIELD])

      const historyProperties: AnyMap = {
        [SCREENING_COMMON_TITLE_FIELD]: { title: [{ text: { content: title } }] },
        [SCREENING_COMMON_PROJECT_FIELD]: { relation: projectIds.map((id) => ({ id })) },
        [SCREENING_COMMON_RELATED_TASK_FIELD]: { relation: taskIds.map((id) => ({ id })) },
        [SCREENING_COMMON_EVENT_FIELD]: eventName ? { rich_text: [{ text: { content: eventName } }] } : { rich_text: [] },
        [SCREENING_COMMON_DATE_FIELD]: screeningDate ? { date: { start: screeningDate } } : { date: null },
        [SCREENING_COMMON_ORDER_FIELD]: { number: actualOrder ?? plannedOrder ?? null },
        [SCREENING_COMMON_SCREEN_FIELD]: screenLabel ? { rich_text: [{ text: { content: screenLabel } }] } : { rich_text: [] },
        [SCREENING_COMMON_SOURCE_NAME_FIELD]: sourceFileName ? { rich_text: [{ text: { content: sourceFileName } }] } : { rich_text: [] },
        [SCREENING_HISTORY_PLAYED_FILE_NAME_FIELD]: actualOutputFileName
          ? { rich_text: [{ text: { content: actualOutputFileName } }] }
          : { rich_text: [] },
        [SCREENING_COMMON_ASPECT_RATIO_FIELD]: aspectRatio ? { select: { name: aspectRatio } } : { select: null },
        [SCREENING_HISTORY_SOURCE_PLAN_ID_FIELD]: { rich_text: [{ text: { content: page.id } }] },
      }

      const existingHistory = historyBySourcePlanId.get(page.id)
      let historyPageId = normalizeText(existingHistory?.id)
      if (existingHistory?.id) {
        await this.api.updatePage(existingHistory.id, { properties: historyProperties })
        updated += 1
      } else {
        const createdPage = await this.api.createPage({
          parent: { database_id: historyDatabaseId },
          properties: historyProperties,
        })
        historyBySourcePlanId.set(page.id, createdPage)
        historyPageId = normalizeText(createdPage?.id)
        created += 1
      }

      await this.api.updatePage(page.id, {
        properties: {
          [SCREENING_PLAN_HISTORY_SYNCED_FIELD]: { checkbox: true },
          [SCREENING_PLAN_HISTORY_PAGE_ID_FIELD]: historyPageId
            ? { rich_text: [{ text: { content: historyPageId } }] }
            : { rich_text: [] },
        },
      })

      syncedPlanIds.push(page.id)
    }

    return {
      configured: true,
      planDatabaseId,
      historyDatabaseId,
      created,
      updated,
      skipped,
      syncedPlanIds,
    }
  }

  async importScreeningPlanFromHistory(params: {
    sourceEventName: string
    targetEventName: string
    targetProjectId?: string | null
    targetDate?: string | null
  }): Promise<{
    configured: boolean
    planDatabaseId: string | null
    historyDatabaseId: string | null
    matched: number
    created: number
    skipped: number
    createdPlanIds: string[]
  }> {
    const sourceEventName = normalizeText(params.sourceEventName)
    const targetEventName = normalizeText(params.targetEventName)
    const targetProjectId = normalizeText(params.targetProjectId) || null
    const targetDate = normalizeText(params.targetDate) || null

    if (!sourceEventName) throw new Error('source_event_name_required')
    if (!targetEventName) throw new Error('target_event_name_required')

    const historySchema = await this.syncScreeningHistoryDatabaseProperties()
    const planSchema = await this.syncScreeningPlanDatabaseProperties()
    const historyDatabaseId = historySchema.databaseId
    const planDatabaseId = planSchema.databaseId

    if (!historyDatabaseId || !planDatabaseId) {
      return {
        configured: false,
        planDatabaseId,
        historyDatabaseId,
        matched: 0,
        created: 0,
        skipped: 0,
        createdPlanIds: [],
      }
    }

    const [historyPages, planPages] = await Promise.all([this.queryAll(historyDatabaseId), this.queryAll(planDatabaseId)])
    const sourceEventKey = normalizeScreeningEventKey(sourceEventName)
    const targetEventKey = normalizeScreeningEventKey(targetEventName)

    const matchingHistoryPages = historyPages
      .filter((page) => {
        const props = (page.properties ?? {}) as AnyMap
        return normalizeScreeningEventKey(extractTextFromProperty(props[SCREENING_COMMON_EVENT_FIELD])) === sourceEventKey
      })
      .sort((left, right) => {
        const leftProps = (left.properties ?? {}) as AnyMap
        const rightProps = (right.properties ?? {}) as AnyMap
        const leftOrder = extractNumberFromProperty(leftProps[SCREENING_COMMON_ORDER_FIELD]) ?? Number.MAX_SAFE_INTEGER
        const rightOrder = extractNumberFromProperty(rightProps[SCREENING_COMMON_ORDER_FIELD]) ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return leftOrder - rightOrder
        const leftTitle = joinRichText(leftProps[SCREENING_COMMON_TITLE_FIELD]?.title ?? [])
        const rightTitle = joinRichText(rightProps[SCREENING_COMMON_TITLE_FIELD]?.title ?? [])
        return leftTitle.localeCompare(rightTitle, 'ko')
      })

    if (matchingHistoryPages.length === 0) {
      throw new Error('screening_history_source_event_not_found')
    }

    const existingBaseKeys = new Set<string>()
    for (const page of planPages) {
      const props = (page.properties ?? {}) as AnyMap
      const planEventKey = normalizeScreeningEventKey(extractTextFromProperty(props[SCREENING_COMMON_EVENT_FIELD]))
      if (planEventKey !== targetEventKey) continue
      const baseHistoryIds = extractRelationIdsFromProperty(props[SCREENING_PLAN_BASE_HISTORY_FIELD])
      for (const baseHistoryId of baseHistoryIds) {
        existingBaseKeys.add(`${targetEventKey}::${normalizeNotionId(baseHistoryId)}`)
      }
    }

    let created = 0
    let skipped = 0
    const createdPlanIds: string[] = []

    for (const historyPage of matchingHistoryPages) {
      const dedupeKey = `${targetEventKey}::${normalizeNotionId(historyPage.id)}`
      if (existingBaseKeys.has(dedupeKey)) {
        skipped += 1
        continue
      }

      const props = (historyPage.properties ?? {}) as AnyMap
      const title = joinRichText(props[SCREENING_COMMON_TITLE_FIELD]?.title ?? []) || 'Untitled screening'
      const plannedOrder = extractNumberFromProperty(props[SCREENING_COMMON_ORDER_FIELD])
      const screenLabel = extractTextFromProperty(props[SCREENING_COMMON_SCREEN_FIELD])
      const sourceFileName = extractTextFromProperty(props[SCREENING_COMMON_SOURCE_NAME_FIELD])
      const playedFileName = extractTextFromProperty(props[SCREENING_HISTORY_PLAYED_FILE_NAME_FIELD])
      const aspectRatio = extractTextFromProperty(props[SCREENING_COMMON_ASPECT_RATIO_FIELD])
      const reviewNote = `${sourceEventName} 기준 상영 기록을 불러왔습니다. 최신화 여부를 검토하세요.`

      const planProperties: AnyMap = {
        [SCREENING_COMMON_TITLE_FIELD]: { title: [{ text: { content: title } }] },
        [SCREENING_COMMON_PROJECT_FIELD]: targetProjectId ? { relation: [{ id: targetProjectId }] } : { relation: [] },
        [SCREENING_COMMON_RELATED_TASK_FIELD]: { relation: [] },
        [SCREENING_COMMON_EVENT_FIELD]: { rich_text: [{ text: { content: targetEventName } }] },
        [SCREENING_COMMON_DATE_FIELD]: targetDate ? { date: { start: targetDate } } : { date: null },
        [SCREENING_COMMON_ORDER_FIELD]: { number: plannedOrder ?? null },
        [SCREENING_COMMON_SCREEN_FIELD]: screenLabel ? { rich_text: [{ text: { content: screenLabel } }] } : { rich_text: [] },
        [SCREENING_COMMON_SOURCE_NAME_FIELD]: sourceFileName ? { rich_text: [{ text: { content: sourceFileName } }] } : { rich_text: [] },
        [SCREENING_PLAN_BASE_HISTORY_FIELD]: { relation: [{ id: historyPage.id }] },
        [SCREENING_PLAN_BASE_USAGE_MODE_FIELD]: { select: { name: 'reuse_with_edit' } },
        [SCREENING_PLAN_REVIEW_STATUS_FIELD]: { select: { name: 'pending' } },
        [SCREENING_PLAN_REVIEW_NOTE_FIELD]: { rich_text: [{ text: { content: reviewNote } }] },
        [SCREENING_PLAN_TARGET_OUTPUT_FIELD]: playedFileName ? { rich_text: [{ text: { content: playedFileName } }] } : { rich_text: [] },
        [SCREENING_PLAN_ACTUAL_OUTPUT_FIELD]: { rich_text: [] },
        [SCREENING_COMMON_ASPECT_RATIO_FIELD]: aspectRatio ? { select: { name: aspectRatio } } : { select: null },
        [SCREENING_PLAN_STATUS_FIELD]: { select: { name: 'planned' } },
        [SCREENING_PLAN_HISTORY_SYNCED_FIELD]: { checkbox: false },
        [SCREENING_PLAN_HISTORY_PAGE_ID_FIELD]: { rich_text: [] },
        [SCREENING_PLAN_ACTUAL_PLAYED_FIELD]: { checkbox: false },
        [SCREENING_PLAN_ACTUAL_ORDER_FIELD]: { number: null },
        [SCREENING_PLAN_ISSUE_REASON_FIELD]: { rich_text: [] },
      }

      const createdPage = await this.api.createPage({
        parent: { database_id: planDatabaseId },
        properties: planProperties,
      })
      created += 1
      createdPlanIds.push(createdPage.id)
      existingBaseKeys.add(dedupeKey)
    }

    return {
      configured: true,
      planDatabaseId,
      historyDatabaseId,
      matched: matchingHistoryPages.length,
      created,
      skipped,
      createdPlanIds,
    }
  }

  async syncEventGraphicsTimetableProperties(): Promise<EventGraphicsSchemaSyncResult> {
    const databaseId = normalizeText(this.env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID)
    if (!databaseId) {
      return {
        configured: false,
        databaseId: null,
        created: [],
        existing: [],
        renamed: [],
      }
    }

    const db: any = await this.api.retrieveDatabase(databaseId)
    const properties = (db.properties ?? {}) as Record<string, any>
    const updates: AnyMap = {}
    const created: string[] = []
    const existing: string[] = []
    const renamed: string[] = []
    const plannedNames = new Set<string>()

    const titleEntry = Object.entries(properties).find(([, prop]) => prop?.type === 'title')
    if (titleEntry) {
      const [titlePropertyName] = titleEntry
      if (titlePropertyName !== '행 제목' && !hasOwn(properties, '행 제목')) {
        updates[titlePropertyName] = { name: '행 제목' }
        renamed.push(`title:${titlePropertyName}->행 제목`)
      } else {
        existing.push('행 제목')
      }
    }

    const renameIfPresent = (fromName: string, toName: string) => {
      if (fromName === toName) return
      if (hasOwn(properties, toName)) return
      if (plannedNames.has(toName)) return
      if (!hasOwn(properties, fromName)) return
      updates[fromName] = { name: toName }
      renamed.push(`${fromName}->${toName}`)
      plannedNames.add(toName)
    }

    renameIfPresent('Cue 순서', '정렬 순서')
    renameIfPresent('Cue 유형', '카테고리')
    renameIfPresent('원본 Video', '메인 화면')
    renameIfPresent('원본 Audio', '오디오')
    renameIfPresent('원본 비고', '운영 메모')

    for (const field of buildEventGraphicsTimetablePropertyDefinitions(this.env.NOTION_PROJECT_DB_ID)) {
      if (hasOwn(properties, field.name) || plannedNames.has(field.name)) {
        existing.push(field.name)
        continue
      }
      updates[field.name] = field.definition
      created.push(field.name)
    }

    if (Object.keys(updates).length > 0) {
      await this.api.updateDatabase(databaseId, { properties: updates })
    }

    return {
      configured: true,
      databaseId,
      created,
      existing,
      renamed,
    }
  }

  async listEventGraphicsTimetableView(): Promise<{
    configured: boolean
    schema: EventGraphicsSchemaSyncResult
    database: {
      id: string | null
      title: string
    }
    columns: ScheduleColumn[]
    rows: ScheduleRow[]
  }> {
    const schema = await this.syncEventGraphicsTimetableProperties()
    const databaseId = schema.databaseId
    if (!databaseId) {
      return {
        configured: false,
        schema,
        database: {
          id: null,
          title: '',
        },
        columns: [],
        rows: [],
      }
    }

    const db: any = await this.api.retrieveDatabase(databaseId)
    const properties = (db.properties ?? {}) as Record<string, any>
    const propertyEntries = Object.entries(properties)
    const consumed = new Set<string>()
    const columns: ScheduleColumn[] = []

    const pushColumn = (name: string) => {
      const prop = properties[name]
      if (!prop) return
      consumed.add(name)
      columns.push({
        id: normalizeText(String(prop?.id ?? name)) || name,
        name,
        type: normalizeText(String(prop?.type ?? 'unknown')) || 'unknown',
      })
    }

    for (const fieldName of EVENT_GRAPHICS_TIMETABLE_FIELD_ORDER) {
      pushColumn(fieldName)
    }

    for (const [name, prop] of propertyEntries) {
      if (consumed.has(name)) continue
      columns.push({
        id: normalizeText(String(prop?.id ?? name)) || name,
        name,
        type: normalizeText(String(prop?.type ?? 'unknown')) || 'unknown',
      })
    }

    const orderField = columns.find((column) => ['정렬 순서', 'Cue 순서', '운영 순서'].includes(column.name))
    const keyField = columns.find((column) => column.name === '운영 키')
    const pages = await this.queryAll(databaseId)
    const rows = pages
      .map((page) => {
        const props = (page.properties ?? {}) as AnyMap
        return {
          id: page.id,
          url: normalizeText(page.url) || null,
          cells: columns.map((column) => serializeScheduleCell(props[column.name], column)),
        }
      })
      .sort((left, right) => {
        const orderLeft = Number(left.cells.find((cell) => cell.columnId === orderField?.id)?.text ?? Number.NaN)
        const orderRight = Number(right.cells.find((cell) => cell.columnId === orderField?.id)?.text ?? Number.NaN)
        if (Number.isFinite(orderLeft) && Number.isFinite(orderRight) && orderLeft !== orderRight) {
          return orderLeft - orderRight
        }

        const keyLeft = normalizeText(left.cells.find((cell) => cell.columnId === keyField?.id)?.text ?? '')
        const keyRight = normalizeText(right.cells.find((cell) => cell.columnId === keyField?.id)?.text ?? '')
        if (keyLeft && keyRight && keyLeft !== keyRight) {
          return keyLeft.localeCompare(keyRight)
        }

        return left.id.localeCompare(right.id)
      })

    return {
      configured: true,
      schema,
      database: {
        id: databaseId,
        title: parseDbTitle(db),
      },
      columns,
      rows,
    }
  }

  async importEventGraphicsTimetableRows(rows: unknown[]): Promise<EventGraphicsImportResult> {
    const schema = await this.syncEventGraphicsTimetableProperties()
    const databaseId = schema.databaseId
    if (!databaseId) {
      return {
        configured: false,
        databaseId: null,
        created: 0,
        updated: 0,
        skipped: Array.isArray(rows) ? rows.length : 0,
        total: Array.isArray(rows) ? rows.length : 0,
      }
    }

    const existingPages = await this.queryAll(databaseId)
    const existingByKey = new Map<string, any>()
    const existingByTitle = new Map<string, any>()
    for (const page of existingPages) {
      const props = (page.properties ?? {}) as AnyMap
      const operationKey = extractTextFromProperty(props['운영 키'])
      const title = normalizeText(joinRichText(props['행 제목']?.title ?? []))
      const legacySourceDocument = extractTextFromProperty(props['원본 문서'])
      const legacySourceSheet = extractTextFromProperty(props['원본 시트'])
      const legacySourceRowNumber = extractNumberFromProperty(props['원본 행번호'])
      const key =
        operationKey ||
        (legacySourceDocument && legacySourceSheet && Number.isFinite(legacySourceRowNumber)
          ? `${legacySourceDocument}::${legacySourceSheet}::${legacySourceRowNumber}`
          : title
        )
      if (key) existingByKey.set(key, page)
      if (title && !existingByTitle.has(title)) existingByTitle.set(title, page)
    }

    const projects = await this.listProjects()
    const projectIdByName = new Map<string, string>()
    for (const project of projects) {
      const name = normalizeText(project.name)
      if (!name) continue
      projectIdByName.set(name, project.id)
      projectIdByName.set(name.toLowerCase(), project.id)
    }

    let created = 0
    let updated = 0
    let skipped = 0

    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        skipped += 1
        continue
      }

      const entry = row as Record<string, unknown>
      const readText = (key: string): string => {
        const value = entry[key]
        if (typeof value === 'string') return normalizeText(value)
        if (typeof value === 'number' && Number.isFinite(value)) return String(value)
        return ''
      }
      const readNumber = (key: string): number | null => {
        const value = entry[key]
        if (typeof value === 'number' && Number.isFinite(value)) return value
        const parsed = Number(readText(key))
        return Number.isFinite(parsed) ? parsed : null
      }

      const title = readText('행 제목') || readText('Cue 제목')
      const operationKey = readText('운영 키')
      const legacySourceDocument = readText('원본 문서')
      const legacySourceSheet = readText('원본 시트')
      const legacySourceRowNumber = readNumber('원본 행번호')
      const key =
        operationKey ||
        (legacySourceDocument && legacySourceSheet && legacySourceRowNumber != null
          ? `${legacySourceDocument}::${legacySourceSheet}::${legacySourceRowNumber}`
          : title
        )

      if (!key) {
        skipped += 1
        continue
      }

      const eventName = readText('행사명')
      const projectRelationId =
        projectIdByName.get(eventName) ??
        projectIdByName.get(eventName.toLowerCase()) ??
        ''

      const existingPage = existingByKey.get(key) ?? existingByTitle.get(title)
      const existingProps = (existingPage?.properties ?? {}) as AnyMap
      const existingRelationIds = extractRelationIdsFromProperty(existingProps['귀속 프로젝트'])
      const relationIds = projectRelationId ? [projectRelationId] : existingRelationIds

      const buildRichText = (value: string) => (value ? [{ text: { content: value } }] : [])
      const properties: AnyMap = {
        '행 제목': {
          title: buildRichText(title || `[${eventName || 'Event'}] ${String(readNumber('정렬 순서') ?? '').trim()}`.trim()),
        },
        '행사명': { rich_text: buildRichText(eventName) },
        '행사일': {
          date: readText('행사일') ? { start: readText('행사일') } : null,
        },
        '타임테이블 유형': {
          select: readText('타임테이블 유형') ? { name: readText('타임테이블 유형') } : { name: '자체행사' },
        },
        '운영 키': { rich_text: buildRichText(operationKey) },
        '정렬 순서': { number: readNumber('정렬 순서') ?? readNumber('Cue 순서') ?? readNumber('운영 순서') },
        '카테고리': { select: readText('카테고리') ? { name: readText('카테고리') } : readText('Cue 유형') ? { name: readText('Cue 유형') } : null },
        'Cue 제목': { rich_text: buildRichText(readText('Cue 제목')) },
        '트리거 상황': { rich_text: buildRichText(readText('트리거 상황')) },
        '시작 시각': { rich_text: buildRichText(readText('시작 시각')) },
        '종료 시각': { rich_text: buildRichText(readText('종료 시각')) },
        '시간 기준': { rich_text: buildRichText(readText('시간 기준')) },
        '러닝타임(분)': { number: readNumber('러닝타임(분)') },
        '무대 인원': { rich_text: buildRichText(readText('무대 인원')) },
        '메인 화면': { rich_text: buildRichText(readText('메인 화면') || readText('그래픽 자산명') || readText('원본 Video')) },
        '오디오': { rich_text: buildRichText(readText('오디오') || readText('원본 Audio')) },
        '운영 액션': { select: readText('운영 액션') ? { name: readText('운영 액션') } : null },
        '운영 메모': {
          rich_text: buildRichText(readText('운영 메모') || readText('업체 전달 메모') || readText('원본 비고')),
        },
        '미리보기 링크': { url: readText('미리보기 링크') || null },
        '자산 링크': { url: readText('자산 링크') || null },
        '상태': { select: readText('상태') ? { name: readText('상태') } : null },
        '귀속 프로젝트': { relation: relationIds.map((id) => ({ id })) },
      }

      if (existingPage?.id) {
        await this.api.updatePage(existingPage.id, { properties })
        updated += 1
      } else {
        const createdPage = await this.api.createPage({
          parent: { database_id: databaseId },
          properties,
        })
        existingByKey.set(key, createdPage)
        created += 1
      }
    }

    return {
      configured: true,
      databaseId,
      created,
      updated,
      skipped,
      total: rows.length,
    }
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
    if (isKnownField(schema.fields.project) && schema.fields.project.actualType === 'relation') {
      try {
        return await this.queryAll(databaseId, {
          filter: {
            property: schema.fields.project.actualName,
            relation: {
              contains: projectPageId,
            },
          },
        })
      } catch {
        // Fall back to full scan when relation filter is not usable.
      }
    }

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

  private mapTaskPage(
    page: any,
    schema: TaskSchema,
    projectNameMap: Record<string, string>,
    taskNameMap: Record<string, string> = {},
  ): TaskRecord {
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
    const workTypeColor = extractSelectOrStatusColor(props[schema.fields.workType.actualName])
    const status = extractTextLike(props, schema.fields.status, '[UNKNOWN]') || '[UNKNOWN]'
    const statusColor = extractSelectOrStatusColor(props[schema.fields.status.actualName])
    const assignee = unique(extractStringArray(props, schema.fields.assignee))
    const requester = unique(extractStringArray(props, schema.fields.requester))
    const detail = extractTextLike(props, schema.fields.detail, '')
    const priority = extractTextLike(props, schema.fields.priority, '') || undefined
    const issue = extractTextLike(props, schema.fields.issue, '') || undefined
    const predecessorTask = extractRelationOrText(props, schema.fields.predecessorTask, taskNameMap)
    const predecessorPending = extractBooleanLike(props, schema.fields.predecessorPending)
    const outputLink = extractUrlLike(props, schema.fields.outputLink)

    return {
      id: page.id,
      url: page.url,
      projectKey,
      projectName,
      projectSource,
      requester,
      workType,
      workTypeColor,
      taskName,
      status,
      statusColor,
      assignee,
      startDate: extractDate(props, schema.fields.startDate),
      dueDate: extractDate(props, schema.fields.dueDate),
      actualStartDate: extractDate(props, schema.fields.actualStartDate),
      actualEndDate: extractDate(props, schema.fields.actualEndDate),
      detail,
      priority,
      urgent: extractCheckbox(props, schema.fields.urgent),
      issue,
      predecessorTask,
      predecessorPending,
      outputLink,
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

    const taskNameMap: Record<string, string> = {}
    for (const taskPage of taskPages) {
      const normalizedId = normalizeNotionId(taskPage.id)
      const title = extractTitle((taskPage.properties ?? {}) as AnyMap, schema.fields.taskName)
      taskNameMap[taskPage.id] = title
      taskNameMap[normalizedId] = title
    }

    const tasks = taskPages.map((page) => this.mapTaskPage(page, schema, projectNameMap, taskNameMap))

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
