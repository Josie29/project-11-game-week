/*
 * The Golden Ace's floor: where the two tables stand and where you walk.
 *
 * The casino used to be a table — walking through the door put the camera on a
 * fixed orbit with the player already seated, and there was nothing else in the
 * room. Now it is a room with two tables in it, so the floor needs a plan, and
 * hand-derived geometry on this project gets asserted before it is rendered.
 * Same rule as `tableLayout.ts`, `shopLayout.ts` and `shopFrontLayout.ts`.
 *
 * All coordinates are world space, because the tables are placed in it directly.
 */

export enum TableId {
  Blackjack = 'blackjack',
  Craps = 'craps',
}

export interface Footprint {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

/**
 * The craps table sits at the world origin, and must keep sitting there.
 *
 * `CrapsTable.tsx` carries its own `<Physics>` provider. A physics world under
 * a translated parent is the kind of thing that appears to work and then does
 * not, so the offset goes on the blackjack table instead and the craps table is
 * left exactly where it already was.
 */
export const CRAPS_ORIGIN: readonly [number, number, number] = [0, 0, 0]

/**
 * The blackjack table, off to one side.
 *
 * Translated, never rotated. Both tables keep their own local axes — dealer at
 * -z, players at +z — so a table camera only has to add this origin to the
 * local target it already used, with no rotation maths and no chance of the
 * framing drifting from what shipped.
 */
export const BLACKJACK_ORIGIN: readonly [number, number, number] = [-7.5, 0, 0]

/**
 * What each table physically occupies, including its stools and its staff.
 *
 * Wider than the felt on purpose: this is what the player is kept out of, and
 * being able to walk through a dealer is worse than being stopped a little
 * early.
 */
export const TABLE_FOOTPRINTS: Record<TableId, Footprint> = {
  [TableId.Blackjack]: { minX: -10.8, maxX: -4.2, minZ: -1.8, maxZ: 3.5 },
  [TableId.Craps]: { minX: -2.1, maxX: 2.1, minZ: -2.2, maxZ: 2.0 },
}

/** Where you stand to be offered a seat, on each table's player side. */
export const SIT_SPOTS: Record<TableId, readonly [number, number, number]> = {
  [TableId.Blackjack]: [-7.5, 0, 4.3],
  [TableId.Craps]: [0, 0, 2.6],
}

/** How close you have to be for the sit prompt to appear. */
export const SIT_RADIUS = 1.8

/** Where the player's character sits once they take a seat, per table. */
export const SEATS: Record<TableId, readonly [number, number, number]> = {
  [TableId.Blackjack]: [-7.5, 0, 2.95],
  [TableId.Craps]: [0, 0, 1.8],
}

/** Where the house staff stand, behind each table. */
export const DEALER_SPOTS: Record<TableId, readonly [number, number, number]> = {
  [TableId.Blackjack]: [-7.5, 0, -1.35],
  [TableId.Craps]: [0, 0, -1.9],
}

/**
 * The room's walls.
 *
 * Deeper than the tables need. The trailing camera sits behind the player, so
 * a room sized to its contents puts the camera outside the back wall — the
 * first version opened looking at the room through its own exit doorway from
 * the street side. `CAMERA_BOUNDS` catches the rest.
 */
export const ROOM: Footprint = { minX: -13, maxX: 6, minZ: -4.5, maxZ: 10 }

export const WALL_HEIGHT = 4.6

/**
 * Where the player may walk — the room, inset so they never touch a wall.
 *
 * The strip clamps rather than collides and so does this; the difference is
 * that a room has things in the middle of it, which `TABLE_FOOTPRINTS` covers.
 */
export const WALK_BOUNDS = {
  minX: ROOM.minX + 0.6,
  maxX: ROOM.maxX - 0.6,
  minZ: ROOM.minZ + 0.6,
  maxZ: ROOM.maxZ - 0.6,
} as const

/**
 * Where the trailing camera may sit.
 *
 * Inset further than the player's own bounds, because the camera trails them
 * by several units and would otherwise end up on the far side of a wall. Backed
 * into a corner this pulls the camera in close rather than letting it out of
 * the room, which is the usual trade and the right one here.
 */
export const CAMERA_BOUNDS = {
  minX: ROOM.minX + 0.5,
  maxX: ROOM.maxX - 0.5,
  minZ: ROOM.minZ + 0.5,
  maxZ: ROOM.maxZ - 0.5,
  maxY: WALL_HEIGHT - 0.4,
} as const

/** The way back to the strip, in the wall behind the tables. */
export const EXIT_DOOR: readonly [number, number, number] = [-3.5, 0, 9.6]
export const EXIT_RADIUS = 1.6

/**
 * Where the player appears on walking in.
 *
 * Inside the room and clear of the exit's own trigger, or arriving would throw
 * them straight back onto the street — the same reason `leaveVenue` offsets the
 * player away from a door on the way out.
 */
export const ENTRANCE: readonly [number, number, number] = [-3.5, 0, 6.5]

export const TABLE_IDS: readonly TableId[] = [TableId.Blackjack, TableId.Craps]

export const TABLE_LABELS: Record<TableId, string> = {
  [TableId.Blackjack]: 'Blackjack',
  [TableId.Craps]: 'Craps',
}

/** The origin a table's geometry is drawn at. */
export function tableOrigin(table: TableId): readonly [number, number, number] {
  return table === TableId.Craps ? CRAPS_ORIGIN : BLACKJACK_ORIGIN
}

/**
 * Tests whether a point is on the walkable floor.
 *
 * @param x World x.
 * @param z World z.
 * @param margin How far inside the wall the point must sit.
 */
export function isOnCasinoFloor(x: number, z: number, margin = 0): boolean {
  return (
    x >= ROOM.minX + margin &&
    x <= ROOM.maxX - margin &&
    z >= ROOM.minZ + margin &&
    z <= ROOM.maxZ - margin
  )
}

/** Whether a point is inside a footprint — i.e. inside a table. */
export function isInside(footprint: Footprint, x: number, z: number): boolean {
  return x > footprint.minX && x < footprint.maxX && z > footprint.minZ && z < footprint.maxZ
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
}
