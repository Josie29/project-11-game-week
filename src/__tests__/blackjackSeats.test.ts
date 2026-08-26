import { describe, expect, it } from 'vitest'
import { DISCARD_TRAY, PLAYER_SEATS, SHOE_POSITION } from '../scenes/tableLayout'

describe('PLAYER_SEATS', () => {
  /*
   * Which side of the table is the dealer's left is settled by two anchors that
   * already carry the answer in their own comments: the shoe sits at the
   * dealer's left and the discard tray at their right. Everything below is
   * derived from those rather than asserted independently, so the seats cannot
   * drift away from the furniture they are supposed to line up with.
   */
  const dealersLeftIsNegativeX = SHOE_POSITION[0] < DISCARD_TRAY[0]

  // Casino blackjack deals and plays from first base — the dealer's left —
  // clockwise round to third base. The engine takes seats in ascending index
  // order, so if this array were sorted the other way the whole table would
  // play backwards, and nothing on screen would look wrong while it did.
  it('runs from first base to third base', () => {
    expect(dealersLeftIsNegativeX).toBe(true)

    const xs = PLAYER_SEATS.map((seat) => seat.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(xs[0]).toBeLessThan(0)
    expect(xs[xs.length - 1]!).toBeGreaterThan(0)
  })

  // Five seats, because the felt has five betting spots and the engine caps a
  // table at the number of seats it was built with. One more chair than spots
  // is a player who can sit down and never bet.
  it('has one seat per betting spot', () => {
    expect(PLAYER_SEATS).toHaveLength(5)
  })

  // Every seat is outside the rail and on the players' side of it. A stool
  // placed past the dealer would seat somebody inside the table.
  it('places every seat on the players side of the table', () => {
    for (const seat of PLAYER_SEATS) {
      expect(seat.z).toBeGreaterThan(DISCARD_TRAY[2])
      expect(seat.z).toBeGreaterThan(SHOE_POSITION[2])
    }
  })
})
