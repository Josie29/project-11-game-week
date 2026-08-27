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
const ARM_RADIUS = 0.162
const THIGH_RADIUS = 0.225

/**
 * How much narrower a limb is at the joint than at its root.
 *
 * One number for both legs and arms, because the defect it fixes was the same
 * at the knee and the elbow: the parent's end radius, the joint sphere and the
 * child's start radius were three numbers chosen separately, so every joint on
 * the figure was a visible step *and* a shading seam. The child limb now starts
 * at exactly the radius its parent ended on and the joint sphere is derived
 * from that one number, so there is nothing left for them to disagree about.
 */
const JOINT_TAPER = 0.76

/** How far the joint sphere stands proud of the two limbs it bridges. */
const JOINT_SWELL = 1.03

/** The upper arm's radius, which the shoulder and every sleeve are sized from. */
export function armRadius(body: BodyProportions): number {
  return body.torsoWidth * ARM_RADIUS
}

/** The elbow's radius: where the upper arm ends and the forearm begins. */
export function forearmRadius(body: BodyProportions): number {
  return armRadius(body) * JOINT_TAPER
}

/** The thigh's radius at the hip, which the pelvis has to be wide enough to hold. */
export function thighRadius(body: BodyProportions): number {
  return body.torsoWidth * THIGH_RADIUS
}

/** The knee's radius: where the thigh ends and the shin begins. */
export function shinRadius(body: BodyProportions): number {
  return thighRadius(body) * JOINT_TAPER
}

/**
 * How much wider the pelvis is than the legs hanging off it.
 *
 * Six per cent, and the *derivation* is the point rather than the number. The
 * hips were a chosen fraction of the torso and the thighs were another, so on
 * every silhouette `hipWidth + thighRadius` overshot the pelvis and both legs
 * stepped out sideways with a hard horizontal edge at the hip. It is the same
 * relationship `shoulderX` already has with the arm, and it was missing here.
 */
const HIP_CLEARANCE = 1.06

/**
 * The widest the pelvis reaches: the hip joint plus the thigh hanging off it.
 *
 * Everything that has to cover a hip is measured from this — the pelvis
 * section, the skirt's waist, a gown's. Read off the leg rather than chosen,
 * so a wider build cannot grow past its own clothes.
 */
export function hipRadius(body: BodyProportions): number {
  return (body.hipWidth + thighRadius(body)) * HIP_CLEARANCE
}

/**
 * How wide the pelvis still is where the legs take over.
 *
 * The thighs' own reach, exactly. Chosen independently it was narrower, so at
 * the crotch line the pelvis stopped and two legs continued out past where it
 * had been — a hard horizontal edge across the top of both thighs, which on a
 * trousered figure read as the hem of a pair of shorts.
 */
function crotchRadius(body: BodyProportions): number {
  return body.hipWidth + thighRadius(body)
}

/** The narrowest point of the torso. What separates a figure from a barrel. */
export function waistRadius(body: BodyProportions): number {
  return body.waistWidth
}

/** The widest point of the torso, and the half-width the whole build is named for. */
export function chestRadius(body: BodyProportions): number {
  return body.chestWidth
}

/**
 * Where the torso has narrowed to by the time it reaches the neck.
 *
 * It was three tenths of the torso's width, which on the broad build is a
 * twenty-eight-centimetre shelf across the top of the shoulders with a neck
 * sticking out of the middle of it — the trapezius never sloped at all, and
 * the crew neckline drawn at that radius read as a yoke seam halfway out to
 * the arm rather than as a collar.
 */
function neckRadius(body: BodyProportions): number {
  return body.torsoWidth * 0.21
}

/*
 * Where each torso section starts and stops, as fractions of the torso's height.
 *
 * Written out because four sections have to agree about six boundaries, and
 * every one of those agreements used to be a pair of numbers a reader had to
 * add up. Each section's top radius is the next one's bottom radius and each
 * one overlaps its neighbour slightly, so the torso is one continuous taper:
 * widest at the hip, nipped at the waist, wide again at the chest.
 */
export const CROTCH_Y = -0.1
export const HIP_LINE_Y = 0.16
export const NATURAL_WAIST_Y = 0.45
/**
 * Where the chest stops widening and the trapezius takes over.
 *
 * High, and deliberately under the shoulder mass. The junction between two
 * cone sections is a crease wherever the slope changes sign, and this one
 * changes it hard — the torso widens up to here and narrows sharply above it.
 * Lower down it drew a hard horizontal line across the chest of every garment;
 * up here the shoulders cover it.
 */
export const CHEST_TOP_Y = 0.9

/**
 * How far a worn garment's own section boundaries sit from the body's.
 *
 * Outerwear is a second stack of tapered sections over the first, authored in a
 * different file against the same torso height — so every boundary in one had a
 * standing chance of landing on a boundary in the other, and several did, on
 * one silhouette at a time as the depth ratios moved. Chasing them one at a
 * time is a losing game: the fix is to derive the garment's boundaries from the
 * body's and separate them by a fixed clearance, so a coincidence is no longer
 * something that *can* happen.
 *
 * Three per cent of the torso's height is about a centimetre and a half on
 * every build, which is two orders of magnitude past what the depth buffer can
 * resolve at this camera.
 */
export const GARMENT_CLEARANCE = 0.03

/**
 * How high up the body a pair of trousers reaches.
 *
 * The natural waist, which is where the colour change between a top and a
 * bottom belongs. It used to fall at the hip line, so on every trousered
 * garment the pelvis was a distinctly wider block in the trouser colour with a
 * hard edge across the top of it — gym shorts worn over a suit.
 */
export const TROUSER_LINE_Y = NATURAL_WAIST_Y

/** Where a skirt's waistband sits: above the hip, below the natural waist. */
export const SKIRT_WAIST_Y = 0.26

/**
 * Where a necklace lies, as a fraction of the torso's height.
 *
 * Exported because `anchorFor` has to agree with the yoke this file draws, and
 * it did not: the neck slot sat a fifth of the torso *below* the top of it,
 * which is the middle of the chest. High enough that the torso has actually
 * narrowed toward the neck by the time it gets here — at the collarbone the
 * body is still nearly as wide as the shoulders, and a ring sized to clear it
 * there is a hoop resting on both of them.
 */
export const NECK_BASE_Y = 0.965

/**
 * The torso's half-width at a height, following the taper the sections draw.
 *
 * Exported because a skirt and a gown both have to meet the body at their own
 * waistband, and "wide enough to clear the thighs" — which is all either of
 * them was ever asked — says nothing about that. A waistband narrower than the
 * body leaves the body poking through it; one wider than the body leaves an
 * open annulus you can see straight down inside the skirt through, which is
 * exactly what put two crescents of bare thigh at a dress's hips.
 *
 * @param body The figure being measured.
 * @param y Height above the hip, as a fraction of the torso's height.
 * @returns The half-width there, in world units.
 */
export function torsoRadiusAt(body: BodyProportions, y: number): number {
  const lerp = (from: number, to: number, at: number, start: number, end: number): number =>
    from + (to - from) * Math.min(1, Math.max(0, (at - start) / (end - start)))

  if (y <= HIP_LINE_Y) return lerp(crotchRadius(body), hipRadius(body), y, CROTCH_Y, HIP_LINE_Y)
  if (y <= NATURAL_WAIST_Y) {
    return lerp(hipRadius(body), waistRadius(body), y, HIP_LINE_Y, NATURAL_WAIST_Y)
  }
  if (y <= CHEST_TOP_Y) {
    return lerp(waistRadius(body), chestRadius(body), y, NATURAL_WAIST_Y, CHEST_TOP_Y)
  }

  return lerp(chestRadius(body), neckRadius(body), y, CHEST_TOP_Y, 1)
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
  const { torsoWidth: tw, torsoHeight: th, torsoDepth: td, neckHeight: nh } = body
  const { headWidth: hw, headHeight: hh, headDepth: hd } = body
  const squash: Vec3 = [1, 1, depthRatio(body)]

  const hipR = hipRadius(body)
  const waistR = waistRadius(body)
  const chestR = chestRadius(body)
  const neckR = neckRadius(body)

  /*
   * Where the trouser colour stops.
   *
   * At the natural waist on a trousered figure, which is where a waistband
   * belongs; at the hip on a skirted one, because the skirt's own waistband
   * takes over there and what is under it is a lining rather than a garment.
   */
  const lowerRole = ColorRole.Secondary
  const midRole = options.hasSkirt ? ColorRole.Primary : ColorRole.Secondary
  /*
   * The shoulder mass is bare only on a genuinely strapped garment.
   *
   * A cocktail dress keeps it: the mass reaches the sockets, so painting it
   * skin puts a band of skin right across the top of the chest, and what it
   * covers on a dress reads as a cap sleeve — which is a dress. A bought gown
   * draws its own straps and does want the shoulder bare beside them.
   */
  const shoulderRole = options.bareArms ? ColorRole.Skin : ColorRole.Primary

  const cylinder = (
    name: string,
    fromY: number,
    toY: number,
    fromR: number,
    toR: number,
    role: ColorRole,
  ): Part =>
    limb(
      name,
      [0, th * ((fromY + toY) / 2), 0],
      // A cylinder's `size` is [radiusTop, height, radiusBottom]; `toY` is the
      // upper end, so its radius is the first of the three.
      [toR, th * (toY - fromY), fromR],
      role,
      { scale: squash, segments: 28 },
    )

  const headY = th + nh + hh / 2
  const parts: Part[] = [
    /*
     * Four sections whose radii meet exactly where they touch.
     *
     * Each section's top radius is the next one's bottom radius, so the torso
     * is one continuous taper — widest at the pelvis, narrowest at the waist,
     * wide again at the chest. Sections chosen independently gave a visible
     * step at every junction and, at the hip, a flare wider than the thighs
     * under it: the figure was wearing a hoop skirt.
     *
     * The boundaries are named constants rather than four pairs of numbers,
     * because `torsoRadiusAt` has to agree with them exactly and a skirt that
     * misses the body by a centimetre is an open hole you can see down.
     */
    cylinder('pelvis', CROTCH_Y, HIP_LINE_Y, crotchRadius(body), hipR, lowerRole),
    cylinder('hips', HIP_LINE_Y, NATURAL_WAIST_Y, hipR, waistR, midRole),
    cylinder('chest', NATURAL_WAIST_Y, CHEST_TOP_Y, waistR, chestR, ColorRole.Primary),
    /*
     * The trapezius: a cone from the chest's own width up to the neck.
     *
     * It was a near-cylinder narrower than the chest below it, which put a step
     * at the top of the torso and left the shoulders as two balls perched on
     * the corners of it. Taking the bottom radius straight off the chest and
     * running it up to something close to the neck is what turns that step into
     * a slope, and a slope is most of what "sloped shoulders" means.
     */
    cylinder('yoke', CHEST_TOP_Y, 1, chestR, neckR, ColorRole.Primary),

    /*
     * The seat, as a mass rather than another section.
     *
     * What puts an S in the profile, and a blob for the same reason the calf is
     * one: a stack of cylinders can taper but it cannot bulge in one direction
     * only, and offsetting whole sections in z would break the one thing the
     * stack does well — every section's radius meeting its neighbour's exactly.
     *
     * There was a matching one at the chest and it is gone. The problem with a
     * bulge on the *front* of a torso is that it has a silhouette edge, and a
     * silhouette edge in the middle of a garment is a hard shading break across
     * the chest that reads as a second garment worn over the first. Behind, the
     * same shape is a seat and there is nothing there for it to cut across.
     */
    blob(
      'seat',
      /*
       * Only just proud of the pelvis. At six tenths of the torso's depth
       * behind the centre line it was five centimetres past the hips section,
       * and from directly behind its silhouette edge read as a dark oval on
       * the lower back — a bustle. A seat is a swell, not a shelf.
       */
      [0, th * 0.098, -td * 0.1],
      [hipR * 0.88, th * 0.155, td * 0.4],
      lowerRole,
      { finish: Finish.Cloth, segments: 24 },
    ),

    /*
     * One shoulder mass across the whole line, out to both sockets.
     *
     * Two small spheres set inboard of the arms is what the capture showed and
     * it read as shoulder pads: each ball floated above and inside the arm it
     * was meant to cap, leaving the upper arm's own flat top on show underneath
     * it. The arms hang at `shoulderX`, so the shoulders have to *reach*
     * `shoulderX` — anything narrower is a gap by construction, whatever it is
     * shaped like.
     *
     * Deliberately *shallower* than the torso it sits on, which is the fix for
     * the other half of the complaint. At a third of the torso's depth again it
     * stood proud of the chest, so its own silhouette edge cut a hard horizontal
     * shading break across the front of every garment — on a dress it read as a
     * strapless band worn over the frock. Held inside the yoke's own surface it
     * has no front-facing edge at all and shows only out at the ends, where the
     * sockets are and where it is actually needed.
     *
     * And it stops *at* the socket rather than reaching past it. Carried out
     * over the arm, a mass this flat tapers to a point above the sleeve — so
     * each shoulder ended in a spike with a hard crease running up to the neck,
     * and the armpit under it was a notch. Taller and narrower is rounder at
     * the end, and the arm's own capsule cap is what covers the last of the
     * joint anyway.
     */
    blob(
      'shoulders',
      [0, th * SHOULDER_TORSO_FRACTION, 0],
      [body.shoulderX + armRadius(body) * 0.12, th * 0.13, td * 0.45],
      shoulderRole,
      { finish: shoulderRole === ColorRole.Skin ? Finish.Matte : Finish.Cloth, segments: 24 },
    ),

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
      segments: 24,
    }),
    // The skull, rounded. Its bounding box is unchanged, so hair still fits.
    // 48 segments, not 24: the hairline is the boundary between this surface
    // and the hair shell over it, and a coarse skull makes a ragged one.
    blob('head', [0, headY, 0], [hw / 2, hh / 2, hd / 2], ColorRole.Skin, { segments: 72 }),
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
 * A ring lying flat around the body, squashed to the body's own section.
 *
 * A torus starts in the XY plane, so `LIE_FLAT` turns its local Y into world Z
 * — which means squashing it front-to-back is a scale on *Y*, not on Z. Every
 * ring on this figure had it on Z, so a collar meant to follow an oval torso
 * was a circle that had been flattened *vertically* instead: tight at the
 * sides, standing well proud at the front and back, and too shallow in section
 * for its own radius. That is the white donut a shirt collar was reading as.
 */
function ringAround(
  name: string,
  at: Vec3,
  radius: number,
  tube: number,
  role: ColorRole,
  body: BodyProportions,
  extra: Partial<Part> = {},
): Part {
  return {
    name,
    shape: PartShape.Torus,
    at,
    size: [radius, tube, radius],
    role,
    rotation: [Math.PI / 2, 0, 0],
    segments: 28,
    finish: Finish.Cloth,
    scale: [1, depthRatio(body), 1],
    ...extra,
  }
}

/**
 * The detail that tells one starter garment from another.
 *
 * Only what a given outfit actually has. A shirt panel on a tee reads as a bib
 * stuck to the chest, which is why this is a switch rather than a set of flags.
 */
function garmentParts(body: BodyProportions, options: BodyOptions): Part[] {
  const { torsoWidth: tw, torsoHeight: th } = body
  const chestZ = chestRadius(body) * depthRatio(body)
  const parts: Part[] = []

  const hasShirt = options.garment === Garment.Suit || options.garment === Garment.ShirtAndSkirt
  /*
   * Each panel reaches back *into* the chest and stands a different distance
   * proud of it. Both halves matter: a panel that only sits in front of the
   * chest touches nothing and is reported adrift, and four panels sharing one
   * back face are four coincident planes. So the fronts step 6mm apart and the
   * backs step 2mm, and every panel is buried in the chest by at least 4mm.
   */
  const layerFront = (index: number): number => chestZ + 0.008 + index * 0.006
  const layerBack = (index: number): number => chestZ - 0.032 - index * 0.004
  const layerAt = (index: number): number => (layerFront(index) + layerBack(index)) / 2
  const layerDepth = (index: number): number => layerFront(index) - layerBack(index)
  const showFront = !options.coveredByOuterwear

  /*
   * The shirt front is a suit's, and nothing else's.
   *
   * It exists to be the strip of shirt showing between two lapels, and on the
   * shirt-and-skirt — where the whole top is already the shirt — it drew a
   * lighter rectangle down the chest that read as a patch pocket sewn onto a
   * blouse. `hasShirt` was the wrong question: the panel is about the *jacket*
   * over it.
   */
  if (options.garment === Garment.Suit && showFront) {
    parts.push({
      name: 'shirt-panel',
      shape: PartShape.Box,
      /*
       * Stops above the waistband rather than running past it.
       *
       * A shirt front and a tie end where the trousers begin — which is what
       * they do — and until they did, the two of them and the waistband ring
       * were three hand-placed shapes overlapping in the same few centimetres
       * of chest, landing on each other's planes one silhouette at a time.
       */
      at: [0, th * 0.69, layerAt(0)],
      size: [tw * 0.18, th * 0.38, layerDepth(0)],
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
        // Collar to button, and turned out hard enough to read as a V. Short
        // and near-upright they were two grey slabs on a chest — patch pockets.
        at: [side * tw * 0.2, th * 0.75, layerAt(1)],
        size: [tw * 0.13, th * 0.3, layerDepth(1)],
        /*
         * The jacket's own cloth, a step lighter, in satin.
         *
         * Two goes at this and the second overshot. As `Trim` — a mid grey on a
         * charcoal suit — they were two pale rectangles stuck to a near-black
         * chest and read as luggage labels. Moved to the jacket's exact colour
         * they read as nothing at all: a plain dark top with a tie down it. A
         * dinner jacket's lapel is the same cloth one shade up with a different
         * sheen, which is what `primaryTrim` already is, and the low roughness
         * is what makes the shape catch the rim light.
         */
        role: ColorRole.Trim,
        rotation: [0, 0, side * 0.42],
        finish: Finish.Leather,
      })),
      {
        name: 'tie',
        shape: PartShape.Box,
        // Runs all the way up to the collar. Stopped short, a tie is a red bar
        // lying on a chest with a hand's width of suit above it.
        at: [0, th * 0.735, layerAt(2)],
        size: [tw * 0.08, th * 0.41, layerDepth(2)],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
      },
      /*
       * A knot, which is a wedge rather than a bead.
       *
       * It was a small box, and a box this size has a flat top and bottom that
       * landed within a fifth of a millimetre of the lapel's, the yoke's and a
       * worn pendant's in turn — all four are hand-placed on one chest. The
       * sphere that replaced it fought with nothing and read as a red ball
       * balanced on a tie. A truncated cone tipped forward off the collar is a
       * knot, and being tipped it has no axis-aligned face to fight with
       * either: the shape and the fix are the same thing.
       */
      {
        name: 'tie-knot',
        shape: PartShape.Cylinder,
        // Its own depth rather than a rung of the panel ladder: the knot is
        // tipped, so its bounds depend on that tilt and stopped lining up with
        // the rungs the moment the panels were deepened.
        at: [0, th * 0.93, chestZ + 0.02],
        // [radiusTop, height, radiusBottom] — the third of these used to be the
        // layer's *depth*, which after the panels were deepened made the knot a
        // twenty-centimetre red disc lying across the chest.
        size: [tw * 0.042, tw * 0.08, tw * 0.058],
        rotation: [0.22, 0, 0],
        role: ColorRole.Accent,
        finish: Finish.Cloth,
        segments: 18,
      },
    )
  }

  // A crew neck, which is all a tee has and all it should have.
  if (
    !options.bareArms &&
    (options.garment === Garment.TeeAndJeans || options.garment === Garment.Scrubs)
  ) {
    parts.push(
      ringAround(
        'neckline',
        [0, th, 0],
        torsoRadiusAt(body, 1) * 1.04,
        tw * 0.026,
        ColorRole.Shirt,
        body,
      ),
    )
  }

  /*
   * The collar every garment with a shirt under it shows at the back of the
   * neck — unless a gown is over the top of it.
   *
   * A jacket leaves a shirt collar showing and should; a strapless gown does
   * not, and left in it drew a white ring and a band of the suit's own cloth
   * across the collarbones above the neckline. `bareArms` is the gown's own
   * flag: it is the one item that covers the shoulders completely.
   */
  if (hasShirt && !options.bareArms) {
    parts.push(
      /*
       * At the base of the neck, not halfway out to the shoulder.
       *
       * Drawn at the torso's own radius three per cent down from the top it was
       * twenty-eight centimetres across — wider than the head above it — and
       * read as a clerical collar. A shirt collar goes round a neck, and the
       * torso has only narrowed to a neck at the very top of the yoke.
       */
      ringAround(
        'collar',
        [0, th, 0],
        torsoRadiusAt(body, 1) * 1.16,
        tw * 0.028,
        ColorRole.Shirt,
        body,
      ),
    )
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
   * The waistband, on a trousered figure.
   *
   * The colour change between a top and a bottom is a hard horizontal edge
   * wherever it falls, and an edge with nothing on it reads as two garments
   * that do not meet. A band at the natural waist is what a real one has, and
   * it is the cheapest glamour on the figure — a line of trim catching the rim
   * light exactly where the silhouette is narrowest.
   */
  if (!options.hasSkirt) {
    parts.push(
      ringAround(
        'waistband',
        [0, th * TROUSER_LINE_Y, 0],
        torsoRadiusAt(body, TROUSER_LINE_Y) * 1.02,
        tw * 0.019,
        ColorRole.Trim,
        body,
      ),
    )
  }

  /*
   * The garment's own skirt.
   *
   * Suppressed when a gown is equipped, since that item draws a longer one of
   * its own. Suppressing on *any* outerwear is the bug that put a jacket over
   * a cocktail dress and left the character in bare legs.
   */
  if (options.hasSkirt && !options.suppressSkirt) {
    parts.push(...skirtParts(body, options.seated))
  }

  return parts
}

/**
 * How far below the hip a skirt hangs, standing and seated.
 *
 * Seated is short enough to clear a stool: a full-length hem drops through the
 * seat and the thighs the moment the hips come down and the legs fold forward,
 * which is only ever visible from the table camera.
 */
const SKIRT_HEM_Y = -0.36
const SEATED_SKIRT_HEM_Y = -0.16

/**
 * The starter skirt: a waistband that meets the body, and a flare below it.
 *
 * It was one open cone whose waist was half again as wide as the hips inside
 * it, so there was a nine-centimetre annulus at the top you could see straight
 * down through — onto the tops of two bare thighs and the inside of the skirt.
 * From the front the bodice hid it; from anywhere above it was two crescents of
 * skin at the hips, on every skirted garment in the game.
 *
 * Two sections rather than one, and the split is what makes it work. The upper
 * takes the *body's* own front-to-back squash, so its top rim meets the torso
 * all the way round with nothing to see down; the lower is nearly circular in
 * plan, which is what a skirt is and what the single section could never be
 * while its top had to meet an oval body. Their overlap hides both free edges.
 *
 * @param body The figure it hangs on.
 * @param seated Shortens it to clear a stool.
 * @returns The parts, in draw order.
 */
function skirtParts(body: BodyProportions, seated: boolean): Part[] {
  const th = body.torsoHeight
  const hipR = hipRadius(body)

  const top = th * SKIRT_WAIST_Y
  const hem = seated ? SEATED_SKIRT_HEM_Y : SKIRT_HEM_Y
  const drop = top - hem

  /** Where the upper section ends, and where the flare picks it up. */
  const upperBottom = top - drop * 0.38
  const flareTop = top - drop * 0.16

  return [
    {
      name: 'skirt-waist',
      shape: PartShape.Cylinder,
      at: [0, (top + upperBottom) / 2, 0],
      // Only just proud of the torso, and squashed exactly as the torso is, so
      // the rim meets the body rather than standing off it.
      size: [torsoRadiusAt(body, SKIRT_WAIST_Y) * 1.03, top - upperBottom, hipR * 1.06],
      role: ColorRole.Secondary,
      segments: 28,
      open: true,
      finish: Finish.Cloth,
      scale: [1, 1, depthRatio(body)],
    },
    {
      name: 'skirt',
      shape: PartShape.Cylinder,
      at: [0, (flareTop + hem) / 2, 0],
      size: [hipR * 1.12, flareTop - hem, hipR * 1.62],
      role: ColorRole.Secondary,
      segments: 30,
      open: true,
      finish: Finish.Cloth,
      // Nearly round in plan, which is what a skirt is. Held at the torso's own
      // ratio it was a blade nineteen centimetres deep and twenty-six across.
      scale: [1, 1, depthRatio(body) * 0.3 + 0.7],
    },
    /*
     * The waistband, which seals the top rim and is worth having anyway.
     *
     * A free edge at the top of a shell is a hole however well it is fitted,
     * and this is the one edge on the skirt a camera above the figure can find.
     */
    ringAround(
      'skirt-band',
      [0, top, 0],
      torsoRadiusAt(body, SKIRT_WAIST_Y) * 1.03,
      body.torsoWidth * 0.03,
      ColorRole.Accent,
      body,
      { finish: Finish.Leather },
    ),
    /*
     * And a piped hem, which seals the other one.
     *
     * A truncated cone cut off square reads as a lampshade — a hard polygonal
     * edge is the single most obviously untailored thing a garment can end on.
     */
    {
      name: 'skirt-hem',
      shape: PartShape.Torus,
      at: [0, hem, 0],
      size: [hipR * 1.62, body.torsoWidth * 0.02, hipR * 1.62],
      // The skirt's own cloth: as an accent it read as a hoop sewn into the
      // hem rather than as a hem.
      role: ColorRole.Secondary,
      rotation: [Math.PI / 2, 0, 0],
      segments: 30,
      finish: Finish.Cloth,
      scale: [1, depthRatio(body) * 0.3 + 0.7, 1],
    },
  ]
}

/* ------------------------------------------------------------------- legs */

/** The thigh, in the hip joint's frame. Tapers from hip to knee. */
export function thighParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const role = options.hasSkirt ? ColorRole.Skin : ColorRole.Secondary
  const finish = options.hasSkirt ? Finish.Matte : Finish.Cloth
  const radius = thighRadius(body)
  const knee = shinRadius(body)

  return [
    limb('thigh', [0, -body.thigh / 2, 0], [radius, body.thigh, knee], role, {
      finish,
      segments: 28,
    }),
    /*
     * The knee, derived from the two radii it bridges rather than chosen.
     *
     * Every joint on the figure used to be a visible ring, because the parent's
     * end radius, the joint sphere and the child's start radius were three
     * separate decisions: the shin was wider than the thigh's knee end, so the
     * leg stepped *out* at the knee, and the sphere meant to hide that was
     * narrower than either of them.
     */
    blob('knee', [0, -body.thigh, 0], [knee * JOINT_SWELL, knee * 0.88, knee * JOINT_SWELL], role, {
      finish,
      segments: 22,
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

/**
 * How much narrower the ankle is than the knee.
 *
 * It was six tenths of the *shin's* radius under a calf almost a third wider
 * again, which on a chunky figure reads as a stick pushed into a shoe. A
 * stylised leg narrows at the ankle; it does not become wire.
 */
const ANKLE_TAPER = 0.72

/** The shin, in the knee joint's frame. Tapers from knee to ankle. */
export function shinParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const role = options.hasSkirt ? ColorRole.Skin : ColorRole.Secondary
  const finish = options.hasSkirt ? Finish.Matte : Finish.Cloth
  // Starts at exactly the radius the thigh finished on, so the knee is a swell
  // rather than a step.
  const knee = shinRadius(body)
  const ankle = knee * ANKLE_TAPER

  // Overshoots the ankle a little so the foot has something to join into.
  const length = body.shin * (1 - ANKLE_FRACTION) + 0.02

  return [
    limb('shin', [0, -length / 2, 0], [knee, length, ankle], role, {
      finish,
      segments: 28,
    }),
    // The calf, which is what makes a leg read as a leg rather than a pipe.
    blob(
      'calf',
      [0, -length * 0.34, -knee * 0.2],
      [knee * 0.84, length * 0.3, knee * 0.82],
      role,
      { finish, segments: 20 },
    ),
    blob('ankle', [0, -length + 0.014, 0], [ankle * 1.04, ankle * 0.8, ankle * 1.04], ColorRole.Skin, {
      finish: Finish.Matte,
      segments: 20,
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
  const radius = shinRadius(body)

  return [
    blob(
      'foot',
      [0, floor + radius * 0.52, radius * 0.62],
      [radius * 0.78, radius * 0.46, radius * 1.5],
      ColorRole.Shoes,
      { finish: Finish.Leather, segments: 22 },
    ),
    blob(
      'heel-cup',
      [0, floor + radius * 0.58, -radius * 0.26],
      [radius * 0.7, radius * 0.54, radius * 0.62],
      ColorRole.Shoes,
      { finish: Finish.Leather, segments: 20 },
    ),
    /*
     * The sole, rounded rather than a box.
     *
     * A rectangle inscribed in an ellipse still shows its corners, which is
     * what this was: a slab whose four corners stuck out past a rounded shoe in
     * every direction and read, from above, as a display plinth under each
     * foot. Its extents were inside the upper's and it still looked wrong,
     * because the shape was wrong rather than the size.
     */
    blob(
      'foot-sole',
      [0, floor + radius * 0.12, radius * 0.5],
      [radius * 0.74, radius * 0.16, radius * 1.42],
      ColorRole.Shoes,
      { finish: Finish.Leather, segments: 22 },
    ),
  ]
}

/* ------------------------------------------------------------------- arms */

/**
 * How far down the upper arm each garment's sleeve reaches.
 *
 * `null` is bare — a cocktail dress, or anything under a gown. `1` runs on into
 * the forearm. A tee's sleeve stopping at the elbow was what made the broad
 * build read as wearing a puffed blouse: a short sleeve ends on the *arm*, well
 * above the joint, and it is the length of the sleeve rather than the width of
 * the arm that says which garment it is.
 */
function sleeveReach(options: BodyOptions): number | null {
  if (sleevelessGarment(options)) return null
  if (sleevedToWrist(options)) return 1

  return options.garment === Garment.ShirtAndSkirt ? 0.62 : 0.5
}

/**
 * The upper arm, in the shoulder joint's frame.
 *
 * One capsule, where it used to be a cap, a tapered cylinder and a joint ball.
 *
 * The three-piece version had the defect the whole figure kept producing: a
 * hemisphere capping a cylinder of the *same* radius meets it tangentially, and
 * two low-poly surfaces meeting tangentially have a polygon boundary that
 * staggers — a dotted, stair-stepped ring round the arm that reads as a scar.
 * Widening the cap steepens the crossing and fixes the stagger by making the
 * cap a mushroom, which is what the previous attempt did and what it was
 * rejected for.
 *
 * A capsule has no boundary to stagger, because there is nothing for it to be a
 * boundary between. It also caps the shoulder socket for free, which is the
 * entire job the deltoid was added to do.
 */
export function upperArmParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const radius = armRadius(body)
  const reach = sleeveReach(options)

  const parts: Part[] = [
    {
      name: 'upper-arm',
      shape: PartShape.Capsule,
      // Its top hemisphere sits in the shoulder socket and its bottom one is
      // the elbow, so the straight section is what is left between them.
      at: [0, -body.upperArm / 2, 0],
      size: [radius, Math.max(0.001, body.upperArm - radius * 1.1), radius],
      // The arm itself is always skin; a sleeve is a garment drawn over it.
      role: ColorRole.Skin,
      finish: Finish.Matte,
      segments: 26,
    },
  ]

  if (reach !== null) {
    /*
     * The sleeve as its own shell over the arm, ending on a flat rim.
     *
     * This is the last place on the figure where two low-poly surfaces of very
     * similar radius met at a shallow angle. Colouring the top half of the arm
     * one way and the bottom half another meant the boundary was wherever a
     * sleeve mesh happened to intersect an arm mesh, and it staggered — a
     * dotted ring round each arm that read as a torn sleeve. Raising segment
     * counts only ever made it finer.
     *
     * A shell standing a few millimetres proud ends on its own cap, which is a
     * crisp circle at any tessellation, and it is what real clothing does at
     * exactly this seam for exactly this reason.
     */
    const sleeve = radius * 1.04
    const hemY = -body.upperArm * reach

    /*
     * A capsule, not a cylinder, and the shoulder is why.
     *
     * A cylinder's flat top cap sits in the open above the joint — the arms
     * came out with a hard square plate on each shoulder, which read as armour.
     * The torso's shoulder mass cannot hide it: at the socket's own x that
     * ellipsoid has narrowed almost to nothing, so there is nothing there to
     * bury a cap in.
     */
    parts.push({
      name: 'sleeve',
      shape: PartShape.Capsule,
      at: [0, hemY / 2, 0],
      size: [sleeve, Math.max(0.001, -hemY - sleeve * 1.05), sleeve],
      role: ColorRole.Primary,
      finish: Finish.Cloth,
      segments: 26,
    })

    // A rolled hem where a short sleeve ends. A long one ends at the cuff.
    if (reach < 1) {
      parts.push({
        name: 'sleeve-hem',
        shape: PartShape.Torus,
        at: [0, hemY + sleeve * 0.52, 0],
        size: [sleeve * 0.99, radius * 0.1, sleeve * 0.99],
        // The garment's own cloth. As `Trim` it was a shade lighter than the
        // sleeve, which on a dark tee is a bright band round each arm.
        role: ColorRole.Primary,
        rotation: [Math.PI / 2, 0, 0],
        segments: 26,
        finish: Finish.Cloth,
      })
    }
  }

  return parts
}

/** Whether the garment leaves the arm bare from the shoulder down. */
function sleevelessGarment(options: BodyOptions): boolean {
  return options.bareArms || options.garment === Garment.CocktailDress
}

/** Whether the garment's sleeve runs all the way to the wrist. */
function sleevedToWrist(options: BodyOptions): boolean {
  return (
    !options.bareArms &&
    (options.garment === Garment.Suit || options.garment === Garment.Scrubs)
  )
}

/** The forearm, in the elbow joint's frame. A capsule, for the arm's reasons. */
export function forearmParts(body: BodyProportions, options: BodyOptions): readonly Part[] {
  const sleeved = sleevedToWrist(options)
  const radius = forearmRadius(body)

  const parts: Part[] = [
    {
      name: 'forearm',
      shape: PartShape.Capsule,
      at: [0, -body.forearm / 2, 0],
      size: [radius, Math.max(0.001, body.forearm - radius * 1.1), radius],
      role: ColorRole.Skin,
      finish: Finish.Matte,
      segments: 26,
    },
  ]

  /*
   * A long sleeve and the cuff that ends it, and only where there is a shirt.
   *
   * A tee and a cocktail dress were both rendering a band at the wrist, which
   * is a cuff on a bare arm — the same class of error as the shirt panel on a
   * tee, and just as easy to miss because a pale ring on a pale wrist reads as
   * a highlight until you look for it.
   */
  if (sleeved) {
    /*
     * Straight-sided, and wider than the arm the whole way down.
     *
     * This tapered toward a "wrist" that was a fraction of the forearm's own
     * radius — arithmetic left over from when the forearm was a tapered
     * cylinder. Against the capsule that replaced it the sleeve was narrower
     * than the arm below the elbow, so the bare arm came *through* the cloth
     * and the boundary between them was a staggered, dotted ring running down
     * both forearms. It read as a torn sleeve, which is exactly the defect the
     * sleeve was made a separate shell to avoid.
     */
    const length = body.forearm - radius * 0.35

    parts.push(
      limb('sleeve', [0, -length / 2, 0], [radius * 1.08, length, radius * 1.08], ColorRole.Primary, {
        finish: Finish.Cloth,
        segments: 26,
      }),
      limb(
        'cuff',
        [0, -length + radius * 0.16, 0],
        [radius * 1.17, radius * 0.42, radius * 1.17],
        ColorRole.Shirt,
        { finish: Finish.Cloth, segments: 26 },
      ),
    )
  }

  return parts
}

/**
 * The hand, in the wrist's frame.
 *
 * Two fingers rather than five, because the blackjack hand signals are a double
 * finger-tap and a flat wave and those are the only shapes a hand on this
 * character ever has to make. Sized off the forearm it hangs from rather than
 * typed in, so it grows with the build like everything else.
 *
 * Closed and curled, not splayed. Two fat fingers held apart and a thumb stuck
 * out sideways reads as a three-fingered paw at any distance; a hand at rest
 * hangs with the fingers together and slightly hooked, and that is one rotation
 * and a smaller gap.
 */
export function handParts(side: 1 | -1, body: BodyProportions): readonly Part[] {
  const radius = handRadius(body)

  return [
    blob(
      'palm',
      [0, -radius * 0.86, radius * 0.06],
      [radius * 0.92, radius * 1.0, radius * 0.58],
      ColorRole.Skin,
      { segments: 20 },
    ),
    ...[-radius * 0.27, radius * 0.27].map((offset, index) =>
      /*
       * Capsules, curled forward. A hanging cylinder is a rectangle in
       * silhouette, and a finger is the smallest thing on the figure that has
       * to read as rounded.
       */
      ({
        name: `finger-${index}`,
        shape: PartShape.Capsule,
        at: [offset, -radius * 1.62, radius * 0.22] as Vec3,
        size: [radius * 0.3, radius * 0.5, radius * 0.3] as Vec3,
        rotation: [0.42, 0, 0] as Vec3,
        role: ColorRole.Skin,
        finish: Finish.Matte,
        segments: 12,
      }),
    ),
    {
      name: 'thumb',
      shape: PartShape.Capsule,
      at: [side * -radius * 0.78, -radius * 1.12, radius * 0.3] as Vec3,
      size: [radius * 0.34, radius * 0.34, radius * 0.34] as Vec3,
      rotation: [0.3, 0, side * 0.55] as Vec3,
      role: ColorRole.Skin,
      finish: Finish.Matte,
      segments: 12,
    },
  ]
}

/**
 * Where a ring sits, in the hand's own frame.
 *
 * Exported because two places need it and they disagreed. `anchorFor` put the
 * finger slot on the arm's centre line and `CasinoCharacter` nudged it with a
 * hand-typed triple, both of them written against a hand a third smaller than
 * the one the restyle produced — so the signet ring rendered as a white disc in
 * the middle of the palm and read as a coin being held. It is a fraction of the
 * hand now, like everything else the hand carries.
 */
export function ringSeat(body: BodyProportions): Vec3 {
  const radius = handRadius(body)

  // On the outer of the two fingers, a little above its tip.
  return [radius * 0.27, -radius * 1.5, radius * 0.36]
}

/**
 * Where a held item's grip sits, in the hand's own frame.
 *
 * Inside the curl of the fingers rather than beside them. The cane's knob used
 * to sit next to an open hand, which reads as a stick balanced against someone
 * rather than carried by them.
 */
export function gripSeat(body: BodyProportions): Vec3 {
  const radius = handRadius(body)

  return [0, -radius * 1.1, radius * 0.42]
}

/**
 * The hand's own scale: a little narrower than the wrist it hangs off.
 *
 * It was the wrist times the *ankle's* taper, which is a number about legs and
 * was three quarters — so the palm came out a third narrower than the arm above
 * it and the whole hand read as a claw on the end of a sleeve. A hand is about
 * as wide as the wrist it is attached to.
 */
export function handRadius(body: BodyProportions): number {
  return forearmRadius(body) * 0.88
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
