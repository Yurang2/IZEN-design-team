import { type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  className?: string
  children: ReactNode
}

export function Modal({ open, onClose, className, children }: ModalProps) {
  if (!open) return null

  const modalClassName = ['modal', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div className={modalClassName} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
