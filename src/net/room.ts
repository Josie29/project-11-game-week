import {
  type Pose,
  type RemoteIdentity,
  sanitizePose,
  sanitizeRemoteIdentity,
  type Snapshot,
} from '../world/presence'
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
  /** A player joined, or their identity changed. */
  readonly onIdentity: (identity: RemoteIdentity) => void
  /** A player moved. `at` is local time, so clock skew never matters. */
  readonly onPose: (id: string, snapshot: Snapshot) => void
  readonly onLeave: (id: string) => void
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
}

export interface RoomConnection {
  /** Sends a pose. Cheap to call; the caller decides how often. */
  send: (pose: Pose) => void
  /** Tells the room the player sat down or stood up. */
  setSeated: (seated: boolean) => void
  /** Re-announces identity, e.g. after a wardrobe change. */
  announce: (identity: LocalIdentity) => void
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
      handlers.onConnectedChange(false)
      if (closed) return

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
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'move', ...pose }))
      }
    },
    setSeated: (seated) => {
      current = { ...current, seated }
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ t: 'seat', seated }))
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
