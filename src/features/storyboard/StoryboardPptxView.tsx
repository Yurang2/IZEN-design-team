import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import PptxGenJS from 'pptxgenjs'
import { api } from '../../shared/api/client'
import type { ProjectRecord, StoryboardDocumentRecord, StoryboardListResponse, StoryboardResponse, TaskRecord } from '../../shared/types'
import { Button, UiGlyph } from '../../shared/ui'
import { RelatedTaskPickerModal } from '../tasks/RelatedTaskPickerModal'

type StoryboardFrame = {
  id: string
  timecode: string
  thumbnailDataUrl: string
  thumbnailName: string
  thumbnailWidth?: number
  thumbnailHeight?: number
  thumbnailImageKey?: string
  thumbnailContentType?: string
  screenComposition: string
  copy: string
  sound: string
  purpose: string
}

type StoryboardMeta = {
  deckTitle: string
  projectName: string
  relatedTaskId: string
  versionName: string
  memo: string
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
  exportedFileNames: string[]
}

type StoryboardPptxViewProps = {
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  configured?: boolean
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
const SLIDE_TITLE_FONT_SIZE = 8
const SLIDE_BODY_FONT_SIZE = 12

const DEFAULT_META: StoryboardMeta = {
  deckTitle: '스토리보드',
  projectName: '',
  relatedTaskId: '',
  versionName: '',
  memo: '',
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

function createStoryboardDbTitle(meta: StoryboardMeta): string {
  return meta.deckTitle.trim() || meta.projectName.trim() || '새 스토리보드'
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
    relatedTaskId: typeof item.meta.relatedTaskId === 'string' ? item.meta.relatedTaskId : '',
    versionName:
      typeof item.meta.versionName === 'string'
        ? item.meta.versionName
        : typeof (item.meta as Partial<{ versionNote: string }>).versionNote === 'string'
          ? (item.meta as Partial<{ versionNote: string }>).versionNote ?? ''
          : '',
    memo: typeof item.meta.memo === 'string' ? item.meta.memo : '',
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
    return { activeId: item.id, items: [item], exportedFileNames: [] }
  }

  try {
    const rawValue = window.localStorage.getItem(STORYBOARD_STORAGE_KEY)
    if (!rawValue) {
      const item = createSavedStoryboard()
      return { activeId: item.id, items: [item], exportedFileNames: [] }
    }

    const parsed = JSON.parse(rawValue) as Partial<StoryboardStore>
    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item) => normalizeSavedStoryboard(item)).filter((item): item is SavedStoryboard => Boolean(item))
      : []
    if (items.length === 0) {
      const item = createSavedStoryboard()
      return { activeId: item.id, items: [item], exportedFileNames: [] }
    }

    const activeId = typeof parsed.activeId === 'string' && items.some((item) => item.id === parsed.activeId)
      ? parsed.activeId
      : items[0].id
    const exportedFileNames = Array.isArray(parsed.exportedFileNames)
      ? parsed.exportedFileNames.filter((item): item is string => typeof item === 'string')
      : []
    return { activeId, items, exportedFileNames }
  } catch {
    const item = createSavedStoryboard()
    return { activeId: item.id, items: [item], exportedFileNames: [] }
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

function createExportFileName(meta: StoryboardMeta): string {
  const baseName = sanitizeFileName([meta.projectName, meta.deckTitle, meta.versionName].filter(Boolean).join('_'))
  return `${baseName}.pptx`
}

function uniqueProjectNames(projects: ProjectRecord[]): string[] {
  return Array.from(new Set(projects.map((project) => project.name.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ko-KR'),
  )
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

function stripStoredImagePayload(frame: StoryboardFrame): StoryboardFrame {
  if (!frame.thumbnailImageKey) return frame
  return {
    ...frame,
    thumbnailDataUrl: '',
  }
}

function mergeServerFrameKeys(frames: StoryboardFrame[], serverFrames: Array<Record<string, unknown>>): StoryboardFrame[] {
  if (serverFrames.length === 0) return frames
  const serverById = new Map(serverFrames.map((frame) => [String(frame.id ?? ''), frame]))
  return frames.map((frame) => {
    const serverFrame = serverById.get(frame.id)
    if (!serverFrame) return frame
    return {
      ...frame,
      thumbnailImageKey:
        typeof serverFrame.thumbnailImageKey === 'string' ? serverFrame.thumbnailImageKey : frame.thumbnailImageKey,
      thumbnailContentType:
        typeof serverFrame.thumbnailContentType === 'string' ? serverFrame.thumbnailContentType : frame.thumbnailContentType,
    }
  })
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
  if (h <= 0.72) {
    addInlineTextBox(slide, label, value, x, y, w, 0.42, 0.42)
    return
  }

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
    fontSize: SLIDE_TITLE_FONT_SIZE,
    bold: true,
    margin: 0,
  })
  slide.addText(value || '-', {
    x: x + 0.15,
    y: y + 0.5,
    w: w - 0.3,
    h: h - 0.62,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: SLIDE_BODY_FONT_SIZE,
    breakLine: false,
    fit: 'shrink',
    margin: 0.02,
    valign: 'top',
  })
}

function addInlineTextBox(slide: PptxSlide, label: string, value: string, x: number, y: number, w: number, h: number, labelWidth: number) {
  const paddingX = 0.15
  const gap = 0.12
  const bodyX = x + paddingX + labelWidth + gap
  slide.addShape('rect', {
    x,
    y,
    w,
    h,
    fill: { color: COLORS.soft },
    line: { color: 'BFD1F6', width: 1 },
  })
  slide.addText(label, {
    x: x + paddingX,
    y: y + 0.13,
    w: labelWidth,
    h: h - 0.22,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: SLIDE_TITLE_FONT_SIZE,
    bold: true,
    breakLine: false,
    fit: 'shrink',
    margin: 0,
    valign: 'middle',
  })
  slide.addText(value || '-', {
    x: bodyX,
    y: y + 0.1,
    w: w - (bodyX - x) - paddingX,
    h: h - 0.18,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: SLIDE_BODY_FONT_SIZE,
    breakLine: false,
    fit: 'shrink',
    margin: 0,
    valign: 'middle',
  })
}

function summaryText(value: string): string {
  return value.trim().replace(/\r?\n/g, '\n') || '-'
}

function formatSummaryTimecode(value: string): string {
  const parts = parseTimeRange(value)
  return `${parts.startMinute}:${String(parts.startSecond).padStart(2, '0')}~${parts.endMinute}:${String(parts.endSecond).padStart(2, '0')}`
}

function addSummaryTextCell(
  slide: PptxSlide,
  value: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options?: { bold?: boolean; color?: string; fontSize?: number; align?: 'left' | 'center' | 'right' },
) {
  slide.addText(summaryText(value), {
    x: x + 0.06,
    y: y + 0.06,
    w: w - 0.12,
    h: h - 0.12,
    color: options?.color ?? COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: options?.fontSize ?? 5.8,
    bold: options?.bold,
    align: options?.align ?? 'left',
    valign: 'middle',
    margin: 0,
    breakLine: false,
    fit: 'shrink',
  })
}

function addSummaryThumbnailCell(slide: PptxSlide, frame: StoryboardFrame, x: number, y: number, w: number, h: number) {
  const imageBox = { x: x + 0.06, y: y + 0.06, w: w - 0.12, h: h - 0.12 }
  slide.addShape('rect', {
    ...imageBox,
    fill: { color: COLORS.panel },
    line: { color: COLORS.line, width: 0.5 },
  })
  if (!frame.thumbnailDataUrl) {
    slide.addText('썸네일', {
      ...imageBox,
      color: COLORS.muted,
      fontFace: 'Malgun Gothic',
      fontSize: 6,
      bold: true,
      align: 'center',
      valign: 'middle',
      margin: 0,
    })
    return
  }

  const fitted = fitRect(frame.thumbnailWidth ?? 0, frame.thumbnailHeight ?? 0, imageBox)
  slide.addImage({
    data: frame.thumbnailDataUrl,
    x: fitted.x,
    y: fitted.y,
    w: fitted.w,
    h: fitted.h,
    altText: frame.thumbnailName || 'summary thumbnail',
  })
}

function addStoryboardSummarySlide(pptx: PptxGenJS, frames: StoryboardFrame[], meta: StoryboardMeta) {
  const slide = pptx.addSlide()
  slide.background = { color: COLORS.white }
  const visibleFrames = frames.slice(0, 7)
  const pageW = 13.333
  const marginX = 0.32
  const tableX = marginX
  const tableY = 1.18
  const headerH = 0.34
  const rowH = 0.77
  const columns = [
    { key: 'time', label: '시간', w: 0.78 },
    { key: 'thumbnail', label: '비디오\n썸네일', w: 1.28 },
    { key: 'screen', label: '화면구성', w: 3.02 },
    { key: 'copy', label: '자막 / 카피', w: 2.42 },
    { key: 'sound', label: '사운드', w: 1.55 },
    { key: 'purpose', label: '목적', w: 2.98 },
  ]

  slide.addShape('rect', { x: 0, y: 0, w: pageW, h: 0.72, fill: { color: COLORS.ink }, line: { color: COLORS.ink } })
  slide.addText('전체 영상 구조 요약', {
    x: 0.42,
    y: 0.19,
    w: 3.8,
    h: 0.26,
    color: COLORS.white,
    fontFace: 'Malgun Gothic',
    fontSize: 12,
    bold: true,
    margin: 0,
  })
  slide.addText([meta.projectName, meta.versionName].filter(Boolean).join(' / '), {
    x: 6.8,
    y: 0.25,
    w: 6.12,
    h: 0.18,
    color: 'DDE7F5',
    fontFace: 'Malgun Gothic',
    fontSize: 7.5,
    align: 'right',
    margin: 0,
    fit: 'shrink',
  })
  slide.addText(meta.deckTitle || '스토리보드', {
    x: 0.38,
    y: 0.86,
    w: 12.58,
    h: 0.24,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: 14,
    bold: true,
    margin: 0,
    fit: 'shrink',
  })

  let x = tableX
  columns.forEach((column) => {
    slide.addShape('rect', {
      x,
      y: tableY,
      w: column.w,
      h: headerH,
      fill: { color: COLORS.ink },
      line: { color: COLORS.ink, width: 0.6 },
    })
    slide.addText(column.label, {
      x: x + 0.04,
      y: tableY + 0.06,
      w: column.w - 0.08,
      h: headerH - 0.08,
      color: COLORS.white,
      fontFace: 'Malgun Gothic',
      fontSize: 6.2,
      bold: true,
      align: 'center',
      valign: 'middle',
      margin: 0,
      fit: 'shrink',
    })
    x += column.w
  })

  visibleFrames.forEach((frame, rowIndex) => {
    const y = tableY + headerH + rowIndex * rowH
    let cellX = tableX
    columns.forEach((column) => {
      slide.addShape('rect', {
        x: cellX,
        y,
        w: column.w,
        h: rowH,
        fill: { color: rowIndex % 2 === 0 ? COLORS.white : 'F8FBFF' },
        line: { color: COLORS.line, width: 0.45 },
      })
      cellX += column.w
    })

    const [timeCol, thumbCol, screenCol, copyCol, soundCol, purposeCol] = columns
    let contentX = tableX
    addSummaryTextCell(slide, formatSummaryTimecode(frame.timecode), contentX, y, timeCol.w, rowH, { bold: true, color: COLORS.primary, fontSize: 5.8, align: 'center' })
    contentX += timeCol.w
    addSummaryThumbnailCell(slide, frame, contentX, y, thumbCol.w, rowH)
    contentX += thumbCol.w
    addSummaryTextCell(slide, frame.screenComposition, contentX, y, screenCol.w, rowH, { fontSize: 5.4 })
    contentX += screenCol.w
    addSummaryTextCell(slide, frame.copy, contentX, y, copyCol.w, rowH, { bold: true, fontSize: 5.4 })
    contentX += copyCol.w
    addSummaryTextCell(slide, frame.sound, contentX, y, soundCol.w, rowH, { fontSize: 5.2 })
    contentX += soundCol.w
    addSummaryTextCell(slide, frame.purpose, contentX, y, purposeCol.w, rowH, { fontSize: 5.4 })
  })

  const conceptY = tableY + headerH + visibleFrames.length * rowH + 0.13
  slide.addShape('roundRect', {
    x: tableX,
    y: conceptY,
    w: 12.03,
    h: 0.54,
    rectRadius: 0.04,
    fill: { color: COLORS.soft },
    line: { color: 'BFD1F6', width: 0.8 },
  })
  slide.addText('전체 콘셉트', {
    x: tableX + 0.18,
    y: conceptY + 0.18,
    w: 1.08,
    h: 0.14,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: 7.2,
    bold: true,
    margin: 0,
    fit: 'shrink',
  })
  slide.addText('각 신의 시간·썸네일·화면구성·자막/카피·사운드·목적을 한 장에서 검토할 수 있도록 원본 입력값 기준으로 재배치했습니다.', {
    x: tableX + 1.42,
    y: conceptY + 0.17,
    w: 10.38,
    h: 0.16,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: 7.2,
    margin: 0,
    fit: 'shrink',
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
    fontSize: SLIDE_TITLE_FONT_SIZE,
    bold: true,
    margin: 0,
  })
  slide.addText([meta.projectName, meta.versionName].filter(Boolean).join(' / '), {
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
    fontSize: SLIDE_TITLE_FONT_SIZE,
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
    w: 0.92,
    h: 0.14,
    color: COLORS.primary,
    fontFace: 'Malgun Gothic',
    fontSize: SLIDE_TITLE_FONT_SIZE,
    bold: true,
    breakLine: false,
    fit: 'shrink',
    margin: 0,
  })
  slide.addText(frame.timecode || '-', {
    x: 1.54,
    y: 1.05,
    w: 1.28,
    h: 0.22,
    color: COLORS.ink,
    fontFace: 'Malgun Gothic',
    fontSize: SLIDE_BODY_FONT_SIZE,
    bold: true,
    align: 'right',
    breakLine: false,
    fit: 'shrink',
    margin: 0,
  })

  addTextBox(slide, '목적', frame.purpose, 3.35, 0.98, 9.5, 0.72)

  const imageBox = { x: 0.46, y: 1.62, w: 6.65, h: 5.06 }
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
    fontSize: SLIDE_TITLE_FONT_SIZE,
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

  addTextBox(slide, '화면구성', frame.screenComposition, 7.42, 1.62, 5.43, 1.54)
  addTextBox(slide, '자막 / 카피', frame.copy, 7.42, 3.34, 5.43, 1.66)
  addTextBox(slide, '사운드', frame.sound, 7.42, 5.18, 5.43, 1.5)

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

export function StoryboardPptxView({ projects, tasks, configured = false }: StoryboardPptxViewProps) {
  const [initialStore] = useState<StoryboardStore>(() => readStoryboardStore())
  const initialStoryboard = initialStore.items.find((item) => item.id === initialStore.activeId) ?? initialStore.items[0]
  const [savedStoryboards, setSavedStoryboards] = useState<SavedStoryboard[]>(initialStore.items)
  const [exportedFileNames, setExportedFileNames] = useState<string[]>(initialStore.exportedFileNames)
  const [activeStoryboardId, setActiveStoryboardId] = useState(initialStore.activeId)
  const [meta, setMeta] = useState<StoryboardMeta>(initialStoryboard?.meta ?? DEFAULT_META)
  const [frames, setFrames] = useState<StoryboardFrame[]>(initialStoryboard?.frames ?? cloneStarterFrames())
  const [selectedFrameId, setSelectedFrameId] = useState(initialStoryboard?.selectedFrameId ?? initialStoryboard?.frames[0]?.id ?? '')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null)
  const [duplicateExportFileName, setDuplicateExportFileName] = useState<string | null>(null)
  const [notionStoryboards, setNotionStoryboards] = useState<StoryboardDocumentRecord[]>([])
  const [activeNotionId, setActiveNotionId] = useState<string | null>(null)
  const [notionLoading, setNotionLoading] = useState(false)
  const [notionSaving, setNotionSaving] = useState(false)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null)
  const dirtyFrameIdsRef = useRef<Set<string>>(new Set())
  const metaDirtyRef = useRef(false)
  const structureDirtyRef = useRef(false)

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
  const activeWorkingSourceLabel = activeNotionId ? 'DB 저장본' : '웹페이지 자동저장'
  const projectOptions = useMemo(() => {
    const names = uniqueProjectNames(projects)
    if (meta.projectName && !names.includes(meta.projectName)) return [meta.projectName, ...names]
    return names
  }, [meta.projectName, projects])
  const selectedRelatedTask = useMemo(() => tasks.find((task) => task.id === meta.relatedTaskId), [meta.relatedTaskId, tasks])
  const fetchNotionStoryboards = useCallback(async () => {
    if (!configured) return
    setNotionLoading(true)
    try {
      const response = await api<StoryboardListResponse>('/storyboards')
      setNotionStoryboards(response.items)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'DB 저장본을 불러오지 못했습니다.')
    } finally {
      setNotionLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void fetchNotionStoryboards()
  }, [fetchNotionStoryboards])

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
            exportedFileNames,
          }),
        )
        setStorageError(null)
      } catch {
        setStorageError('브라우저 저장공간이 부족해 자동저장하지 못했습니다. 큰 썸네일 이미지를 줄이거나 일부 페이지를 삭제해 주세요.')
      }
    }, STORYBOARD_AUTOSAVE_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [activeStoryboardId, exportedFileNames, savedStoryboards])

  const updateMeta = (key: keyof StoryboardMeta, value: string) => {
    metaDirtyRef.current = true
    setMeta((current) => ({ ...current, [key]: value }))
  }

  const updateProjectName = (value: string) => {
    metaDirtyRef.current = true
    setMeta((current) => ({ ...current, projectName: value, relatedTaskId: '' }))
  }

  const updateRelatedTask = (taskId: string) => {
    metaDirtyRef.current = true
    const task = tasks.find((item) => item.id === taskId)
    setMeta((current) => ({
      ...current,
      relatedTaskId: taskId,
      projectName: task?.projectName ?? current.projectName,
    }))
  }

  const updateFrame = (id: string, patch: Partial<StoryboardFrame>) => {
    dirtyFrameIdsRef.current.add(id)
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
    setActiveNotionId(null)
    dirtyFrameIdsRef.current.clear()
    metaDirtyRef.current = false
    structureDirtyRef.current = false
    setMessage(null)
  }

  const applyNotionStoryboard = (item: StoryboardDocumentRecord) => {
    if (!item) return
    const normalized = normalizeSavedStoryboard({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt ?? new Date().toISOString(),
      meta: {
        ...DEFAULT_META,
        ...(item.data.meta as Partial<StoryboardMeta>),
        projectName: item.projectName ?? String(item.data.meta.projectName ?? ''),
        relatedTaskId: item.projectId ?? String(item.data.meta.relatedTaskId ?? ''),
        versionName: item.versionName ?? String(item.data.meta.versionName ?? ''),
        memo: item.memo ?? String(item.data.meta.memo ?? ''),
      },
      frames: item.data.frames,
      selectedFrameId: String(item.data.frames[0]?.id ?? ''),
    })
    if (!normalized) return

    setActiveNotionId(item.id)
    setActiveStoryboardId(normalized.id)
    setMeta(normalized.meta)
    setFrames(normalized.frames)
    setSelectedFrameId(normalized.selectedFrameId || normalized.frames[0]?.id || '')
    setExportedFileNames(item.exportedFileNames)
    dirtyFrameIdsRef.current.clear()
    metaDirtyRef.current = false
    structureDirtyRef.current = false
    setSavedStoryboards((current) => {
      const next = current.filter((saved) => saved.id !== normalized.id)
      return [normalized, ...next]
    })
    setMessage('DB 저장본을 불러왔습니다.')
  }

  const loadNotionStoryboard = async (storyboardId: string) => {
    const listItem = notionStoryboards.find((storyboard) => storyboard.id === storyboardId)
    if (!listItem) return

    setNotionLoading(true)
    setStorageError(null)
    try {
      const response = await api<StoryboardResponse>(`/storyboards/${encodeURIComponent(storyboardId)}`)
      applyNotionStoryboard(response.item)
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'DB 저장본을 불러오지 못했습니다.')
      applyNotionStoryboard(listItem)
    } finally {
      setNotionLoading(false)
    }
  }

  const saveNotionStoryboard = async () => {
    if (!configured) {
      setStorageError('스토리보드 DB가 연결되면 DB 저장을 사용할 수 있습니다.')
      return
    }
    setNotionSaving(true)
    setStorageError(null)
    try {
      const basePayload = {
        title: createStoryboardDbTitle(meta),
        projectId: selectedRelatedTask?.id || undefined,
        projectName: selectedRelatedTask?.projectName ?? meta.projectName,
        versionName: meta.versionName,
        memo: meta.memo,
        exportedFileNames,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      const fullPayload = {
        ...basePayload,
        data: { meta, frames: frames.map(stripStoredImagePayload) },
      }

      let response: StoryboardResponse
      if (!activeNotionId || structureDirtyRef.current) {
        response = activeNotionId
          ? await api<StoryboardResponse>(`/storyboards/${encodeURIComponent(activeNotionId)}`, {
              method: 'PATCH',
              body: JSON.stringify(fullPayload),
            })
          : await api<StoryboardResponse>('/storyboards', {
              method: 'POST',
              body: JSON.stringify(fullPayload),
            })
      } else {
        response = await api<StoryboardResponse>(`/storyboards/${encodeURIComponent(activeNotionId)}`, {
          method: 'PATCH',
          body: JSON.stringify(basePayload),
        })
        const dirtyFrameIds = Array.from(dirtyFrameIdsRef.current)
        for (const frameId of dirtyFrameIds) {
          const frame = frames.find((item) => item.id === frameId)
          if (!frame) continue
          response = await api<StoryboardResponse>(
            `/storyboards/${encodeURIComponent(activeNotionId)}/frames/${encodeURIComponent(frameId)}`,
            {
              method: 'PATCH',
              body: JSON.stringify(stripStoredImagePayload(frame)),
            },
          )
        }
      }

      setActiveNotionId(response.item.id)
      if (response.item.data.frames.length > 0) {
        setFrames((current) => mergeServerFrameKeys(current, response.item.data.frames))
      }
      setNotionStoryboards((current) => {
        const next = current.filter((item) => item.id !== response.item.id)
        return [response.item, ...next]
      })
      dirtyFrameIdsRef.current.clear()
      metaDirtyRef.current = false
      structureDirtyRef.current = false
      setMessage('DB에 저장했습니다.')
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : 'DB 저장에 실패했습니다.')
    } finally {
      setNotionSaving(false)
    }
  }

  const deleteNotionStoryboard = async () => {
    if (!activeNotionId) return
    if (!window.confirm('현재 DB 저장본을 삭제할까요?')) return
    await api(`/storyboards/${encodeURIComponent(activeNotionId)}`, { method: 'DELETE' })
    setActiveNotionId(null)
    await fetchNotionStoryboards()
    setMessage('DB 저장본을 삭제했습니다.')
  }

  const createNewSavedStoryboard = () => {
    const nextStoryboard = createSavedStoryboard()
    setSavedStoryboards((current) => [nextStoryboard, ...current])
    setActiveStoryboardId(nextStoryboard.id)
    setActiveNotionId(null)
    setMeta(nextStoryboard.meta)
    setFrames(nextStoryboard.frames)
    setSelectedFrameId(nextStoryboard.selectedFrameId)
    dirtyFrameIdsRef.current.clear()
    metaDirtyRef.current = false
    structureDirtyRef.current = false
    setMessage('새 스토리보드를 만들었습니다. 이후 입력 내용은 자동저장됩니다.')
  }

  const deleteSavedStoryboard = () => {
    if (!activeSavedStoryboard) return
    const remaining = savedStoryboards.filter((item) => item.id !== activeSavedStoryboard.id)
    const nextStoryboard = remaining[0] ?? createSavedStoryboard()

    setSavedStoryboards(remaining.length > 0 ? remaining : [nextStoryboard])
    setActiveStoryboardId(nextStoryboard.id)
    setActiveNotionId(null)
    setMeta(nextStoryboard.meta)
    setFrames(nextStoryboard.frames)
    setSelectedFrameId(nextStoryboard.selectedFrameId || nextStoryboard.frames[0]?.id || '')
    dirtyFrameIdsRef.current.clear()
    metaDirtyRef.current = false
    structureDirtyRef.current = false
    setMessage('선택한 저장본을 삭제했습니다.')
  }

  const addFrame = () => {
    structureDirtyRef.current = true
    const nextFrame = createBlankFrame(frames.length)
    setFrames((current) => [...current, nextFrame])
    setSelectedFrameId(nextFrame.id)
  }

  const duplicateFrame = (frame: StoryboardFrame) => {
    structureDirtyRef.current = true
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
    structureDirtyRef.current = true
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
      thumbnailImageKey: undefined,
      thumbnailContentType: undefined,
      screenComposition: '',
      copy: '',
      sound: '',
      purpose: '',
    })
  }

  const attachImageFile = async (frameId: string, file: File | undefined) => {
    if (!file) return

    try {
      const image = await readImageFile(file)
      updateFrame(frameId, {
        thumbnailDataUrl: image.dataUrl,
        thumbnailName: image.name,
        thumbnailWidth: image.width,
        thumbnailHeight: image.height,
        thumbnailImageKey: undefined,
        thumbnailContentType: 'image/jpeg',
      })
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.')
    }
  }

  const onImageChange = async (frameId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    await attachImageFile(frameId, file)
  }

  const onThumbnailDragOver = (frameId: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.dataTransfer.types.includes('Files')) {
      event.dataTransfer.dropEffect = 'copy'
      setDraggingFrameId(frameId)
    }
  }

  const onThumbnailDrop = async (frameId: string, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDraggingFrameId(null)
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'))
    await attachImageFile(frameId, file)
  }

  const exportPptx = async (options?: { bypassDuplicateCheck?: boolean }) => {
    const fileName = createExportFileName(meta)
    if (!options?.bypassDuplicateCheck && exportedFileNames.includes(fileName)) {
      setDuplicateExportFileName(fileName)
      return
    }

    setExporting(true)
    setMessage(null)
    setDuplicateExportFileName(null)
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

      addStoryboardSummarySlide(pptx, frames, meta)
      frames.forEach((frame, index) => addStoryboardSlide(pptx, frame, meta, index, frames.length))

      await pptx.writeFile({ fileName, compression: true })
      setExportedFileNames((current) => (current.includes(fileName) ? current : [...current, fileName]))
      setMessage(`요약 1페이지와 ${frames.length}개 신별 페이지를 포함한 PPTX를 생성했습니다.`)
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
      <p className="storyboardPptxMessage is-neutral">현재 작업 기준: {activeWorkingSourceLabel}</p>

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

      <section className="storyboardPptxSavePanel" aria-label="DB 저장본">
        <div className="storyboardPptxSaveInfo">
          <strong>DB 저장본</strong>
          <span>
            {configured
              ? activeNotionId
                ? '현재 문서가 DB 저장본과 연결되어 있습니다.'
                : 'DB에 저장하면 다른 브라우저에서도 이어서 수정할 수 있습니다.'
              : '스토리보드 DB 연결 전까지는 브라우저 자동저장만 사용합니다.'}
          </span>
        </div>
        <select value={activeNotionId ?? ''} onChange={(event) => void loadNotionStoryboard(event.target.value)} disabled={!configured || notionLoading}>
          <option value="">DB 저장본 선택</option>
          {notionStoryboards.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} {item.versionName ? `· ${item.versionName}` : ''}
            </option>
          ))}
        </select>
        <div className="storyboardPptxSaveActions">
          <Button type="button" variant="secondary" size="mini" onClick={() => void saveNotionStoryboard()} disabled={!configured || notionSaving}>
            {notionSaving ? '저장 중' : 'DB 저장'}
          </Button>
          <Button type="button" variant="secondary" size="mini" onClick={() => void deleteNotionStoryboard()} disabled={!activeNotionId}>
            DB 삭제
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
          <select value={meta.projectName} onChange={(event) => updateProjectName(event.target.value)}>
            <option value="">프로젝트 선택</option>
            {projectOptions.map((projectName) => (
              <option key={projectName} value={projectName}>
                {projectName}
              </option>
            ))}
          </select>
        </label>
        <label className="relatedTaskField">
          관련 업무
          <button type="button" className="relatedTaskPickButton" onClick={() => setTaskPickerOpen(true)}>
            {selectedRelatedTask ? selectedRelatedTask.taskName : '업무 선택'}
          </button>
          {selectedRelatedTask ? (
            <span className="relatedTaskSelectedSummary">
              [{selectedRelatedTask.projectName}] · 담당자 {selectedRelatedTask.assignee.length > 0 ? selectedRelatedTask.assignee.join(', ') : '-'}
            </span>
          ) : null}
        </label>
        <label className="storyboardPptxVersionField">
          버전명
          <input value={meta.versionName} onChange={(event) => updateMeta('versionName', event.target.value)} placeholder="v1, v2, v3" />
        </label>
        <label className="storyboardPptxMemoField">
          메모
          <textarea value={meta.memo} onChange={(event) => updateMeta('memo', event.target.value)} placeholder="내부 참고용 메모" rows={2} />
        </label>
      </section>

      <RelatedTaskPickerModal
        open={taskPickerOpen}
        tasks={tasks}
        selectedTaskId={meta.relatedTaskId}
        projectNameFilter={meta.projectName}
        onClose={() => setTaskPickerOpen(false)}
        onSelect={updateRelatedTask}
      />

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
              <div
                className={draggingFrameId === selectedFrame.id ? 'storyboardPptxThumbnailPreview is-dragging' : 'storyboardPptxThumbnailPreview'}
                onDragEnter={(event) => onThumbnailDragOver(selectedFrame.id, event)}
                onDragOver={(event) => onThumbnailDragOver(selectedFrame.id, event)}
                onDragLeave={() => setDraggingFrameId(null)}
                onDrop={(event) => void onThumbnailDrop(selectedFrame.id, event)}
              >
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

      {duplicateExportFileName ? (
        <div className="storyboardPptxModalBackdrop" role="presentation">
          <section className="storyboardPptxConfirmDialog" role="dialog" aria-modal="true" aria-label="중복 파일명 확인">
            <h3>정말 이 버전명으로 내보내실건가요?</h3>
            <p>
              <mark>{duplicateExportFileName}</mark> 을 이미 내보내기한 기록이 있습니다.
            </p>
            <div className="storyboardPptxConfirmActions">
              <Button type="button" variant="secondary" onClick={() => setDuplicateExportFileName(null)}>
                취소
              </Button>
              <Button type="button" onClick={() => void exportPptx({ bypassDuplicateCheck: true })} disabled={exporting}>
                그래도 내보내기
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
