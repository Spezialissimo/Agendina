import { lookupCommand, type KeymapEntry } from '@agendina/core'
import { useEffect } from 'react'
import { usePlatform } from '../app/AppProviders.tsx'
import type { CommandId } from './registry.ts'

/** Runs commands from key presses anywhere on the page, except while typing in a form field. */
export function useShortcuts(
  keymap: KeymapEntry[],
  run: (id: CommandId) => void,
  enabled: boolean,
) {
  const platform = usePlatform()

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isFormField(event.target)) return
      const context =
        event.target instanceof Element && event.target.closest('[data-editor]') !== null
          ? 'editor'
          : 'global'
      const id = lookupCommand(keymap, event, context, platform)
      if (id === undefined) return
      event.preventDefault()
      run(id as CommandId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [keymap, run, enabled, platform])
}

/** Text fields that are not page editors (search boxes, forms) keep all keys to themselves. */
function isFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.closest('[data-editor]') !== null) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}
