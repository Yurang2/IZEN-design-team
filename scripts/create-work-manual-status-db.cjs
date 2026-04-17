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
    console.log(`Created: ${title} -> ${data.id}`)
    return data.id
  } else {
    console.error(`Failed:`, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

async function insertItem(dbId, item) {
  const props = {
    '업무구분': { title: [{ text: { content: item.workType } }] },
    '상태': { select: { name: item.status } },
    '카테고리': { select: { name: item.category } },
  }
  if (item.fixedAt) {
    props['확정일'] = { date: { start: item.fixedAt } }
  }
  if (item.note) {
    props['메모'] = { rich_text: [{ text: { content: item.note } }] }
  }
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  })
  const data = await res.json()
  if (!data.id) console.error(`Insert failed:`, item.workType, JSON.stringify(data).slice(0, 200))
  else console.log(`  + ${item.workType} (${item.status})`)
}

async function main() {
  const dbId = await createDB('업무 매뉴얼 상태', {
    '업무구분': { title: {} },
    '상태': {
      select: {
        options: [
          { name: '확정', color: 'green' },
          { name: '초안', color: 'default' },
          { name: '보류', color: 'yellow' },
        ],
      },
    },
    '카테고리': {
      select: {
        options: [
          { name: 'A 인쇄물', color: 'orange' },
          { name: 'B 부스', color: 'blue' },
          { name: 'C 디지털', color: 'purple' },
          { name: 'D 영상', color: 'red' },
          { name: 'E 사진', color: 'pink' },
          { name: 'F 3D·렌더링', color: 'brown' },
          { name: 'G 패키지·굿즈', color: 'yellow' },
          { name: 'H 기획·문서', color: 'gray' },
          { name: 'I 분류 보류', color: 'default' },
        ],
      },
    },
    '확정일': { date: {} },
    '메모': { rich_text: {} },
  })

  // 초기 32건 — 모두 '초안'으로 시작. 사용자가 UI에서 '확정'으로 토글.
  const items = [
    // A 인쇄물
    { workType: '포스터(1p)', category: 'A 인쇄물', status: '초안' },
    { workType: '리플렛(1~4p)', category: 'A 인쇄물', status: '초안' },
    { workType: '브로슈어(6~24p)', category: 'A 인쇄물', status: '초안' },
    { workType: '카탈로그', category: 'A 인쇄물', status: '초안' },
    { workType: '배너 & 현수막', category: 'A 인쇄물', status: '초안' },
    { workType: 'certificate', category: 'A 인쇄물', status: '초안' },
    { workType: '패키지', category: 'A 인쇄물', status: '초안' },
    { workType: 'IFU', category: 'A 인쇄물', status: '초안' },
    { workType: '키트중판', category: 'A 인쇄물', status: '초안' },

    // B 부스
    { workType: '부스디자인', category: 'B 부스', status: '초안' },
    { workType: '부스 그래픽 디자인', category: 'B 부스', status: '초안' },
    { workType: '스크린', category: 'B 부스', status: '초안' },

    // C 디지털
    { workType: 'PPT', category: 'C 디지털', status: '초안' },
    { workType: 'SNS 홍보 이미지', category: 'C 디지털', status: '초안' },
    { workType: 'SNS 업로드', category: 'C 디지털', status: '초안' },
    { workType: '홈페이지 업데이트', category: 'C 디지털', status: '초안' },
    { workType: '홈페이지 팝업', category: 'C 디지털', status: '초안' },
    { workType: '뉴스레터', category: 'C 디지털', status: '초안' },

    // D 영상
    { workType: '영상 편집', category: 'D 영상', status: '초안' },
    { workType: '2D 모션 영상', category: 'D 영상', status: '초안' },
    { workType: '3D 모션 영상', category: 'D 영상', status: '초안' },
    { workType: 'SNS 홍보 영상', category: 'D 영상', status: '초안' },

    // E 사진
    { workType: '사진 및 영상 촬영', category: 'E 사진', status: '초안' },
    { workType: '사진정리', category: 'E 사진', status: '초안' },

    // F 3D·렌더링
    { workType: '3D 렌더링', category: 'F 3D·렌더링', status: '초안' },

    // G 패키지·굿즈
    { workType: '판촉물&굿즈&선물', category: 'G 패키지·굿즈', status: '초안' },
    { workType: '마케팅 마테리얼', category: 'G 패키지·굿즈', status: '초안' },
    { workType: '마케팅 마테리얼 패킹', category: 'G 패키지·굿즈', status: '초안' },

    // H 기획·문서
    { workType: '미팅', category: 'H 기획·문서', status: '초안' },
    { workType: '품의서&지출결의서', category: 'H 기획·문서', status: '초안' },
    { workType: '보고서&제안서&서류작업', category: 'H 기획·문서', status: '초안' },

    // I 분류 보류
    { workType: '이벤트', category: 'I 분류 보류', status: '초안' },
  ]

  console.log('\n--- 초기 32건 생성 (모두 초안) ---')
  for (const item of items) await insertItem(dbId, item)

  console.log(`\nDone! DB ID: ${dbId}`)
  console.log('wrangler.toml에 다음 줄을 추가하세요:')
  console.log(`NOTION_WORK_MANUAL_STATUS_DB_ID = "${dbId.replace(/-/g, '')}"`)
}

main()
