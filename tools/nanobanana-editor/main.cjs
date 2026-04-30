const { app, BrowserWindow, ipcMain } = require('electron')
const { createSign } = require('node:crypto')
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')

const DEFAULT_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview'
const DEFAULT_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || (DEFAULT_MODEL === 'gemini-3.1-flash-image-preview' ? 'global' : 'us-central1')

let win
let cachedToken = null

function configureAppStorage() {
  const roamingAppData = process.env.APPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Roaming')
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local')
  const storageRoot = path.join(roamingAppData, 'izen-nanobanana-editor')
  const localRoot = path.join(localAppData, 'IZEN', 'NanoBananaEditor')
  const sessionRoot = path.join(localRoot, 'Session')
  const cacheRoot = path.join(localRoot, 'Cache')
  mkdirSync(storageRoot, { recursive: true })
  mkdirSync(sessionRoot, { recursive: true })
  mkdirSync(cacheRoot, { recursive: true })
  app.setName('izen-nanobanana-editor')
  app.setPath('userData', storageRoot)
  app.setPath('sessionData', sessionRoot)
  app.commandLine.appendSwitch('disk-cache-dir', cacheRoot)
}

configureAppStorage()

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

function safeName(value) {
  return String(value || 'image')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

function historyRoot() {
  const root = path.join(app.getPath('userData'), 'history')
  mkdirSync(root, { recursive: true })
  return root
}

function historyRoots() {
  const roots = [historyRoot()]
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local')
  roots.push(path.join(localAppData, 'IZEN', 'NanoBananaEditor', 'history'))
  return [...new Set(roots)].filter((root) => existsSync(root))
}

function writeDataUrl(filePath, dataUrl, label) {
  const parsed = parseDataUrl(dataUrl, label)
  writeFileSync(filePath, Buffer.from(parsed.data, 'base64'))
}

function readDataUrlIfExists(filePath, mimeType = 'image/png') {
  if (!existsSync(filePath)) return null
  return `data:${mimeType};base64,${readFileSync(filePath).toString('base64')}`
}

function readResultDataUrls(dir) {
  const results = []
  const first = readDataUrlIfExists(path.join(dir, 'result.png'))
  if (first) results.push(first)
  for (let index = 2; ; index += 1) {
    const next = readDataUrlIfExists(path.join(dir, `result-${index}.png`))
    if (!next) break
    results.push(next)
  }
  return results
}

function createHistoryJob(input) {
  const now = new Date()
  const id = `${now.toISOString().replace(/[:.]/g, '-')}-${safeName(input.sourceImage?.name)}`
  const dir = path.join(historyRoot(), id)
  mkdirSync(dir, { recursive: true })
  writeDataUrl(path.join(dir, 'source.png'), input.sourceImage?.dataUrl, 'source_image')
  writeDataUrl(path.join(dir, 'mask.png'), input.maskImage?.dataUrl, 'mask_image')
  if (input.selectionGuideImage?.dataUrl) {
    writeDataUrl(path.join(dir, 'guide.png'), input.selectionGuideImage.dataUrl, 'selection_guide_image')
  }
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 3) : []
  referenceImages.forEach((image, index) => {
    writeDataUrl(path.join(dir, `reference-${index + 1}.png`), image?.dataUrl, `reference_image_${index + 1}`)
  })
  const job = {
    id,
    dir,
    status: 'running',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    sourceName: input.sourceImage?.name || 'image.png',
    width: input.sourceImage?.width || null,
    height: input.sourceImage?.height || null,
    prompt: input.prompt || '',
    model: input.model || DEFAULT_MODEL,
    location: input.location || DEFAULT_LOCATION,
    referenceCount: referenceImages.length,
  }
  writeFileSync(path.join(dir, 'job.json'), JSON.stringify(job, null, 2), 'utf8')
  return job
}

function updateHistoryJob(job, patch) {
  const next = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(path.join(job.dir, 'job.json'), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function listHistoryJobs() {
  return historyRoots()
    .flatMap((root) => readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
      const dir = path.join(root, entry.name)
      const jobPath = path.join(dir, 'job.json')
      if (!existsSync(jobPath)) return null
      try {
        const job = JSON.parse(readFileSync(jobPath, 'utf8'))
        return {
          ...job,
          sourceDataUrl: readDataUrlIfExists(path.join(dir, 'source.png')),
          maskDataUrl: readDataUrlIfExists(path.join(dir, 'mask.png')),
          resultDataUrl: readDataUrlIfExists(path.join(dir, 'result.png')),
          resultDataUrls: readResultDataUrls(dir),
        }
      } catch {
        return null
      }
    }))
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
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

function extractImages(payload) {
  const text = []
  const imageDataUrls = []
  let imageMimeType = null
  for (const candidate of payload.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.text) text.push(part.text)
      const inline = part.inlineData || part.inline_data
      const mimeType = inline?.mimeType || inline?.mime_type
      if (mimeType && inline?.data) {
        imageMimeType ||= mimeType
        imageDataUrls.push(`data:${mimeType};base64,${inline.data}`)
      }
    }
  }
  if (imageDataUrls.length) {
    return {
      imageDataUrl: imageDataUrls[0],
      imageDataUrls,
      imageMimeType,
      textResponse: text.join('\n').trim() || null,
    }
  }
  throw new Error('edited_image_missing')
}

function buildVertexEndpoint(projectId, location, model) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  return `https://${host}/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodeURIComponent(model)}:generateContent`
}

async function renderEdit(input) {
  const historyJob = createHistoryJob(input)
  const serviceAccount = loadServiceAccount(input.serviceAccountJson)
  const projectId = String(input.projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || serviceAccount.project_id || '').trim()
  if (!projectId) throw new Error('프로젝트 ID를 입력해 주세요.')

  const model = String(input.model || DEFAULT_MODEL).trim()
  const location = String(input.location || DEFAULT_LOCATION).trim()
  const source = parseDataUrl(input.sourceImage?.dataUrl, 'source_image')
  const selectionGuide = parseDataUrl(input.selectionGuideImage?.dataUrl || input.maskImage?.dataUrl, 'selection_guide_image')
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages.slice(0, 3) : []
  const accessToken = await getAccessToken(serviceAccount)
  const endpoint = buildVertexEndpoint(projectId, location, model)

  try {
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
      }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error?.message || `vertex_${response.status}`)
    const extracted = extractImages(payload)
    extracted.imageDataUrls.forEach((dataUrl, index) => {
      const fileName = index === 0 ? 'result.png' : `result-${index + 1}.png`
      writeDataUrl(path.join(historyJob.dir, fileName), dataUrl, `result_image_${index + 1}`)
    })
    updateHistoryJob(historyJob, { status: 'done', model, location, resultCount: extracted.imageDataUrls.length })
    return { ok: true, historyId: historyJob.id, historyDir: historyJob.dir, model, location, ...extracted }
  } catch (error) {
    updateHistoryJob(historyJob, { status: 'error', error: error instanceof Error ? error.message : 'unknown_error' })
    throw error
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1920,
    height: 1080,
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

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(createWindow)
}
app.on('window-all-closed', () => app.quit())

ipcMain.handle('nanobanana:config', () => ({
  ok: true,
  defaultModel: DEFAULT_MODEL,
  defaultLocation: DEFAULT_LOCATION,
  hasCredentials: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS),
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  historyDir: historyRoot(),
}))

ipcMain.handle('nanobanana:edit', async (_event, input) => renderEdit(input || {}))
ipcMain.handle('nanobanana:history', () => listHistoryJobs())
