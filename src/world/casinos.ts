export enum CasinoId {
  Mirage = 'mirage',
  Sands = 'sands',
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
  /** Facade neon colour, also used for the door glow and HUD accent. */
  readonly neonColor: string
  /** False while the game behind the door is still unbuilt. */
  readonly available: boolean
}

/**
 * Single source of truth for casino placement.
 *
 * The strip renders doors from this list, the player's proximity check reads it,
 * and exiting a casino returns the player to the matching `doorPosition`.
 */
export const CASINOS: readonly CasinoConfig[] = [
  {
    id: CasinoId.Mirage,
    name: 'The Mirage',
    game: GameKind.Blackjack,
    doorPosition: [-6.5, 0, -14],
    neonColor: '#ff2d95',
    available: true,
  },
  {
    id: CasinoId.Sands,
    name: 'The Sands',
    game: GameKind.Craps,
    doorPosition: [6.5, 0, -34],
    neonColor: '#22e0ff',
    available: false, // Craps lands Wednesday.
  },
]

export function getCasino(id: CasinoId): CasinoConfig {
  const casino = CASINOS.find((entry) => entry.id === id)
  if (!casino) {
    throw new Error(`Unknown casino id "${id}"`)
  }
  return casino
}

/** Walkable bounds of the strip, in world units. */
export const STREET_BOUNDS = {
  minX: -6,
  maxX: 6,
  minZ: -52,
  maxZ: 12,
} as const

export const PLAYER_SPAWN: readonly [number, number, number] = [0, 0, 8]

/** How close the player must get to a door before it opens. */
export const DOOR_TRIGGER_RADIUS = 2.6
