/*
 * Where everything sits inside The Gilded Hanger.
 *
 * Pulled out of the scene component for the same reason `tableLayout.ts` was:
 * these anchors were derived by hand, and hand-derived geometry on this project
 * has been wrong more often than the game rules have. `isOnShopFloor` is the
 * shop's `isOnFelt` — a rack half inside the wall reads as a rendering glitch
 * and is invisible until someone orbits past it.
 */

/** The room is a rectangle. Half-extents from the centre, in world units. */
export const HALF_WIDTH = 5.2
export const HALF_DEPTH = 4.4

export const WALL_HEIGHT = 3.6

/** Clearance every fitting keeps from the wall, so nothing clips through it. */
export const WALL_MARGIN = 0.35

export type Anchor2D = readonly [number, number]

/** The raised plinth the player's character stands on, mid-room. */
export const PLINTH: Anchor2D = [0, 0.6]
export const PLINTH_RADIUS = 0.95
export const PLINTH_HEIGHT = 0.18

/**
 * The mirror alcove, on the back wall behind the plinth.
 *
 * A framed, neon-lit panel rather than an actual reflective surface: a real
 * mirror means a second render pass for one prop, and the character is already
 * on the plinth in front of it.
 */
export const MIRROR: Anchor2D = [0, -HALF_DEPTH + WALL_MARGIN]
export const MIRROR_WIDTH = 1.6
export const MIRROR_HEIGHT = 2.4

/** Clothing rails down each side wall. */
export const RACKS: readonly { readonly at: Anchor2D; readonly rotationY: number }[] = [
  { at: [-HALF_WIDTH + 0.9, -1.6], rotationY: Math.PI / 2 },
  { at: [-HALF_WIDTH + 0.9, 1.4], rotationY: Math.PI / 2 },
  { at: [HALF_WIDTH - 0.9, -1.6], rotationY: Math.PI / 2 },
  { at: [HALF_WIDTH - 0.9, 1.4], rotationY: Math.PI / 2 },
]

export const RACK_LENGTH = 2.2
export const RACK_HEIGHT = 1.75

/**
 * The glass jewellery counter.
 *
 * On the left of the room specifically: the catalogue panel covers the right
 * of the screen, so anything placed on that side of the plinth is behind the UI
 * at the opening camera angle and might as well not have been built.
 */
export const COUNTER: Anchor2D = [-3.1, 2.5]
export const COUNTER_WIDTH = 2.4
export const COUNTER_DEPTH = 0.7
export const COUNTER_HEIGHT = 1

/** Where the player stands when the door closes behind them. */
export const ENTRANCE: Anchor2D = [0, HALF_DEPTH - 0.9]

/**
 * Tests whether a point lies on the shop floor, clear of the walls.
 *
 * @param x Distance from the room's centre line, positive toward the counter.
 * @param z Distance along the room; positive toward the door.
 * @param margin How far inside the wall the point must sit, in world units.
 */
export function isOnShopFloor(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) <= HALF_WIDTH - margin && Math.abs(z) <= HALF_DEPTH - margin
}

/** A rack's two end points in world XZ, for bounds checking. */
export function rackEnds(rack: { at: Anchor2D; rotationY: number }): [Anchor2D, Anchor2D] {
  const [x, z] = rack.at
  const alongX = Math.cos(rack.rotationY)
  const alongZ = -Math.sin(rack.rotationY)
  const half = RACK_LENGTH / 2

  return [
    [x - alongX * half, z - alongZ * half],
    [x + alongX * half, z + alongZ * half],
  ]
}

/** The counter's four corners in world XZ. It is axis-aligned. */
export function counterCorners(): Anchor2D[] {
  const [x, z] = COUNTER
  const corners: Anchor2D[] = []

  for (const alongWidth of [-0.5, 0.5]) {
    for (const alongDepth of [-0.5, 0.5]) {
      corners.push([x + COUNTER_WIDTH * alongWidth, z + COUNTER_DEPTH * alongDepth])
    }
  }
  return corners
}
