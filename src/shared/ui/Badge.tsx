import { type ReactNode } from 'react'

type StatusTone = 'gray' | 'red' | 'blue' | 'green'

const NOTION_STATUS_COLORS = new Set(['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'])

type BadgeProps = {
  tone?: StatusTone
  notionColor?: string
  className?: string
  children: ReactNode
}

type PillProps = {
  className?: string
  children: ReactNode
}

function toNotionColorClass(notionColor: string | undefined): string {
  const normalized = (notionColor ?? '').trim().toLowerCase()
  if (!normalized || !NOTION_STATUS_COLORS.has(normalized)) return ''
  return `notion-${normalized}`
}

export function Badge({ tone = 'gray', notionColor, className, children }: BadgeProps) {
  const classes = [`statusPill tone-${tone}`, toNotionColorClass(notionColor), className ?? ''].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}

export function Pill({ className, children }: PillProps) {
  const classes = ['pill', className ?? ''].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}
