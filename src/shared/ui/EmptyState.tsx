import { Button } from './Button'

type EmptyStateAction = {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

type EmptyStateProps = {
  title?: string
  message: string
  actions?: EmptyStateAction[]
  className?: string
}

export function EmptyState({ title, message, actions, className }: EmptyStateProps) {
  const classes = ['emptyState', className ?? ''].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      {title ? <strong className="emptyStateTitle">{title}</strong> : null}
      <p className="muted">{message}</p>
      {actions?.length ? (
        <div className="emptyStateActions">
          {actions.map((action) => (
            <Button key={action.label} type="button" variant={action.variant ?? 'secondary'} onClick={action.onClick}>
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
