import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { splitCells } from './tables.ts'

describe('splitCells', () => {
  it.each([
    ['| Squat | [x] | [ ] |', ['Squat', '[x]', '[ ]']],
    ['Squat | [x]', ['Squat', '[x]']],
    ['| a \\| b | c |', ['a \\| b', 'c']],
    ['|  | x |', ['', 'x']],
  ])('splits %j', (line, cells) => {
    expect(splitCells(line).map((c) => c.text)).toEqual(cells)
  })

  it('gives ranges that point at each cell in the line', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z [\]x]{0,6}$/), { minLength: 1, maxLength: 6 }),
        (texts) => {
          const line = `| ${texts.join(' | ')} |`
          const cells = splitCells(line)
          expect(cells.map((c) => c.text)).toEqual(texts.map((t) => t.trim()))
          for (const cell of cells) expect(line.slice(cell.from, cell.to).trim()).toBe(cell.text)
        },
      ),
    )
  })
})
