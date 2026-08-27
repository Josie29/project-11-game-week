import { WALK_BOUNDS as CASINO_BOUNDS } from '../scenes/casinoFloorLayout'
import { WALK_BOUNDS as CLINIC_BOUNDS } from '../scenes/clinicLayout'
import { WALK_BOUNDS as SHOP_BOUNDS } from '../scenes/shopLayout'
import { STREET_BOUNDS } from '../scenes/stripLayout'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'
import { Location } from '../store/useGameStore'
import { VenueId } from './venues'

/*
 * Which room a player is in, and how big it is.
 *
 * Rooms are derived from state the game already keeps rather than invented for
 * multiplayer: the street is a room, and each venue's floor is a room. Two
 * players are in the same room exactly when they can see each other, which is
 * also exactly when it is worth sending either of them the other's position.
 *
 * Pure, and the bounds matter beyond layout: they are what an incoming pose is
 * clamped to, so a peer cannot put a figure through a wall.
 */

/** The street. */
export const STRIP_ROOM = 'strip'

/**
 * The one room everybody is in at once, for the high-rollers boards.
 *
 * The exception to "same room means you can see each other", on purpose: the
 * boards rank everyone *online*, and presence rooms are venue-scoped, so a
 * blackjack winner inside the Golden Ace would fall off a board read from the
 * strip's roster. Every client keeps a second, pose-less connection here and
 * announces only its identity; nothing ever draws this roster as figures.
 */
export const LEADERBOARD_ROOM = 'leaderboard'

/** Bounds per room, so an arriving pose can be clamped without a scene. */
const BOUNDS: Readonly<Record<string, WalkBounds>> = {
  [STRIP_ROOM]: STREET_BOUNDS,
  [`venue:${VenueId.GoldenAce}`]: CASINO_BOUNDS,
  [`venue:${VenueId.GildedHanger}`]: SHOP_BOUNDS,
  [`venue:${VenueId.RedRiverPlasma}`]: CLINIC_BOUNDS,
}

/**
 * Which room the player is in, or `null` where there is nobody to meet.
 *
 * The character designer returns `null` deliberately: it is a dressing room
 * with no world around it, and connecting from it would put a figure on a
 * street the player has not walked onto yet.
 *
 * @param location Where the player is, from `useGameStore`.
 * @param activeVenue The venue they are inside, if any.
 */
export function roomIdFor(location: Location, activeVenue: VenueId | null): string | null {
  if (location === Location.Strip) return STRIP_ROOM
  if (location === Location.Interior && activeVenue !== null) return `venue:${activeVenue}`
  return null
}

/**
 * The walking bounds of a room.
 *
 * Falls back to the street rather than throwing: this clamps untrusted input,
 * so an unknown room name must still produce a usable box.
 */
export function boundsFor(roomId: string): WalkBounds {
  return BOUNDS[roomId] ?? STREET_BOUNDS
}
