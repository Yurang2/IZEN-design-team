// ---------------------------------------------------------------------------
// 업무구분별 A to Z 매뉴얼 — 초안 데이터 (SSOT: 본 파일)
//
// 대응 방식:
//   - 업무구분 리스트는 Notion `업무` DB의 select 옵션을 실시간 조회
//   - 각 옵션의 상세 매뉴얼은 이 파일을 key로 매칭하여 5단계 카드로 표시
//   - Notion에 새 옵션이 추가되면 UI에 "매뉴얼 미작성"으로 표시되어 누락 방지
// ---------------------------------------------------------------------------

export type ManualAsset = {
  path: string
  label: string
  required?: boolean
  note?: string
}

export type ManualArtifact = {
  filename: string
  purpose: string
}

export type ManualPublish = {
  path: string
  filename?: string
  note?: string
}

export type WorkTypeManual = {
  workType: string
  category: WorkManualCategoryKey
  description?: string
  adobeApps?: string[]
  assets: ManualAsset[]
  workBasePath: string
  artifacts: ManualArtifact[]
  publish?: ManualPublish
  cautions?: string[]
  ambiguous?: boolean
  ambiguityNote?: string
}

export type WorkManualCategoryKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I'

export const WORK_MANUAL_CATEGORIES: Record<WorkManualCategoryKey, { label: string; bg: string; border: string; text: string }> = {
  A: { label: '인쇄물', bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  B: { label: '부스', bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' },
  C: { label: '디지털', bg: '#cffafe', border: '#06b6d4', text: '#155e75' },
  D: { label: '영상', bg: '#ffe4e6', border: '#f43f5e', text: '#9f1239' },
  E: { label: '사진', bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
  F: { label: '3D / 렌더링', bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
  G: { label: '패키지·굿즈', bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  H: { label: '기획·문서', bg: '#e5e7eb', border: '#6b7280', text: '#374151' },
  I: { label: '분류 보류', bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
}

// ---------------------------------------------------------------------------
// Shared asset shortcuts
// ---------------------------------------------------------------------------

const ASSET_LOGO: ManualAsset = { path: '02_ASSET/01_로고/', label: '로고 (IZEN_CI / IAM / ZENEX 등)', required: true }
const ASSET_FONT: ManualAsset = { path: '02_ASSET/05_폰트/', label: '폰트 (Pretendard 등)', required: true }
const ASSET_BRAND: ManualAsset = { path: '02_ASSET/04_브랜드-가이드/', label: '브랜드 가이드라인', required: true, note: '색·여백·로고 크기 규칙 확인' }
const ASSET_RENDER: ManualAsset = { path: '02_ASSET/02_제품-렌더링/', label: '제품 렌더 이미지', note: '부품유형별 연출컷' }
const ASSET_PHOTO: ManualAsset = { path: '02_ASSET/07_제품사진-원본/', label: '제품 실사진', note: '스튜디오·현장 촬영 원본' }
const ASSET_3D: ManualAsset = { path: '02_ASSET/03_3D-소스/', label: '3D 원본 CAD (STEP/STL)', note: '렌더링 새로 뜰 때만' }
const ASSET_TPL_SNS: ManualAsset = { path: '02_ASSET/06_템플릿/01_SNS/', label: 'SNS 템플릿' }
export const ASSET_TPL_PRINT: ManualAsset = { path: '02_ASSET/06_템플릿/02_인쇄/', label: '인쇄 템플릿 (A4/A3/명함)' }
const ASSET_TPL_PPT: ManualAsset = { path: '02_ASSET/06_템플릿/03_PPT/', label: 'PPT 마스터 템플릿' }
const ASSET_TPL_VIDEO: ManualAsset = { path: '02_ASSET/06_템플릿/04_영상/', label: '영상 템플릿 (인트로/자막)' }
const ASSET_TPL_INDD: ManualAsset = { path: '02_ASSET/06_템플릿/05_InDesign/', label: 'InDesign 마스터 (카달로그/IFU)' }
export const ASSET_STOCK_IMG: ManualAsset = { path: '02_ASSET/11_스톡-라이선스/01_이미지/', label: '스톡 이미지 (Shutterstock 등)' }
const ASSET_STOCK_VIDEO: ManualAsset = { path: '02_ASSET/11_스톡-라이선스/02_영상/', label: '스톡 영상 클립' }
const ASSET_STOCK_AUDIO: ManualAsset = { path: '02_ASSET/11_스톡-라이선스/03_오디오/', label: '스톡 BGM / 효과음' }
const ASSET_STOCK_MOTION: ManualAsset = { path: '02_ASSET/11_스톡-라이선스/04_모션/', label: '스톡 모션 템플릿 (.mogrt)' }
const ASSET_PACKAGE: ManualAsset = { path: '02_ASSET/08_패키지/', label: '패키지 원본' }
const ASSET_CLINIC: ManualAsset = { path: '02_ASSET/09_임상/', label: '임상 사진 (자사/타사)' }
const ASSET_SPEAKER: ManualAsset = { path: '02_ASSET/10_연자/', label: '연자 프로필·사진' }

const CAUTION_GDRIVE_NO_SOURCE = 'Google Drive에는 소스파일(.psd/.ai/.indd/.prproj) 금지 — 완성 배포본만'
const CAUTION_WIP_TAG = '_작업중 표시는 PROJECT 안에서만 허용'
const CAUTION_CMYK = '인쇄소 전송본은 CMYK 변환 + 재단선 3mm + 블리드 포함'
const CAUTION_STOCK_COPY = '구매 스톡은 02_ASSET/11_스톡-라이선스/에서 프로젝트 귀속 소스로 복사 (원본 SSOT 유지)'
const CAUTION_MEDIA_CACHE = '미디어 캐시·프록시는 로컬 디스크에만 저장 — NAS 금지'

// ---------------------------------------------------------------------------
// Manual data (32 items, keys must match Notion workType select options exactly)
// ---------------------------------------------------------------------------

export const WORK_TYPE_MANUALS: WorkTypeManual[] = [
  // ── A. 인쇄물 ──────────────────────────────────────────────
  {
    workType: '포스터(1p)',
    category: 'A',
    description: '1페이지 포스터 (행사·제품·캠페인). 인쇄 + 디지털 공유 동시 대응.',
    adobeApps: ['Photoshop', 'Illustrator'],
    assets: [
      ASSET_LOGO, ASSET_FONT, ASSET_BRAND,
      { ...ASSET_RENDER, note: '연출컷 중심' },
      { ...ASSET_PHOTO, required: false, note: '실사진 필요 시' },
    ],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/포스터/',
    artifacts: [
      { filename: 'IZEN_..._v03.psd', purpose: 'Ps 작업본' },
      { filename: 'IZEN_..._v03.ai', purpose: 'Ai 작업본' },
      { filename: 'IZEN_..._v03_outline.ai', purpose: '폰트 아웃라인본 (외부 공유 안전)' },
      { filename: 'IZEN_..._v03.pdf', purpose: '공유·보고용' },
      { filename: 'IZEN_..._v03_CMYK-재단.pdf', purpose: '인쇄소 전송본' },
      { filename: 'IZEN_..._v03_검수.pdf', purpose: '검수용 (저해상도·워터마크)' },
      { filename: 'IZEN_..._v03_thumb.jpg', purpose: 'SNS·미리보기용' },
      { filename: '_시안A/  _시안B/', purpose: '시안 분기 시' },
    ],
    publish: { path: 'Google Drive/05_포스터/', filename: 'IZEN_..._EN_A1_Rev01.pdf', note: 'Rev 체계' },
    cautions: [CAUTION_CMYK, CAUTION_WIP_TAG, CAUTION_GDRIVE_NO_SOURCE],
  },
  {
    workType: '리플렛(1~4p)',
    category: 'A',
    description: '1~4페이지 리플렛. 접지선 설계 필요.',
    adobeApps: ['Illustrator', 'InDesign'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_RENDER, { ...ASSET_PHOTO, required: false }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/리플렛/',
    artifacts: [
      { filename: 'IZEN_..._EN_A4_v03.ai', purpose: 'Ai 작업본' },
      { filename: 'IZEN_..._EN_A4_v03_outline.ai', purpose: '폰트 아웃라인본' },
      { filename: 'IZEN_..._EN_A4_v03.pdf', purpose: '공유·보고용' },
      { filename: 'IZEN_..._EN_A4_v03_CMYK-재단.pdf', purpose: '인쇄소 전송본' },
      { filename: 'IZEN_..._RU_A4_v01.ai', purpose: '다국어 버전' },
    ],
    publish: { path: 'Google Drive/04_리플렛/', filename: 'IZEN_..._EN_A4_Rev02.pdf' },
    cautions: [CAUTION_CMYK, '접지선 표시 레이어 반드시 별도 분리'],
  },
  {
    workType: '브로슈어(6~24p)',
    category: 'A',
    description: '6~24페이지 브로슈어 (주로 InDesign 사용).',
    adobeApps: ['InDesign', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_RENDER, ASSET_PHOTO, ASSET_TPL_INDD],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/브로슈어/',
    artifacts: [
      { filename: 'IZEN_..._EN_12p_v02.indd', purpose: 'Id 작업본' },
      { filename: 'IZEN_..._EN_12p_v02.idml', purpose: 'Id 호환본 (구버전·타PC 대응)' },
      { filename: '_links/', purpose: '링크 이미지 폴더 (패키지 출력 시 포함)' },
      { filename: 'IZEN_..._EN_12p_v02.pdf', purpose: '공유·보고용' },
      { filename: 'IZEN_..._EN_12p_v02_CMYK-재단.pdf', purpose: '인쇄소 전송본' },
    ],
    publish: { path: 'Google Drive/03_브로슈어/', filename: 'IZEN_..._EN_12p_Rev01.pdf' },
    cautions: ['패키지 출력(Id → File → Package)으로 폰트·링크 포함 전체 백업', CAUTION_CMYK],
  },
  {
    workType: '카탈로그',
    category: 'A',
    description: 'System별 제품 카달로그 (I/T/R-system). 정기 리뉴얼.',
    adobeApps: ['InDesign', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_RENDER, ASSET_PHOTO, ASSET_CLINIC, ASSET_TPL_INDD],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/카달로그/',
    artifacts: [
      { filename: 'IZEN_I-system_카달로그_EN_v04.indd', purpose: 'Id 작업본' },
      { filename: 'IZEN_I-system_카달로그_EN_v04.idml', purpose: 'Id 호환본' },
      { filename: '_links/', purpose: '링크 이미지 폴더' },
      { filename: 'IZEN_I-system_카달로그_EN_v04.pdf', purpose: '공유본' },
      { filename: 'IZEN_I-system_카달로그_EN_v04_CMYK.pdf', purpose: '인쇄소 전송본' },
      { filename: 'IZEN_I-system_카달로그_RU_v02.pdf', purpose: '다국어 버전' },
    ],
    publish: { path: 'Google Drive/02_카달로그/{I/T/R-system}/', filename: 'IZEN_I-system_카달로그_EN_Rev03.pdf' },
    cautions: ['이전 Rev는 02_카달로그/{system}/_archive/로 이동', CAUTION_CMYK],
  },
  {
    workType: '배너 & 현수막',
    category: 'A',
    description: '행사·매장용 대형 출력물.',
    adobeApps: ['Illustrator', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_RENDER, { ...ASSET_PHOTO, required: false }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/배너-현수막/',
    artifacts: [
      { filename: 'IZEN_..._배너_EN_v02.ai', purpose: 'Ai 작업본' },
      { filename: 'IZEN_..._배너_EN_v02_outline.ai', purpose: '폰트 아웃라인' },
      { filename: 'IZEN_..._배너_EN_v02.pdf', purpose: '공유·검수용' },
      { filename: 'IZEN_..._배너_EN_v02_출력.pdf', purpose: '출력업체 전송본 (해상도·색공간 주의)' },
    ],
    publish: { path: 'Google Drive/07_배너-사인물/', filename: 'IZEN_..._배너_EN_Rev01.pdf' },
    cautions: ['대형 출력은 1:10 축소본 + 실제 크기 명시', '출력업체별 색공간·DPI 요건 확인'],
  },
  {
    workType: 'certificate',
    category: 'A',
    description: '제품 인증서·수료증 등.',
    adobeApps: ['Illustrator'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/certificate/',
    artifacts: [
      { filename: 'IZEN_..._certificate_v01.ai', purpose: 'Ai 작업본' },
      { filename: 'IZEN_..._certificate_v01.pdf', purpose: '공유·출력용' },
    ],
    publish: { path: 'Google Drive/06_certificate/', filename: 'IZEN_..._certificate_Rev01.pdf' },
  },
  {
    workType: '패키지',
    category: 'A',
    description: '제품 패키지 박스·라벨 디자인.',
    adobeApps: ['Illustrator', 'InDesign'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_PHOTO, ASSET_PACKAGE],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/패키지/ (신규) 또는 02_ASSET/08_패키지/ (재사용 템플릿)',
    artifacts: [
      { filename: 'IZEN_..._패키지_v01.ai', purpose: 'Ai 작업본 (전개도 포함)' },
      { filename: 'IZEN_..._패키지_v01_outline.ai', purpose: '폰트 아웃라인본' },
      { filename: 'IZEN_..._패키지_v01.pdf', purpose: '공유·검수용' },
      { filename: 'IZEN_..._패키지_v01_CMYK-재단.pdf', purpose: '인쇄소 전송본' },
      { filename: 'IZEN_..._패키지_3D목업_v01.png', purpose: '3D 목업 이미지 (옵션)' },
    ],
    publish: { path: 'Google Drive/09_패키지/', filename: 'IZEN_..._패키지_Rev01.pdf' },
    cautions: ['패키지 전개도·접지·다이라인(Dieline) 레이어 별도 관리', CAUTION_CMYK],
  },
  {
    workType: 'IFU',
    category: 'A',
    description: 'Instruction For Use — 제품 사용설명서. 인허가 연계.',
    adobeApps: ['InDesign'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_PHOTO, ASSET_TPL_INDD],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/IFU/',
    artifacts: [
      { filename: 'IZEN_..._IFU_EN_v02.indd', purpose: 'Id 작업본' },
      { filename: 'IZEN_..._IFU_EN_v02.idml', purpose: 'Id 호환본' },
      { filename: '_links/', purpose: '링크 이미지/도식 폴더' },
      { filename: 'IZEN_..._IFU_EN_v02.pdf', purpose: '공유·인허가 제출용' },
    ],
    publish: { path: 'Google Drive/10_IFU/', filename: 'IZEN_..._IFU_EN_Rev02.pdf' },
    cautions: ['인허가 제출 Rev는 회차 추적 필요 (Notion DB 연계)'],
  },
  {
    workType: '키트중판',
    category: 'A',
    description: '기존 키트 재인쇄 (원본 가져와 소량 보정 후 재출력).',
    adobeApps: ['Illustrator', 'InDesign'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_PACKAGE, { path: '99_ARCHIVE/2024_07_이전/', label: '기존 키트 원본 (아카이브)', required: false, note: '원본 소재지에 따라' }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../01_인쇄물/키트-라벨/',
    artifacts: [
      { filename: 'IZEN_..._키트_v01.ai', purpose: 'Ai 작업본 (원본에서 수정)' },
      { filename: 'IZEN_..._키트_v01_CMYK.pdf', purpose: '인쇄소 전송본' },
    ],
    publish: { path: 'Google Drive/09_패키지/ 또는 11_기타-배포본/', filename: 'IZEN_..._키트_Rev01.pdf' },
    cautions: ['원본 위치 파악 → 복사 후 작업 (원본 덮어쓰기 금지)', CAUTION_CMYK],
  },

  // ── B. 부스 ──────────────────────────────────────────────
  {
    workType: '부스디자인',
    category: 'B',
    description: '3D 부스 모델링. 전시·행사용.',
    adobeApps: ['Cinema 4D', 'KeyShot', 'Blender'],
    assets: [ASSET_LOGO, ASSET_RENDER, ASSET_3D],
    workBasePath: '01_PROJECT/IZYYNNNN_.../02_부스/부스디자인/',
    artifacts: [
      { filename: 'IZEN_부스_..._v03.c4d', purpose: 'C4D 3D 소스' },
      { filename: '_textures/', purpose: '텍스처·HDRI 폴더' },
      { filename: 'IZEN_부스_..._v03_정면_렌더.png', purpose: '정면 렌더 출력' },
      { filename: 'IZEN_부스_..._v03_측면_렌더.png', purpose: '측면 렌더 출력' },
      { filename: 'IZEN_부스_..._v03_상세도면.pdf', purpose: '시공용 도면' },
    ],
    publish: { path: '(내부용, Google Drive 미배포)', note: '도면은 시공업체에 직접 전달' },
    cautions: ['렌더링 씬 파일은 용량 크므로 _textures는 상대경로 관리', '시공업체 요청 시 STEP·DWG 내보내기'],
  },
  {
    workType: '부스 그래픽 디자인',
    category: 'B',
    description: '부스 벽면·키비주얼 2D 그래픽.',
    adobeApps: ['Illustrator', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND, ASSET_RENDER, ASSET_PHOTO],
    workBasePath: '01_PROJECT/IZYYNNNN_.../02_부스/부스그래픽/',
    artifacts: [
      { filename: 'IZEN_..._부스_벽면A_v02.ai', purpose: '벽면 A Ai' },
      { filename: 'IZEN_..._부스_벽면B_v02.ai', purpose: '벽면 B Ai' },
      { filename: 'IZEN_..._부스_벽면A_v02_outline.ai', purpose: '폰트 아웃라인본' },
      { filename: 'IZEN_..._부스_벽면A_v02_출력.pdf', purpose: '출력업체 전송본' },
      { filename: 'IZEN_..._부스_시뮬레이션_v02.png', purpose: '부스디자인 위에 합성한 미리보기' },
    ],
    publish: { path: 'Google Drive/07_배너-사인물/', note: '필요 시 Rev 배포' },
    cautions: ['실측 사이즈 확인 후 작업', '1:10 축소본으로 검수 공유'],
  },
  {
    workType: '스크린',
    category: 'B',
    description: '행사장 LED·디지털 스크린용 콘텐츠.',
    adobeApps: ['Photoshop', 'Premiere Pro', 'After Effects'],
    assets: [ASSET_LOGO, ASSET_TPL_VIDEO, ASSET_STOCK_MOTION],
    workBasePath: '01_PROJECT/IZYYNNNN_.../03_디지털/행사운영/ (스크린 에셋 모음)',
    artifacts: [
      { filename: 'IZEN_..._스크린_대기화면_v01.png', purpose: '대기화면 이미지' },
      { filename: 'IZEN_..._스크린_오프닝_v01.mp4', purpose: '오프닝 영상' },
      { filename: 'IZEN_..._스크린_브레이크_v01.mp4', purpose: '쉬는시간용' },
    ],
    publish: { path: '(행사 프로젝트 내부, 운영 당일 사용 후 아카이브)' },
    cautions: ['스크린 해상도 확인 (1920x1080, 3840x2160, 또는 커스텀 비율)', CAUTION_MEDIA_CACHE],
  },

  // ── C. 디지털 ──────────────────────────────────────────────
  {
    workType: 'PPT',
    category: 'C',
    description: '발표자료·회사소개 PPT.',
    adobeApps: ['PowerPoint', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_TPL_PPT, ASSET_RENDER, { ...ASSET_PHOTO, required: false }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../03_디지털/PPT/',
    artifacts: [
      { filename: 'IZEN_..._발표자료_v02.pptx', purpose: 'PPT 작업본' },
      { filename: 'IZEN_..._발표자료_v02.pdf', purpose: '공유·인쇄용' },
      { filename: 'IZEN_..._발표자료_v02_발표자노트.pdf', purpose: '발표자 메모 포함본 (옵션)' },
    ],
    publish: { path: 'Google Drive/01_회사소개/company-profile/ (회사소개일 때)', note: '발표자료는 일반적으로 미배포' },
    cautions: ['폰트 임베드 또는 PDF 내보내기로 공유', '템플릿 마스터 수정 시 02_ASSET/06_템플릿/03_PPT/에도 반영'],
  },
  {
    workType: 'SNS 홍보 이미지',
    category: 'C',
    description: 'Instagram·Facebook 등 SNS용 이미지.',
    adobeApps: ['Photoshop', 'Illustrator'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_TPL_SNS, ASSET_RENDER, ASSET_PHOTO, ASSET_CLINIC, ASSET_SPEAKER],
    workBasePath: '01_PROJECT/IZ250900_SNS-정기콘텐츠/{제품|임상|브랜딩}/{YYYY-MM_주제}/',
    artifacts: [
      { filename: 'IZEN_SNS_..._v02.psd', purpose: 'Ps 작업본' },
      { filename: 'IZEN_SNS_..._1080x1080_v02.png', purpose: '정사각 업로드용' },
      { filename: 'IZEN_SNS_..._1080x1350_v02.png', purpose: '세로형 업로드용' },
      { filename: 'IZEN_SNS_..._9x16_v02.png', purpose: '스토리·릴스 썸네일' },
    ],
    publish: { path: '(SNS 플랫폼 직접 업로드, Notion SNS DB에서 이력 관리)' },
    cautions: ['플랫폼별 권장 해상도 준수', '캡션 텍스트는 이미지가 아닌 Notion에 기록'],
  },
  {
    workType: 'SNS 업로드',
    category: 'C',
    description: '완성된 SNS 콘텐츠를 플랫폼에 업로드하는 업무 (파일 생성 거의 없음).',
    assets: [{ path: '(이미 제작된 SNS 홍보 이미지/영상)', label: '기존 완성본' }],
    workBasePath: '(파일 작업 없음)',
    artifacts: [],
    publish: { path: 'SNS 플랫폼 직접 업로드' },
    cautions: ['업로드 내역은 Notion SNS DB에 기록', '해시태그·태그·캡션 규칙 준수'],
  },
  {
    workType: '홈페이지 업데이트',
    category: 'C',
    description: '홈페이지 배너·페이지 이미지 갱신.',
    adobeApps: ['Photoshop', 'Figma'],
    assets: [ASSET_LOGO, ASSET_PHOTO, ASSET_RENDER],
    workBasePath: '01_PROJECT/IZYYNNNN_홈페이지.../03_디지털/홈페이지/',
    artifacts: [
      { filename: 'IZEN_홈_배너_..._1920x1080_v02.psd', purpose: 'Ps 작업본' },
      { filename: 'IZEN_홈_배너_..._1920x1080_v02.png', purpose: '웹 업로드용' },
      { filename: 'IZEN_홈_배너_..._1920x1080_v02.webp', purpose: '웹 최적화 (옵션)' },
    ],
    publish: { path: '(홈페이지 CMS에 직접 반영)' },
    cautions: ['웹 최적화: PNG → WebP 또는 JPG 80% 품질로 용량 관리', '반응형 고려한 세이프 영역 체크'],
  },
  {
    workType: '홈페이지 팝업',
    category: 'C',
    description: '홈페이지 팝업·캠페인 배너.',
    adobeApps: ['Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_RENDER],
    workBasePath: '01_PROJECT/IZYYNNNN_홈페이지팝업/03_디지털/홈페이지/',
    artifacts: [
      { filename: 'IZEN_홈_팝업_..._600x700_v01.psd', purpose: 'Ps 작업본' },
      { filename: 'IZEN_홈_팝업_..._600x700_v01.png', purpose: '웹 업로드용' },
    ],
    publish: { path: '(홈페이지 CMS 팝업 등록)' },
    cautions: ['모바일 팝업 사이즈 별도 (폰 세로 비율 고려)'],
  },
  {
    workType: '뉴스레터',
    category: 'C',
    description: '정기 뉴스레터 (이메일/인쇄 혼용 가능).',
    adobeApps: ['Photoshop', 'Illustrator'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_TPL_SNS, ASSET_PHOTO],
    workBasePath: '01_PROJECT/IZ250901_뉴스레터/{YYYY-MM}/',
    artifacts: [
      { filename: 'IZEN_뉴스레터_{YYYY-MM}_v01.psd', purpose: 'Ps 작업본' },
      { filename: 'IZEN_뉴스레터_{YYYY-MM}_v01.pdf', purpose: '이메일 첨부용' },
      { filename: 'IZEN_뉴스레터_{YYYY-MM}_v01.html', purpose: '이메일 본문용 (해당 시)' },
      { filename: 'IZEN_뉴스레터_{YYYY-MM}_v01.png', purpose: '웹 공유용' },
    ],
    publish: { path: 'Google Drive/11_기타-배포본/ (아카이브용) + 이메일 발송' },
    cautions: ['이메일 클라이언트 호환성 (Outlook/Gmail) 확인'],
    ambiguous: true,
    ambiguityNote: '해석 확인 필요: (A) 인쇄 (B) 이메일 (C) 둘 다',
  },

  // ── D. 영상 ──────────────────────────────────────────────
  {
    workType: '영상 편집',
    category: 'D',
    description: '행사 후기·제품영상·회사소개 등 편집.',
    adobeApps: ['Premiere Pro', 'After Effects', 'Audition'],
    assets: [
      ASSET_LOGO, ASSET_FONT, ASSET_TPL_VIDEO,
      ASSET_STOCK_AUDIO, ASSET_STOCK_VIDEO, ASSET_STOCK_MOTION,
    ],
    workBasePath: '01_PROJECT/IZYYNNNN_.../04_영상/{후기영상|홍보영상|제품영상|...}/',
    artifacts: [
      { filename: 'IZEN_..._v03.prproj', purpose: 'Premiere 프로젝트' },
      { filename: '{프로젝트명_v03}/', purpose: '귀속 소스 폴더 — 아래 파일들 담음:' },
      { filename: '  └ 썸네일.psd', purpose: '유튜브·공유용 썸네일' },
      { filename: '  └ 자막_EN.srt', purpose: '언어별 자막' },
      { filename: '  └ BGM(복사본).wav', purpose: '스톡 BGM 프로젝트 귀속 복사' },
      { filename: 'IZEN_..._v03.mp4', purpose: '완성본 mp4' },
      { filename: 'IZEN_..._v03_저용량.mp4', purpose: '검수·공유용 저용량' },
    ],
    publish: { path: 'Google Drive/08_영상/{후기영상|홍보영상|제품영상|...}/', filename: 'IZEN_..._16x9_Rev01.mp4' },
    cautions: [CAUTION_STOCK_COPY, CAUTION_MEDIA_CACHE, '자막은 .srt 별도 관리 (이미지 자막 금지)'],
  },
  {
    workType: '2D 모션 영상',
    category: 'D',
    description: 'After Effects 기반 2D 모션그래픽.',
    adobeApps: ['After Effects', 'Illustrator', 'Audition'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_TPL_VIDEO, ASSET_STOCK_AUDIO, ASSET_STOCK_MOTION],
    workBasePath: '01_PROJECT/IZYYNNNN_.../04_영상/모션그래픽/',
    artifacts: [
      { filename: 'IZEN_..._모션_v02.aep', purpose: 'AE 프로젝트' },
      { filename: '_footage/', purpose: '소스 풋티지 폴더' },
      { filename: 'IZEN_..._모션_v02.mp4', purpose: '완성본' },
      { filename: 'IZEN_..._모션_v02_알파.mov', purpose: '알파채널 포함 (합성용)' },
    ],
    publish: { path: 'Google Drive/08_영상/모션그래픽/', filename: 'IZEN_..._모션_Rev01.mp4' },
    cautions: [CAUTION_STOCK_COPY, CAUTION_MEDIA_CACHE],
  },
  {
    workType: '3D 모션 영상',
    category: 'D',
    description: 'C4D + AE로 제작하는 3D 모션그래픽.',
    adobeApps: ['Cinema 4D', 'After Effects', 'Octane/Redshift'],
    assets: [ASSET_3D, ASSET_RENDER, { path: 'HDRI·텍스처', label: '조명·머티리얼' }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../04_영상/모션그래픽/',
    artifacts: [
      { filename: 'IZEN_..._3D모션_v02.c4d', purpose: 'C4D 씬파일' },
      { filename: '_textures/', purpose: '텍스처·HDRI' },
      { filename: '_renders/', purpose: '렌더 시퀀스 (EXR/PNG)' },
      { filename: 'IZEN_..._3D모션_v02.aep', purpose: 'AE 합성·색보정' },
      { filename: 'IZEN_..._3D모션_v02.mp4', purpose: '완성본' },
    ],
    publish: { path: 'Google Drive/08_영상/모션그래픽/ 또는 제품영상/', filename: 'IZEN_..._3D모션_Rev01.mp4' },
    cautions: ['렌더 시퀀스 용량 큼 → 완성 후 _renders는 ARCHIVE로 이동', CAUTION_MEDIA_CACHE],
  },
  {
    workType: 'SNS 홍보 영상',
    category: 'D',
    description: 'Instagram 릴스·스토리·틱톡용 숏폼 영상.',
    adobeApps: ['Premiere Pro', 'After Effects'],
    assets: [ASSET_LOGO, ASSET_TPL_VIDEO, ASSET_STOCK_AUDIO, ASSET_STOCK_VIDEO],
    workBasePath: '01_PROJECT/IZ250900_SNS-정기콘텐츠/{YYYY-MM}/영상/ 또는 프로젝트별',
    artifacts: [
      { filename: 'IZEN_SNS_..._9x16_v02.prproj', purpose: 'Premiere 프로젝트' },
      { filename: 'IZEN_SNS_..._9x16_v02.mp4', purpose: '세로형 완성본' },
      { filename: 'IZEN_SNS_..._1x1_v02.mp4', purpose: '정사각 버전 (옵션)' },
    ],
    publish: { path: '(SNS 플랫폼 직접, Notion SNS DB에 기록)' },
    cautions: ['플랫폼별 길이·용량 제한 확인 (릴스 90초, 스토리 15초)', CAUTION_STOCK_COPY],
  },

  // ── E. 사진 ──────────────────────────────────────────────
  {
    workType: '사진 및 영상 촬영',
    category: 'E',
    description: '현장·스튜디오 촬영 (사진 + 영상 동시 진행 가능).',
    adobeApps: ['Lightroom (촬영 후)'],
    assets: [{ path: '(촬영 장비)', label: '카메라·렌즈·조명' }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../05_사진/a_자체촬영/\n01_PROJECT/IZYYNNNN_.../04_영상/a_자체촬영/',
    artifacts: [
      { filename: '3N8A2815.CR3', purpose: '카메라 RAW 사진 (파일명 카메라 원본 유지)' },
      { filename: '3N8A2815.JPG', purpose: '카메라 JPG 미리보기' },
      { filename: 'CIS2026_DAY1_CAM-A_001.MXF', purpose: '영상 RAW (Canon XF 계열)' },
      { filename: 'CIS2026_DAY1_CAM-A_001.MOV', purpose: '영상 원본 (Sony·GoPro 등)' },
    ],
    publish: { path: '(원본은 계속 a_자체촬영/에 보존, 후속 업무 "사진정리" 또는 "영상 편집"으로 이어짐)' },
    cautions: ['카메라 원본명 유지 — rename 금지', '촬영 직후 a_자체촬영/으로 전량 복사 (SD카드 → NAS)'],
    ambiguous: true,
    ambiguityNote: '촬영만인지, 가편집까지인지 범위 확인 필요',
  },
  {
    workType: '사진정리',
    category: 'E',
    description: 'RAW 사진 셀렉트·보정·공유.',
    adobeApps: ['Lightroom', 'Photoshop'],
    assets: [{ path: '01_PROJECT/.../05_사진/a_자체촬영/', label: '촬영 원본' }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../05_사진/c_보정/ → d_공유/',
    artifacts: [
      { filename: '.lrcat', purpose: 'Lightroom 카탈로그 (c_보정/ 루트 권장)' },
      { filename: '.xmp', purpose: 'Camera Raw 설정 사이드카' },
      { filename: 'IZEN_..._DAY1_보정_001.jpg', purpose: '보정 완료 JPG' },
      { filename: 'd_공유/DAY1/*.jpg', purpose: '공유용 (다운사이즈·워터마크 옵션)' },
    ],
    publish: { path: '재사용 가능한 컷은 02_ASSET/07_제품사진-원본/ 또는 09_임상/으로 승격' },
    cautions: ['Lightroom 카탈로그는 프로젝트별 분리', '보정 스타일은 프리셋으로 저장해 일관성 유지'],
  },

  // ── F. 3D/렌더링 ──────────────────────────────────────────
  {
    workType: '3D 렌더링',
    category: 'F',
    description: '제품 3D 모델 렌더링. 범용(ASSET) vs 프로젝트 전용 분기 중요.',
    adobeApps: ['Cinema 4D', 'KeyShot', 'Blender', 'Photoshop'],
    assets: [ASSET_3D, ASSET_RENDER, { path: 'HDRI·텍스처 라이브러리', label: '조명·머티리얼' }],
    workBasePath: '전용 → 01_PROJECT/IZYYNNNN_.../03_디지털/렌더링/\n범용 → 02_ASSET/02_제품-렌더링/{부품유형}/',
    artifacts: [
      { filename: 'IZEN_..._렌더_정면_v01.c4d', purpose: 'C4D 씬파일' },
      { filename: '_textures/', purpose: '텍스처·HDRI' },
      { filename: 'IZEN_..._렌더_정면_v01.png', purpose: '렌더 출력' },
      { filename: 'IZEN_..._렌더_정면_v01_postproduction.psd', purpose: 'Ps 후보정본' },
      { filename: 'ZMSN3008_정면01_v01.png', purpose: '(범용 ASSET일 때 파일명 규칙)' },
    ],
    publish: { path: '범용은 ASSET 승격, 전용은 인쇄물/브로슈어·카달로그 등에서 사용' },
    cautions: ['연구소 요청·신제품은 전용으로 시작 → 안정화되면 ASSET으로 승격', '범용 파일명은 코드명_특징NN_vNN 규칙 엄수'],
  },

  // ── G. 패키지·굿즈·마케팅 마테리얼 ─────────────────────────
  {
    workType: '판촉물&굿즈&선물',
    category: 'G',
    description: '행사 기프트·브랜딩 굿즈.',
    adobeApps: ['Illustrator', 'Photoshop'],
    assets: [ASSET_LOGO, ASSET_FONT, ASSET_BRAND],
    workBasePath: '01_PROJECT/IZYYNNNN_.../00_기획-문서/ (견적·발주서) + 01_인쇄물/굿즈/ (디자인 시)',
    artifacts: [
      { filename: '판촉물_견적서_{업체}_v01.pdf', purpose: '견적서 (원본 파일명 유지)' },
      { filename: 'IZEN_..._굿즈_{품목}_v01.ai', purpose: '굿즈 디자인 (해당 시)' },
      { filename: 'IZEN_..._굿즈_{품목}_v01_인쇄시안.pdf', purpose: '업체 전달용' },
    ],
    publish: { path: 'Google Drive/11_기타-배포본/ (아카이브)', note: '주로 내부 관리용' },
    cautions: ['견적서 원본 파일명 유지', '발주 후 납품 확인 Notion에 기록'],
  },
  {
    workType: '마케팅 마테리얼',
    category: 'G',
    description: '포괄적 마케팅 자료 (구체적 품목 확인 필요).',
    assets: [],
    workBasePath: '(용어 정의 후 확정)',
    artifacts: [],
    cautions: ['"마케팅 마테리얼"의 범위 정의 필요 — 포스터·리플렛·굿즈의 상위 개념인지, 별개 카테고리인지'],
    ambiguous: true,
    ambiguityNote: '구체적 산출물 정의 필요 — 기존 인쇄물/굿즈와 어떻게 구분?',
  },
  {
    workType: '마케팅 마테리얼 패킹',
    category: 'G',
    description: '마케팅 자료 물리 패킹·배송 준비.',
    assets: [{ path: '(이미 제작된 인쇄물·굿즈)', label: '완성된 마케팅 자료' }],
    workBasePath: '01_PROJECT/IZYYNNNN_.../00_기획-문서/ (패킹 리스트·발송 명단)',
    artifacts: [
      { filename: '패킹리스트_..._v01.xlsx', purpose: '패킹 명세서' },
      { filename: '발송명단_..._v01.xlsx', purpose: '수령인 목록' },
    ],
    publish: { path: '(물리 배송, 파일 배포 아님)' },
    cautions: ['디자인 파일 작업 거의 없음 — 주로 문서·리스트'],
    ambiguous: true,
    ambiguityNote: '물리 패킹만인지, 패킹용 라벨·인쇄물 디자인도 포함인지 확인',
  },

  // ── H. 기획·문서 ─────────────────────────────────────────
  {
    workType: '미팅',
    category: 'H',
    description: '미팅·회의록.',
    assets: [],
    workBasePath: '01_PROJECT/IZYYNNNN_.../00_기획-문서/미팅/',
    artifacts: [
      { filename: 'IZEN_..._킥오프미팅_회의록_v01.docx', purpose: '회의록 원본' },
      { filename: 'IZEN_..._킥오프미팅_회의록_v01.pdf', purpose: '공유용' },
    ],
    cautions: ['회의록은 Notion 회의록 DB에도 publish 고려'],
  },
  {
    workType: '품의서&지출결의서',
    category: 'H',
    description: '내부 결재용 품의서·지출결의서.',
    assets: [ASSET_LOGO],
    workBasePath: '01_PROJECT/IZYYNNNN_.../00_기획-문서/품의서-지출결의서/',
    artifacts: [
      { filename: '{프로젝트}_품의서_v01.docx', purpose: '품의서 원본' },
      { filename: '{프로젝트}_지출결의서_v01.pdf', purpose: '지출결의서' },
      { filename: '첨부_견적서_{업체}.pdf', purpose: '첨부 영수증·견적서 (원본 파일명)' },
    ],
    cautions: ['첨부 서류는 원본 파일명 유지', '결재 완료본은 Notion에 링크'],
  },
  {
    workType: '보고서&제안서&서류작업',
    category: 'H',
    description: '대외 보고서·제안서·각종 서류.',
    adobeApps: ['PowerPoint', 'Word'],
    assets: [ASSET_LOGO, ASSET_TPL_PPT],
    workBasePath: '01_PROJECT/IZYYNNNN_.../00_기획-문서/보고서-제안서/',
    artifacts: [
      { filename: '{프로젝트}_제안서_v02.pptx', purpose: 'PPT 작업본' },
      { filename: '{프로젝트}_제안서_v02.pdf', purpose: '공유·제출용' },
      { filename: '{프로젝트}_보고서_v01.docx', purpose: '보고서 원본' },
    ],
    cautions: ['외부 제출 시 폰트 임베드 또는 PDF 변환', '브랜드 가이드 준수'],
  },

  // ── I. 분류 보류 ─────────────────────────────────────────
  {
    workType: '이벤트',
    category: 'I',
    description: '정의 확인 필요',
    assets: [],
    workBasePath: '(용어 정의 후 확정)',
    artifacts: [],
    ambiguous: true,
    ambiguityNote: '"이벤트"의 정의 확인 필요: (A) 행사 자체 (B) 이벤트 경품·굿즈 (C) 이벤트 랜딩페이지 (D) 기타',
  },
]

export const WORK_TYPE_MANUAL_MAP: Record<string, WorkTypeManual> = Object.fromEntries(
  WORK_TYPE_MANUALS.map((m) => [m.workType, m]),
)
