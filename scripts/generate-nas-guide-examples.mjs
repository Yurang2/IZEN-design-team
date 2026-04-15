import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const sourceFile = path.join(repoRoot, 'files', 'izen_design_nas_tree_20260413_103708.txt')
const outputFile = path.join(repoRoot, 'src', 'features', 'nasGuide', 'nasGuideExamples.generated.ts')

const ROOT_ICON = '📂 '
const FOLDER_ICON = '📁 '
const TEE_SEGMENT = '├── '
const ELBOW_SEGMENT = '└── '
const BAR_SEGMENT = '│   '
const EMPTY_SEGMENT = '    '

function parseLegacyTree(text) {
  const stack = []
  const files = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line) continue
    if (line.startsWith(ROOT_ICON)) {
      stack.length = 0
      stack[0] = line.slice(ROOT_ICON.length).trim()
      continue
    }

    let cursor = 0
    let depth = 0
    while (line.startsWith(BAR_SEGMENT, cursor) || line.startsWith(EMPTY_SEGMENT, cursor)) {
      cursor += 4
      depth += 1
    }

    if (line.startsWith(TEE_SEGMENT, cursor) || line.startsWith(ELBOW_SEGMENT, cursor)) {
      cursor += 4
    } else {
      continue
    }

    const rest = line.slice(cursor)
    if (rest.startsWith(FOLDER_ICON)) {
      stack[depth + 1] = rest.slice(FOLDER_ICON.length).trim()
      stack.length = depth + 2
      continue
    }

    let sourceName = rest.trim()
    const sizeMatch = sourceName.match(/^(.*)\s+\(([^()]*)\)$/)
    if (sizeMatch) sourceName = sizeMatch[1]
    const folders = stack.slice(1, depth + 1).filter(Boolean)
    files.push({
      folders,
      sourceName,
      sourcePath: [...folders, sourceName].join('/'),
      ext: path.extname(sourceName).toLowerCase(),
      sourceNameBase: path.basename(sourceName, path.extname(sourceName)),
    })
  }

  return files
}

function normalizeText(value) {
  return value
    .replace(/^\[[^\]]+\]\s*/g, '')
    .replace(/[()[\]]/g, ' ')
    .replace(/[+&]/g, ' ')
    .replace(/[_./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugifyForName(value) {
  const normalized = normalizeText(value)
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'file'
}

function clampNameStem(value, max = 52) {
  return value.length > max ? value.slice(0, max).replace(/-+$/g, '') : value
}

function buildRenamedName(prefix, record) {
  const stem = clampNameStem(slugifyForName(record.sourceNameBase))
  return `${prefix}_${stem}${record.ext}`
}

function looksLikeRawCameraName(name) {
  return /^(?:3N8A\d+|IMG[_-]?\d+|DSC\d+|MVI[_-]?\d+|P\d+|GX\d+|DJI[_-]?\d+|CAM[-_A-Z0-9]+)$/i.test(name)
}

function looksLikePartCode(name) {
  return /^(?:[A-Z]{2,}[A-Z0-9_-]*\d+[A-Z0-9_-]*|[A-Z0-9_-]+_Rev\d+)$/i.test(name)
}

function containsAny(record, keywords) {
  const lowerPath = record.sourcePath.toLowerCase()
  return keywords.some((keyword) => lowerPath.includes(keyword.toLowerCase()))
}

function isLegacyLibraryRecord(record) {
  const root = record.folders[0]?.toLowerCase()
  return root === '[izen implant]' || root === 'design'
}

function findClosestFolderCategory(record, categories) {
  const normalizedFolders = record.folders.map((segment) => normalizeText(segment).toLowerCase()).reverse()
  for (const category of categories) {
    if (normalizedFolders.some((segment) => category.keywords.some((keyword) => segment.includes(keyword)))) {
      return category
    }
  }

  const normalizedName = normalizeText(record.sourceNameBase).toLowerCase()
  return categories.find((category) => category.keywords.some((keyword) => normalizedName.includes(keyword))) ?? null
}

function extractYearMonth(record) {
  const text = `${record.sourcePath} ${record.sourceName}`
  const ymd = text.match(/(?:^|[^0-9])((?:20)?\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/)
  if (ymd) {
    const year = ymd[1].length === 2 ? `20${ymd[1]}` : ymd[1]
    return `${year}-${ymd[2]}`
  }

  const ym = text.match(/(?:^|[^0-9])((?:20)?\d{2})[-_. ]?(\d{2})(?:[^0-9]|$)/)
  if (ym) {
    const year = ym[1].length === 2 ? `20${ym[1]}` : ym[1]
    return `${year}-${ym[2]}`
  }

  return '2025-01'
}

function speakerFolderName(record) {
  const folderHit = [...record.folders].reverse().find((segment) => /speaker|연자|dr\.?|doctor|prof/i.test(segment))
  const candidate = folderHit || record.sourceNameBase
  const cleaned = normalizeText(candidate).split(/\s+/).filter(Boolean)
  return cleaned.slice(0, 2).join('-') || 'Speaker'
}

function clinicalRenamedName(record) {
  const cleaned = normalizeText(record.sourceNameBase)
    .replace(/\((\d+)\)/g, ' $1')
    .replace(/\s+/g, '_')
  return `${cleaned}${record.ext}`
}

function renderTargetPath(record) {
  if (containsAny(record, ['abutment'])) return '02_ASSET/02_제품-렌더링/04_abutment'
  if (containsAny(record, ['cover screw'])) return '02_ASSET/02_제품-렌더링/02_cover_screw'
  if (containsAny(record, ['healing'])) return '02_ASSET/02_제품-렌더링/03_healing_abutment'
  if (containsAny(record, ['kit'])) return '02_ASSET/02_제품-렌더링/05_zenex_kit'
  if (containsAny(record, ['plazmax'])) return '02_ASSET/02_제품-렌더링/07_plazmax'
  return '02_ASSET/02_제품-렌더링/연출'
}

function threeDSubfolder(record) {
  if (containsAny(record, ['i-system'])) return 'I-System'
  if (containsAny(record, ['t-system'])) return 'T-System'
  if (containsAny(record, ['r-system'])) return 'R-System'
  if (containsAny(record, ['multi'])) return 'Multi'
  if (containsAny(record, ['plus'])) return 'Plus'
  return 'Part-Code'
}

function logoTargetPath(record) {
  const lower = record.sourceName.toLowerCase()
  if (lower.includes('iam')) return '02_ASSET/01_로고/IAM'
  if (lower.includes('zenex')) return '02_ASSET/01_로고/ZENEX'
  if (lower.includes('clean')) return '02_ASSET/01_로고/Cleanimplant'
  if (lower.includes('dealer') || lower.includes('ndent') || lower.includes('malaysia')) return '02_ASSET/01_로고/Dealer'
  return '02_ASSET/01_로고/IZEN_CI'
}

const PRINT_CATEGORIES = [
  { keywords: ['leaflet', '전단지'], folder: '리플렛', googleDrivePath: '04_리플렛', prefix: 'IZEN_리플렛' },
  { keywords: ['brochure', '브로슈어'], folder: '브로슈어', googleDrivePath: '03_브로슈어', prefix: 'IZEN_브로슈어' },
  { keywords: ['poster', '포스터'], folder: '포스터', googleDrivePath: '05_포스터', prefix: 'IZEN_포스터' },
  { keywords: ['banner', '배너', 'x-banner', 'x banner', 'signage', 'wallgraphic', 'wall graphic'], folder: '배너-현수막', googleDrivePath: '07_배너-사인물', prefix: 'IZEN_배너' },
]

const DISTRIBUTION_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg'])

function resolvePrintCategory(record) {
  return findClosestFolderCategory(record, PRINT_CATEGORIES)
}

function isDistributionFile(record) {
  return DISTRIBUTION_EXTENSIONS.has(record.ext)
}

function renameIfNeeded(desiredName, record) {
  if (desiredName === record.sourceName) return { name: desiredName }
  return { name: desiredName, comment: `원본파일명: ${record.sourceName}` }
}

function preserveName(record) {
  return { name: record.sourceName }
}

function buildRevisionName(prefix, record, revision = '01') {
  const stem = clampNameStem(slugifyForName(record.sourceNameBase))
  return `${prefix}_${stem}_Rev${revision}${record.ext}`
}

function createUniqueNameTracker() {
  const tracker = new Map()
  return (targetPath, baseName) => {
    const key = `${targetPath}::${baseName.toLowerCase()}`
    const current = tracker.get(key) ?? 0
    tracker.set(key, current + 1)
    if (current === 0) return baseName
    const ext = path.extname(baseName)
    const stem = path.basename(baseName, ext)
    return `${stem}_${String(current + 1).padStart(2, '0')}${ext}`
  }
}

function buildExampleBuckets() {
  return [
    {
      id: 'project-aeedc-leaflet',
      limit: 25,
      match: (record) => containsAny(record, ['2026 AEEDC']) && containsAny(record, ['/leaflet', '전단지']),
      map: (record) => ({
        path: '01_PROJECT/IZ260002_AEEDC-Dubai-2026/01_인쇄물/리플렛',
        ...renameIfNeeded(buildRenamedName('IZEN_AEEDC-Dubai-2026_리플렛', record), record),
      }),
    },
    {
      id: 'project-aeedc-banner',
      limit: 20,
      match: (record) => containsAny(record, ['2026 AEEDC']) && containsAny(record, ['x배너', 'banner', 'wallgraphic']),
      map: (record) => ({
        path: '01_PROJECT/IZ260002_AEEDC-Dubai-2026/01_인쇄물/배너-현수막',
        ...renameIfNeeded(buildRenamedName('IZEN_AEEDC-Dubai-2026_배너', record), record),
      }),
    },
    {
      id: 'project-aeedc-photo',
      limit: 60,
      match: (record) => containsAny(record, ['2026 AEEDC']) && containsAny(record, ['촬영본/사진', '촬영본']) && ['.jpg', '.jpeg', '.png', '.heic'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ260002_AEEDC-Dubai-2026/05_사진/a_자체촬영',
        ...(looksLikeRawCameraName(record.sourceNameBase) ? preserveName(record) : renameIfNeeded(buildRenamedName('IZEN_AEEDC-Dubai-2026_행사사진', record), record)),
      }),
    },
    {
      id: 'project-aeedc-event-graphics',
      limit: 35,
      match: (record) => containsAny(record, ['2026 AEEDC']) && containsAny(record, ['월 그래픽 이미지']) && ['.png', '.jpg', '.jpeg', '.pdf', '.ai', '.psd', '.psb'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ260002_AEEDC-Dubai-2026/03_디지털/행사운영',
        ...renameIfNeeded(buildRenamedName('IZEN_AEEDC-Dubai-2026_행사운영', record), record),
      }),
    },
    {
      id: 'project-aeedc-video',
      limit: 10,
      match: (record) => containsAny(record, ['2026 AEEDC']) && containsAny(record, ['/영상']) && ['.mp4', '.mov', '.mxf', '.aep', '.prproj'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ260002_AEEDC-Dubai-2026/04_영상/홍보영상',
        ...renameIfNeeded(buildRenamedName('IZEN_AEEDC-Dubai-2026_홍보영상', record), record),
      }),
    },
    {
      id: 'project-sns',
      limit: 125,
      match: (record) => containsAny(record, ['sns']) && ['.ai', '.psd', '.psb', '.png', '.jpg', '.jpeg', '.mp4'].includes(record.ext),
      map: (record) => {
        const isClinical = containsAny(record, ['clinical', '임상'])
        const subPath = isClinical
          ? '01_PROJECT/IZ250900_SNS-정기콘텐츠/임상/2025-03_Dr-Kim'
          : '01_PROJECT/IZ250900_SNS-정기콘텐츠/제품/2025-03_I-system-신제품'
        const prefix = isClinical ? 'IZEN_SNS_임상' : 'IZEN_SNS_제품'
        return {
          path: subPath,
          ...renameIfNeeded(buildRenamedName(prefix, record), record),
        }
      },
    },
    {
      id: 'project-newsletter',
      limit: 35,
      match: (record) => containsAny(record, ['뉴스레터']) && ['.pptx', '.pdf', '.png', '.jpg', '.jpeg', '.ai', '.psd'].includes(record.ext),
      map: (record) => ({
        path: `01_PROJECT/IZ250901_뉴스레터/${extractYearMonth(record)}`,
        ...renameIfNeeded(buildRenamedName('IZEN_뉴스레터', record), record),
      }),
    },
    {
      id: 'project-company-video',
      limit: 20,
      match: (record) => containsAny(record, ['company introduction video', '회사소개영상']) && ['.mp4', '.mov', '.prproj', '.pptx', '.docx', '.txt'].includes(record.ext),
      map: (record) => ({
        path: ['.docx', '.txt', '.pptx'].includes(record.ext)
          ? '01_PROJECT/IZ250015_회사소개영상-v3수정/00_기획-문서'
          : '01_PROJECT/IZ250015_회사소개영상-v3수정/04_영상/회사소개영상',
        ...renameIfNeeded(buildRenamedName('IZEN_회사소개영상', record), record),
      }),
    },
    {
      id: 'project-homepage',
      limit: 20,
      match: (record) => containsAny(record, ['homepage', '홈페이지']) && ['.png', '.jpg', '.jpeg', '.mp4', '.psd', '.ai', '.zip'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ250023_홈페이지-운영/03_디지털/홈페이지',
        ...renameIfNeeded(buildRenamedName('IZEN_홈페이지', record), record),
      }),
    },
    {
      id: 'project-catalog',
      limit: 35,
      match: (record) =>
        (containsAny(record, ['catalog', '카달로그', '출력물 리뉴얼']) || containsAny(record, ['brochure_reflect'])) &&
        ['.indd', '.indb', '.pdf', '.ai', '.psd', '.png', '.jpg', '.jpeg'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ250016_I-system-카달로그-리뉴얼/01_인쇄물/카달로그',
        ...renameIfNeeded(buildRenamedName('IZEN_I-system_카달로그', record), record),
      }),
    },
    {
      id: 'project-instructional-video',
      limit: 15,
      match: (record) =>
        containsAny(record, ['instructional video', 'plazmax z1', 'easy surgery kit', 'kit video']) &&
        ['.mp4', '.mov', '.aep', '.prproj', '.c4d'].includes(record.ext),
      map: (record) => ({
        path: '01_PROJECT/IZ250018_제품-사용법영상-T-system/04_영상/제품영상',
        ...renameIfNeeded(buildRenamedName('IZEN_T-system_사용법영상', record), record),
      }),
    },
    {
      id: 'gdrive-legacy-print',
      limit: 90,
      match: (record) =>
        isLegacyLibraryRecord(record) &&
        isDistributionFile(record) &&
        !!resolvePrintCategory(record) &&
        !containsAny(record, ['logo', 'sns', '2026 AEEDC']),
      map: (record) => {
        const category = resolvePrintCategory(record) ?? PRINT_CATEGORIES[0]
        return {
          path: `Google Drive/${category.googleDrivePath}`,
          ...renameIfNeeded(buildRevisionName(category.prefix, record), record),
        }
      },
    },
    {
      id: 'asset-logo',
      limit: 45,
      match: (record) => containsAny(record, ['logo']) && ['.ai', '.eps', '.png', '.jpg', '.jpeg', '.svg', '.pdf'].includes(record.ext),
      map: (record) => {
        const desiredName = slugifyForName(record.sourceNameBase).replace(/-/g, '_') + record.ext
        const keepOriginal = record.sourceName === desiredName || looksLikePartCode(record.sourceNameBase)
        return {
          path: logoTargetPath(record),
          ...(keepOriginal ? preserveName(record) : renameIfNeeded(desiredName, record)),
        }
      },
    },
    {
      id: 'asset-dealer-logo',
      limit: 15,
      match: (record) =>
        !containsAny(record, ['logo']) &&
        containsAny(record, ['dealer', 'ndent', 'malaysia', 'philippines', 'vietnam']) &&
        ['.png', '.jpg', '.jpeg', '.ai', '.svg'].includes(record.ext),
      map: (record) => ({
        path: '02_ASSET/01_로고/Dealer',
        ...renameIfNeeded(buildRenamedName('DEALER_LOGO', record), record),
      }),
    },
    {
      id: 'asset-brand-guide',
      limit: 10,
      match: (record) => containsAny(record, ['guideline', 'brand guide']) && ['.pdf', '.pptx'].includes(record.ext),
      map: (record) => ({
        path: '02_ASSET/04_브랜드-가이드',
        ...renameIfNeeded(buildRenamedName('IZEN_BRAND-GUIDE', record), record),
      }),
    },
    {
      id: 'asset-render',
      limit: 170,
      match: (record) =>
        (containsAny(record, ['제품 렌더링 소스', 'rendering']) || /render|렌더/i.test(record.sourceNameBase)) &&
        !['.step', '.stp', '.stl'].includes(record.ext) &&
        ['.png', '.jpg', '.jpeg', '.psd', '.psb', '.bip', '.tif', '.eimg'].includes(record.ext),
      map: (record) => {
        const keepOriginal = looksLikePartCode(record.sourceNameBase)
        return {
          path: renderTargetPath(record),
          ...(keepOriginal ? preserveName(record) : renameIfNeeded(buildRenamedName('IZEN_RENDER', record), record)),
        }
      },
    },
    {
      id: 'asset-3d-source',
      limit: 170,
      match: (record) => ['.step', '.stp', '.stl'].includes(record.ext),
      map: (record) => ({
        path: `02_ASSET/03_3D-소스/${threeDSubfolder(record)}`,
        ...(looksLikePartCode(record.sourceNameBase) ? preserveName(record) : renameIfNeeded(buildRenamedName('IZEN_3D-SOURCE', record), record)),
      }),
    },
    {
      id: 'asset-clinical',
      limit: 60,
      match: (record) =>
        containsAny(record, ['임상', 'clinical', '타사 임상 포스터 레퍼런스']) &&
        ['.png', '.jpg', '.jpeg', '.pdf', '.psd', '.ai'].includes(record.ext),
      map: (record) => ({
        path: '02_ASSET/09_임상/타사-레퍼런스',
        ...renameIfNeeded(clinicalRenamedName(record), record),
      }),
    },
    {
      id: 'asset-speaker',
      limit: 15,
      match: (record) =>
        containsAny(record, ['연자 사진', '연자', 'symposium']) &&
        ['.png', '.jpg', '.jpeg', '.psd', '.ai'].includes(record.ext),
      map: (record) => ({
        path: `02_ASSET/연자/${speakerFolderName(record)}`,
        ...renameIfNeeded(buildRenamedName(speakerFolderName(record), record), record),
      }),
    },
    {
      id: 'asset-package',
      limit: 25,
      match: (record) => containsAny(record, ['package', '패키지']) && ['.png', '.jpg', '.jpeg', '.ai', '.pdf', '.psd', '.zip'].includes(record.ext),
      map: (record) => ({
        path: '02_ASSET/08_패키지',
        ...renameIfNeeded(buildRenamedName('IZEN_PACKAGE', record), record),
      }),
    },
  ]
}

function generateExamples(files) {
  const selectedPaths = new Set()
  const makeUniqueName = createUniqueNameTracker()
  const buckets = buildExampleBuckets()
  const examples = []
  const bucketCounts = []

  for (const bucket of buckets) {
    let count = 0
    for (const record of files) {
      if (count >= bucket.limit) break
      if (selectedPaths.has(record.sourcePath)) continue
      if (!bucket.match(record)) continue

      const mapped = bucket.map(record)
      const uniqueName = makeUniqueName(mapped.path, mapped.name)
      const comment = uniqueName !== record.sourceName ? mapped.comment ?? `원본파일명: ${record.sourceName}` : mapped.comment

      examples.push({
        bucket: bucket.id,
        path: mapped.path,
        name: uniqueName,
        comment,
      })
      selectedPaths.add(record.sourcePath)
      count += 1
    }
    bucketCounts.push({ id: bucket.id, requested: bucket.limit, actual: count })
  }

  if (examples.length < 1000) {
    for (const record of files) {
      if (examples.length >= 1000) break
      if (selectedPaths.has(record.sourcePath)) continue
      if (isLegacyLibraryRecord(record) && resolvePrintCategory(record) && !isDistributionFile(record)) continue
      const fallbackPath = record.ext === '.step' || record.ext === '.stl' || record.ext === '.stp'
        ? `02_ASSET/03_3D-소스/${threeDSubfolder(record)}`
        : ['.png', '.jpg', '.jpeg', '.psd', '.psb', '.ai', '.pdf'].includes(record.ext)
          ? '02_ASSET/02_제품-렌더링/연출'
          : null
      if (!fallbackPath) continue
      const mapped = record.ext === '.step' || record.ext === '.stl' || record.ext === '.stp'
        ? preserveName(record)
        : renameIfNeeded(buildRenamedName('IZEN_FALLBACK', record), record)
      const uniqueName = makeUniqueName(fallbackPath, mapped.name)
      examples.push({
        bucket: 'fallback',
        path: fallbackPath,
        name: uniqueName,
        comment: uniqueName !== record.sourceName ? mapped.comment ?? `원본파일명: ${record.sourceName}` : mapped.comment,
      })
      selectedPaths.add(record.sourcePath)
    }
  }

  return {
    examples: examples.slice(0, 1000),
    bucketCounts,
  }
}

function sortExamples(examples) {
  return [...examples].sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path, 'ko')
    return a.name.localeCompare(b.name, 'ko')
  })
}

function renderGeneratedFile(payload) {
  return `export type NasGuideGeneratedExample = {
  bucket: string
  path: string
  name: string
  comment?: string
}

export const GENERATED_NAS_GUIDE_EXAMPLE_META = {
  total: ${payload.examples.length},
  buckets: ${JSON.stringify(payload.bucketCounts, null, 2)},
} as const

export const GENERATED_NAS_GUIDE_EXAMPLES: NasGuideGeneratedExample[] = ${JSON.stringify(sortExamples(payload.examples), null, 2)}
`
}

function main() {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Missing source file: ${sourceFile}`)
  }

  const source = fs.readFileSync(sourceFile, 'utf8')
  const files = parseLegacyTree(source)
  const payload = generateExamples(files)
  const rendered = renderGeneratedFile(payload)
  fs.writeFileSync(outputFile, rendered)

  console.log(`Generated ${payload.examples.length} NAS guide examples.`)
  for (const bucket of payload.bucketCounts) {
    console.log(`${bucket.id}: ${bucket.actual}/${bucket.requested}`)
  }
}

main()
