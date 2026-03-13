import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_MASTERFILE_ROOT = 'files/2026 IZEN Seminar in Bangkok Masterfile/02_Cues'
const DEFAULT_PUBLIC_ROOT = 'public/event-graphics-registered/bangkok'
const DEFAULT_OUTPUT = 'src/features/eventGraphics/generatedMasterfileManifest.ts'

const ENTRANCE_LABEL = '입장'
const MISSING_FILE_LABEL = '파일명 확인 필요'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.avi', '.wmv', '.mkv'])
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.aif', '.aiff', '.ogg', '.flac'])

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
  const values = Object.values(rawRow)
  const [
    rowTitle,
    _projectRelation,
    projectSnapshot,
    eventName,
    eventDate,
    cueOrder,
    cueType,
    cueTitle,
    startTime,
    endTime,
    runtimeMinutes,
    personnel,
    sourceVideo,
    sourceAudio,
    sourceRemark,
    graphicAssetName,
    graphicType,
    previewLink,
    assetLink,
    status,
    owner,
    vendorNote,
    sourceDocument,
    sourceSheet,
    sourceRowNumber,
  ] = values

  return {
    rowTitle: normalizeText(rowTitle),
    projectSnapshot: normalizeText(projectSnapshot),
    eventName: normalizeText(eventName),
    eventDate: normalizeText(eventDate),
    cueOrder: Number.isFinite(Number(cueOrder)) ? Number(cueOrder) : null,
    cueType: normalizeText(cueType),
    cueTitle: normalizeText(cueTitle),
    startTime: normalizeText(startTime),
    endTime: normalizeText(endTime),
    runtimeMinutes: Number.isFinite(Number(runtimeMinutes)) ? Number(runtimeMinutes) : null,
    personnel: normalizeText(personnel),
    sourceVideo: normalizeText(sourceVideo),
    sourceAudio: normalizeText(sourceAudio),
    sourceRemark: normalizeText(sourceRemark),
    graphicAssetName: normalizeText(graphicAssetName),
    graphicType: normalizeText(graphicType),
    previewLink: normalizeText(previewLink),
    assetLink: normalizeText(assetLink),
    status: normalizeText(status),
    owner: normalizeText(owner),
    vendorNote: normalizeText(vendorNote),
    sourceDocument: normalizeText(sourceDocument),
    sourceSheet: normalizeText(sourceSheet),
    sourceRowNumber: Number.isFinite(Number(sourceRowNumber)) ? Number(sourceRowNumber) : null,
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

function looksLikeVideoAsset(value) {
  return /\.(mp4|mov|m4v|avi|wmv|mkv)\b/i.test(value) || /\bvideo\b/i.test(value)
}

function looksLikeLoopInstruction(value) {
  return /\bloop\b/i.test(value)
}

function toPrimaryAsset(row) {
  if (row.graphicAssetName && row.graphicAssetName !== '-') return row.graphicAssetName
  if (row.sourceVideo) return row.sourceVideo
  if (row.sourceAudio) return row.sourceAudio
  return MISSING_FILE_LABEL
}

function toCueFolderNumber(value) {
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
      role: cue.nextGraphic || cue.nextAudio ? 'Start' : 'Main',
      label: cue.nextGraphic || cue.nextAudio ? 'Start Graphic' : 'Main Graphic',
      sourceName: cue.startGraphic,
    })
  }

  if (cue.nextGraphic && cue.nextGraphic !== MISSING_FILE_LABEL) {
    slots.push({
      kind: looksLikeVideoAsset(cue.nextGraphic) ? 'video' : 'image',
      role: 'Then',
      label: 'Then / Hold Graphic',
      sourceName: cue.nextGraphic,
    })
  }

  if (cue.startAudio) {
    slots.push({
      kind: 'audio',
      role: cue.nextGraphic || cue.nextAudio ? 'Start' : 'Main',
      label: cue.nextGraphic || cue.nextAudio ? 'Start Audio' : 'Main Audio',
      sourceName: cue.startAudio,
    })
  }

  if (cue.nextAudio) {
    slots.push({
      kind: 'audio',
      role: 'Then',
      label: 'Then / Hold Audio',
      sourceName: cue.nextAudio,
    })
  }

  return slots
}

function buildMergedVendorCue(entranceRow, mainRow) {
  const runtimeMinutes = (entranceRow.runtimeMinutes ?? 0) + (mainRow.runtimeMinutes ?? 0)
  const cueNumber = toCueFolderNumber(mainRow.cueOrder)

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
    startGraphicAction: 'Play',
    startAudio: entranceRow.sourceAudio,
    startAudioAction: entranceRow.sourceAudio ? 'Play' : '-',
    nextGraphic: toPrimaryAsset(mainRow),
    nextGraphicAction: looksLikeVideoAsset(toPrimaryAsset(mainRow)) ? 'Play' : 'Hold',
    nextAudio: mainRow.sourceAudio,
    nextAudioAction: mainRow.sourceAudio ? (looksLikeLoopInstruction(mainRow.sourceAudio) ? 'Loop' : 'Play') : '-',
    note: joinSummary([entranceRow.sourceRemark, mainRow.sourceRemark, mainRow.vendorNote]),
  }
}

function buildSingleVendorCue(row) {
  const primaryAsset = toPrimaryAsset(row)
  const cueNumber = toCueFolderNumber(row.cueOrder)
  const graphicAction =
    row.cueType === 'certificate' || row.cueType === 'closing' || row.cueType === 'break' || row.cueType === 'meal'
      ? 'Hold'
      : looksLikeVideoAsset(primaryAsset)
        ? 'Play'
        : 'Hold'

  return {
    cueNumber,
    cueType: row.cueType,
    title: row.cueTitle,
    eventName: row.eventName,
    startTime: row.startTime,
    endTime: row.endTime,
    runtimeLabel: toRuntimeLabel(row.runtimeMinutes),
    personnel: row.personnel,
    startGraphic: primaryAsset,
    startGraphicAction: graphicAction,
    startAudio: row.sourceAudio,
    startAudioAction: row.sourceAudio ? (looksLikeLoopInstruction(row.sourceAudio) ? 'Loop' : 'Play') : '-',
    nextGraphic: '',
    nextGraphicAction: '-',
    nextAudio: '',
    nextAudioAction: '-',
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

function buildFilePrefix(kind) {
  if (kind === 'image') return 'I'
  if (kind === 'video') return 'V'
  if (kind === 'audio') return 'A'
  return 'F'
}

function buildDesiredName(cue, kind, role, extension, extraIndex = null) {
  const prefix = buildFilePrefix(kind)
  const roleSuffix = extraIndex == null ? sanitizeSegment(role) : `Extra${String(extraIndex).padStart(2, '0')}`
  return `${prefix}_${cue.folderName}_${roleSuffix}${extension.toLowerCase()}`
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true })
}

async function clearDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true })
  await fs.mkdir(directory, { recursive: true })
}

async function findCueFolderName(masterfileRoot, cueNumber) {
  const entries = await fs.readdir(masterfileRoot, { withFileTypes: true })
  const match = entries.find((entry) => entry.isDirectory() && entry.name.startsWith(`${cueNumber}_`))
  return match?.name ?? cueNumber
}

async function renameFilesInFolder(folderPath, assignments) {
  if (assignments.length === 0) return

  const temporaryAssignments = assignments.map((assignment, index) => ({
    ...assignment,
    tempPath: path.join(folderPath, `.__sync_${Date.now()}_${index}${path.extname(assignment.currentName)}`),
  }))

  for (const assignment of temporaryAssignments) {
    await fs.rename(path.join(folderPath, assignment.currentName), assignment.tempPath)
  }

  for (const assignment of temporaryAssignments) {
    await fs.rename(assignment.tempPath, path.join(folderPath, assignment.desiredName))
  }
}

async function syncCueFolder(cue, masterfileRoot, publicRoot) {
  const folderPath = path.join(masterfileRoot, cue.folderName)
  const publicCueRoot = path.join(publicRoot, cue.folderName)
  const expectedSlots = buildExpectedSlots(cue)
  const allEntries = await fs.readdir(folderPath, { withFileTypes: true })
  const fileEntries = allEntries
    .filter((entry) => entry.isFile() && entry.name !== 'README.txt')
    .map((entry) => ({
      currentName: entry.name,
      extension: path.extname(entry.name),
      kind: detectKindByExtension(entry.name),
    }))
    .sort((left, right) => left.currentName.localeCompare(right.currentName, 'en'))

  const assignments = []
  const missingFiles = []
  const registeredFiles = []

  for (const kind of ['image', 'video', 'audio', 'other']) {
    const expectedForKind = expectedSlots.filter((slot) => slot.kind === kind)
    const actualForKind = fileEntries.filter((file) => file.kind === kind)

    for (let index = 0; index < actualForKind.length; index += 1) {
      const file = actualForKind[index]
      const slot = expectedForKind[index]
      const desiredName = slot
        ? buildDesiredName(cue, kind, slot.role, file.extension)
        : buildDesiredName(cue, kind, 'Extra', file.extension, index - expectedForKind.length + 1)

      assignments.push({
        currentName: file.currentName,
        desiredName,
      })

      registeredFiles.push({
        name: desiredName,
        kind,
        role: slot?.label ?? `${kind} extra file`,
        sourceName: slot?.sourceName ?? '',
        relativePath: path.posix.join('files', '2026 IZEN Seminar in Bangkok Masterfile', '02_Cues', cue.folderName, desiredName),
      })
    }

    for (const slot of expectedForKind.slice(actualForKind.length)) {
      missingFiles.push({
        kind,
        label: slot.label,
        sourceName: slot.sourceName,
      })
    }
  }

  await renameFilesInFolder(folderPath, assignments)
  await clearDirectory(publicCueRoot)

  const imageFiles = registeredFiles.filter((file) => file.kind === 'image')
  for (const image of imageFiles) {
    await fs.copyFile(path.join(folderPath, image.name), path.join(publicCueRoot, image.name))
  }

  const previewUrl = imageFiles[0]
    ? `/${path.posix.join('event-graphics-registered', 'bangkok', cue.folderName, imageFiles[0].name)}`
    : null

  return {
    cueNumber: cue.cueNumber,
    title: cue.title,
    cueType: cue.cueType,
    eventName: cue.eventName,
    folderName: cue.folderName,
    startTime: cue.startTime,
    endTime: cue.endTime,
    runtimeLabel: cue.runtimeLabel,
    personnel: cue.personnel,
    registeredFiles,
    missingFiles,
    previewUrl,
    status:
      registeredFiles.length === 0
        ? 'missing'
        : missingFiles.length === 0
          ? 'complete'
          : 'partial',
  }
}

function buildManifestModule(manifest) {
  return `export const bangkokMasterfileManifest = ${JSON.stringify(manifest, null, 2)} as const\n`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')

  const rows = sourceRows.map(normalizeRow)
  const cues = buildVendorCues(rows)

  await ensureDirectory(options.publicRoot)

  const enrichedCues = []
  for (const cue of cues) {
    const folderName = await findCueFolderName(options.masterfileRoot, cue.cueNumber)
    enrichedCues.push({
      ...cue,
      folderName,
    })
  }

  const syncedCues = []
  for (const cue of enrichedCues) {
    syncedCues.push(await syncCueFolder(cue, options.masterfileRoot, options.publicRoot))
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    eventName: syncedCues[0]?.eventName ?? '2026 IZEN Seminar in Bangkok',
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
