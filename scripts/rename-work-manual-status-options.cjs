// 업무 매뉴얼 상태 DB의 select 옵션 이름을 변경
// 초안 → 미정, 보류 → 논의중 (확정은 그대로)
// 옵션 id를 유지하며 name만 바꾸면 기존 row 값이 자동으로 마이그레이션됨.

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

const DB_ID = '345c1cc7-ec27-81ca-b38d-fb10d5e93369' // NOTION_WORK_MANUAL_STATUS_DB_ID

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

async function main() {
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers })
  const db = await dbRes.json()
  if (!db.id) { console.error('DB retrieve failed:', db); process.exit(1) }

  const statusProp = db.properties['상태']
  if (!statusProp?.select) { console.error('상태 select property not found'); process.exit(1) }

  const rename = { '초안': '미정', '보류': '논의중' }
  const colorRemap = { '미정': 'default', '논의중': 'yellow', '확정': 'green' }

  const newOptions = statusProp.select.options.map((opt) => {
    const newName = rename[opt.name] ?? opt.name
    return {
      id: opt.id, // keep id so row values migrate automatically
      name: newName,
      color: colorRemap[newName] ?? opt.color,
    }
  })

  console.log('Old options:', statusProp.select.options.map((o) => o.name))
  console.log('New options:', newOptions.map((o) => o.name))

  const patchRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      properties: {
        '상태': { select: { options: newOptions } },
      },
    }),
  })
  const patched = await patchRes.json()
  if (patched.id) {
    console.log('\nDone! status options renamed. Row values migrated automatically.')
  } else {
    console.error('Patch failed:', JSON.stringify(patched, null, 2))
    process.exit(1)
  }
}

main()
