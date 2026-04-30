import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { createSign } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8789)
const ROOT = dirname(fileURLToPath(import.meta.url))
const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || (DEFAULT_MODEL === 'gemini-3.1-flash-image-preview' ? 'global' : 'us-central1')
const MAX_BODY_BYTES = 25 * 1024 * 1024

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
])

let cachedToken = null

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.byteLength
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request_too_large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    request.on('error', reject)
  })
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function loadServiceAccount(inlineOverride) {
  const inline = inlineOverride || process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (inline) return JSON.parse(inline)
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  throw new Error('화면에 Vertex 서비스 계정 JSON을 넣어 주세요.')
}

function signJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )
  const signingInput = `${header}.${payload}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(serviceAccount.private_key, 'base64url')
  return `${signingInput}.${signature}`
}

async function getAccessToken(serviceAccount) {
  const cacheKey = serviceAccount.client_email
  if (cachedToken && cachedToken.cacheKey === cacheKey && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const jwt = signJwt(serviceAccount)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `google_oauth_${response.status}`)
  }

  cachedToken = {
    cacheKey,
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  }
  return cachedToken.value
}

function parseDataUrl(dataUrl, label) {
  const match = String(dataUrl || '').match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error(`${label}_data_url_invalid`)
  if (!match[1].startsWith('image/')) throw new Error(`${label}_mime_invalid`)
  return { mimeType: match[1], data: match[2] }
}

function buildEditPrompt(userPrompt, referenceInstructionRaw = '') {
  const prompt = String(userPrompt || '').trim()
  const referenceInstruction = String(referenceInstructionRaw || '').trim()
  if (!prompt) throw new Error('prompt_required')
  return [
    'Edit the source image using the selection guide image.',
    'The blue overlay in the guide image marks the only area to edit. The blue overlay is an instruction marker, not visual content.',
    'Do not render any blue overlay, white patch, blank patch, transparent patch, or solid rectangle where the marker appears.',
    'If the requested edit removes objects, reconstruct the natural background behind them instead of leaving an empty patch.',
    'Continue the original floor, shadows, reflections, perspective, lighting, texture, and color through the edited area.',
    'Preserve crop, camera angle, perspective, lighting continuity, and all unselected content.',
    'Return one complete final image only. Do not add borders, labels, captions, watermarks, or UI.',
    referenceInstruction,
    `Requested edit: ${prompt}`,
  ].filter(Boolean).join('\n')
}

function extractImage(payload) {
  const text = []
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.text) text.push(part.text)
      const inline = part.inlineData || part.inline_data
      const mimeType = inline?.mimeType || inline?.mime_type
      if (mimeType && inline?.data) {
        return {
          imageDataUrl: `data:${mimeType};base64,${inline.data}`,
          imageMimeType: mimeType,
          textResponse: text.join('\n').trim() || null,
        }
      }
    }
  }
  throw new Error('edited_image_missing')
}

function buildVertexEndpoint(projectId, location, model) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
}

async function renderEdit(input) {
  const serviceAccount = loadServiceAccount(input.serviceAccountJson)
  const projectId = String(input.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || serviceAccount.project_id || '').trim()
  if (!projectId) throw new Error('GOOGLE_CLOUD_PROJECT_ID가 필요합니다.')

  const model = String(input.model || DEFAULT_MODEL).trim()
  const location = String(input.location || DEFAULT_LOCATION).trim()
  const source = parseDataUrl(input.sourceImage?.dataUrl, 'source_image')
  const selectionGuide = parseDataUrl(input.selectionGuideImage?.dataUrl || input.maskImage?.dataUrl, 'selection_guide_image')
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 3) : []
  const accessToken = await getAccessToken(serviceAccount)
  const endpoint = buildVertexEndpoint(projectId, location, model)

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Source image:' },
          { inline_data: { mime_type: source.mimeType, data: source.data } },
          { text: 'Selection guide image. The blue overlay marks the target area; do not render the overlay itself:' },
          { inline_data: { mime_type: selectionGuide.mimeType, data: selectionGuide.data } },
          ...referenceImages.flatMap((image, index) => {
            const reference = parseDataUrl(image?.dataUrl, `reference_image_${index + 1}`)
            return [
              { text: `Reference image ${index + 1}. Use this as visual guidance for the selected area only:` },
              { inline_data: { mime_type: reference.mimeType, data: reference.data } },
            ]
          }),
          { text: buildEditPrompt(input.prompt, input.referenceInstruction) },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: input.aspectRatio || '1:1',
        imageOutputOptions: { mimeType: 'image/png' },
      },
    },
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error?.message || `vertex_${response.status}`)
  }
  return { ok: true, model, location, ...extractImage(payload) }
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const filePath = join(ROOT, safePath)
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    response.writeHead(404)
    response.end('Not found')
    return
  }
  response.writeHead(200, {
    'Content-Type': MIME_TYPES.get(extname(filePath)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  createReadStream(filePath).pipe(response)
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/api/config') {
      json(response, 200, {
        ok: true,
        defaultModel: DEFAULT_MODEL,
        defaultLocation: DEFAULT_LOCATION,
        hasCredentials: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
      })
      return
    }

    if (request.method === 'POST' && request.url === '/api/edit') {
      const body = await readRequestJson(request)
      json(response, 200, await renderEdit(body))
      return
    }

    if (request.method === 'GET') {
      serveStatic(request, response)
      return
    }

    json(response, 405, { ok: false, error: 'method_not_allowed' })
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Nano Banana local editor: http://127.0.0.1:${PORT}`)
})
