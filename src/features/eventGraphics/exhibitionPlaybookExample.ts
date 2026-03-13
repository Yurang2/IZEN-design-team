export type ExhibitionPlaybookRow = {
  id: string
  order: number
  numberLabel: string
  category: string
  trigger: string
  timeReference: string
  mainScreen: string
  audio: string
  action: string
  note: string
  status: string
  previewHref: string | null
  assetHref: string | null
  source: 'sample' | 'db'
}

export type ExhibitionSchemaField = {
  name: string
  type: string
  required: boolean
  description: string
}

export const exhibitionPlaybookExampleRows: ExhibitionPlaybookRow[] = [
  {
    id: 'sample-regular-operation',
    order: 1,
    numberLabel: '01',
    category: 'Regular Operation',
    trigger: 'Booth opening ~ before & after seminar',
    timeReference: '상시 루프 운영',
    mainScreen:
      'Digital promotional video / Fixture highlight video / Clinical video 1~7 / Company introduction video A, B / Event recap video',
    audio: '영상 내장 오디오 또는 현장 BGM',
    action: 'Loop',
    note: '세미나가 시작되기 전후에는 부스 메인 스크린을 루프 영상 상태로 유지합니다.',
    status: 'sample',
    previewHref: null,
    assetHref: null,
    source: 'sample',
  },
  {
    id: 'sample-seminar-soon',
    order: 2,
    numberLabel: '02',
    category: 'Seminar Starting Soon',
    trigger: '세미나 시작 10분 전',
    timeReference: '10 minutes before seminar start',
    mainScreen: 'Speaker introduction graphics (Lecture title / Speaker name / Speaker profile)',
    audio: '전환용 안내 BGM 또는 무음',
    action: 'Play',
    note: '루프 영상을 끊고 세미나 시작 예고 그래픽으로 전환합니다.',
    status: 'sample',
    previewHref: null,
    assetHref: null,
    source: 'sample',
  },
  {
    id: 'sample-in-seminar',
    order: 3,
    numberLabel: '03',
    category: 'In Seminar',
    trigger: 'Start Speaker Presentation',
    timeReference: '연자 발표 시작 시',
    mainScreen: 'Speaker presentation (PPT) via BYOD or main control PC',
    audio: 'PPT / 연자 소스',
    action: 'Hold / Switch',
    note: '연자 소개 그래픽 Play 후 실제 발표 화면으로 Hold 또는 입력 전환합니다.',
    status: 'sample',
    previewHref: null,
    assetHref: null,
    source: 'sample',
  },
  {
    id: 'sample-lucky-draw',
    order: 4,
    numberLabel: '04',
    category: 'Lucky Draw',
    trigger: 'During the lucky draw session',
    timeReference: '이벤트 세션 중 수시 호출',
    mainScreen: 'Lucky draw graphics',
    audio: '행사 효과음 또는 별도 럭키드로우 BGM',
    action: 'Play',
    note: '행사 진행자의 큐에 맞춰 럭키드로우 전용 그래픽으로 즉시 전환합니다.',
    status: 'sample',
    previewHref: null,
    assetHref: null,
    source: 'sample',
  },
]

export const exhibitionSchemaFields: ExhibitionSchemaField[] = [
  {
    name: '타임테이블 유형',
    type: 'select',
    required: true,
    description: '`자체행사` 또는 `전시회`를 구분하는 최상위 필드',
  },
  {
    name: '운영 순서',
    type: 'number',
    required: true,
    description: '전시회 운영표 내 정렬 순서',
  },
  {
    name: '카테고리',
    type: 'select',
    required: true,
    description: '예: `Regular Operation`, `Seminar Starting Soon`, `In Seminar`, `Lucky Draw`',
  },
  {
    name: '트리거 상황',
    type: 'rich_text',
    required: true,
    description: '무슨 상황이 되면 해당 화면으로 바꾸는지 설명',
  },
  {
    name: '시간 기준',
    type: 'rich_text',
    required: false,
    description: '예: `10 minutes before seminar start`, `상시 루프 운영`',
  },
  {
    name: '메인 화면',
    type: 'rich_text',
    required: true,
    description: '메인 스크린에 실제로 송출할 그래픽, 영상, PPT 소스',
  },
  {
    name: '오디오',
    type: 'rich_text',
    required: false,
    description: '함께 송출하거나 참고해야 할 오디오 소스',
  },
  {
    name: '운영 액션',
    type: 'select',
    required: true,
    description: '`Loop`, `Play`, `Hold`, `Switch` 같은 오퍼레이션 지시',
  },
  {
    name: '운영 메모',
    type: 'rich_text',
    required: false,
    description: '현장 오퍼레이터가 알아야 할 전환 규칙과 예외사항',
  },
  {
    name: '미리보기 링크',
    type: 'url',
    required: false,
    description: '그래픽 썸네일이나 참고 프리뷰 링크',
  },
  {
    name: '자산 링크',
    type: 'url',
    required: false,
    description: '구글드라이브나 전달용 폴더 링크',
  },
  {
    name: '상태',
    type: 'select',
    required: true,
    description: '`planned`, `ready`, `shared`, `changed_on_site` 같은 진행 상태',
  },
]
