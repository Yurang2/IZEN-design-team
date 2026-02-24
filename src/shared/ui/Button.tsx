import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'md' | 'mini'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon, className, children, ...props }: ButtonProps) {
  const classes = [
    variant === 'secondary' ? 'secondary' : '',
    size === 'mini' ? 'mini' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...props} className={classes || undefined}>
      {icon ? <span className="uiIcon">{icon}</span> : null}
      {children}
    </button>
  )
}
