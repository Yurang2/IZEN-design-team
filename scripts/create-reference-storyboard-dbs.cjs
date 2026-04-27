const fs = require('fs')
const path = require('path')

const envPath = path.resolve(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  for (const line of envContent.split(/\r?\n/g)) {
    const match = line.match(/^([^#=]+)=(.+)$/)
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '')
  }
}

const TOKEN = process.env.NOTION_TOKEN
const TASK_DB_ID = process.env.NOTION_TASK_DB_ID || '23ec1cc7ec2781afabb6ca25fb3ee56c'
const PARENT_PAGE_ID = '23ec1cc7-ec27-803a-9567-f6b5ebc7cb36'

if (!TOKEN) {
  console.error('NOTION_TOKEN is required in .env.local')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
}

function taskRelationProperty() {
  if (!TASK_DB_ID) return { rich_text: {} }
  return {
    relation: {
      database_id: TASK_DB_ID,
      type: 'single_property',
      single_property: {},
    },
  }
}

async function createDatabase(title, properties) {
  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      parent: { page_id: PARENT_PAGE_ID },
      title: [{ text: { content: title } }],
      properties,
    }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.id) {
    console.error(`Failed to create ${title}`)
    console.error(JSON.stringify(body, null, 2))
    process.exit(1)
  }
  console.log(`${title}: ${body.id}`)
  return body.id
}

async function main() {
  const referenceDbId = await createDatabase('레퍼런스 자료함', {
    제목: { title: {} },
    '관련 업무': taskRelationProperty(),
    프로젝트명: { rich_text: {} },
    '출처 유형': {
      select: {
        options: [
          { name: 'image', color: 'blue' },
          { name: 'youtube', color: 'red' },
          { name: 'link', color: 'green' },
          { name: 'other', color: 'gray' },
        ],
      },
    },
    '레퍼런스 형태': {
      select: {
        options: [
          { name: '단순저장', color: 'gray' },
          { name: '모작', color: 'purple' },
          { name: '아이디어', color: 'yellow' },
        ],
      },
    },
    링크: { url: {} },
    '첨부 이미지': { files: {} },
    메모: { rich_text: {} },
    태그: { multi_select: {} },
    등록일: { date: {} },
  })

  const storyboardDbId = await createDatabase('스토리보드 문서', {
    제목: { title: {} },
    '관련 업무': taskRelationProperty(),
    프로젝트명: { rich_text: {} },
    버전명: { rich_text: {} },
    메모: { rich_text: {} },
    '스토리보드 JSON': { rich_text: {} },
    '내보내기 파일명 기록': { rich_text: {} },
    수정일: { date: {} },
  })

  console.log('\nAdd these to worker/wrangler.toml or Cloudflare Worker variables:')
  console.log(`NOTION_REFERENCE_DB_ID = "${referenceDbId.replace(/-/g, '')}"`)
  console.log(`NOTION_STORYBOARD_DB_ID = "${storyboardDbId.replace(/-/g, '')}"`)
  console.log(`\nRelated task DB: ${TASK_DB_ID}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
