import { NotionApi } from '../notionApi'
import type { CreatePhotoGuideInput, Env } from '../types'
import { asString, MAX_NOTION_FILE_UPLOAD_BYTES, parsePatchBody } from '../utils'

export function parsePhotoGuideCreateBody(body: unknown): CreatePhotoGuideInput {
  const payload = parsePatchBody(body)
  const title = asString(payload.title)
  if (!title) {
    throw new Error('title_required')
  }

  return {
    title,
    section: asString(payload.section),
    eventName: asString(payload.eventName),
    eventDate: asString(payload.eventDate),
    location: asString(payload.location),
    callTime: asString(payload.callTime),
    contact: asString(payload.contact),
    purpose: asString(payload.purpose),
    mustShoot: asString(payload.mustShoot),
    timeline: asString(payload.timeline),
    cautions: asString(payload.cautions),
    delivery: asString(payload.delivery),
    references: asString(payload.references),
    referenceLink: asString(payload.referenceLink),
  }
}

function isAcceptedPhotoGuideFile(file: File): boolean {
  const mimeType = (file.type || '').toLowerCase()
  const filename = file.name.toLowerCase()
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType === 'application/pdf' ||
    /\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|avi|pdf)$/i.test(filename)
  )
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

  // Find the attachment property and append the new file to existing files
  const attachmentPropName = '첨부 자료'
  const existingProp = properties[attachmentPropName] as Record<string, unknown> | undefined
  const existingFiles: unknown[] = Array.isArray((existingProp as any)?.files) ? (existingProp as any).files : []

  const preservedFiles = existingFiles.map((f: any) => {
    if (f.type === 'file_upload') return { name: f.name, type: 'file_upload', file_upload: { id: f.file_upload?.id } }
    if (f.type === 'external') return { name: f.name, type: 'external', external: { url: f.external?.url } }
    return f
  })

  await api.updatePage(pageId, {
    properties: {
      [attachmentPropName]: {
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
