import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_MASTERFILE_ROOT = 'files/2026 IZEN Seminar in Bangkok Masterfile'
const WATCHED_ASSETS_DIR = '02_Files'
const DEBOUNCE_MS = 400
const POST_SYNC_COOLDOWN_MS = 1200

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    masterfileRoot: DEFAULT_MASTERFILE_ROOT,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--masterfile-root') options.masterfileRoot = argv[index + 1] ?? options.masterfileRoot
  }

  return options
}

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function log(message) {
  console.log(`[watch:event-graphics-masterfiles ${timestamp()}] ${message}`)
}

async function ensureReadable(targetPath) {
  await fs.promises.access(targetPath, fs.constants.R_OK)
}

function startSync(options, onExit) {
  const child = spawn(process.execPath, ['scripts/sync-event-graphics-masterfile-assets.mjs', '--input', options.input, '--masterfile-root', options.masterfileRoot], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })

  child.on('exit', (code) => {
    onExit(code ?? 0)
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const watchedAssetsPath = path.resolve(options.masterfileRoot, WATCHED_ASSETS_DIR)
  const watchedInputPath = path.resolve(options.input)

  await ensureReadable(watchedAssetsPath)
  await ensureReadable(watchedInputPath)

  let debounceTimer = null
  let syncInProgress = false
  let rerunRequested = false
  let ignoreUntil = 0

  const requestSync = (reason) => {
    const now = Date.now()
    if (now < ignoreUntil) return

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null

      if (syncInProgress) {
        rerunRequested = true
        return
      }

      syncInProgress = true
      log(`sync start (${reason})`)
      startSync(options, (exitCode) => {
        syncInProgress = false
        ignoreUntil = Date.now() + POST_SYNC_COOLDOWN_MS

        if (exitCode === 0) {
          log('sync complete')
        } else {
          log(`sync failed (exit ${exitCode})`)
        }

        if (rerunRequested) {
          rerunRequested = false
          requestSync('queued change')
        }
      })
    }, DEBOUNCE_MS)
  }

  const attachWatch = (label, targetPath, recursive = false) => {
    const watcher = fs.watch(targetPath, { recursive }, (_eventType, filename) => {
      const changed = filename ? path.normalize(filename) : '.'
      requestSync(`${label}:${changed}`)
    })

    watcher.on('error', (error) => {
      log(`${label} watcher error: ${error instanceof Error ? error.message : String(error)}`)
    })

    return watcher
  }

  const watchers = [
    attachWatch('assets', watchedAssetsPath, true),
    attachWatch('timetable', watchedInputPath, false),
  ]

  log(`watching ${watchedAssetsPath}`)
  log(`watching ${watchedInputPath}`)
  log('press Ctrl+C to stop')

  const shutdown = () => {
    for (const watcher of watchers) watcher.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
