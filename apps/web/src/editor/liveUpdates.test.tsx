import { focusManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '@agendina/core'
import { Api } from '../api/client.ts'
import { cursorPosition, editorText, placeCursor, replaceText, typeInto } from '../test/editor.ts'
import { renderApp } from '../test/render.tsx'
import { startTestServer, type TestServer } from '../test/server.ts'

const TODAY = 'Monday, October 26, 2026'
/** While the tab is visible, the app asks the server for changes this often. */
const POLL_MS = 5000
const CHANGES = /^GET \/api\/changes\?since=\d+/
/** Where the feed is now, asked once before the pages load. */
const CURSOR = 'GET /api/changes'
const NOTE_TODAY = 'GET /api/notes/day/2026-10-26'

/** A promise to release later, to hold a request at a chosen moment. */
function gate() {
  let release: (() => void) | undefined
  const closed = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    closed,
    open: () => {
      release?.()
    },
  }
}

/**
 * Two laptops side by side: what one writes shows up on the other within one poll, without
 * switching windows. "Another device" is `api`, which writes straight to the server.
 */
describe('live updates from other devices', () => {
  let server: TestServer
  let api: Api
  /** Requests the app sent, as `METHOD path`; `answered` once the server replied. */
  let sent: string[]
  let answered: string[]
  /** Runs before a request reaches the server; may throw to fail it like a lost connection. */
  let beforeSend: (request: string) => Promise<void>
  /** Runs once the server has answered, before the app sees the answer. */
  let beforeReply: (request: string) => Promise<void>

  beforeEach(async () => {
    // The clock still runs on its own (autosave, React Query); `nextPoll` jumps ahead.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      shouldAdvanceTime: true,
    })
    server = await startTestServer()
    await server.signup()
    api = new Api(server.fetch)
    sent = []
    answered = []
    beforeSend = () => Promise.resolve()
    beforeReply = () => Promise.resolve()
  })

  afterEach(async () => {
    vi.useRealTimers()
    // Back to jsdom's own (always visible) document, without telling the app still on screen.
    Reflect.deleteProperty(document, 'visibilityState')
    Reflect.deleteProperty(document, 'hidden')
    await server.close()
  })

  /** The app on its own recorded connection to the same server and account. */
  const open = (path = '/day/2026-10-26') => {
    const recorded: TestServer = {
      ...server,
      fetch: async (input, init) => {
        const request = `${init?.method ?? 'GET'} ${input}`
        sent.push(request)
        await beforeSend(request)
        const res = await server.fetch(input, init)
        await beforeReply(request)
        answered.push(request)
        return res
      },
    }
    return renderApp(recorded, path)
  }
  const nextPoll = () => act(() => vi.advanceTimersByTimeAsync(POLL_MS))
  const editor = (name: string) => screen.findByRole('textbox', { name })
  const status = (name: string) => within(screen.getByRole('region', { name })).getByRole('status')
  const stored = async () => (await api.getNote('day', '2026-10-26'))?.content
  const changeRequests = (requests: string[]) => requests.filter((r) => CHANGES.test(r))

  /** Opens today's page showing `text`, with everything loaded and nothing left to save. */
  const openWith = async (text: string) => {
    await api.saveNote('day', '2026-10-26', text, 0)
    const view = open()
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(editorText(textbox)).toBe(text)
    })
    await editor('Week 44')
    await screen.findByRole('link', { name: 'Mon 26, today, written' })
    return { ...view, textbox }
  }

  it('shows what another device wrote within one poll, without switching windows', async () => {
    const { textbox } = await openWith('from the laptop')

    await api.saveNote('day', '2026-10-26', 'from the laptop\nfrom the other laptop', 1)
    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('from the laptop\nfrom the other laptop')
    })
    expect(status(TODAY)).toHaveTextContent('Saved')
  })

  it('asks once per poll and reloads only the pages that changed', async () => {
    await api.saveNote('week', '2026-10-26', '## Goals', 0)
    await api.saveNote('day', '2026-10-25', 'yesterday', 0)
    const { textbox } = await openWith('today')
    await nextPoll()
    sent.length = 0

    await api.saveNote('day', '2026-10-26', 'today, edited elsewhere', 1)
    await nextPoll()
    await waitFor(() => {
      expect(editorText(textbox)).toBe('today, edited elsewhere')
    })

    expect(changeRequests(sent)).toHaveLength(1)
    // Unchanged pages on screen (the week page, the neighbouring days) are not asked for again.
    expect(sent.filter((r) => r.startsWith('GET /api/notes/week/'))).toEqual([])
    expect(sent.filter((r) => /^GET \/api\/notes\/day\/(?!2026-10-26)/.test(r))).toEqual([])
    expect(sent.filter((r) => r.startsWith('GET /api/templates/'))).toEqual([])

    sent.length = 0
    await nextPoll()
    expect(sent).toEqual([expect.stringMatching(CHANGES)])
  })

  it('marks a day written on another device in the week strip', async () => {
    await openWith('today')

    await api.saveNote('day', '2026-10-27', 'tomorrow, planned on the phone', 0)
    await nextPoll()

    expect(await screen.findByRole('link', { name: 'Tue 27, written' })).toBeInTheDocument()
  })

  it('shows a template changed on another device on pages nobody wrote yet', async () => {
    await api.saveTemplate('day', '## Plan', 0)
    open('/day/2026-10-26')
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(editorText(textbox)).toBe('## Plan')
    })

    await api.saveTemplate('day', '## Plan\n## Gratitude', 1)
    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('## Plan\n## Gratitude')
    })
  })

  it('keeps the cursor where it was, moved along by a line added above it', async () => {
    const { textbox } = await openWith('Call dentist\nRun 5km')
    placeCursor(textbox, 'Call dentist\nRun 5km'.length)

    await api.saveNote('day', '2026-10-26', '## Monday\nCall dentist\nRun 5km', 1)
    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('## Monday\nCall dentist\nRun 5km')
    })
    expect(cursorPosition(textbox)).toBe('## Monday\nCall dentist\nRun 5km'.length)
    expect(textbox).toHaveFocus()
  })

  it('does not poll while the tab is hidden, and catches up as soon as it is visible', async () => {
    const { textbox } = await openWith('before lunch')
    setVisibility('hidden')
    sent.length = 0

    await api.saveNote('day', '2026-10-26', 'before lunch\nafter lunch', 1)
    await api.saveNote('day', '2026-10-27', 'tomorrow', 0)
    await nextPoll()
    await nextPoll()
    await nextPoll()
    expect(changeRequests(sent)).toEqual([])
    expect(editorText(textbox)).toBe('before lunch')

    setVisibility('visible')

    await waitFor(() => {
      expect(editorText(textbox)).toBe('before lunch\nafter lunch')
    })
    expect(await screen.findByRole('link', { name: 'Tue 27, written' })).toBeInTheDocument()
    expect(changeRequests(sent)).toHaveLength(1)
  })

  it('catches up when the window gets focus again', async () => {
    await openWith('today')

    await api.saveNote('day', '2026-10-27', 'tomorrow', 0)
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    expect(await screen.findByRole('link', { name: 'Tue 27, written' })).toBeInTheDocument()
  })

  /**
   * Types `mine` while another device has saved `theirs`, then lets the app catch up before the
   * autosave: the tab was hidden, so coming back polls at once.
   */
  const typeWhileChangedElsewhere = async (base: string, theirs: string, mine: string) => {
    const { textbox } = await openWith(base)
    setVisibility('hidden')
    await api.saveNote('day', '2026-10-26', theirs, 1)
    typeInto(textbox, mine)
    answered.length = 0
    setVisibility('visible')
    await waitFor(() => {
      expect(changeRequests(answered)).toHaveLength(1)
    })
    return textbox
  }

  it('never overwrites unsaved typing, and merges it with the other device on save', async () => {
    const textbox = await typeWhileChangedElsewhere(
      '- [ ] Call dentist\n- [ ] Run 5km',
      '- [x] Call dentist\n- [ ] Run 5km',
      '\nFelt good',
    )

    // Nothing jumps while typing: the other device's change waits for the save.
    expect(editorText(textbox)).toBe('- [ ] Call dentist\n- [ ] Run 5km\nFelt good')

    await waitFor(async () => {
      expect(await stored()).toBe('- [x] Call dentist\n- [ ] Run 5km\nFelt good')
    })
    await waitFor(() => {
      expect(editorText(textbox)).toBe('- [x] Call dentist\n- [ ] Run 5km\nFelt good')
    })
  })

  it('asks how to resolve when the other device changed the line being typed on', async () => {
    const textbox = await typeWhileChangedElsewhere('Run 5km', 'Run 10km', ' with Anna')

    expect(editorText(textbox)).toBe('Run 5km with Anna')

    const resolver = await screen.findByRole(
      'group',
      { name: 'This page changed elsewhere' },
      { timeout: 3000 },
    )
    expect(within(resolver).getByRole('radio', { name: /Keep mine/ })).toHaveAccessibleDescription(
      'Run 5km with Anna',
    )
    expect(await stored()).toBe('Run 10km')
  })

  it('shrugs off failed polls while offline and catches up once back', async () => {
    const { textbox } = await openWith('on the train')
    sent.length = 0

    server.setOffline(true)
    await nextPoll()
    await nextPoll()
    await nextPoll()

    // One attempt per poll, and nothing on screen complains about it.
    expect(changeRequests(sent)).toHaveLength(3)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(status(TODAY)).toHaveTextContent('Saved')

    server.setOffline(false)
    await api.saveNote('day', '2026-10-26', 'on the train\nat the office', 1)
    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('on the train\nat the office')
    })
  })

  it('shows a change saved while the pages were loading', async () => {
    await api.saveNote('day', '2026-10-26', 'before', 0)
    // The other device saves while the app is starting up: after it may have loaded the page,
    // before it asked where the feed is.
    const cursorAsked = gate()
    beforeSend = async (request) => {
      if (request !== CURSOR) return
      await Promise.race([
        vi.waitFor(() => {
          expect(answered).toContain(NOTE_TODAY)
        }),
        new Promise((resolve) => setTimeout(resolve, 300)),
      ]).catch(() => undefined)
      await api.saveNote('day', '2026-10-26', 'before\nwhile loading', 1)
      cursorAsked.open()
    }
    open()
    const textbox = await editor(TODAY)
    await cursorAsked.closed

    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('before\nwhile loading')
    })
  })

  it('catches up on everything once back, when it could not ask where the feed was at start', async () => {
    await api.saveNote('day', '2026-10-26', 'before', 0)
    beforeSend = (request) =>
      request === CURSOR && !sent.includes(NOTE_TODAY)
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve()
    open()
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(editorText(textbox)).toBe('before')
    })

    await api.saveNote('day', '2026-10-26', 'before\nwritten elsewhere', 1)
    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('before\nwritten elsewhere')
    })
  })

  it('never takes the starting point of the feed back to an older one', async () => {
    // The first "where is the feed" answer is slow; meanwhile the window gets focus, and the poll
    // asks again after the other device saved.
    const slow = gate()
    let first = true
    beforeReply = async (request) => {
      if (request === CURSOR && first) {
        first = false
        await slow.closed
      }
    }
    open()
    await waitFor(() => {
      expect(sent).toContain(CURSOR)
    })
    await api.saveNote('day', '2026-10-26', 'written elsewhere', 0)
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await waitFor(() => {
      expect(answered).toContain(CURSOR)
    })
    slow.open()
    const textbox = await editor(TODAY)
    await waitFor(() => {
      expect(editorText(textbox)).toBe('written elsewhere')
    })
    sent.length = 0

    await nextPoll()

    expect(changeRequests(sent)).toEqual(['GET /api/changes?since=1'])
  })

  it('does not reload a page for its own saves', async () => {
    const { textbox } = await openWith('first line')
    typeInto(textbox, '\nsecond line')
    await waitFor(() => {
      expect(status(TODAY)).toHaveTextContent('Saved')
    })
    expect(await stored()).toBe('first line\nsecond line')
    sent.length = 0

    await nextPoll()
    await waitFor(() => {
      expect(changeRequests(answered).length).toBeGreaterThan(0)
    })

    expect(sent).toEqual([expect.stringMatching(CHANGES)])
  })

  it('reads a long feed to the end in one poll', async () => {
    const { textbox } = await openWith('today')
    // More changes than one page of the feed (500), with today's page last.
    for (let i = 0; i < 500; i++) {
      await api.saveNote('day', addDays('2024-01-01', i), `day ${String(i)}`, 0)
    }
    await api.saveNote('day', '2026-10-26', 'today, after a long trip', 1)
    sent.length = 0

    await nextPoll()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('today, after a long trip')
    })
    expect(changeRequests(sent)).toHaveLength(2)
  })

  it('shows the latest text after discarding my version, though it changed again meanwhile', async () => {
    const { textbox, user } = await openWith('Run 5km')
    setVisibility('hidden')
    await api.saveNote('day', '2026-10-26', 'Run 10km', 1)
    replaceText(textbox, 'Run 8km')
    const resolver = await screen.findByRole(
      'group',
      { name: 'This page changed elsewhere' },
      { timeout: 3000 },
    )
    // While I decide, the other device changes the page once more, and the app hears about it.
    await api.saveNote('day', '2026-10-26', 'Run 12km', 2)
    answered.length = 0
    setVisibility('visible')
    await waitFor(() => {
      expect(answered).toContain(NOTE_TODAY)
    })

    await user.click(within(resolver).getByRole('button', { name: 'Discard my version' }))

    const page = await editor(TODAY)
    await waitFor(() => {
      expect(editorText(page)).toBe('Run 12km')
    })
    expect(await stored()).toBe('Run 12km')
  })

  it('shows the other device’s text once what I typed meanwhile is erased again', async () => {
    const { textbox } = await openWith('Run 5km')
    setVisibility('hidden')
    await api.saveNote('day', '2026-10-26', 'Run 10km', 1)
    typeInto(textbox, ' with Anna')
    answered.length = 0
    setVisibility('visible')
    await waitFor(() => {
      expect(answered).toContain(NOTE_TODAY)
    })
    expect(editorText(textbox)).toBe('Run 5km with Anna')

    replaceText(textbox, 'Run 5km')

    await waitFor(() => {
      expect(editorText(textbox)).toBe('Run 10km')
    })
    expect(status(TODAY)).toHaveTextContent('Saved')
  })

  it('keeps the newest text when a save is answered after the poll saw a newer one', async () => {
    const { textbox } = await openWith('a')
    const slowSave = gate()
    beforeReply = async (request) => {
      if (request === 'PUT /api/notes/day/2026-10-26') await slowSave.closed
    }
    typeInto(textbox, '\nb')
    // The save reached the server (revision 2); its answer is slow. Meanwhile the other device
    // builds on it and the poll fetches that.
    await waitFor(async () => {
      expect(await stored()).toBe('a\nb')
    })
    await api.saveNote('day', '2026-10-26', 'a\nb\nc', 2)
    answered.length = 0
    await nextPoll()
    await waitFor(() => {
      expect(answered).toContain(NOTE_TODAY)
    })

    slowSave.open()

    await waitFor(() => {
      expect(editorText(textbox)).toBe('a\nb\nc')
    })
    expect(status(TODAY)).toHaveTextContent('Saved')
  })
})

/** Hides or shows the tab, as switching browser tabs or minimising the window does. */
function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
  })
}
