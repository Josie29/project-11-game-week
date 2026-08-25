import { describe, expect, it } from 'vitest'
import { isInside } from '../scenes/casinoFloorLayout'
import {
  CHAIR_COUNT,
  chairPosition,
  chairSitSpot,
  isOnClinicFloor,
  obstacles,
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
