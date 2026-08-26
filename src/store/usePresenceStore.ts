import { create } from 'zustand'
import { getLocalTransform } from '../net/localTransform'
import {
  isMultiplayerConfigured,
  joinRoom,
  type LocalIdentity,
  type RoomConnection,
} from '../net/room'
import {
  type Pose,
  pruneBuffer,
  type RemoteIdentity,
  type Snapshot,
  shouldSend,
  STALE_AFTER_MS,
} from '../world/presence'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'

/*
 * Who else is in the room.
 *
 * Two halves on purpose. The *roster* — names, outfits, seated or not — changes
 * rarely and lives in the store, so React re-renders when somebody arrives.
 * The *poses* change twelve times a second per player and live in a plain Map
 * outside it, read directly in `useFrame`. Putting poses in the store would
 * re-render every figure in the scene on every packet.
 */

/** How often a pose is sent, at most. Twelve is smooth once interpolated. */
const SEND_INTERVAL_MS = 1_000 / 12

/** Pose history per player, keyed by id. Not state: read every frame. */
const buffers = new Map<string, Snapshot[]>()

/** Reads a player's snapshot buffer. Empty array if they have sent nothing. */
export function poseBuffer(id: string): readonly Snapshot[] {
  return buffers.get(id) ?? []
}

interface PresenceStore {
  /** Everyone else in the room, keyed by id. */
  peers: Record<string, RemoteIdentity>
  /** True while the socket is up. False also means "multiplayer is off". */
  connected: boolean

  enterRoom: (roomId: string, bounds: WalkBounds, identity: LocalIdentity) => void
  leaveRoom: () => void
  /** Re-announces after a wardrobe or name change. */
  updateIdentity: (identity: LocalIdentity) => void
  setSeated: (seated: boolean) => void
}

/**
 * True while a `?boot=` link is driving the game and has not opted back in.
 *
 * Those links exist to make a capture reproducible, and a stranger wandering
 * into a regression shot is precisely the opposite — so a boot link disables
 * multiplayer by default, which is what keeps `npm run shots` and
 * `npm run walkthrough` unchanged.
 *
 * `?mp=1` opts back in, and exists for exactly one caller: `npm run
 * multiplayer`, which needs `?boot=strip` to skip the first-run designer *and*
 * needs the socket. Dev-only, so always false in a production build.
 */
function isPresenceSuppressed(): boolean {
  if (!import.meta.env.DEV) return false

  const params = new URLSearchParams(window.location.search)
  return params.has('boot') && params.get('mp') !== '1'
}

export const usePresenceStore = create<PresenceStore>()((set) => {
  let connection: RoomConnection | null = null
  let sender: ReturnType<typeof setInterval> | null = null
  let lastSent: Pose | null = null
  let currentRoom: string | null = null

  function stop(): void {
    if (sender !== null) clearInterval(sender)
    sender = null
    connection?.close()
    connection = null
    lastSent = null
    currentRoom = null
    buffers.clear()
    set({ peers: {}, connected: false })
  }

  return {
    peers: {},
    connected: false,

    enterRoom: (roomId, bounds, identity) => {
      if (!isMultiplayerConfigured || isPresenceSuppressed()) return
      // Re-entering the same room on a re-render must not churn the socket.
      if (currentRoom === roomId) return

      stop()
      currentRoom = roomId

      connection = joinRoom(roomId, bounds, identity, {
        onIdentity: (person) => {
          set((state) => ({ peers: { ...state.peers, [person.id]: person } }))
        },

        onPose: (id, snapshot) => {
          const buffer = buffers.get(id) ?? []
          // Prune as we append, so a long session does not accumulate one
          // object per player per packet for its whole length.
          buffers.set(id, [...pruneBuffer(buffer, snapshot.at - STALE_AFTER_MS), snapshot])
        },

        onLeave: (id) => {
          buffers.delete(id)
          set((state) => {
            const peers = { ...state.peers }
            delete peers[id]
            return { peers }
          })
        },

        onConnectedChange: (connected) => set({ connected }),
      })

      if (!connection) {
        currentRoom = null
        return
      }

      /*
       * The send loop. Deliberately a timer sampling a mutable transform rather
       * than a subscription: the transform changes every frame and this has to
       * be the thing that decides how often that becomes a packet.
       *
       * `shouldSend` is what keeps the running cost at zero — a player stood at
       * a table sends nothing, so the room hibernates.
       */
      sender = setInterval(() => {
        const pose = getLocalTransform()
        if (!shouldSend(lastSent, pose)) return

        /*
         * Only recorded once it has actually gone out.
         *
         * The first tick fires about eighty milliseconds after joining, which
         * beats a real WebSocket handshake but not a local one. Recording the
         * pose regardless meant `shouldSend` went quiet for ever afterwards, so
         * a player who connected and stood still was never transmitted at all —
         * invisible to the room until they happened to walk. It passed against
         * a local worker and failed against a deployed one.
         */
        if (connection?.send(pose) === true) lastSent = { ...pose }
      }, SEND_INTERVAL_MS)
    },

    leaveRoom: stop,

    updateIdentity: (identity) => connection?.announce(identity),

    // Not mirrored into `peers`: that roster is everyone *else*, and we never
    // draw ourselves from it.
    setSeated: (seated) => connection?.setSeated(seated),
  }
})
