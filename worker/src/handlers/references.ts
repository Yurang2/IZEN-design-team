import type {
  CreateReferenceInput,
  ReferenceRecord,
  ReferenceSourceType,
  ReferenceUsageType,
  UpdateReferenceInput,
} from '../types'
import { asString, containsText, hasOwn, parseDate, parsePatchBody, parseStringArray } from '../utils'

const SOURCE_TYPES = new Set<ReferenceSourceType>(['image', 'youtube', 'link', 'other'])
const USAGE_TYPES = new Set<ReferenceUsageType>(['단순저장', '모작', '아이디어'])

function normalizeSourceType(value: unknown): ReferenceSourceType | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  return SOURCE_TYPES.has(raw as ReferenceSourceType) ? (raw as ReferenceSourceType) : 'other'
}

function normalizeUsageType(value: unknown): ReferenceUsageType | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  return USAGE_TYPES.has(raw as ReferenceUsageType) ? (raw as ReferenceUsageType) : '단순저장'
}

export function parseReferenceCreateBody(body: unknown): CreateReferenceInput {
  const payload = parsePatchBody(body)
  const title = asString(payload.title)
  if (!title) throw new Error('title_required')

  const createdAt = parseDate(payload.createdAt)
  return {
    title,
    projectId: asString(payload.projectId),
    sourceType: normalizeSourceType(payload.sourceType),
    usageType: normalizeUsageType(payload.usageType),
    link: asString(payload.link),
    imageDataUrl: asString(payload.imageDataUrl),
    imageName: asString(payload.imageName),
    memo: asString(payload.memo),
    tags: parseStringArray(payload.tags),
    createdAt: createdAt === null ? undefined : createdAt,
  }
}

export function parseReferenceUpdateBody(body: unknown): UpdateReferenceInput {
  const payload = parsePatchBody(body)
  if (Object.keys(payload).length === 0) throw new Error('empty_patch')
  const parsed: Record<string, unknown> = {}

  if (hasOwn(payload, 'title')) parsed.title = payload.title === null ? null : asString(payload.title)
  if (hasOwn(payload, 'projectId')) parsed.projectId = payload.projectId === null ? null : asString(payload.projectId)
  if (hasOwn(payload, 'sourceType')) parsed.sourceType = payload.sourceType === null ? null : normalizeSourceType(payload.sourceType)
  if (hasOwn(payload, 'usageType')) parsed.usageType = payload.usageType === null ? null : normalizeUsageType(payload.usageType)
  if (hasOwn(payload, 'link')) parsed.link = payload.link === null ? null : asString(payload.link)
  if (hasOwn(payload, 'imageDataUrl')) parsed.imageDataUrl = payload.imageDataUrl === null ? null : asString(payload.imageDataUrl)
  if (hasOwn(payload, 'imageName')) parsed.imageName = payload.imageName === null ? null : asString(payload.imageName)
  if (hasOwn(payload, 'memo')) parsed.memo = payload.memo === null ? null : asString(payload.memo)
  if (hasOwn(payload, 'tags')) parsed.tags = payload.tags === null ? null : parseStringArray(payload.tags)
  if (hasOwn(payload, 'createdAt')) parsed.createdAt = parseDate(payload.createdAt)

  return parsed as UpdateReferenceInput
}

export function filterReferences(
  items: ReferenceRecord[],
  sourceType?: string,
  usageType?: string,
  projectId?: string,
  q?: string,
): ReferenceRecord[] {
  return items.filter((item) => {
    if (sourceType && item.sourceType !== sourceType) return false
    if (usageType && item.usageType !== usageType) return false
    if (projectId && item.projectId !== projectId) return false
    if (q) {
      const source = `${item.title} ${item.projectName ?? ''} ${item.link ?? ''} ${item.memo ?? ''} ${item.tags.join(' ')}`
      if (!containsText(source, q)) return false
    }
    return true
  })
}
