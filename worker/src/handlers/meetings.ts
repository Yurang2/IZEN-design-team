import { NotionApi } from '../notionApi'
import type {
  Env,
} from '../types'
import {
  asString,
  assemblyRequest,
  buildMeetingAudioKey,
  DEFAULT_ASSEMBLY_SPEECH_MODELS,
  DEFAULT_MAX_SPEAKERS,
  DEFAULT_MIN_SPEAKERS,
  DEFAULT_OPENAI_SUMMARY_MODEL,
  delay,
  encodeR2ObjectKey,
  encodeRfc3986,
  extractFilenameFromAudioKey,
  FIXED_MEETING_NOTION_DB_ID,
  getAssemblyWebhookSecret,
  getMeetingAudioBucket,
  getMeetingNotionDbId,
  LARGE_NOTION_IMPORT_POLL_ATTEMPTS,
  LARGE_NOTION_IMPORT_POLL_MS,
  MAX_ALLOWED_SPEAKERS,
  MAX_MEETING_KEYWORD_LIMIT,
  MAX_NOTION_FILE_UPLOAD_BYTES,
  MAX_SUMMARY_SOURCE_CHARS,
  MAX_TRANSCRIPT_PARAGRAPH_CHARS,
  MAX_TRANSCRIPT_PARAGRAPH_LINES,
  MAX_TRANSCRIPT_REPLACEMENT_ARCHIVE_BLOCKS,
  MEETING_AUDIO_PREFIX,
  MEETING_NOTION_SCHEMA_CACHE_MS,
  MeetingUploadEventBody,
  MIN_ALLOWED_SPEAKERS,
  MIN_MEETING_KEYWORD_LIMIT,
  normalizeAudioContentType,
  normalizeUtterances,
  notionPageUrl,
  NOTION_MULTIPART_CHUNK_BYTES,
  NOTION_MULTIPART_COMPLETE_POLL_ATTEMPTS,
  NOTION_MULTIPART_COMPLETE_POLL_MS,
  NOTION_MULTIPART_MAX_BYTES,
  NOTION_MULTIPART_MIN_BYTES,
  NOTION_RICH_TEXT_CHUNK,
  parseBoundedInt,
  parseBoundedLimit,
  parseAssemblySpeechModels,
  parseIsoDate,
  parseMeetingKeywordLimit,
  parseMeetingTitleMetadata,
  parsePatchBody,
  R2_PRESIGN_ALGORITHM,
  R2_PRESIGN_REGION,
  R2_PRESIGN_SERVICE,
  R2_UNSIGNED_PAYLOAD,
  readFlexibleJsonBody,
  readJsonBody,
  requireMeetingsDb,
  sha256Hex,
  signHmacSha256,
  isSimpleAlphabetDisplayName,
  isValidMeetingAudioKey,
  SpeakerMappingInput,
  stripMeetingUploadKeyPrefix,
  SUMMARY_OUTPUT_TOKENS,
  SUMMARY_RETRY_OUTPUT_TOKENS,
  SUMMARY_RETRY_SOURCE_CHARS,
  ISO_DATE_RE,
  serializeRichTextPlainText,
  toHex,
  toUtteranceTimestampRange,
  TRANSCRIPT_POLL_LIMIT,
  truncateText,
  UPLOAD_SESSION_LIST_LIMIT,
  DEFAULT_MEETING_AUDIO_BUCKET_NAME,
} from '../utils'
import {
  createMeetingUploadToken,
  verifyMeetingUploadToken,
} from '../auth'

// ---- Module-level mutable state ----

let meetingDbInitInFlight: Promise<void> | null = null
let meetingNotionSchemaCache: { databaseId: string; titlePropertyName: string; datePropertyName: string; checkedAt: number } | null = null

// ---- Body parsers ----

function parseMeetingTranscriptBody(body: unknown): {
  key: string
  title: string
  meetingDate: string | null
  minSpeakers: number
  maxSpeakers: number
  keywordSetId: string | null
  uploadId: string | null
} {
  const payload = parsePatchBody(body)
  const key = asString(payload.key)
  if (!key) throw new Error('key_required')
  if (!isValidMeetingAudioKey(key)) throw new Error('key_invalid')

  const fallbackTitle = stripMeetingUploadKeyPrefix(key.split('/').pop() ?? '회의록')
  const titleInput = asString(payload.title) ?? fallbackTitle
  const parsedTitle = parseMeetingTitleMetadata(titleInput)
  const minSpeakersRaw = Number(payload.minSpeakers ?? DEFAULT_MIN_SPEAKERS)
  const maxSpeakersRaw = Number(payload.maxSpeakers ?? DEFAULT_MAX_SPEAKERS)

  if (!Number.isFinite(minSpeakersRaw) || !Number.isFinite(maxSpeakersRaw)) {
    throw new Error('speaker_range_invalid')
  }

  const minSpeakers = Math.max(MIN_ALLOWED_SPEAKERS, Math.min(MAX_ALLOWED_SPEAKERS, Math.floor(minSpeakersRaw)))
  const maxSpeakers = Math.max(MIN_ALLOWED_SPEAKERS, Math.min(MAX_ALLOWED_SPEAKERS, Math.floor(maxSpeakersRaw)))
  if (maxSpeakers < minSpeakers) {
    throw new Error('speaker_range_invalid')
  }

  return {
    key,
    title: parsedTitle.title.slice(0, 200),
    meetingDate: parsedTitle.meetingDate,
    minSpeakers,
    maxSpeakers,
    keywordSetId: asString(payload.keywordSetId) ?? null,
    uploadId: asString(payload.uploadId) ?? null,
  }
}

type MeetingUploadEventBodyLocal = {
  uploadId: string
  key: string
  token: string
  eventType: string
  stage: string | null
  state: string | null
  reasonCode: string | null
  reasonMessage: string | null
  elapsedMs: number | null
  payloadJson: string | null
}

function parseMeetingUploadEventBody(body: unknown): MeetingUploadEventBodyLocal {
  const payload = parsePatchBody(body)
  const uploadId = asString(payload.uploadId) ?? asString(payload.id)
  if (!uploadId) throw new Error('upload_id_required')

  const key = asString(payload.key)
  if (!key) throw new Error('key_required')
  if (!isValidMeetingAudioKey(key)) throw new Error('key_invalid')

  const token = asString(payload.token) ?? asString(payload.eventToken)
  if (!token) throw new Error('upload_event_token_required')

  const eventType = truncateText(asString(payload.eventType) ?? asString(payload.type) ?? 'client_event', 80) ?? 'client_event'
  const stage = normalizeUploadStage(asString(payload.stage))
  const state = normalizeUploadState(asString(payload.state))
  const reasonCode = truncateText(asString(payload.reasonCode) ?? asString(payload.reason), 80)
  const reasonMessage = truncateText(asString(payload.reasonMessage) ?? asString(payload.message), 600)

  let elapsedMs: number | null = null
  const elapsedCandidate = Number(payload.elapsedMs ?? payload.elapsed)
  if (Number.isFinite(elapsedCandidate) && elapsedCandidate >= 0) {
    elapsedMs = Math.min(Math.floor(elapsedCandidate), 86_400_000)
  }

  let payloadJson: string | null = null
  if (payload.payload !== undefined) {
    try {
      payloadJson = JSON.stringify(payload.payload).slice(0, 4000)
    } catch {
      payloadJson = truncateText(String(payload.payload), 4000)
    }
  }

  return {
    uploadId: uploadId.slice(0, 120),
    key,
    token,
    eventType,
    stage,
    state,
    reasonCode,
    reasonMessage,
    elapsedMs,
    payloadJson,
  }
}

function parseSpeakerMappingsBody(body: unknown): SpeakerMappingInput[] {
  const payload = parsePatchBody(body)
  const mappings: SpeakerMappingInput[] = []

  if (Array.isArray(payload.mappings)) {
    for (const row of payload.mappings) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue
      const item = row as Record<string, unknown>
      const speakerLabel = asString(item.speakerLabel) ?? asString(item.speaker) ?? ''
      const displayName = asString(item.displayName) ?? asString(item.name) ?? ''
      if (!speakerLabel || !displayName) continue
      if (isSimpleAlphabetDisplayName(displayName)) {
        throw new Error(`speaker_display_name_invalid_simple_alpha:${speakerLabel}`)
      }
      mappings.push({ speakerLabel: speakerLabel.slice(0, 40), displayName: displayName.slice(0, 120) })
    }
  } else {
    const speakerLabel = asString(payload.speakerLabel) ?? asString(payload.speaker) ?? ''
    const displayName = asString(payload.displayName) ?? asString(payload.name) ?? ''
    if (speakerLabel && displayName) {
      if (isSimpleAlphabetDisplayName(displayName)) {
        throw new Error(`speaker_display_name_invalid_simple_alpha:${speakerLabel}`)
      }
      mappings.push({ speakerLabel: speakerLabel.slice(0, 40), displayName: displayName.slice(0, 120) })
    }
  }

  if (mappings.length === 0) {
    throw new Error('speaker_mappings_required')
  }

  return mappings
}

function parseKeywordSetCreateBody(body: unknown): { name: string; isActive: boolean } {
  const payload = parsePatchBody(body)
  const name = asString(payload.name)
  if (!name) throw new Error('name_required')
  const isActive = payload.isActive === undefined ? true : Boolean(payload.isActive)
  return { name: name.slice(0, 120), isActive }
}

function parseKeywordSetPatchBody(body: unknown): { id: string; name?: string; isActive?: boolean } {
  const payload = parsePatchBody(body)
  const id = asString(payload.id)
  if (!id) throw new Error('id_required')
  const name = asString(payload.name)
  const hasIsActive = Object.prototype.hasOwnProperty.call(payload, 'isActive')
  const isActive = hasIsActive ? Boolean(payload.isActive) : undefined
  return {
    id,
    name: name?.slice(0, 120),
    isActive,
  }
}

function parseKeywordCreateBody(body: unknown): { setId: string; phrase: string; weight: number | null; tags: string | null } {
  const payload = parsePatchBody(body)
  const setId = asString(payload.setId)
  const phrase = asString(payload.phrase)
  if (!setId) throw new Error('setId_required')
  if (!phrase) throw new Error('phrase_required')
  const weightRaw = payload.weight
  const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) ? Math.max(0, Math.min(10, weightRaw)) : null
  const tags = asString(payload.tags) ?? null
  return {
    setId,
    phrase: phrase.slice(0, 200),
    weight,
    tags: tags?.slice(0, 400) ?? null,
  }
}

function parseKeywordPatchBody(body: unknown): { id: string; phrase?: string; weight?: number | null; tags?: string | null } {
  const payload = parsePatchBody(body)
  const id = asString(payload.id)
  if (!id) throw new Error('id_required')
  const phrase = asString(payload.phrase)
  const hasWeight = Object.prototype.hasOwnProperty.call(payload, 'weight')
  const weightRaw = payload.weight
  const weight = hasWeight
    ? weightRaw === null
      ? null
      : typeof weightRaw === 'number' && Number.isFinite(weightRaw)
        ? Math.max(0, Math.min(10, weightRaw))
        : undefined
    : undefined
  const hasTags = Object.prototype.hasOwnProperty.call(payload, 'tags')
  const tags = hasTags ? (asString(payload.tags) ?? null) : undefined

  return {
    id,
    phrase: phrase?.slice(0, 200),
    weight,
    tags: tags?.slice(0, 400) ?? null,
  }
}

// ---- D1 keyword/transcript helpers ----

async function listKeywordSets(env: Env): Promise<
  Array<{
    id: string
    name: string
    isActive: boolean
    createdAt: number
    keywordCount: number
  }>
> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const result = await db
    .prepare(
      `SELECT s.id, s.name, s.is_active, s.created_at, COUNT(k.id) AS keyword_count
       FROM keyword_sets s
       LEFT JOIN keywords k ON k.set_id = s.id
       GROUP BY s.id, s.name, s.is_active, s.created_at
       ORDER BY s.created_at DESC`,
    )
    .bind()
    .all<{
      id?: unknown
      name?: unknown
      is_active?: unknown
      created_at?: unknown
      keyword_count?: unknown
    }>()
  const rows = Array.isArray(result.results) ? result.results : []
  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    name: typeof row.name === 'string' ? row.name : '',
    isActive: Number(row.is_active ?? 0) === 1,
    createdAt: Number(row.created_at ?? 0),
    keywordCount: Number(row.keyword_count ?? 0),
  }))
}

async function listKeywords(env: Env, setId?: string): Promise<
  Array<{
    id: string
    setId: string
    phrase: string
    weight: number | null
    tags: string | null
    createdAt: number
  }>
> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const hasSetId = Boolean(setId)
  const query = hasSetId
    ? `SELECT id, set_id, phrase, weight, tags, created_at FROM keywords WHERE set_id = ? ORDER BY created_at DESC`
    : `SELECT id, set_id, phrase, weight, tags, created_at FROM keywords ORDER BY created_at DESC`
  const stmt = db.prepare(query)
  const result = hasSetId ? await stmt.bind(setId).all() : await stmt.bind().all()
  const rows = Array.isArray(result.results) ? result.results : []
  return rows.map((row) => ({
    id: typeof row.id === 'string' ? row.id : '',
    setId: typeof row.set_id === 'string' ? row.set_id : '',
    phrase: typeof row.phrase === 'string' ? row.phrase : '',
    weight: typeof row.weight === 'number' ? row.weight : row.weight === null ? null : null,
    tags: typeof row.tags === 'string' ? row.tags : row.tags === null ? null : null,
    createdAt: Number(row.created_at ?? 0),
  }))
}

async function readKeywordPhrasesBySetId(env: Env, setId: string | null): Promise<{ phrases: string[]; truncated: boolean; total: number }> {
  if (!setId) return { phrases: [], truncated: false, total: 0 }
  const keywords = await listKeywords(env, setId)
  const keywordLimit = parseMeetingKeywordLimit(env)
  const phrases = keywords
    .map((entry) => entry.phrase.trim())
    .filter(Boolean)
  const uniquePhrases = Array.from(new Set(phrases))
  return {
    phrases: uniquePhrases.slice(0, keywordLimit),
    truncated: uniquePhrases.length > keywordLimit,
    total: uniquePhrases.length,
  }
}

async function readSpeakerMap(env: Env, transcriptId: string): Promise<Record<string, string>> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const result = await db
    .prepare(
      `SELECT speaker_label, display_name
       FROM speaker_maps
       WHERE transcript_id = ?`,
    )
    .bind(transcriptId)
    .all<{
      speaker_label?: unknown
      display_name?: unknown
    }>()
  const rows = Array.isArray(result.results) ? result.results : []
  const map: Record<string, string> = {}
  for (const row of rows) {
    const speaker = asString(typeof row.speaker_label === 'string' ? row.speaker_label : undefined)
    const display = asString(typeof row.display_name === 'string' ? row.display_name : undefined)
    if (!speaker || !display) continue
    map[speaker] = display
  }
  return map
}

async function updateTranscriptFromAssembly(env: Env, assemblyId: string): Promise<void> {
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = asString(detail.status) ?? 'processing'
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)
  const now = Date.now()
  await db
    .prepare(
      `UPDATE transcripts
       SET status = ?, raw_json = ?, utterances_json = ?, text = ?, updated_at = ?, error_message = ?
       WHERE assembly_id = ?`,
    )
    .bind(
      status,
      JSON.stringify(detail),
      JSON.stringify(utterances),
      text,
      now,
      asString(detail.error) ?? null,
      assemblyId,
    )
    .run()
}

// ---- DB init ----

async function ensureMeetingDbTables(env: Env): Promise<void> {
  const db = requireMeetingsDb(env)
  if (meetingDbInitInFlight) {
    await meetingDbInitInFlight
    return
  }

  meetingDbInitInFlight = (async () => {
    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS meetings (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          audio_key TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS transcripts (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          assembly_id TEXT,
          status TEXT NOT NULL,
          raw_json TEXT,
          utterances_json TEXT,
          text TEXT,
          keywords_used_json TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS speaker_maps (
          transcript_id TEXT NOT NULL,
          speaker_label TEXT NOT NULL,
          display_name TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY(transcript_id, speaker_label)
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS keyword_sets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS keywords (
          id TEXT PRIMARY KEY,
          set_id TEXT NOT NULL,
          phrase TEXT NOT NULL,
          weight REAL,
          tags TEXT,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    try {
      await db.prepare(`ALTER TABLE transcripts ADD COLUMN keywords_used_json TEXT`).bind().run()
    } catch {}
    try {
      await db.prepare(`ALTER TABLE transcripts ADD COLUMN error_message TEXT`).bind().run()
    } catch {}

    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_transcripts_created_at
         ON transcripts(created_at DESC)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_transcripts_assembly_id
         ON transcripts(assembly_id)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_keywords_set_id
         ON keywords(set_id)`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS meeting_upload_sessions (
          id TEXT PRIMARY KEY,
          audio_key TEXT NOT NULL,
          filename TEXT NOT NULL,
          content_type TEXT,
          upload_mode TEXT,
          stage TEXT NOT NULL,
          state TEXT NOT NULL,
          reason_code TEXT,
          reason_message TEXT,
          transcript_id TEXT,
          meeting_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE TABLE IF NOT EXISTS meeting_upload_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          upload_id TEXT NOT NULL,
          audio_key TEXT NOT NULL,
          event_type TEXT NOT NULL,
          stage TEXT,
          state TEXT,
          reason_code TEXT,
          reason_message TEXT,
          elapsed_ms INTEGER,
          payload_json TEXT,
          created_at INTEGER NOT NULL
        )`,
      )
      .bind()
      .run()

    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_upload_sessions_updated_at
         ON meeting_upload_sessions(updated_at DESC)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_upload_sessions_audio_key
         ON meeting_upload_sessions(audio_key)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_upload_events_upload_id_created
         ON meeting_upload_events(upload_id, created_at DESC)`,
      )
      .bind()
      .run()
    await db
      .prepare(
        `CREATE INDEX IF NOT EXISTS idx_upload_events_created_at
         ON meeting_upload_events(created_at DESC)`,
      )
      .bind()
      .run()
  })()

  try {
    await meetingDbInitInFlight
  } catch (error) {
    meetingDbInitInFlight = null
    throw error
  }
}

// ---- R2 helpers ----

async function readR2ObjectForResponse(object: unknown): Promise<{ body: BodyInit; contentType?: string } | null> {
  if (!object || typeof object !== 'object') return null
  const value = object as {
    body?: BodyInit
    arrayBuffer?: () => Promise<ArrayBuffer>
    httpMetadata?: Record<string, unknown>
  }
  const httpMetadata = value.httpMetadata
  const contentType = asString(httpMetadata?.contentType)

  const stream = value.body
  if (stream && typeof stream === 'object') {
    return {
      body: stream,
      contentType,
    }
  }

  if (typeof value.arrayBuffer === 'function') {
    const buffer = await value.arrayBuffer()
    return {
      body: buffer,
      contentType,
    }
  }

  return null
}

function r2ObjectSize(object: unknown): number | null {
  if (!object || typeof object !== 'object') return null
  const size = (object as { size?: unknown }).size
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null
}

async function buildR2SigningKey(secretAccessKey: string, dateStamp: string): Promise<Uint8Array> {
  const dateKey = await signHmacSha256(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = await signHmacSha256(dateKey, R2_PRESIGN_REGION)
  const serviceKey = await signHmacSha256(regionKey, R2_PRESIGN_SERVICE)
  return signHmacSha256(serviceKey, 'aws4_request')
}

async function readR2ObjectAsArrayBuffer(object: unknown): Promise<{ bytes: ArrayBuffer; contentType?: string } | null> {
  if (!object || typeof object !== 'object') return null
  const value = object as {
    body?: BodyInit
    arrayBuffer?: () => Promise<ArrayBuffer>
    httpMetadata?: Record<string, unknown>
  }
  const httpMetadata = value.httpMetadata
  const contentType = asString(httpMetadata?.contentType)

  if (typeof value.arrayBuffer === 'function') {
    const bytes = await value.arrayBuffer()
    return { bytes, contentType }
  }

  const stream = value.body
  if (stream) {
    const bytes = await new Response(stream as BodyInit).arrayBuffer()
    return { bytes, contentType }
  }
  return null
}

async function readR2ObjectRangeAsArrayBuffer(
  bucket: NonNullable<Env['MEETING_AUDIO_BUCKET']>,
  key: string,
  offset: number,
  length: number,
): Promise<ArrayBuffer> {
  const ranged = await bucket.get(key, {
    range: {
      offset,
      length,
    },
  })
  if (!ranged) throw new Error('audio_not_found')
  const resolved = await readR2ObjectAsArrayBuffer(ranged)
  if (!resolved) throw new Error('audio_chunk_read_failed')
  return resolved.bytes
}

function getNotionMultipartChunkBytes(totalBytes: number): number {
  const requested = Math.min(NOTION_MULTIPART_MAX_BYTES, Math.max(NOTION_MULTIPART_MIN_BYTES, NOTION_MULTIPART_CHUNK_BYTES))
  if (totalBytes <= requested) return totalBytes
  const minimumParts = Math.ceil(totalBytes / NOTION_MULTIPART_MAX_BYTES)
  const target = Math.ceil(totalBytes / minimumParts)
  return Math.min(NOTION_MULTIPART_MAX_BYTES, Math.max(NOTION_MULTIPART_MIN_BYTES, target))
}

export async function createR2PresignedUrl(
  env: Env,
  key: string,
  method: 'GET' | 'PUT',
  options?: {
    expiresIn?: number
    contentType?: string
  },
): Promise<{ url: string; requiredHeaders?: Record<string, string> }> {
  const accountId = asString(env.R2_ACCOUNT_ID)
  if (!accountId) throw new Error('r2_presign_config_missing:R2_ACCOUNT_ID')
  const accessKeyId = asString(env.R2_ACCESS_KEY_ID)
  if (!accessKeyId) throw new Error('r2_presign_config_missing:R2_ACCESS_KEY_ID')
  const secretAccessKey = asString(env.R2_SECRET_ACCESS_KEY)
  if (!secretAccessKey) throw new Error('r2_presign_config_missing:R2_SECRET_ACCESS_KEY')
  const bucketName = asString(env.MEETING_AUDIO_BUCKET_NAME) ?? DEFAULT_MEETING_AUDIO_BUCKET_NAME
  const expiresIn = Math.max(1, Math.min(options?.expiresIn ?? 60 * 15, 60 * 60))
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const credentialScope = `${dateStamp}/${R2_PRESIGN_REGION}/${R2_PRESIGN_SERVICE}/aws4_request`
  const host = `${bucketName}.${accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodeR2ObjectKey(key)}`
  const query = new URLSearchParams({
    'X-Amz-Algorithm': R2_PRESIGN_ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  })
  const canonicalQuery = Array.from(query.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&')
  const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, 'host', R2_UNSIGNED_PAYLOAD].join('\n')
  const stringToSign = [R2_PRESIGN_ALGORITHM, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const signingKey = await buildR2SigningKey(secretAccessKey, dateStamp)
  const signature = toHex(await signHmacSha256(signingKey, stringToSign))
  query.set('X-Amz-Signature', signature)
  const url = `https://${host}${canonicalUri}?${query.toString()}`
  const requiredHeaders = options?.contentType ? { 'Content-Type': options.contentType } : undefined
  return {
    url,
    requiredHeaders,
  }
}

async function resolveMeetingUploadTarget(
  env: Env,
  key: string,
  contentType: string | undefined,
): Promise<{ url: string; requiredHeaders?: Record<string, string>; uploadMode: 'r2_presigned' }> {
  const signed = await createR2PresignedUrl(env, key, 'PUT', {
    expiresIn: 15 * 60,
    contentType,
  })
  return {
    url: signed.url,
    requiredHeaders: signed.requiredHeaders ?? {},
    uploadMode: 'r2_presigned',
  }
}

async function resolveMeetingFetchUrl(env: Env, key: string): Promise<string> {
  const signed = await createR2PresignedUrl(env, key, 'GET', {
    expiresIn: 60 * 60,
  })
  return signed.url
}

// ---- Upload session helpers ----

function normalizeUploadStage(value: string | undefined | null): string | null {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'presign' || normalized === 'upload' || normalized === 'transcript' || normalized === 'done') {
    return normalized
  }
  return 'unknown'
}

function normalizeUploadState(value: string | undefined | null): string | null {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized === 'presigned' ||
    normalized === 'uploading' ||
    normalized === 'uploaded' ||
    normalized === 'transcript_requested' ||
    normalized === 'completed' ||
    normalized === 'cancelled' ||
    normalized === 'failed'
  ) {
    return normalized
  }
  return 'unknown'
}

function deriveUploadSessionState(input: {
  eventType: string
  stage: string | null
  state: string | null
  reasonCode: string | null
}): { stage: string; state: string } {
  const eventType = input.eventType.trim().toLowerCase()
  let stage = input.stage
  let state = input.state
  const reason = (input.reasonCode ?? '').trim().toLowerCase()

  if (!stage) {
    if (eventType.includes('presign')) stage = 'presign'
    else if (eventType.includes('upload')) stage = 'upload'
    else if (eventType.includes('transcript')) stage = 'transcript'
    else if (eventType.includes('complete')) stage = 'done'
  }
  if (!state) {
    if (eventType === 'presign_issued') state = 'presigned'
    else if (eventType === 'upload_started') state = 'uploading'
    else if (eventType === 'upload_completed') state = 'uploaded'
    else if (eventType === 'transcript_requested') state = 'transcript_requested'
    else if (eventType === 'transcript_completed') state = 'completed'
    else if (eventType === 'browser_unload' || eventType === 'upload_cancelled') state = 'cancelled'
  }

  if (reason.includes('cancel') || reason.includes('abort') || reason === 'browser_closed') {
    state = 'cancelled'
  } else if (reason.includes('timeout') || reason.includes('fail') || reason.includes('error')) {
    state = 'failed'
  }

  return {
    stage: stage ?? 'unknown',
    state: state ?? 'unknown',
  }
}

async function upsertMeetingUploadSession(
  env: Env,
  input: {
    uploadId: string
    key: string
    filename: string
    contentType: string | null
    uploadMode: string | null
    stage: string
    state: string
    reasonCode?: string | null
    reasonMessage?: string | null
    transcriptId?: string | null
    meetingId?: string | null
    now?: number
  },
): Promise<void> {
  if (!env.CHECKLIST_DB) return
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const now = input.now ?? Date.now()
  await db
    .prepare(
      `INSERT INTO meeting_upload_sessions (
         id, audio_key, filename, content_type, upload_mode, stage, state, reason_code, reason_message, transcript_id, meeting_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         audio_key = excluded.audio_key,
         filename = excluded.filename,
         content_type = excluded.content_type,
         upload_mode = excluded.upload_mode,
         stage = excluded.stage,
         state = excluded.state,
         reason_code = excluded.reason_code,
         reason_message = excluded.reason_message,
         transcript_id = COALESCE(excluded.transcript_id, meeting_upload_sessions.transcript_id),
         meeting_id = COALESCE(excluded.meeting_id, meeting_upload_sessions.meeting_id),
         updated_at = excluded.updated_at`,
    )
    .bind(
      input.uploadId,
      input.key,
      input.filename,
      input.contentType,
      input.uploadMode,
      input.stage,
      input.state,
      input.reasonCode ?? null,
      input.reasonMessage ?? null,
      input.transcriptId ?? null,
      input.meetingId ?? null,
      now,
      now,
    )
    .run()
}

async function appendMeetingUploadEvent(
  env: Env,
  input: {
    uploadId: string
    key: string
    eventType: string
    stage: string | null
    state: string | null
    reasonCode: string | null
    reasonMessage: string | null
    elapsedMs: number | null
    payloadJson: string | null
    createdAt?: number
  },
): Promise<void> {
  if (!env.CHECKLIST_DB) return
  await ensureMeetingDbTables(env)
  const db = requireMeetingsDb(env)
  const createdAt = input.createdAt ?? Date.now()
  await db
    .prepare(
      `INSERT INTO meeting_upload_events (
         upload_id, audio_key, event_type, stage, state, reason_code, reason_message, elapsed_ms, payload_json, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.uploadId,
      input.key,
      input.eventType,
      input.stage,
      input.state,
      input.reasonCode,
      input.reasonMessage,
      input.elapsedMs,
      input.payloadJson,
      createdAt,
    )
    .run()
}

async function markMeetingUploadFromEvent(
  env: Env,
  input: {
    uploadId: string
    key: string
    filename?: string | null
    contentType?: string | null
    uploadMode?: string | null
    eventType: string
    stage: string | null
    state: string | null
    reasonCode: string | null
    reasonMessage: string | null
    elapsedMs: number | null
    payloadJson: string | null
  },
): Promise<void> {
  if (!env.CHECKLIST_DB) return
  const now = Date.now()
  const resolved = deriveUploadSessionState({
    eventType: input.eventType,
    stage: input.stage,
    state: input.state,
    reasonCode: input.reasonCode,
  })
  await upsertMeetingUploadSession(env, {
    uploadId: input.uploadId,
    key: input.key,
    filename: input.filename ?? input.key.split('/').pop() ?? 'recording.m4a',
    contentType: input.contentType ?? null,
    uploadMode: input.uploadMode ?? null,
    stage: resolved.stage,
    state: resolved.state,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    now,
  })
  await appendMeetingUploadEvent(env, {
    uploadId: input.uploadId,
    key: input.key,
    eventType: input.eventType,
    stage: resolved.stage,
    state: resolved.state,
    reasonCode: input.reasonCode,
    reasonMessage: input.reasonMessage,
    elapsedMs: input.elapsedMs,
    payloadJson: input.payloadJson,
    createdAt: now,
  })
}

// ---- Notion meeting schema + helpers ----

const MEETING_NOTION_FIELD = {
  date: '날짜',
  recordType: 'Record Type',
  transcriptId: 'Transcript ID',
  meetingId: 'Meeting ID',
  assemblyId: 'Assembly ID',
  status: 'Status',
  audioKey: 'Audio Key',
  audioFile: 'Audio File',
  speakerMapJson: 'Speaker Map JSON',
  keywordsUsedJson: 'Keywords Used JSON',
  errorMessage: 'Error Message',
  createdAt: 'Created At',
  updatedAt: 'Updated At',
  minSpeakers: 'Min Speakers',
  maxSpeakers: 'Max Speakers',
  keywordSetId: 'Keyword Set ID',
  keywordSetName: 'Keyword Set Name',
  keywordId: 'Keyword ID',
  phrase: 'Phrase',
  weight: 'Weight',
  tags: 'Tags',
  isActive: 'Is Active',
  bodySynced: 'Body Synced',
  textPreview: 'Text Preview',
} as const

const MEETING_RECORD_TYPE = {
  transcript: 'transcript',
  keywordSet: 'keyword_set',
  keyword: 'keyword',
} as const

const MEETING_STATUS_VALUES = new Set(['queued', 'submitted', 'processing', 'completed', 'failed', 'error'])

function normalizeMeetingStatus(value: string | undefined): string {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'processing'
  return MEETING_STATUS_VALUES.has(normalized) ? normalized : 'processing'
}

type MeetingNotionContext = {
  api: NotionApi
  databaseId: string
  titlePropertyName: string
  datePropertyName: string
}

type MeetingNotionTranscriptRow = {
  pageId: string
  id: string
  meetingId: string
  meetingDate: string | null
  assemblyId: string | null
  status: string
  createdAt: number
  updatedAt: number
  title: string
  audioKey: string
  speakerMap: Record<string, string>
  keywordsUsed: string[]
  errorMessage: string | null
  bodySynced: boolean
  textPreview: string
}

function toNotionRichText(text: string, maxChars = 6000): Array<{ type: 'text'; text: { content: string } }> {
  const trimmed = text.trim()
  if (!trimmed) return []
  const safe = trimmed.slice(0, maxChars)
  const chunks: Array<{ type: 'text'; text: { content: string } }> = []
  for (let i = 0; i < safe.length; i += NOTION_RICH_TEXT_CHUNK) {
    chunks.push({ type: 'text', text: { content: safe.slice(i, i + NOTION_RICH_TEXT_CHUNK) } })
  }
  return chunks
}

function notionRichTextValue(text: string, maxChars = 6000): { rich_text: Array<{ type: 'text'; text: { content: string } }> } {
  return { rich_text: toNotionRichText(text, maxChars) }
}

function notionReadRichText(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  const rich = Array.isArray(value.rich_text) ? value.rich_text : []
  return rich
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const item = entry as Record<string, unknown>
      return asString(item.plain_text) ?? ''
    })
    .join('')
    .trim()
}

function notionReadTitle(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  const title = Array.isArray(value.title) ? value.title : []
  return title
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const item = entry as Record<string, unknown>
      return asString(item.plain_text) ?? ''
    })
    .join('')
    .trim()
}

function notionReadSelect(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return ''
  const value = prop as Record<string, unknown>
  if (!value.select || typeof value.select !== 'object') return ''
  return asString((value.select as Record<string, unknown>).name) ?? ''
}

function notionReadNumber(prop: unknown): number {
  if (!prop || typeof prop !== 'object') return 0
  const value = prop as Record<string, unknown>
  const n = value.number
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function notionReadCheckbox(prop: unknown): boolean {
  if (!prop || typeof prop !== 'object') return false
  const value = prop as Record<string, unknown>
  return Boolean(value.checkbox)
}

function notionReadDateStart(prop: unknown): string | null {
  if (!prop || typeof prop !== 'object') return null
  const value = prop as Record<string, unknown>
  if (!value.date || typeof value.date !== 'object') return null
  const start = asString((value.date as Record<string, unknown>).start)
  if (!start) return null
  if (ISO_DATE_RE.test(start)) return start
  return null
}

function safeParseSpeakerMap(value: string): Record<string, string> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const map: Record<string, string> = {}
    for (const [key, item] of Object.entries(parsed)) {
      const speaker = asString(key)
      const name = asString(typeof item === 'string' ? item : undefined)
      if (!speaker || !name) continue
      map[speaker] = name
    }
    return map
  } catch {
    return {}
  }
}

function safeParseStringArray(value: string): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  } catch {
    return []
  }
}

function resolveMeetingDatePropertyName(properties: Record<string, unknown>): string {
  const aliases = [MEETING_NOTION_FIELD.date, '일자', 'Date']
  for (const name of aliases) {
    const prop = properties[name]
    if (!prop || typeof prop !== 'object') continue
    if ((prop as Record<string, unknown>).type === 'date') return name
  }
  const firstDate = Object.entries(properties).find(([, prop]) => {
    if (!prop || typeof prop !== 'object') return false
    return (prop as Record<string, unknown>).type === 'date'
  })?.[0]
  return firstDate || MEETING_NOTION_FIELD.date
}

async function ensureMeetingNotionSchema(env: Env): Promise<MeetingNotionContext> {
  const databaseId = getMeetingNotionDbId(env)
  const now = Date.now()
  if (
    meetingNotionSchemaCache &&
    meetingNotionSchemaCache.databaseId === databaseId &&
    now - meetingNotionSchemaCache.checkedAt < MEETING_NOTION_SCHEMA_CACHE_MS
  ) {
    return {
      api: new NotionApi(env),
      databaseId,
      titlePropertyName: meetingNotionSchemaCache.titlePropertyName,
      datePropertyName: meetingNotionSchemaCache.datePropertyName,
    }
  }

  const api = new NotionApi(env)
  const db = await api.retrieveDatabase(databaseId)
  const properties = (db?.properties ?? {}) as Record<string, unknown>
  const titlePropertyName =
    Object.entries(properties).find(([, prop]) => {
      if (!prop || typeof prop !== 'object') return false
      return (prop as Record<string, unknown>).type === 'title'
    })?.[0] ?? ''
  if (!titlePropertyName) throw new Error('notion_meeting_db_title_property_missing')
  const datePropertyName = resolveMeetingDatePropertyName(properties)

  const patch: Record<string, unknown> = {}
  const ensure = (name: string, spec: Record<string, unknown>): void => {
    if (!properties[name]) patch[name] = spec
  }

  ensure(MEETING_NOTION_FIELD.recordType, {
    select: {
      options: [{ name: MEETING_RECORD_TYPE.transcript }, { name: MEETING_RECORD_TYPE.keywordSet }, { name: MEETING_RECORD_TYPE.keyword }],
    },
  })
  ensure(MEETING_NOTION_FIELD.transcriptId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.meetingId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.assemblyId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.status, {
    select: {
      options: [{ name: 'queued' }, { name: 'submitted' }, { name: 'processing' }, { name: 'completed' }, { name: 'failed' }, { name: 'error' }],
    },
  })
  ensure(MEETING_NOTION_FIELD.audioKey, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.audioFile, { files: {} })
  ensure(datePropertyName, { date: {} })
  ensure(MEETING_NOTION_FIELD.speakerMapJson, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordsUsedJson, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.errorMessage, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.createdAt, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.updatedAt, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.minSpeakers, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.maxSpeakers, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.keywordSetId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordSetName, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.keywordId, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.phrase, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.weight, { number: { format: 'number' } })
  ensure(MEETING_NOTION_FIELD.tags, { rich_text: {} })
  ensure(MEETING_NOTION_FIELD.isActive, { checkbox: {} })
  ensure(MEETING_NOTION_FIELD.bodySynced, { checkbox: {} })
  ensure(MEETING_NOTION_FIELD.textPreview, { rich_text: {} })

  if (Object.keys(patch).length > 0) {
    await api.updateDatabase(databaseId, { properties: patch })
  }

  meetingNotionSchemaCache = {
    databaseId,
    titlePropertyName,
    datePropertyName,
    checkedAt: now,
  }

  return { api, databaseId, titlePropertyName, datePropertyName }
}

async function queryAllMeetingNotionPages(ctx: MeetingNotionContext, input: Record<string, unknown>): Promise<any[]> {
  const pages: any[] = []
  let cursor: string | undefined
  for (let i = 0; i < 50; i += 1) {
    const payload: Record<string, unknown> = { ...input, page_size: 100 }
    if (cursor) payload.start_cursor = cursor
    const result = await ctx.api.queryDatabase(ctx.databaseId, payload)
    const rows = Array.isArray(result?.results) ? result.results : []
    pages.push(...rows.filter((page) => page && !page.archived && !page.in_trash))
    cursor = result?.has_more ? asString(result?.next_cursor) : undefined
    if (!cursor) break
  }
  return pages
}

async function queryFirstMeetingNotionPage(ctx: MeetingNotionContext, input: Record<string, unknown>): Promise<any | null> {
  const result = await ctx.api.queryDatabase(ctx.databaseId, {
    ...input,
    page_size: 1,
  })
  const rows = Array.isArray(result?.results) ? result.results : []
  const page = rows.find((entry) => entry && !entry.archived && !entry.in_trash)
  return page ?? null
}

function transcriptFilterById(transcriptId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.transcript } },
      { property: MEETING_NOTION_FIELD.transcriptId, rich_text: { equals: transcriptId } },
    ],
  }
}

function transcriptFilterByAssemblyId(assemblyId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.transcript } },
      { property: MEETING_NOTION_FIELD.assemblyId, rich_text: { equals: assemblyId } },
    ],
  }
}

function mapMeetingNotionTranscriptPage(page: any, titlePropertyName: string, datePropertyName: string): MeetingNotionTranscriptRow {
  const props = (page?.properties ?? {}) as Record<string, unknown>
  const transcriptId = notionReadRichText(props[MEETING_NOTION_FIELD.transcriptId]) || asString(page?.id) || ''
  return {
    pageId: asString(page?.id) ?? '',
    id: transcriptId,
    meetingId: notionReadRichText(props[MEETING_NOTION_FIELD.meetingId]),
    meetingDate: notionReadDateStart(props[datePropertyName]),
    assemblyId: notionReadRichText(props[MEETING_NOTION_FIELD.assemblyId]) || null,
    status: notionReadSelect(props[MEETING_NOTION_FIELD.status]) || 'queued',
    createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
    updatedAt: notionReadNumber(props[MEETING_NOTION_FIELD.updatedAt]),
    title: notionReadTitle(props[titlePropertyName]) || transcriptId || 'Untitled meeting',
    audioKey: notionReadRichText(props[MEETING_NOTION_FIELD.audioKey]),
    speakerMap: safeParseSpeakerMap(notionReadRichText(props[MEETING_NOTION_FIELD.speakerMapJson])),
    keywordsUsed: safeParseStringArray(notionReadRichText(props[MEETING_NOTION_FIELD.keywordsUsedJson])),
    errorMessage: notionReadRichText(props[MEETING_NOTION_FIELD.errorMessage]) || null,
    bodySynced: notionReadCheckbox(props[MEETING_NOTION_FIELD.bodySynced]),
    textPreview: notionReadRichText(props[MEETING_NOTION_FIELD.textPreview]),
  }
}

async function getMeetingNotionTranscriptById(env: Env, transcriptId: string): Promise<{ row: MeetingNotionTranscriptRow; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const page = await queryFirstMeetingNotionPage(ctx, { filter: transcriptFilterById(transcriptId) })
  if (!page) return null
  return { row: mapMeetingNotionTranscriptPage(page, ctx.titlePropertyName, ctx.datePropertyName), ctx }
}

async function getMeetingNotionTranscriptByAssemblyId(env: Env, assemblyId: string): Promise<{ row: MeetingNotionTranscriptRow; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const page = await queryFirstMeetingNotionPage(ctx, { filter: transcriptFilterByAssemblyId(assemblyId) })
  if (!page) return null
  return { row: mapMeetingNotionTranscriptPage(page, ctx.titlePropertyName, ctx.datePropertyName), ctx }
}

async function listMeetingNotionTranscripts(env: Env, limit: number): Promise<MeetingNotionTranscriptRow[]> {
  const ctx = await ensureMeetingNotionSchema(env)
  const result = await ctx.api.queryDatabase(ctx.databaseId, {
    filter: {
      property: MEETING_NOTION_FIELD.recordType,
      select: { equals: MEETING_RECORD_TYPE.transcript },
    },
    sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
    page_size: Math.max(1, Math.min(100, limit)),
  })
  const pages = Array.isArray(result?.results) ? result.results : []
  return pages
    .filter((page) => page && !page.archived && !page.in_trash)
    .map((page) => mapMeetingNotionTranscriptPage(page, ctx.titlePropertyName, ctx.datePropertyName))
}

function keywordSetFilterById(setId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keywordSet } },
      { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
    ],
  }
}

function keywordFilterBySetId(setId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
      { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
    ],
  }
}

function keywordFilterById(keywordId: string): Record<string, unknown> {
  return {
    and: [
      { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
      { property: MEETING_NOTION_FIELD.keywordId, rich_text: { equals: keywordId } },
    ],
  }
}

async function findMeetingNotionKeywordSetPageById(
  env: Env,
  setId: string,
): Promise<{ page: any; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pageByFilter = await queryFirstMeetingNotionPage(ctx, { filter: keywordSetFilterById(setId) })
  if (pageByFilter) return { page: pageByFilter, ctx }
  try {
    const page = await ctx.api.retrievePage(setId)
    if (!page || page.archived || page.in_trash) return null
    const props = (page.properties ?? {}) as Record<string, unknown>
    const recordType = notionReadSelect(props[MEETING_NOTION_FIELD.recordType])
    if (recordType !== MEETING_RECORD_TYPE.keywordSet) return null
    return { page, ctx }
  } catch {
    return null
  }
}

async function findMeetingNotionKeywordPageById(
  env: Env,
  keywordId: string,
): Promise<{ page: any; ctx: MeetingNotionContext } | null> {
  const ctx = await ensureMeetingNotionSchema(env)
  const pageByFilter = await queryFirstMeetingNotionPage(ctx, { filter: keywordFilterById(keywordId) })
  if (pageByFilter) return { page: pageByFilter, ctx }
  try {
    const page = await ctx.api.retrievePage(keywordId)
    if (!page || page.archived || page.in_trash) return null
    const props = (page.properties ?? {}) as Record<string, unknown>
    const recordType = notionReadSelect(props[MEETING_NOTION_FIELD.recordType])
    if (recordType !== MEETING_RECORD_TYPE.keyword) return null
    return { page, ctx }
  } catch {
    return null
  }
}

// ---- Notion block builders ----

function paragraphBlock(text: string, maxChars = NOTION_RICH_TEXT_CHUNK): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: toNotionRichText(text, maxChars) },
  }
}

function headingBlock(level: 'heading_1' | 'heading_2' | 'heading_3', text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: level,
    [level]: { rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK) },
  }
}

function bulletBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK) },
  }
}

function italicParagraphBlock(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: [
        {
          type: 'text',
          text: { content: text.trim() },
          annotations: {
            bold: false,
            italic: true,
            strikethrough: false,
            underline: false,
            code: false,
            color: 'default',
          },
        },
      ],
    },
  }
}

function toggleBlock(text: string, children: Record<string, unknown>[] = []): Record<string, unknown> {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: toNotionRichText(text, NOTION_RICH_TEXT_CHUNK),
      children,
    },
  }
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line)
  if (cells.length === 0) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function tableBlock(rows: string[][]): Record<string, unknown> {
  const width = Math.max(...rows.map((row) => row.length))
  return {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: rows.map((row) => ({
        object: 'block',
        type: 'table_row',
        table_row: {
          cells: Array.from({ length: width }, (_, index) => toNotionRichText(row[index] ?? '', NOTION_RICH_TEXT_CHUNK)),
        },
      })),
    },
  }
}

// ---- Summary generation ----

function buildMeetingSummarySource(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
  rawText: string,
): string {
  const lines: string[] = []
  for (const row of utterances) {
    const speaker = asString(speakerMap[row.speaker])?.trim() || row.speaker
    const text = row.text.trim()
    if (!text) continue
    const timestamp = toUtteranceTimestampRange(row.start, row.end)
    lines.push(`${timestamp}${speaker}: ${text}`)
    if (lines.join('\n').length >= MAX_SUMMARY_SOURCE_CHARS) break
  }

  const fromUtterances = lines.join('\n').trim()
  if (fromUtterances) return fromUtterances.slice(0, MAX_SUMMARY_SOURCE_CHARS)
  return rawText.trim().slice(0, MAX_SUMMARY_SOURCE_CHARS)
}

function extractOpenAiResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const obj = payload as Record<string, unknown>
  const direct = asString(obj.output_text)
  if (direct) return direct
  if (Array.isArray(obj.output_text)) {
    const merged = (obj.output_text as unknown[])
      .map((entry) => {
        if (typeof entry === 'string') return entry
        if (!entry || typeof entry !== 'object') return ''
        const asObj = entry as Record<string, unknown>
        return asString(asObj.text) ?? asString(asObj.value) ?? ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
    if (merged) return merged
  }

  const output = Array.isArray(obj.output) ? obj.output : []
  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]) : []
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const blockObj = block as Record<string, unknown>
      const directText = asString(blockObj.text)
      if (directText) {
        chunks.push(directText)
        continue
      }
      if (blockObj.text && typeof blockObj.text === 'object') {
        const textObj = blockObj.text as Record<string, unknown>
        const nested = asString(textObj.value) ?? asString(textObj.text)
        if (nested) {
          chunks.push(nested)
          continue
        }
      }
      const altText = asString(blockObj.output_text) ?? asString(blockObj.value)
      if (altText) chunks.push(altText)
    }
  }
  return chunks.join('\n').trim()
}

function summarizeOpenAiResponsePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'payload=invalid'
  const obj = payload as Record<string, unknown>
  const status = asString(obj.status) ?? 'unknown'
  const output = Array.isArray(obj.output) ? obj.output : []
  const contentTypes: string[] = []
  for (const item of output.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as Record<string, unknown>).content) ? ((item as Record<string, unknown>).content as unknown[]) : []
    for (const block of content.slice(0, 4)) {
      if (!block || typeof block !== 'object') continue
      const type = asString((block as Record<string, unknown>).type)
      if (type) contentTypes.push(type)
    }
  }
  const incompleteReason =
    obj.incomplete_details && typeof obj.incomplete_details === 'object'
      ? asString((obj.incomplete_details as Record<string, unknown>).reason)
      : null
  const fields = [
    `status=${status}`,
    `outputItems=${output.length}`,
    `contentTypes=${contentTypes.join('|') || 'none'}`,
  ]
  if (incompleteReason) fields.push(`incomplete=${incompleteReason}`)
  return fields.join(',')
}

function getOpenAiIncompleteReason(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  if (!obj.incomplete_details || typeof obj.incomplete_details !== 'object') return null
  return asString((obj.incomplete_details as Record<string, unknown>).reason)
}

const REQUIRED_SUMMARY_HEADERS = [
  '# \uC694\uC57D',
  '## \uD68C\uC758 \uAC1C\uC694',
  '## \uD575\uC2EC \uC548\uAC74 \uC694\uC57D',
  '## \uC815\uD574\uC9C4 \uB0B4\uC6A9 / \uD655\uC778 \uD544\uC694',
] as const

const DEFAULT_MEETING_SUMMARY_WARNING =
  '\uC774 \uBB38\uC11C\uB294 \uC790\uB3D9\uC73C\uB85C \uC0DD\uC131\uB41C \uD68C\uC758 \uCD08\uC548\uC785\uB2C8\uB2E4. \uC6D0\uBB38 \uBC1C\uD654\uB9CC\uC744 \uADFC\uAC70\uB85C gpt 5 mini \uBC84\uC804\uC73C\uB85C \uC694\uC57D \uC791\uC131\uD588\uC73C\uBA70, \uC138\uBD80 \uB0B4\uC6A9\uC740 \uCD94\uAC00 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.'

function normalizeMeetingSummaryText(summary: string): string {
  let text = summary.trim()
  if (!text) return text

  const lineReplacements: Array<[RegExp, string]> = [
    [/^Summary\s*$/gim, '# \uC694\uC57D'],
    [/^#\s*\uD68C\uC758\s+\uAC1C\uC694\s*$/gim, '## \uD68C\uC758 \uAC1C\uC694'],
    [/^Meta\s*$/gim, '## \uD68C\uC758 \uAC1C\uC694'],
    [/^##\s*\uBA54\uD0C0\s*$/gim, '## \uD68C\uC758 \uAC1C\uC694'],
    [/^Participants \(estimated\)\s*:?/gim, '\uCC38\uC11D\uC790(\uCD94\uC815): '],
    [/^###\s*\uCC38\uC11D\uC790\(\uCD94\uC815\)\s*$/gim, '\uCC38\uC11D\uC790(\uCD94\uC815):'],
    [/^Draft note\s*:?/gim, `*${DEFAULT_MEETING_SUMMARY_WARNING}*`],
    [/^###\s*\uC790\uB3D9 \uCD08\uC548 \uC548\uB0B4\s*$/gim, `*${DEFAULT_MEETING_SUMMARY_WARNING}*`],
    [/^Key agenda summary\s*$/gim, '## \uD575\uC2EC \uC548\uAC74 \uC694\uC57D'],
    [/^Decided items \/ Needs confirmation \(table\)\s*$/gim, '## \uC815\uD574\uC9C4 \uB0B4\uC6A9 / \uD655\uC778 \uD544\uC694'],
    [/^Action items by participant \(table\)\s*$/gim, '## \uCC38\uC5EC\uC790\uBCC4 \uD574\uC57C \uD560 \uC77C'],
    [/^Uncertain \/ needs additional confirmation segments\s*$/gim, '## \uBD88\uD655\uC2E4/\uCD94\uAC00 \uD655\uC778 \uD544\uC694 \uAD6C\uAC04'],
  ]
  for (const [pattern, replacement] of lineReplacements) {
    text = text.replace(pattern, replacement)
  }

  if (!/^#\s+\uC694\uC57D\b/m.test(text)) {
    text = `# \uC694\uC57D\n\n${text}`
  }

  const inlineReplacements: Array<[RegExp, string]> = [
    [/\bPriority\b/g, '\uC6B0\uC120\uC21C\uC704'],
    [/\bConfidence\b/g, '\uD655\uC2E0\uB3C4'],
    [/\bEvidence\b/g, '\uADFC\uAC70'],
    [/\bHigh\b/g, '\uB192\uC74C'],
    [/\bMedium\b/g, '\uBCF4\uD1B5'],
    [/\bLow\b/g, '\uB0AE\uC74C'],
    [/\[Uncertain\]/g, '[\uBD88\uD655\uC2E4]'],
  ]
  for (const [pattern, replacement] of inlineReplacements) {
    text = text.replace(pattern, replacement)
  }

  const lines = text.split(/\r?\n/g)
  let seenSummaryHeading = false
  text = lines
    .filter((line) => {
      const trimmed = line.trim()
      if (!/^#{1,2}\s+\uC694\uC57D$/.test(trimmed)) return true
      if (seenSummaryHeading) return false
      seenSummaryHeading = true
      return true
    })
    .join('\n')

  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function hasRequiredSummaryHeaders(markdown: string): boolean {
  const normalized = normalizeMeetingSummaryText(markdown)
  return REQUIRED_SUMMARY_HEADERS.every((header) => normalized.includes(header))
}

function ensureRequiredSummaryHeaders(markdown: string): string {
  const normalized = normalizeMeetingSummaryText(markdown)
  if (!normalized) {
    return [
      ...REQUIRED_SUMMARY_HEADERS,
      '\uCC38\uC11D\uC790(\uCD94\uC815): \uD655\uC778 \uD544\uC694',
      `*${DEFAULT_MEETING_SUMMARY_WARNING}*`,
      '| \uD56D\uBAA9 | \uC815\uD574\uC9C4 \uB0B4\uC6A9 | \uD655\uC778 \uD544\uC694(\uC9C8\uBB38\uD615) | \uAD00\uB828\uC790 | \uADFC\uAC70 \uD0C0\uC784\uC2A4\uD0EC\uD504 | \uD655\uC2E0\uB3C4 |',
      '|---|---|---|---|---|---|',
      '| \uC694\uC57D \uBBF8\uC0DD\uC131 | \uC815\uBCF4 \uC5C6\uC74C | \uC7AC\uC2E4\uD589 \uD544\uC694 | - | [00:00:00-00:00:00] | \uB0AE\uC74C |',
    ].join('\n')
  }

  let text = normalized
  if (!/##\s+\uD68C\uC758 \uAC1C\uC694[\s\S]*?\uCC38\uC11D\uC790\(\uCD94\uC815\)\s*:/m.test(text)) {
    text = text.replace(/(##\s+\uD68C\uC758 \uAC1C\uC694\s*\n?)/, `$1\uCC38\uC11D\uC790(\uCD94\uC815): \uD655\uC778 \uD544\uC694\n`)
  }
  if (!text.includes(DEFAULT_MEETING_SUMMARY_WARNING)) {
    text = text.replace(/(##\s+\uD68C\uC758 \uAC1C\uC694[\s\S]*?)(\n##\s+)/, `$1\n*${DEFAULT_MEETING_SUMMARY_WARNING}*\n\n$2`)
  }

  const parts = [text]
  for (const header of REQUIRED_SUMMARY_HEADERS) {
    if (!text.includes(header)) {
      parts.push('')
      parts.push(header)
    }
  }
  return parts.join('\n').trim()
}

function summaryMarkdownToNotionBlocks(markdown: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = []
  const lines = markdown.split(/\r?\n/g)
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('# ')) {
      blocks.push(headingBlock('heading_1', line.slice(2).trim()))
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(headingBlock('heading_2', line.slice(3).trim()))
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(headingBlock('heading_3', line.slice(4).trim()))
      continue
    }
    if (line.startsWith('|') && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1]?.trim() ?? '')) {
      const rows: string[][] = [splitMarkdownTableRow(line)]
      index += 2
      while (index < lines.length) {
        const rowLine = lines[index].trim()
        if (!rowLine.startsWith('|')) {
          index -= 1
          break
        }
        rows.push(splitMarkdownTableRow(rowLine))
        index += 1
      }
      blocks.push(tableBlock(rows))
      continue
    }
    if (line.startsWith('- ')) {
      blocks.push(bulletBlock(line.slice(2).trim()))
      continue
    }
    if (line.startsWith('*') && line.endsWith('*') && line.length > 2) {
      blocks.push(italicParagraphBlock(line.slice(1, -1)))
      continue
    }
    blocks.push(paragraphBlock(line))
  }
  return blocks
}

async function generateMeetingSummary(
  env: Env,
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
  rawText: string,
): Promise<string | null> {
  const apiKey = asString(env.OPENAI_API_KEY)
  if (!apiKey) return null

  const source = buildMeetingSummarySource(utterances, speakerMap, rawText)
  if (!source) return null

  const model = asString(env.OPENAI_SUMMARY_MODEL) ?? DEFAULT_OPENAI_SUMMARY_MODEL
  const systemPrompt = [
    'You are a meeting-minutes draft assistant.',
    'Return a reviewable draft, not a final confirmed record.',
  ].join('\n')

  const buildUserPrompt = (sourceText: string, condensed: boolean, repairDraft?: string | null): string =>
    [
      '\uBC18\uB4DC\uC2DC GitHub-flavored Markdown\uC73C\uB85C\uB9CC \uCD9C\uB825\uD558\uC138\uC694.',
      '\uBC18\uB4DC\uC2DC \uC544\uB798 \uC21C\uC11C/\uD5E4\uB354\uB97C \uADF8\uB300\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.',
      '# \uC694\uC57D',
      '## \uD68C\uC758 \uAC1C\uC694',
      '\uCC38\uC11D\uC790(\uCD94\uC815): \uC77C\uBC18 \uD14D\uC2A4\uD2B8 \uD55C \uC904',
      `*${DEFAULT_MEETING_SUMMARY_WARNING}*`,
      '## \uD575\uC2EC \uC548\uAC74 \uC694\uC57D',
      '## \uC815\uD574\uC9C4 \uB0B4\uC6A9 / \uD655\uC778 \uD544\uC694',
      '',
      '\uC544\uB798 \uB450 \uC139\uC158\uC740 \uB0B4\uC6A9\uC774 \uC788\uC744 \uB54C\uB9CC \uCD94\uAC00\uD558\uC138\uC694.',
      '- ## \uCC38\uC5EC\uC790\uBCC4 \uD574\uC57C \uD560 \uC77C',
      '- ## \uBD88\uD655\uC2E4/\uCD94\uAC00 \uD655\uC778 \uD544\uC694 \uAD6C\uAC04',
      '\uD574\uB2F9 \uB0B4\uC6A9\uC774 \uC5C6\uC73C\uBA74 \uC139\uC158\uC744 \uC0DD\uC131\uD558\uC9C0 \uB9C8\uC138\uC694.',
      '"[\uBD88\uD655\uC2E4] \uC790\uB3D9 \uBCF4\uC815\uB41C \uC139\uC158..." \uAC19\uC740 \uB354\uBBF8 \uBB38\uC7A5\uC740 \uAE08\uC9C0\uD569\uB2C8\uB2E4.',
      '',
      '\uACB0\uC815/\uC694\uCCAD/\uBCC0\uACBD/\uB9C8\uAC10/\uB9AC\uC2A4\uD06C/\uC5ED\uD560 \uC9C0\uC815\uC5D0\uB294 \uBC18\uB4DC\uC2DC \uD0C0\uC784\uC2A4\uD0EC\uD504 \uADFC\uAC70\uB97C 1\uAC1C \uC774\uC0C1 \uD3EC\uD568\uD558\uC138\uC694.',
      '\uADFC\uAC70\uAC00 \uBD88\uBD84\uBA85\uD558\uBA74 [\uBD88\uD655\uC2E4]\uB85C \uD45C\uAE30\uD558\uC138\uC694.',
      '\uC6D0\uBB38\uC5D0 \uC5C6\uB294 \uB0B4\uC6A9\uC740 \uCD94\uAC00\uD558\uC9C0 \uB9C8\uC138\uC694.',
      '\uD55C\uAD6D\uC5B4\uB9CC \uC0AC\uC6A9\uD558\uACE0 \uC601\uBB38 \uD5E4\uB354/\uB77C\uBCA8\uC744 \uC4F0\uC9C0 \uB9C8\uC138\uC694.',
      '\uCC38\uC11D\uC790(\uCD94\uC815)\uC740 heading \uC5C6\uC774 \uC77C\uBC18 \uD14D\uC2A4\uD2B8 1\uC904\uB85C\uB9CC \uC4F0\uC138\uC694. \uBC1C\uD654 \uC2DC\uAC04/\uB0B4\uC6A9\uC740 \uC4F0\uC9C0 \uB9C8\uC138\uC694.',
      '\uC790\uB3D9 \uCD08\uC548 \uC548\uB0B4 heading\uC740 \uB9CC\uB4E4\uC9C0 \uB9D0\uACE0, \uC704 \uACBD\uACE0\uBB38 1\uC904\uB9CC \uADF8\uB300\uB85C \uCD9C\uB825\uD558\uC138\uC694.',
      '\uD575\uC2EC \uC548\uAC74 \uC694\uC57D\uC740 \uAC1C\uC218 \uC81C\uD55C \uC5C6\uC774 \uC791\uC131\uD558\uB418, \uAC01 \uD56D\uBAA9\uC740 1~2\uBB38\uC7A5\uC73C\uB85C \uAC04\uACB0\uD788 \uC4F0\uC138\uC694.',
      '\uC815\uD574\uC9C4 \uB0B4\uC6A9 / \uD655\uC778 \uD544\uC694 \uC139\uC158\uC740 \uBC18\uB4DC\uC2DC Markdown \uD45C\uB85C\uB9CC \uC791\uC131\uD558\uACE0, \uD45C \uC55E\uB4A4 \uC124\uBA85 \uBB38\uC7A5\uC740 \uAE08\uC9C0\uD569\uB2C8\uB2E4.',
      '\uBD88\uD655\uC2E4/\uCD94\uAC00 \uD655\uC778 \uD544\uC694 \uAD6C\uAC04\uC744 \uC791\uC131\uD560 \uB54C\uB294 \uAC1C\uC218 \uC81C\uD55C \uC5C6\uC774 \uC791\uC131\uD558\uC138\uC694.',
      '\uD45C\uAC00 \uD544\uC694\uD55C \uC139\uC158\uC740 Markdown \uD45C \uBB38\uBC95\uC744 \uC0AC\uC6A9\uD558\uC138\uC694.',
      condensed ? '\uCD9C\uB825 \uBD84\uB7C9\uC744 \uC904\uC774\uACE0 \uD575\uC2EC \uD56D\uBAA9\uB9CC \uAC04\uACB0\uD558\uAC8C \uC791\uC131\uD558\uC138\uC694.' : '',
      '',
      repairDraft
        ? '\uC774\uC804 \uC751\uB2F5\uC740 \uD615\uC2DD \uACC4\uC57D\uC744 \uC704\uBC18\uD588\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uC774\uC804 \uC751\uB2F5\uC758 \uC0AC\uC2E4\uC744 \uC720\uC9C0\uD558\uB418 \uD615\uC2DD \uACC4\uC57D\uC5D0 \uB9DE\uAC8C \uB2E4\uC2DC \uC791\uC131\uD558\uC138\uC694.'
        : '',
      repairDraft ? '\uC774\uC804 \uC751\uB2F5:' : '',
      repairDraft ?? '',
      '',
      '\uC6D0\uBB38 \uBC1C\uD654:',
      sourceText,
    ]
      .filter((line) => line !== '')
      .join('\n')

  const requestSummary = async (
    sourceText: string,
    maxOutputTokens: number,
    condensed: boolean,
    repairDraft?: string | null,
  ): Promise<{ summary: string | null; payload: unknown; valid: boolean }> => {
    const userPrompt = buildUserPrompt(sourceText, condensed, repairDraft)
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
          { role: 'user', content: [{ type: 'input_text', text: userPrompt }] },
        ],
        reasoning: { effort: 'low' },
        text: { format: { type: 'text' } },
        max_output_tokens: maxOutputTokens,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error('openai_summary_failed:' + response.status + ':' + detail.slice(0, 200))
    }

    const payload = (await response.json()) as unknown
    const summary = extractOpenAiResponseText(payload)
    if (!summary) return { summary: null, payload, valid: false }
    const normalized = normalizeMeetingSummaryText(summary).slice(0, 6000)
    return { summary: normalized, payload, valid: hasRequiredSummaryHeaders(normalized) }
  }

  const first = await requestSummary(source, SUMMARY_OUTPUT_TOKENS, false)
  const firstIncomplete = getOpenAiIncompleteReason(first.payload) === 'max_output_tokens'
  if (first.summary && first.valid && !firstIncomplete) return first.summary

  const retrySource = source.slice(0, SUMMARY_RETRY_SOURCE_CHARS)
  const second = await requestSummary(retrySource, SUMMARY_RETRY_OUTPUT_TOKENS, true, first.summary)
  if (second.summary && second.valid) return second.summary
  if (second.summary) return ensureRequiredSummaryHeaders(second.summary)
  if (first.summary) return ensureRequiredSummaryHeaders(first.summary)

  throw new Error(
    'openai_summary_empty_retry:' + summarizeOpenAiResponsePayload(first.payload) + '=>' + summarizeOpenAiResponsePayload(second.payload),
  )
}

// ---- Transcript body builders ----

function findUnmappedSpeakers(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
): string[] {
  const uniqueSpeakers = Array.from(new Set(utterances.map((row) => row.speaker).filter(Boolean)))
  return uniqueSpeakers.filter((speakerLabel) => {
    const mapped = asString(speakerMap[speakerLabel])?.trim()
    return !mapped || isSimpleAlphabetDisplayName(mapped)
  })
}

function findInvalidSimpleAlphabetMappedSpeakers(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
): string[] {
  const uniqueSpeakers = Array.from(new Set(utterances.map((row) => row.speaker).filter(Boolean)))
  return uniqueSpeakers.filter((speakerLabel) => {
    const mapped = asString(speakerMap[speakerLabel])?.trim()
    return Boolean(mapped && isSimpleAlphabetDisplayName(mapped))
  })
}

function buildTranscriptBodyBlocks(
  detail: Record<string, unknown>,
  speakerMap: Record<string, string>,
  summaryText: string | null,
  summaryError: string | null,
): Record<string, unknown>[] {
  const utterances = normalizeUtterances(detail.utterances)
  const blocks: Record<string, unknown>[] = []
  blocks.push(...buildTranscriptSummaryBlocks(summaryText, summaryError))
  blocks.push(headingBlock('heading_2', '\uC804\uBB38'))
  blocks.push(...buildTranscriptUtteranceBlocks(utterances, speakerMap))
  return blocks
}

function buildTranscriptUtteranceBlocks(
  utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }>,
  speakerMap: Record<string, string>,
): Record<string, unknown>[] {
  if (utterances.length === 0) {
    return [paragraphBlock('\uD654\uC790\uBCC4 \uBC1C\uD654\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.')]
  }

  const paragraphBlocks: Record<string, unknown>[] = []
  let currentLines: string[] = []
  let currentChars = 0

  const pushCurrentParagraph = () => {
    if (currentLines.length === 0) return
    paragraphBlocks.push(paragraphBlock(currentLines.join('\n'), 6_000))
    currentLines = []
    currentChars = 0
  }

  for (const row of utterances) {
    const displaySpeaker = asString(speakerMap[row.speaker])?.trim() || row.speaker
    const timestamp = toUtteranceTimestampRange(row.start, row.end)
    const line = timestamp + displaySpeaker + ': ' + row.text
    const nextChars = currentChars + line.length + (currentLines.length > 0 ? 1 : 0)
    if (
      currentLines.length > 0 &&
      (currentLines.length >= MAX_TRANSCRIPT_PARAGRAPH_LINES || nextChars > MAX_TRANSCRIPT_PARAGRAPH_CHARS)
    ) {
      pushCurrentParagraph()
    }
    currentLines.push(line)
    currentChars += line.length + (currentLines.length > 1 ? 1 : 0)
  }
  pushCurrentParagraph()

  return [
    toggleBlock('\uD654\uC790\uBCC4 \uBC1C\uD654 (' + utterances.length + ')', paragraphBlocks),
  ]
}

function buildTranscriptSummaryBlocks(summaryText: string | null, summaryError: string | null): Record<string, unknown>[] {
  if (summaryText && summaryText.trim()) {
    const markdown = ensureRequiredSummaryHeaders(summaryText)
    const summaryBlocks = summaryMarkdownToNotionBlocks(markdown)
    if (summaryBlocks.length === 0) {
      return [paragraphBlock(markdown)]
    }
    return summaryBlocks.slice(0, 80)
  }
  if (summaryError) {
    return [paragraphBlock('\uC694\uC57D \uC0DD\uC131 \uC2E4\uD328: ' + summaryError + '. OPENAI_API_KEY / OPENAI_SUMMARY_MODEL \uD655\uC778 \uD6C4 \uB2E4\uC2DC Notion \uBC18\uC601\uC744 \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.')]
  }
  return [paragraphBlock('\uC694\uC57D \uC0DD\uC131 \uC804\uC785\uB2C8\uB2E4. GPT-5 mini \uC5F0\uB3D9 \uD6C4 \uC774 \uC139\uC158\uC5D0 \uC790\uB3D9 \uC694\uC57D\uC744 \uAE30\uB85D\uD569\uB2C8\uB2E4.')]
}

async function appendBlocksInChunks(api: NotionApi, pageId: string, blocks: Array<Record<string, unknown>>): Promise<void> {
  for (let i = 0; i < blocks.length; i += 80) {
    await api.appendBlockChildren(pageId, blocks.slice(i, i + 80))
  }
}

function readBlockPlainText(block: Record<string, unknown>, type: string): string {
  const payload = block[type]
  if (!payload || typeof payload !== 'object') return ''
  const richText = Array.isArray((payload as Record<string, unknown>).rich_text) ? ((payload as Record<string, unknown>).rich_text as unknown[]) : []
  return richText
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return ''
      const text = (entry as Record<string, unknown>).text
      if (text && typeof text === 'object') {
        return asString((text as Record<string, unknown>).content) ?? ''
      }
      return asString((entry as Record<string, unknown>).plain_text) ?? ''
    })
    .join('')
    .trim()
}

function isHeadingWithText(block: Record<string, unknown>, expected: string): boolean {
  const type = asString(block.type)
  if (type !== 'heading_1' && type !== 'heading_2') return false
  return readBlockPlainText(block, type) === expected
}

function isHeading2WithText(block: Record<string, unknown>, expected: string): boolean {
  const type = asString(block.type)
  if (type !== 'heading_2') return false
  return readBlockPlainText(block, type) === expected
}

function isHeading2Block(block: Record<string, unknown>): boolean {
  return asString(block.type) === 'heading_2'
}

async function replaceMeetingSummarySection(
  api: NotionApi,
  pageId: string,
  summaryText: string | null,
  summaryError: string | null,
): Promise<void> {
  const response = await api.listBlockChildren(pageId)
  const topLevelBlocks = Array.isArray(response?.results) ? (response.results as Array<Record<string, unknown>>) : []
  const summaryIndex = topLevelBlocks.findIndex((block) => isHeadingWithText(block, '\uC694\uC57D'))
  const transcriptIndex = topLevelBlocks.findIndex((block, index) => index > summaryIndex && isHeading2WithText(block, '\uC804\uBB38'))
  if (summaryIndex < 0 || transcriptIndex < 0) {
    await appendBlocksInChunks(api, pageId, buildTranscriptSummaryBlocks(summaryText, summaryError))
    return
  }

  const summaryHeadingId = asString(topLevelBlocks[summaryIndex]?.id)
  if (!summaryHeadingId) {
    throw new Error('summary_section_not_found')
  }

  const summaryContentBlocks = topLevelBlocks.slice(summaryIndex + 1, transcriptIndex)
  for (const block of summaryContentBlocks) {
    const blockId = asString(block.id)
    if (!blockId) continue
    await api.updateBlock(blockId, { archived: true })
  }

  const nextBlocks = buildTranscriptSummaryBlocks(summaryText, summaryError)
  if (nextBlocks.length === 0) return
  let anchorId = summaryHeadingId
  for (let i = 0; i < nextBlocks.length; i += 80) {
    const chunk = nextBlocks.slice(i, i + 80)
    const appended = await api.appendBlockChildren(pageId, chunk, anchorId)
    const results = Array.isArray(appended?.results) ? (appended.results as Array<Record<string, unknown>>) : []
    const lastAppendedId = asString(results.at(-1)?.id)
    if (lastAppendedId) anchorId = lastAppendedId
  }
}

async function replaceMeetingTranscriptSection(
  api: NotionApi,
  pageId: string,
  detail: Record<string, unknown>,
  speakerMap: Record<string, string>,
): Promise<void> {
  const response = await api.listBlockChildren(pageId)
  const topLevelBlocks = Array.isArray(response?.results) ? (response.results as Array<Record<string, unknown>>) : []
  const transcriptIndex = topLevelBlocks.findIndex((block) => isHeading2WithText(block, '\uC804\uBB38'))
  const transcriptBlocks = buildTranscriptUtteranceBlocks(normalizeUtterances(detail.utterances), speakerMap)

  if (transcriptIndex < 0) {
    const appendBlocks = [headingBlock('heading_2', '\uC804\uBB38'), ...transcriptBlocks]
    await appendBlocksInChunks(api, pageId, appendBlocks)
    return
  }

  const transcriptHeadingId = asString(topLevelBlocks[transcriptIndex]?.id)
  if (!transcriptHeadingId) {
    throw new Error('transcript_section_not_found')
  }

  const nextHeading2Index = topLevelBlocks.findIndex((block, index) => index > transcriptIndex && isHeading2Block(block))
  const transcriptContentBlocks =
    nextHeading2Index > transcriptIndex ? topLevelBlocks.slice(transcriptIndex + 1, nextHeading2Index) : topLevelBlocks.slice(transcriptIndex + 1)

  let cleanReplace = transcriptContentBlocks.length <= MAX_TRANSCRIPT_REPLACEMENT_ARCHIVE_BLOCKS
  if (cleanReplace) {
    for (const block of transcriptContentBlocks) {
      const blockId = asString(block.id)
      if (!blockId) continue
      await api.updateBlock(blockId, { archived: true })
    }
  }

  let nextBlocks = transcriptBlocks
  if (!cleanReplace && transcriptContentBlocks.length > 0) {
    nextBlocks = [
      paragraphBlock('\uAE30\uC874 \uC804\uBB38 \uBE14\uB85D \uC218\uAC00 \uB9CE\uC544 \uC774\uBC88 \uBCF5\uAD6C\uBCF8\uC744 \uC0C1\uB2E8\uC5D0 \uCD94\uAC00\uD588\uC2B5\uB2C8\uB2E4. \uC544\uB798 \uAE30\uC874 \uBE14\uB85D\uC740 \uBCF4\uAD00\uBCF8\uC785\uB2C8\uB2E4.', 6_000),
      ...transcriptBlocks,
    ]
  }

  let anchorId = transcriptHeadingId
  for (let i = 0; i < nextBlocks.length; i += 80) {
    const chunk = nextBlocks.slice(i, i + 80)
    const appended = await api.appendBlockChildren(pageId, chunk, anchorId)
    const results = Array.isArray(appended?.results) ? (appended.results as Array<Record<string, unknown>>) : []
    const lastAppendedId = asString(results.at(-1)?.id)
    if (lastAppendedId) anchorId = lastAppendedId
  }
}

async function clearPageBlocks(api: NotionApi, pageId: string): Promise<void> {
  let cursor: string | undefined
  do {
    const response = await api.listBlockChildren(pageId, cursor)
    const blocks = Array.isArray(response?.results) ? response.results : []
    for (const block of blocks) {
      const blockId = asString((block as Record<string, unknown>)?.id)
      if (!blockId) continue
      await api.updateBlock(blockId, { archived: true })
    }
    const nextCursor = asString(response?.next_cursor)
    cursor = response?.has_more && nextCursor ? nextCursor : undefined
  } while (cursor)
}

async function buildMeetingAudioFileAttachment(
  api: NotionApi,
  env: Env,
  audioKey: string,
): Promise<{ block: Record<string, unknown>; propertyFile: Record<string, unknown> }> {
  const bucket = getMeetingAudioBucket(env)
  const object = await bucket.get(audioKey)
  if (!object) {
    throw new Error('audio_not_found')
  }

  const filename = extractFilenameFromAudioKey(audioKey)
  const objectSize = r2ObjectSize(object)
  const resolved = objectSize !== null && objectSize > MAX_NOTION_FILE_UPLOAD_BYTES ? null : await readR2ObjectAsArrayBuffer(object)
  const contentType = normalizeAudioContentType(resolved?.contentType, filename)

  const useMultipart = objectSize !== null && objectSize > MAX_NOTION_FILE_UPLOAD_BYTES
  const useExternalImportFallback = objectSize === null
  const multipartChunkBytes = useMultipart && objectSize !== null ? getNotionMultipartChunkBytes(objectSize) : null
  const multipartParts =
    useMultipart && objectSize !== null && multipartChunkBytes
      ? Math.ceil(objectSize / multipartChunkBytes)
      : 0

  const created = useExternalImportFallback
    ? await api.createExternalUrlFileUpload(filename, await resolveMeetingFetchUrl(env, audioKey))
    : useMultipart
      ? await api.createMultipartFileUpload(filename, contentType, multipartParts)
      : await api.createFileUpload(filename, contentType)
  const fileUploadId = asString((created as Record<string, unknown>)?.id)
  if (!fileUploadId) {
    throw new Error('notion_file_upload_create_failed')
  }

  if (resolved) {
    await api.sendFileUpload(fileUploadId, resolved.bytes, filename, contentType)
  } else if (useMultipart && objectSize !== null && multipartChunkBytes) {
    for (let partNumber = 1, offset = 0; offset < objectSize; partNumber += 1, offset += multipartChunkBytes) {
      const nextLength = Math.min(multipartChunkBytes, objectSize - offset)
      const bytes = await readR2ObjectRangeAsArrayBuffer(bucket, audioKey, offset, nextLength)
      await api.sendFileUpload(fileUploadId, bytes, filename, contentType, partNumber)
    }
    await api.completeFileUpload(fileUploadId)
  }

  let uploaded = await api.retrieveFileUpload(fileUploadId)
  let status = asString((uploaded as Record<string, unknown>)?.status)
  if (resolved) {
    if (status && status !== 'uploaded') {
      throw new Error('notion_file_upload_send_failed')
    }
  } else if (useMultipart) {
    for (let attempt = 0; attempt < NOTION_MULTIPART_COMPLETE_POLL_ATTEMPTS; attempt += 1) {
      if (!status || status === 'uploaded') break
      if (status === 'failed' || status === 'expired') {
        throw new Error('notion_multipart_file_upload_failed')
      }
      await delay(NOTION_MULTIPART_COMPLETE_POLL_MS)
      uploaded = await api.retrieveFileUpload(fileUploadId)
      status = asString((uploaded as Record<string, unknown>)?.status)
    }
    if (status && status !== 'uploaded') {
      throw new Error('notion_multipart_file_upload_incomplete')
    }
  } else {
    for (let attempt = 0; attempt < LARGE_NOTION_IMPORT_POLL_ATTEMPTS; attempt += 1) {
      if (!status || status === 'uploaded') break
      if (status === 'failed' || status === 'expired') {
        throw new Error('notion_external_file_import_failed')
      }
      await delay(LARGE_NOTION_IMPORT_POLL_MS)
      uploaded = await api.retrieveFileUpload(fileUploadId)
      status = asString((uploaded as Record<string, unknown>)?.status)
    }
    if (status === 'failed' || status === 'expired') {
      throw new Error('notion_external_file_import_failed')
    }
  }

  const fileUploadRef = {
    name: filename,
    type: 'file_upload',
    file_upload: { id: fileUploadId },
  }

  return {
    block: {
      object: 'block',
      type: 'file',
      file: {
        ...fileUploadRef,
        caption: toNotionRichText('Original audio file', 120),
      },
    },
    propertyFile: fileUploadRef,
  }
}

// ---- Notion transcript operations ----

async function updateMeetingNotionTranscriptFromAssembly(
  env: Env,
  assemblyId: string,
): Promise<{
  status: string
  utteranceCount: number
  unmappedSpeakers: string[]
  audioFileAttached: boolean
  audioAttachmentError: string | null
  summaryGenerated: boolean
  summaryError: string | null
}> {
  const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
  if (!found) throw new Error('transcript_not_found')
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = normalizeMeetingStatus(asString(detail.status) ?? 'processing')
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)
  const inferredMeetingDate =
    found.row.meetingDate ||
    parseMeetingTitleMetadata(stripMeetingUploadKeyPrefix(extractFilenameFromAudioKey(found.row.audioKey))).meetingDate

  const statusPatch: Record<string, unknown> = {
    [MEETING_NOTION_FIELD.status]: { select: { name: status } },
    [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
    [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(asString(detail.error) ?? '', 1200),
    [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
  }
  if (inferredMeetingDate) {
    statusPatch[found.ctx.datePropertyName] = { date: { start: inferredMeetingDate } }
  }

  await found.ctx.api.updatePage(found.row.pageId, {
    properties: statusPatch,
  })

  if (status !== 'completed') {
    throw new Error('transcript_not_completed')
  }

  const invalidSimpleAlphaSpeakers = findInvalidSimpleAlphabetMappedSpeakers(utterances, found.row.speakerMap)
  if (invalidSimpleAlphaSpeakers.length > 0) {
    throw new Error(`speaker_mapping_invalid_simple_alpha:${invalidSimpleAlphaSpeakers.join(',')}`)
  }

  const unmappedSpeakers = findUnmappedSpeakers(utterances, found.row.speakerMap)
  if (unmappedSpeakers.length > 0) {
    throw new Error(`speaker_mapping_incomplete:${unmappedSpeakers.join(',')}`)
  }

  let summaryText: string | null = null
  let summaryError: string | null = null
  try {
    summaryText = await generateMeetingSummary(env, utterances, found.row.speakerMap, text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    summaryError = detail.trim().slice(0, 240) || 'summary_generation_failed'
  }
  if (!summaryText && !summaryError && !asString(env.OPENAI_API_KEY)) {
    summaryError = 'openai_api_key_missing'
  }

  let audioAttachment: { block: Record<string, unknown>; propertyFile: Record<string, unknown> } | null = null
  let audioAttachmentError: string | null = null
  try {
    audioAttachment = await buildMeetingAudioFileAttachment(found.ctx.api, env, found.row.audioKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('audio_not_found')) {
      audioAttachmentError = message.trim().slice(0, 240) || 'audio_attachment_failed'
    }
  }

  const blocks = [
    ...(audioAttachment ? [audioAttachment.block] : []),
    ...buildTranscriptBodyBlocks(detail, found.row.speakerMap, summaryText, summaryError),
  ]
  await clearPageBlocks(found.ctx.api, found.row.pageId)
  if (blocks.length > 0) {
    await appendBlocksInChunks(found.ctx.api, found.row.pageId, blocks)
  }
  const finalProperties: Record<string, unknown> = {
    [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
    [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
  }
  if (audioAttachment) {
    finalProperties[MEETING_NOTION_FIELD.audioFile] = { files: [audioAttachment.propertyFile] }
  }
  await found.ctx.api.updatePage(found.row.pageId, {
    properties: finalProperties,
  })
  return {
    status,
    utteranceCount: utterances.length,
    unmappedSpeakers: [],
    audioFileAttached: Boolean(audioAttachment),
    audioAttachmentError,
    summaryGenerated: Boolean(summaryText && summaryText.trim()),
    summaryError,
  }
}

async function retryMeetingNotionSummaryFromAssembly(
  env: Env,
  assemblyId: string,
): Promise<{
  status: string
  utteranceCount: number
  summaryGenerated: boolean
  summaryError: string | null
}> {
  const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
  if (!found) throw new Error('transcript_not_found')
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = normalizeMeetingStatus(asString(detail.status) ?? 'processing')
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)

  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.status]: { select: { name: status } },
      [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(asString(detail.error) ?? '', 1200),
      [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
    },
  })

  if (status !== 'completed') {
    throw new Error('transcript_not_completed')
  }

  const invalidSimpleAlphaSpeakers = findInvalidSimpleAlphabetMappedSpeakers(utterances, found.row.speakerMap)
  if (invalidSimpleAlphaSpeakers.length > 0) {
    throw new Error(`speaker_mapping_invalid_simple_alpha:${invalidSimpleAlphaSpeakers.join(',')}`)
  }

  const unmappedSpeakers = findUnmappedSpeakers(utterances, found.row.speakerMap)
  if (unmappedSpeakers.length > 0) {
    throw new Error(`speaker_mapping_incomplete:${unmappedSpeakers.join(',')}`)
  }

  let summaryText: string | null = null
  let summaryError: string | null = null
  try {
    summaryText = await generateMeetingSummary(env, utterances, found.row.speakerMap, text)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    summaryError = detail.trim().slice(0, 240) || 'summary_generation_failed'
  }
  if (!summaryText && !summaryError && !asString(env.OPENAI_API_KEY)) {
    summaryError = 'openai_api_key_missing'
  }

  await replaceMeetingSummarySection(found.ctx.api, found.row.pageId, summaryText, summaryError)
  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
    },
  })

  return {
    status,
    utteranceCount: utterances.length,
    summaryGenerated: Boolean(summaryText && summaryText.trim()),
    summaryError,
  }
}

async function rewriteMeetingTranscriptSectionFromAssembly(
  env: Env,
  assemblyId: string,
): Promise<{
  status: string
  utteranceCount: number
  summaryGenerated: boolean
  summaryError: string | null
}> {
  const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
  if (!found) throw new Error('transcript_not_found')
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = normalizeMeetingStatus(asString(detail.status) ?? 'processing')
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)

  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.status]: { select: { name: status } },
      [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(asString(detail.error) ?? '', 1200),
      [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
    },
  })

  if (status !== 'completed') {
    throw new Error('transcript_not_completed')
  }

  const invalidSimpleAlphaSpeakers = findInvalidSimpleAlphabetMappedSpeakers(utterances, found.row.speakerMap)
  if (invalidSimpleAlphaSpeakers.length > 0) {
    throw new Error(`speaker_mapping_invalid_simple_alpha:${invalidSimpleAlphaSpeakers.join(',')}`)
  }

  const unmappedSpeakers = findUnmappedSpeakers(utterances, found.row.speakerMap)
  if (unmappedSpeakers.length > 0) {
    throw new Error(`speaker_mapping_incomplete:${unmappedSpeakers.join(',')}`)
  }

  await replaceMeetingTranscriptSection(found.ctx.api, found.row.pageId, detail, found.row.speakerMap)
  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
    },
  })

  return {
    status,
    utteranceCount: utterances.length,
    summaryGenerated: false,
    summaryError: null,
  }
}

async function regenerateMeetingNotionPageFromAssembly(
  env: Env,
  assemblyId: string,
): Promise<{
  status: string
  utteranceCount: number
  audioFileAttached: boolean
  audioAttachmentError: string | null
  summaryGenerated: boolean
  summaryError: string | null
}> {
  const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
  if (!found) throw new Error('transcript_not_found')
  const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(assemblyId)}`)
  const status = normalizeMeetingStatus(asString(detail.status) ?? 'processing')
  const text = asString(detail.text) ?? ''
  const utterances = normalizeUtterances(detail.utterances)
  const inferredMeetingDate =
    found.row.meetingDate ||
    parseMeetingTitleMetadata(stripMeetingUploadKeyPrefix(extractFilenameFromAudioKey(found.row.audioKey))).meetingDate
  const existingPage = await found.ctx.api.retrievePage(found.row.pageId)
  const existingProps = ((existingPage as Record<string, unknown>)?.properties ?? {}) as Record<string, unknown>

  if (status !== 'completed') {
    throw new Error('transcript_not_completed')
  }

  const invalidSimpleAlphaSpeakers = findInvalidSimpleAlphabetMappedSpeakers(utterances, found.row.speakerMap)
  if (invalidSimpleAlphaSpeakers.length > 0) {
    throw new Error(`speaker_mapping_invalid_simple_alpha:${invalidSimpleAlphaSpeakers.join(',')}`)
  }

  const unmappedSpeakers = findUnmappedSpeakers(utterances, found.row.speakerMap)
  if (unmappedSpeakers.length > 0) {
    throw new Error(`speaker_mapping_incomplete:${unmappedSpeakers.join(',')}`)
  }

  let summaryText: string | null = null
  let summaryError: string | null = null
  try {
    summaryText = await generateMeetingSummary(env, utterances, found.row.speakerMap, text)
  } catch (error) {
    const detailMessage = error instanceof Error ? error.message : String(error)
    summaryError = detailMessage.trim().slice(0, 240) || 'summary_generation_failed'
  }
  if (!summaryText && !summaryError && !asString(env.OPENAI_API_KEY)) {
    summaryError = 'openai_api_key_missing'
  }

  let audioAttachment: { block: Record<string, unknown>; propertyFile: Record<string, unknown> } | null = null
  let audioAttachmentError: string | null = null
  try {
    audioAttachment = await buildMeetingAudioFileAttachment(found.ctx.api, env, found.row.audioKey)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('audio_not_found')) {
      audioAttachmentError = message.trim().slice(0, 240) || 'audio_attachment_failed'
    }
  }

  const blocks = [
    ...(audioAttachment ? [audioAttachment.block] : []),
    ...buildTranscriptBodyBlocks(detail, found.row.speakerMap, summaryText, summaryError),
  ]
  const now = Date.now()
  const createdPage = await found.ctx.api.createPage({
    parent: { database_id: found.ctx.databaseId },
    properties: {
      [found.ctx.titlePropertyName]: { title: toNotionRichText(found.row.title || found.row.id, 300) },
      [found.ctx.datePropertyName]: inferredMeetingDate ? { date: { start: inferredMeetingDate } } : { date: null },
      [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.transcript } },
      [MEETING_NOTION_FIELD.transcriptId]: notionRichTextValue(found.row.id, 200),
      [MEETING_NOTION_FIELD.meetingId]: notionRichTextValue(found.row.meetingId, 200),
      [MEETING_NOTION_FIELD.assemblyId]: notionRichTextValue(assemblyId, 200),
      [MEETING_NOTION_FIELD.status]: { select: { name: status } },
      [MEETING_NOTION_FIELD.audioKey]: notionRichTextValue(found.row.audioKey, 600),
      [MEETING_NOTION_FIELD.audioFile]: { files: audioAttachment ? [audioAttachment.propertyFile] : [] },
      [MEETING_NOTION_FIELD.speakerMapJson]: notionRichTextValue(JSON.stringify(found.row.speakerMap), 6000),
      [MEETING_NOTION_FIELD.keywordsUsedJson]: notionRichTextValue(JSON.stringify(found.row.keywordsUsed), 6000),
      [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(asString(detail.error) ?? '', 1200),
      [MEETING_NOTION_FIELD.createdAt]: { number: found.row.createdAt || now },
      [MEETING_NOTION_FIELD.updatedAt]: { number: now },
      [MEETING_NOTION_FIELD.minSpeakers]: { number: notionReadNumber(existingProps[MEETING_NOTION_FIELD.minSpeakers]) },
      [MEETING_NOTION_FIELD.maxSpeakers]: { number: notionReadNumber(existingProps[MEETING_NOTION_FIELD.maxSpeakers]) },
      [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(notionReadRichText(existingProps[MEETING_NOTION_FIELD.keywordSetId]), 200),
      [MEETING_NOTION_FIELD.keywordSetName]: notionRichTextValue(notionReadRichText(existingProps[MEETING_NOTION_FIELD.keywordSetName]), 500),
      [MEETING_NOTION_FIELD.bodySynced]: { checkbox: true },
      [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
    },
  })
  const newPageId = asString(createdPage?.id)
  if (!newPageId) {
    throw new Error('notion_transcript_regenerate_failed_[UNKNOWN]')
  }
  if (blocks.length > 0) {
    await appendBlocksInChunks(found.ctx.api, newPageId, blocks)
  }
  await found.ctx.api.updatePage(found.row.pageId, {
    properties: {
      [MEETING_NOTION_FIELD.transcriptId]: notionRichTextValue(`${found.row.id}__archived__${now}`, 200),
      [MEETING_NOTION_FIELD.updatedAt]: { number: now },
    },
  })
  await found.ctx.api.updatePage(found.row.pageId, { archived: true })

  return {
    status,
    utteranceCount: utterances.length,
    audioFileAttached: Boolean(audioAttachment),
    audioAttachmentError,
    summaryGenerated: Boolean(summaryText && summaryText.trim()),
    summaryError,
  }
}

// ---- Notion keyword helpers ----

async function listNotionKeywordSets(
  env: Env,
): Promise<
  Array<{
    id: string
    name: string
    isActive: boolean
    createdAt: number
    keywordCount: number
  }>
> {
  const ctx = await ensureMeetingNotionSchema(env)
  const [setPages, keywordPages] = await Promise.all([
    queryAllMeetingNotionPages(ctx, {
      filter: { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keywordSet } },
      sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
    }),
    queryAllMeetingNotionPages(ctx, {
      filter: { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
    }),
  ])

  const counts = new Map<string, number>()
  for (const page of keywordPages) {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const setId = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId])
    if (!setId) continue
    counts.set(setId, (counts.get(setId) ?? 0) + 1)
  }

  return setPages.map((page) => {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const id = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId]) || asString(page?.id) || ''
    const name = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetName]) || notionReadTitle(props[ctx.titlePropertyName]) || 'Untitled set'
    return {
      id,
      name,
      isActive: notionReadCheckbox(props[MEETING_NOTION_FIELD.isActive]),
      createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
      keywordCount: counts.get(id) ?? 0,
    }
  })
}

async function listNotionKeywords(
  env: Env,
  setId?: string,
): Promise<
  Array<{
    id: string
    setId: string
    phrase: string
    weight: number | null
    tags: string | null
    createdAt: number
  }>
> {
  const ctx = await ensureMeetingNotionSchema(env)
  const filter = setId
    ? {
        and: [
          { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } },
          { property: MEETING_NOTION_FIELD.keywordSetId, rich_text: { equals: setId } },
        ],
      }
    : { property: MEETING_NOTION_FIELD.recordType, select: { equals: MEETING_RECORD_TYPE.keyword } }
  const pages = await queryAllMeetingNotionPages(ctx, {
    filter,
    sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
  })

  return pages.map((page) => {
    const props = (page?.properties ?? {}) as Record<string, unknown>
    const id = notionReadRichText(props[MEETING_NOTION_FIELD.keywordId]) || asString(page?.id) || ''
    const setIdValue = notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetId]) || ''
    const phrase = notionReadRichText(props[MEETING_NOTION_FIELD.phrase]) || notionReadTitle(props[ctx.titlePropertyName]) || ''
    const weight = notionReadNumber(props[MEETING_NOTION_FIELD.weight])
    return {
      id,
      setId: setIdValue,
      phrase,
      weight: Number.isFinite(weight) ? weight : null,
      tags: notionReadRichText(props[MEETING_NOTION_FIELD.tags]) || null,
      createdAt: notionReadNumber(props[MEETING_NOTION_FIELD.createdAt]),
    }
  })
}

async function readKeywordPhrasesBySetIdFromNotion(
  env: Env,
  setId: string | null,
): Promise<{ phrases: string[]; truncated: boolean; total: number }> {
  if (!setId) return { phrases: [], truncated: false, total: 0 }
  const keywordLimit = parseMeetingKeywordLimit(env)
  const ctx = await ensureMeetingNotionSchema(env)
  const uniquePhrases = new Set<string>()
  let cursor: string | undefined
  let hasMore = false
  for (let page = 0; page < 6; page += 1) {
    const payload: Record<string, unknown> = {
      filter: keywordFilterBySetId(setId),
      sorts: [{ property: MEETING_NOTION_FIELD.createdAt, direction: 'descending' }],
      page_size: 100,
    }
    if (cursor) payload.start_cursor = cursor
    const result = await ctx.api.queryDatabase(ctx.databaseId, payload)
    const rows = Array.isArray(result?.results) ? result.results : []
    for (const row of rows) {
      if (!row || row.archived || row.in_trash) continue
      const props = (row.properties ?? {}) as Record<string, unknown>
      const phrase = (notionReadRichText(props[MEETING_NOTION_FIELD.phrase]) || notionReadTitle(props[ctx.titlePropertyName]) || '').trim()
      if (!phrase) continue
      uniquePhrases.add(phrase)
      if (uniquePhrases.size >= keywordLimit) break
    }
    if (uniquePhrases.size >= keywordLimit) {
      hasMore = true
      break
    }
    const nextCursor = asString(result?.next_cursor)
    hasMore = Boolean(result?.has_more && nextCursor)
    if (!hasMore) break
    cursor = nextCursor
  }
  const phrases = Array.from(uniquePhrases)
  return {
    phrases: phrases.slice(0, keywordLimit),
    truncated: hasMore || phrases.length > keywordLimit,
    total: phrases.length,
  }
}

// ---- Route path helpers ----

export function isMeetingRoutePath(path: string): boolean {
  return (
    path === '/uploads/presign' ||
    path === '/uploads/events' ||
    path === '/uploads/sessions' ||
    path === '/transcripts' ||
    path === '/keyword-sets' ||
    path === '/keywords' ||
    path === '/assemblyai/webhook' ||
    /^\/transcripts\/[^/]+$/.test(path) ||
    /^\/transcripts\/[^/]+\/speakers$/.test(path) ||
    /^\/transcripts\/[^/]+\/publish$/.test(path) ||
    /^\/transcripts\/[^/]+\/retry-summary$/.test(path) ||
    /^\/transcripts\/[^/]+\/rewrite-transcript$/.test(path) ||
    /^\/transcripts\/[^/]+\/regenerate-page$/.test(path)
  )
}

export function isMeetingPreAuthRoute(method: string, path: string): boolean {
  return (
    (method === 'POST' && path === '/assemblyai/webhook') ||
    (method === 'POST' && path === '/uploads/events')
  )
}

// ---- Main route handlers ----

export async function handleMeetingRoutes(
  request: Request,
  path: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  respond: {
    json: (body: unknown, status: number) => Response
    ok: (body: unknown) => Response
  },
): Promise<Response | null> {
  if (isMeetingRoutePath(path)) return handleMeetingRoutesNotion(request, path, url, env, ctx, respond)

  const toErrorStatus = (message: string): number => {
    if (
      message.includes('_required') ||
      message.includes('_invalid') ||
      message.includes('speaker_range_invalid') ||
      message.includes('mappings_required')
    ) {
      return 400
    }
    if (message.includes('not_found')) return 404
    if (message.includes('assemblyai_http_')) return 502
    return 500
  }
  const fail = (error: unknown): Response => {
    const message = error instanceof Error && error.message ? error.message : 'unknown_error'
    return respond.json({ ok: false, error: message }, toErrorStatus(message))
  }

  const transcriptMatch = path.match(/^\/transcripts\/([^/]+)$/)
  const speakerMatch = path.match(/^\/transcripts\/([^/]+)\/speakers$/)

  try {
    if (request.method === 'POST' && path === '/uploads/presign') {
      const payload = parsePatchBody(await readJsonBody(request))
      const filename = asString(payload.filename) ?? asString(payload.name) ?? 'recording.m4a'
      const contentTypeRaw = asString(payload.contentType) ?? asString(payload.mimeType) ?? 'audio/m4a'
      const contentType = normalizeAudioContentType(contentTypeRaw, filename)
      const key = buildMeetingAudioKey(filename)
      const signed = await createR2PresignedUrl(env, key, 'PUT', {
        expiresIn: 15 * 60,
        contentType,
      })
      return respond.ok({
        ok: true,
        key,
        putUrl: signed.url,
        requiredHeaders: signed.requiredHeaders ?? {},
      })
    }

    if (request.method === 'POST' && path === '/transcripts') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseMeetingTranscriptBody(await readJsonBody(request))
      const keywordInfo = await readKeywordPhrasesBySetId(env, payload.keywordSetId)
      const getSigned = await createR2PresignedUrl(env, payload.key, 'GET', {
        expiresIn: 60 * 60,
      })

      const meetingId = crypto.randomUUID()
      const transcriptId = crypto.randomUUID()
      const now = Date.now()

      await db
        .prepare(
          `INSERT INTO meetings (id, title, audio_key, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(meetingId, payload.title, payload.key, now)
        .run()

      await db
        .prepare(
          `INSERT INTO transcripts (id, meeting_id, assembly_id, status, raw_json, utterances_json, text, keywords_used_json, error_message, created_at, updated_at)
           VALUES (?, ?, NULL, ?, NULL, NULL, NULL, ?, NULL, ?, ?)`,
        )
        .bind(transcriptId, meetingId, 'queued', JSON.stringify(keywordInfo.phrases), now, now)
        .run()

      const webhookUrl = asString(env.ASSEMBLYAI_WEBHOOK_URL) ?? `${url.origin}/api/assemblyai/webhook`
      const webhookSecret = getAssemblyWebhookSecret(env)
      const speechModels = parseAssemblySpeechModels(env)
      const assemblyPayload: Record<string, unknown> = {
        audio_url: getSigned.url,
        language_code: 'ko',
        speech_models: speechModels,
        speaker_labels: true,
        webhook_url: webhookUrl,
        webhook_auth_header_name: 'x-assemblyai-webhook-secret',
        webhook_auth_header_value: webhookSecret,
      }
      if (keywordInfo.phrases.length > 0) {
        assemblyPayload.keyterms_prompt = keywordInfo.phrases
      }
      // [UNKNOWN] AssemblyAI diarization range field compatibility may differ by API version.
      assemblyPayload.speaker_options = {
        min_speakers: payload.minSpeakers,
        max_speakers: payload.maxSpeakers,
      }

      let created: Record<string, unknown>
      try {
        created = await assemblyRequest<Record<string, unknown>>(env, '/transcript', {
          method: 'POST',
          body: JSON.stringify(assemblyPayload),
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'assembly_request_failed'
        await db
          .prepare(
            `UPDATE transcripts
             SET status = ?, error_message = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind('failed', message.slice(0, 600), Date.now(), transcriptId)
          .run()
        throw error
      }

      const assemblyId = asString(created.id)
      if (!assemblyId) {
        await db
          .prepare(
            `UPDATE transcripts
             SET status = ?, error_message = ?, updated_at = ?
             WHERE id = ?`,
          )
          .bind('failed', 'assembly_transcript_id_missing_[UNKNOWN]', Date.now(), transcriptId)
          .run()
        throw new Error('assembly_transcript_id_missing_[UNKNOWN]')
      }
      const status = asString(created.status) ?? 'queued'

      await db
        .prepare(
          `UPDATE transcripts
           SET assembly_id = ?, status = ?, raw_json = ?, error_message = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .bind(assemblyId, status, JSON.stringify(created), Date.now(), transcriptId)
        .run()

      return respond.json(
        {
          ok: true,
          transcriptId,
          meetingId,
          assemblyId,
          keywordsUsed: keywordInfo.phrases,
          keywordsTruncated: keywordInfo.truncated,
          keywordsTotal: keywordInfo.total,
        },
        201,
      )
    }

    if (request.method === 'GET' && path === '/transcripts') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const limit = parseBoundedLimit(asString(url.searchParams.get('limit')), 20, TRANSCRIPT_POLL_LIMIT)
      const result = await db
        .prepare(
          `SELECT t.id, t.meeting_id, t.assembly_id, t.status, t.created_at, t.updated_at, m.title, m.audio_key
           FROM transcripts t
           JOIN meetings m ON m.id = t.meeting_id
           ORDER BY t.created_at DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id?: unknown
          meeting_id?: unknown
          assembly_id?: unknown
          status?: unknown
          created_at?: unknown
          updated_at?: unknown
          title?: unknown
          audio_key?: unknown
        }>()

      const rows = Array.isArray(result.results) ? result.results : []
      return respond.ok({
        ok: true,
        transcripts: rows.map((row) => ({
          id: typeof row.id === 'string' ? row.id : '',
          meetingId: typeof row.meeting_id === 'string' ? row.meeting_id : '',
          assemblyId: typeof row.assembly_id === 'string' ? row.assembly_id : null,
          status: typeof row.status === 'string' ? row.status : 'unknown',
          createdAt: Number(row.created_at ?? 0),
          updatedAt: Number(row.updated_at ?? 0),
          title: typeof row.title === 'string' ? row.title : '',
          audioKey: typeof row.audio_key === 'string' ? row.audio_key : '',
        })),
      })
    }

    if (request.method === 'GET' && transcriptMatch) {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const transcriptId = decodeURIComponent(transcriptMatch[1])
      const row = await db
        .prepare(
          `SELECT t.id, t.meeting_id, t.assembly_id, t.status, t.raw_json, t.utterances_json, t.text, t.keywords_used_json, t.error_message, t.created_at, t.updated_at, m.title, m.audio_key
           FROM transcripts t
           JOIN meetings m ON m.id = t.meeting_id
           WHERE t.id = ?`,
        )
        .bind(transcriptId)
        .first<{
          id?: unknown
          meeting_id?: unknown
          assembly_id?: unknown
          status?: unknown
          raw_json?: unknown
          utterances_json?: unknown
          text?: unknown
          keywords_used_json?: unknown
          error_message?: unknown
          created_at?: unknown
          updated_at?: unknown
          title?: unknown
          audio_key?: unknown
        }>()

      if (!row) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      const utterances = (() => {
        try {
          return normalizeUtterances(typeof row.utterances_json === 'string' ? JSON.parse(row.utterances_json) : [])
        } catch {
          return [] as Array<{ speaker: string; text: string; start: number | null; end: number | null }>
        }
      })()
      const speakerMap = await readSpeakerMap(env, transcriptId)
      const mappedUtterances = utterances.map((entry) => ({
        ...entry,
        displaySpeaker: speakerMap[entry.speaker] ?? entry.speaker,
      }))
      const keywordsUsed = (() => {
        try {
          const parsed = typeof row.keywords_used_json === 'string' ? JSON.parse(row.keywords_used_json) : []
          if (!Array.isArray(parsed)) return [] as string[]
          return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        } catch {
          return [] as string[]
        }
      })()

      return respond.ok({
        ok: true,
        transcript: {
          id: typeof row.id === 'string' ? row.id : '',
          meetingId: typeof row.meeting_id === 'string' ? row.meeting_id : '',
          assemblyId: typeof row.assembly_id === 'string' ? row.assembly_id : null,
          status: typeof row.status === 'string' ? row.status : 'unknown',
          text: typeof row.text === 'string' ? row.text : '',
          rawJson: typeof row.raw_json === 'string' ? row.raw_json : null,
          utterances,
          utterancesMapped: mappedUtterances,
          speakerMap,
          keywordsUsed,
          errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
          createdAt: Number(row.created_at ?? 0),
          updatedAt: Number(row.updated_at ?? 0),
          meeting: {
            title: typeof row.title === 'string' ? row.title : '',
            audioKey: typeof row.audio_key === 'string' ? row.audio_key : '',
          },
        },
      })
    }

    if ((request.method === 'POST' || request.method === 'PATCH') && speakerMatch) {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const transcriptId = decodeURIComponent(speakerMatch[1])
      const mappings = parseSpeakerMappingsBody(await readJsonBody(request))
      const now = Date.now()

      const existingTranscript = await db.prepare(`SELECT id FROM transcripts WHERE id = ?`).bind(transcriptId).first<{ id?: unknown }>()
      if (!existingTranscript || typeof existingTranscript.id !== 'string') {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      for (const entry of mappings) {
        await db
          .prepare(
            `INSERT INTO speaker_maps (transcript_id, speaker_label, display_name, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(transcript_id, speaker_label) DO UPDATE SET
               display_name = excluded.display_name,
               updated_at = excluded.updated_at`,
          )
          .bind(transcriptId, entry.speakerLabel, entry.displayName, now)
          .run()
      }

      const speakerMap = await readSpeakerMap(env, transcriptId)
      return respond.ok({
        ok: true,
        transcriptId,
        speakerMap,
      })
    }

    if (request.method === 'GET' && path === '/keyword-sets') {
      const sets = await listKeywordSets(env)
      return respond.ok({
        ok: true,
        sets,
      })
    }

    if (request.method === 'POST' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordSetCreateBody(await readJsonBody(request))
      const id = crypto.randomUUID()
      const now = Date.now()
      await db
        .prepare(
          `INSERT INTO keyword_sets (id, name, is_active, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(id, payload.name, payload.isActive ? 1 : 0, now)
        .run()
      return respond.json(
        {
          ok: true,
          set: {
            id,
            name: payload.name,
            isActive: payload.isActive,
            createdAt: now,
            keywordCount: 0,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordSetPatchBody(await readJsonBody(request))
      if (payload.name !== undefined) {
        await db.prepare(`UPDATE keyword_sets SET name = ? WHERE id = ?`).bind(payload.name, payload.id).run()
      }
      if (payload.isActive !== undefined) {
        await db.prepare(`UPDATE keyword_sets SET is_active = ? WHERE id = ?`).bind(payload.isActive ? 1 : 0, payload.id).run()
      }
      const sets = await listKeywordSets(env)
      const updated = sets.find((entry) => entry.id === payload.id)
      if (!updated) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      return respond.ok({ ok: true, set: updated })
    }

    if (request.method === 'DELETE' && path === '/keyword-sets') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      await db.prepare(`DELETE FROM keywords WHERE set_id = ?`).bind(id).run()
      await db.prepare(`DELETE FROM keyword_sets WHERE id = ?`).bind(id).run()
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'GET' && path === '/keywords') {
      const setId = asString(url.searchParams.get('setId'))
      const keywords = await listKeywords(env, setId)
      return respond.ok({
        ok: true,
        keywords,
      })
    }

    if (request.method === 'POST' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordCreateBody(await readJsonBody(request))
      const id = crypto.randomUUID()
      const now = Date.now()
      await db
        .prepare(
          `INSERT INTO keywords (id, set_id, phrase, weight, tags, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, payload.setId, payload.phrase, payload.weight, payload.tags, now)
        .run()
      return respond.json(
        {
          ok: true,
          keyword: {
            id,
            setId: payload.setId,
            phrase: payload.phrase,
            weight: payload.weight,
            tags: payload.tags,
            createdAt: now,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const payload = parseKeywordPatchBody(await readJsonBody(request))
      if (payload.phrase !== undefined) {
        await db.prepare(`UPDATE keywords SET phrase = ? WHERE id = ?`).bind(payload.phrase, payload.id).run()
      }
      if (payload.weight !== undefined) {
        await db.prepare(`UPDATE keywords SET weight = ? WHERE id = ?`).bind(payload.weight, payload.id).run()
      }
      if (payload.tags !== undefined) {
        await db.prepare(`UPDATE keywords SET tags = ? WHERE id = ?`).bind(payload.tags, payload.id).run()
      }
      const list = await listKeywords(env)
      const keyword = list.find((entry) => entry.id === payload.id)
      if (!keyword) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      return respond.ok({ ok: true, keyword })
    }

    if (request.method === 'DELETE' && path === '/keywords') {
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      await db.prepare(`DELETE FROM keywords WHERE id = ?`).bind(id).run()
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'POST' && path === '/assemblyai/webhook') {
      await ensureMeetingDbTables(env)
      const secret = getAssemblyWebhookSecret(env)
      const headerSecret = asString(request.headers.get('x-assemblyai-webhook-secret'))
      if (!headerSecret || headerSecret !== secret) {
        return respond.json({ ok: false, error: 'webhook_forbidden' }, 403)
      }

      const body = parsePatchBody(await readJsonBody(request))
      const assemblyId = asString(body.transcript_id) ?? asString(body.id)
      if (!assemblyId) {
        return respond.json({ ok: false, error: 'transcript_id_required' }, 400)
      }
      const status = (asString(body.status) ?? 'processing').toLowerCase()
      const errorMessage = asString(body.error) ?? null
      const now = Date.now()
      const db = requireMeetingsDb(env)

      await db
        .prepare(
          `UPDATE transcripts
           SET status = ?, updated_at = ?, error_message = ?
           WHERE assembly_id = ?`,
        )
        .bind(status, now, errorMessage, assemblyId)
        .run()

      if (status === 'completed') {
        ctx.waitUntil(updateTranscriptFromAssembly(env, assemblyId))
      }

      return respond.ok({
        ok: true,
        assemblyId,
        status,
      })
    }
  } catch (error: unknown) {
    return fail(error)
  }

  return null
}

async function handleMeetingRoutesNotion(
  request: Request,
  path: string,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  respond: {
    json: (body: unknown, status: number) => Response
    ok: (body: unknown) => Response
  },
): Promise<Response | null> {
  if (!isMeetingRoutePath(path)) {
    return null
  }

  const toErrorStatus = (message: string): number => {
    if (message.includes('r2_presign_required') || message.includes('r2_presign_config_missing')) return 503
    if (
      message.includes('_required') ||
      message.includes('_invalid') ||
      message.includes('speaker_range_invalid') ||
      message.includes('mappings_required') ||
      message.includes('speaker_mapping_incomplete')
    ) {
      return 400
    }
    if (message.includes('notion_file_too_large')) return 413
    if (message.includes('notion_file_upload_')) return 502
    if (message.includes('notion_external_file_import_failed')) return 502
    if (message.includes('transcript_not_completed')) return 409
    if (message.includes('meetings_db_not_configured')) return 503
    if (message.includes('upload_event_token_invalid')) return 401
    if (message.toLowerCase().includes('too many subrequests')) return 503
    if (message.includes('not_found') || message.includes('object_not_found')) return 404
    if (message.includes('assemblyai_http_')) return 502
    if (message.includes('notion_http_')) return 502
    return 500
  }
  const fail = (error: unknown): Response => {
    const message = error instanceof Error && error.message ? error.message : 'unknown_error'
    return respond.json({ ok: false, error: message }, toErrorStatus(message))
  }

  const transcriptMatch = path.match(/^\/transcripts\/([^/]+)$/)
  const speakerMatch = path.match(/^\/transcripts\/([^/]+)\/speakers$/)
  const publishMatch = path.match(/^\/transcripts\/([^/]+)\/publish$/)
  const retrySummaryMatch = path.match(/^\/transcripts\/([^/]+)\/retry-summary$/)
  const rewriteTranscriptMatch = path.match(/^\/transcripts\/([^/]+)\/rewrite-transcript$/)
  const regeneratePageMatch = path.match(/^\/transcripts\/([^/]+)\/regenerate-page$/)

  try {
    if (request.method === 'POST' && path === '/uploads/presign') {
      const payload = parsePatchBody(await readJsonBody(request))
      const filename = asString(payload.filename) ?? asString(payload.name) ?? 'recording.m4a'
      const contentTypeRaw = asString(payload.contentType) ?? asString(payload.mimeType) ?? 'audio/m4a'
      const contentType = normalizeAudioContentType(contentTypeRaw, filename)
      const key = buildMeetingAudioKey(filename)
      const uploadId = truncateText(asString(payload.uploadId), 120) ?? crypto.randomUUID()
      const upload = await resolveMeetingUploadTarget(env, key, contentType)
      const eventToken = await createMeetingUploadToken(env, {
        key,
        method: 'EVENT',
        expiresInSec: 24 * 60 * 60,
      })

      if (env.CHECKLIST_DB) {
        try {
          await upsertMeetingUploadSession(env, {
            uploadId,
            key,
            filename,
            contentType,
            uploadMode: upload.uploadMode,
            stage: 'presign',
            state: 'presigned',
          })
          await appendMeetingUploadEvent(env, {
            uploadId,
            key,
            eventType: 'presign_issued',
            stage: 'presign',
            state: 'presigned',
            reasonCode: null,
            reasonMessage: null,
            elapsedMs: null,
            payloadJson: null,
          })
        } catch {
          // Upload should continue even if logging storage is temporarily unavailable.
        }
      }

      return respond.ok({
        ok: true,
        uploadId,
        eventToken,
        key,
        putUrl: upload.url,
        requiredHeaders: upload.requiredHeaders ?? {},
        uploadMode: upload.uploadMode,
      })
    }

    if (request.method === 'POST' && path === '/uploads/events') {
      if (!env.CHECKLIST_DB) {
        return respond.ok({ ok: true, skipped: true })
      }
      const eventBody = parseMeetingUploadEventBody(await readFlexibleJsonBody(request))
      const validToken = await verifyMeetingUploadToken(env, eventBody.token, {
        key: eventBody.key,
        method: 'EVENT',
      })
      if (!validToken) {
        return respond.json({ ok: false, error: 'upload_event_token_invalid' }, 401)
      }

      await markMeetingUploadFromEvent(env, {
        uploadId: eventBody.uploadId,
        key: eventBody.key,
        eventType: eventBody.eventType,
        stage: eventBody.stage,
        state: eventBody.state,
        reasonCode: eventBody.reasonCode,
        reasonMessage: eventBody.reasonMessage,
        elapsedMs: eventBody.elapsedMs,
        payloadJson: eventBody.payloadJson,
      })

      return respond.ok({
        ok: true,
        uploadId: eventBody.uploadId,
      })
    }

    if (request.method === 'GET' && path === '/uploads/sessions') {
      if (!env.CHECKLIST_DB) {
        return respond.ok({ ok: true, sessions: [] })
      }
      await ensureMeetingDbTables(env)
      const db = requireMeetingsDb(env)
      const limit = parseBoundedLimit(asString(url.searchParams.get('limit')), 20, UPLOAD_SESSION_LIST_LIMIT)
      const rows = await db
        .prepare(
          `SELECT
             s.id,
             s.audio_key,
             s.filename,
             s.content_type,
             s.upload_mode,
             s.stage,
             s.state,
             s.reason_code,
             s.reason_message,
             s.transcript_id,
             s.meeting_id,
             s.created_at,
             s.updated_at,
             e.event_type AS last_event_type,
             e.reason_code AS last_reason_code,
             e.reason_message AS last_reason_message,
             e.created_at AS last_event_at
           FROM meeting_upload_sessions s
           LEFT JOIN meeting_upload_events e
             ON e.id = (
               SELECT ee.id
               FROM meeting_upload_events ee
               WHERE ee.upload_id = s.id
               ORDER BY ee.id DESC
               LIMIT 1
             )
           ORDER BY s.updated_at DESC
           LIMIT ?`,
        )
        .bind(limit)
        .all<{
          id: string
          audio_key: string
          filename: string
          content_type: string | null
          upload_mode: string | null
          stage: string
          state: string
          reason_code: string | null
          reason_message: string | null
          transcript_id: string | null
          meeting_id: string | null
          created_at: number
          updated_at: number
          last_event_type: string | null
          last_reason_code: string | null
          last_reason_message: string | null
          last_event_at: number | null
        }>()

      return respond.ok({
        ok: true,
        sessions: (rows.results ?? []).map((row) => ({
          id: row.id,
          key: row.audio_key,
          filename: row.filename,
          contentType: row.content_type,
          uploadMode: row.upload_mode,
          stage: row.stage,
          state: row.state,
          reasonCode: row.reason_code ?? row.last_reason_code,
          reasonMessage: row.reason_message ?? row.last_reason_message,
          transcriptId: row.transcript_id,
          meetingId: row.meeting_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          lastEventType: row.last_event_type,
          lastEventAt: row.last_event_at,
        })),
      })
    }

    if (request.method === 'POST' && path === '/transcripts') {
      const payload = parseMeetingTranscriptBody(await readJsonBody(request))
      const keywordInfo = await readKeywordPhrasesBySetIdFromNotion(env, payload.keywordSetId)
      const audioUrl = await resolveMeetingFetchUrl(env, payload.key)
      const notionCtx = await ensureMeetingNotionSchema(env)

      const meetingId = crypto.randomUUID()
      const transcriptId = crypto.randomUUID()
      const now = Date.now()
      if (env.CHECKLIST_DB && payload.uploadId) {
        try {
          await upsertMeetingUploadSession(env, {
            uploadId: payload.uploadId,
            key: payload.key,
            filename: stripMeetingUploadKeyPrefix(payload.key.split('/').pop() ?? 'recording.m4a'),
            contentType: null,
            uploadMode: null,
            stage: 'transcript',
            state: 'transcript_requested',
            meetingId,
            transcriptId,
            reasonCode: null,
            reasonMessage: null,
            now,
          })
          await appendMeetingUploadEvent(env, {
            uploadId: payload.uploadId,
            key: payload.key,
            eventType: 'transcript_requested',
            stage: 'transcript',
            state: 'transcript_requested',
            reasonCode: null,
            reasonMessage: null,
            elapsedMs: null,
            payloadJson: null,
            createdAt: now,
          })
        } catch {
          // Keep transcript flow resilient even if D1 write fails.
        }
      }
      let keywordSetName = ''
      if (payload.keywordSetId) {
        const keywordSet = await findMeetingNotionKeywordSetPageById(env, payload.keywordSetId)
        if (keywordSet) {
          const props = (keywordSet.page?.properties ?? {}) as Record<string, unknown>
          keywordSetName =
            notionReadRichText(props[MEETING_NOTION_FIELD.keywordSetName]) ||
            notionReadTitle(props[keywordSet.ctx.titlePropertyName]) ||
            ''
        }
      }

      const createdPage = await notionCtx.api.createPage({
        parent: { database_id: notionCtx.databaseId },
        properties: {
          [notionCtx.titlePropertyName]: { title: toNotionRichText(payload.title || transcriptId, 300) },
          [notionCtx.datePropertyName]: payload.meetingDate ? { date: { start: payload.meetingDate } } : { date: null },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.transcript } },
          [MEETING_NOTION_FIELD.transcriptId]: notionRichTextValue(transcriptId, 200),
          [MEETING_NOTION_FIELD.meetingId]: notionRichTextValue(meetingId, 200),
          [MEETING_NOTION_FIELD.status]: { select: { name: 'queued' } },
          [MEETING_NOTION_FIELD.audioKey]: notionRichTextValue(payload.key, 600),
          [MEETING_NOTION_FIELD.audioFile]: { files: [] },
          [MEETING_NOTION_FIELD.speakerMapJson]: notionRichTextValue('{}', 2000),
          [MEETING_NOTION_FIELD.keywordsUsedJson]: notionRichTextValue(JSON.stringify(keywordInfo.phrases), 6000),
          [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('', 200),
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
          [MEETING_NOTION_FIELD.minSpeakers]: { number: payload.minSpeakers },
          [MEETING_NOTION_FIELD.maxSpeakers]: { number: payload.maxSpeakers },
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(payload.keywordSetId ?? '', 200),
          [MEETING_NOTION_FIELD.keywordSetName]: notionRichTextValue(keywordSetName, 500),
          [MEETING_NOTION_FIELD.bodySynced]: { checkbox: false },
          [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue('', 200),
        },
      })

      const transcriptPageId = asString(createdPage?.id)
      if (!transcriptPageId) {
        throw new Error('notion_transcript_create_failed_[UNKNOWN]')
      }

      const webhookUrl = asString(env.ASSEMBLYAI_WEBHOOK_URL) ?? `${url.origin}/api/assemblyai/webhook`
      const webhookSecret = getAssemblyWebhookSecret(env)
      const speechModels = parseAssemblySpeechModels(env)
      const assemblyPayload: Record<string, unknown> = {
        audio_url: audioUrl,
        language_code: 'ko',
        speech_models: speechModels,
        speaker_labels: true,
        webhook_url: webhookUrl,
        webhook_auth_header_name: 'x-assemblyai-webhook-secret',
        webhook_auth_header_value: webhookSecret,
      }
      if (keywordInfo.phrases.length > 0) {
        assemblyPayload.keyterms_prompt = keywordInfo.phrases
      }
      // [UNKNOWN] AssemblyAI diarization range field compatibility may differ by API version.
      assemblyPayload.speaker_options = {
        min_speakers: payload.minSpeakers,
        max_speakers: payload.maxSpeakers,
      }

      let created: Record<string, unknown>
      try {
        created = await assemblyRequest<Record<string, unknown>>(env, '/transcript', {
          method: 'POST',
          body: JSON.stringify(assemblyPayload),
        })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'assembly_request_failed'
        await notionCtx.api.updatePage(transcriptPageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: 'failed' } },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(message.slice(0, 1200), 1200),
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
          },
        })
        if (env.CHECKLIST_DB && payload.uploadId) {
          try {
            await markMeetingUploadFromEvent(env, {
              uploadId: payload.uploadId,
              key: payload.key,
              eventType: 'transcript_request_failed',
              stage: 'transcript',
              state: 'failed',
              reasonCode: 'assembly_request_failed',
              reasonMessage: message.slice(0, 600),
              elapsedMs: null,
              payloadJson: null,
            })
          } catch {}
        }
        throw error
      }

      const assemblyId = asString(created.id)
      if (!assemblyId) {
        await notionCtx.api.updatePage(transcriptPageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: 'failed' } },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('assembly_transcript_id_missing_[UNKNOWN]', 1200),
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
          },
        })
        if (env.CHECKLIST_DB && payload.uploadId) {
          try {
            await markMeetingUploadFromEvent(env, {
              uploadId: payload.uploadId,
              key: payload.key,
              eventType: 'transcript_request_failed',
              stage: 'transcript',
              state: 'failed',
              reasonCode: 'assembly_transcript_id_missing',
              reasonMessage: 'assembly_transcript_id_missing_[UNKNOWN]',
              elapsedMs: null,
              payloadJson: null,
            })
          } catch {}
        }
        throw new Error('assembly_transcript_id_missing_[UNKNOWN]')
      }
      const status = normalizeMeetingStatus(asString(created.status))

      await notionCtx.api.updatePage(transcriptPageId, {
        properties: {
          [MEETING_NOTION_FIELD.assemblyId]: notionRichTextValue(assemblyId, 200),
          [MEETING_NOTION_FIELD.status]: { select: { name: status } },
          [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue('', 1200),
          [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
        },
      })

      if (env.CHECKLIST_DB && payload.uploadId) {
        try {
          await upsertMeetingUploadSession(env, {
            uploadId: payload.uploadId,
            key: payload.key,
            filename: stripMeetingUploadKeyPrefix(payload.key.split('/').pop() ?? 'recording.m4a'),
            contentType: null,
            uploadMode: null,
            stage: 'transcript',
            state: 'transcript_requested',
            meetingId,
            transcriptId,
            reasonCode: null,
            reasonMessage: null,
          })
          await appendMeetingUploadEvent(env, {
            uploadId: payload.uploadId,
            key: payload.key,
            eventType: 'assembly_submitted',
            stage: 'transcript',
            state: 'transcript_requested',
            reasonCode: null,
            reasonMessage: null,
            elapsedMs: null,
            payloadJson: null,
          })
        } catch {}
      }

      return respond.json(
        {
          ok: true,
          transcriptId,
          meetingId,
          assemblyId,
          keywordsUsed: keywordInfo.phrases,
          keywordsTruncated: keywordInfo.truncated,
          keywordsTotal: keywordInfo.total,
        },
        201,
      )
    }

    if (request.method === 'GET' && path === '/transcripts') {
      const limit = parseBoundedLimit(asString(url.searchParams.get('limit')), 20, TRANSCRIPT_POLL_LIMIT)
      const rows = await listMeetingNotionTranscripts(env, limit)
      return respond.ok({
        ok: true,
        transcripts: rows.map((row) => ({
          id: row.id,
          meetingId: row.meetingId,
          meetingDate: row.meetingDate,
          assemblyId: row.assemblyId,
          status: row.status,
          bodySynced: row.bodySynced,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          title: row.title,
          audioKey: row.audioKey,
        })),
      })
    }

    if (request.method === 'GET' && transcriptMatch) {
      const transcriptId = decodeURIComponent(transcriptMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }

      let status = found.row.status
      let text = found.row.textPreview
      let utterances: Array<{ speaker: string; text: string; start: number | null; end: number | null }> = []
      let errorMessage = found.row.errorMessage
      let rawJson: string | null = null

      if (found.row.assemblyId) {
        try {
          const detail = await assemblyRequest<Record<string, unknown>>(env, `/transcript/${encodeURIComponent(found.row.assemblyId)}`)
          rawJson = JSON.stringify(detail)
          status = normalizeMeetingStatus(asString(detail.status) ?? found.row.status)
          text = asString(detail.text) ?? found.row.textPreview
          utterances = normalizeUtterances(detail.utterances)
          errorMessage = asString(detail.error) ?? found.row.errorMessage

          if (
            status !== found.row.status ||
            text.slice(0, 4000) !== found.row.textPreview ||
            (errorMessage ?? '') !== (found.row.errorMessage ?? '')
          ) {
            ctx.waitUntil(
              found.ctx.api.updatePage(found.row.pageId, {
                properties: {
                  [MEETING_NOTION_FIELD.status]: { select: { name: status } },
                  [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
                  [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(errorMessage ?? '', 1200),
                  [MEETING_NOTION_FIELD.textPreview]: notionRichTextValue(text.slice(0, 4000), 4000),
                },
              }),
            )
          }
        } catch {
          // Keep last synced Notion state when AssemblyAI detail fetch fails.
        }
      }

      const speakerMap = found.row.speakerMap
      const mappedUtterances = utterances.map((entry) => ({
        ...entry,
        displaySpeaker: speakerMap[entry.speaker] ?? entry.speaker,
      }))

      return respond.ok({
        ok: true,
        transcript: {
          id: found.row.id,
          meetingId: found.row.meetingId,
          meetingDate: found.row.meetingDate,
          assemblyId: found.row.assemblyId,
          status,
          bodySynced: found.row.bodySynced,
          text,
          rawJson,
          utterances,
          utterancesMapped: mappedUtterances,
          speakerMap,
          keywordsUsed: found.row.keywordsUsed,
          errorMessage,
          createdAt: found.row.createdAt,
          updatedAt: found.row.updatedAt,
          meeting: {
            title: found.row.title,
            audioKey: found.row.audioKey,
            notionPageUrl: notionPageUrl(found.row.pageId),
          },
        },
      })
    }

    if ((request.method === 'POST' || request.method === 'PATCH') && speakerMatch) {
      const transcriptId = decodeURIComponent(speakerMatch[1])
      const mappings = parseSpeakerMappingsBody(await readJsonBody(request))
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      const speakerMap = { ...found.row.speakerMap }
      for (const entry of mappings) {
        speakerMap[entry.speakerLabel] = entry.displayName
      }
      await found.ctx.api.updatePage(found.row.pageId, {
        properties: {
          [MEETING_NOTION_FIELD.speakerMapJson]: notionRichTextValue(JSON.stringify(speakerMap), 6000),
          [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
        },
      })
      return respond.ok({
        ok: true,
        transcriptId,
        speakerMap,
      })
    }

    if (request.method === 'POST' && publishMatch) {
      const transcriptId = decodeURIComponent(publishMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      if (!found.row.assemblyId) {
        return respond.json({ ok: false, error: 'assembly_id_missing' }, 400)
      }
      const published = await updateMeetingNotionTranscriptFromAssembly(env, found.row.assemblyId)
      return respond.ok({
        ok: true,
        transcriptId,
        assemblyId: found.row.assemblyId,
        status: published.status,
        utteranceCount: published.utteranceCount,
        audioFileAttached: published.audioFileAttached,
        audioAttachmentError: published.audioAttachmentError,
        summaryGenerated: published.summaryGenerated,
        summaryError: published.summaryError,
      })
    }

    if (request.method === 'POST' && retrySummaryMatch) {
      const transcriptId = decodeURIComponent(retrySummaryMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      if (!found.row.bodySynced) {
        return respond.json({ ok: false, error: 'transcript_not_published' }, 409)
      }
      if (!found.row.assemblyId) {
        return respond.json({ ok: false, error: 'assembly_id_missing' }, 400)
      }
      const retried = await retryMeetingNotionSummaryFromAssembly(env, found.row.assemblyId)
      return respond.ok({
        ok: true,
        transcriptId,
        assemblyId: found.row.assemblyId,
        status: retried.status,
        utteranceCount: retried.utteranceCount,
        audioFileAttached: false,
        audioAttachmentError: null,
        summaryGenerated: retried.summaryGenerated,
        summaryError: retried.summaryError,
      })
    }

    if (request.method === 'POST' && rewriteTranscriptMatch) {
      const transcriptId = decodeURIComponent(rewriteTranscriptMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      if (!found.row.bodySynced) {
        return respond.json({ ok: false, error: 'transcript_not_published' }, 409)
      }
      if (!found.row.assemblyId) {
        return respond.json({ ok: false, error: 'assembly_id_missing' }, 400)
      }
      const rewritten = await rewriteMeetingTranscriptSectionFromAssembly(env, found.row.assemblyId)
      return respond.ok({
        ok: true,
        transcriptId,
        assemblyId: found.row.assemblyId,
        status: rewritten.status,
        utteranceCount: rewritten.utteranceCount,
        audioFileAttached: false,
        audioAttachmentError: null,
        summaryGenerated: false,
        summaryError: null,
      })
    }

    if (request.method === 'POST' && regeneratePageMatch) {
      const transcriptId = decodeURIComponent(regeneratePageMatch[1])
      const found = await getMeetingNotionTranscriptById(env, transcriptId)
      if (!found) {
        return respond.json({ ok: false, error: 'transcript_not_found' }, 404)
      }
      if (!found.row.bodySynced) {
        return respond.json({ ok: false, error: 'transcript_not_published' }, 409)
      }
      if (!found.row.assemblyId) {
        return respond.json({ ok: false, error: 'assembly_id_missing' }, 400)
      }
      const rebuilt = await regenerateMeetingNotionPageFromAssembly(env, found.row.assemblyId)
      return respond.ok({
        ok: true,
        transcriptId,
        assemblyId: found.row.assemblyId,
        status: rebuilt.status,
        utteranceCount: rebuilt.utteranceCount,
        audioFileAttached: rebuilt.audioFileAttached,
        audioAttachmentError: rebuilt.audioAttachmentError,
        summaryGenerated: rebuilt.summaryGenerated,
        summaryError: rebuilt.summaryError,
      })
    }

    if (request.method === 'GET' && path === '/keyword-sets') {
      const sets = await listNotionKeywordSets(env)
      return respond.ok({
        ok: true,
        sets,
      })
    }

    if (request.method === 'POST' && path === '/keyword-sets') {
      const payload = parseKeywordSetCreateBody(await readJsonBody(request))
      const notionCtx = await ensureMeetingNotionSchema(env)
      const id = crypto.randomUUID()
      const now = Date.now()
      await notionCtx.api.createPage({
        parent: { database_id: notionCtx.databaseId },
        properties: {
          [notionCtx.titlePropertyName]: { title: toNotionRichText(payload.name, 120) },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.keywordSet } },
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(id, 200),
          [MEETING_NOTION_FIELD.keywordSetName]: notionRichTextValue(payload.name, 300),
          [MEETING_NOTION_FIELD.isActive]: { checkbox: payload.isActive },
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
        },
      })
      return respond.json(
        {
          ok: true,
          set: {
            id,
            name: payload.name,
            isActive: payload.isActive,
            createdAt: now,
            keywordCount: 0,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keyword-sets') {
      const payload = parseKeywordSetPatchBody(await readJsonBody(request))
      const found = await findMeetingNotionKeywordSetPageById(env, payload.id)
      if (!found) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      const patch: Record<string, unknown> = {
        [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      }
      if (payload.name !== undefined) {
        patch[found.ctx.titlePropertyName] = { title: toNotionRichText(payload.name, 120) }
        patch[MEETING_NOTION_FIELD.keywordSetName] = notionRichTextValue(payload.name, 300)
      }
      if (payload.isActive !== undefined) {
        patch[MEETING_NOTION_FIELD.isActive] = { checkbox: payload.isActive }
      }
      await found.ctx.api.updatePage(asString(found.page?.id) ?? payload.id, {
        properties: patch,
      })
      const sets = await listNotionKeywordSets(env)
      const updated = sets.find((entry) => entry.id === payload.id)
      if (!updated) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      return respond.ok({ ok: true, set: updated })
    }

    if (request.method === 'DELETE' && path === '/keyword-sets') {
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      const found = await findMeetingNotionKeywordSetPageById(env, id)
      if (found) {
        const keywords = await queryAllMeetingNotionPages(found.ctx, {
          filter: keywordFilterBySetId(id),
        })
        for (const keywordPage of keywords) {
          const keywordPageId = asString(keywordPage?.id)
          if (!keywordPageId) continue
          await found.ctx.api.updatePage(keywordPageId, { archived: true })
        }
        const setPageId = asString(found.page?.id) ?? id
        await found.ctx.api.updatePage(setPageId, { archived: true })
      }
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'GET' && path === '/keywords') {
      const setId = asString(url.searchParams.get('setId'))
      const keywords = await listNotionKeywords(env, setId)
      return respond.ok({
        ok: true,
        keywords,
      })
    }

    if (request.method === 'POST' && path === '/keywords') {
      const payload = parseKeywordCreateBody(await readJsonBody(request))
      const setFound = await findMeetingNotionKeywordSetPageById(env, payload.setId)
      if (!setFound) {
        return respond.json({ ok: false, error: 'keyword_set_not_found' }, 404)
      }
      const id = crypto.randomUUID()
      const now = Date.now()
      await setFound.ctx.api.createPage({
        parent: { database_id: setFound.ctx.databaseId },
        properties: {
          [setFound.ctx.titlePropertyName]: { title: toNotionRichText(payload.phrase, 200) },
          [MEETING_NOTION_FIELD.recordType]: { select: { name: MEETING_RECORD_TYPE.keyword } },
          [MEETING_NOTION_FIELD.keywordId]: notionRichTextValue(id, 200),
          [MEETING_NOTION_FIELD.keywordSetId]: notionRichTextValue(payload.setId, 200),
          [MEETING_NOTION_FIELD.phrase]: notionRichTextValue(payload.phrase, 300),
          [MEETING_NOTION_FIELD.weight]: { number: payload.weight },
          [MEETING_NOTION_FIELD.tags]: notionRichTextValue(payload.tags ?? '', 400),
          [MEETING_NOTION_FIELD.createdAt]: { number: now },
          [MEETING_NOTION_FIELD.updatedAt]: { number: now },
        },
      })
      return respond.json(
        {
          ok: true,
          keyword: {
            id,
            setId: payload.setId,
            phrase: payload.phrase,
            weight: payload.weight,
            tags: payload.tags,
            createdAt: now,
          },
        },
        201,
      )
    }

    if (request.method === 'PATCH' && path === '/keywords') {
      const payload = parseKeywordPatchBody(await readJsonBody(request))
      const found = await findMeetingNotionKeywordPageById(env, payload.id)
      if (!found) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      const patch: Record<string, unknown> = {
        [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
      }
      if (payload.phrase !== undefined) {
        patch[found.ctx.titlePropertyName] = { title: toNotionRichText(payload.phrase, 200) }
        patch[MEETING_NOTION_FIELD.phrase] = notionRichTextValue(payload.phrase, 300)
      }
      if (payload.weight !== undefined) {
        patch[MEETING_NOTION_FIELD.weight] = { number: payload.weight }
      }
      if (payload.tags !== undefined) {
        patch[MEETING_NOTION_FIELD.tags] = notionRichTextValue(payload.tags ?? '', 400)
      }
      await found.ctx.api.updatePage(asString(found.page?.id) ?? payload.id, {
        properties: patch,
      })
      const list = await listNotionKeywords(env)
      const keyword = list.find((entry) => entry.id === payload.id)
      if (!keyword) {
        return respond.json({ ok: false, error: 'keyword_not_found' }, 404)
      }
      return respond.ok({ ok: true, keyword })
    }

    if (request.method === 'DELETE' && path === '/keywords') {
      const id = asString(url.searchParams.get('id'))
      if (!id) {
        return respond.json({ ok: false, error: 'id_required' }, 400)
      }
      const found = await findMeetingNotionKeywordPageById(env, id)
      if (found) {
        await found.ctx.api.updatePage(asString(found.page?.id) ?? id, { archived: true })
      }
      return respond.ok({ ok: true, id })
    }

    if (request.method === 'POST' && path === '/assemblyai/webhook') {
      const secret = getAssemblyWebhookSecret(env)
      const headerSecret = asString(request.headers.get('x-assemblyai-webhook-secret'))
      if (!headerSecret || headerSecret !== secret) {
        return respond.json({ ok: false, error: 'webhook_forbidden' }, 403)
      }

      const body = parsePatchBody(await readJsonBody(request))
      const assemblyId = asString(body.transcript_id) ?? asString(body.id)
      if (!assemblyId) {
        return respond.json({ ok: false, error: 'transcript_id_required' }, 400)
      }
      const status = normalizeMeetingStatus(asString(body.status) ?? 'processing')
      const errorMessage = asString(body.error) ?? null
      const found = await getMeetingNotionTranscriptByAssemblyId(env, assemblyId)
      if (found) {
        await found.ctx.api.updatePage(found.row.pageId, {
          properties: {
            [MEETING_NOTION_FIELD.status]: { select: { name: status } },
            [MEETING_NOTION_FIELD.updatedAt]: { number: Date.now() },
            [MEETING_NOTION_FIELD.errorMessage]: notionRichTextValue(errorMessage ?? '', 1200),
          },
        })
        if (env.CHECKLIST_DB) {
          try {
            await ensureMeetingDbTables(env)
            const db = requireMeetingsDb(env)
            const state = status === 'completed' ? 'completed' : status === 'failed' || status === 'error' ? 'failed' : 'transcript_requested'
            const stage = status === 'completed' ? 'done' : 'transcript'
            const reasonCode = status === 'failed' || status === 'error' ? 'assembly_transcript_failed' : null
            await db
              .prepare(
                `UPDATE meeting_upload_sessions
                 SET stage = ?, state = ?, reason_code = ?, reason_message = ?, updated_at = ?
                 WHERE transcript_id = ?`,
              )
              .bind(stage, state, reasonCode, truncateText(errorMessage, 600), Date.now(), found.row.id)
              .run()
            await db
              .prepare(
                `INSERT INTO meeting_upload_events (
                   upload_id, audio_key, event_type, stage, state, reason_code, reason_message, elapsed_ms, payload_json, created_at
                 )
                 SELECT id, audio_key, ?, ?, ?, ?, ?, NULL, NULL, ?
                 FROM meeting_upload_sessions
                 WHERE transcript_id = ?`,
              )
              .bind(
                status === 'completed' ? 'transcript_completed' : 'transcript_status_updated',
                stage,
                state,
                reasonCode,
                truncateText(errorMessage, 600),
                Date.now(),
                found.row.id,
              )
              .run()
          } catch {}
        }
      }

      return respond.ok({
        ok: true,
        assemblyId,
        status,
      })
    }
  } catch (error: unknown) {
    return fail(error)
  }

  return null
}
