/*
 * The strip's geometry, in world units.
 *
 * Pure and asserted, like `tableLayout.ts`, `shopLayout.ts`,
 * `storefrontLayout.ts`, `casinoFloorLayout.ts` and `clinicLayout.ts` before it.
 * All of this lived inline in `Strip.tsx`, which was fine while the street was a
 * road and eight boxes and stopped being fine the moment three separate things
 * had to agree about where a block starts.
 *
 * The thing that made a layout module necessary is `BLOCK_DEPTH`. The building
 * rows are spaced on it, the three venue doors sit on it, and the road markings
 * are painted on it — and until now none of that was written down anywhere. A
 * comment in `venues.ts` warned that a door's z "must land on a `BUILDING_ROWS`
 * entry or the venue gets a door with no marquee above it"; nothing checked, and
 * a door is one careless number away from a blank wall.
 */

import { VENUES } from '../world/venues'

/** Half-width of the reflective roadway. */
export const ROAD_HALF_WIDTH = 5

/** Inner face of the building facades; the sidewalk runs from the road to here. */
export const FACADE_X = 8.8

export const SIDEWALK_HEIGHT = 0.16

export const BUILDING_WIDTH = 7.2
export const BUILDING_DEPTH = 7

/**
 * The marquee band across a signed tower's facade.
 *
 * These were literals inside `Building.tsx`, which was fine while the marquee
 * was the only thing on that stretch of wall. The Golden Ace's porte-cochere
 * has to fit *under* it, so the two now have to agree — and a canopy sized
 * against a height copied into a second file is the disagreement this project
 * keeps paying for. `casinoFrontLayout.ts` derives its clearance from
 * `MARQUEE_BOTTOM_Y`.
 */
export const MARQUEE_CENTER_Y = 4.4
export const MARQUEE_WIDTH = BUILDING_DEPTH * 0.98
export const MARQUEE_HEIGHT = BUILDING_DEPTH * 0.245
export const MARQUEE_BOTTOM_Y = MARQUEE_CENTER_Y - MARQUEE_HEIGHT / 2
export const MARQUEE_TOP_Y = MARQUEE_CENTER_Y + MARQUEE_HEIGHT / 2
export const BUILDING_CENTER_X = FACADE_X + BUILDING_WIDTH / 2

/**
 * One block, front to back.
 *
 * The rhythm everything on the street is cut to: the towers step back by it, the
 * doors land on it, and the roadway's markings repeat on it, which is what puts
 * a pedestrian crossing outside every door without anyone keeping a second list
 * of where the doors are.
 */
export const BLOCK_DEPTH = 8

/**
 * Where a block's centre line falls, modulo `BLOCK_DEPTH`.
 *
 * Every row is at z ≡ 2. It has to be written down because the road texture's
 * offset is derived from it — a texture a few units out of phase puts the
 * crossings in the middle of the blocks and the doors between them.
 */
export const BLOCK_PHASE = 2

export interface BuildingRow {
  readonly z: number
  readonly leftHeight: number
  readonly rightHeight: number
}

/**
 * Fixed skyline.
 *
 * Hard-coded rather than randomised so the strip looks identical on every run —
 * a demo that reshuffles its skyline between takes is impossible to rehearse.
 */
export const BUILDING_ROWS: readonly BuildingRow[] = [
  { z: 10, leftHeight: 9, rightHeight: 13 },
  { z: 2, leftHeight: 15, rightHeight: 8 },
  { z: -6, leftHeight: 10, rightHeight: 17 },
  { z: -14, leftHeight: 18, rightHeight: 9 },
  { z: -22, leftHeight: 8, rightHeight: 14 },
  { z: -30, leftHeight: 16, rightHeight: 11 },
  { z: -38, leftHeight: 9, rightHeight: 19 },
  { z: -46, leftHeight: 13, rightHeight: 8 },
]

/** How far a tower's face stands from its row's centre line. */
const ROW_HALF_DEPTH = BUILDING_DEPTH / 2

/** A hair of pavement between the last tower's face and the kerb. */
const KERB_MARGIN = 0.5

/**
 * The cross street at each end, as the near kerb the strip runs up to.
 *
 * This is the whole answer to the ends of the world. The strip used to stop
 * being a street some way before it stopped being geometry: the last tower was
 * at z = -46, the player could walk to -52, and the road and both pavements then
 * ran on another thirty-eight units before ending in mid-air against open sky.
 * From down there it read as a runway to nowhere.
 *
 * Now each end is a junction. The pavement runs to a kerb, a cross street runs
 * away left and right into the haze, and a solid row of towers stands across it
 * looking back at you. You stop because there is a road in front of you, which
 * is a reason; you cannot see out of the world, because there is a building in
 * the way.
 */
export const CROSS_HALF_WIDTH = 4

const NORTH_ROW_Z = BUILDING_ROWS[0]?.z ?? 10
const SOUTH_ROW_Z = BUILDING_ROWS[BUILDING_ROWS.length - 1]?.z ?? -46

/** Near kerb of each cross street: where the strip's pavement stops. */
export const CROSS_NORTH_KERB = NORTH_ROW_Z + ROW_HALF_DEPTH + KERB_MARGIN
export const CROSS_SOUTH_KERB = SOUTH_ROW_Z - ROW_HALF_DEPTH - KERB_MARGIN

/** Centre line of each cross street's carriageway. */
export const CROSS_NORTH_Z = CROSS_NORTH_KERB + CROSS_HALF_WIDTH
export const CROSS_SOUTH_Z = CROSS_SOUTH_KERB - CROSS_HALF_WIDTH

/** How far a cross street runs to either side before the fog takes it. */
export const CROSS_REACH = 70

/**
 * Pavement between the cross street's far kerb and the closing block.
 *
 * It has two jobs beyond realism. Looking back up the street at dusk the
 * junction was a black band — wet asphalt with no neon over it to reflect —
 * under a wall of towers that appeared to be floating on it; a lit pavement in
 * front of the buildings is what puts them on the ground. And its width is what
 * sets the towers back: at four units they filled the upper half of the frame
 * and read as a cliff, which is the same complaint as the one this whole
 * junction exists to answer.
 */
export const CROSS_PAVEMENT = 9

/**
 * The wall of towers across each junction.
 *
 * Five wide rather than the strip's two, because these have to close the view
 * rather than line it: a gap between them is a hole straight out of the world,
 * which is the thing being fixed. Two rows deep so the skyline has somewhere to
 * recede to.
 */
export const END_BLOCK_X: readonly number[] = [-16, -8, 0, 8, 16]

/** The far kerb of a cross street: where its pavement begins. */
export function crossFarKerb(side: 1 | -1): number {
  return side > 0 ? CROSS_NORTH_Z + CROSS_HALF_WIDTH : CROSS_SOUTH_Z - CROSS_HALF_WIDTH
}

/**
 * The two rows of the closing block, derived from the pavement in front of it.
 *
 * Set back further than the first version, which put the towers five units past
 * the kerb: from the other end of the street they filled the upper half of the
 * frame and read as a cliff rather than as the next block along. Distance is
 * what makes them scenery.
 */
export function endBlockRows(side: 1 | -1): readonly number[] {
  const face = crossFarKerb(side) + side * CROSS_PAVEMENT
  return [face + side * ROW_HALF_DEPTH, face + side * (ROW_HALF_DEPTH + BLOCK_DEPTH)]
}

/**
 * Walkable bounds of the strip.
 *
 * Derived rather than typed in. The z limits are the kerbs, so the invisible
 * wall stands exactly where a visible one does — before this they were two
 * numbers with no relationship to anything, and the player was stopped six units
 * past the last thing there was to look at.
 */
export const STREET_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: CROSS_SOUTH_KERB,
  maxZ: CROSS_NORTH_KERB,
} as const

/** The strip's own roadway and pavements, as a span in z. */
export const STRIP_SPAN = {
  from: CROSS_SOUTH_KERB,
  to: CROSS_NORTH_KERB,
} as const

export const STRIP_LENGTH = STRIP_SPAN.to - STRIP_SPAN.from
export const STRIP_CENTER_Z = (STRIP_SPAN.to + STRIP_SPAN.from) / 2

/**
 * Whether a point is on the strip's own pavement or roadway.
 *
 * Paired, as every predicate here is, with a test that feeds it a point it must
 * reject — one that returns true everywhere would leave its whole suite passing
 * while proving nothing.
 */
export function isOnStrip(x: number, z: number): boolean {
  return (
    Math.abs(x) <= FACADE_X &&
    z >= STRIP_SPAN.from &&
    z <= STRIP_SPAN.to
  )
}

/** Whether a z falls on a block's centre line, and so carries a crossing. */
export function isBlockLine(z: number): boolean {
  return Math.abs(((z - BLOCK_PHASE) % BLOCK_DEPTH + BLOCK_DEPTH) % BLOCK_DEPTH) < 1e-6
}

/**
 * Where the roadway texture has to start so its crossings land on the blocks.
 *
 * The texture tiles once per `BLOCK_DEPTH` with a crossing painted across the
 * middle of the tile, so the offset is whatever puts a tile centre on a block
 * line. Getting this wrong is invisible until you notice every crossing is
 * outside a wall and every door opens onto plain tarmac.
 */
export function roadTextureOffset(): number {
  const tilesToFirstLine = (BLOCK_PHASE - STRIP_SPAN.from) / BLOCK_DEPTH
  // Half a tile, because the crossing is painted across the middle of one.
  return (((0.5 - tilesToFirstLine) % 1) + 1) % 1
}

/**
 * How much pavement a doorway keeps to itself.
 *
 * Palms and lamps are laid out on their own even rhythm, which takes no notice
 * of where the doors are — and the rhythms happened to collide: a palm stood
 * squarely in front of both the shop and the clinic, hiding the entrance you are
 * meant to be walking toward. Wider than the door trigger, so the approach is
 * clear as well as the door itself.
 */
export const DOORWAY_CLEARANCE = 3.5

/** Whether a piece of street furniture may stand here. */
export function clearsDoorways(x: number, z: number): boolean {
  return VENUES.every((venue) => {
    const [doorX, , doorZ] = venue.doorPosition
    return Math.hypot(x - doorX, z - doorZ) > DOORWAY_CLEARANCE
  })
}

/**
 * How far up and down the street a doorway needs kept clear of tall furniture.
 *
 * `DOORWAY_CLEARANCE` is a radius, and a radius is the wrong shape for this.
 * The play camera trails the player *along* the street, so what hides an
 * entrance is not something standing near it but something standing between it
 * and the camera — which is anything on the same pavement, up to the camera's
 * own trailing distance away. A seven-metre palm four units up-street passes
 * the radius check comfortably and fills the middle of the frame at the exact
 * moment the door prompt appears.
 *
 * Taken from `DEFAULT_DISTANCE` in `WalkingPlayer`, with a little over, because
 * that is literally how far back the camera sits.
 *
 * The rhythms cannot be re-phased out of this, which is why the rule has to
 * remove furniture rather than move it: doors fall every `BLOCK_DEPTH`, so
 * within one period nothing can be more than `BLOCK_DEPTH / 2` from a door, and
 * that is already inside the corridor. There is no offset that works.
 */
export const APPROACH_CLEARANCE = 7.6

/**
 * How tall something has to be before the corridor applies to it.
 *
 * Waist height, matching `APPROACH_CLEAR_HEIGHT` on the casino's own frontage.
 * A bench, a bollard or a rope is below the camera's line to the door and may
 * stand anywhere; a palm or a lamp column is not.
 */
export const APPROACH_TALL = 1.2

/**
 * Whether something of this height may stand here without hiding an entrance.
 *
 * Only applies on the venue's own side of the street — the camera and the
 * player are on the same pavement, so the far kerb never occludes anything.
 *
 * @param x World x. Its sign is the side of the street.
 * @param z World z.
 * @param height How tall the thing is.
 */
export function clearsApproach(x: number, z: number, height: number): boolean {
  if (height <= APPROACH_TALL) return true

  return VENUES.every((venue) => {
    const [doorX, , doorZ] = venue.doorPosition
    if (Math.sign(x) !== Math.sign(doorX)) return true

    return Math.abs(z - doorZ) > APPROACH_CLEARANCE
  })
}

export const PALM_ROW_Z: readonly number[] = [6, -2, -10, -18, -26, -34, -42]
export const LAMP_ROW_Z: readonly number[] = [4, -8, -20, -32, -44]

/**
 * How tall each kind of street furniture stands.
 *
 * Here rather than in the components because `clearsApproach` needs them: what
 * decides whether a prop may stand near a door is its height, and a height that
 * lives only inside the mesh that draws it cannot be asked. The lamp's was a
 * literal in `StreetProps.tsx`; the palms' are passed in from here.
 */
export const PALM_HEIGHT_LEFT = 6.4
export const PALM_HEIGHT_RIGHT = 7.1
export const LAMP_HEIGHT = 4.4

/**
 * The street-level colonnade: how far a column's centre stands out from the
 * tower's face, and where along the tower's depth the three of them fall.
 *
 * Here rather than in `Building.tsx` with the rest of the relief because the
 * colonnade is the only piece of it that shares the pavement with the doors —
 * and it was laid out on the tower's own rhythm, which is the same mistake the
 * palms and the lamps made. Every tower carries a column on its centre line,
 * and every venue door is on a tower's centre line, so a 3.4-metre column stood
 * squarely in front of all three entrances: splitting the shop's display window
 * and the clinic's blinds in half, and covering a third of the Golden Ace's lit
 * doorway. The canopy those columns hold up did the same to the signage — it
 * crosses the casino's marquee band and the bottom of both fascia signs.
 */
export const COLONNADE_OUT = 0.85
export const COLONNADE_OFFSETS: readonly number[] = [-0.34, 0, 0.34]

/**
 * Where a strip tower's colonnade columns stand, as world `[x, z]`.
 *
 * `Building` applies `COLONNADE_OUT` and `COLONNADE_OFFSETS` to its own width
 * and depth; every tower on the strip is `BUILDING_WIDTH` by `BUILDING_DEPTH`,
 * so these are the positions it draws.
 *
 * @param rowZ The tower's row, from `BUILDING_ROWS`.
 * @param side 1 for the towers on +X, -1 for those on -X.
 */
export function colonnadeColumns(rowZ: number, side: 1 | -1): readonly [number, number][] {
  const x = side * (BUILDING_CENTER_X - (BUILDING_WIDTH / 2 + COLONNADE_OUT))
  return COLONNADE_OFFSETS.map((offset) => [x, rowZ + BUILDING_DEPTH * offset])
}

/**
 * Whether this tower face carries a street-level colonnade at all.
 *
 * Derived rather than kept as a list of exempt rows, so a venue that moves to
 * another block takes its clearance with it. A tower whose colonnade would
 * stand in a doorway does not get one: at a venue the frontage *is* the street
 * level, and there is nowhere along a seven-metre tower to put the columns that
 * is not in front of the window, the door or the sign.
 */
export function hasColonnade(rowZ: number, side: 1 | -1): boolean {
  return colonnadeColumns(rowZ, side).every(([x, z]) => clearsDoorways(x, z))
}
