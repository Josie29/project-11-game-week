import { describe, expect, it } from 'vitest'
import { CATALOG, findItem, itemsInSlot, Slot } from '../character/catalog'
import { WINDOW_OUTERWEAR } from '../character/windowDisplay'
import { footprintsOverlap, isInside } from '../scenes/casinoFloorLayout'
import {
  BACK_SHELF,
  CABINET_HEIGHT,
  CABINET_SHELVES,
  CASE_DECK_Y,
  CASE_GLASS_Y,
  CASE_PIECE_BASE_Y,
  CASE_PIECE_HEIGHT,
  CATALOG_IDS,
  CLERK_STAND,
  COUNTER,
  COUNTER_FOOTPRINT,
  COUNTER_HEIGHT,
  counterSubtendedAngle,
  DESK_CAMERA_AT,
  DESK_RADIUS,
  DESK_STAND,
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
  isInFittingShot,
  isOnShopFloor,
  isOnShowInCase,
  MIRROR,
  MIRROR_CAMERA_AT,
  MIRROR_HEIGHT,
  MIRROR_RADIUS,
  MIRROR_SILL,
  MIRROR_STAND,
  mirrorSubtendedAngle,
  obstacles,
  SHOE_CABINET,
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
    const spots = [
      ...DISPLAYS.map((display) => display.standAt),
      MIRROR_STAND,
      DESK_STAND,
      ENTRANCE,
    ]

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

  /*
   * The till is a third thing F can mean in this room, so it gets the mirror's
   * rule: never on offer at the same time as anything that does something else.
   *
   * The counter is the tightest of the three, because it went into a room that
   * was already furnished — the shoe niche in front of it is the one spot on
   * the floor where two different prompts nearly reach each other.
   */
  it('never offers the till and a display at once', () => {
    for (const display of DISPLAYS) {
      expect(
        gap(DESK_STAND, display.standAt),
        `the till and ${display.itemId} are both on offer somewhere`,
      ).toBeGreaterThan(DESK_RADIUS + TRY_RADIUS)
    }
  })

  /*
   * The till is offered to somebody walking in from the door.
   *
   * The clerk sends a player back from the door to pay, so the walk she sends
   * them on has to arrive somewhere. It did not: the till's radius was 1.4 and
   * the straight line in from the door passes 1.45 out, so a scripted walk
   * went from being called back to standing at the mirror, having been offered
   * the till at no point in between. Five centimetres, and no capture of this
   * room would ever have shown it — the walkthrough found it against the
   * deployed build.
   *
   * The line in is a good enough model of that walk: the door and the counter
   * are both on the same side of the room, so a player who holds forward from
   * one passes the other.
   */
  it('offers the till to a player walking in from the door', () => {
    const acrossTheAisle = Math.abs(DESK_STAND[0] - EXIT_DOOR[0])

    expect(acrossTheAisle, 'the walk in from the door misses the till').toBeLessThan(DESK_RADIUS)
    // ...on the way in, rather than behind them once they have passed it.
    expect(DESK_STAND[2]).toBeLessThan(EXIT_DOOR[2])
    expect(DESK_STAND[2]).toBeGreaterThan(WALK_BOUNDS.minZ)
  })

  // ...and the same for the mirror, which is the one that would hurt most: F at
  // the till while standing at the mirror would put you on the plinth holding a
  // bill you cannot pay.
  it('never offers the till and the mirror at once', () => {
    expect(gap(DESK_STAND, MIRROR_STAND)).toBeGreaterThan(DESK_RADIUS + MIRROR_RADIUS)
  })

  /*
   * ...and that check has teeth too.
   *
   * The till wants a radius as generous as the mirror's, and cannot have one:
   * this is the number that says so, and it is the assertion that stopped 2.6
   * being copied across.
   */
  it('would reject a till radius as wide as the mirror', () => {
    const nearest = Math.min(...DISPLAYS.map((display) => gap(DESK_STAND, display.standAt)))

    expect(MIRROR_RADIUS).toBeGreaterThan(DESK_RADIUS)
    expect(nearest).toBeLessThan(MIRROR_RADIUS + TRY_RADIUS)
  })

  /*
   * The clerk stands behind their own counter, where the player cannot.
   *
   * Every other figure in the game is unreachable by accident — a dealer behind
   * a table, a receptionist in a corner. This one stands in an open lane, so
   * the lane is inside `COUNTER_FOOTPRINT` and the customer's spot is not.
   * Without this, walking round the end of the counter puts the player inside
   * the clerk.
   */
  /*
   * The counter runs right up to the shoe cabinet, with no seam in between.
   *
   * `pushOut` moves the player to the *edge* of the box they are inside, so two
   * boxes that meet leave a line of floor that is inside neither. A scripted
   * walk in from the door found it twice: pushed east off the counter, it stood
   * exactly on the shelf's western edge and walked down it, through the staff
   * side and out of the back of the shop, past the till it had been sent to.
   *
   * The fix was one box rather than two, and this is the assertion that keeps
   * it one — the numbers live in two places because the cabinet is declared
   * further down the file than the counter is.
   */
  it('runs the counter block flush into the shoe cabinet', () => {
    expect(COUNTER_FOOTPRINT.maxX).toBe(SHOE_CABINET.minX)
    expect(BACK_SHELF.maxX).toBe(SHOE_CABINET.minX)

    // ...and the drawn shelf is inside what blocks the walk, so nothing here is
    // an invisible wall and nothing is furniture you can stand in.
    expect(BACK_SHELF.minX).toBeGreaterThanOrEqual(COUNTER_FOOTPRINT.minX)
    expect(BACK_SHELF.minX).toBeGreaterThan(COUNTER.maxX)
    expect(obstacles()).not.toContain(BACK_SHELF)
  })

  it('keeps the clerk behind the counter and the customer in front of it', () => {
    const [clerkX, , clerkZ] = CLERK_STAND
    expect(isInside(COUNTER_FOOTPRINT, clerkX, clerkZ)).toBe(true)
    expect(isOnShopFloor(clerkX, clerkZ, WALL_MARGIN)).toBe(true)

    const [deskX, , deskZ] = DESK_STAND
    expect(isInside(COUNTER_FOOTPRINT, deskX, deskZ)).toBe(false)

    // Facing each other across it: the customer on the low-x side, the clerk on
    // the high-x side, with the counter's own box between them.
    expect(deskX).toBeLessThan(COUNTER.minX)
    expect(clerkX).toBeGreaterThan(COUNTER.maxX)
    expect(COUNTER_HEIGHT).toBeLessThan(1.2)
  })

  /*
   * The checkout camera has to see the counter across the view, not along it.
   *
   * `mirrorSubtendedAngle`'s lesson on the one other piece of long, thin
   * geometry in this room. The first camera tried looked straight down the
   * counter's length and put 2.2 metres of it into nine degrees.
   */
  it('frames the counter wide enough to read as a counter', () => {
    expect(counterSubtendedAngle()).toBeGreaterThan(0.35)

    // On the customer's side of it, and above it, or the shot is of a wall.
    expect(DESK_CAMERA_AT[0]).toBeLessThan(COUNTER.minX)
    expect(DESK_CAMERA_AT[1]).toBeGreaterThan(COUNTER_HEIGHT)
    expect(DESK_CAMERA_AT[1]).toBeLessThan(WALL_HEIGHT)

    const [cameraX, , cameraZ] = DESK_CAMERA_AT
    for (const solid of obstacles()) {
      expect(isInside(solid, cameraX, cameraZ), 'the checkout camera is inside furniture').toBe(
        false,
      )
    }
  })

  /*
   * The counter and the clerk stay out of the fitting shot.
   *
   * The fitting camera stands out on the open floor rather than in a wall, so
   * the floor in front of it is a shot, not free space. The obvious home for a
   * till — the middle of the room — puts the clerk exactly on the line from
   * that camera to the player on the plinth, and the only symptom is a mirror
   * capture with a stranger standing in front of the reflection.
   */
  it('keeps the counter out of the fitting shot', () => {
    for (const [x, z] of footprintCorners(COUNTER_FOOTPRINT)) {
      expect(isInFittingShot(x, z), `a counter corner at (${x}, ${z}) is in the fitting shot`).toBe(
        false,
      )
    }

    const [clerkX, , clerkZ] = CLERK_STAND
    expect(isInFittingShot(clerkX, clerkZ), 'the clerk stands in the fitting shot').toBe(false)
  })

  // ...and that predicate has teeth: the thing the fitting camera exists to
  // look at had better be in front of it.
  it('still counts the plinth and the mirror as in the fitting shot', () => {
    expect(isInFittingShot(FITTING[0], FITTING[1])).toBe(true)
    expect(isInFittingShot(MIRROR[0], MIRROR[1])).toBe(true)
    // Behind the camera is not in shot, whatever the angle.
    expect(isInFittingShot(MIRROR_CAMERA_AT[0], MIRROR_CAMERA_AT[2] + 2)).toBe(false)
  })

  // Arriving inside the exit's own trigger bounces the player back onto the
  // street: walk in, get thrown out, repeat.
  it('spawns the player clear of the door and of the furniture', () => {
    expect(gap(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)
    // ...and clear of the till, or walking in opens with a bill for nothing.
    expect(gap(ENTRANCE, DESK_STAND)).toBeGreaterThan(DESK_RADIUS)

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

  /*
   * Everything in a glass case has to be visible through the glass.
   *
   * This shipped broken. The case's interior light was a *solid* emissive box
   * filling the glazed volume, and the bust and the piece were placed inside it,
   * so all four items sold from these cases — both necklaces, the watch and the
   * shades — were sealed in a featureless cream slab.
   *
   * Nothing on screen could say so. A case with nothing in it and a case with a
   * necklace hidden inside it are the same picture, and every existing capture
   * of this room in `shots/` points at the back wall, because the play camera
   * trails the player down the length of it.
   */
  it('keeps every case piece between the deck and the glass', () => {
    const cased = DISPLAYS.filter((display) => display.fixture === Fixture.Pedestal)
    expect(cased.length, 'no pedestal displays to check').toBeGreaterThan(0)

    expect(
      isOnShowInCase(CASE_PIECE_BASE_Y, CASE_PIECE_HEIGHT),
      `a piece ${CASE_PIECE_HEIGHT} tall standing at ${CASE_PIECE_BASE_Y} is not on show`,
    ).toBe(true)
  })

  /*
   * ...and the guard, which is the arrangement that shipped.
   *
   * A predicate that accepted a piece sunk into the cabinet, or one growing
   * through the lid, would have passed on the bug it exists to catch.
   */
  it('rejects a piece sunk below the deck or poking through the glass', () => {
    // Sunk into the case body, where the old solid glow box put it.
    expect(isOnShowInCase(CASE_DECK_Y - 0.2, CASE_PIECE_HEIGHT)).toBe(false)
    // Tall enough to grow through the lid.
    expect(isOnShowInCase(CASE_PIECE_BASE_Y, CASE_GLASS_Y)).toBe(false)
  })

  /*
   * Each pair of shoes has to sit on a shelf that exists.
   *
   * The niche heights were written in the scene and the cabinet drew its lit
   * shelf backs at the same numbers written again — one copy away from a pair of
   * shoes floating in front of a shelf it is not standing on.
   */
  it('stands every pair of shoes on a cabinet shelf', () => {
    const niches = DISPLAYS.filter((display) => display.fixture === Fixture.Niche)
    expect(niches.length).toBeGreaterThan(0)
    expect(CABINET_SHELVES.length).toBeGreaterThanOrEqual(niches.length)

    for (const shelf of CABINET_SHELVES) {
      expect(shelf, 'a shelf is through the floor').toBeGreaterThan(0)
      expect(shelf, 'a shelf is through the top of the cabinet').toBeLessThan(CABINET_HEIGHT)
    }

    // ...and they are in order and distinct, or two pairs share a shelf.
    for (let i = 1; i < CABINET_SHELVES.length; i++) {
      expect(CABINET_SHELVES[i] ?? 0).toBeGreaterThan(CABINET_SHELVES[i - 1] ?? 0)
    }
  })
})
