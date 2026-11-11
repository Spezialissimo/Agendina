import { DEFAULT_FOCUS_MODE, withLayouts, type NoteKind } from '@agendina/contract'
import {
  activeLayout,
  addDays,
  allLayouts,
  canAddLayout,
  isDayKey,
  nextLayoutName,
  editableNote,
  panelsOf,
  resolveKeymap,
  resizeLayout,
  resolveLayout,
  saveEditedLayout,
  type DayKey,
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
import { useFocusMode } from './useFocusMode.ts'
import { closeEdit, startEdit, type TemplateEdit } from './templateEdit.ts'
import { PlannerContext, type TemplateEdits } from './PlannerContext.tsx'
import { PageFocus, PageFocusContext, focusTarget, type PageFocusApi } from './pageFocus.ts'
import { WeekStrip } from './WeekStrip.tsx'
import { useCurrentDay } from './useCurrentDay.ts'
import { useLiveUpdates } from './useLiveUpdates.ts'
import { useSettings } from './useSettings.ts'
import { nextTextSize, readTextSize, writeTextSize, type PageKind } from './textSize.ts'

function showsEditable(layout: Layout, kind: NoteKind): boolean {
  return panelsOf(layout).some(
    ({ panel }) => panel.type === 'note' && panel.kind === kind && panel.offset === 0,
  )
}

/** The template edits whose page `layout` shows; `edits` itself when that is all of them. */
function shownEdits(edits: TemplateEdits, layout: Layout): TemplateEdits {
  const kinds = Object.keys(edits) as NoteKind[]
  const shown = kinds.filter((kind) => showsEditable(layout, kind))
  if (shown.length === kinds.length) return edits
  return Object.fromEntries(shown.map((kind) => [kind, edits[kind]]))
}

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
  // Stays open across navigation: the editor shows on the page of its kind that is being edited.
  const [templateEdits, setTemplateEdits] = useState<TemplateEdits>({})
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
  // An edit no page shows any more would come back, stale, with that page. Whatever changed the
  // layout (the editor, Settings, another device), so adjusted while rendering the new one.
  const [editsLayout, setEditsLayout] = useState(layout)
  if (layout !== editsLayout) {
    setEditsLayout(layout)
    if (layout !== undefined) setTemplateEdits((edits) => shownEdits(edits, layout))
  }
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
      if (page === undefined) return
      setTemplateEdits((edits) => ({ ...edits, [kind]: startEdit(edits[kind], kind, page.key) }))
    },
    [pageOf, currentDay],
  )
  const templateKinds = (['day', 'week'] as const).filter((kind) => pageOf(kind, focus))

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
    () =>
      weekRule === undefined
        ? undefined
        : {
            weekRule,
            templateEdits,
            closeTemplate: (edit: TemplateEdit) => {
              setTemplateEdits((edits) => ({
                ...edits,
                [edit.kind]: closeEdit(edits[edit.kind], edit),
              }))
            },
            setTemplateDraft: (edit: TemplateEdit, draft: string) => {
              setTemplateEdits((edits) => {
                const current = edits[edit.kind]
                return current?.key === edit.key
                  ? { ...edits, [edit.kind]: { ...current, draft } }
                  : edits
              })
            },
          },
    [weekRule, templateEdits],
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
      active,
      canEditLayout,
      startLayoutEdit,
    ],
  )

  const busy = paletteOpen || settingsOpen || editingLayout
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
            templateKinds={templateKinds}
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
        {paletteOpen && (
          <CommandPalette
            keymap={keymap}
            isAvailable={(id) =>
              (id !== 'template.editDay' || templateKinds.includes('day')) &&
              (id !== 'template.editWeek' || templateKinds.includes('week')) &&
              (id !== 'layout.edit' || canEditLayout)
            }
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
