import { panelContent, type Layout } from '@agendina/core'
import { contentLabel } from '../planner/LayoutEditor.tsx'

/** A miniature of a layout: each page a box, in its place and at its size. Decorative. */
export function LayoutPreview({ layout }: { layout: Layout }) {
  return (
    <div className="layout-preview" aria-hidden="true">
      <PreviewNode node={layout} />
    </div>
  )
}

function PreviewNode({ node }: { node: Layout }) {
  if (node.type === 'panel') {
    const content = panelContent(node.panel)
    const label =
      'offset' in content && content.offset === 0
        ? content.kind === 'day'
          ? 'Day'
          : 'Week'
        : contentLabel(content)
    return (
      <div className="layout-preview-page" data-writable={label === 'Day' || label === 'Week'}>
        <span>{label}</span>
      </div>
    )
  }
  return (
    <div className="layout-preview-split" data-direction={node.direction}>
      {node.children.map((child) => (
        <div key={child.node.id} className="layout-preview-cell" style={{ flexGrow: child.size }}>
          <PreviewNode node={child.node} />
        </div>
      ))}
    </div>
  )
}
