import {
  type Pose,
  type RemoteIdentity,
  sanitizePose,
  sanitizeRemoteIdentity,
  type Snapshot,
} from '../world/presence'
import type { TableId } from '../scenes/casinoFloorLayout'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'

/*
 * The socket, and only the socket.
 *
 * Everything decided here is about connecting, reconnecting and routing
 * messages; everything about *where a figure goes* is in `world/presence.ts`,
 * pure and tested. The split is the same one the game engines follow, for the
 * same reason: the arithmetic is what breaks in ways a screenshot cannot show.
 */

/** Where the presence worker lives. Absent means multiplayer is simply off. */
const ENDPOINT = import.meta.env.VITE_MULTIPLAYER_URL

/**
 * True when a room can be joined at all.
 *
 * Multiplayer is opt-in by configuration, so a build without the variable — a
 * fresh clone, a preview deploy, a capture run — behaves exactly as the game
 * did before any of this existed.
 */
export const isMultiplayerConfigured = typeof ENDPOINT === 'string' && ENDPOINT.length > 0

/** Reconnect backoff, in milliseconds. Stops climbing at the last value. */
const BACKOFF_MS = [500, 1_000, 2_000, 5_000, 10_000]

/** What the room tells the game about who else is here. */
export interface RoomHandlers {
  /** The room threw the dice. Everyone at that table gets the same numbers. */
  readonly onRolled?: (table: string, roll: { first: number; second: number }) => void
  /** Who holds the dice now, or null when nobody is at the table. */
  readonly onShooter?: (table: string, id: string | null, lineup: readonly string[]) => void
  /**
   * Who is in which place at a table, as the room has settled it.
   *
   * The authority on seating, and the only one. Two clients can each believe
   * they took the same stool and no shared rule can separate them; this is the
   * room's answer, and both of them draw from it.
   */
  readonly onSeats?: (table: string, seats: Readonly<Record<number, string>>) => void
  /** The table as somebody else last published it, for a mid-hand arrival. */
  readonly onTableState?: (table: string, value: unknown) => void
  /** A player joined, or their identity changed. */
  readonly onIdentity: (identity: RemoteIdentity) => void
  /** A player moved. `at` is local time, so clock skew never matters. */
  readonly onPose: (id: string, snapshot: Snapshot) => void
  readonly onLeave: (id: string) => void
  /** A wager landed. Relayed as it arrives so chips appear one at a time. */
  readonly onBet?: (table: string, id: string, amount: number) => void
  /** The table has been dealt: one seed for the shoe, wagers in seat order. */
  readonly onDeal?: (
    table: string,
    seed: number,
    bets: readonly { id: string; amount: number; seat: number | null }[],
  ) => void
  /** Somebody acted. Order of arrival is the order every client applies. */
  readonly onAction?: (table: string, id: string, action: string) => void
  /** A turn clock ran out. */
  readonly onExpired?: (table: string) => void
  /** This client's own id in the room, assigned by the server on join. */
  readonly onSelf?: (id: string) => void
  /** Called on connect and disconnect, so the HUD can say which. */
  readonly onConnectedChange: (connected: boolean) => void
}

/** What this client tells the room about itself. */
export interface LocalIdentity {
  readonly name: string
  readonly appearance: unknown
  readonly owned: readonly string[]
  readonly equipped: unknown
  readonly seated: boolean
  /** Which table they are standing at, for the shooter queue. */
  readonly table: TableId | null
  /**
   * Which place at that table they are claiming, or null for none.
   *
   * A claim, not a fact. The room decides — see `onSeats`, which is the only
   * thing that says where anybody is actually sitting.
   */
  readonly seat: number | null
}

export interface RoomConnection {
  /**
   * Sends a pose. Cheap to call; the caller decides how often.
   *
   * @returns True if it actually went out. False while the socket is still
   *   opening or has dropped — the caller must not record the pose as sent, or
   *   a player who joins and stands still is never transmitted at all.
   */
  send: (pose: Pose) => boolean
  /** Tells the room the player sat down or stood up. */
  setSeated: (seated: boolean, table: TableId | null, seat: number | null) => void
  /** Re-announces identity, e.g. after a wardrobe change. */
  announce: (identity: LocalIdentity) => void
  /** Puts a wager in. The room deals once every seat has one. */
  sendBet: (amount: number) => void
  /** Says whether this player may take a turn. The room never asks why. */
  sendReady: (ready: boolean) => void
  /** Sends an action for the room to order and echo back. */
  sendAction: (action: string) => void
  /** Asks the room to throw. It refuses unless it is this player's turn. */
  requestRoll: () => void
  /** Gives up the dice. The room decides who gets them next. */
  passDice: () => void
  /**
   * Publishes the table as this client sees it, for whoever arrives next.
   *
   * Opaque to the room, which stores and relays it without reading it — the
   * clients agree what is in here and the server stays a relay.
   */
  publishTable: (value: unknown) => void
  close: () => void
}

/**
 * Joins a room and keeps the connection up.
 *
 * @param roomId Which room, e.g. `strip` or `venue:golden-ace`.
 * @param bounds The room's walking bounds, used to clamp incoming poses.
 * @param identity Who this player is, sent on every (re)connect.
 * @param handlers Callbacks for roster and pose changes.
 * @returns A handle, or `null` when multiplayer is not configured.
 */
export function joinRoom(
  roomId: string,
  bounds: WalkBounds,
  identity: LocalIdentity,
  handlers: RoomHandlers,
): RoomConnection | null {
  if (!isMultiplayerConfigured) return null

  let socket: WebSocket | null = null
  let closed = false
  let attempt = 0
  let retry: ReturnType<typeof setTimeout> | null = null
  let current = identity

  function announce(): void {
    if (socket?.readyState !== WebSocket.OPEN) return
    socket.send(
      JSON.stringify({
        t: 'join',
        name: current.name,
        appearance: current.appearance,
        owned: current.owned,
        equipped: current.equipped,
        seated: current.seated,
        table: current.table,
        seat: current.seat,
      }),
    )
  }

  function handle(raw: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return
    }

    const now = performance.now()

    switch (message.t) {
      case 'welcome': {
        if (typeof message.id === 'string') handlers.onSelf?.(message.id)
        // The room as it already stands, so it does not fill in one player at a
        // time as each of them happens to move.
        const peers = Array.isArray(message.peers) ? message.peers : []
        for (const peer of peers) {
          const person = sanitizeRemoteIdentity(peer, 'unknown')
          handlers.onIdentity(person)

          const raw = (peer as Record<string, unknown> | null)?.pose
          if (raw) handlers.onPose(person.id, { ...sanitizePose(raw, bounds), at: now })
        }
        return
      }

      case 'joined':
        handlers.onIdentity(sanitizeRemoteIdentity(message.player, 'unknown'))
        return

      case 'moved': {
        const id = typeof message.id === 'string' ? message.id : null
        if (!id) return
        handlers.onPose(id, { ...sanitizePose(message, bounds), at: now })
        return
      }

      case 'seated': {
        // Re-announced as an identity change; `seated` lives with the parts
        // that change rarely, not with the pose that changes constantly.
        const id = typeof message.id === 'string' ? message.id : null
        if (id) handlers.onIdentity(sanitizeRemoteIdentity({ ...message, id }, id))
        return
      }

      case 'rolled': {
        /*
         * Coerced here rather than trusted, because `settleCrapsRoll` throws on
         * a malformed roll and an unhandled throw inside a socket handler takes
         * the client down. The engine's check is a backstop for a bug; this is
         * the guard for a hostile or simply older peer.
         */
        const first = Number(message.first)
        const second = Number(message.second)
        const sane =
          Number.isInteger(first) && Number.isInteger(second) &&
          first >= 1 && first <= 6 && second >= 1 && second <= 6
        if (sane && typeof message.table === 'string') {
          handlers.onRolled?.(message.table, { first, second })
        }
        return
      }

      case 'seats': {
        if (typeof message.table !== 'string') return

        /*
         * Rebuilt key by key rather than passed through.
         *
         * It arrives as an object with string keys, from a peer-facing server,
         * and it is about to decide where figures are drawn. A key that is not
         * a seat number or a value that is not an id has to vanish here rather
         * than become a figure standing at seat `NaN`.
         */
        const raw = typeof message.seats === 'object' && message.seats !== null
          ? (message.seats as Record<string, unknown>)
          : {}
        const seats: Record<number, string> = {}

        for (const [key, id] of Object.entries(raw)) {
          const seat = Number(key)
          if (Number.isInteger(seat) && seat >= 0 && typeof id === 'string' && id.length > 0) {
            seats[seat] = id
          }
        }

        handlers.onSeats?.(message.table, seats)
        return
      }

      case 'shooter': {
        if (typeof message.table === 'string') {
          const lineup = Array.isArray(message.lineup)
            ? message.lineup.filter((id): id is string => typeof id === 'string')
            : []
          handlers.onShooter?.(
            message.table,
            typeof message.id === 'string' ? message.id : null,
            lineup,
          )
        }
        return
      }

      case 'state': {
        if (typeof message.table === 'string') {
          handlers.onTableState?.(message.table, message.value)
        }
        return
      }

      case 'bet': {
        const amount = Number(message.amount)
        if (typeof message.table === 'string' && typeof message.id === 'string' &&
            Number.isInteger(amount) && amount >= 0) {
          handlers.onBet?.(message.table, message.id, amount)
        }
        return
      }

      case 'deal': {
        /*
         * Coerced before it reaches the engine, not after. `placeBets` and
         * `createShoe` both throw on nonsense, and an unhandled throw inside a
         * socket handler takes the client down — the same rule that keeps the
         * dice sane on the way in.
         */
        const seed = Number(message.seed)
        const raw = Array.isArray(message.bets) ? message.bets : []
        const bets = raw
          .map((entry) => entry as Record<string, unknown>)
          .filter((entry) => typeof entry.id === 'string' && Number.isInteger(Number(entry.amount)))
          .map((entry) => ({
            id: entry.id as string,
            amount: Number(entry.amount),
            /*
             * Which stool this hand belongs to, so the cards land in front of
             * the player who bet them. Null for a table with no seats, and for
             * an older room that does not send it — the felt falls back to
             * dealing order, which is exactly what it did before seats existed.
             */
            seat: Number.isInteger(Number(entry.seat)) ? Number(entry.seat) : null,
          }))

        if (typeof message.table === 'string' && Number.isFinite(seed) && bets.length > 0) {
          handlers.onDeal?.(message.table, seed >>> 0, bets)
        }
        return
      }

      case 'action': {
        if (typeof message.table === 'string' && typeof message.id === 'string' &&
            typeof message.action === 'string') {
          handlers.onAction?.(message.table, message.id, message.action)
        }
        return
      }

      case 'expired': {
        if (typeof message.table === 'string') handlers.onExpired?.(message.table)
        return
      }

      case 'left': {
        if (typeof message.id === 'string') handlers.onLeave(message.id)
        return
      }
    }
  }

  function connect(): void {
    if (closed) return

    const url = `${ENDPOINT.replace(/\/$/, '')}/room/${encodeURIComponent(roomId)}`
    const next = new WebSocket(url)
    socket = next

    next.addEventListener('open', () => {
      attempt = 0
      handlers.onConnectedChange(true)
      announce()
    })

    next.addEventListener('message', (event) => {
      if (typeof event.data === 'string') handle(event.data)
    })

    next.addEventListener('close', () => {
      /*
       * A socket we walked away from says nothing about the one we have now.
       *
       * Both guards exist because a close arrives *late*: the handshake on an
       * abandoned socket hangs and dies of a 1006 timeout about ten seconds
       * later, long after its replacement opened. Walking from the strip into
       * a casino is exactly that — `stop()` closes the strip's socket and the
       * venue's is open a fraction of a second afterwards — so the strip's
       * close would land on top of a live connection and report it as down.
       * Nothing ever put it right again: the venue socket stays open, so there
       * is no further close to reconnect from and no further open to say so,
       * and the blackjack table sat on "Reconnecting to the table…" with its
       * chips dead for the rest of the session.
       *
       * `closed` covers a connection we deliberately dropped; `socket !== next`
       * covers a stale attempt from this same connection's own backoff.
       */
      if (closed || socket !== next) return
      handlers.onConnectedChange(false)

      /*
       * Backoff rather than an immediate retry. A worker that is down or a room
       * that is full would otherwise be hammered by every client in a loop, and
       * a dropped socket must never be more disruptive than the disconnection
       * itself — the game stays entirely playable without it.
       */
      const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 10_000
      attempt++
      retry = setTimeout(connect, wait)
    })

    next.addEventListener('error', () => {
      // Errors are always followed by close, which owns the reconnect.
      next.close()
    })
  }

  connect()

  return {
    send: (pose) => {
      if (socket?.readyState !== WebSocket.OPEN) return false
      socket.send(JSON.stringify({ t: 'move', ...pose }))
      return true
    },
    setSeated: (seated, table, seat) => {
      current = { ...current, seated, table, seat }
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'seat', seated, table, seat }))
      }
    },
    sendBet: (amount) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'bet', amount }))
      }
    },

    sendReady: (ready) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'ready', ready }))
      }
    },

    sendAction: (action) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'action', action }))
      }
    },

    requestRoll: () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'roll' }))
    },

    passDice: () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: 'pass' }))
    },

    publishTable: (value) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'state', value }))
      }
    },

    announce: (next) => {
      current = next
      announce()
    },
    close: () => {
      closed = true
      if (retry !== null) clearTimeout(retry)
      socket?.close()
      socket = null
    },
  }
}
