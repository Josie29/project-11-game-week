import { useMemo } from 'react'
import { useGameStore } from '../../store/useGameStore'
import { INTERACT_KEY } from '../../world/controls'
import { DOOR_TRIGGER_RADIUS, VENUES, type VenueId } from '../../world/venues'
import { STREET_BOUNDS } from '../stripLayout'
import { useActionKey } from '../useActionKey'
import { WalkingPlayer, type ProximityTarget } from './WalkingPlayer'

/**
 * The player on the strip: walk the street, press F at a door to go in.
 *
 * All of the movement and camera work lives in `WalkingPlayer`, which the casino
 * floor shares. This is only the strip's half of the arrangement — its bounds,
 * its doors, and what happens when you reach one.
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
   *
   * Note what it no longer does. This used to call `enterVenue` in the same
   * frame it recorded the door, which meant a venue you were only walking past
   * swallowed you, and the prompt below was replaced by the interior before it
   * could paint. Standing at a door now offers; F accepts.
   */
  function handleNearest(id: string | null): void {
    useGameStore.getState().setNearbyVenue(id as VenueId | null)
  }

  useActionKey(INTERACT_KEY, () => {
    const store = useGameStore.getState()
    const venue = VENUES.find((entry) => entry.id === store.nearbyVenue)

    // A closed venue keeps its prompt — it says so — but does not open.
    if (venue?.available) store.enterVenue(venue.id)
  })

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
