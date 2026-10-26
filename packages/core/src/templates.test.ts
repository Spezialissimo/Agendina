import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propagateTemplate, type TemplatedPage } from './templates.ts'

const lines = (...ls: string[]) => ls.join('\n')

const WEEK_V1 = lines(
  '## Objectives',
  '',
  '| Exercise | Mo | We | Fr |',
  '|---|---|---|---|',
  '| Squat | [ ] | [ ] | [ ] |',
  '| Bench | [ ] | [ ] | [ ] |',
)

// v2 adds a Deadlift row.
const WEEK_V2 = lines(
  '## Objectives',
  '',
  '| Exercise | Mo | We | Fr |',
  '|---|---|---|---|',
  '| Squat | [ ] | [ ] | [ ] |',
  '| Bench | [ ] | [ ] | [ ] |',
  '| Deadlift | [ ] | [ ] | [ ] |',
)

const history = { 1: WEEK_V1, 2: WEEK_V2 }

describe('propagateTemplate', () => {
  it('updates the current page and later pages, keeping what the user wrote', () => {
    const current: TemplatedPage = {
      key: '2026-10-19',
      templateRevision: 1,
      content: WEEK_V1.replace('| Squat | [ ] |', '| Squat | [x] |'),
    }
    const later: TemplatedPage = { key: '2026-10-26', templateRevision: 1, content: WEEK_V1 }

    const result = propagateTemplate({
      history,
      next: { revision: 2, content: WEEK_V2 },
      from: '2026-10-19',
      pages: [current, later],
    })

    expect(result.conflicts).toEqual([])
    expect(result.updated).toEqual([
      {
        key: '2026-10-19',
        templateRevision: 2,
        content: WEEK_V2.replace('| Squat | [ ] |', '| Squat | [x] |'),
      },
      { key: '2026-10-26', templateRevision: 2, content: WEEK_V2 },
    ])
  })

  it('never touches pages before the current one', () => {
    const result = propagateTemplate({
      history,
      next: { revision: 2, content: WEEK_V2 },
      from: '2026-10-19',
      pages: [{ key: '2026-10-12', templateRevision: 1, content: WEEK_V1 }],
    })

    expect(result).toEqual({ updated: [], conflicts: [] })
  })

  it('reports a conflict, and leaves the page alone, when the user changed the same lines', () => {
    const edited = WEEK_V1.replace('| Bench | [ ] | [ ] | [ ] |', '| Bench | [x] | [ ] | [ ] |')
    // v2b replaces Bench with Push-ups, a line the user also changed.
    const v2b = WEEK_V1.replace('| Bench | [ ] | [ ] | [ ] |', '| Push-ups | [ ] | [ ] | [ ] |')

    const result = propagateTemplate({
      history: { 1: WEEK_V1, 2: v2b },
      next: { revision: 2, content: v2b },
      from: '2026-10-19',
      pages: [{ key: '2026-10-19', templateRevision: 1, content: edited }],
    })

    expect(result.updated).toEqual([])
    expect(result.conflicts).toEqual([
      {
        key: '2026-10-19',
        chunks: [
          { type: 'ok', lines: WEEK_V1.split('\n').slice(0, 5) },
          {
            type: 'conflict',
            base: ['| Bench | [ ] | [ ] | [ ] |'],
            mine: ['| Bench | [x] | [ ] | [ ] |'],
            theirs: ['| Push-ups | [ ] | [ ] | [ ] |'],
          },
        ],
      },
    ])
  })

  it('merges each page against the template revision it was created from', () => {
    const v3 = WEEK_V2.replace('## Objectives', '## Goals')

    const result = propagateTemplate({
      history: { ...history, 3: v3 },
      next: { revision: 3, content: v3 },
      from: '2026-10-19',
      pages: [
        { key: '2026-10-19', templateRevision: 1, content: WEEK_V1 },
        { key: '2026-10-26', templateRevision: 2, content: WEEK_V2 },
      ],
    })

    expect(result.updated).toEqual([
      { key: '2026-10-19', templateRevision: 3, content: v3 },
      { key: '2026-10-26', templateRevision: 3, content: v3 },
    ])
  })

  it('skips pages already on the new revision and pages not created from a template', () => {
    const result = propagateTemplate({
      history,
      next: { revision: 2, content: WEEK_V2 },
      from: '2026-10-19',
      pages: [
        { key: '2026-10-19', templateRevision: 2, content: WEEK_V2 },
        { key: '2026-10-26', templateRevision: undefined, content: 'My own page' },
      ],
    })

    expect(result).toEqual({ updated: [], conflicts: [] })
  })

  it('fails loudly when a page refers to an unknown template revision', () => {
    expect(() =>
      propagateTemplate({
        history,
        next: { revision: 2, content: WEEK_V2 },
        from: '2026-10-19',
        pages: [{ key: '2026-10-19', templateRevision: 7, content: '' }],
      }),
    ).toThrow(/revision 7/)
  })

  it('gives untouched pages exactly the new template', () => {
    const anyTemplate = fc
      .array(fc.constantFrom('## A', '## B', '- [ ] x', '| a | [ ] |', ''), { maxLength: 8 })
      .map((ls) => ls.join('\n'))

    fc.assert(
      fc.property(anyTemplate, anyTemplate, (v1, v2) => {
        fc.pre(v1 !== v2)
        const result = propagateTemplate({
          history: { 1: v1, 2: v2 },
          next: { revision: 2, content: v2 },
          from: '2026-10-19',
          pages: [{ key: '2026-10-19', templateRevision: 1, content: v1 }],
        })

        expect(result).toEqual({
          updated: [{ key: '2026-10-19', templateRevision: 2, content: v2 }],
          conflicts: [],
        })
      }),
    )
  })
})
