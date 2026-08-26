import { describe, expect, it } from 'vitest'
import {
  EXIT_DOOR as CASINO_EXIT,
  EXIT_RADIUS as CASINO_EXIT_RADIUS,
  SIT_RADII,
  SIT_SPOTS,
  TABLE_IDS,
  WALK_BOUNDS as CASINO_BOUNDS,
} from '../scenes/casinoFloorLayout'
import {
  CHAIR_COUNT,
  chairSitSpot,
  EXIT_DOOR as CLINIC_EXIT,
  EXIT_RADIUS as CLINIC_EXIT_RADIUS,
  SIT_RADIUS as CLINIC_SIT_RADIUS,
  WALK_BOUNDS as CLINIC_BOUNDS,
} from '../scenes/clinicLayout'
import { DOOR_TRIGGER_RADIUS, VENUES } from '../world/venues'

/*
 * Doors take a keypress, and F is the only key.
 *
 * That works because the player is never offered two things at once —
 * `WalkingPlayer` reports the single nearest target in range, and the handlers
 * lean on that rather than ranking anything themselves. The assertions here are
 * what make it true. All of them are invisible: two overlapping prompts look
 * fine in a screenshot, they just occasionally do the wrong thing.
 */

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

/** How close a point can come to a room's walk bounds. */
function reachDistance(
  point: readonly number[],
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): number {
  const x = Math.min(Math.max(point[0] ?? 0, bounds.minX), bounds.maxX)
  const z = Math.min(Math.max(point[2] ?? 0, bounds.minZ), bounds.maxZ)
  return gap(point, [x, 0, z])
}

describe('the doors on the strip', () => {
  // Two venues in range at once would make F a coin toss over which door you
  // walked through, and the prompt a coin toss over which one it named.
  it('never offers two at the same time', () => {
    for (const venue of VENUES) {
      for (const other of VENUES) {
        if (other.id === venue.id) continue

        expect(
          gap(venue.doorPosition, other.doorPosition),
          `${venue.name} and ${other.name} both offer at once`,
        ).toBeGreaterThan(DOOR_TRIGGER_RADIUS * 2)
      }
    }
  })
})

describe('the way out of a room', () => {
  const rooms = [
    {
      name: 'casino',
      exit: CASINO_EXIT,
      radius: CASINO_EXIT_RADIUS,
      bounds: CASINO_BOUNDS,
      // Per table: craps reaches much further than blackjack, because you play
      // it standing anywhere along five metres of rail.
      seats: TABLE_IDS.map((table) => ({ at: SIT_SPOTS[table], radius: SIT_RADII[table] })),
    },
    {
      name: 'clinic',
      exit: CLINIC_EXIT,
      radius: CLINIC_EXIT_RADIUS,
      bounds: CLINIC_BOUNDS,
      seats: Array.from({ length: CHAIR_COUNT }, (_, index) => ({
        at: chairSitSpot(index),
        radius: CLINIC_SIT_RADIUS,
      })),
    },
  ]

  /*
   * The invariant the F handlers rest on, and one that was false.
   *
   * Note it compares the *sum of the radii* to the separation, not the
   * separation to either one. Two circles do not have to contain each other's
   * centres to overlap, and it was the overlap that bit: the clinic's exit
   * carried a radius of 3, its end recliner offers from 1.6, and their centres
   * are 3.6 apart — so there was a lens of floor on the way to that chair where
   * both were in range and the door was the nearer. Walking over to sit down
   * took the chair's prompt away, and, back when the exit fired on contact, put
   * you out on the street instead.
   */
  it('never overlaps a seat', () => {
    for (const room of rooms) {
      for (const seat of room.seats) {
        expect(
          gap(room.exit, seat.at),
          `${room.name}: the exit and a seat are both on offer somewhere`,
        ).toBeGreaterThan(room.radius + seat.radius)
      }
    }
  })

  /*
   * ...and the check has teeth: the radius the clinic used to carry fails it.
   * Without this, a predicate that happened to pass everywhere would leave the
   * assertion above looking like proof of something.
   */
  it('would reject the radius that caused the bug', () => {
    const nearestSeat = Math.min(
      ...Array.from({ length: CHAIR_COUNT }, (_, index) => gap(CLINIC_EXIT, chairSitSpot(index))),
    )

    const wasRadius = 3
    expect(nearestSeat).toBeLessThan(wasRadius + CLINIC_SIT_RADIUS)
  })

  /*
   * There is no Escape-from-anywhere: the door is the only way back to the
   * strip. An exit the player cannot stand next to is therefore not a nuisance,
   * it is an unwinnable state, so being able to get inside its radius without
   * leaving the walkable floor is load-bearing.
   */
  it('can be stood at without leaving the floor', () => {
    for (const room of rooms) {
      expect(
        reachDistance(room.exit, room.bounds),
        `${room.name}: the exit cannot be reached`,
      ).toBeLessThan(room.radius)
    }
  })
})
