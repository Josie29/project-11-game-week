/*
 * The eight styles on `art/refs/hair_sheet.png`, as data.
 *
 * Authored in the *head's* own frame — origin at the centre of the skull, +Y
 * up, +Z out through the face — rather than in the torso's. Hair is the one
 * assembly on the character that is entirely about the head, and measuring it
 * from the hip meant every position was a sum of three unrelated numbers with
 * the interesting one buried at the end. Here "the fringe sits at the front of
 * the head" is `z: hd * 0.4`, and a reader can tell at a glance whether that is
 * on the face or behind it.
 *
 * It also makes the assertion that matters expressible in one line. The skull
 * is a box at this origin, so `floatingParts(hairParts(style, body), [skull])`
 * is the whole of "is this hair attached to the head", and it is what the
 * previous ponytail — a capsule and a sphere hanging in space behind an
 * otherwise correct anchor — would have failed.
 *
 * Every dimension is a fraction of the head it sits on, never a constant. The
 * three silhouettes have three different skulls, and a fringe authored against
 * the largest is buried in the brow of the smallest.
 */

import { HairStyle } from './appearance'
import { faceParts, faceSurfaceZ } from './face'
import {
  ColorRole,
  containsPoint,
  Finish,
  partHalfExtents,
  PartShape,
  type Bounds,
  type Part,
  type Vec3,
} from './parts'
import type { BodyProportions } from './proportions'

/** The skull, in the frame hair is authored in. What hair must be attached to. */
export function skullBounds(body: BodyProportions): Bounds {
  return {
    minX: -body.headWidth / 2,
    maxX: body.headWidth / 2,
    minY: -body.headHeight / 2,
    maxY: body.headHeight / 2,
    minZ: -body.headDepth / 2,
    maxZ: body.headDepth / 2,
  }
}

/** Hair is one colour throughout, and always the same finish. */
function strand(
  name: string,
  shape: PartShape,
  at: Vec3,
  size: Vec3,
  extra: Partial<Part> = {},
): Part {
  return {
    name,
    shape,
    at,
    size,
    role: ColorRole.Hair,
    finish: Finish.Cloth,
    ...extra,
  }
}

/**
 * The shell every style is built on: the skull, enlarged and pushed back.
 *
 * This replaces a cap and a separate fringe, and the merge is the point. Two
 * shells crossing the skull at two shallow angles produced a hairline that was
 * a visible sawtooth on all eight styles — the boundary between two tessellated
 * surfaces meeting nearly tangentially moves a long way for a very small error,
 * and no segment count made it clean.
 *
 * One shell has one boundary, and where that boundary falls is arithmetic
 * rather than a guess. Enlarge the skull by `thickness` and push it back by
 * exactly the amount that makes its front surface break the skull's at the
 * hairline: everything above the hairline is hair, everything below is
 * forehead, and the curve between them runs lower at the temples than at the
 * centre, which is the shape a hairline actually has.
 *
 * A fringe, in this arrangement, is simply a lower hairline. That is also what
 * a fringe is.
 *
 * @param body The head this sits on.
 * @param thickness How far the shell stands proud of the skull, as a fraction
 *   of the skull. A buzz is barely there; an afro has real volume.
 * @param lift How far up the shell rides, in half-head-heights — where the
 *   volume sits.
 * @param hairline Where the shell breaks the surface at the centre line, in
 *   half-head-heights above the head's centre. Must clear the brow;
 *   `partsOverFace` holds every style to it.
 */
function cap(body: BodyProportions, thickness: number, lift: number, hairline: number): Part {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  const radius = 1 + thickness
  /*
   * Two ellipsoids sharing a shape and differing only in size and position
   * cross on a plane, so the depth offset is not a taste decision: given where
   * the hairline has to be, there is exactly one value that puts the crossing
   * there.
   */
  const back = Math.sqrt(1 - hairline * hairline) - Math.sqrt(radius ** 2 - (hairline - lift) ** 2)

  return strand(
    'cap',
    PartShape.Sphere,
    [0, (hh / 2) * lift, (hd / 2) * back],
    [(hw / 2) * radius, (hh / 2) * radius, (hd / 2) * radius],
    /*
     * A very high segment count, and it earns every one of them.
     *
     * This surface meets the skull at a shallow angle, so the polygon boundary
     * between hair and forehead moves a long way for a small error: the
     * hairline came out as a visible sawtooth on all eight styles at 20
     * segments and was still ragged at 40. It is the one place on the figure
     * where tessellation is load-bearing rather than cosmetic.
     */
    { segments: 96 },
  )
}

/** How far out the cap's surface reaches at the temple, for hanging panels off. */
function capOuterX(body: BodyProportions, thickness: number): number {
  return (body.headWidth / 2) * (1 + thickness)
}

/**
 * A panel of hair down each side of the head.
 *
 * Tapered cylinders rather than boxes: a bob's ends are round, and the flat box
 * that used to draw them met the cap's flat side at very nearly the same plane,
 * which is precisely the gap that fights. `length` is measured from the temple
 * down, in half-head-heights.
 */
function sides(
  body: BodyProportions,
  thickness: number,
  length: number,
  capThickness: number,
): Part[] {
  const { headHeight: hh, headDepth: hd } = body
  const half = hh / 2

  // Derived from the shell it hangs off rather than from the head, so the
  // clearance is the same on every style whatever thickness it chose.
  const outer = capOuterX(body, capThickness) * 0.99
  const radius = body.headWidth * thickness

  return [1, -1].map((side) =>
    strand(
      side === 1 ? 'side-right' : 'side-left',
      /*
       * Capsules, not cylinders.
       *
       * A hanging cylinder is a rectangle in silhouette however many segments
       * it has, and two of them beside a round head read as flat boards
       * bolted on. Rounding the ends is the whole difference between a panel
       * of hair and a plank.
       */
      PartShape.Capsule,
      /*
       * Set back off the cheek rather than level with it. Hair at the temple
       * sits behind the cheekbone; level with it, these panels read as
       * sideburn slabs beside the eyes.
       */
      [side * (outer - radius), half * (0.3 - length / 2), -hd * 0.14],
      [radius, Math.max(0.001, half * length - radius * 2), radius],
      { segments: 18 },
    ),
  )
}

/**
 * Every piece of one hairstyle, in the head's frame.
 *
 * @param style Which of the eight styles to build.
 * @param body The head it is being fitted to.
 * @returns The parts, in draw order. Guaranteed non-empty: every style has at
 *   least a cap, so a save naming a since-removed style produces hair rather
 *   than a bald patch once `sanitizeAppearance` has mapped it back.
 */
export function hairParts(style: HairStyle, body: BodyProportions): readonly Part[] {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body
  const half = hh / 2

  switch (style) {
    case HairStyle.Buzz:
      // Barely more than a shadow on the scalp, and a high hairline.
      return [cap(body, 0.03, 0.04, 0.46)]

    case HairStyle.Crop:
      return [cap(body, 0.07, 0.1, 0.44), ...sides(body, 0.11, 0.5, 0.07)]

    case HairStyle.Pompadour:
      return [
        cap(body, 0.07, 0.1, 0.46),
        ...sides(body, 0.1, 0.42, 0.07),
        /*
         * The volume that makes the style: swept up and forward off the brow.
         *
         * One rounded mass rather than a turned cylinder. The cylinder version
         * was authored with a two-axis rotation and, seen from behind, read as
         * a flat rectangular flag standing up beside the head — exactly the
         * class of defect that only a back view finds.
         */
        /*
         * Swept up and back off the brow, in two stacked masses.
         *
         * A single ellipsoid laid across the top of the head is a beret, which
         * is what the first two attempts at this were. What makes a pompadour
         * is that it is *tall at the front and falls away behind*, so the front
         * mass sits higher and further forward than the one behind it.
         */
        strand(
          'quiff',
          PartShape.Sphere,
          [0, half * 0.98, hd * 0.29],
          [hw * 0.3, hh * 0.2, hd * 0.24],
          { segments: 24 },
        ),
        strand(
          'quiff-root',
          PartShape.Sphere,
          [0, half * 0.68, hd * 0.3],
          [hw * 0.31, hh * 0.15, hd * 0.18],
          { segments: 20 },
        ),
      ]

    case HairStyle.Bob:
      return [
        // The low hairline is the fringe.
        cap(body, 0.09, 0.12, 0.315),
        // Squared off at the jaw, which is what separates a bob from long.
        ...sides(body, 0.19, 1.1, 0.09),
        // The back of a bob is a single mass, not two panels with a gap.
        strand(
          'bob-back',
          PartShape.Sphere,
          [0, -half * 0.34, -hd * 0.27],
          [hw * 0.48, hh * 0.3, hd * 0.3],
          { segments: 22 },
        ),
      ]

    case HairStyle.Long:
      return [
        cap(body, 0.085, 0.12, 0.33),
        ...sides(body, 0.19, 1.9, 0.085),
        /*
         * The fall down the back, which is what reads from the strip camera.
         *
         * Flattened against the back, not a column standing off it: a round
         * cylinder a fifth of a metre across, centred most of a head-depth
         * behind the skull, projected seven centimetres past the back of the
         * head and read as a plank bolted to the neck. Hair lies on a back.
         */
        /*
         * Tapered hard, and rounded at the end.
         *
         * A straight squashed cylinder is a rectangle in silhouette from
         * behind — which is the one angle this piece exists to be seen from,
         * and it read as a plank. Narrowing it toward the ends and capping it
         * with a rounded tip is what makes it hair.
         */
        strand(
          'fall',
          PartShape.Cylinder,
          [0, -half * 1.18, -hd * 0.34],
          [hw * 0.48, hh * 1.6, hw * 0.3],
          { segments: 22, scale: [1, 1, 0.46] as Vec3 },
        ),
        strand(
          'fall-tip',
          PartShape.Sphere,
          [0, -half * 2.85, -hd * 0.34],
          [hw * 0.31, hh * 0.16, hw * 0.15],
          { segments: 18 },
        ),
      ]

    case HairStyle.Ponytail:
      /*
       * The style this whole rebuild started from.
       *
       * What shipped was a capsule at a fixed offset behind the head and a
       * sphere at another, neither touching the skull or each other: from
       * behind it read as a limb growing out of the neck, with a bead floating
       * above the crown. Every piece below is joined — the gather is sunk into
       * the cap, the fall starts inside the gather, and the tie wraps the two.
       */
      return [
        cap(body, 0.05, 0.08, 0.44),
        ...sides(body, 0.09, 0.4, 0.05),
        // Gathered at the back of the crown, sunk into the shell.
        strand(
          'gather',
          PartShape.Sphere,
          [0, half * 0.36, -hd * 0.5],
          [hw * 0.2, hh * 0.17, hd * 0.2],
          { segments: 18 },
        ),
        // The tie, which is what makes the gather read as gathered.
        strand(
          'tie',
          PartShape.Torus,
          [0, half * 0.32, -hd * 0.56],
          [hw * 0.15, hw * 0.03, hw * 0.15],
          { rotation: [Math.PI / 2, 0, 0] as Vec3, segments: 18 },
        ),
        /*
         * The fall itself: tapered, hanging down and back from inside the tie.
         * Its top is *inside* the gather rather than abutting it, so there is
         * no seam to find from any angle the stage can be turned to.
         */
        strand(
          'tail',
          PartShape.Cylinder,
          [0, -half * 0.94, -hd * 0.6],
          [hw * 0.24, hh * 1.4, hw * 0.12],
          { rotation: [0.28, 0, 0] as Vec3, segments: 20 },
        ),
        strand(
          'tail-tip',
          PartShape.Sphere,
          [0, -half * 2.44, -hd * 0.85],
          [hw * 0.13, hh * 0.1, hw * 0.13],
          { segments: 16 },
        ),
      ]

    case HairStyle.Updo:
      return [
        cap(body, 0.05, 0.08, 0.46),
        ...sides(body, 0.085, 0.32, 0.05),
        // Pinned high and back — the bun is the whole silhouette.
        strand(
          'bun',
          PartShape.Sphere,
          [0, half * 1.0, -hd * 0.3],
          [hw * 0.32, hh * 0.26, hd * 0.32],
          { segments: 24 },
        ),
        // The wrap around its base, so the bun reads as coiled rather than stuck on.
        strand(
          'bun-wrap',
          PartShape.Torus,
          [0, half * 0.8, -hd * 0.22],
          [hw * 0.25, hw * 0.05, hw * 0.25],
          { rotation: [Math.PI / 2, 0, 0] as Vec3, segments: 20 },
        ),
      ]

    case HairStyle.Coils: {
      /*
       * Coils standing proud of the shell, not buried in it.
       *
       * Two earlier versions failed for opposite reasons: eight spheres in a
       * ring round the crown read as a laurel wreath, and twelve columns on a
       * radius *inside* a thick cap were invisible — the style came out as a
       * bob. The shell is deliberately thin here so the coils themselves are
       * the silhouette, which is what `art/refs/hair_sheet.png` shows.
       *
       * The face is not part of the ring. Spread evenly, four of them fall
       * straight down the front of the head, with one over each eye and one
       * across the mouth.
       */
      const capThickness = 0.05
      const frontGap = 1.15
      const arc = Math.PI * 2 - frontGap * 2
      const ring = capOuterX(body, capThickness) * 0.9

      const coils = Array.from({ length: 14 }, (_, index) => {
        const angle = frontGap + ((index + 0.5) / 14) * arc
        /*
         * Lengths and roots vary with the index. Partly because real coils are
         * not uniform, and partly because columns cut to exactly one length
         * share exactly one pair of end planes, which the surface check is
         * right to refuse.
         */
        const length = half * (1.0 + (index % 3) * 0.16)
        const root = half * (0.62 + (index % 4) * 0.05)

        return strand(
          `coil-${index}`,
          // Rounded, for the same reason the side panels are: a cylinder hung
          // beside a head is a rectangle from every angle that matters.
          PartShape.Capsule,
          [
            Math.sin(angle) * ring,
            root - length / 2,
            Math.cos(angle) * ring * (hd / hw) - hd * 0.06,
          ],
          [hw * 0.135, Math.max(0.001, length - hw * 0.27), hw * 0.135],
          { segments: 12 },
        )
      })

      return [cap(body, capThickness, 0.1, 0.38), ...coils]
    }
  }
}

/*
 * How finely each feature is sampled when asking whether hair is covering it.
 *
 * Coarse on purpose. This is looking for a coil across the mouth or a fringe
 * over the eyes, not for a strand grazing a lash, and a grid this size runs
 * eight styles across three silhouettes in a millisecond.
 */
const FEATURE_SAMPLES = 4

/** How far off a feature a sample sits. Hair touching it is fine; hair in front of it is not. */
const OVER_FACE_CLEARANCE = 0.003

/**
 * The features a hairstyle must never cover.
 *
 * Brows are not on the list, deliberately. A fringe over the eyebrows is a
 * haircut — half the styles on `art/refs/hair_sheet.png` have one — and hair
 * hides a hair-coloured feature to no ill effect. A fringe over the *eyes* is
 * a bug, and so is a coil across the mouth.
 */
const COVERABLE = ['brow-right', 'brow-left']

/**
 * Which pieces of a hairstyle are hanging in front of the face.
 *
 * The predicate the audit needed and did not have. Hair was checked against the
 * skull's bounding box, which a fringe over the eyes passes without difficulty
 * — it is on the head, it is attached, and it is covering the face. Four of the
 * eight styles were doing it and the only way to find out was to look.
 *
 * Sampled on the features themselves rather than inside a box drawn across the
 * face. The box was the first attempt and it condemned every style there is:
 * a hairline legitimately dips at the temples, and any rectangle wide enough
 * to hold the eyes also holds the patch of temple beside them.
 *
 * @param parts A hairstyle, in the head's frame.
 * @param body The head it is on.
 * @returns The names of the offending pieces, in the order given.
 */
export function partsOverFace(parts: readonly Part[], body: BodyProportions): string[] {
  const offenders: string[] = []

  const features = faceParts(body).filter((part) => !COVERABLE.includes(part.name))

  for (const part of parts) {
    let covering = false

    for (const feature of features) {
      const [hx, hy, hz] = partHalfExtents(feature)

      for (let ix = 0; ix < FEATURE_SAMPLES && !covering; ix += 1) {
        const x = feature.at[0] + (ix / (FEATURE_SAMPLES - 1) - 0.5) * 2 * hx * 0.9

        for (let iy = 0; iy < FEATURE_SAMPLES && !covering; iy += 1) {
          const y = feature.at[1] + (iy / (FEATURE_SAMPLES - 1) - 0.5) * 2 * hy * 0.9
          const front = feature.at[2] + hz

          /*
           * Corners of a flat panel on a curved head sit *inside* the skull,
           * and hair inside a skull is not covering anything. Without this the
           * check condemned a buzz cut for the crime of existing behind the
           * inner corner of an eye.
           */
          if (front <= faceSurfaceZ(body, x, y)) continue

          if (containsPoint(part, [x, y, front + OVER_FACE_CLEARANCE])) covering = true
        }
      }

      if (covering) break
    }

    if (covering) offenders.push(part.name)
  }

  return offenders
}
