import type { Layout } from '@agendina/core'
import { z } from 'zod'

const NotePanelSchema = z.object({
  type: z.literal('note'),
  kind: z.enum(['day', 'week']),
  offset: z.number().int(),
})

const LayoutNode: z.ZodType<Layout> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('panel'), id: z.string().min(1), panel: NotePanelSchema }),
    z.object({
      type: z.literal('split'),
      id: z.string().min(1),
      direction: z.enum(['row', 'column']),
      children: z.array(z.object({ node: LayoutNode, size: z.number().positive() })).min(1),
    }),
  ]),
)

/** A layout from untrusted JSON (e.g. user settings): its ids must be unique across the tree. */
export const LayoutSchema: z.ZodType<Layout> = LayoutNode.superRefine((layout, ctx) => {
  const ids = collectIds(layout)
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
  if (duplicate !== undefined) {
    ctx.addIssue({ code: 'custom', message: `Invalid layout: duplicate id "${duplicate}"` })
  }
})

function collectIds(layout: Layout): string[] {
  if (layout.type === 'panel') return [layout.id]
  return [layout.id, ...layout.children.flatMap((child) => collectIds(child.node))]
}
