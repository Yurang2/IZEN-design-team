import type { CreateFeedbackInput, FeedbackRecord, UpdateFeedbackInput } from '../types'
import { asString, containsText, hasOwn, parseDate, parsePatchBody, parseStringArray } from '../utils'

export function parseFeedbackCreateBody(body: unknown): CreateFeedbackInput {
  const payload = parsePatchBody(body)
  const content = asString(payload.content)
  if (!content) {
    throw new Error('content_required')
  }

  const date = parseDate(payload.date)
  const recurring = payload.recurring
  if (recurring !== undefined && typeof recurring !== 'boolean') {
    throw new Error('recurring_must_be_boolean')
  }

  return {
    content,
    sourceProjectId: asString(payload.sourceProjectId),
    eventCategory: asString(payload.eventCategory),
    domainTags: parseStringArray(payload.domainTags),
    reporter: asString(payload.reporter),
    collectionMethod: asString(payload.collectionMethod),
    priority: asString(payload.priority),
    recurring: typeof recurring === 'boolean' ? recurring : undefined,
    notes: asString(payload.notes),
    date: date === null ? undefined : date,
  }
}

export function parseFeedbackUpdateBody(body: unknown): UpdateFeedbackInput {
  const payload = parsePatchBody(body)

  if (Object.keys(payload).length === 0) {
    throw new Error('empty_patch')
  }

  const parsed: Record<string, unknown> = {}

  if (hasOwn(payload, 'content')) parsed.content = payload.content === null ? null : asString(payload.content)
  if (hasOwn(payload, 'sourceProjectId')) parsed.sourceProjectId = payload.sourceProjectId === null ? null : asString(payload.sourceProjectId)
  if (hasOwn(payload, 'eventCategory')) parsed.eventCategory = payload.eventCategory === null ? null : asString(payload.eventCategory)
  if (hasOwn(payload, 'reporter')) parsed.reporter = payload.reporter === null ? null : asString(payload.reporter)
  if (hasOwn(payload, 'collectionMethod')) parsed.collectionMethod = payload.collectionMethod === null ? null : asString(payload.collectionMethod)
  if (hasOwn(payload, 'priority')) parsed.priority = payload.priority === null ? null : asString(payload.priority)
  if (hasOwn(payload, 'reflectionStatus')) parsed.reflectionStatus = payload.reflectionStatus === null ? null : asString(payload.reflectionStatus)
  if (hasOwn(payload, 'appliedProjectId')) parsed.appliedProjectId = payload.appliedProjectId === null ? null : asString(payload.appliedProjectId)
  if (hasOwn(payload, 'notes')) parsed.notes = payload.notes === null ? null : asString(payload.notes)

  if (hasOwn(payload, 'domainTags')) {
    parsed.domainTags = payload.domainTags === null ? null : parseStringArray(payload.domainTags)
  }

  if (hasOwn(payload, 'recurring')) {
    if (payload.recurring !== null && typeof payload.recurring !== 'boolean') {
      throw new Error('recurring_must_be_boolean')
    }
    parsed.recurring = payload.recurring
  }

  if (hasOwn(payload, 'date')) {
    parsed.date = parseDate(payload.date)
  }

  return parsed as UpdateFeedbackInput
}

export function filterFeedback(
  items: FeedbackRecord[],
  eventCategory?: string,
  domainTag?: string,
  reflectionStatus?: string,
  recurring?: string,
  q?: string,
): FeedbackRecord[] {
  return items.filter((item) => {
    if (eventCategory && item.eventCategory !== eventCategory) return false
    if (domainTag && !item.domainTags.includes(domainTag)) return false
    if (reflectionStatus && item.reflectionStatus !== reflectionStatus) return false
    if (recurring === 'true' && !item.recurring) return false
    if (recurring === 'false' && item.recurring) return false

    if (q) {
      const source = `${item.content} ${item.reporter ?? ''} ${item.notes ?? ''} ${item.sourceProjectName ?? ''} ${item.eventCategory ?? ''} ${item.domainTags.join(' ')}`
      if (!containsText(source, q)) return false
    }

    return true
  })
}
