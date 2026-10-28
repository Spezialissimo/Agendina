import type { MergeChunk } from '@agendina/core'
import { useId, useState } from 'react'

type Choice = 'mine' | 'theirs' | 'both'

export interface ResolverTexts {
  title: string
  hint: string
  mine: string
  theirs: string
  discard: string
}

const PAGE_TEXTS: ResolverTexts = {
  title: 'This page changed elsewhere',
  hint: 'Another device saved changes to the same lines. Choose what to keep.',
  mine: 'Keep mine',
  theirs: 'Keep the other version',
  discard: 'Discard my version',
}

interface Props {
  chunks: MergeChunk[]
  onResolve: (text: string) => void
  onDiscard: () => void
  /** Wording for other clashes than two devices editing a page, e.g. a page and its template. */
  texts?: Partial<ResolverTexts>
}

/**
 * Shown when this page and another version changed the same lines. Unchanged lines are context;
 * each clash is decided separately. "Keep both" is the default, so saving never loses text.
 */
export function ConflictResolver({ chunks, onResolve, onDiscard, texts: custom = {} }: Props) {
  const texts = { ...PAGE_TEXTS, ...custom }
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
      <h3 id={titleId}>{texts.title}</h3>
      <p className="hint">{texts.hint}</p>
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
            texts={texts}
            choice={choices[index] ?? 'both'}
            onChoose={(choice) => {
              setChoices((current) => current.map((c, j) => (j === index ? choice : c)))
            }}
          />
        )
      })}
      <div className="conflict-actions">
        <button type="button" className="link" onClick={onDiscard}>
          {texts.discard}
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
  texts: ResolverTexts
  choice: Choice
  onChoose: (choice: Choice) => void
}

function Clash({ chunk, label, texts, choice, onChoose }: ClashProps) {
  const name = useId()
  const options: { value: Choice; label: string; lines: string[] }[] = [
    { value: 'mine', label: texts.mine, lines: chunk.mine },
    { value: 'theirs', label: texts.theirs, lines: chunk.theirs },
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
