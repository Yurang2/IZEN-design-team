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

// Same parent page as the other DBs (subtitle video/revision)
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
    console.error(`Failed to create ${title}:`, JSON.stringify(data, null, 2))
    process.exit(1)
  }
}

async function insertItems(dbId, items) {
  for (const item of items) {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          '항목명': { title: [{ text: { content: item.name } }] },
          '카테고리': { select: { name: item.category } },
          '순서': { number: item.order },
          ...(item.desc ? { '설명': { rich_text: [{ text: { content: item.desc } }] } } : {}),
        },
      }),
    })
    const data = await res.json()
    if (!data.id) {
      console.error(`Failed to insert "${item.name}":`, JSON.stringify(data, null, 2))
    }
  }
}

const CHECKLIST_ITEMS = [
  // 사전 준비
  { category: '사전 준비', order: 1, name: '레퍼런스 영상 수집 및 방향 확정' },
  { category: '사전 준비', order: 2, name: '촬영 원본 소스 정리 및 넘버링' },
  { category: '사전 준비', order: 3, name: '사용할 BGM / SFX 소스 확보' },
  { category: '사전 준비', order: 4, name: '영상 포맷 확인 (해상도·프레임레이트·코덱)' },
  { category: '사전 준비', order: 5, name: '작업 폴더 구조 세팅 (프로젝트명_날짜)' },
  // 키감 / Easing
  { category: '키감 / Easing', order: 1, name: '모든 키프레임에 이징 적용 여부 확인 (리니어 금지)' },
  { category: '키감 / Easing', order: 2, name: 'ease-in/out 방향이 동선·의도와 일치하는지 점검' },
  { category: '키감 / Easing', order: 3, name: '텍스트 등장/퇴장에 오버슈트 또는 바운스 적용 검토' },
  { category: '키감 / Easing', order: 4, name: '슬로우 구간에서 스피드 그래프 곡선 자연스러운지 확인' },
  { category: '키감 / Easing', order: 5, name: '빠른 컷 전환 시 모션블러 on/off 의도적 선택' },
  // 완급 / Pacing
  { category: '완급 / Pacing', order: 1, name: '인트로 → 본편 → 아웃트로 호흡 구분이 명확한지' },
  { category: '완급 / Pacing', order: 2, name: '같은 길이 컷이 연속되지 않도록 리듬 변화 부여' },
  { category: '완급 / Pacing', order: 3, name: '하이라이트 구간 전에 "쉬는 컷" 배치 여부' },
  { category: '완급 / Pacing', order: 4, name: '음악 비트와 컷 전환 포인트 싱크 확인' },
  { category: '완급 / Pacing', order: 5, name: '전체 러닝타임이 목적(SNS/발표/아카이브)에 적합한지' },
  // 컬러 / 색보정
  { category: '컬러 / 색보정', order: 1, name: '전체 톤 통일 (LUT 또는 수동 그레이딩)' },
  { category: '컬러 / 색보정', order: 2, name: '피부톤 자연스러운지 확인' },
  { category: '컬러 / 색보정', order: 3, name: '실내↔실외 전환 시 색온도 보정' },
  { category: '컬러 / 색보정', order: 4, name: '블랙/화이트 레벨 클리핑 없는지 확인' },
  // 타이포 / 자막
  { category: '타이포 / 자막', order: 1, name: '세이프 마진 안에 텍스트 배치' },
  { category: '타이포 / 자막', order: 2, name: '자막 폰트·크기·색상 일관성 유지' },
  { category: '타이포 / 자막', order: 3, name: '자막 노출 시간 충분한지 (읽기 속도 기준)' },
  { category: '타이포 / 자막', order: 4, name: '오타·맞춤법 최종 검수' },
  { category: '타이포 / 자막', order: 5, name: '자막 배경 처리 (그림자/박스) 가독성 확인' },
  // 사운드 / 오디오
  { category: '사운드 / 오디오', order: 1, name: 'BGM 볼륨 vs 내레이션/현장음 밸런스' },
  { category: '사운드 / 오디오', order: 2, name: '음악 페이드인/아웃 자연스러운지' },
  { category: '사운드 / 오디오', order: 3, name: '컷 전환 시 오디오 팝/클릭 노이즈 제거' },
  { category: '사운드 / 오디오', order: 4, name: '최종 오디오 레벨 -6dB ~ -3dB 피크 기준 확인' },
  { category: '사운드 / 오디오', order: 5, name: '무음 구간이 의도적인지 점검' },
  // 마무리 / Export
  { category: '마무리 / Export', order: 1, name: '워터마크·로고 삽입 위치 및 타이밍 확인' },
  { category: '마무리 / Export', order: 2, name: '인트로/아웃트로 브랜딩 요소 포함 여부' },
  { category: '마무리 / Export', order: 3, name: '최종 렌더 설정 (H.264/ProRes, 비트레이트) 확인' },
  { category: '마무리 / Export', order: 4, name: '렌더 후 처음~끝 풀 재생으로 최종 확인' },
  { category: '마무리 / Export', order: 5, name: '모든 프리뷰 요소 최종본 갱신 확인(스톡 이미지/오디오)' },
  { category: '마무리 / Export', order: 6, name: 'SNS 게시용 본문 및 해시태그 생성' },
  { category: '마무리 / Export', order: 7, name: '파일명 네이밍 규칙 준수 (kebab-case, 버전 표기)' },
  { category: '마무리 / Export', order: 8, name: '납품 경로에 업로드 및 팀 공유 완료' },
]

async function main() {
  console.log('Creating 영상 작업 매뉴얼 DB...')
  const dbId = await createDB('영상 작업 매뉴얼', {
    '항목명': { title: {} },
    '카테고리': {
      select: {
        options: [
          { name: '사전 준비', color: 'gray' },
          { name: '키감 / Easing', color: 'blue' },
          { name: '완급 / Pacing', color: 'green' },
          { name: '컬러 / 색보정', color: 'orange' },
          { name: '타이포 / 자막', color: 'purple' },
          { name: '사운드 / 오디오', color: 'pink' },
          { name: '마무리 / Export', color: 'red' },
        ],
      },
    },
    '순서': { number: {} },
    '설명': { rich_text: {} },
  })

  console.log(`\nDB ID: ${dbId}`)
  console.log(`\nwrangler.toml에 추가:`)
  console.log(`NOTION_VIDEO_MANUAL_DB_ID = "${dbId.replace(/-/g, '')}"`)

  console.log(`\n${CHECKLIST_ITEMS.length}개 항목 삽입 중...`)
  await insertItems(dbId, CHECKLIST_ITEMS)
  console.log('완료!')
}

main().catch((err) => { console.error(err); process.exit(1) })
