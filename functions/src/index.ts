import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import cors from 'cors'
import { FieldValue } from 'firebase-admin/firestore'
import { createHash } from 'crypto'
import { inflateRawSync, inflateSync } from 'zlib'
import { PDFParse } from 'pdf-parse'
import { config } from './config'
import { NotionService } from './notion'
import { calculateDueDateFromEvent, parseFinalDueText, resolveOffsetByRuleTable } from './deadline'
import type { ProposalRecord } from './types'

admin.initializeApp()

const db = admin.firestore()
const notion = new NotionService()
const corsHandler = cors({ origin: true, credentials: true })
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const MAX_TEXT_PREVIEW_CHARS = 12000
const UPLOADS_COLLECTION = 'csv_uploads'

type PdfUploadDoc = {
  status?: string
  source?: string
  revisionRole?: 'previous' | 'current'
  fileName?: string
  mimeType?: string
  sizeBytes?: number
  sha256?: string
  extracted?: boolean
  extractedTextPreview?: string
  candidateProjectName?: string
  candidateEventDate?: string
  extractedEvents?: Array<{
    key: string
    name: string
    date?: string | null
    raw?: string
  }>
  normalizedRows?: Array<{
    rowId: string
    month?: string | null
    dateText?: string | null
    country?: string | null
    city?: string | null
    eventName: string
    purpose?: string | null
    startDate?: string | null
    endDate?: string | null
    raw: string
    confidence: 'high' | 'medium' | 'low'
  }>
  generatedProposalCount?: number
}

type RevisionRole = 'previous' | 'current'

type ExtractedEvent = {
  key: string
  name: string
  date?: string
  raw: string
}

type NormalizedPdfEventRow = {
  rowId: string
  month?: string
  dateText?: string
  country?: string
  city?: string
  eventName: string
  purpose?: string
  startDate?: string
  endDate?: string
  raw: string
  confidence: 'high' | 'medium' | 'low'
}

type EventChange = {
  key: string
  previous: ExtractedEvent
  current: ExtractedEvent
}

type ProposalPatch = {
  taskName?: string
  workCategory?: string
  dueDate?: string | null
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

function sanitizeProposalPatch(value: unknown): ProposalPatch {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid_patch')
  }

  const input = value as Record<string, unknown>
  const patch: ProposalPatch = {}

  if (hasOwn(input, 'taskName')) {
    if (typeof input.taskName !== 'string' || !input.taskName.trim()) {
      throw new Error('invalid_task_name')
    }
    patch.taskName = input.taskName.trim()
  }

  if (hasOwn(input, 'workCategory')) {
    if (typeof input.workCategory !== 'string' || !input.workCategory.trim()) {
      throw new Error('invalid_work_category')
    }
    patch.workCategory = input.workCategory.trim()
  }

  if (hasOwn(input, 'dueDate')) {
    if (input.dueDate === null) {
      patch.dueDate = null
    } else if (typeof input.dueDate === 'string') {
      const normalized = input.dueDate.trim()
      if (!normalized) {
        patch.dueDate = null
      } else if (!ISO_DATE_RE.test(normalized)) {
        throw new Error('invalid_due_date')
      } else {
        patch.dueDate = normalized
      }
    } else {
      throw new Error('invalid_due_date')
    }
  }

  return patch
}

function parseBase64FromBody(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('invalid_upload_payload')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('invalid_upload_payload')
  }
  const raw = trimmed.includes(',') ? (trimmed.split(',').pop() ?? '') : trimmed
  if (!raw) {
    throw new Error('invalid_upload_payload')
  }
  return raw
}

function sanitizeFileName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('invalid_file_name')
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('invalid_file_name')
  }
  const bracketNormalized = trimmed.replace(/^\[([^\]]+)\]/, '$1_').replace(/[\[\]]/g, '')
  // Brackets are removed to avoid downstream tooling issues in file-name based workflows.
  return bracketNormalized.replace(/[^\w.\-() ]+/g, '_')
}

function looksLikePdf(bytes: Buffer): boolean {
  if (bytes.length < 4) return false
  return bytes.subarray(0, 4).toString('hex') === '25504446'
}

function decodePrintableLines(raw: string): string[] {
  const normalized = raw
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u3131-\uD79D]/g, ' ')
  const lines = normalized
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 4)
  const deduped = Array.from(new Set(lines))
  return deduped.slice(0, 300)
}

function decodePdfLiteralString(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = value[i + 1]
    if (!next) break
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === 'b') out += '\b'
    else if (next === 'f') out += '\f'
    else if (next === '(') out += '('
    else if (next === ')') out += ')'
    else if (next === '\\') out += '\\'
    else if (/[0-7]/.test(next)) {
      let octal = next
      let j = i + 2
      while (j < value.length && octal.length < 3 && /[0-7]/.test(value[j])) {
        octal += value[j]
        j += 1
      }
      out += String.fromCharCode(parseInt(octal, 8))
      i = j - 1
      continue
    } else {
      out += next
    }
    i += 1
  }
  return out
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (!clean) return ''
  const even = clean.length % 2 === 0 ? clean : `${clean}0`
  const bytes = Buffer.from(even, 'hex')
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = ''
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1])
    }
    return out
  }
  return bytes.toString('latin1')
}

function extractTextTokensFromPdfContent(content: string): string[] {
  const tokens: string[] = []

  const literalTjRe = /\((?:\\.|[^\\)])*\)\s*(?:Tj|['"])/g
  for (const match of content.matchAll(literalTjRe)) {
    const raw = match[0]
    const start = raw.indexOf('(')
    const end = raw.lastIndexOf(')')
    if (start < 0 || end <= start) continue
    const decoded = decodePdfLiteralString(raw.slice(start + 1, end))
    if (decoded.trim()) tokens.push(decoded)
  }

  const hexTjRe = /<([0-9a-fA-F\s]+)>\s*(?:Tj|['"])/g
  for (const match of content.matchAll(hexTjRe)) {
    const decoded = decodePdfHexString(match[1])
    if (decoded.trim()) tokens.push(decoded)
  }

  const tjArrayRe = /\[(.*?)\]\s*TJ/gs
  const arrayTokenRe = /\((?:\\.|[^\\)])*\)|<([0-9a-fA-F\s]+)>/g
  for (const match of content.matchAll(tjArrayRe)) {
    const body = match[1]
    const parts: string[] = []
    for (const item of body.matchAll(arrayTokenRe)) {
      const chunk = item[0]
      if (chunk.startsWith('(')) {
        parts.push(decodePdfLiteralString(chunk.slice(1, -1)))
      } else if (item[1]) {
        parts.push(decodePdfHexString(item[1]))
      }
    }
    const merged = parts.join('')
    if (merged.trim()) tokens.push(merged)
  }

  return tokens
}

function collectDecodedPdfStreams(bytes: Buffer): Buffer[] {
  const source = bytes.toString('latin1')
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  const decoded: Buffer[] = []
  let count = 0
  let match: RegExpExecArray | null

  while ((match = streamRe.exec(source)) && count < 200) {
    count += 1
    const raw = Buffer.from(match[1], 'latin1')
    if (!raw.length) continue
    decoded.push(raw)
    try {
      const inflated = inflateSync(raw)
      if (inflated.length) decoded.push(inflated)
    } catch {
      // ignore non-flate streams
    }
    try {
      const inflatedRaw = inflateRawSync(raw)
      if (inflatedRaw.length) decoded.push(inflatedRaw)
    } catch {
      // ignore non-raw-deflate streams
    }
  }

  return decoded
}

async function extractPdfTextPreview(bytes: Buffer): Promise<string> {
  let parsedText = ''
  try {
    const parser = new PDFParse({ data: bytes })
    try {
      const result = await parser.getText()
      parsedText = typeof result.text === 'string' ? result.text : ''
    } finally {
      await parser.destroy()
    }
  } catch {
    // fallback to low-level stream parsing below
  }

  const parsedLines = decodePrintableLines(parsedText)
  if (parsedLines.length >= 8) {
    return parsedLines.join('\n').slice(0, MAX_TEXT_PREVIEW_CHARS)
  }

  const utf8 = bytes.toString('utf8')
  const latin1 = bytes.toString('latin1')
  const streamBuffers = collectDecodedPdfStreams(bytes)
  const streamTokens: string[] = []
  for (const stream of streamBuffers) {
    const content = stream.toString('latin1')
    streamTokens.push(...extractTextTokensFromPdfContent(content))
    streamTokens.push(...decodePrintableLines(content))
  }

  const merged = [...decodePrintableLines(parsedText), ...decodePrintableLines(utf8), ...decodePrintableLines(latin1), ...streamTokens]
  const deduped = Array.from(new Set(merged))
  const preview = deduped.join('\n')
  return preview.slice(0, MAX_TEXT_PREVIEW_CHARS)
}

function inferProjectNameFromFileName(fileName: string): string {
  const withoutExt = fileName.replace(/\.(pdf|csv)$/i, '')
  const cleaned = withoutExt
    .replace(/^\[[^\]]+\]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || '업로드 프로젝트'
}

function inferEventDateFromText(text: string): string | undefined {
  const compact = text.replace(/\s+/g, ' ')

  const iso = compact.match(/\b(20\d{2})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])\b/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const korean = compact.match(/(20\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/)
  if (korean) {
    const [, y, m, d] = korean
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return undefined
}

function parseRevisionRole(value: unknown): RevisionRole | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (normalized === 'previous' || normalized === 'current') {
    return normalized as RevisionRole
  }
  return undefined
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

const MONTH_NUMBER_TO_NAME = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const MONTH_NAME_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i

function toMonthNumber(value?: string): number | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().replace(/\./g, '').trim()
  return MONTH_NAME_TO_NUMBER[normalized]
}

function monthLabel(month?: number): string | undefined {
  if (!month || month < 1 || month > 12) return undefined
  return MONTH_NUMBER_TO_NAME[month]
}

function shiftMonth(month: number, by: number): { month: number; yearDelta: number } {
  let cursor = month + by
  let yearDelta = 0
  while (cursor <= 0) {
    cursor += 12
    yearDelta -= 1
  }
  while (cursor > 12) {
    cursor -= 12
    yearDelta += 1
  }
  return { month: cursor, yearDelta }
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12) return undefined
  if (day < 1 || day > 31) return undefined
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > maxDay) return undefined
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function inferDocYear(text: string, fileName: string): number {
  const source = `${fileName}\n${text}`
  const yearMatch = source.match(/\b(20\d{2})\b/)
  if (yearMatch) return Number(yearMatch[1])
  return new Date().getUTCFullYear()
}

function isHeaderLikeLine(line: string): boolean {
  const lowered = line.toLowerCase()
  const headerHits = ['month', 'date', 'country', 'city', 'event', 'purpose'].filter((key) => lowered.includes(key)).length
  return headerHits >= 3
}

function parseMonthHeader(line: string): number | undefined {
  const normalized = line.trim()
  if (!normalized || /\d/.test(normalized)) return undefined
  const match = normalized.match(MONTH_NAME_RE)
  if (!match) return undefined
  // Month-only lines become context headers.
  const withoutMonth = normalized.replace(MONTH_NAME_RE, '').trim()
  if (withoutMonth.length > 0) return undefined
  return toMonthNumber(match[1])
}

type ParsedDateSpan = {
  dateText: string
  startDate?: string
  endDate?: string
  startMonth?: number
  endMonth?: number
  consumed: string
}

function parseDateSpanFromLine(line: string, contextMonth: number | undefined, docYear: number): ParsedDateSpan | undefined {
  const normalized = line.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  const normalizedForDate = normalized.replace(/^[^0-9A-Za-z]+/, '')
  if (!normalizedForDate) return undefined

  const monthPart =
    '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
  const rangeRe = new RegExp(
    `\\b(?:(?:${monthPart})\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|~|to)\\s*(?:(?:${monthPart})\\s*)?(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    'i',
  )
  const rangeMatch = normalizedForDate.match(rangeRe)

  if (rangeMatch) {
    const startMonthNamed = toMonthNumber(rangeMatch[1])
    const startDay = Number(rangeMatch[2])
    const endMonthNamed = toMonthNumber(rangeMatch[3])
    const endDay = Number(rangeMatch[4])

    let resolvedStartMonth = startMonthNamed ?? contextMonth
    let resolvedEndMonth = endMonthNamed ?? startMonthNamed ?? contextMonth

    if (!resolvedStartMonth && endMonthNamed) {
      resolvedStartMonth = startDay > endDay ? shiftMonth(endMonthNamed, -1).month : endMonthNamed
    }
    if (resolvedStartMonth && !resolvedEndMonth) {
      resolvedEndMonth = resolvedStartMonth
    }

    let startYear = docYear
    let endYear = docYear

    if (resolvedStartMonth && resolvedEndMonth) {
      if (!startMonthNamed && endMonthNamed && startDay > endDay) {
        const shifted = shiftMonth(endMonthNamed, -1)
        resolvedStartMonth = shifted.month
        startYear = docYear + shifted.yearDelta
        resolvedEndMonth = endMonthNamed
      } else if (resolvedStartMonth === resolvedEndMonth && startDay > endDay) {
        const shifted = shiftMonth(resolvedEndMonth, 1)
        resolvedEndMonth = shifted.month
        endYear = docYear + shifted.yearDelta
      } else if (resolvedStartMonth > resolvedEndMonth) {
        endYear = docYear + 1
      }
    }

    return {
      dateText: rangeMatch[0],
      startDate: resolvedStartMonth ? toIsoDate(startYear, resolvedStartMonth, startDay) : undefined,
      endDate: resolvedEndMonth ? toIsoDate(endYear, resolvedEndMonth, endDay) : undefined,
      startMonth: resolvedStartMonth,
      endMonth: resolvedEndMonth,
      consumed: rangeMatch[0],
    }
  }

  const singleRe = new RegExp(`\\b(${monthPart})\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i')
  const singleMatch = normalizedForDate.match(singleRe)
  if (singleMatch) {
    const month = toMonthNumber(singleMatch[1])
    const day = Number(singleMatch[2])
    return {
      dateText: singleMatch[0],
      startDate: month ? toIsoDate(docYear, month, day) : undefined,
      endDate: month ? toIsoDate(docYear, month, day) : undefined,
      startMonth: month,
      endMonth: month,
      consumed: singleMatch[0],
    }
  }

  const dayRangeRe = /^(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|~|to)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i
  const dayRangeMatch = normalizedForDate.match(dayRangeRe)
  if (dayRangeMatch && contextMonth) {
    const startDay = Number(dayRangeMatch[1])
    const endDay = Number(dayRangeMatch[2])
    let startMonth = contextMonth
    let endMonth = contextMonth
    let startYear = docYear
    let endYear = docYear

    if (startDay > endDay) {
      const shifted = shiftMonth(contextMonth, 1)
      endMonth = shifted.month
      endYear = docYear + shifted.yearDelta
    }

    return {
      dateText: dayRangeMatch[0],
      startDate: toIsoDate(startYear, startMonth, startDay),
      endDate: toIsoDate(endYear, endMonth, endDay),
      startMonth,
      endMonth,
      consumed: dayRangeMatch[0],
    }
  }

  const dayOnlyRe = /^(\d{1,2})(?:st|nd|rd|th)?\b/
  const dayOnlyMatch = normalizedForDate.match(dayOnlyRe)
  if (dayOnlyMatch && contextMonth) {
    const day = Number(dayOnlyMatch[1])
    return {
      dateText: dayOnlyMatch[0],
      startDate: toIsoDate(docYear, contextMonth, day),
      endDate: toIsoDate(docYear, contextMonth, day),
      startMonth: contextMonth,
      endMonth: contextMonth,
      consumed: dayOnlyMatch[0],
    }
  }

  return undefined
}

function normalizeSegment(value: string): string | undefined {
  const cleaned = value.replace(/\s+/g, ' ').replace(/^[|,\-:/\s]+|[|,\-:/\s]+$/g, '').trim()
  return cleaned || undefined
}

function parseStructuredColumns(value: string): {
  country?: string
  city?: string
  eventName?: string
  purpose?: string
} {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return {}

  const byPipe = normalized.split('|').map((part) => normalizeSegment(part)).filter(Boolean) as string[]
  const byComma = normalized.split(',').map((part) => normalizeSegment(part)).filter(Boolean) as string[]
  const byWideSpace = normalized.split(/\s{2,}/).map((part) => normalizeSegment(part)).filter(Boolean) as string[]

  const segments = byPipe.length >= 3 ? byPipe : byComma.length >= 3 ? byComma : byWideSpace
  if (segments.length >= 4) {
    return {
      country: segments[0],
      city: segments[1],
      eventName: segments[2],
      purpose: segments.slice(3).join(' / '),
    }
  }
  if (segments.length === 3) {
    return {
      country: segments[0],
      city: segments[1],
      eventName: segments[2],
    }
  }
  if (segments.length === 2) {
    return {
      eventName: segments[0],
      purpose: segments[1],
    }
  }
  return {
    eventName: segments[0],
  }
}

function isLikelyPdfArtifactLine(line: string): boolean {
  const normalized = line.trim()
  if (!normalized) return true
  if (/^%PDF-/i.test(normalized)) return true
  if (/^(xref|trailer|startxref|endobj|obj|stream|endstream)$/i.test(normalized)) return true
  if (/^\d+\s+\d+\s+obj$/i.test(normalized)) return true
  if (/^[0-9]{10}\s+[0-9]{5}\s+n$/i.test(normalized)) return true
  if (/^<<?.*>>?$/.test(normalized)) return true
  return false
}

type GeoAlias = {
  alias: string
  label: string
  country?: string
}

const COUNTRY_ALIASES: GeoAlias[] = [
  { alias: 'south korea', label: 'South Korea' },
  { alias: 'korea', label: 'Korea' },
  { alias: 'china', label: 'China' },
  { alias: 'japan', label: 'Japan' },
  { alias: 'germany', label: 'Germany' },
  { alias: 'france', label: 'France' },
  { alias: 'italy', label: 'Italy' },
  { alias: 'spain', label: 'Spain' },
  { alias: 'usa', label: 'USA' },
  { alias: 'us', label: 'USA' },
  { alias: 'uae', label: 'UAE' },
  { alias: 'united arab emirates', label: 'UAE' },
  { alias: 'singapore', label: 'Singapore' },
  { alias: 'thailand', label: 'Thailand' },
  { alias: 'vietnam', label: 'Vietnam' },
  { alias: 'malaysia', label: 'Malaysia' },
  { alias: 'indonesia', label: 'Indonesia' },
  { alias: 'philippines', label: 'Philippines' },
  { alias: 'india', label: 'India' },
  { alias: 'taiwan', label: 'Taiwan' },
  { alias: 'hong kong', label: 'Hong Kong' },
  { alias: 'georgia', label: 'Georgia' },
  { alias: 'portugal', label: 'Portugal' },
  { alias: 'kazakhstan', label: 'Kazakhstan' },
  { alias: 'armenia', label: 'Armenia' },
  { alias: 'russia', label: 'Russia' },
  { alias: 'azerbaijan', label: 'Azerbaijan' },
  { alias: 'egypt', label: 'Egypt' },
  { alias: 'uzbekistan', label: 'Uzbekistan' },
]

const CITY_ALIASES: GeoAlias[] = [
  { alias: 'ho chi minh', label: 'Ho Chi Minh', country: 'Vietnam' },
  { alias: 'hong kong', label: 'Hong Kong', country: 'Hong Kong' },
  { alias: 'shenyang', label: 'Shenyang', country: 'China' },
  { alias: 'beijing', label: 'Beijing', country: 'China' },
  { alias: 'shanghai', label: 'Shanghai', country: 'China' },
  { alias: 'seoul', label: 'Seoul', country: 'South Korea' },
  { alias: 'dubai', label: 'Dubai', country: 'UAE' },
  { alias: 'tashkent', label: 'Tashkent', country: 'Uzbekistan' },
  { alias: 'batumi', label: 'Batumi', country: 'Georgia' },
  { alias: 'tbilisi', label: 'Tbilisi', country: 'Georgia' },
  { alias: 'jakarta', label: 'Jakarta', country: 'Indonesia' },
  { alias: 'yerevan', label: 'Yerevan', country: 'Armenia' },
  { alias: 'moscow', label: 'Moscow', country: 'Russia' },
  { alias: 'lisbon', label: 'Lisbon', country: 'Portugal' },
  { alias: 'almaty', label: 'Almaty', country: 'Kazakhstan' },
  { alias: 'baku', label: 'Baku', country: 'Azerbaijan' },
  { alias: 'hurghada', label: 'Hurghada', country: 'Egypt' },
]

function toGeoNormToken(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

function toGeoNormTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => toGeoNormToken(token))
    .filter(Boolean)
}

function matchLeadingAlias(tokens: string[], aliases: GeoAlias[]): { alias: GeoAlias; tokenCount: number } | undefined {
  let best: { alias: GeoAlias; tokenCount: number } | undefined
  for (const alias of aliases) {
    const aliasTokens = toGeoNormTokens(alias.alias)
    if (aliasTokens.length === 0 || aliasTokens.length > tokens.length) continue
    const matched = aliasTokens.every((part, idx) => part === tokens[idx])
    if (!matched) continue
    if (!best || aliasTokens.length > best.tokenCount) {
      best = { alias, tokenCount: aliasTokens.length }
    }
  }
  return best
}

function matchTrailingAlias(tokens: string[], aliases: GeoAlias[]): { alias: GeoAlias; tokenCount: number } | undefined {
  let best: { alias: GeoAlias; tokenCount: number } | undefined
  for (const alias of aliases) {
    const aliasTokens = toGeoNormTokens(alias.alias)
    if (aliasTokens.length === 0 || aliasTokens.length > tokens.length) continue
    const offset = tokens.length - aliasTokens.length
    const matched = aliasTokens.every((part, idx) => part === tokens[offset + idx])
    if (!matched) continue
    if (!best || aliasTokens.length > best.tokenCount) {
      best = { alias, tokenCount: aliasTokens.length }
    }
  }
  return best
}

function extractCountryCityFromLead(value: string): {
  country?: string
  city?: string
  remainder?: string
} {
  const normalized = normalizeSegment(value)
  if (!normalized) return {}
  const tokensRaw = normalized.split(/\s+/).filter(Boolean)
  const tokensNorm = tokensRaw.map((token) => toGeoNormToken(token))
  if (tokensRaw.length === 0) return {}

  const countryMatch = matchLeadingAlias(tokensNorm, COUNTRY_ALIASES)
  if (countryMatch) {
    const afterCountryRaw = tokensRaw.slice(countryMatch.tokenCount)
    const afterCountryNorm = tokensNorm.slice(countryMatch.tokenCount)
    if (afterCountryRaw.length === 0) {
      return { country: countryMatch.alias.label }
    }

    const cityMatch = matchLeadingAlias(afterCountryNorm, CITY_ALIASES)
    if (cityMatch) {
      const remainder = afterCountryRaw.slice(cityMatch.tokenCount).join(' ')
      return {
        country: countryMatch.alias.label,
        city: cityMatch.alias.label,
        remainder: remainder || undefined,
      }
    }

    return {
      country: countryMatch.alias.label,
      city: undefined,
      remainder: normalizeSegment(afterCountryRaw.join(' ') || ''),
    }
  }

  const cityMatch = matchLeadingAlias(tokensNorm, CITY_ALIASES)
  if (cityMatch) {
    const remainder = tokensRaw.slice(cityMatch.tokenCount).join(' ')
    return {
      country: cityMatch.alias.country,
      city: cityMatch.alias.label,
      remainder: remainder || undefined,
    }
  }

  return {}
}

function extractTrailingCity(value: string): {
  city?: string
  country?: string
  remainingText?: string
} {
  const normalized = normalizeSegment(value)
  if (!normalized) return {}
  const tokensRaw = normalized.split(/\s+/).filter(Boolean)
  const tokensNorm = tokensRaw.map((token) => toGeoNormToken(token))
  if (tokensRaw.length < 2) return {}

  const trailingCity = matchTrailingAlias(tokensNorm, CITY_ALIASES)
  if (!trailingCity) return {}
  const head = tokensRaw.slice(0, tokensRaw.length - trailingCity.tokenCount).join(' ')
  const remainingText = normalizeSegment(head)
  if (!remainingText) return {}
  return {
    city: trailingCity.alias.label,
    country: trailingCity.alias.country,
    remainingText,
  }
}

function cleanPurposeText(value: string): string {
  return value
    .replace(/^purpose[:\s-]*/i, '')
    .replace(/^목적[:\s-]*/i, '')
    .trim()
}

function isPurposeLikeLine(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return false
  if (/^(tbd|tba|to be announced|미정)$/i.test(normalized)) return true
  if (/^(purpose|목적)\b/i.test(normalized)) return true
  return false
}

function buildNormalizedRowFromDetailLines(
  dateLine: string,
  dateSpan: ParsedDateSpan,
  month: string | undefined,
  detailLines: string[],
  rowIndex: number,
): NormalizedPdfEventRow | undefined {
  const normalizedDetails = detailLines.map((line) => normalizeSegment(line)).filter(Boolean) as string[]
  if (normalizedDetails.length === 0) return undefined

  const firstDetail = normalizedDetails[0]
  const hasExplicitDelimiter = /[|,]/.test(firstDetail) || /\s{2,}/.test(firstDetail)

  let country: string | undefined
  let city: string | undefined
  let purpose: string | undefined
  const eventParts: string[] = []

  if (hasExplicitDelimiter) {
    const parsed = parseStructuredColumns(firstDetail)
    country = normalizeSegment(parsed.country || '')
    city = normalizeSegment(parsed.city || '')
    purpose = normalizeSegment(parsed.purpose || '')
    const eventFromStructured = normalizeSegment(parsed.eventName || '')
    if (eventFromStructured) eventParts.push(eventFromStructured)
  } else {
    const geo = extractCountryCityFromLead(firstDetail)
    country = normalizeSegment(geo.country || '')
    city = normalizeSegment(geo.city || '')
    const leadEvent = normalizeSegment(geo.remainder || (!geo.country ? firstDetail : ''))
    if (leadEvent) eventParts.push(leadEvent)
  }

  for (const line of normalizedDetails.slice(1)) {
    if (isPurposeLikeLine(line)) {
      if (!purpose) {
        const cleaned = cleanPurposeText(line)
        purpose = cleaned || line
      }
      continue
    }
    eventParts.push(line)
  }

  let eventName = normalizeSegment(eventParts.join(' '))
  if (!eventName) {
    return undefined
  }

  if (!country || !city) {
    const geoFromAll = extractCountryCityFromLead(normalizedDetails.join(' '))
    if (!country && geoFromAll.country) country = geoFromAll.country
    if (!city && geoFromAll.city) city = geoFromAll.city
  }

  if (!city) {
    const trailing = extractTrailingCity(eventName)
    if (trailing.city) {
      city = trailing.city
      if (!country && trailing.country) country = trailing.country
      if (trailing.remainingText) {
        eventName = trailing.remainingText
      }
    }
  }

  const eventKey = normalizeEventKey(`${eventName} ${city ?? ''} ${country ?? ''}`)
  if (!eventKey) return undefined

  const startDate = dateSpan.startDate
  const endDate = dateSpan.endDate ?? startDate

  let confidence: 'high' | 'medium' | 'low' = 'high'
  if (!country && !city) confidence = 'medium'
  if (!startDate) confidence = 'medium'
  if (eventName.split(/\s+/).length < 2 && !purpose) confidence = 'low'

  return {
    rowId: `${eventKey}_${rowIndex}`,
    month,
    dateText: dateSpan.dateText,
    country,
    city,
    eventName,
    purpose,
    startDate,
    endDate,
    raw: [dateLine, ...normalizedDetails].join(' || '),
    confidence,
  }
}

function normalizePdfRowsFromText(text: string, fileName: string): NormalizedPdfEventRow[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 500)

  const rows: NormalizedPdfEventRow[] = []
  const seen = new Set<string>()
  let contextMonth: number | undefined
  const docYear = inferDocYear(text, fileName)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (isLikelyPdfArtifactLine(line)) continue
    if (isHeaderLikeLine(line)) continue

    const headerMonth = parseMonthHeader(line)
    if (headerMonth) {
      contextMonth = headerMonth
      continue
    }

    const dateSpan = parseDateSpanFromLine(line, contextMonth, docYear)
    if (!dateSpan) continue

    contextMonth = dateSpan.endMonth ?? dateSpan.startMonth ?? contextMonth
    const month = monthLabel(dateSpan.startMonth ?? contextMonth)
    const detailLines: string[] = []
    const remainder = normalizeSegment(line.replace(dateSpan.consumed, ' ').replace(/\s+/g, ' ').trim())
    if (remainder) detailLines.push(remainder)

    let cursor = i + 1
    while (cursor < lines.length) {
      const nextLine = lines[cursor]
      if (isLikelyPdfArtifactLine(nextLine)) {
        cursor += 1
        continue
      }
      if (isHeaderLikeLine(nextLine)) break
      if (parseMonthHeader(nextLine)) break
      if (parseDateSpanFromLine(nextLine, contextMonth, docYear)) break
      detailLines.push(nextLine)
      cursor += 1
    }

    i = cursor - 1

    const row = buildNormalizedRowFromDetailLines(line, dateSpan, month, detailLines, rows.length + 1)
    if (!row) continue
    const rowKey = normalizeEventKey(`${row.eventName} ${row.city ?? ''} ${row.country ?? ''}`)
    if (!rowKey || seen.has(rowKey)) continue
    seen.add(rowKey)
    rows.push(row)
  }

  return rows.slice(0, 120)
}

function toExtractedEventsFromNormalizedRows(rows: NormalizedPdfEventRow[]): ExtractedEvent[] {
  const events: ExtractedEvent[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const resolvedEventName = forceProjectName(row.eventName, row.city, row.country)
    const key = buildEventKey(resolvedEventName, row.city, row.country)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const normalizedRaw = [
      row.month ?? '',
      row.dateText ?? '',
      row.country ?? '',
      row.city ?? '',
      row.eventName,
      row.purpose ?? '',
      row.startDate ?? '',
      row.endDate ?? '',
    ].join('|')
    events.push({
      key,
      name: resolvedEventName,
      date: row.startDate,
      raw: normalizedRaw,
    })
  }
  return events
}

function normalizeEventKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isTbdLike(value: string | undefined): boolean {
  if (!value) return true
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim()
  if (!normalized) return true
  return ['tbd', 'tba', 'na', 'n/a', 'none', 'unknown', '미정', '미확정', '추후확정'].includes(normalized)
}

function forceProjectName(rawName: string | undefined, city?: string, country?: string): string {
  const candidate = rawName?.replace(/\s+/g, ' ').trim()
  if (candidate && !isTbdLike(candidate)) {
    return candidate
  }
  const location = city?.replace(/\s+/g, ' ').trim() || country?.replace(/\s+/g, ' ').trim() || 'Unknown'
  return `${location}_Event`
}

function buildEventKey(eventName: string, city?: string, country?: string): string {
  return normalizeEventKey(`${eventName} ${city ?? ''} ${country ?? ''}`)
}

function normalizeEventIdentityName(value: string): string {
  return normalizeEventKey(value)
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEventIdentityMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.includes(b) || b.includes(a)
}

function stripDateTokens(value: string): string {
  return value
    .replace(/\b20\d{2}[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])\b/g, ' ')
    .replace(/20\d{2}\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractEventCandidatesFromText(
  text: string,
  fallbackName: string,
  fallbackDate?: string,
  allowFallback = true,
): ExtractedEvent[] {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const events: ExtractedEvent[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const date = inferEventDateFromText(line)
    if (!date) continue

    let name = stripDateTokens(line)
    if (name.length < 2 && i + 1 < lines.length) {
      name = lines[i + 1]
    }
    if (name.length < 2 && i > 0) {
      name = lines[i - 1]
    }
    if (name.length < 2) continue

    const key = normalizeEventKey(name)
    if (!key || seen.has(key)) continue
    seen.add(key)

    events.push({
      key,
      name,
      date,
      raw: line,
    })
  }

  if (events.length === 0 && allowFallback) {
    const key = normalizeEventKey(fallbackName)
    if (key) {
      events.push({
        key,
        name: fallbackName,
        date: fallbackDate,
        raw: fallbackName,
      })
    }
  }

  return events.slice(0, 40)
}

function parseStoredEvents(value: unknown): ExtractedEvent[] {
  if (!Array.isArray(value)) return []
  const events: ExtractedEvent[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = typeof row.key === 'string' ? normalizeEventKey(row.key) : ''
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const raw = typeof row.raw === 'string' ? row.raw.trim() : name
    const date = typeof row.date === 'string' && row.date.trim() ? row.date.trim() : undefined
    if (!key || !name) continue
    events.push({ key, name, date, raw: raw || name })
  }

  return events
}

function parseStoredNormalizedRows(value: unknown): NormalizedPdfEventRow[] {
  if (!Array.isArray(value)) return []
  const rows: NormalizedPdfEventRow[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const rowId = typeof row.rowId === 'string' ? row.rowId.trim() : ''
    const eventName = typeof row.eventName === 'string' ? row.eventName.trim() : ''
    const raw = typeof row.raw === 'string' ? row.raw.trim() : eventName
    if (!rowId || !eventName) continue
    const confidence =
      row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low' ? row.confidence : 'low'
    rows.push({
      rowId,
      month: typeof row.month === 'string' && row.month.trim() ? row.month.trim() : undefined,
      dateText: typeof row.dateText === 'string' && row.dateText.trim() ? row.dateText.trim() : undefined,
      country: typeof row.country === 'string' && row.country.trim() ? row.country.trim() : undefined,
      city: typeof row.city === 'string' && row.city.trim() ? row.city.trim() : undefined,
      eventName,
      purpose: typeof row.purpose === 'string' && row.purpose.trim() ? row.purpose.trim() : undefined,
      startDate: typeof row.startDate === 'string' && row.startDate.trim() ? row.startDate.trim() : undefined,
      endDate: typeof row.endDate === 'string' && row.endDate.trim() ? row.endDate.trim() : undefined,
      raw: raw || eventName,
      confidence,
    })
  }
  return rows
}

function normalizeCsvHeaderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    if (ch === '\r') {
      continue
    }
    field += ch
  }

  row.push(field)
  if (row.some((value) => value.trim() !== '')) {
    rows.push(row)
  }

  return rows
}

function normalizeCsvValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined
  if (/^(-|—|n\/a|null)$/i.test(cleaned)) return undefined
  return cleaned
}

function parseIsoDateLike(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim()
  if (!normalized) return undefined

  const korean = normalized.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일$/)
  if (korean) {
    const [, y, m, d] = korean
    return toIsoDate(Number(y), Number(m), Number(d))
  }

  const yearFirst = normalized.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (yearFirst) {
    const [, y, m, d] = yearFirst
    return toIsoDate(Number(y), Number(m), Number(d))
  }

  const monthFirst = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (monthFirst) {
    const [, m, d, y] = monthFirst
    return toIsoDate(Number(y), Number(m), Number(d))
  }

  if (ISO_DATE_RE.test(normalized)) {
    return normalized
  }

  return undefined
}

function monthFromIsoDate(value: string | undefined): number | undefined {
  if (!value) return undefined
  const match = value.match(/^\d{4}-(\d{2})-\d{2}$/)
  if (!match) return undefined
  const month = Number(match[1])
  if (month < 1 || month > 12) return undefined
  return month
}

function normalizeRowsFromCsvText(csvText: string, fileName: string): NormalizedPdfEventRow[] {
  const records = parseCsvRecords(csvText)
  if (records.length === 0) return []

  const header = records[0].map((value) => normalizeCsvHeaderKey(value))
  const col = (key: string): number => header.indexOf(key)

  const monthCol = col('month')
  const dateCol = col('date')
  const startCol = col('startdate')
  const endCol = col('enddate')
  const countryCol = col('country')
  const cityCol = col('city')
  const nameCol = col('name')
  const purposeCol = col('purpose')

  if (nameCol < 0 || (startCol < 0 && endCol < 0 && dateCol < 0)) {
    return []
  }

  const docYear = inferDocYear(csvText, fileName)
  const rows: NormalizedPdfEventRow[] = []
  const seen = new Set<string>()

  for (let i = 1; i < records.length; i += 1) {
    const record = records[i]
    const nameRaw = normalizeCsvValue(record[nameCol])
    if (!nameRaw) continue

    const monthRaw = monthCol >= 0 ? normalizeCsvValue(record[monthCol]) : undefined
    const monthFromHeader = toMonthNumber(monthRaw)

    let startDate = startCol >= 0 ? parseIsoDateLike(normalizeCsvValue(record[startCol])) : undefined
    let endDate = endCol >= 0 ? parseIsoDateLike(normalizeCsvValue(record[endCol])) : undefined

    const dateRaw = dateCol >= 0 ? normalizeCsvValue(record[dateCol]) : undefined
    if ((!startDate || !endDate) && dateRaw) {
      const parsed = parseDateSpanFromLine(dateRaw, monthFromHeader, docYear)
      if (parsed) {
        startDate = startDate ?? parsed.startDate
        endDate = endDate ?? parsed.endDate ?? parsed.startDate
      }
    }

    if (startDate && !endDate) endDate = startDate
    if (!startDate && endDate) startDate = endDate

    const monthResolved = monthLabel(monthFromHeader ?? monthFromIsoDate(startDate))
    const country = countryCol >= 0 ? normalizeCsvValue(record[countryCol]) : undefined
    const city = cityCol >= 0 ? normalizeCsvValue(record[cityCol]) : undefined
    const purpose = purposeCol >= 0 ? normalizeCsvValue(record[purposeCol]) : undefined
    const eventName = forceProjectName(nameRaw, city, country)

    const eventKey = buildEventKey(eventName, city, country)
    if (!eventKey || seen.has(eventKey)) continue
    seen.add(eventKey)

    rows.push({
      rowId: `${eventKey}_${rows.length + 1}`,
      month: monthResolved,
      dateText: dateRaw,
      country,
      city,
      eventName,
      purpose,
      startDate,
      endDate,
      raw: [
        monthRaw ?? '',
        dateRaw ?? '',
        startDate ?? '',
        endDate ?? '',
        country ?? '',
        city ?? '',
        eventName,
        purpose ?? '',
      ].join('|'),
      confidence: startDate || endDate ? 'high' : 'medium',
    })
  }

  return rows.slice(0, 500)
}

function isLikelyCsvMimeType(value: string): boolean {
  const normalized = value.toLowerCase().trim()
  if (!normalized) return false
  return (
    normalized.includes('csv') ||
    normalized === 'text/plain' ||
    normalized === 'application/octet-stream' ||
    normalized === 'application/vnd.ms-excel'
  )
}

function inferEventDateFromNormalizedRows(rows: NormalizedPdfEventRow[]): string | undefined {
  const dates = rows
    .map((row) => row.startDate || row.endDate)
    .filter((value): value is string => Boolean(value))
    .sort()
  return dates[0]
}

function parsePreviewOnly(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes'
  }
  return false
}

function sanitizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function uniqueCategoriesFromChecklist(
  checklist: Awaited<ReturnType<NotionService['fetchChecklist']>>,
): string[] {
  const set = new Set<string>()
  for (const item of checklist) {
    for (const category of item.eventCategories) {
      const normalized = category.trim()
      if (!normalized) continue
      set.add(normalized)
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
}

function buildNormalizedRowByEventKey(rows: NormalizedPdfEventRow[]): Map<string, NormalizedPdfEventRow> {
  const result = new Map<string, NormalizedPdfEventRow>()
  for (const row of rows) {
    const eventName = forceProjectName(row.eventName, row.city, row.country)
    const key = buildEventKey(eventName, row.city, row.country)
    if (!key || result.has(key)) continue
    result.set(key, { ...row, eventName })
  }
  return result
}

function changedFieldsFromRows(
  previous: NormalizedPdfEventRow | undefined,
  current: NormalizedPdfEventRow | undefined,
  fallback: { previous: ExtractedEvent; current: ExtractedEvent },
): string[] {
  if (!previous || !current) {
    const fields: string[] = []
    if ((fallback.previous.date ?? '') !== (fallback.current.date ?? '')) fields.push('date')
    if (fallback.previous.name !== fallback.current.name) fields.push('name')
    if ((fallback.previous.raw ?? '') !== (fallback.current.raw ?? '')) fields.push('detail')
    return fields
  }

  const fields: string[] = []
  if ((previous.month ?? '') !== (current.month ?? '')) fields.push('month')
  if ((previous.dateText ?? '') !== (current.dateText ?? '')) fields.push('dateText')
  if ((previous.country ?? '') !== (current.country ?? '')) fields.push('country')
  if ((previous.city ?? '') !== (current.city ?? '')) fields.push('city')
  if ((previous.eventName ?? '') !== (current.eventName ?? '')) fields.push('eventName')
  if ((previous.purpose ?? '') !== (current.purpose ?? '')) fields.push('purpose')
  if ((previous.startDate ?? '') !== (current.startDate ?? '')) fields.push('startDate')
  if ((previous.endDate ?? '') !== (current.endDate ?? '')) fields.push('endDate')
  return fields
}

function buildDiffDetails(
  diff: ReturnType<typeof compareExtractedEvents>,
  previousRowByKey: Map<string, NormalizedPdfEventRow>,
  currentRowByKey: Map<string, NormalizedPdfEventRow>,
) {
  const added = diff.added.map((event) => {
    const row = currentRowByKey.get(event.key)
    return {
      key: event.key,
      changeType: 'added' as const,
      eventName: row?.eventName ?? event.name,
      country: row?.country ?? null,
      city: row?.city ?? null,
      previousStartDate: null,
      previousEndDate: null,
      currentStartDate: row?.startDate ?? event.date ?? null,
      currentEndDate: row?.endDate ?? event.date ?? null,
      changedFields: ['new_event'],
    }
  })

  const changed = diff.changed.map((event) => {
    const previousRow = previousRowByKey.get(event.previous.key) ?? previousRowByKey.get(event.key)
    const currentRow = currentRowByKey.get(event.current.key) ?? currentRowByKey.get(event.key)
    return {
      key: event.key,
      changeType: 'changed' as const,
      eventName: currentRow?.eventName ?? previousRow?.eventName ?? event.current.name,
      country: currentRow?.country ?? previousRow?.country ?? null,
      city: currentRow?.city ?? previousRow?.city ?? null,
      previousStartDate: previousRow?.startDate ?? event.previous.date ?? null,
      previousEndDate: previousRow?.endDate ?? event.previous.date ?? null,
      currentStartDate: currentRow?.startDate ?? event.current.date ?? null,
      currentEndDate: currentRow?.endDate ?? event.current.date ?? null,
      changedFields: changedFieldsFromRows(previousRow, currentRow, event),
    }
  })

  const removed = diff.removed.map((event) => {
    const row = previousRowByKey.get(event.key)
    return {
      key: event.key,
      changeType: 'removed' as const,
      eventName: row?.eventName ?? event.name,
      country: row?.country ?? null,
      city: row?.city ?? null,
      previousStartDate: row?.startDate ?? event.date ?? null,
      previousEndDate: row?.endDate ?? event.date ?? null,
      currentStartDate: null,
      currentEndDate: null,
      changedFields: ['removed_event'],
    }
  })

  return { added, changed, removed }
}

function compareExtractedEvents(previous: ExtractedEvent[], current: ExtractedEvent[]) {
  const previousMap = new Map(previous.map((event) => [event.key, event]))
  const previousByIdentity = new Map<string, ExtractedEvent[]>()
  for (const event of previous) {
    const identity = normalizeEventIdentityName(event.name)
    if (!identity) continue
    const bucket = previousByIdentity.get(identity) ?? []
    bucket.push(event)
    previousByIdentity.set(identity, bucket)
  }

  const added: ExtractedEvent[] = []
  const changed: EventChange[] = []
  const removed: ExtractedEvent[] = []
  const matchedPreviousKeys = new Set<string>()

  for (const event of current) {
    let before = previousMap.get(event.key)
    if (before && matchedPreviousKeys.has(before.key)) {
      before = undefined
    }
    if (!before) {
      const identity = normalizeEventIdentityName(event.name)
      const candidates = previousByIdentity.get(identity) ?? []
      before = candidates.find((candidate) => !matchedPreviousKeys.has(candidate.key))
      if (!before) {
        for (const [candidateIdentity, identityCandidates] of previousByIdentity.entries()) {
          if (!isEventIdentityMatch(identity, candidateIdentity)) continue
          before = identityCandidates.find((candidate) => !matchedPreviousKeys.has(candidate.key))
          if (before) break
        }
      }
    }

    if (!before) {
      added.push(event)
      continue
    }
    matchedPreviousKeys.add(before.key)

    const changedKey = before.key !== event.key
    const changedDate = (before.date ?? '') !== (event.date ?? '')
    const changedName = before.name !== event.name
    const changedDetail = (before.raw ?? '') !== (event.raw ?? '')
    if (changedKey || changedDate || changedName || changedDetail) {
      changed.push({
        key: event.key,
        previous: before,
        current: event,
      })
    }
  }

  for (const event of previous) {
    if (!matchedPreviousKeys.has(event.key)) {
      removed.push(event)
    }
  }

  return { added, changed, removed }
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function pickChecklistByRoughAi(
  checklist: Awaited<ReturnType<NotionService['fetchChecklist']>>,
  sourceText: string,
  limit: number,
) {
  const sourceTokens = new Set(tokenize(sourceText))
  const scored = checklist.map((item) => {
    const itemTokens = new Set(tokenize(`${item.productName} ${item.workCategory}`))
    let score = 0
    for (const token of itemTokens) {
      if (sourceTokens.has(token)) score += 1
    }
    return { item, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const positives = scored.filter((entry) => entry.score > 0).slice(0, limit).map((entry) => entry.item)
  if (positives.length > 0) return positives
  return checklist.slice(0, limit)
}

function toFirestorePatch(patch: ProposalPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (patch.taskName !== undefined) {
    update.taskName = patch.taskName
  }
  if (patch.workCategory !== undefined) {
    update.workCategory = patch.workCategory
  }
  if (hasOwn(patch as Record<string, unknown>, 'dueDate')) {
    update.dueDate = patch.dueDate === null ? FieldValue.delete() : patch.dueDate
  }

  return update
}

function omitUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

function toResponseProposal(id: string, data: any) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate().toISOString() : data.approvedAt,
  }
}

function runWithCors(handler: (req: any, res: any) => Promise<void> | void) {
  return onRequest({ region: config.region }, (req: any, res: any) => {
    corsHandler(req, res, async () => {
      try {
        await handler(req, res)
      } catch (error) {
        logger.error(error)
        res.status(500).json({ error: 'internal_error' })
      }
    })
  })
}

function buildNotionAccessHints(diagnosis: Awaited<ReturnType<NotionService['diagnoseAccess']>>): string[] {
  const checks = [diagnosis.projectDb, diagnosis.checklistDb, diagnosis.taskDb]
  const failed = checks.filter((item) => !item.ok)
  if (failed.length === 0) {
    return ['Notion API 연결 정상: 3개 DB 모두 접근 가능합니다.']
  }

  const hints: string[] = []
  if (failed.some((item) => item.errorCode === 'object_not_found')) {
    hints.push('DB 링크를 알고 있어도 Integration에 해당 DB를 Share하지 않으면 접근할 수 없습니다.')
    hints.push('각 DB 페이지에서 우측 상단 Share -> Invite에서 Integration을 추가하세요.')
  }
  if (failed.some((item) => item.errorCode === 'unauthorized')) {
    hints.push('NOTION_TOKEN이 만료되었거나 다른 워크스페이스 토큰일 수 있습니다. 새 Integration 토큰으로 교체하세요.')
  }
  if (hints.length === 0) {
    hints.push('DB ID가 정확한지, 그리고 Integration이 해당 DB에 초대되어 있는지 확인하세요.')
  }

  return hints
}

export const syncNewProjects = onSchedule(
  {
    region: config.region,
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Seoul',
  },
  async () => {
    const projects = await notion.fetchProjects()
    const checklist = await notion.fetchChecklist()

    const stateRef = db.collection('sync_state').doc(config.syncDocId)
    const stateSnap = await stateRef.get()

    const currentProjectIds = projects.map((project) => project.id)

    if (!stateSnap.exists) {
      await stateRef.set({
        last_seen_project_ids: currentProjectIds,
        updatedAt: FieldValue.serverTimestamp(),
      })
      logger.info('Initial sync state created; skipping proposal generation for baseline.')
      return
    }

    const knownProjectIds = new Set((stateSnap.data()?.last_seen_project_ids ?? []) as string[])
    const newProjects = projects.filter((project) => !knownProjectIds.has(project.id))

    if (newProjects.length === 0) {
      await stateRef.update({
        last_seen_project_ids: currentProjectIds,
        updatedAt: FieldValue.serverTimestamp(),
      })
      logger.info('No new projects detected.')
      return
    }

    const batch = db.batch()
    const proposalsCol = db.collection('proposals')

    for (const project of newProjects) {
      const filteredChecklist = checklist.filter((item) => {
        if (project.categories.length === 0) return true
        if (item.eventCategories.length === 0) return true
        return item.eventCategories.some((category) => project.categories.includes(category))
      })

      for (const item of filteredChecklist) {
        const ruleOffset = resolveOffsetByRuleTable(item.workCategory)
        const parserSuggestion = parseFinalDueText(item.finalDueText)
        const dueDate = calculateDueDateFromEvent(project.eventDate, ruleOffset)

        const proposal: ProposalRecord = {
          status: 'pending',
          projectId: project.id,
          projectName: project.name,
          projectCategory: project.categories[0],
          checklistItemId: item.id,
          eventCategories: item.eventCategories,
          taskName: item.productName,
          workCategory: item.workCategory,
          finalDueText: item.finalDueText,
          dueDate,
          deadlineBasis: 'event_date',
          offsetDays: ruleOffset,
          dueDateSource: 'rule_table',
          aiDeadlineSuggestion: parserSuggestion
            ? {
                deadlineBasis: 'event_date',
                offsetDays: parserSuggestion.offsetDays,
              }
            : undefined,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }

        const docRef = proposalsCol.doc()
        batch.set(docRef, omitUndefinedValues(proposal as unknown as Record<string, unknown>))
      }
    }

    batch.update(stateRef, {
      last_seen_project_ids: currentProjectIds,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()
    logger.info(`Created proposals for ${newProjects.length} new project(s).`)
  },
)

export const listPendingProposals = runWithCors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const snapshot = await db
    .collection('proposals')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .get()

  res.json({
    proposals: snapshot.docs.map((doc: any) => toResponseProposal(doc.id, doc.data())),
  })
})

export const diagnoseNotionAccess = runWithCors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const diagnosis = await notion.diagnoseAccess()
  const checks = [diagnosis.projectDb, diagnosis.checklistDb, diagnosis.taskDb]
  const ok = checks.every((item) => item.ok)

  res.json({
    ok,
    checks: diagnosis,
    hints: buildNotionAccessHints(diagnosis),
  })
})

export const listChecklistCategories = runWithCors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const checklist = await notion.fetchChecklist()
  res.json({
    ok: true,
    categories: uniqueCategoriesFromChecklist(checklist),
  })
})

const uploadProjectCsvHandler = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const fileNameRaw = req.body?.fileName
  const mimeTypeRaw = req.body?.mimeType
  const contentBase64Raw = req.body?.contentBase64
  const revisionRole = parseRevisionRole(req.body?.revisionRole)

  let fileName: string
  let contentBase64: string

  try {
    fileName = sanitizeFileName(fileNameRaw)
    contentBase64 = parseBase64FromBody(contentBase64Raw)
  } catch (error: any) {
    res.status(400).json({ error: error?.message ?? 'invalid_request' })
    return
  }

  const mimeType = typeof mimeTypeRaw === 'string' && mimeTypeRaw.trim() ? mimeTypeRaw.trim() : 'text/csv'
  const looksCsvByName = fileName.toLowerCase().endsWith('.csv')
  if (!looksCsvByName && !isLikelyCsvMimeType(mimeType)) {
    res.status(400).json({ error: 'csv_only', message: 'CSV 파일만 업로드할 수 있습니다.' })
    return
  }

  let fileBytes: Buffer
  try {
    fileBytes = Buffer.from(contentBase64, 'base64')
  } catch {
    res.status(400).json({ error: 'invalid_base64' })
    return
  }

  if (!fileBytes.length) {
    res.status(400).json({ error: 'empty_file' })
    return
  }
  if (fileBytes.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: 'file_too_large', maxBytes: MAX_UPLOAD_BYTES })
    return
  }

  const csvText = fileBytes.toString('utf8').replace(/\u0000/g, '')
  if (!csvText.trim()) {
    res.status(400).json({ error: 'empty_csv', message: 'CSV 본문이 비어 있습니다.' })
    return
  }

  const normalizedRows = normalizeRowsFromCsvText(csvText, fileName)
  const extractedEvents = toExtractedEventsFromNormalizedRows(normalizedRows)
  const candidateProjectName = inferProjectNameFromFileName(fileName)
  const candidateEventDate =
    inferEventDateFromNormalizedRows(normalizedRows) ?? inferEventDateFromText(`${fileName}\n${csvText}`)
  const extractedTextPreview = csvText.slice(0, MAX_TEXT_PREVIEW_CHARS)

  const now = FieldValue.serverTimestamp()
  const uploadRef = db.collection(UPLOADS_COLLECTION).doc()
  await uploadRef.set({
    status: 'uploaded',
    source: 'manual_csv_upload',
    fileName,
    mimeType,
    sizeBytes: fileBytes.length,
    sha256: createHash('sha256').update(fileBytes).digest('hex'),
    extracted: true,
    extractedTextPreview,
    candidateProjectName,
    candidateEventDate: candidateEventDate ?? null,
    extractedEvents: extractedEvents.map((event) => ({
      key: event.key,
      name: event.name,
      date: event.date ?? null,
      raw: event.raw,
    })),
    normalizedRows: normalizedRows.map((row) => ({
      rowId: row.rowId,
      month: row.month ?? null,
      dateText: row.dateText ?? null,
      country: row.country ?? null,
      city: row.city ?? null,
      eventName: row.eventName,
      purpose: row.purpose ?? null,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      raw: row.raw,
      confidence: row.confidence,
    })),
    revisionRole: revisionRole ?? null,
    createdAt: now,
    updatedAt: now,
  })

  res.json({
    ok: true,
    uploadId: uploadRef.id,
    received: {
      fileName,
      sizeBytes: fileBytes.length,
    },
    revisionRole: revisionRole ?? null,
    extractedEventCount: extractedEvents.length,
    normalizedRowCount: normalizedRows.length,
    normalizedRowsPreview: normalizedRows.slice(0, 30),
    extractionStatus: normalizedRows.length > 0 ? 'ok' : 'no_rows',
    extractionHint:
      normalizedRows.length > 0
        ? null
        : 'CSV 컬럼을 확인하세요. name + (startdate/enddate 또는 date)가 필요합니다.',
    next: 'Use POST /compareRevisionsAndGenerateProposals for previous/current diff flow',
  })
})

export const uploadProjectCsv = uploadProjectCsvHandler
// Backward-compatible alias. Keep old endpoint alive during migration.
export const uploadProjectPdf = uploadProjectCsvHandler

const getUploadNormalizedRowsHandler = runWithCors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const uploadId = typeof req.query?.uploadId === 'string' ? req.query.uploadId.trim() : ''
  if (!uploadId) {
    res.status(400).json({ error: 'upload_id_required' })
    return
  }

  const snap = await db.collection(UPLOADS_COLLECTION).doc(uploadId).get()
  if (!snap.exists) {
    res.status(404).json({ error: 'upload_not_found' })
    return
  }

  const data = (snap.data() ?? {}) as PdfUploadDoc
  const normalizedRows = parseStoredNormalizedRows(data.normalizedRows)

  res.json({
    ok: true,
    uploadId,
    fileName: data.fileName ?? null,
    revisionRole: data.revisionRole ?? null,
    normalizedRowCount: normalizedRows.length,
    rows: normalizedRows,
    extractedTextPreview: (data.extractedTextPreview ?? '').slice(0, MAX_TEXT_PREVIEW_CHARS),
  })
})

export const getUploadNormalizedRows = getUploadNormalizedRowsHandler
// Backward-compatible alias. Keep old endpoint alive during migration.
export const getPdfUploadNormalizedRows = getUploadNormalizedRowsHandler

export const generateProposalsFromUpload = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const uploadId = typeof req.body?.uploadId === 'string' ? req.body.uploadId.trim() : ''
    const rawLimit = Number(req.body?.limit ?? 5)
    const limit = Number.isFinite(rawLimit) ? Math.min(20, Math.max(1, Math.floor(rawLimit))) : 5

    if (!uploadId) {
      res.status(400).json({ error: 'upload_id_required' })
      return
    }

    const uploadRef = db.collection(UPLOADS_COLLECTION).doc(uploadId)
    const uploadSnap = await uploadRef.get()
    if (!uploadSnap.exists) {
      res.status(404).json({ error: 'upload_not_found' })
      return
    }

    const uploadData = (uploadSnap.data() ?? {}) as PdfUploadDoc
    const fileName = uploadData.fileName || `upload-${uploadId}.csv`
    const extractedTextPreview = uploadData.extractedTextPreview || ''
    const projectName = uploadData.candidateProjectName || inferProjectNameFromFileName(fileName)
    const eventDate = uploadData.candidateEventDate || inferEventDateFromText(`${fileName}\n${extractedTextPreview}`)

    const existingGenerated = await db
      .collection('proposals')
      .where('sourceUploadId', '==', uploadId)
      .where('status', '==', 'pending')
      .get()
    if (!existingGenerated.empty) {
      res.json({
        ok: true,
        uploadId,
        created: 0,
        reusedPending: existingGenerated.size,
        projectNameCandidate: projectName,
        eventDateCandidate: eventDate ?? null,
        message: 'existing_pending_proposals_reused',
      })
      return
    }

    const checklist = await notion.fetchChecklist()
    if (checklist.length === 0) {
      res.status(400).json({ error: 'empty_checklist' })
      return
    }

    const sourceText = `${fileName}\n${projectName}\n${extractedTextPreview}`
    const selectedChecklist = pickChecklistByRoughAi(checklist, sourceText, limit)

    const now = FieldValue.serverTimestamp()
    const batch = db.batch()
    const createdIds: string[] = []

    for (const item of selectedChecklist) {
      const ruleOffset = resolveOffsetByRuleTable(item.workCategory)
      const parserSuggestion = parseFinalDueText(item.finalDueText)
      const dueDate = calculateDueDateFromEvent(eventDate, ruleOffset)

      const proposal: ProposalRecord & {
        sourceType: 'csv_ai'
        sourceUploadId: string
        requiresProjectMapping: true
      } = {
        status: 'pending',
        projectId: `csv_upload:${uploadId}`,
        projectName,
        projectCategory: undefined,
        checklistItemId: item.id,
        eventCategories: item.eventCategories,
        taskName: item.productName,
        workCategory: item.workCategory || '기타',
        finalDueText: item.finalDueText,
        dueDate,
        deadlineBasis: 'event_date',
        offsetDays: ruleOffset,
        dueDateSource: 'rule_table',
        aiDeadlineSuggestion: parserSuggestion
          ? {
              deadlineBasis: 'event_date',
              offsetDays: parserSuggestion.offsetDays,
            }
          : undefined,
        sourceType: 'csv_ai',
        sourceUploadId: uploadId,
        requiresProjectMapping: true,
        createdAt: now,
        updatedAt: now,
      }

      const proposalRef = db.collection('proposals').doc()
      createdIds.push(proposalRef.id)
      batch.set(proposalRef, omitUndefinedValues(proposal as unknown as Record<string, unknown>))
    }

    batch.update(uploadRef, {
      status: 'generated',
      generatedProposalCount: createdIds.length,
      generatedAt: now,
      updatedAt: now,
    })

    await batch.commit()

    res.json({
      ok: true,
      uploadId,
      created: createdIds.length,
      proposalIds: createdIds,
      projectNameCandidate: projectName,
      eventDateCandidate: eventDate ?? null,
      message: 'rough_ai_generation_completed',
    })
  } catch (error: any) {
    logger.error('generateProposalsFromUpload_failed', error)
    res.status(500).json({
      error: 'generate_proposals_failed',
      message: error?.message ?? 'unknown_error',
    })
  }
})

export const compareRevisionsAndGenerateProposals = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const previousUploadId = typeof req.body?.previousUploadId === 'string' ? req.body.previousUploadId.trim() : ''
    const currentUploadId = typeof req.body?.currentUploadId === 'string' ? req.body.currentUploadId.trim() : ''
    const previewOnly = parsePreviewOnly(req.body?.previewOnly)
    const rawLimit = Number(req.body?.limit ?? 3)
    const limitPerEvent = Number.isFinite(rawLimit) ? Math.min(10, Math.max(1, Math.floor(rawLimit))) : 3

    if (!previousUploadId || !currentUploadId) {
      res.status(400).json({ error: 'previous_and_current_upload_id_required' })
      return
    }

    const previousRef = db.collection(UPLOADS_COLLECTION).doc(previousUploadId)
    const currentRef = db.collection(UPLOADS_COLLECTION).doc(currentUploadId)
    const [previousSnap, currentSnap] = await Promise.all([previousRef.get(), currentRef.get()])

    if (!previousSnap.exists || !currentSnap.exists) {
      res.status(404).json({ error: 'upload_not_found' })
      return
    }

    const previousData = (previousSnap.data() ?? {}) as PdfUploadDoc
    const currentData = (currentSnap.data() ?? {}) as PdfUploadDoc

    const previousName = previousData.candidateProjectName || inferProjectNameFromFileName(previousData.fileName || 'previous.csv')
    const currentName = currentData.candidateProjectName || inferProjectNameFromFileName(currentData.fileName || 'current.csv')

    const previousStoredRows = parseStoredNormalizedRows(previousData.normalizedRows)
    const previousStoredEvents = parseStoredEvents(previousData.extractedEvents)
    const previousEvents =
      previousStoredRows.length > 0
        ? toExtractedEventsFromNormalizedRows(previousStoredRows)
        : previousStoredEvents.length > 0
        ? previousStoredEvents
        : extractEventCandidatesFromText(
            previousData.extractedTextPreview || '',
            previousName,
            previousData.candidateEventDate || undefined,
            false,
          )
    const currentStoredRows = parseStoredNormalizedRows(currentData.normalizedRows)
    const currentStoredEvents = parseStoredEvents(currentData.extractedEvents)
    const currentEvents =
      currentStoredRows.length > 0
        ? toExtractedEventsFromNormalizedRows(currentStoredRows)
        : currentStoredEvents.length > 0
        ? currentStoredEvents
        : extractEventCandidatesFromText(
            currentData.extractedTextPreview || '',
            currentName,
            currentData.candidateEventDate || undefined,
            false,
          )

    const diff = compareExtractedEvents(previousEvents, currentEvents)
    const previousRowByKey = buildNormalizedRowByEventKey(previousStoredRows)
    const currentRowByKey = buildNormalizedRowByEventKey(currentStoredRows)
    const diffDetails = buildDiffDetails(diff, previousRowByKey, currentRowByKey)
    const baseSummary = {
      addedEvents: diff.added.length,
      changedEvents: diff.changed.length,
      removedEvents: diff.removed.length,
      createdProposals: 0,
      updatedProposals: 0,
      limitPerEvent,
    }

    if (previewOnly) {
      res.json({
        ok: true,
        previewOnly: true,
        previousUploadId,
        currentUploadId,
        summary: baseSummary,
        normalized: {
          previousRows: previousStoredRows.length,
          currentRows: currentStoredRows.length,
        },
        diffDetails,
      })
      return
    }

    const checklist = await notion.fetchChecklist()
    if (checklist.length === 0) {
      res.status(400).json({ error: 'empty_checklist' })
      return
    }

    const pendingSnapshot = await db.collection('proposals').where('status', '==', 'pending').get()
    const pendingByEventKey = new Map<string, Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>>()
    for (const doc of pendingSnapshot.docs) {
      const data = doc.data() as Record<string, unknown>
      const eventKey = typeof data.sourceEventKey === 'string' ? normalizeEventKey(data.sourceEventKey) : ''
      if (!eventKey) continue
      if (!pendingByEventKey.has(eventKey)) pendingByEventKey.set(eventKey, [])
      pendingByEventKey.get(eventKey)!.push({ ref: doc.ref, data })
    }

    const batch = db.batch()
    let writeCount = 0
    let createdProposals = 0
    let updatedProposals = 0
    const now = FieldValue.serverTimestamp()

    const queueSet = (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
      batch.set(ref, data)
      writeCount += 1
    }
    const queueUpdate = (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) => {
      batch.update(ref, data)
      writeCount += 1
    }

    const createProposalsForEvent = (event: ExtractedEvent, sourceDiffType: 'added' | 'changed') => {
      const eventSourceText = `${event.name}\n${event.raw}\n${currentData.extractedTextPreview || ''}`
      const selectedChecklist = pickChecklistByRoughAi(checklist, eventSourceText, limitPerEvent)
      const existing = pendingByEventKey.get(event.key) ?? []
      const existingChecklistIds = new Set(
        existing
          .map((row) => (typeof row.data.checklistItemId === 'string' ? row.data.checklistItemId : ''))
          .filter(Boolean),
      )

      for (const item of selectedChecklist) {
        if (existingChecklistIds.has(item.id)) continue

        const ruleOffset = resolveOffsetByRuleTable(item.workCategory)
        const parserSuggestion = parseFinalDueText(item.finalDueText)
        const dueDate = calculateDueDateFromEvent(event.date, ruleOffset)

        const proposal: ProposalRecord & {
          sourceType: 'csv_diff_ai'
          sourceUploadId: string
          sourceEventKey: string
          sourceEventDate?: string | null
          sourceDiffType: 'added' | 'changed'
          requiresProjectMapping: true
          revisionPreviousUploadId: string
          revisionCurrentUploadId: string
        } = {
          status: 'pending',
          projectId: `csv_event:${event.key}`,
          projectName: event.name,
          projectCategory: undefined,
          checklistItemId: item.id,
          eventCategories: item.eventCategories,
          taskName: item.productName,
          workCategory: item.workCategory || '기타',
          finalDueText: item.finalDueText,
          dueDate,
          deadlineBasis: 'event_date',
          offsetDays: ruleOffset,
          dueDateSource: 'rule_table',
          aiDeadlineSuggestion: parserSuggestion
            ? {
                deadlineBasis: 'event_date',
                offsetDays: parserSuggestion.offsetDays,
              }
            : undefined,
          sourceType: 'csv_diff_ai',
          sourceUploadId: currentUploadId,
          sourceEventKey: event.key,
          sourceEventDate: event.date ?? null,
          sourceDiffType,
          requiresProjectMapping: true,
          revisionPreviousUploadId: previousUploadId,
          revisionCurrentUploadId: currentUploadId,
          createdAt: now,
          updatedAt: now,
        }

        const proposalRef = db.collection('proposals').doc()
        queueSet(proposalRef, omitUndefinedValues(proposal as unknown as Record<string, unknown>))
        createdProposals += 1
      }
    }

    for (const event of diff.added) {
      createProposalsForEvent(event, 'added')
    }

    for (const changed of diff.changed) {
      const event = changed.current
      const existing = pendingByEventKey.get(event.key) ?? []

      if (existing.length > 0) {
        for (const row of existing) {
          const currentOffset =
            typeof row.data.offsetDays === 'number'
              ? row.data.offsetDays
              : resolveOffsetByRuleTable(typeof row.data.workCategory === 'string' ? row.data.workCategory : '')
          const nextDueDate = calculateDueDateFromEvent(event.date, currentOffset)
          const updatePayload: Record<string, unknown> = {
            updatedAt: now,
            sourceUploadId: currentUploadId,
            sourceDiffType: 'changed',
            sourceEventDate: event.date ?? null,
            revisionPreviousUploadId: previousUploadId,
            revisionCurrentUploadId: currentUploadId,
          }
          if (nextDueDate) {
            updatePayload.dueDate = nextDueDate
          } else {
            updatePayload.dueDate = FieldValue.delete()
          }
          queueUpdate(row.ref, updatePayload)
          updatedProposals += 1
        }
      } else {
        createProposalsForEvent(event, 'changed')
      }
    }

    const summary = {
      addedEvents: diff.added.length,
      changedEvents: diff.changed.length,
      removedEvents: diff.removed.length,
      createdProposals,
      updatedProposals,
      limitPerEvent,
    }

    const diffRef = db.collection('revision_diffs').doc()
    queueSet(diffRef, {
      previousUploadId,
      currentUploadId,
      summary,
      addedEventKeys: diff.added.map((event) => event.key),
      changedEventKeys: diff.changed.map((event) => event.key),
      removedEventKeys: diff.removed.map((event) => event.key),
      createdAt: now,
    })

    queueUpdate(currentRef, {
      status: 'compared',
      comparedWithUploadId: previousUploadId,
      compareSummary: summary,
      updatedAt: now,
    })

    if (writeCount > 0) {
      await batch.commit()
    }

    res.json({
      ok: true,
      previewOnly: false,
      previousUploadId,
      currentUploadId,
      summary,
      normalized: {
        previousRows: previousStoredRows.length,
        currentRows: currentStoredRows.length,
      },
      diffDetails,
      sample: {
        added: diff.added.slice(0, 5).map((event) => ({ key: event.key, name: event.name, date: event.date ?? null })),
        changed: diff.changed
          .slice(0, 5)
          .map((event) => ({ key: event.key, fromDate: event.previous.date ?? null, toDate: event.current.date ?? null })),
      },
    })
  } catch (error: any) {
    logger.error('compareRevisionsAndGenerateProposals_failed', error)
    res.status(500).json({
      error: 'compare_revisions_failed',
      message: error?.message ?? 'unknown_error',
    })
  }
})

export const updateProposal = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { proposalId, patch } = req.body ?? {}
  if (!proposalId || !patch) {
    res.status(400).json({ error: 'missing_proposal_id_or_patch' })
    return
  }

  let sanitizedPatch: ProposalPatch
  try {
    sanitizedPatch = sanitizeProposalPatch(patch)
  } catch (error: any) {
    res.status(400).json({ error: error?.message ?? 'invalid_patch' })
    return
  }

  if (Object.keys(sanitizedPatch).length === 0) {
    res.status(400).json({ error: 'empty_patch' })
    return
  }

  await db.collection('proposals').doc(proposalId).update(toFirestorePatch(sanitizedPatch))

  res.json({ ok: true })
})

export const updateProjectCategory = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const projectId = sanitizeOptionalText(req.body?.projectId)
  const projectCategory = sanitizeOptionalText(req.body?.projectCategory)

  if (!projectId) {
    res.status(400).json({ error: 'missing_project_id' })
    return
  }

  const snapshot = await db.collection('proposals').where('projectId', '==', projectId).get()
  const pendingDocs = snapshot.docs.filter((doc) => (doc.data() as Record<string, unknown>).status === 'pending')

  if (pendingDocs.length === 0) {
    res.json({ ok: true, projectId, projectCategory: projectCategory ?? null, updated: 0 })
    return
  }

  const checklist = await notion.fetchChecklist()
  const checklistCategoriesById = new Map<string, string[]>()
  for (const item of checklist) {
    checklistCategoriesById.set(item.id, item.eventCategories.map((value) => value.trim()).filter(Boolean))
  }

  const batch = db.batch()
  const now = FieldValue.serverTimestamp()
  for (const doc of pendingDocs) {
    const data = doc.data() as Record<string, unknown>
    const checklistItemId = typeof data.checklistItemId === 'string' ? data.checklistItemId : ''
    const eventCategories = checklistCategoriesById.get(checklistItemId) ?? []

    const payload: Record<string, unknown> = {
      projectCategory: projectCategory ?? FieldValue.delete(),
      updatedAt: now,
    }
    if (eventCategories.length > 0) {
      payload.eventCategories = eventCategories
    } else if (!Array.isArray(data.eventCategories)) {
      payload.eventCategories = []
    }
    batch.update(doc.ref, payload)
  }
  await batch.commit()

  res.json({
    ok: true,
    projectId,
    projectCategory: projectCategory ?? null,
    availableCategories: uniqueCategoriesFromChecklist(checklist),
    updated: pendingDocs.length,
  })
})

export const deleteProposal = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const proposalId = typeof req.body?.proposalId === 'string' ? req.body.proposalId.trim() : ''
  if (!proposalId) {
    res.status(400).json({ error: 'missing_proposal_id' })
    return
  }

  const proposalRef = db.collection('proposals').doc(proposalId)
  const snap = await proposalRef.get()
  if (!snap.exists) {
    res.status(404).json({ error: 'proposal_not_found' })
    return
  }

  await proposalRef.set(
    {
      status: 'deleted',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  res.json({ ok: true, proposalId })
})

export const approveProposals = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const proposalIds = (req.body?.proposalIds ?? []) as string[]
  const overrides = (req.body?.overrides ?? {}) as Record<string, Partial<ProposalRecord>>

  if (proposalIds.length === 0) {
    res.status(400).json({ error: 'proposal_ids_required' })
    return
  }

  const results: Array<{ proposalId: string; notionTaskId: string; notionTaskUrl: string }> = []

  for (const proposalId of proposalIds) {
    const proposalRef = db.collection('proposals').doc(proposalId)
    const proposalSnap = await proposalRef.get()

    if (!proposalSnap.exists) {
      continue
    }

    const proposal = proposalSnap.data() as ProposalRecord
    if (proposal.status !== 'pending') {
      continue
    }

    if (typeof proposal.projectId === 'string' && /^(pdf_|csv_)/.test(proposal.projectId)) {
      res.status(400).json({
        error: 'project_mapping_required',
        proposalId,
        message: '업로드 기반 AI 제안은 Notion 프로젝트 매핑 후 승인할 수 있습니다.',
      })
      return
    }

    let override: ProposalPatch = {}
    const rawOverride = overrides[proposalId]
    if (rawOverride) {
      try {
        override = sanitizeProposalPatch(rawOverride)
      } catch (error: any) {
        res.status(400).json({ error: error?.message ?? 'invalid_override', proposalId })
        return
      }
    }

    const taskName = override.taskName ?? proposal.taskName
    const workCategory = override.workCategory ?? proposal.workCategory
    const dueDate = hasOwn(override as Record<string, unknown>, 'dueDate')
      ? (override.dueDate ?? undefined)
      : proposal.dueDate

    const created = await notion.createTask({
      taskName,
      workCategory,
      projectPageId: proposal.projectId,
      dueDate,
      statusName: '진행 전',
    })

    await proposalRef.update({
      ...toFirestorePatch(override),
      status: 'approved',
      notionTaskPageId: created.id,
      notionTaskPageUrl: created.url,
      approvedAt: FieldValue.serverTimestamp(),
    })

    results.push({
      proposalId,
      notionTaskId: created.id,
      notionTaskUrl: created.url,
    })
  }

  res.json({ ok: true, approved: results })
})

export { api } from './workApi'
