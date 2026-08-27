import { describe, expect, it } from 'vitest'
import {
  FRAME_MARGIN,
  frameWidth,
  fovToFit,
  LANDSCAPE_ASPECT,
  MAX_FOV,
  MIN_PLAY_FRAME,
  PLAY_FOV,
  playFov,
  PORTRAIT_ASPECT,
  subtendedAngle,
} from '../world/camera'
import {
  SEATED_VIEW,
  seatedCameraAt,
  seatedSubject,
  seatedTarget,
  seatedView,
  TABLE_IDS,
  waterfallHeadroom,
  waterfallSubtendedAngle,
} from '../scenes/casinoFloorLayout'
import {
  CHECKOUT_FOV,
  checkoutFov,
  counterSubtendedAngle,
  FITTING_FOV,
  fittingFov,
  mirrorSubtendedAngle,
} from '../scenes/shopLayout'
import { CHAIR_FOV, chairFov, chairSubtendedAngle } from '../scenes/clinicLayout'

const degrees = (radians: number): number => (radians * 180) / Math.PI

/**
 * Every shape of window somebody plays this on with a mouse.
 *
 * A 4:3 projector, a 16:10 laptop, the 16:9 the captures run at, and an
 * ultrawide. None of them may change.
 */
const DESKTOP_ASPECTS = [4 / 3, 16 / 10, LANDSCAPE_ASPECT, 21 / 9]

describe('subtendedAngle', () => {
  /*
   * The measure three separate layout modules used to carry their own copy of.
   * If it is wrong every framing assertion in the project is wrong in the same
   * direction and all of them keep passing.
   */
  it('measures the angle between the two most separated points', () => {
    // A metre either side of a camera one metre away is a right angle.
    const right = subtendedAngle([0, 0, 0], [
      [-1, 0, 1],
      [1, 0, 1],
    ])
    expect(degrees(right)).toBeCloseTo(90, 6)

    // A third point between them must not widen it.
    const withMiddle = subtendedAngle([0, 0, 0], [
      [-1, 0, 1],
      [0, 0, 1],
      [1, 0, 1],
    ])
    expect(withMiddle).toBeCloseTo(right, 12)
  })

  /*
   * The case it must reject. A measure that returned something for a single
   * point — or for two points in the same place — would let a subject with no
   * width at all pass every fits-on-screen assertion below.
   */
  it('is zero for a subject with no extent', () => {
    expect(subtendedAngle([0, 0, 0], [[1, 0, 1]])).toBe(0)

    // Two points in the same place come back as a few hundredths of an
    // arc-second rather than a hard zero: `acos` loses precision as its
    // argument approaches 1, and the dot product of a vector with itself does
    // not divide by its own length exactly. Anything at this scale is nothing.
    expect(
      subtendedAngle([0, 0, 0], [
        [1, 0, 1],
        [1, 0, 1],
      ]),
    ).toBeLessThan(1e-6)
  })
})

describe('frameWidth', () => {
  /*
   * The whole reason this change exists. `three` states a field of view
   * vertically, so the same camera shows a third as much across a phone as it
   * does across a desktop — and every subtended-angle assertion in this project
   * was written against the desktop number without ever saying so.
   */
  it('collapses as the window narrows', () => {
    expect(degrees(frameWidth(45, LANDSCAPE_ASPECT))).toBeCloseTo(72.7, 1)
    expect(degrees(frameWidth(45, PORTRAIT_ASPECT))).toBeCloseTo(21.7, 1)
  })

  it('is the vertical field of view on a square window', () => {
    expect(degrees(frameWidth(45, 1))).toBeCloseTo(45, 9)
  })
})

describe('fovToFit', () => {
  /*
   * The guarantee the whole feature rests on: a narrow window may widen a
   * camera, and a normal one may never touch it. Without this every portrait
   * fix is also a silent change to the game everybody actually plays.
   */
  it('never narrows, and never widens a camera that already fits', () => {
    const subject = (20 * Math.PI) / 180

    for (const aspect of DESKTOP_ASPECTS) {
      expect(fovToFit(subject, aspect, 45)).toBe(45)
    }
  })

  it('opens far enough to hold the subject, with its margin', () => {
    const subject = (24 * Math.PI) / 180
    const fov = fovToFit(subject, PORTRAIT_ASPECT, 42)

    expect(fov).toBeGreaterThan(42)
    expect(degrees(frameWidth(fov, PORTRAIT_ASPECT))).toBeCloseTo(24 * FRAME_MARGIN, 6)
  })

  /*
   * The cap has to bind, and the caller has to be able to tell that it did.
   * A subject too wide for any sane camera must come back *cropped* rather than
   * come back with a fish-eye — the answer to that case is to move the camera,
   * which is what `seatedView` does.
   */
  it('stops at MAX_FOV rather than distorting', () => {
    const enormous = (120 * Math.PI) / 180
    const fov = fovToFit(enormous, PORTRAIT_ASPECT, 45)

    expect(fov).toBe(MAX_FOV)
    expect(frameWidth(fov, PORTRAIT_ASPECT)).toBeLessThan(enormous)
  })
})

describe('playFov', () => {
  it('is PLAY_FOV on every desktop window', () => {
    for (const aspect of DESKTOP_ASPECTS) {
      expect(playFov(aspect)).toBe(PLAY_FOV)
    }
  })

  it('holds MIN_PLAY_FRAME across a phone', () => {
    expect(playFov(PORTRAIT_ASPECT)).toBeGreaterThan(PLAY_FOV)
    expect(frameWidth(playFov(PORTRAIT_ASPECT), PORTRAIT_ASPECT)).toBeGreaterThanOrEqual(
      MIN_PLAY_FRAME - 1e-9,
    )
  })
})

/*
 * The one test that stands between this change and a regression on the primary
 * target. Six cameras, four window shapes, and every one of them has to come
 * back with the number that shipped.
 *
 * Written here rather than in each layout suite on purpose: the failure it
 * catches is "somebody made the portrait branch unconditional", and that is one
 * mistake, not six.
 */
describe('the desktop game is untouched', () => {
  it('leaves every camera at the field of view it was composed at', () => {
    for (const aspect of DESKTOP_ASPECTS) {
      expect(playFov(aspect), `walking camera at aspect ${aspect}`).toBe(PLAY_FOV)
      expect(fittingFov(aspect), `fitting camera at aspect ${aspect}`).toBe(FITTING_FOV)
      expect(checkoutFov(aspect), `checkout camera at aspect ${aspect}`).toBe(CHECKOUT_FOV)
      expect(chairFov(aspect), `chair camera at aspect ${aspect}`).toBe(CHAIR_FOV)

      for (const table of TABLE_IDS) {
        const target = seatedTarget(table, 0, 1, false)
        expect(seatedView(table, target, aspect), `${table} seat at aspect ${aspect}`).toEqual(
          SEATED_VIEW[table],
        )
      }
    }
  })
})

/*
 * The ceiling every one of these measures was missing.
 *
 * The existing assertions are floors — "wide enough to read" — and they are all
 * still true on a phone, because a subtended angle is a fact about the geometry
 * and not about the window. What changes is whether the frame contains it, and
 * nothing measured that until now: the shop's mirror is 24.4 degrees wide and a
 * 42-degree camera shows 20 across a phone, so the one surface the fitting
 * scene exists for was cropped at both edges with every test passing.
 */
describe('every hero subject fits on a phone', () => {
  const fits = (subject: number, fov: number): boolean =>
    subject * FRAME_MARGIN <= frameWidth(fov, PORTRAIT_ASPECT) + 1e-9

  it('holds the shop mirror', () => {
    expect(fits(mirrorSubtendedAngle(), fittingFov(PORTRAIT_ASPECT))).toBe(true)
  })

  it('holds the checkout counter', () => {
    expect(fits(counterSubtendedAngle(), checkoutFov(PORTRAIT_ASPECT))).toBe(true)
  })

  it('holds the clinic recliner, its tray and its bag', () => {
    expect(fits(chairSubtendedAngle(0, true), chairFov(PORTRAIT_ASPECT))).toBe(true)
  })

  it('holds the waterfall, across and above', () => {
    expect(fits(waterfallSubtendedAngle(), playFov(PORTRAIT_ASPECT))).toBe(true)
    // Widening the camera can only gain headroom — until somebody changes
    // `playFov`, which is exactly when this should start failing.
    expect(waterfallHeadroom(PORTRAIT_ASPECT)).toBeGreaterThan(0.5)
  })

  /*
   * The two shots that could not be fixed by opening the camera. Blackjack's
   * felt spans 53 degrees of the seated view and craps' spans 64; `seatedView`
   * moves the camera back instead, and this is the assertion that says the move
   * was far enough.
   */
  it('holds what is played on at both tables', () => {
    for (const table of TABLE_IDS) {
      const target = seatedTarget(table, 0, 1, true)
      const view = seatedView(table, target, PORTRAIT_ASPECT)

      expect(view.fov, `${table} needs a fish-eye`).toBeLessThan(MAX_FOV)

      const subject = subtendedAngle(seatedCameraAt(view, target), seatedSubject(table))
      expect(fits(subject, view.fov), `${table} play area is cropped`).toBe(true)
    }
  })
})
