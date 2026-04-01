// ---------------------------------------------------------------------------
// File & Folder Naming Guide
// ---------------------------------------------------------------------------
// 모든 내용은 더미 데이터입니다. 팀 합의 후 상수만 교체하면 됩니다.
// ---------------------------------------------------------------------------

// ---- Types ----

type FolderNode = {
  name: string
  children?: FolderNode[]
}

type NamingRule = {
  label: string
  pattern: string
  detail: string
}

type NamingExample = {
  bad: string
  good: string
  reason: string
}

type VersionRule = {
  stage: string
  format: string
  example: string
}

// ---- Dummy Data: Folder Structure ----

const FOLDER_STRUCTURE: FolderNode = {
  name: '2026_춘계학술대회',
  children: [
    {
      name: '01_기획',
      children: [
        { name: '요청서' },
        { name: '레퍼런스' },
      ],
    },
    {
      name: '02_디자인',
      children: [
        { name: '시안' },
        { name: '작업파일' },
      ],
    },
    {
      name: '03_최종',
      children: [
        { name: '인쇄용' },
        { name: '웹용' },
        { name: 'SNS용' },
      ],
    },
    {
      name: '04_아카이브',
    },
  ],
}

// ---- Dummy Data: Naming Rules ----

const NAMING_RULES: NamingRule[] = [
  {
    label: '기본 패턴',
    pattern: 'YYMMDD_프로젝트약칭_파일설명_버전.확장자',
    detail: '날짜를 맨 앞에 두어 정렬했을 때 시간순으로 나열됩니다.',
  },
  {
    label: '날짜 형식',
    pattern: 'YYMMDD (6자리)',
    detail: '260401 = 2026년 4월 1일. 연도 2자리로 간결하게.',
  },
  {
    label: '구분자',
    pattern: '언더스코어 (_)',
    detail: '공백, 하이픈 대신 언더스코어로 통일합니다. 공백은 시스템 간 호환 문제를 일으킬 수 있습니다.',
  },
  {
    label: '프로젝트 약칭',
    pattern: '2~4글자 한글 약칭',
    detail: '팀 내 공용으로 쓰는 약칭. 예: 춘계학회, 가을축제, 신입OT',
  },
]

// ---- Dummy Data: Good vs Bad Examples ----

const NAMING_EXAMPLES: NamingExample[] = [
  {
    bad: '포스터 최종_진짜최종_수정본(3).psd',
    good: '260401_춘계학회_포스터A1_v3.psd',
    reason: '버전이 명확하고, 날짜로 시점을 알 수 있습니다.',
  },
  {
    bad: '배너.ai',
    good: '260328_춘계학회_현수막_가로6m_v1.ai',
    reason: '어떤 행사의 어떤 배너인지, 규격까지 파일명에 포함.',
  },
  {
    bad: 'KakaoTalk_Photo_2026-04-01.jpg',
    good: '260401_춘계학회_현장사진_로비_001.jpg',
    reason: '촬영 장소와 순번을 넣어 정리가 쉬워집니다.',
  },
  {
    bad: '리플렛 앞면 final edit 수정완료.pdf',
    good: '260405_춘계학회_리플렛_앞면_final.pdf',
    reason: '승인된 최종본은 final 하나만 씁니다.',
  },
]

// ---- Dummy Data: Version Rules ----

const VERSION_RULES: VersionRule[] = [
  { stage: '작업 초안', format: 'v1', example: '260401_춘계학회_포스터_v1.ai' },
  { stage: '수정본', format: 'v2, v3, ...', example: '260403_춘계학회_포스터_v3.ai' },
  { stage: '최종 승인본', format: 'final', example: '260405_춘계학회_포스터_final.ai' },
  { stage: '승인 후 소폭 수정', format: 'final_fix1', example: '260406_춘계학회_포스터_final_fix1.ai' },
]

// ---- Dummy Data: Team Agreement Items ----

const TEAM_AGREEMENT_ITEMS = [
  {
    topic: '프로젝트 폴더 최상위 구조',
    options: '연도_행사명 (2026_춘계학술대회) vs 행사명_연도 (춘계학술대회_2026)',
  },
  {
    topic: '날짜 포맷',
    options: 'YYMMDD (260401) vs YYYYMMDD (20260401)',
  },
  {
    topic: '프로젝트 약칭 목록',
    options: '팀 공용 약칭 사전을 만들어 통일 (예: 춘계학회, 가을축제)',
  },
  {
    topic: '하위 폴더 깊이 제한',
    options: '최대 3단계까지? 4단계까지?',
  },
  {
    topic: '완료 프로젝트 아카이브 규칙',
    options: '몇 개월 후 아카이브? 아카이브 위치는?',
  },
  {
    topic: '공용 에셋 저장 위치',
    options: '로고, 템플릿, 폰트 등 팀 공유 자산의 고정 위치',
  },
  {
    topic: '사진/영상 원본 관리',
    options: '원본은 별도 드라이브? 프로젝트 폴더 내?',
  },
]

// ---- Render helpers ----

function renderFolderTree(node: FolderNode, prefix: string, isLast: boolean, isRoot: boolean): string[] {
  const connector = isRoot ? '' : isLast ? '└── ' : '├── '
  const lines: string[] = [`${prefix}${connector}${node.name}/`]
  if (node.children) {
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ')
    node.children.forEach((child, i) => {
      lines.push(...renderFolderTree(child, childPrefix, i === node.children!.length - 1, false))
    })
  }
  return lines
}

// ---- Component ----

export function FileGuideView() {
  const treeLines = renderFolderTree(FOLDER_STRUCTURE, '', true, true)

  return (
    <section className="workflowView" aria-label="파일/폴더 가이드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">File &amp; Folder Guide</span>
          <h2>파일 &amp; 폴더 가이드</h2>
          <p>
            팀 공용 파일/폴더 명명 규칙입니다.
            아래 내용은 초안이며, 팀 합의를 거쳐 확정합니다.
          </p>
        </div>
      </header>

      <div className="workflowGrid">
        {/* Card 1: Folder Structure */}
        <article className="workflowCard workflowCardWide">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Folder Structure</span>
              <h3>프로젝트 폴더 구조</h3>
            </div>
          </div>
          <p>모든 프로젝트는 아래 구조를 기본으로 합니다. 필요에 따라 하위 폴더를 추가할 수 있습니다.</p>
          <pre className="fileGuideTree">{treeLines.join('\n')}</pre>
          <div className="workflowCheckpointGrid">
            <article className="workflowCheckpoint">
              <h4>01_기획</h4>
              <p>요청서, 업무협조전, 레퍼런스 이미지 등 기획 단계 자료</p>
            </article>
            <article className="workflowCheckpoint">
              <h4>02_디자인</h4>
              <p>시안(컨셉 단계), 작업파일(본작업 AI/PSD 등)</p>
            </article>
            <article className="workflowCheckpoint">
              <h4>03_최종</h4>
              <p>승인된 최종 산출물. 인쇄용/웹용/SNS용으로 분류</p>
            </article>
            <article className="workflowCheckpoint">
              <h4>04_아카이브</h4>
              <p>프로젝트 완료 후 참고용으로 보관하는 과거 버전 및 원본</p>
            </article>
          </div>
        </article>

        {/* Card 2: Naming Rules */}
        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Naming Rules</span>
              <h3>파일명 규칙</h3>
            </div>
          </div>
          <div className="workflowTimeline">
            {NAMING_RULES.map((rule) => (
              <article key={rule.label} className="workflowStep">
                <div className="workflowStepNumber" style={{ fontSize: 11, lineHeight: 1.2, textAlign: 'center' }}>
                  {rule.label}
                </div>
                <div className="workflowStepBody">
                  <h4 className="fileGuidePattern">{rule.pattern}</h4>
                  <p>{rule.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </article>

        {/* Card 3: Version Rules */}
        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Version Control</span>
              <h3>버전 표기법</h3>
            </div>
          </div>
          <p>숫자 버전(v1, v2...)으로 진행하다가, 최종 승인 시 final로 전환합니다.</p>
          <div className="workflowCheckpointGrid">
            {VERSION_RULES.map((rule) => (
              <article key={rule.stage} className="workflowCheckpoint">
                <h4>{rule.stage} &rarr; <code className="fileGuideCode">{rule.format}</code></h4>
                <p className="fileGuideExample">{rule.example}</p>
              </article>
            ))}
          </div>
        </article>

        {/* Card 4: Good vs Bad Examples */}
        <article className="workflowCard workflowCardWide">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Before &amp; After</span>
              <h3>이렇게 바꿔주세요</h3>
            </div>
          </div>
          <div className="workflowCheckpointGrid">
            {NAMING_EXAMPLES.map((ex) => (
              <article key={ex.good} className="workflowCheckpoint">
                <p>
                  <span className="fileGuideBad">{ex.bad}</span>
                </p>
                <p>
                  <span className="fileGuideGood">{ex.good}</span>
                </p>
                <p>{ex.reason}</p>
              </article>
            ))}
          </div>
        </article>

        {/* Card 5: Team Agreement Items */}
        <article className="workflowCard workflowCardWide fileGuideAgreementCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Team Agreement</span>
              <h3>팀 합의 필요 항목</h3>
            </div>
          </div>
          <p>아래 항목은 팀원 전체가 논의하여 결정해야 합니다. 결정된 내용은 이 페이지에 반영됩니다.</p>
          <div className="workflowCheckpointGrid">
            {TEAM_AGREEMENT_ITEMS.map((item) => (
              <article key={item.topic} className="workflowCheckpoint fileGuideAgreementItem">
                <h4>{item.topic}</h4>
                <p>{item.options}</p>
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
