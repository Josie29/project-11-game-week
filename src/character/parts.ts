/*
 * The vocabulary every piece of the character is built from.
 *
 * This module exists because of a bug that no test in the repository could
 * have caught. The ponytail was a capsule floating eight centimetres behind
 * the skull with a gather sphere floating beside it, and it shipped, because
 * the only geometry assertion the character had was `isOnBody` — which tests
 * the single *anchor* a slot attaches at, not the shape hanging off it. The
 * anchor was correct. The hair was not attached to it.
 *
 * The fix is the one `tableLayout.ts` and `anchors.ts` already made: the shapes
 * stop being JSX buried in a component and become data. A part list is pure,
 * so a test can walk it and assert that every piece touches the piece next to
 * it, that nothing floats, and that no two surfaces sit the hair's-breadth
 * apart that makes a renderer strobe. The components below `src/scenes/` then
 * only draw the list — they decide nothing, exactly as `CasinoCharacter`
 * decides nothing about where a hat goes.
 *
 * Deliberately no `three` import. The maths here is a few dozen lines of
 * rotation and interval arithmetic, and hand-rolling it is what keeps
 * `src/character/` free of rendering imports the way `src/games/` is.
 */

export type Vec3 = readonly [number, number, number]

/**
 * The primitive a part is drawn as.
 *
 * Deliberately small. Every shape here maps to one three.js geometry, and the
 * renderer's switch over this enum is exhaustive — adding a member fails the
 * build in the one place that has to know about it.
 */
export enum PartShape {
  /** `size` is [width, height, depth]. */
  Box = 'box',
  /** `size` is [radius, length, radius]; `length` is the straight section only. */
  Capsule = 'capsule',
  /** `size` is [radiusX, radiusY, radiusZ] — an ellipsoid, so a bun can be squashed. */
  Sphere = 'sphere',
  /** `size` is [radiusTop, height, radiusBottom]; unequal radii give a taper. */
  Cylinder = 'cylinder',
  /** `size` is [radius, height, radius]. */
  Cone = 'cone',
  /** `size` is [ringRadius, tubeRadius, ringRadius]. Lies in the XY plane unturned. */
  Torus = 'torus',
}

/**
 * Which colour a part takes, resolved by whatever owns the list.
 *
 * A role rather than a hex value because the same part list is painted
 * differently depending on what is wearing it: `Primary` is a garment's chosen
 * colour on the player and the item's own colour on a shop fixture, and `Skin`
 * is a skin tone on a person and one moulded cream on a shop dummy.
 */
export enum ColorRole {
  Primary = 'primary',
  Secondary = 'secondary',
  Accent = 'accent',
  Trim = 'trim',
  Shirt = 'shirt',
  Shoes = 'shoes',
  Skin = 'skin',
  Hair = 'hair',
  /*
   * The face has its own three roles rather than borrowing the garment's.
   *
   * Left on `Trim` and `Accent`, an eye white took the colour of a lapel and a
   * pupil took the colour of a tie — so a crimson suit gave its wearer red
   * eyes. A face does not change colour with an outfit.
   */
  Sclera = 'sclera',
  Pupil = 'pupil',
  Lip = 'lip',
}

/** How a part's surface behaves under the neon. */
export enum Finish {
  /** Cloth: rough, unlit by reflection. */
  Cloth = 'cloth',
  /** Polished metal — chains, brass, buckles. */
  Metal = 'metal',
  /** A cut stone, which is the only thing on a character that emits. */
  Gem = 'gem',
  /** Skin and moulded forms. */
  Matte = 'matte',
  /** Leather and patent — smooth, a little specular, not metal. */
  Leather = 'leather',
  /** Glass and lenses. */
  Glass = 'glass',
}

export interface Part {
  /**
   * What this piece is, in words.
   *
   * Not decoration: it is what a failing connectivity assertion prints, and
   * what `npm run locate` matches on. "ponytail-fall floats 0.08 from the
   * nearest part" is a bug report; "parts[3] floats" is a puzzle.
   */
  readonly name: string
  readonly shape: PartShape
  /** Centre of the part, in the list's own frame. */
  readonly at: Vec3
  /** Dimensions. Meaning depends on `shape` — see `PartShape`. */
  readonly size: Vec3
  /** Euler XYZ rotation in radians. Omitted means unrotated. */
  readonly rotation?: Vec3
  readonly role: ColorRole
  readonly finish?: Finish
  /**
   * Radial segment count, where the shape has one.
   *
   * The knob the fidelity pass turns. Left undefined the renderer picks a
   * default per shape; set it where a piece is close to the camera and its
   * facets show.
   */
  readonly segments?: number
  /** Draws a cylinder or cone as a shell with no end caps — skirts and sleeves. */
  readonly open?: boolean
  /**
   * Non-uniform scale applied to the shape, defaulting to none.
   *
   * A torso is half again as wide as it is deep, and a cylinder cannot say
   * that on its own — its cross-section is a circle. Rather than add an
   * elliptical primitive for the one case, the shape stays a cylinder and gets
   * squashed. `partHalfExtents` accounts for it, so the predicates see the
   * shape that is actually drawn.
   */
  readonly scale?: Vec3
  /**
   * Exempts a part from the floating check.
   *
   * For the handful of pieces that legitimately hang free of everything else in
   * their own list because they attach to something *outside* it — a jacket's
   * cuff that meets the arm, not the jacket. Every use needs a reason written
   * beside it, because this is the flag that would let the ponytail bug back in.
   */
  readonly detached?: boolean
}

/** An axis-aligned box. Reused by every predicate in this module. */
export interface Bounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/**
 * Half the part's extent along each local axis, before rotation.
 *
 * @param part The part to measure.
 * @returns Half-extents in X, Y and Z.
 */
export function partHalfExtents(part: Part): Vec3 {
  const [sx, sy, sz] = part.scale ?? [1, 1, 1]
  const [hx, hy, hz] = unscaledHalfExtents(part)

  return [hx * sx, hy * sy, hz * sz]
}

function unscaledHalfExtents(part: Part): Vec3 {
  const [a, b, c] = part.size

  switch (part.shape) {
    case PartShape.Box:
      return [a / 2, b / 2, c / 2]

    case PartShape.Capsule:
      // The straight section plus a hemisphere at each end.
      return [a, b / 2 + a, a]

    case PartShape.Sphere:
      return [a, b, c]

    case PartShape.Cylinder: {
      const widest = Math.max(a, c)
      return [widest, b / 2, widest]
    }

    case PartShape.Cone:
      return [a, b / 2, a]

    case PartShape.Torus:
      // The ring lies in XY; the tube is what gives it depth in Z.
      return [a + b, a + b, b]
  }
}

/** Rotates a point by an Euler XYZ triple. Hand-rolled to keep this module pure. */
function rotatePoint(point: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation
  let [x, y, z] = point

  // X
  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  ;[y, z] = [y * cosX - z * sinX, y * sinX + z * cosX]

  // Y
  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)
  ;[x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY]

  // Z
  const cosZ = Math.cos(rz)
  const sinZ = Math.sin(rz)
  ;[x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ]

  return [x, y, z]
}

/**
 * The part's axis-aligned bounds in the list's frame, rotation included.
 *
 * Conservative where a part is rotated: the eight corners of the local box are
 * turned and the extremes taken, which over-estimates a rounded shape at an
 * angle. That is the right way to be wrong here — the predicates below use
 * these bounds to decide whether pieces touch, and an over-estimate can only
 * ever report a join that is tighter than it looks, never a float that is not
 * there.
 *
 * @param part The part to bound.
 * @returns Its axis-aligned bounds.
 */
export function partBounds(part: Part): Bounds {
  const [hx, hy, hz] = partHalfExtents(part)
  const [cx, cy, cz] = part.at

  if (!part.rotation) {
    return {
      minX: cx - hx,
      maxX: cx + hx,
      minY: cy - hy,
      maxY: cy + hy,
      minZ: cz - hz,
      maxZ: cz + hz,
    }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const [x, y, z] = rotatePoint([sx * hx, sy * hy, sz * hz], part.rotation)
        minX = Math.min(minX, cx + x)
        maxX = Math.max(maxX, cx + x)
        minY = Math.min(minY, cy + y)
        maxY = Math.max(maxY, cy + y)
        minZ = Math.min(minZ, cz + z)
        maxZ = Math.max(maxZ, cz + z)
      }
    }
  }

  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/** The inverse of `rotatePoint`: undoes an Euler XYZ triple, Z first. */
function unrotatePoint(point: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation
  let [x, y, z] = point

  const cosZ = Math.cos(rz)
  const sinZ = Math.sin(rz)
  ;[x, y] = [x * cosZ + y * sinZ, -x * sinZ + y * cosZ]

  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)
  ;[x, z] = [x * cosY - z * sinY, x * sinY + z * cosY]

  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  ;[y, z] = [y * cosX + z * sinX, -y * sinX + z * cosX]

  return [x, y, z]
}

/**
 * Whether a point is inside a part's actual solid, not merely inside its box.
 *
 * The bounds above are deliberately coarse, which is right for asking whether
 * two pieces touch and useless for asking whether a piece is *in front of*
 * something. A fringe is an ellipsoid whose bounding box reaches the chin and
 * whose surface, at the chin, has receded to nothing — bounding boxes would
 * condemn every hairstyle in the catalogue. `partsOverFace` needs the solid.
 *
 * @param part The part to test.
 * @param point A point in the part list's own frame.
 * @returns True if the point is inside the part.
 */
export function containsPoint(part: Part, point: Vec3): boolean {
  const [sx, sy, sz] = part.scale ?? [1, 1, 1]
  const offset: Vec3 = [
    point[0] - part.at[0],
    point[1] - part.at[1],
    point[2] - part.at[2],
  ]
  const turned = part.rotation ? unrotatePoint(offset, part.rotation) : offset

  // Divided out of the mesh scale, so every test below is against the raw
  // geometry the shape was authored with.
  const x = turned[0] / sx
  const y = turned[1] / sy
  const z = turned[2] / sz
  const [a, b, c] = part.size

  switch (part.shape) {
    case PartShape.Box:
      return Math.abs(x) <= a / 2 && Math.abs(y) <= b / 2 && Math.abs(z) <= c / 2

    case PartShape.Sphere:
      return (x / a) ** 2 + (y / b) ** 2 + (z / c) ** 2 <= 1

    case PartShape.Cylinder: {
      if (Math.abs(y) > b / 2) return false
      // Radius interpolates from the bottom to the top, so a taper is honoured.
      const radius = c + (a - c) * ((y + b / 2) / b)
      return radius > 0 && x * x + z * z <= radius * radius
    }

    case PartShape.Cone: {
      if (Math.abs(y) > b / 2) return false
      const radius = a * ((b / 2 - y) / b)
      return radius > 0 && x * x + z * z <= radius * radius
    }

    case PartShape.Capsule: {
      const straight = Math.max(0, Math.abs(y) - b / 2)
      return x * x + z * z + straight * straight <= a * a
    }

    case PartShape.Torus: {
      const fromRing = Math.sqrt(x * x + y * y) - a
      return fromRing * fromRing + z * z <= b * b
    }
  }
}

/** The overlap of two intervals; negative means a gap of that size. */
function overlap1D(minA: number, maxA: number, minB: number, maxB: number): number {
  return Math.min(maxA, maxB) - Math.max(minA, minB)
}

/**
 * How deeply two boxes interpenetrate, along their shallowest axis.
 *
 * Negative means they do not touch at all, and the magnitude is the gap on the
 * axis that separates them furthest.
 *
 * @param a First box.
 * @param b Second box.
 * @returns Penetration depth; negative for a gap.
 */
export function penetration(a: Bounds, b: Bounds): number {
  return Math.min(
    overlap1D(a.minX, a.maxX, b.minX, b.maxX),
    overlap1D(a.minY, a.maxY, b.minY, b.maxY),
    overlap1D(a.minZ, a.maxZ, b.minZ, b.maxZ),
  )
}

/**
 * How far two primitives must interpenetrate to read as one joined form.
 *
 * Three millimetres. Below that the two surfaces are close enough that a seam
 * shows as the figure turns, and at exactly zero they are coincident, which is
 * the other half of the flicker problem. Parts on this character are meant to
 * be pushed into each other, not balanced against each other.
 */
export const MIN_JOIN = 0.003

/**
 * The gap that must not exist between two parallel surfaces.
 *
 * A surface either sits *inside* another part, or clears it by a millimetre.
 * The band between is where z-fighting lives — two faces the depth buffer
 * cannot separate, so which one wins is decided by rounding and changes frame
 * to frame as the figure turns.
 *
 * A millimetre is chosen against the arithmetic rather than by eye. With this
 * project's camera — near 0.1, far 2000, a 24-bit depth buffer — the depth
 * resolution is about 0.01mm at the four metres the designer stage sits at and
 * 0.04mm at the eight the follow camera trails by. A millimetre is two orders
 * of magnitude clear of both, which leaves the threshold catching what it is
 * actually for: faces authored at *exactly* the same plane, where the gap is
 * zero and no amount of precision helps.
 *
 * Worth stating plainly, because it corrects an assumption that was easy to
 * make and wrong: the old rig's 1–2mm offsets — the shirt panel proud of the
 * torso, the brows off the face — are comfortably above this and were never
 * the flicker. Coincident faces and shadow acne were.
 */
export const MIN_SURFACE_GAP = 0.001

/**
 * Below this, two faces are the same plane rather than a very small gap.
 *
 * Floating-point noise: a part authored to sit exactly on another's face lands
 * a fraction of a nanometre off it, and that is not a defect.
 */
const FLUSH = 1e-9

/**
 * Whether two parts are joined rather than merely near each other.
 *
 * @param a First part.
 * @param b Second part.
 * @param minJoin How deep the interpenetration must be.
 */
export function partsJoined(a: Part, b: Part, minJoin = MIN_JOIN): boolean {
  return penetration(partBounds(a), partBounds(b)) >= minJoin
}

/**
 * Parts that touch nothing else in the list.
 *
 * This is the assertion the ponytail would have failed. A part is anchored if
 * it joins any other part, so a chain of pieces holds together as long as each
 * link overlaps the last — a fringe joined to a cap joined to a fall is fine,
 * and a fall joined to nothing is not.
 *
 * @param parts The list to check.
 * @param anchoredTo Extra volumes the list may attach to — the body it hangs
 *   off, which is not itself part of the list.
 * @returns The names of every part left floating, in list order.
 */
export function floatingParts(parts: readonly Part[], anchoredTo: readonly Bounds[] = []): string[] {
  /*
   * A single part with nothing to attach to cannot be adrift — there is
   * nothing for it to be adrift *from*. Several items in the catalogue are one
   * shape, and reporting a lone chain link as floating would be the predicate
   * inventing a bug rather than finding one.
   */
  if (parts.length === 1 && anchoredTo.length === 0) return []

  return parts
    .filter((part) => {
      if (part.detached) return false

      const bounds = partBounds(part)

      const touchesBody = anchoredTo.some((box) => penetration(bounds, box) >= MIN_JOIN)
      if (touchesBody) return false

      return !parts.some(
        (other) => other !== part && penetration(bounds, partBounds(other)) >= MIN_JOIN,
      )
    })
    .map((part) => part.name)
}

/** One pair of surfaces close enough to fight, named so a failure is readable. */
export interface SurfaceConflict {
  readonly a: string
  readonly b: string
  /** Which axis the two faces are parallel to. */
  readonly axis: 'x' | 'y' | 'z'
  /** How far apart they sit. Below `MIN_SURFACE_GAP`; zero for coplanar faces. */
  readonly gap: number
}

const AXES = [
  { key: 'x', min: 'minX', max: 'maxX', otherMins: ['minY', 'minZ'], otherMaxes: ['maxY', 'maxZ'] },
  { key: 'y', min: 'minY', max: 'maxY', otherMins: ['minX', 'minZ'], otherMaxes: ['maxX', 'maxZ'] },
  { key: 'z', min: 'minZ', max: 'maxZ', otherMins: ['minX', 'minY'], otherMaxes: ['maxX', 'maxY'] },
] as const

/** Whether a rotation is close enough to none that faces stay axis-aligned. */
function isAxisAligned(rotation: Vec3 | undefined): boolean {
  return rotation === undefined || rotation.every((angle) => Math.abs(angle) < 1e-6)
}

/**
 * The axes on which a part presents a flat, axis-aligned face.
 *
 * This is what keeps the surface check honest. Two spheres sitting side by side
 * have identical bounding-box extents on the axis between them, and the naive
 * reading of that is "two coincident faces" — but a sphere has no face there at
 * all, only a tangent point, and tangent points do not fight. Reported as a
 * conflict it is a false alarm that would have had the coil ring pulled apart
 * for nothing.
 *
 * A rotated part is treated as having no axis-aligned faces. Deliberately
 * conservative: a box turned 16 degrees genuinely has no face parallel to
 * anything here, and the handful of parts turned by an exact quarter-circle are
 * not worth a special case that would have to stay correct.
 */
function flatFaceAxes(part: Part): ReadonlySet<'x' | 'y' | 'z'> {
  if (!isAxisAligned(part.rotation)) return new Set()

  switch (part.shape) {
    case PartShape.Box:
      return new Set(['x', 'y', 'z'])

    // A cylinder and a cone are flat only where their caps are.
    case PartShape.Cylinder:
    case PartShape.Cone:
      return new Set(['y'])

    // Curved everywhere. Nothing to fight with.
    case PartShape.Sphere:
    case PartShape.Capsule:
    case PartShape.Torus:
      return new Set()
  }
}

/**
 * Pairs of parallel faces sitting in the z-fighting band.
 *
 * Two faces only fight if three things hold at once. At least one of them has
 * to *be* a flat face on that axis — see `flatFaceAxes`, without which every
 * pair of neighbouring spheres reads as a conflict. They have to be close. And
 * they have to overlap when seen down the axis they are parallel to: a lapel a
 * hair's breadth proud of a jacket fights, the same lapel a hair's breadth
 * proud of a jacket it is nowhere near does not.
 *
 * @param parts The list to check.
 * @param minGap The clearance a surface must have if it is not buried.
 * @returns Every offending pair, so a failure names both sides.
 */
export function fightingSurfaces(
  parts: readonly Part[],
  minGap = MIN_SURFACE_GAP,
): SurfaceConflict[] {
  const conflicts: SurfaceConflict[] = []

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const first = parts[i]
      const second = parts[j]
      if (!first || !second) continue

      const a = partBounds(first)
      const b = partBounds(second)
      const flatFirst = flatFaceAxes(first)
      const flatSecond = flatFaceAxes(second)

      for (const axis of AXES) {
        // Neither presents a face here, so there is nothing to fight.
        if (!flatFirst.has(axis.key) && !flatSecond.has(axis.key)) continue

        // Both other axes must overlap, or the faces never share screen space.
        const overlapsElsewhere = axis.otherMins.every((minKey, index) => {
          const maxKey = axis.otherMaxes[index]
          if (maxKey === undefined) return false
          return overlap1D(a[minKey], a[maxKey], b[minKey], b[maxKey]) > 0
        })
        if (!overlapsElsewhere) continue

        /*
         * Same-side faces and opposite-side faces are different problems.
         *
         * Two faces on the *same* side — both parts' maxima, or both their
         * minima — point the same way, so both are visible, and a gap of
         * exactly zero is the worst case there is rather than the safest: two
         * coplanar surfaces with nothing to separate them. Those are caught
         * down to and including zero.
         *
         * Faces on *opposite* sides meet back to back, one of them facing into
         * the other part where nothing can see it. Flush is how a join is
         * supposed to look, so those are only a problem at a hair's breadth
         * short of flush, and zero is left alone.
         *
         * Getting this wrong in the obvious direction — requiring a gap above
         * zero everywhere — let a lapel and a placket sit on exactly the same
         * plane and reported nothing.
         */
        const sameSide = [
          Math.abs(a[axis.min] - b[axis.min]),
          Math.abs(a[axis.max] - b[axis.max]),
        ]
        const opposed = [
          Math.abs(a[axis.min] - b[axis.max]),
          Math.abs(a[axis.max] - b[axis.min]),
        ]

        /*
         * `FLUSH` rather than a bare zero.
         *
         * Two faces authored to abut exactly come back from the arithmetic
         * separated by about 1e-16 — which is greater than zero, so a literal
         * `gap > 0` reported every flush join in the figure as a conflict. A
         * gap that small is flush by any definition that matters.
         */
        const offender =
          sameSide.find((gap) => gap < minGap) ??
          opposed.find((gap) => gap > FLUSH && gap < minGap)

        if (offender !== undefined) {
          conflicts.push({ a: first.name, b: second.name, axis: axis.key, gap: offender })
        }
      }
    }
  }

  return conflicts
}

/** Shifts a whole list, for placing one assembly inside another's frame. */
export function translateParts(parts: readonly Part[], by: Vec3): Part[] {
  return parts.map((part) => ({
    ...part,
    at: [part.at[0] + by[0], part.at[1] + by[1], part.at[2] + by[2]] as Vec3,
  }))
}

/** Mirrors a list across the YZ plane, for the second of a pair. */
export function mirrorParts(parts: readonly Part[], suffix = '-mirrored'): Part[] {
  return parts.map((part) => ({
    ...part,
    name: `${part.name}${suffix}`,
    at: [-part.at[0], part.at[1], part.at[2]] as Vec3,
    ...(part.rotation
      ? { rotation: [part.rotation[0], -part.rotation[1], -part.rotation[2]] as Vec3 }
      : {}),
  }))
}

/** The bounds of a whole list, for joining one assembly to another. */
export function listBounds(parts: readonly Part[]): Bounds | null {
  if (parts.length === 0) return null

  return parts.reduce<Bounds | null>((box, part) => {
    const next = partBounds(part)
    if (!box) return next

    return {
      minX: Math.min(box.minX, next.minX),
      maxX: Math.max(box.maxX, next.maxX),
      minY: Math.min(box.minY, next.minY),
      maxY: Math.max(box.maxY, next.maxY),
      minZ: Math.min(box.minZ, next.minZ),
      maxZ: Math.max(box.maxZ, next.maxZ),
    }
  }, null)
}
