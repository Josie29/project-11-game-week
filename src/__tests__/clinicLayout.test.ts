import { describe, expect, it } from 'vitest'
import { footprintsOverlap, isInside } from '../scenes/casinoFloorLayout'
import {
  CHAIR_COUNT,
  CHAIR_IDS,
  CHAIR_Z,
  chairIndex,
  chairPosition,
  chairSitSpot,
  ENTRANCE,
  EXIT_DOOR,
  EXIT_RADIUS,
  isOnClinicFloor,
  obstacles,
  ROOM,
  SIT_RADIUS,
  WALK_BOUNDS,
} from '../scenes/clinicLayout'

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

const CHAIRS = Array.from({ length: CHAIR_COUNT }, (_, index) => index)

describe('clinic layout', () => {
  // Four recliners in a row is the reference's whole composition. Overlapping
  // ones would interpenetrate, and the player would be pushed out of one into
  // the next with nowhere to stand between them.
  it('keeps the recliners and the desk apart', () => {
    const solids = obstacles()

    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]
        const b = solids[j]
        if (!a || !b) continue

        expect(footprintsOverlap(a, b), `obstacles ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  // F donates at whichever chair is nearest. Overlapping sit radii would leave
  // a patch of floor where the prompt is ambiguous — the same trap the casino
  // floor's two tables had to be kept out of, and much easier to fall into with
  // four chairs in a row instead of two tables across a room.
  it('keeps the four sit prompts from overlapping', () => {
    for (let i = 0; i < CHAIR_COUNT; i++) {
      for (let j = i + 1; j < CHAIR_COUNT; j++) {
        expect(
          gap(chairSitSpot(i), chairSitSpot(j)),
          `chairs ${i} and ${j} share a prompt`,
        ).toBeGreaterThan(SIT_RADIUS * 2)
      }
    }
  })

  // You have to be able to stand where the prompt appears. A sit spot inside
  // its own chair is unreachable, so that chair can never be used.
  it('puts every sit spot on clear, walkable floor', () => {
    const solids = obstacles()

    for (const index of CHAIRS) {
      const [x, , z] = chairSitSpot(index)

      expect(isOnClinicFloor(x, z, 0.6), `chair ${index} sit spot is in a wall`).toBe(true)
      expect(x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ)

      for (const solid of solids) {
        expect(isInside(solid, x, z), `chair ${index} sit spot is inside a solid`).toBe(false)
      }
    }
  })

  // The chair a prompt offers has to be the one beside you, not across the room.
  it('stands each sit spot beside its own chair', () => {
    for (const index of CHAIRS) {
      expect(gap(chairSitSpot(index), chairPosition(index))).toBeLessThan(2)

      for (const other of CHAIRS) {
        if (other === index) continue
        expect(gap(chairSitSpot(index), chairPosition(index))).toBeLessThan(
          gap(chairSitSpot(index), chairPosition(other)),
        )
      }
    }
  })

  // Arriving inside the exit's own trigger bounces the player straight back out
  // to the street: walk in, get thrown out, repeat.
  it('spawns the player clear of the exit and of the furniture', () => {
    expect(gap(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)

    const [x, , z] = ENTRANCE
    expect(isOnClinicFloor(x, z, 0.6)).toBe(true)
    for (const solid of obstacles()) {
      expect(isInside(solid, x, z)).toBe(false)
    }
  })

  // ...and the exit still has to be reachable from inside the walkable bounds.
  it('leaves the exit reachable', () => {
    const [, , exitZ] = EXIT_DOOR
    expect(Math.abs(exitZ - Math.min(exitZ, WALK_BOUNDS.maxZ))).toBeLessThan(EXIT_RADIUS)
  })

  // Chair ids are what the proximity target and the seat state agree on. A
  // mismatch seats the player in a chair that is not the one they walked to.
  it('round-trips every chair id', () => {
    expect(CHAIR_IDS).toHaveLength(CHAIR_COUNT)
    expect(CHAIR_Z).toHaveLength(CHAIR_COUNT)

    for (const index of CHAIRS) {
      expect(chairIndex(CHAIR_IDS[index] ?? '')).toBe(index)
    }
    expect(chairIndex('chair-nope')).toBe(-1)
  })

  // The fifth of these predicates, and the fifth to get this guard.
  it('rejects points outside the room', () => {
    expect(isOnClinicFloor(ROOM.minX - 1, 0)).toBe(false)
    expect(isOnClinicFloor(0, ROOM.maxZ + 1)).toBe(false)
    expect(isOnClinicFloor(0, 0, 100)).toBe(false)
  })
})
