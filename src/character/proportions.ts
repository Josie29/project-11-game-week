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
 */

export enum Silhouette {
  Feminine = 'feminine',
  Masculine = 'masculine',
  Androgynous = 'androgynous',
}

export interface BodyProportions {
  readonly thigh: number
  readonly shin: number
  readonly torsoHeight: number
  readonly torsoWidth: number
  readonly torsoDepth: number
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
    thigh: 0.45,
    shin: 0.45,
    torsoHeight: 0.56,
    torsoWidth: 0.34,
    torsoDepth: 0.21,
    shoulderX: 0.212,
    upperArm: 0.27,
    forearm: 0.25,
    hipWidth: 0.095,
    neckHeight: 0.07,
    headWidth: 0.19,
    headHeight: 0.235,
    headDepth: 0.195,
    seatedHipY: 0.63,
  },
  [Silhouette.Masculine]: {
    thigh: 0.42,
    shin: 0.43,
    torsoHeight: 0.62,
    torsoWidth: 0.44,
    torsoDepth: 0.25,
    shoulderX: 0.262,
    upperArm: 0.285,
    forearm: 0.265,
    hipWidth: 0.115,
    neckHeight: 0.07,
    headWidth: 0.2,
    headHeight: 0.24,
    headDepth: 0.2,
    seatedHipY: 0.62,
  },
  [Silhouette.Androgynous]: {
    thigh: 0.43,
    shin: 0.44,
    torsoHeight: 0.59,
    torsoWidth: 0.39,
    torsoDepth: 0.23,
    shoulderX: 0.237,
    upperArm: 0.278,
    forearm: 0.258,
    hipWidth: 0.105,
    neckHeight: 0.07,
    headWidth: 0.195,
    headHeight: 0.238,
    headDepth: 0.198,
    seatedHipY: 0.625,
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

/** Shoulders sit this far up the torso; matches the original rig. */
const SHOULDER_TORSO_FRACTION = 0.86

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
