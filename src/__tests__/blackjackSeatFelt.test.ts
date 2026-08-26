import { describe, expect, it } from 'vitest'
import { MAX_HANDS } from '../games/blackjack/engine'
import {
  handAnchor,
  handAnchorX,
  isOnFelt,
  PLAYER_SEATS,
  SEAT_SPOTS,
  SEAT_SPLIT_OFFSET,
  CHIP_ROW_Z,
  PLAYER_ROW_Z,
} from '../scenes/tableLayout'

/** Room for a card or a chip stack to sit at a point without overhanging. */
const MARGIN = 0.25

describe('shared seat anchors', () => {
  /*
   * Five seats times three hands is fifteen hand-placed coordinates plus their
   * chips, on an ellipse whose usable width shrinks as it goes back. Nobody is
   * going to check thirty positions by eye, and a split hand hanging over the
   * rail has shipped here before — this is what `isOnFelt` is for.
   */
  it('keeps every hand and every chip stack on the felt, at every seat', () => {
    for (let seat = 0; seat < SEAT_SPOTS.length; seat++) {
      for (let handCount = 1; handCount <= MAX_HANDS; handCount++) {
        for (let hand = 0; hand < handCount; hand++) {
          const at = handAnchor(seat, SEAT_SPOTS.length, hand, handCount)

          expect(
            isOnFelt(at.x, at.z, MARGIN),
            `cards: seat ${seat}, hand ${hand} of ${handCount} at ${at.x}, ${at.z}`,
          ).toBe(true)
          expect(
            isOnFelt(at.x, at.chipZ, MARGIN),
            `chips: seat ${seat}, hand ${hand} of ${handCount} at ${at.x}, ${at.chipZ}`,
          ).toBe(true)
        }
      }
    }
  })

  // A predicate that returned true everywhere would pass everything above and
  // prove nothing, so it has to reject a point that really is off the table.
  it('rejects a point past the rail', () => {
    expect(isOnFelt(4.2, 1.2, MARGIN)).toBe(false)
    expect(isOnFelt(0, 2.6, MARGIN)).toBe(false)
  })

  // One seat is the solo table, and solo blackjack is on the demo path. If this
  // drifts, every existing capture of a bet, a deal, a split and a settlement
  // silently stops matching what ships.
  it('leaves a one-seat table exactly where it was', () => {
    for (let handCount = 1; handCount <= MAX_HANDS; handCount++) {
      for (let hand = 0; hand < handCount; hand++) {
        const at = handAnchor(0, 1, hand, handCount)

        expect(at.x).toBe(handAnchorX(hand, handCount))
        expect(at.z).toBe(PLAYER_ROW_Z)
        expect(at.chipZ).toBe(CHIP_ROW_Z)
      }
    }
  })

  // The stool and the betting spot in front of it have to belong to the same
  // player. Sorted the same way and on the same side of the centre line, or
  // somebody sits down behind another player's cards.
  it('agrees with the stools on which seat is which', () => {
    expect(SEAT_SPOTS).toHaveLength(PLAYER_SEATS.length)

    const spotXs = SEAT_SPOTS.map((spot) => spot.x)
    expect(spotXs).toEqual([...spotXs].sort((a, b) => a - b))

    for (let i = 0; i < SEAT_SPOTS.length; i++) {
      expect(Math.sign(SEAT_SPOTS[i]!.x)).toBe(Math.sign(PLAYER_SEATS[i]!.x))
    }
  })

  // Two neighbours must not reach into each other's space: a seat's widest
  // split has to stay clear of the next seat's widest split.
  it('keeps a split at one seat clear of the seat beside it', () => {
    for (let i = 0; i < SEAT_SPOTS.length - 1; i++) {
      const gap = SEAT_SPOTS[i + 1]!.x - SEAT_SPOTS[i]!.x
      expect(gap).toBeGreaterThan(SEAT_SPLIT_OFFSET * 2 + 0.3)
    }
  })
})
