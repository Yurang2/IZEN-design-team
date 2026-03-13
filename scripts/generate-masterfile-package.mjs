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
  return '파일명 확인 필요'
}

function toCueNumber(value) {
  const numeric = value == null ? Number.NaN : Math.round(value)
  return Number.isFinite(numeric) ? String(numeric).padStart(2, '0') : '--'
}

function isEntranceRow(row) {
  return row.cueTitle === '등장'
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

function toRuntimeLabel(value) {
  return value != null ? `${value} min` : '-'
}

function buildMergedVendorCue(entranceRow, mainRow) {
  const runtimeMinutes = (entranceRow.runtimeMinutes ?? 0) + (mainRow.runtimeMinutes ?? 0)
  return {
    cueNumber: toCueNumber(mainRow.cueOrder),
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
    note: joinSummary([entranceRow.sourceRemark, mainRow.sourceRemark, mainRow.vendorNote]) || 'None',
  }
}

function buildSingleVendorCue(row) {
  const primaryAsset = toPrimaryAsset(row)
  const graphicAction =
    row.cueType === 'certificate' || row.cueType === 'closing' || row.cueType === 'break' || row.cueType === 'meal'
      ? 'Hold'
      : looksLikeVideoAsset(primaryAsset)
        ? 'Play'
        : 'Hold'

  return {
    cueNumber: toCueNumber(row.cueOrder),
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
    note: joinSummary([row.sourceRemark, row.vendorNote]) || 'None',
  }
}

function buildVendorCues(rows) {
  const vendorCues = []
  for (let index = 0; index < rows.length; index += 1) {
    const current = rows[index]
    const next = rows[index + 1]

    if (canMergeEntranceWithMainRow(current, next)) {
      vendorCues.push(buildMergedVendorCue(current, next))
      index += 1
      continue
    }

    if (isEntranceRow(current)) {
      continue
    }

    vendorCues.push(buildSingleVendorCue(current))
  }
  return vendorCues
}

function toListBlock(title, items, fallback = '-') {
  const lines = items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${fallback}`]
  return `${title}\n${lines.join('\n')}`
}

function buildRootReadme(cues, options) {
  const eventName = cues[0]?.eventName || path.basename(options.output)
  return [
    `Event: ${eventName}`,
    'Package Type: Vendor playback package',
    '',
    'Structure',
    '- 00_README.txt: package overview',
    '- 01_Source: source workbook reference',
    '- 02_Cues: one folder per vendor playback cue',
    '',
    'Source Workbook',
    `- ${options.source}`,
    '',
    'How To Use',
    '- Folder names use the actual cue number from the show order.',
    '- Each cue folder includes Start order and Then/Hold order.',
    '- Put final delivery files for that cue into the same folder.',
    '- Do not rename or move files after the vendor has confirmed the package.',
    '',
    'Cue Count',
    `- ${cues.length}`,
    '',
  ].join('\n')
}

function buildSourceReadme(options) {
  return [
    'Source Reference',
    `- Workbook: ${options.source}`,
    '- This folder exists only as a reference pointer.',
    '',
  ].join('\n')
}

function buildCueReadme(cue) {
  const nextOrderLines = cue.nextGraphic || cue.nextAudio
    ? [
        'Then / Hold Order',
        `- Graphic: ${cue.nextGraphic || '-'}`,
        `- Graphic Action: ${cue.nextGraphicAction || '-'}`,
        `- Audio: ${cue.nextAudio || '-'}`,
        `- Audio Action: ${cue.nextAudioAction || '-'}`,
      ]
    : [
        'Then / Hold Order',
        '- Graphic: -',
        '- Graphic Action: -',
        '- Audio: -',
        '- Audio Action: -',
      ]

  return [
    `Cue Number: ${cue.cueNumber}`,
    `Cue Title: ${cue.title}`,
    `Cue Type: ${cue.cueType || '-'}`,
    `Time: ${cue.startTime || '-'} - ${cue.endTime || '-'}`,
    `Runtime: ${cue.runtimeLabel}`,
    `Personnel: ${cue.personnel || '-'}`,
    '',
    'Start Order',
    `- Graphic: ${cue.startGraphic || '-'}`,
    `- Graphic Action: ${cue.startGraphicAction || '-'}`,
    `- Audio: ${cue.startAudio || '-'}`,
    `- Audio Action: ${cue.startAudioAction || '-'}`,
    '',
    ...nextOrderLines,
    '',
    toListBlock('Operational Notes', cue.note && cue.note !== 'None' ? [cue.note] : [], 'None'),
    '',
    'Delivery Rule',
    '- Put final vendor delivery files for this cue into this folder only.',
    '- Keep one final file per actual playback target whenever possible.',
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
  const cues = buildVendorCues(rows)
  await recreateDirectory(options.output)

  const sourceDirectory = path.join(options.output, '01_Source')
  const cuesDirectory = path.join(options.output, '02_Cues')
  await fs.mkdir(sourceDirectory, { recursive: true })
  await fs.mkdir(cuesDirectory, { recursive: true })

  await fs.writeFile(path.join(options.output, '00_README.txt'), `${buildRootReadme(cues, options)}\n`, 'utf8')
  await fs.writeFile(path.join(sourceDirectory, 'README.txt'), `${buildSourceReadme(options)}\n`, 'utf8')

  for (const cue of cues) {
    const folderName = `Q${cue.cueNumber}_${sanitizeFolderName(cue.title)}`
    const cueDirectory = path.join(cuesDirectory, folderName)
    await fs.mkdir(cueDirectory, { recursive: true })
    await fs.writeFile(path.join(cueDirectory, 'README.txt'), `${buildCueReadme(cue)}\n`, 'utf8')
  }

  console.log(`Created masterfile package structure in ${options.output}`)
  console.log(`Cue folders: ${cues.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
