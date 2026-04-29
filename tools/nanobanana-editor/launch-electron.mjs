import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const electronExe = join(repoRoot, 'overlay', 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

if (!existsSync(electronExe)) {
  console.error('Electron 실행 파일이 없습니다. 먼저 `cd overlay && npm install`을 실행해 주세요.')
  process.exit(1)
}

const child = spawn(electronExe, [here], {
  cwd: here,
  stdio: 'inherit',
  windowsHide: false,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})
