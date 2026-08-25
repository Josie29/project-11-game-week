/*
 * Where a worn item attaches to the body.
 *
 * Every anchor here is derived from `proportions.ts` rather than typed in by
 * hand, and every one is asserted against `isOnBody` before it is rendered.
 * This is the same rule `tableLayout.ts` follows and it exists for the same
 * reason: hand-derived 3D coordinates have been wrong more often on this
 * project than the game rules have, and a necklace floating a centimetre off
 * the chest is invisible in a wide shot and obvious in a close one.
 *
 * Anchors are given in the character root's frame, feet at y = 0, facing +Z,
 * in the standing rest pose. Wrist, finger and held items are re-parented onto
 * the moving joint groups when rendered — the rest-pose anchor is what gets
 * tested, because that is the pose in which a placement error is a placement
 * error rather than an animation artefact.
 */

import { Slot } from './catalog'
import { metricsFor, PROPORTIONS, Silhouette } from './proportions'

export type Anchor = readonly [number, number, number]

/** Which side of the body an anchor is measured on. */
export enum Side {
  Left = -1,
  Right = 1,
}

/**
 * The attachment point for a slot.
 *
 * @param slot Which slot the item occupies.
 * @param silhouette Whose body it is being fitted to.
 * @param side Which arm or foot, for the paired slots. Ignored by the rest.
 * @returns The anchor in the character root's frame.
 */
export function anchorFor(slot: Slot, silhouette: Silhouette, side: Side = Side.Right): Anchor {
  const body = PROPORTIONS[silhouette]
  const metrics = metricsFor(silhouette)

  switch (slot) {
    case Slot.Head:
      // Sits on the crown, pushed back a little so a brim clears the brow.
      return [0, metrics.crownY, -0.005]

    case Slot.Eyes:
      // Slightly above the head's centre, on the front face.
      return [0, metrics.headCenterY + 0.025, body.headDepth / 2]

    case Slot.Neck:
      return [0, metrics.torsoTopY - body.torsoHeight * 0.22, body.torsoDepth / 2]

    case Slot.Outerwear:
      return [0, metrics.hipY + body.torsoHeight / 2, 0]

    case Slot.Wrist:
      return [side * body.shoulderX, metrics.wristY, 0]

    case Slot.Finger:
      return [side * body.shoulderX, metrics.wristY - 0.09, 0.012]

    case Slot.Held:
      // Gripped just outside the hand, hanging beside the leg.
      return [side * (body.shoulderX + 0.06), metrics.wristY - 0.12, 0.05]

    case Slot.Feet:
      return [side * body.hipWidth, 0.035, 0.05]
  }
}

interface Box {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

/**
 * The figure approximated as four boxes: legs, torso, head and the two arms.
 *
 * Deliberately coarse. This is a containment test for placement bugs, not a
 * collision hull — it needs to catch a hat at knee height, not to model a lapel.
 */
function bodyBoxes(silhouette: Silhouette): readonly Box[] {
  const body = PROPORTIONS[silhouette]
  const metrics = metricsFor(silhouette)

  const armHalfWidth = 0.07
  const armMinY = metrics.wristY - 0.14

  const arms: Box[] = [Side.Left, Side.Right].map((side) => ({
    minX: Math.min(side * (body.shoulderX - armHalfWidth), side * (body.shoulderX + armHalfWidth)),
    maxX: Math.max(side * (body.shoulderX - armHalfWidth), side * (body.shoulderX + armHalfWidth)),
    minY: armMinY,
    maxY: metrics.shoulderY,
    minZ: -armHalfWidth,
    maxZ: armHalfWidth,
  }))

  return [
    // Legs and feet.
    {
      minX: -(body.hipWidth + 0.1),
      maxX: body.hipWidth + 0.1,
      minY: 0,
      maxY: metrics.hipY,
      minZ: -0.12,
      maxZ: 0.16,
    },
    // Torso.
    {
      minX: -body.torsoWidth / 2,
      maxX: body.torsoWidth / 2,
      minY: metrics.hipY,
      maxY: metrics.torsoTopY,
      minZ: -body.torsoDepth / 2,
      maxZ: body.torsoDepth / 2,
    },
    // Neck and head.
    {
      minX: -body.headWidth / 2,
      maxX: body.headWidth / 2,
      minY: metrics.torsoTopY,
      maxY: metrics.crownY,
      minZ: -body.headDepth / 2,
      maxZ: body.headDepth / 2,
    },
    ...arms,
  ]
}

/**
 * Tests whether a point lies on or just off the surface of the body.
 *
 * The margin is what makes worn items pass: a hat rests *above* the crown and a
 * pendant hangs *in front of* the chest, so both sit outside the body proper.
 * Anything further out than the margin is floating, which is the bug this
 * catches.
 *
 * @param point Anchor in the character root's frame.
 * @param silhouette Whose body to test against.
 * @param margin How far outside the body still counts as attached, in world units.
 */
export function isOnBody(point: Anchor, silhouette: Silhouette, margin = 0.06): boolean {
  const [x, y, z] = point

  return bodyBoxes(silhouette).some(
    (box) =>
      x >= box.minX - margin &&
      x <= box.maxX + margin &&
      y >= box.minY - margin &&
      y <= box.maxY + margin &&
      z >= box.minZ - margin &&
      z <= box.maxZ + margin,
  )
}
