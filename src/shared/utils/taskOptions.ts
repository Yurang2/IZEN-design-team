import type { TaskRecord } from '../types'

const HIDDEN_STATUS_VALUES = new Set(['완료', '보관', 'done', 'completed', 'archived'])

function normalizeStatus(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

export function isActiveTaskOption(task: TaskRecord): boolean {
  return !HIDDEN_STATUS_VALUES.has(normalizeStatus(task.status))
}

export function getTaskAssigneeOptions(tasks: TaskRecord[]): string[] {
  return Array.from(new Set(tasks.flatMap((task) => task.assignee).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ko'))
}

export function matchesTaskAssignee(task: TaskRecord, assignee: string): boolean {
  return !assignee || task.assignee.includes(assignee)
}

export function formatTaskOptionLabel(task: TaskRecord, includeProject = true): string {
  const project = includeProject && task.projectName ? `[${task.projectName}] ` : ''
  const assignee = task.assignee.length > 0 ? task.assignee.join(', ') : '담당자 미지정'
  return `${project}${task.taskName} · ${assignee}`
}
