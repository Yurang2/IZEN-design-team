import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button, UiGlyph } from '../../shared/ui'
import type { ShotSlot } from './photoGuideData'

function isAcceptedImage(file: File): boolean {
  const mimeType = (file.type || '').toLowerCase()
  return mimeType.startsWith('image/')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '이미지 업로드에 실패했습니다.'
}

type GeminiImageResponse = {
  ok: boolean
  model: string
  imageDataUrl: string
  imageMimeType: string
}

function buildDefaultPrompt(slot: ShotSlot): string {
  const summary = slot.description.trim() || slot.title.trim()
  return [
    'Create a realistic documentary-style event photo reference.',
    `Shot title: ${slot.title.trim() || 'Untitled shot'}.`,
    `Shot brief: ${summary || 'Event reaction shot.'}.`,
    'Requirements: 3:2 aspect ratio, natural human expressions, conference/photojournalistic composition, no text, no watermark.',
  ].join(' ')
}

async function dataUrlToFile(dataUrl: string, name: string, mimeType: string): Promise<File> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], name, { type: mimeType || 'image/png' })
}

export function ShotSlotCard({
  slot,
  readonly = false,
  onUploadImage,
}: {
  slot: ShotSlot
  readonly?: boolean
  onUploadImage?: (slotId: string, file: File) => Promise<void>
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [prompt, setPrompt] = useState(() => buildDefaultPrompt(slot))
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null)
  const previewRef = useRef<string | null>(null)

  const resetLocalPreview = () => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setLocalPreviewUrl(null)
  }

  const updateLocalPreview = (nextUrl: string | null) => {
    if (previewRef.current && previewRef.current !== nextUrl) {
      URL.revokeObjectURL(previewRef.current)
    }
    previewRef.current = nextUrl
    setLocalPreviewUrl(nextUrl)
  }

  useEffect(() => {
    if (slot.image?.url && previewRef.current) {
      resetLocalPreview()
      setUploadMessage(null)
    }
  }, [slot.image?.url])

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!generatorOpen) {
      setPrompt(buildDefaultPrompt(slot))
    }
  }, [generatorOpen, slot.description, slot.title])

  const uploadSelectedFile = async (file: File | null | undefined) => {
    if (!file || readonly || !onUploadImage || isUploading) return
    if (!isAcceptedImage(file)) {
      setUploadMessage('이미지 파일만 업로드할 수 있습니다.')
      return
    }

    updateLocalPreview(URL.createObjectURL(file))
    setIsUploading(true)
    setUploadMessage(null)

    try {
      await onUploadImage(slot.id, file)
      setUploadMessage('이미지를 업로드했습니다.')
    } catch (error: unknown) {
      resetLocalPreview()
      setUploadMessage(toErrorMessage(error))
    } finally {
      setIsUploading(false)
    }
  }

  const onGenerateImage = async () => {
    if (readonly || !onUploadImage || isGenerating || isUploading) return
    if (!prompt.trim()) {
      setUploadMessage('생성 프롬프트를 먼저 입력해 주세요.')
      return
    }

    setIsGenerating(true)
    setUploadMessage(null)

    try {
      const generated = await api<GeminiImageResponse>('/tools/gemini-image-test/render', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          aspectRatio: '3:2',
        }),
      })

      const safeName = (slot.title.trim() || 'shot-slot')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
      const generatedFile = await dataUrlToFile(
        generated.imageDataUrl,
        `${safeName || 'shot-slot'}-generated.png`,
        generated.imageMimeType,
      )
      await uploadSelectedFile(generatedFile)
      setGeneratorOpen(false)
    } catch (error: unknown) {
      setUploadMessage(error instanceof Error ? error.message : '이미지 생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const onChangeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    try {
      await uploadSelectedFile(event.target.files?.[0])
    } finally {
      event.target.value = ''
    }
  }

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (readonly || !onUploadImage || isUploading) return
    setIsDragging(true)
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (readonly || !onUploadImage || isUploading) return
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setIsDragging(false)
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    await uploadSelectedFile(event.dataTransfer.files?.[0])
  }

  const displayImageUrl = localPreviewUrl ?? slot.image?.url ?? null

  return (
    <article className="shotSlotCard">
      <div
        className={`shotSlotThumb${displayImageUrl ? '' : ' is-empty'}${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(event) => void onDrop(event)}
      >
        <span className="shotSlotAspect">3:2</span>
        {displayImageUrl ? (
          <img src={displayImageUrl} alt={slot.title} loading="lazy" />
        ) : (
          <div className="shotSlotPlaceholder">
            <span className="shotSlotPlaceholderIcon" aria-hidden="true">
              <UiGlyph name="plus" />
            </span>
            <strong>이미지 슬롯</strong>
            <span>드래그앤드롭 또는 클릭 업로드</span>
          </div>
        )}

        {!readonly && onUploadImage ? (
          <label className={`shotSlotUploadAction${isUploading ? ' is-disabled' : ''}`}>
            <input type="file" accept="image/*" disabled={isUploading} onChange={(event) => void onChangeFile(event)} />
            {isUploading ? '업로드 중...' : displayImageUrl ? '이미지 교체' : '이미지 추가'}
          </label>
        ) : null}

        {isDragging ? <div className="shotSlotDropOverlay">여기에 이미지를 놓으면 바로 업로드합니다.</div> : null}
      </div>

      <div className="shotSlotBody">
        <div className="shotSlotBodyHead">
          <h3>{slot.title}</h3>
          {!readonly && slot.url ? (
            <a className="linkButton secondary mini" href={slot.url} target="_blank" rel="noreferrer">
              Notion row
            </a>
          ) : null}
        </div>
        <p>{slot.description || '컷 설명을 추가하면 이 슬롯의 의도와 필요한 구도를 바로 확인할 수 있습니다.'}</p>
        {!readonly && onUploadImage ? (
          <div className="shotSlotActionRow">
            <Button type="button" variant="secondary" size="mini" onClick={() => setGeneratorOpen((current) => !current)} disabled={isUploading || isGenerating}>
              {generatorOpen ? '생성 닫기' : '이미지 생성'}
            </Button>
          </div>
        ) : null}
        {generatorOpen ? (
          <div className="shotSlotGeneratePanel">
            <label className="shotSlotGenerateField">
              <span>생성 프롬프트</span>
              <textarea
                rows={4}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="이 컷 설명을 기반으로 생성할 이미지 프롬프트를 적어주세요."
              />
            </label>
            <div className="shotSlotActionRow">
              <Button type="button" variant="secondary" size="mini" onClick={() => setGeneratorOpen(false)} disabled={isGenerating}>
                취소
              </Button>
              <Button type="button" size="mini" onClick={() => void onGenerateImage()} disabled={isGenerating || isUploading}>
                {isGenerating ? '생성 중...' : '생성 후 업로드'}
              </Button>
            </div>
          </div>
        ) : null}
        {uploadMessage ? <span className="shotSlotMessage">{uploadMessage}</span> : null}
      </div>
    </article>
  )
}
