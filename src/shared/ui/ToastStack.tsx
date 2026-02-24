export type ToastTone = 'success' | 'error' | 'info'

export type ToastItem = {
  id: number
  tone: ToastTone
  message: string
}

type ToastStackProps = {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

function toToneLabel(tone: ToastTone): string {
  if (tone === 'success') return '성공'
  if (tone === 'error') return '실패'
  return '안내'
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null

  return (
    <div className="toastStack" aria-live="polite" aria-label="알림 목록">
      {toasts.map((toast) => (
        <article
          key={toast.id}
          className={`toastItem tone-${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
        >
          <div className="toastBody">
            <strong>{toToneLabel(toast.tone)}</strong>
            <p>{toast.message}</p>
          </div>
          <button type="button" className="toastClose" aria-label="알림 닫기" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </article>
      ))}
    </div>
  )
}
