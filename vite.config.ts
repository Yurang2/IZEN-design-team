import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function resolveBuildId(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return `local-${Date.now()}`
  }
}

const buildId = resolveBuildId()
const buildTime = new Date().toISOString()

export default defineConfig({
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    {
      name: 'emit-app-version-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'app-version.json',
          source: JSON.stringify(
            {
              id: buildId,
              builtAt: buildTime,
            },
            null,
            2,
          ),
        })
      },
    },
  ],
  base: '/',
})
