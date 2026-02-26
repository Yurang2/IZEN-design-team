const BASE_URL = 'https://izen-design-team.a98763969.workers.dev/api'
const TARGET_SET_NAME = '이젠'

const TARGET_KEYWORDS = [
  '플라즈맥스',
  '플란',
  '아미르',
  '아이젠',
  '시덱스',
  '스토리보드',
  '대행사',
  '정팀장',
  '방문객',
  '케이스',
  '리드타임',
  'PM',
  '벤치마킹',
  'SIDEX',
  '로우데이터',
  '요구사항',
  '목적',
  '용도',
  '치의신보',
  '보고서',
  '담당자',
  '식음료',
  '설문지',
  '스케치',
  '레이아웃',
  '부스',
  'DP',
  '리플렛',
  '전단지',
  '배너',
  '엑스배너',
  '행잉',
  '포토존',
  '이재원',
  '부가르',
  '알마스',
  '알피라도',
  '김동빈',
  '김연화',
  '김민호',
  '구학모',
  '김영선',
  '정시우',
  '연구원',
  '신용진',
  '김동우',
  '소장님',
  '김병국',
  '엄형용',
  '천유진',
  '전선민',
  '임지완',
  '최요한',
  '이버금',
  '조정훈',
  '김지은',
  '강수민',
  '이다경',
  '정현지',
  '김주석',
  '우시코프',
  '야오',
  '이합',
  '벤지',
  '인쇄',
  '심포지엄',
  '세미나',
  '카작',
  '우즈벡',
  '레퍼런스',
  '다이렉트',
  '본사',
  '신사옥',
  '메타',
  '엔드유저',
  '치과',
  '타포린백',
  'IFU',
  '미니',
  '스크류',
  '슬리브',
  '핸즈온',
  'RPM',
  '토크',
  '대표님',
  '팀장님',
  '대리님',
  '유저',
  '딜러',
  '전시회',
  '카덱스',
  '덴탈엑스포',
  '해외영업',
  '연구소',
  '디지털',
  '티블랭크',
  '티링크',
  '티아이 블랭크',
  '티아이 링크',
  '스캔바디',
  '컴포넌트',
  '스트레이트',
  '랩 아날로그',
  '트랜스퍼',
  '픽업',
  '코핑',
  '임프레션',
  'CCM',
  '프리밀링',
  '앵글드',
  '시멘티드',
  '힐링',
  '템포러리',
  '커버스크류',
  '시스템',
  '클린임플란트',
  '사이너스 콤비네이션',
  '프로스테틱',
  '슈퍼와이드',
  '이지서저리',
  '심플',
  '테이퍼',
  '서저리',
  '가이드',
  '키트',
  '드릴',
  '짐머',
  '스트라우만',
  '마케팅 매테리얼',
  'IACE',
  '플로우차트',
  '바이오템',
  '코웰메디',
  '덴츠플라이',
  '디오',
  '릴리비스',
  '네오',
  '덴티움',
  '덴티스',
  '메가젠',
  '오스템',
  '이젠임플란트',
  '이젠',
  '메타약품',
  '플러스',
  '멀티',
  '와이드',
  '레귤러',
  '내로우',
  '헥스',
  '킹더미',
  'IDS',
  'CIS',
  '시공',
  '임상',
  '에이덱',
  '어버트먼트',
  '픽스쳐',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function api(path, init = {}, retries = 6) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, init)
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { raw: text }
    }

    if (response.ok) {
      return payload
    }

    const shouldRetry = response.status === 429 || response.status >= 500
    if (shouldRetry && attempt < retries) {
      const retryAfter = Number(response.headers.get('Retry-After') || '0')
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 600 + attempt * 400
      await sleep(waitMs)
      continue
    }

    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`)
  }

  throw new Error('unexpected_api_retry_exit')
}

function uniq(values) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const v = String(value || '').trim()
    if (!v) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

async function main() {
  const targets = uniq(TARGET_KEYWORDS)
  const targetSet = new Set(targets)

  const setList = await api('/keyword-sets')
  let setRow = (setList?.sets || []).find((row) => row?.name === TARGET_SET_NAME) || null
  if (!setRow) {
    const created = await api('/keyword-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: TARGET_SET_NAME, isActive: true }),
    })
    setRow = created?.set || null
  }
  if (!setRow?.id) throw new Error('izen_set_not_found_or_create_failed')

  const setId = setRow.id
  const loaded = await api(`/keywords?setId=${encodeURIComponent(setId)}`)
  const rows = Array.isArray(loaded?.keywords) ? loaded.keywords : []

  let removedCorrupted = 0
  for (const row of rows) {
    const phrase = String(row?.phrase || '').trim()
    if (!phrase) continue
    if (!/^\?+$/.test(phrase)) continue
    await api(`/keywords?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' })
    removedCorrupted += 1
    await sleep(40)
  }

  const refreshed = await api(`/keywords?setId=${encodeURIComponent(setId)}`)
  const currentRows = Array.isArray(refreshed?.keywords) ? refreshed.keywords : []
  const byPhrase = new Map()
  for (const row of currentRows) {
    const phrase = String(row?.phrase || '').trim()
    if (!phrase) continue
    const list = byPhrase.get(phrase) || []
    list.push(row)
    byPhrase.set(phrase, list)
  }

  let removedDuplicate = 0
  for (const [phrase, list] of byPhrase.entries()) {
    if (list.length <= 1) continue
    for (let i = 1; i < list.length; i += 1) {
      await api(`/keywords?id=${encodeURIComponent(list[i].id)}`, { method: 'DELETE' })
      removedDuplicate += 1
      await sleep(40)
    }
    byPhrase.set(phrase, [list[0]])
  }

  let added = 0
  for (const phrase of targets) {
    if (byPhrase.has(phrase)) continue
    await api('/keywords', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setId, phrase, weight: 8, tags: null }),
    })
    added += 1
    await sleep(40)
  }

  const afterAdd = await api(`/keywords?setId=${encodeURIComponent(setId)}`)
  const afterRows = Array.isArray(afterAdd?.keywords) ? afterAdd.keywords : []
  const afterMap = new Map()
  for (const row of afterRows) {
    const phrase = String(row?.phrase || '').trim()
    if (!phrase) continue
    if (!afterMap.has(phrase)) afterMap.set(phrase, row)
  }

  let patchedWeight = 0
  for (const phrase of targets) {
    const row = afterMap.get(phrase)
    if (!row) continue
    if (Number(row.weight) === 8) continue
    await api('/keywords', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, weight: 8 }),
    })
    patchedWeight += 1
    await sleep(40)
  }

  const finalLoad = await api(`/keywords?setId=${encodeURIComponent(setId)}`)
  const finalRows = Array.isArray(finalLoad?.keywords) ? finalLoad.keywords : []
  const finalPhrases = new Set(finalRows.map((row) => String(row?.phrase || '').trim()).filter(Boolean))
  const missing = targets.filter((phrase) => !finalPhrases.has(phrase))
  const corruptedRemaining = finalRows.filter((row) => /^\?+$/.test(String(row?.phrase || '').trim())).length

  console.log(
    JSON.stringify(
      {
        setId,
        targetCount: targets.length,
        finalCount: finalRows.length,
        removedCorrupted,
        removedDuplicate,
        added,
        patchedWeight,
        missingCount: missing.length,
        missingSample: missing.slice(0, 20),
        corruptedRemaining,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

