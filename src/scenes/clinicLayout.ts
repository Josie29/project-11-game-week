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
/*
 * Spaced wider than the reference's tight row.
 *
 * The gap is set by the sit prompt, not by the furniture: at the original
 * spacing the radii had to be small enough not to overlap, which left dead
 * patches of floor between the chairs where nothing could be sat in.
 */
export const CHAIR_Z: readonly number[] = [-3.0, -0.6, 1.8, 4.2]
export const CHAIR_X = -4.1

/** A recliner with its footrest out is long and narrow. */
export const CHAIR_FOOTPRINT_HALF_X = 0.9
export const CHAIR_FOOTPRINT_HALF_Z = 0.55

/**
 * Where you stand to be offered the chair, out on the floor in front of it.
 *
 * Further out than the recliner needs, to leave the nurse somewhere to stand:
 * she works from the tray side and the two of you would otherwise arrive on the
 * same square. See `nurseStationFor`.
 */
export const CHAIR_SIT_X = -2.6
/**
 * Wide enough that the row has no dead patches, and deliberately overlapping.
 *
 * Circular prompts along a row cannot be both non-overlapping and gapless, and
 * gapless is what matters: a tight radius left stretches of floor between the
 * chairs where nothing was on offer, so walking the row stepped over the prompt
 * rather than into it.
 *
 * Overlap is harmless because `WalkingPlayer` reports the *nearest* target
 * rather than the first, so a point between two chairs resolves to the one you
 * are actually closer to.
 */
export const SIT_RADIUS = 1.6

/**
 * A quarter turn, so a recliner faces out into the room.
 *
 * Exported because two things now have to agree about it: the chair draws its
 * parts in its own turned space, and the draw hangs a bag on the chair's stand
 * from outside that space. Everything below is in the chair's space, and
 * `reclinerToWorld` is the only place the turn is applied.
 */
export const RECLINER_TURN = Math.PI / 2

/** The tray the donor's arm rests on, in the chair's own space. */
export const TRAY_LOCAL: readonly [number, number, number] = [0.62, 0.56, 0.02]

/** Where the IV stand carries its bag, in the chair's own space. */
export const IV_BAG_LOCAL: readonly [number, number, number] = [-0.5, 1.5, -0.2]

/**
 * The line from the needle to the bag, as points local to the bag itself.
 *
 * Here rather than in the component for the usual reason — these are
 * hand-derived 3D coordinates, and the two previous versions of this line were
 * both perfectly reasonable numbers that drew something nobody could see. The
 * test asserts the needle end actually reaches the tray.
 */
export const DRAW_LINE_PATH: readonly (readonly [number, number, number])[] = [
  // At the crook of the donor's arm, where the needle is.
  [0.25, -0.8, -1],
  // Slack, before it climbs. Tubing leaves an arm downward, not upward.
  [0.24, -0.72, -0.72],
  [0.16, -0.52, -0.42],
  [0.06, -0.26, -0.16],
  // Into the port underneath the bag.
  [0, -0.1, 0],
]

/**
 * Turns a point in a recliner's own space into world space.
 *
 * @param local The point, as the chair's own meshes are written.
 * @param index Which chair, which sets the z.
 * @returns The same point in world coordinates.
 */
export function reclinerToWorld(
  local: readonly [number, number, number],
  index: number,
): readonly [number, number, number] {
  const [x, y, z] = local
  const cos = Math.cos(RECLINER_TURN)
  const sin = Math.sin(RECLINER_TURN)

  return [CHAIR_X + x * cos + z * sin, y, (CHAIR_Z[index] ?? 0) - x * sin + z * cos]
}

/** Where the bag hangs over a given chair, in world space. */
export function ivBagAt(index: number): readonly [number, number, number] {
  return reclinerToWorld(IV_BAG_LOCAL, index)
}

/** Where the donor's arm rests, in world space. */
export function trayAt(index: number): readonly [number, number, number] {
  return reclinerToWorld(TRAY_LOCAL, index)
}

/**
 * The fixed camera on an occupied chair, as offsets from that chair.
 *
 * Here rather than in the component because the draw line has to be drawn
 * across this camera to be visible at all, and a line and a camera that disagree
 * is not something a later reader would think to check. The test derives the
 * view direction from these, so moving the camera moves the assertion with it.
 */
export const CHAIR_CAMERA_OFFSET: readonly [number, number, number] = [2.7, 1.68, 1.72]
export const CHAIR_CAMERA_TARGET: readonly [number, number, number] = [0.3, 1.14, -0.2]

/** Where the chair camera sits, in world space. */
export function chairCameraAt(index: number): readonly [number, number, number] {
  const [x, y, z] = CHAIR_CAMERA_OFFSET
  return [CHAIR_X + x, y, (CHAIR_Z[index] ?? 0) + z]
}

/** What it is aimed at, in world space. */
export function chairCameraTarget(index: number): readonly [number, number, number] {
  const [x, y, z] = CHAIR_CAMERA_TARGET
  return [CHAIR_X + x, y, (CHAIR_Z[index] ?? 0) + z]
}

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
 * Where the player appears on walking in: beside the nearest recliner.
 *
 * Far enough inside that arriving does not re-trigger the exit, and far enough
 * from the back wall that the trailing camera has somewhere to sit — but also
 * deliberately within reach of a chair's prompt. It is a room with four chairs
 * in it; making somebody cross it before anything is on offer is a walk that
 * says nothing.
 */
export const ENTRANCE: readonly [number, number, number] = [-2.2, 0, 4]

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
