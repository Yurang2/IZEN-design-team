type MockApiSchemaField = {
  key: string
  expectedName: string
  expectedTypes: string[]
  actualName: string
  actualType: string
  status: 'exact' | 'fallback' | 'missing' | 'mismatch'
  optional?: boolean
  options: string[]
}

type MockApiSchemaSummary = {
  fields: Record<string, MockApiSchemaField>
  unknownFields: MockApiSchemaField[]
  projectBindingMode: 'relation' | 'select' | 'unknown'
}

type MockProject = {
  id: string
  key: string
  bindingValue: string
  name: string
  eventDate?: string
  iconEmoji?: string
  source: 'project_db' | 'task_select'
}

type MockTask = {
  id: string
  url: string
  projectKey: string
  projectName: string
  projectSource: 'relation' | 'select' | 'unknown'
  requester: string[]
  workType: string
  taskName: string
  status: string
  assignee: string[]
  startDate?: string
  dueDate?: string
  detail: string
  priority?: string
  urgent?: boolean
  issue?: string
}

type MockChecklistItem = {
  id: string
  productName: string
  workCategory: string
  finalDueText: string
  eventCategories: string[]
  designLeadDays?: number
  productionLeadDays?: number
  bufferDays?: number
  totalLeadDays?: number
  computedDueDate?: string
}

type MockAssignmentLog = {
  id: number
  key: string
  projectId: string
  eventCategory: string
  itemId: string
  previousTaskId: string | null
  taskId: string | null
  action: string
  actor: string | null
  ip: string | null
  userAgent: string | null
  createdAt: number
}

type MockScheduleColumn = {
  id: string
  name: string
  type: string
}

type MockScheduleRow = {
  id: string
  url: string | null
  cells: Array<{
    columnId: string
    type: string
    text: string
    href?: string | null
  }>
}

const CACHE_TTL_MS = 60_000

const PROJECTS: MockProject[] = [
  {
    id: '30aff6bd-ba96-81ac-af95-d55ea17958a5',
    key: '30aff6bd-ba96-81ac-af95-d55ea17958a5',
    bindingValue: '30aff6bd-ba96-81ac-af95-d55ea17958a5',
    name: '2026 IZEN X PNU IMPLANT MASTERCLASS',
    eventDate: '2026-10-23',
    iconEmoji: '🦷',
    source: 'project_db',
  },
  {
    id: '30aff6bd-ba96-81f4-8294-ede894e4df64',
    key: '30aff6bd-ba96-81f4-8294-ede894e4df64',
    bindingValue: '30aff6bd-ba96-81f4-8294-ede894e4df64',
    name: 'AEEDC 2026',
    eventDate: '2026-02-12',
    iconEmoji: '🌍',
    source: 'project_db',
  },
  {
    id: '30aff6bd-ba96-81ff-97bf-fd23321ea03f',
    key: '30aff6bd-ba96-81ff-97bf-fd23321ea03f',
    bindingValue: '30aff6bd-ba96-81ff-97bf-fd23321ea03f',
    name: '국문 홈페이지 제작',
    eventDate: '2026-05-31',
    iconEmoji: '🖥️',
    source: 'project_db',
  },
]

const TASK_SCHEMA: MockApiSchemaSummary = {
  projectBindingMode: 'relation',
  unknownFields: [],
  fields: {
    projectRelation: {
      key: 'projectRelation',
      expectedName: '귀속 프로젝트',
      expectedTypes: ['relation'],
      actualName: '귀속 프로젝트',
      actualType: 'relation',
      status: 'exact',
      optional: false,
      options: [],
    },
    projectSelect: {
      key: 'projectSelect',
      expectedName: '프로젝트',
      expectedTypes: ['select'],
      actualName: '프로젝트',
      actualType: 'select',
      status: 'fallback',
      optional: true,
      options: PROJECTS.map((project) => project.name),
    },
    taskName: {
      key: 'taskName',
      expectedName: '업무',
      expectedTypes: ['title'],
      actualName: '업무',
      actualType: 'title',
      status: 'exact',
      optional: false,
      options: [],
    },
    workType: {
      key: 'workType',
      expectedName: '업무구분',
      expectedTypes: ['select'],
      actualName: '업무구분',
      actualType: 'select',
      status: 'exact',
      optional: false,
      options: ['포스터(1p)', '부스 그래픽 디자인', '영상 편집', '홈페이지 업데이트', '브로슈어(6~24p)'],
    },
    status: {
      key: 'status',
      expectedName: '상태',
      expectedTypes: ['status'],
      actualName: '상태',
      actualType: 'status',
      status: 'exact',
      optional: false,
      options: ['시작전', '보류', '진행중', '검토중', '수정중', '완료', '보관'],
    },
    assignee: {
      key: 'assignee',
      expectedName: '담당자',
      expectedTypes: ['multi_select'],
      actualName: '담당자',
      actualType: 'multi_select',
      status: 'exact',
      optional: false,
      options: ['김지은', '강수민', '정현지', '이다경'],
    },
    startDate: {
      key: 'startDate',
      expectedName: '접수일',
      expectedTypes: ['date'],
      actualName: '접수일',
      actualType: 'date',
      status: 'exact',
      optional: false,
      options: [],
    },
    dueDate: {
      key: 'dueDate',
      expectedName: '마감일',
      expectedTypes: ['date'],
      actualName: '마감일',
      actualType: 'date',
      status: 'exact',
      optional: false,
      options: [],
    },
    detail: {
      key: 'detail',
      expectedName: '업무상세',
      expectedTypes: ['rich_text'],
      actualName: '업무상세',
      actualType: 'rich_text',
      status: 'exact',
      optional: false,
      options: [],
    },
    requester: {
      key: 'requester',
      expectedName: '요청주체',
      expectedTypes: ['multi_select'],
      actualName: '요청주체',
      actualType: 'multi_select',
      status: 'exact',
      optional: true,
      options: ['디자인팀', '대표님', '마케팅팀', '영업1팀'],
    },
    priority: {
      key: 'priority',
      expectedName: '우선순위',
      expectedTypes: ['select'],
      actualName: '우선순위',
      actualType: 'select',
      status: 'exact',
      optional: true,
      options: ['낮음', '중간', '높음'],
    },
    urgent: {
      key: 'urgent',
      expectedName: '긴급',
      expectedTypes: ['checkbox'],
      actualName: '긴급',
      actualType: 'checkbox',
      status: 'exact',
      optional: true,
      options: [],
    },
    issue: {
      key: 'issue',
      expectedName: '이슈',
      expectedTypes: ['rich_text'],
      actualName: '이슈',
      actualType: 'rich_text',
      status: 'exact',
      optional: true,
      options: [],
    },
  },
}

const CHECKLIST_ITEMS: MockChecklistItem[] = [
  {
    id: '2eec1cc7-ec27-8002-8a3f-c9f66f0dcea9',
    productName: '부스 형태 디자인',
    workCategory: '부스',
    finalDueText: '행사 시작 5주 전',
    eventCategories: ['이젠 자체 행사(해외)', '딜러 행사 및 전시회'],
    designLeadDays: 35,
    productionLeadDays: 10,
    bufferDays: 2,
  },
  {
    id: '2eec1cc7-ec27-8002-8a3f-c9f66f0dcea1',
    productName: '부스 그래픽 디자인',
    workCategory: '부스',
    finalDueText: '행사 시작 3주 전',
    eventCategories: ['이젠 자체 행사(해외)', '국내 행사'],
    designLeadDays: 15,
    productionLeadDays: 5,
    bufferDays: 2,
  },
  {
    id: '2eec1cc7-ec27-8002-8a3f-c9f66f0dcea2',
    productName: '행사 포스터',
    workCategory: '인쇄물',
    finalDueText: '행사 시작 1주 전',
    eventCategories: ['국내 행사', '딜러 제작'],
    designLeadDays: 7,
    productionLeadDays: 3,
    bufferDays: 1,
  },
]

const SCHEDULE_COLUMNS: MockScheduleColumn[] = [
  { id: 'title', name: '일정명', type: 'title' },
  { id: 'date', name: '일정', type: 'date' },
  { id: 'owner', name: '담당', type: 'people' },
  { id: 'status', name: '상태', type: 'status' },
  { id: 'notes', name: '메모', type: 'rich_text' },
]

const SCHEDULE_ROWS: MockScheduleRow[] = [
  {
    id: 'mock-schedule-1',
    url: 'https://www.notion.so/mock-schedule-1',
    cells: [
      { columnId: 'title', type: 'title', text: 'AEEDC 운영 킥오프' },
      { columnId: 'date', type: 'date', text: '2026-03-18' },
      { columnId: 'owner', type: 'people', text: '김지연' },
      { columnId: 'status', type: 'status', text: '예정' },
      { columnId: 'notes', type: 'rich_text', text: '부스 운영 체크리스트 리뷰' },
    ],
  },
  {
    id: 'mock-schedule-2',
    url: 'https://www.notion.so/mock-schedule-2',
    cells: [
      { columnId: 'title', type: 'title', text: '중동 전시 운송 확정' },
      { columnId: 'date', type: 'date', text: '2026-03-22 -> 2026-03-24' },
      { columnId: 'owner', type: 'people', text: '강수미' },
      { columnId: 'status', type: 'status', text: '진행중' },
      { columnId: 'notes', type: 'rich_text', text: '포워더 최종 회신 대기' },
    ],
  },
]

const INITIAL_TASKS: MockTask[] = [
  {
    id: '302c1cc7-ec27-80ac-835b-e415980ba950',
    url: 'https://www.notion.so/302c1cc7ec2780ac835be415980ba950',
    projectKey: PROJECTS[0].id,
    projectName: PROJECTS[0].name,
    projectSource: 'relation',
    requester: ['디자인팀'],
    workType: '부스 그래픽 디자인',
    taskName: '메인 키비주얼 1차안',
    status: '진행중',
    assignee: ['정현지'],
    startDate: '2026-08-01',
    dueDate: '2026-08-18',
    detail: '행사 메인 시안 제작 및 컬러 룩앤필 확정',
    priority: '높음',
    urgent: true,
    issue: '',
  },
  {
    id: '302c1cc7-ec27-80ac-835b-e415980ba951',
    url: 'https://www.notion.so/302c1cc7ec2780ac835be415980ba951',
    projectKey: PROJECTS[0].id,
    projectName: PROJECTS[0].name,
    projectSource: 'relation',
    requester: ['마케팅팀'],
    workType: '브로슈어(6~24p)',
    taskName: '마스터클래스 브로슈어 국문판',
    status: '검토중',
    assignee: ['김지은'],
    startDate: '2026-08-03',
    dueDate: '2026-08-20',
    detail: '내부 검토 반영 후 2차 PDF 배포',
    priority: '중간',
    urgent: false,
    issue: '표지 이미지 라이선스 확인 필요',
  },
  {
    id: '302c1cc7-ec27-80ac-835b-e415980ba952',
    url: 'https://www.notion.so/302c1cc7ec2780ac835be415980ba952',
    projectKey: PROJECTS[1].id,
    projectName: PROJECTS[1].name,
    projectSource: 'relation',
    requester: ['대표님'],
    workType: '포스터(1p)',
    taskName: 'AEEDC 글로벌 포스터',
    status: '시작전',
    assignee: ['강수민'],
    startDate: '2026-01-03',
    dueDate: '2026-01-10',
    detail: '영문 카피 확정 후 시안 시작',
    priority: '높음',
    urgent: false,
    issue: '',
  },
]

type MockStore = {
  tasks: MockTask[]
  assignments: Record<string, string>
  logs: MockAssignmentLog[]
  nextTaskNumber: number
  nextLogId: number
}

const store: MockStore = {
  tasks: deepCopy(INITIAL_TASKS),
  assignments: {
    '30aff6bdba9681acaf95d55ea17958a5::이젠 자체 행사(해외)::2eec1cc7-ec27-8002-8a3f-c9f66f0dcea9': INITIAL_TASKS[0].id,
  },
  logs: [
    {
      id: 1,
      key: '30aff6bdba9681acaf95d55ea17958a5::이젠 자체 행사(해외)::2eec1cc7-ec27-8002-8a3f-c9f66f0dcea9',
      projectId: '30aff6bdba9681acaf95d55ea17958a5',
      eventCategory: '이젠 자체 행사(해외)',
      itemId: '2eec1cc7-ec27-8002-8a3f-c9f66f0dcea9',
      previousTaskId: null,
      taskId: INITIAL_TASKS[0].id,
      action: 'assign',
      actor: 'mock',
      ip: '-',
      userAgent: 'mock',
      createdAt: Date.now() - 3_600_000,
    },
  ],
  nextTaskNumber: 100,
  nextLogId: 2,
}

function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function parseJsonBody(init?: RequestInit): Record<string, unknown> {
  const raw = typeof init?.body === 'string' ? init.body : '{}'
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseIso(value: string | undefined): Date | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return Number.isNaN(date.getTime()) ? null : date
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function normalizeNotionId(value: string | undefined | null): string {
  return (value ?? '').replace(/-/g, '').toLowerCase().trim()
}

function assignmentKey(eventCategory: string | undefined, itemId: string, projectId?: string): string {
  const projectKey = normalizeNotionId(projectId) || 'all_project'
  const category = (eventCategory ?? '').trim() || 'ALL'
  return `${projectKey}::${category}::${itemId}`
}

function checklistPreview(params: URLSearchParams): MockChecklistItem[] {
  const eventCategory = asString(params.get('eventCategory')) ?? ''
  const eventDate = asString(params.get('eventDate'))
  const date = parseIso(eventDate)

  return CHECKLIST_ITEMS
    .filter((item) => (!eventCategory ? true : item.eventCategories.includes(eventCategory)))
    .map((item) => {
      const lead = (item.designLeadDays ?? 0) + (item.productionLeadDays ?? 0) + (item.bufferDays ?? 0)
      const computedDueDate = date ? toIso(addDays(date, -lead)) : undefined
      return {
        ...item,
        totalLeadDays: lead,
        computedDueDate,
      }
    })
}

function paginateTasks(tasks: MockTask[], params: URLSearchParams): { tasks: MockTask[]; nextCursor?: string; hasMore: boolean } {
  const cursor = Number(params.get('cursor') ?? '0')
  const pageSize = Number(params.get('pageSize') ?? '50')
  const safeCursor = Number.isFinite(cursor) ? Math.max(0, Math.floor(cursor)) : 0
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.min(100, Math.floor(pageSize))) : 50
  const slice = tasks.slice(safeCursor, safeCursor + safePageSize)
  const next = safeCursor + safePageSize
  return {
    tasks: slice,
    hasMore: next < tasks.length,
    nextCursor: next < tasks.length ? String(next) : undefined,
  }
}

function filterTasks(params: URLSearchParams): MockTask[] {
  const projectId = normalizeNotionId(params.get('projectId'))
  const status = asString(params.get('status'))
  const q = (asString(params.get('q')) ?? '').toLowerCase()

  return store.tasks.filter((task) => {
    if (projectId) {
      const key = normalizeNotionId(task.projectKey)
      if (key !== projectId) return false
    }
    if (status && task.status !== status) return false
    if (q) {
      const source = `${task.taskName} ${task.detail} ${task.projectName} ${task.workType} ${task.status} ${task.assignee.join(' ')} ${task.requester.join(' ')}`.toLowerCase()
      if (!source.includes(q)) return false
    }
    return true
  })
}

function projectNameById(projectId: string | undefined): string | undefined {
  const normalized = normalizeNotionId(projectId)
  return PROJECTS.find((project) => normalizeNotionId(project.id) === normalized)?.name
}

function nowMs(): number {
  return Date.now()
}

function notFound(path: string): never {
  throw new Error(`HTTP 404: not_found (${path})`)
}

export async function mockApiRequest<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const [path, query = ''] = pathWithQuery.split('?')
  const params = new URLSearchParams(query)

  if (method === 'GET' && path === '/projects') {
    return {
      ok: true,
      projects: deepCopy(PROJECTS),
      schema: deepCopy(TASK_SCHEMA),
      cacheTtlMs: CACHE_TTL_MS,
    } as T
  }

  if (method === 'GET' && path === '/meta') {
    return {
      ok: true,
      databases: {
        project: { id: 'mock-project-db', url: 'https://www.notion.so/mock-project-db' },
        task: { id: 'mock-task-db', url: 'https://www.notion.so/mock-task-db' },
        checklist: { id: 'mock-checklist-db', url: 'https://www.notion.so/mock-checklist-db' },
        schedule: { id: 'mock-schedule-db', url: 'https://www.notion.so/mock-schedule-db' },
        reference: { id: 'mock-reference-db', url: 'https://www.notion.so/mock-reference-db' },
        storyboard: { id: 'mock-storyboard-db', url: 'https://www.notion.so/mock-storyboard-db' },
      },
    } as T
  }

  if (method === 'GET' && path === '/schedule') {
    return {
      ok: true,
      configured: true,
      database: {
        id: 'mock-schedule-db',
        url: 'https://www.notion.so/mock-schedule-db',
        title: 'Mock Schedule',
      },
      columns: deepCopy(SCHEDULE_COLUMNS),
      rows: deepCopy(SCHEDULE_ROWS),
      cacheTtlMs: CACHE_TTL_MS,
    } as T
  }

  if (method === 'GET' && path === '/tasks') {
    const filtered = filterTasks(params)
    const paged = paginateTasks(filtered, params)
    return {
      ok: true,
      tasks: deepCopy(paged.tasks),
      nextCursor: paged.nextCursor,
      hasMore: paged.hasMore,
      schema: deepCopy(TASK_SCHEMA),
      cacheTtlMs: CACHE_TTL_MS,
    } as T
  }

  const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
  if (method === 'GET' && taskMatch) {
    const id = decodeURIComponent(taskMatch[1])
    const task = store.tasks.find((entry) => entry.id === id)
    if (!task) notFound(path)
    return {
      ok: true,
      task: deepCopy(task),
      schema: deepCopy(TASK_SCHEMA),
      cacheTtlMs: CACHE_TTL_MS,
    } as T
  }

  if (method === 'POST' && path === '/tasks') {
    const body = parseJsonBody(init)
    const taskName = asString(body.taskName)
    if (!taskName) throw new Error('taskName_required')

    const projectId = asString(body.projectId)
    const projectName = asString(body.projectName) ?? projectNameById(projectId) ?? '미분류 프로젝트'
    const id = `mock-task-${store.nextTaskNumber++}`
    const task: MockTask = {
      id,
      url: `https://www.notion.so/${id}`,
      projectKey: projectId ?? projectName,
      projectName,
      projectSource: 'relation',
      requester: Array.isArray(body.requester) ? body.requester.filter((entry): entry is string => typeof entry === 'string') : ['디자인팀'],
      workType: asString(body.workType) ?? '',
      taskName,
      status: asString(body.status) ?? '시작전',
      assignee: Array.isArray(body.assignee) ? body.assignee.filter((entry): entry is string => typeof entry === 'string') : [],
      startDate: asString(body.startDate),
      dueDate: asString(body.dueDate),
      detail: asString(body.detail) ?? '',
      priority: asString(body.priority),
      urgent: typeof body.urgent === 'boolean' ? body.urgent : false,
      issue: asString(body.issue),
    }
    store.tasks.unshift(task)
    return {
      ok: true,
      task: deepCopy(task),
      schema: deepCopy(TASK_SCHEMA),
    } as T
  }

  if (method === 'PATCH' && taskMatch) {
    const id = decodeURIComponent(taskMatch[1])
    const task = store.tasks.find((entry) => entry.id === id)
    if (!task) notFound(path)
    const body = parseJsonBody(init)

    if (asString(body.taskName)) task.taskName = asString(body.taskName) as string
    if (asString(body.projectId)) task.projectKey = asString(body.projectId) as string
    if (asString(body.projectName)) task.projectName = asString(body.projectName) as string
    if (asString(body.status)) task.status = asString(body.status) as string
    if (asString(body.workType) !== undefined) task.workType = asString(body.workType) ?? ''
    if (asString(body.startDate) !== undefined) task.startDate = asString(body.startDate)
    if (asString(body.dueDate) !== undefined) task.dueDate = asString(body.dueDate)
    if (asString(body.detail) !== undefined) task.detail = asString(body.detail) ?? ''
    if (asString(body.priority) !== undefined) task.priority = asString(body.priority)
    if (asString(body.issue) !== undefined) task.issue = asString(body.issue)
    if (typeof body.urgent === 'boolean') task.urgent = body.urgent

    if (Array.isArray(body.assignee)) {
      task.assignee = body.assignee.filter((entry): entry is string => typeof entry === 'string')
    }
    if (Array.isArray(body.requester)) {
      task.requester = body.requester.filter((entry): entry is string => typeof entry === 'string')
    }

    return {
      ok: true,
      task: deepCopy(task),
      schema: deepCopy(TASK_SCHEMA),
    } as T
  }

  if (method === 'GET' && path === '/checklists') {
    const items = checklistPreview(params)
    const categories = Array.from(new Set(CHECKLIST_ITEMS.flatMap((item) => item.eventCategories))).sort((a, b) =>
      a.localeCompare(b, 'ko'),
    )
    return {
      ok: true,
      eventName: asString(params.get('eventName')) ?? '',
      eventCategory: asString(params.get('eventCategory')) ?? '',
      availableCategories: categories,
      count: items.length,
      items: deepCopy(items),
      cacheTtlMs: CACHE_TTL_MS,
    } as T
  }

  if (method === 'GET' && path === '/checklist-assignments') {
    return {
      ok: true,
      assignments: deepCopy(store.assignments),
      storageMode: 'd1',
    } as T
  }

  if (method === 'POST' && path === '/checklist-assignments') {
    const body = parseJsonBody(init)
    const itemId = asString(body.itemId)
    if (!itemId) throw new Error('itemId_required')
    const projectId = asString(body.projectId)
    const eventCategory = asString(body.eventCategory)
    const taskId = asString(body.taskId)
    const key = assignmentKey(eventCategory, itemId, projectId)
    const previousTaskId = store.assignments[key] ?? null

    if (taskId) store.assignments[key] = taskId
    else delete store.assignments[key]

    store.logs.unshift({
      id: store.nextLogId++,
      key,
      projectId: normalizeNotionId(projectId),
      eventCategory: eventCategory ?? '',
      itemId,
      previousTaskId,
      taskId: taskId ?? null,
      action: taskId ? (previousTaskId ? 'reassign' : 'assign') : 'unassign',
      actor: 'mock',
      ip: '-',
      userAgent: 'mock',
      createdAt: nowMs(),
    })

    return {
      ok: true,
      key,
      taskId: taskId ?? null,
      assignments: deepCopy(store.assignments),
      storageMode: 'd1',
    } as T
  }

  if (method === 'GET' && path === '/checklist-assignment-logs') {
    const limitRaw = Number(params.get('limit') ?? '100')
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 100
    return {
      ok: true,
      storageMode: 'd1',
      logs: deepCopy(store.logs.slice(0, limit)),
    } as T
  }

  if (method === 'GET' && path === '/checklist-assignments/export') {
    const limitRaw = Number(params.get('logLimit') ?? '5000')
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(5000, Math.floor(limitRaw))) : 5000
    const logs = store.logs.slice(0, limit)
    return {
      ok: true,
      exportedAt: new Date().toISOString(),
      storageMode: 'd1',
      counts: {
        assignments: Object.keys(store.assignments).length,
        logs: logs.length,
      },
      limits: {
        logLimit: limit,
      },
      assignments: deepCopy(store.assignments),
      logs: deepCopy(logs),
    } as T
  }

  notFound(path)
}
