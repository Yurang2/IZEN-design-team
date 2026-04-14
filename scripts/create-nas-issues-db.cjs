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
    '문제점': { title: [{ text: { content: item.issue } }] },
    '영역': { select: { name: item.area } },
    '해결여부': { select: { name: item.resolved } },
    '처리방법': { rich_text: [{ text: { content: item.solution } }] },
  }
  if (item.source) {
    props['출처'] = { select: { name: item.source } }
  }
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers,
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  })
  const data = await res.json()
  if (!data.id) console.error(`Insert failed:`, item.issue)
  else console.log(`  + ${item.issue}`)
}

async function main() {
  const dbId = await createDB('NAS 구조 논의 이슈 트래커', {
    '문제점': { title: {} },
    '영역': {
      select: {
        options: [
          { name: '00_기획-문서', color: 'gray' },
          { name: '01_인쇄물', color: 'green' },
          { name: '02_부스', color: 'blue' },
          { name: '03_디지털', color: 'purple' },
          { name: '04_영상', color: 'red' },
          { name: '05_사진', color: 'pink' },
          { name: '06_현장수집', color: 'orange' },
          { name: 'ASSET', color: 'yellow' },
          { name: 'LIBRARY', color: 'brown' },
          { name: '파일명', color: 'default' },
          { name: '프로젝트 코드', color: 'default' },
          { name: '전체 구조', color: 'default' },
          { name: '업로드 도구', color: 'default' },
        ],
      },
    },
    '해결여부': {
      select: {
        options: [
          { name: '해결', color: 'green' },
          { name: '미결', color: 'red' },
          { name: '논의중', color: 'yellow' },
        ],
      },
    },
    '처리방법': { rich_text: {} },
    '출처': {
      select: {
        options: [
          { name: '팀장 피드백', color: 'blue' },
          { name: '팀원 피드백', color: 'green' },
          { name: '설계 과정', color: 'gray' },
        ],
      },
    },
  })

  // 해결된 이슈
  const resolved = [
    { issue: '06_3D 폴더 불필요', area: '전체 구조', resolved: '해결', solution: '삭제. 부스→02_부스, 영상→04_영상, 렌더링→03_디지털에 분산', source: '설계 과정' },
    { issue: '07_판촉물 폴더 불필요', area: '전체 구조', resolved: '해결', solution: '삭제. 견적서→00_기획-문서, 디자인→01_인쇄물/03_디지털에 흡수', source: '설계 과정' },
    { issue: '08_키트-패킹 폴더 불필요', area: '전체 구조', resolved: '해결', solution: '삭제. NAS 46만 파일에서 해당 용어 0건', source: '설계 과정' },
    { issue: '09_카달로그 — 프로젝트 안에서 별도 번호 불필요', area: '전체 구조', resolved: '해결', solution: '삭제. 01_인쇄물/카달로그/에 통합', source: '설계 과정' },
    { issue: '10_최종납품 폴더 — 이중관리 문제', area: '전체 구조', resolved: '해결', solution: '삭제. LIBRARY가 정본, 납품 추적은 Notion DB + Google Drive', source: '설계 과정' },
    { issue: '프로젝트 분류 (행사/전시/기타) 나눌지', area: '전체 구조', resolved: '해결', solution: 'Flat 유지. 속성 분류는 Notion DB에서 관리. 폴더 나누면 링크 깨짐 위험', source: '설계 과정' },
    { issue: '프로젝트 코드 형식', area: '프로젝트 코드', resolved: '해결', solution: 'IZYYNNNN_프로젝트명 (착수 연도 기준). 월 구분 제거', source: '설계 과정' },
    { issue: '정기/비정기 번호 구분', area: '프로젝트 코드', resolved: '해결', solution: '구분 없이 순번. "정기" 속성은 Notion DB에서 관리', source: '설계 과정' },
    { issue: 'v/Rev 버전 체계', area: '파일명', resolved: '해결', solution: 'v=PROJECT 소스, Rev=LIBRARY 배포. 보통 다른 파일 형식. v→Rev 매핑은 업로드 도구에서 자동 추적', source: '설계 과정' },
    { issue: 'variant 네이밍 (회사소개영상 Full/Short)', area: '파일명', resolved: '해결', solution: '콘텐츠명에 하이픈: 회사소개영상-Full, 사용법영상-기본편', source: '설계 과정' },
    { issue: 'ASSET에서 카달로그-마스터 제거', area: 'ASSET', resolved: '해결', solution: '작업파일은 PROJECT에. ASSET은 편집하지 않는 소스만', source: '설계 과정' },
    { issue: '촬영원본 — 외부/자체 구분', area: '05_사진', resolved: '해결', solution: '자체촬영/ + 수신/(외주/타팀)으로 분리', source: '설계 과정' },
    { issue: '선별/보정 분리', area: '05_사진', resolved: '해결', solution: '선별(고르기)과 보정(편집)은 별도 폴더', source: '설계 과정' },
    { issue: '현장수집 레퍼런스 위치', area: '06_현장수집', resolved: '해결', solution: '06_현장수집 폴더 신설. 사진+영상 구분 없이 통째로', source: '설계 과정' },
    { issue: '멀티파일 업로드 (캐러셀)', area: '업로드 도구', resolved: '해결', solution: '순번 자동부여: _01, _02, _03. 시작번호 설정 가능', source: '설계 과정' },
    { issue: '수정사유 누적 기록', area: '업로드 도구', resolved: '해결', solution: 'Notion rich_text에 \\n으로 누적. [날짜 파일명] 사유 형식', source: '설계 과정' },
  ]

  // 미결 이슈 (팀장 피드백)
  const pending = [
    { issue: '수령 문서 파일명 변경할지', area: '00_기획-문서', resolved: '미결', solution: '[수신]_ 접두사만 붙이고 원본 유지 제안 — 팀 확정 필요', source: '팀장 피드백' },
    { issue: '디자인 기획안(시안/컨셉) 어디에 넣을지', area: '00_기획-문서', resolved: '미결', solution: '해당 산출물 폴더에 v01로 넣는 방안 제안 — 팀 확정 필요', source: '팀장 피드백' },
    { issue: '03_디지털 내 이미지 파일 정의 불분명', area: '03_디지털', resolved: '미결', solution: 'SNS-이미지/SNS-업로드 → SNS/ 하나로 통합 제안', source: '팀장 피드백' },
    { issue: '영상 편집-프로젝트 명칭 불친절', area: '04_영상', resolved: '미결', solution: '"작업파일/"로 변경 제안', source: '팀장 피드백' },
    { issue: '영상 수신 — 촬영본인지 완성본인지 불분명', area: '04_영상', resolved: '미결', solution: '수신/외주(완성본) + 수신/타팀(촬영본)으로 이미 구분 — 추가 명시 필요?', source: '팀장 피드백' },
    { issue: '영상 항목별 구분 필요 (오프닝/후기/사전홍보)', area: '04_영상', resolved: '미결', solution: '파일명으로 구분 vs 하위폴더로 구분 — 팀 확정 필요', source: '팀장 피드백' },
    { issue: '최종본 폴더 — 어떤 영상의 최종본인지 혼란', area: '04_영상', resolved: '미결', solution: '"모든 영상의 최종 렌더 모음"으로 정의. 파일명에 영상 종류 포함', source: '팀장 피드백' },
    { issue: 'ASSET 제품렌더링 — 기본/연출 구분 필요', area: 'ASSET', resolved: '미결', solution: '기본/(흰배경 기술용) + 연출/(배경 있는 그래픽용) 하위폴더 제안', source: '팀장 피드백' },
    { issue: 'ASSET에 연자/딜러 로고 관리', area: 'ASSET', resolved: '미결', solution: '01_로고/에 연자/ + 딜러/ 하위폴더 추가 제안', source: '팀장 피드백' },
    { issue: 'LIBRARY 브로슈어/리플렛/포스터 구분 어려움', area: 'LIBRARY', resolved: '미결', solution: '"인쇄물" 하나로 통합 제안 — 팀 확정 필요', source: '팀장 피드백' },
    { issue: 'LIBRARY 영상 구분 기준', area: 'LIBRARY', resolved: '미결', solution: '현재 제품홍보/사용법/브랜드홍보/SNS — 팀 확정 필요', source: '팀장 피드백' },
    { issue: '사진 보정 구분 필요한가', area: '05_사진', resolved: '미결', solution: '선별+보정 합쳐서 "편집완료/" 하나로 할지 — 팀 확정 필요', source: '팀장 피드백' },
  ]

  console.log('\n--- 해결된 이슈 ---')
  for (const item of resolved) await insertItem(dbId, item)
  console.log('\n--- 미결 이슈 ---')
  for (const item of pending) await insertItem(dbId, item)

  console.log(`\nDone! DB ID: ${dbId}`)
}

main()
