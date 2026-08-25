import { useMemo } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { DOOR_TRIGGER_RADIUS, STREET_BOUNDS, VENUES, type VenueId } from '../../world/venues'
import { WalkingPlayer, type ProximityTarget } from './WalkingPlayer'

/**
 * The player on the strip: walk the street, walk into a door to go in.
 *
 * All of the movement and camera work lives in `WalkingPlayer`, which the
 * casino floor shares. This is only the strip's half of the arrangement — its
 * bounds, its doors, and what happens when you reach one.
 */
export function Player() {
  const spawnPosition = useGameStore((state) => state.spawnPosition)

  const doors = useMemo<readonly ProximityTarget[]>(
    () =>
      VENUES.map((venue) => ({
        id: venue.id,
        position: venue.doorPosition,
        radius: DOOR_TRIGGER_RADIUS,
      })),
    [],
  )

  /**
   * Reads and writes the store imperatively.
   *
   * Called from the render loop, so it must never subscribe — and
   * `setNearbyVenue` bails out when the value has not changed, which is what
   * keeps this from setting state sixty times a second.
   */
  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()
    const venueId = id as VenueId | null

    store.setNearbyVenue(venueId)

    // Walking into an open door is the whole interaction; there is nothing to
    // press. Note this fires in the same frame as `setNearbyVenue`, so the door
    // prompt never actually paints for a venue that is open.
    const venue = venueId ? VENUES.find((entry) => entry.id === venueId) : null
    if (venue?.available) {
      store.enterVenue(venue.id)
    }
  }

  return (
    <WalkingPlayer
      bounds={STREET_BOUNDS}
      spawn={spawnPosition}
      // Start facing down the street (-Z) rather than back at the camera.
      facing={Math.PI}
      targets={doors}
      onNearest={handleNearest}
    />
  )
}
