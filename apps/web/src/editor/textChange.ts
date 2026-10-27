/**
 * The smallest single replacement turning `before` into `after`, or undefined if they are equal.
 * Applying new text from outside (a merge, another device) this way keeps the cursor and the
 * undo history meaningful, instead of replacing the whole document.
 */
export function minimalChange(
  before: string,
  after: string,
): { from: number; to: number; insert: string } | undefined {
  if (before === after) return undefined
  let start = 0
  const limit = Math.min(before.length, after.length)
  while (start < limit && before[start] === after[start]) start++
  let endBefore = before.length
  let endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) }
}
