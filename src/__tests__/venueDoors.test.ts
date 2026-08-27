import { describe, expect, it } from 'vitest'
import {
  BLACKJACK_SEAT_COUNT,
  BLACKJACK_SEAT_RADIUS,
  blackjackStandSpot,
  CRAPS_PROMPT,
  crapsPromptGap,
  EXIT_DOOR as CASINO_EXIT,
  EXIT_RADIUS as CASINO_EXIT_RADIUS,
  isInside,
  TABLE_FOOTPRINTS,
  TableId,
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
import {
  DESK_RADIUS,
  DESK_STAND,
  DISPLAYS,
  EXIT_DOOR as SHOP_EXIT,
  EXIT_RADIUS as SHOP_EXIT_RADIUS,
  MIRROR_RADIUS,
  MIRROR_STAND,
  TRY_RADIUS,
  WALK_BOUNDS as SHOP_BOUNDS,
} from '../scenes/shopLayout'
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

/**
 * The same, for a target stretched along x.
 *
 * Mirrors what `WalkingPlayer` actually measures, so a prompt asserted here to
 * be clear of something is clear of it at runtime too. `halfLength` of zero is
 * a circle, which is every prompt but one.
 */
function promptGap(
  point: readonly number[],
  target: { at: readonly number[]; halfLength?: number },
): number {
  const along = Math.max(
    0,
    Math.abs((point[0] ?? 0) - (target.at[0] ?? 0)) - (target.halfLength ?? 0),
  )
  return Math.hypot(along, (point[2] ?? 0) - (target.at[2] ?? 0))
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
      /*
       * Five stools and the craps rail.
       *
       * The stools are on this list individually because they are chosen
       * individually — you walk up to the one you want. They may overlap each
       * other, which is the clinic's rule and the reason the row is gapless;
       * they may not overlap the rail or the door, which offer other things
       * entirely.
       *
       * The rail carries a `halfLength`, because it is five metres of table
       * rather than a spot, and a circle wide enough to cover it necessarily
       * bulged that far past both ends as well — across the floor in front of
       * the third-base stool, which is how walking up to a blackjack seat came
       * to offer craps.
       */
      seats: [
        ...Array.from({ length: BLACKJACK_SEAT_COUNT }, (_, seat) => ({
          at: blackjackStandSpot(seat),
          radius: BLACKJACK_SEAT_RADIUS,
          halfLength: 0,
        })),
        {
          at: CRAPS_PROMPT.center,
          radius: CRAPS_PROMPT.radius,
          halfLength: CRAPS_PROMPT.halfLength,
        },
      ],
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
    {
      name: 'shop',
      exit: SHOP_EXIT,
      radius: SHOP_EXIT_RADIUS,
      bounds: SHOP_BOUNDS,
      /*
       * Twelve fixtures, the mirror and the till.
       *
       * The fixtures are allowed to overlap each other — F says "try this on"
       * at every one of them, so the nearest winning is the right answer. The
       * other two are in this list because their F does something else: the
       * mirror puts you on the plinth, the counter opens the bill.
       *
       * The counter is the one that has to be watched here. It stands between
       * the door and the rest of the room on purpose — everything carried out
       * is carried past it — which is exactly the arrangement that puts two
       * different prompts on the same patch of floor if the radii are careless.
       */
      seats: [
        ...DISPLAYS.map((display) => ({ at: display.standAt, radius: TRY_RADIUS })),
        { at: MIRROR_STAND, radius: MIRROR_RADIUS },
        { at: DESK_STAND, radius: DESK_RADIUS },
      ],
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
          promptGap(room.exit, seat),
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
   * A stool and the craps rail offer different things, so they must not both
   * be in range anywhere.
   *
   * This is the assertion the whole shape of the craps prompt exists for. The
   * blackjack seats used to be one spot far out at x = -7.5, so nothing ever
   * came near craps; spreading them across five stools puts third base within
   * two and a half metres of the rail, and craps was a 3.2 circle centred at
   * the shooter's end. Walking up to that stool was offered the wrong game.
   */
  it('never offers a blackjack stool and the craps rail at once', () => {
    for (let seat = 0; seat < BLACKJACK_SEAT_COUNT; seat++) {
      const stand = blackjackStandSpot(seat)

      expect(
        crapsPromptGap(stand[0], stand[2]),
        `seat ${seat} stands inside the craps prompt`,
      ).toBeGreaterThan(CRAPS_PROMPT.radius + BLACKJACK_SEAT_RADIUS)
    }
  })

  /*
   * ...and it has teeth. The circle craps used to carry fails it, which is what
   * says the assertion above is measuring something rather than passing because
   * everything is far apart anyway.
   */
  it('would reject the prompt shape that caused it', () => {
    const wasSpot = [-2.4, 0, 3.2] as const
    const wasRadius = 3.2

    const nearest = Math.min(
      ...Array.from({ length: BLACKJACK_SEAT_COUNT }, (_, seat) =>
        gap(wasSpot, blackjackStandSpot(seat)),
      ),
    )

    expect(nearest).toBeLessThan(wasRadius + BLACKJACK_SEAT_RADIUS)
  })

  /*
   * Every stool has to be reachable, or it is a seat that cannot be taken.
   *
   * The table's own footprint is what the player is pushed out of, so a prompt
   * that only reaches inside it can never fire — and the outer stools sit on an
   * ellipse that curves back toward the room, which is exactly where an arc of
   * prompts would have put them.
   */
  it('leaves every stool standable', () => {
    for (let seat = 0; seat < BLACKJACK_SEAT_COUNT; seat++) {
      const [x, , z] = blackjackStandSpot(seat)

      expect(isInside(TABLE_FOOTPRINTS[TableId.Blackjack], x, z), `seat ${seat}`).toBe(false)
      expect(x).toBeGreaterThanOrEqual(CASINO_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(CASINO_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(CASINO_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(CASINO_BOUNDS.maxZ)
    }
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
