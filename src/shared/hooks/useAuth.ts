import { useCallback, useState, type FormEvent } from 'react'
import { AUTH_GATE_ENABLED, AUTH_GATE_PASSWORD } from '../constants'
import { USE_MOCK_DATA } from '../api/client'
import { readFrontGateAuthenticated, writeFrontGateAuthenticated } from '../utils/theme'
import type { ToastTone } from '../ui'

export function useAuth(pushToast: (tone: ToastTone, message: string) => void) {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>(() => {
    if (!AUTH_GATE_ENABLED) return 'authenticated'
    if (USE_MOCK_DATA) return 'authenticated'
    return readFrontGateAuthenticated() ? 'authenticated' : 'unauthenticated'
  })
  const [authPassword, setAuthPassword] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const onAuthSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (USE_MOCK_DATA) {
        writeFrontGateAuthenticated(true)
        setAuthState('authenticated')
        return
      }

      const password = authPassword.trim()
      if (!password) {
        setAuthError('비밀번호를 입력해 주세요.')
        return
      }

      setAuthSubmitting(true)
      setAuthError(null)

      if (password !== AUTH_GATE_PASSWORD) {
        writeFrontGateAuthenticated(false)
        setAuthError('비밀번호가 올바르지 않습니다.')
        setAuthState('unauthenticated')
        setAuthSubmitting(false)
        return
      }

      writeFrontGateAuthenticated(true)
      setAuthPassword('')
      setAuthState('authenticated')
      setAuthSubmitting(false)
      pushToast('success', '인증되었습니다.')
    },
    [authPassword, pushToast],
  )

  return {
    authState,
    authPassword,
    authSubmitting,
    authError,
    setAuthPassword,
    onAuthSubmit,
  }
}
