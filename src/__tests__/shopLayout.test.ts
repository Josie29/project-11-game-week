import { describe, expect, it } from 'vitest'
import {
  COUNTER,
  counterCorners,
  ENTRANCE,
  HALF_DEPTH,
  HALF_WIDTH,
  isOnShopFloor,
  MIRROR,
  PLINTH,
  PLINTH_RADIUS,
  RACKS,
  rackEnds,
  WALL_MARGIN,
} from '../scenes/shopLayout'

describe('shop layout', () => {
  // The shop's `isOnFelt`. A rack whose far end pokes through the side wall, or
  // a counter overhanging the doorway, is invisible from the opening camera and
  // obvious the moment anyone orbits — which is exactly the class of bug that
  // put a chip stash over the table rail.
  it('keeps every rack inside the walls, end to end', () => {
    for (const rack of RACKS) {
      for (const [x, z] of rackEnds(rack)) {
        expect(
          isOnShopFloor(x, z, WALL_MARGIN),
          `rack end (${x}, ${z}) is inside a wall`,
        ).toBe(true)
      }
    }
  })

  it('keeps all four corners of the counter on the floor', () => {
    for (const [x, z] of counterCorners()) {
      expect(isOnShopFloor(x, z, WALL_MARGIN), `counter corner (${x}, ${z}) is off the floor`).toBe(
        true,
      )
    }
  })

  // The plinth is a disc, not a point, and the character standing on it is
  // wider still. Testing only its centre would let the whole thing hang off the
  // edge of the room.
  it('keeps the whole plinth on the floor', () => {
    const [x, z] = PLINTH
    const rim: readonly (readonly [number, number])[] = [
      [PLINTH_RADIUS, 0],
      [-PLINTH_RADIUS, 0],
      [0, PLINTH_RADIUS],
      [0, -PLINTH_RADIUS],
    ]

    for (const [dx, dz] of rim) {
      expect(isOnShopFloor(x + dx, z + dz)).toBe(true)
    }
  })

  // The mirror is the only way back into the designer once the shop is open.
  // Behind the plinth is where the character can be seen in front of it; the
  // same wall as the door would put it out of shot entirely.
  it('hangs the mirror on the wall behind the plinth', () => {
    const [, mirrorZ] = MIRROR
    const [, plinthZ] = PLINTH

    expect(mirrorZ).toBeLessThan(plinthZ)
    expect(Math.abs(mirrorZ)).toBeLessThanOrEqual(HALF_DEPTH)
  })

  // Walking in must not drop the player inside the counter or on the plinth.
  it('puts the entrance on clear floor', () => {
    const [entranceX, entranceZ] = ENTRANCE
    const [plinthX, plinthZ] = PLINTH
    const [counterX, counterZ] = COUNTER

    expect(isOnShopFloor(entranceX, entranceZ, WALL_MARGIN)).toBe(true)
    expect(Math.hypot(entranceX - plinthX, entranceZ - plinthZ)).toBeGreaterThan(PLINTH_RADIUS)
    expect(Math.hypot(entranceX - counterX, entranceZ - counterZ)).toBeGreaterThan(1.4)
  })

  // As with `isOnBody`, a predicate that returned true everywhere would leave
  // every test above passing while proving nothing.
  it('rejects points beyond the walls', () => {
    expect(isOnShopFloor(HALF_WIDTH + 0.5, 0)).toBe(false)
    expect(isOnShopFloor(0, -HALF_DEPTH - 0.5)).toBe(false)
    expect(isOnShopFloor(0, 0, HALF_DEPTH + 1)).toBe(false)
  })
})
