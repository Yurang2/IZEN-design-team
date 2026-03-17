import type { ScheduleColumn, ScheduleRow } from '../../shared/types'
import {
  buildEventGraphicsEventRows,
  buildEventGraphicsSessionGroups,
  type EventGraphicsSessionGroup,
} from './eventGraphicsHierarchy'
import { syncEventGraphicsTitleNumbers } from './eventGraphicsTitleNumbers'
import { bangkokMasterfileManifest } from './generatedMasterfileManifest'

export type EventGraphicsShareLocale = 'en' | 'ko'

export type EventGroup = {
  eventName: string
  cues: EventGraphicsSessionGroup[]
}

export const MISSING_FILE_LABEL = '파일명 확인 필요'

const CUE_TYPE_LABELS: Record<EventGraphicsShareLocale, Record<string, string>> = {
  en: {
    announcement: 'Announcement',
    opening: 'Opening',
    entrance: 'Entrance',
    introduce: 'Introduce',
    lecture: 'Lecture',
    certificate: 'Certificate',
    break: 'Break',
    meal: 'Meal',
    closing: 'Closing',
    other: 'Other',
  },
  ko: {
    announcement: '공지',
    opening: '오프닝',
    entrance: '등장',
    introduce: '인트로',
    lecture: '강연',
    certificate: '증정',
    break: '브레이크',
    meal: '식사',
    closing: '클로징',
    other: '기타',
  },
}

export const eventGraphicsManifestByKey = new Map<string, (typeof bangkokMasterfileManifest.cues)[number]>(
  bangkokMasterfileManifest.cues.flatMap((cue) => {
    const keys = [typeof cue.operationKey === 'string' ? cue.operationKey.trim() : '', cue.cueNumber.trim()].filter(Boolean)
    return keys.map((key) => [key, cue] as const)
  }),
)

export function buildEventGraphicsShareData(columns: ScheduleColumn[], rows: ScheduleRow[], untitledEvent: string): {
  groupedCues: EventGroup[]
} {
  const cues = buildEventGraphicsSessionGroups(syncEventGraphicsTitleNumbers(buildEventGraphicsEventRows(columns, rows)))
  const groups = new Map<string, EventGraphicsSessionGroup[]>()

  for (const cue of cues) {
    const groupName = cue.eventName.trim() || untitledEvent
    const current = groups.get(groupName)
    if (current) {
      current.push(cue)
      continue
    }
    groups.set(groupName, [cue])
  }

  return {
    groupedCues: Array.from(groups.entries()).map<EventGroup>(([eventName, grouped]) => ({ eventName, cues: grouped })),
  }
}

export function buildEventGraphicsSharePageTitle(groupedCues: EventGroup[], databaseTitle: string): string {
  if (groupedCues.length === 1) return groupedCues[0]?.eventName || databaseTitle.trim() || 'Event Graphics Timetable'
  return databaseTitle.trim() || 'Event Graphics Timetable'
}

export function toCueTypeLabel(value: string, locale: EventGraphicsShareLocale): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return locale === 'ko' ? '기타' : 'Other'
  return CUE_TYPE_LABELS[locale][trimmed] ?? trimmed.replace(/_/g, ' ')
}
