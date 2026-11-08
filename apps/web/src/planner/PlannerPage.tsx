import { DEFAULT_FOCUS_MODE, type NoteKind } from '@agendina/contract'
import {
  addDays,
  isDayKey,
  editableNote,
  resolveKeymap,
  resolveLayout,
  setSplitSizes,
  type DayKey,
} from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { useApi, useToday } from '../app/AppProviders.tsx'
import { SettingsIcon, SignOutIcon } from '../app/icons.tsx'
import { CommandPalette } from '../commands/CommandPalette.tsx'
import { COMMANDS, type CommandId } from '../commands/registry.ts'
import { useShortcuts } from '../commands/useShortcuts.ts'
import { toggleAtCursor } from '../editor/checkboxes.ts'
import { applyToFocusedEditor, focusedEditor } from '../editor/focusedEditor.ts'
import { addColumn, addRow } from '../editor/tables.ts'
import { SettingsDialog } from '../settings/SettingsDialog.tsx'
import { LayoutView } from './LayoutView.tsx'
import { useFocusMode } from './useFocusMode.ts'
import { closeEdit, type TemplateEdit } from './templateEdit.ts'
import { PlannerContext } from './PlannerContext.tsx'
import { WeekStrip } from './WeekStrip.tsx'
import { useCurrentDay } from './useCurrentDay.ts'
import { useLiveUpdates } from './useLiveUpdates.ts'
import { useSettings } from './useSettings.ts'
import { nextTextSize, readTextSize, writeTextSize, type PageKind } from './textSize.ts'

/** The page being typed in (or last typed in), else the day page. Read when a command runs. */
function targetPageKind(): PageKind {
  const kind = focusedEditor()?.dom.closest('[data-page-kind]')?.getAttribute('data-page-kind')
  return kind === 'week' ? 'week' : 'day'
}

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
  const live = useLiveUpdates()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Tied to the page it was opened on: a day edit ends on another day, a week edit on another week.
  const [templateEdit, setTemplateEdit] = useState<TemplateEdit | undefined>()
  const currentDay = useCurrentDay(focus)
  const keymap = useMemo(() => resolveKeymap(COMMANDS, settings?.keymap ?? {}), [settings?.keymap])

  const weekRule = settings?.weekRule
  const layout = settings?.layout
  const pageOf = useCallback(
    (kind: NoteKind, day: DayKey) =>
      layout === undefined || weekRule === undefined
        ? undefined
        : editableNote(resolveLayout(layout, day, weekRule), kind),
    [layout, weekRule],
  )
  const editTemplate = useCallback(
    (kind: NoteKind) => {
      const page = pageOf(kind, currentDay())
      if (page !== undefined) setTemplateEdit({ kind, key: page.key })
    },
    [pageOf, currentDay],
  )
  // An edit ends when its page is no longer the one shown for editing; coming back starts afresh.
  if (
    templateEdit !== undefined &&
    settings !== undefined &&
    pageOf(templateEdit.kind, focus)?.key !== templateEdit.key
  ) {
    setTemplateEdit(undefined)
  }
  const templateKinds = (['day', 'week'] as const).filter((kind) => pageOf(kind, focus))

  const run = useCallback(
    (id: CommandId) => {
      const go = (day: DayKey) => void navigate(`/day/${day}`)
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
        case 'page.nextTextSize': {
          const kind = targetPageKind()
          writeTextSize(kind, nextTextSize(readTextSize(kind)))
          break
        }
        case 'settings.open':
          setSettingsOpen(true)
          break
        case 'template.editDay':
          editTemplate('day')
          break
        case 'template.editWeek':
          editTemplate('week')
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
    [currentDay, today, navigate, api, queryClient, editTemplate],
  )

  useShortcuts(keymap, run, !paletteOpen && !settingsOpen)
  const { enabled: focusModeOn, idleMs } = settings?.focusMode ?? DEFAULT_FOCUS_MODE
  const focusMode = useFocusMode(focusModeOn && !paletteOpen && !settingsOpen, focus, idleMs)

  return (
    <div className="planner" data-focus-mode={focusMode || undefined}>
      <header className="topbar">
        <span className="brand">Agendina</span>
        {settings !== undefined && live && (
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
        {settings !== undefined && live && (
          <PlannerContext
            value={{
              weekRule: settings.weekRule,
              editingTemplate: templateEdit,
              closeTemplate: (edit) => {
                setTemplateEdit((current) => closeEdit(current, edit))
              },
            }}
          >
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
          templateKinds={templateKinds}
          onEditTemplate={(kind) => {
            setSettingsOpen(false)
            run(kind === 'day' ? 'template.editDay' : 'template.editWeek')
          }}
          onClose={() => {
            setSettingsOpen(false)
          }}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          keymap={keymap}
          isAvailable={(id) =>
            (id !== 'template.editDay' || templateKinds.includes('day')) &&
            (id !== 'template.editWeek' || templateKinds.includes('week'))
          }
          onRun={run}
          onClose={() => {
            setPaletteOpen(false)
          }}
        />
      )}
    </div>
  )
}
