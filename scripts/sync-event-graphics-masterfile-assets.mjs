import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_MASTERFILE_ROOT = 'files/2026 IZEN Seminar in Bangkok Masterfile'
const DEFAULT_PUBLIC_ROOT = 'public/event-graphics-registered/bangkok'
const DEFAULT_OUTPUT = 'src/features/eventGraphics/generatedMasterfileManifest.ts'
const VIDEO_THUMBNAIL_EXTENSION = '.jpg'
const DEFAULT_VIDEO_THUMBNAIL_TIME = '00:00:01.000'
const VIDEO_THUMBNAIL_TIME_BY_BASENAME = {
  V_Q02_Opening: '00:00:15.000',
  'IZEN Seminar_LunchLoop_1008x432': '00:00:05.000',
  'IZEN Seminar_Showroom_1008x432': '00:00:05.000',
}
const WINDOWS_FFMPEG_CANDIDATES = [
  'C:\\Program Files\\Storyboarder\\resources\\app.asar.unpacked\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe',
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video\\ffmpeg.exe',
  'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
  'C:\\Program Files\\Adobe\\Adobe Dimension\\ffmpeg.exe',
]

const LEGACY_CUES_DIR = '02_Cues'
const LEGACY_SHARED_DIR = '02_Shared'
const LEGACY_Q_FILES_DIR = '03_Q_Files'
const ASSETS_DIR = '02_Files'
const SOURCE_DIR = '01_Source'
const ENTRANCE_LABEL = '입장'
const MISSING_FILE_LABEL = '파일명 확인 필요'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.wmv', '.mkv'])
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.aif', '.aiff', '.ogg', '.flac'])
const execFileAsync = promisify(execFile)
let cachedFfmpegPathPromise = null

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    masterfileRoot: DEFAULT_MASTERFILE_ROOT,
    publicRoot: DEFAULT_PUBLIC_ROOT,
    output: DEFAULT_OUTPUT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--masterfile-root') options.masterfileRoot = argv[index + 1] ?? options.masterfileRoot
    if (value === '--public-root') options.publicRoot = argv[index + 1] ?? options.publicRoot
    if (value === '--output') options.output = argv[index + 1] ?? options.output
  }

  return options
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRow(rawRow) {
  return {
    rowTitle: normalizeText(rawRow['행 제목']),
    eventName: normalizeText(rawRow['행사명']),
    eventDate: normalizeText(rawRow['행사일']),
    cueOrder:
      Number.isFinite(Number(rawRow['정렬 순서'])) ? Number(rawRow['정렬 순서']) :
      Number.isFinite(Number(rawRow['Cue 순서'])) ? Number(rawRow['Cue 순서']) :
      Number.isFinite(Number(rawRow['운영 순서'])) ? Number(rawRow['운영 순서']) : null,
    cueType: normalizeText(rawRow['카테고리'] ?? rawRow['Cue 유형']),
    cueTitle: normalizeText(rawRow['Cue 제목']),
    startTime: normalizeText(rawRow['시작 시각']),
    endTime: normalizeText(rawRow['종료 시각']),
    runtimeMinutes: Number.isFinite(Number(rawRow['러닝타임(분)'])) ? Number(rawRow['러닝타임(분)']) : null,
    personnel: normalizeText(rawRow['무대 인원']),
    mainScreen: normalizeText(rawRow['메인 화면'] ?? rawRow['그래픽 자산명'] ?? rawRow['원본 Video']),
    sourceAudio: normalizeText(rawRow['오디오'] ?? rawRow['원본 Audio']),
    sourceRemark: normalizeText(rawRow['운영 메모'] ?? rawRow['업체 전달 메모'] ?? rawRow['원본 비고']),
    graphicType: normalizeText(rawRow['운영 액션'] ?? rawRow['그래픽 형식']),
    previewLink: normalizeText(rawRow['미리보기 링크']),
    assetLink: normalizeText(rawRow['자산 링크']),
    status: normalizeText(rawRow['상태']),
    vendorNote: normalizeText(rawRow['운영 메모'] ?? rawRow['업체 전달 메모'] ?? rawRow['원본 비고']),
  }
}

function sanitizeSegment(value) {
  return String(value ?? '')
    .replace(/&/g, 'And')
    .replace(/[\\/:"*?<>|]+/g, ' ')
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function splitSourceCandidates(value) {
  return normalizeText(value)
    .split('/')
    .map((item) => item.trim())
    .filter(Boolean)
}

function stripKnownExtension(value) {
  return value.replace(/\.(png|jpg|jpeg|gif|webp|bmp|svg|mp4|mov|m4v|avi|wmv|mkv|wav|mp3|m4a|aac|aif|aiff|ogg|flac)$/i, '')
}

function toSourceSlug(value) {
  const primary = splitSourceCandidates(value)[0] ?? value
  return sanitizeSegment(stripKnownExtension(primary))
}

function looksLikeVideoAsset(value) {
  return /\.(mp4|mov|m4v|avi|wmv|mkv)\b/i.test(value) || /\bvideo\b/i.test(value)
}

function looksLikeLoopInstruction(value) {
  return /\bloop\b/i.test(value)
}

function toPrimaryAsset(row) {
  if (row.mainScreen && row.mainScreen !== '-') return row.mainScreen
  if (row.sourceAudio) return row.sourceAudio
  return MISSING_FILE_LABEL
}

function toCueNumber(value) {
  const numeric = value == null ? Number.NaN : Math.round(value)
  return Number.isFinite(numeric) ? `Q${String(numeric).padStart(2, '0')}` : 'Q--'
}

function toRuntimeLabel(value) {
  return value != null ? `${value} min` : '-'
}

function isEntranceRow(row) {
  if (row.cueTitle === ENTRANCE_LABEL) return true
  return row.cueType === 'other' && row.cueOrder != null && !Number.isInteger(row.cueOrder)
}

function canMergeEntranceWithMainRow(entranceRow, mainRow) {
  if (!mainRow) return false
  if (!isEntranceRow(entranceRow)) return false
  if (!['opening', 'lecture'].includes(mainRow.cueType)) return false
  if (entranceRow.eventName !== mainRow.eventName) return false
  if (entranceRow.cueOrder == null || mainRow.cueOrder == null) return false
  return Math.ceil(entranceRow.cueOrder) === Math.round(mainRow.cueOrder)
}

function joinSummary(parts) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}

function buildExpectedSlots(cue) {
  const slots = []

  if (cue.startGraphic && cue.startGraphic !== MISSING_FILE_LABEL) {
    slots.push({
      kind: looksLikeVideoAsset(cue.startGraphic) ? 'video' : 'image',
      role: cue.nextGraphic || cue.nextAudio ? 'Primary Graphic' : 'Main Graphic',
      label: cue.nextGraphic || cue.nextAudio ? 'Primary Graphic' : 'Main Graphic',
      sourceName: cue.startGraphic,
    })
  }

  if (cue.nextGraphic && cue.nextGraphic !== MISSING_FILE_LABEL) {
    slots.push({
      kind: looksLikeVideoAsset(cue.nextGraphic) ? 'video' : 'image',
      role: 'Secondary Graphic',
      label: 'Secondary Graphic',
      sourceName: cue.nextGraphic,
    })
  }

  if (cue.startAudio) {
    slots.push({
      kind: 'audio',
      role: cue.nextGraphic || cue.nextAudio ? 'Primary Audio' : 'Main Audio',
      label: cue.nextGraphic || cue.nextAudio ? 'Primary Audio' : 'Main Audio',
      sourceName: cue.startAudio,
    })
  }

  if (cue.nextAudio) {
    slots.push({
      kind: 'audio',
      role: 'Secondary Audio',
      label: 'Secondary Audio',
      sourceName: cue.nextAudio,
    })
  }

  return slots
}

function buildMergedVendorCue(entranceRow, mainRow) {
  const runtimeMinutes = (entranceRow.runtimeMinutes ?? 0) + (mainRow.runtimeMinutes ?? 0)
  const cueNumber = toCueNumber(mainRow.cueOrder)

  return {
    cueNumber,
    cueType: mainRow.cueType,
    title: mainRow.cueTitle,
    eventName: mainRow.eventName,
    startTime: entranceRow.startTime,
    endTime: mainRow.endTime,
    runtimeLabel: toRuntimeLabel(runtimeMinutes),
    personnel: mainRow.personnel,
    startGraphic: toPrimaryAsset(entranceRow),
    startAudio: entranceRow.sourceAudio,
    nextGraphic: toPrimaryAsset(mainRow),
    nextAudio: mainRow.sourceAudio,
    note: joinSummary([entranceRow.sourceRemark, mainRow.sourceRemark, mainRow.vendorNote]),
  }
}

function buildSingleVendorCue(row) {
  const cueNumber = toCueNumber(row.cueOrder)
  return {
    cueNumber,
    cueType: row.cueType,
    title: row.cueTitle,
    eventName: row.eventName,
    startTime: row.startTime,
    endTime: row.endTime,
    runtimeLabel: toRuntimeLabel(row.runtimeMinutes),
    personnel: row.personnel,
    startGraphic: toPrimaryAsset(row),
    startAudio: row.sourceAudio,
    nextGraphic: '',
    nextAudio: '',
    note: joinSummary([row.sourceRemark, row.vendorNote]),
  }
}

function buildVendorCues(rows) {
  const cues = []

  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    const next = rows[index + 1]

    if (canMergeEntranceWithMainRow(current, next)) {
      cues.push(buildMergedVendorCue(current, next))
      index += 1
      continue
    }

    if (isEntranceRow(current)) continue
    cues.push(buildSingleVendorCue(current))
  }

  return cues
}

function detectKindByExtension(filename) {
  const extension = path.extname(filename).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  return 'other'
}

function defaultExtensionForKind(kind) {
  if (kind === 'image') return '.png'
  if (kind === 'video') return '.mp4'
  if (kind === 'audio') return '.wav'
  return ''
}

function deriveExtension(slot, file) {
  if (file?.extension) return file.extension.toLowerCase()
  const candidates = splitSourceCandidates(slot.sourceName)
  for (const candidate of candidates) {
    const extension = path.extname(candidate).toLowerCase()
    if (extension) return extension
  }
  return defaultExtensionForKind(slot.kind)
}

function buildFilePrefix(kind) {
  if (kind === 'image') return 'I'
  if (kind === 'video') return 'V'
  if (kind === 'audio') return 'A'
  return 'F'
}

function buildSharedFilename(slot, extension) {
  return `${buildFilePrefix(slot.kind)}_${toSourceSlug(slot.sourceName) || sanitizeSegment(slot.label)}${extension}`
}

function buildCueFilename(cue, slot, extension, index) {
  const suffix = index > 0 ? `_Extra${String(index).padStart(2, '0')}` : ''
  return `${buildFilePrefix(slot.kind)}_${cue.cueNumber}_${sanitizeSegment(cue.title)}${suffix}${extension}`
}

function buildSharedKey(slot) {
  return `${slot.kind}::${toSourceSlug(slot.sourceName)}`
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true })
}

async function clearDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true })
  await fs.mkdir(directory, { recursive: true })
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
      // Fall through to common Windows install paths.
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
  const videoBasename = path.basename(videoPath, path.extname(videoPath))
  const thumbnailTime = VIDEO_THUMBNAIL_TIME_BY_BASENAME[videoBasename] ?? DEFAULT_VIDEO_THUMBNAIL_TIME

  try {
    await execFileAsync(
      ffmpegPath,
      ['-y', '-ss', thumbnailTime, '-i', videoPath, '-frames:v', '1', '-update', '1', '-q:v', '2', thumbnailPath],
      { windowsHide: true },
    )
    return await pathExists(thumbnailPath)
  } catch {
    return false
  }
}

async function listMediaFiles(rootDirectory) {
  if (!(await pathExists(rootDirectory))) return []

  const mediaFiles = []

  async function walk(currentDirectory) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.toLowerCase() === 'readme.txt') continue

      const kind = detectKindByExtension(entry.name)
      if (kind === 'other') continue

      mediaFiles.push({
        fullPath,
        name: entry.name,
        extension: path.extname(entry.name),
        kind,
        relativePath: path.relative(rootDirectory, fullPath),
      })
    }
  }

  await walk(rootDirectory)
  return mediaFiles.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en'))
}

function belongsToCue(file, cue) {
  const normalizedPath = file.relativePath.replace(/\\/g, '/')
  const normalizedName = file.name.toLowerCase()
  const cueToken = cue.cueNumber.toLowerCase()
  if (normalizedPath.startsWith(`${LEGACY_CUES_DIR}/${cue.cueNumber}_`)) return true
  if (normalizedName.includes(`_${cueToken}_`)) return true
  return false
}

function scoreSharedMatch(file, slot) {
  const stem = sanitizeSegment(stripKnownExtension(path.basename(file.name, file.extension)))
  const sourceSlug = toSourceSlug(slot.sourceName)
  let score = 0
  if (stem.includes(sourceSlug) && sourceSlug) score += 10
  const normalizedPath = file.relativePath.replace(/\\/g, '/')
  if (normalizedPath.startsWith(`${LEGACY_SHARED_DIR}/`)) score += 5
  if (normalizedPath.startsWith(`${ASSETS_DIR}/`) && !file.name.toLowerCase().includes('_q')) score += 4
  return score
}

function scoreCueMatch(file, cue, slot) {
  const normalizedPath = file.relativePath.replace(/\\/g, '/')
  const normalizedName = file.name.toLowerCase()
  const sourceSlug = toSourceSlug(slot?.sourceName ?? '')
  const cueTitleSlug = sanitizeSegment(cue.title)
  const stem = sanitizeSegment(stripKnownExtension(path.basename(file.name, file.extension)))
  let score = 0
  if (normalizedPath.startsWith(`${LEGACY_CUES_DIR}/${cue.cueNumber}_`)) score += 12
  if (normalizedPath.startsWith(`${LEGACY_Q_FILES_DIR}/`) && normalizedName.includes(`_${cue.cueNumber.toLowerCase()}_`)) score += 10
  if (normalizedPath.startsWith(`${ASSETS_DIR}/`) && normalizedName.includes(`_${cue.cueNumber.toLowerCase()}_`)) score += 9
  if (normalizedName.includes(`_${cue.cueNumber.toLowerCase()}_`)) score += 8
  if (cueTitleSlug && stem.includes(cueTitleSlug)) score += 7
  if (sourceSlug && stem.includes(sourceSlug)) score += 7
  return score
}

async function moveFile(sourcePath, destinationPath) {
  if (path.resolve(sourcePath) === path.resolve(destinationPath)) return
  await ensureDirectory(path.dirname(destinationPath))
  const tempPath = path.join(path.dirname(sourcePath), `.__move_${Date.now()}_${path.basename(sourcePath)}`)
  await fs.rename(sourcePath, tempPath)
  await fs.rename(tempPath, destinationPath)
}

async function writeStructureReadmes(masterfileRoot, eventName) {
  const rootReadme = [
    `Event: ${eventName}`,
    'Package Type: Flat vendor package',
    '',
    'Structure',
    '- 00_README.txt: package overview',
    '- 01_Source: source workbook reference',
    '- 02_Files: all delivery image/audio/video assets in one folder',
    '',
    'Rules',
    '- All delivery assets live in 02_Files.',
    '- Repeated assets may omit Q-number and use a generic file name.',
    '- Cue-specific assets use Q-number prefix.',
    '- File names do not use Start / Then suffixes.',
    '',
  ].join('\n')

  const filesReadme = [
    'Delivery Assets',
    '- Put all final media files in this folder.',
    '- Cue-specific file name format: [I|V|A]_Q##_Cue_Title.ext',
    '- Repeated asset file name format: [I|V|A]_Asset_Name.ext',
    '',
  ].join('\n')

  await fs.writeFile(path.join(masterfileRoot, '00_README.txt'), `${rootReadme}\n`, 'utf8')
  await ensureDirectory(path.join(masterfileRoot, SOURCE_DIR))
  await ensureDirectory(path.join(masterfileRoot, ASSETS_DIR))
  await fs.writeFile(path.join(masterfileRoot, SOURCE_DIR, 'README.txt'), 'Source workbook reference only.\n', 'utf8')
  await fs.writeFile(path.join(masterfileRoot, ASSETS_DIR, 'README.txt'), `${filesReadme}\n`, 'utf8')
}

function buildManifestModule(manifest) {
  return `export const bangkokMasterfileManifest = ${JSON.stringify(manifest, null, 2)} as const\n`
}

function buildPublicAssetUrl(filename) {
  return `/${path.posix.join('event-graphics-registered', 'bangkok', filename)}`
}

function buildPreviewUrl(file) {
  if (!file) return null
  if (file.kind === 'video') {
    return buildPublicAssetUrl(`${path.basename(file.name, path.extname(file.name))}${VIDEO_THUMBNAIL_EXTENSION}`)
  }
  if (file.kind === 'image') return buildPublicAssetUrl(file.name)
  return null
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')

  const rows = sourceRows.map(normalizeRow)
  const cues = buildVendorCues(rows)
  const cuesWithSlots = cues.map((cue) => ({ ...cue, expectedSlots: buildExpectedSlots(cue) }))
  const allSlots = cuesWithSlots.flatMap((cue) => cue.expectedSlots)
  const sharedCounts = new Map()

  for (const slot of allSlots) {
    const sharedKey = buildSharedKey(slot)
    if (!toSourceSlug(slot.sourceName)) continue
    sharedCounts.set(sharedKey, (sharedCounts.get(sharedKey) ?? 0) + 1)
  }

  await ensureDirectory(options.masterfileRoot)
  await writeStructureReadmes(options.masterfileRoot, cuesWithSlots[0]?.eventName ?? '2026 IZEN Seminar in Bangkok')

  const inventory = await listMediaFiles(options.masterfileRoot)
  const consumedPaths = new Set()
  const sharedAssignments = new Map()
  const publicCopies = new Map()
  const syncedCues = []
  await clearDirectory(options.publicRoot)

  for (const cue of cuesWithSlots) {
    const registeredFiles = []
    const missingFiles = []
    const cueKindCounts = new Map()
    const cueCandidates = inventory
      .filter((file) => !consumedPaths.has(file.fullPath) && belongsToCue(file, cue))
      .sort(
        (left, right) => scoreCueMatch(right, cue, cue.expectedSlots[0]) - scoreCueMatch(left, cue, cue.expectedSlots[0]) || left.name.localeCompare(right.name, 'en'),
      )

    for (const slot of cue.expectedSlots) {
      const isShared = (sharedCounts.get(buildSharedKey(slot)) ?? 0) > 1
      const extensionFromAssigned = sharedAssignments.get(buildSharedKey(slot))?.extension ?? ''
      const extension = extensionFromAssigned || deriveExtension(slot, cueCandidates.find((file) => file.kind === slot.kind))

      if (isShared) {
        const sharedKey = buildSharedKey(slot)
        const existingShared = sharedAssignments.get(sharedKey)
        if (existingShared) {
          registeredFiles.push(existingShared.registeredFile)
          continue
        }

        const matchingSharedCandidate = inventory
          .filter((file) => !consumedPaths.has(file.fullPath) && file.kind === slot.kind)
          .sort((left, right) => scoreSharedMatch(right, slot) - scoreSharedMatch(left, slot) || left.name.localeCompare(right.name, 'en'))
          .find((file) => scoreSharedMatch(file, slot) > 0)
        const fallbackCueCandidateIndex = cueCandidates.findIndex((file) => file.kind === slot.kind)
        const actualFile =
          matchingSharedCandidate ??
          (fallbackCueCandidateIndex >= 0 ? cueCandidates.splice(fallbackCueCandidateIndex, 1)[0] : null)

        if (!actualFile) {
          missingFiles.push({
            kind: slot.kind,
            label: slot.label,
            sourceName: slot.sourceName,
          })
          continue
        }

        const destinationName = buildSharedFilename(slot, extension)
        const destinationPath = path.join(options.masterfileRoot, ASSETS_DIR, destinationName)
        await moveFile(actualFile.fullPath, destinationPath)
        consumedPaths.add(actualFile.fullPath)

        const relativePath = path.posix.join('files', '2026 IZEN Seminar in Bangkok Masterfile', ASSETS_DIR, destinationName)
        const registeredFile = {
          name: destinationName,
          kind: slot.kind,
          role: slot.label,
          sourceName: slot.sourceName,
          relativePath,
        }

        if ((slot.kind === 'image' || slot.kind === 'video') && !publicCopies.has(destinationName)) {
          if (slot.kind === 'image') {
            const publicPath = path.join(options.publicRoot, destinationName)
            await fs.copyFile(destinationPath, publicPath)
            publicCopies.set(destinationName, buildPublicAssetUrl(destinationName))
          } else {
            const thumbnailPath = path.join(options.publicRoot, `${path.basename(destinationName, path.extname(destinationName))}${VIDEO_THUMBNAIL_EXTENSION}`)
            await generateVideoThumbnail(destinationPath, thumbnailPath)
            publicCopies.set(destinationName, buildPublicAssetUrl(path.basename(thumbnailPath)))
          }
        }

        sharedAssignments.set(sharedKey, {
          extension,
          registeredFile,
          previewUrl: buildPreviewUrl(registeredFile),
        })
        registeredFiles.push(registeredFile)
        continue
      }

      const cueCandidateIndex = cueCandidates.findIndex((file) => file.kind === slot.kind)
      const fallbackInventoryCandidate = inventory
        .filter((file) => !consumedPaths.has(file.fullPath) && file.kind === slot.kind)
        .sort((left, right) => scoreCueMatch(right, cue, slot) - scoreCueMatch(left, cue, slot) || left.name.localeCompare(right.name, 'en'))
        .find((file) => scoreCueMatch(file, cue, slot) > 0)
      const actualFile = cueCandidateIndex >= 0 ? cueCandidates.splice(cueCandidateIndex, 1)[0] : fallbackInventoryCandidate ?? null
      if (!actualFile) {
        missingFiles.push({
          kind: slot.kind,
          label: slot.label,
          sourceName: slot.sourceName,
        })
        continue
      }

      const currentCount = cueKindCounts.get(slot.kind) ?? 0
      cueKindCounts.set(slot.kind, currentCount + 1)
      const destinationName = buildCueFilename(cue, slot, extension, currentCount)
      const destinationPath = path.join(options.masterfileRoot, ASSETS_DIR, destinationName)
      await moveFile(actualFile.fullPath, destinationPath)
      consumedPaths.add(actualFile.fullPath)

      const relativePath = path.posix.join('files', '2026 IZEN Seminar in Bangkok Masterfile', ASSETS_DIR, destinationName)
      registeredFiles.push({
        name: destinationName,
        kind: slot.kind,
        role: slot.label,
        sourceName: slot.sourceName,
        relativePath,
      })

      if ((slot.kind === 'image' || slot.kind === 'video') && !publicCopies.has(destinationName)) {
        if (slot.kind === 'image') {
          const publicPath = path.join(options.publicRoot, destinationName)
          await fs.copyFile(destinationPath, publicPath)
          publicCopies.set(destinationName, buildPublicAssetUrl(destinationName))
        } else {
          const thumbnailPath = path.join(options.publicRoot, `${path.basename(destinationName, path.extname(destinationName))}${VIDEO_THUMBNAIL_EXTENSION}`)
          await generateVideoThumbnail(destinationPath, thumbnailPath)
          publicCopies.set(destinationName, buildPublicAssetUrl(path.basename(thumbnailPath)))
        }
      }
    }

    const previewFile = registeredFiles.find((file) => file.kind === 'image') ?? registeredFiles.find((file) => file.kind === 'video')

    syncedCues.push({
      cueNumber: cue.cueNumber,
      title: cue.title,
      cueType: cue.cueType,
      eventName: cue.eventName,
      storageGroup: ASSETS_DIR,
      startTime: cue.startTime,
      endTime: cue.endTime,
      runtimeLabel: cue.runtimeLabel,
      personnel: cue.personnel,
      registeredFiles,
      missingFiles,
      previewUrl: buildPreviewUrl(previewFile),
      status:
        registeredFiles.length === 0
          ? 'missing'
          : missingFiles.length === 0
            ? 'complete'
            : 'partial',
    })
  }

  const legacyCueRoot = path.join(options.masterfileRoot, LEGACY_CUES_DIR)
  if (await pathExists(legacyCueRoot)) {
    await fs.rm(legacyCueRoot, { recursive: true, force: true })
  }
  const legacySharedRoot = path.join(options.masterfileRoot, LEGACY_SHARED_DIR)
  if (await pathExists(legacySharedRoot)) {
    await fs.rm(legacySharedRoot, { recursive: true, force: true })
  }
  const legacyQFilesRoot = path.join(options.masterfileRoot, LEGACY_Q_FILES_DIR)
  if (await pathExists(legacyQFilesRoot)) {
    await fs.rm(legacyQFilesRoot, { recursive: true, force: true })
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    eventName: syncedCues[0]?.eventName ?? '2026 IZEN Seminar in Bangkok',
    structure: {
      filesDirectory: ASSETS_DIR,
    },
    totalCueCount: syncedCues.length,
    completeCueCount: syncedCues.filter((cue) => cue.status === 'complete').length,
    partialCueCount: syncedCues.filter((cue) => cue.status === 'partial').length,
    missingCueCount: syncedCues.filter((cue) => cue.status === 'missing').length,
    cues: syncedCues,
  }

  await fs.writeFile(options.output, buildManifestModule(manifest), 'utf8')
  console.log(`Masterfile synced: ${options.output}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
