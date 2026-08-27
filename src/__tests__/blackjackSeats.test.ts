import { describe, expect, it } from 'vitest'
import { DISCARD_TRAY, PLAYER_SEATS, SHOE_POSITION } from '../scenes/tableLayout'
import { byPlayOrder } from '../../worker/playOrder'

describe('PLAYER_SEATS', () => {
  /*
   * Which side is the dealer's left is geometry, not furniture. This test once
   * derived it from the shoe — "the shoe sits at the dealer's left" — but that
   * inference had the handedness backwards: the dealer stands on the negative-z
   * side of the table facing the players at positive z, and a person facing +z
   * with +y up has their left hand at *positive* x. So first base, the
   * dealer's left, is the highest-x stool — the player's screen-right — and
   * play walks right to left. (The shoe at x = -1.62 is in fact on the
   * dealer's right; that is set dressing, not an ordering authority.)
   */
  const seatZ = PLAYER_SEATS[0]!.z
  const dealerFacesPositiveZ = DISCARD_TRAY[2] < seatZ && SHOE_POSITION[2] < seatZ

  // The stool array is numbering, not play order: seat numbers go over the
  // wire, so this must stay ascending in x forever.
  it('numbers the stools ascending, the players left to right', () => {
    const xs = PLAYER_SEATS.map((seat) => seat.x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(xs[0]).toBeLessThan(0)
    expect(xs[xs.length - 1]!).toBeGreaterThan(0)
  })

  /*
   * Issue #5: the table used to play ascending seat number — the player's
   * *left*-hand stool first, which is third base. Real blackjack plays first
   * base first. This pins the room's comparator to the geometry above so the
   * direction cannot silently flip back; nothing on screen looks wrong while
   * a table plays backwards.
   */
  it('plays first base — the dealers left, the highest stool — first', () => {
    expect(dealerFacesPositiveZ).toBe(true)

    const stools = PLAYER_SEATS.map((seat, index) => ({ seat: index, x: seat.x }))
    const played = [...stools].sort(byPlayOrder)

    // Highest x first: the round starts at the player's right and walks left.
    expect(played.map((stool) => stool.x)).toEqual(
      stools.map((stool) => stool.x).sort((a, b) => b - a),
    )
    expect(played[0]!.seat).toBe(PLAYER_SEATS.length - 1)
  })

  // Craps players and clients that never claimed a stool have no place in the
  // deal order; they follow the seated in their arrival order.
  it('sorts the unseated last, keeping their arrival order', () => {
    const wagers = [
      { id: 'walker', seat: null },
      { id: 'first', seat: 0 },
      { id: 'drifter', seat: null },
      { id: 'third', seat: 4 },
    ]

    expect([...wagers].sort(byPlayOrder).map((wager) => wager.id)).toEqual([
      'third',
      'first',
      'walker',
      'drifter',
    ])
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
