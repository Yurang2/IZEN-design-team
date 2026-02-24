import { useEffect, useRef, type ReactNode } from 'react'

type ModalProps = {
  open: boolean
  onClose: () => void
  className?: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, className, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusFirstElement = () => {
      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      const target = focusables[0] ?? dialog
      target.focus()
    }

    const rafId = window.requestAnimationFrame(focusFirstElement)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null

      if (event.shiftKey) {
        if (!active || active === first || !dialog.contains(active)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', onKeyDown)
      previousFocused?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  const modalClassName = ['modal', className ?? ''].filter(Boolean).join(' ')

  return (
    <div className="modalBackdrop" role="presentation" onClick={onClose}>
      <div className={modalClassName} role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
