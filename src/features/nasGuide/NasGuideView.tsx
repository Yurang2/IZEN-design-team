import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { api } from '../../shared/api/client'
import { GENERATED_NAS_GUIDE_EXAMPLES, GENERATED_NAS_GUIDE_EXAMPLE_META } from './nasGuideExamples.generated'
import {
  WORK_MANUAL_CATEGORIES,
  WORK_TYPE_MANUALS,
  WORK_TYPE_MANUAL_MAP,
  type WorkManualCategoryKey,
  type WorkTypeManual,
} from './workTypeManuals'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TreeNode = {
  name: string
  comment?: string
  children?: TreeNode[]
  isFile?: boolean
}

type TreeExample = {
  path: string
  name: string
  comment?: string
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
  'Google Drive': C.gdrive,
  '99_ARCHIVE': C.archive,
  'IZEN Design (Google Drive)': C.gdrive,
}

// ---------------------------------------------------------------------------
// NAS Tree data
// ---------------------------------------------------------------------------

const NAS_TREE: TreeNode[] = [
  dc('01_PROJECT', '작업 과정 (프로젝트별)', [
    // ── 비정기 (0001~0899) ──
    dc('IZ250001_CIS-Conference-2026', '풀세트 행사 프로젝트', [
      d('00_기획-문서', [
        dc('기획서', '타팀 수령 기획서', [fc('CIS2026_기획서_마케팅팀.docx', '원본 파일명 그대로')]),
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
        dc('SNS', 'SNS용 이미지 (작업+업로드)'),
        d('PPT', [f('IZEN_CIS2026_발표자료_v01.pptx')]),
        dc('행사운영', '행사장 운영 에셋 (이미지+영상+오디오+큐시트)', [
          f('I01_graphic.png'), f('V01_graphic.mp4'), f('A01_Entrance_Audio.wav'), f('IZEN_Bangkok2026_큐시트.pdf'),
        ]),
        dc('렌더링', '프로젝트 전용 제품 렌더링', [f('IZEN_CIS2026_제품_렌더_정면_v01.png')]),
        d('홈페이지'),
      ]),
      dc('04_영상', 'a,b만 고정. 나머지는 영상 종류별 자유 생성', [
        dc('a_자체촬영', '카메라 RAW (MXF, MOV)', [f('CIS2026_DAY1_CAM-A_001.MXF')]),
        d('b_수신', [dc('외주', '외부 영상팀 (원본 or 완성본)'), dc('타팀', '영업팀 핸드폰 영상 등')]),
        dc('후기영상', '자유 생성 예시 — 행사 프로젝트', [
          f('IZEN_CIS2026_후기_v01.prproj'),
          f('IZEN_CIS2026_후기_v01.mp4'),
          dc('IZEN_CIS2026_후기_v01', '귀속 소스', [
            f('IZEN_CIS2026_후기_썸네일_v01.png'),
            f('IZEN_CIS2026_후기_자막_EN_v01.txt'),
            f('Adobestock_123456789.wav'),
            f('Adobestock_987654321.mp4'),
          ]),
        ]),
        dc('티저', '자유 생성 예시', [f('IZEN_CIS2026_티저_v01.aep'), f('IZEN_CIS2026_티저_v01.mp4')]),
        dc('모션그래픽', '오프닝 등 → 완성본은 03_디지털/행사운영/에도 복사', [
          f('IZEN_CIS2026_오프닝_v01.c4d'), f('IZEN_CIS2026_오프닝_v01.mp4'),
        ]),
        dc('강연소개', '자유 생성 예시', [f('IZEN_CIS2026_강연소개_Dr-Kim_v01.aep'), f('IZEN_CIS2026_강연소개_Dr-Kim_v01.mp4')]),
      ]),
      d('05_사진', [
        dc('a_자체촬영', '카메라 RAW/JPG 전량'),
        dc('b_수신', '타팀 핸드폰 등 (작업 필요한 소스)', [d('타팀')]),
        dc('c_보정', '우리 보정 + 외주 보정본 (여기서 DAY 분류)'),
        d('d_공유', [dc('DAY1', '1일차 공유 사진'), dc('DAY2', '2일차 공유 사진')]),
      ]),
      dc('06_현장수집', '타사 부스/제품 등 현장 레퍼런스 (사진·영상 구분 없이)'),
    ]),
    dc('IZ250002_AEEDC-Dubai-2026', '중간 규모', [
      d('00_기획-문서'),
      d('01_인쇄물', [d('리플렛'), d('배너-현수막')]),
      d('02_부스', [d('부스디자인'), d('부스그래픽')]),
      d('04_영상', [d('클립'), d('후기영상'), d('홍보영상')]),
    ]),
    dc('IZ250003_IDS-Cologne-2026', '소규모', [
      d('01_인쇄물', [d('리플렛'), d('배너-현수막')]),
      d('02_부스', [d('부스디자인'), d('부스그래픽')]),
    ]),
    dc('IZ250004_Russia-Dental-Expo-2026', '러시아어 버전 포함', [
      d('01_인쇄물', [
        d('포스터', [f('IZEN_RusDentalExpo_포스터_RU_A1_v01.ai')]),
        d('리플렛', [f('IZEN_RusDentalExpo_리플렛_RU_A4_v01.ai'), f('IZEN_RusDentalExpo_리플렛_EN_A4_v01.ai')]),
      ]),
      d('02_부스'),
    ]),
    // ── 비정기 (제품/콘텐츠) ──
    dc('IZ250015_회사소개영상-v3수정', '영업팀 검수 → 자막 수정 → 최종본', [
      d('00_기획-문서', [fc('회사소개영상_검수의견_영업팀.docx', '원본 파일명 그대로')]),
      d('04_영상', [
        d('회사소개영상', [f('IZEN_회사소개영상-Full_v03.prproj'), f('IZEN_회사소개영상-Full_EN_v03.mp4')]),
      ]),
    ]),
    dc('IZ250016_I-system-카달로그-리뉴얼', 'InDesign → 다국어 PDF', [
      d('01_인쇄물', [
        d('카달로그', [
          f('IZEN_I-system_카달로그_EN_v04.indd'),
          f('IZEN_I-system_카달로그_EN_v04.pdf'),
          f('IZEN_I-system_카달로그_RU_v02.pdf'),
        ]),
      ]),
    ]),
    dc('IZ250017_신제품-렌더링-연구소요청', '연구소 요청 → 3D → 납품', [
      d('00_기획-문서', [f('신제품_렌더링요청_연구소.docx')]),
      d('03_디지털', [d('렌더링', [f('IZEN_신제품_렌더_정면_v01.png'), f('IZEN_신제품_렌더_측면_v01.png')])]),
    ]),
    dc('IZ250018_제품-사용법영상-T-system', '스토리보드 → 3D → 편집', [
      d('00_기획-문서', [f('IZEN_T-system_사용법영상_스토리보드_v01.pptx')]),
      d('04_영상', [
        d('제품영상', [f('IZEN_T-system_사용법_3D_v02.c4d'), f('IZEN_T-system_사용법영상-기본편_v02.prproj'), f('IZEN_T-system_사용법영상-기본편_v02.mp4')]),
      ]),
    ]),
    dc('IZ250031_IFU-Rev개정', 'IFU 개정 → 최종 PDF 배포', [
      d('01_인쇄물', [
        d('IFU', [f('IZEN_I-system_IFU_EN_v02.indd'), f('IZEN_I-system_IFU_EN_v02.pdf')]),
      ]),
    ]),
    // ── 정기 (순번, 구분 없음) ──
    dc('IZ250900_SNS-정기콘텐츠', '정기 (매년 생성, 연말 아카이브)', [
      d('제품', [d('2025-03_I-system-신제품', [f('IZEN_SNS_제품_I-system-fixture_v02.png')]), d('2025-04_T-system-케이스')]),
      d('임상', [d('2025-03_Dr-Kim', [f('IZEN_SNS_임상_Dr-Kim-case_v01.png')])]),
      d('브랜딩'),
    ]),
    dc('IZ250901_뉴스레터', '정기 (매월 발행)', [d('2025-01'), d('2025-02'), d('2025-03')]),
  ]),
  dc('02_ASSET', '작업 재료 (소스)', [
    d('01_로고', [
      d('IZEN_CI', [f('IZEN_CI_LOGO_Black.png'), f('IZEN_CI_LOGO_White.png'), f('IZEN_CI_LOGO.ai')]),
      d('IAM', [f('IAM_LOGO_Black.png'), f('IAM_LOGO_White.png')]),
      d('ZENEX', [f('zenex_logo_bk.png'), f('zenex_logo.ai')]),
      d('Cleanimplant', [f('Cleanimplant_LOGO_Black.png')]),
      dc('Dealer', '딜러 로고'),
    ]),
    d('02_제품-렌더링', [
      d('01_zenex_fixture', [
        d('01_multi', [d('I-System'), d('R-System'), d('T-System')]),
        d('02_plus', [d('I-System'), d('R-System'), d('T-System')]),
      ]),
      d('02_cover_screw'),
      d('03_healing_abutment'),
      dc('04_abutment', '01~18 하위 부품별'),
      d('05_zenex_kit'),
      d('06_sinus_combination_kit'),
      d('07_plazmax'),
      dc('연출', '그래픽용 연출 이미지 — flat (하위 구조는 축적 후 결정)', [
        f('ZMSN3008_정면01_v01.png'), f('ZMSN3008_측면01_v01.png'), f('ZMSN3008_식립01_v01.png'), f('전제품_배치01_v01.png'),
      ]),
    ]),
    dc('03_3D-소스', 'STEP, STL 원본'),
    d('04_브랜드-가이드', [f('IZEN_IMPLANT_BRAND_GUIDELINES_EN.pdf')]),
    d('05_폰트', [f('Pretendard.zip')]),
    dc('06_템플릿', '용도별 서브분류 (AI/PSD/INDD/AEP/PPTX)', [
      dc('01_SNS', '정사각/세로/가로 SNS 템플릿'),
      dc('02_인쇄', 'A4/A3/명함/현수막 템플릿'),
      dc('03_PPT', '발표자료 마스터'),
      dc('04_영상', 'AE 인트로/아웃트로/자막 템플릿'),
      dc('05_InDesign', '카달로그/IFU 마스터'),
    ]),
    d('07_제품사진-원본'),
    d('08_패키지'),
    d('09_임상', [dc('자사-케이스', '자사 임상 사진'), dc('타사-레퍼런스', '타사 임상 참고')]),
    dc('10_연자', '연자 사진+프로필'),
    dc('11_스톡-라이선스', '구매 스톡 원본 + 라이선스 증빙 (재사용 SSOT)', [
      dc('01_이미지', 'Shutterstock/iStock 이미지'),
      dc('02_영상', 'Adobe Stock/Envato 영상 클립'),
      dc('03_오디오', 'BGM/효과음 (Adobe Stock, Artlist 등)'),
      dc('04_모션', '.mogrt, AE 템플릿 (Envato 등)'),
    ]),
  ]),
  dc('99_ARCHIVE', '과거 파일 보존', [
    dc('2024_07_이전', '기존 462K 파일 그대로 보존 — 재분류 안 함'),
  ]),
]

// ---------------------------------------------------------------------------
// Google Drive tree data
// ---------------------------------------------------------------------------

const GDRIVE_TREE: TreeNode[] = [
  d('Google Drive', [
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
    d('08_영상', [d('후기영상'), d('홍보영상'), d('브랜딩영상'), d('모션그래픽'), d('제품영상'), d('회사소개영상')]),
    d('09_패키지'),
    d('10_IFU'),
    d('11_기타-배포본'),
    d('12__archive', [dc('구버전', 'Rev 하위 구버전 보관')]),
  ]),
]

// ---------------------------------------------------------------------------
// Decision table data
// ---------------------------------------------------------------------------

const DECISION_ROWS: Array<{
  situation: string
  workLoc?: string
  workColor?: keyof typeof C
  workPath?: string
  publishLoc?: string
  publishColor?: keyof typeof C
  publishPath?: string
}> = [
  { situation: 'CIS 행사 포스터 작업중 PSD', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../01_인쇄물/포스터/' },
  { situation: 'CIS 포스터 완성 배포본 PDF', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../01_인쇄물/포스터/', publishLoc: 'Google Drive', publishColor: 'gdrive', publishPath: 'Google Drive/05_포스터/ (Rev01)' },
  { situation: 'IZEN 로고 AI, PNG', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/01_로고/IZEN_CI/' },
  { situation: 'I-system 카달로그 최신 PDF', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250016_.../01_인쇄물/카달로그/', publishLoc: 'Google Drive', publishColor: 'gdrive', publishPath: 'Google Drive/02_카달로그/I-system/' },
  { situation: '영업팀이 보내준 검수 docx', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250015_회사소개영상-v3수정/00_기획-문서/' },
  { situation: '월간 SNS 제품 콘텐츠 PSD', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250900_SNS-정기콘텐츠/제품/2025-03_I-system-신제품/' },
  { situation: 'Dr. Kim 임상 사진 (반복 사용)', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/09_임상/자사-케이스/' },
  { situation: '타사 임상 포스터 참고자료', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/09_임상/타사-레퍼런스/' },
  { situation: 'AEEDC 부스 3D 모델링 C4D', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250002_.../02_부스/부스디자인/' },
  { situation: '프로젝트 전용 제품 렌더링', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../03_디지털/렌더링/' },
  { situation: '제품 렌더링 범용 원본 (여러 곳 사용)', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/02_제품-렌더링/연출/' },
  { situation: '연구소 요청 신제품 렌더링', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250017_.../03_디지털/렌더링/' },
  { situation: '행사 촬영 RAW 영상 (MOV, MXF)', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../04_영상/a_자체촬영/' },
  { situation: '행사 보정 완료 사진', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../05_사진/c_보정/' },
  { situation: '회사소개영상 최종 배포본 MP4', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250015_회사소개영상-v3수정/04_영상/회사소개영상/', publishLoc: 'Google Drive', publishColor: 'gdrive', publishPath: 'Google Drive/01_회사소개/company-video/ (Rev)' },
  { situation: 'Pretendard 폰트 파일', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/05_폰트/' },
  { situation: 'SNS 템플릿 PSD', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/06_템플릿/01_SNS/' },
  { situation: 'I-system STEP 파일', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/03_3D-소스/' },
  { situation: '브랜드 가이드라인 PDF', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/04_브랜드-가이드/' },
  { situation: '구매한 Adobe Stock BGM', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/11_스톡-라이선스/03_오디오/' },
  { situation: '연자 프로필 사진', workLoc: 'ASSET', workColor: 'asset', workPath: '02_ASSET/10_연자/' },
  { situation: '카달로그 InDesign 작업파일', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250016_.../01_인쇄물/카달로그/' },
  { situation: 'IFU 작업중 InDesign', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250031_IFU-Rev개정/01_인쇄물/IFU/', publishLoc: 'Google Drive', publishColor: 'gdrive', publishPath: 'Google Drive/10_IFU/ (최종 PDF 배포)' },
  { situation: 'IFU 최종 출력용 PDF', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250031_IFU-Rev개정/01_인쇄물/IFU/', publishLoc: 'Google Drive', publishColor: 'gdrive', publishPath: 'Google Drive/10_IFU/ (Rev)' },
  { situation: '뉴스레터 디자인 PSD', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250901_뉴스레터/2025-03/' },
  { situation: '판촉물/굿즈 견적서', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../00_기획-문서/' },
  { situation: '홈페이지 팝업 이미지', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ26XXXX_홈페이지팝업/03_디지털/홈페이지/' },
  { situation: 'LED 대기화면/오프닝 등 모션 작업', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../04_영상/모션그래픽/ → 완성 후 03_디지털/행사운영/에 복사' },
  { situation: '모션그래픽 (오프닝, 브레이크 등)', workLoc: 'PROJECT', workColor: 'project', workPath: '01_PROJECT/IZ250001_.../04_영상/모션그래픽/' },
  { situation: '2024년 이전 파일 전부', workLoc: 'ARCHIVE', workColor: 'archive', workPath: '99_ARCHIVE/2024_07_이전/' },
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
  { el: '리비전 (Rev)', req: 'Google Drive 배포본', desc: '외부 배포/인허가 갱신: Rev01, Rev02...', ex: 'Rev01' },
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
    cat: 'Google Drive 배포본 (Rev 체계)',
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
    cat: '타팀 수신 (파일명 변경 없이 원본 그대로)',
    examples: ['카헤티 행사 기획서.docx', '카헤티 행사 기획서_조정훈v01.docx'],
  },
  {
    cat: '제품 렌더링 연출 (코드명_특징NN_vNN)',
    examples: [
      'ZMSN3008_정면01_v01.png',
      'ZMSN3008_측면01_v01.png',
      'ZMSN3008_측면02_v01.png',
      'ZMSN3008_식립01_v02.png',
      '전제품_배치01_v01.png',
    ],
  },
]

// ---------------------------------------------------------------------------
// Workflow mapping data
// ---------------------------------------------------------------------------

const MIGRATION_MAP: Array<{ old: string; dest: string; note: string }> = [
  { old: '[IZEN IMPLANT]', dest: 'Google Drive/', note: '최종 파일 보관용이었음 → LIBRARY로 통합' },
  { old: 'design', dest: 'Google Drive/', note: '국가별 구조는 파일명 접미사(_EN, _RU)로 대체' },
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

function cloneTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => ({
    ...node,
    children: node.children ? cloneTree(node.children) : undefined,
  }))
}

const PROJECT_PREFIX_MAP: Record<string, string> = {
  'IZ250001_CIS-Conference-2026': 'IZEN_CIS2026',
  'IZ250002_AEEDC-Dubai-2026': 'IZEN_AEEDC-Dubai-2026',
  'IZ250003_IDS-Cologne-2026': 'IZEN_IDS-Cologne-2026',
  'IZ250004_Russia-Dental-Expo-2026': 'IZEN_RusDentalExpo',
  'IZ250015_회사소개영상-v3수정': 'IZEN_회사소개영상',
  'IZ250016_I-system-카달로그-리뉴얼': 'IZEN_I-system_카달로그',
  'IZ250017_신제품-렌더링-연구소요청': 'IZEN_신제품_렌더',
  'IZ250018_제품-사용법영상-T-system': 'IZEN_T-system_사용법영상',
  'IZ250900_SNS-정기콘텐츠': 'IZEN_SNS',
  'IZ250901_뉴스레터': 'IZEN_뉴스레터',
}

const PROJECT_RAW_PREFIX_MAP: Record<string, string> = {
  'IZ250001_CIS-Conference-2026': 'CIS2026',
  'IZ250002_AEEDC-Dubai-2026': 'AEEDC2026',
  'IZ250003_IDS-Cologne-2026': 'IDS2026',
  'IZ250004_Russia-Dental-Expo-2026': 'RusDentalExpo2026',
}

function projectPrefix(projectFolder: string) {
  return PROJECT_PREFIX_MAP[projectFolder] ?? `IZEN_${projectFolder.replace(/^IZ\d{6}_/, '')}`
}

function projectRawPrefix(projectFolder: string) {
  return PROJECT_RAW_PREFIX_MAP[projectFolder] ?? projectPrefix(projectFolder).replace(/^IZEN_/, '')
}

function buildEmptyLeafExampleFiles(pathSegments: string[]): TreeNode[] {
  const joined = pathSegments.join('/')
  const root = pathSegments[0]

  if (root === '01_PROJECT') {
    const projectFolder = pathSegments[1]
    const leaf = pathSegments[pathSegments.length - 1]
    const prefix = projectPrefix(projectFolder)
    const rawPrefix = projectRawPrefix(projectFolder)

    if (joined.endsWith('/00_기획-문서/미팅')) return [f(`${prefix}_킥오프미팅_회의록_v01.docx`)]
    if (joined.endsWith('/00_기획-문서')) return [f(`${prefix}_운영계획_v01.pptx`)]
    if (leaf === '브로슈어') return [f(`${prefix}_브로슈어_EN_12p_v01.indd`)]
    if (leaf === '리플렛') {
      const lang = projectFolder.includes('Russia') ? 'RU' : 'EN'
      return [f(`${prefix}_리플렛_${lang}_A4_v01.ai`)]
    }
    if (leaf === '배너-현수막') return [f(`${prefix}_배너_EN_v01.ai`)]
    if (leaf === 'SNS') return [f(`${prefix}_SNS_1080x1350_v01.psd`)]
    if (leaf === '홈페이지') return [f(`${prefix}_홈페이지-배너_1920x1080_v01.psd`)]
    if (joined.endsWith('/04_영상/b_수신/외주')) return [f(`${rawPrefix}_aftermovie_draft.mov`)]
    if (joined.endsWith('/04_영상/b_수신/타팀')) return [f(`sales_team_${rawPrefix}_reference.mp4`)]
    if (joined.endsWith('/05_사진/a_자체촬영')) return [f('3N8A2815.JPG')]
    if (joined.endsWith('/05_사진/b_수신/타팀')) return [f('IMG_4821.HEIC')]
    if (joined.endsWith('/05_사진/c_보정')) return [f(`${prefix}_DAY1_보정_v01.jpg`)]
    if (joined.endsWith('/05_사진/d_공유/DAY1')) return [f(`${prefix}_DAY1_공유_01.jpg`)]
    if (joined.endsWith('/05_사진/d_공유/DAY2')) return [f(`${prefix}_DAY2_공유_01.jpg`)]
    if (leaf === '06_현장수집') return [f('IMG_7012.JPG')]
    if (leaf === '부스디자인') return [f(`IZEN_부스_${projectRawPrefix(projectFolder)}_v01.c4d`)]
    if (leaf === '부스그래픽') return [f(`${prefix}_부스_벽면A_v01.ai`)]
    if (leaf === '클립') return [f(`${rawPrefix}_DAY1_CAM-A_001.MXF`)]
    if (leaf === '후기영상') return [f(`${prefix}_후기영상_16x9_v01.mp4`)]
    if (leaf === '홍보영상') return [f(`${prefix}_홍보영상_16x9_v01.mp4`)]
    if (leaf === '02_부스') return [f(`IZEN_부스_${projectRawPrefix(projectFolder)}_v01.c4d`)]
    if (joined.endsWith('/제품/2025-04_T-system-케이스')) return [f('IZEN_SNS_제품_T-system-case_v01.png')]
    if (joined.endsWith('/브랜딩')) return [f('IZEN_SNS_브랜딩_BI-story_v01.png')]
    if (/01_PROJECT\/IZ250901_뉴스레터\/\d{4}-\d{2}$/.test(joined)) return [f(`${prefix}_${leaf}_v01.pptx`)]
  }

  if (root === '02_ASSET') {
    if (joined.endsWith('/01_로고/Dealer')) return [f('NDENT_LOGO.ai')]
    if (joined.includes('/02_제품-렌더링/01_zenex_fixture/01_multi/')) {
      return [f(`MULTI_${pathSegments[pathSegments.length - 1]}_정면01_v01.png`)]
    }
    if (joined.includes('/02_제품-렌더링/01_zenex_fixture/02_plus/')) {
      return [f(`PLUS_${pathSegments[pathSegments.length - 1]}_정면01_v01.png`)]
    }
    if (joined.endsWith('/02_cover_screw')) return [f('COVER-SCREW_정면01_v01.png')]
    if (joined.endsWith('/03_healing_abutment')) return [f('HEALING-ABUTMENT_정면01_v01.png')]
    if (joined.endsWith('/04_abutment')) return [f('ABUTMENT_정면01_v01.png')]
    if (joined.endsWith('/05_zenex_kit')) return [f('ZENEX-KIT_구성01_v01.png')]
    if (joined.endsWith('/06_sinus_combination_kit')) return [f('SINUS-COMBINATION-KIT_구성01_v01.png')]
    if (joined.endsWith('/07_plazmax')) return [f('PLAZMAX_정면01_v01.png')]
    if (joined.endsWith('/03_3D-소스')) return [f('CATRN70207_Rev00.STEP')]
    if (joined.endsWith('/06_템플릿/01_SNS')) return [f('IZEN_SNS_템플릿_1080x1350_v01.psd')]
    if (joined.endsWith('/06_템플릿/02_인쇄')) return [f('IZEN_인쇄_템플릿_A4_v01.ai')]
    if (joined.endsWith('/06_템플릿/03_PPT')) return [f('IZEN_발표자료_템플릿_16x9_v01.pptx')]
    if (joined.endsWith('/06_템플릿/04_영상')) return [f('IZEN_영상_인트로_템플릿_16x9_v01.aep')]
    if (joined.endsWith('/06_템플릿/05_InDesign')) return [f('IZEN_카달로그_마스터_v01.indt')]
    if (joined.endsWith('/07_제품사진-원본')) return [f('3N8A3001.JPG')]
    if (joined.endsWith('/08_패키지')) return [f('IZEN_Taper-Kit_패키지_v01.ai')]
    if (joined.endsWith('/09_임상/자사-케이스')) return [f('Dr-Kim_case-01.jpg')]
    if (joined.endsWith('/09_임상/타사-레퍼런스')) return [f('Megagen_case-reference_01.jpg')]
    if (joined.endsWith('/10_연자')) return [f('Dr-Kim_profile.png')]
    if (joined.endsWith('/11_스톡-라이선스/01_이미지')) return [f('Shutterstock_1234567_dental-clinic.jpg')]
    if (joined.endsWith('/11_스톡-라이선스/02_영상')) return [f('Adobestock_2345678_lab-scene.mp4')]
    if (joined.endsWith('/11_스톡-라이선스/03_오디오')) return [f('Adobestock_3456789_BGM-orchestral.wav')]
    if (joined.endsWith('/11_스톡-라이선스/04_모션')) return [f('Envato_4567890_logo-reveal.mogrt')]
  }

  if (root === '99_ARCHIVE') {
    return [f('2024-06_CIS2024_포스터_최종.ai')]
  }

  if (root === 'Google Drive') {
    if (joined.endsWith('/02_카달로그/T-system')) return [f('IZEN_T-system_카달로그_EN_Rev01.pdf')]
    if (joined.endsWith('/02_카달로그/R-system')) return [f('IZEN_R-system_카달로그_EN_Rev01.pdf')]
    if (joined.endsWith('/03_브로슈어')) return [f('IZEN_I-system_브로슈어_EN_Rev01.pdf')]
    if (joined.endsWith('/04_리플렛')) return [f('IZEN_Taper-Kit_리플렛_EN_Rev01.pdf')]
    if (joined.endsWith('/05_포스터')) return [f('IZEN_CIS2026_포스터_EN_A1_Rev01.pdf')]
    if (joined.endsWith('/06_certificate')) return [f('IZEN_CIS2026_certificate_Rev01.pdf')]
    if (joined.endsWith('/07_배너-사인물')) return [f('IZEN_AEEDC-Dubai-2026_배너_EN_Rev01.pdf')]
    if (joined.endsWith('/08_영상/후기영상')) return [f('IZEN_CIS2026_후기영상_16x9_Rev01.mp4')]
    if (joined.endsWith('/08_영상/홍보영상')) return [f('IZEN_AEEDC-Dubai-2026_홍보영상_16x9_Rev01.mp4')]
    if (joined.endsWith('/08_영상/브랜딩영상')) return [f('IZEN_브랜딩영상_16x9_Rev01.mp4')]
    if (joined.endsWith('/08_영상/모션그래픽')) return [f('IZEN_모션그래픽_16x9_Rev01.mp4')]
    if (joined.endsWith('/08_영상/제품영상')) return [f('IZEN_I-system_제품영상_16x9_Rev01.mp4')]
    if (joined.endsWith('/08_영상/회사소개영상')) return [f('IZEN_회사소개영상-Full_EN_Rev01.mp4')]
    if (joined.endsWith('/09_패키지')) return [f('IZEN_Taper-Kit_패키지_Rev01.pdf')]
    if (joined.endsWith('/10_IFU')) return [f('IZEN_I-system_IFU_EN_Rev01.pdf')]
    if (joined.endsWith('/11_기타-배포본')) return [f('IZEN_제품비교표_EN_Rev01.pdf')]
    if (joined.endsWith('/12__archive/구버전')) return [f('IZEN_회사소개서_EN_Rev01.pdf')]
  }

  return [f(`${pathSegments[pathSegments.length - 1]}_sample_v01.txt`)]
}

function fillEmptyLeafExampleFiles(nodes: TreeNode[], prefix: string[] = []): TreeNode[] {
  return nodes.map((node) => {
    if (node.isFile) return { ...node }

    const currentPath = [...prefix, node.name]
    const children = node.children ? fillEmptyLeafExampleFiles(node.children, currentPath) : []
    const hasFolders = children.some((child) => !child.isFile)
    const hasFiles = children.some((child) => child.isFile)

    return {
      ...node,
      children: !hasFolders && !hasFiles ? buildEmptyLeafExampleFiles(currentPath) : children,
    }
  })
}

function stripFilesFromTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    return {
      ...node,
      children: node.children ? stripFilesFromTree(node.children.filter((child) => !child.isFile)) : undefined,
    }
  })
}

function mergeFilesIntoTree(baseTree: TreeNode[], examples: TreeExample[]): TreeNode[] {
  const tree = cloneTree(baseTree)

  for (const example of examples) {
    const segments = example.path.split('/').filter(Boolean)
    if (segments.length === 0) continue

    let cursor = tree
    for (const segment of segments) {
      let next = cursor.find((node) => !node.isFile && node.name === segment)
      if (!next) {
        next = { name: segment, children: [] }
        cursor.push(next)
      }
      if (!next.children) next.children = []
      cursor = next.children
    }

    const exists = cursor.some((node) => node.isFile && node.name === example.name && node.comment === example.comment)
    if (!exists) {
      cursor.push({ name: example.name, comment: example.comment, isFile: true })
    }
  }

  return tree
}

// ---------------------------------------------------------------------------
// Tree item component
// ---------------------------------------------------------------------------

type HighlightRole = 'asset' | 'project' | 'gdrive'


function TreeItem({
  node,
  path,
  depth,
  open,
  toggle,
  rootName,
  highlightedPaths,
  dimHighlightedPaths,
  folderStatusMap,
  onFolderStatusClick,
  manualRefsByPath,
  onManualRefClick,
  descendantCountByPath,
}: {
  node: TreeNode
  path: string
  depth: number
  open: Set<string>
  toggle: (p: string) => void
  rootName: string
  highlightedPaths?: Map<string, HighlightRole> | null
  dimHighlightedPaths?: Map<string, HighlightRole> | null
  folderStatusMap?: Map<string, FolderStatusItem> | null
  onFolderStatusClick?: (path: string, currentStatus: string, id?: string) => void
  manualRefsByPath?: Map<string, WorkManualRef[]> | null
  onManualRefClick?: (path: string) => void
  descendantCountByPath?: Map<string, { confirmed: number; pending: number }> | null
}) {
  const isOpen = open.has(path)
  const hasKids = !!node.children?.length
  const color = ROOT_COLORS[rootName]
  const isRoot = depth === 0
  const confirmedRole = highlightedPaths?.get(path) ?? null
  const dimRole = !confirmedRole ? dimHighlightedPaths?.get(path) ?? null : null
  const highlightRole = confirmedRole ?? dimRole
  const highlightColor = highlightRole ? C[highlightRole] : null
  const isDim = !!dimRole && !confirmedRole
  const folderStatus = !node.isFile ? folderStatusMap?.get(path) : undefined
  const folderStatusName = folderStatus?.status ?? null
  const folderStatusStyle = folderStatusName ? STATUS_STYLES[folderStatusName] : null
  const canToggleStatus = !node.isFile && !!onFolderStatusClick
  const manualRefs = !node.isFile ? manualRefsByPath?.get(path) : undefined
  const hasManualRefs = !!manualRefs && manualRefs.length > 0
  const confirmedRefs = hasManualRefs ? manualRefs!.filter((r) => r.status === '확정').length : 0
  const canEditRef = !node.isFile && !!onManualRefClick
  const descCount = !node.isFile ? descendantCountByPath?.get(path) : undefined
  const hasDescCount = !!descCount && (descCount.confirmed + descCount.pending) > 0

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
          background: isRoot && color ? color.bg : highlightColor ? (isDim ? highlightColor.soft : highlightColor.bg) : undefined,
          borderLeft: isRoot && color
            ? `3px solid ${color.border}`
            : highlightColor
              ? isDim
                ? `3px dashed ${highlightColor.border}`
                : `3px solid ${highlightColor.border}`
              : undefined,
          boxShadow: highlightColor && !isRoot && !isDim ? `inset 0 0 0 1px ${highlightColor.border}` : undefined,
          fontWeight: isRoot || (highlightColor && !isDim) ? 700 : 400,
          opacity: isDim ? 0.85 : 1,
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
        <span style={{ color: isRoot && color ? color.text : highlightColor ? highlightColor.text : 'var(--text1)' }}>
          {node.name}
        </span>
        {highlightRole && !isRoot ? (
          <span
            style={{
              fontSize: '0.7em',
              fontWeight: 700,
              padding: '1px 6px',
              background: highlightColor!.border,
              color: '#fff',
              borderRadius: 3,
              marginLeft: 4,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {highlightRole === 'gdrive' ? 'PUB' : highlightRole === 'project' ? 'WORK' : 'ASSET'}
          </span>
        ) : null}
        {node.comment ? (
          <span style={{ fontSize: '0.82em', color: 'var(--muted)', marginLeft: 2, whiteSpace: 'nowrap' }}>
            ← {node.comment}
          </span>
        ) : null}
        {hasDescCount ? (
          <span
            title={`하위에 확정 ${descCount!.confirmed}건, 미정+논의중 ${descCount!.pending}건`}
            style={{
              fontSize: '0.68em',
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface2, #f3f4f6)',
              color: 'var(--text2)',
              marginLeft: 4,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {descCount!.confirmed > 0 ? (
              <span style={{ color: '#166534' }}>✓{descCount!.confirmed}</span>
            ) : null}
            {descCount!.pending > 0 ? (
              <span style={{ color: '#92400e' }}>○{descCount!.pending}</span>
            ) : null}
          </span>
        ) : null}
        {canToggleStatus ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFolderStatusClick?.(path, folderStatusName ?? '미정', folderStatus?.id)
            }}
            title={
              folderStatusName === '확정'
                ? `🔒 확정${folderStatus?.fixedAt ? ` · ${folderStatus.fixedAt}` : ''} (클릭하여 잠금해제 요청)`
                : folderStatusName === '논의중'
                  ? '🟡 논의중 (클릭하여 상태 변경)'
                  : '○ 미정 (클릭하여 상태 설정)'
            }
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              fontSize: '0.7em',
              fontWeight: 700,
              padding: '1px 8px',
              borderRadius: 999,
              border: `1px solid ${folderStatusStyle?.border ?? '#d1d5db'}`,
              background: folderStatusStyle?.bg ?? 'transparent',
              color: folderStatusStyle?.text ?? 'var(--muted)',
              cursor: 'pointer',
              boxShadow: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <span>{folderStatusStyle?.icon ?? '○'}</span>
            <span>{folderStatusName ?? '미정'}</span>
          </button>
        ) : canEditRef ? (
          (() => {
            const primaryRefRole = hasManualRefs ? (manualRefs![0].role as string) : null
            const refColor = primaryRefRole ? REF_ROLE_STYLES[primaryRefRole] : null
            const allConfirmed = hasManualRefs && confirmedRefs === manualRefs!.length
            return (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onManualRefClick?.(path) }}
                title={
                  hasManualRefs
                    ? `📌 이 업무가 참조 · ${confirmedRefs}/${manualRefs!.length} 확정 (클릭하여 편집)`
                    : '+ 이 업무의 참조 폴더로 추가'
                }
                style={{
                  marginLeft: 'auto',
                  flexShrink: 0,
                  fontSize: '0.7em',
                  fontWeight: 700,
                  padding: '1px 8px',
                  borderRadius: 999,
                  border: `1px solid ${refColor?.border ?? 'var(--border)'}`,
                  background: hasManualRefs ? refColor?.bg ?? 'var(--surface2)' : 'transparent',
                  color: hasManualRefs ? refColor?.text ?? 'var(--text1)' : 'var(--muted)',
                  cursor: 'pointer',
                  boxShadow: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  opacity: hasManualRefs ? 1 : 0.6,
                }}
              >
                {hasManualRefs ? (
                  <>
                    <span>{allConfirmed ? '🔒' : '📌'}</span>
                    <span>
                      {manualRefs!.map((r) => r.role).filter((v, i, arr) => arr.indexOf(v) === i).join('·')}
                      {' '}{confirmedRefs}/{manualRefs!.length}
                    </span>
                  </>
                ) : (
                  <>
                    <span>+</span>
                    <span>참조</span>
                  </>
                )}
              </button>
            )
          })()
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
              highlightedPaths={highlightedPaths}
              dimHighlightedPaths={dimHighlightedPaths}
              folderStatusMap={folderStatusMap}
              onFolderStatusClick={onFolderStatusClick}
              manualRefsByPath={manualRefsByPath}
              onManualRefClick={onManualRefClick}
              descendantCountByPath={descendantCountByPath}
            />
          ))
        : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Tree viewer
// ---------------------------------------------------------------------------

function ancestorsOf(path: string): string[] {
  const segments = path.split('/')
  const out: string[] = []
  for (let i = 1; i <= segments.length; i++) {
    out.push(segments.slice(0, i).join('/'))
  }
  return out
}

function TreeViewer({
  data,
  highlightedPaths,
  dimHighlightedPaths,
  folderStatusMap,
  onFolderStatusClick,
  manualRefsByPath,
  onManualRefClick,
  descendantCountByPath,
}: {
  data: TreeNode[]
  highlightedPaths?: Map<string, HighlightRole> | null
  dimHighlightedPaths?: Map<string, HighlightRole> | null
  folderStatusMap?: Map<string, FolderStatusItem> | null
  onFolderStatusClick?: (path: string, currentStatus: string, id?: string) => void
  manualRefsByPath?: Map<string, WorkManualRef[]> | null
  onManualRefClick?: (path: string) => void
  descendantCountByPath?: Map<string, { confirmed: number; pending: number }> | null
}): React.ReactElement {
  const allPaths = useMemo(() => collectPaths(data, ''), [data])
  const defaultOpen = useMemo(() => {
    const set = new Set(data.map((n) => n.name))
    if (highlightedPaths) {
      for (const path of highlightedPaths.keys()) {
        for (const a of ancestorsOf(path)) set.add(a)
      }
    }
    return set
  }, [data, highlightedPaths])
  const [open, setOpen] = useState<Set<string>>(() => defaultOpen)

  useEffect(() => {
    const keys: string[] = []
    if (highlightedPaths) keys.push(...highlightedPaths.keys())
    if (dimHighlightedPaths) keys.push(...dimHighlightedPaths.keys())
    if (keys.length === 0) return
    setOpen((prev) => {
      const next = new Set(prev)
      for (const path of keys) {
        for (const a of ancestorsOf(path)) next.add(a)
      }
      return next
    })
  }, [highlightedPaths, dimHighlightedPaths])

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
            highlightedPaths={highlightedPaths}
            dimHighlightedPaths={dimHighlightedPaths}
            folderStatusMap={folderStatusMap}
            onFolderStatusClick={onFolderStatusClick}
            manualRefsByPath={manualRefsByPath}
            onManualRefClick={onManualRefClick}
            descendantCountByPath={descendantCountByPath}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 1: 폴더 구조
// ---------------------------------------------------------------------------

function StructureSection({
  exampleTreeData,
  actualTreeData,
  actualCount,
  folderStatusMap,
  onFolderStatusClick,
}: {
  exampleTreeData: TreeNode[]
  actualTreeData: TreeNode[]
  actualCount: number
  folderStatusMap?: Map<string, FolderStatusItem> | null
  onFolderStatusClick?: (path: string, currentStatus: string, id?: string) => void
}) {
  const [fileTrack, setFileTrack] = useState<'example' | 'actual'>('example')
  const activeTree = fileTrack === 'example' ? exampleTreeData : actualTreeData

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
            { label: '99_ARCHIVE', desc: '과거 파일', color: C.archive },
            { label: 'Google Drive', desc: '완성 배포본 (Library)', color: C.gdrive },
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
          <strong>PROJECT</strong>는 프로젝트 코드(<code className="fileGuideCode">IZYYNNNN_프로젝트명</code>)로 분류합니다.
          하위 폴더는 <strong>00~06 (7개)</strong>이며, 해당 없는 폴더는 만들지 않습니다.
          버전: PROJECT 소스파일은 <code className="fileGuideCode">v01, v02...</code>, Google Drive 배포본은 <code className="fileGuideCode">Rev01, Rev02...</code>
        </p>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Interactive Tree</span>
            <h3>폴더 트리 (클릭하여 열기/닫기)</h3>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { id: 'example' as const, label: '예시파일', desc: '가이드 샘플 파일명' },
            { id: 'actual' as const, label: '실제파일', desc: `txt 복구 파일 ${actualCount.toLocaleString()}개` },
          ].map((item) => {
            const active = fileTrack === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={active ? '' : 'secondary'}
                onClick={() => setFileTrack(item.id)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: '0.82em',
                  display: 'inline-flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <strong>{item.label}</strong>
                <span style={{ opacity: 0.8 }}>{item.desc}</span>
              </button>
            )
          })}
        </div>
        <p style={{ fontSize: '0.82em', color: 'var(--text2)', marginTop: 0 }}>
          {fileTrack === 'example'
            ? '예시파일 보기에서는 가이드에 손으로 넣은 샘플 파일명이 폴더 바로 아래에 표시됩니다.'
            : '실제파일 보기에서는 legacy NAS txt에서 복구한 실제 파일이 폴더 바로 아래에 표시됩니다. 파일명이 바뀐 항목은 원본파일명도 함께 표시됩니다.'}
        </p>
        <TreeViewer
          key={fileTrack}
          data={activeTree}
          folderStatusMap={folderStatusMap ?? undefined}
          onFolderStatusClick={onFolderStatusClick}
        />
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
            IZYYNNNN_프로젝트명
          </div>
          <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div className="workflowCheckpoint">
              <h4>IZ</h4>
              <p>IZEN</p>
            </div>
            <div className="workflowCheckpoint">
              <h4>YY</h4>
              <p>착수 연도 (예: 25)</p>
            </div>
            <div className="workflowCheckpoint">
              <h4>NNNN</h4>
              <p>순번만 사용 (정기/비정기 구분 없음)</p>
            </div>
          </div>
        </div>
        <p>
          정기/비정기 구분 없이 순번만 사용합니다. "정기" 속성은 Notion DB에서 관리합니다.
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
              yes: 'Google Drive',
              color: C.gdrive,
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
          완성본은 <strong>Google Drive/</strong>에 Rev 번호로 올립니다. 납품 추적은 Notion DB + Google Drive에서 관리합니다.
        </p>
      </article>

      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Lookup Table</span>
            <h3>상황별 저장 위치</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.85em', color: 'var(--text2)', margin: '0 0 10px' }}>
          최종 산출물은 <strong>PROJECT 보관본</strong>과 <strong>Google Drive 배포본</strong>이 함께 존재할 수 있습니다.
        </p>
        <div className="guideTableWrap" style={{ maxHeight: 520, overflow: 'auto' }}>
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>상황</th>
                <th>작업 위치</th>
                <th>최종 배포 위치</th>
              </tr>
            </thead>
            <tbody>
              {DECISION_ROWS.map((row) => (
                <tr key={row.situation}>
                  <td>{row.situation}</td>
                  <td>
                    {row.workLoc && row.workColor && row.workPath ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span
                          style={{
                            width: 'fit-content',
                            background: C[row.workColor].bg,
                            border: `1px solid ${C[row.workColor].border}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: '0.82em',
                            fontWeight: 600,
                            color: C[row.workColor].text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.workLoc}
                        </span>
                        <code className="fileGuideCode" style={{ fontSize: 11 }}>
                          {row.workPath}
                        </code>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>-</span>
                    )}
                  </td>
                  <td>
                    {row.publishLoc && row.publishColor && row.publishPath ? (
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span
                          style={{
                            width: 'fit-content',
                            background: C[row.publishColor].bg,
                            border: `1px solid ${C[row.publishColor].border}`,
                            borderRadius: 999,
                            padding: '2px 8px',
                            fontSize: '0.82em',
                            fontWeight: 600,
                            color: C[row.publishColor].text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.publishLoc}
                        </span>
                        <code className="fileGuideCode" style={{ fontSize: 11 }}>
                          {row.publishPath}
                        </code>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>-</span>
                    )}
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
          <li>프로젝트 코드(IZYYNNNN)는 <strong>파일명에 포함하지 않음</strong> — 폴더가 이미 프로젝트별로 분리</li>
          <li><strong>v = PROJECT 소스파일</strong> (v01, v02...), <strong>Rev = Google Drive 배포본</strong> (Rev01, Rev02...) — 보통 다른 파일 형식 (.ai→.pdf)</li>
          <li><code className="fileGuideCode">_작업중</code> 표시는 <strong>PROJECT 안에서만</strong> 허용, Google Drive에는 절대 불가</li>
          <li>타팀에서 받은 파일은 <strong>원본 파일명 그대로</strong> 업로드. 회신 시에만 <code className="fileGuideCode">_담당자v01</code> 붙임</li>
          <li>Google Drive 파일은 항상 완성본 (Rev 체계)</li>
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
            { n: '1', text: '완성본을 Google Drive/ 해당 카테고리에 Rev 번호로 올림' },
            { n: '2', text: 'Google Drive에 구버전 있으면 → _archive/로 이동' },
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
          [IZEN IMPLANT]과 design은 시기를 달리해서 만들어졌지만, 둘 다 최종 파일 보관 목적이었음 (팀장 확인 완료). 새 구조에서는 Google Drive가 Library 역할.
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
            <h3>구글 드라이브 (옛 Library 구조)</h3>
          </div>
        </div>
        <p>
          구글 드라이브는 완성 배포본 보관소이며, 예전 <strong>03_LIBRARY</strong> 폴더 체계를 그대로 복구해 사용합니다.
          최종본은 카테고리별 상위 폴더에 <strong>Rev</strong>로 올리고, 구버전은 <code className="fileGuideCode">_archive</code>로 내립니다.
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
            { n: '1', text: '회사소개, 카달로그, 리플렛, 포스터처럼 배포 목적별 대분류를 유지', sub: '옛 03_LIBRARY 번호 체계 그대로 사용' },
            { n: '2', text: '상위 폴더에는 항상 최신 Rev만 두고, 소스파일(v)은 넣지 않음', sub: '예: 04_리플렛/ 아래에는 PDF, PNG 등 최종본만' },
            { n: '3', text: '같은 항목의 이전 배포본은 각 카테고리 내부 _archive로 이동', sub: '최신본 링크와 과거본 보관을 분리' },
            { n: '4', text: '외부 공유는 필요한 카테고리 폴더 또는 파일 링크만 전달', sub: '예: Google Drive/04_리플렛/' },
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
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.project.border}` }}>
            <h4>NAS PROJECT</h4>
            <p>작업중 소스, 수정본, 수신본은 NAS PROJECT에서 관리합니다.</p>
          </div>
          <div className="workflowCheckpoint" style={{ textAlign: 'center', border: 'none', background: 'none', padding: '12px 0' }}>
            <p style={{ fontSize: '1.5em' }}>→</p>
            <p style={{ fontSize: '0.78em', color: 'var(--muted)' }}>최종 파일 복사</p>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.gdrive.border}` }}>
            <h4>구글 드라이브</h4>
            <p>옛 Library 카테고리 구조로 최종 배포본과 Rev 이력을 관리합니다.</p>
          </div>
        </div>
      </article>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 6: 업무별 매뉴얼
// ---------------------------------------------------------------------------

type TaskSchemaResponse = {
  ok: boolean
  schema?: {
    fields?: Record<string, { options?: string[] } | undefined>
  }
}

type WorkManualStatus = '확정' | '논의중' | '미정'
const WORK_MANUAL_STATUS_OPTIONS: WorkManualStatus[] = ['미정', '논의중', '확정']

type WorkManualStatusItem = {
  id: string
  workType: string
  status: WorkManualStatus | string
  category: string
  fixedAt: string
  note: string
  updatedAt: string
}

type WorkManualStatusResponse = { ok: boolean; items: WorkManualStatusItem[] }

export type FolderStatus = '확정' | '논의중' | '미정'
export const FOLDER_STATUS_OPTIONS: FolderStatus[] = ['미정', '논의중', '확정']

export type FolderStatusItem = {
  id: string
  path: string
  status: FolderStatus | string
  locked: boolean
  fixedAt: string
  note: string
  updatedAt: string
}

export type FolderStatusResponse = { ok: boolean; items: FolderStatusItem[] }

export type ChangeHistoryItem = {
  id: string
  summary: string
  kind: string
  target: string
  action: string
  before: string
  after: string
  reason: string
  createdAt: string
}

export type ChangeHistoryResponse = { ok: boolean; items: ChangeHistoryItem[] }

export type WorkManualRefRole = 'ASSET' | 'WORK' | 'PUB'

export type WorkManualRef = {
  id: string
  workType: string
  path: string
  label: string
  role: WorkManualRefRole | string
  status: FolderStatus | string
  required: boolean
  fixedAt: string
  note: string
  updatedAt: string
}

export type WorkManualRefsResponse = { ok: boolean; items: WorkManualRef[] }

const REF_ROLE_STYLES: Record<string, { bg: string; border: string; text: string; soft: string }> = {
  ASSET: C.asset,
  WORK: C.project,
  PUB: C.gdrive,
}

const REF_ROLE_META: Record<WorkManualRefRole, { label: string; desc: string }> = {
  ASSET: { label: 'ASSET', desc: '꺼낼 소스' },
  WORK: { label: 'WORK', desc: '작업 위치' },
  PUB: { label: 'PUB', desc: '최종 배포' },
}

// Unified status styles for both folders and work manuals (3 states).
const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  '미정': { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af', icon: '○' },
  '논의중': { bg: '#fef3c7', text: '#92400e', border: '#f59e0b', icon: '🟡' },
  '확정': { bg: '#dcfce7', text: '#166534', border: '#22c55e', icon: '🔒' },
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  '미정': '아직 운영 기준이 정해지지 않은 상태',
  '논의중': '가안 단계이며 폴더 트리에서는 연하게 보이는 상태',
  '확정': '현재 팀 기준으로 확정되어 진하게 표시되는 상태',
}

function recordHistory(entry: {
  kind: '폴더' | '업무매뉴얼'
  target: string
  action: string
  before?: string
  after?: string
  reason: string
}) {
  return api('/change-history', {
    method: 'POST',
    body: JSON.stringify({
      summary: `[${entry.kind}] ${entry.target} · ${entry.action}`,
      kind: entry.kind,
      target: entry.target,
      action: entry.action,
      before: entry.before ?? '',
      after: entry.after ?? '',
      reason: entry.reason,
    }),
  }).catch(() => null)
}

function PastHistoryList({ items, title = '이전 변경 이력' }: { items: ChangeHistoryItem[]; title?: string }) {
  if (items.length === 0) {
    return (
      <details>
        <summary style={{ fontSize: '0.78em', color: 'var(--muted)', cursor: 'pointer' }}>
          📜 {title} (없음)
        </summary>
      </details>
    )
  }
  return (
    <details open={items.length <= 3}>
      <summary style={{ fontSize: '0.82em', fontWeight: 600, cursor: 'pointer' }}>
        📜 {title} ({items.length}건)
      </summary>
      <div style={{ display: 'grid', gap: 6, marginTop: 6, maxHeight: 200, overflowY: 'auto', padding: '4px 2px' }}>
        {items.map((h) => (
          <div
            key={h.id}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              background: 'var(--surface2, #f9fafb)',
              borderLeft: '3px solid var(--border)',
              fontSize: '0.8em',
            }}
          >
            <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginBottom: 2 }}>
              {h.createdAt ? new Date(h.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
              {' · '}
              {h.action}
            </div>
            {h.reason ? <div style={{ color: 'var(--text2)' }}>💬 {h.reason}</div> : <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>사유 없음</div>}
          </div>
        ))}
      </div>
    </details>
  )
}

function ManualRefEditModal({
  open,
  workType,
  folderPath,
  refsHere,
  onClose,
  onChanged,
}: {
  open: boolean
  workType: string
  folderPath: string
  refsHere: WorkManualRef[]
  onClose: () => void
  onChanged: () => void
}) {
  const [pendingRole, setPendingRole] = useState<WorkManualRefRole | null>(null)
  const [pendingAction, setPendingAction] = useState<'add' | 'status' | 'delete' | null>(null)
  const [pendingStatus, setPendingStatus] = useState<FolderStatus>('논의중')
  const [pendingRefId, setPendingRefId] = useState<string | null>(null)
  const [pendingCurrentStatus, setPendingCurrentStatus] = useState<string>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setPendingRole(null)
      setPendingAction(null)
      setPendingStatus('논의중')
      setPendingRefId(null)
      setPendingCurrentStatus('')
      setReason('')
      setBusy(false)
    }
  }, [open])
  if (!open) return null

  const needsReason = pendingAction !== null
  const canSubmit = needsReason && reason.trim().length > 0 && !busy

  const startAdd = (role: WorkManualRefRole) => {
    setPendingAction('add')
    setPendingRole(role)
    setPendingStatus('논의중')
    setPendingRefId(null)
    setPendingCurrentStatus('(없음)')
    setReason('')
  }
  const startStatus = (ref: WorkManualRef, nextStatus: FolderStatus) => {
    setPendingAction('status')
    setPendingRole(ref.role as WorkManualRefRole)
    setPendingStatus(nextStatus)
    setPendingRefId(ref.id)
    setPendingCurrentStatus(String(ref.status))
    setReason('')
  }
  const startDelete = (ref: WorkManualRef) => {
    setPendingAction('delete')
    setPendingRole(ref.role as WorkManualRefRole)
    setPendingStatus('미정')
    setPendingRefId(ref.id)
    setPendingCurrentStatus(String(ref.status))
    setReason('')
  }
  const cancelAction = () => {
    setPendingAction(null)
    setPendingRole(null)
    setPendingRefId(null)
    setPendingCurrentStatus('')
    setReason('')
  }

  const submit = async () => {
    if (!canSubmit || !pendingAction || !pendingRole) return
    setBusy(true)
    try {
      if (pendingAction === 'add') {
        const templatePath = collapseProjectToTemplate(folderPath)
        await api('/work-manual-refs', {
          method: 'POST',
          body: JSON.stringify({
            workType, path: templatePath, role: pendingRole, status: pendingStatus,
            ...(pendingStatus === '확정' ? { fixedAt: new Date().toISOString().slice(0, 10) } : {}),
            note: reason,
          }),
        })
        await recordHistory({
          kind: '업무매뉴얼', target: `${workType} · ${pendingRole} · ${templatePath}`,
          action: `참조 추가 (${pendingStatus})`, before: '(없음)', after: pendingStatus, reason,
        })
      } else if (pendingAction === 'status' && pendingRefId) {
        await api(`/work-manual-refs/${encodeURIComponent(pendingRefId)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: pendingStatus,
            ...(pendingStatus === '확정' ? { fixedAt: new Date().toISOString().slice(0, 10) } : {}),
          }),
        })
        await recordHistory({
          kind: '업무매뉴얼', target: `${workType} · ${pendingRole} · ${folderPath}`,
          action: `${pendingCurrentStatus}→${pendingStatus}`,
          before: pendingCurrentStatus, after: pendingStatus, reason,
        })
      } else if (pendingAction === 'delete' && pendingRefId) {
        await api(`/work-manual-refs/${encodeURIComponent(pendingRefId)}`, { method: 'DELETE' })
        await recordHistory({
          kind: '업무매뉴얼', target: `${workType} · ${pendingRole} · ${folderPath}`,
          action: '참조 제거', before: pendingCurrentStatus, after: '(제거됨)', reason,
        })
      }
      cancelAction()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface1)', borderRadius: 12, padding: 20, maxWidth: 560, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', border: '1px solid var(--border)', display: 'grid', gap: 12 }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1em' }}>이 업무가 이 폴더를 참조하나요?</h3>
          <div style={{ fontSize: '0.78em', color: 'var(--muted)', marginTop: 4 }}>
            업무: <strong>{workType}</strong>
          </div>
          <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
            폴더: <code className="fileGuideCode" style={{ fontSize: 11 }}>{folderPath}</code>
          </div>
        </div>

        {/* 역할별 현재 참조 */}
        <div style={{ display: 'grid', gap: 8 }}>
          {(['ASSET', 'WORK', 'PUB'] as WorkManualRefRole[]).map((role) => {
            const ref = refsHere.find((r) => r.role === role)
            const style = REF_ROLE_STYLES[role]
            const meta = REF_ROLE_META[role]
            return (
              <div
                key={role}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${ref ? style.border : 'var(--border)'}`,
                  background: ref ? style.bg : 'var(--surface2)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, color: ref ? style.text : 'var(--muted)', fontSize: '0.88em' }}>
                    {meta.label} ({meta.desc})
                  </div>
                  {ref ? (
                    <span
                      style={{
                        fontSize: '0.75em', fontWeight: 700, padding: '1px 8px', borderRadius: 999,
                        background: STATUS_STYLES[String(ref.status)]?.bg ?? '#f3f4f6',
                        color: STATUS_STYLES[String(ref.status)]?.text ?? '#4b5563',
                        border: `1px solid ${STATUS_STYLES[String(ref.status)]?.border ?? '#d1d5db'}`,
                      }}
                    >
                      {STATUS_STYLES[String(ref.status)]?.icon ?? '○'} {String(ref.status)}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.75em', color: 'var(--muted)' }}>참조 없음</span>
                  )}
                </div>
                {ref ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => startStatus(ref, ref.status === '확정' ? '논의중' : '확정')}
                      disabled={busy}
                      style={{
                        fontSize: '0.75em', padding: '3px 10px', borderRadius: 6,
                        background: 'var(--surface2)', color: 'var(--text1)',
                        border: '1px solid var(--border)', cursor: 'pointer', boxShadow: 'none',
                      }}
                    >
                      상태 변경…
                    </button>
                    <button
                      type="button"
                      onClick={() => startDelete(ref)}
                      disabled={busy}
                      style={{
                        fontSize: '0.75em', padding: '3px 10px', borderRadius: 6,
                        background: 'transparent', color: '#b91c1c',
                        border: '1px solid #fca5a5', cursor: 'pointer', boxShadow: 'none',
                      }}
                    >
                      🗑 참조 제거
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => startAdd(role)}
                      disabled={busy}
                      style={{
                        fontSize: '0.78em', padding: '4px 10px', borderRadius: 6,
                        background: style.bg, color: style.text,
                        border: `1px solid ${style.border}`, cursor: 'pointer', boxShadow: 'none',
                      }}
                    >
                      + {role} 참조로 추가
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 진행 중 액션 + 사유 입력 */}
        {pendingAction ? (
          <div style={{ padding: 10, background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: 8, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: '0.82em', fontWeight: 700, color: '#92400e' }}>
              {pendingAction === 'add' && `➕ ${pendingRole} 참조 추가`}
              {pendingAction === 'status' && `🔄 ${pendingRole} · ${pendingCurrentStatus} → ?`}
              {pendingAction === 'delete' && `🗑 ${pendingRole} 참조 제거`}
            </div>
            {pendingAction !== 'delete' ? (
              <div style={{ display: 'flex', gap: 6 }}>
                {(['미정', '논의중', '확정'] as FolderStatus[]).map((s) => {
                  const active = pendingStatus === s
                  const st = STATUS_STYLES[s]
                  const isSameAsCurrent = pendingAction === 'status' && s === pendingCurrentStatus
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={isSameAsCurrent}
                      onClick={() => setPendingStatus(s)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.82em',
                        fontWeight: 700,
                        background: active ? st?.bg : 'var(--surface1)',
                        color: active ? st?.text : isSameAsCurrent ? 'var(--muted)' : 'var(--text1)',
                        border: `2px solid ${active ? st?.border : 'transparent'}`,
                        borderRadius: 6,
                        cursor: isSameAsCurrent ? 'not-allowed' : 'pointer',
                        opacity: isSameAsCurrent ? 0.4 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}
                    >
                      <span>{st?.icon}</span>
                      <span>{s}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유를 한 줄로 기록하세요. (필수)"
              rows={2}
              style={{ padding: '8px 10px', fontSize: '0.85em', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface1)', color: 'var(--text1)', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={cancelAction} disabled={busy} style={{ padding: '4px 12px', fontSize: '0.82em' }}>
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                style={{
                  padding: '4px 14px', fontSize: '0.82em', fontWeight: 700,
                  background: canSubmit ? '#22c55e' : 'var(--surface2)', color: canSubmit ? '#fff' : 'var(--muted)',
                  border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                저장 + 이력 기록
              </button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.75em', color: 'var(--muted)' }}>
            위 역할 중 원하는 액션을 누르면 사유 입력 후 저장됩니다.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={onClose} style={{ padding: '6px 14px', fontSize: '0.85em' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusChangeReasonModal({
  open,
  title,
  target,
  currentStatus,
  statusOptions,
  statusStyles,
  lockedStatus = '확정',
  history = [],
  historyTitle,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  target: string
  currentStatus: string
  statusOptions: readonly string[]
  statusStyles: Record<string, { bg: string; text: string; border: string; icon: string }>
  lockedStatus?: string
  history?: ChangeHistoryItem[]
  historyTitle?: string
  onConfirm: (nextStatus: string, reason: string) => void
  onCancel: () => void
}) {
  const [nextStatus, setNextStatus] = useState<string>(statusOptions[0] ?? '')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) {
      setReason('')
      // 현재와 다른 첫 옵션을 기본값으로
      const defaultNext = statusOptions.find((s) => s !== currentStatus) ?? statusOptions[0] ?? ''
      setNextStatus(defaultNext)
    }
  }, [open, currentStatus, statusOptions])
  if (!open) return null
  const canSubmit = reason.trim().length > 0 && nextStatus !== currentStatus
  const sameNote = nextStatus === currentStatus ? '현재 상태와 동일합니다' : ''
  const isUnlock = currentStatus === lockedStatus && nextStatus !== lockedStatus
  const nextStyle = statusStyles[nextStatus]
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface1)', borderRadius: 12, padding: 20, maxWidth: 500, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', border: '1px solid var(--border)', display: 'grid', gap: 12 }}
      >
        <h3 style={{ margin: 0, fontSize: '1em' }}>{title}</h3>
        <div style={{ fontSize: '0.8em', color: 'var(--muted)' }}>
          <code className="fileGuideCode" style={{ fontSize: 11 }}>{target}</code>
        </div>
        <div style={{ fontSize: '0.85em' }}>
          현재: <strong>{currentStatus}</strong>
          {currentStatus === lockedStatus ? <span style={{ marginLeft: 6, color: '#166534' }}>🔒 잠김 (해제하려면 사유 필수)</span> : null}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {statusOptions.map((opt) => {
            const style = statusStyles[opt]
            const active = nextStatus === opt
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setNextStatus(opt)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: '0.85em',
                  fontWeight: 700,
                  background: active ? style?.bg ?? 'var(--surface2)' : 'var(--surface2)',
                  color: active ? style?.text ?? 'var(--text1)' : 'var(--muted)',
                  border: `2px solid ${active ? style?.border ?? 'var(--border)' : 'transparent'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <span>{style?.icon ?? '○'}</span>
                <span>{opt}</span>
              </button>
            )
          })}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            isUnlock
              ? '잠금 해제 사유를 반드시 기록하세요. (필수)'
              : nextStatus === lockedStatus
                ? '확정하는 근거. (필수)'
                : '변경 사유를 한 줄로. (필수)'
          }
          rows={3}
          style={{ padding: '8px 10px', fontSize: '0.88em', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-soft, var(--surface2))', color: 'var(--text1)', resize: 'vertical', fontFamily: 'inherit' }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) { e.preventDefault(); onConfirm(nextStatus, reason.trim()) } }}
        />
        {sameNote ? <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>{sameNote}</div> : null}
        <PastHistoryList items={history} title={historyTitle ?? '과거 변경 이력'} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="secondary" onClick={onCancel} style={{ padding: '6px 14px', fontSize: '0.85em' }}>취소</button>
          <button
            type="button"
            onClick={() => canSubmit && onConfirm(nextStatus, reason.trim())}
            disabled={!canSubmit}
            style={{
              padding: '6px 14px', fontSize: '0.85em', fontWeight: 600,
              background: canSubmit ? nextStyle?.border ?? '#22c55e' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {isUnlock ? '🔓 잠금해제 + 이력 기록' : `${nextStatus} + 이력 기록`}
          </button>
        </div>
      </div>
    </div>
  )
}


const SAMPLE_PROJECT_FOLDER = 'IZ250001_CIS-Conference-2026'

// refs DB는 경로를 "01_PROJECT/IZYYNNNN_.../..." 형태로 저장해
// 어느 프로젝트에서든 공통 적용된다. 트리는 실제 샘플 프로젝트 폴더로
// 렌더되므로 표시할 때 치환하고, 저장할 때는 다시 템플릿화한다.
function expandProjectTemplate(templatePath: string): string {
  return templatePath.replace(/IZYYNNNN_[^/]*/g, SAMPLE_PROJECT_FOLDER)
}
function collapseProjectToTemplate(concretePath: string): string {
  return concretePath.replace(/IZ\d+_[^/]+/g, 'IZYYNNNN_...')
}

function normalizeManualPath(raw: string): string[] {
  // 여러 경로가 섞여 있는 경우 분리
  const parts = raw
    .split(/\n|(?:\s+or\s+)|(?:\s+또는\s+)/gi)
    .map((s) => s.trim())
    .filter(Boolean)

  const out: string[] = []
  for (let part of parts) {
    part = part.replace(/^GDrive\s+/i, 'Google Drive/')
    // 괄호·중괄호·파이프 이후는 가변 토큰으로 보고 잘라냄 → 상위 폴더까지만 하이라이트
    const cutIdx = part.search(/[{|(]/)
    if (cutIdx >= 0) part = part.substring(0, cutIdx)
    // 후행 슬래시 제거
    part = part.replace(/\/+$/, '').trim()
    if (!part) continue
    // IZYYNNNN_... placeholder를 샘플 프로젝트로 치환
    part = part.replace(/IZYYNNNN_[^/]*/g, SAMPLE_PROJECT_FOLDER)
    if (
      part.startsWith('01_PROJECT/') ||
      part.startsWith('02_ASSET/') ||
      part.startsWith('Google Drive/') ||
      part.startsWith('99_ARCHIVE/')
    ) {
      out.push(part)
    }
  }
  return out
}

export function extractHighlightPaths(manual: WorkTypeManual): Map<string, HighlightRole> {
  const map = new Map<string, HighlightRole>()
  for (const a of manual.assets) {
    for (const p of normalizeManualPath(a.path)) map.set(p, 'asset')
  }
  for (const p of normalizeManualPath(manual.workBasePath)) map.set(p, 'project')
  if (manual.publish) {
    for (const p of normalizeManualPath(manual.publish.path)) map.set(p, 'gdrive')
  }
  return map
}

function WorkManualsSection({
  folderTree,
  historyItems,
  onReloadHistory,
}: {
  folderTree: TreeNode[]
  historyItems: ChangeHistoryItem[]
  onReloadHistory: () => void
}) {
  const [notionOptions, setNotionOptions] = useState<string[]>([])
  const [statusItems, setStatusItems] = useState<WorkManualStatusItem[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [refs, setRefs] = useState<WorkManualRef[]>([])
  const [refsVersion, setRefsVersion] = useState(0)
  const [refEditPath, setRefEditPath] = useState<string | null>(null)

  useEffect(() => {
    if (!selected) { setRefs([]); return }
    api<WorkManualRefsResponse>(`/work-manual-refs?workType=${encodeURIComponent(selected)}`)
      .then((res) => setRefs(res?.items ?? []))
      .catch(() => setRefs([]))
  }, [selected, refsVersion])

  const refsByPath = useMemo(() => {
    const m = new Map<string, WorkManualRef[]>()
    for (const r of refs) {
      if (!r.path) continue
      const key = expandProjectTemplate(r.path)
      const arr = m.get(key) ?? []
      arr.push(r)
      m.set(key, arr)
    }
    return m
  }, [refs])

  const refsReloadAfter = useCallback(() => {
    setRefsVersion((v) => v + 1)
    onReloadHistory()
  }, [onReloadHistory])

  const refreshAll = useCallback(() => {
    setLoading(true)
    setFetchError('')
    Promise.all([
      api<TaskSchemaResponse>('/tasks?pageSize=1').then((res) => res?.schema?.fields?.workType?.options ?? []),
      api<WorkManualStatusResponse>('/work-manual-status').then((res) => res?.items ?? []).catch(() => []),
    ])
      .then(([opts, items]) => {
        setNotionOptions(opts)
        setStatusItems(items)
        if (opts.length > 0 && !selected) {
          const firstWithManual = opts.find((o) => WORK_TYPE_MANUAL_MAP[o])
          setSelected(firstWithManual ?? opts[0])
        }
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'fetch failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const statusByWorkType = useMemo(() => {
    const map = new Map<string, WorkManualStatusItem>()
    for (const item of statusItems) {
      if (item.workType) map.set(item.workType, item)
    }
    return map
  }, [statusItems])

  const updateStatus = useCallback(
    async (workType: string, patch: Partial<Pick<WorkManualStatusItem, 'status' | 'fixedAt' | 'note' | 'category'>>) => {
      const existing = statusByWorkType.get(workType)
      // optimistic update
      setStatusItems((prev) => {
        if (existing) {
          return prev.map((i) => (i.workType === workType ? { ...i, ...patch } : i))
        }
        return [
          ...prev,
          {
            id: `pending-${workType}`,
            workType,
            status: (patch.status as WorkManualStatus | undefined) ?? '미정',
            category: patch.category ?? '',
            fixedAt: patch.fixedAt ?? '',
            note: patch.note ?? '',
            updatedAt: new Date().toISOString(),
          },
        ]
      })
      try {
        if (existing && !existing.id.startsWith('pending-')) {
          await api(`/work-manual-status/${encodeURIComponent(existing.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          })
        } else {
          const manual = WORK_TYPE_MANUAL_MAP[workType]
          const category = manual ? `${manual.category} ${WORK_MANUAL_CATEGORIES[manual.category].label}` : patch.category ?? ''
          const res = await api<{ ok: boolean; id?: string }>('/work-manual-status', {
            method: 'POST',
            body: JSON.stringify({ workType, category, ...patch }),
          })
          if (res?.id) {
            setStatusItems((prev) => prev.map((i) => (i.workType === workType ? { ...i, id: res.id! } : i)))
          }
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'update failed')
        refreshAll()
      }
    },
    [statusByWorkType, refreshAll],
  )

  const changeStatusWithReason = useCallback(
    async (workType: string, nextStatus: WorkManualStatus, reason: string) => {
      const existing = statusByWorkType.get(workType)
      const before = (existing?.status as string) || '미정'
      if (before === nextStatus) return
      const patch: Partial<Pick<WorkManualStatusItem, 'status' | 'fixedAt'>> = { status: nextStatus }
      if (nextStatus === '확정') {
        patch.fixedAt = new Date().toISOString().slice(0, 10)
      }
      await updateStatus(workType, patch)
      await recordHistory({
        kind: '업무매뉴얼',
        target: workType,
        action: `${before}→${nextStatus}`,
        before,
        after: nextStatus,
        reason,
      })
    },
    [statusByWorkType, updateStatus],
  )

  const merged = useMemo(() => {
    const fromNotion = new Set(notionOptions)
    const fromManuals = new Set(WORK_TYPE_MANUALS.map((m) => m.workType))
    const union = Array.from(new Set([...fromNotion, ...fromManuals]))
    return union.map((workType) => {
      const manual = WORK_TYPE_MANUAL_MAP[workType]
      const status = statusByWorkType.get(workType)
      return {
        workType,
        manual,
        inNotion: fromNotion.has(workType),
        inManuals: fromManuals.has(workType),
        statusItem: status,
      }
    })
  }, [notionOptions, statusByWorkType])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return merged
    return merged.filter((item) => item.workType.toLowerCase().includes(q))
  }, [merged, search])

  const grouped = useMemo(() => {
    const groups: Record<WorkManualCategoryKey | '_', typeof merged> = {
      A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [], I: [], _: [],
    }
    for (const item of filtered) {
      const key = item.manual?.category ?? '_'
      groups[key].push(item)
    }
    return groups
  }, [filtered])

  const selectedItem = selected ? merged.find((m) => m.workType === selected) : null

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Per-Work-Type Manual</span>
            <h3>업무별 A to Z 매뉴얼</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.88em', color: 'var(--text2)', margin: '0 0 8px' }}>
          Notion <strong>업무 DB</strong>의 <code className="fileGuideCode">업무구분</code> select 옵션을 실시간으로 불러와,
          각 업무마다 <strong>꺼낼 에셋 / 작업 위치 / 산출물 / 배포 위치 / 주의사항</strong>을 단계별로 안내합니다.
          Notion에 새 옵션이 추가되면 리스트에 즉시 반영됩니다.
        </p>
        {loading ? (
          <div style={{ fontSize: '0.85em', color: 'var(--muted)' }}>업무구분 옵션을 불러오는 중...</div>
        ) : null}
        {fetchError ? (
          <div style={{ padding: 10, fontSize: '0.82em', color: 'var(--danger)', background: '#fef2f2', borderRadius: 8 }}>
            API 오류: {fetchError}
          </div>
        ) : null}
      </article>

      <ManualScreenLegend />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 300px) 1fr',
          gap: 12,
          alignItems: 'start',
        }}
      >
        {/* 좌측 리스트 */}
        <article className="workflowCard" style={{ padding: 12, position: 'sticky', top: 8, maxHeight: 'calc(100vh - 40px)', overflow: 'auto' }}>
          <input
            type="text"
            placeholder="업무구분 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.85em',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface1)',
              color: 'var(--text1)',
              marginBottom: 10,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'grid', gap: 10 }}>
            {(Object.keys(grouped) as Array<WorkManualCategoryKey | '_'>).map((key) => {
              const items = grouped[key]
              if (items.length === 0) return null
              const cat = key === '_' ? null : WORK_MANUAL_CATEGORIES[key as WorkManualCategoryKey]
              return (
                <div key={key}>
                  <div
                    style={{
                      fontSize: '0.72em',
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      padding: '3px 8px',
                      background: cat?.bg ?? '#f3f4f6',
                      color: cat?.text ?? '#6b7280',
                      borderLeft: `3px solid ${cat?.border ?? '#9ca3af'}`,
                      borderRadius: 4,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                    }}
                  >
                    {key === '_' ? '매뉴얼 미작성' : `[${key}] ${cat?.label}`} · {items.length}
                  </div>
                  <div style={{ display: 'grid', gap: 2 }}>
                    {items.map((item) => {
                      const active = selected === item.workType
                      const hasManual = !!item.manual
                      const isAmbiguous = item.manual?.ambiguous
                      const statusName = item.statusItem?.status ?? '미정'
                      const statusStyle = STATUS_STYLES[statusName] ?? STATUS_STYLES['미정']
                      return (
                        <button
                          key={item.workType}
                          type="button"
                          onClick={() => setSelected(item.workType)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                            padding: '6px 8px',
                            borderRadius: 6,
                            fontSize: '0.82em',
                            textAlign: 'left',
                            background: active ? cat?.bg ?? 'var(--surface2)' : 'transparent',
                            border: active ? `1px solid ${cat?.border ?? 'var(--border)'}` : '1px solid transparent',
                            color: active ? cat?.text ?? 'var(--text1)' : 'var(--text1)',
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                            boxShadow: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', flex: 1, minWidth: 0 }}>
                            <span
                              title={`상태: ${statusName} · ${STATUS_DESCRIPTIONS[statusName] ?? ''}`}
                              style={{
                                flexShrink: 0,
                                width: 16,
                                height: 16,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: 3,
                                background: statusStyle.bg,
                                color: statusStyle.text,
                                border: `1px solid ${statusStyle.border}`,
                              }}
                            >
                              {statusStyle.icon}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.workType}
                            </span>
                          </span>
                          <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            {!item.inNotion ? (
                              <span title="Notion 옵션 아님 (로컬 초안만)" style={{ fontSize: '0.7em', background: '#e5e7eb', color: '#6b7280', padding: '0 4px', borderRadius: 3 }}>
                                local
                              </span>
                            ) : null}
                            {!hasManual ? (
                              <span title="매뉴얼 미작성: Notion에는 있지만 workTypeManuals.ts 초안이 아직 없습니다." style={{ fontSize: '0.7em', background: '#fef3c7', color: '#92400e', padding: '0 4px', borderRadius: 3 }}>
                                미작성
                              </span>
                            ) : null}
                            {isAmbiguous ? (
                              <span title="해석 확인 필요: 업무 범위나 용어 정의를 다시 확인해야 합니다." style={{ fontSize: '0.7em', background: '#fef3c7', color: '#92400e', padding: '0 4px', borderRadius: 3 }}>
                                ?
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </article>

        {/* 우측 카드 */}
        <div style={{ display: 'grid', gap: 12 }}>
          {selectedItem ? (
            <ManualDetail
              item={selectedItem}
              folderTree={folderTree}
              onUpdateStatus={(patch) => updateStatus(selectedItem.workType, patch)}
              onChangeStatusWithReason={changeStatusWithReason}
              historyItems={historyItems}
              refs={refs}
              refsByPath={refsByPath}
              onRefEditOpen={(p) => setRefEditPath(p)}
              refEditPath={refEditPath}
              onRefEditClose={() => setRefEditPath(null)}
              onRefsChanged={refsReloadAfter}
            />
          ) : (
            <article className="workflowCard workflowCardWide">
              <p style={{ color: 'var(--muted)', fontSize: '0.9em', margin: 0 }}>
                좌측에서 업무구분을 선택하세요.
              </p>
            </article>
          )}
          <ChangeHistoryPanel items={historyItems} filterTarget={selected ?? undefined} onReload={onReloadHistory} />
        </div>
      </div>
    </div>
  )
}

function HistoryReasonEditModal({
  item,
  onCancel,
  onSaved,
}: {
  item: ChangeHistoryItem | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [newReason, setNewReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (item) { setNewReason(''); setBusy(false) } }, [item?.id])
  if (!item) return null
  const trimmed = newReason.trim()
  const canSubmit = trimmed.length > 0 && trimmed !== item.reason && !busy
  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await api('/change-history', {
        method: 'POST',
        body: JSON.stringify({
          kind: item.kind || '업무매뉴얼',
          target: item.target,
          action: '사유 수정',
          before: item.reason || '',
          after: trimmed,
          reason: '',
          summary: `[${item.kind || '업무매뉴얼'}] ${item.target} · 사유 수정`,
        }),
      })
      onSaved()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--surface1)', borderRadius: 12, padding: 20, maxWidth: 500, width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', border: '1px solid var(--border)', display: 'grid', gap: 12 }}
      >
        <h3 style={{ margin: 0, fontSize: '1em' }}>이력 사유 수정</h3>
        <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
          [{item.kind}] <code className="fileGuideCode" style={{ fontSize: 11 }}>{item.target}</code> · {item.action}
        </div>
        <div style={{ padding: '8px 10px', background: 'var(--surface2, #f9fafb)', borderRadius: 6, fontSize: '0.85em' }}>
          <div style={{ fontSize: '0.72em', color: 'var(--muted)', marginBottom: 3 }}>기존 사유</div>
          <div style={{ color: 'var(--text2)' }}>{item.reason || <i>(비어있음)</i>}</div>
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <label style={{ fontSize: '0.78em', fontWeight: 600 }}>새 사유 (필수)</label>
          <textarea
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="기존 사유를 어떻게 보완할지 작성하세요."
            rows={3}
            style={{ padding: '8px 10px', fontSize: '0.88em', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-soft, var(--surface2))', color: 'var(--text1)', resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
        <p style={{ fontSize: '0.72em', color: 'var(--muted)', margin: 0 }}>
          원본 이력은 그대로 유지되고, "사유 수정" 이력 row가 추가됩니다.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy} style={{ padding: '6px 14px', fontSize: '0.85em' }}>취소</button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              padding: '6px 14px', fontSize: '0.85em', fontWeight: 600,
              background: canSubmit ? '#22c55e' : 'var(--surface2)',
              color: canSubmit ? '#fff' : 'var(--muted)',
              border: 'none', borderRadius: 6, cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            저장 + 새 이력으로 기록
          </button>
        </div>
      </div>
    </div>
  )
}

function ChangeHistoryPanel({ items, filterTarget, onReload }: { items: ChangeHistoryItem[]; filterTarget?: string; onReload: () => void }) {
  const [showAll, setShowAll] = useState(false)
  const [editingItem, setEditingItem] = useState<ChangeHistoryItem | null>(null)
  const filtered = useMemo(() => {
    if (!filterTarget || showAll) return items
    const related = items.filter((i) => i.target === filterTarget)
    return related.length > 0 ? related : items
  }, [items, filterTarget, showAll])
  const scoped = filterTarget && !showAll && filtered.some((i) => i.target === filterTarget)

  return (
    <article className="workflowCard workflowCardWide">
      <HistoryReasonEditModal
        item={editingItem}
        onCancel={() => setEditingItem(null)}
        onSaved={() => { setEditingItem(null); onReload() }}
      />
      <div className="workflowSectionHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="workflowSectionEyebrow">🕒 Change Log</span>
          <h3>변경 이력</h3>
        </div>
        {filterTarget ? (
          <button
            type="button"
            className="secondary mini"
            onClick={() => setShowAll((v) => !v)}
            style={{ fontSize: '0.78em' }}
          >
            {showAll ? `"${filterTarget}"만 보기` : '전체 보기'}
          </button>
        ) : null}
      </div>
      {scoped ? (
        <p style={{ fontSize: '0.78em', color: 'var(--muted)', margin: '0 0 8px' }}>
          현재 업무(<strong>{filterTarget}</strong>)에 해당하는 이력만 표시 중
        </p>
      ) : null}
      {filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85em', margin: 0 }}>아직 기록된 변경 내역이 없습니다.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {filtered.slice(0, 50).map((h) => {
            const kindColor = h.kind === '폴더' ? '#3b82f6' : '#8b5cf6'
            const isReasonEdit = h.action === '사유 수정'
            const canEditReason = !!h.reason && !isReasonEdit
            return (
              <div
                key={h.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '72px 1fr auto',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: isReasonEdit ? '#fffbeb' : 'var(--surface2, #f9fafb)',
                  borderLeft: `3px solid ${isReasonEdit ? '#f59e0b' : kindColor}`,
                }}
              >
                <div style={{ fontSize: '0.7em', color: 'var(--muted)', paddingTop: 1 }}>
                  {h.createdAt ? new Date(h.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
                <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82em' }}>
                    <span style={{ fontWeight: 700, color: isReasonEdit ? '#92400e' : kindColor }}>[{h.kind}]</span>{' '}
                    <code className="fileGuideCode" style={{ fontSize: 11 }}>{h.target}</code>{' '}
                    <span style={{ color: 'var(--muted)' }}>· {h.action}</span>
                  </div>
                  {isReasonEdit ? (
                    <div style={{ fontSize: '0.78em', color: 'var(--text2)' }}>
                      {h.before ? (
                        <div style={{ textDecoration: 'line-through', opacity: 0.6 }}>💬 {h.before}</div>
                      ) : null}
                      {h.after ? <div>✏ {h.after}</div> : null}
                    </div>
                  ) : h.reason ? (
                    <div style={{ fontSize: '0.78em', color: 'var(--text2)' }}>
                      💬 {h.reason}
                    </div>
                  ) : null}
                </div>
                {canEditReason ? (
                  <button
                    type="button"
                    onClick={() => setEditingItem(h)}
                    title="사유 수정 (원본은 유지됩니다)"
                    style={{
                      fontSize: '0.72em',
                      padding: '2px 8px',
                      background: 'transparent',
                      color: 'var(--muted)',
                      border: '1px dashed var(--border)',
                      borderRadius: 999,
                      cursor: 'pointer',
                      alignSelf: 'start',
                      boxShadow: 'none',
                    }}
                  >
                    ✏ 사유 수정
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

function HighlightLegend() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.78em', color: 'var(--muted)' }}>
      {([
        ['ASSET', 'asset'],
        ['WORK', 'project'],
        ['PUB', 'gdrive'],
      ] as const).map(([roleKey, role]) => {
        const color = C[role]
        const meta = REF_ROLE_META[roleKey]
        return (
          <span key={role} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, background: color.bg, border: `2px solid ${color.border}`, borderRadius: 3 }} />
            {meta.label} {meta.desc}
          </span>
        )
      })}
    </div>
  )
}

function ManualScreenLegend() {
  const panelStyle: React.CSSProperties = {
    display: 'grid',
    gap: 8,
    padding: 12,
    background: 'var(--surface2, #f8fafc)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  }
  const inlineBadgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    minHeight: 18,
    padding: '0 6px',
    borderRadius: 999,
    fontSize: '0.72em',
    fontWeight: 700,
  }
  return (
    <article className="workflowCard workflowCardWide">
      <div className="workflowSectionHeader">
        <div>
          <span className="workflowSectionEyebrow">Legend</span>
          <h3>이 화면 읽는 법</h3>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div style={panelStyle}>
          <h4 style={{ margin: 0, fontSize: '0.92em' }}>상태 아이콘</h4>
          {WORK_MANUAL_STATUS_OPTIONS.map((status) => {
            const style = STATUS_STYLES[status]
            return (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82em' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: style.bg,
                    color: style.text,
                    border: `1px solid ${style.border}`,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  <span>{style.icon}</span>
                  <span>{status}</span>
                </span>
                <span style={{ color: 'var(--text2)' }}>{STATUS_DESCRIPTIONS[status]}</span>
              </div>
            )
          })}
          <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
            왼쪽 목록의 작은 네모 아이콘도 같은 상태 의미입니다.
          </div>
        </div>

        <div style={panelStyle}>
          <h4 style={{ margin: 0, fontSize: '0.92em' }}>폴더 트리 색칠</h4>
          <div style={{ display: 'grid', gap: 6, fontSize: '0.82em' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: C.project.bg, border: `2px solid ${C.project.border}`, flexShrink: 0 }} />
              <span>진한 색 + 실선: 확정된 참조 폴더</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: C.project.soft, border: `2px dashed ${C.project.border}`, flexShrink: 0 }} />
              <span>연한 색 + 점선: 논의중인 참조 후보</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: 'transparent', border: '2px solid var(--border)', flexShrink: 0 }} />
              <span>색 없음: 아직 참조 미지정 또는 미정</span>
            </div>
          </div>
          <HighlightLegend />
        </div>

        <div style={panelStyle}>
          <h4 style={{ margin: 0, fontSize: '0.92em' }}>왼쪽 목록 배지</h4>
          <div style={{ display: 'grid', gap: 6, fontSize: '0.82em' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...inlineBadgeStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>?</span>
              <span>업무 범위나 용어 정의 해석을 다시 확인해야 하는 항목</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...inlineBadgeStyle, background: '#e5e7eb', color: '#6b7280', border: '1px solid #d1d5db' }}>local</span>
              <span>Notion 업무 DB에는 아직 없는 로컬 초안</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...inlineBadgeStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>미작성</span>
              <span>Notion에는 있지만 매뉴얼 초안이 아직 없음</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...inlineBadgeStyle, background: WORK_MANUAL_CATEGORIES.A.bg, color: WORK_MANUAL_CATEGORIES.A.text, border: `1px solid ${WORK_MANUAL_CATEGORIES.A.border}` }}>[A]</span>
              <span>선택된 행의 연한 배경은 현재 카테고리 색입니다.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--muted)', fontSize: '1.05em' }}>🎨</span>
              <span>상세 카드 상단 앱 목록은 주로 쓰는 도구입니다.</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function ManualDetail({
  item,
  folderTree,
  onUpdateStatus,
  onChangeStatusWithReason,
  historyItems,
  refs,
  refsByPath,
  onRefEditOpen,
  refEditPath,
  onRefEditClose,
  onRefsChanged,
}: {
  item: { workType: string; manual?: WorkTypeManual; inNotion: boolean; statusItem?: WorkManualStatusItem }
  folderTree: TreeNode[]
  onUpdateStatus: (patch: Partial<Pick<WorkManualStatusItem, 'status' | 'fixedAt' | 'note'>>) => void
  onChangeStatusWithReason: (workType: string, nextStatus: WorkManualStatus, reason: string) => Promise<void>
  historyItems: ChangeHistoryItem[]
  refs: WorkManualRef[]
  refsByPath: Map<string, WorkManualRef[]>
  onRefEditOpen: (path: string) => void
  refEditPath: string | null
  onRefEditClose: () => void
  onRefsChanged: () => void
}) {
  const { manual, workType, inNotion, statusItem } = item
  const cat = manual ? WORK_MANUAL_CATEGORIES[manual.category] : null
  // Highlight is DB-driven: confirmed refs glow (color) in the tree.
  const highlightedPaths = useMemo(() => {
    const map = new Map<string, HighlightRole>()
    for (const r of refs) {
      if (r.status !== '확정') continue
      const key: HighlightRole | null = r.role === 'ASSET' ? 'asset' : r.role === 'WORK' ? 'project' : r.role === 'PUB' ? 'gdrive' : null
      if (key && r.path) map.set(expandProjectTemplate(r.path), key)
    }
    return map.size > 0 ? map : null
  }, [refs])

  const dimHighlightedPaths = useMemo(() => {
    const map = new Map<string, HighlightRole>()
    for (const r of refs) {
      if (r.status !== '논의중') continue
      const key: HighlightRole | null = r.role === 'ASSET' ? 'asset' : r.role === 'WORK' ? 'project' : r.role === 'PUB' ? 'gdrive' : null
      if (key && r.path) map.set(expandProjectTemplate(r.path), key)
    }
    return map.size > 0 ? map : null
  }, [refs])

  const descendantCountByPath = useMemo(() => {
    const map = new Map<string, { confirmed: number; pending: number }>()
    for (const r of refs) {
      if (!r.path) continue
      const expanded = expandProjectTemplate(r.path)
      const segs = expanded.split('/')
      // ancestors only, not the path itself
      for (let i = 1; i < segs.length; i++) {
        const anc = segs.slice(0, i).join('/')
        const cur = map.get(anc) ?? { confirmed: 0, pending: 0 }
        if (r.status === '확정') cur.confirmed++
        else cur.pending++
        map.set(anc, cur)
      }
    }
    return map.size > 0 ? map : null
  }, [refs])

  const refsTotal = refs.length
  const refsConfirmed = useMemo(() => refs.filter((r) => r.status === '확정').length, [refs])
  const refsAllConfirmed = refsTotal > 0 && refsConfirmed === refsTotal

  const statusName = (statusItem?.status as WorkManualStatus | undefined) ?? '미정'
  const statusStyle = STATUS_STYLES[statusName] ?? STATUS_STYLES['미정']
  const isLocked = statusName === '확정'
  const [noteDraft, setNoteDraft] = useState(statusItem?.note ?? '')
  const [noteDirty, setNoteDirty] = useState(false)
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const canConfirmManual = refsAllConfirmed
  useEffect(() => {
    setNoteDraft(statusItem?.note ?? '')
    setNoteDirty(false)
  }, [statusItem?.id, statusItem?.note])

  if (!manual) {
    return (
      <article className="workflowCard workflowCardWide" style={{ borderLeft: '3px solid #f59e0b' }}>
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: '#92400e' }}>Manual Missing</span>
            <h3>{workType}</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.9em', color: 'var(--text2)' }}>
          이 업무구분은 <strong>Notion 업무 DB</strong>에 존재하지만, 아직 매뉴얼 초안이 작성되지 않았습니다.
        </p>
        <p style={{ fontSize: '0.85em', color: 'var(--muted)' }}>
          관리자: <code className="fileGuideCode">src/features/nasGuide/workTypeManuals.ts</code>에 새 항목을 추가하세요.
        </p>
      </article>
    )
  }

  return (
    <>
      <StatusChangeReasonModal
        open={statusModalOpen}
        title={
          canConfirmManual
            ? '업무 매뉴얼 상태 변경'
            : `업무 매뉴얼 상태 변경 · 참조 폴더 ${refsConfirmed}/${refsTotal} 확정 (나머지 ${refsTotal - refsConfirmed}개도 확정해야 매뉴얼 확정 가능)`
        }
        target={workType}
        currentStatus={statusName}
        statusOptions={canConfirmManual ? WORK_MANUAL_STATUS_OPTIONS : WORK_MANUAL_STATUS_OPTIONS.filter((s) => s !== '확정')}
        statusStyles={STATUS_STYLES}
        lockedStatus="확정"
        history={historyItems.filter((h) => h.target === workType)}
        historyTitle={`이 업무의 과거 변경 (${workType})`}
        onCancel={() => setStatusModalOpen(false)}
        onConfirm={async (next, reason) => {
          await onChangeStatusWithReason(workType, next as WorkManualStatus, reason)
          setStatusModalOpen(false)
        }}
      />
      <ManualRefEditModal
        open={refEditPath !== null}
        workType={workType}
        folderPath={refEditPath ?? ''}
        refsHere={refEditPath ? refsByPath.get(refEditPath) ?? [] : []}
        onClose={onRefEditClose}
        onChanged={onRefsChanged}
      />
      {/* 헤더 */}
      <article className="workflowCard workflowCardWide" style={{ borderLeft: cat ? `4px solid ${cat.border}` : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {cat ? (
            <span
              style={{
                fontSize: '0.75em',
                fontWeight: 700,
                padding: '3px 10px',
                background: cat.bg,
                color: cat.text,
                border: `1px solid ${cat.border}`,
                borderRadius: 999,
              }}
            >
              [{manual.category}] {cat.label}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setStatusModalOpen(true)}
            title={isLocked ? `🔒 확정${statusItem?.fixedAt ? ` · ${statusItem.fixedAt}` : ''} (클릭하여 잠금해제)` : '상태 변경'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.78em',
              fontWeight: 700,
              padding: '3px 12px',
              background: statusStyle.bg,
              color: statusStyle.text,
              border: `1px solid ${statusStyle.border}`,
              borderRadius: 999,
              cursor: 'pointer',
              boxShadow: 'none',
            }}
          >
            <span>{isLocked ? '🔒' : statusStyle.icon}</span>
            <span>{statusName}</span>
            {isLocked && statusItem?.fixedAt ? (
              <span style={{ fontWeight: 400, opacity: 0.75, fontSize: '0.88em' }}>· {statusItem.fixedAt}</span>
            ) : null}
          </button>
          {isLocked ? (
            <button
              type="button"
              onClick={() => setStatusModalOpen(true)}
              title="잠금해제 (사유 필수)"
              style={{
                fontSize: '0.72em',
                fontWeight: 600,
                padding: '3px 10px',
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px dashed var(--border)',
                borderRadius: 999,
                cursor: 'pointer',
                boxShadow: 'none',
              }}
            >
              🔓 잠금해제
            </button>
          ) : null}
          {refsTotal > 0 ? (
            <span
              title={refsAllConfirmed ? '모든 참조 폴더 확정됨' : '매뉴얼 확정 전 참조 폴더 모두 확정 필요'}
              style={{
                fontSize: '0.72em',
                fontWeight: 700,
                padding: '3px 10px',
                background: refsAllConfirmed ? '#dcfce7' : '#fef3c7',
                color: refsAllConfirmed ? '#166534' : '#92400e',
                border: `1px solid ${refsAllConfirmed ? '#22c55e' : '#f59e0b'}`,
                borderRadius: 999,
              }}
            >
              참조 {refsConfirmed}/{refsTotal} 확정
            </span>
          ) : null}
          {manual.ambiguous ? (
            <span style={{ fontSize: '0.75em', fontWeight: 700, padding: '3px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: 999 }}>
              해석 확인 필요
            </span>
          ) : null}
          {!inNotion ? (
            <span style={{ fontSize: '0.72em', padding: '2px 8px', background: '#e5e7eb', color: '#6b7280', borderRadius: 999 }}>
              Notion에 없음 (로컬 초안)
            </span>
          ) : null}
          {manual.adobeApps?.length ? (
            <span style={{ fontSize: '0.72em', color: 'var(--muted)' }}>
              🎨 {manual.adobeApps.join(', ')}
            </span>
          ) : null}
        </div>
        <h3 style={{ margin: '6px 0 4px' }}>{manual.workType}</h3>
        {manual.description ? (
          <p style={{ fontSize: '0.88em', color: 'var(--text2)', margin: 0 }}>{manual.description}</p>
        ) : null}
        {manual.ambiguityNote ? (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: '#fffbeb',
              border: '1px dashed #f59e0b',
              borderRadius: 6,
              fontSize: '0.82em',
              color: '#92400e',
            }}
          >
            ⚠ {manual.ambiguityNote}
          </div>
        ) : null}
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          <label style={{ fontSize: '0.75em', color: 'var(--muted)', fontWeight: 600 }}>
            확정 근거 / 메모
          </label>
          <textarea
            value={noteDraft}
            onChange={(e) => { setNoteDraft(e.target.value); setNoteDirty(true) }}
            onBlur={() => {
              if (noteDirty && noteDraft !== (statusItem?.note ?? '')) {
                onUpdateStatus({ note: noteDraft })
                setNoteDirty(false)
              }
            }}
            placeholder="왜 이렇게 확정했는지 한 줄로 기록. 비워둬도 OK."
            rows={2}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.82em',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface1)',
              color: 'var(--text1)',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </article>

      {/* 폴더트리 + 참조 편집 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">🔦 Folder Highlight</span>
            <h3>이 업무가 쓰는 폴더</h3>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <HighlightLegend />
        </div>
        <p style={{ fontSize: '0.82em', color: 'var(--text2)', margin: '0 0 8px' }}>
          폴더 옆 배지를 클릭해 <strong>이 업무의 참조 폴더</strong>를 추가/확정할 수 있습니다.
          확정(🔒) 참조는 진하게, 논의중(🟡) 참조는 연하게 표시됩니다. 현재
          <strong> {refsConfirmed}/{refsTotal} 확정</strong>.
        </p>
        <TreeViewer
          key={workType}
          data={folderTree}
          highlightedPaths={highlightedPaths}
          dimHighlightedPaths={dimHighlightedPaths}
          manualRefsByPath={refsByPath}
          onManualRefClick={onRefEditOpen}
          descendantCountByPath={descendantCountByPath}
        />
        <p style={{ fontSize: '0.78em', color: 'var(--muted)', margin: '8px 0 0' }}>
          * PROJECT 하이라이트는 샘플 프로젝트(<code className="fileGuideCode">{SAMPLE_PROJECT_FOLDER}</code>)에
          표시됩니다. 실제로는 <code className="fileGuideCode">IZYYNNNN_프로젝트명</code> 자리에 현재 프로젝트
          폴더명이 들어갑니다.
        </p>
      </article>

      {/* Phase 1 */}
      <PhaseCard n="1" title="에셋에서 꺼낼 것" color={C.asset}>
        {manual.assets.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85em', margin: 0 }}>참조할 에셋 없음</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {manual.assets.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '0.72em', fontWeight: 600, padding: '1px 6px', background: a.required === false ? '#f3f4f6' : C.asset.bg, color: a.required === false ? '#6b7280' : C.asset.text, border: `1px solid ${a.required === false ? '#d1d5db' : C.asset.border}`, borderRadius: 4, flexShrink: 0, marginTop: 1 }}>
                  {a.required === false ? '선택' : '필수'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <code className="fileGuideCode" style={{ fontSize: 11 }}>{a.path}</code>
                  <div style={{ fontSize: '0.82em' }}>{a.label}</div>
                  {a.note ? <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>└ {a.note}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PhaseCard>

      {/* Phase 2 */}
      <PhaseCard n="2" title="프로젝트 폴더 위치" color={C.project}>
        <code className="fileGuideCode" style={{ fontSize: 12, whiteSpace: 'pre-wrap', display: 'block', padding: '6px 10px', background: C.project.soft, borderRadius: 6 }}>
          {manual.workBasePath}
        </code>
      </PhaseCard>

      {/* Phase 3 */}
      <PhaseCard n="3" title="작업 중 산출물" color={C.project}>
        {manual.artifacts.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85em', margin: 0 }}>파일 생성 거의 없음</p>
        ) : (
          <div style={{ display: 'grid', gap: 4 }}>
            {manual.artifacts.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1.3fr', gap: 10, alignItems: 'baseline', padding: '4px 0', borderBottom: i === manual.artifacts.length - 1 ? 'none' : '1px dashed var(--border)' }}>
                <code className="fileGuideCode" style={{ fontSize: 11 }}>{a.filename}</code>
                <div style={{ fontSize: '0.82em', color: 'var(--text2)' }}>{a.purpose}</div>
              </div>
            ))}
          </div>
        )}
      </PhaseCard>

      {/* Phase 4 */}
      <PhaseCard n="4" title="최종 배포 (Google Drive)" color={C.gdrive}>
        {manual.publish ? (
          <div style={{ display: 'grid', gap: 6 }}>
            <code className="fileGuideCode" style={{ fontSize: 12, padding: '6px 10px', background: C.gdrive.soft, borderRadius: 6 }}>
              {manual.publish.path}
            </code>
            {manual.publish.filename ? (
              <div style={{ fontSize: '0.82em' }}>
                파일명 예시: <code className="fileGuideCode" style={{ fontSize: 11 }}>{manual.publish.filename}</code>
              </div>
            ) : null}
            {manual.publish.note ? <div style={{ fontSize: '0.78em', color: 'var(--muted)' }}>└ {manual.publish.note}</div> : null}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.85em', margin: 0 }}>배포 위치 없음 (내부용·운영용)</p>
        )}
      </PhaseCard>

      {/* Phase 5 */}
      {manual.cautions && manual.cautions.length > 0 ? (
        <PhaseCard n="5" title="주의사항" color={{ bg: '#fffbeb', border: '#f59e0b', text: '#92400e', soft: '#fffbeb' }}>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85em', display: 'grid', gap: 4 }}>
            {manual.cautions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </PhaseCard>
      ) : null}
    </>
  )
}

function PhaseCard({ n, title, color, children }: { n: string; title: string; color: { bg: string; border: string; text: string; soft: string }; children: React.ReactNode }) {
  return (
    <article className="workflowCard workflowCardWide" style={{ borderLeft: `3px solid ${color.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: color.bg,
            color: color.text,
            border: `1px solid ${color.border}`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.88em',
          }}
        >
          {n}
        </span>
        <h4 style={{ margin: 0, fontSize: '0.95em' }}>{title}</h4>
      </div>
      {children}
    </article>
  )
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section 7: 이슈 트래커
// ---------------------------------------------------------------------------

type IssueItem = {
  id: string
  issue: string
  proposal: string
  solution: string
  area: string
  source: string
  resolved: string
  predecessorId: string
  createdAt: string
}

type SortOrder = 'newest' | 'oldest'

const RESOLVED_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  '해결': { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  '미결': { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  '논의중': { bg: '#fff7ed', text: '#9a3412', border: '#f97316' },
}

const AREA_OPTIONS = ['00_기획-문서', '01_인쇄물', '02_부스', '03_디지털', '04_영상', '05_사진', '06_현장수집', 'ASSET', 'LIBRARY', '파일명', '프로젝트 코드', '전체 구조', '업로드 도구', '카달로그 관리', '구글 드라이브', '딜러 공유', '연구소 연계', '부스 그래픽', '3D/모션', '링크 관리']
const SOURCE_OPTIONS = ['팀장 피드백', '팀원 피드백', '설계 과정']
const RESOLVED_OPTIONS = ['해결', '미결', '논의중']

const issueInputStyle: React.CSSProperties = {
  background: 'var(--input-bg, var(--surface1))', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text1)', fontSize: '0.82em', padding: '5px 8px', width: '100%', boxSizing: 'border-box',
}
const issueSelectStyle: React.CSSProperties = { ...issueInputStyle, width: 'auto' }
const pillBase: React.CSSProperties = {
  borderRadius: 999, padding: '2px 8px', fontSize: '0.75em',
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
}

function InlineText({ value, onSave, placeholder, style }: { value: string; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select() } }, [editing])
  if (!editing) {
    return (
      <div onClick={() => setEditing(true)} style={{ cursor: 'pointer', minHeight: 18, ...style }}>
        {value || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{placeholder ?? '클릭하여 입력'}</span>}
      </div>
    )
  }
  return (
    <textarea ref={ref} style={{ ...issueInputStyle, minHeight: 32, fontWeight: 'inherit', ...(style ?? {}) }} value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditing(false); if (draft !== value) onSave(draft) } }}
    />
  )
}

function InlinePill({ value, options, onSave, bg, border, color }: {
  value: string; options: string[]; onSave: (v: string) => void; bg: string; border: string; color: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ ...pillBase, background: bg, border: `1px solid ${border}`, color }} onClick={() => setOpen(!open)}>
        {value || '선택'}
      </span>
      {open ? (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
          background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: 'var(--shadow-md)', padding: 4, minWidth: 120, maxHeight: 200, overflowY: 'auto',
        }}>
          {options.map((opt) => (
            <div key={opt} style={{
              padding: '5px 10px', fontSize: '0.78em', cursor: 'pointer', borderRadius: 4,
              background: opt === value ? 'var(--bg-soft)' : undefined, fontWeight: opt === value ? 600 : 400,
            }} onClick={() => { onSave(opt); setOpen(false) }}>{opt}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function IssueCard({ item, onSave, forceCollapsed, allItems }: { item: IssueItem; onSave: (id: string, patch: Partial<IssueItem>) => void; forceCollapsed?: boolean | null; allItems: IssueItem[] }) {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { if (forceCollapsed !== null && forceCollapsed !== undefined) setCollapsed(forceCollapsed) }, [forceCollapsed])
  const predecessor = item.predecessorId ? allItems.find((i) => i.id === item.predecessorId) : null
  const isBlocked = predecessor && predecessor.resolved !== '해결'
  const rc = isBlocked
    ? { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' }
    : (RESOLVED_COLORS[item.resolved] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' })
  const save = (field: keyof IssueItem, value: string) => onSave(item.id, { [field]: value })
  return (
    <article className="workflowCard workflowCardWide" style={{ borderLeft: `3px solid ${rc.border}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <InlineText value={item.issue} onSave={(v) => save('issue', v)} style={{ fontWeight: 700, fontSize: '0.95em', flex: 1 }} />
        <span style={{ cursor: 'pointer', fontSize: '0.72em', color: 'var(--muted)', flexShrink: 0, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '펼치기' : '접기'}
        </span>
      </div>
      {!collapsed ? (
        <>
          <div style={{ background: 'var(--surface2, #f5f7fb)', borderRadius: 8, padding: '8px 12px' }}>
            <div style={{ fontSize: '0.7em', color: 'var(--muted)', marginBottom: 2 }}>제안내용</div>
            <InlineText value={item.proposal} onSave={(v) => save('proposal', v)} placeholder="클릭하여 입력" style={{ fontSize: '0.85em', color: 'var(--text2)' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.7em', color: 'var(--muted)', marginBottom: 2 }}>처리방법</div>
            <InlineText value={item.solution} onSave={(v) => save('solution', v)} placeholder="클릭하여 입력" style={{ fontSize: '0.85em', color: 'var(--text2)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <InlinePill value={item.area} options={AREA_OPTIONS} onSave={(v) => save('area', v)} bg="var(--bg-soft, #eef2f7)" border="var(--border)" color="var(--text2)" />
            <InlinePill value={item.source} options={SOURCE_OPTIONS} onSave={(v) => save('source', v)} bg="#dbeafe" border="#93c5fd" color="#1d4ed8" />
            <InlinePill value={item.resolved} options={RESOLVED_OPTIONS} onSave={(v) => save('resolved', v)} bg={rc.bg} border={rc.border} color={rc.text} />
            <InlinePill
              value={predecessor ? predecessor.issue.substring(0, 25) : ''}
              options={['(없음)', ...allItems.filter((i) => i.id !== item.id).map((i) => i.issue.substring(0, 30))]}
              onSave={(v) => {
                if (v === '(없음)') { onSave(item.id, { predecessorId: '' }); return }
                const found = allItems.find((i) => i.issue.startsWith(v))
                if (found) onSave(item.id, { predecessorId: found.id })
              }}
              bg={isBlocked ? '#fef2f2' : 'var(--bg-soft, #eef2f7)'}
              border={isBlocked ? '#fca5a5' : 'var(--border)'}
              color={isBlocked ? '#b91c1c' : 'var(--muted)'}
            />
            {isBlocked ? (
              <span style={{ ...pillBase, background: '#f3f4f6', border: '1px solid #9ca3af', color: '#6b7280', fontWeight: 600 }}>
                진행불가
              </span>
            ) : null}
            {item.createdAt ? (
              <span style={{ fontSize: '0.7em', color: 'var(--muted)', marginLeft: 'auto' }}>
                {new Date(item.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </article>
  )
}

function IssuesSection() {
  const [items, setItems] = useState<IssueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filterArea, setFilterArea] = useState('')
  const [filterResolved, setFilterResolved] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [newItem, setNewItem] = useState<Partial<IssueItem>>({ resolved: '미결' })
  const [allCollapsedSignal, setAllCollapsedSignal] = useState<boolean | null>(null)
  const setAllCollapsed = (collapsed: boolean) => { setAllCollapsedSignal(collapsed); setTimeout(() => setAllCollapsedSignal(null), 100) }

  const [fetchError, setFetchError] = useState('')
  const fetchItems = useCallback(() => {
    setLoading(true)
    setFetchError('')
    api<{ ok: boolean; items: IssueItem[]; error?: string }>('/nas-issues')
      .then((res) => {
        if (res.ok) setItems(res.items)
        else setFetchError(res.error ?? 'unknown error')
      })
      .catch((err) => setFetchError(err instanceof Error ? err.message : 'fetch failed'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const saveItem = useCallback(async (id: string, patch: Partial<IssueItem>) => {
    await api(`/nas-issues/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }).catch(() => {})
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...patch } : i))
  }, [])

  const addItem = useCallback(async () => {
    if (!newItem.issue?.trim()) return
    const res = await api<{ ok: boolean; id?: string }>('/nas-issues', { method: 'POST', body: JSON.stringify(newItem) }).catch(() => null)
    if (res?.ok) {
      setShowAdd(false)
      setNewItem({ resolved: '미결' })
      fetchItems()
    }
  }, [newItem, fetchItems])

  const areas = useMemo(() => [...new Set(items.map((i) => i.area).filter(Boolean))].sort(), [items])
  const filtered = useMemo(() => {
    const list = items.filter((i) => {
      if (filterArea && i.area !== filterArea) return false
      if (filterResolved && i.resolved !== filterResolved) return false
      return true
    })
    list.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime() || 0
      const tb = new Date(b.createdAt).getTime() || 0
      return sortOrder === 'newest' ? tb - ta : ta - tb
    })
    return list
  }, [items, filterArea, filterResolved, sortOrder])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const i of items) c[i.resolved] = (c[i.resolved] || 0) + 1
    return c
  }, [items])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <article className="workflowCard workflowCardWide">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {Object.entries(counts).map(([status, count]) => {
              const c = RESOLVED_COLORS[status] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' }
              return (
                <span key={status} style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 999, padding: '3px 10px', fontSize: '0.82em', fontWeight: 600, cursor: 'pointer', opacity: filterResolved && filterResolved !== status ? 0.4 : 1 }} onClick={() => setFilterResolved(filterResolved === status ? '' : status)}>
                  {status} {count}
                </span>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select style={issueSelectStyle} value={filterArea} onChange={(e) => setFilterArea(e.target.value)}>
              <option value="">전체 영역</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <button type="button" onClick={() => setShowAdd(!showAdd)} style={{ padding: '5px 12px', fontSize: '0.82em' }}>
              {showAdd ? '취소' : '+ 이슈 추가'}
            </button>
            <button type="button" className={sortOrder === 'newest' ? '' : 'secondary'} onClick={() => setSortOrder('newest')} style={{ padding: '5px 10px', fontSize: '0.82em' }}>최신순</button>
            <button type="button" className={sortOrder === 'oldest' ? '' : 'secondary'} onClick={() => setSortOrder('oldest')} style={{ padding: '5px 10px', fontSize: '0.82em' }}>오래된순</button>
            <button type="button" className="secondary" onClick={() => setAllCollapsed(true)} style={{ padding: '5px 10px', fontSize: '0.82em' }}>전체 접기</button>
            <button type="button" className="secondary" onClick={() => setAllCollapsed(false)} style={{ padding: '5px 10px', fontSize: '0.82em' }}>전체 펼치기</button>
          </div>
        </div>
      </article>

      {showAdd ? (
        <article className="workflowCard workflowCardWide" style={{ borderLeft: '3px solid var(--primary)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '0.88em' }}>새 이슈 추가</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <input style={issueInputStyle} placeholder="문제점" value={newItem.issue ?? ''} onChange={(e) => setNewItem({ ...newItem, issue: e.target.value })} />
            <textarea style={{ ...issueInputStyle, minHeight: 40 }} placeholder="제안내용" value={newItem.proposal ?? ''} onChange={(e) => setNewItem({ ...newItem, proposal: e.target.value })} />
            <textarea style={{ ...issueInputStyle, minHeight: 40 }} placeholder="처리방법" value={newItem.solution ?? ''} onChange={(e) => setNewItem({ ...newItem, solution: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select style={issueSelectStyle} value={newItem.area ?? ''} onChange={(e) => setNewItem({ ...newItem, area: e.target.value })}>
                <option value="">영역</option>
                {AREA_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select style={issueSelectStyle} value={newItem.source ?? ''} onChange={(e) => setNewItem({ ...newItem, source: e.target.value })}>
                <option value="">출처</option>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select style={issueSelectStyle} value={newItem.resolved ?? '미결'} onChange={(e) => setNewItem({ ...newItem, resolved: e.target.value })}>
                {RESOLVED_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button type="button" onClick={addItem} disabled={!newItem.issue?.trim()} style={{ width: 'fit-content', padding: '5px 20px', fontSize: '0.82em' }}>추가</button>
          </div>
        </article>
      ) : null}

      {loading ? <div style={{ padding: 20, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>불러오는 중...</div> : null}
      {fetchError ? <div style={{ padding: 12, fontSize: '0.82em', color: 'var(--danger)', background: '#fef2f2', borderRadius: 8 }}>API 오류: {fetchError}</div> : null}

      {filtered.map((item) => <IssueCard key={item.id} item={item} onSave={saveItem} forceCollapsed={allCollapsedSignal} allItems={items} />)}

      {!loading && filtered.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', fontSize: '0.85em', color: 'var(--muted)' }}>해당하는 이슈가 없습니다</div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section 7: 자동 저장 방식
// ---------------------------------------------------------------------------

const AUTO_SAVE_FLOW_STEPS = [
  { n: '1', title: 'NAS 로그인', desc: 'NAS 계정(아이디/비밀번호)으로 로그인' },
  { n: '2', title: '업무 목록 자동 조회', desc: '로그인한 NAS 아이디로 Notion 업무관리 DB에서 본인 담당 업무를 자동 조회 (완료/보관 제외)' },
  { n: '3', title: '업무 선택', desc: '목록에서 업무를 클릭하면 아래 항목이 자동 세팅됨' },
  { n: '4', title: '파일 선택 & 업로드', desc: '파일을 선택하면 확장자 자동 감지, 업로드 시 규칙에 맞는 파일명으로 NAS에 저장' },
  { n: '5', title: 'Notion 자동 업데이트', desc: '업로드 완료 후 해당 업무의 산출물 링크 + 수정사유가 자동으로 기록됨' },
]

const AUTO_SAVE_PATH_PARTS = [
  { part: '기본 경로', value: '/Izenimplant/Marketing', source: '고정값', auto: true },
  { part: '프로젝트 폴더', value: '01_PROJECT/{일련번호}_{프로젝트명}', source: '업무 → 프로젝트 일련번호 + 프로젝트명', auto: true },
  { part: '하위 폴더', value: '예: 01_인쇄물/포스터', source: '업무 유형(workType) 키워드로 자동 추론', auto: true },
]

const AUTO_SAVE_SUBFOLDER_ROWS: Array<{ keyword: string; folder: string; example: string }> = [
  { keyword: '기획', folder: '00_기획-문서', example: '기획서 작성, 보고서' },
  { keyword: '인쇄 / 인쇄물', folder: '01_인쇄물', example: '인쇄물 전반' },
  { keyword: '포스터', folder: '01_인쇄물/포스터', example: 'CIS 포스터 디자인' },
  { keyword: '리플렛', folder: '01_인쇄물/리플렛', example: '제품 리플렛' },
  { keyword: '브로슈어', folder: '01_인쇄물/브로슈어', example: '브로슈어 제작' },
  { keyword: '카달로그', folder: '01_인쇄물/카달로그', example: 'I-system 카달로그' },
  { keyword: '배너 / 현수막', folder: '01_인쇄물/배너-현수막', example: '행사 배너' },
  { keyword: 'certificate', folder: '01_인쇄물/certificate', example: 'certificate 디자인' },
  { keyword: '부스', folder: '02_부스', example: '부스 디자인 전반' },
  { keyword: '부스디자인', folder: '02_부스/부스디자인', example: '3D 부스 모델링' },
  { keyword: '부스그래픽', folder: '02_부스/부스그래픽', example: '벽면 그래픽' },
  { keyword: '디지털', folder: '03_디지털', example: '디지털 콘텐츠 전반' },
  { keyword: 'SNS', folder: '03_디지털/SNS', example: 'SNS 이미지 제작' },
  { keyword: 'PPT', folder: '03_디지털/PPT', example: '발표자료 디자인' },
  { keyword: '렌더링', folder: '03_디지털/렌더링', example: '제품 렌더링' },
  { keyword: '영상', folder: '04_영상', example: '영상 전반' },
  { keyword: '촬영', folder: '04_영상/a_자체촬영', example: '자체 촬영 영상' },
  { keyword: '편집', folder: '04_영상', example: '영상 편집 (종류별 폴더에서 작업)' },
  { keyword: '모션', folder: '04_영상/모션그래픽', example: '모션그래픽 (오프닝, 브레이크 등)' },
  { keyword: '3D', folder: '04_영상/모션그래픽', example: '3D 모션/애니메이션' },
  { keyword: '사진', folder: '05_사진', example: '사진 촬영/보정' },
  { keyword: '현장수집 / 레퍼런스', folder: '06_현장수집', example: '현장 수집 자료' },
]

const AUTO_SAVE_FILENAME_PARTS: Array<{ el: string; source: string; auto: string }> = [
  { el: '브랜드', source: '사용자 선택 (드롭다운)', auto: '기본값: IZEN' },
  { el: '콘텐츠명', source: '업무명(taskName)에서 자동 생성', auto: '공백 → 하이픈 변환' },
  { el: '언어', source: '사용자 선택 (드롭다운)', auto: 'EN, RU, ZH, KO 또는 생략' },
  { el: '규격', source: '사용자 입력', auto: '선택 사항' },
  { el: '버전 타입', source: '사용자 선택', auto: 'v (내부용) 또는 Rev (배포용)' },
  { el: '버전 번호', source: '폴더 내 기존 파일 스캔', auto: '최대값 + 1 자동 제안' },
  { el: '시퀀스 번호', source: '파일 개수에서 자동 계산', auto: '2개 이상 시 01, 02, 03...' },
  { el: '확장자', source: '선택한 파일에서 자동 감지', auto: '.ai, .psd, .mp4 등' },
]

const AUTO_SAVE_EXAMPLES: Array<{ task: string; workType: string; path: string; filename: string }> = [
  { task: 'CIS 2026 포스터', workType: '포스터', path: '/Izenimplant/Marketing/01_PROJECT/IZ250001_CIS-Conference-2026/01_인쇄물/포스터/', filename: 'IZEN_CIS2026_포스터_EN_A1_v01.ai' },
  { task: 'CIS 2026 후기영상 편집', workType: '편집', path: '/Izenimplant/Marketing/01_PROJECT/IZ250001_CIS-Conference-2026/04_영상/후기영상/', filename: 'IZEN_CIS2026_후기_v02.prproj' },
  { task: 'I-system 카달로그 리뉴얼', workType: '카달로그', path: '/Izenimplant/Marketing/01_PROJECT/IZ250016_I-system-카달로그-리뉴얼/01_인쇄물/카달로그/', filename: 'IZEN_I-system-카달로그-리뉴얼_EN_v04.indd' },
  { task: 'SNS 제품 콘텐츠', workType: 'SNS', path: '/Izenimplant/Marketing/01_PROJECT/IZ250900_SNS-정기콘텐츠/03_디지털/SNS/', filename: 'IZEN_SNS_제품_I-system-신제품_v01.psd' },
  { task: '신제품 렌더링', workType: '렌더링', path: '/Izenimplant/Marketing/01_PROJECT/IZ250017_신제품-렌더링-연구소요청/03_디지털/렌더링/', filename: 'IZEN_신제품-렌더링_v01.png' },
  { task: '부스 벽면 그래픽', workType: '부스그래픽', path: '/Izenimplant/Marketing/01_PROJECT/IZ250001_CIS-Conference-2026/02_부스/부스그래픽/', filename: 'IZEN_CIS2026_부스_벽면A_v01.ai' },
]

function AutoSaveSection() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* 전체 흐름 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Upload Flow</span>
            <h3>업로드 도구 전체 흐름</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.85em', color: 'var(--text2)', margin: 0 }}>
          업무관리(Notion)에서 선택한 업무 정보를 기반으로 저장 경로와 파일명이 자동으로 결정됩니다.
        </p>
        <div className="workflowTimeline">
          {AUTO_SAVE_FLOW_STEPS.map((step) => (
            <article key={step.n} className="workflowStep" style={{ gridTemplateColumns: '40px 1fr' }}>
              <div className="workflowStepNumber" style={{ height: 40, fontSize: 14, background: C.project.bg, borderColor: C.project.border, color: C.project.text }}>
                {step.n}
              </div>
              <div className="workflowStepBody">
                <h4>{step.title}</h4>
                <p>{step.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </article>

      {/* 저장 경로 결정 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Save Path</span>
            <h3>저장 경로 자동 결정</h3>
          </div>
        </div>
        <div className="fileGuideTree" style={{ textAlign: 'center', fontSize: '0.95em', lineHeight: 2 }}>
          <code style={{ letterSpacing: 0.3 }}>
            <span style={{ color: 'var(--muted)' }}>/Izenimplant/Marketing/</span>
            <span style={{ color: C.project.text, fontWeight: 700 }}>01_PROJECT</span>
            <span style={{ color: 'var(--muted)' }}>/</span>
            <span style={{ color: '#b45309', fontWeight: 700 }}>{'{일련번호}_{프로젝트명}'}</span>
            <span style={{ color: 'var(--muted)' }}>/</span>
            <span style={{ color: '#7c3aed', fontWeight: 700 }}>{'{하위폴더}'}</span>
            <span style={{ color: 'var(--muted)' }}>/</span>
          </code>
        </div>
        <div className="guideTableWrap">
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>경로 구성</th>
                <th>값</th>
                <th>데이터 출처</th>
              </tr>
            </thead>
            <tbody>
              {AUTO_SAVE_PATH_PARTS.map((row) => (
                <tr key={row.part}>
                  <td style={{ fontWeight: 600 }}>{row.part}</td>
                  <td><code className="fileGuideCode" style={{ fontSize: 11 }}>{row.value}</code></td>
                  <td>
                    <span style={{ fontSize: '0.85em' }}>{row.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: 'var(--surface2, #f5f7fb)', borderRadius: 8, padding: '10px 14px', fontSize: '0.82em', color: 'var(--text2)' }}>
          <strong>프로젝트 폴더명 예시:</strong> 업무의 프로젝트가 일련번호 <code className="fileGuideCode">IZ250001</code>, 이름 <code className="fileGuideCode">CIS Conference 2026</code>이면
          → <code className="fileGuideCode">IZ250001_CIS-Conference-2026</code> (공백은 하이픈으로 변환)
        </div>
      </article>

      {/* 하위 폴더 자동 매핑 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Subfolder Mapping</span>
            <h3>업무 유형 → 하위 폴더 자동 매핑</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.85em', color: 'var(--text2)', margin: 0 }}>
          업무관리의 <strong>업무 유형</strong>(workType)에 아래 키워드가 포함되어 있으면 해당 하위 폴더가 자동 선택됩니다.
          매칭되는 키워드가 없으면 기본값 <code className="fileGuideCode">00_기획-문서</code>로 설정됩니다.
          자동 추론 후 드롭다운에서 수동 변경도 가능합니다.
        </p>
        <div className="guideTableWrap" style={{ maxHeight: 480, overflow: 'auto' }}>
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>업무 유형 키워드</th>
                <th>→ 자동 선택 폴더</th>
                <th>예시 업무</th>
              </tr>
            </thead>
            <tbody>
              {AUTO_SAVE_SUBFOLDER_ROWS.map((row) => (
                <tr key={row.keyword}>
                  <td><code className="fileGuideCode" style={{ fontWeight: 600 }}>{row.keyword}</code></td>
                  <td><code className="fileGuideCode" style={{ fontSize: 11 }}>{row.folder}</code></td>
                  <td style={{ fontSize: '0.85em', color: 'var(--text2)' }}>{row.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '10px 14px', fontSize: '0.82em', color: '#854d0e' }}>
          <strong>매칭 방식:</strong> 업무 유형 텍스트에 키워드가 <strong>포함</strong>되어 있으면 매칭됩니다 (대소문자 무시).
          예: 업무 유형이 "CIS 포스터 디자인"이면 "포스터" 키워드에 매칭 → <code className="fileGuideCode">01_인쇄물/포스터</code>
        </div>
      </article>

      {/* 파일명 자동 결정 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Filename</span>
            <h3>파일명 자동 결정</h3>
          </div>
        </div>
        <div className="fileGuideTree" style={{ textAlign: 'center', fontSize: '0.95em' }}>
          <code style={{ letterSpacing: 0.3 }}>
            <span style={{ color: '#b45309' }}>{'{브랜드}'}</span>
            <span style={{ color: 'var(--muted)' }}>_</span>
            <span style={{ color: '#7c3aed' }}>{'{콘텐츠명}'}</span>
            <span style={{ color: 'var(--muted)' }}>_</span>
            <span style={{ color: '#0369a1' }}>{'{언어}'}</span>
            <span style={{ color: 'var(--muted)' }}>_</span>
            <span style={{ color: '#0369a1' }}>{'{규격}'}</span>
            <span style={{ color: 'var(--muted)' }}>_</span>
            <span style={{ color: C.project.text }}>{'{v01}'}</span>
            <span style={{ color: 'var(--muted)' }}>_</span>
            <span style={{ color: '#9333ea' }}>{'{01}'}</span>
            <span style={{ color: 'var(--muted)' }}>.{'{ext}'}</span>
          </code>
        </div>
        <div className="guideTableWrap">
          <table className="fileGuideTable">
            <thead>
              <tr>
                <th>요소</th>
                <th>데이터 출처</th>
                <th>자동화 방식</th>
              </tr>
            </thead>
            <tbody>
              {AUTO_SAVE_FILENAME_PARTS.map((row) => (
                <tr key={row.el}>
                  <td style={{ fontWeight: 600 }}>{row.el}</td>
                  <td style={{ fontSize: '0.85em' }}>{row.source}</td>
                  <td style={{ fontSize: '0.85em', color: 'var(--text2)' }}>{row.auto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.project.border}` }}>
            <h4>버전 자동 제안</h4>
            <p>대상 폴더의 기존 파일을 스캔하여 같은 버전 타입(v 또는 Rev)의 최대 번호를 찾고, +1한 값을 자동 제안합니다.</p>
            <p style={{ fontSize: '0.82em', color: 'var(--muted)' }}>예: 폴더에 v01, v02가 있으면 → v03 제안</p>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.asset.border}` }}>
            <h4>멀티파일 시퀀스</h4>
            <p>파일을 2개 이상 선택하면 자동으로 시퀀스 번호(01, 02, 03...)가 붙습니다. 시작 번호는 변경 가능합니다.</p>
            <p style={{ fontSize: '0.82em', color: 'var(--muted)' }}>예: 3개 선택 → _01, _02, _03</p>
          </div>
        </div>
      </article>

      {/* 실제 예시 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Examples</span>
            <h3>업무별 자동 저장 예시</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.85em', color: 'var(--text2)', margin: 0 }}>
          아래는 업무를 선택했을 때 실제로 자동 세팅되는 경로와 파일명 예시입니다.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {AUTO_SAVE_EXAMPLES.map((ex) => (
            <div
              key={ex.task}
              style={{
                background: 'var(--surface2, #f5f7fb)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.88em' }}>{ex.task}</span>
                <span style={{ background: C.project.bg, border: `1px solid ${C.project.border}`, borderRadius: 999, padding: '1px 8px', fontSize: '0.75em', color: C.project.text, fontWeight: 600 }}>
                  {ex.workType}
                </span>
              </div>
              <div style={{ fontSize: '0.8em', fontFamily: "'Courier New', monospace" }}>
                <div style={{ color: 'var(--muted)' }}>경로: <span style={{ color: 'var(--text1)' }}>{ex.path}</span></div>
                <div style={{ color: 'var(--muted)' }}>파일: <span style={{ color: 'var(--text1)', fontWeight: 600 }}>{ex.filename}</span></div>
              </div>
            </div>
          ))}
        </div>
      </article>

      {/* Notion 자동 연동 */}
      <article className="workflowCard workflowCardWide">
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow">Notion Sync</span>
            <h3>업로드 후 Notion 자동 업데이트</h3>
          </div>
        </div>
        <p style={{ fontSize: '0.85em', color: 'var(--text2)', margin: 0 }}>
          업로드가 완료되면 선택한 업무의 Notion 페이지에 아래 정보가 자동으로 기록됩니다.
        </p>
        <div className="workflowCheckpointGrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.project.border}` }}>
            <h4>산출물 링크 (outputLink)</h4>
            <p>업로드된 파일의 전체 NAS 경로가 자동으로 추가됩니다.</p>
            <p style={{ fontSize: '0.82em', color: 'var(--muted)' }}>기존 링크가 있으면 아래에 누적 (줄바꿈)</p>
            <div style={{ background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: '0.78em', fontFamily: "'Courier New', monospace" }}>
              /Izenimplant/Marketing/01_PROJECT/IZ250001_.../01_인쇄물/포스터/IZEN_CIS2026_포스터_EN_v03.ai
            </div>
          </div>
          <div className="workflowCheckpoint" style={{ borderLeft: `3px solid ${C.library.border}` }}>
            <h4>수정사유 (changeReason)</h4>
            <p>수정사유 입력란에 내용을 적으면 날짜+파일명과 함께 자동 기록됩니다.</p>
            <p style={{ fontSize: '0.82em', color: 'var(--muted)' }}>기존 기록 유지, 새 줄로 누적 추가</p>
            <div style={{ background: 'var(--surface1)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: '0.78em', fontFamily: "'Courier New', monospace" }}>
              [04/14 IZEN_CIS2026_포스터_EN_v03.ai] 자막 오타 수정
            </div>
          </div>
        </div>
      </article>

      {/* 주의사항 */}
      <article className="workflowCard workflowCardWide" style={{ borderColor: '#f59e0b', borderStyle: 'dashed' }}>
        <div className="workflowSectionHeader">
          <div>
            <span className="workflowSectionEyebrow" style={{ color: '#92400e' }}>Notes</span>
            <h3>주의사항</h3>
          </div>
        </div>
        <ul className="workflowList" style={{ fontSize: '0.88em' }}>
          <li>프로젝트 <strong>일련번호가 없는</strong> 업무는 경고가 표시됩니다 — Notion에서 프로젝트 일련번호를 먼저 등록하세요</li>
          <li>하위 폴더는 자동 추론 후 <strong>드롭다운에서 수동 변경</strong> 가능합니다</li>
          <li>같은 이름의 파일이 이미 존재하면 <strong>덮어쓰기 없이 오류</strong>가 발생합니다 (버전 번호를 올려야 함)</li>
          <li>상위 폴더가 NAS에 아직 없으면 <strong>자동 생성</strong>됩니다</li>
          <li>파일명의 콘텐츠명, 언어, 규격 등은 자동 세팅 후 <strong>직접 수정 가능</strong>합니다</li>
        </ul>
      </article>
    </div>
  )
}

const TABS = [
  { id: 'structure', label: '폴더 구조', icon: '📁' },
  { id: 'workManuals', label: '업무별 매뉴얼', icon: '📖' },
  { id: 'decision', label: '어디에 넣나?', icon: '🔍' },
  { id: 'naming', label: '파일명 규칙', icon: '📝' },
  { id: 'autosave', label: '자동 저장 방식', icon: '🤖' },
  { id: 'workflow', label: '작업 흐름', icon: '🔄' },
  { id: 'gdrive', label: '구글 드라이브', icon: '☁️' },
  { id: 'issues', label: 'NAS 이슈 트래커', icon: '📋' },
] as const

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NasGuideView() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]['id']>('structure')
  const folderStructureTree = useMemo(
    () => fillEmptyLeafExampleFiles([...cloneTree(NAS_TREE), ...cloneTree(GDRIVE_TREE)]),
    [],
  )
  const actualFileTree = useMemo(
    () => mergeFilesIntoTree(stripFilesFromTree(folderStructureTree), GENERATED_NAS_GUIDE_EXAMPLES),
    [folderStructureTree],
  )

  // Folder status + history (shared across tabs)
  const [folderStatusItems, setFolderStatusItems] = useState<FolderStatusItem[]>([])
  const [historyItems, setHistoryItems] = useState<ChangeHistoryItem[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [folderPending, setFolderPending] = useState<{ path: string; currentStatus: string; id?: string } | null>(null)

  const loadFolderStatus = useCallback(() => {
    api<FolderStatusResponse>('/folder-status')
      .then((res) => setFolderStatusItems(res?.items ?? []))
      .catch(() => {})
  }, [])

  const loadHistory = useCallback(() => {
    api<ChangeHistoryResponse>('/change-history?limit=50')
      .then((res) => setHistoryItems(res?.items ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => { loadFolderStatus() }, [loadFolderStatus])
  useEffect(() => { loadHistory() }, [loadHistory, historyVersion])

  const folderStatusMap = useMemo(() => {
    const m = new Map<string, FolderStatusItem>()
    for (const item of folderStatusItems) m.set(item.path, item)
    return m
  }, [folderStatusItems])

  const onFolderStatusClick = useCallback((p: string, currentStatus: string, id?: string) => {
    setFolderPending({ path: p, currentStatus, id })
  }, [])

  const commitFolderStatus = useCallback(async (nextStatus: FolderStatus, reason: string) => {
    if (!folderPending) return
    const { path: folderPath, currentStatus, id } = folderPending
    const locked = nextStatus === '확정'
    const patch: any = { status: nextStatus, locked }
    if (nextStatus === '확정') patch.fixedAt = new Date().toISOString().slice(0, 10)
    try {
      if (id) {
        await api(`/folder-status/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
      } else {
        await api('/folder-status', { method: 'POST', body: JSON.stringify({ path: folderPath, ...patch }) })
      }
      await recordHistory({
        kind: '폴더', target: folderPath, action: `${currentStatus}→${nextStatus}`,
        before: currentStatus, after: nextStatus, reason,
      })
      loadFolderStatus()
      setHistoryVersion((v) => v + 1)
    } finally {
      setFolderPending(null)
    }
  }, [folderPending, loadFolderStatus])

  return (
    <section className="workflowView" aria-label="NAS 폴더 구조 가이드">
      <header className="workflowHero">
        <div className="workflowHeroMain">
          <span className="workflowEyebrow">NAS Folder Guide</span>
          <h2>NAS 폴더 구조 가이드</h2>
          <p>
            "이 파일은 어디에 넣어야 하지?"를 바로 판단할 수 있는 가이드입니다.
            NAS: <strong>PROJECT</strong>(작업 과정) · <strong>ASSET</strong>(재료) · <strong>ARCHIVE</strong>(과거 파일) 3축 + <strong>Google Drive</strong>(완성 배포본)로 정리합니다.
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
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? '' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '7px 14px',
              fontSize: '0.82em',
              whiteSpace: 'nowrap',
              borderRadius: 8,
              ...(activeTab !== tab.id ? { boxShadow: 'none' } : {}),
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div>
        <StatusChangeReasonModal
          open={folderPending !== null}
          title="폴더 상태 변경"
          target={folderPending?.path ?? ''}
          currentStatus={folderPending?.currentStatus ?? '미정'}
          statusOptions={['미정', '논의중', '확정']}
          statusStyles={STATUS_STYLES}
          lockedStatus="확정"
          historyTitle="이 폴더의 과거 변경"
          history={folderPending ? historyItems.filter((h) => h.target === folderPending.path) : []}
          onCancel={() => setFolderPending(null)}
          onConfirm={(next, reason) => commitFolderStatus(next as FolderStatus, reason)}
        />
        {activeTab === 'structure' ? (
          <StructureSection
            exampleTreeData={folderStructureTree}
            actualTreeData={actualFileTree}
            actualCount={GENERATED_NAS_GUIDE_EXAMPLE_META.total}
            folderStatusMap={folderStatusMap}
            onFolderStatusClick={onFolderStatusClick}
          />
        ) : null}
        {activeTab === 'workManuals' ? (
          <WorkManualsSection
            folderTree={folderStructureTree}
            historyItems={historyItems}
            onReloadHistory={() => setHistoryVersion((v) => v + 1)}
          />
        ) : null}
        {activeTab === 'decision' ? <DecisionSection /> : null}
        {activeTab === 'naming' ? <NamingSection /> : null}
        {activeTab === 'autosave' ? <AutoSaveSection /> : null}
        {activeTab === 'workflow' ? <WorkflowSection /> : null}
        {activeTab === 'gdrive' ? <GDriveSection /> : null}
        {activeTab === 'issues' ? <IssuesSection /> : null}
      </div>
    </section>
  )
}
