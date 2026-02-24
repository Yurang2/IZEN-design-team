import { type ReactNode } from 'react'

type TableWrapProps = {
  className?: string
  children: ReactNode
}

export function TableWrap({ className, children }: TableWrapProps) {
  const classes = ['tableWrap', className ?? ''].filter(Boolean).join(' ')
  return <div className={classes}>{children}</div>
}
