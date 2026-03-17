import { useMemo, useState, type ChangeEvent } from 'react'
import { api } from '../../shared/api/client'
import { Button } from '../../shared/ui'

type VideoThumbnailToolProps = {
  suggestedTitle?: string
}

type ThumbnailFormState = {
  outputSlug: string
  eventName: string
  dateText: string
  locationText: string
  subtitleText: string
  supportText: string
  titleFont: string
  detailFont: string
  fontDirection: string
  compositionNotes: string
  customPrompt: string
  aspectRatio: string
}

type UploadedImage = {
  name: string
  mimeType: string
  dataUrl: string
}

type ThumbnailRenderResponse = {
  ok: boolean
  model: string
  imageDataUrl: string
  imageMimeType: string
  textResponse?: string | null
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function buildInitialFormState(suggestedTitle?: string): ThumbnailFormState {
  return {
    outputSlug: 'video-thumbnail',
    eventName: suggestedTitle?.trim() || '',
    dateText: '',
    locationText: '',
    subtitleText: '',
    supportText: '',
    titleFont: '',
    detailFont: '',
    fontDirection: '',
    compositionNotes: '',
    customPrompt: '',
    aspectRatio: '16:9',
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

export function VideoThumbnailTool({ suggestedTitle }: VideoThumbnailToolProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [form, setForm] = useState<ThumbnailFormState>(() => buildInitialFormState(suggestedTitle))
  const [backgroundImage, setBackgroundImage] = useState<UploadedImage | null>(null)
  const [styleReferenceImages, setStyleReferenceImages] = useState<UploadedImage[]>([])
  const [isPreparing, setIsPreparing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ThumbnailRenderResponse | null>(null)

  const downloadName = useMemo(() => {
    const extension = result ? toFileExtension(result.imageMimeType) : 'png'
    return `${toDownloadName(form.outputSlug)}.${extension}`
  }, [form.outputSlug, result])

  const onChangeField = (key: keyof ThumbnailFormState, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value,
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
      setResult(response)
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
                setResult(null)
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
                  URL / 출력 이름
                  <input
                    type="text"
                    value={form.outputSlug}
                    onChange={(event) => onChangeField('outputSlug', event.target.value)}
                    placeholder="video-thumbnail"
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
                <label>
                  비율
                  <select value={form.aspectRatio} onChange={(event) => onChangeField('aspectRatio', event.target.value)}>
                    <option value="16:9">16:9</option>
                    <option value="1:1">1:1</option>
                    <option value="9:16">9:16</option>
                    <option value="4:5">4:5</option>
                  </select>
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
                생성 전에 값만 저장해 두는 기능은 없습니다. Google API 키를 넣기 전에는 생성 시 설정 오류가 날 수 있습니다.
              </p>
              {error ? <p className="error">{error}</p> : null}
            </div>
            <Button type="button" onClick={() => void onGenerate()} disabled={isPreparing || isGenerating}>
              {isPreparing ? '이미지 준비 중...' : isGenerating ? '썸네일 생성 중...' : '썸네일 생성'}
            </Button>
          </div>

          {result ? (
            <section className="eventGraphicsThumbnailResult">
              <div className="eventGraphicsThumbnailResultHead">
                <div>
                  <p className="muted small">Generated</p>
                  <h4>{downloadName}</h4>
                  <p className="muted small">model: {result.model}</p>
                </div>
                <a className="linkButton" href={result.imageDataUrl} download={downloadName}>
                  다운로드
                </a>
              </div>
              <div className="eventGraphicsThumbnailResultFrame">
                <img src={result.imageDataUrl} alt="생성된 비디오 썸네일" />
              </div>
              {result.textResponse ? <p className="muted small">{result.textResponse}</p> : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
