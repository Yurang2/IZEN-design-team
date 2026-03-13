import { useEffect, useState } from 'react'

type EventGraphicsPreviewMediaProps = {
  src: string
  alt: string
  className: string
  noPreviewText: string
}

function isImageUrl(value: string | null): boolean {
  if (!value) return false
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|#|$)/i.test(value)
}

export function isVideoUrl(value: string | null): boolean {
  if (!value) return false
  return /\.(mp4|mov|m4v|webm|ogg)(\?|#|$)/i.test(value)
}

export function hasVisualPreviewUrl(value: string | null): boolean {
  return isImageUrl(value) || isVideoUrl(value)
}

function VideoFramePreview({
  src,
  alt,
  className,
  noPreviewText,
}: EventGraphicsPreviewMediaProps) {
  const [posterUrl, setPosterUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrlToRevoke: string | null = null
    const video = document.createElement('video')

    const cleanup = () => {
      video.pause()
      video.removeAttribute('src')
      video.load()
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke)
    }

    const capture = () => {
      if (!active) return
      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) {
        setFailed(true)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        setFailed(true)
        return
      }

      context.drawImage(video, 0, 0, width, height)
      setPosterUrl(canvas.toDataURL('image/jpeg', 0.82))
    }

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    video.onloadeddata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      const targetTime = duration > 1 ? Math.min(1, Math.max(0.1, duration * 0.1)) : 0

      if (targetTime <= 0) {
        capture()
        return
      }

      video.onseeked = () => capture()
      try {
        video.currentTime = targetTime
      } catch {
        capture()
      }
    }

    video.onerror = async () => {
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error('video_fetch_failed')
        const blob = await response.blob()
        objectUrlToRevoke = URL.createObjectURL(blob)
        video.src = objectUrlToRevoke
      } catch {
        if (active) setFailed(true)
      }
    }

    video.src = src

    return () => {
      active = false
      cleanup()
    }
  }, [src])

  if (failed || !posterUrl) {
    return <div className="eventGraphicsPreviewPlaceholder">{noPreviewText}</div>
  }

  return (
    <div className={className}>
      <img className="eventGraphicsPreviewMedia" src={posterUrl} alt={alt} loading="lazy" />
    </div>
  )
}

export function EventGraphicsPreviewMedia({
  src,
  alt,
  className,
  noPreviewText,
}: EventGraphicsPreviewMediaProps) {
  if (isImageUrl(src)) {
    return (
      <div className={className}>
        <img className="eventGraphicsPreviewMedia" src={src} alt={alt} loading="lazy" />
      </div>
    )
  }

  if (isVideoUrl(src)) {
    return <VideoFramePreview src={src} alt={alt} className={className} noPreviewText={noPreviewText} />
  }

  return <div className="eventGraphicsPreviewPlaceholder">{noPreviewText}</div>
}
