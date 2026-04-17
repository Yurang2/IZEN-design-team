const fs = require('fs')
const path = require('path')

const envPath = path.resolve(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) process.env[match[1].trim()] = match[2].trim()
}

const TOKEN = process.env.NOTION_TOKEN
if (!TOKEN) { console.error('NOTION_TOKEN not set in .env.local'); process.exit(1) }

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

async function main() {
  const dbId = await createDB('NAS 변경 이력', {
    '요약': { title: {} },
    '대상종류': {
      select: {
        options: [
          { name: '폴더', color: 'blue' },
          { name: '업무매뉴얼', color: 'purple' },
        ],
      },
    },
    '대상': { rich_text: {} },
    '액션': {
      select: {
        options: [
          { name: '미정→논의중', color: 'yellow' },
          { name: '논의중→확정', color: 'green' },
          { name: '확정→잠금해제', color: 'red' },
          { name: '초안→확정', color: 'green' },
          { name: '확정→초안', color: 'red' },
          { name: '초안→보류', color: 'orange' },
          { name: '보류→초안', color: 'default' },
        ],
      },
    },
    '이전값': { rich_text: {} },
    '새값': { rich_text: {} },
    '사유': { rich_text: {} },
  })

  console.log(`\nDone! DB ID: ${dbId}`)
  console.log('wrangler.toml에 추가하세요:')
  console.log(`NOTION_CHANGE_HISTORY_DB_ID = "${dbId.replace(/-/g, '')}"`)
}

main()
