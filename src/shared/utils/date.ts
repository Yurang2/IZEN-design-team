// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeIsoDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

export function diffDays(from: Date, to: Date): number {
  const ms = 24 * 60 * 60 * 1000
  return Math.round((to.getTime() - from.getTime()) / ms)
}

export function asSortDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '9999-12-31'
}

export function addDays(date: Date, days: number): Date {
  const copied = new Date(date.getTime())
  copied.setUTCDate(copied.getUTCDate() + days)
  return copied
}

export function isBusinessDay(date: Date): boolean {
  const day = date.getUTCDay()
  return day !== 0 && day !== 6
}

export function shiftBusinessDays(date: Date, offsetDays: number): Date {
  if (offsetDays === 0) return new Date(date.getTime())
  const direction = offsetDays > 0 ? 1 : -1
  let remaining = Math.abs(offsetDays)
  let current = new Date(date.getTime())
  while (remaining > 0) {
    current = addDays(current, direction)
    if (isBusinessDay(current)) {
      remaining -= 1
    }
  }
  return current
}

export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatDateLabel(value: string): string {
  const parsed = parseIsoDate(value)
  if (!parsed) return value
  return toIsoDate(parsed)
}
