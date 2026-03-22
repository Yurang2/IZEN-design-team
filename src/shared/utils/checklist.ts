import type {
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  ChecklistPreviewItem,
  ProjectRecord,
} from '../types'
import { parseIsoDate, shiftBusinessDays, toIsoDate } from './date'
import { normalizeNotionId } from './format'
import { toStatusTone } from './format'

// ---------------------------------------------------------------------------
// Checklist helpers
// ---------------------------------------------------------------------------

export function sanitizeChecklistTaskPageId(value: string | undefined | null): string {
  const taskPageId = (value ?? '').trim()
  if (!taskPageId) return ''
  if (taskPageId.includes('::')) return ''
  return taskPageId
}

export function checklistItemLookupKey(value: string | undefined | null): string {
  return normalizeNotionId(value)
}

export function checklistItemKeyFromAssignmentRow(row: ChecklistAssignmentRow): string {
  const fromRelation = checklistItemLookupKey(row.checklistItemPageId)
  if (fromRelation) return fromRelation
  const rawKey = (row.key ?? '').trim()
  if (!rawKey) return ''
  const parts = rawKey.split('::')
  if (parts.length < 2) return ''
  return checklistItemLookupKey(parts[parts.length - 1] ?? '')
}

export function checklistAssignmentRowPriority(row: ChecklistAssignmentRow): number {
  const taskId = sanitizeChecklistTaskPageId(row.taskPageId)
  let score = 0
  if (row.assignmentStatus === 'assigned') score += taskId ? 300 : 160
  else if (row.assignmentStatus === 'unassigned') score += 100
  const statusText = (row.assignmentStatusText ?? '').trim().toLowerCase()
  if (statusText.includes('assigned') || statusText.includes('할당')) score += 10
  if (statusText.includes('unassigned') || statusText.includes('미할당')) score += 5
  return score
}

export function toTimelineStatusRank(status: string | undefined): number {
  const tone = toStatusTone(status)
  if (tone === 'gray') return 0
  if (tone === 'blue' || tone === 'red') return 1
  if (tone === 'green') return 2
  return 1
}

export function normalizeTaskLookupKey(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

export function extractPredecessorTokens(...sources: Array<string | undefined>): string[] {
  const patterns = [
    /(?:\uC120\uD589\uC791\uC5C5|\uC120\uD589|preced(?:ing|essor)?|depends?\s*on)\s*[:\uFF1A]\s*([^\n]+)/gi,
    /(?:after)\s*[:\uFF1A]\s*([^\n]+)/gi,
  ]
  const tokens: string[] = []

  for (const source of sources) {
    if (!source) continue
    for (const pattern of patterns) {
      pattern.lastIndex = 0
      let match = pattern.exec(source)
      while (match) {
        const chunk = (match[1] ?? '').trim()
        if (chunk) {
          const split = chunk.split(/[,|/>\u2192]/g).map((entry) => entry.trim())
          for (const part of split) {
            const cleaned = part.replace(/^\s*[-*]\s*/, '').trim()
            if (cleaned) tokens.push(cleaned)
          }
        }
        match = pattern.exec(source)
      }
    }
  }

  return tokens
}

export function getChecklistTotalLeadDays(item: ChecklistPreviewItem): number | undefined {
  if (typeof item.totalLeadDays === 'number') return item.totalLeadDays
  const hasAny =
    typeof item.designLeadDays === 'number' || typeof item.productionLeadDays === 'number' || typeof item.bufferDays === 'number'
  if (!hasAny) return undefined
  return (item.designLeadDays ?? 0) + (item.productionLeadDays ?? 0) + (item.bufferDays ?? 0)
}

export function computeChecklistDueDate(eventDate: string | undefined, item: ChecklistPreviewItem): string | undefined {
  if (!eventDate) return undefined
  const base = parseIsoDate(eventDate)
  if (!base) return undefined
  const totalLead = getChecklistTotalLeadDays(item)
  if (typeof totalLead !== 'number') return undefined
  return toIsoDate(shiftBusinessDays(base, -Math.abs(totalLead)))
}

export function checklistMatrixKey(projectPageId: string, checklistItemPageId: string): string {
  return `${projectPageId}::${checklistItemPageId}`
}

export function toChecklistAssignmentLabel(status: ChecklistAssignmentStatus): string {
  if (status === 'not_applicable') return '해당없음'
  if (status === 'assigned') return '할당됨'
  return '미할당'
}

export function normalizeChecklistValue(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

export function splitChecklistCandidates(value: string | undefined): string[] {
  const raw = (value ?? '').normalize('NFKC')
  return raw
    .split(/[,\n\r/|;]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function includesChecklistValue(values: string[] | undefined, target: string | undefined): boolean {
  const normalizedTarget = normalizeChecklistValue(target)
  if (!normalizedTarget) return false
  return (values ?? []).some((entry) => {
    const normalizedEntry = normalizeChecklistValue(entry)
    if (!normalizedEntry) return false
    if (normalizedEntry === normalizedTarget) return true
    return splitChecklistCandidates(entry).some((candidate) => normalizeChecklistValue(candidate) === normalizedTarget)
  })
}

export function isChecklistSelectableProject(project: ProjectRecord): boolean {
  const normalizedType = normalizeChecklistValue(project.projectType)
  return normalizedType === normalizeChecklistValue('행사') || normalizedType === normalizeChecklistValue('전시회')
}

export function checklistAppliesToProject(item: ChecklistPreviewItem, project: ProjectRecord | undefined): boolean {
  if (!project) return false
  const byProjectType = !item.applicableProjectTypes?.length || includesChecklistValue(item.applicableProjectTypes, project.projectType)
  const categoryCandidates = item.applicableEventCategories?.length ? item.applicableEventCategories : item.eventCategories
  const byEventCategory =
    normalizeChecklistValue(project.eventCategory) === ''
      ? (categoryCandidates?.length ?? 0) === 0
      : includesChecklistValue(categoryCandidates, project.eventCategory)
  return Boolean(byProjectType && byEventCategory)
}
