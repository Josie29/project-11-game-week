/*
 * Red River Plasma's donation room.
 *
 * Matched to `art/refs/clinic_interior.png`: a row of recliners along one wall,
 * each with its own IV stand, a check-in desk by the door, waiting chairs
 * opposite and a vending machine in the corner.
 *
 * Pure and asserted, like `tableLayout.ts`, `shopLayout.ts`,
 * `storefrontLayout.ts` and `casinoFloorLayout.ts` before it. This one is a
 * room the player walks, so the same things matter as on the casino floor:
 * nothing overlapping, every prompt reachable, and no two prompts at once.
 *
 * All coordinates are world space.
 */

import type { Footprint } from './casinoFloorLayout'

/** The room is smaller and meaner than the casino floor. That is the point. */
export const ROOM: Footprint = { minX: -6, maxX: 6, minZ: -4, maxZ: 7 }

export const WALL_HEIGHT = 3.2

export const WALK_BOUNDS = {
  minX: ROOM.minX + 0.6,
  maxX: ROOM.maxX - 0.6,
  minZ: ROOM.minZ + 0.6,
  maxZ: ROOM.maxZ - 0.6,
} as const

/**
 * Where the trailing camera may sit.
 *
 * The casino floor learned this the hard way: a camera that trails the player
 * by five units ends up outside a room this size, filming the back of a wall.
 */
export const CAMERA_BOUNDS = {
  minX: ROOM.minX + 0.5,
  maxX: ROOM.maxX - 0.5,
  minZ: ROOM.minZ + 0.5,
  maxZ: ROOM.maxZ - 0.5,
  maxY: WALL_HEIGHT - 0.3,
} as const

/** The recliners, in a row down the left-hand wall as in the reference. */
export const CHAIR_COUNT = 4
export const CHAIR_Z: readonly number[] = [-2.4, -0.9, 0.6, 2.1]
export const CHAIR_X = -4.1

/** A recliner with its footrest out is long and narrow. */
export const CHAIR_FOOTPRINT_HALF_X = 1.05
export const CHAIR_FOOTPRINT_HALF_Z = 0.55

/** Where you stand to be offered the chair, out on the floor beside it. */
export const CHAIR_SIT_X = -2.5
export const SIT_RADIUS = 0.72

/** The check-in desk, by the door. */
export const DESK: readonly [number, number, number] = [3.4, 0, 3.4]
export const DESK_WIDTH = 2.6
export const DESK_DEPTH = 0.7
export const DESK_HEIGHT = 1.05

/** Waiting chairs against the right-hand wall. */
export const WAITING_X = 4.9
export const WAITING_Z: readonly number[] = [-1.8, -1.1, -0.4, 0.3]

export const VENDING: readonly [number, number, number] = [4.9, 0, 1.8]

export const EXIT_DOOR: readonly [number, number, number] = [0, 0, 6.7]
/**
 * Generous, like the strip's own doors.
 *
 * The room is barely three paces wide at the door end, and a tight trigger
 * meant walking straight back from a recliner missed it — the player ended up
 * pressed into the corner beside the way out.
 */
export const EXIT_RADIUS = 3

/**
 * Far enough inside that arriving does not re-trigger the exit — and further
 * still, so the trailing camera has somewhere to sit that is not the back wall.
 */
export const ENTRANCE: readonly [number, number, number] = [0, 0, 2.4]

/** Chair ids, as the proximity targets and the seat state use them. */
export const CHAIR_IDS: readonly string[] = Array.from(
  { length: CHAIR_COUNT },
  (_, index) => `chair-${index}`,
)

export function chairIndex(id: string): number {
  return CHAIR_IDS.indexOf(id)
}

/** Where a given chair stands. */
export function chairPosition(index: number): readonly [number, number, number] {
  return [CHAIR_X, 0, CHAIR_Z[index] ?? 0]
}

/** Where the player stands to be offered that chair. */
export function chairSitSpot(index: number): readonly [number, number, number] {
  return [CHAIR_SIT_X, 0, CHAIR_Z[index] ?? 0]
}

/** What the player is kept out of: the recliners, the desk and the machine. */
export function obstacles(): readonly Footprint[] {
  const chairs = CHAIR_Z.map((z) => ({
    minX: CHAIR_X - CHAIR_FOOTPRINT_HALF_X,
    maxX: CHAIR_X + CHAIR_FOOTPRINT_HALF_X,
    minZ: z - CHAIR_FOOTPRINT_HALF_Z,
    maxZ: z + CHAIR_FOOTPRINT_HALF_Z,
  }))

  return [
    ...chairs,
    {
      minX: DESK[0] - DESK_WIDTH / 2,
      maxX: DESK[0] + DESK_WIDTH / 2,
      minZ: DESK[2] - DESK_DEPTH / 2,
      maxZ: DESK[2] + DESK_DEPTH / 2,
    },
  ]
}

/**
 * Tests whether a point is on the walkable floor.
 *
 * @param x World x.
 * @param z World z.
 * @param margin How far inside the wall the point must sit.
 */
export function isOnClinicFloor(x: number, z: number, margin = 0): boolean {
  return (
    x >= ROOM.minX + margin &&
    x <= ROOM.maxX - margin &&
    z >= ROOM.minZ + margin &&
    z <= ROOM.maxZ - margin
  )
}
