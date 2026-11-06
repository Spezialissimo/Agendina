import { DEFAULT_FOCUS_MODE } from '@agendina/contract'
import {
  addDays,
  isDayKey,
  resolveKeymap,
  resolveLayout,
  setSplitSizes,
  type DayKey,
} from '@agendina/core'
import type { NoteKind } from '@agendina/contract'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useApi, useToday } from '../app/AppProviders.tsx'
import { SettingsIcon, SignOutIcon } from '../app/icons.tsx'
import { CommandPalette } from '../commands/CommandPalette.tsx'
import { COMMANDS, type CommandId } from '../commands/registry.ts'
import { useShortcuts } from '../commands/useShortcuts.ts'
import { toggleAtCursor } from '../editor/checkboxes.ts'
import { applyToFocusedEditor } from '../editor/focusedEditor.ts'
import { addColumn, addRow } from '../editor/tables.ts'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { LayoutView } from './LayoutView.tsx'
import { useFocusMode } from './useFocusMode.ts'
import { PlannerContext } from './PlannerContext.tsx'
import { PageFocus, PageFocusContext, focusTarget, type PageFocusApi } from './pageFocus.ts'
import { WeekStrip } from './WeekStrip.tsx'
import { useCurrentDay } from './useCurrentDay.ts'
import { useSettings } from './useSettings.ts'

export function PlannerPage() {
  const { day } = useParams()
  const today = useToday()
  if (day === undefined || !isDayKey(day)) return <Navigate to={`/day/${today}`} replace />
  return <Planner focus={day} />
}

function Planner({ focus }: { focus: DayKey }) {
  const today = useToday()
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { settings, isError, update } = useSettings()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const currentDay = useCurrentDay(focus)
  const keymap = useMemo(() => resolveKeymap(COMMANDS, settings?.keymap ?? {}), [settings?.keymap])

  const [pageFocus] = useState(() => new PageFocus())
  useEffect(() => pageFocus.connect(document), [pageFocus])
  // A request for another day lapses (e.g. the browser's back button went elsewhere meanwhile).
  useEffect(() => {
    const request = pageFocus.get()
    if (request !== undefined && request.day !== focus) pageFocus.cancel(request.id)
  }, [pageFocus, focus])
  const focusAfterNavigation = useCallback(
    (day: DayKey, side?: NoteKind) => {
      if (settings === undefined || !pageFocus.mayMoveFocus()) return
      const target = focusTarget(
        resolveLayout(settings.layout, day, settings.weekRule),
        side ?? pageFocus.side ?? 'day',
      )
      if (target !== undefined) pageFocus.request(target.kind, target.key, day)
    },
    [pageFocus, settings],
  )
  const pageFocusApi = useMemo<PageFocusApi>(
    () => ({ store: pageFocus, focusAfterNavigation }),
    [pageFocus, focusAfterNavigation],
  )

  const run = useCallback(
    (id: CommandId) => {
      const go = (day: DayKey) => {
        focusAfterNavigation(day)
        void navigate(`/day/${day}`)
      }
      switch (id) {
        case 'focus.previousDay':
          go(addDays(currentDay(), -1))
          break
        case 'focus.nextDay':
          go(addDays(currentDay(), 1))
          break
        case 'focus.previousWeek':
          go(addDays(currentDay(), -7))
          break
        case 'focus.nextWeek':
          go(addDays(currentDay(), 7))
          break
        case 'focus.today':
          go(today)
          break
        case 'calendar.open':
          setCalendarOpen(true)
          break
        case 'palette.open':
          setPaletteOpen(true)
          break
        case 'settings.open':
          setSettingsOpen(true)
          break
        case 'account.signOut':
          void api.logout().then(() => queryClient.resetQueries())
          break
        case 'editor.toggleCheckbox':
          applyToFocusedEditor(toggleAtCursor)
          break
        case 'editor.addTableRow':
          applyToFocusedEditor(addRow)
          break
        case 'editor.addTableColumn':
          applyToFocusedEditor(addColumn)
          break
      }
    },
    [currentDay, today, navigate, api, queryClient, focusAfterNavigation],
  )

  useShortcuts(keymap, run, !paletteOpen && !settingsOpen)
  const { enabled: focusModeOn, idleMs } = settings?.focusMode ?? DEFAULT_FOCUS_MODE
  const focusMode = useFocusMode(focusModeOn && !paletteOpen && !settingsOpen, focus, idleMs)

  return (
    <PageFocusContext value={pageFocusApi}>
      <div className="planner" data-focus-mode={focusMode || undefined}>
        <header className="topbar">
          <span className="brand">Agendina</span>
          {settings !== undefined && (
            <WeekStrip
              focus={focus}
              rule={settings.weekRule}
              calendarOpen={calendarOpen}
              setCalendarOpen={setCalendarOpen}
            />
          )}
          <div className="topbar-actions">
            <button
              type="button"
              className="icon"
              aria-label="Settings"
              title="Settings"
              onClick={() => {
                run('settings.open')
              }}
            >
              <SettingsIcon />
            </button>
            <button
              type="button"
              className="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                run('account.signOut')
              }}
            >
              <SignOutIcon />
            </button>
          </div>
        </header>
        <main className="pages">
          {isError && <p role="alert">Your settings could not be loaded.</p>}
          {settings !== undefined && (
            <PlannerContext value={{ weekRule: settings.weekRule }}>
              <LayoutView
                layout={resolveLayout(settings.layout, focus, settings.weekRule)}
                onResize={(splitId, sizes) => {
                  update({ ...settings, layout: setSplitSizes(settings.layout, splitId, sizes) })
                }}
              />
            </PlannerContext>
          )}
        </main>
        {settingsOpen && settings !== undefined && (
          <SettingsDialog
            settings={settings}
            onChange={update}
            onClose={() => {
              setSettingsOpen(false)
            }}
          />
        )}
        {paletteOpen && (
          <CommandPalette
            keymap={keymap}
            onRun={run}
            onClose={() => {
              setPaletteOpen(false)
            }}
          />
        )}
      </div>
    </PageFocusContext>
  )
}
