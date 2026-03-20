import { NotionApi } from '../notionApi'
import type {
  Env,
} from '../types'
import {
  asString,
  EVENT_GRAPHICS_AUDIO_FILES_FIELD,
  EVENT_GRAPHICS_AUDIO_TEXT_FIELD,
  EVENT_GRAPHICS_CAPTURE_FILES_FIELD,
  EVENT_GRAPHICS_CAPTURE_FILES_FIELD_LEGACY,
  EVENT_GRAPHICS_DJ_AMBIENT_LABEL,
  EVENT_GRAPHICS_MAIN_SCREEN_FIELD,
  EVENT_GRAPHICS_MIC_ONLY_LABEL_DISPLAY,
  EVENT_GRAPHICS_NOT_APPLICABLE_LABEL,
  EVENT_GRAPHICS_NOT_APPLICABLE_LABEL_DISPLAY,
  EVENT_GRAPHICS_SPEAKER_PPT_LABEL,
  EVENT_GRAPHICS_SPEAKER_PPT_LABEL_DISPLAY,
  EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL,
  EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL_DISPLAY,
  hasOwn,
  MAX_NOTION_FILE_UPLOAD_BYTES,
  serializeRichTextPlainText,
} from '../utils'

function resolveEventGraphicsPresetTextPropertyName(field: 'capture' | 'audio'): string {
  return field === 'capture' ? EVENT_GRAPHICS_MAIN_SCREEN_FIELD : EVENT_GRAPHICS_AUDIO_TEXT_FIELD
}

function isKnownEventGraphicsPresetLabel(field: 'capture' | 'audio', value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  if (field === 'capture') {
    return normalized === EVENT_GRAPHICS_SPEAKER_PPT_LABEL.toLowerCase() || normalized === EVENT_GRAPHICS_SPEAKER_PPT_LABEL_DISPLAY.toLowerCase()
  }
  return (
    normalized === EVENT_GRAPHICS_DJ_AMBIENT_LABEL.toLowerCase() ||
    normalized === EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL.toLowerCase() ||
    normalized === EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL_DISPLAY.toLowerCase() ||
    normalized === EVENT_GRAPHICS_MIC_ONLY_LABEL_DISPLAY.toLowerCase() ||
    normalized === EVENT_GRAPHICS_NOT_APPLICABLE_LABEL.toLowerCase() ||
    normalized === EVENT_GRAPHICS_NOT_APPLICABLE_LABEL_DISPLAY.toLowerCase()
  )
}

function resolveEventGraphicsFilesPropertyName(properties: Record<string, unknown>, field: 'capture' | 'audio'): string {
  if (field === 'capture') {
    if (hasOwn(properties, EVENT_GRAPHICS_CAPTURE_FILES_FIELD)) return EVENT_GRAPHICS_CAPTURE_FILES_FIELD
    if (hasOwn(properties, EVENT_GRAPHICS_CAPTURE_FILES_FIELD_LEGACY)) return EVENT_GRAPHICS_CAPTURE_FILES_FIELD_LEGACY
    return EVENT_GRAPHICS_CAPTURE_FILES_FIELD
  }

  return EVENT_GRAPHICS_AUDIO_FILES_FIELD
}

function isAcceptedEventGraphicsFile(file: File, field: 'capture' | 'audio'): boolean {
  const mimeType = (file.type || '').toLowerCase()
  const filename = file.name.toLowerCase()

  if (field === 'capture') {
    return mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename)
  }

  return mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|aiff?|ogg)$/i.test(filename)
}

export function normalizeEventGraphicsUploadField(value: string | null | undefined): 'capture' | 'audio' {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'capture' || normalized === 'graphic' || normalized === 'graphics') return 'capture'
  if (normalized === 'audio') return 'audio'
  throw new Error('event_graphics_upload_field_invalid')
}

export async function uploadEventGraphicsFileToNotion(
  env: Env,
  pageId: string,
  field: 'capture' | 'audio',
  file: File,
): Promise<{ propertyName: string; fileName: string }> {
  if (!file.name.trim()) throw new Error('event_graphics_upload_filename_missing')
  if (!isAcceptedEventGraphicsFile(file, field)) {
    throw new Error(field === 'capture' ? 'event_graphics_capture_file_invalid' : 'event_graphics_audio_file_invalid')
  }
  if (file.size > MAX_NOTION_FILE_UPLOAD_BYTES) {
    throw new Error('event_graphics_upload_file_too_large')
  }

  const api = new NotionApi(env)
  const page = (await api.retrievePage(pageId)) as Record<string, unknown>
  const properties = ((page.properties as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>
  const propertyName = resolveEventGraphicsFilesPropertyName(properties, field)
  const presetPropertyName = resolveEventGraphicsPresetTextPropertyName(field)
  const presetText = serializeRichTextPlainText(properties[presetPropertyName])
  const contentType = file.type || (field === 'capture' ? 'image/png' : 'application/octet-stream')
  const bytes = await file.arrayBuffer()

  const created = await api.createFileUpload(file.name, contentType)
  const fileUploadId = asString((created as Record<string, unknown>)?.id)
  if (!fileUploadId) {
    throw new Error('notion_file_upload_create_failed')
  }

  await api.sendFileUpload(fileUploadId, bytes, file.name, contentType)
  const uploaded = await api.retrieveFileUpload(fileUploadId)
  const status = asString((uploaded as Record<string, unknown>)?.status)
  if (status && status !== 'uploaded') {
    throw new Error('notion_file_upload_send_failed')
  }

  const updateProperties: Record<string, unknown> = {
    [propertyName]: {
      files: [
        {
          name: file.name,
          type: 'file_upload',
          file_upload: { id: fileUploadId },
        },
      ],
    },
  }
  if (isKnownEventGraphicsPresetLabel(field, presetText)) {
    updateProperties[presetPropertyName] = { rich_text: [] }
  }

  await api.updatePage(pageId, {
    properties: updateProperties,
  })

  return {
    propertyName,
    fileName: file.name,
  }
}

export function toEventGraphicsUploadErrorStatus(message: string): number {
  if (
    message === 'event_graphics_upload_field_invalid' ||
    message === 'event_graphics_preset_invalid' ||
    message === 'event_graphics_upload_filename_missing' ||
    message === 'event_graphics_capture_file_invalid' ||
    message === 'event_graphics_audio_file_invalid' ||
    message === 'event_graphics_upload_file_too_large'
  ) {
    return 400
  }

  if (message === 'notion_file_upload_create_failed' || message === 'notion_file_upload_send_failed') {
    return 502
  }

  if (message === 'object_not_found') return 404

  return 500
}

export function normalizeEventGraphicsPresetField(value: string | null | undefined): 'capture' | 'audio' {
  return normalizeEventGraphicsUploadField(value)
}

export function normalizeEventGraphicsPresetEnabled(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

export function normalizeEventGraphicsPresetValue(
  field: 'capture' | 'audio',
  preset: string | null | undefined,
  enabled: boolean,
): 'speaker_ppt' | 'dj_ambient' | 'video_embedded' | 'mic_only' | 'not_applicable' | null {
  const normalized = (preset ?? '').trim().toLowerCase()
  if (!normalized) {
    if (!enabled) return null
    return field === 'capture' ? 'speaker_ppt' : 'dj_ambient'
  }
  if (field === 'capture') {
    if (normalized === 'speaker_ppt') return 'speaker_ppt'
    throw new Error('event_graphics_preset_invalid')
  }
  if (normalized === 'dj_ambient') return 'dj_ambient'
  if (normalized === 'video_embedded') return 'video_embedded'
  if (normalized === 'mic_only') return 'mic_only'
  if (normalized === 'not_applicable') return 'not_applicable' as const
  throw new Error('event_graphics_preset_invalid')
}

export async function updateEventGraphicsPresetOnNotion(
  env: Env,
  pageId: string,
  field: 'capture' | 'audio',
  preset: 'speaker_ppt' | 'dj_ambient' | 'video_embedded' | 'mic_only' | 'not_applicable' | null,
): Promise<{ value: string }> {
  const api = new NotionApi(env)
  const propertyName = field === 'capture' ? EVENT_GRAPHICS_MAIN_SCREEN_FIELD : EVENT_GRAPHICS_AUDIO_TEXT_FIELD
  const value =
    preset === 'speaker_ppt'
      ? EVENT_GRAPHICS_SPEAKER_PPT_LABEL_DISPLAY
      : preset === 'dj_ambient'
        ? EVENT_GRAPHICS_DJ_AMBIENT_LABEL
        : preset === 'video_embedded'
          ? EVENT_GRAPHICS_VIDEO_INCLUDED_LABEL_DISPLAY
          : preset === 'mic_only'
            ? EVENT_GRAPHICS_MIC_ONLY_LABEL_DISPLAY
          : preset === 'not_applicable'
            ? EVENT_GRAPHICS_NOT_APPLICABLE_LABEL_DISPLAY
          : ''

  await api.updatePage(pageId, {
    properties: {
      [propertyName]: {
        rich_text: value ? [{ type: 'text', text: { content: value } }] : [],
      },
    },
  })

  return { value }
}
