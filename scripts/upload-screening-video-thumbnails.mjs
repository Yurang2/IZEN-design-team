import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const DEFAULT_ENV_PATH = 'worker/.dev.vars'
const DEFAULT_SOURCE_DIR = 'D:\\영상소스보관\\IZEN\\2025 Dental Expo vid'
const DEFAULT_THUMBNAIL_DIR = 'ops/generated/screening-video-thumbnails'
const NOTION_API_BASE = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const NOTION_FILE_UPLOAD_VERSION = '2025-09-03'
const DEFAULT_VIDEO_THUMBNAIL_TIME = '00:00:01.000'
const WINDOWS_FFMPEG_CANDIDATES = [
  'C:\\Program Files\\Storyboarder\\resources\\app.asar.unpacked\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe',
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Program Files\\Adobe\\Adobe Dimension\\ffmpeg.exe',
]

const FIELD = {
  sourceName: '\uBCC0\uD658 \uC804 \uD30C\uC77C\uBA85',
  outputName: '\uBCC0\uD658 \uD6C4 \uD30C\uC77C\uBA85',
  thumbnail: '\uB300\uD45C \uC774\uBBF8\uC9C0',
}

const execFileAsync = promisify(execFile)
let cachedFfmpegPathPromise = null

function parseArgs(argv) {
  const options = {
    envPath: DEFAULT_ENV_PATH,
    sourceDir: DEFAULT_SOURCE_DIR,
    thumbnailDir: DEFAULT_THUMBNAIL_DIR,
    force: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--env') options.envPath = argv[index + 1] ?? options.envPath
    if (value === '--source-dir') options.sourceDir = argv[index + 1] ?? options.sourceDir
    if (value === '--thumbnail-dir') options.thumbnailDir = argv[index + 1] ?? options.thumbnailDir
    if (value === '--force') options.force = true
  }

  return options
}

async function readEnvFile(envPath) {
  const raw = await fs.readFile(envPath, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/g)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    env[key] = value
  }
  return env
}

async function notionRequest(token, pathName, init = {}, notionVersion = NOTION_VERSION) {
  const bodyIsForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const response = await fetch(`${NOTION_API_BASE}${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': notionVersion,
      ...(bodyIsForm ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers ?? {}),
    },
  })

  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`notion_http_${response.status}:${payload?.message ?? text}`)
  }

  return payload
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function findFfmpegPath() {
  if (cachedFfmpegPathPromise) return cachedFfmpegPathPromise

  cachedFfmpegPathPromise = (async () => {
    if (process.env.FFMPEG_PATH && (await pathExists(process.env.FFMPEG_PATH))) {
      return process.env.FFMPEG_PATH
    }

    try {
      const { stdout } = await execFileAsync('where.exe', ['ffmpeg'], { windowsHide: true })
      const resolved = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (resolved) return resolved
    } catch {
      // Fall back to common Windows install paths.
    }

    for (const candidate of WINDOWS_FFMPEG_CANDIDATES) {
      if (await pathExists(candidate)) return candidate
    }

    return null
  })()

  return cachedFfmpegPathPromise
}

async function generateVideoThumbnail(videoPath, thumbnailPath) {
  const ffmpegPath = await findFfmpegPath()
  if (!ffmpegPath) return false

  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-ss', DEFAULT_VIDEO_THUMBNAIL_TIME, '-i', videoPath, '-frames:v', '1', '-update', '1', '-q:v', '2', thumbnailPath],
      { windowsHide: true },
    )
    return await pathExists(thumbnailPath)
  } catch {
    return false
  }
}

function joinRichText(entries) {
  return (entries ?? []).map((entry) => entry?.plain_text ?? '').join('').trim()
}

function readPropertyText(prop) {
  if (!prop || typeof prop !== 'object') return ''
  if (prop.type === 'rich_text') return joinRichText(prop.rich_text)
  if (prop.type === 'title') return joinRichText(prop.title)
  return ''
}

async function createAndUploadFile(token, filename, bytes, contentType) {
  const created = await notionRequest(
    token,
    '/file_uploads',
    {
      method: 'POST',
      body: JSON.stringify({
        mode: 'single_part',
        filename,
        content_type: contentType,
      }),
    },
    NOTION_FILE_UPLOAD_VERSION,
  )

  const fileUploadId = created?.id
  if (!fileUploadId) throw new Error('notion_file_upload_create_failed')

  const form = new FormData()
  const blob = new Blob([bytes], { type: contentType })
  form.append('file', blob, filename)

  await notionRequest(
    token,
    `/file_uploads/${encodeURIComponent(fileUploadId)}/send`,
    {
      method: 'POST',
      body: form,
    },
    NOTION_FILE_UPLOAD_VERSION,
  )

  const uploaded = await notionRequest(token, `/file_uploads/${encodeURIComponent(fileUploadId)}`, undefined, NOTION_FILE_UPLOAD_VERSION)
  if (uploaded?.status && uploaded.status !== 'uploaded') {
    throw new Error('notion_file_upload_send_failed')
  }

  return {
    name: filename,
    type: 'file_upload',
    file_upload: { id: fileUploadId },
  }
}

async function listVideoFiles(rootDirectory) {
  const entries = await fs.readdir(rootDirectory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && /\.mp4$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(rootDirectory, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const fileEnv = await readEnvFile(options.envPath)
  const env = { ...fileEnv, ...process.env }
  const notionToken = env.NOTION_TOKEN
  const screeningVideoDbId = env.NOTION_SCREENING_HISTORY_DB_ID || env.NOTION_SCREENING_VIDEO_DB_ID

  if (!notionToken) throw new Error('NOTION_TOKEN_missing')
  if (!screeningVideoDbId) throw new Error('NOTION_SCREENING_HISTORY_DB_ID_missing')
  if (!(await pathExists(options.sourceDir))) throw new Error(`source_dir_missing:${options.sourceDir}`)

  await fs.mkdir(options.thumbnailDir, { recursive: true })

  const query = await notionRequest(notionToken, `/databases/${screeningVideoDbId}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100 }),
  })

  const pageBySourceName = new Map()
  for (const page of query.results ?? []) {
    const sourceName = readPropertyText(page?.properties?.[FIELD.sourceName])
    if (sourceName) pageBySourceName.set(sourceName, page)
  }

  const videoFiles = await listVideoFiles(options.sourceDir)
  let updated = 0
  let skipped = 0
  const skippedItems = []

  for (const file of videoFiles) {
    const page = pageBySourceName.get(file.name)
    if (!page) {
      skipped += 1
      skippedItems.push({ file: file.name, reason: 'db_row_not_found' })
      continue
    }

    const existingFiles = page?.properties?.[FIELD.thumbnail]?.files ?? []
    if (!options.force && existingFiles.length > 0) {
      skipped += 1
      skippedItems.push({ file: file.name, reason: 'thumbnail_already_exists' })
      continue
    }

    const thumbnailFilename = `${path.basename(file.name, path.extname(file.name))}.jpg`
    const thumbnailPath = path.join(options.thumbnailDir, thumbnailFilename)
    const generated = await generateVideoThumbnail(file.fullPath, thumbnailPath)
    if (!generated) {
      skipped += 1
      skippedItems.push({ file: file.name, reason: 'thumbnail_generation_failed' })
      continue
    }

    const bytes = await fs.readFile(thumbnailPath)
    const fileUploadRef = await createAndUploadFile(notionToken, thumbnailFilename, bytes, 'image/jpeg')
    await notionRequest(notionToken, `/pages/${page.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: {
          [FIELD.thumbnail]: {
            files: [fileUploadRef],
          },
        },
      }),
    })

    updated += 1
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourceDir: options.sourceDir,
        updated,
        skipped,
        total: videoFiles.length,
        skippedItems,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
