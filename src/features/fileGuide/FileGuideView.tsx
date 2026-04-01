// ---------------------------------------------------------------------------
// File & Folder Naming Guide
// ---------------------------------------------------------------------------
// 모든 내용은 더미 데이터입니다. 팀 합의 후 상수만 교체하면 됩니다.
// ---------------------------------------------------------------------------

// ---- Types ----

type FolderNode = {
  name: string
  comment?: string
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

type ExtensionGuide = {
  extensions: string
  category: string
  location: string
  note: string
}

// ---- Dummy Data: Folder Structure ----

const PROJECT_FOLDER: FolderNode = {
  name: '2026_춘계학술대회',
  children: [
    {
      name: '00_기획',
      children: [
        { name: '요청서' },
        { name: '레퍼런스' },
      ],
    },
    {
      name: '01_인쇄물',
      comment: '포스터, 현수막, 리플렛 등',
      children: [
        {
          name: '포스터',
          children: [
            { name: '_src', comment: '.ai .psd .indd 작업파일' },
            { name: '_export', comment: '.pdf .tiff 출력용' },
          ],
        },
        {
          name: '현수막',
          children: [
            { name: '_src' },
            { name: '_export' },
          ],
        },
        {
          name: '리플렛',
          children: [
            { name: '_src' },
            { name: '_export' },
          ],
        },
      ],
    },
    {
      name: '02_디지털',
      comment: '웹배너, SNS 카드 등',
      children: [
        {
          name: '웹배너',
          children: [
            { name: '_src' },
            { name: '_export', comment: '.png .jpg .gif' },
          ],
        },
        {
          name: 'SNS',
          children: [
            { name: '_src' },
            { name: '_export' },
          ],
        },
      ],
    },
    {
      name: '03_영상',
      children: [
        { name: '_src', comment: '.prproj .aep 편집 프로젝트' },
        { name: '_export', comment: '.mp4 .mov 최종 렌더' },
        { name: '_소스클립', comment: '촬영 원본, 스톡 영상' },
      ],
    },
    {
      name: '04_사진',
      children: [
        { name: '_원본', comment: '.raw .cr2 .nef 카메라 원본' },
        { name: '_보정', comment: '.jpg .tiff 보정 완료본' },
        { name: '_선별', comment: '최종 선별된 사진' },
      ],
    },
    {
      name: '05_아카이브',
      comment: '폐기 시안, 과거 버전 등',
    },
  ],
}

const SHARED_ASSETS_FOLDER: FolderNode = {
  name: '_공용에셋',
  comment: '프로젝트 공통 자산 (모든 프로젝트에서 참조)',
  children: [
    { name: '로고', comment: '회사/브랜드 로고 원본' },
    { name: '템플릿', comment: '반복 사용하는 레이아웃 템플릿' },
    { name: '폰트', comment: '팀 공용 폰트 파일' },
    { name: '아이콘_소스', comment: '공용 아이콘, 일러스트' },
  ],
}

// ---- Dummy Data: Extension Guide ----

const EXTENSION_GUIDE: ExtensionGuide[] = [
  { extensions: '.ai', category: '벡터 작업', location: '_src/', note: 'Illustrator 원본. 로고, 포스터, 인포그래픽' },
  { extensions: '.psd', category: '비트맵 작업', location: '_src/', note: 'Photoshop 원본. 사진 합성, 배너' },
  { extensions: '.indd', category: '편집 레이아웃', location: '_src/', note: 'InDesign 원본. 리플렛, 브로셔, 다페이지' },
  { extensions: '.prproj', category: '영상 편집', location: '03_영상/_src/', note: 'Premiere Pro 프로젝트' },
  { extensions: '.aep', category: '모션 그래픽', location: '03_영상/_src/', note: 'After Effects 프로젝트' },
  { extensions: '.pdf (인쇄)', category: '인쇄 출력물', location: '01_인쇄물/_export/', note: 'CMYK, 재단선 포함, 고해상도' },
  { extensions: '.pdf (웹)', category: '디지털 배포', location: '02_디지털/_export/', note: 'RGB, 경량화, 웹 최적화' },
  { extensions: '.png .jpg', category: '웹/SNS 이미지', location: '02_디지털/_export/', note: 'PNG=투명 배경, JPG=사진/배경 있는 이미지' },
  { extensions: '.gif', category: '움직이는 이미지', location: '02_디지털/_export/', note: 'SNS용 짧은 애니메이션' },
  { extensions: '.tiff', category: '고해상도 이미지', location: '_export/', note: '인쇄 납품 또는 사진 보정 최종본' },
  { extensions: '.mp4', category: '영상 최종', location: '03_영상/_export/', note: 'H.264 코덱, 범용 재생' },
  { extensions: '.mov', category: '영상 고품질', location: '03_영상/_export/', note: 'ProRes 등 고품질 납품용' },
  { extensions: '.raw .cr2 .nef', category: '사진 원본', location: '04_사진/_원본/', note: '카메라 RAW. 절대 삭제 금지' },
  { extensions: '.eps .svg', category: '벡터 호환', location: '_src/ 또는 _export/', note: '외부 납품용 벡터. 로고 배포 시 사용' },
]

// ---- Dummy Data: Naming Rules ----

const NAMING_RULES: NamingRule[] = [
  {
    label: '기본 패턴',
    pattern: 'YYMMDD_프로젝트약칭_산출물_설명_버전.확장자',
    detail: '날짜를 맨 앞에 두어 정렬 시 시간순. 언더스코어(_)로 구분하면 자동 파싱이 가능합니다.',
  },
  {
    label: '날짜 형식',
    pattern: 'YYMMDD (6자리)',
    detail: '260401 = 2026년 4월 1일. 연도 2자리로 간결하게.',
  },
  {
    label: '구분자',
    pattern: '언더스코어 (_)',
    detail: '공백, 하이픈 대신 언더스코어로 통일. 공백은 시스템 간 호환 문제를 일으킬 수 있습니다.',
  },
  {
    label: '프로젝트 약칭',
    pattern: '2~4글자 한글 약칭',
    detail: '팀 내 공용 약칭 사전에서 선택. 예: 춘계학회, 가을축제, 신입OT',
  },
  {
    label: '산출물 유형',
    pattern: '포스터, 현수막, 리플렛, 웹배너, SNS카드 등',
    detail: '무엇을 만들었는지 한눈에 파악할 수 있도록.',
  },
  {
    label: '규격/용도',
    pattern: 'A1, 가로6m, 1080x1080 등',
    detail: '같은 산출물이라도 규격이 다르면 파일명에 포함. 선택 사항.',
  },
]

// ---- Dummy Data: Good vs Bad Examples ----

const NAMING_EXAMPLES: NamingExample[] = [
  {
    bad: '포스터 최종_진짜최종_수정본(3).psd',
    good: '260401_춘계학회_포스터_A1_v3.psd',
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
  {
    bad: 'IMG_4821.CR2',
    good: '260401_춘계학회_RAW_001.cr2',
    reason: '카메라 기본 파일명 대신 프로젝트 정보를 포함.',
  },
  {
    bad: 'Premiere Project.prproj',
    good: '260401_춘계학회_리캡영상_v2.prproj',
    reason: '영상 프로젝트 파일도 동일한 규칙 적용.',
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
    topic: '_src / _export 폴더명',
    options: '현재 제안대로? 또는 다른 이름? (원본/출력물, source/output 등)',
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
    options: '로고, 템플릿, 폰트 등 팀 공유 자산의 고정 위치와 접근 방법',
  },
  {
    topic: '사진/영상 원본 보존 기간',
    options: 'RAW 파일 보존 기간? 별도 외장드라이브? 클라우드?',
  },
]

// ---- Render helpers ----

function renderFolderTree(node: FolderNode, prefix: string, isLast: boolean, isRoot: boolean): string[] {
  const connector = isRoot ? '' : isLast ? '└── ' : '├── '
  const comment = node.comment ? `  ← ${node.comment}` : ''
  const lines: string[] = [`${prefix}${connector}${node.name}/${comment}`]
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
  const projectTree = renderFolderTree(PROJECT_FOLDER, '', true, true)
  const sharedTree = renderFolderTree(SHARED_ASSETS_FOLDER, '', true, true)

  return (
    <section className="workflowView" aria-label="파일/폴더 가이드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">File &amp; Folder Guide</span>
          <h2>파일 &amp; 폴더 가이드</h2>
          <p>
            팀 공용 파일/폴더 명명 규칙입니다.
            아래 내용은 초안이며, 팀 합의를 거쳐 확정합니다.
            핵심 원칙: <strong>작업파일(_src)과 출력물(_export)을 분리</strong>합니다.
          </p>
        </div>
      </header>

      <div className="workflowGrid">
        {/* Card 1: Project Folder Structure */}
        <article className="workflowCard workflowCardWide">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Folder Structure</span>
              <h3>프로젝트 폴더 구조</h3>
            </div>
          </div>
          <p>
            모든 프로젝트는 <strong>산출물 유형별</strong>로 1차 분류하고,
            각 산출물 안에서 <code className="fileGuideCode">_src</code>(작업파일)와 <code className="fileGuideCode">_export</code>(출력물)를 분리합니다.
          </p>
          <pre className="fileGuideTree">{projectTree.join('\n')}</pre>
        </article>

        {/* Card 2: Shared Assets */}
        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Shared Assets</span>
              <h3>공용 에셋 폴더</h3>
            </div>
          </div>
          <p>프로젝트와 무관하게 팀 전체가 공유하는 자산입니다. 프로젝트 폴더 바깥에 위치합니다.</p>
          <pre className="fileGuideTree">{sharedTree.join('\n')}</pre>
        </article>

        {/* Card 3: Extension Guide */}
        <article className="workflowCard">
          <div className="workflowSectionHeader">
            <div>
              <span className="workflowSectionEyebrow">Extension Guide</span>
              <h3>확장자별 저장 위치</h3>
            </div>
          </div>
          <p>어떤 파일이 어디로 가는지 한눈에 확인할 수 있습니다.</p>
          <div className="guideTableWrap">
            <table className="fileGuideTable">
              <thead>
                <tr>
                  <th>확장자</th>
                  <th>분류</th>
                  <th>저장 위치</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {EXTENSION_GUIDE.map((row) => (
                  <tr key={row.extensions}>
                    <td><code className="fileGuideCode">{row.extensions}</code></td>
                    <td>{row.category}</td>
                    <td><code className="fileGuideCode">{row.location}</code></td>
                    <td>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Card 4: Naming Rules */}
        <article className="workflowCard workflowCardWide">
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

        {/* Card 5: Version Rules */}
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

        {/* Card 6: Good vs Bad Examples */}
        <article className="workflowCard">
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

        {/* Card 7: Team Agreement Items */}
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
