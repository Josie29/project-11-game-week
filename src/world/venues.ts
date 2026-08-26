export enum VenueId {
  GoldenAce = 'golden-ace',
  GildedHanger = 'gilded-hanger',
  RedRiverPlasma = 'red-river-plasma',
}

export enum VenueKind {
  Casino = 'casino',
  /** A shop: no game behind the door, a wardrobe instead. */
  Shop = 'shop',
  /** A plasma clinic: the floor under a player who has lost everything. */
  Clinic = 'clinic',
}

export interface VenueConfig {
  readonly id: VenueId
  readonly name: string
  readonly kind: VenueKind
  /** World position of the entrance. Doubles as the proximity-trigger centre. */
  readonly doorPosition: readonly [number, number, number]
  /** Facade neon colour, also used for signage and the HUD accent. */
  readonly neonColor: string
  /**
   * What is on offer inside, as the verb alone — "play", "shop".
   *
   * The prompt reads "Press F to play", so this is a fragment rather than a
   * sentence. It used to be the whole line, "Walk in to play", which stopped
   * being true the moment walking in stopped being how you get in.
   */
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
    invitation: 'shop',
    available: true,
  },
  {
    // The one casino. It holds both a blackjack table and a craps table, which
    // is why a venue no longer names a game — the table does.
    id: VenueId.GoldenAce,
    name: 'Golden Ace',
    kind: VenueKind.Casino,
    doorPosition: [-8.5, 0, -14],
    neonColor: '#ffc63f',
    invitation: 'play',
    available: true,
  },
  {
    /*
     * The one building on the strip that is not selling you a good time.
     *
     * Placed past the casino on the walk south on purpose: you reach it after
     * you have had the chance to lose everything, not before.
     *
     * On the shop's side of the street rather than the casino's, so the three
     * doors alternate — and so walking down to the clinic does not mean walking
     * through the casino's doorway on the way, which is what the first
     * placement did.
     */
    id: VenueId.RedRiverPlasma,
    name: 'Red River Plasma',
    kind: VenueKind.Clinic,
    doorPosition: [8.5, 0, -22],
    // Cold, and deliberately not a neon colour. Everything else on this street
    // glows; the clinic is lit.
    neonColor: '#cfe9ff',
    invitation: 'donate',
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

export const PLAYER_SPAWN: readonly [number, number, number] = [0, 0, 8]

/**
 * How close the player must be for a door to offer itself.
 *
 * Wider than it was, because what it means changed. As a contact trigger its
 * size was a hazard — anything you walked into, you were inside — so it was kept
 * mean. As the window in which a prompt is on screen and F does something, it is
 * the player's margin for stopping in the right place, and being generous costs
 * nothing. The three doors are sixteen units apart, so no two ever offer at
 * once; `venueDoors.test.ts` holds that.
 */
export const DOOR_TRIGGER_RADIUS = 3
