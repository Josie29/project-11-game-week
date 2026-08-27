import { describe, expect, it } from 'vitest'
import {
  moveVector,
  stickKnob,
  STICK_DEAD_ZONE,
  STICK_IDLE,
  STICK_TRAVEL,
  stickVector,
} from '../world/touchInput'

describe('stickVector', () => {
  /*
   * Forward is up, and screen coordinates run the other way. Get this backwards
   * and the game walks the player away from wherever they are pointing — which
   * is obvious the moment anybody tries it and invisible in every capture,
   * because a still of a player walking north and one walking south are the
   * same picture.
   */
  it('treats up the screen as forward', () => {
    const pushed = stickVector(100, 100, 100, 100 - STICK_TRAVEL)

    expect(pushed.y).toBeCloseTo(1, 9)
    expect(pushed.x).toBeCloseTo(0, 9)
    expect(pushed.magnitude).toBeCloseTo(1, 9)
  })

  it('treats right as right', () => {
    expect(stickVector(100, 100, 100 + STICK_TRAVEL, 100).x).toBeCloseTo(1, 9)
  })

  /*
   * The case it must reject. A thumb resting on glass is never perfectly still,
   * and without a dead zone the player drifts into walls while doing nothing —
   * which reads as the game being broken rather than as the control being
   * twitchy.
   */
  it('ignores a thumb resting inside the dead zone', () => {
    const barelyMoved = STICK_TRAVEL * STICK_DEAD_ZONE * 0.9

    expect(stickVector(100, 100, 100 + barelyMoved, 100)).toBe(STICK_IDLE)
    expect(stickVector(100, 100, 100, 100)).toBe(STICK_IDLE)
  })

  /*
   * And it must not step. Rescaling from the edge of the dead zone rather than
   * reporting the raw push is the difference between a stick that eases into a
   * walk and one that jumps to a fifth speed the instant it engages.
   */
  it('eases out of the dead zone rather than jumping', () => {
    const justOutside = STICK_TRAVEL * (STICK_DEAD_ZONE + 0.001)

    expect(stickVector(100, 100, 100, 100 - justOutside).magnitude).toBeLessThan(0.01)
  })

  it('never asks for more than full speed', () => {
    const shoved = stickVector(100, 100, 100 + STICK_TRAVEL * 4, 100 - STICK_TRAVEL * 4)

    expect(shoved.magnitude).toBeCloseTo(1, 9)
    expect(Math.hypot(shoved.x, shoved.y)).toBeCloseTo(1, 9)
  })
})

describe('stickKnob', () => {
  /*
   * The knob follows the thumb through the dead zone even though the walk does
   * not. A control that visibly ignores the first few millimetres of a drag
   * reads as unresponsive, which is a worse bug than the drift the dead zone
   * fixes.
   */
  it('follows the thumb inside the dead zone', () => {
    const inside = STICK_TRAVEL * STICK_DEAD_ZONE * 0.5

    expect(stickKnob(100, 100, 100 + inside, 100).x).toBeCloseTo(inside, 9)
  })

  it('stays inside the stick', () => {
    const knob = stickKnob(100, 100, 100 + STICK_TRAVEL * 3, 100)

    expect(Math.hypot(knob.x, knob.y)).toBeCloseTo(STICK_TRAVEL, 9)
  })
})

describe('moveVector', () => {
  /*
   * The guarantee that keeps this change off the desktop game. With no stick
   * attached the walk loop has to produce exactly what it produced before —
   * a unit vector or nothing — and it has to do it by arithmetic rather than by
   * a branch that only runs on hardware the tests never see.
   */
  it('is unchanged for a keyboard with no stick', () => {
    expect(moveVector(0, 0, STICK_IDLE)).toBe(STICK_IDLE)

    for (const [keyX, keyY] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, -1],
    ] as const) {
      const move = moveVector(keyX, keyY, STICK_IDLE)

      expect(move.magnitude, `keys ${keyX},${keyY}`).toBeCloseTo(1, 9)
      expect(Math.hypot(move.x, move.y), `keys ${keyX},${keyY}`).toBeCloseTo(1, 9)
    }
  })

  /*
   * The whole reason the stick is analog. A phone player pushing halfway should
   * walk at half speed; the keyboard has no way to ask for that and never will.
   */
  it('walks at the speed the stick asks for', () => {
    const half = stickVector(100, 100, 100, 100 - STICK_TRAVEL * 0.59)
    const move = moveVector(0, 0, half)

    expect(move.magnitude).toBeGreaterThan(0.4)
    expect(move.magnitude).toBeLessThan(0.6)
  })

  it('never exceeds full speed when both are pushed the same way', () => {
    const full = stickVector(100, 100, 100, 100 - STICK_TRAVEL)

    expect(moveVector(0, 1, full).magnitude).toBeCloseTo(1, 9)
  })
})
