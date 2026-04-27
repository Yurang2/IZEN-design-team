import type { CreateStoryboardDocumentInput, StoryboardDocumentRecord, UpdateStoryboardDocumentInput } from '../types'
import { asString, containsText, hasOwn, parsePatchBody, parseStringArray } from '../utils'

function parseStoryboardData(value: unknown): CreateStoryboardDocumentInput['data'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('storyboard_data_required')
  }
  const payload = value as Record<string, unknown>
  const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? (payload.meta as Record<string, unknown>)
    : {}
  const frames = Array.isArray(payload.frames)
    ? payload.frames.filter((frame): frame is Record<string, unknown> => Boolean(frame && typeof frame === 'object' && !Array.isArray(frame)))
    : []
  return { meta, frames }
}

export function parseStoryboardCreateBody(body: unknown): CreateStoryboardDocumentInput {
  const payload = parsePatchBody(body)
  const title = asString(payload.title)
  if (!title) throw new Error('title_required')

  return {
    title,
    projectId: asString(payload.projectId),
    projectName: asString(payload.projectName),
    versionName: asString(payload.versionName),
    memo: asString(payload.memo),
    data: parseStoryboardData(payload.data),
    exportedFileNames: parseStringArray(payload.exportedFileNames),
    updatedAt: asString(payload.updatedAt),
  }
}

export function parseStoryboardUpdateBody(body: unknown): UpdateStoryboardDocumentInput {
  const payload = parsePatchBody(body)
  if (Object.keys(payload).length === 0) throw new Error('empty_patch')
  const parsed: Record<string, unknown> = {}

  if (hasOwn(payload, 'title')) parsed.title = payload.title === null ? null : asString(payload.title)
  if (hasOwn(payload, 'projectId')) parsed.projectId = payload.projectId === null ? null : asString(payload.projectId)
  if (hasOwn(payload, 'projectName')) parsed.projectName = payload.projectName === null ? null : asString(payload.projectName)
  if (hasOwn(payload, 'versionName')) parsed.versionName = payload.versionName === null ? null : asString(payload.versionName)
  if (hasOwn(payload, 'memo')) parsed.memo = payload.memo === null ? null : asString(payload.memo)
  if (hasOwn(payload, 'data')) parsed.data = payload.data === null ? undefined : parseStoryboardData(payload.data)
  if (hasOwn(payload, 'exportedFileNames')) parsed.exportedFileNames = payload.exportedFileNames === null ? [] : parseStringArray(payload.exportedFileNames)
  if (hasOwn(payload, 'updatedAt')) parsed.updatedAt = payload.updatedAt === null ? null : asString(payload.updatedAt)

  return parsed as UpdateStoryboardDocumentInput
}

export function filterStoryboards(items: StoryboardDocumentRecord[], projectId?: string, q?: string): StoryboardDocumentRecord[] {
  return items.filter((item) => {
    if (projectId && item.projectId !== projectId) return false
    if (q) {
      const source = `${item.title} ${item.projectName ?? ''} ${item.versionName ?? ''} ${item.memo ?? ''}`
      if (!containsText(source, q)) return false
    }
    return true
  })
}
