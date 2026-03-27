import fs from 'node:fs/promises'

const NOTION_API = 'https://api.notion.com/v1'

async function readEnv() {
  const raw = await fs.readFile('worker/.dev.vars', 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/g)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i <= 0) continue
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return env
}

const EQUIPMENT = [
  { name: 'R5 Mark II', category: '카메라', owner: 'IZEN', qty: 1, parent: '', note: '', order: 1 },
  { name: '5D Mark IV', category: '카메라', owner: 'IZEN', qty: 1, parent: '', note: '', order: 2 },
  { name: 'R5 Mark II', category: '카메라', owner: '개인', qty: 1, parent: '', note: '', order: 3 },
  { name: 'RF 24-105mm F4 L IS USM', category: '렌즈', owner: 'IZEN', qty: 1, parent: '', note: '', order: 4 },
  { name: 'RF 70-200mm F4 L IS USM', category: '렌즈', owner: 'IZEN', qty: 1, parent: '', note: '', order: 5 },
  { name: 'EF 17-40mm F4 L USM', category: '렌즈', owner: 'IZEN', qty: 1, parent: '', note: '', order: 6 },
  { name: '탐론 28-75mm', category: '렌즈', owner: 'IZEN', qty: 1, parent: '', note: '', order: 7 },
  { name: 'RF 24-105mm F4 L IS USM', category: '렌즈', owner: '개인', qty: 1, parent: '', note: '', order: 8 },
  { name: 'EL-5', category: '순간광', owner: 'IZEN', qty: 1, parent: '', note: '', order: 9 },
  { name: 'Godox V1', category: '순간광', owner: '개인', qty: 1, parent: '', note: '', order: 10 },
  { name: 'Sirui SVM-165+VA-5', category: '모노포드', owner: 'IZEN', qty: 1, parent: '', note: '', order: 11 },
  { name: '이노엘 VM70CK+F60', category: '모노포드', owner: '개인', qty: 1, parent: '', note: '', order: 12 },
  { name: '(미확인)', category: '삼각대', owner: 'IZEN', qty: null, parent: '', note: '추후 확인', order: 13 },
  { name: 'LP-E6P', category: '배터리', owner: 'IZEN', qty: 3, parent: 'R5 Mark II 호환', note: '', order: 14 },
  { name: '가품 배터리', category: '배터리', owner: 'IZEN', qty: 4, parent: '5D Mark IV 호환', note: '', order: 15 },
  { name: 'LP-E6P', category: '배터리', owner: '개인', qty: 3, parent: 'R5 Mark II 호환', note: '', order: 16 },
  { name: '캐논 충전기', category: '충전기', owner: 'IZEN', qty: 2, parent: '', note: '', order: 17 },
  { name: '캐논 충전기', category: '충전기', owner: '개인', qty: 1, parent: '', note: '', order: 18 },
  { name: '선이스트 얼티메이트 프로 화이트 CFexpress Type B 1TB', category: 'CF카드', owner: 'IZEN', qty: 1, parent: '', note: '', order: 19 },
  { name: '노바칩스 512GB', category: 'CF카드', owner: '개인', qty: 1, parent: '', note: '', order: 20 },
  { name: '샌디스크 256GB', category: 'SD카드', owner: 'IZEN', qty: 1, parent: '', note: '', order: 21 },
  { name: '샌디스크 16GB', category: 'SD카드', owner: 'IZEN', qty: 1, parent: '', note: '', order: 22 },
  { name: '(미확인)', category: 'SD카드', owner: '개인', qty: null, parent: '', note: '추후 확인', order: 23 },
  { name: 'Sandisk CFexpress 리더기 F451', category: '리더기', owner: 'IZEN', qty: 1, parent: '', note: '', order: 24 },
  { name: '(미확인)', category: '리더기', owner: '개인', qty: null, parent: '', note: '추후 확인', order: 25 },
  { name: '렌즈 블로워', category: '블로워', owner: 'IZEN', qty: 1, parent: '', note: '', order: 26 },
  { name: '렌즈 블로워', category: '블로워', owner: '개인', qty: 1, parent: '', note: '', order: 27 },
  { name: '마이크', category: '마이크', owner: 'IZEN', qty: 2, parent: '', note: '', order: 28 },
]

function toProperties(item) {
  const props = {
    '장비명': { title: [{ text: { content: item.name } }] },
    '카테고리': { select: { name: item.category } },
    '소유': { select: { name: item.owner } },
    '정렬순서': { number: item.order },
  }
  if (item.qty != null) {
    props['수량'] = { number: item.qty }
  }
  if (item.parent) {
    props['귀속장비'] = { rich_text: [{ text: { content: item.parent } }] }
  }
  if (item.note) {
    props['비고'] = { rich_text: [{ text: { content: item.note } }] }
  }
  return props
}

async function main() {
  const env = await readEnv()
  const token = env.NOTION_TOKEN
  const dbId = env.NOTION_EQUIPMENT_DB_ID

  if (!token) { console.error('NOTION_TOKEN not found in worker/.dev.vars'); process.exit(1) }
  if (!dbId) { console.error('NOTION_EQUIPMENT_DB_ID not found in worker/.dev.vars'); process.exit(1) }

  const headers = {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  }

  // Step 1: Set up DB columns
  console.log('Setting up database columns...')
  const schemaRes = await fetch(`${NOTION_API}/databases/${dbId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      properties: {
        '카테고리': {
          select: {
            options: [
              { name: '카메라', color: 'blue' },
              { name: '렌즈', color: 'purple' },
              { name: '순간광', color: 'yellow' },
              { name: '모노포드', color: 'orange' },
              { name: '삼각대', color: 'brown' },
              { name: '배터리', color: 'red' },
              { name: '충전기', color: 'pink' },
              { name: 'CF카드', color: 'green' },
              { name: 'SD카드', color: 'green' },
              { name: '리더기', color: 'gray' },
              { name: '블로워', color: 'default' },
              { name: '마이크', color: 'blue' },
            ],
          },
        },
        '소유': {
          select: {
            options: [
              { name: 'IZEN', color: 'blue' },
              { name: '개인', color: 'orange' },
            ],
          },
        },
        '수량': { number: { format: 'number' } },
        '귀속장비': { rich_text: {} },
        '물품 위치': { rich_text: {} },
        '비고': { rich_text: {} },
        '정렬순서': { number: { format: 'number' } },
      },
    }),
  })

  if (!schemaRes.ok) {
    const err = await schemaRes.json()
    console.error('Failed to set up columns:', err.message || JSON.stringify(err))
    process.exit(1)
  }
  console.log('Columns created successfully.\n')

  // Step 2: Seed data
  console.log(`Creating ${EQUIPMENT.length} equipment entries...\n`)

  let success = 0
  let failed = 0

  for (const item of EQUIPMENT) {
    try {
      const res = await fetch(`${NOTION_API}/pages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          parent: { database_id: dbId },
          properties: toProperties(item),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        console.error(`  FAIL [${item.order}] ${item.name} (${item.owner}):`, err.message || err.code)
        failed++
        continue
      }

      console.log(`  OK   [${item.order}] ${item.name} (${item.owner}) - ${item.category}`)
      success++

      // Notion API rate limit: ~3 req/sec
      await new Promise(r => setTimeout(r, 350))
    } catch (err) {
      console.error(`  ERR  [${item.order}] ${item.name}:`, err.message)
      failed++
    }
  }

  console.log(`\nDone: ${success} created, ${failed} failed`)
}

main()
