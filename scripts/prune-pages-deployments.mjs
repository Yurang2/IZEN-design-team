const DEFAULT_KEEP = 3
const DEFAULT_PROJECT = 'izen-design-team'
const DEFAULT_PER_PAGE = 20
const MAX_PAGES = 100
const API_BASE = 'https://api.cloudflare.com/client/v4'

function readArg(name, fallback) {
  const direct = process.argv.find((entry) => entry.startsWith(`${name}=`))
  if (direct) return direct.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function toIso(value) {
  const parsed = new Date(value ?? '')
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function toSummary(row) {
  const branch = row?.deployment_trigger?.metadata?.branch ?? row?.deployment_trigger?.metadata?.commit_branch ?? '-'
  const environment = row?.environment ?? row?.latest_stage?.name ?? '-'
  const createdAt = toIso(row?.created_on ?? row?.modified_on) || '-'
  return `${row.id} | ${environment} | ${branch} | ${createdAt}`
}

async function cfRequest(path, init = {}) {
  const token = requireEnv('CLOUDFLARE_API_TOKEN')
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.map((entry) => entry?.message).filter(Boolean).join('; ') ||
      payload?.messages?.map((entry) => entry?.message).filter(Boolean).join('; ') ||
      `${response.status} ${response.statusText}`
    throw new Error(message)
  }
  return payload
}

async function listDeployments(accountId, projectName) {
  const deployments = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(DEFAULT_PER_PAGE),
    })
    const payload = await cfRequest(`/accounts/${accountId}/pages/projects/${projectName}/deployments?${params.toString()}`)
    const rows = Array.isArray(payload?.result) ? payload.result : []
    deployments.push(...rows)
    const totalCount = Number(payload?.result_info?.total_count)
    const perPage = Number(payload?.result_info?.per_page ?? DEFAULT_PER_PAGE)
    const totalPages = Number.isFinite(totalCount) && perPage > 0
      ? Math.ceil(totalCount / perPage)
      : null
    if (rows.length === 0 || rows.length < perPage || (totalPages !== null && page >= totalPages)) break
  }
  return deployments.sort((a, b) => {
    const aTime = new Date(a?.created_on ?? a?.modified_on ?? 0).getTime()
    const bTime = new Date(b?.created_on ?? b?.modified_on ?? 0).getTime()
    return bTime - aTime
  })
}

async function deleteDeployment(accountId, projectName, deploymentId) {
  return cfRequest(`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentId}`, {
    method: 'DELETE',
  })
}

async function main() {
  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID')
  const projectName = readArg('--project', process.env.CLOUDFLARE_PAGES_PROJECT ?? DEFAULT_PROJECT)
  const keepCount = Number.parseInt(readArg('--keep', String(DEFAULT_KEEP)), 10)
  const dryRun = hasFlag('--dry-run')

  if (!Number.isFinite(keepCount) || keepCount < 1) {
    throw new Error('--keep must be a positive integer')
  }

  const deployments = await listDeployments(accountId, projectName)
  if (deployments.length <= keepCount) {
    console.log(`No pruning needed. Found ${deployments.length} deployments, keep=${keepCount}.`)
    return
  }

  const keep = deployments.slice(0, keepCount)
  const prune = deployments.slice(keepCount)

  console.log(`Project: ${projectName}`)
  console.log(`Keeping latest ${keepCount}:`)
  for (const row of keep) {
    console.log(`  KEEP   ${toSummary(row)}`)
  }

  console.log(`Pruning ${prune.length} older deployments${dryRun ? ' (dry-run)' : ''}:`)
  for (const row of prune) {
    if (dryRun) {
      console.log(`  DRYRUN ${toSummary(row)}`)
      continue
    }
    try {
      await deleteDeployment(accountId, projectName, row.id)
      console.log(`  DELETE ${toSummary(row)}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`  SKIP   ${toSummary(row)} | ${message}`)
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`pages prune failed: ${message}`)
  process.exitCode = 1
})
