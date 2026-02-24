import { useEffect } from 'react'

type KeybindingOptions = {
  key: string
  ctrlOrMeta?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  preventDefault?: boolean
  enabled?: boolean
  onTrigger: (event: KeyboardEvent) => void
}

export function useKeybinding({
  key,
  ctrlOrMeta = false,
  ctrlKey,
  metaKey,
  altKey,
  shiftKey,
  preventDefault = true,
  enabled = true,
  onTrigger,
}: KeybindingOptions): void {
  useEffect(() => {
    if (!enabled) return

    const listener = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return
      if (typeof ctrlKey === 'boolean' && event.ctrlKey !== ctrlKey) return
      if (typeof metaKey === 'boolean' && event.metaKey !== metaKey) return
      if (typeof altKey === 'boolean' && event.altKey !== altKey) return
      if (typeof shiftKey === 'boolean' && event.shiftKey !== shiftKey) return

      if (preventDefault) event.preventDefault()
      onTrigger(event)
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [altKey, ctrlKey, ctrlOrMeta, enabled, key, metaKey, onTrigger, preventDefault, shiftKey])
}
