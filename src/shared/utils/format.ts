import type { ApiSchemaSummary, ProjectRecord } from '../types'
import { formatProjectIconLabel } from '../emoji'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export function normalizeStatus(status: string | undefined): string {
  return (status ?? '').replace(/\s+/g, '')
}

export function toStatusTone(status: string | undefined): 'gray' | 'red' | 'blue' | 'green' {
  const normalized = normalizeStatus(status)
  if (normalized === '보류') return 'red'
  if (normalized === '진행중' || normalized === '검토중' || normalized === '수정중') return 'blue'
  if (normalized === '완료' || normalized === '보관') return 'green'
  return 'gray'
}

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

export function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function joinOrDash(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '-'
}

export function splitByComma(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function formatBuildTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR', { hour12: false })
}

export function toProjectLabel(project: ProjectRecord): string {
  const iconLabel = formatProjectIconLabel(project.iconEmoji)
  if (iconLabel) return `${iconLabel} ${project.name}`
  return project.name
}

export function toProjectThumbUrl(project: ProjectRecord | undefined): string | undefined {
  if (!project) return undefined
  return project.coverUrl || project.iconUrl
}

// ---------------------------------------------------------------------------
// Notion helpers
// ---------------------------------------------------------------------------

export function toNotionUrlById(id: string | undefined): string | null {
  if (!id) return null
  const normalized = id.replace(/-/g, '').trim()
  if (!normalized) return null
  return `https://www.notion.so/${normalized}`
}

export function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').trim().toLowerCase()
}

// ---------------------------------------------------------------------------
// View menu helpers
// ---------------------------------------------------------------------------

import type { ViewMenuGroupKey } from '../types'

export function createDefaultViewMenuOpenState(): Record<ViewMenuGroupKey, boolean> {
  return {
    operations: true,
    events: true,
    tools: true,
  }
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

export function schemaUnknownMessage(schema: ApiSchemaSummary | null): string[] {
  if (!schema) return []
  return schema.unknownFields.map((field) => `${field.expectedName} (${field.expectedTypes.join('|')}) -> [UNKNOWN]`)
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}
