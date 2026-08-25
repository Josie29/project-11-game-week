/*
 * The craps table's own geometry: the pit, the rail around it, and everything
 * inset into that rail.
 *
 * Split out of `CrapsTable.tsx` for the reason `tableLayout.ts` was split out of
 * `BlackjackTable.tsx`. The table is now a stadium rather than a box, so the
 * numbers are no longer four obvious extents — a drink holder has to land on the
 * rail, the chip channel has to stay clear of it, and the dice have to rest
 * inside a pit that just got smaller to make room for a thicker rail. None of
 * those is visible in a screenshot until it is wrong.
 *
 * Coordinates are the table's own local frame, which is also world space:
 * `CRAPS_ORIGIN` is the world origin and has to stay there, because the physics
 * provider lives under this table. `x` runs across the table, `z` from the
 * boxman's edge (negative) to the shooter's (positive), matching the felt's
 * `u`/`v` convention.
 */

/** A point on the table's outline, viewed from above. */
export interface TablePoint {
  readonly x: number
  readonly z: number
}

/**
 * The playing surface, wall to wall.
 *
 * Two and a half to one, which is roughly a real table's proportions. It was
 * three to two, near enough square, and that shape is what made the throw wrong:
 * a craps shooter stands at one end of a long side and throws the length of the
 * table into the far wall, and on a squarish table there is no length to throw
 * down. Everything else here follows from that — where the shooter stands,
 * where the dice are released, and how the print is laid out.
 */
export const PIT_HALF_WIDTH = 2.25
export const PIT_HALF_DEPTH = 0.9

/** The table's outer edge, rail included. */
export const OUTER_HALF_WIDTH = 2.57
export const OUTER_HALF_DEPTH = 1.22

/** How wide the wooden rail moulding is, measured across the top. */
export const RAIL_WIDTH = OUTER_HALF_WIDTH - PIT_HALF_WIDTH

/**
 * Corner rounding, outer and inner.
 *
 * The inner radius is the outer minus the rail width by construction, which is
 * what keeps the moulding a constant width all the way round. Set them
 * independently and the corners pinch.
 */
export const OUTER_CORNER_RADIUS = 0.52
export const INNER_CORNER_RADIUS = OUTER_CORNER_RADIUS - RAIL_WIDTH

/** The felt surface. */
export const TABLE_TOP_Y = 1

/** Anything resting on the felt sits a hair above it, to avoid z-fighting. */
export const SURFACE_Y = TABLE_TOP_Y + 0.012

/** Top of the rail moulding — the height a player would lean on. */
export const RAIL_TOP_Y = TABLE_TOP_Y + 0.3

/**
 * How far the pyramid-rubber bumper climbs the inside of the pit.
 *
 * Stops short of the rail top so the moulding reads as sitting on the bumper
 * rather than being made of it, which is how the reference is built.
 */
export const PIT_WALL_HEIGHT = 0.24

/**
 * Where the table's body starts and stops.
 *
 * Three steps rather than a skirt on a box. Seen from across the room — which
 * is now most of the time, because the casino is a floor you walk — the first
 * version's apron sat on a black plinth of nearly the same width, and the two
 * merged into one featureless crate under an otherwise finished table. A lit
 * base moulding under a darker body is what gives it a bottom edge to read.
 */
export const APRON_BOTTOM_Y = 0.44
export const BASE_MOULDING_BOTTOM_Y = 0.28

/** The plinth under the moulding, inset far enough that the base overhangs it. */
export const PLINTH_HEIGHT = BASE_MOULDING_BOTTOM_Y
export const PLINTH_INSET = 0.42

/**
 * The chip channel cut into the rail, measured from the pit edge outward.
 *
 * Inboard of the drink holders on purpose: a player racks chips where they can
 * reach past them, and overlapping the two would have the brass rings sitting
 * in the middle of the chip slots.
 */
export const CHIP_CHANNEL_OFFSET = 0.08
export const CHIP_CHANNEL_WIDTH = 0.11
export const CHIP_CHANNEL_DEPTH = 0.045

/** Drink holders sit outboard of the chip channel, near the rail's outer lip. */
export const DRINK_HOLDER_OFFSET = 0.22
export const DRINK_HOLDER_RADIUS = 0.075

/** Half-extent of a die, used to check the dice fit where they are parked. */
export const DIE_HALF = 0.08

/**
 * Where the shooter releases the dice, and where they wait between throws.
 *
 * Both ends of the table's long axis, because that is the throw: the shooter
 * stands at one end of the near rail and pitches the dice the length of the
 * felt into the far wall. Thrown across the short axis — which is what a
 * squarish table forced — they travel about a metre and stop, which reads as
 * dropping them rather than shooting them.
 *
 * Here rather than in `CrapsDice.tsx` because they are pit-relative. Resizing
 * the pit is exactly the change that would leave the resting dice buried in a
 * bumper, and nothing on screen would say so: the dice would simply be gone,
 * which is a failure this project has already had once.
 *
 * Both pairs sit on the strip of bare felt past the end of the printed layout,
 * so neither the resting dice nor the release point lands on top of a bet.
 */
export const DICE_THROW_ORIGINS: readonly (readonly [number, number, number])[] = [
  [-2.0, 1.42, 0.42],
  [-2.0, 1.42, 0.62],
]

export const DICE_REST_POSITIONS: readonly (readonly [number, number, number])[] = [
  [-2.1, 1.09, -0.22],
  [-2.1, 1.09, 0.02],
]

/**
 * Launch velocity per die, in metres per second.
 *
 * Velocity, not impulse: a 0.16 m cube at rapier's default density masses about
 * four grams, so an impulse of the magnitude that looks reasonable on paper
 * accelerates it to several hundred metres per second. Set here so the throw
 * and the table it has to cross stay in one file — the table got two and a half
 * times longer, and a throw tuned for the old one dies in the middle of it.
 */
export const DICE_THROW_VELOCITIES: readonly (readonly [number, number, number])[] = [
  [5.7, 0.45, -0.55],
  [5.4, 0.45, -0.75],
]

export const PUCK_RADIUS = 0.1

/**
 * Where the ON puck waits while the table is coming out.
 *
 * The bare felt past the far end of the printed layout, opposite the dice. The
 * printed bands now run the full width of a much longer table, so these two end
 * strips are the only felt not spoken for — and pushed any further out the puck
 * runs into the pit's rounding and hangs over the bumper, which `isInCrapsPit`
 * refuses and the eye does not catch.
 */
export const PUCK_OFF_POSITION: readonly [number, number] = [2.12, 0]

export const DRINK_HOLDERS: readonly TablePoint[] = [
  ...[-1.55, 0, 1.55].flatMap((x) => [
    { x, z: -(PIT_HALF_DEPTH + DRINK_HOLDER_OFFSET) },
    { x, z: PIT_HALF_DEPTH + DRINK_HOLDER_OFFSET },
  ]),
  { x: -(PIT_HALF_WIDTH + DRINK_HOLDER_OFFSET), z: 0 },
  { x: PIT_HALF_WIDTH + DRINK_HOLDER_OFFSET, z: 0 },
]

/**
 * Converts a felt texture coordinate to a world position on the playing surface.
 *
 * `u` runs left to right and `v` from the boxman's edge to the shooter's, the
 * same convention `crapsFeltLayout` uses — so a bet's printed rectangle and the
 * chips stacked on it are guaranteed to agree, and both follow the pit if the
 * pit is ever resized again.
 */
export function feltToWorld(u: number, v: number): [number, number, number] {
  return [(u - 0.5) * PIT_HALF_WIDTH * 2, SURFACE_Y, (v - 0.5) * PIT_HALF_DEPTH * 2]
}

/**
 * Whether a point lies inside a rounded rectangle centred on the origin.
 *
 * @param halfWidth Half-extent along x, before the margin is applied.
 * @param halfDepth Half-extent along z, before the margin is applied.
 * @param radius Corner radius of the un-shrunk rectangle.
 * @param margin How far inside the outline the point must sit.
 */
function insideRoundedRect(
  x: number,
  z: number,
  halfWidth: number,
  halfDepth: number,
  radius: number,
  margin: number,
): boolean {
  const limitX = halfWidth - margin
  const limitZ = halfDepth - margin
  if (limitX <= 0 || limitZ <= 0) return false

  // Distance past the straight section, in each axis. Zero along the flats.
  const overX = Math.abs(x) - (limitX - radius)
  const overZ = Math.abs(z) - (limitZ - radius)

  if (overX <= 0 || overZ <= 0) {
    return Math.abs(x) <= limitX && Math.abs(z) <= limitZ
  }

  // Both past the straight sections: the point is in a corner quadrant, so the
  // boundary is the corner arc rather than either edge.
  const cornerRadius = Math.max(0, radius - margin)
  return Math.hypot(overX, overZ) <= cornerRadius
}

/**
 * Tests whether a point is inside the pit — the felt the dice can reach.
 *
 * @param x Table-local x.
 * @param z Table-local z.
 * @param margin How far inside the bumper the point must sit. Pass a die's
 *   half-extent to ask whether a die fits there rather than whether its centre
 *   does.
 */
export function isInCrapsPit(x: number, z: number, margin = 0): boolean {
  return insideRoundedRect(x, z, PIT_HALF_WIDTH, PIT_HALF_DEPTH, INNER_CORNER_RADIUS, margin)
}

/** Tests whether a point is inside the table's outer edge, rail included. */
export function isOnCrapsTable(x: number, z: number, margin = 0): boolean {
  return insideRoundedRect(x, z, OUTER_HALF_WIDTH, OUTER_HALF_DEPTH, OUTER_CORNER_RADIUS, margin)
}

/**
 * Tests whether a point sits on the rail moulding: on the table but not in the
 * pit.
 *
 * @param margin How far from both edges of the moulding the point must sit.
 *   Pass a drink holder's radius to ask whether the whole holder lands on wood.
 */
export function isOnCrapsRail(x: number, z: number, margin = 0): boolean {
  return isOnCrapsTable(x, z, margin) && !isInCrapsPit(x, z, -margin)
}

/**
 * Traces a closed rounded-rectangle outline, counter-clockwise from +x.
 *
 * Both the pit bumper and the rail are built by sweeping a profile along one of
 * these, so the two are guaranteed concentric. Returned as plain points rather
 * than a `three` curve to keep this module free of rendering imports and
 * testable under the suite's `node` environment.
 *
 * @param halfWidth Half-extent along x.
 * @param halfDepth Half-extent along z.
 * @param radius Corner radius.
 * @param cornerSegments Points used to round each corner; more is smoother.
 * @returns Points around the outline, without repeating the first at the end.
 */
export function roundedRectOutline(
  halfWidth: number,
  halfDepth: number,
  radius: number,
  cornerSegments = 10,
): TablePoint[] {
  const insetX = halfWidth - radius
  const insetZ = halfDepth - radius

  // Corner centres, walking counter-clockwise from the +x/+z corner.
  const corners: readonly TablePoint[] = [
    { x: insetX, z: insetZ },
    { x: -insetX, z: insetZ },
    { x: -insetX, z: -insetZ },
    { x: insetX, z: -insetZ },
  ]

  const points: TablePoint[] = []
  corners.forEach((corner, index) => {
    const start = (Math.PI / 2) * index
    for (let step = 0; step <= cornerSegments; step++) {
      const angle = start + (Math.PI / 2) * (step / cornerSegments)
      points.push({
        x: corner.x + Math.cos(angle) * radius,
        z: corner.z + Math.sin(angle) * radius,
      })
    }
  })
  return points
}

/** The pit's inner outline, which the bumper follows. */
export function pitOutline(cornerSegments = 10): TablePoint[] {
  return roundedRectOutline(
    PIT_HALF_WIDTH,
    PIT_HALF_DEPTH,
    INNER_CORNER_RADIUS,
    cornerSegments,
  )
}

/** The table's outer outline, which the rail and apron follow. */
export function outerOutline(cornerSegments = 10): TablePoint[] {
  return roundedRectOutline(
    OUTER_HALF_WIDTH,
    OUTER_HALF_DEPTH,
    OUTER_CORNER_RADIUS,
    cornerSegments,
  )
}

/** Total length of a closed outline, used to tile textures by arc length. */
export function outlineLength(points: readonly TablePoint[]): number {
  let total = 0
  for (let index = 0; index < points.length; index++) {
    const from = points[index]!
    const to = points[(index + 1) % points.length]!
    total += Math.hypot(to.x - from.x, to.z - from.z)
  }
  return total
}
