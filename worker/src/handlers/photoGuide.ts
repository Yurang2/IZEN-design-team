import { NotionApi } from '../notionApi'
import type { CreateShotSlotInput, Env } from '../types'
import { asString, MAX_NOTION_FILE_UPLOAD_BYTES, parsePatchBody } from '../utils'

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function parseShotSlotCreateBody(body: unknown): CreateShotSlotInput {
  const payload = parsePatchBody(body)
  const title = asString(payload.title)
  if (!title) {
    throw new Error('title_required')
  }

  return {
    title,
    group: asString(payload.group) ?? asString(payload.section),
    description: asString(payload.description) ?? asString(payload.purpose),
    eventName: asString(payload.eventName),
    eventDate: asString(payload.eventDate),
    location: asString(payload.location),
    callTime: asString(payload.callTime),
    contact: asString(payload.contact),
    order: parseOptionalNumber(payload.order),
  }
}

function isAcceptedPhotoGuideFile(file: File): boolean {
  const mimeType = (file.type || '').toLowerCase()
  const filename = file.name.toLowerCase()
  return mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename)
}

export function toPhotoGuideUploadErrorStatus(message: string): number {
  if (
    message === 'photo_guide_upload_file_missing' ||
    message === 'photo_guide_upload_filename_missing' ||
    message === 'photo_guide_upload_file_invalid'
  ) {
    return 400
  }
  if (message === 'photo_guide_upload_file_too_large') return 413
  return 500
}

export async function uploadPhotoGuideFileToNotion(
  env: Env,
  pageId: string,
  file: File,
): Promise<{ fileName: string }> {
  if (!file.name.trim()) throw new Error('photo_guide_upload_filename_missing')
  if (!isAcceptedPhotoGuideFile(file)) throw new Error('photo_guide_upload_file_invalid')
  if (file.size > MAX_NOTION_FILE_UPLOAD_BYTES) throw new Error('photo_guide_upload_file_too_large')

  const api = new NotionApi(env)
  const contentType = file.type || 'application/octet-stream'
  const bytes = await file.arrayBuffer()

  const created = await api.createFileUpload(file.name, contentType)
  const fileUploadId = asString((created as Record<string, unknown>)?.id)
  if (!fileUploadId) throw new Error('notion_file_upload_create_failed')

  await api.sendFileUpload(fileUploadId, bytes, file.name, contentType)
  const uploaded = await api.retrieveFileUpload(fileUploadId)
  const status = asString((uploaded as Record<string, unknown>)?.status)
  if (status && status !== 'uploaded') throw new Error('notion_file_upload_send_failed')

  const page = (await api.retrievePage(pageId)) as Record<string, unknown>
  const properties = ((page.properties as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const imagePropertyName = '\uCEF7 \uC774\uBBF8\uC9C0'
  const existingProp = properties[imagePropertyName] as Record<string, unknown> | undefined
  const existingFiles: unknown[] = Array.isArray((existingProp as any)?.files) ? (existingProp as any).files : []

  const preservedFiles = existingFiles.map((entry: any) => {
    if (entry.type === 'file_upload') {
      return {
        name: entry.name,
        type: 'file_upload',
        file_upload: { id: entry.file_upload?.id },
      }
    }
    if (entry.type === 'external') {
      return {
        name: entry.name,
        type: 'external',
        external: { url: entry.external?.url },
      }
    }
    return entry
  })

  await api.updatePage(pageId, {
    properties: {
      [imagePropertyName]: {
        files: [
          ...preservedFiles,
          {
            name: file.name,
            type: 'file_upload',
            file_upload: { id: fileUploadId },
          },
        ],
      },
    },
  })

  return { fileName: file.name }
}
