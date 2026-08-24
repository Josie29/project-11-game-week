export enum CasinoId {
  GoldenAce = 'golden-ace',
  LuckyViper = 'lucky-viper',
}

export enum GameKind {
  Blackjack = 'blackjack',
  Craps = 'craps',
}

export interface CasinoConfig {
  readonly id: CasinoId
  readonly name: string
  readonly game: GameKind
  /** World position of the entrance. Doubles as the proximity-trigger centre. */
  readonly doorPosition: readonly [number, number, number]
  /** Facade neon colour, also used for signage and the HUD accent. */
  readonly neonColor: string
  /** False while the game behind the door is still unbuilt. */
  readonly available: boolean
}

/**
 * Single source of truth for casino placement.
 *
 * The strip renders doors and signage from this list, the player's proximity
 * check reads it, and exiting returns the player to the matching door.
 *
 * Names are invented rather than borrowed from real Las Vegas properties,
 * which are live trademarks.
 */
export const CASINOS: readonly CasinoConfig[] = [
  {
    id: CasinoId.GoldenAce,
    name: 'Golden Ace',
    game: GameKind.Blackjack,
    doorPosition: [-8.5, 0, -14],
    neonColor: '#ffc63f',
    available: true,
  },
  {
    id: CasinoId.LuckyViper,
    name: 'Lucky Viper',
    game: GameKind.Craps,
    doorPosition: [8.5, 0, -34],
    neonColor: '#22e0ff',
    available: false, // Flip once the craps table is playable.
  },
]

export function getCasino(id: CasinoId): CasinoConfig {
  const casino = CASINOS.find((entry) => entry.id === id)
  if (!casino) {
    throw new Error(`Unknown casino id "${id}"`)
  }
  return casino
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
