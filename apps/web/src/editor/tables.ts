/** A cell of a markdown table row: its text (trimmed) and its range within the line. */
export interface Cell {
  text: string
  /** Offset of the cell's content (between the pipes) within the line. */
  from: number
  to: number
}

/**
 * Splits a table row (`| a | b |`) into its cells. Escaped pipes (`\|`) stay inside a cell.
 * Leading and trailing pipes are optional, as in GitHub markdown.
 */
export function splitCells(line: string): Cell[] {
  const pipes: number[] = []
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && line[i - 1] !== '\\') pipes.push(i)
  }
  // Cell boundaries: the pipes, plus the line edges where the outer pipes are left out.
  const bounds = [...pipes]
  if (!line.trimStart().startsWith('|')) bounds.unshift(-1)
  if (!line.trimEnd().endsWith('|') || pipes.length === 0) bounds.push(line.length)
  return bounds.slice(1).map((to, i) => {
    const from = (bounds[i] as number) + 1
    return { text: line.slice(from, to).trim(), from, to }
  })
}
