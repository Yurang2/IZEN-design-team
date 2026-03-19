import { type JSX } from 'react'

export type UiGlyphName =
  | 'grid'
  | 'list'
  | 'calendar'
  | 'checksquare'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'external'
  | 'refresh'
  | 'pulse'
  | 'download'
  | 'plus'
  | 'search'
  | 'board'
  | 'kanban'

export function UiGlyph({ name }: { name: UiGlyphName }): JSX.Element {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  if (name === 'grid') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" rx="1" {...common} />
        <rect x="9" y="2" width="5" height="5" rx="1" {...common} />
        <rect x="2" y="9" width="5" height="5" rx="1" {...common} />
        <rect x="9" y="9" width="5" height="5" rx="1" {...common} />
      </svg>
    )
  }
  if (name === 'list') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 4h10" {...common} />
        <path d="M4 8h10" {...common} />
        <path d="M4 12h10" {...common} />
        <circle cx="2" cy="4" r="0.7" fill="currentColor" />
        <circle cx="2" cy="8" r="0.7" fill="currentColor" />
        <circle cx="2" cy="12" r="0.7" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'board') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
        <rect x="6.4" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
        <rect x="10.8" y="2.5" width="3.2" height="11" rx="0.8" {...common} />
      </svg>
    )
  }
  if (name === 'kanban') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2.5" width="12" height="11" rx="1.1" {...common} />
        <path d="M6 2.5v11" {...common} />
        <path d="M10 2.5v11" {...common} />
        <path d="M2 6.5h12" {...common} />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" {...common} />
        <path d="M2 6.5h12" {...common} />
        <path d="M5 2v3" {...common} />
        <path d="M11 2v3" {...common} />
      </svg>
    )
  }
  if (name === 'checksquare') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="2" {...common} />
        <path d="M5 8.2l2.1 2.1L11.3 6" {...common} />
      </svg>
    )
  }
  if (name === 'chevronLeft') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10.5 3.5L6 8l4.5 4.5" {...common} />
      </svg>
    )
  }
  if (name === 'chevronRight') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5.5 3.5L10 8l-4.5 4.5" {...common} />
      </svg>
    )
  }
  if (name === 'chevronDown') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3.5 6l4.5 4.5L12.5 6" {...common} />
      </svg>
    )
  }
  if (name === 'external') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M9.5 2h4.5v4.5" {...common} />
        <path d="M14 2L7.8 8.2" {...common} />
        <path d="M7 3.5H4a2 2 0 0 0-2 2V12a2 2 0 0 0 2 2h6.5a2 2 0 0 0 2-2v-3" {...common} />
      </svg>
    )
  }
  if (name === 'refresh') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.2 8a5.2 5.2 0 1 1-1.2-3.3" {...common} />
        <path d="M13.4 2.8v3.4H10" {...common} />
      </svg>
    )
  }
  if (name === 'pulse') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" {...common} />
        <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'download') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 2.5v7" {...common} />
        <path d="M5.2 7.7L8 10.5l2.8-2.8" {...common} />
        <path d="M2.5 13.5h11" {...common} />
      </svg>
    )
  }
  if (name === 'plus') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3v10" {...common} />
        <path d="M3 8h10" {...common} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" {...common} />
      <path d="M10.5 10.5L14 14" {...common} />
    </svg>
  )
}
