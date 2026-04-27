import { NotionWorkService } from './notionWork'
import type {
  ChecklistAssignmentRow,
  ChecklistAssignmentStatus,
  CreateFeedbackInput,
  CreateProgramIssueInput,
  CreateReferenceInput,
  CreateStoryboardDocumentInput,
  CreateTaskInput,
  Env,
  UpdateFeedbackInput,
  UpdateProgramIssueInput,
  UpdateReferenceInput,
  UpdateStoryboardDocumentInput,
  UpdateTaskInput,
} from './types'
import {
  asString,
  dateToIso,
  emptyResponse,
  expandChecklistValues,
  getCacheTtlMs,
  getMeetingNotionDbId,
  hasChecklistDb,
  isAuthDisabled,
  jsonResponse,
  normalizeChecklistValue,
  normalizeNotionId,
  normalizePath,
  notionDatabaseUrl,
  parsePatchBody,
  parsePageSize,
  readJsonBody,
  requiredAuthEnv,
  requiredNotionEnv,
  resolveAllowedOrigin,
  shiftBusinessDays,
  unique,
  LINE_MORNING_CRON_UTC,
  LINE_EVENING_CRON_UTC,
  SCREENING_PLAN_HISTORY_SYNC_CRON_UTC,
} from './utils'
import {
  buildSessionCookieValue,
  buildSessionClearCookie,
  checkRateLimit,
  createSessionToken,
  getSessionTtlSec,
  hasValidAccessIdentity,
  isAuthenticated,
} from './auth'
import { handleNasRoutes } from './handlers/nas'
import { handleNasTreeRoutes } from './handlers/nasTree'
import {
  checklistAssignmentKey,
  checklistMatrixKey,
  decodeChecklistAssignmentValue,
  filterTasks,
  getKoreanHolidaySet,
  getSnapshot,
  handleLineWebhook,
  handleMeetingRoutes,
  invalidateSnapshotCache,
  isMeetingPreAuthRoute,
  listChecklistAssignmentLogs,
  loadChecklistAssignments,
  normalizeEventGraphicsPresetEnabled,
  normalizeEventGraphicsPresetField,
  normalizeEventGraphicsPresetValue,
  normalizeEventGraphicsUploadField,
  paginate,
  parseChecklistAssignmentBody,
  parseCreateBody,
  parseEventGraphicsImportBody,
  parseExportLogLimit,
  parseGeminiPromptImageRenderBody,
  parseLogLimit,
  parseScreeningPlanImportBody,
  parseUpdateBody,
  parseVideoThumbnailRenderBody,
  pickChecklistBaseDate,
  pickChecklistOffset,
  renderGeminiPromptImage,
  renderVideoThumbnailVariantsWithGemini,
  resolveChecklistAssignedTaskId,
  sendLineReminder,
  serviceFromEnv,
  toChecklistAssignmentStatus,
  toEventGraphicsUploadErrorStatus,
  toVideoThumbnailErrorStatus,
  updateEventGraphicsPresetOnNotion,
  uploadEventGraphicsFileToNotion,
  writeChecklistAssignmentsToCache,
  writeChecklistAssignmentToD1,
  checklistAppliesToProject,
  filterFeedback,
  filterProgramIssues,
  filterReferences,
  filterStoryboards,
  parseFeedbackCreateBody,
  parseFeedbackUpdateBody,
  parseProgramIssueCreateBody,
  parseProgramIssueUpdateBody,
  parseReferenceCreateBody,
  parseReferenceUpdateBody,
  parseStoryboardCreateBody,
  parseStoryboardUpdateBody,
  parseShotSlotCreateBody,
  parseSubtitleRevisionCreateBody,
  toPhotoGuideUploadErrorStatus,
  uploadPhotoGuideFileToNotion,
} from './handlers'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = normalizePath(url.pathname)
    const origin = request.headers.get('Origin')
    const allowedOrigin = resolveAllowedOrigin(origin, env)

    const json = (body: unknown, status: number, _origin?: string | null, responsePath = path): Response =>
      jsonResponse(body, status, { requestOrigin: origin, corsOrigin: allowedOrigin, path: responsePath })
    const ok = (body: unknown, _origin?: string | null, responsePath = path): Response =>
      jsonResponse(body, 200, { requestOrigin: origin, corsOrigin: allowedOrigin, path: responsePath })
    const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
    const coerceNotionCursor = (value: unknown) => {
      const raw = asString(value)
      if (!raw) return undefined
      if (UUID_PATTERN.test(raw)) return raw.match(UUID_PATTERN)?.[0]
      return undefined
    }
    const queryNotionDatabaseAll = async (
      databaseId: string,
      notionHeaders: Record<string, string>,
      buildBody?: (cursor?: string) => Record<string, unknown>,
    ) => {
      const allPages: any[] = []
      let cursor: string | undefined
      let pageCount = 0
      while (true) {
        const body: Record<string, unknown> = buildBody?.(cursor) ?? { page_size: 100 }
        const safeCursor = coerceNotionCursor(cursor)
        if (safeCursor) body.start_cursor = safeCursor
        const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
          method: 'POST', headers: notionHeaders, body: JSON.stringify(body),
        })
        const data: any = await res.json().catch(() => null)
        if (!res.ok) {
          const message = asString(data?.message) || asString(data?.code) || 'notion_query_failed'
          throw new Error(`notion_query_failed:${message}`)
        }
        allPages.push(...(Array.isArray(data?.results) ? data.results : []))
        if (!data?.has_more) break
        const nextCursor = coerceNotionCursor(data?.next_cursor)
        if (!nextCursor) {
          const preview = (asString(data?.next_cursor) ?? '').slice(0, 120)
          throw new Error(`notion_invalid_next_cursor:${preview || 'empty'}`)
        }
        cursor = nextCursor
        pageCount += 1
        if (pageCount > 100) throw new Error('notion_query_failed:pagination_limit_exceeded')
      }
      return allPages
    }
    const getClientIp = () => {
      const cfIp = asString(request.headers.get('CF-Connecting-IP'))
      if (cfIp) return cfIp
      const forwarded = asString(request.headers.get('X-Forwarded-For'))
      return forwarded?.split(',')[0]?.trim() || ''
    }
    const getReferenceAuthorName = () => {
      // Replace this with the authenticated user name when login-based authoring is enabled.
      return asString(env.REFERENCE_DEFAULT_AUTHOR_NAME) || '조정훈'
    }

    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigin) {
        return jsonResponse(
          { ok: false, error: 'cors_forbidden', message: 'Origin is not allowed.' },
          403,
          { requestOrigin: origin, corsOrigin: null, path },
        )
      }
      return emptyResponse(204, { requestOrigin: origin, corsOrigin: allowedOrigin, path })
    }

    if (origin && !allowedOrigin) {
      return jsonResponse(
        { ok: false, error: 'cors_forbidden', message: 'Origin is not allowed.' },
        403,
        { requestOrigin: origin, corsOrigin: null, path },
      )
    }

    if ((request.method === 'GET' || request.method === 'POST') && path === '/line/webhook') {
      try {
        const result = await handleLineWebhook(request, env)
        return ok(result, origin)
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : 'line_webhook_failed'
        return json({ ok: false, error: message }, 401, origin)
      }
    }

    const missingAuth = requiredAuthEnv(env)
    if (missingAuth) {
      return json({ ok: false, error: 'config_missing', message: `Missing environment variable: ${missingAuth}` }, 500, origin)
    }

    const rateLimit = checkRateLimit(request, env)
    if (!rateLimit.allowed) {
      const retryAfterSec = 'retryAfterSec' in rateLimit ? rateLimit.retryAfterSec : 1
      const response = json(
        {
          ok: false,
          error: 'rate_limited',
          message: 'Too many requests. Please retry later.',
          retryAfterSec,
        },
        429,
        origin,
      )
      response.headers.set('Retry-After', String(retryAfterSec))
      return response
    }

    if (request.method === 'GET' && path === '/auth/session') {
      const authenticated = await isAuthenticated(request, env)
      return ok(
        {
          ok: true,
          authenticated,
        },
        origin,
      )
    }

    if (request.method === 'POST' && path === '/auth/login') {
      if (isAuthDisabled(env)) {
        return ok(
          {
            ok: true,
            authenticated: true,
            authDisabled: true,
          },
          origin,
        )
      }

      if (!hasValidAccessIdentity(request, env)) {
        return json(
          { ok: false, error: 'access_forbidden', message: 'Cloudflare Access policy check failed.' },
          403,
          origin,
        )
      }

      let payload: Record<string, unknown>
      try {
        payload = parsePatchBody(await readJsonBody(request))
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : 'invalid_request'
        return json({ ok: false, error: message }, 400, origin)
      }

      const providedPassword = asString(payload.password)
      if (!providedPassword) {
        return json({ ok: false, error: 'password_required' }, 400, origin)
      }

      if (providedPassword !== env.PAGE_PASSWORD) {
        return json({ ok: false, error: 'invalid_password', message: 'Password is incorrect.' }, 401, origin)
      }

      const session = await createSessionToken(env)
      const response = ok(
        {
          ok: true,
          authenticated: true,
          expiresAt: new Date(session.exp).toISOString(),
        },
        origin,
      )
      response.headers.append('Set-Cookie', buildSessionCookieValue(session.token, request, getSessionTtlSec(env)))
      return response
    }

    if (request.method === 'POST' && path === '/auth/logout') {
      const response = ok(
        {
          ok: true,
          authenticated: false,
        },
        origin,
      )
      response.headers.append('Set-Cookie', buildSessionClearCookie(request))
      return response
    }

    if (isMeetingPreAuthRoute(request.method, path)) {
      const meetingHandled = await handleMeetingRoutes(request, path, url, env, ctx, {
        json: (body, status) => json(body, status, origin),
        ok: (body) => ok(body, origin),
      })
      if (meetingHandled) return meetingHandled
    }

    // Subtitle share — public (no auth required)
    if (request.method === 'GET' && path === '/subtitle-share') {
      const videoId = asString(url.searchParams.get('videoId'))
      const revisions = await service.listSubtitleRevisions(videoId || undefined)
      const latest = revisions.slice(0, 2)
      return ok({ ok: true, revisions: latest, cacheTtlMs }, origin)
    }

    if (!(await isAuthenticated(request, env))) {
      return json(
        { ok: false, error: 'unauthorized', message: 'Missing or invalid credentials.' },
        401,
        origin,
      )
    }

    if (!isMeetingPreAuthRoute(request.method, path)) {
      const meetingHandled = await handleMeetingRoutes(request, path, url, env, ctx, {
        json: (body, status) => json(body, status, origin),
        ok: (body) => ok(body, origin),
      })
      if (meetingHandled) return meetingHandled
    }

    // NAS File Station routes
    const nasHandled = await handleNasRoutes(request, path, env, {
      json: (body, status) => json(body, status, origin),
      ok: (body) => ok(body, origin),
    })
    if (nasHandled) return nasHandled

    const nasTreeHandled = await handleNasTreeRoutes(request, path, env, {
      json: (body, status) => json(body, status, origin),
      ok: (body) => ok(body, origin),
    })
    if (nasTreeHandled) return nasTreeHandled

    // Path mapping rules
    if (request.method === 'GET' && path === '/path-mapping') {
      const dbId = env.NOTION_PATH_MAPPING_DB_ID
      if (!dbId) {
        return ok({ ok: true, mappings: [] }, origin)
      }
      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }
      const TREE_KEYWORD = '__NAS_TREE__'
      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        return ''
      }
      const allPages = await queryNotionDatabaseAll(dbId, notionHeaders)
      const mappings = allPages.map((page: any) => {
        const props = (page.properties ?? {}) as Record<string, any>
        return {
          keyword: getText(props['키워드']),
          path: getText(props['추천 경로']),
          note: getText(props['비고']),
        }
      }).filter((m: any) => m.keyword && m.path && m.keyword !== TREE_KEYWORD)
      return ok({ ok: true, mappings }, origin)
    }

    // Google Drive OAuth + API
    if (path.startsWith('/gdrive/')) {
      const clientId = env.GOOGLE_DRIVE_CLIENT_ID
      const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET

      // Step 1: Start OAuth flow
      if (request.method === 'GET' && path === '/gdrive/auth') {
        if (!clientId) return json({ ok: false, error: 'gdrive_not_configured' }, 501, origin)
        const redirectUri = `${url.origin}/api/gdrive/callback`
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly')}&access_type=offline&prompt=consent`
        return ok({ ok: true, authUrl }, origin)
      }

      // Step 2: OAuth callback — exchange code for tokens
      if (request.method === 'GET' && path === '/gdrive/callback') {
        const code = url.searchParams.get('code')
        if (!code) return json({ ok: false, error: 'no_code' }, 400, origin)
        const redirectUri = `${url.origin}/api/gdrive/callback`
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: clientId!, client_secret: clientSecret!, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
        })
        const tokenData: any = await tokenRes.json()
        if (tokenData.refresh_token) {
          return new Response(`<html><body><h2>인증 완료</h2><p>Refresh Token을 Cloudflare Worker 환경변수에 저장하세요:</p><pre>GOOGLE_DRIVE_REFRESH_TOKEN = ${tokenData.refresh_token}</pre><p>이 페이지를 닫아도 됩니다.</p></body></html>`, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        return new Response(`<html><body><h2>오류</h2><pre>${JSON.stringify(tokenData, null, 2)}</pre></body></html>`, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      // Helper: get access token from refresh token
      const getAccessToken = async () => {
        const refreshToken = env.GOOGLE_DRIVE_REFRESH_TOKEN
        if (!refreshToken || !clientId || !clientSecret) throw new Error('gdrive_not_configured')
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
        })
        const data: any = await res.json()
        if (!data.access_token) throw new Error('gdrive_token_failed')
        return data.access_token as string
      }

      // List files in folder
      if (request.method === 'POST' && path === '/gdrive/list') {
        try {
          const body = await readJsonBody(request)
          const folderId = asString(body.folderId) || 'root'
          const driveId = asString(body.driveId) || ''
          const token = await getAccessToken()
          const q = `'${folderId}' in parents and trashed = false`
          const fields = 'files(id,name,mimeType,thumbnailLink,webViewLink,size,createdTime)'
          let apiUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`
          if (driveId) {
            apiUrl += `&corpora=drive&driveId=${driveId}`
          }
          const res = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const data: any = await res.json()
          if (data.error) {
            return json({ ok: false, error: `gdrive_api: ${data.error.message || JSON.stringify(data.error)}` }, 500, origin)
          }
          const files = (data.files ?? []).map((f: any) => ({
            id: f.id,
            name: f.name,
            isDir: f.mimeType === 'application/vnd.google-apps.folder',
            mimeType: f.mimeType,
            thumbnailLink: f.thumbnailLink,
            webViewLink: f.webViewLink,
            size: f.size ? parseInt(f.size) : undefined,
            createdTime: f.createdTime,
          }))
          return ok({ ok: true, files }, origin)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'gdrive_error'
          return json({ ok: false, error: msg }, msg.includes('not_configured') ? 501 : 500, origin)
        }
      }

      // Get thumbnail (proxy to avoid CORS)
      if (request.method === 'GET' && path === '/gdrive/thumbnail') {
        try {
          const fileId = url.searchParams.get('fileId')
          if (!fileId) return json({ ok: false, error: 'fileId_required' }, 400, origin)
          const token = await getAccessToken()
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const data: any = await res.json()
          if (data.thumbnailLink) {
            const imgRes = await fetch(data.thumbnailLink)
            return new Response(imgRes.body, {
              headers: {
                'Content-Type': imgRes.headers.get('Content-Type') || 'image/png',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': origin || '*',
              },
            })
          }
          return json({ ok: false, error: 'no_thumbnail' }, 404, origin)
        } catch {
          return json({ ok: false, error: 'thumbnail_failed' }, 500, origin)
        }
      }
    }

    // NAS issues tracker
    if (path === '/nas-issues' || path.startsWith('/nas-issues/')) {
      const dbId = env.NOTION_NAS_ISSUES_DB_ID
      if (!dbId) return ok({ ok: true, items: [] }, origin)

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }

      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'select') return p.select?.name ?? ''
        return ''
      }

      // GET /nas-issues — list all
      if (request.method === 'GET' && path === '/nas-issues') {
        const allPages = await queryNotionDatabaseAll(dbId, notionHeaders)
        const items = allPages.map((page: any) => {
          const props = (page.properties ?? {}) as Record<string, any>
          return {
            id: page.id,
            issue: getText(props['문제점']),
            proposal: getText(props['제안내용']),
            solution: getText(props['처리방법']),
            area: getText(props['영역']),
            source: getText(props['출처']),
            resolved: getText(props['해결여부']),
            predecessorId: (props['선행작업']?.relation ?? [])[0]?.id ?? '',
            createdAt: page.created_time ?? '',
          }
        })
        return ok({ ok: true, items }, origin)
      }

      // POST /nas-issues — create new
      if (request.method === 'POST' && path === '/nas-issues') {
        const body = await readJsonBody(request)
        const props: any = {
          '문제점': { title: [{ text: { content: asString(body.issue) || '(제목 없음)' } }] },
        }
        if (body.proposal) props['제안내용'] = { rich_text: [{ text: { content: asString(body.proposal) } }] }
        if (body.solution) props['처리방법'] = { rich_text: [{ text: { content: asString(body.solution) } }] }
        if (body.area) props['영역'] = { select: { name: asString(body.area) } }
        if (body.source) props['출처'] = { select: { name: asString(body.source) } }
        if (body.resolved) props['해결여부'] = { select: { name: asString(body.resolved) } }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
        })
        const data: any = await res.json()
        if (!data.id) return json({ ok: false, error: 'create_failed' }, 500, origin)
        return ok({ ok: true, id: data.id }, origin)
      }

      // PATCH /nas-issues/:id — update
      const issueMatch = path.match(/^\/nas-issues\/([^/]+)$/)
      if (request.method === 'PATCH' && issueMatch) {
        const pageId = issueMatch[1]
        const body = await readJsonBody(request)
        const props: any = {}
        if (body.issue != null) props['문제점'] = { title: [{ text: { content: asString(body.issue) } }] }
        if (body.proposal != null) props['제안내용'] = { rich_text: [{ text: { content: asString(body.proposal) } }] }
        if (body.solution != null) props['처리방법'] = { rich_text: [{ text: { content: asString(body.solution) } }] }
        if (body.area != null) props['영역'] = { select: { name: asString(body.area) } }
        if (body.source != null) props['출처'] = { select: { name: asString(body.source) } }
        if (body.resolved != null) props['해결여부'] = { select: { name: asString(body.resolved) } }
        if (body.predecessorId != null) {
          const pid = asString(body.predecessorId)
          props['선행작업'] = pid ? { relation: [{ id: pid }] } : { relation: [] }
        }

        await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ properties: props }),
        })
        return ok({ ok: true }, origin)
      }
    }

    // Work manual status (per-workType: 확정/초안/보류 + 확정일 + 메모)
    if (path === '/work-manual-status' || path.startsWith('/work-manual-status/')) {
      const dbId = env.NOTION_WORK_MANUAL_STATUS_DB_ID
      if (!dbId) return ok({ ok: true, items: [] }, origin)

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }

      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'select') return p.select?.name ?? ''
        if (p.type === 'date') return p.date?.start ?? ''
        return ''
      }

      // GET /work-manual-status — list all
      if (request.method === 'GET' && path === '/work-manual-status') {
        const allPages = await queryNotionDatabaseAll(dbId, notionHeaders)
        const items = allPages.map((page: any) => {
          const props = (page.properties ?? {}) as Record<string, any>
          return {
            id: page.id,
            workType: getText(props['업무구분']),
            status: getText(props['상태']) || '미정',
            category: getText(props['카테고리']),
            fixedAt: getText(props['확정일']),
            note: getText(props['메모']),
            updatedAt: page.last_edited_time ?? '',
          }
        })
        return ok({ ok: true, items }, origin)
      }

      // POST /work-manual-status — create new (when a new workType appears in Notion and no row exists yet)
      if (request.method === 'POST' && path === '/work-manual-status') {
        const body = await readJsonBody(request)
        const workType = asString(body.workType)
        if (!workType) return json({ ok: false, error: 'workType_required' }, 400, origin)
        const props: any = {
          '업무구분': { title: [{ text: { content: workType } }] },
          '상태': { select: { name: asString(body.status) || '미정' } },
        }
        if (body.category) props['카테고리'] = { select: { name: asString(body.category) } }
        if (body.fixedAt) props['확정일'] = { date: { start: asString(body.fixedAt) } }
        if (body.note) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
        })
        const data: any = await res.json()
        if (!data.id) return json({ ok: false, error: 'create_failed' }, 500, origin)
        return ok({ ok: true, id: data.id }, origin)
      }

      // PATCH /work-manual-status/:id — update
      const wmsMatch = path.match(/^\/work-manual-status\/([^/]+)$/)
      if (request.method === 'PATCH' && wmsMatch) {
        const pageId = wmsMatch[1]
        const body = await readJsonBody(request)
        const props: any = {}
        if (body.status != null) props['상태'] = { select: { name: asString(body.status) } }
        if (body.category != null) props['카테고리'] = { select: { name: asString(body.category) } }
        if (body.fixedAt != null) {
          const d = asString(body.fixedAt)
          props['확정일'] = d ? { date: { start: d } } : { date: null }
        }
        if (body.note != null) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ properties: props }),
        })
        return ok({ ok: true }, origin)
      }
    }

    // Folder status (per folder path: 미정/논의중/확정 + lock + 확정일 + 메모)
    if (path === '/folder-status' || path.startsWith('/folder-status/')) {
      const dbId = env.NOTION_FOLDER_STATUS_DB_ID
      if (!dbId) return ok({ ok: true, items: [] }, origin)

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }

      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'select') return p.select?.name ?? ''
        if (p.type === 'date') return p.date?.start ?? ''
        if (p.type === 'checkbox') return p.checkbox ? 'true' : 'false'
        return ''
      }
      const isCompoundManualPath = (value: string) => (
        /\r?\n/.test(value) ||
        /\s+\+\s+/.test(value) ||
        /\s+or\s+/i.test(value) ||
        /\s+또는\s+/.test(value)
      )

      if (request.method === 'GET' && path === '/folder-status') {
        const allPages = await queryNotionDatabaseAll(dbId, notionHeaders)
        const items = allPages.map((page: any) => {
          const props = (page.properties ?? {}) as Record<string, any>
          return {
            id: page.id,
            path: getText(props['경로']),
            status: getText(props['상태']) || '미정',
            locked: getText(props['잠금']) === 'true',
            fixedAt: getText(props['확정일']),
            note: getText(props['메모']),
            updatedAt: page.last_edited_time ?? '',
          }
        })
        return ok({ ok: true, items }, origin)
      }

      if (request.method === 'POST' && path === '/folder-status') {
        const body = await readJsonBody(request)
        const folderPath = asString(body.path)
        if (!folderPath) return json({ ok: false, error: 'path_required' }, 400, origin)
        const props: any = {
          '경로': { title: [{ text: { content: folderPath } }] },
          '상태': { select: { name: asString(body.status) || '미정' } },
        }
        if (typeof body.locked === 'boolean') props['잠금'] = { checkbox: body.locked }
        if (body.fixedAt) props['확정일'] = { date: { start: asString(body.fixedAt) } }
        if (body.note) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
        })
        const data: any = await res.json()
        if (!data.id) return json({ ok: false, error: 'create_failed' }, 500, origin)
        return ok({ ok: true, id: data.id }, origin)
      }

      const folderMatch = path.match(/^\/folder-status\/([^/]+)$/)
      if (request.method === 'PATCH' && folderMatch) {
        const pageId = folderMatch[1]
        const body = await readJsonBody(request)
        const props: any = {}
        if (body.status != null) props['상태'] = { select: { name: asString(body.status) } }
        if (typeof body.locked === 'boolean') props['잠금'] = { checkbox: body.locked }
        if (body.fixedAt != null) {
          const d = asString(body.fixedAt)
          props['확정일'] = d ? { date: { start: d } } : { date: null }
        }
        if (body.note != null) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ properties: props }),
        })
        return ok({ ok: true }, origin)
      }
    }

    // Work manual refs (업무별 참조 폴더: 1 row = workType × path × role × status)
    if (path === '/work-manual-refs' || path.startsWith('/work-manual-refs/')) {
      const dbId = env.NOTION_WORK_MANUAL_REFS_DB_ID
      if (!dbId) return ok({ ok: true, items: [] }, origin)

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }

      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'select') return p.select?.name ?? ''
        if (p.type === 'date') return p.date?.start ?? ''
        if (p.type === 'checkbox') return p.checkbox ? 'true' : 'false'
        return ''
      }

      if (request.method === 'GET' && path === '/work-manual-refs') {
        const workTypeFilter = asString(url.searchParams.get('workType'))
        const allPages = await queryNotionDatabaseAll(dbId, notionHeaders, () => {
          const body: Record<string, unknown> = { page_size: 100 }
          if (workTypeFilter) {
            body.filter = { property: '업무구분', rich_text: { equals: workTypeFilter } }
          }
          return body
        })
        const items = allPages.map((page: any) => {
          const props = (page.properties ?? {}) as Record<string, any>
          return {
            id: page.id,
            workType: getText(props['업무구분']),
            path: getText(props['경로']),
            label: getText(props['라벨']),
            role: getText(props['역할']),
            status: getText(props['상태']) || '미정',
            required: getText(props['필수']) === 'true',
            fixedAt: getText(props['확정일']),
            note: getText(props['메모']),
            updatedAt: page.last_edited_time ?? '',
          }
        })
        return ok({ ok: true, items }, origin)
      }

      if (request.method === 'POST' && path === '/work-manual-refs') {
        const body = await readJsonBody(request)
        const workType = asString(body.workType)
        const folderPath = asString(body.path)
        const role = asString(body.role)
        if (!workType || !folderPath || !role) {
          return json({ ok: false, error: 'workType, path, role are required' }, 400, origin)
        }
        if (isCompoundManualPath(folderPath)) {
          return json({ ok: false, error: 'invalid_compound_path' }, 400, origin)
        }
        const summary = `${workType} · ${role} · ${folderPath}`
        const props: any = {
          '요약': { title: [{ text: { content: summary } }] },
          '업무구분': { rich_text: [{ text: { content: workType } }] },
          '경로': { rich_text: [{ text: { content: folderPath } }] },
          '역할': { select: { name: role } },
          '상태': { select: { name: asString(body.status) || '미정' } },
        }
        if (body.label) props['라벨'] = { rich_text: [{ text: { content: asString(body.label) } }] }
        if (typeof body.required === 'boolean') props['필수'] = { checkbox: body.required }
        if (body.fixedAt) props['확정일'] = { date: { start: asString(body.fixedAt) } }
        if (body.note) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
        })
        const data: any = await res.json()
        if (!data.id) return json({ ok: false, error: 'create_failed' }, 500, origin)
        return ok({ ok: true, id: data.id }, origin)
      }

      const refMatch = path.match(/^\/work-manual-refs\/([^/]+)$/)
      if (refMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
        const pageId = refMatch[1]
        if (request.method === 'DELETE') {
          await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            method: 'PATCH', headers: notionHeaders,
            body: JSON.stringify({ archived: true }),
          })
          return ok({ ok: true }, origin)
        }
        const body = await readJsonBody(request)
        const props: any = {}
        if (body.status != null) props['상태'] = { select: { name: asString(body.status) } }
        if (body.role != null) props['역할'] = { select: { name: asString(body.role) } }
        if (body.label != null) props['라벨'] = { rich_text: [{ text: { content: asString(body.label) } }] }
        if (typeof body.required === 'boolean') props['필수'] = { checkbox: body.required }
        if (body.fixedAt != null) {
          const d = asString(body.fixedAt)
          props['확정일'] = d ? { date: { start: d } } : { date: null }
        }
        if (body.note != null) props['메모'] = { rich_text: [{ text: { content: asString(body.note) } }] }

        await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH', headers: notionHeaders,
          body: JSON.stringify({ properties: props }),
        })
        return ok({ ok: true }, origin)
      }
    }

    // Change history log (append-only)
    if (path === '/change-history') {
      const dbId = env.NOTION_CHANGE_HISTORY_DB_ID
      if (!dbId) return ok({ ok: true, items: [] }, origin)

      const notionHeaders = {
        'Authorization': `Bearer ${env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      }

      const getText = (p: any) => {
        if (!p) return ''
        if (p.type === 'title') return (p.title ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'rich_text') return (p.rich_text ?? []).map((t: any) => t.plain_text ?? '').join('')
        if (p.type === 'select') return p.select?.name ?? ''
        return ''
      }

      if (request.method === 'GET') {
        const limit = Math.min(200, parseInt(asString(url.searchParams.get('limit')) || '50', 10) || 50)
        const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ page_size: limit, sorts: [{ timestamp: 'created_time', direction: 'descending' }] }),
        })
        const data: any = await res.json()
        const items = (data.results ?? []).map((page: any) => {
          const props = (page.properties ?? {}) as Record<string, any>
          return {
            id: page.id,
            summary: getText(props['요약']),
            kind: getText(props['대상종류']),
            target: getText(props['대상']),
            action: getText(props['액션']),
            before: getText(props['이전값']),
            after: getText(props['새값']),
            reason: getText(props['사유']),
            createdAt: page.created_time ?? '',
          }
        })
        return ok({ ok: true, items }, origin)
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request)
        const summary = asString(body.summary) || `${asString(body.kind)} · ${asString(body.target)}`
        const props: any = {
          '요약': { title: [{ text: { content: summary } }] },
        }
        if (body.kind) props['대상종류'] = { select: { name: asString(body.kind) } }
        if (body.target) props['대상'] = { rich_text: [{ text: { content: asString(body.target) } }] }
        if (body.action) props['액션'] = { select: { name: asString(body.action) } }
        if (body.before != null) props['이전값'] = { rich_text: [{ text: { content: asString(body.before) } }] }
        if (body.after != null) props['새값'] = { rich_text: [{ text: { content: asString(body.after) } }] }
        if (body.reason) props['사유'] = { rich_text: [{ text: { content: asString(body.reason) } }] }

        const res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: notionHeaders,
          body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
        })
        const data: any = await res.json()
        if (!data.id) return json({ ok: false, error: 'history_create_failed' }, 500, origin)
        return ok({ ok: true, id: data.id }, origin)
      }
    }

    if (request.method === 'POST' && path === '/event-graphics/video-thumbnail/render') {
      try {
        const payload = parseVideoThumbnailRenderBody(await readJsonBody(request))
        const rendered = await renderVideoThumbnailVariantsWithGemini(env, payload)
        return ok(
          {
            ok: true,
            renders: rendered,
          },
          origin,
        )
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : 'thumbnail_render_failed'
        return json({ ok: false, error: message, message }, toVideoThumbnailErrorStatus(message), origin)
      }
    }

    if (request.method === 'POST' && path === '/tools/gemini-image-test/render') {
      try {
        const payload = parseGeminiPromptImageRenderBody(await readJsonBody(request))
        const rendered = await renderGeminiPromptImage(env, payload)
        return ok(
          {
            ok: true,
            ...rendered,
          },
          origin,
        )
      } catch (error: unknown) {
        const message = error instanceof Error && error.message ? error.message : 'gemini_image_test_render_failed'
        return json({ ok: false, error: message, message }, toVideoThumbnailErrorStatus(message), origin)
      }
    }

    const missingNotion = requiredNotionEnv(env)
    if (missingNotion) {
      return json({ ok: false, error: 'config_missing', message: `Missing environment variable: ${missingNotion}` }, 500, origin)
    }

    const service = serviceFromEnv(env)
    const cacheTtlMs = getCacheTtlMs(env)

    try {
      if (request.method === 'GET' && path === '/projects') {
        const snapshot = await getSnapshot(service, env, ctx)
        return ok(
          {
            ok: true,
            projects: snapshot.projects,
            schema: service.getApiSchemaSummary(snapshot.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/line/reminders/send') {
        const kindValue = asString(url.searchParams.get('kind'))
        const kind = kindValue === 'evening' ? 'evening' : 'morning'
        const result = await sendLineReminder(env, ctx, kind)
        return ok(result, origin)
      }

      if (request.method === 'GET' && path === '/meta') {
        return ok(
          {
            ok: true,
            databases: {
              project: {
                id: env.NOTION_PROJECT_DB_ID,
                url: notionDatabaseUrl(env.NOTION_PROJECT_DB_ID),
              },
              task: {
                id: env.NOTION_TASK_DB_ID,
                url: notionDatabaseUrl(env.NOTION_TASK_DB_ID),
              },
              checklist: {
                id: env.NOTION_CHECKLIST_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_CHECKLIST_DB_ID),
              },
              schedule: {
                id: env.NOTION_SCHEDULE_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SCHEDULE_DB_ID),
              },
              screeningHistory: {
                id: env.NOTION_SCREENING_HISTORY_DB_ID ?? env.NOTION_SCREENING_VIDEO_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SCREENING_HISTORY_DB_ID ?? env.NOTION_SCREENING_VIDEO_DB_ID),
              },
              screeningPlan: {
                id: env.NOTION_SCREENING_PLAN_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SCREENING_PLAN_DB_ID),
              },
              screeningVideo: {
                id: env.NOTION_SCREENING_HISTORY_DB_ID ?? env.NOTION_SCREENING_VIDEO_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SCREENING_HISTORY_DB_ID ?? env.NOTION_SCREENING_VIDEO_DB_ID),
              },
              eventGraphicsTimetable: {
                id: env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID),
              },
              photoGuide: {
                id: env.NOTION_PHOTO_GUIDE_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_PHOTO_GUIDE_DB_ID),
              },
              equipment: {
                id: env.NOTION_EQUIPMENT_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_EQUIPMENT_DB_ID),
              },
              meeting: {
                id: getMeetingNotionDbId(env),
                url: notionDatabaseUrl(getMeetingNotionDbId(env)),
              },
              feedback: {
                id: env.NOTION_FEEDBACK_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_FEEDBACK_DB_ID),
              },
              programIssues: {
                id: env.NOTION_PROGRAM_ISSUES_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_PROGRAM_ISSUES_DB_ID),
              },
              reference: {
                id: env.NOTION_REFERENCE_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_REFERENCE_DB_ID),
              },
              storyboard: {
                id: env.NOTION_STORYBOARD_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_STORYBOARD_DB_ID),
              },
              subtitleVideo: {
                id: env.NOTION_SUBTITLE_VIDEO_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SUBTITLE_VIDEO_DB_ID),
              },
              subtitleRevision: {
                id: env.NOTION_SUBTITLE_REVISION_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_SUBTITLE_REVISION_DB_ID),
              },
              videoManual: {
                id: env.NOTION_VIDEO_MANUAL_DB_ID ?? null,
                url: notionDatabaseUrl(env.NOTION_VIDEO_MANUAL_DB_ID),
              },
            },
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/schedule') {
        const schedule = await service.listScheduleView()
        return ok(
          {
            ok: true,
            configured: schedule.configured,
            database: {
              id: schedule.database.id,
              url: notionDatabaseUrl(schedule.database.id ?? undefined),
              title: schedule.database.title,
            },
            columns: schedule.columns,
            rows: schedule.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/schedule') {
        const scheduleDbId = normalizeNotionId(env.NOTION_SCHEDULE_DB_ID ?? '')
        if (!scheduleDbId) {
          return json({ ok: false, error: 'NOTION_SCHEDULE_DB_ID_not_configured' }, 400, origin)
        }
        let body: Record<string, unknown>
        try {
          body = (await readJsonBody(request)) as Record<string, unknown>
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }
        const title = String(body.title ?? '').trim()
        if (!title) return json({ ok: false, error: 'title_required' }, 400, origin)

        const properties: Record<string, unknown> = {
          '일정명': { title: [{ text: { content: title } }] },
        }
        const dateStart = String(body.dateStart ?? '').trim()
        const dateEnd = String(body.dateEnd ?? '').trim() || undefined
        if (dateStart) {
          properties['일시'] = { date: { start: dateStart, end: dateEnd ?? null } }
        }
        const scheduleType = String(body.type ?? '').trim()
        if (scheduleType) {
          properties['유형'] = { select: { name: scheduleType } }
        }
        const attendees = String(body.attendees ?? '').trim()
        if (attendees) {
          properties['예정 참석자'] = { rich_text: [{ text: { content: attendees } }] }
        }
        const location = String(body.location ?? '').trim()
        if (location) {
          properties['장소'] = { rich_text: [{ text: { content: location } }] }
        }
        const memo = String(body.memo ?? '').trim()
        if (memo) {
          properties['메모'] = { rich_text: [{ text: { content: memo } }] }
        }

        await service.createPageDirect(scheduleDbId, properties)
        return json({ ok: true }, 201, origin)
      }

      if (request.method === 'GET' && path === '/screening-history') {
        const screeningHistory = await service.listScreeningHistoryView()
        return ok(
          {
            ok: true,
            configured: screeningHistory.configured,
            database: {
              id: screeningHistory.database.id,
              url: notionDatabaseUrl(screeningHistory.database.id ?? undefined),
              title: screeningHistory.database.title,
            },
            columns: screeningHistory.columns,
            rows: screeningHistory.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/screening-plan') {
        const screeningPlan = await service.listScreeningPlanView()
        return ok(
          {
            ok: true,
            configured: screeningPlan.configured,
            database: {
              id: screeningPlan.database.id,
              url: notionDatabaseUrl(screeningPlan.database.id ?? undefined),
              title: screeningPlan.database.title,
            },
            columns: screeningPlan.columns,
            rows: screeningPlan.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/event-graphics-timetable') {
        const timetable = await service.listEventGraphicsTimetableView()
        return ok(
          {
            ok: true,
            configured: timetable.configured,
            database: {
              id: timetable.database.id,
              url: notionDatabaseUrl(timetable.database.id ?? undefined),
              title: timetable.database.title,
            },
            columns: timetable.columns,
            rows: timetable.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/photo-guide') {
        const photoGuide = await service.listPhotoGuideView()
        return ok(
          {
            ok: true,
            configured: photoGuide.configured,
            database: {
              id: photoGuide.database.id,
              url: notionDatabaseUrl(photoGuide.database.id ?? undefined),
              title: photoGuide.database.title,
            },
            columns: photoGuide.columns,
            rows: photoGuide.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/photo-guide') {
        try {
          const body = await readJsonBody(request)
          const input = parseShotSlotCreateBody(body)
          const created = await service.createShotSlot(input)
          invalidateSnapshotCache(ctx)
          return ok({ ok: true, id: created.id, url: created.url }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'photo_guide_create_failed'
          const status = message === 'title_required' ? 400 : 500
          return json({ ok: false, error: message }, status, origin)
        }
      }

      const photoGuideDeleteMatch = path.match(/^\/photo-guide\/([^/]+)$/)
      if (request.method === 'DELETE' && photoGuideDeleteMatch) {
        try {
          const pageId = decodeURIComponent(photoGuideDeleteMatch[1])
          await service.archivePhotoGuidePage(pageId)
          return ok({ ok: true, pageId, archived: true }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'photo_guide_delete_failed'
          return json({ ok: false, error: message }, 500, origin)
        }
      }

      const photoGuideCheckMatch = path.match(/^\/photo-guide\/([^/]+)\/checked$/)
      if (request.method === 'POST' && photoGuideCheckMatch) {
        try {
          const pageId = decodeURIComponent(photoGuideCheckMatch[1])
          const body = (await readJsonBody(request)) as Record<string, unknown>
          const checked = body.checked === true
          await service.togglePhotoGuideChecked(pageId, checked)
          return ok({ ok: true, pageId, checked }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'photo_guide_check_failed'
          return json({ ok: false, error: message }, 500, origin)
        }
      }

      const photoGuideUploadMatch = path.match(/^\/photo-guide\/([^/]+)\/files$/)
      if (request.method === 'POST' && photoGuideUploadMatch) {
        try {
          const pageId = decodeURIComponent(photoGuideUploadMatch[1])
          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) {
            return json({ ok: false, error: 'photo_guide_upload_file_missing' }, 400, origin)
          }

          const uploaded = await uploadPhotoGuideFileToNotion(env, pageId, file)
          return ok({ ok: true, pageId, fileName: uploaded.fileName }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'photo_guide_upload_failed'
          return json({ ok: false, error: message, message }, toPhotoGuideUploadErrorStatus(message), origin)
        }
      }

      if (request.method === 'GET' && path === '/equipment') {
        const equipment = await service.listEquipmentView()
        return ok(
          {
            ok: true,
            configured: equipment.configured,
            database: {
              id: equipment.database.id,
              url: notionDatabaseUrl(equipment.database.id ?? undefined),
              title: equipment.database.title,
            },
            columns: equipment.columns,
            rows: equipment.rows,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/equipment-checkouts') {
        const projectId = url.searchParams.get('projectId') ?? ''
        if (!projectId) {
          return json({ ok: false, error: 'projectId_required' }, 400, origin)
        }
        try {
          const rows = await service.listEquipmentCheckouts(projectId)
          return ok({ ok: true, projectId, rows, cacheTtlMs }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'equipment_checkouts_fetch_failed'
          return json({ ok: false, error: message }, 500, origin)
        }
      }

      if (request.method === 'POST' && path === '/equipment-checkouts') {
        try {
          const body = (await readJsonBody(request)) as Record<string, unknown>
          const row = await service.upsertEquipmentCheckout(body)
          return ok({ ok: true, row }, origin)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'equipment_checkout_save_failed'
          const status = message.endsWith('_required') ? 400 : 500
          return json({ ok: false, error: message }, status, origin)
        }
      }

      const eventGraphicsUploadMatch = path.match(/^\/event-graphics-timetable\/([^/]+)\/files$/)
      if (request.method === 'POST' && eventGraphicsUploadMatch) {
        try {
          await service.syncEventGraphicsTimetableProperties()
          const pageId = decodeURIComponent(eventGraphicsUploadMatch[1])
          const form = await request.formData()
          const field = normalizeEventGraphicsUploadField(asString(form.get('field')))
          const file = form.get('file')
          if (!(file instanceof File)) {
            return json({ ok: false, error: 'event_graphics_upload_file_missing' }, 400, origin)
          }

          const uploaded = await uploadEventGraphicsFileToNotion(env, pageId, field, file)
          return ok(
            {
              ok: true,
              pageId,
              field,
              propertyName: uploaded.propertyName,
              fileName: uploaded.fileName,
            },
            origin,
          )
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'event_graphics_upload_failed'
          return json({ ok: false, error: message, message }, toEventGraphicsUploadErrorStatus(message), origin)
        }
      }

      const eventGraphicsPresetMatch = path.match(/^\/event-graphics-timetable\/([^/]+)\/preset$/)
      if (request.method === 'POST' && eventGraphicsPresetMatch) {
        try {
          await service.syncEventGraphicsTimetableProperties()
          const pageId = decodeURIComponent(eventGraphicsPresetMatch[1])
          const payload = parsePatchBody(await readJsonBody(request))
          const field = normalizeEventGraphicsPresetField(asString(payload.field))
          const enabled = normalizeEventGraphicsPresetEnabled(payload.enabled)
          const preset = normalizeEventGraphicsPresetValue(field, asString(payload.preset), enabled)
          const updated = await updateEventGraphicsPresetOnNotion(env, pageId, field, preset)
          return ok(
            {
              ok: true,
              pageId,
              field,
              value: updated.value,
            },
            origin,
          )
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'event_graphics_preset_failed'
          return json({ ok: false, error: message, message }, toEventGraphicsUploadErrorStatus(message), origin)
        }
      }

      if (request.method === 'POST' && path === '/admin/notion/project-schema/sync') {
        const sync = await service.syncProjectDatabaseProperties(true)
        invalidateSnapshotCache(ctx)
        return ok(
          {
            ok: true,
            projectDatabaseId: env.NOTION_PROJECT_DB_ID,
            created: sync.created,
            existing: sync.existing,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/screening-history-schema/sync') {
        const sync = await service.syncScreeningHistoryDatabaseProperties()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            databaseId: sync.databaseId,
            created: sync.created,
            existing: sync.existing,
            renamed: sync.renamed,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/screening-plan-schema/sync') {
        const sync = await service.syncScreeningPlanDatabaseProperties()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            databaseId: sync.databaseId,
            created: sync.created,
            existing: sync.existing,
            renamed: sync.renamed,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/photo-guide-schema/sync') {
        const sync = await service.syncPhotoGuideDatabaseProperties()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            databaseId: sync.databaseId,
            created: sync.created,
            existing: sync.existing,
            renamed: sync.renamed,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/screening-plan-history-sync') {
        const sync = await service.syncCompletedScreeningPlansToHistory()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            planDatabaseId: sync.planDatabaseId,
            historyDatabaseId: sync.historyDatabaseId,
            created: sync.created,
            updated: sync.updated,
            skipped: sync.skipped,
            syncedPlanIds: sync.syncedPlanIds,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/screening-plan-import-from-history') {
        let payload: {
          sourceEventName: string
          targetProjectId: string
        }
        try {
          payload = parseScreeningPlanImportBody(await readJsonBody(request))
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'invalid_request'
          return json({ ok: false, error: message }, 400, origin)
        }

        let imported
        try {
          imported = await service.importScreeningPlanFromHistory(payload)
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'screening_plan_import_failed'
          const status = message === 'screening_history_source_event_not_found' ? 404 : 500
          return json({ ok: false, error: status === 404 ? 'not_found' : 'internal_error', message }, status, origin)
        }
        return ok(
          {
            ok: true,
            configured: imported.configured,
            planDatabaseId: imported.planDatabaseId,
            historyDatabaseId: imported.historyDatabaseId,
            matched: imported.matched,
            created: imported.created,
            skipped: imported.skipped,
            createdPlanIds: imported.createdPlanIds,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/screening-video-schema/sync') {
        const sync = await service.syncScreeningHistoryDatabaseProperties()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            databaseId: sync.databaseId,
            created: sync.created,
            existing: sync.existing,
            renamed: sync.renamed,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/event-graphics-timetable-schema/sync') {
        const sync = await service.syncEventGraphicsTimetableProperties()
        return ok(
          {
            ok: true,
            configured: sync.configured,
            databaseId: sync.databaseId,
            created: sync.created,
            existing: sync.existing,
            renamed: sync.renamed,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/admin/notion/event-graphics-timetable/import') {
        const payload = parseEventGraphicsImportBody(await readJsonBody(request))
        const imported = await service.importEventGraphicsTimetableRows(payload.rows)
        return ok(
          {
            ok: true,
            configured: imported.configured,
            databaseId: imported.databaseId,
            created: imported.created,
            updated: imported.updated,
            skipped: imported.skipped,
            total: imported.total,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/tasks') {
        const projectId = asString(url.searchParams.get('projectId'))
        const status = asString(url.searchParams.get('status'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const snapshot = await getSnapshot(service, env, ctx)
        const filtered = filterTasks(snapshot.tasks, projectId, status, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok(
          {
            ok: true,
            tasks: paged.items,
            nextCursor: paged.nextCursor,
            hasMore: paged.hasMore,
            schema: service.getApiSchemaSummary(snapshot.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklists') {
        const eventName = asString(url.searchParams.get('eventName')) ?? ''
        const eventCategory = asString(url.searchParams.get('eventCategory')) ?? ''
        const normalizedEventCategory = normalizeChecklistValue(eventCategory)
        const eventDate = asString(url.searchParams.get('eventDate'))
        const shippingDate = asString(url.searchParams.get('shippingDate'))
        const operationModeRaw = asString(url.searchParams.get('operationMode'))
        const fulfillmentModeRaw = asString(url.searchParams.get('fulfillmentMode'))
        const operationMode = operationModeRaw === 'dealer' ? 'dealer' : operationModeRaw === 'self' ? 'self' : undefined
        const fulfillmentMode =
          fulfillmentModeRaw === 'overseas'
            ? 'overseas'
            : fulfillmentModeRaw === 'domestic'
              ? 'domestic'
              : fulfillmentModeRaw === 'dealer'
                ? 'dealer'
                : undefined

        const allItems = await service.listChecklists()
        const holidaySet = await getKoreanHolidaySet()
        const availableCategories = unique(
          allItems.flatMap((item) => [...(item.eventCategories ?? []), ...(item.applicableEventCategories ?? [])].filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b, 'ko'))

        const items = allItems
          .filter((item) => {
            const normalizedItemCategories = expandChecklistValues([...(item.eventCategories ?? []), ...(item.applicableEventCategories ?? [])])
            const byCategory = normalizedEventCategory
              ? normalizedItemCategories.size > 0 && normalizedItemCategories.has(normalizedEventCategory)
              : true
            if (!byCategory) return false
            return true
          })
          .map((item) => {
            const baseDate = pickChecklistBaseDate(item, eventDate, shippingDate)
            const offsetDays = pickChecklistOffset(item, operationMode, fulfillmentMode)
            if (!baseDate || typeof offsetDays !== 'number') return item
            return {
              ...item,
              computedDueDate: dateToIso(shiftBusinessDays(baseDate, offsetDays, holidaySet)),
            }
          })

        return ok(
          {
            ok: true,
            eventName,
            eventCategory,
            eventDate: eventDate ?? '',
            shippingDate: shippingDate ?? '',
            operationMode: operationMode ?? '',
            fulfillmentMode: fulfillmentMode ?? '',
            availableCategories,
            count: items.length,
            items,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignments') {
        const projectPageId = asString(url.searchParams.get('projectId')) ?? asString(url.searchParams.get('projectPageId'))

        if (projectPageId && env.NOTION_CHECKLIST_ASSIGNMENT_DB_ID) {
          const ensureModeRaw = (asString(url.searchParams.get('ensure')) ?? '').toLowerCase()
          const shouldEnsureSync = ensureModeRaw === 'sync' || ensureModeRaw === '1' || ensureModeRaw === 'true'
          const shouldEnsureBackground = !(
            ensureModeRaw === 'none' ||
            ensureModeRaw === 'off' ||
            ensureModeRaw === '0' ||
            ensureModeRaw === 'false'
          )

          const rows = shouldEnsureSync
            ? await service.ensureChecklistAssignmentsForProject(projectPageId)
            : await service.listChecklistAssignments(projectPageId)

          if (!shouldEnsureSync && shouldEnsureBackground) {
            ctx.waitUntil(
              service.ensureChecklistAssignmentsForProject(projectPageId).catch(() => {
                // Non-blocking best effort sync.
              }),
            )
          }

          return ok(
            {
              ok: true,
              projectPageId,
              rows,
              storageMode: 'notion_matrix',
              syncing: !shouldEnsureSync && shouldEnsureBackground,
            },
            origin,
          )
        }

        if (projectPageId) {
          const [loaded, projects, checklists, snapshot] = await Promise.all([
            loadChecklistAssignments(env),
            service.listProjects(),
            service.listChecklists(),
            getSnapshot(service, env, ctx),
          ])
          const normalizedProjectId = normalizeNotionId(projectPageId)
          const project = projects.find((entry) => normalizeNotionId(entry.id) === normalizedProjectId)
          if (!project) {
            return json({ ok: false, error: 'project_not_found' }, 404, origin)
          }

          const knownTaskIds = new Set(snapshot.tasks.map((task) => normalizeNotionId(task.id)))
          const assignmentEntries = Object.entries(loaded.assignments)
          const rows: ChecklistAssignmentRow[] = checklists.map((item) => {
            const key = checklistMatrixKey(project.id, item.id)
            const storedEntry = assignmentEntries.find(([entryKey]) => {
              const parts = entryKey.split('::')
              if (parts.length < 2) return false
              const itemId = parts[parts.length - 1]
              const projectKey = (parts[0] ?? '').toLowerCase()
              if (itemId !== item.id) return false
              return projectKey === normalizeNotionId(project.id) || projectKey === 'all_project'
            })
            const decoded = decodeChecklistAssignmentValue(storedEntry?.[1])
            const resolvedTaskPageId = resolveChecklistAssignedTaskId(decoded.taskPageId, knownTaskIds)
            const fallbackApplicable = checklistAppliesToProject(item, project)
            const applicable = decoded.explicitNotApplicable ? false : fallbackApplicable
            const status = decoded.explicitNotApplicable
              ? { assignmentStatus: 'not_applicable' as const, assignmentStatusText: '해당없음' }
              : toChecklistAssignmentStatus(applicable, resolvedTaskPageId)

            return {
              id: key,
              key,
              projectPageId: project.id,
              checklistItemPageId: item.id,
              taskPageId: resolvedTaskPageId,
              applicable,
              assignmentStatus: status.assignmentStatus,
              assignmentStatusText: status.assignmentStatusText,
            }
          })

          return ok(
            {
              ok: true,
              projectPageId: project.id,
              rows,
              storageMode: loaded.mode,
            },
            origin,
          )
        }

        const loaded = await loadChecklistAssignments(env)
        return ok(
          {
            ok: true,
            assignments: loaded.assignments,
            storageMode: loaded.mode,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignment-logs') {
        const limit = parseLogLimit(asString(url.searchParams.get('limit')))
        const logs = await listChecklistAssignmentLogs(env, limit)
        return ok(
          {
            ok: true,
            storageMode: hasChecklistDb(env) ? 'd1' : 'cache',
            logs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/checklist-assignments/export') {
        const loaded = await loadChecklistAssignments(env)
        const logLimit = parseExportLogLimit(asString(url.searchParams.get('logLimit')))
        const logs = loaded.mode === 'd1' ? await listChecklistAssignmentLogs(env, logLimit) : []

        return ok(
          {
            ok: true,
            exportedAt: new Date().toISOString(),
            storageMode: loaded.mode,
            counts: {
              assignments: Object.keys(loaded.assignments).length,
              logs: logs.length,
            },
            limits: {
              logLimit,
            },
            assignments: loaded.assignments,
            logs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/checklist-assignments') {
        let payload: {
          projectPageId: string
          checklistItemPageId: string
          taskPageId: string | null
          assignmentStatus?: ChecklistAssignmentStatus
          actor?: string
        }
        try {
          payload = parseChecklistAssignmentBody(await readJsonBody(request))
        } catch (error: unknown) {
          const message = error instanceof Error && error.message ? error.message : 'invalid_request'
          return json({ ok: false, error: message }, 400, origin)
        }

        if (env.NOTION_CHECKLIST_ASSIGNMENT_DB_ID) {
          if (payload.taskPageId) {
            try {
              await service.getTask(payload.taskPageId)
            } catch {
              return json({ ok: false, error: 'task_not_found' }, 404, origin)
            }
          }
          let row: ChecklistAssignmentRow
          try {
            row = await service.upsertChecklistAssignment({
              projectPageId: payload.projectPageId,
              checklistItemPageId: payload.checklistItemPageId,
              taskPageId: payload.taskPageId,
              assignmentStatus: payload.assignmentStatus,
              allowCreate: false,
            })
          } catch (error: unknown) {
            if (error instanceof Error && error.message === 'checklist_assignment_missing') {
              return json({ ok: false, error: 'checklist_assignment_missing' }, 409, origin)
            }
            throw error
          }
          const rows = await service.listChecklistAssignments(payload.projectPageId)
          return ok(
            {
              ok: true,
              row,
              rows,
              projectPageId: payload.projectPageId,
              storageMode: 'notion_matrix',
            },
            origin,
          )
        }

        const itemId = payload.checklistItemPageId
        const projectId = payload.projectPageId
        const taskId = payload.taskPageId ?? undefined
        const assignmentStatus: ChecklistAssignmentStatus = payload.assignmentStatus ?? (taskId ? 'assigned' : 'unassigned')
        const eventCategory = ''
        const loaded = await loadChecklistAssignments(env)
        const assignments = loaded.assignments
        if (taskId) {
          const snapshot = await getSnapshot(service, env, ctx)
          const existsInSnapshot = snapshot.tasks.some((task) => normalizeNotionId(task.id) === normalizeNotionId(taskId))
          if (!existsInSnapshot) {
            try {
              await service.getTask(taskId)
            } catch {
              return json({ ok: false, error: 'task_not_found' }, 404, origin)
            }
          }
        }
        const key = checklistAssignmentKey(eventCategory, itemId, projectId)
        const legacyKey = `${(eventCategory ?? '').trim() || 'ALL'}::${itemId}`
        const previousRaw = assignments[key] ?? assignments[legacyKey]
        const previousDecoded = decodeChecklistAssignmentValue(previousRaw)
        const previousTaskId = previousDecoded.taskPageId
        if (key !== legacyKey) {
          delete assignments[legacyKey]
        }
        if (assignmentStatus === 'not_applicable') {
          assignments[key] = CHECKLIST_NOT_APPLICABLE_SENTINEL
        } else if (taskId) {
          assignments[key] = taskId
        } else {
          delete assignments[key]
        }

        if (loaded.mode === 'd1') {
          await writeChecklistAssignmentToD1(env, request, {
            key,
            projectId: normalizeNotionId(projectId),
            eventCategory: eventCategory ?? '',
            itemId,
            taskId: assignmentStatus === 'assigned' ? taskId : undefined,
            previousTaskId,
            actor: payload.actor,
          })
        } else {
          ctx.waitUntil(writeChecklistAssignmentsToCache(assignments))
        }

        let row: ChecklistAssignmentRow | undefined
        try {
          const [projects, checklists] = await Promise.all([service.listProjects(), service.listChecklists()])
          const project = projects.find((entry) => normalizeNotionId(entry.id) === normalizeNotionId(projectId))
          const checklist = checklists.find((entry) => entry.id === itemId)
          const decoded = decodeChecklistAssignmentValue(assignments[key])
          const fallbackApplicable = project && checklist ? checklistAppliesToProject(checklist, project) : true
          const applicable = decoded.explicitNotApplicable ? false : fallbackApplicable
          const status = decoded.explicitNotApplicable
            ? { assignmentStatus: 'not_applicable' as const, assignmentStatusText: '해당없음' }
            : toChecklistAssignmentStatus(applicable, decoded.taskPageId)
          row = {
            id: key,
            key: checklistMatrixKey(projectId, itemId),
            projectPageId: projectId,
            checklistItemPageId: itemId,
            taskPageId: decoded.taskPageId,
            applicable,
            assignmentStatus: status.assignmentStatus,
            assignmentStatusText: status.assignmentStatusText,
          }
        } catch {
          // Fallback row mapping is best-effort only.
        }

        return ok(
          {
            ok: true,
            key,
            taskId: decodeChecklistAssignmentValue(assignments[key]).taskPageId,
            row,
            assignments,
            storageMode: loaded.mode,
          },
          origin,
        )
      }

      const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
      if (request.method === 'GET' && taskMatch) {
        const id = decodeURIComponent(taskMatch[1])
        const snapshot = await getSnapshot(service, env, ctx)
        const fromSnapshot = snapshot.tasks.find((task) => task.id === id)

        if (fromSnapshot) {
          return ok(
            {
              ok: true,
              task: fromSnapshot,
              schema: service.getApiSchemaSummary(snapshot.schema),
              cacheTtlMs,
            },
            origin,
          )
        }

        const data = await service.getTask(id)
        return ok(
          {
            ok: true,
            task: data.task,
            schema: service.getApiSchemaSummary(data.schema),
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'POST' && path === '/tasks') {
        let payload: CreateTaskInput
        try {
          payload = parseCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const created = await service.createTask(payload)
        invalidateSnapshotCache(ctx)

        return json(
          {
            ok: true,
            task: created.task,
            schema: service.getApiSchemaSummary(created.schema),
          },
          201,
          origin,
        )
      }

      if (request.method === 'PATCH' && taskMatch) {
        const id = decodeURIComponent(taskMatch[1])
        let patch: UpdateTaskInput

        try {
          patch = parseUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateTask(id, patch)
        invalidateSnapshotCache(ctx)

        return ok(
          {
            ok: true,
            task: updated.task,
            schema: service.getApiSchemaSummary(updated.schema),
          },
          origin,
        )
      }

      // ---- Video Manual ----

      if (request.method === 'GET' && path === '/video-manual') {
        const items = await service.listVideoManualItems()
        return ok({ ok: true, items, cacheTtlMs }, origin)
      }

      // ---- Subtitle ----

      const subtitleRevisionMatch = path.match(/^\/subtitle-revisions\/([^/]+)$/)

      if (request.method === 'GET' && path === '/subtitle-videos') {
        const videos = await service.listSubtitleVideos()
        return ok({ ok: true, videos, cacheTtlMs }, origin)
      }

      if (request.method === 'POST' && path === '/subtitle-videos') {
        let payload: Record<string, unknown>
        try {
          payload = parsePatchBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }
        const videoName = asString(payload.videoName)
        if (!videoName) return json({ ok: false, error: 'videoName_required' }, 400, origin)
        const video = await service.createSubtitleVideo(payload)
        return json({ ok: true, video }, 201, origin)
      }

      if (request.method === 'GET' && path === '/subtitle-revisions') {
        const videoId = asString(url.searchParams.get('videoId'))
        const revisions = await service.listSubtitleRevisions(videoId || undefined)
        return ok({ ok: true, revisions, cacheTtlMs }, origin)
      }

      if (request.method === 'GET' && subtitleRevisionMatch) {
        const id = decodeURIComponent(subtitleRevisionMatch[1])
        const revision = await service.getSubtitleRevision(id)
        return ok({ ok: true, revision }, origin)
      }

      if (request.method === 'POST' && path === '/subtitle-revisions') {
        let payload: any
        try {
          payload = parseSubtitleRevisionCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }
        const created = await service.createSubtitleRevision(payload)
        return json({ ok: true, revision: created }, 201, origin)
      }

      // ---- References CRUD ----

      const referenceMatch = path.match(/^\/references\/([^/]+)$/)

      if (request.method === 'GET' && path === '/references') {
        const sourceType = asString(url.searchParams.get('sourceType'))
        const usageType = asString(url.searchParams.get('usageType'))
        const projectId = asString(url.searchParams.get('projectId'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const allItems = await service.listReferences()
        const filtered = filterReferences(allItems, sourceType, usageType, projectId, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok({ ok: true, items: paged.items, nextCursor: paged.nextCursor, hasMore: paged.hasMore, cacheTtlMs }, origin)
      }

      if (request.method === 'GET' && referenceMatch) {
        const id = decodeURIComponent(referenceMatch[1])
        const item = await service.getReference(id)
        return ok({ ok: true, item }, origin)
      }

      if (request.method === 'POST' && path === '/references') {
        let payload: CreateReferenceInput
        try {
          payload = parseReferenceCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }
        const clientIp = getClientIp()
        payload.authorIp = clientIp
        payload.authorName = getReferenceAuthorName()

        const created = await service.createReference(payload)
        return json({ ok: true, item: created }, 201, origin)
      }

      if (request.method === 'PATCH' && referenceMatch) {
        const id = decodeURIComponent(referenceMatch[1])
        let patch: UpdateReferenceInput
        try {
          patch = parseReferenceUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateReference(id, patch)
        return ok({ ok: true, item: updated }, origin)
      }

      if (request.method === 'DELETE' && referenceMatch) {
        const id = decodeURIComponent(referenceMatch[1])
        await service.archiveReference(id)
        return ok({ ok: true }, origin)
      }

      // ---- Storyboard documents CRUD ----

      const storyboardMatch = path.match(/^\/storyboards\/([^/]+)$/)

      if (request.method === 'GET' && path === '/storyboards') {
        const projectId = asString(url.searchParams.get('projectId'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const allItems = await service.listStoryboards()
        const filtered = filterStoryboards(allItems, projectId, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok({ ok: true, items: paged.items, nextCursor: paged.nextCursor, hasMore: paged.hasMore, cacheTtlMs }, origin)
      }

      if (request.method === 'GET' && storyboardMatch) {
        const id = decodeURIComponent(storyboardMatch[1])
        const item = await service.getStoryboard(id)
        return ok({ ok: true, item }, origin)
      }

      if (request.method === 'POST' && path === '/storyboards') {
        let payload: CreateStoryboardDocumentInput
        try {
          payload = parseStoryboardCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const created = await service.createStoryboard(payload)
        return json({ ok: true, item: created }, 201, origin)
      }

      if (request.method === 'PATCH' && storyboardMatch) {
        const id = decodeURIComponent(storyboardMatch[1])
        let patch: UpdateStoryboardDocumentInput
        try {
          patch = parseStoryboardUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateStoryboard(id, patch)
        return ok({ ok: true, item: updated }, origin)
      }

      if (request.method === 'DELETE' && storyboardMatch) {
        const id = decodeURIComponent(storyboardMatch[1])
        await service.archiveStoryboard(id)
        return ok({ ok: true }, origin)
      }

      // ---- Feedback CRUD ----

      const feedbackMatch = path.match(/^\/feedback\/([^/]+)$/)

      if (request.method === 'GET' && path === '/feedback/summary') {
        const eventCategory = asString(url.searchParams.get('eventCategory'))
        if (!eventCategory) {
          return json({ ok: false, error: 'eventCategory_required' }, 400, origin)
        }
        const unreflectedOnly = url.searchParams.get('unreflectedOnly') !== 'false'
        const allFeedback = await service.listFeedback()
        const filtered = allFeedback.filter((item) => {
          if (item.eventCategory !== eventCategory) return false
          if (unreflectedOnly && item.reflectionStatus === '반영완료') return false
          return true
        })
        return ok(
          {
            ok: true,
            eventCategory,
            count: filtered.length,
            items: filtered.map((item) => ({
              id: item.id,
              content: item.content.length > 100 ? item.content.slice(0, 100) + '...' : item.content,
              domainTags: item.domainTags,
              priority: item.priority,
              recurring: item.recurring,
              reflectionStatus: item.reflectionStatus,
            })),
          },
          origin,
        )
      }

      if (request.method === 'GET' && path === '/feedback') {
        const eventCategory = asString(url.searchParams.get('eventCategory'))
        const domainTag = asString(url.searchParams.get('domainTag'))
        const reflectionStatus = asString(url.searchParams.get('reflectionStatus'))
        const recurring = asString(url.searchParams.get('recurring'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const allFeedback = await service.listFeedback()
        const filtered = filterFeedback(allFeedback, eventCategory, domainTag, reflectionStatus, recurring, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok(
          {
            ok: true,
            feedback: paged.items,
            nextCursor: paged.nextCursor,
            hasMore: paged.hasMore,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && feedbackMatch) {
        const id = decodeURIComponent(feedbackMatch[1])
        const feedback = await service.getFeedback(id)
        return ok({ ok: true, feedback }, origin)
      }

      if (request.method === 'POST' && path === '/feedback') {
        let payload: CreateFeedbackInput
        try {
          payload = parseFeedbackCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const created = await service.createFeedback(payload)
        return json({ ok: true, feedback: created }, 201, origin)
      }

      if (request.method === 'PATCH' && feedbackMatch) {
        const id = decodeURIComponent(feedbackMatch[1])
        let patch: UpdateFeedbackInput

        try {
          patch = parseFeedbackUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateFeedback(id, patch)
        return ok({ ok: true, feedback: updated }, origin)
      }

      // ---- Program Issues CRUD ----

      const programIssueMatch = path.match(/^\/program-issues\/([^/]+)$/)

      if (request.method === 'GET' && path === '/program-issues') {
        const status = asString(url.searchParams.get('status'))
        const issueType = asString(url.searchParams.get('issueType'))
        const priority = asString(url.searchParams.get('priority'))
        const q = asString(url.searchParams.get('q'))
        const cursor = asString(url.searchParams.get('cursor'))
        const pageSize = parsePageSize(url.searchParams.get('pageSize'))

        const allItems = await service.listProgramIssues()
        const filtered = filterProgramIssues(allItems, status, issueType, priority, q)
        const paged = paginate(filtered, cursor, pageSize)

        return ok(
          {
            ok: true,
            items: paged.items,
            nextCursor: paged.nextCursor,
            hasMore: paged.hasMore,
            cacheTtlMs,
          },
          origin,
        )
      }

      if (request.method === 'GET' && programIssueMatch) {
        const id = decodeURIComponent(programIssueMatch[1])
        const item = await service.getProgramIssue(id)
        return ok({ ok: true, item }, origin)
      }

      if (request.method === 'POST' && path === '/program-issues') {
        let payload: CreateProgramIssueInput
        try {
          payload = parseProgramIssueCreateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_request' }, 400, origin)
        }

        const created = await service.createProgramIssue(payload)
        return json({ ok: true, item: created }, 201, origin)
      }

      if (request.method === 'PATCH' && programIssueMatch) {
        const id = decodeURIComponent(programIssueMatch[1])
        let patch: UpdateProgramIssueInput

        try {
          patch = parseProgramIssueUpdateBody(await readJsonBody(request))
        } catch (error: any) {
          return json({ ok: false, error: error?.message ?? 'invalid_patch' }, 400, origin)
        }

        const updated = await service.updateProgramIssue(id, patch)
        return ok({ ok: true, item: updated }, origin)
      }

      if (request.method === 'GET' && path === '/') {
        return ok(
          {
            ok: true,
            supported: [
              'GET /api/auth/session',
              'POST /api/auth/login',
              'POST /api/auth/logout',
              'GET|POST /api/line/webhook',
              'POST /api/admin/line/reminders/send?kind=morning|evening',
              'GET /api/projects',
              'GET /api/meta',
              'GET /api/photo-guide',
              'POST /api/photo-guide',
              'POST /api/event-graphics-timetable/:id/files',
              'POST /api/event-graphics-timetable/:id/preset',
              'POST /api/admin/notion/screening-history-schema/sync',
              'POST /api/admin/notion/screening-plan-schema/sync',
              'POST /api/admin/notion/photo-guide-schema/sync',
              'POST /api/admin/notion/screening-plan-history-sync',
              'POST /api/admin/notion/screening-plan-import-from-history',
              'GET /api/checklists?eventName=...&eventCategory=...',
              'GET /api/checklist-assignments?projectId=...',
              'GET /api/checklist-assignments/export?logLimit=1000',
              'GET /api/checklist-assignment-logs?limit=100',
              'POST /api/checklist-assignments',
              'POST /api/uploads/presign',
              'POST /api/uploads/events',
              'GET /api/uploads/sessions?limit=20',
              'GET /api/transcripts?limit=20',
              'POST /api/transcripts',
              'GET /api/transcripts/:id',
              'POST|PATCH /api/transcripts/:id/speakers',
              'POST /api/transcripts/:id/publish',
              'GET|POST|PATCH|DELETE /api/keyword-sets',
              'GET|POST|PATCH|DELETE /api/keywords',
              'POST /api/assemblyai/webhook',
              'GET /api/tasks?projectId=...&status=...&q=...&cursor=...&pageSize=...',
              'GET /api/tasks/:id',
              'POST /api/tasks',
              'PATCH /api/tasks/:id',
              'GET /api/feedback?eventCategory=...&domainTag=...&reflectionStatus=...&q=...',
              'GET /api/feedback/summary?eventCategory=...',
              'GET /api/feedback/:id',
              'POST /api/feedback',
              'PATCH /api/feedback/:id',
              'GET /api/references?sourceType=...&usageType=...&projectId=...&q=...',
              'GET /api/references/:id',
              'POST /api/references',
              'PATCH /api/references/:id',
              'DELETE /api/references/:id',
              'GET /api/storyboards?projectId=...&q=...',
              'GET /api/storyboards/:id',
              'POST /api/storyboards',
              'PATCH /api/storyboards/:id',
              'DELETE /api/storyboards/:id',
              'GET /api/program-issues?status=...&issueType=...&priority=...&q=...',
              'GET /api/program-issues/:id',
              'POST /api/program-issues',
              'PATCH /api/program-issues/:id',
            ],
          },
          origin,
        )
      }

      return json({ ok: false, error: 'not_found', path: url.pathname }, 404, origin)
    } catch (error: any) {
      const status = error?.code === 'object_not_found' ? 404 : 500
      return json(
        {
          ok: false,
          error: status === 404 ? 'not_found' : 'internal_error',
          message: error?.message ?? 'unknown_error',
        },
        status,
        origin,
      )
    }
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const missingNotion = requiredNotionEnv(env)
      if (missingNotion) throw new Error(`Missing environment variable: ${missingNotion}`)

      if (controller.cron === LINE_MORNING_CRON_UTC) {
        await sendLineReminder(env, ctx, 'morning')
        return
      }

      if (controller.cron === LINE_EVENING_CRON_UTC) {
        await sendLineReminder(env, ctx, 'evening')
        return
      }

      if (controller.cron === SCREENING_PLAN_HISTORY_SYNC_CRON_UTC) {
        const service = serviceFromEnv(env)
        await service.syncCompletedScreeningPlansToHistory()
      }
    } catch (error: unknown) {
      console.error('scheduled_task_failed', error instanceof Error ? error.message : error)
      throw error
    }
  },
}
