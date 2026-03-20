import {
  asString,
  ISO_DATE_RE,
  KR_HOLIDAY_CACHE_MS,
  KR_HOLIDAY_JSON_URL,
} from '../utils'

// ---- Module-level mutable state ----

let holidayCache: { expiresAt: number; dates: Set<string> } | null = null

export async function getKoreanHolidaySet(): Promise<Set<string>> {
  if (holidayCache && holidayCache.expiresAt > Date.now()) {
    return holidayCache.dates
  }

  try {
    const response = await fetch(KR_HOLIDAY_JSON_URL, { method: 'GET' })
    if (!response.ok) throw new Error(`holiday_http_${response.status}`)
    const data = (await response.json()) as Record<string, unknown>
    const dates = new Set<string>()
    for (const key of Object.keys(data ?? {})) {
      if (ISO_DATE_RE.test(key)) dates.add(key)
    }

    holidayCache = {
      expiresAt: Date.now() + KR_HOLIDAY_CACHE_MS,
      dates,
    }
    return dates
  } catch {
    return new Set<string>()
  }
}
