import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

let fileEnvCache: Record<string, string> | null = null

function parseDotEnv(): Record<string, string> {
  if (fileEnvCache) return fileEnvCache

  const envPath = resolve(__dirname, '..', '.env')
  const values: Record<string, string> = {}

  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx <= 0) continue
      const key = trimmed.slice(0, idx).trim()
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
      if (key) values[key] = value
    }
  }

  fileEnvCache = values
  return values
}

function env(name: string): string | undefined {
  const direct = process.env[name]
  if (direct) return direct
  return parseDotEnv()[name]
}

function required(name: string): string {
  const value = env(name)
  if (!value) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value
}

export const config = {
  notionToken: required('NOTION_TOKEN'),
  projectDbId: required('NOTION_PROJECT_DB_ID'),
  checklistDbId: required('NOTION_CHECKLIST_DB_ID'),
  taskDbId: required('NOTION_TASK_DB_ID'),
  region: env('APP_FUNCTION_REGION') || env('FUNCTION_REGION') || 'asia-northeast3',
  syncDocId: env('SYNC_DOC_ID') || 'notion_project_sync',
}
