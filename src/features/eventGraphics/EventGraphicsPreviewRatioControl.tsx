import type { ChangeEvent } from 'react'

export type EventGraphicsPreviewRatio = {
  width: string
  height: string
}

export const EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY = 'event-graphics-preview-ratio:v1'

const DEFAULT_RATIO: EventGraphicsPreviewRatio = { width: '2.33', height: '1' }

export const EVENT_GRAPHICS_PREVIEW_RATIO_PRESETS: Array<EventGraphicsPreviewRatio & { label: string }> = [
  { label: '2.33:1', width: '2.33', height: '1' },
  { label: '2:1', width: '2', height: '1' },
  { label: '16:9', width: '16', height: '9' },
]

function parsePositive(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizePreviewRatio(value: unknown): EventGraphicsPreviewRatio {
  if (!value || typeof value !== 'object') return DEFAULT_RATIO
  const candidate = value as Partial<EventGraphicsPreviewRatio>
  return {
    width: String(parsePositive(candidate.width ?? DEFAULT_RATIO.width, 2.33)),
    height: String(parsePositive(candidate.height ?? DEFAULT_RATIO.height, 1)),
  }
}

export function readStoredPreviewRatio(): EventGraphicsPreviewRatio {
  if (typeof window === 'undefined') return DEFAULT_RATIO
  try {
    const raw = window.localStorage.getItem(EVENT_GRAPHICS_PREVIEW_RATIO_STORAGE_KEY)
    if (!raw) return DEFAULT_RATIO
    return normalizePreviewRatio(JSON.parse(raw))
  } catch {
    return DEFAULT_RATIO
  }
}

export function toPreviewAspectRatioValue(value: EventGraphicsPreviewRatio): string {
  const width = parsePositive(value.width, 2.33)
  const height = parsePositive(value.height, 1)
  return `${width} / ${height}`
}

export function formatPreviewRatioLabel(value: EventGraphicsPreviewRatio): string {
  const width = parsePositive(value.width, 2.33)
  const height = parsePositive(value.height, 1)
  return `${width}:${height}`
}

type EventGraphicsPreviewRatioControlProps = {
  value: EventGraphicsPreviewRatio
  onChange?: (nextValue: EventGraphicsPreviewRatio) => void
  readOnly?: boolean
}

export function EventGraphicsPreviewRatioControl({
  value,
  onChange,
  readOnly = false,
}: EventGraphicsPreviewRatioControlProps) {
  if (readOnly) {
    return (
      <div className="eventGraphicsPreviewRatioControl is-readonly" aria-label="Selected preview ratio">
        <span className="eventGraphicsPreviewRatioValue">{formatPreviewRatioLabel(value)}</span>
      </div>
    )
  }

  const onWidthChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.({ ...value, width: event.target.value })
  }

  const onHeightChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.({ ...value, height: event.target.value })
  }

  return (
    <div className="eventGraphicsPreviewRatioControl" aria-label="Preview ratio control">
      <div className="eventGraphicsPreviewRatioPresets" role="group" aria-label="Preview ratio presets">
        {EVENT_GRAPHICS_PREVIEW_RATIO_PRESETS.map((preset) => {
          const active = value.width === preset.width && value.height === preset.height
          return (
            <button
              key={preset.label}
              type="button"
              className={active ? 'viewTab active' : 'viewTab'}
              aria-pressed={active}
              onClick={() => onChange?.({ width: preset.width, height: preset.height })}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <div className="eventGraphicsPreviewRatioInputs">
        <label>
          <input
            type="number"
            min="0.1"
            step="0.01"
            value={value.width}
            onChange={onWidthChange}
            placeholder="Width"
            aria-label="Width"
          />
        </label>
        <label>
          <input
            type="number"
            min="0.1"
            step="0.01"
            value={value.height}
            onChange={onHeightChange}
            placeholder="Height"
            aria-label="Height"
          />
        </label>
      </div>
    </div>
  )
}
