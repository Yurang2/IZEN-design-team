import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onRequest } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import cors from 'cors'
import { FieldValue } from 'firebase-admin/firestore'
import { config } from './config'
import { NotionService } from './notion'
import { calculateDueDateFromEvent, parseFinalDueText, resolveOffsetByRuleTable } from './deadline'
import type { ProposalRecord } from './types'

admin.initializeApp()

const db = admin.firestore()
const notion = new NotionService()
const corsHandler = cors({ origin: true })

function toResponseProposal(id: string, data: any) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    approvedAt: data.approvedAt?.toDate ? data.approvedAt.toDate().toISOString() : data.approvedAt,
  }
}

function runWithCors(handler: (req: any, res: any) => Promise<void> | void) {
  return onRequest({ region: config.region }, (req: any, res: any) => {
    corsHandler(req, res, async () => {
      try {
        await handler(req, res)
      } catch (error) {
        logger.error(error)
        res.status(500).json({ error: 'internal_error' })
      }
    })
  })
}

export const syncNewProjects = onSchedule(
  {
    region: config.region,
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Seoul',
  },
  async () => {
    const projects = await notion.fetchProjects()
    const checklist = await notion.fetchChecklist()

    const stateRef = db.collection('sync_state').doc(config.syncDocId)
    const stateSnap = await stateRef.get()

    const currentProjectIds = projects.map((project) => project.id)

    if (!stateSnap.exists) {
      await stateRef.set({
        last_seen_project_ids: currentProjectIds,
        updatedAt: FieldValue.serverTimestamp(),
      })
      logger.info('Initial sync state created; skipping proposal generation for baseline.')
      return
    }

    const knownProjectIds = new Set((stateSnap.data()?.last_seen_project_ids ?? []) as string[])
    const newProjects = projects.filter((project) => !knownProjectIds.has(project.id))

    if (newProjects.length === 0) {
      await stateRef.update({
        last_seen_project_ids: currentProjectIds,
        updatedAt: FieldValue.serverTimestamp(),
      })
      logger.info('No new projects detected.')
      return
    }

    const batch = db.batch()
    const proposalsCol = db.collection('proposals')

    for (const project of newProjects) {
      const filteredChecklist = checklist.filter((item) => {
        if (project.categories.length === 0) return true
        if (item.eventCategories.length === 0) return true
        return item.eventCategories.some((category) => project.categories.includes(category))
      })

      for (const item of filteredChecklist) {
        const ruleOffset = resolveOffsetByRuleTable(item.workCategory)
        const parserSuggestion = parseFinalDueText(item.finalDueText)
        const dueDate = calculateDueDateFromEvent(project.eventDate, ruleOffset)

        const proposal: ProposalRecord = {
          status: 'pending',
          projectId: project.id,
          projectName: project.name,
          checklistItemId: item.id,
          taskName: item.productName,
          workCategory: item.workCategory,
          finalDueText: item.finalDueText,
          dueDate,
          deadlineBasis: 'event_date',
          offsetDays: ruleOffset,
          dueDateSource: 'rule_table',
          aiDeadlineSuggestion: parserSuggestion
            ? {
                deadlineBasis: 'event_date',
                offsetDays: parserSuggestion.offsetDays,
              }
            : undefined,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }

        const docRef = proposalsCol.doc()
        batch.set(docRef, proposal)
      }
    }

    batch.update(stateRef, {
      last_seen_project_ids: currentProjectIds,
      updatedAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()
    logger.info(`Created proposals for ${newProjects.length} new project(s).`)
  },
)

export const listPendingProposals = runWithCors(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const snapshot = await db
    .collection('proposals')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .get()

  res.json({
    proposals: snapshot.docs.map((doc: any) => toResponseProposal(doc.id, doc.data())),
  })
})

export const updateProposal = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { proposalId, patch } = req.body ?? {}
  if (!proposalId || !patch) {
    res.status(400).json({ error: 'missing_proposal_id_or_patch' })
    return
  }

  await db.collection('proposals').doc(proposalId).update({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  })

  res.json({ ok: true })
})

export const deleteProposal = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const { proposalId } = req.body ?? {}
  if (!proposalId) {
    res.status(400).json({ error: 'missing_proposal_id' })
    return
  }

  await db.collection('proposals').doc(proposalId).update({
    status: 'deleted',
    updatedAt: FieldValue.serverTimestamp(),
  })

  res.json({ ok: true })
})

export const approveProposals = runWithCors(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const proposalIds = (req.body?.proposalIds ?? []) as string[]
  const overrides = (req.body?.overrides ?? {}) as Record<string, Partial<ProposalRecord>>

  if (proposalIds.length === 0) {
    res.status(400).json({ error: 'proposal_ids_required' })
    return
  }

  const results: Array<{ proposalId: string; notionTaskId: string; notionTaskUrl: string }> = []

  for (const proposalId of proposalIds) {
    const proposalRef = db.collection('proposals').doc(proposalId)
    const proposalSnap = await proposalRef.get()

    if (!proposalSnap.exists) {
      continue
    }

    const proposal = proposalSnap.data() as ProposalRecord
    if (proposal.status !== 'pending') {
      continue
    }

    const override = overrides[proposalId] ?? {}

    const taskName = override.taskName ?? proposal.taskName
    const workCategory = override.workCategory ?? proposal.workCategory
    const dueDate = override.dueDate ?? proposal.dueDate

    const created = await notion.createTask({
      taskName,
      workCategory,
      projectPageId: proposal.projectId,
      dueDate,
      statusName: '진행 전',
    })

    await proposalRef.update({
      ...override,
      status: 'approved',
      notionTaskPageId: created.id,
      notionTaskPageUrl: created.url,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    results.push({
      proposalId,
      notionTaskId: created.id,
      notionTaskUrl: created.url,
    })
  }

  res.json({ ok: true, approved: results })
})
