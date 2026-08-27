import { create } from 'zustand'
import { joinRoom, type LocalIdentity, type RoomConnection } from '../net/room'
import { isMultiplayerConfigured } from '../net/room'
import type { RemoteIdentity } from '../world/presence'
import { boundsFor, LEADERBOARD_ROOM } from '../world/rooms'
import { isPresenceSuppressed } from './usePresenceStore'
import { PlayMode, useSessionStore } from './useSessionStore'

/*
 * Everyone online, for the high-rollers boards.
 *
 * A second, deliberately boring connection: one fixed room, identity only,
 * never a pose. It exists because presence rooms are venue-scoped and the
 * boards are not — a player winning inside the Golden Ace has to stay ranked
 * on a board read from the street. The room churn `usePresenceRoom` manages on
 * every door is exactly what this store does not do: it joins once and stays.
 */

interface LeaderboardStore {
  /** Everyone else online, keyed by id. Never contains this client. */
  standings: Record<string, RemoteIdentity>
  /** This client's id in the leaderboard room, assigned on join. */
  selfId: string | null
  /** Joins the shared room, or re-announces if already in it. */
  enter: (identity: LocalIdentity) => void
  leave: () => void
}

export const useLeaderboardStore = create<LeaderboardStore>()((set) => {
  let connection: RoomConnection | null = null

  function stop(): void {
    connection?.close()
    connection = null
    set({ standings: {}, selfId: null })
  }

  return {
    standings: {},
    selfId: null,

    enter: (identity) => {
      // The same three switches as the presence room, for the same reasons —
      // and suppression matters doubly here, or a regression shot of a
      // junction ranks live strangers across its billboard.
      if (useSessionStore.getState().mode !== PlayMode.Multiplayer) return
      if (!isMultiplayerConfigured || isPresenceSuppressed()) return

      if (connection !== null) {
        connection.announce(identity)
        return
      }

      connection = joinRoom(LEADERBOARD_ROOM, boundsFor(LEADERBOARD_ROOM), identity, {
        onIdentity: (person) => {
          set((state) => {
            // Never yourself: the local player is merged onto the board from
            // the live stores, which are fresher than any echo.
            if (person.id === state.selfId) return state
            return { standings: { ...state.standings, [person.id]: person } }
          })
        },

        // The welcome snapshot replaces the roster outright, same rule as the
        // presence store: whoever it does not name is not online.
        onRoster: (people) => {
          set((state) => ({
            standings: Object.fromEntries(
              people.filter((person) => person.id !== state.selfId)
                .map((person) => [person.id, person]),
            ),
          }))
        },

        onSelf: (id) => {
          set((state) => {
            const standings = { ...state.standings }
            delete standings[id]
            return { selfId: id, standings }
          })
        },

        onLeave: (id) => {
          set((state) => {
            const standings = { ...state.standings }
            delete standings[id]
            return { standings }
          })
        },

        // Nobody walks in this room; a pose here is a bug, not a message.
        onPose: () => {},
        onConnectedChange: () => {},
      })
    },

    leave: () => stop(),
  }
})
