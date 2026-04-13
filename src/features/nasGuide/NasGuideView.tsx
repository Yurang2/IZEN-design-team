import { useState, useMemo, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TreeNode = {
  name: string
  comment?: string
  children?: TreeNode[]
  isFile?: boolean
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function d(name: string, children?: TreeNode[]): TreeNode {
  return { name, children }
}
function dc(name: string, comment: string, children?: TreeNode[]): TreeNode {
  return { name, comment: comment || undefined, children }
}
function f(name: string): TreeNode {
  return { name, isFile: true }
}
function fc(name: string, comment: string): TreeNode {
  return { name, comment, isFile: true }
}

// ---------------------------------------------------------------------------
// Section colors
// ---------------------------------------------------------------------------

const C = {
  project: { bg: '#dcfce7', border: '#22c55e', text: '#166534', soft: '#f0fdf4' },
  asset: { bg: '#f3e8ff', border: '#8b5cf6', text: '#6b21a8', soft: '#faf5ff' },
  library: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', soft: '#fffbf5' },
  archive: { bg: '#f3f4f6', border: '#6b7280', text: '#374151', soft: '#f9fafb' },
  gdrive: { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8', soft: '#eff6ff' },
} as const

const ROOT_COLORS: Record<string, (typeof C)[keyof typeof C]> = {
  '01_PROJECT': C.project,
  '02_ASSET': C.asset,
  '03_LIBRARY': C.library,
  '99_ARCHIVE': C.archive,
  'IZEN Design (Google Drive)': C.gdrive,
}

// ---------------------------------------------------------------------------
// NAS Tree data
// ---------------------------------------------------------------------------

const NAS_TREE: TreeNode[] = [
  dc('01_PROJECT', '작업 과정 (프로젝트별)', [
    // ── 행사/캠페인 ──
    dc('DT-2603-001_CIS-Conference', '풀세트 행사 프로젝트', [
      d('00_기획-문서', [
        dc('기획서', '타팀 수령 기획서', [fc('[수신]_CIS2026_기획서_마케팅팀.docx', '타팀에서 받은 파일')]),
        d('보고서-제안서', [f('IZEN_CIS2026_부스_제안서_v02.pptx')]),
        d('품의서-지출결의서', [fc('판촉물_견적서_기프트인포_v01.pdf', '판촉물 견적서도 여기에')]),
        d('미팅'),
      ]),
      d('01_인쇄물', [
        dc('포스터', '1p', [f('IZEN_CIS2026_포스터_EN_A1_v01_작업중.psd'), f('IZEN_CIS2026_포스터_EN_A1_v03.ai')]),
        dc('리플렛', '1~4p', [f('IZEN_CIS2026_리플렛_EN_A4_v01.ai'), f('IZEN_CIS2026_리플렛_RU_A4_v01.ai')]),
        dc('브로슈어', '6~24p'),
        dc('카달로그', '다페이지 인쇄물', [f('IZEN_I-system_카달로그_EN_v04.indd')]),
        d('배너-현수막', [f('IZEN_CIS2026_배너_EN_v02.ai')]),
        d('certificate', [f('IZEN_CIS2026_certificate_v01.ai')]),
      ]),
      d('02_부스', [
        dc('부스디자인', '3D 부스 모델링 (C4D 등)', [f('IZEN_부스_CIS2026_v03.c4d')]),
        dc('부스그래픽', '벽면 그래픽 디자인', [f('IZEN_CIS2026_부스_벽면A_v02.ai')]),
      ]),
      d('03_디지털', [
        d('SNS-이미지'),
        dc('SNS-업로드', '최종 업로드용'),
        d('PPT', [f('IZEN_CIS2026_발표자료_v01.pptx')]),
        dc('스크린', 'LED/TV 대기화면', [f('IZEN_CIS2026_LED_대기화면_16x9_v01.mp4')]),
        dc('렌더링', '프로젝트 전용 제품 렌더링', [f('IZEN_CIS2026_제품_렌더_정면_v01.png')]),
        d('홈페이지'),
      ]),
      d('04_영상', [
        dc('자체촬영', '카메라 RAW (MXF, MOV)', [f('CIS2026_DAY1_CAM-A_001.MXF')]),
        d('수신', [dc('외주', '외부 영상팀 납품본'), dc('타팀', '영업팀 핸드폰 영상 등')]),
        dc('편집-프로젝트', '.prproj, .aep', [f('IZEN_CIS2026_후기영상_v02.prproj')]),
        d('2D-모션'),
        d('3D-모션', [f('IZEN_CIS2026_오프닝_3D_v01.c4d')]),
        d('SNS-영상'),
        d('최종본', [f('IZEN_CIS2026_후기영상_16x9_v03.mp4')]),
      ]),
      d('05_사진', [
        dc('자체촬영', '카메라 RAW/JPG 전량'),
        d('수신', [dc('외주', '외부 사진기사 납품본 (보정 완료)'), dc('타팀', '영업팀 핸드폰 등 (저품질)')]),
        dc('선별', '자체촬영+수신에서 고른 사진'),
        dc('보정', '선별본을 색보정/리터치한 최종'),
      ]),
    ]),
    dc('DT-2604-002_AEEDC-Dubai', '중간 규모', [
      d('00_기획-문서'),
      d('01_인쇄물', [d('리플렛'), d('배너-현수막')]),
      d('02_부스', [d('부스디자인'), d('부스그래픽')]),
      d('04_영상', [d('촬영원본'), d('편집-프로젝트'), d('최종본')]),
    ]),
    dc('DT-2609-005_IDS-Cologne', '소규모', [
      d('01_인쇄물', [d('리플렛'), d('배너-현수막')]),
      d('02_부스', [d('부스디자인'), d('부스그래픽')]),
    ]),
    dc('DT-2610-006_Russia-Dental-Expo', '러시아어 버전 포함', [
      d('01_인쇄물', [
        d('포스터', [f('IZEN_RusDentalExpo_포스터_RU_A1_v01.ai')]),
        d('리플렛', [f('IZEN_RusDentalExpo_리플렛_RU_A4_v01.ai'), f('IZEN_RusDentalExpo_리플렛_EN_A4_v01.ai')]),
      ]),
      d('02_부스'),
    ]),
    // ── 제품/콘텐츠 ──
    dc('DT-2604-003_회사소개영상-v3수정', '영업팀 검수 → 자막 수정 → 최종본', [
      d('00_기획-문서', [fc('[수신]_회사소개영상_검수의견_영업팀.docx', '영업팀 검수 docx')]),
      d('04_영상', [
        d('편집-프로젝트', [f('IZEN_회사소개영상-Full_v03.prproj')]),
        d('최종본', [f('IZEN_회사소개영상-Full_EN_v03.mp4'), f('IZEN_회사소개영상-Short_EN_v03.mp4'), f('IZEN_회사소개영상-Full_RU_v03.mp4')]),
      ]),
    ]),
    dc('DT-2605-004_I-system-카달로그-리뉴얼', 'InDesign → 다국어 PDF', [
      d('01_인쇄물', [
        d('카달로그', [
          f('IZEN_I-system_카달로그_EN_v04.indd'),
          f('IZEN_I-system_카달로그_EN_v04.pdf'),
          f('IZEN_I-system_카달로그_RU_v02.pdf'),
        ]),
      ]),
    ]),
    dc('DT-2606-005_신제품-렌더링-연구소요청', '연구소 요청 → 3D → 납품', [
      d('00_기획-문서', [f('[수신]_신제품_렌더링요청_연구소.docx')]),
      d('03_디지털', [d('렌더링', [f('IZEN_신제품_렌더_정면_v01.png'), f('IZEN_신제품_렌더_측면_v01.png')])]),
    ]),
    dc('DT-2607-006_제품-사용법영상-T-system', '스토리보드 → 3D → 편집', [
      d('00_기획-문서', [f('IZEN_T-system_사용법영상_스토리보드_v01.pptx')]),
      d('04_영상', [
        d('3D-모션', [f('IZEN_T-system_사용법_3D_v02.c4d')]),
        d('편집-프로젝트', [f('IZEN_T-system_사용법영상-기본편_v02.prproj')]),
        d('최종본', [f('IZEN_T-system_사용법영상-기본편_v02.mp4')]),
      ]),
    ]),
    // ── 상시 프로젝트 ──
    dc('DT-2601-010_SNS-정기콘텐츠', '상시 (매년 1월 생성)', [
      d('제품', [d('2026-03_I-system-신제품', [f('IZEN_SNS_제품_I-system-fixture_v2.png')]), d('2026-04_T-system-케이스')]),
      d('임상', [d('2026-03_Dr-Kim', [f('IZEN_SNS_임상_Dr-Kim-case_v1.png')])]),
      d('브랜딩'),
    ]),
    dc('DT-2601-011_뉴스레터', '상시', [d('2026-03'), d('2026-04')]),
    dc('DT-2601-012_홈페이지', '상시', [d('업데이트'), d('팝업')]),
    dc('DT-2601-013_IFU', '상시'),
    dc('DT-2601-014_회사소개영상', '상시 관리'),
  ]),
  dc('02_ASSET', '작업 재료 (소스)', [
    d('01_로고', [
      d('IZEN_CI', [f('IZEN_CI_LOGO_Black.png'), f('IZEN_CI_LOGO_White.png'), f('IZEN_CI_LOGO.ai')]),
      d('IAM', [f('IAM_LOGO_Black.png'), f('IAM_LOGO_White.png')]),
      d('ZENEX', [f('zenex_logo_bk.png'), f('zenex_logo.ai')]),
      d('Cleanimplant', [f('Cleanimplant_LOGO_Black.png')]),
    ]),
    d('02_제품-렌더링', [
      d('I-system', [f('IZEN_I-system_렌더_정면_v1.png')]),
      d('T-system'),
      d('R-system'),
    ]),
    dc('03_3D-소스', 'STEP, STL 원본'),
    dc('04_카달로그-마스터', 'InDesign 마스터 파일'),
    d('05_브랜드-가이드', [f('IZEN_IMPLANT_BRAND_GUIDELINES_EN.pdf')]),
    d('06_폰트', [f('Pretendard.zip')]),
    dc('07_템플릿', 'AI/PSD/INDD 템플릿'),
    d('08_제품사진-원본'),
    d('09_패키지'),
    d('10_임상', [dc('자사-케이스', '자사 임상 사진'), dc('레퍼런스', '타사 참고자료')]),
  ]),
  dc('03_LIBRARY', '완성 배포본 (항상 최신 Rev만)', [
    d('01_회사소개', [
      dc('company-profile', 'PPT, PDF', [f('IZEN_회사소개서_EN_Rev02.pdf'), f('IZEN_회사소개서_EN_Rev02.pptx')]),
      dc('company-video', '소개영상 최종본', [f('IZEN_회사소개영상-Full_EN_Rev01.mp4'), f('IZEN_회사소개영상-Short_EN_Rev01.mp4')]),
    ]),
    d('02_카달로그', [
      d('I-system', [
        fc('IZEN_I-system_카달로그_EN_Rev03.pdf', '← 최신 배포본'),
        f('IZEN_I-system_카달로그_RU_Rev02.pdf'),
        dc('_archive', '구버전', [f('IZEN_I-system_카달로그_EN_Rev02.pdf'), f('IZEN_I-system_카달로그_EN_Rev01.pdf')]),
      ]),
      d('T-system'),
      d('R-system'),
    ]),
    d('03_브로슈어'),
    d('04_리플렛'),
    d('05_포스터'),
    d('06_certificate'),
    d('07_배너-사인물'),
    d('08_영상', [d('제품-홍보'), d('제품-사용법'), d('브랜드-홍보'), d('SNS')]),
    d('09_패키지'),
    d('10_IFU'),
  ]),
  dc('99_ARCHIVE', '과거 파일 보존', [
    dc('2024_07_이전', '기존 462K 파일 그대로 보존 — 재분류 안 함'),
  ]),
]

// ---------------------------------------------------------------------------
// Google Drive tree data
// ---------------------------------------------------------------------------

const GDRIVE_TREE: TreeNode[] = [
  d('IZEN Design (Google Drive)', [
    d('행사', [
      d('2026_CIS-Conference', [dc('EN', '영문 인쇄물, 영상'), dc('RU', '러시아어'), dc('사진', '언어 무관')]),
      d('2026_AEEDC-Dubai', [d('EN')]),
      d('2026_Russia-Dental-Expo', [d('EN'), d('RU')]),
      d('2026_IDS-Cologne', [d('EN')]),
    ]),
    d('제품', [
      d('I-system', [dc('EN', '카달로그, 브로슈어, 사용법영상'), d('RU'), d('ZH')]),
      d('T-system', [d('EN'), d('RU')]),
      d('R-system', [d('EN')]),
    ]),
    d('공통', [
      d('회사소개', [dc('EN', '회사소개서, 소개영상'), d('RU'), d('ZH')]),
      d('브랜드-가이드'),
    ]),
  ]),
]

// ---------------------------------------------------------------------------
// Decision table data
// ---------------------------------------------------------------------------

const DECISION_ROWS: Array<{ situation: string; loc: string; color: keyof typeof C; path: string }> = [
  { situation: 'CIS 행사 포스터 작업중 PSD', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../01_인쇄물/포스터/' },
  { situation: 'CIS 포스터 완성 배포본 PDF', loc: 'LIBRARY', color: 'library', path: '03_LIBRARY/05_포스터/ (Rev01)' },
  { situation: 'IZEN 로고 AI, PNG', loc: 'ASSET', color: 'asset', path: '02_ASSET/01_로고/IZEN_CI/' },
  { situation: 'I-system 카달로그 최신 PDF', loc: 'LIBRARY', color: 'library', path: '03_LIBRARY/02_카달로그/I-system/' },
  { situation: '영업팀이 보내준 검수 docx', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-..._회사소개영상/00_기획-문서/' },
  { situation: '월간 SNS 제품 콘텐츠 PSD', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-..._SNS-정기콘텐츠/제품/2026-04_제품명/' },
  { situation: 'Dr. Kim 임상 사진 (반복 사용)', loc: 'ASSET', color: 'asset', path: '02_ASSET/10_임상/자사-케이스/' },
  { situation: '타사 임상 포스터 참고자료', loc: 'ASSET', color: 'asset', path: '02_ASSET/10_임상/레퍼런스/' },
  { situation: 'AEEDC 부스 3D 모델링 C4D', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2604-002_.../02_부스/부스디자인/' },
  { situation: '프로젝트 전용 제품 렌더링', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../03_디지털/렌더링/' },
  { situation: '제품 렌더링 범용 원본 (여러 곳 사용)', loc: 'ASSET', color: 'asset', path: '02_ASSET/02_제품-렌더링/I-system/' },
  { situation: '연구소 요청 신제품 렌더링', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2606-005_.../03_디지털/렌더링/' },
  { situation: '행사 촬영 RAW 영상 (MOV, MXF)', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../04_영상/촬영원본/' },
  { situation: '행사 보정 완료 사진', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../05_사진/보정-선별/' },
  { situation: '회사소개영상 최종 배포본 MP4', loc: 'LIBRARY', color: 'library', path: '03_LIBRARY/01_회사소개/company-video/ (Rev)' },
  { situation: 'Pretendard 폰트 파일', loc: 'ASSET', color: 'asset', path: '02_ASSET/06_폰트/' },
  { situation: 'SNS 템플릿 PSD', loc: 'ASSET', color: 'asset', path: '02_ASSET/07_템플릿/' },
  { situation: 'I-system STEP 파일', loc: 'ASSET', color: 'asset', path: '02_ASSET/03_3D-소스/' },
  { situation: '브랜드 가이드라인 PDF', loc: 'ASSET', color: 'asset', path: '02_ASSET/05_브랜드-가이드/' },
  { situation: '카달로그 InDesign 마스터', loc: 'ASSET', color: 'asset', path: '02_ASSET/04_카달로그-마스터/' },
  { situation: 'IFU 작업중 InDesign', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2601-013_IFU/' },
  { situation: 'IFU 최종 출력용 PDF', loc: 'LIBRARY', color: 'library', path: '03_LIBRARY/10_IFU/ (Rev)' },
  { situation: '뉴스레터 디자인 PSD', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2601-011_뉴스레터/2026-04/' },
  { situation: '판촉물/굿즈 견적서', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../00_기획-문서/' },
  { situation: '홈페이지 팝업 이미지', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2601-012_홈페이지/' },
  { situation: 'LED 대기화면 영상 (행사용)', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-2603-001_.../03_디지털/스크린/' },
  { situation: '영상용 3D 모션 (C4D)', loc: 'PROJECT', color: 'project', path: '01_PROJECT/DT-.../04_영상/3D-모션/' },
  { situation: '2024년 이전 파일 전부', loc: 'ARCHIVE', color: 'archive', path: '99_ARCHIVE/2024_07_이전/' },
]

// ---------------------------------------------------------------------------
// Naming data
// ---------------------------------------------------------------------------

const NAMING_ELEMENTS: Array<{ el: string; req: string; desc: string; ex: string }> = [
  { el: '브랜드', req: '필수 (해당시)', desc: 'IZEN, IAM, ZENEX, Cleanimplant', ex: 'IZEN' },
  { el: '콘텐츠명', req: '필수', desc: '한영 혼용, 공백 대신 하이픈(-)', ex: 'CIS2026_리플렛' },
  { el: 'variant', req: '여러 버전일 때', desc: '콘텐츠명에 하이픈으로 연결', ex: '회사소개영상-Full' },
  { el: '언어', req: '다국어일 때만', desc: 'EN, RU, ZH, KO', ex: 'EN' },
  { el: '규격', req: '필요시만', desc: '인쇄: A3, A4 / 디지털: 1080x1080, 16x9', ex: 'A4' },
  { el: '버전 (v)', req: 'PROJECT 소스', desc: '내부 수정 버전: v01, v02, v03...', ex: 'v03' },
  { el: '리비전 (Rev)', req: 'LIBRARY 배포본', desc: '외부 배포/인허가 갱신: Rev01, Rev02...', ex: 'Rev01' },
]

const NAMING_CATEGORIES: Array<{ cat: string; examples: string[] }> = [
  {
    cat: '인쇄물 (PROJECT, v 체계)',
    examples: [
      'IZEN_CIS2026_리플렛_EN_A4_v03.ai',
      'IZEN_CIS2026_포스터_RU_A1_v01_작업중.psd',
      'IZEN_CIS2026_배너_EN_v02.ai',
    ],
  },
  {
    cat: '영상 (PROJECT, v 체계)',
    examples: [
      'IZEN_회사소개영상-Full_EN_v03.prproj',
      'IZEN_I-system_사용법영상-기본편_v02.prproj',
      'IZEN_CIS2026_후기영상_16x9_v03.mp4',
    ],
  },
  {
    cat: 'LIBRARY 배포본 (Rev 체계)',
    examples: [
      'IZEN_I-system_카달로그_EN_Rev03.pdf',
      'IZEN_회사소개영상-Full_EN_Rev01.mp4',
      'IZEN_회사소개서_EN_Rev02.pdf',
    ],
  },
  {
    cat: 'SNS / 3D',
    examples: [
      'IZEN_SNS_임상_Dr-Kim-case_v01.png',
      'IZEN_부스_CIS2026_v03.c4d',
      'IZEN_I-system_렌더_정면_v01.png',
    ],
  },
  {
    cat: '작업중 (PROJECT 안에서만)',
    examples: ['IZEN_CIS2026_포스터_EN_v01_작업중.psd'],
  },
  {
    cat: '타팀 수신',
    examples: ['[수신]_CIS2026_기획서_마케팅팀.docx'],
  },
]

// ---------------------------------------------------------------------------
// Workflow mapping data
// ---------------------------------------------------------------------------

const MIGRATION_MAP: Array<{ old: string; dest: string; note: string }> = [
  { old: '[IZEN IMPLANT]', dest: '03_LIBRARY/', note: '최종 파일 보관용이었음 → LIBRARY로 통합' },
  { old: 'design', dest: '03_LIBRARY/', note: '국가별 구조는 파일명 접미사(_EN, _RU)로 대체' },
  { old: '디자인팀 내부/2024_07 이전', dest: '99_ARCHIVE/', note: '이름만 변경, 재분류 안 함 (462K 파일, 6.4TB)' },
  { old: '디자인팀 내부/나머지', dest: '01_PROJECT/', note: '신규 작업부터 새 구조 적용' },
]

// ---------------------------------------------------------------------------
// Tree utilities
// ---------------------------------------------------------------------------

function collectPaths(nodes: TreeNode[], prefix: string): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.children?.length) {
      const p = prefix ? `${prefix}/${n.name}` : n.name
      out.push(p)
      out.push(...collectPaths(n.children, p))
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Tree item component
// ---------------------------------------------------------------------------

function TreeItem({
  node,
  path,
  depth,
  open,
  toggle,
  rootName,
}: {
  node: TreeNode
  path: string
  depth: number
  open: Set<string>
  toggle: (p: string) => void
  rootName: string
}) {
  const isOpen = open.has(path)
  const hasKids = !!node.children?.length
  const color = ROOT_COLORS[rootName]
  const isRoot = depth === 0

  return (
    <>
      <div
        role={hasKids ? 'button' : undefined}
        tabIndex={hasKids ? 0 : undefined}
        onClick={() => hasKids && toggle(path)}
        onKeyDown={(e) => {
          if (hasKids && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            toggle(path)
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          paddingLeft: depth * 18 + 8,
          borderRadius: 6,
          cursor: hasKids ? 'pointer' : 'default',
          userSelect: 'none',
          background: isRoot && color ? color.bg : undefined,
          borderLeft: isRoot && color ? `3px solid ${color.border}` : undefined,
          fontWeight: isRoot ? 700 : 400,
          fontSize: '0.85em',
          lineHeight: 1.8,
        }}
      >
        {hasKids ? (
          <span
            style={{
              fontSize: 9,
              color: 'var(--muted)',
              width: 10,
              textAlign: 'center',
              transition: 'transform 0.15s',
              transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
              flexShrink: 0,
            }}
          >
            ▶
          </span>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        <span style={{ flexShrink: 0 }}>{node.isFile ? '📄' : '📁'}</span>
        <span style={{ color: isRoot && color ? color.text : 'var(--text1)' }}>{node.name}</span>
        {node.comment ? (
          <span style={{ fontSize: '0.82em', color: 'var(--muted)', marginLeft: 2, whiteSpace: 'nowrap' }}>
            ← {node.comment}
          </span>
        ) : null}
      </div>
      {isOpen && hasKids
        ? node.children!.map((child, i) => (
            <TreeItem
              key={`${path}/${child.name}-${i}`}
              node={child}
              path={`${path}/${child.name}`}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              rootName={rootName}
            />
          ))
        : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tree viewer
// ---------------------------------------------------------------------------

function TreeViewer({ data }: { data: TreeNode[] }) {
  const allPaths = useMemo(() => collectPaths(data, ''), [data])
  const defaultOpen = useMemo(() => new Set(data.map((n) => n.name)), [data])
  const [open, setOpen] = useState<Set<string>>(() => defaultOpen)

  const toggle = useCallback((p: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="secondary mini"
          onClick={() => setOpen(new Set(allPaths))}
        >
          전체 펼치기
        </button>
        <button
          type="button"
          className="secondary mini"
          onClick={() => setOpen(new Set())}
        >
          전체 접기
        </button>
        <button
          type="button"
          className="secondary mini"
          onClick={() => setOpen(new Set(defaultOpen))}
        >
          기본값
        </button>
      </div>
      <div
        style={{
          background: 'var(--surface-soft, var(--surface2))',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '8px 4px',
          overflowX: 'auto',
        }}
      >
        {data.map((node, i) => (
          <TreeItem
            key={`${node.name}-${i}`}
            node={node}
            path={node.name}
            depth={0}
            open={open}
            toggle={toggle}
            rootName={node.name}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1: 폴더 구조
// ---------------------------------------------------------------------------

function StructureSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Top-level Structure</span>
            <h3>최상위 구조</h3>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {[
            { label: '01_PROJECT', desc: '작업 과정', color: C.project },
            { label: '02_ASSET', desc: '작업 재료', color: C.asset },
            { label: '03_LIBRARY', desc: '완성 배포본', color: C.library },
            { label: '99_ARCHIVE', desc: '과거 파일', color: C.archive },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: item.color.bg,
                border: `1px solid ${item.color.border}`,
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.88em', color: item.color.text }}>{item.label}</div>
              <div style={{ fontSize: '0.78em', color: item.color.text, opacity: 0.8, marginTop: 2 }}>{item.desc}</div>
            </div>
          ))}
        </div>
        <p>
          <strong>PROJECT</strong>는 프로젝트 코드(<code className="fileGuideCode">DT-YYMM-NNN_프로젝트명</code>)로 분류합니다.
          하위 폴더는 <strong>00~05 (6개)</strong>이며, 해당 없는 폴더는 만들지 않습니다.
          버전: PROJECT 소스파일은 <code className="fileGuideCode">v01, v02...</code>, LIBRARY 배포본은 <code className="fileGuideCode">Rev01, Rev02...</code>
        </p>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Interactive Tree</span>
            <h3>폴더 트리 (클릭하여 열기/닫기)</h3>
          </div>
        </div>
        <TreeViewer data={NAS_TREE} />
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Project Code</span>
            <h3>프로젝트 코드 체계</h3>
          </div>
        </div>
        <div className="fileGuideTree" style={{ whiteSpace: 'normal', fontFamily: 'inherit' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1em', marginBottom: 8, fontFamily: "'Courier New', monospace" }}>
            DT-YYMM-NNN_프로젝트명
          </div>
          <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="workflowCheckpoint">
              <h4>DT</h4>
              <p>Design Team</p>
            </div>
            <div className="workflowCheckpoint">
              <h4>YYMM</h4>
              <p>시작 연월 (예: 2603)</p>
            </div>
            <div className="workflowCheckpoint">
              <h4>NNN</h4>
              <p>해당 월 순번 (001~)</p>
            </div>
          </div>
        </div>
        <p>
          <strong>상시 프로젝트</strong>(SNS, 뉴스레터, 홈페이지, IFU, 회사소개영상)는 매년 1월에 생성하고 연말에 아카이브합니다.
        </p>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 2: 어디에 넣나?
// ---------------------------------------------------------------------------

function DecisionSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Decision Flow</span>
            <h3>3단계 판단 플로우</h3>
          </div>
        </div>
        <div className="workflowTimeline">
          {[
            {
              q: 'Q1. 여러 프로젝트에서 반복적으로 가져다 쓰는 소스인가?',
              yes: '02_ASSET',
              color: C.asset,
              no: '다음 질문 ↓',
            },
            {
              q: 'Q2. 완성되어서 타팀·외부에 바로 줄 수 있는 최종본인가?',
              yes: '03_LIBRARY',
              color: C.library,
              no: '다음 질문 ↓',
            },
            {
              q: 'Q3. 특정 작업/요청에 의해 만들어졌거나 진행 중인가?',
              yes: '01_PROJECT',
              color: C.project,
              no: null,
            },
          ].map((step, i) => (
            <article key={i} className="workflowStep" style={{ gridTemplateColumns: '46px 1fr' }}>
              <div
                className="workflowStepNumber"
                style={{
                  background: step.color.bg,
                  borderColor: step.color.border,
                  color: step.color.text,
                  height: 46,
                  fontSize: 13,
                }}
              >
                Q{i + 1}
              </div>
              <div className="workflowStepBody">
                <h4>{step.q}</h4>
                <p>
                  <span style={{ fontWeight: 700 }}>YES →</span>{' '}
                  <span
                    style={{
                      background: step.color.bg,
                      border: `1px solid ${step.color.border}`,
                      borderRadius: 4,
                      padding: '1px 6px',
                      fontWeight: 700,
                      color: step.color.text,
                      fontSize: '0.9em',
                    }}
                  >
                    {step.yes}
                  </span>
                  {step.no ? (
                    <span style={{ marginLeft: 12, color: 'var(--muted)' }}>
                      NO → {step.no}
                    </span>
                  ) : null}
                </p>
              </div>
            </article>
          ))}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.82em' }}>
          최종본은 <strong>PROJECT 10_최종납품/</strong>에 저장 + <strong>LIBRARY</strong>에도 복사합니다 (이중 보관).
        </p>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Lookup Table</span>
            <h3>상황별 저장 위치</h3>
          </div>
        </div>
        <div className="guideTableWrap" style={{ maxHeight: 520, overflow: 'auto' }}>
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>상황</th>
                <th>위치</th>
                <th>경로</th>
              </tr>
            </thead>
            <tbody>
              {DECISION_ROWS.map((row) => (
                <tr key={row.situation}>
                  <td>{row.situation}</td>
                  <td>
                    <span
                      style={{
                        background: C[row.color].bg,
                        border: `1px solid ${C[row.color].border}`,
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: '0.82em',
                        fontWeight: 600,
                        color: C[row.color].text,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.loc}
                    </span>
                  </td>
                  <td>
                    <code className="fileGuideCode" style={{ fontSize: 11 }}>
                      {row.path}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 3: 파일명 규칙
// ---------------------------------------------------------------------------

function NamingSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Naming Pattern</span>
            <h3>파일명 형식</h3>
          </div>
        </div>
        <div className="fileGuideTree" style={{ textAlign: 'center', fontSize: '1em' }}>
          <code style={{ fontSize: '1.05em', letterSpacing: 0.5 }}>
            [브랜드]_[콘텐츠명-variant]_[언어]_[규격]_v[버전].[확장자]
          </code>
        </div>
        <div className="guideTableWrap">
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>요소</th>
                <th>필수 여부</th>
                <th>설명</th>
                <th>예시</th>
              </tr>
            </thead>
            <tbody>
              {NAMING_ELEMENTS.map((row) => (
                <tr key={row.el}>
                  <td style={{ fontWeight: 600 }}>{row.el}</td>
                  <td>{row.req}</td>
                  <td>{row.desc}</td>
                  <td>
                    <code className="fileGuideCode">{row.ex}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          구분자: 요소 간 <code className="fileGuideCode">_</code>(언더스코어),
          콘텐츠명 내부 띄어쓰기 <code className="fileGuideCode">-</code>(하이픈)
        </p>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Examples by Category</span>
            <h3>카테고리별 파일명 예시</h3>
          </div>
        </div>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {NAMING_CATEGORIES.map((cat) => (
            <div key={cat.cat} className="workflowCheckpoint">
              <h4>{cat.cat}</h4>
              {cat.examples.map((ex) => (
                <p key={ex} className="fileGuideExample">
                  {ex}
                </p>
              ))}
            </div>
          ))}
        </div>
      </article>

      <article className="workflowCard workflowCardWide" style={{ borderColor: '#f59e0b', borderStyle: 'dashed' }}>
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: '#92400e' }}>Cautions</span>
            <h3>주의사항</h3>
          </div>
        </div>
        <ul className="workflowList" style={{ fontSize: '0.88em' }}>
          <li>프로젝트 코드(DT-YYMM-NNN)는 <strong>파일명에 포함하지 않음</strong> — 폴더가 이미 프로젝트별로 분리</li>
          <li><strong>v = PROJECT 소스파일</strong> (v01, v02...), <strong>Rev = LIBRARY 배포본</strong> (Rev01, Rev02...) — 보통 다른 파일 형식 (.ai→.pdf)</li>
          <li><code className="fileGuideCode">_작업중</code> 표시는 <strong>PROJECT 안에서만</strong> 허용, LIBRARY에는 절대 불가</li>
          <li>타팀에서 받은 파일은 <code className="fileGuideCode">[수신]_</code> 접두사</li>
          <li>LIBRARY 파일은 항상 완성본 (Rev 체계)</li>
          <li>v→Rev 매핑은 Phase 2 업로드 도구에서 자동 추적 예정</li>
        </ul>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 4: 작업 흐름
// ---------------------------------------------------------------------------

function WorkflowSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Completion Checklist</span>
            <h3>작업 완료 시 3단계 체크리스트</h3>
          </div>
        </div>
        <div className="workflowTimeline">
          {[
            { n: '1', text: '완성본을 03_LIBRARY/ 해당 카테고리에 Rev 번호로 올림' },
            { n: '2', text: 'LIBRARY에 구버전 있으면 → _archive/로 이동' },
            { n: '3', text: 'ASSET 소스가 업데이트되었으면 → ASSET도 갱신' },
          ].map((step) => (
            <article key={step.n} className="workflowStep" style={{ gridTemplateColumns: '40px 1fr' }}>
              <div className="workflowStepNumber" style={{ height: 40, fontSize: 14 }}>
                {step.n}
              </div>
              <div className="workflowStepBody">
                <p style={{ fontWeight: 500, color: 'var(--text1)' }}>{step.text}</p>
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Annual Cycle</span>
            <h3>상시 프로젝트 연간 사이클</h3>
          </div>
        </div>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.project.border}` }}>
            <h4>1월</h4>
            <p>새 프로젝트 폴더 생성</p>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: '3px solid var(--primary)' }}>
            <h4>2~11월</h4>
            <p>월별 하위 폴더에 작업</p>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.archive.border}` }}>
            <h4>12월</h4>
            <p>연말 정리 후 99_ARCHIVE로 이동</p>
          </div>
        </div>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Migration Map</span>
            <h3>기존 폴더 → 새 구조 매핑</h3>
          </div>
        </div>
        <div className="guideTableWrap">
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>기존</th>
                <th>→</th>
                <th>새 위치</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {MIGRATION_MAP.map((row) => (
                <tr key={row.old}>
                  <td style={{ fontWeight: 600 }}>
                    <code className="fileGuideCode">{row.old}</code>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--muted)' }}>→</td>
                  <td>
                    <code className="fileGuideCode">{row.dest}</code>
                  </td>
                  <td>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: '0.82em', color: 'var(--muted)' }}>
          [IZEN IMPLANT]과 design은 시기를 달리해서 만들어졌지만, 둘 다 최종 파일 보관 목적이었음 (팀장 확인 완료). 새 구조에서는 03_LIBRARY 하나로 통합.
        </p>
      </article>

      <article className="workflowCard workflowCardWide" style={{ borderColor: '#f59e0b', borderStyle: 'dashed' }}>
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: '#92400e' }}>Pending</span>
            <h3>미결 사항</h3>
          </div>
        </div>
        <ul className="workflowList" style={{ fontSize: '0.88em' }}>
          <li>NAS 권한 설정 (폴더별 읽기/쓰기 분리 필요 여부)</li>
          <li>마이그레이션 계획 (신규 구조 이전 방법 및 일정)</li>
          <li>Thumbs.db 일괄 정리 (4,335개)</li>
          <li>팀 교육 시점</li>
        </ul>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">NAS Stats</span>
            <h3>현재 NAS 현황</h3>
          </div>
        </div>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          {[
            { label: '총 파일 수', value: '462,964개' },
            { label: '총 폴더 수', value: '33,424개' },
            { label: '총 용량', value: '약 6.5TB' },
            { label: 'Thumbs.db', value: '4,335개' },
          ].map((stat) => (
            <div key={stat.label} className="workflowCheckpoint" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.78em', color: 'var(--muted)' }}>{stat.label}</p>
              <h4 style={{ fontSize: '1.1em' }}>{stat.value}</h4>
            </div>
          ))}
        </div>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 5: 구글 드라이브
// ---------------------------------------------------------------------------

function GDriveSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: C.gdrive.text }}>Google Drive Structure</span>
            <h3>구글 드라이브 (딜러 공유용)</h3>
          </div>
        </div>
        <p>
          NAS는 내부 작업/보관용, 외부(딜러) 공유는 구글 드라이브.
          카테고리 안에서 <strong>언어별 하위 폴더</strong>로 분리하여 인허가 혼선을 방지합니다.
        </p>
        <TreeViewer data={GDRIVE_TREE} />
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: C.gdrive.text }}>Key Principles</span>
            <h3>핵심 원칙</h3>
          </div>
        </div>
        <div className="workflowTimeline">
          {[
            { n: '1', text: '행사 자료 올릴 때: 해당 행사 폴더 한 곳만 가서, EN/RU 등 언어별로 나눠 넣으면 끝', sub: '여러 곳에 중복 업로드 안 함' },
            { n: '2', text: '언어 폴더가 하위에 있으므로 다른 언어 카달로그가 섞일 수 없음', sub: '인허가 혼선 방지' },
            { n: '3', text: '사진처럼 언어 무관한 파일은 언어 폴더 밖에 바로 배치', sub: '' },
            { n: '4', text: '딜러 공유 시: 해당 행사의 해당 언어 폴더 링크만 전달', sub: '예: 러시아 딜러 → 행사/2026_CIS-Conference/RU/' },
          ].map((step) => (
            <article key={step.n} className="workflowStep" style={{ gridTemplateColumns: '40px 1fr' }}>
              <div
                className="workflowStepNumber"
                style={{ height: 40, fontSize: 14, background: C.gdrive.bg, borderColor: C.gdrive.border, color: C.gdrive.text }}
              >
                {step.n}
              </div>
              <div className="workflowStepBody">
                <p style={{ fontWeight: 500, color: 'var(--text1)' }}>{step.text}</p>
                {step.sub ? <p>{step.sub}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: C.gdrive.text }}>NAS ↔ Google Drive</span>
            <h3>관계 정리</h3>
          </div>
        </div>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.library.border}` }}>
            <h4>NAS (03_LIBRARY)</h4>
            <p>유형별 정리 (카달로그, 영상 등). 원본 보관소.</p>
          </div>
          <div className="workflowCheckpoint" style={{ textAlign: 'center', border: 'none', background: 'none', padding: '12px 0' }}>
            <p style={{ fontSize: '1.5em' }}>→</p>
            <p style={{ fontSize: '0.78em', color: 'var(--muted)' }}>최종 파일 복사</p>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.gdrive.border}` }}>
            <h4>구글 드라이브</h4>
            <p>용도별(행사/제품/공통) &gt; 언어별 정리. 외부 공유 창구.</p>
          </div>
        </div>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'structure', label: '폴더 구조', icon: '📁' },
  { id: 'decision', label: '어디에 넣나?', icon: '🔍' },
  { id: 'naming', label: '파일명 규칙', icon: '📝' },
  { id: 'workflow', label: '작업 흐름', icon: '🔄' },
  { id: 'gdrive', label: '구글 드라이브', icon: '☁️' },
] as const

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NasGuideView() {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <section className="workflowView" aria-label="NAS 폴더 구조 가이드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">NAS Folder Guide</span>
          <h2>NAS 폴더 구조 가이드</h2>
          <p>
            "이 파일은 어디에 넣어야 하지?"를 바로 판단할 수 있는 가이드입니다.
            <strong> PROJECT</strong>(작업 과정) · <strong>ASSET</strong>(재료) · <strong>LIBRARY</strong>(완성본) · <strong>ARCHIVE</strong>(과거 파일) 4축으로 정리합니다.
          </p>
        </div>
      </header>

      {/* Tab navigation */}
      <nav
        style={{
          display: 'flex',
          gap: 4,
          overflowX: 'auto',
          padding: '2px 0',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === i ? '' : 'secondary'}
            onClick={() => setActiveTab(i)}
            style={{
              padding: '7px 14px',
              fontSize: '0.82em',
              whiteSpace: 'nowrap',
              borderRadius: 8,
              ...(activeTab !== i ? { boxShadow: 'none' } : {}),
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === 0 ? <StructureSection /> : null}
        {activeTab === 1 ? <DecisionSection /> : null}
        {activeTab === 2 ? <NamingSection /> : null}
        {activeTab === 3 ? <WorkflowSection /> : null}
        {activeTab === 4 ? <GDriveSection /> : null}
      </div>
    </section>
  )
}
