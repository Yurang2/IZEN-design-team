import fs from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_OUTPUT = 'files/2026 IZEN Seminar in Bangkok Masterfile'
const DEFAULT_SOURCE = 'files/IZEN Seminar in Bangkok Timetable.xlsx'

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    source: DEFAULT_SOURCE,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--output') options.output = argv[index + 1] ?? options.output
    if (value === '--source') options.source = argv[index + 1] ?? options.source
  }

  return options
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r?\n+/g, ' / ')
    .replace(/\s+\/\s+/g, ' / ')
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

function sanitizeFolderName(value) {
  return value
    .replace(/등장\s*-\s*/gi, 'Entrance ')
    .replace(/등장/gi, 'Entrance')
    .replace(/&/g, 'And')
    .replace(/[\\/:"*?<>|]+/g, ' ')
    .replace(/[^a-zA-Z0-9._ -]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function toCueDisplayTitle(row) {
  const withoutEvent = row.rowTitle.replace(/^\[[^\]]+\]\s*/, '')
  const withoutOrder = withoutEvent.replace(/^\d+(?:\.\d+)?\s+/, '')
  return withoutOrder || row.cueTitle || 'Untitled Cue'
}

function toCellItems(value) {
  const normalized = normalizeText(value)
  return normalized ? [normalized] : []
}

function toListBlock(title, items, fallback = '-') {
  const lines = items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${fallback}`]
  return `${title}\n${lines.join('\n')}`
}

function buildRootReadme(rows, options) {
  const eventName = rows[0]?.eventName || path.basename(options.output)
  return [
    `Event: ${eventName}`,
    'Package Type: Cue-based masterfile handoff',
    '',
    'Structure',
    '- 00_README.txt: package overview',
    '- 01_Source: source workbook reference',
    '- 02_Cues: one folder per cue in playback order',
    '',
    'Source Workbook',
    `- ${options.source}`,
    '',
    'How To Use',
    '- Put all final delivery files into each cue folder.',
    '- Keep image, video, and audio for the same cue together.',
    '- Do not move files between cue folders after vendor confirmation.',
    '- If a cue changes on site, replace only that cue folder contents and notify the vendor.',
    '',
    'Cue Count',
    `- ${rows.length}`,
    '',
  ].join('\n')
}

function buildSourceReadme(options) {
  return [
    'Source Reference',
    `- Workbook: ${options.source}`,
    '- This folder exists only as a reference pointer.',
    '- The original workbook stays in its current location unless you manually copy it here.',
    '',
  ].join('\n')
}

function buildCueReadme(row, sequenceNumber) {
  const displayTitle = toCueDisplayTitle(row)
  const sourceVideos = toCellItems(row.sourceVideo)
  const sourceAudios = toCellItems(row.sourceAudio)
  const graphicAssets = toCellItems(row.graphicAssetName)
  const notes = [row.sourceRemark, row.vendorNote].filter(Boolean)

  return [
    `Cue Sequence: ${String(sequenceNumber).padStart(3, '0')}`,
    `Cue Order: ${row.cueOrder ?? '-'}`,
    `Cue Title: ${displayTitle}`,
    `Cue Type: ${row.cueType || '-'}`,
    `Time: ${row.startTime || '-'} - ${row.endTime || '-'}`,
    `Runtime: ${row.runtimeMinutes ?? '-'} min`,
    `Personnel: ${row.personnel || '-'}`,
    `Graphic Type: ${row.graphicType || '-'}`,
    `Status: ${row.status || '-'}`,
    '',
    toListBlock('Expected Graphic / Video References', sourceVideos.length > 0 ? sourceVideos : graphicAssets),
    '',
    toListBlock('Expected Audio References', sourceAudios),
    '',
    toListBlock('Graphic Asset Name Snapshot', graphicAssets),
    '',
    toListBlock('Operational Notes', notes, 'None'),
    '',
    'Delivery Rule',
    '- Put final files for this cue into this folder only.',
    '- Keep vendor-ready filenames stable once shared.',
    '',
  ].join('\n')
}

async function recreateDirectory(rootDirectory) {
  await fs.rm(rootDirectory, { recursive: true, force: true })
  await fs.mkdir(rootDirectory, { recursive: true })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const sourceRows = Array.isArray(parsed?.rows) ? parsed.rows : []
  if (sourceRows.length === 0) throw new Error('rows_missing')

  const rows = sourceRows.map(normalizeRow)
  await recreateDirectory(options.output)

  const sourceDirectory = path.join(options.output, '01_Source')
  const cuesDirectory = path.join(options.output, '02_Cues')
  await fs.mkdir(sourceDirectory, { recursive: true })
  await fs.mkdir(cuesDirectory, { recursive: true })

  await fs.writeFile(path.join(options.output, '00_README.txt'), `${buildRootReadme(rows, options)}\n`, 'utf8')
  await fs.writeFile(path.join(sourceDirectory, 'README.txt'), `${buildSourceReadme(options)}\n`, 'utf8')

  for (const [index, row] of rows.entries()) {
    const displayTitle = toCueDisplayTitle(row)
    const folderName = `C${String(index + 1).padStart(3, '0')}_${sanitizeFolderName(displayTitle)}`
    const cueDirectory = path.join(cuesDirectory, folderName)
    await fs.mkdir(cueDirectory, { recursive: true })
    await fs.writeFile(path.join(cueDirectory, 'README.txt'), `${buildCueReadme(row, index + 1)}\n`, 'utf8')
  }

  console.log(`Created masterfile package structure in ${options.output}`)
  console.log(`Cue folders: ${rows.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
