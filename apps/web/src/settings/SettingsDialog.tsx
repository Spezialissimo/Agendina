import { withLayouts, type AuthState, type NoteKind, type UserSettings } from '@agendina/contract'
import {
  activeLayout,
  addDays,
  allLayouts,
  deleteLayout,
  selectLayout,
  type WeekRule,
  type Weekday,
} from '@agendina/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState, type KeyboardEvent } from 'react'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { AUTH_QUERY, useAuthState } from '../auth/AuthGate.tsx'
import { format } from '../planner/weeks.ts'
import { LayoutPreview } from './LayoutPreview.tsx'

interface Props {
  settings: UserSettings
  onChange: (settings: UserSettings) => void
  /** The page kinds whose template can be edited from the pages on show. */
  templateKinds: readonly NoteKind[]
  onEditTemplate: (kind: NoteKind) => void
  /** Edits a layout, and shows it; a preset is duplicated first. */
  onEditLayout: (id: string) => void
  /** Makes a new layout, starting from the one on show. */
  onNewLayout: () => void
  onClose: () => void
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
// Monday 26 October 2026, to name the weekdays in the UI language.
const A_MONDAY = '2026-10-26'

const RESTING_TIMES_MS = [1000, 1500, 2000, 3000, 5000, 10_000]

const seconds = (ms: number) => `${String(ms / 1000)} ${ms === 1000 ? 'second' : 'seconds'}`

const NUMBERING: { minimalDays: WeekRule['minimalDays']; label: string }[] = [
  { minimalDays: 4, label: 'First week with 4 days (ISO)' },
  { minimalDays: 1, label: 'Week with January 1' },
]

/** The user's preferences; changes apply right away and are saved shortly after. */
export function SettingsDialog({
  settings,
  onChange,
  templateKinds,
  onEditTemplate,
  onEditLayout,
  onNewLayout,
  onClose,
}: Props) {
  const locale = useLocale()
  const titleId = useId()
  const { weekRule, focusMode } = settings
  const setFocusMode = (change: Partial<typeof focusMode>) => {
    onChange({ ...settings, focusMode: { ...focusMode, ...change } })
  }
  // A time set elsewhere (the API) is still shown.
  const restingTimes = RESTING_TIMES_MS.includes(focusMode.idleMs)
    ? RESTING_TIMES_MS
    : [...RESTING_TIMES_MS, focusMode.idleMs].sort((a, b) => a - b)
  const setWeekRule = (rule: Partial<WeekRule>) => {
    onChange({ ...settings, weekRule: { ...weekRule, ...rule } })
  }
  const numbering = NUMBERING.some((n) => n.minimalDays === weekRule.minimalDays)
    ? NUMBERING
    : [
        ...NUMBERING,
        {
          minimalDays: weekRule.minimalDays,
          label: `First week with ${String(weekRule.minimalDays)} days`,
        },
      ]

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="palette-backdrop" onPointerDown={onClose}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
      >
        <header className="settings-header">
          <h2 id={titleId}>Settings</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </header>
        <fieldset>
          <legend>Weeks</legend>
          <label>
            Weeks start on
            <select
              autoFocus
              value={weekRule.firstDay}
              onChange={(event) => {
                setWeekRule({ firstDay: Number(event.target.value) as Weekday })
              }}
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {format(addDays(A_MONDAY, day - 1), locale, { weekday: 'long' })}
                </option>
              ))}
            </select>
          </label>
          <label>
            Week 1 is
            <select
              value={weekRule.minimalDays}
              onChange={(event) => {
                setWeekRule({
                  minimalDays: Number(event.target.value) as WeekRule['minimalDays'],
                })
              }}
            >
              {numbering.map(({ minimalDays, label }) => (
                <option key={minimalDays} value={minimalDays}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Focus</legend>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={focusMode.enabled}
              onChange={(event) => {
                setFocusMode({ enabled: event.target.checked })
              }}
            />
            Focus mode
          </label>
          <p>
            While you write, everything but the page fades and the buttons hide until you move the
            mouse.
          </p>
          <label>
            Start after the mouse rests for
            <select
              value={focusMode.idleMs}
              disabled={!focusMode.enabled}
              onChange={(event) => {
                setFocusMode({ idleMs: Number(event.target.value) })
              }}
            >
              {restingTimes.map((ms) => (
                <option key={ms} value={ms}>
                  {seconds(ms)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <LayoutSettings
          settings={settings}
          onChange={onChange}
          onEditLayout={onEditLayout}
          onNewLayout={onNewLayout}
        />
        {templateKinds.length > 0 && (
          <fieldset>
            <legend>Templates</legend>
            <p>New pages start from their template. Edit it on the page you are looking at.</p>
            <div className="settings-actions">
              {templateKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    onEditTemplate(kind)
                  }}
                >
                  Edit {kind} template
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <legend>Your pages</legend>
          <p>
            <a href="/api/export" download>
              Download all pages
            </a>{' '}
            <span>as markdown files in a zip</span>
          </p>
        </fieldset>
        <SignupSetting />
      </div>
    </div>
  )
}

/**
 * The named layouts as cards with a miniature of each: clicking one shows it, its buttons edit
 * and delete it; the layout editor renames it (ADR 0005). A preset is duplicated to be edited.
 */
function LayoutSettings({
  settings,
  onChange,
  onEditLayout,
  onNewLayout,
}: Pick<Props, 'settings' | 'onChange' | 'onEditLayout' | 'onNewLayout'>) {
  const group = useId()
  const [deleting, setDeleting] = useState<string | undefined>(undefined)
  const { layouts } = settings
  const activeId = activeLayout(layouts, 'desktop').id
  const setLayouts = (next: typeof layouts) => {
    if (next !== layouts) onChange(withLayouts(settings, next))
  }

  return (
    <fieldset>
      <legend>Layout</legend>
      <p>Choose which pages are on the screen and how they are arranged.</p>
      <div role="radiogroup" aria-label="Layouts" className="layout-cards">
        {allLayouts(layouts).map((layout) => (
          <div
            key={layout.id}
            className="layout-card"
            data-active={layout.id === activeId || undefined}
            data-confirming={deleting === layout.id || undefined}
          >
            <div className="layout-card-title">
              <span className="layout-card-name">{layout.name}</span>
              {layout.preset && <span className="layout-card-tag">Preset</span>}
            </div>
            <div className="layout-card-body">
              <label className="layout-card-choice">
                <input
                  type="radio"
                  name={group}
                  aria-label={layout.name}
                  checked={layout.id === activeId}
                  onChange={() => {
                    setLayouts(selectLayout(layouts, 'desktop', layout.id))
                  }}
                />
                <LayoutPreview layout={layout.layout} />
              </label>
              <div className="layout-card-actions">
                {deleting === layout.id ? (
                  <>
                    <span>Delete {layout.name}?</span>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        setDeleting(undefined)
                        setLayouts(deleteLayout(layouts, layout.id))
                      }}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => {
                        setDeleting(undefined)
                      }}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`${layout.preset ? 'Duplicate and edit' : 'Edit'} ${layout.name}`}
                      onClick={() => {
                        onEditLayout(layout.id)
                      }}
                    >
                      {layout.preset ? 'Duplicate and edit' : 'Edit'}
                    </button>
                    {!layout.preset && (
                      <button
                        type="button"
                        className="danger"
                        aria-label={`Delete ${layout.name}`}
                        onClick={() => {
                          setDeleting(layout.id)
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="layout-card layout-card-new" onClick={onNewLayout}>
          <span aria-hidden="true">+</span> New layout
        </button>
      </div>
    </fieldset>
  )
}

/** For the admin: whether anyone can create an account on this instance. */
function SignupSetting() {
  const api = useApi()
  const queryClient = useQueryClient()
  const auth = useAuthState()
  const save = useMutation({
    mutationFn: (signupOpen: boolean) => api.setInstanceSettings({ signupOpen }),
    onSuccess: ({ signupOpen }) => {
      queryClient.setQueryData<AuthState>(AUTH_QUERY, (state) =>
        state === undefined ? state : { ...state, signupOpen },
      )
    },
  })
  if (auth.data?.user?.role !== 'admin') return null
  return (
    <fieldset>
      <legend>This server</legend>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={auth.data.signupOpen}
          disabled={save.isPending}
          onChange={(event) => {
            save.mutate(event.target.checked)
          }}
        />
        Anyone can create an account
      </label>
      {save.isError && <p role="alert">The change could not be saved. Try again.</p>}
    </fieldset>
  )
}
