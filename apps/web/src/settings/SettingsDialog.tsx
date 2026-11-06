import type { AuthState, NoteKind, UserSettings } from '@agendina/contract'
import { addDays, type WeekRule, type Weekday } from '@agendina/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, type KeyboardEvent } from 'react'
import { useApi, useLocale } from '../app/AppProviders.tsx'
import { AUTH_QUERY, useAuthState } from '../auth/AuthGate.tsx'
import { format } from '../planner/weeks.ts'

interface Props {
  settings: UserSettings
  onChange: (settings: UserSettings) => void
  /** The page kinds whose template can be edited from the pages on show. */
  templateKinds: readonly NoteKind[]
  onEditTemplate: (kind: NoteKind) => void
  onClose: () => void
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
// Monday 26 October 2026, to name the weekdays in the UI language.
const A_MONDAY = '2026-10-26'

const RESTING_TIMES_MS = [1000, 1500, 2000, 3000, 5000, 10_000]

const seconds = (ms: number) => `${String(ms / 1000)} ${ms === 1000 ? 'second' : 'seconds'}`

const NUMBERING: { minimalDays: WeekRule['minimalDays']; label: string }[] = [
  { minimalDays: 4, label: 'The first week with four days of the new year (ISO)' },
  { minimalDays: 1, label: 'The week with January 1' },
]

/** The user's preferences; changes apply right away and are saved shortly after. */
export function SettingsDialog({
  settings,
  onChange,
  templateKinds,
  onEditTemplate,
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
          label: `The first week with ${String(weekRule.minimalDays)} days of the new year`,
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
          <p className="settings-hint">
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
        {templateKinds.length > 0 && (
          <fieldset>
            <legend>Templates</legend>
            <p className="settings-hint">
              New pages start from their template. Edit it on the page you are looking at.
            </p>
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
            <span className="settings-hint">as markdown files in a zip</span>
          </p>
        </fieldset>
        <SignupSetting />
      </div>
    </div>
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
