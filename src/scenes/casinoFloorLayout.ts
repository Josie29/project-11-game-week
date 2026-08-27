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

import { CAMERA_LOOK_HEIGHT, PLAY_FOV } from '../world/camera'
import { OUTER_HALF_DEPTH, OUTER_HALF_WIDTH } from './crapsTableLayout'
import { CENTER_SEAT, PLAYER_SEATS } from './tableLayout'

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
  // Two and a half to one now: wide across the room, shallow front to back.
  // Deeper than the table itself, because this has to cover the boxman behind
  // it and the shooter standing at the near rail as well as the woodwork.
  [TableId.Craps]: { minX: -2.85, maxX: 2.85, minZ: -2.0, maxZ: 2.0 },
}

/* --------------------------------------------------- the blackjack seats */

/**
 * How many places the blackjack table has: one per stool, and no more.
 *
 * Derived from the stools rather than chosen beside them, because a table with
 * six places and five stools is a player sitting on the floor. This is also
 * what caps the table — the room allows more sockets than that, and a sixth
 * player has nowhere to be put.
 */
export const BLACKJACK_SEAT_COUNT = PLAYER_SEATS.length

/**
 * The stool a lone player takes.
 *
 * The centre one, because that is where every solo player has sat since the
 * table was single-player. Every `?boot=` link claims it, so every capture of a
 * hand still frames exactly what it framed before seats could be chosen.
 *
 * Taken from the felt rather than restated: `CENTER_SEAT` is the stool whose
 * betting spot is on the centre line, and that is the whole reason a lone
 * player there can be dealt across the width of the table. Two numbers here
 * would let the default seat and the only seat the solo layout fits drift apart.
 */
export const DEFAULT_BLACKJACK_SEAT = CENTER_SEAT

/** Proximity ids, one per stool, in the order they play. */
export const BLACKJACK_SEAT_IDS: readonly string[] = Array.from(
  { length: BLACKJACK_SEAT_COUNT },
  (_, index) => `blackjack-seat-${index}`,
)

/** The seat a proximity id names, or -1 when it names something else. */
export function blackjackSeatFromId(id: string): number {
  return BLACKJACK_SEAT_IDS.indexOf(id)
}

/**
 * Whether a seat index is one this table actually has.
 *
 * Total, because a seat index arrives off the wire like everything else a peer
 * sends: a claim on seat 900 has to read as no claim rather than as a hole in
 * the seat map.
 */
export function isBlackjackSeat(seat: unknown): seat is number {
  return typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < BLACKJACK_SEAT_COUNT
}

/** Clamps anything into a seat this table has. */
function clampSeat(seat: number): number {
  return isBlackjackSeat(seat) ? seat : DEFAULT_BLACKJACK_SEAT
}

/** Where a given stool stands, in world space. */
export function blackjackSeatSpot(seat: number): readonly [number, number, number] {
  const stool = PLAYER_SEATS[clampSeat(seat)]!
  return [BLACKJACK_ORIGIN[0] + stool.x, 0, BLACKJACK_ORIGIN[2] + stool.z]
}

/**
 * How far back from the table the player stands to be offered a stool.
 *
 * A straight row rather than the arc the stools sit on. The stools follow the
 * felt's ellipse, and the floor behind them does not: an arc of prompts puts
 * the outer two inside the table's own footprint, which is precisely the floor
 * the player is pushed out of, so those two seats could never be offered at all.
 *
 * The value is the spot blackjack has always used, so the centre seat's
 * approach — and everything tuned against it, including the walkthrough — is
 * where it was.
 */
export const BLACKJACK_STAND_Z = 4.3

/**
 * Which way a stool faces: at the middle of the table.
 *
 * The player sitting on it takes the same value rather than its own, because a
 * figure and the chair under it facing different ways is exactly the kind of
 * thing two hand-written numbers eventually do. Square to the dealer is right
 * for the middle seat only — at third base it seats the player side-on to their
 * own cards, looking down the empty end of the felt.
 */
export function blackjackSeatFacing(seat: number): number {
  const stool = PLAYER_SEATS[clampSeat(seat)]!
  /*
   * Negating a zero gives `-0`, and `atan2(-0, -z)` is -π where `atan2(0, -z)`
   * is +π. The same rotation either way, but the middle seat is the one every
   * capture of a hand was taken against and it should keep returning the exact
   * value that shipped rather than its negative twin.
   */
  const towardCenterX = stool.x === 0 ? 0 : -stool.x
  return Math.atan2(towardCenterX, -stool.z)
}

/** Where the player stands to be offered a given stool. */
export function blackjackStandSpot(seat: number): readonly [number, number, number] {
  const stool = PLAYER_SEATS[clampSeat(seat)]!
  return [BLACKJACK_ORIGIN[0] + stool.x, 0, BLACKJACK_STAND_Z]
}

/**
 * Wide enough that the row of stools has no dead patches between them.
 *
 * The clinic's recliners again, and deliberately overlapping for the same
 * reason: circular prompts along a row cannot be both non-overlapping and
 * gapless, and gapless is what matters. `WalkingPlayer` reports the nearest, so
 * a point between two stools resolves to the one being walked up to.
 *
 * Overlap is only safe between prompts offering the *same* kind of thing. A
 * stool and the craps rail offer different things, and `venueDoors.test.ts`
 * keeps those apart.
 */
export const BLACKJACK_SEAT_RADIUS = 1.05

/**
 * Where you stand to be offered a place at craps, as a *segment*.
 *
 * A circle is the wrong shape for five metres of table. Sized as one it needed
 * a 3.2 radius to be walkable into anywhere along its length — and a 3.2 circle
 * at the shooter's end reaches two metres past the end of the table, across the
 * floor in front of the blackjack table's third-base stool. Walking up to that
 * stool was offered craps. Measured to the rail instead, the prompt stops where
 * the table does.
 *
 * The half-length is the table's own, less a little: it has to be walkable into
 * as well as accurate, because the room is crossed in strides of roughly two
 * metres on a slow renderer and a window narrower than a stride is one a stride
 * steps over.
 */
export const CRAPS_PROMPT = {
  center: [0, 0, 3.2] as readonly [number, number, number],
  halfLength: 2.2,
  radius: 1.5,
} as const

/**
 * How far a point is from the craps prompt, measured to the segment.
 *
 * Shared with `WalkingPlayer`, which applies the same rule to any target
 * carrying a `halfLength`. Two implementations of one shape is the disagreement
 * nobody thinks to look for, so the layout module owns it and the test holds
 * both to it.
 */
export function crapsPromptGap(x: number, z: number): number {
  const [centerX, , centerZ] = CRAPS_PROMPT.center
  // Zero anywhere along the segment itself; grows only past either end.
  const along = Math.max(0, Math.abs(x - centerX) - CRAPS_PROMPT.halfLength)
  return Math.hypot(along, z - centerZ)
}

/**
 * Where the player is put back when they stand up.
 *
 * Lined up with the exit: from here the way out is a straight walk back with no
 * sideways correction to overshoot. Blackjack's is the centre stool's approach —
 * standing up from any other seat uses `blackjackStandSpot`, so you are left
 * standing behind the stool you were actually on.
 *
 * The craps spot is off to one end of the near rail rather than the middle of
 * it, because that is where the shooter stands: they throw the length of the
 * table, so standing them at the centre would have them lobbing the dice
 * sideways into the nearest wall.
 */
export const SIT_SPOTS: Record<TableId, readonly [number, number, number]> = {
  [TableId.Blackjack]: blackjackStandSpot(DEFAULT_BLACKJACK_SEAT),
  [TableId.Craps]: [-2.4, 0, 3.2],
}


/**
 * Where the player's character ends up once they take a place, per table.
 *
 * Blackjack is a seat. Craps is a spot at the rail: nobody sits at craps, and
 * the seated pose put the player's head below the rail they were supposedly
 * throwing over. Standing at the shooter's end also lines them up with where
 * the dice are released, so the throw reads as theirs.
 */
export const SEATS: Record<TableId, readonly [number, number, number]> = {
  // Derived, not written down twice: the stool a lone player takes.
  [TableId.Blackjack]: blackjackSeatSpot(DEFAULT_BLACKJACK_SEAT),
  [TableId.Craps]: [-1.75, 0, 1.58],
}

/**
 * How far off the table's outer edge a standing player is placed.
 *
 * Derived from the shooter's spot rather than written down, so the end spots
 * around the corner keep exactly the standoff the near rail has always had.
 */
const CRAPS_STAND_OFF = SEATS[TableId.Craps][2] - OUTER_HALF_DEPTH

/** The near rail's standing line, which is the shooter's own z. */
const CRAPS_RAIL_Z = SEATS[TableId.Craps][2]

/**
 * Gap between neighbouring rail spots.
 *
 * Set by the players, not the table: the broadest build is about 0.73 m across
 * the shoulders (`shoulderX` 0.292 plus the upper arm on each side), so
 * anything under ~0.75 m stands two figures inside each other's arms.
 */
const CRAPS_RAIL_SPACING = 0.8

/** Beside the table's far end, one standoff past the woodwork. */
const CRAPS_END_X = OUTER_HALF_WIDTH + CRAPS_STAND_OFF

/**
 * Places along the craps rail, in the order they are filled — one per player
 * the table takes, which is the spec's eight.
 *
 * **Index 0 is the shooter's end**, and is exactly `SEATS[TableId.Craps]` — the
 * spot every player has stood at since craps was single-player, so a lone
 * player still stands precisely where they always did and no capture moves.
 *
 * Six spots run down the near rail from the shooter, and the last two wrap
 * around the table's far end, facing it side-on (`crapsRailFacing`). The rail
 * used to stop at five spots for a table that seats eight, so the back three of
 * a full line stood inside each other at the far spot — the same bug spreading
 * the rail out was meant to fix, three players later.
 */
export const CRAPS_RAIL_SPOTS: readonly (readonly [number, number, number])[] = [
  // Down the near rail, shooter first…
  ...Array.from(
    { length: 6 },
    (_, place) =>
      [SEATS[TableId.Craps][0] + place * CRAPS_RAIL_SPACING, 0, CRAPS_RAIL_Z] as const,
  ),
  // …then around the far end, clear of the boxman on the opposite side.
  [CRAPS_END_X, 0, 0.55],
  [CRAPS_END_X, 0, -0.25],
]

/**
 * Which way a player at a rail spot faces: at the felt.
 *
 * The near rail looks across -z, exactly as it always has; the two spots
 * around the table's end look across -x. Derived from the spot rather than
 * stored beside it, so a spot and its facing cannot be edited apart.
 */
export function crapsRailFacing(spot: readonly [number, number, number]): number {
  // Only the end spots sit past the table's far edge.
  return spot[0] >= CRAPS_END_X ? -Math.PI / 2 : Math.PI
}

/**
 * Whether the table can take this player.
 *
 * The spec's cap is eight, and it is the rail that enforces it: one spot per
 * player, no spot, no join. Someone already in the lineup always has room —
 * their spot is the one they are standing on, and a re-announce racing the
 * lineup must not read as a ninth player.
 */
export function crapsRailHasRoom(playerId: string, lineup: readonly string[]): boolean {
  return lineup.includes(playerId) || lineup.length < CRAPS_RAIL_SPOTS.length
}

/**
 * Which rail spot a player stands at.
 *
 * The shooter takes the shooter's end whoever they are, because that is where
 * the dice leave the hand — the throw has to read as theirs. Everybody else
 * fills the remaining places in the order they arrived, which is also the order
 * the dice will reach them.
 *
 * Pure, and tested: who is standing where is the sort of thing that looks
 * plausible in any single screenshot and is only wrong when you count.
 *
 * @param playerId The player being placed.
 * @param shooterId Who currently holds the dice, or null if nobody does.
 * @param lineup Everyone at the table, in arrival order.
 */
export function crapsRailSpot(
  playerId: string,
  shooterId: string | null,
  lineup: readonly string[],
): readonly [number, number, number] {
  if (playerId === shooterId) return CRAPS_RAIL_SPOTS[0]!

  const others = lineup.filter((id) => id !== shooterId)
  const place = others.indexOf(playerId)

  // Somebody the lineup has not caught up with yet stands at the far end rather
  // than on top of the shooter.
  const index = place === -1 ? CRAPS_RAIL_SPOTS.length - 1 : Math.min(place + 1, CRAPS_RAIL_SPOTS.length - 1)
  return CRAPS_RAIL_SPOTS[index]!
}

/** Which tables the player stands at rather than sits down at. */
export const STANDING_TABLES: ReadonlySet<TableId> = new Set([TableId.Craps])

/** Where the house staff stand, behind each table. */
export const DEALER_SPOTS: Record<TableId, readonly [number, number, number]> = {
  [TableId.Blackjack]: [-7.5, 0, -1.35],
  // The boxman, opposite the shooter across the shallow side of the table.
  [TableId.Craps]: [0, 0, -1.65],
}

/**
 * The room's walls.
 *
 * Deeper than the tables need. The trailing camera sits behind the player, so
 * a room sized to its contents puts the camera outside the back wall — the
 * first version opened looking at the room through its own exit doorway from
 * the street side. `CAMERA_BOUNDS` catches the rest.
 *
 * The far end is deeper again since the water court went in. The tables stop at
 * `z = -2`; everything behind that is the court, and it is the thing the room
 * is looked at down the length of.
 */
export const ROOM: Footprint = { minX: -13, maxX: 6, minZ: -8, maxZ: 10 }

/**
 * Two storeys, because one was the whole problem.
 *
 * At 4.6 the room was a box with a lid just above the pendants: no wall showed
 * above the tables, so there was nowhere to put a waterfall, a balcony or
 * anything else that reads as architecture. Nothing is *placed* at this height
 * — `MEZZANINE_HEIGHT` and `WATERFALL_TOP` derive from it — so raising it again
 * moves the building rather than leaving furniture behind at the old ceiling.
 *
 * This is the **springing line** now, not the ceiling: the top of the vertical
 * walls, where the vault starts. `CEILING_HEIGHT` is the ceiling, and only at
 * the crown — see `vaultHeightAt`.
 */
export const WALL_HEIGHT = 8.0

/* --------------------------------------------------------------- the vault */

/**
 * How far the barrel vault rises above the springing.
 *
 * Set this to 0 and the room gets a flat ceiling back, with every rib, lamp and
 * cable still landing on it: `vaultHeightAt` degrades to a constant. That is
 * deliberate. A curved ceiling is the only thing in this room that changes its
 * *shape*, and a one-line way back out is cheap insurance.
 */
export const VAULT_RISE = 2.2

/** The crown, which is the ceiling directly over the aisle and nowhere else. */
export const CEILING_HEIGHT = WALL_HEIGHT + VAULT_RISE

const ROOM_HALF_WIDTH = (ROOM.maxX - ROOM.minX) / 2
const ROOM_MID_X = (ROOM.minX + ROOM.maxX) / 2

/**
 * Radius of the circle the vault is a segment of.
 *
 * From the chord (the room's width) and the rise, by the intersecting-chords
 * relation: `halfWidth² = rise × (2R - rise)`.
 */
export const VAULT_RADIUS =
  VAULT_RISE > 0 ? (ROOM_HALF_WIDTH * ROOM_HALF_WIDTH + VAULT_RISE * VAULT_RISE) / (2 * VAULT_RISE) : 0

/**
 * Half the arc the vault sweeps, in radians — what the cylinder segment needs.
 */
export const VAULT_HALF_ANGLE = VAULT_RISE > 0 ? Math.asin(ROOM_HALF_WIDTH / VAULT_RADIUS) : 0

/** Where the circle's centre sits, below the springing line. */
export const VAULT_CENTER_Y = WALL_HEIGHT + VAULT_RISE - VAULT_RADIUS

/**
 * How high the ceiling is at a given x.
 *
 * Exported, and the reason is the pendants. Their cable used to be
 * `WALL_HEIGHT - 3.6` — a single number, correct under a flat lid and wrong at
 * every x but the centre under a curved one. A lamp hanging off a stub of cable
 * two metres short of the ceiling is a still-image bug that nobody would think
 * to go looking for at `x = -7.5` specifically, so anything that hangs from the
 * ceiling asks this instead of writing a drop down.
 *
 * @param x World x. Clamped to the room, so a caller outside the walls gets the
 *   springing rather than a NaN from the square root.
 * @returns The ceiling height at that x, between `WALL_HEIGHT` and
 *   `CEILING_HEIGHT`.
 */
export function vaultHeightAt(x: number): number {
  if (VAULT_RISE <= 0) return WALL_HEIGHT

  const offset = Math.min(ROOM_HALF_WIDTH, Math.abs(x - ROOM_MID_X))

  return VAULT_CENTER_Y + Math.sqrt(VAULT_RADIUS * VAULT_RADIUS - offset * offset)
}

/**
 * The vault's ribs: raised mouldings around sunken panels, which is what a
 * coffer actually reads as from underneath.
 *
 * Modelled as ribs rather than as coffer boxes on purpose. Panels are shading
 * and belong in the texture; ribs are silhouette and have to be geometry. The
 * difference is twenty-one meshes against a hundred and twenty for the same
 * picture.
 */
export const RIB_SPACING_Z = 1.6
export const RIB_COUNT_ACROSS = 9

/**
 * Where the neon coving runs: along the springing on both long walls.
 *
 * It used to run *across* the room on the two short walls, which put it on the
 * wall the camera faces and on the wall behind it — the two walls a player
 * walking the length of the room spends the least time looking at. On the long
 * walls it runs away from the viewer down the whole room, which is what the
 * reference does and what makes the vault read as lit from its own edges.
 *
 * Two lines, a hand apart: the house colour and a cold one. One line reads as a
 * strip light; two read as neon.
 */
export const COVING_X: readonly number[] = [ROOM.minX + 0.08, ROOM.maxX - 0.08]
export const COVING_Y = WALL_HEIGHT - 0.18
export const COVING_GAP = 0.16

/* -------------------------------------------------------------- the court */

/**
 * The water court: the waterfall wall, its basin, and the coping round it.
 *
 * A footprint rather than a set of meshes because it is three things at once —
 * what the pool is drawn to, what the player is kept out of, and what the walk
 * limit at the far end is derived from. Two of those used to be able to
 * disagree silently: the strip could be walked six units past the last thing
 * there was to look at for exactly that reason.
 *
 * Centred on `AISLE_CENTER_X`, so it is straight ahead through the door.
 */
export const WATER_COURT: Footprint = { minX: -7.5, maxX: 0.5, minZ: ROOM.minZ, maxZ: -3.2 }

/** Height of the water's surface, and of the coping that rings it. */
export const POOL_LEVEL = 0.26
export const POOL_RIM_HEIGHT = 0.42

/**
 * The sheet of falling water on the back wall.
 *
 * Inset from the court so the basin is wider than what lands in it, which is
 * what makes the spill read as spreading rather than as a slab dropped in a
 * slot.
 *
 * Neither number is a taste decision. The width is held by
 * `waterfallSubtendedAngle` and the top by `waterfallHeadroom` — and the top is
 * *not* derived from `WALL_HEIGHT`, deliberately, because the ceiling is not
 * what crops it. The frame is. A lip hung two metres under an eight-metre
 * ceiling was still a metre above the top of the screen.
 */
export const WATERFALL_WIDTH = 7.0
export const WATERFALL_TOP = 5.6

/** The polished stone the water runs down, which is wider than the water. */
export const CASCADE_WALL_WIDTH = WATER_COURT.maxX - WATER_COURT.minX

/* ----------------------------------------------------------- the colonnade */

/**
 * Gold columns down both long walls.
 *
 * On the *wall's* rhythm, and held off the floor's: the strip already paid for
 * mixing the two, with a colonnade laid out on the towers' spacing putting a
 * pillar squarely in front of all three venue doors. Everything that stands on
 * this floor goes through `clearsFloor` before it is drawn, and the columns are
 * the first callers.
 */
export const COLUMN_RADIUS = 0.42
export const COLUMN_INSET = 0.9
export const COLUMN_X: readonly number[] = [ROOM.minX + COLUMN_INSET, ROOM.maxX - COLUMN_INSET]
export const COLUMN_Z: readonly number[] = [-6.2, -2.4, 1.4, 5.2, 9.0]

/** Every column on the floor, as flat (x, z) pairs. */
export const COLUMNS: readonly (readonly [number, number])[] = COLUMN_X.flatMap((x) =>
  COLUMN_Z.map((z) => [x, z] as const),
)

/**
 * The inside face of the colonnade — where the open floor actually ends.
 *
 * One number, used by the walk limit *and* by everything laid on the floor. The
 * strip's lesson was that a walk limit and the last thing there is to walk past
 * must not be two unrelated constants; the corollary here is that the rug and
 * the walk limit must not be either, or the player is stopped standing on bare
 * stone with the carpet ending a metre short of their feet.
 */
export const COLONNADE_INNER_X = {
  min: COLUMN_X[0]! + COLUMN_RADIUS,
  max: COLUMN_X[1]! - COLUMN_RADIUS,
} as const

/**
 * The balcony that turns one storey into two.
 *
 * It oversails the long walls only — running it round the far wall would put a
 * brass rail across the top of the waterfall, which is the one thing in the
 * room the eye is supposed to go to.
 */
export const MEZZANINE_HEIGHT = 4.1
export const MEZZANINE_DEPTH = 1.9

/* --------------------------------------------------------------- the aisle */

/**
 * The marble runner from the door to the water.
 *
 * Derived from the gap the tables leave rather than chosen: a runner wide
 * enough to look like one and laid down the middle of the room by eye would run
 * under the craps rail, and the first thing anybody would notice is marble
 * showing through a table. The tables decide where the aisle is; the aisle
 * never decides where the tables are.
 */
export const AISLE_MIN_X = TABLE_FOOTPRINTS[TableId.Blackjack].maxX
export const AISLE_MAX_X = TABLE_FOOTPRINTS[TableId.Craps].minX
export const AISLE_CENTER_X = (AISLE_MIN_X + AISLE_MAX_X) / 2
export const AISLE_WIDTH = AISLE_MAX_X - AISLE_MIN_X

/**
 * How much polished stone flanks the marble runner.
 *
 * The reference's walkway is about three metres of hard floor — stone, marble,
 * stone — and that does not fit here, because its tables stand further apart
 * than ours do. The gap between our two is `AISLE_WIDTH`, and the marble wants
 * all of it.
 *
 * So this is not a width anybody chose. It is what is left between the aisle's
 * edge and the nearest table's *actual* body: the footprints are padded by a
 * couple of hand-widths so the player is stopped before they walk into a
 * dealer, and a reveal of stone can live in that padding without ever showing
 * under a table. Any wider and a rug stops short of the table standing on it,
 * which reads as a rendering fault rather than a layout one.
 *
 * The reference's band structure still arrives, from the *ends* of the rugs
 * rather than their sides: the floor is stone across its full width from the
 * door to the near rug and from the far rug to the pool.
 */
export const AISLE_MARGIN = 0.2

/* ------------------------------------------------------------------- rugs */

/**
 * The two carpet fields, one per table.
 *
 * Derived, not placed. A rug laid by eye is a rug a table ends up half on, and
 * "half on the carpet, half on the stone" is the kind of thing that looks like
 * a rendering bug rather than a layout one. Each field starts where the aisle's
 * stone margin ends and runs out to the colonnade, and its depth covers its own
 * table's footprint with a margin for the stools.
 *
 * Ordered to match `TABLE_IDS`, so the renderer can pair them up.
 */
export const RUG_COLONNADE_INSET = 0.55

export const CARPET_FIELDS: Record<TableId, Footprint> = {
  [TableId.Blackjack]: {
    minX: COLONNADE_INNER_X.min + RUG_COLONNADE_INSET,
    maxX: AISLE_MIN_X - AISLE_MARGIN,
    minZ: TABLE_FOOTPRINTS[TableId.Blackjack].minZ - 1.5,
    maxZ: TABLE_FOOTPRINTS[TableId.Blackjack].maxZ + 2.6,
  },
  [TableId.Craps]: {
    minX: AISLE_MAX_X + AISLE_MARGIN,
    maxX: COLONNADE_INNER_X.max - RUG_COLONNADE_INSET,
    minZ: TABLE_FOOTPRINTS[TableId.Craps].minZ - 1.5,
    maxZ: TABLE_FOOTPRINTS[TableId.Craps].maxZ + 2.6,
  },
}

/* ---------------------------------------------------------------- greenery */

/** Potted palms, at the four corners of the court where the light pools. */
export const PALMS: readonly (readonly [number, number])[] = [
  [WATER_COURT.minX - 1.1, WATER_COURT.maxZ - 0.4],
  [WATER_COURT.maxX + 1.1, WATER_COURT.maxZ - 0.4],
  [WATER_COURT.minX - 1.1, WATER_COURT.minZ + 1.6],
  [WATER_COURT.maxX + 1.1, WATER_COURT.minZ + 1.6],
]

/** How much floor a palm takes up, for `clearsFloor`. */
export const PALM_RADIUS = 0.62

/**
 * Where the player may walk — the room, inset so they never touch a wall.
 *
 * The strip clamps rather than collides and so does this; the difference is
 * that a room has things in the middle of it, which `TABLE_FOOTPRINTS` and
 * `WATER_COURT` cover.
 *
 * The sides are set by the colonnade rather than by the wall. A limit measured
 * off the plaster lets the player stand inside a column, and a column you can
 * stand inside is a column that is not there.
 */
export const WALK_BOUNDS = {
  minX: COLONNADE_INNER_X.min + 0.35,
  maxX: COLONNADE_INNER_X.max - 0.35,
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

/* ---------------------------------------------------------------- cameras */

/**
 * The trailing camera's seat on its orbit, as the walking scene sets it.
 *
 * These numbers used to live as literals in `CasinoInterior.tsx`, which was
 * fine while nothing else needed to know them. It stopped being fine the moment
 * a piece of geometry had to be sized to be *visible* from here: a camera
 * constant and the thing it has to see, kept in two files, is precisely the
 * disagreement no later reader thinks to check for.
 *
 * The pitch was 0.42, which looked down at the floor from just above the
 * player's head. That was the right seat for a room whose ceiling was two
 * metres above a pendant and whose only content was on tables. In a room with a
 * two-storey waterfall at the end of it, it framed the carpet: everything above
 * about `y = 1.5` on the back wall was off the top of the screen, so most of
 * the cascade was rendering every frame into nobody's view. `entranceView`
 * holds it now.
 *
 * `lookHeight` is shared with `WalkingPlayer` rather than copied — see
 * `src/world/camera.ts`.
 */
export const WALK_CAMERA = {
  distance: 6.0,
  pitch: 0.14,
  lookHeight: CAMERA_LOOK_HEIGHT,
} as const

/**
 * Where the camera actually sits when the player walks in, and what it sees.
 *
 * The orbit puts it behind and above the spawn, and then `CAMERA_BOUNDS` pulls
 * it back inside the room — which at this depth it genuinely does, so a naive
 * "spawn plus distance" would be about two metres out.
 *
 * @returns The camera position and the point it looks at, both world space.
 */
export function entranceCamera(): {
  readonly position: readonly [number, number, number]
  readonly target: readonly [number, number, number]
} {
  const { distance, pitch, lookHeight } = WALK_CAMERA
  const [spawnX, , spawnZ] = ENTRANCE

  // Yaw is zero on arrival — the player faces -Z and the camera sits behind
  // them, which on this axis is straight back along +Z.
  const horizontal = Math.cos(pitch) * distance

  return {
    position: [
      clamp(spawnX, CAMERA_BOUNDS.minX, CAMERA_BOUNDS.maxX),
      Math.min(lookHeight + Math.sin(pitch) * distance, CAMERA_BOUNDS.maxY),
      clamp(spawnZ + horizontal, CAMERA_BOUNDS.minZ, CAMERA_BOUNDS.maxZ),
    ],
    target: [spawnX, lookHeight, spawnZ],
  }
}

/**
 * How wide the waterfall is across the entrance view, in radians.
 *
 * The same measure as the shop's mirror, for the same reason: the room is
 * eighteen metres deep and the hero of it stands at the far end, so its size in
 * the world says nothing about whether anyone will see it.
 *
 * On its own this is *not enough*, and the first version of this room proved
 * it: the waterfall passed here at 22.6 degrees while more than half of it sat
 * above the top of the screen. Width and framing are two different questions —
 * see `waterfallHeadroom`.
 *
 * @returns The angle the waterfall's two vertical edges subtend at the camera.
 */
export function waterfallSubtendedAngle(): number {
  const { position } = entranceCamera()
  const [cx, cy, cz] = position

  const midHeight = (WATERFALL_TOP + POOL_LEVEL) / 2

  const toEdge = (edgeX: number): readonly [number, number, number] => [
    edgeX - cx,
    midHeight - cy,
    ROOM.minZ - cz,
  ]

  const left = toEdge(AISLE_CENTER_X - WATERFALL_WIDTH / 2)
  const right = toEdge(AISLE_CENTER_X + WATERFALL_WIDTH / 2)

  const dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
  const lengths = Math.hypot(...left) * Math.hypot(...right)

  return Math.acos(Math.min(1, Math.max(-1, dot / lengths)))
}

/**
 * How far the top of the frame clears the top of the waterfall, in metres.
 *
 * Measured where it matters — on the back wall, from the entrance seat, through
 * the actual frustum. The camera looks *down* at the player, so the top edge of
 * the view is the play camera's half-angle above that tilted axis, and at
 * seventeen metres a couple of degrees is a couple of metres of wall.
 *
 * Negative means the cascade is being drawn off the top of the screen, which is
 * exactly what shipped in the first pass and exactly what no width measurement
 * could have told anybody.
 *
 * @returns Metres of wall visible above `WATERFALL_TOP`. Negative if cropped.
 */
export function waterfallHeadroom(): number {
  const { position, target } = entranceCamera()
  const [, cameraY, cameraZ] = position
  const [, targetY, targetZ] = target

  // How far below horizontal the view axis points.
  const tilt = Math.atan2(cameraY - targetY, cameraZ - targetZ)
  const halfFov = ((PLAY_FOV / 2) * Math.PI) / 180

  const toWall = cameraZ - ROOM.minZ
  const topOfFrame = cameraY + toWall * Math.tan(halfFov - tilt)

  return topOfFrame - WATERFALL_TOP
}

/* ------------------------------------------------------------- predicates */

/**
 * Whether something standing on the floor is clear of everything already there.
 *
 * The furniture equivalent of `clearsDoorways` on the strip, and here for the
 * same reason it is: a column drawn as decoration rather than as an object with
 * a footprint is a column that ends up in front of a door.
 *
 * @param x World x of the thing's centre.
 * @param z World z of the thing's centre.
 * @param radius How much floor it occupies.
 * @returns True when it fouls no table, sit spot, door or the water court.
 */
export function clearsFloor(x: number, z: number, radius: number): boolean {
  const spread: Footprint = {
    minX: x - radius,
    maxX: x + radius,
    minZ: z - radius,
    maxZ: z + radius,
  }

  if (footprintsOverlap(spread, WATER_COURT)) return false

  for (const table of TABLE_IDS) {
    if (footprintsOverlap(spread, TABLE_FOOTPRINTS[table])) return false
  }

  /*
   * Every place a player stands to be offered a seat, not just one per table.
   * Blackjack has five of them now, and a palm in front of the third-base stool
   * is exactly the bug this function exists to catch.
   */
  for (let seat = 0; seat < BLACKJACK_SEAT_COUNT; seat++) {
    const [standX, , standZ] = blackjackStandSpot(seat)
    if (Math.hypot(standX - x, standZ - z) < BLACKJACK_SEAT_RADIUS + radius) return false
  }

  if (crapsPromptGap(x, z) < CRAPS_PROMPT.radius + radius) return false

  const [doorX, , doorZ] = EXIT_DOOR
  return Math.hypot(doorX - x, doorZ - z) >= EXIT_RADIUS + radius
}

/** Clamps to a range, so `entranceCamera` need not import three. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Whether a point is inside a footprint — i.e. inside a table. */
export function isInside(footprint: Footprint, x: number, z: number): boolean {
  return x > footprint.minX && x < footprint.maxX && z > footprint.minZ && z < footprint.maxZ
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
}
