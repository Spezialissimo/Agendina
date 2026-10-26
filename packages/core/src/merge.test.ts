import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { merge3, type MergeResult } from './merge.ts'

const lines = (...ls: string[]) => ls.join('\n')

describe('merge3: examples', () => {
  it('merges edits on different lines of a day note', () => {
    const base = lines('- [ ] Finish report', '- [ ] Call dentist', '', 'Notes:', '')
    const mine = lines('- [ ] Finish report', '- [x] Call dentist', '', 'Notes:', '')
    const theirs = lines('- [ ] Finish report', '- [ ] Call dentist', '', 'Notes:', 'Felt good', '')

    expect(merge3(base, mine, theirs)).toEqual({
      status: 'clean',
      text: lines('- [ ] Finish report', '- [x] Call dentist', '', 'Notes:', 'Felt good', ''),
    })
  })

  it('merges ticks on different rows of the workout table', () => {
    const base = lines(
      '| Exercise | Mo | Tu |',
      '|---|---|---|',
      '| Squat | [ ] | [ ] |',
      '| Bench | [ ] | [ ] |',
    )
    const mine = lines(
      '| Exercise | Mo | Tu |',
      '|---|---|---|',
      '| Squat | [x] | [ ] |',
      '| Bench | [ ] | [ ] |',
    )
    const theirs = lines(
      '| Exercise | Mo | Tu |',
      '|---|---|---|',
      '| Squat | [ ] | [ ] |',
      '| Bench | [ ] | [x] |',
    )

    expect(merge3(base, mine, theirs)).toEqual({
      status: 'clean',
      text: lines(
        '| Exercise | Mo | Tu |',
        '|---|---|---|',
        '| Squat | [x] | [ ] |',
        '| Bench | [ ] | [x] |',
      ),
    })
  })

  it('reports a conflict instead of combining two edits of the same line', () => {
    const base = lines('Goals', '- [ ] Run 5km', 'End')
    const mine = lines('Goals', '- [ ] Run 10km', 'End')
    const theirs = lines('Goals', '- [ ] Run 8km', 'End')

    expect(merge3(base, mine, theirs)).toEqual({
      status: 'conflict',
      chunks: [
        { type: 'ok', lines: ['Goals'] },
        {
          type: 'conflict',
          base: ['- [ ] Run 5km'],
          mine: ['- [ ] Run 10km'],
          theirs: ['- [ ] Run 8km'],
        },
        { type: 'ok', lines: ['End'] },
      ],
    } satisfies MergeResult)
  })

  it('narrows a conflict to the lines both sides changed differently', () => {
    const base = lines('| Squat | [ ] |', '| Bench | [ ] |', '| Row | [ ] |')
    const mine = lines('| Squat | [x] |', '| Bench | [x] |', '| Row | [ ] |')
    const theirs = lines('| Squat | [ ] |', '| Bench | [-] |', '| Row | [x] |')

    expect(merge3(base, mine, theirs)).toEqual({
      status: 'conflict',
      chunks: [
        { type: 'ok', lines: ['| Squat | [x] |'] },
        {
          type: 'conflict',
          base: ['| Bench | [ ] |'],
          mine: ['| Bench | [x] |'],
          theirs: ['| Bench | [-] |'],
        },
        { type: 'ok', lines: ['| Row | [x] |'] },
      ],
    } satisfies MergeResult)
  })

  it('treats the same edit made on both sides as clean', () => {
    const base = lines('- [ ] Squat')
    const both = lines('- [x] Squat')

    expect(merge3(base, both, both)).toEqual({ status: 'clean', text: both })
  })

  it('keeps a deletion on one side when the other side did not touch the line', () => {
    const base = lines('a', 'b', 'c')
    const mine = lines('a', 'c')

    expect(merge3(base, mine, base)).toEqual({ status: 'clean', text: lines('a', 'c') })
  })

  it('conflicts when one side edits a line the other side deleted', () => {
    const base = lines('a', 'b', 'c')
    const mine = lines('a', 'B', 'c')
    const theirs = lines('a', 'c')

    expect(merge3(base, mine, theirs)).toMatchObject({
      status: 'conflict',
      chunks: [{ type: 'ok' }, { type: 'conflict', mine: ['B'], theirs: [] }, { type: 'ok' }],
    })
  })

  it('handles empty notes', () => {
    expect(merge3('', '', '')).toEqual({ status: 'clean', text: '' })
    expect(merge3('', 'hello', '')).toEqual({ status: 'clean', text: 'hello' })
    expect(merge3('', '', 'hello')).toEqual({ status: 'clean', text: 'hello' })
  })

  it('preserves the trailing newline exactly', () => {
    expect(merge3('a\n', 'a\nb\n', 'a\n')).toEqual({ status: 'clean', text: 'a\nb\n' })
    expect(merge3('a', 'a\nb', 'a')).toEqual({ status: 'clean', text: 'a\nb' })
  })
})

// Lines are drawn from a small alphabet so that edits often touch the same lines.
const anyText = fc
  .array(fc.constantFrom('a', 'b', 'c', '- [ ] x', '- [x] x', ''), { maxLength: 12 })
  .map((ls) => ls.join('\n'))

describe('merge3: properties', () => {
  it('returns the other side when one side is unchanged', () => {
    fc.assert(
      fc.property(anyText, anyText, (base, changed) => {
        expect(merge3(base, changed, base)).toEqual({ status: 'clean', text: changed })
        expect(merge3(base, base, changed)).toEqual({ status: 'clean', text: changed })
      }),
    )
  })

  it('returns the edit when both sides made the same edit', () => {
    fc.assert(
      fc.property(anyText, anyText, (base, changed) => {
        expect(merge3(base, changed, changed)).toEqual({ status: 'clean', text: changed })
      }),
    )
  })

  it('never invents lines', () => {
    fc.assert(
      fc.property(anyText, anyText, anyText, (base, mine, theirs) => {
        const known = new Set([...base.split('\n'), ...mine.split('\n'), ...theirs.split('\n')])
        for (const line of outputLines(merge3(base, mine, theirs))) {
          expect(known).toContain(line)
        }
      }),
      { numRuns: 1000 },
    )
  })

  it('is symmetric: swapping the sides swaps mine and theirs', () => {
    fc.assert(
      fc.property(anyText, anyText, anyText, (base, mine, theirs) => {
        expect(merge3(base, theirs, mine)).toEqual(swapSides(merge3(base, mine, theirs)))
      }),
      { numRuns: 1000 },
    )
  })

  it('merges in-place edits of different lines without conflict, even adjacent ones', () => {
    // Ticking checkboxes edits lines in place: the line count never changes.
    const scenario = fc
      .uniqueArray(fc.nat({ max: 99 }), { minLength: 1, maxLength: 10 })
      .chain((ids) =>
        fc.record({
          base: fc.constant(ids.map((id) => `- [ ] task ${id}`)),
          owner: fc.array(fc.constantFrom('none', 'mine', 'theirs'), {
            minLength: ids.length,
            maxLength: ids.length,
          }),
        }),
      )

    fc.assert(
      fc.property(scenario, ({ base, owner }) => {
        const tick = (side: string) =>
          base.map((l, i) => (owner[i] === side ? l.replace('[ ]', '[x]') : l))
        const expected = base.map((l, i) => (owner[i] === 'none' ? l : l.replace('[ ]', '[x]')))

        expect(merge3(base.join('\n'), tick('mine').join('\n'), tick('theirs').join('\n'))).toEqual(
          {
            status: 'clean',
            text: expected.join('\n'),
          },
        )
      }),
    )
  })

  it('merges edits separated by an untouched line without conflict', () => {
    // Unique lines keep the diff unambiguous; the separator is never edited.
    const block = (prefix: string) =>
      fc
        .uniqueArray(fc.nat({ max: 50 }), { maxLength: 4 })
        .map((ns) => ns.map((n) => `${prefix}${n}`))

    fc.assert(
      fc.property(
        block('top'),
        block('top-new'),
        block('bottom'),
        block('bottom-new'),
        (top, topNew, bottom, bottomNew) => {
          const base = [...top, 'separator', ...bottom].join('\n')
          const mine = [...topNew, 'separator', ...bottom].join('\n')
          const theirs = [...top, 'separator', ...bottomNew].join('\n')

          expect(merge3(base, mine, theirs)).toEqual({
            status: 'clean',
            text: [...topNew, 'separator', ...bottomNew].join('\n'),
          })
        },
      ),
    )
  })
})

function outputLines(result: MergeResult): string[] {
  if (result.status === 'clean') return result.text.split('\n')
  return result.chunks.flatMap((c) =>
    c.type === 'ok' ? c.lines : [...c.base, ...c.mine, ...c.theirs],
  )
}

function swapSides(result: MergeResult): MergeResult {
  if (result.status === 'clean') return result
  return {
    status: 'conflict',
    chunks: result.chunks.map((c) =>
      c.type === 'ok' ? c : { ...c, mine: c.theirs, theirs: c.mine },
    ),
  }
}
