import type { Env } from './types'
import {
  asString,
  isTruthy,
  isAuthDisabled,
  parseBoundedInt,
  parseCsvSet,
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
} from './utils'

// ---- Module-level mutable state ----

export type AuthSessionPayload = {
  exp: number
  iat: number
}

export type RateLimitBucket = {
  count: number
  resetAt: number
  blockedUntil: number
}

const DEFAULT_RATE_LIMIT_WINDOW_MS = 10_000
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 180
const DEFAULT_RATE_LIMIT_BLOCK_MS = 30_000
const RATE_LIMIT_MAX_ENTRIES = 10_000
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 30_000

let lastRateLimitCleanupAt = 0
let sessionSigningKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null
let meetingUploadSigningKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null
const rateLimitBuckets = new Map<string, RateLimitBucket>()

// ---- Auth functions ----

export function getSessionSecret(env: Env): string {
  return asString(env.SESSION_SECRET) ?? env.PAGE_PASSWORD
}

export function getSessionTtlSec(env: Env): number {
  return parseBoundedInt(asString(env.SESSION_TTL_SECONDS), DEFAULT_SESSION_TTL_SECONDS, 60, 7 * 24 * 60 * 60)
}

function utf8Encode(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function utf8Decode(value: Uint8Array): string {
  return new TextDecoder().decode(value)
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let idx = 0; idx < bytes.length; idx += 1) {
    binary += String.fromCharCode(bytes[idx])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  if (!value) return null
  try {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4 !== 0) base64 += '='
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let idx = 0; idx < binary.length; idx += 1) {
      bytes[idx] = binary.charCodeAt(idx)
    }
    return bytes
  } catch {
    return null
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let idx = 0; idx < a.length; idx += 1) {
    diff |= a[idx] ^ b[idx]
  }
  return diff === 0
}

async function getSessionSigningKey(env: Env): Promise<CryptoKey> {
  const secret = getSessionSecret(env)
  if (sessionSigningKeyCache && sessionSigningKeyCache.secret === secret) {
    return sessionSigningKeyCache.key
  }

  const keyPromise = crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  sessionSigningKeyCache = {
    secret,
    key: keyPromise,
  }
  return keyPromise
}

async function signSessionPayload(payloadBase64: string, env: Env): Promise<string> {
  const key = await getSessionSigningKey(env)
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encode(payloadBase64))
  return base64UrlEncode(new Uint8Array(signature))
}

function getMeetingUploadSecret(env: Env): string {
  return (
    asString(env.SESSION_SECRET) ??
    asString(env.ASSEMBLYAI_WEBHOOK_SECRET) ??
    asString(env.PAGE_PASSWORD) ??
    asString(env.NOTION_TOKEN) ??
    'izen_meeting_upload_fallback_secret'
  )
}

async function getMeetingUploadSigningKey(env: Env): Promise<CryptoKey> {
  const secret = getMeetingUploadSecret(env)
  if (meetingUploadSigningKeyCache && meetingUploadSigningKeyCache.secret === secret) {
    return meetingUploadSigningKeyCache.key
  }

  const keyPromise = crypto.subtle.importKey('raw', utf8Encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
  meetingUploadSigningKeyCache = {
    secret,
    key: keyPromise,
  }
  return keyPromise
}

async function signMeetingUploadPayload(payloadBase64: string, env: Env): Promise<string> {
  const key = await getMeetingUploadSigningKey(env)
  const signature = await crypto.subtle.sign('HMAC', key, utf8Encode(payloadBase64))
  return base64UrlEncode(new Uint8Array(signature))
}

export async function createMeetingUploadToken(env: Env, params: { key: string; method: 'GET' | 'PUT' | 'EVENT'; expiresInSec: number }): Promise<string> {
  const payload = {
    key: params.key,
    method: params.method,
    exp: Date.now() + params.expiresInSec * 1000,
  }
  const payloadBase64 = base64UrlEncode(utf8Encode(JSON.stringify(payload)))
  const signatureBase64 = await signMeetingUploadPayload(payloadBase64, env)
  return `${payloadBase64}.${signatureBase64}`
}

export async function verifyMeetingUploadToken(
  env: Env,
  token: string | undefined,
  expected: { key: string; method: 'GET' | 'PUT' | 'EVENT' },
): Promise<boolean> {
  if (!token) return false
  const [payloadBase64, signatureBase64] = token.split('.')
  if (!payloadBase64 || !signatureBase64) return false

  const expectedSignature = await signMeetingUploadPayload(payloadBase64, env)
  const expectedBytes = base64UrlDecode(expectedSignature)
  const providedBytes = base64UrlDecode(signatureBase64)
  if (!expectedBytes || !providedBytes) return false
  if (!timingSafeEqual(expectedBytes, providedBytes)) return false

  const payloadBytes = base64UrlDecode(payloadBase64)
  if (!payloadBytes) return false

  try {
    const parsed = JSON.parse(utf8Decode(payloadBytes)) as Partial<{ key: string; method: 'GET' | 'PUT' | 'EVENT'; exp: number }>
    if (parsed.key !== expected.key) return false
    if (parsed.method !== expected.method) return false
    if (typeof parsed.exp !== 'number' || parsed.exp <= Date.now()) return false
    return true
  } catch {
    return false
  }
}

function parseCookieHeader(raw: string): Record<string, string> {
  const pairs = raw.split(';')
  const output: Record<string, string> = {}
  for (const pair of pairs) {
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (!name) continue
    output[name] = value
  }
  return output
}

function getCookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie')
  if (!raw) return null
  const map = parseCookieHeader(raw)
  return map[name] ?? null
}

export function buildSessionCookieValue(token: string, request: Request, maxAgeSec: number): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  const parts = [`${SESSION_COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`]
  if (isSecure) parts.push('Secure')
  return parts.join('; ')
}

export function buildSessionClearCookie(request: Request): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isSecure) parts.push('Secure')
  return parts.join('; ')
}

export async function createSessionToken(env: Env): Promise<{ token: string; exp: number }> {
  const now = Date.now()
  const ttlSec = getSessionTtlSec(env)
  const payload: AuthSessionPayload = {
    iat: now,
    exp: now + ttlSec * 1000,
  }
  const payloadBase64 = base64UrlEncode(utf8Encode(JSON.stringify(payload)))
  const signatureBase64 = await signSessionPayload(payloadBase64, env)
  return {
    token: `${payloadBase64}.${signatureBase64}`,
    exp: payload.exp,
  }
}

async function readSessionToken(request: Request, env: Env): Promise<AuthSessionPayload | null> {
  const token = getCookieValue(request, SESSION_COOKIE_NAME)
  if (!token) return null

  const [payloadBase64, signatureBase64] = token.split('.')
  if (!payloadBase64 || !signatureBase64) return null

  const expectedSignature = await signSessionPayload(payloadBase64, env)
  const expectedBytes = base64UrlDecode(expectedSignature)
  const providedBytes = base64UrlDecode(signatureBase64)
  if (!expectedBytes || !providedBytes) return null
  if (!timingSafeEqual(expectedBytes, providedBytes)) return null

  const payloadBytes = base64UrlDecode(payloadBase64)
  if (!payloadBytes) return null

  try {
    const parsed = JSON.parse(utf8Decode(payloadBytes)) as Partial<AuthSessionPayload>
    if (typeof parsed.exp !== 'number' || typeof parsed.iat !== 'number') return null
    if (parsed.exp <= Date.now()) return null
    return {
      iat: parsed.iat,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

export function getRateLimitConfig(env: Env): { windowMs: number; maxRequests: number; blockMs: number } {
  const windowSec = parseBoundedInt(asString(env.RATE_LIMIT_WINDOW_SECONDS), DEFAULT_RATE_LIMIT_WINDOW_MS / 1000, 1, 120)
  const maxRequests = parseBoundedInt(asString(env.RATE_LIMIT_MAX_REQUESTS), DEFAULT_RATE_LIMIT_MAX_REQUESTS, 30, 2_000)
  const blockSec = parseBoundedInt(asString(env.RATE_LIMIT_BLOCK_SECONDS), DEFAULT_RATE_LIMIT_BLOCK_MS / 1000, 1, 600)
  return {
    windowMs: windowSec * 1000,
    maxRequests,
    blockMs: blockSec * 1000,
  }
}

export function getClientIp(request: Request): string {
  const cfIp = asString(request.headers.get('CF-Connecting-IP'))
  if (cfIp) return cfIp

  const xff = asString(request.headers.get('X-Forwarded-For'))
  if (xff) return xff.split(',')[0]?.trim() || 'unknown'

  return 'unknown'
}

function cleanupRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size === 0) return
  if (rateLimitBuckets.size < RATE_LIMIT_MAX_ENTRIES && now - lastRateLimitCleanupAt < RATE_LIMIT_CLEANUP_INTERVAL_MS) return

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now && bucket.blockedUntil <= now) {
      rateLimitBuckets.delete(key)
    }
  }

  lastRateLimitCleanupAt = now
}

export function checkRateLimit(request: Request, env: Env): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now()
  cleanupRateLimitBuckets(now)

  const ip = getClientIp(request)
  const key = ip || 'unknown'
  const config = getRateLimitConfig(env)
  const current = rateLimitBuckets.get(key)

  if (current && current.blockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((current.blockedUntil - now) / 1000)) }
  }

  const bucket: RateLimitBucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + config.windowMs, blockedUntil: 0 }
      : { ...current, blockedUntil: 0 }

  bucket.count += 1
  if (bucket.count > config.maxRequests) {
    bucket.blockedUntil = now + config.blockMs
    rateLimitBuckets.set(key, bucket)
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(config.blockMs / 1000)) }
  }

  rateLimitBuckets.set(key, bucket)
  return { allowed: true }
}

export function hasValidApiKey(request: Request, env: Env): boolean {
  const apiKey = asString(env.API_KEY)
  const provided = asString(request.headers.get('X-API-Key'))
  if (!apiKey || !provided) return false
  return provided === apiKey
}

export function hasValidAccessIdentity(request: Request, env: Env): boolean {
  if (!isTruthy(asString(env.REQUIRE_CF_ACCESS))) return true
  const accessEmail = asString(request.headers.get('CF-Access-Authenticated-User-Email'))
  if (!accessEmail) return false

  const allowedEmails = parseCsvSet(asString(env.ALLOWED_ACCESS_EMAILS))
  if (allowedEmails.size === 0) return true
  const normalizedEmail = accessEmail.toLowerCase()
  const normalizedAllowlist = new Set(Array.from(allowedEmails).map((email) => email.toLowerCase()))
  return normalizedAllowlist.has(normalizedEmail)
}

export async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  if (isAuthDisabled(env)) return true
  if (hasValidApiKey(request, env)) {
    return hasValidAccessIdentity(request, env)
  }

  const session = await readSessionToken(request, env)
  if (!session) return false
  return hasValidAccessIdentity(request, env)
}
