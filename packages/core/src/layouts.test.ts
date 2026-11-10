import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { OPEN_PLANNER, setSplitSizes, type Layout } from './layout.ts'
import {
  DEFAULT_LAYOUTS,
  OPEN_PLANNER_ID,
  PRESETS,
  activeLayout,
  adoptLegacyLayout,
  allLayouts,
  deleteLayout,
  nextLayoutName,
  renameLayout,
  resizeLayout,
  saveEditedLayout,
  selectLayout,
  type Layouts,
} from './layouts.ts'

const note = (id: string, kind: 'day' | 'week', offset: number): Layout => ({
  type: 'panel',
  id,
  panel: { type: 'note', kind, offset },
})

const split = (id: string, ...children: [Layout, number][]): Layout => ({
  type: 'split',
  id,
  direction: 'column',
  children: children.map(([node, size]) => ({ node, size })),
})

const DAY_ONLY = note('day', 'day', 0)
const TWO_DAYS = split('days', [note('d0', 'day', 0), 0.5], [note('d1', 'day', 1), 0.5])

/** Names in the order the layout list shows them. */
const names = (layouts: Layouts) => allLayouts(layouts).map((l) => l.name)

/** Saves `tree` as a new layout and returns the result with the new layout's id. */
const create = (layouts: Layouts, tree: Layout) => {
  const next = saveEditedLayout(layouts, { editing: undefined, layout: tree, screen: 'desktop' })
  return { layouts: next, id: activeLayout(next, 'desktop').id }
}

describe('presets', () => {
  it('offers Open planner, active on every screen at first', () => {
    expect(PRESETS.map((p) => p.name)).toEqual(['Open planner'])
    expect(allLayouts(DEFAULT_LAYOUTS)).toEqual([
      { id: OPEN_PLANNER_ID, name: 'Open planner', preset: true, layout: OPEN_PLANNER },
    ])
    expect(activeLayout(DEFAULT_LAYOUTS, 'desktop').id).toBe(OPEN_PLANNER_ID)
    expect(activeLayout(DEFAULT_LAYOUTS, 'phone').id).toBe(OPEN_PLANNER_ID)
  })

  it('cannot be renamed or deleted', () => {
    expect(renameLayout(DEFAULT_LAYOUTS, OPEN_PLANNER_ID, 'Mine')).toEqual(DEFAULT_LAYOUTS)
    expect(deleteLayout(DEFAULT_LAYOUTS, OPEN_PLANNER_ID)).toEqual(DEFAULT_LAYOUTS)
  })

  it('keeps the splitter sizes chosen for it, without changing the preset', () => {
    const resized = resizeLayout(DEFAULT_LAYOUTS, OPEN_PLANNER_ID, 'pages', [0.3, 0.7])

    expect(activeLayout(resized, 'desktop').layout).toEqual(
      setSplitSizes(OPEN_PLANNER, 'pages', [0.3, 0.7]),
    )
    expect(PRESETS[0]?.layout).toEqual(OPEN_PLANNER)
  })

  it('ignores stored sizes that no longer fit the preset', () => {
    const layouts: Layouts = {
      ...DEFAULT_LAYOUTS,
      presetSizes: { [OPEN_PLANNER_ID]: { gone: [0.5, 0.5], pages: [0.2, 0.3, 0.5] } },
    }

    expect(activeLayout(layouts, 'desktop').layout).toEqual(OPEN_PLANNER)
  })

  it('saves an edited preset as a new custom layout, leaving the preset as it was', () => {
    const layouts = saveEditedLayout(DEFAULT_LAYOUTS, {
      editing: OPEN_PLANNER_ID,
      layout: DAY_ONLY,
      screen: 'desktop',
    })

    expect(names(layouts)).toEqual(['Open planner', 'Custom layout 1'])
    expect(activeLayout(layouts, 'desktop')).toMatchObject({
      name: 'Custom layout 1',
      preset: false,
      layout: DAY_ONLY,
    })
    expect(allLayouts(layouts)[0]?.layout).toEqual(OPEN_PLANNER)
  })

  // "Duplicate and edit": the copy is made even when nothing was changed.
  it('duplicates a preset saved unchanged', () => {
    const resized = resizeLayout(DEFAULT_LAYOUTS, OPEN_PLANNER_ID, 'pages', [0.3, 0.7])
    const saved = saveEditedLayout(resized, {
      editing: OPEN_PLANNER_ID,
      layout: activeLayout(resized, 'desktop').layout,
      screen: 'desktop',
    })

    expect(names(saved)).toEqual(['Open planner', 'Custom layout 1'])
    expect(activeLayout(saved, 'desktop').layout).toEqual(activeLayout(resized, 'desktop').layout)
  })
})

describe('custom layouts', () => {
  it('are named "Custom layout 1", "Custom layout 2", … and listed after the presets', () => {
    const first = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const second = create(first.layouts, TWO_DAYS)

    expect(names(second.layouts)).toEqual(['Open planner', 'Custom layout 1', 'Custom layout 2'])
    expect(first.id).not.toBe(second.id)
    expect(activeLayout(second.layouts, 'desktop').id).toBe(second.id)
  })

  it('are numbered one past the highest number in a name', () => {
    const one = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const two = create(one.layouts, TWO_DAYS)
    const withoutFirst = create(deleteLayout(two.layouts, one.id), DAY_ONLY)

    expect(names(withoutFirst.layouts)).toEqual([
      'Open planner',
      'Custom layout 2',
      'Custom layout 3',
    ])
    const renamed = renameLayout(deleteLayout(two.layouts, one.id), two.id, 'Mornings')
    expect(names(create(renamed, DAY_ONLY).layouts)).toEqual([
      'Open planner',
      'Mornings',
      'Custom layout 1',
    ])
  })

  it('never reuse the id of a layout that still exists', () => {
    const one = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const two = create(one.layouts, TWO_DAYS)
    const three = create(deleteLayout(two.layouts, one.id), DAY_ONLY)

    expect(three.id).not.toBe(two.id)
  })

  it('are edited in place, keeping their name', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const edited = saveEditedLayout(renameLayout(layouts, id, 'Mornings'), {
      editing: id,
      layout: TWO_DAYS,
      screen: 'desktop',
    })

    expect(names(edited)).toEqual(['Open planner', 'Mornings'])
    expect(activeLayout(edited, 'desktop')).toMatchObject({ id, layout: TWO_DAYS })
  })

  it('take the name given in the editor, trimmed', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const edit = { layout: TWO_DAYS, screen: 'desktop' as const }

    expect(names(saveEditedLayout(layouts, { ...edit, editing: id, name: ' Mornings ' }))).toEqual([
      'Open planner',
      'Mornings',
    ])
    expect(
      names(saveEditedLayout(layouts, { ...edit, editing: OPEN_PLANNER_ID, name: 'Evenings' })),
    ).toEqual(['Open planner', 'Custom layout 1', 'Evenings'])
    // A blank name keeps the one the layout has, or would get.
    expect(names(saveEditedLayout(layouts, { ...edit, editing: id, name: '  ' }))).toEqual(
      names(layouts),
    )
    expect(names(saveEditedLayout(layouts, { ...edit, editing: undefined, name: '' }))).toEqual([
      'Open planner',
      'Custom layout 1',
      'Custom layout 2',
    ])
  })

  it('suggest the name a new layout would get', () => {
    expect(nextLayoutName(DEFAULT_LAYOUTS)).toBe('Custom layout 1')
    expect(nextLayoutName(create(DEFAULT_LAYOUTS, DAY_ONLY).layouts)).toBe('Custom layout 2')
  })

  it('keep their own splitter sizes', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, TWO_DAYS)
    const resized = resizeLayout(layouts, id, 'days', [0.8, 0.2])
    const back = selectLayout(selectLayout(resized, 'desktop', OPEN_PLANNER_ID), 'desktop', id)

    expect(activeLayout(back, 'desktop').layout).toEqual(
      setSplitSizes(TWO_DAYS, 'days', [0.8, 0.2]),
    )
  })

  it('are renamed, trimmed, and keep their name when the new one is blank', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, DAY_ONLY)

    expect(names(renameLayout(layouts, id, '  Mornings '))).toContain('Mornings')
    expect(renameLayout(layouts, id, '   ')).toEqual(layouts)
  })

  it('switch the screens showing a deleted layout to the default one', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const onPhoneToo = selectLayout(layouts, 'phone', id)
    const deleted = deleteLayout(onPhoneToo, id)

    expect(names(deleted)).toEqual(['Open planner'])
    expect(activeLayout(deleted, 'desktop').id).toBe(OPEN_PLANNER_ID)
    expect(activeLayout(deleted, 'phone').id).toBe(OPEN_PLANNER_ID)
  })

  it('leave the active layout alone when another one is deleted', () => {
    const one = create(DEFAULT_LAYOUTS, DAY_ONLY)
    const two = create(one.layouts, TWO_DAYS)

    expect(activeLayout(deleteLayout(two.layouts, one.id), 'desktop').id).toBe(two.id)
  })
})

describe('active layout per screen', () => {
  it('is chosen separately for the desktop and the phone', () => {
    const { layouts, id } = create(DEFAULT_LAYOUTS, DAY_ONLY)

    expect(activeLayout(layouts, 'desktop').id).toBe(id)
    expect(activeLayout(layouts, 'phone').id).toBe(OPEN_PLANNER_ID)
    const phone = selectLayout(layouts, 'phone', id)
    expect(activeLayout(selectLayout(phone, 'desktop', OPEN_PLANNER_ID), 'phone').id).toBe(id)
  })

  it('ignores a choice of a layout that does not exist', () => {
    expect(selectLayout(DEFAULT_LAYOUTS, 'desktop', 'nope')).toEqual(DEFAULT_LAYOUTS)
  })
})

describe('a single layout saved by the previous release', () => {
  it('is Open planner when it is the default one', () => {
    expect(adoptLegacyLayout(DEFAULT_LAYOUTS, OPEN_PLANNER)).toEqual(DEFAULT_LAYOUTS)
  })

  it('keeps its sizes on Open planner when only the splitter moved', () => {
    const resized = setSplitSizes(OPEN_PLANNER, 'pages', [0.3, 0.7])
    const layouts = adoptLegacyLayout(DEFAULT_LAYOUTS, resized)

    expect(names(layouts)).toEqual(['Open planner'])
    expect(activeLayout(layouts, 'desktop').layout).toEqual(resized)
  })

  it('becomes "Custom layout 1", active on the desktop, when it was edited', () => {
    const layouts = adoptLegacyLayout(DEFAULT_LAYOUTS, DAY_ONLY)

    expect(names(layouts)).toEqual(['Open planner', 'Custom layout 1'])
    expect(activeLayout(layouts, 'desktop').layout).toEqual(DAY_ONLY)
    expect(activeLayout(layouts, 'phone').id).toBe(OPEN_PLANNER_ID)
  })

  // A tab still running the previous release saves the whole settings with one layout.
  describe('over named layouts', () => {
    const { layouts, id } = create(create(DEFAULT_LAYOUTS, DAY_ONLY).layouts, TWO_DAYS)

    it('changes nothing when it is the active layout as it is', () => {
      expect(adoptLegacyLayout(layouts, activeLayout(layouts, 'desktop').layout)).toEqual(layouts)
    })

    it('replaces the active custom layout, keeping the others', () => {
      const resized = setSplitSizes(TWO_DAYS, 'days', [0.7, 0.3])
      const adopted = adoptLegacyLayout(layouts, resized)

      expect(names(adopted)).toEqual(names(layouts))
      expect(activeLayout(adopted, 'desktop')).toMatchObject({ id, layout: resized })
    })

    it('switches back to Open planner when it was reset to it', () => {
      const adopted = adoptLegacyLayout(
        selectLayout(layouts, 'desktop', OPEN_PLANNER_ID),
        setSplitSizes(OPEN_PLANNER, 'pages', [0.6, 0.4]),
      )

      expect(names(adopted)).toEqual(names(layouts))
      expect(activeLayout(adopted, 'desktop').layout).toEqual(
        setSplitSizes(OPEN_PLANNER, 'pages', [0.6, 0.4]),
      )
    })

    it('becomes a new custom layout when Open planner was active and got edited', () => {
      const adopted = adoptLegacyLayout(selectLayout(layouts, 'desktop', OPEN_PLANNER_ID), DAY_ONLY)

      expect(names(adopted)).toEqual([...names(layouts), 'Custom layout 3'])
      expect(activeLayout(adopted, 'desktop').layout).toEqual(DAY_ONLY)
    })
  })
})

describe('any sequence of changes', () => {
  interface Step {
    op: 'create' | 'editPreset' | 'select' | 'delete' | 'rename' | 'edit'
    /** Which layout of the list the step acts on. */
    pick: number
    tree: Layout
    name: string
  }

  const step: fc.Arbitrary<Step> = fc.record({
    op: fc.constantFrom('create', 'editPreset', 'select', 'delete', 'rename', 'edit'),
    pick: fc.nat(),
    tree: fc.constantFrom(DAY_ONLY, TWO_DAYS, OPEN_PLANNER),
    name: fc.string(),
  })

  const apply = (layouts: Layouts, s: Step): Layouts => {
    if (s.op === 'create') return create(layouts, s.tree).layouts
    if (s.op === 'editPreset') {
      return saveEditedLayout(layouts, {
        editing: OPEN_PLANNER_ID,
        layout: s.tree,
        screen: 'desktop',
      })
    }
    const all = allLayouts(layouts)
    const id = all[s.pick % all.length]?.id ?? OPEN_PLANNER_ID
    switch (s.op) {
      case 'select':
        return selectLayout(layouts, s.pick % 2 === 0 ? 'desktop' : 'phone', id)
      case 'delete':
        return deleteLayout(layouts, id)
      case 'rename':
        return renameLayout(layouts, id, s.name)
      case 'edit':
        return saveEditedLayout(layouts, { editing: id, layout: s.tree, screen: 'desktop' })
    }
  }

  it('keeps the presets, unique ids and an existing layout active on every screen', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30 }), (steps) => {
        const layouts = steps.reduce(apply, DEFAULT_LAYOUTS)
        const all = allLayouts(layouts)
        const ids = all.map((l) => l.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect(all.filter((l) => l.preset).map((l) => l.layout)).toEqual([OPEN_PLANNER])
        expect(all.every((l) => l.name.trim() !== '')).toBe(true)
        expect(ids).toContain(layouts.active.desktop)
        expect(ids).toContain(layouts.active.phone)
      }),
    )
  })
})
