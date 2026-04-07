const fs = require('fs')
const path = require('path')

// Load .env.local
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
    console.log(`${title}: ${data.id}`)
    return data.id
  } else {
    console.error(`Failed to create ${title}:`, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

async function main() {
  console.log('Creating video DB...')
  const videoDbId = await createDB('영상 DB', {
    '영상명': { title: {} },
    '영상 코드': { rich_text: {} },
    '카테고리': { select: { options: [
      { name: '회사소개', color: 'blue' },
      { name: '제품특장점', color: 'green' },
      { name: '클린임플란트', color: 'purple' },
      { name: '행사 스케치(가로)', color: 'orange' },
      { name: '행사 스케치(세로)', color: 'yellow' },
      { name: '유저 인터뷰', color: 'pink' },
      { name: '행사 티저/홍보', color: 'red' },
      { name: '교육 영상', color: 'gray' },
    ] } },
    '원본 해상도': { select: { options: [
      { name: '1920x1080', color: 'blue' },
      { name: '1080x1920', color: 'green' },
      { name: '3840x2160', color: 'purple' },
    ] } },
    '변환 버전': { multi_select: { options: [
      { name: '7:3', color: 'blue' },
      { name: '2:1', color: 'green' },
      { name: '3:2', color: 'orange' },
      { name: '1:1', color: 'yellow' },
    ] } },
    '출연자': { rich_text: {} },
    '리비전': { number: {} },
    '최종 수정일': { date: {} },
    '최근 변경사항': { rich_text: {} },
    '제작자': { rich_text: {} },
    '최종 수정자': { rich_text: {} },
    '제작일': { date: {} },
    '상태': { select: { options: [
      { name: '사용중', color: 'green' },
      { name: '제작중', color: 'yellow' },
      { name: '보관', color: 'gray' },
      { name: '폐기', color: 'red' },
    ] } },
    '구글 드라이브 링크': { url: {} },
    'NAS 경로': { rich_text: {} },
    '파일명': { rich_text: {} },
    '메모': { rich_text: {} },
  })

  console.log('\nCreating subtitle revision DB...')
  const revisionDbId = await createDB('자막 리비전 DB', {
    '리비전명': { title: {} },
    '영상': { relation: { database_id: videoDbId, single_property: {} } },
    '리비전 번호': { number: {} },
    '수정일': { date: {} },
    '수정자': { rich_text: {} },
    '변경 요약': { rich_text: {} },
    '스냅샷 데이터': { rich_text: {} },
  })

  console.log('\n--- wrangler.toml에 아래 값을 입력하세요 ---')
  console.log(`NOTION_SUBTITLE_VIDEO_DB_ID = "${videoDbId.replace(/-/g, '')}"`)
  console.log(`NOTION_SUBTITLE_REVISION_DB_ID = "${revisionDbId.replace(/-/g, '')}"`)
}

main().catch(console.error)
