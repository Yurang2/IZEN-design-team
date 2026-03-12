import fs from 'node:fs/promises'

const DEFAULT_INPUT = 'ops/generated/bangkok-event-graphics-timetable.json'
const DEFAULT_API_BASE = 'https://izen-design-team.a98763969.workers.dev/api'

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    apiBase: DEFAULT_API_BASE,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--input') options.input = argv[index + 1] ?? options.input
    if (value === '--api-base') options.apiBase = argv[index + 1] ?? options.apiBase
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const raw = await fs.readFile(options.input, 'utf8')
  const parsed = JSON.parse(raw)
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : []

  if (rows.length === 0) {
    throw new Error(`no_rows_found:${options.input}`)
  }

  const response = await fetch(`${options.apiBase.replace(/\/$/, '')}/admin/notion/event-graphics-timetable/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rows }),
  })

  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { ok: false, raw: text }
  }

  if (!response.ok) {
    throw new Error(`import_failed:${response.status}:${JSON.stringify(payload)}`)
  }

  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
