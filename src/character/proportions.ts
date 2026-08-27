/*
 * Body measurements, in world units, for a figure roughly 1.8 tall.
 *
 * These were module-level constants inside `CasinoCharacter.tsx` while there
 * was exactly one body. Lifting them out is what lets `anchors.ts` derive
 * accessory attachment points from the body rather than hand-typing them, and
 * lets both be unit-tested — the same reason `tableLayout.ts` exists.
 *
 * The three silhouettes are read off `art/refs/character_sheet.png`: the
 * feminine figures there are narrower through the shoulders, wider at the hip
 * and longer in the leg, with a shorter torso. Overall height is held level
 * across all three so the follow camera does not need to know which one it is
 * looking at.
 *
 * The division between leg and torso is the second stylisation, and it moves
 * the other way from the first. Anatomically the leg is about 1.6 times the
 * torso, and at seven and a half heads that reads fine; under a head this large
 * it reads as a small body on long legs, because the head has taken the space
 * the torso would have had. Roughly four centimetres came off each leg and went
 * into every torso.
 *
 * The one place this deliberately departs from that sheet is the head. The
 * sheet is drawn at roughly seven and a half heads, which is life drawing, and
 * at the size a figure occupies on the strip it reads as a suit with a pebble
 * on top — there is no room on a 24cm head for a face anyone can see from the
 * follow camera. `HEADS_TALL` below is the stylisation, and everything else in
 * this table is derived from it.
 */

/**
 * How many head-heights tall a figure is.
 *
 * Five and a half: a stylised casual-game figure rather than a life study.
 * This is the single number the whole table hangs off — the head takes its
 * size from `STANDING_HEIGHT / HEADS_TALL`, and the torso and legs take what
 * is left. Changing it changes the whole cast.
 */
export const HEADS_TALL = 5.5

/**
 * Total height, held across all three silhouettes.
 *
 * The follow camera, the stool height, the door triggers and every table
 * anchor are tuned against this one number, so it does not move: the
 * stylisation is spent on how the height is *divided up*, not on how tall
 * anyone is.
 */
export const STANDING_HEIGHT = 1.77

export enum Silhouette {
  Feminine = 'feminine',
  Masculine = 'masculine',
  Androgynous = 'androgynous',
}

export interface BodyProportions {
  /**
   * Which of the three this is.
   *
   * Self-identifying so that anything shaped by the silhouette can be derived
   * from the body alone. The face is the case that needed it: `torsoParts`
   * takes a body and what it is wearing, and had no way to ask which figure it
   * was building — so all three wore one face, and the one control the designer
   * opens on made no difference above the neck.
   */
  readonly silhouette: Silhouette
  readonly thigh: number
  readonly shin: number
  readonly torsoHeight: number
  readonly torsoWidth: number
  /**
   * Front to back, at the chest.
   *
   * Roughly three quarters of the width on every silhouette, and that ratio is
   * the point. It was around three fifths, and every torso section was then
   * squashed by it *again*, so the figure was a vertical plank from armpit to
   * ankle in profile while the head above it was a solid ellipsoid — which
   * reads worse than if both had been flat, because the head sets the
   * expectation the body then fails. Nothing in a front view could show it.
   */
  readonly torsoDepth: number
  /**
   * Half-width at the chest, and at the natural waist.
   *
   * These are what make the three builds three *shapes* rather than one shape
   * at three sizes. They were both fractions of `torsoWidth`, so the only
   * difference between the masculine figure and the feminine one below the
   * shoulder was scale — the broad build was the narrow build enlarged, nip and
   * all, which is not what separates them.
   *
   * The masculine figure is a V dropped onto a rectangle: the shoulders reach
   * well past the chest, the chest is clearly wider than the waist, and the
   * waist and hip are within a couple of centimetres of each other so there is
   * no nip below the ribs at all. That last part is what separates *muscular*
   * from *heavy* — a broad figure with the same hourglass as the narrow one is
   * simply the narrow one enlarged, which is how the first pass at this came
   * out. The feminine figure is the opposite in every respect: chest and hip
   * near enough equal, with a deep nip between them.
   *
   * The hip is not here because it is not free: it is `hipWidth` plus the thigh
   * hanging off it — see `hipRadius` — and a pelvis narrower than its own legs
   * is a figure whose thighs step out sideways at the hip.
   */
  readonly chestWidth: number
  readonly waistWidth: number
  /**
   * Half the distance between the shoulder joints.
   *
   * Must clear `torsoWidth / 2` by more than the upper arm's radius, or the
   * arms hang inside the torso and the figure reads as armless from the front.
   * `characterAnchors.test.ts` asserts the clearance on every silhouette.
   */
  readonly shoulderX: number
  readonly upperArm: number
  readonly forearm: number
  /** Half the distance between the hip joints. */
  readonly hipWidth: number
  readonly neckHeight: number
  readonly headWidth: number
  readonly headHeight: number
  readonly headDepth: number
  /**
   * Hip height when seated.
   *
   * Casino stools are tall, so the shins hang clear of the floor and the feet
   * rest on the stool's footring rather than the carpet.
   */
  readonly seatedHipY: number
}

export const PROPORTIONS: Record<Silhouette, BodyProportions> = {
  [Silhouette.Feminine]: {
    silhouette: Silhouette.Feminine,
    thigh: 0.415,
    shin: 0.42,
    torsoHeight: 0.575,
    torsoWidth: 0.39,
    torsoDepth: 0.292,
    chestWidth: 0.212,
    waistWidth: 0.148,
    shoulderX: 0.248,
    upperArm: 0.24,
    forearm: 0.222,
    hipWidth: 0.114,
    neckHeight: 0.042,
    headWidth: 0.272,
    headHeight: 0.322,
    headDepth: 0.276,
    seatedHipY: 0.6,
  },
  [Silhouette.Masculine]: {
    silhouette: Silhouette.Masculine,
    thigh: 0.378,
    shin: 0.395,
    torsoHeight: 0.632,
    torsoWidth: 0.46,
    torsoDepth: 0.344,
    chestWidth: 0.242,
    waistWidth: 0.204,
    shoulderX: 0.292,
    upperArm: 0.25,
    forearm: 0.23,
    hipWidth: 0.098,
    neckHeight: 0.042,
    headWidth: 0.298,
    headHeight: 0.318,
    headDepth: 0.294,
    seatedHipY: 0.59,
  },
  [Silhouette.Androgynous]: {
    silhouette: Silhouette.Androgynous,
    thigh: 0.393,
    shin: 0.407,
    torsoHeight: 0.603,
    torsoWidth: 0.44,
    torsoDepth: 0.328,
    chestWidth: 0.22,
    waistWidth: 0.178,
    shoulderX: 0.272,
    upperArm: 0.245,
    forearm: 0.225,
    hipWidth: 0.108,
    neckHeight: 0.042,
    headWidth: 0.285,
    headHeight: 0.32,
    headDepth: 0.285,
    seatedHipY: 0.595,
  },
}

/**
 * How a seated figure's legs are arranged.
 *
 * There are two seats in this game and they are not the same shape. A casino
 * stool is tall and the shins hang off it; a donation recliner puts its footrest
 * out and the legs go along it. Posing both the same way is what put a donor's
 * shins straight down through the footrest cushion — a chair whose whole point is
 * that you recline in it, being sat in as though it were a barstool.
 */
export enum SeatedLegs {
  /** Shins hang straight down, feet on a footring. A casino stool. */
  Hanging = 'hanging',
  /** Legs out along a footrest, barely bent. A donation recliner. */
  Extended = 'extended',
}

/**
 * Thigh and knee pitch for each arrangement, in radians.
 *
 * The thigh's is absolute; the knee's is relative to the thigh, because the shin
 * group is a child of it. `-PI/2` on the thigh swings the leg from hanging to
 * straight forward, and `+PI/2` on the knee folds the shin back down — so
 * `Hanging` is a right angle at both joints and `Extended` is a leg nearly
 * straight out, dropping just enough to meet a footrest.
 */
export const SEATED_LEG_PITCH: Record<
  SeatedLegs,
  { thigh: number; knee: number; ankle: number }
> = {
  [SeatedLegs.Hanging]: { thigh: -Math.PI / 2, knee: Math.PI / 2, ankle: 0 },
  /*
   * The ankle only matters here. A shoe is authored pointing along the shin's
   * forward axis, which is correct while the shin hangs — and once the leg is
   * out along a footrest that axis points at the ceiling, so both feet stood
   * bolt upright on the end of the legs like a pair of boxes on a shelf. This
   * drops the toes to about twenty degrees above horizontal, which is where a
   * relaxed foot sits.
   */
  [SeatedLegs.Extended]: { thigh: -Math.PI / 2 + 0.06, knee: 0.22, ankle: 0.9 },
}

/**
 * Where a seated figure's ankle ends up, in the seat's own frame.
 *
 * Pure, and here rather than in the component, because the answer has to agree
 * with a piece of furniture: an ankle is only in the right place relative to the
 * thing it is supposed to be resting on. The three silhouettes have different
 * leg lengths, so "the legs reach the footrest" is three different claims and
 * none of them is checkable by looking at a single capture.
 *
 * @param silhouette Which body, since leg length varies between them.
 * @param legs How the legs are arranged.
 * @param hipZ How far forward on the seat the hips sit.
 * @returns The ankle as `[z, y]`, forward and up from the seat's origin.
 */
export function seatedAnklePosition(
  silhouette: Silhouette,
  legs: SeatedLegs,
  hipZ = 0,
): readonly [number, number] {
  const body = PROPORTIONS[silhouette]
  const { thigh: thighPitch, knee: kneePitch } = SEATED_LEG_PITCH[legs]

  /*
   * How far each segment has dropped below horizontal.
   *
   * Measured from horizontal rather than from the rig's own zero because that
   * is what makes the trigonometry below readable: a segment at drop `d` runs
   * `cos d` forward and `sin d` down, whatever the rig calls that angle.
   */
  const thighDrop = thighPitch + Math.PI / 2
  const shinDrop = thighDrop + kneePitch

  return [
    hipZ + body.thigh * Math.cos(thighDrop) + body.shin * Math.cos(shinDrop),
    body.seatedHipY - body.thigh * Math.sin(thighDrop) - body.shin * Math.sin(shinDrop),
  ]
}

/**
 * Top of the head when seated.
 *
 * Needed because a seated figure has to clear the furniture in front of them to
 * be a person you can talk to rather than a hairstyle behind a counter. The
 * clinic's reception desk stands at counter height, and the difference between a
 * seat that works there and one that does not is about eight centimetres.
 */
export function seatedCrownY(silhouette: Silhouette): number {
  const body = PROPORTIONS[silhouette]
  return body.seatedHipY + body.torsoHeight + body.neckHeight + body.headHeight
}

/**
 * Heights and joint positions derived from a body, all measured from the floor.
 *
 * Everything the rig and the accessory anchors need that is a sum of the raw
 * measurements rather than a measurement itself.
 */
export interface BodyMetrics {
  /** Hip height when standing, which is simply the leg stacked up. */
  readonly hipY: number
  /** Shoulder height above the hip, in the torso group's local frame. */
  readonly shoulderYLocal: number
  readonly shoulderY: number
  readonly torsoTopY: number
  readonly headCenterY: number
  /** Top of the skull — where a hat sits. */
  readonly crownY: number
  /** Wrist height in the rest pose, arms hanging. */
  readonly wristY: number
  readonly totalHeight: number
}

/**
 * Shoulders sit this far up the torso; matches the original rig.
 *
 * Exported because the shoulder mass in `bodyParts.ts` has to be centred on
 * exactly this height. Two constants in two files that quietly disagree is the
 * trap this project has already been caught by twice — and here the symptom
 * would be a shoulder floating above the joint the arm actually hangs from,
 * which is the defect being fixed.
 */
export const SHOULDER_TORSO_FRACTION = 0.86

export function metricsFor(silhouette: Silhouette): BodyMetrics {
  const body = PROPORTIONS[silhouette]

  const hipY = body.thigh + body.shin
  const shoulderYLocal = body.torsoHeight * SHOULDER_TORSO_FRACTION
  const torsoTopY = hipY + body.torsoHeight
  const crownY = torsoTopY + body.neckHeight + body.headHeight

  return {
    hipY,
    shoulderYLocal,
    shoulderY: hipY + shoulderYLocal,
    torsoTopY,
    headCenterY: crownY - body.headHeight / 2,
    crownY,
    // The arm hangs straight down from the shoulder; the cuff stops a little
    // short of the fingertips, which is where a watch or bracelet sits.
    wristY: hipY + shoulderYLocal - body.upperArm - body.forearm + 0.03,
    totalHeight: crownY,
  }
}
