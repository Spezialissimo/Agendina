import { formatBinding, type KeymapEntry } from '@agendina/core'
import { useId, useState, type KeyboardEvent } from 'react'
import { usePlatform } from '../app/AppProviders.tsx'
import { COMMANDS, type CommandId } from './registry.ts'

interface Props {
  keymap: KeymapEntry[]
  /** Commands that cannot do anything right now are not listed. */
  isAvailable?: (id: CommandId) => boolean
  onRun: (id: CommandId) => void
  onClose: () => void
}

/** ⌘K: find any command by name, see its shortcut, run it. */
export function CommandPalette({ keymap, isAvailable = () => true, onRun, onClose }: Props) {
  const platform = usePlatform()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const matches = COMMANDS.filter(
    (c) =>
      c.id !== 'palette.open' &&
      isAvailable(c.id) &&
      c.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const selected = Math.min(active, matches.length - 1)

  const run = (id: CommandId) => {
    onClose()
    onRun(id)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((selected + step + matches.length) % Math.max(matches.length, 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const command = matches[selected]
      if (command !== undefined) run(command.id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Commands"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            matches[selected] === undefined ? undefined : `${listId}-${String(selected)}`
          }
          aria-label="Search commands"
          placeholder="Type a command…"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ul id={listId} role="listbox" aria-label="Commands">
          {matches.map((command, index) => {
            const binding = keymap.find((e) => e.commandId === command.id)?.binding
            return (
              <li
                key={command.id}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === selected}
                onPointerEnter={() => {
                  setActive(index)
                }}
                onClick={() => {
                  run(command.id)
                }}
              >
                <span>{command.title}</span>
                {binding !== undefined && <kbd>{formatBinding(binding, platform)}</kbd>}
              </li>
            )
          })}
          {matches.length === 0 && <li className="palette-empty">No matching command</li>}
        </ul>
      </div>
    </div>
  )
}
