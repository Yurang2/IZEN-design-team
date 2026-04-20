// "업무별 참조 폴더" DB 생성 + 기존 32개 매뉴얼 시드 마이그레이션
// 1 row = (업무구분 × 경로) 조합. 역할 ASSET/WORK/PUB.

const fs = require('fs')
const path = require('path')

const envPath = path.resolve(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const TOKEN = process.env.NOTION_TOKEN
if (!TOKEN) { console.error('NOTION_TOKEN not set'); process.exit(1) }

const PARENT_PAGE_ID = '23ec1cc7-ec27-803a-9567-f6b5ebc7cb36'

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

async function createDB(title, properties) {
  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parent: { page_id: PARENT_PAGE_ID },
      title: [{ text: { content: title } }],
      properties,
    }),
  })
  const data = await res.json()
  if (data.id) {
    console.log(`Created: ${title} -> ${data.id}`)
    return data.id
  } else {
    console.error(`Failed:`, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

async function insertRef(dbId, item) {
  const summary = `${item.workType} · ${item.role} · ${item.path}`
  const props = {
    '요약': { title: [{ text: { content: summary } }] },
    '업무구분': { rich_text: [{ text: { content: item.workType } }] },
    '경로': { rich_text: [{ text: { content: item.path } }] },
    '역할': { select: { name: item.role } },
    '상태': { select: { name: item.status || '미정' } },
  }
  if (item.label) props['라벨'] = { rich_text: [{ text: { content: item.label } }] }
  if (item.required != null) props['필수'] = { checkbox: !!item.required }
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers,
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  })
  const data = await res.json()
  if (!data.id) console.error(`Insert failed:`, summary, JSON.stringify(data).slice(0, 200))
  else console.log(`  + ${summary}`)
}

// Extract cleaned paths from a raw manual path string, mirroring the frontend
// normalizeManualPath(). Placeholder IZYYNNNN_... is kept as-is here so the
// UI can substitute per-project when rendering.
function normalizePath(raw) {
  const parts = raw
    .split(/\n|(?:\s+or\s+)|(?:\s+또는\s+)|(?:\s*\+\s*)/gi)
    .map((s) => s.trim())
    .filter(Boolean)

  const out = []
  let currentProjectRoot = ''
  for (const partRaw of parts) {
    let part = partRaw.replace(/^GDrive\s+/i, 'Google Drive/')
    const cutIdx = part.search(/[{|(]/)
    if (cutIdx >= 0) part = part.substring(0, cutIdx)
    part = part.replace(/\/+$/, '').trim()
    if (!part) continue

    const projectRootMatch = part.match(/^(01_PROJECT\/(?:IZYYNNNN_[^/]+|IZ\d+_[^/]+)\/)/)
    if (projectRootMatch) {
      currentProjectRoot = projectRootMatch[1]
    } else if (currentProjectRoot && /^\d{2}_[^/]+/.test(part)) {
      part = `${currentProjectRoot}${part}`
    }

    if (
      part.startsWith('01_PROJECT/') ||
      part.startsWith('02_ASSET/') ||
      part.startsWith('Google Drive/') ||
      part.startsWith('99_ARCHIVE/')
    ) {
      out.push(part)
    }
  }

  return out
}

// Load the static manuals from workTypeManuals.ts by parsing it as TS text.
// Simpler: require a JSON version we generate inline.
// Here we import via compiled JS by eval'ing the export; since the TS file
// is already shipped as TS, we use a small helper that matches the data
// format already in use. For this script we keep the source of truth in the
// existing TS file and re-derive the 32 manuals by hand-coding the minimal
// references we want to seed. However, that would duplicate data.
//
// Practical approach: dynamically import the TS file via `tsx`/ts-node is
// heavy; instead we use a lightweight AST-less grep:
//   - read workTypeManuals.ts as text
//   - use `new Function` with a sanitized slice? risky.
//
// Safer: precompile to a JSON sidecar with a one-line `node -e` using
// `typescript` package. Not assumed installed.
//
// Decision: spawn `tsc --noEmit false --module commonjs --outDir .tmp` then
// require the output. To keep dependencies zero, we instead read the file
// text and extract the assets/workBasePath/publish entries with a targeted
// regex-based parser. It's brittle but fine for a one-off seed.

function loadManualsFromTs(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  // Extract the array literal between `WORK_TYPE_MANUALS: WorkTypeManual[] = [` and the matching closing `]`
  const startIdx = text.indexOf('WORK_TYPE_MANUALS: WorkTypeManual[] = [')
  if (startIdx < 0) throw new Error('WORK_TYPE_MANUALS not found')
  let i = text.indexOf('[', startIdx)
  let depth = 0
  let end = -1
  for (; i < text.length; i++) {
    const ch = text[i]
    if (ch === '[') depth++
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) throw new Error('array end not found')
  const arrayText = text.slice(text.indexOf('[', startIdx), end + 1)

  // Replace known asset shortcut identifiers with inline placeholders so they
  // parse as string literals. We only need path/label/required/note for seed.
  const shortcuts = {
    ASSET_LOGO: { path: '02_ASSET/01_로고/', label: '로고', required: true },
    ASSET_FONT: { path: '02_ASSET/05_폰트/', label: '폰트', required: true },
    ASSET_BRAND: { path: '02_ASSET/04_브랜드-가이드/', label: '브랜드 가이드', required: true },
    ASSET_RENDER: { path: '02_ASSET/02_제품-렌더링/', label: '제품 렌더 이미지' },
    ASSET_PHOTO: { path: '02_ASSET/07_제품사진-원본/', label: '제품 실사진' },
    ASSET_3D: { path: '02_ASSET/03_3D-소스/', label: '3D CAD' },
    ASSET_TPL_SNS: { path: '02_ASSET/06_템플릿/01_SNS/', label: 'SNS 템플릿' },
    ASSET_TPL_PRINT: { path: '02_ASSET/06_템플릿/02_인쇄/', label: '인쇄 템플릿' },
    ASSET_TPL_PPT: { path: '02_ASSET/06_템플릿/03_PPT/', label: 'PPT 템플릿' },
    ASSET_TPL_VIDEO: { path: '02_ASSET/06_템플릿/04_영상/', label: '영상 템플릿' },
    ASSET_TPL_INDD: { path: '02_ASSET/06_템플릿/05_InDesign/', label: 'InDesign 템플릿' },
    ASSET_STOCK_IMG: { path: '02_ASSET/11_스톡-라이선스/01_이미지/', label: '스톡 이미지' },
    ASSET_STOCK_VIDEO: { path: '02_ASSET/11_스톡-라이선스/02_영상/', label: '스톡 영상' },
    ASSET_STOCK_AUDIO: { path: '02_ASSET/11_스톡-라이선스/03_오디오/', label: '스톡 오디오' },
    ASSET_STOCK_MOTION: { path: '02_ASSET/11_스톡-라이선스/04_모션/', label: '스톡 모션' },
    ASSET_PACKAGE: { path: '02_ASSET/08_패키지/', label: '패키지 원본' },
    ASSET_CLINIC: { path: '02_ASSET/09_임상/', label: '임상 사진' },
    ASSET_SPEAKER: { path: '02_ASSET/10_연자/', label: '연자 프로필' },
  }

  // Transform TS to JSON-ish: remove `as const`, comments, trailing commas
  // in objects (valid in TS/JS but json wants quoted keys); we'll use eval.
  let src = arrayText
  // Strip TS type annotations like `: WorkTypeManual[]` (already outside array)
  // Strip single-line comments
  src = src.replace(/\/\/[^\n]*/g, '')
  // Strip multi-line comments
  src = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Strip `const` in case

  // Build the evaluation context with shortcut objects + CAUTION_* constants
  // We provide neutral placeholders for CAUTION_* since they're strings.
  const ctxKeys = [
    ...Object.keys(shortcuts),
    'CAUTION_GDRIVE_NO_SOURCE', 'CAUTION_WIP_TAG', 'CAUTION_CMYK',
    'CAUTION_STOCK_COPY', 'CAUTION_MEDIA_CACHE',
  ]
  const ctxValues = [
    ...ctxKeys.slice(0, Object.keys(shortcuts).length).map((k) => shortcuts[k]),
    'CAUTION_GDRIVE_NO_SOURCE', 'CAUTION_WIP_TAG', 'CAUTION_CMYK',
    'CAUTION_STOCK_COPY', 'CAUTION_MEDIA_CACHE',
  ]

  // eslint-disable-next-line no-new-func
  const fn = new Function(...ctxKeys, `return (${src})`)
  return fn(...ctxValues)
}

async function main() {
  const dbId = await createDB('업무별 참조 폴더', {
    '요약': { title: {} },
    '업무구분': { rich_text: {} },
    '경로': { rich_text: {} },
    '라벨': { rich_text: {} },
    '역할': {
      select: {
        options: [
          { name: 'ASSET', color: 'purple' },
          { name: 'WORK', color: 'green' },
          { name: 'PUB', color: 'blue' },
        ],
      },
    },
    '상태': {
      select: {
        options: [
          { name: '미정', color: 'default' },
          { name: '논의중', color: 'yellow' },
          { name: '확정', color: 'green' },
        ],
      },
    },
    '필수': { checkbox: {} },
    '확정일': { date: {} },
    '메모': { rich_text: {} },
  })

  console.log('\n--- 32개 매뉴얼에서 초기 참조 폴더 시드 중 ---')
  const tsPath = path.resolve(__dirname, '..', 'src', 'features', 'nasGuide', 'workTypeManuals.ts')
  const manuals = loadManualsFromTs(tsPath)

  let total = 0
  for (const manual of manuals) {
    const workType = manual.workType
    // ASSET rows
    if (Array.isArray(manual.assets)) {
      for (const asset of manual.assets) {
        const paths = normalizePath(asset.path || '')
        for (const p of paths) {
          await insertRef(dbId, {
            workType, path: p, role: 'ASSET',
            status: '미정',
            label: asset.label || '',
            required: asset.required !== false,
          })
          total++
        }
      }
    }
    // WORK row(s)
    if (manual.workBasePath) {
      const paths = normalizePath(manual.workBasePath)
      for (const p of paths) {
        await insertRef(dbId, {
          workType, path: p, role: 'WORK', status: '미정',
        })
        total++
      }
    }
    // PUB row
    if (manual.publish?.path) {
      const paths = normalizePath(manual.publish.path)
      for (const p of paths) {
        await insertRef(dbId, {
          workType, path: p, role: 'PUB', status: '미정',
        })
        total++
      }
    }
  }

  console.log(`\nDone! DB ID: ${dbId}`)
  console.log(`Total seeded: ${total} rows across ${manuals.length} manuals`)
  console.log('wrangler.toml에 추가하세요:')
  console.log(`NOTION_WORK_MANUAL_REFS_DB_ID = "${dbId.replace(/-/g, '')}"`)
}

main()
