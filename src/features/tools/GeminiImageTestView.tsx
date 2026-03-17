import { useMemo, useState } from 'react'
import { api } from '../../shared/api/client'
import { Button } from '../../shared/ui'
import './GeminiImageTestView.css'

type GeminiImageTestResponse = {
  ok: boolean
  model: string
  imageDataUrl: string
  imageMimeType: string
  textResponse?: string | null
}

type GeminiImageResult = {
  model: string
  imageDataUrl: string
  imageMimeType: string
  textResponse?: string | null
  width: number
  height: number
}

const TEST_OUTPUT_WIDTH = 600
const TEST_OUTPUT_HEIGHT = 400
const TEST_MODEL = 'gemini-3.1-flash-image'

async function resizeImageDataUrl(dataUrl: string, width: number, height: number): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image()
    next.onload = () => resolve(next)
    next.onerror = () => reject(new Error('generated_image_decode_failed'))
    next.src = dataUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas_context_missing')

  const scale = Math.max(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  const dx = (width - drawWidth) / 2
  const dy = (height - drawHeight) / 2

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#f4f1ea'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, dx, dy, drawWidth, drawHeight)

  return canvas.toDataURL('image/jpeg', 0.72)
}

export function GeminiImageTestView() {
  const [prompt, setPrompt] = useState('A clean product-style still life of a silver key on warm paper, soft studio light')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GeminiImageResult | null>(null)

  const downloadName = useMemo(() => {
    const slug = prompt
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
    return `${slug || 'gemini-test'}-600x400.jpg`
  }, [prompt])

  const onGenerate = async () => {
    if (!prompt.trim()) {
      setError('프롬프트를 한 줄 입력해 주세요.')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const response = await api<GeminiImageTestResponse>('/tools/gemini-image-test/render', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          model: TEST_MODEL,
          aspectRatio: '3:2',
        }),
      })
      const resizedDataUrl = await resizeImageDataUrl(response.imageDataUrl, TEST_OUTPUT_WIDTH, TEST_OUTPUT_HEIGHT)
      setResult({
        model: response.model,
        imageDataUrl: resizedDataUrl,
        imageMimeType: 'image/jpeg',
        textResponse: response.textResponse,
        width: TEST_OUTPUT_WIDTH,
        height: TEST_OUTPUT_HEIGHT,
      })
    } catch (nextError: unknown) {
      setError(nextError instanceof Error ? nextError.message : '테스트 이미지 생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <section className="geminiImageTestView" aria-label="Gemini 이미지 테스트">
      <article className="geminiImageTestHero">
        <div>
          <p className="muted small">Gemini 3.1 Flash Image</p>
          <h2>짧은 프롬프트 테스트</h2>
          <p>프롬프트 한 줄만 넣으면 테스트용 600x400 JPEG로 바로 내려받을 수 있습니다.</p>
        </div>
        <div className="geminiImageTestMeta">
          <span>모델: {TEST_MODEL}</span>
          <span>출력: 600x400 JPEG</span>
        </div>
      </article>

      <div className="geminiImageTestGrid">
        <article className="geminiImageTestCard">
          <label className="geminiImageTestField">
            <span>프롬프트</span>
            <textarea
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="예: Minimal poster-like photo of a yellow lemon on cobalt cloth, dramatic sunlight"
            />
          </label>
          <div className="geminiImageTestActions">
            <Button type="button" onClick={() => void onGenerate()} disabled={isGenerating}>
              {isGenerating ? '생성 중...' : '테스트 이미지 생성'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setPrompt('')
                setResult(null)
                setError(null)
              }}
              disabled={isGenerating}
            >
              초기화
            </Button>
          </div>
          <p className="muted small">배경 이미지나 레퍼런스 없이 Vertex/Gemini 연결만 빠르게 확인하는 내부 도구입니다.</p>
          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className="geminiImageTestCard geminiImageTestResultCard">
          {result ? (
            <>
              <div className="geminiImageTestResultHead">
                <div>
                  <p className="muted small">Generated</p>
                  <h3>{downloadName}</h3>
                  <p className="muted small">
                    {result.model} / {result.width}x{result.height}
                  </p>
                </div>
                <a className="linkButton" href={result.imageDataUrl} download={downloadName}>
                  다운로드
                </a>
              </div>
              <div className="geminiImageTestFrame">
                <img src={result.imageDataUrl} alt="Gemini 테스트 생성 결과" />
              </div>
              {result.textResponse ? <p className="muted small">{result.textResponse}</p> : null}
            </>
          ) : (
            <div className="geminiImageTestEmpty">
              <strong>아직 생성된 결과가 없습니다.</strong>
              <p className="muted small">왼쪽에 프롬프트 한 줄을 넣고 바로 테스트하면 됩니다.</p>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
