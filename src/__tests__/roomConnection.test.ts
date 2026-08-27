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
}

let joinRoom: (
  roomId: string,
  bounds: WalkBounds,
  identity: LocalIdentity,
  handlers: { onIdentity: () => void; onPose: () => void; onLeave: () => void; onConnectedChange: (connected: boolean) => void },
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
