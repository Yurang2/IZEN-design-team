// 기존 DB(업무별 참조 폴더)에 32개 매뉴얼의 참조 폴더를 시드.
// 이미 일부가 있으면 건너뜀(같은 workType+path+role 조합 중복 방지).

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const envPath = path.resolve(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const TOKEN = process.env.NOTION_TOKEN
if (!TOKEN) { console.error('NOTION_TOKEN not set'); process.exit(1) }

const DB_ID = '345c1cc7-ec27-81ed-b2a2-c4ff8b5c944e'

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

// Bundle TS manuals to CJS on demand
const cjsPath = path.resolve(__dirname, '..', '.tmp', 'workTypeManuals.cjs')
if (!fs.existsSync(cjsPath)) {
  execSync(
    'npx esbuild src/features/nasGuide/workTypeManuals.ts --bundle --platform=node --format=cjs --outfile=.tmp/workTypeManuals.cjs',
    { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' },
  )
}

const { WORK_TYPE_MANUALS } = require(cjsPath)

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

async function fetchAllExisting() {
  const all = []
  let cursor
  while (true) {
    const body = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
    const data = await res.json()
    all.push(...(data.results ?? []))
    if (!data.has_more) break
    cursor = data.next_cursor
  }
  return all
}

function getPlain(p) {
  if (!p) return ''
  if (p.type === 'title') return (p.title ?? []).map((t) => t.plain_text ?? '').join('')
  if (p.type === 'rich_text') return (p.rich_text ?? []).map((t) => t.plain_text ?? '').join('')
  if (p.type === 'select') return p.select?.name ?? ''
  return ''
}

async function insertRef(item) {
  const summary = `${item.workType} · ${item.role} · ${item.path}`
  const props = {
    '요약': { title: [{ text: { content: summary } }] },
    '업무구분': { rich_text: [{ text: { content: item.workType } }] },
    '경로': { rich_text: [{ text: { content: item.path } }] },
    '역할': { select: { name: item.role } },
    '상태': { select: { name: '미정' } },
  }
  if (item.label) props['라벨'] = { rich_text: [{ text: { content: item.label } }] }
  if (item.required != null) props['필수'] = { checkbox: !!item.required }
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST', headers,
    body: JSON.stringify({ parent: { database_id: DB_ID }, properties: props }),
  })
  let data
  try { data = await res.json() } catch { data = {} }
  if (!data.id) console.error(`   ! failed:`, summary, JSON.stringify(data).slice(0, 150))
  else console.log(`  + ${summary}`)
  await new Promise((r) => setTimeout(r, 380)) // respect Notion ~3 req/sec
  return !!data.id
}

async function main() {
  console.log(`Loaded ${WORK_TYPE_MANUALS.length} manuals from TS`)
  console.log('Fetching existing refs...')
  const existing = await fetchAllExisting()
  const existingKeys = new Set()
  for (const row of existing) {
    const p = row.properties
    const k = `${getPlain(p['업무구분'])}|${getPlain(p['경로'])}|${getPlain(p['역할'])}`
    existingKeys.add(k)
  }
  console.log(`Existing: ${existingKeys.size}`)

  let added = 0
  let skipped = 0
  for (const manual of WORK_TYPE_MANUALS) {
    const workType = manual.workType
    // ASSET rows
    for (const asset of manual.assets ?? []) {
      for (const p of normalizePath(asset.path || '')) {
        const k = `${workType}|${p}|ASSET`
        if (existingKeys.has(k)) { skipped++; continue }
        const ok = await insertRef({
          workType, path: p, role: 'ASSET',
          label: asset.label || '',
          required: asset.required !== false,
        })
        if (ok) { existingKeys.add(k); added++ }
      }
    }
    // WORK
    for (const p of normalizePath(manual.workBasePath || '')) {
      const k = `${workType}|${p}|WORK`
      if (existingKeys.has(k)) { skipped++; continue }
      const ok = await insertRef({ workType, path: p, role: 'WORK' })
      if (ok) { existingKeys.add(k); added++ }
    }
    // PUB
    if (manual.publish?.path) {
      for (const p of normalizePath(manual.publish.path)) {
        const k = `${workType}|${p}|PUB`
        if (existingKeys.has(k)) { skipped++; continue }
        const ok = await insertRef({ workType, path: p, role: 'PUB' })
        if (ok) { existingKeys.add(k); added++ }
      }
    }
  }

  console.log(`\nDone. added=${added} skipped=${skipped}`)
}

main()
