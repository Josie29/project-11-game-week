import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalIdentity, RoomConnection } from '../net/room'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'

/*
 * Whether the HUD believes it is connected, which is not the same question as
 * whether the socket is.
 *
 * A screenshot cannot tell these apart: a table that is genuinely offline and
 * one whose live socket was reported as down by a socket it replaced look
 * identical — "Reconnecting to the table…" over dead chip buttons — and only
 * the *ordering* of two close events separates them.
 */

const BOUNDS: WalkBounds = { minX: -8, maxX: 8, minZ: -40, maxZ: 10 }

const IDENTITY: LocalIdentity = {
  name: 'Player',
  appearance: {},
  owned: [],
  equipped: {},
  seated: false,
  chair: null,
  bankroll: 500,
  table: null,
  seat: null,
}

/**
 * A socket whose open and close this test fires by hand.
 *
 * The real ones cannot be ordered from a test, and the order is the whole
 * subject: a close that arrives before its replacement opens is harmless, and
 * the same close arriving after it is the bug.
 */
class FakeSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  static instances: FakeSocket[] = []

  readyState = FakeSocket.CONNECTING
  readonly sent: string[] = []
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()

  constructor(readonly url: string) {
    FakeSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  send(data: string): void {
    this.sent.push(data)
  }

  /** Requests a close. Deliberately does *not* fire `close` — the test does. */
  close(): void {
    this.readyState = FakeSocket.CLOSING
  }

  fireOpen(): void {
    this.readyState = FakeSocket.OPEN
    for (const listener of this.listeners.get('open') ?? []) listener({})
  }

  fireClose(): void {
    this.readyState = FakeSocket.CLOSED
    for (const listener of this.listeners.get('close') ?? []) listener({ code: 1006 })
  }

  fireMessage(payload: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(payload) })
    }
  }

  /** The last `join` this socket sent, parsed, or null before any. */
  lastJoin(): Record<string, unknown> | null {
    const frames = this.sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((frame) => frame.t === 'join')
    return frames[frames.length - 1] ?? null
  }
}

let joinRoom: (
  roomId: string,
  bounds: WalkBounds,
  identity: LocalIdentity,
  handlers: {
    onIdentity: (person: { id: string }) => void
    onPose: () => void
    onLeave: () => void
    onConnectedChange: (connected: boolean) => void
    onRoster?: (people: readonly { id: string }[]) => void
    onEmote?: (id: string, emote: string) => void
  },
) => RoomConnection | null

/** Every `onConnectedChange` the store would have received, in order. */
let reported: boolean[]

/** Joins a room and returns the handle, recording connection changes. */
function join(roomId: string): RoomConnection {
  const connection = joinRoom(roomId, BOUNDS, IDENTITY, {
    onIdentity: () => {},
    onPose: () => {},
    onLeave: () => {},
    onConnectedChange: (connected) => reported.push(connected),
  })
  if (connection === null) throw new Error('multiplayer should be configured in this test')
  return connection
}

beforeEach(async () => {
  FakeSocket.instances = []
  reported = []
  vi.stubGlobal('WebSocket', FakeSocket)
  // `ENDPOINT` is read once when the module loads, so the stub has to be in
  // place before the import and the module registry reset between tests.
  vi.stubEnv('VITE_MULTIPLAYER_URL', 'wss://presence.test')
  vi.resetModules()
  ;({ joinRoom } = await import('../net/room'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('joinRoom connection reporting', () => {
  /*
   * The bug this file exists for.
   *
   * Walking off the strip and into a casino swaps rooms: the strip's socket is
   * closed and the venue's is opened a fraction of a second later. The strip's
   * close then lands about ten seconds afterwards — an abandoned handshake
   * times out rather than completing — and reported the *venue's* healthy
   * socket as down. Nothing recovered it, because a socket that never closes
   * never reconnects, so blackjack showed "Reconnecting to the table…" with
   * every chip button dead for the rest of the session.
   */
  it('ignores the close of a socket abandoned on a room change', () => {
    const strip = join('strip')
    FakeSocket.instances[0]?.fireOpen()
    expect(reported).toEqual([true])

    // What `usePresenceStore.stop()` does, followed immediately by the new room.
    strip.close()
    join('venue:golden-ace')
    FakeSocket.instances[1]?.fireOpen()

    // The strip's close arrives late, once the venue is already up.
    FakeSocket.instances[0]?.fireClose()

    expect(reported).toEqual([true, true])
  })

  // Without this the fix would be "never report a disconnect", which would
  // leave a player whose network actually dropped betting into a dead socket.
  it('still reports a genuine drop of the current socket', () => {
    join('strip')
    FakeSocket.instances[0]?.fireOpen()
    FakeSocket.instances[0]?.fireClose()

    expect(reported).toEqual([true, false])
  })

  /*
   * A reconnect attempt that fails is replaced by the next attempt, and the
   * loser's close must not describe the winner. Same clobber as the room
   * change, reached through the backoff instead.
   */
  it('ignores the close of a superseded reconnect attempt', async () => {
    vi.useFakeTimers()
    try {
      join('strip')
      FakeSocket.instances[0]?.fireOpen()
      FakeSocket.instances[0]?.fireClose()
      expect(reported).toEqual([true, false])

      // The backoff opens a second socket, which comes up.
      await vi.advanceTimersByTimeAsync(600)
      expect(FakeSocket.instances).toHaveLength(2)
      FakeSocket.instances[1]?.fireOpen()
      expect(reported).toEqual([true, false, true])

      // The first socket closing again now says nothing about the second.
      FakeSocket.instances[0]?.fireClose()
      expect(reported).toEqual([true, false, true])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the player token', () => {
  /*
   * Catches the seated-ghost bug at its root (issue #8): the room minted a
   * fresh id per socket, so a tab whose connection blipped came back as a
   * brand-new person while its old self sat frozen at the stool. The room can
   * only recognise a returning player if every join from the same tab carries
   * the same secret.
   */
  it('sends the same token on the reconnect as on the join', async () => {
    vi.useFakeTimers()
    try {
      join('strip')
      FakeSocket.instances[0]?.fireOpen()

      const first = FakeSocket.instances[0]?.lastJoin()?.token
      expect(typeof first).toBe('string')
      // Too short would be guessable — the worker rejects anything under 16.
      expect((first as string).length).toBeGreaterThanOrEqual(16)

      FakeSocket.instances[0]?.fireClose()
      await vi.advanceTimersByTimeAsync(600)
      FakeSocket.instances[1]?.fireOpen()

      expect(FakeSocket.instances[1]?.lastJoin()?.token).toBe(first)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the welcome roster', () => {
  /*
   * Catches the immortal ghost (issue #8): a `left` broadcast while this
   * client was between sockets is gone forever, and merging each welcome into
   * the roster meant nothing could ever remove the peer it stranded. The
   * welcome has to arrive as a snapshot — whoever it does not name is not in
   * the room.
   */
  it('hands the welcome over whole, so absentees can be dropped', () => {
    const rosters: string[][] = []
    const identified: string[] = []

    const connection = joinRoom('strip', BOUNDS, IDENTITY, {
      onIdentity: (person: { id: string }) => identified.push(person.id),
      onPose: () => {},
      onLeave: () => {},
      onConnectedChange: () => {},
      onRoster: (people: readonly { id: string }[]) =>
        rosters.push(people.map((person) => person.id)),
    })
    if (connection === null) throw new Error('multiplayer should be configured in this test')

    FakeSocket.instances[0]?.fireOpen()
    FakeSocket.instances[0]?.fireMessage({
      t: 'welcome',
      id: 'me',
      peers: [
        { id: 'ghost', name: 'Nicole' },
        { id: 'live', name: 'Josie' },
      ],
    })
    // The ghost's `left` was missed; the next welcome simply omits them.
    FakeSocket.instances[0]?.fireMessage({
      t: 'welcome',
      id: 'me',
      peers: [{ id: 'live', name: 'Josie' }],
    })

    expect(rosters).toEqual([['ghost', 'live'], ['live']])
    // The snapshot went through `onRoster` alone — a second copy through
    // `onIdentity` would put the ghost straight back into a merged map.
    expect(identified).toEqual([])
  })
})

describe('emotes on the wire', () => {
  /** Joins with an `onEmote`, recording what reaches it. */
  function joinHearing(): { connection: RoomConnection; heard: [string, string][] } {
    const heard: [string, string][] = []
    const connection = joinRoom('strip', BOUNDS, IDENTITY, {
      onIdentity: () => {},
      onPose: () => {},
      onLeave: () => {},
      onConnectedChange: () => {},
      onEmote: (id: string, emote: string) => heard.push([id, emote]),
    })
    if (connection === null) throw new Error('multiplayer should be configured in this test')
    return { connection, heard }
  }

  // The whole feature is this frame: without it, a peer's callout is a bubble
  // that never appears on anybody else's screen.
  it('delivers a relayed emote to the handler', () => {
    const { heard } = joinHearing()
    FakeSocket.instances[0]?.fireOpen()
    FakeSocket.instances[0]?.fireMessage({ t: 'emote', id: 'peer-1', emote: 'wave' })

    expect(heard).toEqual([['peer-1', 'wave']])
  })

  /*
   * The frame comes from a peer via a room that relays without reading. A
   * malformed one must neither crash the socket handler — an unhandled throw
   * there takes the client down — nor reach the handler for the store to
   * then have an opinion about.
   */
  it('drops a hostile emote frame without crashing', () => {
    const { heard } = joinHearing()
    FakeSocket.instances[0]?.fireOpen()

    FakeSocket.instances[0]?.fireMessage({ t: 'emote', id: 'peer-1', emote: 7 })
    FakeSocket.instances[0]?.fireMessage({ t: 'emote', emote: 'wave' })
    FakeSocket.instances[0]?.fireMessage({ t: 'emote', id: 42, emote: 'wave' })

    expect(heard).toEqual([])
  })

  // The worker matches on `{t: 'emote', emote}` exactly; a frame shaped any
  // other way is a message the room silently drops.
  it('sends the exact frame the worker expects', () => {
    const { connection } = joinHearing()
    FakeSocket.instances[0]?.fireOpen()

    connection.sendEmote('wave')

    const frames = FakeSocket.instances[0]?.sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((frame) => frame.t === 'emote')
    expect(frames).toEqual([{ t: 'emote', emote: 'wave' }])
  })
})

describe('the bankroll on the wire', () => {
  // Catches the bug where the high-rollers boards show every peer at $0
  // because the join payload never carried the money in the first place.
  it('sends the bankroll in the join', () => {
    join('strip')
    FakeSocket.instances[0]?.fireOpen()

    expect(FakeSocket.instances[0]?.lastJoin()?.bankroll).toBe(500)
  })

  // Catches the bug where a peer wins a hand and every other billboard keeps
  // painting their old number until they walk through a door.
  it('re-announces when the bankroll changes', () => {
    const connection = join('strip')
    FakeSocket.instances[0]?.fireOpen()

    connection.announce({ ...IDENTITY, bankroll: 750 })

    expect(FakeSocket.instances[0]?.lastJoin()?.bankroll).toBe(750)
  })
})
