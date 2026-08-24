import { describe, expect, it } from 'vitest'
import { FLIP_DURATION_MS, revealTimeline } from '../scenes/revealTimeline'

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
   * seventeen. This is a five-minute demo, so even the long tail has to stay
   * watchable rather than becoming a pause the presenter has to talk over.
   */
  it('keeps even a long dealer hand under four seconds', () => {
    expect(revealTimeline(7).completeAt).toBeLessThan(4000)
  })

  it('treats a degenerate card count as the opening two', () => {
    expect(revealTimeline(0).drawAt).toHaveLength(0)
    expect(revealTimeline(1).drawAt).toHaveLength(0)
    expect(revealTimeline(0).completeAt).toBe(revealTimeline(2).completeAt)
  })
})
