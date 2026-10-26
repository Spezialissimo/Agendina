import { diff3Merge } from 'node-diff3'

export type MergeChunk =
  | { type: 'ok'; lines: string[] }
  | { type: 'conflict'; base: string[]; mine: string[]; theirs: string[] }

export type MergeResult =
  { status: 'clean'; text: string } | { status: 'conflict'; chunks: MergeChunk[] }

/**
 * Line-based three-way merge of two edits (`mine`, `theirs`) of the same `base` text.
 * Edits to different lines are combined; edits to the same lines are reported as conflicts with
 * all three versions, so the user can choose. It never combines text within a line.
 */
export function merge3(base: string, mine: string, theirs: string): MergeResult {
  const regions = diff3Merge(mine.split('\n'), base.split('\n'), theirs.split('\n'))

  const chunks: MergeChunk[] = []
  for (const region of regions) {
    if (region.conflict === undefined) {
      pushOk(chunks, region.ok ?? [])
    } else {
      const { o, a, b } = region.conflict
      for (const chunk of resolveInPlaceEdits(o, a, b)) {
        if (chunk.type === 'ok') pushOk(chunks, chunk.lines)
        else chunks.push(chunk)
      }
    }
  }

  if (chunks.every((chunk) => chunk.type === 'ok')) {
    return { status: 'clean', text: chunks.flatMap((chunk) => chunk.lines).join('\n') }
  }
  return { status: 'conflict', chunks }
}

/**
 * diff3 reports edits to adjacent lines as one conflict. When neither side added or removed
 * lines (e.g. ticking checkboxes in a table), each line can be resolved on its own: take
 * whichever side changed it, and keep a conflict only where both changed it differently.
 */
function resolveInPlaceEdits(base: string[], mine: string[], theirs: string[]): MergeChunk[] {
  if (mine.length !== base.length || theirs.length !== base.length) {
    return [{ type: 'conflict', base, mine, theirs }]
  }

  const chunks: MergeChunk[] = []
  base.forEach((baseLine, i) => {
    const mineLine = mine[i] as string
    const theirsLine = theirs[i] as string
    if (mineLine === baseLine || mineLine === theirsLine) {
      pushOk(chunks, [theirsLine])
    } else if (theirsLine === baseLine) {
      pushOk(chunks, [mineLine])
    } else {
      const last = chunks.at(-1)
      if (last?.type === 'conflict') {
        last.base.push(baseLine)
        last.mine.push(mineLine)
        last.theirs.push(theirsLine)
      } else {
        chunks.push({ type: 'conflict', base: [baseLine], mine: [mineLine], theirs: [theirsLine] })
      }
    }
  })
  return chunks
}

function pushOk(chunks: MergeChunk[], lines: string[]): void {
  if (lines.length === 0) return
  const last = chunks.at(-1)
  if (last?.type === 'ok') last.lines.push(...lines)
  else chunks.push({ type: 'ok', lines: [...lines] })
}
