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

import { RECEPTIONIST_APPEARANCE, resolveAppearance } from '../character/appearance'
import {
  seatedAnklePosition,
  seatedCrownY,
  SeatedLegs,
} from '../character/proportions'
import { fovToFit, subtendedAngle } from '../world/camera'
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

/**
 * The footrest, in the chair's own space.
 *
 * Here rather than in the component because the donor's legs have to land on it,
 * and a piece of furniture and the pose that uses it are exactly the "two
 * constants in two files that quietly disagree" case. They did disagree: the
 * seated pose is authored for a casino stool, where the shins hang straight
 * down, and used unchanged on a recliner it ran both legs through the cushion.
 */
export const FOOTREST_CENTER: readonly [number, number, number] = [0, 0.38, 0.62]
export const FOOTREST_SIZE: readonly [number, number, number] = [0.62, 0.15, 0.6]
/** Raked up a little at the far end, as an extended footrest is. */
export const FOOTREST_TILT = 0.12

/** The centre of the footrest's top face, as `[z, y]` in the chair's space. */
function footrestTopCenter(): readonly [number, number] {
  const [, centreY, centreZ] = FOOTREST_CENTER
  const half = FOOTREST_SIZE[1] / 2

  // The tilt carries the top face forward as well as up.
  return [centreZ + half * Math.sin(FOOTREST_TILT), centreY + half * Math.cos(FOOTREST_TILT)]
}

/** How high the footrest's top face is at a given z, in the chair's space. */
export function footrestSurfaceY(z: number): number {
  const [topZ, topY] = footrestTopCenter()
  return topY + (z - topZ) * Math.tan(FOOTREST_TILT)
}

/**
 * Whether a point rests on the footrest.
 *
 * The sixth of these predicates, and the first about a *pose* rather than a
 * prop. Paired, like the others, with a test that feeds it a point it must
 * reject — the pose this replaced put the ankle a quarter of a metre below the
 * cushion, so a predicate that said yes to that would prove nothing.
 *
 * @param z Forward position in the chair's own space.
 * @param y Height in the same space.
 * @param tolerance How far off the surface still counts as resting on it.
 */
export function isOnFootrest(z: number, y: number, tolerance = 0.06): boolean {
  const [topZ] = footrestTopCenter()
  const reach = (FOOTREST_SIZE[2] / 2) * Math.cos(FOOTREST_TILT)

  if (z < topZ - reach || z > topZ + reach) return false
  return Math.abs(y - footrestSurfaceY(z)) <= tolerance
}

/**
 * How far forward on the seat the donor's hips sit.
 *
 * Was 0.1, which put a fully extended leg past the end of the footrest. Pulled
 * back so every silhouette's ankle lands on it with room to spare — the
 * feminine figure has the longest legs and is the one that sets this.
 */
export const SEATED_DONOR_Z = 0.02

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

/**
 * The same seat for a phone held upright.
 *
 * Further out along +x and a little higher, and deliberately *not* further
 * along +z: the fourth recliner sits at `CHAIR_Z[3]`, and pulling back on the
 * camera's own axis would put the shot for that one chair inside the far wall.
 * The room is wide and shallow, so the width is where the distance is.
 *
 * The offset does two jobs at once and the second is easy to miss — the draw
 * line has to keep crossing the view rather than pointing down it, which is the
 * bug that cost two attempts here. `clinicRoutine.test.ts` asserts that from
 * this camera as well as the landscape one.
 */
export const PORTRAIT_CHAIR_CAMERA_OFFSET: readonly [number, number, number] = [5.8, 1.9, 1.72]

/**
 * The chair shot's field of view, as composed for a landscape window.
 *
 * Out here with the offset it belongs to, for the reason the offset is out
 * here: what this camera can see is a fact about the camera *and* the shape of
 * the window, and only one of those was ever written down.
 */
export const CHAIR_FOV = 44

/**
 * Where the chair camera sits, in world space.
 *
 * @param index Which recliner.
 * @param portrait Whether to use the narrow-screen seat.
 */
export function chairCameraAt(
  index: number,
  portrait = false,
): readonly [number, number, number] {
  const [x, y, z] = portrait ? PORTRAIT_CHAIR_CAMERA_OFFSET : CHAIR_CAMERA_OFFSET
  return [CHAIR_X + x, y, (CHAIR_Z[index] ?? 0) + z]
}

/** What it is aimed at, in world space. */
export function chairCameraTarget(index: number): readonly [number, number, number] {
  const [x, y, z] = CHAIR_CAMERA_TARGET
  return [CHAIR_X + x, y, (CHAIR_Z[index] ?? 0) + z]
}

/**
 * How high above the floor the donor's head reaches, reclined.
 *
 * Only the framing uses this — the figure is drawn from `proportions.ts` — but
 * a shot sized against the chair alone frames a chair with somebody's head off
 * the top of it.
 */
const RECLINED_HEIGHT = 1.5

/**
 * What the chair shot has to hold: the recliner, the donor on it, the tray
 * their arm rests on, and the bag the line runs to.
 *
 * The bag and the tray are the two ends of the draw line, so a shot that holds
 * both holds the whole procedure — which is the only thing happening in this
 * room and the only reason anybody is looking at it.
 *
 * @param index Which recliner.
 * @returns The corners of the box, world space.
 */
export function chairSubject(index: number): readonly (readonly [number, number, number])[] {
  const [x, , z] = chairPosition(index)

  const corners: (readonly [number, number, number])[] = []
  for (const cornerX of [x - CHAIR_FOOTPRINT_HALF_X, x + CHAIR_FOOTPRINT_HALF_X]) {
    for (const cornerZ of [z - CHAIR_FOOTPRINT_HALF_Z, z + CHAIR_FOOTPRINT_HALF_Z]) {
      corners.push([cornerX, 0, cornerZ], [cornerX, RECLINED_HEIGHT, cornerZ])
    }
  }

  return [...corners, trayAt(index), ivBagAt(index)]
}

/**
 * How wide that subject sits across the chair shot, in radians.
 *
 * @param index Which recliner.
 * @param portrait Whether to measure from the narrow-screen seat.
 */
export function chairSubtendedAngle(index: number, portrait = false): number {
  return subtendedAngle(chairCameraAt(index, portrait), chairSubject(index))
}

/**
 * The chair camera's field of view for a viewport shape.
 *
 * `CHAIR_FOV` unchanged on any landscape window, asserted rather than assumed.
 *
 * @param aspect Viewport width divided by height.
 * @returns A vertical field of view, in degrees.
 */
export function chairFov(aspect: number): number {
  // Every recliner is the same shot translated, so any index measures it.
  const portrait = aspect < 1
  return fovToFit(chairSubtendedAngle(0, portrait), aspect, CHAIR_FOV)
}

/** The check-in desk, by the door. */
export const DESK: readonly [number, number, number] = [3.4, 0, 3.4]
export const DESK_WIDTH = 2.6
export const DESK_DEPTH = 0.7
export const DESK_HEIGHT = 1.05

/**
 * The transaction counter, standing proud on the visitor's side.
 *
 * A reception desk is two heights: a working surface for whoever is behind it
 * and a raised ledge for whoever is in front, which is what hides the clutter
 * and gives you somewhere to sign. Without it the desk is a single slab of
 * laminate at one height, which is what it was and why it read as a crate.
 */
export const COUNTER_RISE = 0.22
export const COUNTER_DEPTH = 0.26
/** The ledge's working face, which is what anybody behind it has to clear. */
export const COUNTER_TOP_Y = DESK_HEIGHT + COUNTER_RISE + 0.045

/**
 * Where the receptionist's footring goes, and how high she sits.
 *
 * This desk is counter height, not desk height, so she is on a draughtsman's
 * chair rather than a task chair — and the thing that makes one of those work is
 * the ring her feet rest on. Without it she dangled 18 cm over her own floor,
 * which is what the box-and-cone under her looked like.
 *
 * Lowering her instead was tried and is worse: at a chair that puts her feet on
 * the floor, her head clears this counter by two centimetres and the person you
 * have come to talk to is a hairstyle behind a worktop. `seatedHipY` was right
 * all along; nothing was under her feet.
 */
export function receptionFootringY(): number {
  const { silhouette } = resolveAppearance(RECEPTIONIST_APPEARANCE)
  const [, ankleY] = seatedAnklePosition(silhouette, SeatedLegs.Hanging)
  return ankleY
}

/** How high the top of her head sits when she is in that chair. */
export function receptionCrownY(): number {
  return seatedCrownY(resolveAppearance(RECEPTIONIST_APPEARANCE).silhouette)
}

/** Which side of the desk a visitor stands on: toward the door, so +z. */
export const DESK_FRONT_Z = DESK[2] + DESK_DEPTH / 2

/**
 * Where the receptionist sits, tucked in behind the desk.
 *
 * Derived from the desk's own back edge rather than typed. It was typed, at
 * `DESK[2] - 0.85`, which left her sitting half a metre clear of a desk she is
 * supposed to be working at — close enough to read as "near the desk" in the
 * layout and, on screen, as a woman on a stool in the middle of the floor.
 */
export const RECEPTION_CHAIR_GAP = 0.16
/**
 * Along the desk, she sits behind her own terminal.
 *
 * `TERMINAL_OFFSET_X` is where the monitor and keyboard go; putting her at the
 * desk's centre instead left her turned toward a screen most of a metre away,
 * reaching for a keyboard she was not sitting at.
 */
export const TERMINAL_OFFSET_X = -0.6
export const RECEPTION_CHAIR: readonly [number, number] = [
  DESK[0] + TERMINAL_OFFSET_X + 0.15,
  DESK[2] - DESK_DEPTH / 2 - RECEPTION_CHAIR_GAP,
]

/**
 * Waiting chairs against the right-hand wall, as one beam bench.
 *
 * Moved back against the wall from 4.9. Standing free in the middle of the
 * walkable strip was only survivable while they were not obstacles; now that
 * they are, anything not flush with the wall is a bollard in the middle of the
 * floor.
 */
export const WAITING_X = 5.5
export const WAITING_Z: readonly number[] = [-1.8, -1.1, -0.4, 0.3]
/** Seat pan front to back, which is the bench's depth into the room. */
export const BENCH_DEPTH = 0.62
/** How far past the end seats the beam runs. */
export const BENCH_OVERHANG = 0.28

/**
 * The vending machine, flush against the same wall.
 *
 * Its x is derived from the wall and the cabinet rather than typed, so a deeper
 * cabinet stays against the wall instead of growing into the room.
 */
export const VENDING_DEPTH = 0.86
export const VENDING_WIDTH = 1.05
export const VENDING_HEIGHT = 1.92
export const VENDING: readonly [number, number, number] = [
  ROOM.maxX - VENDING_DEPTH / 2,
  0,
  1.8,
]

/**
 * The suspended ceiling, as a grid of acoustic tile.
 *
 * Both dimensions divide the room exactly — 12 / 0.6 and 11 / 0.55 — because a
 * grid that does not leaves a row of slivers against one wall, and a sliver
 * reads as a seam in the render rather than as a mistake in the numbers.
 */
export const CEILING_TILE = { x: 0.6, z: 0.55 } as const
export const CEILING_COLUMNS = Math.round((ROOM.maxX - ROOM.minX) / CEILING_TILE.x)
export const CEILING_ROWS = Math.round((ROOM.maxZ - ROOM.minZ) / CEILING_TILE.z)

/** A troffer is four tiles long and one wide, as a 600x2400 fitting is. */
export const TROFFER_TILES_X = 4
export const TROFFER_LENGTH = CEILING_TILE.x * TROFFER_TILES_X
export const TROFFER_WIDTH = CEILING_TILE.z

/**
 * Which tiles the fittings are let into, as `[column, row]` of the tile at each
 * troffer's low-x end.
 *
 * Two columns and three rows. Fewer rows left the end recliner at z -3 lit from
 * a metre and a half away, and this room's whole character is light that arrives
 * evenly and without mercy.
 */
export const TROFFER_TILES: readonly (readonly [number, number])[] = [
  [3, 2],
  [13, 2],
  [3, 9],
  [13, 9],
  [3, 16],
  [13, 16],
]

/** The centre of a ceiling tile, in world space, as `[x, z]`. */
export function ceilingTileCenter(column: number, row: number): readonly [number, number] {
  return [
    ROOM.minX + (column + 0.5) * CEILING_TILE.x,
    ROOM.minZ + (row + 0.5) * CEILING_TILE.z,
  ]
}

/**
 * Where each light fitting sits, derived from the grid it is let into.
 *
 * Derived rather than typed because the fittings and the tiles have to agree.
 * Three hand-set z values and a tiled ceiling are two unrelated sets of numbers:
 * they look fine apart and put every fitting across a tile seam together.
 */
export function troffers(): readonly (readonly [number, number])[] {
  return TROFFER_TILES.map(([column, row]) => {
    const [, z] = ceilingTileCenter(column, row)
    /*
     * The fitting spans `TROFFER_TILES_X` tiles starting at `column`, so its
     * centre is that many half-tiles along — on a tile seam for an even span,
     * which is what a real fitting does.
     */
    return [ROOM.minX + (column + TROFFER_TILES_X / 2) * CEILING_TILE.x, z] as const
  })
}

/** Skirting board at the wall/floor join. */
export const SKIRTING_HEIGHT = 0.12
export const SKIRTING_DEPTH = 0.03

/** The walls that carry something. */
export enum ClinicWall {
  /** Behind the recliners, at `ROOM.minX`. */
  Left = 'left',
  /** The one with the door in it, at `ROOM.maxZ`. */
  Back = 'back',
  /** Behind the desk and the waiting bench, at `ROOM.minZ`. */
  Front = 'front',
}

export interface WallProp {
  id: string
  wall: ClinicWall
  /** Position along the wall: z on the left wall, x on the back wall. */
  along: number
  /** Height of the prop's centre off the floor. */
  y: number
  /** Extent along the wall. */
  width: number
  /** Extent up the wall. */
  height: number
}

/**
 * Everything hung on a wall, in one list so a test can hold all of it at once.
 *
 * The colonnade on the strip is why this is a list rather than three positions
 * written where they happen to be drawn: things laid out on the room's rhythm
 * and things laid out on the door's rhythm collide, and a later reader has no
 * reason to think of checking one against the other.
 */
export const WALL_PROPS: readonly WallProp[] = [
  { id: 'cross', wall: ClinicWall.Left, along: 0, y: 2.2, width: 0.78, height: 0.78 },
  { id: 'clipboard', wall: ClinicWall.Back, along: 1.9, y: 1.55, width: 0.28, height: 0.38 },
  { id: 'switch', wall: ClinicWall.Back, along: -1.55, y: 1.25, width: 0.12, height: 0.16 },
  /*
   * The desk side had nothing on it at all above waist height, and a wall with
   * nothing on it is what reads as an untextured box however well it is shaded.
   * Both of these sit over the waiting bench and the desk, on the far wall the
   * player faces on the way in.
   */
  { id: 'noticeboard', wall: ClinicWall.Front, along: 3.1, y: 1.75, width: 1.15, height: 0.82 },
  { id: 'clock', wall: ClinicWall.Front, along: 0.6, y: 2.15, width: 0.34, height: 0.34 },
]

/** Where a wall prop hangs, in world space, standing off its wall by `standoff`. */
export function wallPropPosition(
  prop: WallProp,
  standoff = 0.02,
): readonly [number, number, number] {
  switch (prop.wall) {
    case ClinicWall.Left:
      return [ROOM.minX + standoff, prop.y, prop.along]
    case ClinicWall.Back:
      return [prop.along, prop.y, ROOM.maxZ - standoff]
    case ClinicWall.Front:
      return [prop.along, prop.y, ROOM.minZ + standoff]
  }
}

/** Which way a prop on a given wall faces, as a y rotation into the room. */
export function wallPropFacing(wall: ClinicWall): number {
  switch (wall) {
    case ClinicWall.Left:
      return Math.PI / 2
    case ClinicWall.Back:
      return Math.PI
    case ClinicWall.Front:
      return 0
  }
}

/** The span a wall runs along, as `[low, high]` in that wall's own axis. */
export function wallExtent(wall: ClinicWall): readonly [number, number] {
  return wall === ClinicWall.Left ? [ROOM.minZ, ROOM.maxZ] : [ROOM.minX, ROOM.maxX]
}

export const EXIT_DOOR: readonly [number, number, number] = [0, 0, 6.7]

/**
 * How big the doorway is drawn.
 *
 * Here rather than written into the `<ExitDoor>` call, because the wall behind
 * it now carries things and a wall prop and a door are laid out on different
 * rhythms. That is exactly the collision the strip's colonnade was: a pillar on
 * every tower's centre line and a door on every tower's centre line, drawn in
 * two files that each looked right.
 */
export const EXIT_DOOR_WIDTH = 1.8
export const EXIT_DOOR_HEIGHT = 2.5
/**
 * Half the width of floor-to-head obstruction the doorway makes, frame included.
 *
 * `ExitDoor` puts a 0.16 jamb either side of the opening and hangs a 1.05-wide
 * sign over it, so the framed width is what a neighbour has to clear rather than
 * the opening. The margin on top is slack: a prop that clears the door by a
 * hand's width does not look deliberate even when it technically fits.
 */
export const EXIT_DOOR_CLEARANCE = EXIT_DOOR_WIDTH / 2 + 0.16 + 0.3
/**
 * Just the doorway, and no more.
 *
 * This was 3, which was sized for an exit that fired on contact: a big circle
 * was how you made sure a player heading for the door actually hit it. It also
 * reached 3.6 to the end recliner's sit spot, close enough that walking over to
 * that chair put you back on the street instead — and, being the nearer target
 * on the way, took the chair's own prompt down with it.
 *
 * As a prompt the radius only has to cover where somebody stands to use the
 * door, so it is now in line with the casino's 1.6. The door sits at z 6.7 and
 * the player can walk to 6.5, so it is still trivially reachable;
 * `venueDoors.test.ts` holds both ends of that.
 */
export const EXIT_RADIUS = 1.8

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

/** Where the vending machine stands. */
export function vendingFootprint(): Footprint {
  return {
    minX: VENDING[0] - VENDING_DEPTH / 2,
    maxX: VENDING[0] + VENDING_DEPTH / 2,
    minZ: VENDING[2] - VENDING_WIDTH / 2,
    maxZ: VENDING[2] + VENDING_WIDTH / 2,
  }
}

/** Where the waiting bench stands, end to end. */
export function benchFootprint(): Footprint {
  const first = WAITING_Z[0] ?? 0
  const last = WAITING_Z[WAITING_Z.length - 1] ?? 0

  return {
    minX: WAITING_X - BENCH_DEPTH / 2,
    maxX: WAITING_X + BENCH_DEPTH / 2,
    minZ: first - BENCH_OVERHANG,
    maxZ: last + BENCH_OVERHANG,
  }
}

/**
 * What the player is kept out of.
 *
 * The machine and the bench are here because they were not, and both stood
 * inside `WALK_BOUNDS`: the player walked through a 1.9 m vending machine and
 * through four occupied seats, in the one room that exists to be looked at
 * closely. Nothing on screen said so — a figure passing through a solid is only
 * wrong in motion, and every capture of this room was a still.
 */
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
      // The transaction counter stands proud on the visitor's side, so the desk
      // is deeper than its carcass. Walking through a ledge you are supposed to
      // be signing at is worse than walking through a plain desk.
      maxZ: DESK_FRONT_Z + COUNTER_DEPTH,
    },
    vendingFootprint(),
    benchFootprint(),
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
