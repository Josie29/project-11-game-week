/*
 * The figure itself: torso, limbs, hands, feet, head and the four starter
 * garments, as data.
 *
 * The form language comes off `art/refs/character_sheet.png` rather than out of
 * anyone's head. Every figure on that sheet is *rounded and tapered* — the
 * chest is wider than the waist, the shoulders slope, the thighs narrow to the
 * knee and the calves to the ankle, and there is not a hard corner anywhere on
 * a body. What shipped was a rectangular slab with capsules hanging off it,
 * which is why the capture that started this work reads as a crate with limbs.
 *
 * A body is a stack of segments rather than one list, because the rig animates:
 * the thigh turns at the hip and the forearm at the elbow, so each has to be in
 * its own frame. `restPoseSegments` is what puts them all back into the
 * character root's frame, which is the only place a question like "is the arm
 * attached to the shoulder" can be asked — and that one was a real bug, found
 * from a screenshot after every anchor test passed.
 */

import { Garment } from './appearance'
import { ColorRole, Finish, PartShape, type Part, type Vec3 } from './parts'
import { metricsFor, type BodyProportions, type Silhouette } from './proportions'

/** How much shallower a torso is than it is wide. Read off the reference sheet. */
function depthRatio(body: BodyProportions): number {
  return body.torsoDepth / body.torsoWidth
}

function limb(
  name: string,
  at: Vec3,
  size: Vec3,
  role: ColorRole,
  extra: Partial<Part> = {},
): Part {
  return {
    name,
    shape: PartShape.Cylinder,
    at,
    size,
    role,
    finish: Finish.Cloth,
    segments: 16,
    ...extra,
  }
}

function blob(name: string, at: Vec3, size: Vec3, role: ColorRole, extra: Partial<Part> = {}): Part {
  return {
    name,
    shape: PartShape.Sphere,
    at,
    size,
    role,
    finish: Finish.Matte,
    segments: 16,
    ...extra,
  }
}

export interface BodyOptions {
  readonly garment: Garment
  /** True when the lower body is a skirt or dress rather than two legs. */
  readonly hasSkirt: boolean
  /** Sits the figure: the skirt is shortened so it does not hang through a stool. */
  readonly seated: boolean
  /** Adds the house name badge. Staff only. */
  readonly staff: boolean
  /** A shop dummy: no face. */
  readonly mannequin: boolean
  /** An equipped gown draws its own floor-length skirt, so the garment's is dropped. */
  readonly suppressSkirt: boolean
  /**
   * Whether a bought jacket or gown is on over the top.
   *
   * The starter garment's own front — shirt panel, lapels, tie — is then not
   * drawn, because a jacket covers a shirt. That is worth doing for the look
   * alone, and it also removes a whole family of near-coincident planes: two
   * garments' fronts stacked on one chest put four panels within a few
   * millimetres of each other, and *which* pair collided changed with the
   * silhouette's depth ratio, so no single set of offsets satisfied all three.
   * The collar and neckline stay: a shirt still shows at the neck.
   */
  readonly coveredByOuterwear: boolean
  /**
   * Leaves the arms bare whatever the starter garment is.
   *
   * Set by a gown, which is sleeveless. Without it a gown worn over a suit
   * kept the suit's sleeves, so the figure wore a ballgown with a jacket's
   * arms — and the arms are the one part of an outfit the follow camera sees
   * most of.
   */
  readonly bareArms: boolean
}

export const DEFAULT_BODY_OPTIONS: BodyOptions = {
  garment: Garment.TeeAndJeans,
  hasSkirt: false,
  seated: false,
  staff: false,
  mannequin: false,
  suppressSkirt: false,
  coveredByOuterwear: false,
  bareArms: false,
}

/* ------------------------------------------------------------------- head */

/**
 * Where the surface of the skull sits at a given distance off the centre line.
 *
 * The head is an ellipsoid now, so the face is curved and a feature placed at a
 * flat `headDepth / 2` floats clear of the cheek the further out it goes. This
 * is what keeps an eye on the face at any head width — and it is the reason the
 * features can be spheres set into the skull rather than plates laid on it,
 * which is what they were.
 *
 * @param body Whose head.
 * @param x Distance from the centre line.
 * @returns The z at which the skull's surface sits there.
 */
export function faceSurfaceZ(body: BodyProportions, x: number): number {
  const halfWidth = body.headWidth / 2
  const ratio = Math.min(1, Math.abs(x) / halfWidth)

  return (body.headDepth / 2) * Math.sqrt(Math.max(0, 1 - ratio * ratio))
}

/* ------------------------------------------------------------------ torso */

/**
 * Everything from the hips up, in the torso group's frame — origin at the hip.
 *
 * @param body The measurements to build from.
 * @param options What is being worn and who is wearing it.
 * @returns The parts, in draw order.
 */
export function torsoParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const { torsoWidth: tw, torsoHeight: th, neckHeight: nh } = body
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body
  const squash: Vec3 = [1, 1, depthRatio(body)]

  const headY = th + nh + hh / 2
  const parts: Part[] = [
    /*
     * The torso as three tapered sections rather than one box.
     *
     * Hips, waist and chest, each a squashed cylinder taking its width from
     * the one below. The waist is the narrowest and the chest the widest,
     * which is the whole of the difference between a figure and a crate.
     */
    limb('hips', [0, th * 0.11, 0], [tw * 0.46, th * 0.24, tw * 0.48], ColorRole.Secondary, {
      scale: squash,
    }),
    limb('waist', [0, th * 0.36, 0], [tw * 0.44, th * 0.3, tw * 0.42], ColorRole.Primary, {
      scale: squash,
    }),
    limb('chest', [0, th * 0.68, 0], [tw * 0.5, th * 0.36, tw * 0.44], ColorRole.Primary, {
      scale: squash,
    }),
    // The yoke across the top, which the shoulders sit on.
    limb('yoke', [0, th * 0.9, 0], [tw * 0.42, th * 0.14, tw * 0.44], ColorRole.Primary, {
      scale: squash,
    }),
    // Sloped shoulders. Square ones are the other half of the crate problem.
    ...[1, -1].map((side) =>
      blob(
        side === 1 ? 'shoulder-right' : 'shoulder-left',
        [side * tw * 0.4, th * 0.9, 0],
        [tw * 0.13, th * 0.1, body.torsoDepth * 0.48],
        ColorRole.Primary,
        { finish: Finish.Cloth },
      ),
    ),

    limb('neck', [0, th + nh * 0.5, 0], [0.052, nh + 0.1, 0.058], ColorRole.Skin, {
      finish: Finish.Matte,
    }),
    // The skull, rounded. Its bounding box is unchanged, so hair still fits.
    blob('head', [0, headY, 0], [hw / 2, hh / 2, hd / 2], ColorRole.Skin, { segments: 24 }),
    // The jaw, which is what stops an ellipsoid head reading as an egg.
    blob('jaw', [0, th + nh + hh * 0.28, hd * 0.04], [hw * 0.42, hh * 0.23, hd * 0.44], ColorRole.Skin, {
      segments: 18,
    }),
    ...[1, -1].map((side) =>
      blob(
        side === 1 ? 'ear-right' : 'ear-left',
        [side * hw * 0.47, headY + hh * 0.02, -hd * 0.06],
        [hw * 0.06, hh * 0.11, hd * 0.09],
        ColorRole.Skin,
      ),
    ),
  ]

  if (!options.mannequin) {
    parts.push(...faceParts(body))
  }

  parts.push(...garmentParts(body, options))

  return parts
}

/**
 * Eyes, brows, nose and mouth, set into the skull rather than laid on it.
 *
 * All spheres, all sunk below the surface returned by `faceSurfaceZ`. The old
 * face was six flat plates floating one and two millimetres off a flat head,
 * which is the arrangement that reads as a sticker at any distance and which
 * put five separate pairs of coincident planes on the front of every character
 * in the game.
 */
function faceParts(body: BodyProportions): Part[] {
  const { torsoHeight: th, neckHeight: nh, headWidth: hw, headHeight: hh } = body

  const eyeX = hw * 0.25
  const eyeY = th + nh + hh * 0.62
  const eyeZ = faceSurfaceZ(body, eyeX) - 0.006

  return [
    ...[1, -1].flatMap((side) => [
      blob(
        side === 1 ? 'eye-right' : 'eye-left',
        [side * eyeX, eyeY, eyeZ],
        [hw * 0.105, hh * 0.045, 0.011],
        ColorRole.Sclera,
        { finish: Finish.Matte },
      ),
      blob(
        side === 1 ? 'pupil-right' : 'pupil-left',
        [side * eyeX, eyeY, eyeZ + 0.006],
        [hw * 0.042, hh * 0.032, 0.008],
        ColorRole.Pupil,
        { finish: Finish.Matte },
      ),
      blob(
        side === 1 ? 'brow-right' : 'brow-left',
        [side * eyeX, eyeY + hh * 0.13, eyeZ - 0.002],
        [hw * 0.13, hh * 0.028, 0.012],
        ColorRole.Hair,
        { finish: Finish.Cloth },
      ),
    ]),
    blob(
      'nose',
      [0, th + nh + hh * 0.49, faceSurfaceZ(body, 0) - 0.008],
      [hw * 0.075, hh * 0.09, 0.024],
      ColorRole.Skin,
    ),
    blob(
      'mouth',
      [0, th + nh + hh * 0.29, faceSurfaceZ(body, 0) - 0.014],
      [hw * 0.12, hh * 0.022, 0.014],
      ColorRole.Lip,
      { finish: Finish.Matte },
    ),
  ]
}

/**
 * The detail that tells one starter garment from another.
 *
 * Only what a given outfit actually has. A shirt panel on a tee reads as a bib
 * stuck to the chest, which is why this is a switch rather than a set of flags.
 */
function garmentParts(body: BodyProportions, options: BodyOptions): Part[] {
  const { torsoWidth: tw, torsoHeight: th, torsoDepth: td } = body
  const chestZ = tw * 0.5 * depthRatio(body)
  const parts: Part[] = []

  const hasShirt = options.garment === Garment.Suit || options.garment === Garment.ShirtAndSkirt
  /*
   * The front detail, on its own ladder of depth planes.
   *
   * Each panel is 8mm deep and they step 6mm apart, so no two of them ever
   * share a plane whatever the silhouette's proportions work out to. Hand-set
   * offsets did not survive three different depth ratios — the pair that
   * collided moved from one silhouette to the next.
   */
  /*
   * Each panel reaches back *into* the chest and stands a different distance
   * proud of it. Both halves matter: a panel that only sits in front of the
   * chest touches nothing and is reported adrift, and four panels sharing one
   * back face are four coincident planes. So the fronts step 6mm apart and the
   * backs step 2mm, and every panel is buried in the chest by at least 4mm.
   */
  const layerAt = (index: number): number =>
    (chestZ - 0.004 - index * 0.002 + (chestZ + 0.004 + index * 0.006)) / 2
  const layerDepth = (index: number): number => 0.008 + index * 0.008
  const showFront = hasShirt && !options.coveredByOuterwear

  if (showFront) {
    parts.push({
      name: 'shirt-panel',
      shape: PartShape.Box,
      at: [0, th * 0.61, layerAt(0)],
      size: [0.16, th * 0.48, layerDepth(0)],
      role: ColorRole.Shirt,
      finish: Finish.Cloth,
    })
  }

  if (options.garment === Garment.Suit && showFront) {
    parts.push(
      ...[1, -1].map<Part>((side) => ({
        name: side === 1 ? 'lapel-right' : 'lapel-left',
        shape: PartShape.Box,
        /*
         * Sunk further into the chest than it looks like it needs to be.
         *
         * A suit's own lapel and a tuxedo jacket's placket worn over it landed
         * within six tenths of a millimetre of the same plane, which is the
         * pair that strobes when someone buys a jacket. Deeper here costs
         * nothing — the lapel is still proud of the chest when no jacket is on.
         */
        at: [side * tw * 0.24, th * 0.68, layerAt(1)],
        size: [0.1, 0.26, layerDepth(1)],
        role: ColorRole.Trim,
        rotation: [0, 0, side * 0.28],
        finish: Finish.Cloth,
      })),
      {
        name: 'tie',
        shape: PartShape.Box,
        at: [0, th * 0.56, layerAt(2)],
        size: [0.052, th * 0.44, layerDepth(2)],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
      },
      {
        name: 'tie-knot',
        shape: PartShape.Box,
        at: [0, th * 0.85, layerAt(3)],
        size: [0.046, 0.052, layerDepth(3)],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
      },
    )
  }

  // A crew neck, which is all a tee has and all it should have.
  if (options.garment === Garment.TeeAndJeans || options.garment === Garment.Scrubs) {
    parts.push({
      name: 'neckline',
      shape: PartShape.Torus,
      at: [0, th * 0.96, 0],
      size: [0.072, 0.014, 0.072],
      role: ColorRole.Shirt,
      rotation: [Math.PI / 2, 0, 0],
      segments: 20,
      finish: Finish.Cloth,
      scale: [1, 1, depthRatio(body) + 0.18],
    })
  }

  // The collar every garment with a shirt under it shows at the back of the neck.
  if (hasShirt) {
    parts.push({
      name: 'collar',
      shape: PartShape.Torus,
      at: [0, th * 0.97, 0],
      size: [0.078, 0.017, 0.078],
      role: ColorRole.Shirt,
      rotation: [Math.PI / 2, 0, 0],
      segments: 20,
      finish: Finish.Cloth,
      scale: [1, 1, depthRatio(body) + 0.2],
    })
  }

  if (options.staff) {
    parts.push({
      name: 'badge',
      shape: PartShape.Box,
      at: [-tw * 0.24, th * 0.58, chestZ - 0.006],
      size: [0.07, 0.024, 0.022],
      role: ColorRole.Accent,
      finish: Finish.Metal,
    })
  }

  /*
   * The garment's own skirt.
   *
   * Suppressed when a gown is equipped, since that item draws a longer one of
   * its own. Suppressing on *any* outerwear is the bug that put a jacket over
   * a cocktail dress and left the character in bare legs.
   */
  if (options.hasSkirt && !options.suppressSkirt) {
    const length = options.seated ? 0.2 : 0.4

    parts.push({
      name: 'skirt',
      shape: PartShape.Cylinder,
      at: [0, th * 0.06 - length / 2, 0],
      /*
       * Wide enough at the waist to cover the top of the thigh.
       *
       * It was `tw * 0.44`, which is narrower than the hip joint plus the
       * thigh's own radius — so a wedge of bare leg showed at each hip, above
       * the hem and below the waist, on every skirted garment. Visible in any
       * front-on capture and in none of the tests, because a skirt and a leg
       * are in different segments and were only ever checked apart.
       */
      size: [tw * 0.6, length, tw * 0.74],
      role: ColorRole.Secondary,
      segments: 24,
      open: true,
      finish: Finish.Cloth,
      scale: [1, 1, depthRatio(body) + 0.1],
    })
  }

  void td
  return parts
}

/* ------------------------------------------------------------------- legs */

/** The thigh, in the hip joint's frame. Tapers from hip to knee. */
export function thighParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const role = options.hasSkirt ? ColorRole.Skin : ColorRole.Secondary

  return [
    limb('thigh', [0, -body.thigh / 2, 0], [0.095, body.thigh, 0.072], role, {
      finish: options.hasSkirt ? Finish.Matte : Finish.Cloth,
    }),
    blob('knee', [0, -body.thigh, 0], [0.07, 0.058, 0.07], role, {
      finish: options.hasSkirt ? Finish.Matte : Finish.Cloth,
    }),
  ]
}

/**
 * How far the ankle sits above the ground.
 *
 * `hipY` is `thigh + shin`, so a shin drawn its full length reaches the floor
 * and leaves nowhere for a foot — every foot then hangs below the ground. The
 * shin stops here instead and the foot fills what is left, which is also what
 * a leg actually does.
 */
const ANKLE_HEIGHT = 0.075

/** The shin, in the knee joint's frame. Tapers from knee to ankle. */
export function shinParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const role = options.hasSkirt ? ColorRole.Skin : ColorRole.Secondary
  const finish = options.hasSkirt ? Finish.Matte : Finish.Cloth

  // Overshoots the ankle a little so the foot has something to join into.
  const length = body.shin - ANKLE_HEIGHT + 0.02

  return [
    limb('shin', [0, -length / 2, 0], [0.066, length, 0.044], role, { finish }),
    // The calf, which is what makes a leg read as a leg rather than a pipe.
    blob('calf', [0, -length * 0.36, -0.014], [0.058, length * 0.3, 0.054], role, { finish }),
    blob('ankle', [0, -length + 0.014, 0], [0.046, 0.034, 0.046], ColorRole.Skin, {
      finish: Finish.Matte,
    }),
  ]
}

/**
 * The bare foot, worn when no shoes have been bought.
 *
 * In the knee joint's frame, like the shin it hangs off. Rounded, because the
 * box that used to do this job was buried in the shin capsule with its corners
 * poking out at the ankle — which is visible in the very capture this work
 * started from.
 */
export function footParts(body: BodyProportions): readonly Part[] {
  /*
   * The floor, in the ankle joint's frame — which is to say, right here.
   *
   * These used to be measured from the knee, so every offset carried a
   * `-body.shin`. That is harmless while the ankle never bends, and the moment
   * it did — the clinic's recliner lays the leg out — rotating the foot swung
   * it through an arc a whole shin long rather than turning it on the spot,
   * and both shoes ended up inside the footrest.
   */
  const floor = 0

  return [
    blob('foot', [0, floor + 0.038, 0.045], [0.05, 0.03, 0.1], ColorRole.Shoes, {
      finish: Finish.Leather,
    }),
    blob('heel-cup', [0, floor + 0.042, -0.018], [0.044, 0.036, 0.04], ColorRole.Shoes, {
      finish: Finish.Leather,
    }),
    {
      name: 'foot-sole',
      shape: PartShape.Box,
      at: [0, floor + 0.011, 0.04],
      size: [0.096, 0.022, 0.2],
      role: ColorRole.Shoes,
      finish: Finish.Leather,
    },
  ]
}

/* ------------------------------------------------------------------- arms */

/** The upper arm, in the shoulder joint's frame. */
export function upperArmParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  // A sleeveless dress, or a gown worn over the top, leaves the arm bare.
  const sleeved = !options.bareArms && options.garment !== Garment.CocktailDress
  const role = sleeved ? ColorRole.Primary : ColorRole.Skin

  return [
    limb('upper-arm', [0, -body.upperArm / 2, 0], [0.058, body.upperArm, 0.046], role, {
      finish: sleeved ? Finish.Cloth : Finish.Matte,
    }),
    blob('elbow', [0, -body.upperArm, 0], [0.045, 0.04, 0.045], role, {
      finish: sleeved ? Finish.Cloth : Finish.Matte,
    }),
  ]
}

/** The forearm, in the elbow joint's frame. */
export function forearmParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const sleeved =
    !options.bareArms && (options.garment === Garment.Suit || options.garment === Garment.Scrubs)
  const role = sleeved ? ColorRole.Primary : ColorRole.Skin

  return [
    limb('forearm', [0, -body.forearm / 2, 0], [0.044, body.forearm, 0.034], role, {
      finish: sleeved ? Finish.Cloth : Finish.Matte,
    }),
    // The cuff, where a sleeve ends and the wrist begins.
    limb('cuff', [0, -body.forearm + 0.024, 0], [0.038, 0.036, 0.038], ColorRole.Shirt, {
      finish: Finish.Cloth,
    }),
  ]
}

/**
 * The hand, in the wrist's frame.
 *
 * Two fingers rather than five, extended, because the blackjack hand signals
 * are a double finger-tap and a flat wave and those are the only shapes a hand
 * on this character ever has to make.
 */
export function handParts(side: 1 | -1): readonly Part[] {
  return [
    blob('palm', [0, -0.048, 0.004], [0.042, 0.046, 0.026], ColorRole.Skin),
    ...[-0.021, 0.021].map((offset, index) =>
      blob(
        `finger-${index}`,
        [offset, -0.104, 0.01],
        [0.012, 0.035, 0.013],
        ColorRole.Skin,
      ),
    ),
    blob('thumb', [side * -0.038, -0.066, 0.016], [0.013, 0.026, 0.014], ColorRole.Skin, {
      rotation: [0, 0, side * 0.5],
    }),
  ]
}

/* --------------------------------------------------------- the whole thing */

/** One animated piece of the rig, and where its frame sits in the rest pose. */
export interface RestSegment {
  readonly name: string
  /** The segment's origin in the character root's frame, feet at y = 0. */
  readonly origin: Vec3
  readonly parts: readonly Part[]
}

/**
 * Every segment of the figure, with the origin its frame sits at when standing.
 *
 * This is what lets the whole character be checked as one object. Each segment
 * is authored and animated in its own frame, so nothing inside `thighParts`
 * can know whether it meets the hip — and "the arms hang inside the torso" was
 * a real bug that every existing anchor test passed while the figure rendered
 * armless.
 *
 * The rest pose specifically: joints at zero. That is the pose in which a gap
 * between two segments is a modelling error rather than an animation artefact.
 */
export function restPoseSegments(
  silhouette: Silhouette,
  body: BodyProportions,
  options: BodyOptions = DEFAULT_BODY_OPTIONS,
): readonly RestSegment[] {
  const metrics = metricsFor(silhouette)
  const kneeY = metrics.hipY - body.thigh

  const segments: RestSegment[] = [
    { name: 'torso', origin: [0, metrics.hipY, 0], parts: torsoParts(body, options) },
  ]

  for (const side of [1, -1] as const) {
    const label = side === 1 ? 'right' : 'left'

    segments.push(
      {
        name: `thigh-${label}`,
        origin: [side * body.hipWidth, metrics.hipY, 0],
        parts: thighParts(body, options),
      },
      {
        name: `shin-${label}`,
        origin: [side * body.hipWidth, kneeY, 0],
        parts: shinParts(body, options),
      },
      {
        name: `foot-${label}`,
        origin: [side * body.hipWidth, kneeY - body.shin, 0],
        parts: footParts(body),
      },
      {
        name: `upper-arm-${label}`,
        origin: [side * body.shoulderX, metrics.shoulderY, 0],
        parts: upperArmParts(body, options),
      },
      {
        name: `forearm-${label}`,
        origin: [side * body.shoulderX, metrics.shoulderY - body.upperArm, 0],
        parts: forearmParts(body, options),
      },
      {
        name: `hand-${label}`,
        origin: [side * body.shoulderX, metrics.shoulderY - body.upperArm - body.forearm, 0],
        parts: handParts(side),
      },
    )
  }

  return segments
}
