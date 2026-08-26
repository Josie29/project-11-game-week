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
import {
  ColorRole,
  Finish,
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
 * The shell every style is built on.
 *
 * An ellipsoid rather than the box it used to be. The box was the single
 * biggest reason the head read as blocky: it met the skull's flat faces at
 * four hard corners, and at the millimetre offsets it was authored at, those
 * corners strobed against the skull as the figure turned. A rounded shell sunk
 * well into the skull has no coincident face with it at all.
 *
 * @param body The head this sits on.
 * @param thickness How far the shell stands proud of the skull, as a fraction
 *   of head width. A buzz is barely there; a bob has real volume.
 * @param lift How far up the shell rides, as a fraction of head height.
 */
function cap(body: BodyProportions, thickness: number, lift = 0.1): Part {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  /*
   * Pushed back off the face rather than centred on the skull.
   *
   * A shell centred on the head reaches the face plane, and at a buzz's
   * thickness it landed a single millimetre proud of it — which the surface
   * check caught on its first run. Hair stops at the hairline; the styles that
   * come forward of it do so with a fringe, which is a separate piece.
   */
  return strand(
    'cap',
    PartShape.Sphere,
    [0, hh * lift, -hd * 0.1],
    [hw * (0.53 + thickness), hh * (0.44 + thickness), hd * (0.46 + thickness)],
    { segments: 20 },
  )
}

/**
 * Hair falling over the brow.
 *
 * A flattened ellipsoid pushed into the front of the cap, not a slab laid on
 * the face. `drop` is how far down the forehead it reaches.
 */
function fringe(body: BodyProportions, drop: number): Part {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  /*
   * Held narrower than the skull and stopped below the crown.
   *
   * Both matter: at full head width its side faces landed on the skull's, and
   * at its first height its top face landed exactly on the crown — two
   * coincident planes, which is the one gap a depth buffer genuinely cannot
   * resolve. A fringe sits between the temples and under the cap anyway, so
   * being visibly inside both is also what it should look like.
   */
  return strand(
    'fringe',
    PartShape.Sphere,
    [0, hh * (0.3 - drop * 0.4), hd * 0.24],
    [hw * 0.46, hh * (0.14 + drop * 0.4), hd * 0.4],
    { segments: 18 },
  )
}

/**
 * A panel of hair down each side of the head.
 *
 * Tapered cylinders rather than boxes: a bob's ends are round, and the flat
 * box that used to draw them met the cap's flat side at very nearly the same
 * plane, which is precisely the gap that fights. `length` is measured from the
 * temple down.
 */
function sides(
  body: BodyProportions,
  thickness: number,
  length: number,
  capThickness: number,
): Part[] {
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body

  /*
   * Placed relative to the cap rather than to the head.
   *
   * Positioned against the head, a panel's outer face landed on the cap's
   * outer face for exactly those styles where the two thicknesses happened to
   * differ by the offset — which is a coincidence waiting in every future
   * style anyone adds. Deriving the panel from the shell it hangs off makes
   * the clearance the same on all eight, whatever thicknesses they choose.
   */
  const outerX = hw * (0.57 + capThickness)

  return [1, -1].map((side) =>
    strand(
      side === 1 ? 'side-right' : 'side-left',
      PartShape.Cylinder,
      [side * (outerX - hw * thickness), hh * (0.2 - length / 2), -hd * 0.05],
      [hw * thickness, hh * length, hw * thickness * 0.82],
      { segments: 14 },
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

  switch (style) {
    case HairStyle.Buzz:
      // Barely more than a shadow on the scalp. No fringe, no sides — the
      // shell alone, hugging the skull.
      return [cap(body, 0.035)]

    case HairStyle.Crop:
      return [cap(body, 0.06), fringe(body, 0.22), ...sides(body, 0.13, 0.5, 0.06)]

    case HairStyle.Pompadour:
      return [
        cap(body, 0.06),
        ...sides(body, 0.12, 0.62, 0.06),
        /*
         * The volume that makes the style: swept up and back off the brow.
         *
         * One rounded mass rather than a turned cylinder. The cylinder version
         * was authored with a two-axis rotation and, seen from behind, read as
         * a flat rectangular flag standing up beside the head — which is
         * exactly the class of defect that only a back view finds, and there
         * was no way to take one until now.
         */
        strand(
          'pomp',
          PartShape.Sphere,
          [0, hh * 0.44, hd * 0.14],
          [hw * 0.46, hh * 0.26, hd * 0.44],
          { segments: 20 },
        ),
        strand(
          'pomp-root',
          PartShape.Sphere,
          [0, hh * 0.3, hd * 0.19],
          [hw * 0.44, hh * 0.17, hd * 0.27],
          { segments: 16 },
        ),
      ]

    case HairStyle.Bob:
      return [
        cap(body, 0.09),
        fringe(body, 0.3),
        // Squared off at the jaw, which is what separates a bob from long.
        ...sides(body, 0.2, 1.05, 0.09),
        // The back of a bob is a single mass, not two panels with a gap.
        strand(
          'bob-back',
          PartShape.Sphere,
          [0, -hh * 0.16, -hd * 0.36],
          [hw * 0.52, hh * 0.6, hd * 0.34],
          { segments: 18 },
        ),
      ]

    case HairStyle.Long:
      return [
        cap(body, 0.08),
        fringe(body, 0.26),
        ...sides(body, 0.2, 1.7, 0.08),
        /*
         * The fall down the back, which is what reads from the strip camera.
         *
         * Tapered — wide at the shoulders, narrowing to the ends — and joined
         * into the cap rather than starting below it. The old version was a
         * flat box whose top edge stopped a centimetre short of the skull, so
         * from behind the hair was a plank floating off the neck.
         */
        strand(
          'fall',
          PartShape.Cylinder,
          [0, -hh * 0.62, -hd * 0.45],
          [hw * 0.54, hh * 1.9, hw * 0.42],
          { segments: 16 },
        ),
        strand(
          'fall-tip',
          PartShape.Sphere,
          [0, -hh * 1.5, -hd * 0.45],
          [hw * 0.4, hh * 0.2, hw * 0.3],
          { segments: 14 },
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
       * the cap, the fall starts inside the gather, and the tie wraps the two
       * — and `hairParts.test.ts` now fails if any of that stops being true.
       */
      return [
        cap(body, 0.05),
        ...sides(body, 0.11, 0.44, 0.05),
        // Swept back off the face, which is what a ponytail does to a fringe.
        strand(
          'sweep',
          PartShape.Sphere,
          [0, hh * 0.3, hd * 0.1],
          [hw * 0.47, hh * 0.22, hd * 0.42],
          { segments: 16 },
        ),
        // Gathered at the back of the crown, sunk into the shell.
        strand(
          'gather',
          PartShape.Sphere,
          [0, hh * 0.18, -hd * 0.5],
          [hw * 0.22, hh * 0.19, hd * 0.2],
          { segments: 16 },
        ),
        // The tie, which is what makes the gather read as gathered.
        strand(
          'tie',
          PartShape.Torus,
          [0, hh * 0.16, -hd * 0.56],
          [hw * 0.13, hw * 0.035, hw * 0.13],
          { rotation: [Math.PI / 2, 0, 0] as Vec3, segments: 16 },
        ),
        /*
         * The fall itself: tapered, hanging down and back from inside the tie.
         *
         * Its top is *inside* the gather rather than abutting it — the join is
         * an overlap of several centimetres, so there is no seam to find from
         * any angle the new stage can be turned to.
         */
        strand(
          'tail',
          PartShape.Cylinder,
          [0, -hh * 0.5, -hd * 0.72],
          [hw * 0.2, hh * 1.7, hw * 0.1],
          { rotation: [0.28, 0, 0] as Vec3, segments: 16 },
        ),
        strand(
          'tail-tip',
          PartShape.Sphere,
          [0, -hh * 1.3, -hd * 0.99],
          [hw * 0.11, hh * 0.11, hw * 0.11],
          { segments: 12 },
        ),
      ]

    case HairStyle.Updo:
      return [
        cap(body, 0.05),
        ...sides(body, 0.1, 0.36, 0.05),
        strand(
          'sweep',
          PartShape.Sphere,
          [0, hh * 0.28, hd * 0.08],
          [hw * 0.47, hh * 0.19, hd * 0.44],
          { segments: 16 },
        ),
        // Pinned high and back — the bun is the whole silhouette.
        strand(
          'bun',
          PartShape.Sphere,
          [0, hh * 0.5, -hd * 0.3],
          [hw * 0.36, hh * 0.32, hd * 0.34],
          { segments: 20 },
        ),
        // The wrap around its base, so the bun reads as coiled rather than stuck on.
        strand(
          'bun-wrap',
          PartShape.Torus,
          [0, hh * 0.4, -hd * 0.22],
          [hw * 0.27, hw * 0.055, hw * 0.27],
          { rotation: [Math.PI / 2, 0, 0] as Vec3, segments: 18 },
        ),
      ]

    case HairStyle.Coils: {
      /*
       * Coils hanging all over the head, not a ring of beads round the crown.
       *
       * The old version put eight spheres in a circle at the top of the skull,
       * which reads as a laurel wreath. `art/refs/hair_sheet.png` has the whole
       * head covered and the coils falling to the jaw, so these are columns
       * that start inside the shell and hang below it.
       *
       * Each column's length varies with its index. That is partly because real
       * coils are not uniform, and partly because twelve cylinders cut to
       * exactly the same length share exactly the same end planes — which the
       * surface check would rightly call a conflict.
       */
      const coils = Array.from({ length: 12 }, (_, index) => {
        const angle = (index / 12) * Math.PI * 2
        const length = hh * (0.94 + (index % 3) * 0.07)
        // Roots at slightly different heights as well as different lengths.
        // Once the coils were fat enough to touch, twelve cut to the same top
        // put twelve cylinder caps on one plane — buried inside the shell, but
        // the check is right to refuse it and real coils are not level anyway.
        const root = hh * (0.1 + (index % 4) * 0.02)

        return strand(
          `coil-${index}`,
          PartShape.Cylinder,
          [
            Math.sin(angle) * hw * 0.46,
            root - length / 2,
            Math.cos(angle) * hd * 0.46 - hd * 0.08,
          ],
          [hw * 0.135, length, hw * 0.1],
          { segments: 10 },
        )
      })

      return [cap(body, 0.13), ...coils]
    }
  }
}
