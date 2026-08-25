export enum VenueId {
  GoldenAce = 'golden-ace',
  LuckyViper = 'lucky-viper',
  GildedHanger = 'gilded-hanger',
}

export enum VenueKind {
  Casino = 'casino',
  /** A shop: no game behind the door, a wardrobe instead. */
  Shop = 'shop',
}

export enum GameKind {
  Blackjack = 'blackjack',
  Craps = 'craps',
}

export interface VenueConfig {
  readonly id: VenueId
  readonly name: string
  readonly kind: VenueKind
  /** Which game is played inside. Absent on shops. */
  readonly game?: GameKind
  /** World position of the entrance. Doubles as the proximity-trigger centre. */
  readonly doorPosition: readonly [number, number, number]
  /** Facade neon colour, also used for signage and the HUD accent. */
  readonly neonColor: string
  /** What the door prompt offers, e.g. "Walk in to play". */
  readonly invitation: string
  /** False while whatever is behind the door is still unbuilt. */
  readonly available: boolean
}

/**
 * Single source of truth for what stands on the strip.
 *
 * The strip renders doors and signage from this list, the player's proximity
 * check reads it, and exiting returns the player to the matching door.
 *
 * This was `CASINOS` until the shop arrived. Everything a door needs — a
 * position, a name, a neon colour — was already here and none of it was
 * casino-specific; only `game` was, which is why it became optional rather than
 * the shop growing a parallel list of its own.
 *
 * Names are invented rather than borrowed from real Las Vegas properties,
 * which are live trademarks.
 */
export const VENUES: readonly VenueConfig[] = [
  {
    // First on the walk south from the spawn, on purpose: design a character,
    // dress it, then go and lose money on it.
    id: VenueId.GildedHanger,
    name: 'The Gilded Hanger',
    kind: VenueKind.Shop,
    // z must land on a `BUILDING_ROWS` entry in `Strip.tsx` or the venue gets a
    // door with no marquee above it — the sign lookup keys on the door's row.
    doorPosition: [8.5, 0, -6],
    // The third neon in art/refs/strip_exterior.png, and unclaimed by either
    // casino.
    neonColor: '#ff4fa3',
    invitation: 'Walk in to shop',
    available: true,
  },
  {
    id: VenueId.GoldenAce,
    name: 'Golden Ace',
    kind: VenueKind.Casino,
    game: GameKind.Blackjack,
    doorPosition: [-8.5, 0, -14],
    neonColor: '#ffc63f',
    invitation: 'Walk in to play',
    available: true,
  },
  {
    id: VenueId.LuckyViper,
    name: 'Lucky Viper',
    kind: VenueKind.Casino,
    game: GameKind.Craps,
    doorPosition: [8.5, 0, -34],
    neonColor: '#22e0ff',
    invitation: 'Walk in to play',
    available: true,
  },
]

export function getVenue(id: VenueId): VenueConfig {
  const venue = VENUES.find((entry) => entry.id === id)
  if (!venue) {
    throw new Error(`Unknown venue id "${id}"`)
  }
  return venue
}

/**
 * The game played at a venue.
 *
 * @throws {Error} If the venue is a shop, which has no game. Callers reach this
 *   only by rendering a table for a door that has none, which is a bug rather
 *   than a state to handle.
 */
export function gameAt(id: VenueId): GameKind {
  const venue = getVenue(id)
  if (venue.game === undefined) {
    throw new Error(`Venue "${id}" is a ${venue.kind} and has no game`)
  }
  return venue.game
}

/** Half-width of the reflective roadway. */
export const ROAD_HALF_WIDTH = 5

/** Inner face of the building facades; the sidewalk runs from the road to here. */
export const FACADE_X = 8.8

export const SIDEWALK_HEIGHT = 0.16

/** Walkable bounds of the strip, in world units. */
export const STREET_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: -52,
  maxZ: 12,
} as const

export const PLAYER_SPAWN: readonly [number, number, number] = [0, 0, 8]

/** How close the player must get to a door before it opens. */
export const DOOR_TRIGGER_RADIUS = 2.6
