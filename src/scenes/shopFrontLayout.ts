/*
 * The Gilded Hanger's storefront, as seen from the street.
 *
 * Matched to `art/refs/shop_exterior_wide.png`. The brief that reference was
 * generated to answer is the whole reason this file exists: the shop was
 * structurally a casino — the same tower, the same bulb marquee, the same blade
 * sign, the same flat door slab, differing only in hex value — so a player
 * walking past had no way to tell it sells clothes.
 *
 * Every measurement here is hand-derived and therefore asserted, the same rule
 * `tableLayout.ts` and `shopLayout.ts` follow.
 *
 * Coordinates are local to the venue's `doorPosition`, in two axes:
 *
 * - `out` runs from the building toward the road. Positive is toward the road,
 *   whichever side of the street the venue sits on, so nothing here needs to
 *   know about `facing`.
 * - `z` runs along the street, measured from the door position.
 */

/**
 * Where the building's own facade plane sits, relative to the door position.
 *
 * `shopFrontLayout.test.ts` checks this against `FACADE_X` rather than trusting
 * the number, because everything below depends on it.
 */
export const FACADE_OUT = -0.3

/** The storefront's glazed front plane, standing slightly proud of the facade. */
export const FRONT_OUT = 0.15

/**
 * The back of the display, which is the tower's own face.
 *
 * The display is shallow on purpose, and this is the constraint that forced it:
 * the towers are solid boxes from `FACADE_X` outward, so anything placed behind
 * the facade plane to make a deeper window is inside the building and drawn
 * over by it. The first version recessed the interior 1.6 into the tower, and
 * the window came back black with all three mannequins hidden inside the wall.
 */
export const INTERIOR_OUT = FACADE_OUT

export const STOREFRONT_HEIGHT = 5

/*
 * The storefront runs along the street, offset so the window sits to one side
 * of the door rather than being split by it.
 *
 * The door is centred on `z = 0` on purpose. That is where `DOOR_TRIGGER_RADIUS`
 * is measured from, and a visible door offset from its own trigger means the
 * player walks toward the doorway and enters from somewhere beside it.
 */
export const STOREFRONT_MIN_Z = -4.6
export const STOREFRONT_MAX_Z = 1.4

export const DOOR_HALF_WIDTH = 0.7
export const DOOR_HEIGHT = 2.75

/** The plate-glass display window: the single biggest change from a casino. */
export const WINDOW_MIN_Z = -4
export const WINDOW_MAX_Z = -1
export const WINDOW_SILL_Y = 0.9
export const WINDOW_TOP_Y = 3.05

/** Neon box sign above the window — a different sign language to the marquees. */
export const SIGN_MIN_Y = 3.55
export const SIGN_MAX_Y = 4.45
export const SIGN_OUT = 0.2

/** Scalloped awning, sloping down and out over the window. */
export const AWNING_BACK_Y = 3.4
export const AWNING_FRONT_Y = 2.98
export const AWNING_FRONT_OUT = 1

/** Mannequins on a low platform behind the glass, wearing the catalogue. */
export const MANNEQUIN_OUT = -0.08
export const MANNEQUIN_Z: readonly number[] = [-3.4, -2.5, -1.6]
export const MANNEQUIN_PLATFORM_Y = 0.12

export interface FrontagePanel {
  readonly minZ: number
  readonly maxZ: number
  readonly minY: number
  readonly maxY: number
}

/**
 * The solid frontage, as the panels left over once the openings are removed.
 *
 * The first version of this was a single box the width of the storefront, with
 * the glass laid on top of it — so the display window was a sheet of glass over
 * a solid wall, and the lit interior and every mannequin behind it were
 * invisible from the street. A wall with a window in it has to be built as the
 * wall *around* the window.
 */
export const FRONTAGE_PANELS: readonly FrontagePanel[] = [
  // Full-height piers: left of the window, between window and door, right of
  // the door.
  { minZ: STOREFRONT_MIN_Z, maxZ: WINDOW_MIN_Z, minY: 0, maxY: STOREFRONT_HEIGHT },
  { minZ: WINDOW_MAX_Z, maxZ: -DOOR_HALF_WIDTH, minY: 0, maxY: STOREFRONT_HEIGHT },
  { minZ: DOOR_HALF_WIDTH, maxZ: STOREFRONT_MAX_Z, minY: 0, maxY: STOREFRONT_HEIGHT },
  // Below and above the window.
  { minZ: WINDOW_MIN_Z, maxZ: WINDOW_MAX_Z, minY: 0, maxY: WINDOW_SILL_Y },
  { minZ: WINDOW_MIN_Z, maxZ: WINDOW_MAX_Z, minY: WINDOW_TOP_Y, maxY: STOREFRONT_HEIGHT },
  // The header over the door.
  { minZ: -DOOR_HALF_WIDTH, maxZ: DOOR_HALF_WIDTH, minY: DOOR_HEIGHT, maxY: STOREFRONT_HEIGHT },
]

/** Whether any frontage panel covers this point — i.e. whether it is wall. */
export function isSolidFrontage(z: number, y: number): boolean {
  return FRONTAGE_PANELS.some(
    (panel) => z > panel.minZ && z < panel.maxZ && y > panel.minY && y < panel.maxY,
  )
}

/**
 * Tests whether a point lies on the storefront panel.
 *
 * @param z Distance along the street from the door position.
 * @param y Height above the road.
 * @param margin How far inside the panel edge the point must sit.
 */
export function isOnShopFront(z: number, y: number, margin = 0): boolean {
  return (
    z >= STOREFRONT_MIN_Z + margin &&
    z <= STOREFRONT_MAX_Z - margin &&
    y >= margin &&
    y <= STOREFRONT_HEIGHT - margin
  )
}

/** Tests whether a point lies behind the display glass, where a dresser works. */
export function isInWindow(z: number, y: number): boolean {
  return z >= WINDOW_MIN_Z && z <= WINDOW_MAX_Z && y >= WINDOW_SILL_Y && y <= WINDOW_TOP_Y
}

/**
 * Tests whether an `out` offset lies in the display's usable depth.
 *
 * Between the tower's face and the glass. Outside it in one direction is the
 * street, and in the other is the inside of a solid building.
 */
export function isInDisplayDepth(out: number, margin = 0): boolean {
  return out >= INTERIOR_OUT + margin && out <= FRONT_OUT - margin
}

/**
 * Converts a local `out` offset to a world X coordinate.
 *
 * @param doorX The venue's door X, from its config.
 * @param out Distance toward the road from the door position.
 */
export function outToWorldX(doorX: number, out: number): number {
  // Venues on the left of the street face +X; those on the right face -X.
  const facing = doorX < 0 ? 1 : -1
  return doorX + facing * out
}
