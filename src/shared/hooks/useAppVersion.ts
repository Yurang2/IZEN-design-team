import { useEffect, useMemo, useState } from 'react'
import type { AppVersionManifest } from '../types'

declare const __APP_BUILD_ID__: string
declare const __APP_BUILD_TIME__: string

export function useAppVersion() {
  const currentBuild = useMemo<AppVersionManifest>(
    () => ({
      id: __APP_BUILD_ID__,
      builtAt: __APP_BUILD_TIME__,
    }),
    [],
  )
  const [latestAvailableBuild, setLatestAvailableBuild] = useState<AppVersionManifest | null>(null)

  useEffect(() => {
    let disposed = false
    const versionUrl = new URL(/* @vite-ignore */ '../app-version.json', import.meta.url)

    const checkLatestBuild = async () => {
      try {
        const response = await fetch(`${versionUrl.toString()}?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const manifest = (await response.json()) as Partial<AppVersionManifest>
        if (!manifest.id || !manifest.builtAt || disposed) return
        if (manifest.id !== currentBuild.id) {
          setLatestAvailableBuild({
            id: manifest.id,
            builtAt: manifest.builtAt,
          })
          return
        }
        setLatestAvailableBuild(null)
      } catch {
        // Non-blocking: deployment checks should never break the workspace.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void checkLatestBuild()
      }
    }

    void checkLatestBuild()
    const timer = window.setInterval(() => {
      void checkLatestBuild()
    }, 30_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [currentBuild.id])

  return { currentBuild, latestAvailableBuild }
}
