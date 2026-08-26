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
import { earParts, faceParts } from './face'
import {
  ColorRole,
  Finish,
  PartShape,
  translateParts,
  type Part,
  type Vec3,
} from './parts'
import {
  metricsFor,
  SHOULDER_TORSO_FRACTION,
  type BodyProportions,
  type Silhouette,
} from './proportions'

/** How much shallower a torso is than it is wide. Read off the reference sheet. */
function depthRatio(body: BodyProportions): number {
  return body.torsoDepth / body.torsoWidth
}

/*
 * Limb thicknesses, as fractions of the torso they hang off.
 *
 * They were absolute constants — a 0.058 arm and a 0.095 thigh, the same on
 * every figure — which is exactly the trap `proportions.ts` was pulled out of
 * `CasinoCharacter` to escape. Two consequences, both visible: the broad
 * silhouette and the narrow one had identical limbs, so half of what makes
 * them different bodies was thrown away below the shoulder; and when the
 * figure was restyled chunkier the limbs stayed at their old width and the
 * result was a heavy torso on wire legs.
 *
 * A fraction of the torso is the honest relationship. The narrow figure gets
 * narrow limbs for free, and a change to the build carries all the way down.
 */
const ARM_RADIUS = 0.21
const FOREARM_RADIUS = 0.165
const THIGH_RADIUS = 0.25
const SHIN_RADIUS = 0.225

/** The upper arm's radius, which the shoulder and every sleeve are sized from. */
export function armRadius(body: BodyProportions): number {
  return body.torsoWidth * ARM_RADIUS
}

/** The forearm's radius, which the cuff, the hand and a worn watch are sized from. */
export function forearmRadius(body: BodyProportions): number {
  return body.torsoWidth * FOREARM_RADIUS
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
  /**
   * Whether opaque eyewear is on over the face.
   *
   * The eyes and pupils are then not drawn at all. Partly because they are
   * behind a solid lens and cannot be seen, and partly because a flat eye
   * panel and a pair of glasses are four hand-placed rectangles in one small
   * patch of face — every attempt to place a temple arm landed one of its
   * faces within a millimetre of a sclera's or a pupil's, on one silhouette or
   * another. Two things that cannot both be visible should not both be drawn.
   *
   * The brows stay: they sit above the lens and are half the expression.
   */
  readonly eyesCovered: boolean
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
  eyesCovered: false,
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
  void hd
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
    /*
     * Four sections whose radii meet exactly where they touch.
     *
     * Each section's top radius is the next one's bottom radius, so the torso
     * is one continuous taper — wide at the pelvis, narrowest at the top of the
     * waist, wide again at the chest. Sections chosen independently gave a
     * visible step at every junction and, at the hip, a flare wider than the
     * thighs under it: the figure was wearing a hoop skirt.
     */
    limb('hips', [0, th * 0.1, 0], [tw * 0.46, th * 0.32, tw * 0.5], ColorRole.Secondary, {
      scale: squash,
      segments: 24,
    }),
    limb('waist', [0, th * 0.38, 0], [tw * 0.42, th * 0.32, tw * 0.46], ColorRole.Primary, {
      scale: squash,
      segments: 24,
    }),
    limb('chest', [0, th * 0.68, 0], [tw * 0.5, th * 0.36, tw * 0.42], ColorRole.Primary, {
      scale: squash,
      segments: 24,
    }),
    /*
     * The trapezius: a cone from the chest's own width up to the neck.
     *
     * It was a near-cylinder narrower than the chest below it, which put a step
     * at the top of the torso and left the shoulders as two balls perched on
     * the corners of it. Taking the bottom radius straight off the chest and
     * running it up to something close to the neck is what turns that step into
     * a slope, and a slope is most of what "sloped shoulders" means.
     */
    limb('yoke', [0, th * 0.885, 0], [tw * 0.3, th * 0.17, tw * 0.5], ColorRole.Primary, {
      scale: squash,
      segments: 24,
    }),
    /*
     * One shoulder mass across the whole line, out to both sockets.
     *
     * Two small spheres set inboard of the arms is what the capture shows and
     * it reads as shoulder pads: each ball floated above and inside the arm it
     * was meant to cap, leaving the upper arm's own flat top on show underneath
     * it. The arms hang at `shoulderX`, so the shoulders have to *reach*
     * `shoulderX` — anything narrower is a gap by construction, whatever it is
     * shaped like. An ellipsoid falls away toward the ends on its own, which is
     * the slope; the deltoid on each arm covers the last of the joint and, being
     * on the arm, stays covering it when the arm moves.
     */
    blob(
      'shoulders',
      [0, th * SHOULDER_TORSO_FRACTION, 0],
      [body.shoulderX + armRadius(body) * 0.15, th * 0.13, body.torsoDepth * 0.5],
      ColorRole.Primary,
      { finish: Finish.Cloth, segments: 22 },
    ),

    /*
     * A neck, not a stem.
     *
     * It was 5.2cm across under a head 19.5cm wide, and with the shoulders
     * where they are that left a hand's width of bare column between the jaw
     * and the collar. Widening it is half the fix; `neckHeight` coming down in
     * `proportions.ts` is the other half.
     */
    /*
     * Tapered, and stopped well short of the mouth.
     *
     * The neck ran up to a centimetre below the lip, and at that height a
     * stylised head has narrowed almost to its pole — so the top of the neck
     * came *through* the chin as a bright oval sitting under the mouth. It
     * reads as a jaw seam, which is what it was mistaken for twice. A neck
     * ends at the jaw; only the join should be inside the head.
     */
    limb('neck', [0, th + nh * 0.5 - 0.07, 0], [tw * 0.17, nh + 0.22, tw * 0.25], ColorRole.Skin, {
      finish: Finish.Matte,
      segments: 20,
    }),
    // The skull, rounded. Its bounding box is unchanged, so hair still fits.
    // 48 segments, not 24: the hairline is the boundary between this surface
    // and the hair shell over it, and a coarse skull makes a ragged one.
    blob('head', [0, headY, 0], [hw / 2, hh / 2, hd / 2], ColorRole.Skin, { segments: 48 }),
    // The ears, in the head's own frame. A dummy keeps them: they are the
    // shape of a head rather than something drawn on a face.
    ...translateParts(earParts(body), [0, headY, 0]),
  ]

  if (!options.mannequin) {
    parts.push(...translateParts(faceParts(body, options.eyesCovered), [0, headY, 0]))
  }

  parts.push(...garmentParts(body, options))

  return parts
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
      at: [0, th * 0.63, layerAt(0)],
      size: [tw * 0.24, th * 0.44, layerDepth(0)],
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
        at: [side * tw * 0.145, th * 0.76, layerAt(1)],
        size: [tw * 0.085, th * 0.28, layerDepth(1)],
        /*
         * The jacket's own colour, in satin.
         *
         * They were `Trim`, which on a charcoal suit is a mid grey — two pale
         * rectangles stuck to a near-black chest, and they read as luggage
         * labels. A dinner jacket's lapel is the same cloth with a different
         * sheen, and that is exactly what a lower roughness gives: the shape
         * catches the rim light and shows without being a different object.
         */
        role: ColorRole.Primary,
        rotation: [0, 0, side * 0.3],
        finish: Finish.Leather,
      })),
      {
        name: 'tie',
        shape: PartShape.Box,
        at: [0, th * 0.6, layerAt(2)],
        size: [tw * 0.075, th * 0.42, layerDepth(2)],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
      },
      /*
       * A rounded knot rather than a small box.
       *
       * It looks like a knot, which is reason enough, and it also takes the
       * front of a suit out of a whole family of near-misses: a box this size
       * has a flat top and bottom that landed within a fifth of a millimetre
       * of the lapel's, the yoke's and a worn pendant's in turn, each on a
       * different silhouette, because all four are hand-placed on one chest.
       * A curved surface has no face to fight with.
       */
      {
        name: 'tie-knot',
        shape: PartShape.Sphere,
        at: [0, th * 0.845, layerAt(3)],
        size: [tw * 0.058, tw * 0.034, layerDepth(3) / 2],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
        segments: 14,
      },
    )
  }

  // A crew neck, which is all a tee has and all it should have.
  if (options.garment === Garment.TeeAndJeans || options.garment === Garment.Scrubs) {
    parts.push({
      name: 'neckline',
      shape: PartShape.Torus,
      at: [0, th * 0.96, 0],
      size: [tw * 0.2, tw * 0.032, tw * 0.2],
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
      size: [tw * 0.215, tw * 0.038, tw * 0.215],
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
      size: [tw * 0.66, length, tw * 0.8],
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
  const finish = options.hasSkirt ? Finish.Matte : Finish.Cloth
  const radius = body.torsoWidth * THIGH_RADIUS

  return [
    limb('thigh', [0, -body.thigh / 2, 0], [radius, body.thigh, radius * 0.78], role, {
      finish,
      segments: 20,
    }),
    blob('knee', [0, -body.thigh, 0], [radius * 0.8, radius * 0.66, radius * 0.8], role, {
      finish,
      segments: 18,
    }),
  ]
}

/**
 * How far the ankle sits above the ground, as a fraction of the shin.
 *
 * `hipY` is `thigh + shin`, so a shin drawn its full length reaches the floor
 * and leaves nowhere for a foot — every foot then hangs below the ground. The
 * shin stops here instead and the foot fills what is left, which is also what
 * a leg actually does. A fraction rather than the fixed 7.5cm it was, so a
 * shorter leg gets a proportionate ankle instead of a stump.
 */
const ANKLE_FRACTION = 0.17

/** The shin, in the knee joint's frame. Tapers from knee to ankle. */
export function shinParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const role = options.hasSkirt ? ColorRole.Skin : ColorRole.Secondary
  const finish = options.hasSkirt ? Finish.Matte : Finish.Cloth
  const radius = body.torsoWidth * SHIN_RADIUS

  // Overshoots the ankle a little so the foot has something to join into.
  const length = body.shin * (1 - ANKLE_FRACTION) + 0.02

  return [
    limb('shin', [0, -length / 2, 0], [radius, length, radius * 0.68], role, {
      finish,
      segments: 20,
    }),
    // The calf, which is what makes a leg read as a leg rather than a pipe.
    blob(
      'calf',
      [0, -length * 0.36, -radius * 0.18],
      [radius * 0.78, length * 0.3, radius * 0.74],
      role,
      { finish },
    ),
    blob('ankle', [0, -length + 0.014, 0], [radius * 0.6, radius * 0.44, radius * 0.6], ColorRole.Skin, {
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
  const radius = body.torsoWidth * SHIN_RADIUS

  return [
    blob(
      'foot',
      [0, floor + radius * 0.5, radius * 0.6],
      [radius * 0.66, radius * 0.4, radius * 1.3],
      ColorRole.Shoes,
      { finish: Finish.Leather },
    ),
    blob(
      'heel-cup',
      [0, floor + radius * 0.55, -radius * 0.24],
      [radius * 0.58, radius * 0.47, radius * 0.52],
      ColorRole.Shoes,
      { finish: Finish.Leather },
    ),
    /*
     * The sole, kept inside the foot above it.
     *
     * A box wider and longer than the shape it supports is a plinth, and that
     * is what it looked like under the dark shoes: a slab of black sticking
     * out behind each heel.
     */
    {
      name: 'foot-sole',
      shape: PartShape.Box,
      at: [0, floor + 0.012, radius * 0.42],
      size: [radius * 1.1, 0.024, radius * 2.1],
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
  const finish = sleeved ? Finish.Cloth : Finish.Matte
  const radius = armRadius(body)

  return [
    /*
     * The deltoid, which the rig never had.
     *
     * An upper arm is a cylinder, so left alone its flat top cap sits in the
     * open at the shoulder joint — visible as a hard disc under the shoulder in
     * any front view. This caps it, and it lives on the *arm* rather than the
     * torso deliberately: a cap on the torso stops covering the joint the
     * moment the arm swings, which is every frame the figure is walking.
     */
    /*
     * A cap on the arm, not a pauldron over it.
     *
     * At 14% wider than the arm it read as a shoulder pad with a hard seam
     * where it met the sleeve — a mushroom. It only has to cover the
     * cylinder's own flat top, so it is the arm's width and taller than it is
     * wide.
     */
    blob(
      'deltoid',
      [0, -radius * 0.34, 0],
      [radius * 1.01, radius * 1.3, radius * 1.01],
      role,
      { finish, segments: 20 },
    ),
    limb('upper-arm', [0, -body.upperArm / 2, 0], [radius, body.upperArm, radius * 0.82], role, {
      finish,
      segments: 20,
    }),
    blob('elbow', [0, -body.upperArm, 0], [radius * 0.8, radius * 0.72, radius * 0.8], role, {
      finish,
    }),
  ]
}

/** The forearm, in the elbow joint's frame. */
export function forearmParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const sleeved =
    !options.bareArms && (options.garment === Garment.Suit || options.garment === Garment.Scrubs)
  const role = sleeved ? ColorRole.Primary : ColorRole.Skin
  const radius = forearmRadius(body)

  return [
    limb('forearm', [0, -body.forearm / 2, 0], [radius, body.forearm, radius * 0.78], role, {
      finish: sleeved ? Finish.Cloth : Finish.Matte,
      segments: 20,
    }),
    // The cuff, where a sleeve ends and the wrist begins.
    limb(
      'cuff',
      [0, -body.forearm + radius * 0.3, 0],
      [radius * 0.9, radius * 0.4, radius * 0.9],
      ColorRole.Shirt,
      { finish: Finish.Cloth },
    ),
  ]
}

/**
 * The hand, in the wrist's frame.
 *
 * Two fingers rather than five, extended, because the blackjack hand signals
 * are a double finger-tap and a flat wave and those are the only shapes a hand
 * on this character ever has to make. Sized off the forearm it hangs from
 * rather than typed in, so it grows with the build like everything else.
 */
export function handParts(side: 1 | -1, body: BodyProportions): readonly Part[] {
  const radius = forearmRadius(body)

  return [
    blob(
      'palm',
      [0, -radius * 0.78, radius * 0.05],
      [radius * 0.74, radius * 0.84, radius * 0.44],
      ColorRole.Skin,
    ),
    ...[-radius * 0.26, radius * 0.26].map((offset, index) =>
      blob(
        `finger-${index}`,
        [offset, -radius * 1.42, radius * 0.1],
        [radius * 0.2, radius * 0.44, radius * 0.22],
        ColorRole.Skin,
      ),
    ),
    blob(
      'thumb',
      [side * -radius * 0.6, -radius * 1.05, radius * 0.24],
      [radius * 0.24, radius * 0.4, radius * 0.26],
      ColorRole.Skin,
      { rotation: [0, 0, side * 0.5] },
    ),
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
        parts: handParts(side, body),
      },
    )
  }

  return segments
}
