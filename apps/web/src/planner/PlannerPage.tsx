import { DEFAULT_FOCUS_MODE, withLayouts, type NoteKind } from '@agendina/contract'
import {
  activeLayout,
  addDays,
  allLayouts,
  canAddLayout,
  isDayKey,
  nextLayoutName,
  pageInDirection,
  resolveKeymap,
  resizeLayout,
  resolveLayout,
  saveEditedLayout,
  weekStart,
  type DayKey,
  type Direction,
  type Layout,
} from '@agendina/core'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ContextType } from 'react'
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
import { LayoutEditor } from './LayoutEditor.tsx'
import { LayoutView } from './LayoutView.tsx'
import { TemplateDialog } from '../templates/TemplateDialog.tsx'
import { useFocusMode } from './useFocusMode.ts'
import { PlannerContext } from './PlannerContext.tsx'
import { PageFocus, PageFocusContext, focusTarget, type PageFocusApi } from './pageFocus.ts'
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
  const { settings, isError, saveFailed, update, flush } = useSettings()
  const live = useLiveUpdates()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The template pop-up: `from` is the selected page of its kind when it opened.
  const [templateEdit, setTemplateEdit] = useState<{ kind: NoteKind; from: DayKey } | undefined>(
    undefined,
  )
  // The layout being edited (`editing` is its id, undefined for a new one), until it is saved
  // or cancelled. Meanwhile the planner shows only the layout editor: no pages, no navigation,
  // no shortcuts.
  const [layoutDraft, setLayoutDraft] = useState<
    { editing: string | undefined; layout: Layout; name: string } | undefined
  >(undefined)
  const editingLayout = layoutDraft !== undefined
  // Stable: the layout editor listens to the pointer with it.
  const changeLayoutDraft = useCallback((layout: Layout) => {
    setLayoutDraft((draft) => (draft === undefined ? draft : { ...draft, layout }))
  }, [])
  const changeLayoutName = useCallback((name: string) => {
    setLayoutDraft((draft) => (draft === undefined ? draft : { ...draft, name }))
  }, [])
  const [signOutFailed, setSignOutFailed] = useState(false)
  const currentDay = useCurrentDay(focus)
  const keymap = useMemo(() => resolveKeymap(COMMANDS, settings?.keymap ?? {}), [settings?.keymap])

  const weekRule = settings?.weekRule
  const layouts = settings?.layouts
  const active = useMemo(
    () => (layouts === undefined ? undefined : activeLayout(layouts, 'desktop')),
    [layouts],
  )
  const layout = active?.layout
  // A preset is edited as a new copy, for which there must be room.
  const canEditLayout =
    layouts !== undefined && active !== undefined && (!active.preset || canAddLayout(layouts))
  /** Opens the layout editor on layout `id`, or on a new layout made from the one on show. */
  const startLayoutEdit = useCallback(
    (id: string | undefined) => {
      if (layouts === undefined || active === undefined) return
      const edited = allLayouts(layouts).find((l) => l.id === id)
      setLayoutDraft({
        editing: id,
        layout: (edited ?? active).layout,
        name: edited !== undefined && !edited.preset ? edited.name : nextLayoutName(layouts),
      })
    },
    [layouts, active],
  )
  const editTemplate = useCallback(
    (kind: NoteKind) => {
      if (weekRule === undefined) return
      const day = currentDay()
      setTemplateEdit({ kind, from: kind === 'day' ? day : weekStart(day, weekRule) })
    },
    [weekRule, currentDay],
  )

  const [pageFocus] = useState(() => new PageFocus())
  useEffect(() => pageFocus.connect(document), [pageFocus])
  // A request for another day lapses (e.g. the browser's back button went elsewhere meanwhile).
  // Compared with the day open right now, not the one rendered: a second shortcut pressed before
  // this render has already asked for the day after, and that request must stay.
  useEffect(() => {
    const request = pageFocus.get()
    if (request !== undefined && request.day !== currentDay()) pageFocus.cancel(request.id)
  }, [pageFocus, focus, currentDay])
  const focusAfterNavigation = useCallback(
    (day: DayKey, side?: NoteKind) => {
      if (layout === undefined || weekRule === undefined || !pageFocus.mayMoveFocus()) return
      const target = focusTarget(
        resolveLayout(layout, day, weekRule),
        side ?? pageFocus.side ?? 'day',
      )
      if (target !== undefined) pageFocus.request(target.kind, target.key, day)
    },
    [pageFocus, layout, weekRule],
  )
  /**
   * Puts the cursor in the page on that side of the one being written in, or, before any page
   * was, in the selected day page. The selected day stays the same.
   */
  const moveToPage = useCallback(
    (direction: Direction) => {
      if (layout === undefined || weekRule === undefined) return
      const day = currentDay()
      const resolved = resolveLayout(layout, day, weekRule)
      const page = focusedEditor()?.dom.closest<HTMLElement>('[data-page-kind]')?.dataset
      const kind = page?.pageKind
      const key = page?.pageKey
      const target =
        page === undefined
          ? focusTarget(resolved, 'day')
          : (kind === 'day' || kind === 'week') && key !== undefined && isDayKey(key)
            ? pageInDirection(resolved, { kind, key }, direction)
            : undefined
      if (target !== undefined) pageFocus.request(target.kind, target.key, day)
    },
    [pageFocus, layout, weekRule, currentDay],
  )
  const pageFocusApi = useMemo<PageFocusApi>(
    () => ({ store: pageFocus, focusAfterNavigation }),
    [pageFocus, focusAfterNavigation],
  )

  const signOut = useCallback(async () => {
    setSignOutFailed(false)
    try {
      // First, while still signed in: a setting changed a moment ago is not saved yet.
      await flush()
      await api.logout()
      await queryClient.resetQueries()
    } catch {
      setSignOutFailed(true)
    }
  }, [api, queryClient, flush])

  const plannerContext = useMemo<ContextType<typeof PlannerContext>>(
    () => (weekRule === undefined ? undefined : { weekRule }),
    [weekRule],
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
        case 'page.moveLeft':
          moveToPage('left')
          break
        case 'page.moveDown':
          moveToPage('down')
          break
        case 'page.moveUp':
          moveToPage('up')
          break
        case 'page.moveRight':
          moveToPage('right')
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
        case 'layout.edit':
          if (active !== undefined && canEditLayout) startLayoutEdit(active.id)
          break
        case 'template.editDay':
          editTemplate('day')
          break
        case 'template.editWeek':
          editTemplate('week')
          break
        case 'account.signOut':
          void signOut()
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
    [
      currentDay,
      today,
      navigate,
      signOut,
      editTemplate,
      focusAfterNavigation,
      moveToPage,
      active,
      canEditLayout,
      startLayoutEdit,
    ],
  )

  const busy = paletteOpen || settingsOpen || editingLayout || templateEdit !== undefined
  useShortcuts(keymap, run, !busy)
  const { enabled: focusModeOn, idleMs } = settings?.focusMode ?? DEFAULT_FOCUS_MODE
  const focusMode = useFocusMode(focusModeOn && !busy, focus, idleMs)

  return (
    <PageFocusContext value={pageFocusApi}>
      <div className="planner" data-focus-mode={focusMode || undefined}>
        <header className="topbar">
          <span className="brand">Agendina</span>
          {settings !== undefined && live && !editingLayout && (
            <WeekStrip
              focus={focus}
              rule={settings.weekRule}
              calendarOpen={calendarOpen}
              setCalendarOpen={setCalendarOpen}
            />
          )}
          <div className="topbar-actions" hidden={editingLayout}>
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
          {saveFailed && (
            <p role="alert">Your settings could not be saved. They will be saved when possible.</p>
          )}
          {signOutFailed && (
            <p role="alert">Could not sign out. Check your connection and try again.</p>
          )}
          {settings !== undefined && editingLayout && (
            <LayoutEditor
              layout={layoutDraft.layout}
              name={layoutDraft.name}
              onRename={changeLayoutName}
              onChange={changeLayoutDraft}
              onCancel={() => {
                setLayoutDraft(undefined)
              }}
              onSave={() => {
                const layouts = saveEditedLayout(settings.layouts, {
                  ...layoutDraft,
                  screen: 'desktop',
                })
                if (layouts !== settings.layouts) update(withLayouts({ ...settings, layouts }))
                setLayoutDraft(undefined)
              }}
            />
          )}
          {settings !== undefined && active !== undefined && live && !editingLayout && (
            <PlannerContext value={plannerContext}>
              <LayoutView
                layout={resolveLayout(active.layout, focus, settings.weekRule)}
                onResize={(splitId, sizes) => {
                  update(
                    withLayouts({
                      ...settings,
                      layouts: resizeLayout(settings.layouts, active.id, splitId, sizes),
                    }),
                  )
                }}
              />
            </PlannerContext>
          )}
        </main>
        {settingsOpen && settings !== undefined && (
          <SettingsDialog
            settings={settings}
            onChange={update}
            onEditTemplate={(kind) => {
              setSettingsOpen(false)
              run(kind === 'day' ? 'template.editDay' : 'template.editWeek')
            }}
            onEditLayout={(id) => {
              setSettingsOpen(false)
              startLayoutEdit(id)
            }}
            onNewLayout={() => {
              setSettingsOpen(false)
              startLayoutEdit(undefined)
            }}
            onClose={() => {
              setSettingsOpen(false)
            }}
          />
        )}
        {templateEdit !== undefined && plannerContext !== undefined && (
          <PlannerContext value={plannerContext}>
            <TemplateDialog
              key={templateEdit.kind}
              kind={templateEdit.kind}
              from={templateEdit.from}
              onClose={() => {
                setTemplateEdit(undefined)
              }}
            />
          </PlannerContext>
        )}
        {paletteOpen && (
          <CommandPalette
            keymap={keymap}
            isAvailable={(id) => id !== 'layout.edit' || canEditLayout}
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
