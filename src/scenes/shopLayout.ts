/*
 * The Gilded Hanger: a room, not a diorama.
 *
 * Matched to `art/refs/shop_interior.png` — a window platform of mannequins
 * along the front, a long lit jewellery case down one side, a tall lit shoe
 * cabinet down the other, a hat stand and a cane rack at the back, and a neon
 * mirror over a low round fitting plinth.
 *
 * Pulled out of the scene component for the same reason `tableLayout.ts` was:
 * these anchors were derived by hand, and hand-derived geometry on this project
 * has been wrong more often than the game rules have. `isOnShopFloor` is the
 * shop's `isOnFelt` — a case half inside the wall reads as a rendering glitch
 * and is invisible until someone walks past it.
 *
 * This file used to describe a room nobody could enter: `ENTRANCE` and
 * `isOnShopFloor` were exported, tested, and wired to nothing, because the shop
 * was a fixed camera and a list. Everything a walkable room needs is here now,
 * on the shape `clinicLayout.ts` settled on.
 *
 * All coordinates are world space. Negative z is the back wall and the mirror;
 * positive z is the street door and the window.
 */

import { CATALOG } from '../character/catalog'
import type { Footprint } from './casinoFloorLayout'

export type Anchor2D = readonly [number, number]

/** The room is a rectangle. Half-extents from the centre, in world units. */
export const HALF_WIDTH = 6.4
export const HALF_DEPTH = 5.6

export const WALL_HEIGHT = 3.6

/** Clearance every fitting keeps from the wall, so nothing clips through it. */
export const WALL_MARGIN = 0.35

export const ROOM: Footprint = {
  minX: -HALF_WIDTH,
  maxX: HALF_WIDTH,
  minZ: -HALF_DEPTH,
  maxZ: HALF_DEPTH,
}

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

/* ------------------------------------------------------------------ mirror */

/**
 * The fitting mirror, centred on the back wall.
 *
 * Wider and taller than the panel it replaces because it is now the point of
 * the room rather than dressing: you walk to it to see what you have on and to
 * pay for it.
 */
export const MIRROR: Anchor2D = [0, -HALF_DEPTH + WALL_MARGIN]
/*
 * Three metres wide, and it is `mirrorSubtendedAngle` that says so.
 *
 * It was 2.4 with the fitting camera close in. Pulling the camera back to stop
 * the figure being cropped at the knees took the mirror down to 19.6 degrees
 * across the view — under the threshold, and the assertion caught it. The
 * answer to a camera that has to be further away is a bigger mirror, not a
 * lower bar.
 */
export const MIRROR_WIDTH = 3.0
export const MIRROR_HEIGHT = 2.9
/** Height of the mirror's bottom edge above the floor. */
export const MIRROR_SILL = 0.12

/** The low round plinth in front of the mirror, straight off the reference. */
export const FITTING: Anchor2D = [0, -3.6]
export const FITTING_RADIUS = 1.1
export const FITTING_HEIGHT = 0.18

/**
 * Where the player stands to be offered the mirror, on the floor in front of
 * the plinth rather than on it. Close in, so the prompt is up before you have
 * walked into the plinth and been pushed back off it.
 */
export const MIRROR_STAND: readonly [number, number, number] = [0, 0, -2.4]
/**
 * Generous, because the mirror is the only till in the room.
 *
 * It was 1.4, which is the width of the plinth and reads as reasonable, and a
 * scripted walk down the room passed within 1.75 of it and was offered nothing.
 * That is the craps rail's lesson in a smaller room: a target you can only be
 * offered inside a narrow window is one a single stride steps over, and here
 * stepping over it means never finding out that anything costs money.
 *
 * It went 1.4 -> 2.2 -> 2.6. The last step was the walkthrough failing against
 * the deployed build after passing locally: the headless browser renders far
 * slower over the network, so the same scripted walk covers different ground
 * and arrived at the mirror from a metre further out. A prompt whose margin is
 * the difference between a fast machine and a slow one is too tight.
 *
 * `shopLayout.test.ts` holds it clear of every fixture, and 2.6 still leaves
 * most of a metre of slack to the nearest one.
 */
export const MIRROR_RADIUS = 2.6

/**
 * The fixed camera used while the player is on the fitting plinth.
 *
 * Here rather than in the component because the camera and the mirror have to
 * agree to a degree that two constants in two files would not survive — see
 * `CLAUDE.md`. Deliberately off the mirror's axis: a camera looking straight
 * down the normal puts the reflection directly behind the player's own head,
 * where it is entirely hidden. Off to one side, the character's back
 * three-quarter and their reflected front sit either side of centre.
 *
 * On the +x side specifically, which frames the character left of centre. The
 * fitting panel covers the right of the screen while you are standing here, and
 * the reflection has to stay clear of it — the same reasoning that used to put
 * the jewellery counter on the left.
 */
export const MIRROR_CAMERA_AT: readonly [number, number, number] = [2.1, 1.95, 1.0]
export const MIRROR_CAMERA_TARGET: readonly [number, number, number] = [0, 1.35, MIRROR[1]]

/* ------------------------------------------------------------------- doors */

export const EXIT_DOOR: readonly [number, number, number] = [3.6, 0, HALF_DEPTH - 0.3]
/**
 * Sized like the casino's and the clinic's: wide enough to stand in, no wider.
 * `venueDoors.test.ts` holds it clear of every display and of the mirror.
 */
export const EXIT_RADIUS = 1.7

/**
 * Where the player appears on walking in, just inside the door.
 *
 * Far enough in that arriving does not re-trigger the exit, facing the length
 * of the room so the window platform and the jewellery case are both in shot.
 */
export const ENTRANCE: readonly [number, number, number] = [2.0, 0, 3.2]

/* ---------------------------------------------------------------- displays */

/** Which assembly a display is built from. Drawn by the scene, placed here. */
export enum Fixture {
  /** A dressed dummy on the raised window platform. */
  Mannequin = 'mannequin',
  /** A lit bust or block inside the glass case. */
  Pedestal = 'pedestal',
  /** A lit cubby in the shoe cabinet. */
  Niche = 'niche',
  /** The turned pole the hat sits on. */
  Stand = 'stand',
  /** The brass basket the cane leans in. */
  Rack = 'rack',
}

export interface Display {
  /** The catalogue item on show here. */
  readonly itemId: string
  readonly fixture: Fixture
  /** Where the item sits, world XZ. */
  readonly at: Anchor2D
  /** Which way the fixture faces, radians about Y. */
  readonly facing: number
  /** Where the player stands to be offered it. */
  readonly standAt: readonly [number, number, number]
}

/**
 * How close you have to be for a display to offer itself.
 *
 * Neighbouring displays overlap, deliberately, for the reason the clinic's
 * recliners do: circular prompts along a row cannot be both non-overlapping and
 * gapless, and gapless is what matters. `WalkingPlayer` reports the *nearest*
 * target, so a point between two displays resolves to the one you are actually
 * standing at, and both offers say the same kind of thing anyway.
 *
 * What must not overlap is anything F treats differently — the mirror and the
 * door. That is `venueDoors.test.ts`.
 */
export const TRY_RADIUS = 1.1

/** Facing values, named so the table below reads as a room rather than as maths. */
const FACES_IN_FROM_FRONT = Math.PI
const FACES_IN_FROM_LEFT = Math.PI / 2
const FACES_IN_FROM_RIGHT = -Math.PI / 2

/** The raised window platform's z, and the mannequins' x positions along it. */
const WINDOW_Z = 4.9
const WINDOW_STAND_Z = 3.5

/** The side walls: where a case sits, and where you stand to look into it. */
const LEFT_CASE_X = -5.6
const LEFT_STAND_X = -4.5
const RIGHT_CASE_X = 5.6
const RIGHT_STAND_X = 4.5
const BACK_CORNER_X = 5.4

/**
 * Every item in the catalogue, and where it is on show.
 *
 * One item, one fixture: the whole point of walking the room is that a jacket
 * is a jacket on a dummy rather than a row in a list. `shopLayout.test.ts`
 * asserts this covers the catalogue exactly, so adding a thirteenth item fails
 * a test rather than quietly shipping something nobody can find.
 *
 * The jewellery case runs cheapest at the front to dearest at the back, which
 * is what the pendant's blurb claims about itself.
 */
export const DISPLAYS: readonly Display[] = [
  {
    itemId: 'sequin-jacket',
    fixture: Fixture.Mannequin,
    at: [-5.0, WINDOW_Z],
    facing: FACES_IN_FROM_FRONT,
    standAt: [-5.0, 0, WINDOW_STAND_Z],
  },
  {
    itemId: 'crimson-gown',
    fixture: Fixture.Mannequin,
    at: [-3.1, WINDOW_Z],
    facing: FACES_IN_FROM_FRONT,
    standAt: [-3.1, 0, WINDOW_STAND_Z],
  },
  {
    itemId: 'ivory-tuxedo',
    fixture: Fixture.Mannequin,
    at: [-1.2, WINDOW_Z],
    facing: FACES_IN_FROM_FRONT,
    standAt: [-1.2, 0, WINDOW_STAND_Z],
  },

  {
    itemId: 'gold-rope-chain',
    fixture: Fixture.Pedestal,
    at: [LEFT_CASE_X, 2.2],
    facing: FACES_IN_FROM_LEFT,
    standAt: [LEFT_STAND_X, 0, 2.2],
  },
  {
    itemId: 'signet-ring',
    fixture: Fixture.Pedestal,
    at: [LEFT_CASE_X, 0.4],
    facing: FACES_IN_FROM_LEFT,
    standAt: [LEFT_STAND_X, 0, 0.4],
  },
  {
    itemId: 'bracelet-watch',
    fixture: Fixture.Pedestal,
    at: [LEFT_CASE_X, -1.4],
    facing: FACES_IN_FROM_LEFT,
    standAt: [LEFT_STAND_X, 0, -1.4],
  },
  {
    itemId: 'solitaire-pendant',
    fixture: Fixture.Pedestal,
    at: [LEFT_CASE_X, -3.2],
    facing: FACES_IN_FROM_LEFT,
    standAt: [LEFT_STAND_X, 0, -3.2],
  },
  {
    itemId: 'blackout-shades',
    fixture: Fixture.Pedestal,
    at: [LEFT_CASE_X, -4.4],
    facing: FACES_IN_FROM_LEFT,
    standAt: [LEFT_STAND_X, 0, -4.4],
  },

  {
    itemId: 'oxblood-oxfords',
    fixture: Fixture.Niche,
    at: [RIGHT_CASE_X, 0.4],
    facing: FACES_IN_FROM_RIGHT,
    standAt: [RIGHT_STAND_X, 0, 0.4],
  },
  {
    itemId: 'gold-heels',
    fixture: Fixture.Niche,
    at: [RIGHT_CASE_X, -1.6],
    facing: FACES_IN_FROM_RIGHT,
    standAt: [RIGHT_STAND_X, 0, -1.6],
  },
  {
    itemId: 'felt-fedora',
    fixture: Fixture.Stand,
    at: [BACK_CORNER_X, -3.6],
    facing: FACES_IN_FROM_RIGHT,
    standAt: [4.4, 0, -3.6],
  },
  {
    itemId: 'lacquer-cane',
    fixture: Fixture.Rack,
    at: [BACK_CORNER_X, -4.8],
    facing: FACES_IN_FROM_RIGHT,
    standAt: [4.4, 0, -4.6],
  },
]

/** The proximity-target id a display answers to. Prefixed so `exit` cannot collide. */
export function displayId(itemId: string): string {
  return `display:${itemId}`
}

/** The item id back out of a target id, or `null` if it is not a display. */
export function displayItemId(targetId: string): string | null {
  return targetId.startsWith('display:') ? targetId.slice('display:'.length) : null
}

export function displayFor(itemId: string): Display | null {
  return DISPLAYS.find((display) => display.itemId === itemId) ?? null
}

/* --------------------------------------------------------------- furniture */

/**
 * The window platform: raised, running most of the front wall beside the door.
 *
 * The mannequins stand on it, so it has to be an obstacle as well as a shape —
 * a player who can walk through the platform can stand inside a dummy.
 */
export const WINDOW_PLATFORM: Footprint = { minX: -5.8, maxX: -0.4, minZ: 4.35, maxZ: 5.25 }
export const WINDOW_PLATFORM_HEIGHT = 0.32

/** The long glass jewellery case down the left wall. */
export const JEWELLERY_CASE: Footprint = {
  minX: LEFT_CASE_X - 0.375,
  maxX: LEFT_CASE_X + 0.375,
  minZ: -3.8,
  maxZ: 2.8,
}
export const CASE_HEIGHT = 1.02

/** A second, shorter case behind it for the eyewear. */
export const EYEWEAR_CASE: Footprint = {
  minX: LEFT_CASE_X - 0.375,
  maxX: LEFT_CASE_X + 0.375,
  minZ: -4.85,
  maxZ: -3.95,
}

/** The tall lit shoe cabinet opposite. */
export const SHOE_CABINET: Footprint = {
  minX: RIGHT_CASE_X - 0.375,
  maxX: RIGHT_CASE_X + 0.375,
  minZ: -2.4,
  maxZ: 1.2,
}
export const CABINET_HEIGHT = 2.3

export const HAT_STAND: Footprint = { minX: 5.1, maxX: 5.7, minZ: -3.9, maxZ: -3.3 }
export const CANE_RACK: Footprint = { minX: 5.1, maxX: 5.7, minZ: -5.1, maxZ: -4.5 }

/** The fitting plinth, as a box the walk cannot enter. */
export const FITTING_FOOTPRINT: Footprint = {
  minX: FITTING[0] - FITTING_RADIUS,
  maxX: FITTING[0] + FITTING_RADIUS,
  minZ: FITTING[1] - FITTING_RADIUS,
  maxZ: FITTING[1] + FITTING_RADIUS,
}

/** Everything the player is pushed out of. */
export function obstacles(): readonly Footprint[] {
  return [
    WINDOW_PLATFORM,
    JEWELLERY_CASE,
    EYEWEAR_CASE,
    SHOE_CABINET,
    HAT_STAND,
    CANE_RACK,
    FITTING_FOOTPRINT,
  ]
}

/**
 * Tests whether a point lies on the shop floor, clear of the walls.
 *
 * @param x Distance from the room's centre line.
 * @param z Distance along the room; positive toward the door.
 * @param margin How far inside the wall the point must sit, in world units.
 */
export function isOnShopFloor(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) <= HALF_WIDTH - margin && Math.abs(z) <= HALF_DEPTH - margin
}

/** The four corners of a footprint, for bounds checking. */
export function footprintCorners(footprint: Footprint): Anchor2D[] {
  return [
    [footprint.minX, footprint.minZ],
    [footprint.minX, footprint.maxZ],
    [footprint.maxX, footprint.minZ],
    [footprint.maxX, footprint.maxZ],
  ]
}

/**
 * How wide the mirror sits across the fitting camera's view, in radians.
 *
 * The tubing lesson, applied to the one surface in this room that has to be
 * legible: a mirror can be the right size, in the right place, and still
 * project to a sliver if the camera looks along it. This is measured across the
 * view rather than in the world, which is the only measure that decides whether
 * anyone can see their reflection in it.
 */
export function mirrorSubtendedAngle(): number {
  const [cx, cy, cz] = MIRROR_CAMERA_AT
  const [my, mz] = [MIRROR_CAMERA_TARGET[1], MIRROR[1]]

  const toEdge = (edgeX: number): readonly [number, number, number] => [
    edgeX - cx,
    my - cy,
    mz - cz,
  ]

  const left = toEdge(MIRROR[0] - MIRROR_WIDTH / 2)
  const right = toEdge(MIRROR[0] + MIRROR_WIDTH / 2)

  const dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
  const lengths = Math.hypot(...left) * Math.hypot(...right)

  return Math.acos(Math.min(1, Math.max(-1, dot / lengths)))
}

/** Every catalogue item id, as the display table has to cover them. */
export const CATALOG_IDS: readonly string[] = CATALOG.map((item) => item.id)
