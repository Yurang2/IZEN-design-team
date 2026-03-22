import { useCallback, useEffect, useRef, useState } from 'react'
import { TOAST_LIFETIME_MS } from '../constants'
import type { ToastItem, ToastTone } from '../ui'
import type { CopyTextOptions } from '../types'

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastTimerRef = useRef<Record<number, number>>({})

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timerId = toastTimerRef.current[id]
    if (timerId) {
      window.clearTimeout(timerId)
      delete toastTimerRef.current[id]
    }
  }, [])

  const pushToast = useCallback(
    (tone: ToastTone, message: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000)
      setToasts((prev) => [...prev, { id, tone, message }].slice(-5))
      const timerId = window.setTimeout(() => {
        dismissToast(id)
      }, TOAST_LIFETIME_MS)
      toastTimerRef.current[id] = timerId
    },
    [dismissToast],
  )

  const copyText = useCallback(
    async (text: string, options?: CopyTextOptions) => {
      const normalized = text.trim()
      if (!normalized) {
        pushToast('error', options?.emptyMessage ?? '복사할 내용이 없습니다.')
        return
      }

      try {
        await navigator.clipboard.writeText(normalized)
        pushToast('success', options?.successMessage ?? '보고 문구를 복사했습니다.')
      } catch {
        pushToast('error', '클립보드 복사에 실패했습니다.')
      }
    },
    [pushToast],
  )

  useEffect(() => {
    const toastTimers = toastTimerRef.current
    return () => {
      for (const timerId of Object.values(toastTimers)) {
        window.clearTimeout(timerId)
      }
    }
  }, [])

  return { toasts, pushToast, dismissToast, copyText }
}
