import { describe, expect, it } from 'vitest'
import {
  BLACKJACK_ORIGIN,
  CRAPS_ORIGIN,
  DEALER_SPOTS,
  ENTRANCE,
  EXIT_DOOR,
  EXIT_RADIUS,
  footprintsOverlap,
  isInside,
  isOnCasinoFloor,
  ROOM,
  SEATS,
  SIT_RADIUS,
  SIT_SPOTS,
  TABLE_FOOTPRINTS,
  TABLE_IDS,
  TABLE_LABELS,
  tableOrigin,
  TableId,
  WALK_BOUNDS,
} from '../scenes/casinoFloorLayout'
import { DEALER_DEPTH, HALF_WIDTH, PLAYER_DEPTH } from '../scenes/tableLayout'

function distance2D(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

describe('casino floor layout', () => {
  // The craps table carries its own physics world. Moving it off the origin
  // means a `<Physics>` provider under a translated parent, which is exactly
  // the kind of thing that works in one build and silently stops working in the
  // next — the dice would fall through the felt or land somewhere else entirely.
  it('leaves the craps table at the world origin', () => {
    expect(CRAPS_ORIGIN).toEqual([0, 0, 0])
    expect(tableOrigin(TableId.Craps)).toEqual([0, 0, 0])
  })

  // Both tables keep their own local axes so a table camera only adds an
  // offset. A rotated table would need the target rotated too, and the framing
  // that shipped would drift without anything failing.
  it('offsets the blackjack table along one axis only', () => {
    const [, y, z] = BLACKJACK_ORIGIN
    expect(y).toBe(0)
    expect(z).toBe(0)
  })

  // Two tables occupying the same floor is the whole feature. Overlapping ones
  // would interpenetrate, and the player would be pushed out of one into the
  // other with nowhere to stand.
  it('keeps the two table footprints apart', () => {
    expect(
      footprintsOverlap(
        TABLE_FOOTPRINTS[TableId.Blackjack],
        TABLE_FOOTPRINTS[TableId.Craps],
      ),
    ).toBe(false)
  })

  // The footprint is what the player is kept out of, so it has to actually
  // contain the table it stands for. A footprint smaller than its felt lets the
  // player walk into the table.
  it('covers each table with its own footprint', () => {
    const blackjack = TABLE_FOOTPRINTS[TableId.Blackjack]
    const [originX] = BLACKJACK_ORIGIN

    expect(isInside(blackjack, (originX ?? 0) - HALF_WIDTH + 0.05, 0)).toBe(true)
    expect(isInside(blackjack, (originX ?? 0) + HALF_WIDTH - 0.05, 0)).toBe(true)
    expect(isInside(blackjack, originX ?? 0, PLAYER_DEPTH - 0.05)).toBe(true)
    expect(isInside(blackjack, originX ?? 0, -DEALER_DEPTH + 0.05)).toBe(true)

    // ...and each table's own dealer stands inside it, so the player cannot
    // walk through the staff either.
    for (const table of TABLE_IDS) {
      const [dealerX, , dealerZ] = DEALER_SPOTS[table]
      expect(isInside(TABLE_FOOTPRINTS[table], dealerX, dealerZ)).toBe(true)
    }
  })

  // The sit prompt is a proximity check, and F sits you at whichever table is
  // nearest. If two sit radii overlapped there would be a patch of floor where
  // F is ambiguous and the player gets the table they did not walk up to.
  it('keeps the two sit prompts from overlapping', () => {
    const apart = distance2D(SIT_SPOTS[TableId.Blackjack], SIT_SPOTS[TableId.Craps])
    expect(apart).toBeGreaterThan(SIT_RADIUS * 2)
  })

  // You have to be able to stand where the prompt appears. A sit spot inside
  // its own table's footprint is unreachable, so the prompt never fires and the
  // table cannot be played at all.
  it('puts every sit spot on clear, walkable floor', () => {
    for (const table of TABLE_IDS) {
      const [x, , z] = SIT_SPOTS[table]

      expect(isOnCasinoFloor(x, z, 0.6), `${table} sit spot is in a wall`).toBe(true)
      expect(x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ)

      for (const other of TABLE_IDS) {
        expect(
          isInside(TABLE_FOOTPRINTS[other], x, z),
          `${table} sit spot is inside the ${other} table`,
        ).toBe(false)
      }
    }
  })

  // The seat is where the character is drawn once sitting, and it belongs at
  // the table rather than on the floor beside it.
  it('places each seat at its own table', () => {
    for (const table of TABLE_IDS) {
      const [seatX, , seatZ] = SEATS[table]
      const [originX, , originZ] = tableOrigin(table)

      expect(distance2D(SEATS[table], [originX, 0, originZ])).toBeLessThan(4)
      expect(isInside(TABLE_FOOTPRINTS[table], seatX, seatZ)).toBe(true)
    }
  })

  // Arriving inside the exit's own trigger would bounce the player straight
  // back onto the street — walk in, get thrown out, repeat. This is the same
  // trap `leaveVenue` avoids with its EXIT_OFFSET on the way out.
  it('spawns the player clear of the exit trigger', () => {
    expect(distance2D(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)

    const [x, , z] = ENTRANCE
    expect(isOnCasinoFloor(x, z, 0.6)).toBe(true)
    for (const table of TABLE_IDS) {
      expect(isInside(TABLE_FOOTPRINTS[table], x, z)).toBe(false)
    }
  })

  // ...but it must still be reachable: the player walks to the exit, so the
  // walkable bounds have to come within trigger range of it.
  it('leaves the exit reachable from inside the walkable bounds', () => {
    const [exitX, , exitZ] = EXIT_DOOR
    const nearestReachableZ = Math.min(exitZ, WALK_BOUNDS.maxZ)

    expect(Math.abs(exitZ - nearestReachableZ)).toBeLessThan(EXIT_RADIUS)
    expect(exitX).toBeGreaterThan(WALK_BOUNDS.minX)
    expect(exitX).toBeLessThan(WALK_BOUNDS.maxX)
  })

  // Every table needs a name for the prompt, or the player is told to press F
  // to sit at nothing.
  it('labels every table', () => {
    for (const table of TABLE_IDS) {
      expect(TABLE_LABELS[table]).toBeTruthy()
    }
    expect(TABLE_IDS).toHaveLength(Object.keys(TableId).length)
  })

  // The fourth of these predicates on the project, and the fourth to get this
  // guard: one that returned true everywhere would leave the file passing while
  // proving nothing.
  it('rejects points outside the room', () => {
    expect(isOnCasinoFloor(ROOM.minX - 1, 0)).toBe(false)
    expect(isOnCasinoFloor(ROOM.maxX + 1, 0)).toBe(false)
    expect(isOnCasinoFloor(0, ROOM.maxZ + 1)).toBe(false)
    expect(isInside(TABLE_FOOTPRINTS[TableId.Craps], 100, 100)).toBe(false)
  })
})
