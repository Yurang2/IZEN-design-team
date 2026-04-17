// 시드 당시 느슨한 normalizePath 때문에 들어간 불량 경로 refs를 archive.
// 유효 기준: path가 01_PROJECT/, 02_ASSET/, Google Drive/, 99_ARCHIVE/ 중 하나로 시작하고
// 특수 구분자("→", "...", "(", ")") 가 없어야 한다.

const fs = require('fs')
const path = require('path')

const envPath = path.resolve(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const TOKEN = process.env.NOTION_TOKEN
const DB_ID = '345c1cc7-ec27-81ed-b2a2-c4ff8b5c944e'

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

const VALID_ROOT = /^(01_PROJECT|02_ASSET|Google Drive|99_ARCHIVE)\//
function isValidPath(p) {
  if (!p) return false
  if (!VALID_ROOT.test(p)) return false
  if (p.includes('→')) return false
  if (p.includes('/.../')) return false // IZYYNNNN_... 형태는 ok, 단독 .../는 불량
  if (p.includes('(') || p.includes(')')) return false
  return true
}

async function main() {
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
  console.log(`Total refs: ${all.length}`)

  const getText = (p) => {
    if (!p) return ''
    if (p.type === 'title') return (p.title ?? []).map((t) => t.plain_text ?? '').join('')
    if (p.type === 'rich_text') return (p.rich_text ?? []).map((t) => t.plain_text ?? '').join('')
    return ''
  }

  const bad = []
  for (const page of all) {
    const props = page.properties ?? {}
    const p = getText(props['경로'])
    if (!isValidPath(p)) bad.push({ id: page.id, path: p, workType: getText(props['업무구분']) })
  }
  console.log(`Invalid refs: ${bad.length}`)
  for (const b of bad) console.log(`  - ${b.workType} | ${JSON.stringify(b.path)}`)

  for (const b of bad) {
    await fetch(`https://api.notion.com/v1/pages/${b.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ archived: true }),
    })
    console.log(`  archived: ${b.workType} | ${b.path}`)
    await new Promise((r) => setTimeout(r, 360))
  }
  console.log('Done.')
}

main()
