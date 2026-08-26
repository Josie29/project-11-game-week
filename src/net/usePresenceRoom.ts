import { useEffect } from 'react'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
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
  const atChair = useGameStore((state) => state.atChair)

  const name = useAppearanceStore((state) => state.playerName)
  const appearance = useAppearanceStore((state) => state.appearance)
  const owned = useAppearanceStore((state) => state.owned)
  const equipped = useAppearanceStore((state) => state.equipped)

  const roomId = roomIdFor(location, activeVenue)
  // Sat at a table or in a donation chair: drawn seated, not standing inside
  // the furniture.
  const seated = activeTable !== null || atChair !== null

  useEffect(() => {
    const { enterRoom, leaveRoom, updateIdentity } = usePresenceStore.getState()

    if (roomId === null) {
      leaveRoom()
      return
    }

    const identity = { name, appearance, owned, equipped, seated }

    /*
     * Both, every time, and neither is wasteful. `enterRoom` returns early when
     * it is already in this room, and `updateIdentity` is how a wardrobe change,
     * a rename or sitting down reaches the room — re-announced rather than
     * reconnected, so nobody blinks out of the world because somebody put a
     * jacket on.
     */
    enterRoom(roomId, boundsFor(roomId), identity)
    updateIdentity(identity)
  }, [roomId, name, appearance, owned, equipped, seated])

  // Leaves for good when the app unmounts, so a hot reload does not strand a
  // socket holding a figure in the room.
  useEffect(() => () => usePresenceStore.getState().leaveRoom(), [])
}
