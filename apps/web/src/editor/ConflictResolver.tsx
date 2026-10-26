import type { MergeChunk } from '@agendina/core'
import { useId, useState } from 'react'

type Choice = 'mine' | 'theirs' | 'both'

interface Props {
  chunks: MergeChunk[]
  onResolve: (text: string) => void
  onDiscard: () => void
}

/**
 * Shown when this page and another device changed the same lines. Unchanged lines are context;
 * each clash is decided separately. "Keep both" is the default, so saving never loses text.
 */
export function ConflictResolver({ chunks, onResolve, onDiscard }: Props) {
  const titleId = useId()
  const total = chunks.filter((c) => c.type === 'conflict').length
  const [choices, setChoices] = useState<Choice[]>(() => Array<Choice>(total).fill('both'))

  const resolved = () => {
    let index = 0
    return chunks
      .flatMap((chunk) => {
        if (chunk.type === 'ok') return chunk.lines
        const choice = choices[index++]
        if (choice === 'mine') return chunk.mine
        if (choice === 'theirs') return chunk.theirs
        return [...chunk.mine, ...chunk.theirs]
      })
      .join('\n')
  }

  let conflictIndex = 0
  return (
    <section className="conflict" role="group" aria-labelledby={titleId}>
      <h3 id={titleId}>This page changed elsewhere</h3>
      <p className="hint">Another device saved changes to the same lines. Choose what to keep.</p>
      {chunks.map((chunk, i) => {
        if (chunk.type === 'ok') {
          return (
            <pre key={i} className="conflict-context">
              {chunk.lines.join('\n')}
            </pre>
          )
        }
        const index = conflictIndex++
        return (
          <Clash
            key={i}
            chunk={chunk}
            label={`Change ${String(index + 1)} of ${String(total)}`}
            choice={choices[index] ?? 'both'}
            onChoose={(choice) => {
              setChoices((current) => current.map((c, j) => (j === index ? choice : c)))
            }}
          />
        )
      })}
      <div className="conflict-actions">
        <button type="button" className="link" onClick={onDiscard}>
          Discard my version
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            onResolve(resolved())
          }}
        >
          Save
        </button>
      </div>
    </section>
  )
}

interface ClashProps {
  chunk: Extract<MergeChunk, { type: 'conflict' }>
  label: string
  choice: Choice
  onChoose: (choice: Choice) => void
}

function Clash({ chunk, label, choice, onChoose }: ClashProps) {
  const name = useId()
  const options: { value: Choice; label: string; lines: string[] }[] = [
    { value: 'mine', label: 'Keep mine', lines: chunk.mine },
    { value: 'theirs', label: 'Keep the other version', lines: chunk.theirs },
    { value: 'both', label: 'Keep both', lines: [...chunk.mine, ...chunk.theirs] },
  ]
  return (
    <div className="clash" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label
          key={option.value}
          className="clash-option"
          data-checked={choice === option.value || undefined}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={choice === option.value}
            aria-describedby={`${name}-${option.value}`}
            onChange={() => {
              onChoose(option.value)
            }}
          />
          <span>{option.label}</span>
          <pre id={`${name}-${option.value}`}>
            {option.lines.length === 0 ? '(removed)' : option.lines.join('\n')}
          </pre>
        </label>
      ))}
    </div>
  )
}
