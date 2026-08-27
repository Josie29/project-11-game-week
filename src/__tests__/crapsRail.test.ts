import { describe, expect, it } from 'vitest'
import {
  CRAPS_RAIL_SPOTS,
  crapsRailFacing,
  crapsRailHasRoom,
  crapsRailSpot,
  SEATS,
  TableId,
} from '../scenes/casinoFloorLayout'
import { OUTER_HALF_DEPTH, OUTER_HALF_WIDTH } from '../scenes/crapsTableLayout'

describe('crapsRailSpot', () => {
  // A lone player must stand exactly where they have always stood. That spot is
  // the shooter's end, lined up with where the dice leave the hand, and every
  // craps capture in the suite frames it.
  it('leaves a single player on the shooter spot', () => {
    expect(CRAPS_RAIL_SPOTS[0]).toEqual(SEATS[TableId.Craps])
    expect(crapsRailSpot('a', 'a', ['a'])).toEqual(SEATS[TableId.Craps])
  })

  // Whoever holds the dice stands at the shooter's end, whether they arrived
  // first or last — the throw has to read as theirs.
  it('puts the shooter at the shooter end regardless of arrival order', () => {
    expect(crapsRailSpot('c', 'c', ['a', 'b', 'c'])).toEqual(CRAPS_RAIL_SPOTS[0])
    expect(crapsRailSpot('a', 'a', ['a', 'b', 'c'])).toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // Everybody else spreads along the rail rather than stacking on one spot,
  // which is the bug two players found by standing inside each other.
  it('gives everyone else their own place', () => {
    const lineup = ['a', 'b', 'c', 'd']
    const spots = lineup.map((id) => crapsRailSpot(id, 'b', lineup))

    expect(new Set(spots.map((s) => s[0])).size).toBe(lineup.length)
    expect(spots[1]).toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // The lineup arrives over a socket and can lag a join. Somebody it has not
  // caught up with must not be dropped on top of the shooter.
  it('does not stack an unknown player on the shooter', () => {
    expect(crapsRailSpot('stranger', 'a', ['a', 'b'])).not.toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // The spec's cap is eight players, and every one of them must have their own
  // place at the rail — the rail used to stop at five spots, so the back three
  // of a full line stood inside each other at the far end.
  it('gives a full table of eight a distinct spot each', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const spots = eight.map((id) => crapsRailSpot(id, 'a', eight))

    expect(CRAPS_RAIL_SPOTS).toHaveLength(eight.length)
    expect(new Set(spots.map((spot) => spot.join(','))).size).toBe(eight.length)
  })

  // A lineup momentarily larger than the rail — a race the socket can produce —
  // must clamp to a real place rather than crash or land off the table.
  it('never returns a place that does not exist', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    for (const id of many) {
      expect(CRAPS_RAIL_SPOTS).toContain(crapsRailSpot(id, 'a', many))
    }
  })
})

describe('crapsRailFacing', () => {
  // Every spot must look at the felt. A near-rail spot faces across -z, and the
  // two around the table's end face across -x — a player facing away from the
  // table they are betting on is the seated-figure equivalent of a wrong seat.
  it('faces every spot at the table', () => {
    for (const spot of CRAPS_RAIL_SPOTS) {
      const pastTheEnd = spot[0] > OUTER_HALF_WIDTH
      expect(crapsRailFacing(spot)).toBe(pastTheEnd ? -Math.PI / 2 : Math.PI)
      // And the spot itself stands off the table, not inside the woodwork.
      if (!pastTheEnd) expect(spot[2]).toBeGreaterThan(OUTER_HALF_DEPTH)
    }
  })

  // The shooter's facing is the one every craps capture frames; it must keep
  // returning exactly the value that shipped.
  it('keeps the shooter square to the felt', () => {
    expect(crapsRailFacing(CRAPS_RAIL_SPOTS[0]!)).toBe(Math.PI)
  })
})

describe('crapsRailHasRoom', () => {
  // The spec: eight players maximum, joining allowed while there is room. A
  // ninth walking up must not be offered a rail with nowhere to stand.
  it('refuses a stranger when every spot is spoken for', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(crapsRailHasRoom('stranger', eight)).toBe(false)
    expect(crapsRailHasRoom('stranger', eight.slice(0, 7))).toBe(true)
  })

  // A re-announce from somebody already at the table races the lineup. Reading
  // them as a ninth player would evict a player for changing their jacket.
  it('always has room for a player already in the lineup', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(crapsRailHasRoom('e', eight)).toBe(true)
  })
})
