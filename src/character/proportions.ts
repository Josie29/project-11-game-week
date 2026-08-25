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
