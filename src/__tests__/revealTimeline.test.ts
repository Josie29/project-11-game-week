import { describe, expect, it } from 'vitest'
import {
  DRAW_INTERVAL_MS,
  FLIP_DURATION_MS,
  openingDealAt,
  openingDealEndsAt,
  openingHoleRestAt,
  openingUpcardFlipAt,
  revealTimeline,
} from '../scenes/revealTimeline'

describe('dealer flip choreography', () => {
  /*
   * The casino hole-card move: the dealer's first card is dealt face down and
   * the second card levers it face up before tucking in as the hole. Out of
   * order, the table shows nonsense — an upcard flipping itself with nothing
   * touching it, or a hole card sliding home before the flip it exists to
   * perform.
   */
  it('turns the upcard only after the second card has arrived to turn it', () => {
    for (let seatCount = 1; seatCount <= 5; seatCount++) {
      expect(openingUpcardFlipAt(seatCount)).toBeGreaterThan(
        openingDealAt(1, 0, seatCount, true),
      )
    }
  })

  it('holds the hole card at the wedge until the flip is finished', () => {
    for (let seatCount = 1; seatCount <= 5; seatCount++) {
      expect(openingHoleRestAt(seatCount)).toBeGreaterThanOrEqual(
        openingUpcardFlipAt(seatCount) + FLIP_DURATION_MS,
      )
    }
  })

  /*
   * A dealt natural settles the instant the deal lands, and the reveal is
   * scheduled from settlement — the store holds it behind this moment, so the
   * hole card cannot be commanded face up while still travelling.
   */
  it('declares the deal over only after every part of the move', () => {
    for (let seatCount = 1; seatCount <= 5; seatCount++) {
      expect(openingDealEndsAt(seatCount)).toBeGreaterThan(openingHoleRestAt(seatCount))
      expect(openingDealEndsAt(seatCount)).toBeGreaterThan(
        openingDealAt(1, seatCount - 1, seatCount, false),
      )
    }
  })
})

describe('openingDealAt', () => {
  /*
   * At a two-player table, both players' first cards landed in unison: the
   * delay was computed from the card index alone, so every seat's card 0
   * shared the same moment. A table deals one card at a time — first base
   * round to the dealer, then the second circuit the same way.
   */
  it('deals a shared table one card at a time, first base round to the dealer', () => {
    const order = [
      openingDealAt(0, 0, 2, false),
      openingDealAt(0, 1, 2, false),
      openingDealAt(0, 0, 2, true),
      openingDealAt(1, 0, 2, false),
      openingDealAt(1, 1, 2, false),
      openingDealAt(1, 0, 2, true),
    ]

    expect(order).toEqual([0, 1, 2, 3, 4, 5].map((slot) => slot * DRAW_INTERVAL_MS))
  })

  // The solo cadence the captures are tuned to: player, dealer, player,
  // dealer, one interval apart — the hole card leaves the shoe at 3s and the
  // wedge move runs on past it, which is what the settles in `shots.mjs` and
  // the walkthrough's deal wait are sized against.
  it('keeps the solo deal on the same clock as before', () => {
    expect(openingDealAt(0, 0, 1, false)).toBe(0)
    expect(openingDealAt(0, 0, 1, true)).toBe(DRAW_INTERVAL_MS)
    expect(openingDealAt(1, 0, 1, false)).toBe(2 * DRAW_INTERVAL_MS)
    expect(openingDealAt(1, 0, 1, true)).toBe(3 * DRAW_INTERVAL_MS)
  })

  // No two opening cards may ever share a moment, at any table size — one
  // shared slot and two cards fly from the shoe in unison again.
  it('gives every opening card its own moment, at every table size', () => {
    for (let seatCount = 1; seatCount <= 5; seatCount++) {
      const moments: number[] = []
      for (const cardIndex of [0, 1]) {
        for (let seat = 0; seat < seatCount; seat++) {
          moments.push(openingDealAt(cardIndex, seat, seatCount, false))
        }
        moments.push(openingDealAt(cardIndex, 0, seatCount, true))
      }

      expect(new Set(moments).size, `${seatCount} seats`).toBe(moments.length)
      // And in the order pushed above — seat-major, dealer last — time only
      // ever moves forward, one interval per card.
      moments.forEach((moment, index) => expect(moment).toBe(index * DRAW_INTERVAL_MS))
    }
  })
})

describe('revealTimeline', () => {
  // The whole point of the sequence. If a drawn card could land before the hole
  // card finished turning, two unrelated things would move at once and the
  // reveal would read as a glitch rather than as the dealer playing.
  it('finishes turning the hole card before any card is drawn', () => {
    for (const cardCount of [3, 4, 5, 6]) {
      const timeline = revealTimeline(cardCount)
      const firstDraw = timeline.drawAt[0]

      expect(firstDraw).toBeDefined()
      expect(firstDraw).toBeGreaterThanOrEqual(timeline.holeFlipAt + FLIP_DURATION_MS)
    }
  })

  // The result must never be announced before the card that caused it has
  // landed — a dealer busting on their last card should not be labelled a bust
  // while that card is still travelling.
  it('completes only after every card has landed', () => {
    for (const cardCount of [2, 3, 5, 7]) {
      const timeline = revealTimeline(cardCount)

      expect(timeline.completeAt).toBeGreaterThan(timeline.holeFlipAt)
      for (const drawTime of timeline.drawAt) {
        expect(timeline.completeAt).toBeGreaterThan(drawTime)
      }
    }
  })

  /*
   * Issue #3: the deal is paced at exactly one card per second, with no
   * acceleration. A decay crept in once before to shorten long hands; this
   * pins the flat interval so it cannot creep back.
   */
  it('spaces every draw exactly one interval apart, the first included', () => {
    for (const cardCount of [3, 4, 5, 7]) {
      const { holeFlipAt, drawAt } = revealTimeline(cardCount)

      expect(drawAt[0]!).toBe(holeFlipAt + DRAW_INTERVAL_MS)
      for (let index = 1; index < drawAt.length; index++) {
        expect(drawAt[index]! - drawAt[index - 1]!).toBe(DRAW_INTERVAL_MS)
      }
    }
  })

  it('draws cards in strictly increasing order', () => {
    const { drawAt } = revealTimeline(6)

    expect(drawAt).toHaveLength(4)
    for (let index = 1; index < drawAt.length; index++) {
      expect(drawAt[index]!).toBeGreaterThan(drawAt[index - 1]!)
    }
  })

  it('schedules one draw per card past the opening two', () => {
    expect(revealTimeline(2).drawAt).toHaveLength(0)
    expect(revealTimeline(3).drawAt).toHaveLength(1)
    expect(revealTimeline(5).drawAt).toHaveLength(3)
  })

  // A dealer standing pat is the common case and must not feel like a stall.
  it('resolves a two-card dealer hand in about a second', () => {
    expect(revealTimeline(2).completeAt).toBeLessThan(1400)
  })

  /*
   * The worst realistic case: a dealer drawing several small cards up to
   * seventeen. Six-plus seconds is the accepted price of the flat one-second
   * deal — but the `blackjack-dealer-draws` capture waits a
   * fixed 12000ms (deal choreography plus this reveal), so if this ever grows
   * past that budget the screenshot silently truncates a hand mid-reveal.
   */
  it('keeps even a long dealer hand inside the capture window', () => {
    expect(revealTimeline(7).completeAt).toBeLessThan(7000)
  })

  it('treats a degenerate card count as the opening two', () => {
    expect(revealTimeline(0).drawAt).toHaveLength(0)
    expect(revealTimeline(1).drawAt).toHaveLength(0)
    expect(revealTimeline(0).completeAt).toBe(revealTimeline(2).completeAt)
  })
})
