// ---------------------------------------------------------------------------
// Synology NAS File Station API handler
// ---------------------------------------------------------------------------
// Provides: login, logout, list files, create folder, upload file
// Does NOT provide: delete, rename, move, overwrite
// ---------------------------------------------------------------------------

import type { Env } from '../types'
import { asString, readJsonBody } from '../utils'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function getNasUrl(env: Env): string {
  const url = env.SYNOLOGY_NAS_URL
  if (!url) throw new Error('nas_not_configured')
  return url.replace(/\/+$/, '')
}

// ---------------------------------------------------------------------------
// Synology API helpers
// ---------------------------------------------------------------------------

type SynoResponse<T = unknown> = {
  success: boolean
  data?: T
  error?: { code: number }
}

async function synoFetch<T>(
  nasUrl: string,
  endpoint: string,
  params: Record<string, string>,
  options?: { formData?: FormData },
): Promise<SynoResponse<T>> {
  // Synology API: always use GET with query params, except file upload (POST + formData)
  const url = `${nasUrl}/webapi/${endpoint}`

  if (options?.formData) {
    const fd = options.formData
    for (const [k, v] of Object.entries(params)) {
      fd.append(k, v)
    }
    const res = await fetch(url, { method: 'POST', body: fd })
    if (!res.ok) throw new Error(`nas_http_${res.status}`)
    return (await res.json()) as SynoResponse<T>
  }

  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${url}?${qs}`)
  if (!res.ok) throw new Error(`nas_http_${res.status}`)
  return (await res.json()) as SynoResponse<T>
}

// ---------------------------------------------------------------------------
// Synology error code mapping
// ---------------------------------------------------------------------------

function synoErrorMessage(code: number): string {
  const map: Record<number, string> = {
    400: 'nas_login_failed_invalid_credentials',
    401: 'nas_login_failed_account_disabled',
    402: 'nas_login_failed_permission_denied',
    403: 'nas_login_failed_2fa_required',
    404: 'nas_session_expired',
    408: 'nas_file_already_exists',
    414: 'nas_path_already_exists',
    900: 'nas_upload_failed',
    1800: 'nas_folder_exists',
    1100: 'nas_path_not_found',
  }
  return map[code] ?? `nas_error_${code}`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function handleNasRoutes(
  request: Request,
  path: string,
  env: Env,
  respond: {
    json: (body: unknown, status: number) => Response
    ok: (body: unknown) => Response
  },
): Promise<Response | null> {
  if (!path.startsWith('/nas/')) return null

  const nasUrl = getNasUrl(env)

  const fail = (error: unknown): Response => {
    const message = error instanceof Error ? error.message : 'nas_unknown_error'
    const status = message.includes('not_configured') ? 501
      : message.includes('login_failed') ? 401
      : message.includes('session_expired') ? 401
      : message.includes('permission_denied') ? 403
      : message.includes('not_found') ? 404
      : message.includes('already_exists') ? 409
      : 500
    return respond.json({ ok: false, error: message }, status)
  }

  try {
    // ── Login ──
    if (request.method === 'POST' && path === '/nas/login') {
      const body = await readJsonBody(request)
      const account = asString(body.account)
      const passwd = asString(body.passwd)
      if (!account || !passwd) {
        return respond.json({ ok: false, error: 'nas_credentials_required' }, 400)
      }

      const res = await synoFetch<{ sid: string }>(nasUrl, 'auth.cgi', {
        api: 'SYNO.API.Auth',
        version: '6',
        method: 'login',
        account,
        passwd,
        session: 'FileStation',
        format: 'sid',
      })

      if (!res.success || !res.data?.sid) {
        throw new Error(synoErrorMessage(res.error?.code ?? 400))
      }

      return respond.ok({ ok: true, sid: res.data.sid })
    }

    // ── Logout ──
    if (request.method === 'POST' && path === '/nas/logout') {
      const body = await readJsonBody(request)
      const sid = asString(body.sid)
      if (sid) {
        await synoFetch(nasUrl, 'auth.cgi', {
          api: 'SYNO.API.Auth',
          version: '6',
          method: 'logout',
          session: 'FileStation',
          _sid: sid,
        }).catch(() => {})
      }
      return respond.ok({ ok: true })
    }

    // ── List files in folder ──
    if (request.method === 'POST' && path === '/nas/list') {
      const body = await readJsonBody(request)
      const sid = asString(body.sid)
      const folderPath = asString(body.folderPath)
      if (!sid) return respond.json({ ok: false, error: 'nas_sid_required' }, 400)
      if (!folderPath) return respond.json({ ok: false, error: 'nas_path_required' }, 400)

      const res = await synoFetch<{
        files: Array<{
          name: string
          path: string
          isdir: boolean
          additional?: { size?: number; time?: { mtime: number } }
        }>
      }>(nasUrl, 'entry.cgi', {
        api: 'SYNO.FileStation.List',
        version: '2',
        method: 'list',
        folder_path: folderPath,
        additional: 'size,time',
        _sid: sid,
      })

      if (!res.success) {
        throw new Error(synoErrorMessage(res.error?.code ?? 500))
      }

      const files = (res.data?.files ?? []).map((f) => ({
        name: f.name,
        path: f.path,
        isDir: f.isdir,
        size: f.additional?.size,
        mtime: f.additional?.time?.mtime,
      }))

      return respond.ok({ ok: true, files })
    }

    // ── Create folder ──
    if (request.method === 'POST' && path === '/nas/create-folder') {
      const body = await readJsonBody(request)
      const sid = asString(body.sid)
      const folderPath = asString(body.folderPath)
      const name = asString(body.name)
      if (!sid) return respond.json({ ok: false, error: 'nas_sid_required' }, 400)
      if (!folderPath || !name) return respond.json({ ok: false, error: 'nas_path_required' }, 400)

      const res = await synoFetch(nasUrl, 'entry.cgi', {
        api: 'SYNO.FileStation.CreateFolder',
        version: '2',
        method: 'create',
        folder_path: folderPath,
        name,
        _sid: sid,
      })

      if (!res.success) {
        const code = res.error?.code ?? 500
        // 1800 = folder already exists — not an error for us
        if (code === 1800 || code === 414) {
          return respond.ok({ ok: true, alreadyExists: true })
        }
        throw new Error(synoErrorMessage(code))
      }

      return respond.ok({ ok: true })
    }

    // ── Upload file ──
    if (request.method === 'POST' && path === '/nas/upload') {
      const contentType = request.headers.get('content-type') ?? ''
      if (!contentType.includes('multipart/form-data')) {
        return respond.json({ ok: false, error: 'nas_multipart_required' }, 400)
      }

      const formData = await request.formData()
      const sid = formData.get('sid') as string | null
      const destPath = formData.get('dest_folder_path') as string | null
      const file = formData.get('file') as File | null
      const createParents = formData.get('create_parents') as string | null

      if (!sid) return respond.json({ ok: false, error: 'nas_sid_required' }, 400)
      if (!destPath) return respond.json({ ok: false, error: 'nas_path_required' }, 400)
      if (!file) return respond.json({ ok: false, error: 'nas_file_required' }, 400)

      // Build FormData for Synology
      const nasForm = new FormData()
      nasForm.append('file', file, file.name)

      const res = await synoFetch(nasUrl, 'entry.cgi', {
        api: 'SYNO.FileStation.Upload',
        version: '2',
        method: 'upload',
        dest_folder_path: destPath,
        create_parents: createParents === 'true' ? 'true' : 'false',
        overwrite: 'false', // NEVER overwrite — safety first
        _sid: sid,
      }, { formData: nasForm })

      if (!res.success) {
        throw new Error(synoErrorMessage(res.error?.code ?? 900))
      }

      return respond.ok({ ok: true, filename: file.name, destPath })
    }

    return null
  } catch (err) {
    return fail(err)
  }
}

// ---------------------------------------------------------------------------
// Pre-auth route check (NAS routes all require auth)
// ---------------------------------------------------------------------------

export function isNasRoute(path: string): boolean {
  return path.startsWith('/nas/')
}
