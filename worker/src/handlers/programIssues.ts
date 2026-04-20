import type { CreateProgramIssueInput, ProgramIssueRecord, UpdateProgramIssueInput } from '../types'
import { asString, containsText, hasOwn, parseDate, parsePatchBody } from '../utils'

export function parseProgramIssueCreateBody(body: unknown): CreateProgramIssueInput {
  const payload = parsePatchBody(body)
  const title = asString(payload.title)
  if (!title) {
    throw new Error('title_required')
  }

  return {
    title,
    description: asString(payload.description),
    issueType: asString(payload.issueType),
    screenName: asString(payload.screenName),
    priority: asString(payload.priority),
    status: asString(payload.status),
    reporter: asString(payload.reporter),
    assignee: asString(payload.assignee),
    holdReason: asString(payload.holdReason),
    reproductionSteps: asString(payload.reproductionSteps),
    notes: asString(payload.notes),
    date: parseDate(payload.date) ?? undefined,
    resolvedDate: parseDate(payload.resolvedDate) ?? undefined,
  }
}

export function parseProgramIssueUpdateBody(body: unknown): UpdateProgramIssueInput {
  const payload = parsePatchBody(body)

  if (Object.keys(payload).length === 0) {
    throw new Error('empty_patch')
  }

  const parsed: Record<string, unknown> = {}

  if (hasOwn(payload, 'title')) parsed.title = payload.title === null ? null : asString(payload.title)
  if (hasOwn(payload, 'description')) parsed.description = payload.description === null ? null : asString(payload.description)
  if (hasOwn(payload, 'issueType')) parsed.issueType = payload.issueType === null ? null : asString(payload.issueType)
  if (hasOwn(payload, 'screenName')) parsed.screenName = payload.screenName === null ? null : asString(payload.screenName)
  if (hasOwn(payload, 'priority')) parsed.priority = payload.priority === null ? null : asString(payload.priority)
  if (hasOwn(payload, 'status')) parsed.status = payload.status === null ? null : asString(payload.status)
  if (hasOwn(payload, 'reporter')) parsed.reporter = payload.reporter === null ? null : asString(payload.reporter)
  if (hasOwn(payload, 'assignee')) parsed.assignee = payload.assignee === null ? null : asString(payload.assignee)
  if (hasOwn(payload, 'holdReason')) parsed.holdReason = payload.holdReason === null ? null : asString(payload.holdReason)
  if (hasOwn(payload, 'reproductionSteps')) {
    parsed.reproductionSteps = payload.reproductionSteps === null ? null : asString(payload.reproductionSteps)
  }
  if (hasOwn(payload, 'notes')) parsed.notes = payload.notes === null ? null : asString(payload.notes)
  if (hasOwn(payload, 'date')) parsed.date = parseDate(payload.date)
  if (hasOwn(payload, 'resolvedDate')) parsed.resolvedDate = parseDate(payload.resolvedDate)

  return parsed as UpdateProgramIssueInput
}

export function filterProgramIssues(
  items: ProgramIssueRecord[],
  status?: string,
  issueType?: string,
  priority?: string,
  q?: string,
): ProgramIssueRecord[] {
  return items.filter((item) => {
    if (status && item.status !== status) return false
    if (issueType && item.issueType !== issueType) return false
    if (priority && item.priority !== priority) return false

    if (q) {
      const source = [
        item.title,
        item.description ?? '',
        item.issueType ?? '',
        item.screenName ?? '',
        item.reporter ?? '',
        item.assignee ?? '',
        item.holdReason ?? '',
        item.reproductionSteps ?? '',
        item.notes ?? '',
      ].join(' ')
      if (!containsText(source, q)) return false
    }

    return true
  })
}
