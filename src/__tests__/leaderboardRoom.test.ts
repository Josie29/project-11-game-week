import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * The room the boards read, and the store that keeps it.
 *
 * A screenshot of a billboard cannot say who *should* be on it: the roster
 * behind it comes from a second, pose-less connection to one shared room, and
 * whether a blackjack winner inside the Golden Ace stays ranked while you
 * stand on the street is a property of these wires, not of any pixel.
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

  close(): void {
    this.readyState = FakeSocket.CLOSING
  }

  fireOpen(): void {
    this.readyState = FakeSocket.OPEN
    for (const listener of this.listeners.get('open') ?? []) listener({})
  }

  fireMessage(payload: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(payload) })
    }
  }
}

let useLeaderboardStore: typeof import('../store/useLeaderboardStore').useLeaderboardStore
let useSessionStore: typeof import('../store/useSessionStore').useSessionStore
let PlayMode: typeof import('../store/useSessionStore').PlayMode
let LEADERBOARD_ROOM: string

const IDENTITY = {
  name: 'Josie',
  appearance: {},
  owned: [] as readonly string[],
  equipped: {},
  seated: false,
  bankroll: 500,
  table: null,
  seat: null,
}

beforeEach(async () => {
  FakeSocket.instances = []
  vi.stubGlobal('WebSocket', FakeSocket)
  // `isPresenceSuppressed` reads the query string in dev; give it a bare one.
  // The session store persists, so it needs a storage that swallows writes.
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  vi.stubGlobal('window', { location: { search: '' }, localStorage: storage })
  vi.stubGlobal('localStorage', storage)
  vi.stubEnv('VITE_MULTIPLAYER_URL', 'wss://presence.test')
  vi.resetModules()
  ;({ useLeaderboardStore } = await import('../store/useLeaderboardStore'))
  ;({ PlayMode, useSessionStore } = await import('../store/useSessionStore'))
  ;({ LEADERBOARD_ROOM } = await import('../world/rooms'))
  useSessionStore.setState({ mode: PlayMode.Multiplayer })
})

afterEach(() => {
  useLeaderboardStore.getState().leave()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the leaderboard room', () => {
  // The boards exist because presence rooms are venue-scoped; a leaderboard
  // room that `roomIdFor` could also mint would put walking figures in it.
  it('is a room no location ever maps to', async () => {
    const { roomIdFor } = await import('../world/rooms')
    const { Location } = await import('../store/useGameStore')
    const { VenueId } = await import('../world/venues')

    const venues = [null, ...Object.values(VenueId)]
    for (const location of Object.values(Location)) {
      for (const venue of venues) {
        expect(roomIdFor(location, venue)).not.toBe(LEADERBOARD_ROOM)
      }
    }
  })

  // Catches the bug the feature exists to fix: the standings must come from
  // the one shared room, not whichever venue room the player happens to be in.
  it('connects to the shared room and keeps everyone with their bankroll', () => {
    useLeaderboardStore.getState().enter(IDENTITY)
    const socket = FakeSocket.instances[0]
    expect(socket?.url.endsWith(`/room/${LEADERBOARD_ROOM}`), socket?.url).toBe(true)

    socket?.fireOpen()
    socket?.fireMessage({
      t: 'welcome',
      id: 'me',
      peers: [
        { id: 'casino', name: 'Dutch', bankroll: 9830 },
        { id: 'street', name: 'Miso', bankroll: 7215 },
      ],
    })

    const standings = useLeaderboardStore.getState().standings
    expect(Object.keys(standings)).toHaveLength(2)
    expect(standings['casino']?.bankroll).toBe(9830)
    // Never yourself: the board merges the local player from live stores.
    expect(standings['me']).toBeUndefined()
  })

  // A winner cashing out and closing the tab must come down off the boards.
  it('adds on joined and removes on left', () => {
    useLeaderboardStore.getState().enter(IDENTITY)
    const socket = FakeSocket.instances[0]
    socket?.fireOpen()
    socket?.fireMessage({ t: 'welcome', id: 'me', peers: [] })

    socket?.fireMessage({ t: 'joined', player: { id: 'a', name: 'Dutch', bankroll: 100 } })
    expect(useLeaderboardStore.getState().standings['a']?.name).toBe('Dutch')

    socket?.fireMessage({ t: 'left', id: 'a' })
    expect(useLeaderboardStore.getState().standings['a']).toBeUndefined()
  })

  // "Play alone" must mean no socket was ever opened, same rule as presence.
  it('refuses to connect in single-player', () => {
    useSessionStore.setState({ mode: PlayMode.Single })
    useLeaderboardStore.getState().enter(IDENTITY)
    expect(FakeSocket.instances).toHaveLength(0)
  })
})
