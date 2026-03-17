import { useMemo, useState, type ChangeEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button } from '../../shared/ui'
import './VideoThumbnailTool.css'

type VideoThumbnailToolProps = {
  suggestedTitle?: string
}

type ThumbnailFormState = {
  eventName: string
  versionNumber: string
  model: string
  outputFormats: string[]
  dateText: string
  locationText: string
  subtitleText: string
  supportText: string
  titleFont: string
  detailFont: string
  fontDirection: string
  compositionNotes: string
  customPrompt: string
}

type UploadedImage = {
  name: string
  mimeType: string
  dataUrl: string
}

type ThumbnailRenderItem = {
  aspectRatio: string
  model: string
  imageDataUrl: string
  imageMimeType: string
  textResponse?: string | null
}

type ThumbnailRenderResponse = {
  ok: boolean
  renders: ThumbnailRenderItem[]
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MODEL_OPTIONS = [
  { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview' },
  { value: 'gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image Preview' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]
const OUTPUT_FORMAT_OPTIONS = [
  { value: '9:16', label: '릴스형 (9:16)' },
  { value: '16:9', label: '유튜브형 (16:9)' },
]

function buildInitialFormState(suggestedTitle?: string): ThumbnailFormState {
  return {
    eventName: suggestedTitle?.trim() || '',
    versionNumber: '01',
    model: MODEL_OPTIONS[0]?.value ?? 'gemini-3.1-flash-image-preview',
    outputFormats: ['16:9'],
    dateText: '',
    locationText: '',
    subtitleText: '',
    supportText: '',
    titleFont: '',
    detailFont: '',
    fontDirection: '',
    compositionNotes: '',
    customPrompt: '',
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      if (!value) {
        reject(new Error('파일 데이터가 비어 있습니다.'))
        return
      }
      resolve(value)
    }
    reader.readAsDataURL(file)
  })
}

async function readImageFile(file: File): Promise<UploadedImage> {
  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error('PNG, JPG, WEBP 이미지만 업로드할 수 있습니다.')
  }

  return {
    name: file.name,
    mimeType: file.type,
    dataUrl: await readFileAsDataUrl(file),
  }
}

function toDownloadName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'video-thumbnail'
}

function toFileExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/webp') return 'webp'
  return 'png'
}

function toVersionLabel(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 2)
  if (!digits) return '01'
  return digits.padStart(2, '0')
}

function toFormatSuffix(value: string): string {
  if (value === '9:16') return 'reels'
  return 'youtube'
}

export function VideoThumbnailTool({ suggestedTitle }: VideoThumbnailToolProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<ThumbnailFormState>(() => buildInitialFormState(suggestedTitle))
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null)
  const [styleReferenceImages, setStyleReferenceImages] = useState<UploadedImage[]>([])
  const [isPreparing, setIsPreparing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ThumbnailRenderItem[]>([])

  const downloadBaseName = useMemo(
    () => `${toDownloadName(form.eventName)}_thumbnail_v${toVersionLabel(form.versionNumber)}`,
    [form.eventName, form.versionNumber],
  )

  const onChangeField = (key: keyof ThumbnailFormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const onToggleOutputFormat = (value: string, checked: boolean) => {
    setForm((current) => ({
      ...current,
      outputFormats: checked
        ? Array.from(new Set([...current.outputFormats, value]))
        : current.outputFormats.filter((entry) => entry !== value),
    }))
  }

  const onBackgroundChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setIsPreparing(true)
    try {
      const nextImage = await readImageFile(file)
      setBackgroundImage(nextImage)
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : '배경 이미지를 읽지 못했습니다.')
    } finally {
      setIsPreparing(false)
      event.target.value = ''
    }
  }

  const onStyleReferencesChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return

    setError(null)
    setIsPreparing(true)
    try {
      const nextImages = await Promise.all(files.map((file) => readImageFile(file)))
      setStyleReferenceImages(nextImages)
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : '레퍼런스 이미지를 읽지 못했습니다.')
    } finally {
      setIsPreparing(false)
      event.target.value = ''
    }
  }

  const onGenerate = async () => {
    if (!form.eventName.trim()) {
      setError('행사명은 입력해 주세요.')
      return
    }

    if (form.outputFormats.length === 0) {
      setError('최소 1개의 출력 형식을 선택해 주세요.')
      return
    }

    setError(null)
    setIsGenerating(true)
    try {
      const response = await api<ThumbnailRenderResponse>('/event-graphics/video-thumbnail/render', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          backgroundImage,
          styleReferenceImages,
        }),
      })
      setResult(response.renders)
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : '썸네일 생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <article className={`eventGraphicsThumbnailTool${isOpen ? ' is-open' : ''}`} aria-label="비디오 썸네일 도구">
      <button
        type="button"
        className="eventGraphicsThumbnailHandle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        비디오 썸네일
      </button>

      {isOpen ? (
        <div className="eventGraphicsThumbnailPanel">
          <div className="eventGraphicsThumbnailHead">
            <div>
              <p className="muted small">Internal Only</p>
              <h3>레퍼런스 기반 비디오 썸네일</h3>
              <p className="muted">
                배경 이미지와 스타일 레퍼런스를 같이 넣고, 행사 텍스트와 폰트 지시를 합쳐 Gemini 이미지 생성으로 썸네일을 만듭니다.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="mini"
              onClick={() => {
                setForm(buildInitialFormState(suggestedTitle))
                setBackgroundImage(null)
                setStyleReferenceImages([])
                setResult([])
                setError(null)
              }}
            >
              초기화
            </Button>
          </div>

          <div className="eventGraphicsThumbnailGrid">
            <section className="eventGraphicsThumbnailCard">
              <h4>입력</h4>
              <div className="eventGraphicsThumbnailForm">
                <label>
                  버전
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={form.versionNumber}
                    onChange={(event) => onChangeField('versionNumber', event.target.value)}
                    placeholder="01"
                  />
                </label>
                <label>
                  행사명
                  <input
                    type="text"
                    value={form.eventName}
                    onChange={(event) => onChangeField('eventName', event.target.value)}
                    placeholder="IZEN Seminar in Bangkok"
                  />
                </label>
                <label>
                  Gemini 모델
                  <select value={form.model} onChange={(event) => onChangeField('model', event.target.value)}>
                    {MODEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  출력 형식
                  <div className="eventGraphicsThumbnailFormatChecks">
                    {OUTPUT_FORMAT_OPTIONS.map((option) => (
                      <label key={option.value} className="eventGraphicsThumbnailFormatCheck">
                        <input
                          type="checkbox"
                          checked={form.outputFormats.includes(option.value)}
                          onChange={(event) => onToggleOutputFormat(option.value, event.target.checked)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label>
                  날짜
                  <input
                    type="text"
                    value={form.dateText}
                    onChange={(event) => onChangeField('dateText', event.target.value)}
                    placeholder="March 21-22, 2026"
                  />
                </label>
                <label>
                  장소
                  <input
                    type="text"
                    value={form.locationText}
                    onChange={(event) => onChangeField('locationText', event.target.value)}
                    placeholder="Bangkok, Thailand"
                  />
                </label>
                <label>
                  서브 텍스트
                  <input
                    type="text"
                    value={form.subtitleText}
                    onChange={(event) => onChangeField('subtitleText', event.target.value)}
                    placeholder="Second Office Course"
                  />
                </label>
                <label>
                  추가 텍스트
                  <input
                    type="text"
                    value={form.supportText}
                    onChange={(event) => onChangeField('supportText', event.target.value)}
                    placeholder="등록 마감 / 연자명 / CTA 등"
                  />
                </label>
                <label>
                  제목 폰트 지시
                  <input
                    type="text"
                    value={form.titleFont}
                    onChange={(event) => onChangeField('titleFont', event.target.value)}
                    placeholder="굵고 응축된 산세리프"
                  />
                </label>
                <label>
                  본문 폰트 지시
                  <input
                    type="text"
                    value={form.detailFont}
                    onChange={(event) => onChangeField('detailFont', event.target.value)}
                    placeholder="가독성 높은 산세리프"
                  />
                </label>
                <label>
                  폰트/배치 메모
                  <textarea
                    value={form.fontDirection}
                    onChange={(event) => onChangeField('fontDirection', event.target.value)}
                    rows={3}
                    placeholder="제목은 좌상단, 날짜/장소는 우하단. 글자 간격 좁게. 모바일에서도 읽히게."
                  />
                </label>
                <label>
                  배경/구도 메모
                  <textarea
                    value={form.compositionNotes}
                    onChange={(event) => onChangeField('compositionNotes', event.target.value)}
                    rows={3}
                    placeholder="배경은 교체하되 의료 세미나 톤 유지, 중앙 피사체 방해 없이 텍스트 영역 확보."
                  />
                </label>
                <label>
                  추가 프롬프트
                  <textarea
                    value={form.customPrompt}
                    onChange={(event) => onChangeField('customPrompt', event.target.value)}
                    rows={4}
                    placeholder="더 강조하고 싶은 톤, 금지 요소, 색감, 질감 등을 자유롭게 입력"
                  />
                </label>
              </div>
            </section>

            <section className="eventGraphicsThumbnailCard">
              <h4>이미지 참조</h4>
              <div className="eventGraphicsThumbnailUploads">
                <label className="eventGraphicsThumbnailUpload">
                  <span>배경 이미지 교체용</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onBackgroundChange} />
                </label>
                {backgroundImage ? (
                  <div className="eventGraphicsThumbnailPreview">
                    <img src={backgroundImage.dataUrl} alt={backgroundImage.name} />
                    <div>
                      <strong>{backgroundImage.name}</strong>
                      <p className="muted small">현재 배경 베이스로 사용</p>
                    </div>
                  </div>
                ) : (
                  <p className="muted small">배경 이미지는 비워 둘 수 있지만, 넣어두면 교체 기준이 더 명확해집니다.</p>
                )}

                <label className="eventGraphicsThumbnailUpload">
                  <span>스타일 레퍼런스 이미지</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onStyleReferencesChange} />
                </label>
                {styleReferenceImages.length > 0 ? (
                  <div className="eventGraphicsThumbnailReferenceList">
                    {styleReferenceImages.map((image) => (
                      <div key={image.name} className="eventGraphicsThumbnailReferenceItem">
                        <img src={image.dataUrl} alt={image.name} />
                        <span>{image.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">레퍼런스 이미지를 넣으면 색감, 타이포 톤, 구도 감을 더 강하게 따라갑니다.</p>
                )}

                <div className="eventGraphicsThumbnailActions">
                  <Button type="button" variant="secondary" size="mini" onClick={() => setBackgroundImage(null)} disabled={!backgroundImage}>
                    배경 비우기
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="mini"
                    onClick={() => setStyleReferenceImages([])}
                    disabled={styleReferenceImages.length === 0}
                  >
                    레퍼런스 비우기
                  </Button>
                </div>
              </div>
            </section>
          </div>

          <div className="eventGraphicsThumbnailFooter">
            <div>
              <p className="muted small">
                선택한 형식 수만큼 같은 입력값과 같은 레퍼런스를 기준으로 한 번에 생성합니다.
              </p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <Button type="button" onClick={() => void onGenerate()} disabled={isPreparing || isGenerating}>
              {isPreparing ? '이미지 준비 중...' : isGenerating ? '썸네일 생성 중...' : '썸네일 생성'}
            </Button>
          </div>

          {result.length > 0 ? (
            <div className="eventGraphicsThumbnailResultList">
              {result.map((item) => {
                const downloadName = `${downloadBaseName}_${toFormatSuffix(item.aspectRatio)}.${toFileExtension(item.imageMimeType)}`
                return (
                  <section key={`${item.aspectRatio}-${item.model}`} className="eventGraphicsThumbnailResult">
                    <div className="eventGraphicsThumbnailResultHead">
                      <div>
                        <p className="muted small">Generated</p>
                        <h4>{downloadName}</h4>
                        <p className="muted small">
                          {item.aspectRatio} / model: {item.model}
                        </p>
                      </div>
                      <a className="linkButton" href={item.imageDataUrl} download={downloadName}>
                        다운로드
                      </a>
                    </div>
                    <div className="eventGraphicsThumbnailResultFrame">
                      <img src={item.imageDataUrl} alt={`생성된 비디오 썸네일 ${item.aspectRatio}`} />
                    </div>
                    {item.textResponse ? <p className="muted small">{item.textResponse}</p> : null}
                  </section>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
