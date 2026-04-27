import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import PptxGenJS from 'pptxgenjs'
import { Button, UiGlyph } from '../../shared/ui'

type StoryboardFrame = {
  id: string
  timecode: string
  thumbnailDataUrl: string
  thumbnailName: string
  thumbnailWidth?: number
  thumbnailHeight?: number
  screenComposition: string
  copy: string
  sound: string
  purpose: string
}

type StoryboardMeta = {
  deckTitle: string
  projectName: string
  versionNote: string
}

type SavedStoryboard = {
  id: string
  title: string
  updatedAt: string
  meta: StoryboardMeta
  frames: StoryboardFrame[]
  selectedFrameId: string
}

type StoryboardStore = {
  activeId: string
  items: SavedStoryboard[]
}

type ImagePayload = {
  dataUrl: string
  name: string
  width: number
  height: number
}

type PptxSlide = ReturnType<PptxGenJS['addSlide']>

type TimeRangeParts = {
  startMinute: number
  startSecond: number
  endMinute: number
  endSecond: number
}

const DEFAULT_TIME_RANGE: TimeRangeParts = {
  startMinute: 0,
  startSecond: 0,
  endMinute: 0,
  endSecond: 5,
}

const STORYBOARD_STORAGE_KEY = 'izen_storyboard_pptx_store_v1'
const STORYBOARD_AUTOSAVE_DELAY_MS = 350
const STORYBOARD_IMAGE_SCALE = 0.5
const STORYBOARD_IMAGE_QUALITY = 0.72

const DEFAULT_META: StoryboardMeta = {
  deckTitle: '스토리보드',
  projectName: '',
  versionNote: '',
}

function secondsToTimeParts(totalSeconds: number): { minute: number; second: number } {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  return {
    minute: Math.floor(safeSeconds / 60),
    second: safeSeconds % 60,
  }
}

function formatTimeRange(parts: TimeRangeParts): string {
  return `${parts.startMinute}분 ${parts.startSecond}초 ~ ${parts.endMinute}분 ${parts.endSecond}초`
}

function parseTimeRange(value: string): TimeRangeParts {
  const normalized = value.trim()
  const koreanMatch = normalized.match(/(\d+)\s*분\s*(\d+)\s*초\s*[~-]\s*(\d+)\s*분\s*(\d+)\s*초/)
  if (koreanMatch) {
    return {
      startMinute: Number(koreanMatch[1]),
      startSecond: Number(koreanMatch[2]),
      endMinute: Number(koreanMatch[3]),
      endSecond: Number(koreanMatch[4]),
    }
  }

  const clockMatch = normalized.match(/(\d+):(\d+)\s*[~-]\s*(\d+):(\d+)/)
  if (clockMatch) {
    return {
      startMinute: Number(clockMatch[1]),
      startSecond: Number(clockMatch[2]),
      endMinute: Number(clockMatch[3]),
      endSecond: Number(clockMatch[4]),
    }
  }

  return DEFAULT_TIME_RANGE
}

function normalizeTimeNumber(value: string, max?: number): number {
  const parsed = Number(value.replace(/\D/g, ''))
  if (!Number.isFinite(parsed)) return 0
  const safeValue = Math.max(0, Math.floor(parsed))
  return typeof max === 'number' ? Math.min(max, safeValue) : safeValue
}

const STARTER_FRAMES: StoryboardFrame[] = [
  {
    id: crypto.randomUUID(),
    timecode: formatTimeRange(DEFAULT_TIME_RANGE),
    thumbnailDataUrl: '',
    thumbnailName: '',
    screenComposition: '인트로 화면 / 로고 또는 대표 비주얼',
    copy: '핵심 카피 입력',
    sound: 'BGM 시작 / 효과음',
    purpose: '첫 인상 형성',
  },
  {
    id: crypto.randomUUID(),
    timecode: formatTimeRange({ startMinute: 0, startSecond: 5, endMinute: 0, endSecond: 10 }),
    thumbnailDataUrl: '',
    thumbnailName: '',
    screenComposition: '',
    copy: '',
    sound: '',
    purpose: '',
  },
  {
    id: crypto.randomUUID(),
    timecode: formatTimeRange({ startMinute: 0, startSecond: 10, endMinute: 0, endSecond: 15 }),
    thumbnailDataUrl: '',
    thumbnailName: '',
    screenComposition: '',
    copy: '',
    sound: '',
    purpose: '',
  },
]

function cloneStarterFrames(): StoryboardFrame[] {
  return STARTER_FRAMES.map((frame) => ({
    ...frame,
    id: crypto.randomUUID(),
  }))
}

function createStoryboardTitle(meta: StoryboardMeta): string {
  return meta.projectName.trim() || meta.deckTitle.trim() || '새 스토리보드'
}

function createSavedStoryboard(): SavedStoryboard {
  const frames = cloneStarterFrames()
  return {
    id: crypto.randomUUID(),
    title: createStoryboardTitle(DEFAULT_META),
    updatedAt: new Date().toISOString(),
    meta: { ...DEFAULT_META },
    frames,
    selectedFrameId: frames[0]?.id ?? '',
  }
}

function normalizeSavedStoryboard(value: unknown): SavedStoryboard | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<SavedStoryboard>
  if (!item.id || typeof item.id !== 'string') return null
  if (!item.meta || !Array.isArray(item.frames)) return null

  const frames = item.frames.filter((frame): frame is StoryboardFrame => {
    return Boolean(frame && typeof frame.id === 'string' && typeof frame.timecode === 'string')
  })
  if (frames.length === 0) return null

  const meta: StoryboardMeta = {
    deckTitle: typeof item.meta.deckTitle === 'string' ? item.meta.deckTitle : DEFAULT_META.deckTitle,
    projectName: typeof item.meta.projectName === 'string' ? item.meta.projectName : '',
    versionNote: typeof item.meta.versionNote === 'string' ? item.meta.versionNote : '',
  }

  return {
    id: item.id,
    title: typeof item.title === 'string' ? item.title : createStoryboardTitle(meta),
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    meta,
    frames,
    selectedFrameId:
      typeof item.selectedFrameId === 'string' && frames.some((frame) => frame.id === item.selectedFrameId)
        ? item.selectedFrameId
        : frames[0]?.id ?? '',
  }
}

function readStoryboardStore(): StoryboardStore {
  if (typeof window === 'undefined') {
    const item = createSavedStoryboard()
    return { activeId: item.id, items: [item] }
  }

  try {
    const rawValue = window.localStorage.getItem(STORYBOARD_STORAGE_KEY)
    if (!rawValue) {
      const item = createSavedStoryboard()
      return { activeId: item.id, items: [item] }
    }

    const parsed = JSON.parse(rawValue) as Partial<StoryboardStore>
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item) => normalizeSavedStoryboard(item)).filter((item): item is SavedStoryboard => Boolean(item))
      : []
    if (items.length === 0) {
      const item = createSavedStoryboard()
      return { activeId: item.id, items: [item] }
    }

    const activeId = typeof parsed.activeId === 'string' && items.some((item) => item.id === parsed.activeId)
      ? parsed.activeId
      : items[0].id
    return { activeId, items }
  } catch {
    const item = createSavedStoryboard()
    return { activeId: item.id, items: [item] }
  }
}

function formatSavedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

const COLORS = {
  ink: '172033',
  muted: '5F6F85',
  line: 'D8E0EA',
  panel: 'F7F9FC',
  soft: 'EEF4FF',
  primary: '2F6FED',
  white: 'FFFFFF',
}

function sanitizeFileName(value: string): string {
  const normalized = value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')
  return normalized || 'storyboard'
}

function createBlankFrame(index: number): StoryboardFrame {
  const start = secondsToTimeParts(index * 5)
  const end = secondsToTimeParts(index * 5 + 5)
  return {
    id: crypto.randomUUID(),
    timecode: formatTimeRange({
      startMinute: start.minute,
      startSecond: start.second,
      endMinute: end.minute,
      endSecond: end.second,
    }),
    thumbnailDataUrl: '',
    thumbnailName: '',
    screenComposition: '',
    copy: '',
    sound: '',
    purpose: '',
  }
}

function readImageFile(file: File): Promise<ImagePayload> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('이미지 파일만 업로드할 수 있습니다.'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '')
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        const width = Math.max(1, Math.round(image.naturalWidth * STORYBOARD_IMAGE_SCALE))
        const height = Math.max(1, Math.round(image.naturalHeight * STORYBOARD_IMAGE_SCALE))
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          resolve({
            dataUrl,
            name: file.name,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })
          return
        }

        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', STORYBOARD_IMAGE_QUALITY),
          name: file.name,
          width,
          height,
        })
      }
      image.onerror = () => reject(new Error('이미지를 읽지 못했습니다. 다른 파일을 선택해 주세요.'))
      image.src = dataUrl
    }
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
}

function fitRect(sourceWidth: number, sourceHeight: number, box: { x: number; y: number; w: number; h: number }) {
  if (!sourceWidth || !sourceHeight) return box
  const sourceRatio = sourceWidth / sourceHeight
  const boxRatio = box.w / box.h
  if (sourceRatio > boxRatio) {
    const h = box.w / sourceRatio
    return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h }
  }
  const w = box.h * sourceRatio
  return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h }
}

function addTextBox(slide: PptxSlide, label: string, value: string, x: number, y: number, w: number, h: number) {
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: COLORS.white },
    line: { color: COLORS.line, width: 1 },
  })
  slide.addText(label, {
    x: x + 0.15,
    y: y + 0.12,
    w: w - 0.3,
    h: 0.22,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: 8,
    bold: true,
    margin: 0,
  })
  slide.addText(value || '-', {
    x: x + 0.15,
    y: y + 0.42,
    w: w - 0.3,
    h: h - 0.54,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: 12,
    breakLine: false,
    fit: 'shrink',
    margin: 0.02,
    valign: 'top',
  })
}

function addStoryboardSlide(pptx: PptxGenJS, frame: StoryboardFrame, meta: StoryboardMeta, index: number, total: number) {
  const slide = pptx.addSlide()
  slide.background = { color: COLORS.white }

  slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.78, fill: { color: COLORS.ink }, line: { color: COLORS.ink } })
  slide.addText(meta.deckTitle || '스토리보드', {
    x: 0.46,
    y: 0.2,
    w: 6.4,
    h: 0.32,
    color: COLORS.white,
    fontFace: 'Malgun Gothic',
    fontSize: 18,
    bold: true,
    margin: 0,
  })
  slide.addText([meta.projectName, meta.versionNote].filter(Boolean).join(' / '), {
    x: 7.0,
    y: 0.25,
    w: 3.45,
    h: 0.22,
    color: 'DDE7F5',
    fontFace: 'Malgun Gothic',
    fontSize: 8,
    align: 'right',
    margin: 0,
  })
  slide.addText(`PAGE ${index + 1} / ${total}`, {
    x: 10.75,
    y: 0.18,
    w: 2.1,
    h: 0.32,
    color: COLORS.white,
    fontFace: 'Malgun Gothic',
    fontSize: 11,
    bold: true,
    align: 'right',
    margin: 0,
  })

  slide.addShape('rect', {
    x: 0.46,
    y: 0.98,
    w: 2.65,
    h: 0.42,
    fill: { color: COLORS.soft },
    line: { color: 'BFD1F6', width: 1 },
  })
  slide.addText('시간 초수', {
    x: 0.62,
    y: 1.09,
    w: 0.7,
    h: 0.14,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: 7,
    bold: true,
    margin: 0,
  })
  slide.addText(frame.timecode || '-', {
    x: 1.36,
    y: 1.05,
    w: 1.45,
    h: 0.22,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: 10,
    bold: true,
    align: 'right',
    fit: 'shrink',
    margin: 0,
  })

  addTextBox(slide, '목적', frame.purpose, 3.35, 0.98, 9.5, 0.72)

  const imageBox = { x: 0.46, y: 1.9, w: 6.65, h: 4.78 }
  slide.addShape('rect', {
    ...imageBox,
    fill: { color: COLORS.panel },
    line: { color: COLORS.line, width: 1 },
  })
  slide.addText('비디오 이미지 썸네일', {
    x: imageBox.x + 0.16,
    y: imageBox.y + 0.14,
    w: 2.0,
    h: 0.2,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: 8,
    bold: true,
    margin: 0,
  })
  const innerImageBox = { x: imageBox.x + 0.18, y: imageBox.y + 0.46, w: imageBox.w - 0.36, h: imageBox.h - 0.64 }
  if (frame.thumbnailDataUrl) {
    const fitted = fitRect(frame.thumbnailWidth ?? 0, frame.thumbnailHeight ?? 0, innerImageBox)
    slide.addImage({
      data: frame.thumbnailDataUrl,
      x: fitted.x,
      y: fitted.y,
      w: fitted.w,
      h: fitted.h,
      altText: frame.thumbnailName || 'storyboard thumbnail',
    })
  } else {
    slide.addShape('rect', {
      ...innerImageBox,
      fill: { color: 'EDF1F6' },
      line: { color: 'CED8E5', dashType: 'dash', width: 1 },
    })
    slide.addText('썸네일 영역', {
      ...innerImageBox,
      color: COLORS.muted,
      fontFace: 'Malgun Gothic',
      fontSize: 16,
      bold: true,
      align: 'center',
      valign: 'middle',
      margin: 0,
    })
  }

  addTextBox(slide, '화면구성', frame.screenComposition, 7.42, 1.9, 5.43, 1.38)
  addTextBox(slide, '자막 / 카피', frame.copy, 7.42, 3.46, 5.43, 1.58)
  addTextBox(slide, '사운드', frame.sound, 7.42, 5.22, 5.43, 1.46)

  slide.addShape('line', { x: 0.46, y: 6.88, w: 12.38, h: 0, line: { color: COLORS.line, width: 1 } })
  slide.addText(`CUT ${String(index + 1).padStart(2, '0')}`, {
    x: 0.46,
    y: 6.98,
    w: 1.0,
    h: 0.18,
    color: COLORS.muted,
    fontFace: 'Malgun Gothic',
    fontSize: 8,
    bold: true,
    margin: 0,
  })
}

export function StoryboardPptxView() {
  const [initialStore] = useState<StoryboardStore>(() => readStoryboardStore())
  const initialStoryboard = initialStore.items.find((item) => item.id === initialStore.activeId) ?? initialStore.items[0]
  const [savedStoryboards, setSavedStoryboards] = useState<SavedStoryboard[]>(initialStore.items)
  const [activeStoryboardId, setActiveStoryboardId] = useState(initialStore.activeId)
  const [meta, setMeta] = useState<StoryboardMeta>(initialStoryboard?.meta ?? DEFAULT_META)
  const [frames, setFrames] = useState<StoryboardFrame[]>(initialStoryboard?.frames ?? cloneStarterFrames())
  const [selectedFrameId, setSelectedFrameId] = useState(initialStoryboard?.selectedFrameId ?? initialStoryboard?.frames[0]?.id ?? '')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)

  const selectedFrame = useMemo(
    () => frames.find((frame) => frame.id === selectedFrameId) ?? frames[0],
    [frames, selectedFrameId],
  )
  const selectedTimeRange = useMemo(
    () => parseTimeRange(selectedFrame?.timecode ?? ''),
    [selectedFrame?.timecode],
  )
  const activeSavedStoryboard = useMemo(
    () => savedStoryboards.find((item) => item.id === activeStoryboardId) ?? savedStoryboards[0],
    [activeStoryboardId, savedStoryboards],
  )

  useEffect(() => {
    const updatedAt = new Date().toISOString()
    const snapshot: SavedStoryboard = {
      id: activeStoryboardId,
      title: createStoryboardTitle(meta),
      updatedAt,
      meta,
      frames,
      selectedFrameId: selectedFrame?.id ?? frames[0]?.id ?? '',
    }

    setSavedStoryboards((current) => {
      let found = false
      const next = current.map((item) => {
        if (item.id !== activeStoryboardId) return item
        found = true
        return snapshot
      })
      return found ? next : [snapshot, ...next]
    })
  }, [activeStoryboardId, frames, meta, selectedFrame?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          STORYBOARD_STORAGE_KEY,
          JSON.stringify({
            activeId: activeStoryboardId,
            items: savedStoryboards,
          }),
        )
        setStorageError(null)
      } catch {
        setStorageError('브라우저 저장공간이 부족해 자동저장하지 못했습니다. 큰 썸네일 이미지를 줄이거나 일부 페이지를 삭제해 주세요.')
      }
    }, STORYBOARD_AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [activeStoryboardId, savedStoryboards])

  const updateMeta = (key: keyof StoryboardMeta, value: string) => {
    setMeta((current) => ({ ...current, [key]: value }))
  }

  const updateFrame = (id: string, patch: Partial<StoryboardFrame>) => {
    setFrames((current) => current.map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)))
  }

  const updateFrameTimeRange = (id: string, key: keyof TimeRangeParts, value: string) => {
    const nextParts = {
      ...parseTimeRange(frames.find((frame) => frame.id === id)?.timecode ?? ''),
      [key]: normalizeTimeNumber(value, key.endsWith('Second') ? 59 : undefined),
    }
    updateFrame(id, { timecode: formatTimeRange(nextParts) })
  }

  const loadSavedStoryboard = (storyboardId: string) => {
    const nextStoryboard = savedStoryboards.find((item) => item.id === storyboardId)
    if (!nextStoryboard) return

    setActiveStoryboardId(nextStoryboard.id)
    setMeta(nextStoryboard.meta)
    setFrames(nextStoryboard.frames)
    setSelectedFrameId(nextStoryboard.selectedFrameId || nextStoryboard.frames[0]?.id || '')
    setMessage(null)
  }

  const createNewSavedStoryboard = () => {
    const nextStoryboard = createSavedStoryboard()
    setSavedStoryboards((current) => [nextStoryboard, ...current])
    setActiveStoryboardId(nextStoryboard.id)
    setMeta(nextStoryboard.meta)
    setFrames(nextStoryboard.frames)
    setSelectedFrameId(nextStoryboard.selectedFrameId)
    setMessage('새 스토리보드를 만들었습니다. 이후 입력 내용은 자동저장됩니다.')
  }

  const deleteSavedStoryboard = () => {
    if (!activeSavedStoryboard) return
    const remaining = savedStoryboards.filter((item) => item.id !== activeSavedStoryboard.id)
    const nextStoryboard = remaining[0] ?? createSavedStoryboard()

    setSavedStoryboards(remaining.length > 0 ? remaining : [nextStoryboard])
    setActiveStoryboardId(nextStoryboard.id)
    setMeta(nextStoryboard.meta)
    setFrames(nextStoryboard.frames)
    setSelectedFrameId(nextStoryboard.selectedFrameId || nextStoryboard.frames[0]?.id || '')
    setMessage('선택한 저장본을 삭제했습니다.')
  }

  const addFrame = () => {
    const nextFrame = createBlankFrame(frames.length)
    setFrames((current) => [...current, nextFrame])
    setSelectedFrameId(nextFrame.id)
  }

  const duplicateFrame = (frame: StoryboardFrame) => {
    const nextFrame = { ...frame, id: crypto.randomUUID(), timecode: frame.timecode ? `${frame.timecode} copy` : '' }
    setFrames((current) => {
      const index = current.findIndex((item) => item.id === frame.id)
      const next = [...current]
      next.splice(index + 1, 0, nextFrame)
      return next
    })
    setSelectedFrameId(nextFrame.id)
  }

  const removeFrame = (frameId: string) => {
    setFrames((current) => {
      if (current.length === 1) return current
      const next = current.filter((frame) => frame.id !== frameId)
      if (selectedFrameId === frameId) {
        setSelectedFrameId(next[0]?.id ?? '')
      }
      return next
    })
  }

  const clearFrame = (frame: StoryboardFrame) => {
    updateFrame(frame.id, {
      thumbnailDataUrl: '',
      thumbnailName: '',
      thumbnailWidth: undefined,
      thumbnailHeight: undefined,
      screenComposition: '',
      copy: '',
      sound: '',
      purpose: '',
    })
  }

  const onImageChange = async (frameId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const image = await readImageFile(file)
      updateFrame(frameId, {
        thumbnailDataUrl: image.dataUrl,
        thumbnailName: image.name,
        thumbnailWidth: image.width,
        thumbnailHeight: image.height,
      })
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.')
    }
  }

  const exportPptx = async () => {
    setExporting(true)
    setMessage(null)
    try {
      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      pptx.author = ''
      pptx.company = 'IZEN'
      pptx.subject = 'Storyboard'
      pptx.title = meta.deckTitle || '스토리보드'
      pptx.theme = {
        headFontFace: 'Malgun Gothic',
        bodyFontFace: 'Malgun Gothic',
      }

      frames.forEach((frame, index) => addStoryboardSlide(pptx, frame, meta, index, frames.length))

      const baseName = sanitizeFileName([meta.projectName, meta.deckTitle].filter(Boolean).join('_'))
      await pptx.writeFile({ fileName: `${baseName}.pptx`, compression: true })
      setMessage(`${frames.length}페이지 PPTX를 생성했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'PPTX 생성에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="storyboardPptxView" aria-label="스토리보드 PPTX 생성">
      <section className="storyboardPptxHeader">
        <div>
          <h2>스토리보드 PPTX 생성</h2>
          <p>시간 초수, 썸네일, 화면구성, 자막/카피, 사운드, 목적을 같은 양식의 슬라이드로 내보냅니다.</p>
        </div>
        <div className="storyboardPptxHeaderActions">
          <Button type="button" variant="secondary" onClick={addFrame} icon={<UiGlyph name="plus" />}>
            페이지 추가
          </Button>
          <Button type="button" onClick={() => void exportPptx()} disabled={exporting} icon={<UiGlyph name="download" />}>
            {exporting ? '생성 중' : 'PPTX 내보내기'}
          </Button>
        </div>
      </section>

      {message ? <p className="storyboardPptxMessage">{message}</p> : null}
      {storageError ? <p className="storyboardPptxMessage is-error">{storageError}</p> : null}

      <section className="storyboardPptxSavePanel" aria-label="스토리보드 저장본">
        <div className="storyboardPptxSaveInfo">
          <strong>웹페이지 자동저장</strong>
          <span>
            {activeSavedStoryboard?.updatedAt
              ? `저장됨 ${formatSavedAt(activeSavedStoryboard.updatedAt)}`
              : '현재 브라우저에 자동저장됩니다.'}
          </span>
        </div>
        <select value={activeStoryboardId} onChange={(event) => loadSavedStoryboard(event.target.value)}>
          {savedStoryboards.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} · {item.frames.length}p
            </option>
          ))}
        </select>
        <div className="storyboardPptxSaveActions">
          <Button type="button" variant="secondary" size="mini" onClick={createNewSavedStoryboard} icon={<UiGlyph name="plus" />}>
            새 저장본
          </Button>
          <Button type="button" variant="secondary" size="mini" onClick={deleteSavedStoryboard}>
            저장본 삭제
          </Button>
        </div>
      </section>

      <section className="storyboardPptxMeta" aria-label="문서 정보">
        <label>
          PPT 제목
          <input value={meta.deckTitle} onChange={(event) => updateMeta('deckTitle', event.target.value)} placeholder="스토리보드" />
        </label>
        <label>
          프로젝트명
          <input value={meta.projectName} onChange={(event) => updateMeta('projectName', event.target.value)} placeholder="행사명 또는 영상명" />
        </label>
        <label>
          버전 / 메모
          <input value={meta.versionNote} onChange={(event) => updateMeta('versionNote', event.target.value)} placeholder="v1 / 1차 공유용" />
        </label>
      </section>

      <section className="storyboardPptxWorkspace">
        <aside className="storyboardPptxFrameList" aria-label="페이지 목록">
          <div className="storyboardPptxFrameListHeader">
            <strong>페이지</strong>
            <span>{frames.length}</span>
          </div>
          {frames.map((frame, index) => (
            <button
              key={frame.id}
              type="button"
              className={frame.id === selectedFrame?.id ? 'storyboardPptxFrameButton is-active' : 'storyboardPptxFrameButton'}
              onClick={() => setSelectedFrameId(frame.id)}
            >
              <span>PAGE {index + 1}</span>
              <strong>{frame.timecode || '시간 미입력'}</strong>
            </button>
          ))}
        </aside>

        {selectedFrame ? (
          <section className="storyboardPptxEditor" aria-label="선택 페이지 편집">
            <div className="storyboardPptxEditorHeader">
              <div>
                <span className="storyboardPptxKicker">선택 페이지</span>
                <h3>PAGE {frames.findIndex((frame) => frame.id === selectedFrame.id) + 1}</h3>
              </div>
              <div className="storyboardPptxEditorActions">
                <Button type="button" size="mini" variant="secondary" onClick={() => duplicateFrame(selectedFrame)}>
                  복제
                </Button>
                <Button type="button" size="mini" variant="secondary" onClick={() => clearFrame(selectedFrame)}>
                  내용 비우기
                </Button>
                <Button
                  type="button"
                  size="mini"
                  variant="secondary"
                  disabled={frames.length === 1}
                  onClick={() => removeFrame(selectedFrame.id)}
                >
                  삭제
                </Button>
              </div>
            </div>

            <div className="storyboardPptxFormGrid">
              <div className="storyboardPptxTimeField">
                <span className="storyboardPptxFieldLabel">시간 초수</span>
                <div className="storyboardPptxTimeControls" aria-label="시간 초수">
                  <div className="storyboardPptxTimeGroup">
                    <span>시작</span>
                    <label>
                      <input
                        type="number"
                        min="0"
                        value={selectedTimeRange.startMinute}
                        onChange={(event) => updateFrameTimeRange(selectedFrame.id, 'startMinute', event.target.value)}
                      />
                      분
                    </label>
                    <label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={selectedTimeRange.startSecond}
                        onChange={(event) => updateFrameTimeRange(selectedFrame.id, 'startSecond', event.target.value)}
                      />
                      초
                    </label>
                  </div>
                  <span className="storyboardPptxTimeSeparator">~</span>
                  <div className="storyboardPptxTimeGroup">
                    <span>종료</span>
                    <label>
                      <input
                        type="number"
                        min="0"
                        value={selectedTimeRange.endMinute}
                        onChange={(event) => updateFrameTimeRange(selectedFrame.id, 'endMinute', event.target.value)}
                      />
                      분
                    </label>
                    <label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={selectedTimeRange.endSecond}
                        onChange={(event) => updateFrameTimeRange(selectedFrame.id, 'endSecond', event.target.value)}
                      />
                      초
                    </label>
                  </div>
                </div>
                <span className="storyboardPptxTimePreview">{selectedFrame.timecode}</span>
              </div>
              <label>
                화면구성
                <textarea
                  value={selectedFrame.screenComposition}
                  onChange={(event) => updateFrame(selectedFrame.id, { screenComposition: event.target.value })}
                  placeholder="컷 구성, 화면 전환, 그래픽 요소"
                  rows={5}
                />
              </label>
              <label>
                자막 / 카피
                <textarea
                  value={selectedFrame.copy}
                  onChange={(event) => updateFrame(selectedFrame.id, { copy: event.target.value })}
                  placeholder="화면에 들어갈 문구나 내레이션"
                  rows={5}
                />
              </label>
              <label>
                사운드
                <textarea
                  value={selectedFrame.sound}
                  onChange={(event) => updateFrame(selectedFrame.id, { sound: event.target.value })}
                  placeholder="BGM, 효과음, 무음 등"
                  rows={4}
                />
              </label>
              <label>
                목적
                <textarea
                  value={selectedFrame.purpose}
                  onChange={(event) => updateFrame(selectedFrame.id, { purpose: event.target.value })}
                  placeholder="이 컷의 역할 또는 전달 목표"
                  rows={4}
                />
              </label>
            </div>

            <section className="storyboardPptxThumbnailPanel" aria-label="썸네일">
              <div>
                <strong>비디오 이미지 썸네일</strong>
                <span>{selectedFrame.thumbnailName || '업로드된 이미지 없음'}</span>
              </div>
              <label className="storyboardPptxUploadButton">
                이미지 선택
                <input type="file" accept="image/*" onChange={(event) => void onImageChange(selectedFrame.id, event)} />
              </label>
              <div className="storyboardPptxThumbnailPreview">
                {selectedFrame.thumbnailDataUrl ? (
                  <img src={selectedFrame.thumbnailDataUrl} alt="" />
                ) : (
                  <span>썸네일 미리보기</span>
                )}
              </div>
            </section>
          </section>
        ) : null}

        <section className="storyboardPptxPreview" aria-label="슬라이드 미리보기">
          <div className="storyboardPptxSlidePreview">
            <header>
              <strong>{meta.deckTitle || '스토리보드'}</strong>
              <span>PAGE {selectedFrame ? frames.findIndex((frame) => frame.id === selectedFrame.id) + 1 : 1}</span>
            </header>
            <div className="storyboardPptxPreviewTop">
              <span>{selectedFrame?.timecode || '시간 초수'}</span>
              <strong>목적</strong>
            </div>
            <div className="storyboardPptxPreviewBody">
              <div className="storyboardPptxPreviewImage">
                {selectedFrame?.thumbnailDataUrl ? <img src={selectedFrame.thumbnailDataUrl} alt="" /> : <span>썸네일</span>}
              </div>
              <div className="storyboardPptxPreviewCells">
                <span>화면구성</span>
                <span>자막 / 카피</span>
                <span>사운드</span>
              </div>
            </div>
          </div>
        </section>
      </section>
    </section>
  )
}
