import { type ReactNode } from 'react'

type StatusTone = 'gray' | 'red' | 'blue' | 'green'

type BadgeProps = {
  tone?: StatusTone
  className?: string
  children: ReactNode
}

type PillProps = {
  className?: string
  children: ReactNode
}

export function Badge({ tone = 'gray', className, children }: BadgeProps) {
  const classes = [`statusPill tone-${tone}`, className ?? ''].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}

export function Pill({ className, children }: PillProps) {
  const classes = ['pill', className ?? ''].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}
