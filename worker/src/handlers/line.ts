import type {
  Env,
  TaskRecord,
} from '../types'
import {
  asString,
  DEFAULT_LINE_NOTIFY_ASSIGNEE_NAME,
  isTaskClosed,
  LINE_PUSH_API_URL,
  MAX_LINE_REMINDER_TASKS,
  normalizeNameToken,
  textEncoder,
  toSeoulDateIso,
  toSeoulTimeLabel,
} from '../utils'
import { getSnapshot, serviceFromEnv } from './tasks'

function getLineNotifyAssigneeName(env: Env): string {
  return asString(env.LINE_NOTIFY_ASSIGNEE_NAME) ?? DEFAULT_LINE_NOTIFY_ASSIGNEE_NAME
}

function getLineNotifyTargetUserId(env: Env): string {
  const value = asString(env.LINE_NOTIFY_TARGET_USER_ID)
  if (!value) throw new Error('line_notify_target_user_id_missing')
  return value
}

function getLineChannelAccessToken(env: Env): string {
  const value = asString(env.LINE_CHANNEL_ACCESS_TOKEN)
  if (!value) throw new Error('line_channel_access_token_missing')
  return value
}

export async function verifyLineWebhookSignature(request: Request, env: Env, rawBody: string): Promise<boolean> {
  const secret = asString(env.LINE_CHANNEL_SECRET)
  if (!secret) return true

  const signature = asString(request.headers.get('x-line-signature'))
  if (!signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret).buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, textEncoder.encode(rawBody).buffer)
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const expected = btoa(binary)
  return expected === signature
}

export async function handleLineWebhook(request: Request, env: Env): Promise<{ ok: boolean; verified: boolean; eventCount: number }> {
  if (request.method === 'GET') {
    return { ok: true, verified: true, eventCount: 0 }
  }

  const rawBody = await request.text()
  const verified = await verifyLineWebhookSignature(request, env, rawBody)
  if (!verified) {
    throw new Error('line_webhook_signature_invalid')
  }

  let eventCount = 0
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as { events?: unknown[] }
      eventCount = Array.isArray(parsed.events) ? parsed.events.length : 0
    } catch {
      eventCount = 0
    }
  }

  return {
    ok: true,
    verified,
    eventCount,
  }
}

function matchesAssignee(task: TaskRecord, assigneeName: string): boolean {
  const target = normalizeNameToken(assigneeName)
  if (!target) return false
  return task.assignee.some((entry) => normalizeNameToken(entry) === target)
}

function compareReminderTask(a: TaskRecord, b: TaskRecord): number {
  const dueA = a.dueDate ?? '9999-12-31'
  const dueB = b.dueDate ?? '9999-12-31'
  if (dueA !== dueB) return dueA.localeCompare(dueB)
  return `${a.projectName} ${a.taskName}`.localeCompare(`${b.projectName} ${b.taskName}`, 'ko')
}

function collectReminderTasks(tasks: TaskRecord[], assigneeName: string): TaskRecord[] {
  return tasks.filter((task) => matchesAssignee(task, assigneeName)).filter((task) => !isTaskClosed(task.status)).sort(compareReminderTask)
}

function formatReminderTaskLine(task: TaskRecord, options?: { prefix?: string; includeDueDate?: boolean }): string {
  const prefix = options?.prefix ? `${options.prefix} ` : '- '
  const pieces = [`[${task.status || '상태 미지정'}]`, task.projectName || '프로젝트 미지정', task.taskName]
  if (options?.includeDueDate && task.dueDate) {
    pieces.push(`마감 ${task.dueDate}`)
  }
  return `${prefix}${pieces.join(' / ')}`
}

function limitReminderLines(lines: string[], suffix: string): string[] {
  if (lines.length <= MAX_LINE_REMINDER_TASKS) return lines
  return [...lines.slice(0, MAX_LINE_REMINDER_TASKS), `- 외 ${lines.length - MAX_LINE_REMINDER_TASKS}건 ${suffix}`]
}

function buildMorningReminderText(assigneeName: string, tasks: TaskRecord[], todayIso: string, now: Date): string {
  const dueToday = tasks.filter((task) => task.dueDate === todayIso)
  const overdue = tasks.filter((task) => Boolean(task.dueDate && task.dueDate < todayIso))
  const inProgress = tasks.filter((task) => !dueToday.includes(task) && !overdue.includes(task))
  const lines: string[] = ['[오늘 할 일]', `${todayIso} ${toSeoulTimeLabel(now)} 기준 ${assigneeName}님 업무입니다.`]

  if (tasks.length === 0) {
    lines.push('', '오늘 열려 있는 업무가 없습니다.')
    return lines.join('\n')
  }

  if (dueToday.length > 0) {
    lines.push('', '★ 오늘 마감')
    lines.push(...limitReminderLines(dueToday.map((task) => formatReminderTaskLine(task, { prefix: '★' })), '더 있습니다.'))
  }

  if (overdue.length > 0) {
    lines.push('', '! 지연')
    lines.push(...limitReminderLines(overdue.map((task) => formatReminderTaskLine(task, { prefix: '!', includeDueDate: true })), '더 있습니다.'))
  }

  if (inProgress.length > 0) {
    lines.push('', '진행중 / 확인 필요')
    lines.push(...limitReminderLines(inProgress.map((task) => formatReminderTaskLine(task, { includeDueDate: true })), '더 있습니다.'))
  }

  return lines.join('\n')
}

function buildEveningReminderText(assigneeName: string, tasks: TaskRecord[], todayIso: string, now: Date): string {
  const lines: string[] = ['[오늘의 업무 상태]', `${todayIso} ${toSeoulTimeLabel(now)} 기준 ${assigneeName}님 업무 상태입니다.`]

  if (tasks.length === 0) {
    lines.push('', '현재 열려 있는 업무가 없습니다.', '', '틀린 게 있으면 수정해주세요.')
    return lines.join('\n')
  }

  lines.push('')
  lines.push(...limitReminderLines(tasks.map((task) => formatReminderTaskLine(task, { includeDueDate: true })), '더 있습니다.'))
  lines.push('', '틀린 게 있으면 수정해주세요.')
  return lines.join('\n')
}

async function pushLineTextMessage(env: Env, userId: string, text: string): Promise<void> {
  const response = await fetch(LINE_PUSH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getLineChannelAccessToken(env)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!response.ok) {
    const body = (await response.text()).trim()
    throw new Error(body ? `line_push_failed:${response.status}:${body.slice(0, 200)}` : `line_push_failed:${response.status}`)
  }
}

export async function sendLineReminder(
  env: Env,
  ctx: ExecutionContext,
  kind: 'morning' | 'evening',
  now = new Date(),
): Promise<{ ok: true; kind: 'morning' | 'evening'; assigneeName: string; taskCount: number }> {
  const assigneeName = getLineNotifyAssigneeName(env)
  const targetUserId = getLineNotifyTargetUserId(env)
  const service = serviceFromEnv(env)
  const snapshot = await getSnapshot(service, env, ctx)
  const todayIso = toSeoulDateIso(now)
  const tasks = collectReminderTasks(snapshot.tasks, assigneeName)
  const text = kind === 'morning' ? buildMorningReminderText(assigneeName, tasks, todayIso, now) : buildEveningReminderText(assigneeName, tasks, todayIso, now)
  await pushLineTextMessage(env, targetUserId, text)
  return {
    ok: true,
    kind,
    assigneeName,
    taskCount: tasks.length,
  }
}
