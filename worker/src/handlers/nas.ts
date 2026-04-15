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
  error?: {
    code: number
    errors?: Array<{ code: number; path?: string }>
  }
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
    const sid = params._sid
    const qs = new URLSearchParams(params).toString()
    const authedUrl = qs ? `${url}?${qs}` : url
    const res = await fetch(authedUrl, {
      method: 'POST',
      headers: sid ? { Cookie: `id=${sid}` } : undefined,
      body: options.formData,
    })
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

type SynoError = NonNullable<SynoResponse['error']>

function synoCommonErrorMessage(code: number): string | null {
  const map: Record<number, string> = {
    100: 'nas_unknown_error',
    101: 'nas_invalid_api_parameters',
    102: 'nas_api_not_found',
    103: 'nas_api_method_not_found',
    104: 'nas_api_version_not_supported',
    105: 'nas_permission_denied',
    106: 'nas_session_expired',
    107: 'nas_session_interrupted',
    119: 'nas_sid_not_found',
  }
  return map[code] ?? null
}

function synoAuthErrorMessage(error?: SynoError): string {
  const code = error?.code ?? 100
  const common = synoCommonErrorMessage(code)
  if (common) return common

  const map: Record<number, string> = {
    400: 'nas_login_failed_invalid_credentials',
    401: 'nas_login_failed_account_disabled',
    402: 'nas_login_failed_permission_denied',
    403: 'nas_login_failed_2fa_required',
    404: 'nas_login_failed_2fa_verification_failed',
  }
  return map[code] ?? `nas_auth_error_${code}`
}

function synoFileOperationErrorMessage(error?: SynoError): string {
  const code = error?.code ?? 100
  const common = synoCommonErrorMessage(code)
  if (common) return common

  const map: Record<number, string> = {
    400: 'nas_invalid_file_operation_parameters',
    401: 'nas_file_operation_unknown_error',
    402: 'nas_system_busy',
    403: 'nas_invalid_user_for_file_operation',
    404: 'nas_invalid_group_for_file_operation',
    405: 'nas_invalid_user_and_group_for_file_operation',
    406: 'nas_account_server_unavailable',
    407: 'nas_operation_not_permitted',
    408: 'nas_path_not_found',
    409: 'nas_non_supported_file_system',
    410: 'nas_remote_file_system_connection_failed',
    411: 'nas_read_only_file_system',
    412: 'nas_filename_too_long',
    413: 'nas_encrypted_filename_too_long',
    414: 'nas_file_already_exists',
    415: 'nas_disk_quota_exceeded',
    416: 'nas_no_space_left_on_device',
    417: 'nas_input_output_error',
    418: 'nas_illegal_name_or_path',
    419: 'nas_illegal_file_name',
    420: 'nas_illegal_file_name_fat',
    421: 'nas_device_or_resource_busy',
    599: 'nas_file_operation_task_not_found',
  }
  return map[code] ?? `nas_file_operation_error_${code}`
}

function synoCreateFolderErrorMessage(error?: SynoError): string {
  const code = error?.code ?? 100
  const common = synoCommonErrorMessage(code)
  if (common) return common

  if (code === 1100) {
    const detailCode = error?.errors?.[0]?.code
    if (typeof detailCode === 'number') return synoFileOperationErrorMessage({ code: detailCode })
    return 'nas_create_folder_failed'
  }

  return synoFileOperationErrorMessage(error)
}

function synoUploadErrorMessage(error?: SynoError): string {
  const code = error?.code ?? 100
  const common = synoCommonErrorMessage(code)
  if (common) return common

  const map: Record<number, string> = {
    1800: 'nas_upload_content_length_mismatch',
    1801: 'nas_upload_client_timeout',
    1802: 'nas_upload_filename_missing',
    1803: 'nas_upload_connection_cancelled',
    1804: 'nas_upload_oversized_for_fat',
  }
  return map[code] ?? synoFileOperationErrorMessage(error)
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
      : message.includes('sid_not_found') ? 401
      : message.includes('session_expired') ? 401
      : message.includes('invalid_') ? 400
      : message.includes('illegal_') ? 400
      : message.includes('permission_denied') ? 403
      : message.includes('not_found') ? 404
      : message.includes('already_exists') ? 409
      : message.includes('no_space_left') ? 507
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
        throw new Error(synoAuthErrorMessage(res.error))
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
        throw new Error(synoFileOperationErrorMessage(res.error))
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
        const message = synoCreateFolderErrorMessage(res.error)
        // Treat existing folders as non-fatal for upload preparation.
        if (message.includes('already_exists')) {
          return respond.ok({ ok: true, alreadyExists: true })
        }
        throw new Error(message)
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
      const destPath = asString(formData.get('dest_folder_path') ?? formData.get('path'))
      const file = formData.get('file') as File | null
      const createParents = formData.get('create_parents') as string | null

      if (!sid) return respond.json({ ok: false, error: 'nas_sid_required' }, 400)
      if (!destPath) return respond.json({ ok: false, error: 'nas_path_required' }, 400)
      if (!file) return respond.json({ ok: false, error: 'nas_file_required' }, 400)

      // Build FormData for Synology
      const nasForm = new FormData()
      nasForm.append('path', destPath)
      nasForm.append('create_parents', createParents === 'true' ? 'true' : 'false')
      nasForm.append('overwrite', 'false')
      nasForm.append('file', file, file.name)

      const res = await synoFetch(nasUrl, 'entry.cgi', {
        api: 'SYNO.FileStation.Upload',
        version: '2',
        method: 'upload',
        overwrite: 'false', // NEVER overwrite — safety first
        _sid: sid,
      }, { formData: nasForm })

      if (!res.success) {
        throw new Error(synoUploadErrorMessage(res.error))
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
