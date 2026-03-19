import type { ScreeningPlanImportForm } from '../features/screening/ScreeningPlanImportModal'
import type { Filters, GuideConfigRow, TaskViewFilters, ThemeKey } from './types'

export const POLLING_MS = 60_000
export const TASK_PAGE_SIZE = 100
export const MAX_TASK_PAGES = 30
export const TOAST_LIFETIME_MS = 3600
export const AUTH_GATE_ENABLED = true
export const AUTH_GATE_PASSWORD = 'izenjsk_62988'
export const AUTH_GATE_STORAGE_KEY = 'izen_front_gate_authenticated'
export const THEME_QUERY_KEY = 'theme'
export const THEME_STORAGE_KEY = 'izen_theme'
export const DEFAULT_THEME: ThemeKey = 'v3'
export const ENABLE_SYSTEM_THEME_FALLBACK = false
export const INITIAL_SCREENING_PLAN_IMPORT_FORM: ScreeningPlanImportForm = {
  sourceEventName: '',
  targetProjectId: '',
}

export const GUIDE_SECRET_ROWS: GuideConfigRow[] = [
  {
    name: 'PAGE_PASSWORD',
    location: '웹 로그인 비밀번호, /api/auth/login',
    secret: '예',
    billing: '없음',
    impact: '교체하면 웹 로그인 비밀번호가 즉시 바뀌고, 운영자 안내 없이 바꾸면 접속 문의가 생깁니다.',
  },
  {
    name: 'SESSION_SECRET',
    location: '세션 쿠키 서명, 업로드 토큰 서명 fallback',
    secret: '예',
    billing: '없음',
    impact: '교체하면 기존 로그인 세션이 무효화될 수 있고, 서명 검증 기준이 바뀝니다.',
  },
  {
    name: 'API_KEY',
    location: '서버간 호출용 X-API-Key 인증',
    secret: '예',
    billing: '없음',
    impact: '교체하면 외부 자동화 스크립트나 봇이 헤더 값을 같이 바꾸기 전까지 인증 실패가 납니다.',
  },
  {
    name: 'NOTION_TOKEN',
    location: '프로젝트/업무/체크리스트/일정/상영/회의록 Notion API 전체',
    secret: '예',
    billing: '직접 과금 없음',
    impact: '교체 후 권한이 부족하면 대부분의 데이터 조회/수정이 동시에 멈춥니다.',
  },
  {
    name: 'ASSEMBLYAI_API_KEY',
    location: '회의록 음성 전사 생성, transcript 조회',
    secret: '예',
    billing: '있음',
    impact: '교체하면 회의록 새 전사 생성과 전사 상세 동기화가 실패할 수 있습니다.',
  },
  {
    name: 'ASSEMBLYAI_WEBHOOK_SECRET',
    location: 'AssemblyAI webhook 검증',
    secret: '예',
    billing: '없음',
    impact: '교체 시 AssemblyAI 쪽 webhook secret도 같이 바꾸지 않으면 webhook이 거절됩니다.',
  },
  {
    name: 'OPENAI_API_KEY',
    location: '회의록 publish 시 요약 생성',
    secret: '예',
    billing: '있음',
    impact: '교체하거나 제거하면 회의록 본문 publish는 가능해도 요약 생성/재시도가 실패하거나 비활성화됩니다.',
  },
  {
    name: 'LINE_CHANNEL_ACCESS_TOKEN',
    location: 'LINE 리마인더 push 발송',
    secret: '예',
    billing: '플랜 의존',
    impact: '교체가 틀리면 아침/저녁 LINE 알림 발송이 멈춥니다.',
  },
  {
    name: 'LINE_CHANNEL_SECRET',
    location: 'LINE webhook 서명 검증',
    secret: '예',
    billing: '없음',
    impact: '교체 시 LINE Developers 설정과 맞지 않으면 webhook 검증 실패가 납니다.',
  },
  {
    name: 'R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY',
    location: '회의록 음성파일 R2 presigned URL 생성',
    secret: '부분',
    billing: '있음',
    impact: '교체가 어긋나면 오디오 업로드/다운로드 URL 발급이 깨져 STT 파이프라인이 막힙니다.',
  },
  {
    name: 'CLOUDFLARE_API_TOKEN',
    location: 'Wrangler 수동 배포/복구',
    secret: '예',
    billing: '없음',
    impact: '없으면 배포 CLI만 막히고, 이미 떠 있는 서비스 런타임에는 직접 영향이 없습니다.',
  },
]

export const GUIDE_DB_ROWS: GuideConfigRow[] = [
  {
    name: 'NOTION_PROJECT_DB_ID',
    location: '프로젝트 탭, 전체 관계 기준 DB',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 프로젝트 목록과 관계 기준이 함께 바뀌어 다른 탭의 연결 해석도 흔들릴 수 있습니다.',
  },
  {
    name: 'NOTION_TASK_DB_ID',
    location: '업무 탭, 체크리스트 할당/상영 연계',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 업무 조회/수정이 끊기고 체크리스트 연동도 같이 깨질 수 있습니다.',
  },
  {
    name: 'NOTION_CHECKLIST_DB_ID',
    location: '행사 체크리스트 탭',
    secret: '아니오',
    billing: '없음',
    impact: '비우거나 오입력하면 체크리스트 항목 로딩이 비어 보입니다.',
  },
  {
    name: 'NOTION_CHECKLIST_ASSIGNMENT_DB_ID',
    location: '행사-체크리스트 할당 매트릭스 동기화',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 체크리스트의 할당/미할당/해당없음 저장 위치가 달라져 기존 기록이 안 보일 수 있습니다.',
  },
  {
    name: 'NOTION_SCHEDULE_DB_ID',
    location: '일정 탭',
    secret: '아니오',
    billing: '없음',
    impact: '비우거나 잘못 넣으면 일정 탭이 비활성화되거나 다른 DB를 읽습니다.',
  },
  {
    name: 'NOTION_SCREENING_HISTORY_DB_ID',
    location: '상영 기록 탭',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 상영 히스토리 원본이 바뀌고, 상영 준비 히스토리 반영 기준도 함께 달라집니다.',
  },
  {
    name: 'NOTION_SCREENING_PLAN_DB_ID',
    location: '상영 준비 탭',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 상영 준비 작업판이 다른 DB를 바라보고 히스토리 반영 대상도 바뀝니다.',
  },
  {
    name: 'NOTION_EVENT_GRAPHICS_TIMETABLE_DB_ID',
    location: '타임테이블 탭',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 cue별 그래픽 상태 화면이 다른 타임테이블 DB를 읽습니다.',
  },
  {
    name: 'NOTION_PHOTO_GUIDE_DB_ID',
    location: '촬영가이드 탭',
    secret: '아니오',
    billing: '없음',
    impact: '바꾸면 촬영가이드 내부 화면과 외부 공유 페이지가 다른 Notion DB를 읽습니다.',
  },
  {
    name: 'NOTION_MEETING_DB_ID',
    location: '회의록 Notion 저장 대상',
    secret: '아니오',
    billing: '없음',
    impact: '교체하면 publish 결과가 다른 회의록 DB에 쌓입니다.',
  },
]

export const DEFAULT_FILTERS: Filters = {
  projectId: '',
  status: '',
  q: '',
}

export const DEFAULT_TASK_VIEW_FILTERS: TaskViewFilters = {
  workType: '',
  assignee: '',
  requester: '',
  dueFrom: '',
  dueTo: '',
  urgentOnly: false,
  hideDone: false,
}
