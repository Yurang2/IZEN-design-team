import type {
  Env,
} from '../types'
import {
  asString,
  DEFAULT_GEMINI_IMAGE_MODEL,
  GeminiPromptImageRenderInput,
  getGeminiApiKey,
  getGeminiImageModel,
  getVertexAiAccessToken,
  getVertexAiEndpoint,
  GOOGLE_GENERATIVE_LANGUAGE_API_URL,
  hasVertexAiCredentials,
  parsePatchBody,
  ThumbnailInlineImageInput,
  VideoThumbnailRenderInput,
} from '../utils'

export function parseEventGraphicsImportBody(body: unknown): {
  rows: Array<Record<string, unknown>>
} {
  if (Array.isArray(body)) {
    return {
      rows: body.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)),
    }
  }

  const payload = parsePatchBody(body)
  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : null
  if (!rowsRaw) {
    throw new Error('rows_required')
  }

  return {
    rows: rowsRaw.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)),
  }
}

export function parseScreeningPlanImportBody(body: unknown): {
  sourceEventName: string
  targetProjectId: string
} {
  const payload = parsePatchBody(body)
  const sourceEventName = asString(payload.sourceEventName)
  const targetProjectId = asString(payload.targetProjectId)
  if (!sourceEventName) throw new Error('sourceEventName_required')
  if (!targetProjectId) throw new Error('targetProjectId_required')

  return {
    sourceEventName,
    targetProjectId,
  }
}

function parseThumbnailInlineImage(value: unknown): ThumbnailInlineImageInput | null | undefined {
  if (value === null) return null
  if (value === undefined) return undefined
  const payload = parsePatchBody(value)
  const dataUrl = asString(payload.dataUrl)
  const mimeType = asString(payload.mimeType)
  if (!dataUrl || !mimeType) {
    throw new Error('thumbnail_image_invalid')
  }

  return {
    name: asString(payload.name),
    mimeType,
    dataUrl,
  }
}

export function parseVideoThumbnailRenderBody(body: unknown): VideoThumbnailRenderInput {
  const payload = parsePatchBody(body)
  const backgroundImage = parseThumbnailInlineImage(payload.backgroundImage) ?? null
  const styleReferenceImagesRaw = Array.isArray(payload.styleReferenceImages) ? payload.styleReferenceImages : []
  const outputFormatsRaw = Array.isArray(payload.outputFormats) ? payload.outputFormats : []

  return {
    outputSlug: asString(payload.outputSlug) ?? 'video-thumbnail',
    eventName: asString(payload.eventName) ?? '',
    model: asString(payload.model),
    outputFormats: outputFormatsRaw
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean),
    dateText: asString(payload.dateText) ?? '',
    locationText: asString(payload.locationText) ?? '',
    subtitleText: asString(payload.subtitleText) ?? '',
    supportText: asString(payload.supportText) ?? '',
    titleFont: asString(payload.titleFont) ?? '',
    detailFont: asString(payload.detailFont) ?? '',
    fontDirection: asString(payload.fontDirection) ?? '',
    compositionNotes: asString(payload.compositionNotes) ?? '',
    customPrompt: asString(payload.customPrompt) ?? '',
    aspectRatio: asString(payload.aspectRatio) ?? undefined,
    backgroundImage,
    styleReferenceImages: styleReferenceImagesRaw
      .map((entry) => parseThumbnailInlineImage(entry))
      .filter((entry): entry is ThumbnailInlineImageInput => Boolean(entry)),
  }
}

export function parseGeminiPromptImageRenderBody(body: unknown): GeminiPromptImageRenderInput {
  const payload = parsePatchBody(body)
  return {
    prompt: asString(payload.prompt) ?? '',
    model: asString(payload.model) ?? undefined,
    aspectRatio: asString(payload.aspectRatio) ?? undefined,
  }
}

function resolveThumbnailOutputFormats(input: VideoThumbnailRenderInput): string[] {
  const requested = Array.isArray(input.outputFormats) ? input.outputFormats : []
  const normalized = requested.filter((value) => value === '9:16' || value === '16:9')
  if (normalized.length > 0) return Array.from(new Set(normalized))
  if (input.aspectRatio === '9:16' || input.aspectRatio === '16:9') return [input.aspectRatio]
  return ['16:9']
}

function extractGeminiErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'gemini_request_failed'
  const error = (payload as { error?: { message?: unknown } }).error
  const message = error && typeof error === 'object' ? asString((error as { message?: unknown }).message) : undefined
  return message ?? 'gemini_request_failed'
}

async function requestGoogleAiStudioGenerateContent(
  env: Env,
  model: string,
  parts: Array<Record<string, unknown>>,
  generationConfig: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const requestBody = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig,
  })

  let response: Response

  if (hasVertexAiCredentials(env)) {
    const accessToken = await getVertexAiAccessToken(env)
    const endpoint = getVertexAiEndpoint(env, model)
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: requestBody,
    })
  } else {
    const apiKey = getGeminiApiKey(env)
    response = await fetch(`${GOOGLE_GENERATIVE_LANGUAGE_API_URL}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: requestBody,
    })
  }

  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(extractGeminiErrorMessage(payload))
  }
  return payload
}

function parseInlineDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error('thumbnail_image_data_url_invalid')
  const [, mimeType, data] = match
  if (!mimeType.startsWith('image/')) throw new Error('thumbnail_image_mime_invalid')
  return { mimeType, data }
}

function buildVideoThumbnailPrompt(input: VideoThumbnailRenderInput): string {
  const lines = [
    'Create one polished event video thumbnail image.',
    `Target aspect ratio: ${input.aspectRatio || '16:9'}.`,
    'Use the provided background image as the main scene whenever it exists.',
    'Use the style reference images only as style direction, not as literal content to copy.',
    'Make the result look premium, clean, commercial, and readable on mobile.',
    'Keep strong contrast and leave safe margins for text.',
    'Do not invent logos, sponsor marks, or unrelated people.',
  ]

  if (input.eventName) lines.push(`Main title text: ${input.eventName}`)
  if (input.dateText) lines.push(`Date text: ${input.dateText}`)
  if (input.locationText) lines.push(`Location text: ${input.locationText}`)
  if (input.subtitleText) lines.push(`Subtitle text: ${input.subtitleText}`)
  if (input.supportText) lines.push(`Supporting text: ${input.supportText}`)
  if (input.titleFont) lines.push(`Headline font direction: ${input.titleFont}`)
  if (input.detailFont) lines.push(`Supporting font direction: ${input.detailFont}`)
  if (input.fontDirection) lines.push(`Typography and layout notes: ${input.fontDirection}`)
  if (input.compositionNotes) lines.push(`Background/composition notes: ${input.compositionNotes}`)
  if (input.customPrompt) lines.push(`Extra direction: ${input.customPrompt}`)

  lines.push('Return a final thumbnail image.')
  return lines.join('\n')
}

function buildGeminiPromptImagePrompt(input: GeminiPromptImageRenderInput): string {
  const userPrompt = input.prompt.trim()
  if (!userPrompt) throw new Error('prompt_required')

  return [
    'Create one final raster image for quick internal testing.',
    `Target aspect ratio: ${input.aspectRatio || '3:2'}.`,
    'Make the image clean, commercially usable, and visually clear at small size.',
    'Do not add watermarks, borders, UI chrome, or text unless the prompt explicitly asks for text.',
    'Return a single finished image only.',
    `User prompt: ${userPrompt}`,
  ].join('\n')
}

export function toVideoThumbnailErrorStatus(message: string): number {
  if (
    message === 'content_type_must_be_application_json' ||
    message.endsWith('_required') ||
    message.includes('thumbnail_image_invalid') ||
    message.includes('thumbnail_image_data_url_invalid') ||
    message.includes('thumbnail_image_mime_invalid')
  ) {
    return 400
  }

  if (message === 'google_ai_studio_api_key_missing') {
    return 503
  }
  if (message === 'thumbnail_image_missing') return 502
  return 500
}

async function renderVideoThumbnailWithGemini(
  env: Env,
  input: VideoThumbnailRenderInput,
): Promise<{ model: string; imageDataUrl: string; imageMimeType: string; textResponse: string | null }> {
  if (!input.eventName) throw new Error('eventName_required')

  const model = input.model?.trim() || getGeminiImageModel(env)
  const prompt = buildVideoThumbnailPrompt(input)
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]

  if (input.backgroundImage) {
    const background = parseInlineDataUrl(input.backgroundImage.dataUrl)
    parts.push({ text: 'Primary background image to adapt:' })
    parts.push({
      inline_data: {
        mime_type: background.mimeType,
        data: background.data,
      },
    })
  }

  for (const [index, image] of input.styleReferenceImages.entries()) {
    const parsed = parseInlineDataUrl(image.dataUrl)
    parts.push({ text: `Style reference image ${index + 1}:` })
    parts.push({
      inline_data: {
        mime_type: parsed.mimeType,
        data: parsed.data,
      },
    })
  }

  const generationConfig: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
  }
  if (input.aspectRatio) {
    generationConfig.imageConfig = {
      aspectRatio: input.aspectRatio,
    }
  }

  const payload = await requestGoogleAiStudioGenerateContent(env, model, parts, generationConfig)

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  let imageDataUrl: string | null = null
  let imageMimeType: string | null = null
  const textParts: string[] = []

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const content = (candidate as { content?: { parts?: unknown[] } }).content
    const partsList = Array.isArray(content?.parts) ? content.parts : []
    for (const part of partsList) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      const text = asString((part as { text?: unknown }).text)
      if (text) textParts.push(text)

      const inlineData =
        (part as { inlineData?: { mimeType?: unknown; data?: unknown } }).inlineData ??
        (part as { inline_data?: { mime_type?: unknown; data?: unknown } }).inline_data
      if (!inlineData) continue

      const mimeType =
        asString((inlineData as { mimeType?: unknown }).mimeType) ??
        asString((inlineData as { mime_type?: unknown }).mime_type)
      const data = asString((inlineData as { data?: unknown }).data)
      if (!mimeType || !data) continue
      imageDataUrl = `data:${mimeType};base64,${data}`
      imageMimeType = mimeType
      break
    }
    if (imageDataUrl) break
  }

  if (!imageDataUrl || !imageMimeType) throw new Error('thumbnail_image_missing')

  return {
    model,
    imageDataUrl,
    imageMimeType,
    textResponse: textParts.length > 0 ? textParts.join('\n').trim() : null,
  }
}

export async function renderGeminiPromptImage(
  env: Env,
  input: GeminiPromptImageRenderInput,
): Promise<{ model: string; imageDataUrl: string; imageMimeType: string; textResponse: string | null }> {
  const model = input.model?.trim() || DEFAULT_GEMINI_IMAGE_MODEL
  const prompt = buildGeminiPromptImagePrompt(input)
  const parts: Array<Record<string, unknown>> = [{ text: prompt }]

  const generationConfig: Record<string, unknown> = {
    responseModalities: ['TEXT', 'IMAGE'],
    imageConfig: {
      aspectRatio: input.aspectRatio || '3:2',
      imageOutputOptions: {
        mimeType: 'image/jpeg',
        compressionQuality: 65,
      },
    },
  }

  const payload = await requestGoogleAiStudioGenerateContent(env, model, parts, generationConfig)

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  let imageDataUrl: string | null = null
  let imageMimeType: string | null = null
  const textParts: string[] = []

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const content = (candidate as { content?: { parts?: unknown[] } }).content
    const partsList = Array.isArray(content?.parts) ? content.parts : []
    for (const part of partsList) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      const text = asString((part as { text?: unknown }).text)
      if (text) textParts.push(text)

      const inlineData =
        (part as { inlineData?: { mimeType?: unknown; data?: unknown } }).inlineData ??
        (part as { inline_data?: { mime_type?: unknown; data?: unknown } }).inline_data
      if (!inlineData) continue

      const mimeType =
        asString((inlineData as { mimeType?: unknown }).mimeType) ??
        asString((inlineData as { mime_type?: unknown }).mime_type)
      const data = asString((inlineData as { data?: unknown }).data)
      if (!mimeType || !data) continue
      imageDataUrl = `data:${mimeType};base64,${data}`
      imageMimeType = mimeType
      break
    }
    if (imageDataUrl) break
  }

  if (!imageDataUrl || !imageMimeType) throw new Error('thumbnail_image_missing')

  return {
    model,
    imageDataUrl,
    imageMimeType,
    textResponse: textParts.length > 0 ? textParts.join('\n').trim() : null,
  }
}

export async function renderVideoThumbnailVariantsWithGemini(
  env: Env,
  input: VideoThumbnailRenderInput,
): Promise<Array<{ aspectRatio: string; model: string; imageDataUrl: string; imageMimeType: string; textResponse: string | null }>> {
  const formats = resolveThumbnailOutputFormats(input)
  const renders: Array<{ aspectRatio: string; model: string; imageDataUrl: string; imageMimeType: string; textResponse: string | null }> = []

  for (const aspectRatio of formats) {
    const rendered = await renderVideoThumbnailWithGemini(env, {
      ...input,
      aspectRatio,
    })
    renders.push({
      aspectRatio,
      model: rendered.model,
      imageDataUrl: rendered.imageDataUrl,
      imageMimeType: rendered.imageMimeType,
      textResponse: rendered.textResponse,
    })
  }

  return renders
}
