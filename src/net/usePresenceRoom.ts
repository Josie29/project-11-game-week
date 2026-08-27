import { useEffect } from 'react'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'
import { boundsFor, roomIdFor } from '../world/rooms'

/*
 * Keeps the socket pointed at whichever room the player is standing in.
 *
 * Mounted once, in `App`, rather than inside a scene. The scenes mount and
 * unmount as the player walks through doors, and tying the connection to that
 * would drop and rebuild it on every transition — including the moment they sit
 * down at a table, which unmounts `WalkingPlayer` but should certainly not
 * remove them from the room.
 */

/** Joins, leaves and re-announces as the player moves between rooms. */
export function usePresenceRoom(): void {
  const location = useGameStore((state) => state.location)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const activeTable = useGameStore((state) => state.activeTable)
  const activeSeat = useGameStore((state) => state.activeSeat)
  const atChair = useGameStore((state) => state.atChair)

  const mode = useSessionStore((state) => state.mode)

  const name = useAppearanceStore((state) => state.playerName)
  const appearance = useAppearanceStore((state) => state.appearance)
  const owned = useAppearanceStore((state) => state.owned)
  const equipped = useAppearanceStore((state) => state.equipped)

  const roomId = roomIdFor(location, activeVenue)
  // Sat at a table or in a donation chair: drawn seated, not standing inside
  // the furniture.
  const seated = activeTable !== null || atChair !== null
  /*
   * Which table, which `seated` cannot say. A clinic recliner is seated with no
   * table, and the casino has two tables that a boolean cannot tell apart.
   */
  const table = activeTable
  /*
   * The stool being claimed, which is a request rather than a fact.
   *
   * A clinic recliner is not one of these: it is a seat nobody else in the room
   * can walk up to, because the clinic is not a shared table. Only a stool at a
   * table two people can both reach needs the room to arbitrate it.
   */
  const seat = activeSeat

  useEffect(() => {
    const { enterRoom, leaveRoom, updateIdentity } = usePresenceStore.getState()

    /*
     * Playing alone leaves, rather than merely declining to join.
     *
     * `enterRoom` already refuses to open a socket in Single, but refusing is
     * only half of it once the mode can be changed mid-session: a player who
     * switches to Single while stood in a room would keep the socket they
     * already had, and everybody else would go on walking around them. "Play
     * alone" has to mean the connection is gone, not that it was never made.
     *
     * `mode` is in the dependency list for the other direction. Without it,
     * switching to Multiplayer does nothing until the player happens to walk
     * through a door and change `roomId`, which reads as a toggle that is
     * simply broken.
     */
    if (mode !== PlayMode.Multiplayer) {
      leaveRoom()
      return
    }

    if (roomId === null) {
      leaveRoom()
      return
    }

    const identity = { name, appearance, owned, equipped, seated, table, seat }

    /*
     * Both, every time, and neither is wasteful. `enterRoom` returns early when
     * it is already in this room, and `updateIdentity` is how a wardrobe change,
     * a rename or sitting down reaches the room — re-announced rather than
     * reconnected, so nobody blinks out of the world because somebody put a
     * jacket on.
     */
    enterRoom(roomId, boundsFor(roomId), identity)
    updateIdentity(identity)
  }, [mode, roomId, name, appearance, owned, equipped, seated, table, seat])

  // Leaves for good when the app unmounts, so a hot reload does not strand a
  // socket holding a figure in the room.
  useEffect(() => () => usePresenceStore.getState().leaveRoom(), [])
}
