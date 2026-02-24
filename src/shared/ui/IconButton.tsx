import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: ReactNode
  'aria-label': string
}

export function IconButton({ icon, className, ...props }: IconButtonProps) {
  const classes = ['iconButton', className ?? ''].filter(Boolean).join(' ')
  return (
    <button {...props} className={classes}>
      <span className="uiIcon">{icon}</span>
    </button>
  )
}
