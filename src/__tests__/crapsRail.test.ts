import { describe, expect, it } from 'vitest'
import { CRAPS_RAIL_SPOTS, crapsRailSpot, SEATS, TableId } from '../scenes/casinoFloorLayout'

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

  // More players than places is possible: the room seats up to eight and the
  // rail has five. The extras double up at the far end rather than crashing or
  // landing off the table.
  it('never returns a place that does not exist', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    for (const id of many) {
      expect(CRAPS_RAIL_SPOTS).toContain(crapsRailSpot(id, 'a', many))
    }
  })
})
