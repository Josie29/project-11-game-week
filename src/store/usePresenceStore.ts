import { create } from 'zustand'
import { getLocalTransform } from '../net/localTransform'
import { TableId } from '../scenes/casinoFloorLayout'
import { PlayerAction } from '../games/blackjack/types'
import { useBlackjackStore } from './useBlackjackStore'
import { useCrapsStore } from './useCrapsStore'
import { useGameStore } from './useGameStore'
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
import { PlayMode, useSessionStore } from './useSessionStore'

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
  /** Who holds the dice at the craps table, or null if nobody is there. */
  shooterId: string | null
  /** Everyone at the table, in arrival order, for placing them along the rail. */
  lineup: readonly string[]
  /**
   * The same, per table, because a casino has two of them.
   *
   * A single `lineup` is whichever table announced last, so the craps rail and
   * the blackjack seats overwrote each other and people were placed at whichever
   * game they were not standing at.
   */
  lineups: Readonly<Record<string, readonly string[]>>
  shooters: Readonly<Record<string, string | null>>
  /** This player's own id in the room, so the HUD can say "your roll". */
  selfId: string | null
  /** Asks the room to throw. It refuses unless it is this player's turn. */
  requestRoll: () => void
  /** Gives up the dice after a seven-out. */
  passDice: () => void
  /** Publishes the table for whoever walks up next. */
  publishTable: (value: unknown) => void
  /** Puts a blackjack wager in. The room deals once every seat has one. */
  sendBet: (amount: number) => void
  /** Says whether this player may take a turn at their table. */
  sendReady: (ready: boolean) => void
  /** Sends a blackjack action for the room to order and echo back. */
  sendAction: (action: string) => void
  setSeated: (seated: boolean, table: TableId | null) => void
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
    shooterId: null,
    lineup: [],
    lineups: {},
    shooters: {},
    selfId: null,

    requestRoll: () => connection?.requestRoll(),
    passDice: () => connection?.passDice(),
    publishTable: (value) => connection?.publishTable(value),
    sendBet: (amount) => connection?.sendBet(amount),
    sendReady: (ready) => connection?.sendReady(ready),
    sendAction: (action) => connection?.sendAction(action),

    enterRoom: (roomId, bounds, identity) => {
      /*
       * The mode check is deliberately here rather than in the scene that calls
       * this. "Play alone" has to mean no socket was ever opened — not peers
       * hidden after connecting — or `shouldSend`'s cost model stops describing
       * what a single-player session actually costs.
       */
      if (useSessionStore.getState().mode !== PlayMode.Multiplayer) return
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

        /*
         * The room threw. Every client at the table settles the same numbers
         * with its own engine, which is what makes shared craps affordable:
         * `phase` and `point` depend only on the roll, never on anybody's bets,
         * so identical rolls give identical tables without the room knowing
         * what a point is.
         */
        onRolled: (_table, roll) => {
          useCrapsStore.getState().applyRoll({ ...roll, total: roll.first + roll.second })
        },

        onSelf: (id) => set({ selfId: id }),

        /*
         * The blackjack table, dealt from a seed every client shares.
         *
         * Routed straight through rather than held here: the presence store
         * knows who is in the room, and what a shoe is belongs in the game
         * store that already owns one.
         */
        onDeal: (_table, seed, bets) => {
          useBlackjackStore.getState().applyDeal(seed, bets, usePresenceStore.getState().selfId)
        },

        onAction: (_table, id, action) => {
          useBlackjackStore.getState().applyAction(id, action as PlayerAction)
        },

        onExpired: () => useBlackjackStore.getState().applyExpiry(),

        onShooter: (table, id, lineup) =>
          set((state) => ({
            shooterId: id,
            lineup,
            lineups: { ...state.lineups, [table]: lineup },
            shooters: { ...state.shooters, [table]: id },
          })),

        /*
         * The table as it stood when somebody last published it. Only adopted
         * when this client has not rolled yet — otherwise a late packet would
         * drag a table that has moved on back to an older hand.
         */
        onTableState: (_table, value) => {
          useCrapsStore.getState().adoptTable(value)
        },
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
        /*
         * A seated player transmits nothing at all.
         *
         * `WalkingPlayer` unmounts when you sit down, so the transform it feeds
         * this loop stops being written — and for somebody who arrived already
         * seated it was never written at all, leaving it at the origin. The
         * craps table is deliberately *at* the world origin, so the result was
         * a figure standing in the middle of the felt.
         *
         * `shouldSend` already keeps a stationary player quiet; this keeps a
         * seated one honest, and costs nothing either way.
         */
        const game = useGameStore.getState()
        if (game.activeTable !== null || game.atChair !== null) return

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
    setSeated: (seated, table) => connection?.setSeated(seated, table),
  }
})
