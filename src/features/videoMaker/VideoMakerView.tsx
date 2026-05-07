import { useMemo, useState, type ChangeEvent } from 'react'
import { Button } from '../../shared/ui'
import { useLocalStorage } from '../../shared/hooks/useLocalStorage'
import './VideoMakerView.css'

type CopyOptions = {
  successMessage?: string
  emptyMessage?: string
}

type VideoMakerViewProps = {
  onCopy: (text: string, options?: CopyOptions) => Promise<void>
}

type VideoMode = 'autopilot' | 'manual'
type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5'
type CutSpeed = 'fast' | 'balanced' | 'slow'
type VideoLength = '30s' | '60s' | '90s' | 'custom'
type VoiceSpeed = 'normal' | 'fast' | 'calm'
type ProjectStatus = 'draft' | 'script' | 'scenes' | 'editing' | 'done'

type MakerSettings = {
  aspectRatio: AspectRatio
  cutSpeed: CutSpeed
  length: VideoLength
  customSeconds: number
  voice: string
  voiceSpeed: VoiceSpeed
  imageCharacter: string
  videoCharacter: string
  subtitleEnabled: boolean
  subtitleStyle: string
  bgmStyle: string
  useLogoEnding: boolean
  language: string
}

type ProjectForm = {
  title: string
  topic: string
  audience: string
  goal: string
  source: string
  cta: string
  formatKey: string
  toneKey: string
  status: ProjectStatus
}

type VideoProject = ProjectForm & {
  id: string
  createdAt: string
  updatedAt: string
  settings: MakerSettings
}

type VideoFormat = {
  key: string
  label: string
  category: string
  description: string
  defaultGoal: string
  hook: string
  scenePattern: string[]
  thumbnail: string
  tags: string[]
}

type TonePreset = {
  key: string
  label: string
  description: string
  opener: string
  lineStyle: string
}

type ScenePlan = {
  time: string
  title: string
  narration: string
  visualPrompt: string
  subtitle: string
}

const SETTINGS_STORAGE_KEY = 'izen_video_maker_settings_v1'
const PROJECTS_STORAGE_KEY = 'izen_video_maker_projects_v1'

const DEFAULT_SETTINGS: MakerSettings = {
  aspectRatio: '9:16',
  cutSpeed: 'fast',
  length: '30s',
  customSeconds: 60,
  voice: 'IZEN Korean Narrator',
  voiceSpeed: 'normal',
  imageCharacter: 'IZEN clean product visual',
  videoCharacter: 'No fixed character',
  subtitleEnabled: true,
  subtitleStyle: 'YouTube bold white / black stroke',
  bgmStyle: 'Clean corporate pulse',
  useLogoEnding: true,
  language: 'Korean + key English terms',
}

const EMPTY_FORM: ProjectForm = {
  title: '',
  topic: '',
  audience: '치과의사, 딜러, 전시 방문객',
  goal: '',
  source: '',
  cta: '상담 및 미팅 문의는 IZEN IMPLANT로 연락해주세요.',
  formatKey: 'event-recap-shorts',
  toneKey: 'professional-clear',
  status: 'draft',
}

const VIDEO_FORMATS: VideoFormat[] = [
  {
    key: 'event-recap-shorts',
    label: '행사 리캡 쇼츠',
    category: 'IZEN Event',
    description: '전시·세미나 현장감을 30~60초 쇼츠로 빠르게 정리합니다.',
    defaultGoal: '현장 열기와 브랜드 신뢰를 짧게 전달',
    hook: '오늘 IZEN 부스에서 가장 많이 멈춰 선 순간은 이것이었습니다.',
    scenePattern: ['현장 와이드', '부스/로고', '핵심 제품', '상담 장면', '방문객 반응', '마무리 CTA'],
    thumbnail: 'IZEN in [Country] / 현장 대표 컷 / 날짜',
    tags: ['event', 'recap', 'shorts', 'izenimplant'],
  },
  {
    key: 'product-showcase',
    label: '제품 소개',
    category: 'Product',
    description: 'ZENEX, 임플란트 라인업, 키트 등 제품 장점을 장면별로 설명합니다.',
    defaultGoal: '제품의 차별점과 사용 맥락을 명확히 전달',
    hook: '이 제품은 단순한 구성품이 아니라, 술자의 흐름을 줄여주는 도구입니다.',
    scenePattern: ['제품 히어로', '문제 제기', '핵심 장점 1', '핵심 장점 2', '사용 장면', '문의 CTA'],
    thumbnail: '제품명 + 핵심 베네핏 3~5단어',
    tags: ['product', 'implant', 'zenex', 'dental'],
  },
  {
    key: 'clinical-education',
    label: '임상/교육 콘텐츠',
    category: 'Education',
    description: '치과의사 대상 교육형 영상으로 단계와 주의점을 차분하게 구성합니다.',
    defaultGoal: '전문성을 해치지 않으면서 이해하기 쉽게 교육',
    hook: '임플란트 술식에서 놓치기 쉬운 기준을 짧게 정리했습니다.',
    scenePattern: ['질문 제시', '기준 설명', '단계 1', '단계 2', '주의점', '요약'],
    thumbnail: '임상 키워드 + Before/After형 구도',
    tags: ['education', 'clinical', 'dentistry', 'implantology'],
  },
  {
    key: 'doctor-interview',
    label: '치과의사 인터뷰',
    category: 'People',
    description: '인터뷰/후기 원본을 신뢰도 높은 스토리형 영상으로 재구성합니다.',
    defaultGoal: '사용자 경험과 신뢰 포인트를 사람 중심으로 전달',
    hook: '실제 임상 현장에서는 어떤 점이 가장 중요했을까요?',
    scenePattern: ['인물 소개', '문제 상황', '선택 이유', '사용 소감', '추천 포인트', '클로징'],
    thumbnail: '의사 인물 컷 + 짧은 인용문',
    tags: ['interview', 'testimonial', 'doctor', 'clinic'],
  },
  {
    key: 'seminar-summary',
    label: '세미나 요약',
    category: 'Education',
    description: '긴 세미나/강연을 핵심 메시지와 장면으로 압축합니다.',
    defaultGoal: '핵심 학습 포인트와 현장 분위기를 동시에 전달',
    hook: '이번 세미나에서 반복해서 나온 핵심은 한 가지였습니다.',
    scenePattern: ['강연장 분위기', '연자 소개', '핵심 메시지 1', '핵심 메시지 2', '참석자 장면', '다음 일정 안내'],
    thumbnail: 'Seminar Highlights + 장소/일자',
    tags: ['seminar', 'education', 'highlights', 'dental'],
  },
  {
    key: 'ad-shorts',
    label: '광고형 쇼츠',
    category: 'Ads',
    description: '초반 후킹과 빠른 컷으로 제품/행사 문의를 유도합니다.',
    defaultGoal: '짧은 시간 안에 관심과 문의 전환을 유도',
    hook: '아직도 임플란트 선택 기준을 가격만 보고 계신가요?',
    scenePattern: ['강한 질문', '문제 확대', '해결 제시', '증거 컷', '베네핏 정리', 'CTA'],
    thumbnail: '질문형 카피 + 강한 대비',
    tags: ['ads', 'shortform', 'conversion', 'dentalimplant'],
  },
  {
    key: 'news-info',
    label: '뉴스/정보형',
    category: 'Info',
    description: '산업 소식, 국가별 행사, 치과 트렌드를 정보형 유튜브로 정리합니다.',
    defaultGoal: '정보 신뢰도와 브랜드 전문성을 함께 구축',
    hook: '이번 치과 산업 뉴스에서 주목할 변화는 세 가지입니다.',
    scenePattern: ['뉴스 헤드라인', '배경 설명', '포인트 1', '포인트 2', 'IZEN 관점', '요약'],
    thumbnail: '키워드 2개 + 숫자 강조',
    tags: ['news', 'insight', 'dentalindustry', 'trend'],
  },
  {
    key: 'longform-youtube',
    label: '롱폼 유튜브',
    category: 'Longform',
    description: '3~8분 길이의 설명형/브랜드형 영상 기획 초안을 만듭니다.',
    defaultGoal: '검색 유입과 신뢰 형성을 위한 구조화된 설명',
    hook: '오늘은 이 주제를 처음 보는 분도 이해할 수 있게 처음부터 정리하겠습니다.',
    scenePattern: ['오프닝', '배경', '문제', '해결 구조', '사례', '정리', 'CTA'],
    thumbnail: '큰 키워드 + 보조 설명 + 제품/현장 컷',
    tags: ['youtube', 'longform', 'explainer', 'izenimplant'],
  },
]

const TONE_PRESETS: TonePreset[] = [
  {
    key: 'professional-clear',
    label: '전문적·명확',
    description: '브랜드 공식 계정에 맞는 차분한 설명톤',
    opener: '핵심만 명확하게 정리하겠습니다.',
    lineStyle: '짧은 문장, 과장 없는 표현, 전문 용어는 필요한 만큼만 사용',
  },
  {
    key: 'shorts-hook',
    label: '쇼츠 후킹형',
    description: '첫 3초 질문과 빠른 전개 중심',
    opener: '이 장면, 그냥 지나치면 놓칩니다.',
    lineStyle: '질문형 문장, 1문장 1메시지, 자막으로 읽히는 속도',
  },
  {
    key: 'premium-brand',
    label: '프리미엄 브랜드형',
    description: '고급스럽고 정돈된 브랜드 필름 톤',
    opener: '정밀함은 작은 디테일에서 시작됩니다.',
    lineStyle: '여백 있는 문장, 감성은 절제, 제품/현장 이미지 중심',
  },
  {
    key: 'friendly-social',
    label: '친근한 SNS형',
    description: '인스타/릴스에 맞는 가볍고 쉬운 톤',
    opener: '오늘 현장 분위기, 짧게 보여드릴게요.',
    lineStyle: '부드러운 구어체, 쉬운 단어, 밝은 마무리',
  },
]

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: '초안',
  script: '대본 완료',
  scenes: '장면 완료',
  editing: '편집 대기',
  done: '완료',
}

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value: value as ProjectStatus, label }))

const QUICK_TOPICS = [
  'SIDEX 부스 현장 스케치',
  '해외 전시 IZEN 방문객 리캡',
  'ZENEX 시스템 핵심 장점',
  '임플란트 수술 후 주의사항',
  '세미나 하이라이트 60초 요약',
]

function getFormat(key: string): VideoFormat {
  return VIDEO_FORMATS.find((format) => format.key === key) ?? VIDEO_FORMATS[0]
}

function getTone(key: string): TonePreset {
  return TONE_PRESETS.find((tone) => tone.key === key) ?? TONE_PRESETS[0]
}

function getTotalSeconds(settings: MakerSettings): number {
  if (settings.length === 'custom') return Math.max(10, Math.min(600, settings.customSeconds || 60))
  return Number(settings.length.replace('s', ''))
}

function getSceneCount(settings: MakerSettings): number {
  const seconds = getTotalSeconds(settings)
  if (settings.cutSpeed === 'fast') return Math.max(5, Math.min(14, Math.round(seconds / 5)))
  if (settings.cutSpeed === 'slow') return Math.max(4, Math.min(10, Math.round(seconds / 10)))
  return Math.max(5, Math.min(12, Math.round(seconds / 7)))
}

function buildTimeRange(index: number, totalScenes: number, totalSeconds: number): string {
  const start = Math.round((index / totalScenes) * totalSeconds)
  const end = Math.round(((index + 1) / totalScenes) * totalSeconds)
  return `0:${String(start).padStart(2, '0')}~0:${String(end).padStart(2, '0')}`
}

function normalizeTitle(value: string, topic: string): string {
  const trimmed = value.trim()
  if (trimmed) return trimmed
  const fallback = topic.trim()
  return fallback ? `${fallback} 영상` : '새 IZEN 영상 프로젝트'
}

function buildScenes(project: ProjectForm, settings: MakerSettings): ScenePlan[] {
  const format = getFormat(project.formatKey)
  const tone = getTone(project.toneKey)
  const totalSeconds = getTotalSeconds(settings)
  const sceneCount = getSceneCount(settings)
  const topic = project.topic.trim() || '[주제]'
  const audience = project.audience.trim() || '[대상]'
  const goal = project.goal.trim() || format.defaultGoal

  return Array.from({ length: sceneCount }, (_, index) => {
    const pattern = format.scenePattern[index % format.scenePattern.length]
    const time = buildTimeRange(index, sceneCount, totalSeconds)
    const isFirst = index === 0
    const isLast = index === sceneCount - 1
    const sceneLabel = pattern.endsWith('장면') ? pattern : `${pattern} 장면`
    const narration = isFirst
      ? `${format.hook} ${topic}의 핵심을 ${audience} 관점에서 보여드립니다.`
      : isLast
        ? `${goal}. ${project.cta.trim() || '자세한 문의는 IZEN IMPLANT로 연락해주세요.'}`
        : `${sceneLabel}에서는 ${topic}의 실제 가치와 맥락을 ${tone.lineStyle} 기준으로 전달합니다.`
    const visualPrompt = [
      `IZEN IMPLANT branded ${settings.aspectRatio} video scene`,
      pattern,
      topic,
      `audience: ${audience}`,
      `style: clean dental corporate, premium medical, realistic lighting`,
      settings.imageCharacter !== 'No fixed character' ? `consistent visual: ${settings.imageCharacter}` : '',
      'no fake text, no distorted logo, Korean dental industry context',
    ]
      .filter(Boolean)
      .join(', ')

    return {
      time,
      title: pattern,
      narration,
      visualPrompt,
      subtitle: isFirst ? format.hook : isLast ? '자세한 내용은 IZEN IMPLANT와 함께 확인하세요.' : `${pattern}: 핵심만 짧고 선명하게`,
    }
  })
}

function buildScript(project: ProjectForm, settings: MakerSettings): string {
  const format = getFormat(project.formatKey)
  const tone = getTone(project.toneKey)
  const scenes = buildScenes(project, settings)
  const title = normalizeTitle(project.title, project.topic)

  return [
    `# ${title}`,
    '',
    `유형: ${format.label}`,
    `비율/길이: ${settings.aspectRatio} / ${getTotalSeconds(settings)}초`,
    `톤: ${tone.label} — ${tone.description}`,
    '',
    '## 내레이션 대본',
    tone.opener,
    ...scenes.map((scene) => `[${scene.time}] ${scene.narration}`),
    '',
    '## 편집 방향',
    `- 컷 속도: ${settings.cutSpeed}`,
    `- BGM: ${settings.bgmStyle}`,
    `- 자막: ${settings.subtitleEnabled ? settings.subtitleStyle : '자막 없음'}`,
    `- 엔딩: ${settings.useLogoEnding ? 'IZEN 로고 엔딩 사용' : '엔딩 로고 없음'}`,
  ].join('\n')
}

function buildSceneTable(project: ProjectForm, settings: MakerSettings): string {
  const scenes = buildScenes(project, settings)
  return [
    '| Time | Scene | Narration | Visual Prompt | Subtitle |',
    '|---|---|---|---|---|',
    ...scenes.map((scene) => `| ${scene.time} | ${scene.title} | ${scene.narration} | ${scene.visualPrompt} | ${scene.subtitle} |`),
  ].join('\n')
}

function buildSrt(project: ProjectForm, settings: MakerSettings): string {
  const scenes = buildScenes(project, settings)
  const totalSeconds = getTotalSeconds(settings)
  const sceneCount = scenes.length
  return scenes
    .map((scene, index) => {
      const start = Math.round((index / sceneCount) * totalSeconds)
      const end = Math.max(start + 1, Math.round(((index + 1) / sceneCount) * totalSeconds))
      return [String(index + 1), `${toSrtTime(start)} --> ${toSrtTime(end)}`, scene.subtitle].join('\n')
    })
    .join('\n\n')
}

function toSrtTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `00:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')},000`
}

function buildUploadMeta(project: ProjectForm, settings: MakerSettings): string {
  const format = getFormat(project.formatKey)
  const title = normalizeTitle(project.title, project.topic)
  const topic = project.topic.trim() || '[주제]'
  const hashtags = ['IZENIMPLANT', 'KoreanImplant', 'DentalImplant', ...format.tags]
  return [
    `제목 후보 1: ${title} | IZEN IMPLANT`,
    `제목 후보 2: ${topic} 핵심 요약 ${getTotalSeconds(settings)}초`,
    `제목 후보 3: ${format.label} - ${topic}`,
    '',
    '설명:',
    `${topic}에 대한 IZEN IMPLANT 영상입니다.`,
    project.source.trim() ? `참고자료: ${project.source.trim()}` : '참고자료: 내부 자료 기준',
    project.cta.trim(),
    '',
    `태그: ${hashtags.map((tag) => `#${tag}`).join(' ')}`,
    `썸네일: ${format.thumbnail}`,
  ].join('\n')
}

function buildPromptPack(project: ProjectForm, settings: MakerSettings): string {
  return buildScenes(project, settings)
    .map((scene, index) => [`## Scene ${index + 1} / ${scene.time}`, scene.visualPrompt, `Motion: ${scene.title} 중심, ${settings.cutSpeed} cut rhythm`, 'Negative: unreadable text, wrong logo, extra fingers, medical gore'].join('\n'))
    .join('\n\n')
}

function buildPremiereGuide(project: ProjectForm, settings: MakerSettings): string {
  const scenes = buildScenes(project, settings)
  return [
    '# Premiere 편집 지시서',
    `- 시퀀스: ${settings.aspectRatio}, 30fps`,
    `- 전체 길이: ${getTotalSeconds(settings)}초`,
    `- 컷 리듬: ${settings.cutSpeed}`,
    `- 보이스: ${settings.voice} / ${settings.voiceSpeed}`,
    `- BGM: ${settings.bgmStyle}`,
    `- 자막: ${settings.subtitleEnabled ? settings.subtitleStyle : '사용 안 함'}`,
    `- 엔딩 로고: ${settings.useLogoEnding ? '마지막 2~3초에 IZEN 로고 인트로/아웃트로 삽입' : '미사용'}`,
    '',
    ...scenes.map((scene, index) => `${index + 1}. ${scene.time} — ${scene.title}: ${scene.narration}`),
  ].join('\n')
}

function buildAllOutputs(project: ProjectForm, settings: MakerSettings): string {
  return [
    buildScript(project, settings),
    '',
    '---',
    '',
    '## 장면표',
    buildSceneTable(project, settings),
    '',
    '---',
    '',
    '## 이미지/영상 프롬프트',
    buildPromptPack(project, settings),
    '',
    '---',
    '',
    '## SRT',
    buildSrt(project, settings),
    '',
    '---',
    '',
    '## 업로드 메타데이터',
    buildUploadMeta(project, settings),
    '',
    '---',
    '',
    buildPremiereGuide(project, settings),
  ].join('\n')
}

function createProject(form: ProjectForm, settings: MakerSettings): VideoProject {
  const now = new Date().toISOString()
  return {
    ...form,
    title: normalizeTitle(form.title, form.topic),
    goal: form.goal.trim() || getFormat(form.formatKey).defaultGoal,
    id: `video-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    settings,
  }
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function VideoMakerView({ onCopy }: VideoMakerViewProps) {
  const [settings, setSettings] = useLocalStorage<MakerSettings>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS)
  const [projects, setProjects] = useLocalStorage<VideoProject[]>(PROJECTS_STORAGE_KEY, [])
  const [mode, setMode] = useState<VideoMode>('autopilot')
  const [form, setForm] = useState<ProjectForm>(EMPTY_FORM)
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [outputTab, setOutputTab] = useState<'script' | 'scenes' | 'prompts' | 'srt' | 'upload' | 'premiere' | 'all'>('script')

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const workingForm = activeProject ?? form
  const workingSettings = activeProject?.settings ?? settings
  const selectedFormat = getFormat(workingForm.formatKey)
  const selectedTone = getTone(workingForm.toneKey)
  const scenes = useMemo(() => buildScenes(workingForm, workingSettings), [workingForm, workingSettings])
  const outputText = useMemo(() => {
    if (outputTab === 'script') return buildScript(workingForm, workingSettings)
    if (outputTab === 'scenes') return buildSceneTable(workingForm, workingSettings)
    if (outputTab === 'prompts') return buildPromptPack(workingForm, workingSettings)
    if (outputTab === 'srt') return buildSrt(workingForm, workingSettings)
    if (outputTab === 'upload') return buildUploadMeta(workingForm, workingSettings)
    if (outputTab === 'premiere') return buildPremiereGuide(workingForm, workingSettings)
    return buildAllOutputs(workingForm, workingSettings)
  }, [outputTab, workingForm, workingSettings])

  const updateForm = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setActiveProjectId('')
    setForm((current) => ({ ...current, [name]: value }))
  }

  const updateSettings = (patch: Partial<MakerSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
  }

  const saveProject = () => {
    const next = createProject(form, settings)
    setProjects((current) => [next, ...current])
    setActiveProjectId(next.id)
  }

  const duplicateProject = (project: VideoProject) => {
    const now = new Date().toISOString()
    const copy: VideoProject = {
      ...project,
      id: `video-${Date.now()}`,
      title: `${project.title} 복사본`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }
    setProjects((current) => [copy, ...current])
    setActiveProjectId(copy.id)
  }

  const updateProjectStatus = (projectId: string, status: ProjectStatus) => {
    setProjects((current) => current.map((project) => (project.id === projectId ? { ...project, status, updatedAt: new Date().toISOString() } : project)))
  }

  const deleteProject = (projectId: string) => {
    setProjects((current) => current.filter((project) => project.id !== projectId))
    if (activeProjectId === projectId) setActiveProjectId('')
  }

  const loadProjectToForm = (project: VideoProject) => {
    setActiveProjectId(project.id)
    setForm({
      title: project.title,
      topic: project.topic,
      audience: project.audience,
      goal: project.goal,
      source: project.source,
      cta: project.cta,
      formatKey: project.formatKey,
      toneKey: project.toneKey,
      status: project.status,
    })
    setSettings(project.settings)
  }

  const resetDraft = () => {
    setActiveProjectId('')
    setForm(EMPTY_FORM)
  }

  return (
    <section className="videoMaker" aria-label="IZEN Video Maker">
      <div className="videoMakerHero">
        <div>
          <p className="eyebrow">AI Automation / YouTube Workflow</p>
          <h2>IZEN Video Maker</h2>
          <p>
            빠나나 AI식 AutoPilot·Manual·Settings·Projects 구조를 IZEN 영상 제작 업무에 맞춘 초안 제작 도구입니다.
            지금 단계에서는 대본, 장면표, 프롬프트, SRT, 업로드 메타, Premiere 지시서를 바로 복사합니다.
          </p>
        </div>
        <div className="videoMakerHeroStats">
          <strong>{projects.length}</strong>
          <span>저장 프로젝트</span>
          <strong>{scenes.length}</strong>
          <span>자동 컷</span>
        </div>
      </div>

      <div className="videoMakerModeBar" role="tablist" aria-label="제작 모드">
        <button type="button" className={mode === 'autopilot' ? 'active' : ''} onClick={() => setMode('autopilot')}>AutoPilot</button>
        <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual</button>
        <button type="button" className="ghost" onClick={resetDraft}>새 초안</button>
        <Button type="button" onClick={saveProject}>프로젝트 저장</Button>
      </div>

      <div className="videoMakerGrid">
        <aside className="videoMakerPanel videoMakerSettings">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Global Configurator</p>
              <h3>YouTube Settings</h3>
            </div>
            <span className="proPill">PRO</span>
          </div>

          <SettingGroup title="Aspect Ratio">
            <Segmented
              value={settings.aspectRatio}
              options={['9:16', '16:9', '1:1', '4:5']}
              onChange={(value) => updateSettings({ aspectRatio: value as AspectRatio })}
            />
          </SettingGroup>

          <SettingGroup title="Cut Speed">
            <Segmented
              value={settings.cutSpeed}
              options={[
                { value: 'fast', label: 'Fast' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'slow', label: 'Slow' },
              ]}
              onChange={(value) => updateSettings({ cutSpeed: value as CutSpeed })}
            />
            <p className="muted small">Fast 기준 약 5초마다 컷 전환</p>
          </SettingGroup>

          <SettingGroup title="Video Length">
            <Segmented
              value={settings.length}
              options={['30s', '60s', '90s', { value: 'custom', label: 'Custom' }]}
              onChange={(value) => updateSettings({ length: value as VideoLength })}
            />
            <label className="inlineField">
              <span>Custom sec</span>
              <input
                type="number"
                min={10}
                max={600}
                value={settings.customSeconds}
                onChange={(event) => updateSettings({ customSeconds: Number(event.target.value) })}
              />
            </label>
          </SettingGroup>

          <SettingGroup title="Default Voice">
            <input value={settings.voice} onChange={(event) => updateSettings({ voice: event.target.value })} />
            <Segmented
              value={settings.voiceSpeed}
              options={[
                { value: 'calm', label: 'Calm' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
              ]}
              onChange={(value) => updateSettings({ voiceSpeed: value as VoiceSpeed })}
            />
          </SettingGroup>

          <SettingGroup title="Characters / Style Lock">
            <input value={settings.imageCharacter} onChange={(event) => updateSettings({ imageCharacter: event.target.value })} placeholder="Image character/style" />
            <input value={settings.videoCharacter} onChange={(event) => updateSettings({ videoCharacter: event.target.value })} placeholder="Video character" />
          </SettingGroup>

          <SettingGroup title="Subtitle Settings">
            <label className="toggleRow">
              <input type="checkbox" checked={settings.subtitleEnabled} onChange={(event) => updateSettings({ subtitleEnabled: event.target.checked })} />
              <span>Auto-composite subtitles into video</span>
            </label>
            <input value={settings.subtitleStyle} onChange={(event) => updateSettings({ subtitleStyle: event.target.value })} />
          </SettingGroup>

          <SettingGroup title="BGM / Ending">
            <input value={settings.bgmStyle} onChange={(event) => updateSettings({ bgmStyle: event.target.value })} />
            <label className="toggleRow">
              <input type="checkbox" checked={settings.useLogoEnding} onChange={(event) => updateSettings({ useLogoEnding: event.target.checked })} />
              <span>IZEN 로고 엔딩 사용</span>
            </label>
          </SettingGroup>
        </aside>

        <main className="videoMakerPanel videoMakerWorkspace">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">{mode === 'autopilot' ? 'Topic to Video Package' : 'Step by Step Builder'}</p>
              <h3>{mode === 'autopilot' ? 'AutoPilot' : 'Create Manually'}</h3>
            </div>
            {activeProject ? <span className="statusPill">{STATUS_LABELS[activeProject.status]}</span> : <span className="statusPill">Draft</span>}
          </div>

          <div className="videoMakerFormGrid">
            <label>
              영상 유형
              <select name="formatKey" value={form.formatKey} onChange={updateForm}>
                {VIDEO_FORMATS.map((format) => <option key={format.key} value={format.key}>{format.label}</option>)}
              </select>
            </label>
            <label>
              말투 프리셋
              <select name="toneKey" value={form.toneKey} onChange={updateForm}>
                {TONE_PRESETS.map((tone) => <option key={tone.key} value={tone.key}>{tone.label}</option>)}
              </select>
            </label>
          </div>

          <div className="formatInfoCard">
            <strong>{selectedFormat.category} / {selectedFormat.label}</strong>
            <p>{selectedFormat.description}</p>
            <small>{selectedTone.description}</small>
          </div>

          <label>
            프로젝트/영상 제목
            <input name="title" value={form.title} onChange={updateForm} placeholder="비워두면 주제로 자동 제목 생성" />
          </label>

          <label>
            주제
            <textarea name="topic" value={form.topic} onChange={updateForm} rows={mode === 'autopilot' ? 3 : 2} placeholder="예: SIDEX 2026 IZEN 부스 현장 리캡" />
          </label>

          <div className="quickTopicGrid">
            {QUICK_TOPICS.map((topic) => (
              <button key={topic} type="button" className="quickTopic" onClick={() => setForm((current) => ({ ...current, topic }))}>
                {topic}
              </button>
            ))}
          </div>

          <div className="videoMakerFormGrid">
            <label>
              타깃 시청자
              <input name="audience" value={form.audience} onChange={updateForm} />
            </label>
            <label>
              목표
              <input name="goal" value={form.goal} onChange={updateForm} placeholder={selectedFormat.defaultGoal} />
            </label>
          </div>

          {mode === 'manual' ? (
            <>
              <label>
                참고자료 / 원문 / 링크
                <textarea name="source" value={form.source} onChange={updateForm} rows={4} placeholder="행사 정보, 제품 특징, 인터뷰 원문, NAS 링크 등" />
              </label>
              <label>
                CTA
                <textarea name="cta" value={form.cta} onChange={updateForm} rows={2} />
              </label>
            </>
          ) : null}

          <div className="pipelineCards">
            <PipelineCard title="1. Title" text="후킹형 제목 3안" />
            <PipelineCard title="2. Script" text="시간대별 내레이션" />
            <PipelineCard title="3. Scenes" text="컷 리스트 자동 분할" />
            <PipelineCard title="4. Prompts" text="이미지/영상 생성 프롬프트" />
            <PipelineCard title="5. Subtitles" text="SRT 자막" />
            <PipelineCard title="6. Upload" text="제목·설명·태그" />
          </div>
        </main>

        <aside className="videoMakerPanel projectsPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">My Projects</p>
              <h3>Projects</h3>
            </div>
          </div>
          {projects.length === 0 ? <p className="muted">저장된 영상 프로젝트가 없습니다.</p> : null}
          <div className="videoProjectList">
            {projects.map((project) => (
              <article key={project.id} className={activeProjectId === project.id ? 'videoProjectCard active' : 'videoProjectCard'}>
                <button type="button" onClick={() => loadProjectToForm(project)}>
                  <strong>{project.title}</strong>
                  <span>{getFormat(project.formatKey).label} · {formatDateTime(project.updatedAt)}</span>
                </button>
                <select value={project.status} onChange={(event) => updateProjectStatus(project.id, event.target.value as ProjectStatus)}>
                  {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <div className="projectActions">
                  <button type="button" className="secondary mini" onClick={() => duplicateProject(project)}>복사</button>
                  <button type="button" className="secondary mini" onClick={() => deleteProject(project.id)}>삭제</button>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <section className="videoMakerOutput videoMakerPanel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Generated Package</p>
            <h3>제작 산출물</h3>
          </div>
          <Button type="button" onClick={() => void onCopy(outputText, { successMessage: '현재 산출물을 복사했습니다.', emptyMessage: '복사할 산출물이 없습니다.' })}>
            현재 탭 복사
          </Button>
        </div>
        <div className="outputTabs">
          {[
            ['script', '대본'],
            ['scenes', '장면표'],
            ['prompts', '프롬프트'],
            ['srt', 'SRT'],
            ['upload', '업로드'],
            ['premiere', 'Premiere'],
            ['all', '전체'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={outputTab === value ? 'active' : ''} onClick={() => setOutputTab(value as typeof outputTab)}>{label}</button>
          ))}
        </div>
        <pre className="outputBox">{outputText}</pre>
      </section>
    </section>
  )
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settingGroup">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

function Segmented({ value, options, onChange }: { value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="segmentedControl">
      {options.map((option) => {
        const normalized = typeof option === 'string' ? { value: option, label: option } : option
        return (
          <button key={normalized.value} type="button" className={value === normalized.value ? 'active' : ''} onClick={() => onChange(normalized.value)}>
            {normalized.label}
          </button>
        )
      })}
    </div>
  )
}

function PipelineCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="pipelineCard">
      <strong>{title}</strong>
      <span>{text}</span>
    </article>
  )
}
