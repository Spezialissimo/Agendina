import { layoutProblems, type Layout } from '@agendina/core'
import { z } from 'zod'

const NotePanelSchema = z.object({
  type: z.literal('note'),
  kind: z.enum(['day', 'week']),
  offset: z.number().int(),
})

const PanelSchema = z.discriminatedUnion('type', [
  NotePanelSchema,
  z.strictObject({ type: z.literal('calendar') }),
])

const LayoutNode: z.ZodType<Layout> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('panel'), id: z.string().min(1), panel: PanelSchema }),
    z.object({
      type: z.literal('split'),
      id: z.string().min(1),
      direction: z.enum(['row', 'column']),
      children: z.array(z.object({ node: LayoutNode, size: z.number().positive() })).min(1),
    }),
  ]),
)

/**
 * A layout from untrusted JSON (e.g. user settings): its ids must be unique across the tree, and
 * it must be usable (a page to write in, no page twice, see `layoutProblems`).
 */
export const LayoutSchema: z.ZodType<Layout> = LayoutNode.superRefine((layout, ctx) => {
  const ids = collectIds(layout)
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
  if (duplicate !== undefined) {
    ctx.addIssue({ code: 'custom', message: `Invalid layout: duplicate id "${duplicate}"` })
  }
  for (const problem of layoutProblems(layout)) {
    ctx.addIssue({ code: 'custom', message: `Invalid layout: ${problem}` })
  }
})

function collectIds(layout: Layout): string[] {
  if (layout.type === 'panel') return [layout.id]
  return [layout.id, ...layout.children.flatMap((child) => collectIds(child.node))]
}
