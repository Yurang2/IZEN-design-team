import type { CreateSubtitleRevisionInput, SubtitleSnapshotData } from '../types'
import { asString, parsePatchBody } from '../utils'

function parseSnapshot(raw: unknown): SubtitleSnapshotData {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as any).segments)) {
    throw new Error('snapshot_must_have_segments_array')
  }
  const segments = (raw as any).segments
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (typeof seg !== 'object' || seg === null) throw new Error(`segment_${i}_invalid`)
    if (typeof seg.index !== 'number') throw new Error(`segment_${i}_missing_index`)
    if (typeof seg.label !== 'string') throw new Error(`segment_${i}_missing_label`)
    if (typeof seg.startTime !== 'string') throw new Error(`segment_${i}_missing_startTime`)
    if (typeof seg.endTime !== 'string') throw new Error(`segment_${i}_missing_endTime`)
    if (typeof seg.ko !== 'string') seg.ko = ''
    if (typeof seg.en !== 'string') seg.en = ''
    if (typeof seg.zh !== 'string') seg.zh = ''
    if (typeof seg.ru !== 'string') seg.ru = ''
  }
  return { segments } as SubtitleSnapshotData
}

export function parseSubtitleRevisionCreateBody(body: unknown): CreateSubtitleRevisionInput {
  const payload = parsePatchBody(body)
  const videoId = asString(payload.videoId)
  if (!videoId) throw new Error('videoId_required')
  const revisionName = asString(payload.revisionName)
  if (!revisionName) throw new Error('revisionName_required')
  const revisionNumber = Number(payload.revisionNumber)
  if (!Number.isFinite(revisionNumber) || revisionNumber < 1) throw new Error('revisionNumber_must_be_positive')
  const snapshot = parseSnapshot(payload.snapshot)

  return {
    videoId,
    revisionName,
    revisionNumber,
    modifier: asString(payload.modifier) || undefined,
    changeSummary: asString(payload.changeSummary) || undefined,
    snapshot,
  }
}
