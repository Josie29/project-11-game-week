import { describe, expect, it } from 'vitest'
import { CATALOG, findItem, itemsInSlot, Slot } from '../character/catalog'
import { WINDOW_OUTERWEAR } from '../character/windowDisplay'
import { footprintsOverlap, isInside } from '../scenes/casinoFloorLayout'
import {
  CATALOG_IDS,
  DISPLAYS,
  displayFor,
  Fixture,
  displayId,
  displayItemId,
  ENTRANCE,
  EXIT_DOOR,
  EXIT_RADIUS,
  FITTING,
  FITTING_RADIUS,
  footprintCorners,
  HALF_DEPTH,
  HALF_WIDTH,
  isOnShopFloor,
  MIRROR,
  MIRROR_CAMERA_AT,
  MIRROR_HEIGHT,
  MIRROR_RADIUS,
  MIRROR_SILL,
  MIRROR_STAND,
  mirrorSubtendedAngle,
  obstacles,
  TRY_RADIUS,
  WALK_BOUNDS,
  WALL_HEIGHT,
  WALL_MARGIN,
} from '../scenes/shopLayout'

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

describe('shop layout', () => {
  /*
   * The invariant the whole redesign rests on.
   *
   * The shop is no longer a list — an item that has no fixture is an item no
   * player can find, try on or buy, and nothing else in the build would notice.
   * Adding a thirteenth item to the catalogue has to fail here rather than ship.
   */
  it('puts every catalogue item on exactly one fixture', () => {
    expect(DISPLAYS).toHaveLength(CATALOG.length)

    for (const id of CATALOG_IDS) {
      const shown = DISPLAYS.filter((display) => display.itemId === id)
      expect(shown, `${id} is not on display anywhere`).toHaveLength(1)
    }

    for (const display of DISPLAYS) {
      expect(findItem(display.itemId), `${display.itemId} is not in the catalogue`).not.toBeNull()
    }
  })

  /*
   * The window seen from the street and the platform seen from inside are the
   * same three forms.
   *
   * They used to be two lists, one private to `ShopFront.tsx`. A window showing
   * clothes the shop does not stock is the sort of detail that costs nothing to
   * get right and reads as carelessness when it is wrong — and quietly drifting
   * apart is exactly how two copies of a list go wrong.
   */
  it('shows the same three outfits in the window as on the platform', () => {
    const onPlatform = DISPLAYS.filter((display) => display.fixture === Fixture.Mannequin).map(
      (display) => display.itemId,
    )

    expect(onPlatform).toEqual([...WINDOW_OUTERWEAR])
    expect([...onPlatform].sort()).toEqual(
      itemsInSlot(Slot.Outerwear)
        .map((item) => item.id)
        .sort(),
    )
  })

  // Target ids are what the proximity check and the F handler agree on. A
  // mismatch tries on whatever the last display happened to be.
  it('round-trips every display id', () => {
    for (const display of DISPLAYS) {
      expect(displayItemId(displayId(display.itemId))).toBe(display.itemId)
      expect(displayFor(display.itemId)).toBe(display)
    }

    expect(displayItemId('exit')).toBeNull()
    expect(displayItemId('mirror')).toBeNull()
    expect(displayFor('no-such-item')).toBeNull()
  })

  // A case half inside a wall reads as a rendering glitch, and until the room
  // was walkable there was no angle it could be seen from.
  it('keeps every fitting inside the walls', () => {
    for (const solid of obstacles()) {
      for (const [x, z] of footprintCorners(solid)) {
        expect(isOnShopFloor(x, z, WALL_MARGIN), `a fitting corner at (${x}, ${z}) is in a wall`).toBe(
          true,
        )
      }
    }

    for (const display of DISPLAYS) {
      const [x, z] = display.at
      expect(isOnShopFloor(x, z, 0), `${display.itemId} sits outside the room`).toBe(true)
    }
  })

  // Two pieces of furniture in the same place interpenetrate, and the player is
  // pushed out of one straight into the next.
  it('keeps the fittings apart', () => {
    const solids = obstacles()

    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]
        const b = solids[j]
        if (!a || !b) continue

        expect(footprintsOverlap(a, b), `fittings ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  // You have to be able to stand where a prompt appears. A stand spot inside
  // the case it belongs to is unreachable, so that item can never be tried on.
  it('puts every stand spot on clear, walkable floor', () => {
    const solids = obstacles()
    const spots = [...DISPLAYS.map((display) => display.standAt), MIRROR_STAND, ENTRANCE]

    for (const spot of spots) {
      const [x, , z] = spot
      expect(isOnShopFloor(x, z, 0.6), `(${x}, ${z}) is in a wall`).toBe(true)
      expect(x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ)

      for (const solid of solids) {
        expect(isInside(solid, x, z), `(${x}, ${z}) is inside a solid`).toBe(false)
      }
    }
  })

  // The prompt has to name the thing beside you rather than one across the room.
  it('offers the nearest display from where you stand at it', () => {
    for (const display of DISPLAYS) {
      for (const other of DISPLAYS) {
        if (other === display) continue

        expect(
          gap(display.standAt, display.standAt),
          `${other.itemId} wins where ${display.itemId} should`,
        ).toBeLessThan(gap(display.standAt, other.standAt))
      }

      // ...and the fixture the prompt offers is the one you are next to.
      const [ax, az] = display.at
      for (const other of DISPLAYS) {
        if (other === display) continue
        const [bx, bz] = other.at
        expect(gap(display.standAt, [ax, 0, az])).toBeLessThan(gap(display.standAt, [bx, 0, bz]))
      }
    }
  })

  /*
   * No dead floor along a run of displays.
   *
   * The clinic's lesson: a tight radius leaves stretches of floor between the
   * fixtures where nothing is on offer, and walking the row steps over the
   * prompt rather than into it. Overlap is fine — `WalkingPlayer` reports the
   * nearest — so what matters is that every display has a neighbour within
   * reach of it.
   */
  it('leaves no dead floor between one display and the next', () => {
    for (const display of DISPLAYS) {
      const nearest = Math.min(
        ...DISPLAYS.filter((other) => other !== display).map((other) =>
          gap(display.standAt, other.standAt),
        ),
      )

      expect(nearest, `${display.itemId} stands alone in a dead patch`).toBeLessThan(TRY_RADIUS * 2)
    }
  })

  /*
   * The mirror is the only fixture whose F does something else — it puts you on
   * the plinth and opens the till. Sharing a patch of floor with a display would
   * make which one you got a matter of a few centimetres.
   *
   * `venueDoors.test.ts` holds the same line for the exit.
   */
  it('never offers the mirror and a display at once', () => {
    for (const display of DISPLAYS) {
      expect(
        gap(MIRROR_STAND, display.standAt),
        `the mirror and ${display.itemId} are both on offer somewhere`,
      ).toBeGreaterThan(MIRROR_RADIUS + TRY_RADIUS)
    }
  })

  /*
   * ...and the check has teeth.
   *
   * The clinic's exit carried a radius of 3 and overlapped a recliner's prompt
   * by a lens of floor nobody spotted until it took the chair's prompt away.
   * A generous mirror radius here would do the same to the shoe cabinet, so the
   * assertion above has to be one a too-wide radius actually fails.
   */
  it('would reject a mirror radius that reached a display', () => {
    const nearest = Math.min(...DISPLAYS.map((display) => gap(MIRROR_STAND, display.standAt)))

    const tooWide = 3.5
    expect(tooWide).toBeGreaterThan(MIRROR_RADIUS)
    expect(nearest).toBeLessThan(tooWide + TRY_RADIUS)
  })

  // Arriving inside the exit's own trigger bounces the player back onto the
  // street: walk in, get thrown out, repeat.
  it('spawns the player clear of the door and of the furniture', () => {
    expect(gap(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)

    const [x, , z] = ENTRANCE
    for (const solid of obstacles()) {
      expect(isInside(solid, x, z)).toBe(false)
    }
  })

  /*
   * ...and not so far from the stock that walking in says nothing.
   *
   * Deliberately looser than the clinic's "within reach of a chair": a shop you
   * enter already standing at a rail has no room to be looked at. Two strides
   * is the target, which is what this bounds.
   */
  it('spawns the player a short walk from the nearest display', () => {
    const nearest = Math.min(...DISPLAYS.map((display) => gap(ENTRANCE, display.standAt)))
    expect(nearest).toBeLessThan(4)
  })

  // The mirror has to be stood at from the floor, and the plinth in front of it
  // has to be the thing you end up on.
  it('places the fitting plinth between the mirror and where you stand', () => {
    expect(MIRROR[1]).toBeLessThan(FITTING[1])
    expect(FITTING[1]).toBeLessThan(MIRROR_STAND[2])
    expect(gap(MIRROR_STAND, [FITTING[0], 0, FITTING[1]])).toBeLessThan(MIRROR_RADIUS)
    expect(MIRROR_SILL + MIRROR_HEIGHT).toBeLessThan(WALL_HEIGHT)
  })

  /*
   * The fitting camera has to actually see the mirror.
   *
   * Twice on this project a piece of geometry has been the right shape in the
   * right place and invisible, because it ran along the fixed camera's own axis
   * and projected to a sliver. The mirror is the one surface in this room that
   * has to be legible, so its width is measured across the view rather than in
   * the world — and the player has to be between the camera and it, or they are
   * looking at an empty mirror.
   */
  it('frames the mirror wide enough to see a reflection in', () => {
    expect(mirrorSubtendedAngle()).toBeGreaterThan(0.35)

    expect(MIRROR_CAMERA_AT[2]).toBeGreaterThan(FITTING[1])
    expect(FITTING[1]).toBeGreaterThan(MIRROR[1])

    // Off the mirror's normal, or the reflection hides behind the player's head.
    expect(Math.abs(MIRROR_CAMERA_AT[0] - FITTING[0])).toBeGreaterThan(0.8)
    // ...and on the +x side, so the figure frames clear of the fitting panel.
    expect(MIRROR_CAMERA_AT[0]).toBeGreaterThan(FITTING[0])
  })

  // The exit still has to be reachable from inside the walkable bounds — there
  // is no Escape-from-anywhere, so an unreachable door is an unwinnable state.
  it('leaves the door reachable', () => {
    const clampedZ = Math.min(EXIT_DOOR[2], WALK_BOUNDS.maxZ)
    expect(gap(EXIT_DOOR, [EXIT_DOOR[0], 0, clampedZ])).toBeLessThan(EXIT_RADIUS)
  })

  // The fourth of these predicates, and the fourth to get this guard: one that
  // returned true everywhere would leave the whole suite above passing while
  // proving nothing.
  it('rejects points outside the room', () => {
    expect(isOnShopFloor(HALF_WIDTH + 0.5, 0)).toBe(false)
    expect(isOnShopFloor(0, -HALF_DEPTH - 0.5)).toBe(false)
    expect(isOnShopFloor(0, 0, HALF_DEPTH + 1)).toBe(false)
    expect(FITTING_RADIUS).toBeGreaterThan(0)
  })
})
