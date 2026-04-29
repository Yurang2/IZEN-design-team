const { app, BrowserWindow, ipcMain } = require('electron')
const { createSign } = require('node:crypto')
const { existsSync, readFileSync } = require('node:fs')
const path = require('node:path')

const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'

let win
let cachedToken = null

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

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt(serviceAccount),
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

function buildEditPrompt(userPrompt) {
  const prompt = String(userPrompt || '').trim()
  if (!prompt) throw new Error('prompt_required')
  return [
    'Edit the source image using the selection mask.',
    'Only the white or colored mask area may change. Transparent or black mask areas must remain visually identical.',
    'Preserve crop, camera angle, perspective, lighting continuity, and all unselected content.',
    'Return one complete final image only. Do not add borders, labels, captions, watermarks, or UI.',
    `Requested edit: ${prompt}`,
  ].join('\n')
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

async function renderEdit(input) {
  const serviceAccount = loadServiceAccount(input.serviceAccountJson)
  const projectId = String(input.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || serviceAccount.project_id || '').trim()
  if (!projectId) throw new Error('프로젝트 ID를 입력해 주세요.')

  const model = String(input.model || DEFAULT_MODEL).trim()
  const location = String(input.location || DEFAULT_LOCATION).trim()
  const source = parseDataUrl(input.sourceImage?.dataUrl, 'source_image')
  const mask = parseDataUrl(input.maskImage?.dataUrl, 'mask_image')
  const accessToken = await getAccessToken(serviceAccount)
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Source image:' },
            { inline_data: { mime_type: source.mimeType, data: source.data } },
            { text: 'Selection mask. Edit only selected pixels:' },
            { inline_data: { mime_type: mask.mimeType, data: mask.data } },
            { text: buildEditPrompt(input.prompt) },
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
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error?.message || `vertex_${response.status}`)
  return { ok: true, model, location, ...extractImage(payload) }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Nano Banana Local Editor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

ipcMain.handle('nanobanana:config', () => ({
  ok: true,
  defaultModel: DEFAULT_MODEL,
  defaultLocation: DEFAULT_LOCATION,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
}))

ipcMain.handle('nanobanana:edit', async (_event, input) => renderEdit(input || {}))
