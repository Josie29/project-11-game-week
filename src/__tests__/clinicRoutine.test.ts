import { describe, expect, it } from 'vitest'
import { isInside } from '../scenes/casinoFloorLayout'
import {
  CHAIR_COUNT,
  chairCameraAt,
  chairCameraTarget,
  chairPosition,
  chairSitSpot,
  DRAW_LINE_PATH,
  isOnClinicFloor,
  ivBagAt,
  obstacles,
  trayAt,
} from '../scenes/clinicLayout'
import {
  donationTimeline,
  drawProgress,
  NURSE_HOME,
  NURSE_PATROL,
  nurseStationFor,
  nurseStations,
} from '../scenes/clinicRoutine'

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0))
}

/** A chair anchor is `[x, y, z]`; a routine point is `[x, z]`. */
function flat(anchor: readonly number[]): readonly [number, number] {
  return [anchor[0] ?? 0, anchor[2] ?? 0]
}

const CHAIRS = Array.from({ length: CHAIR_COUNT }, (_, index) => index)

describe('the nurse walks somewhere she can actually walk', () => {
  // Hand-placed 3D coordinates, so they get asserted before they are rendered.
  // A waypoint inside a recliner walks her straight through the furniture, and
  // one outside the walls walks her through a wall.
  it('keeps every patrol waypoint on clear floor', () => {
    const solids = obstacles()

    for (const [x, z] of [...NURSE_PATROL, NURSE_HOME]) {
      expect(isOnClinicFloor(x, z, 0.5), `waypoint (${x}, ${z}) is in a wall`).toBe(true)

      for (const solid of solids) {
        expect(isInside(solid, x, z), `waypoint (${x}, ${z}) is inside the furniture`).toBe(false)
      }
    }
  })

  it('keeps every working station on clear floor', () => {
    const solids = obstacles()

    for (const [x, z] of nurseStations()) {
      expect(isOnClinicFloor(x, z, 0.5), `station (${x}, ${z}) is in a wall`).toBe(true)

      for (const solid of solids) {
        expect(isInside(solid, x, z), `station (${x}, ${z}) is inside the furniture`).toBe(false)
      }
    }
  })

  // She has to come to the chair the player is actually in.
  it('stations her nearest the chair she is working on', () => {
    for (const index of CHAIRS) {
      const station = nurseStationFor(index)

      for (const other of CHAIRS) {
        if (other === index) continue
        expect(
          gap(station, flat(chairPosition(index))),
          `station ${index} is closer to chair ${other}`,
        ).toBeLessThan(gap(station, flat(chairPosition(other))))
      }
    }
  })

  // ...and not into the player. The sit spot is where the donor stands to be
  // offered the chair, and the nurse arriving on the same square would put two
  // characters in one place.
  it('keeps her clear of where the player stands', () => {
    for (const index of CHAIRS) {
      expect(
        gap(nurseStationFor(index), flat(chairSitSpot(index))),
        `station ${index} is on top of the player`,
      ).toBeGreaterThan(0.6)
    }
  })

  // A round of two waypoints is a pace back and forth, not a round.
  it('walks a real loop', () => {
    expect(NURSE_PATROL.length).toBeGreaterThan(3)

    for (let i = 0; i < NURSE_PATROL.length; i++) {
      const here = NURSE_PATROL[i]
      const next = NURSE_PATROL[(i + 1) % NURSE_PATROL.length]
      if (!here || !next) continue

      // Consecutive waypoints far enough apart that she visibly travels.
      expect(gap(here, next), `waypoints ${i} and ${i + 1} are on top of each other`).toBeGreaterThan(1)
    }
  })
})

describe('donationTimeline', () => {
  // The payout hangs off `completeAt`, so the order here is the difference
  // between being paid after the draw and being paid while she is still
  // walking over. This is the ordering a screenshot cannot check, which is why
  // it is pure — the same reason `revealTimeline` is.
  it('runs strictly in order', () => {
    const { arriveAt, swabAt, needleAt, completeAt } = donationTimeline()

    expect(arriveAt).toBeGreaterThan(0)
    expect(swabAt).toBeGreaterThan(arriveAt)
    expect(needleAt).toBeGreaterThan(swabAt)
    expect(completeAt).toBeGreaterThan(needleAt)
  })

  /*
   * Ten seconds, on the nose.
   *
   * This is the price of a donation now that there is no cooldown — the only
   * thing standing between the player and unlimited money is how long they are
   * willing to sit still. Tuning any of the four legs has to keep the total
   * where it is, or the economy quietly changes with it.
   */
  it('takes exactly ten seconds', () => {
    expect(donationTimeline().completeAt).toBe(10_000)
  })
})

describe('drawProgress', () => {
  // Drives the level in the bag. Running before the needle is in would show
  // blood being drawn through thin air.
  it('is zero until the needle goes in and one at the end', () => {
    const { arriveAt, needleAt, completeAt } = donationTimeline()

    expect(drawProgress(0)).toBe(0)
    expect(drawProgress(arriveAt)).toBe(0)
    expect(drawProgress(needleAt)).toBe(0)
    expect(drawProgress(completeAt)).toBe(1)
    expect(drawProgress(completeAt + 5000)).toBe(1)
  })

  it('rises without going backwards', () => {
    let previous = 0

    for (let elapsed = 0; elapsed <= donationTimeline().completeAt; elapsed += 50) {
      const now = drawProgress(elapsed)
      expect(now).toBeGreaterThanOrEqual(previous)
      previous = now
    }
  })
})

describe('the line from the arm to the bag', () => {
  /*
   * Both ends are hand-placed, and both ends have been wrong.
   *
   * The line is drawn in the bag's local space, so an error at either end is
   * silent: the tube still renders, still looks like tubing, and simply does not
   * touch the arm. The first version ended inside the tray mesh and the second
   * ended at a bag so close to the arm that the whole line projected to about
   * nine pixels. Neither was visible as a bug in a screenshot — you have to
   * measure it.
   */
  it('starts at the donor’s arm and ends at the bag', () => {
    const needle = DRAW_LINE_PATH[0]
    const port = DRAW_LINE_PATH[DRAW_LINE_PATH.length - 1]
    expect(needle).toBeDefined()
    expect(port).toBeDefined()
    if (!needle || !port) return

    for (const index of CHAIRS) {
      const bag = ivBagAt(index)
      const tray = trayAt(index)

      // The needle end, in world space, has to land on the tray the donor's arm
      // is resting on — within an arm's width of it, not across the room.
      const reach = Math.hypot(
        bag[0] + needle[0] - tray[0],
        bag[1] + needle[1] - tray[1],
        bag[2] + needle[2] - tray[2],
      )
      expect(reach, `chair ${index}: the needle is ${reach.toFixed(2)} from the tray`).toBeLessThan(0.35)

      // ...and the port end has to stay at the bag it is drawn relative to.
      expect(Math.hypot(port[0], port[2]), `chair ${index}: the port is off the bag`).toBeLessThan(0.1)
    }
  })

  /*
   * A line that reads at one angle and vanishes at another is the bug that cost
   * two attempts here. The fixed chair camera looks along roughly (-0.76, -0.65)
   * in xz, so a line running that way collapses to a dot. Requiring real extent
   * across the *screen* — not just in world space — is what makes it visible.
   */
  it('crosses the camera rather than pointing down it', () => {
    const needle = DRAW_LINE_PATH[0]
    if (!needle) throw new Error('no line')

    const at = chairCameraTarget(0)

    /*
     * Both seats, because there are two now. The narrow-screen camera sits much
     * further out along +x to fit the recliner on a phone, which swings the view
     * direction — and the whole point of this assertion is that the line's
     * visibility is a fact about the *pair*, not about the line. A second camera
     * added without re-running this is exactly how the tubing went missing the
     * first two times.
     */
    for (const portrait of [false, true]) {
      const eye = chairCameraAt(0, portrait)

      // The camera's right vector in the xz plane: the view direction turned a
      // quarter turn. Anything the line has along this shows up as screen width.
      const viewX = at[0] - eye[0]
      const viewZ = at[2] - eye[2]
      const length = Math.hypot(viewX, viewZ)
      const [rightX, rightZ] = [-viewZ / length, viewX / length]

      const across = Math.abs(needle[0] * rightX + needle[2] * rightZ)
      const up = Math.abs(needle[1])

      expect(
        Math.hypot(across, up),
        `the line is nearly edge-on to the ${portrait ? 'portrait' : 'landscape'} camera`,
      ).toBeGreaterThan(0.6)

      // ...and the check has teeth: the version that shipped as a red stub,
      // which ran from the arm to a bag on the tray, fails it from either seat.
      const stub: readonly [number, number, number] = [-0.5, -0.1, -0.42]
      const stubAcross = Math.abs(stub[0] * rightX + stub[2] * rightZ)
      expect(Math.hypot(stubAcross, Math.abs(stub[1]))).toBeLessThan(0.6)
    }
  })
})
