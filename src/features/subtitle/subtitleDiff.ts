import type { SubtitleSegment } from '../../shared/types'

// ---------------------------------------------------------------------------
// Word-level diff (LCS-based)
// ---------------------------------------------------------------------------

export type DiffToken = { text: string; type: 'equal' | 'added' | 'removed' }

export function diffWords(oldText: string, newText: string): DiffToken[] {
  if (oldText === newText) return oldText ? [{ text: oldText, type: 'equal' }] : []

  const oldWords = oldText.split(/(\s+)/).filter(Boolean)
  const newWords = newText.split(/(\s+)/).filter(Boolean)

  // LCS table
  const m = oldWords.length
  const n = newWords.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldWords[i - 1] === newWords[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Backtrack
  const tokens: DiffToken[] = []
  let i = m
  let j = n
  const stack: DiffToken[] = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      stack.push({ text: oldWords[i - 1], type: 'equal' })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ text: newWords[j - 1], type: 'added' })
      j--
    } else {
      stack.push({ text: oldWords[i - 1], type: 'removed' })
      i--
    }
  }
  stack.reverse()

  // Merge consecutive tokens of the same type
  for (const token of stack) {
    const last = tokens[tokens.length - 1]
    if (last && last.type === token.type) {
      last.text += token.text
    } else {
      tokens.push({ ...token })
    }
  }

  return tokens
}

// ---------------------------------------------------------------------------
// Timecode helpers
// ---------------------------------------------------------------------------

export function timecodeToSeconds(tc: string): number {
  const parts = tc.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

export function formatTimecodeShift(delta: number): string {
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta}s`
}

// ---------------------------------------------------------------------------
// Segment matching & classification
// ---------------------------------------------------------------------------

export type SegmentChangeType = 'unchanged' | 'content_changed' | 'timecode_only' | 'added' | 'removed'

export type LangDiff = { lang: 'ko' | 'en' | 'zh' | 'ru'; tokens: DiffToken[] }

export type SegmentDiff = {
  changeType: SegmentChangeType
  oldSegment: SubtitleSegment | null
  newSegment: SubtitleSegment | null
  textDiffs: LangDiff[]
  timecodeShift: { startDelta: number; endDelta: number } | null
}

const LANGS: Array<'ko' | 'en' | 'zh' | 'ru'> = ['ko', 'en', 'zh', 'ru']

function segmentText(seg: SubtitleSegment): string {
  return `${seg.ko} ${seg.en} ${seg.zh} ${seg.ru}`.trim()
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean))
  const setB = new Set(b.split(/\s+/).filter(Boolean))
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const word of setA) {
    if (setB.has(word)) intersection++
  }
  return intersection / (setA.size + setB.size - intersection)
}

export function matchAndClassify(
  oldSegments: SubtitleSegment[],
  newSegments: SubtitleSegment[],
): SegmentDiff[] {
  const results: SegmentDiff[] = []
  const matchedOld = new Set<number>()
  const matchedNew = new Set<number>()

  // Pass 1: exact label match
  for (let ni = 0; ni < newSegments.length; ni++) {
    if (matchedNew.has(ni)) continue
    for (let oi = 0; oi < oldSegments.length; oi++) {
      if (matchedOld.has(oi)) continue
      if (newSegments[ni].label === oldSegments[oi].label && newSegments[ni].label) {
        matchedNew.add(ni)
        matchedOld.add(oi)
        results.push(classifyPair(oldSegments[oi], newSegments[ni]))
        break
      }
    }
  }

  // Pass 2: fuzzy text match
  for (let ni = 0; ni < newSegments.length; ni++) {
    if (matchedNew.has(ni)) continue
    let bestOi = -1
    let bestSim = 0.5
    for (let oi = 0; oi < oldSegments.length; oi++) {
      if (matchedOld.has(oi)) continue
      const sim = jaccardSimilarity(segmentText(oldSegments[oi]), segmentText(newSegments[ni]))
      if (sim > bestSim) {
        bestSim = sim
        bestOi = oi
      }
    }
    if (bestOi >= 0) {
      matchedNew.add(ni)
      matchedOld.add(bestOi)
      results.push(classifyPair(oldSegments[bestOi], newSegments[ni]))
    }
  }

  // Remaining unmatched
  for (let ni = 0; ni < newSegments.length; ni++) {
    if (!matchedNew.has(ni)) {
      results.push({ changeType: 'added', oldSegment: null, newSegment: newSegments[ni], textDiffs: [], timecodeShift: null })
    }
  }
  for (let oi = 0; oi < oldSegments.length; oi++) {
    if (!matchedOld.has(oi)) {
      results.push({ changeType: 'removed', oldSegment: oldSegments[oi], newSegment: null, textDiffs: [], timecodeShift: null })
    }
  }

  // Sort by new segment index, then removed at end
  results.sort((a, b) => {
    const ai = a.newSegment?.index ?? (a.oldSegment?.index ?? 0) + 10000
    const bi = b.newSegment?.index ?? (b.oldSegment?.index ?? 0) + 10000
    return ai - bi
  })

  return results
}

function classifyPair(oldSeg: SubtitleSegment, newSeg: SubtitleSegment): SegmentDiff {
  const textChanged = LANGS.some((lang) => oldSeg[lang] !== newSeg[lang])
  const tcChanged = oldSeg.startTime !== newSeg.startTime || oldSeg.endTime !== newSeg.endTime

  const textDiffs: LangDiff[] = textChanged
    ? LANGS.filter((lang) => oldSeg[lang] !== newSeg[lang]).map((lang) => ({ lang, tokens: diffWords(oldSeg[lang], newSeg[lang]) }))
    : []

  const timecodeShift = tcChanged
    ? {
        startDelta: timecodeToSeconds(newSeg.startTime) - timecodeToSeconds(oldSeg.startTime),
        endDelta: timecodeToSeconds(newSeg.endTime) - timecodeToSeconds(oldSeg.endTime),
      }
    : null

  let changeType: SegmentChangeType = 'unchanged'
  if (textChanged) changeType = 'content_changed'
  else if (tcChanged) changeType = 'timecode_only'

  return { changeType, oldSegment: oldSeg, newSegment: newSeg, textDiffs, timecodeShift }
}

// ---------------------------------------------------------------------------
// Batch timecode shift compression
// ---------------------------------------------------------------------------

export type CompressedDiffEntry =
  | { kind: 'single'; diff: SegmentDiff }
  | { kind: 'batch_shift'; diffs: SegmentDiff[]; delta: number; fromIndex: number; toIndex: number }

export function compressDiffs(diffs: SegmentDiff[]): CompressedDiffEntry[] {
  const entries: CompressedDiffEntry[] = []
  let i = 0
  while (i < diffs.length) {
    const d = diffs[i]
    if (d.changeType === 'timecode_only' && d.timecodeShift) {
      const delta = d.timecodeShift.startDelta
      const batchStart = i
      while (
        i < diffs.length &&
        diffs[i].changeType === 'timecode_only' &&
        diffs[i].timecodeShift?.startDelta === delta
      ) {
        i++
      }
      const batch = diffs.slice(batchStart, i)
      if (batch.length >= 3) {
        entries.push({
          kind: 'batch_shift',
          diffs: batch,
          delta,
          fromIndex: batch[0].newSegment?.index ?? 0,
          toIndex: batch[batch.length - 1].newSegment?.index ?? 0,
        })
      } else {
        for (const bd of batch) entries.push({ kind: 'single', diff: bd })
      }
    } else {
      entries.push({ kind: 'single', diff: d })
      i++
    }
  }
  return entries
}
