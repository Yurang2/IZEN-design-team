type SkeletonProps = {
  width?: string
  height?: string
  className?: string
}

export function Skeleton({ width = '100%', height = '14px', className }: SkeletonProps) {
  const classes = ['skeleton', className ?? ''].filter(Boolean).join(' ')
  return <span className={classes} style={{ width, height }} aria-hidden="true" />
}
