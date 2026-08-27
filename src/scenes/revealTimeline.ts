/**
 * Pacing for the dealer's reveal at the end of a round.
 *
 * The engine resolves the dealer's whole hand in one step, which is correct but
 * means every card would otherwise appear at the same instant — the most
 * dramatic moment in blackjack reduced to a single frame. This schedules that
 * result back out over time: a beat, the hole card turning, then each drawn
 * card arriving in turn.
 *
 * Kept pure so the ordering can be tested. "The result is announced before the
 * card that caused it" is exactly the sort of bug a screenshot cannot catch.
 */

/** The dealer's beat before turning the hole card over. */
export const HOLE_PAUSE_MS = 420

/** How long the hole card takes to physically turn. */
export const FLIP_DURATION_MS = 650

/**
 * The gap between every card and the one before it, drawn or dealt.
 *
 * A flat second, deliberately without acceleration: a fixed interval puts a
 * seven-card dealer hand past six seconds, and that cost is accepted for a deal
 * slow enough to be dramatic. The opening deal takes its stagger from this same
 * number, so the round is paced by one constant.
 */
export const DRAW_INTERVAL_MS = 1000

/** Cards dealt face down at the start of a round: the dealer's hole card. */
const OPENING_CARDS = 2

export interface RevealTimeline {
  /** When the hole card begins to turn, in ms after settlement. */
  readonly holeFlipAt: number
  /** When each card past the opening two lands, in ms after settlement. */
  readonly drawAt: readonly number[]
  /** When the result may be announced and the next hand offered. */
  readonly completeAt: number
}

/**
 * Schedules the reveal for a dealer hand of `dealerCardCount` cards.
 *
 * @param dealerCardCount Cards in the dealer's final hand, including the two
 *   dealt at the start. Values below two are treated as two.
 */
export function revealTimeline(dealerCardCount: number): RevealTimeline {
  const drawnCards = Math.max(0, Math.floor(dealerCardCount) - OPENING_CARDS)

  const holeFlipAt = HOLE_PAUSE_MS
  // Nothing is drawn until the hole card has finished turning; a card landing
  // mid-flip reads as two things happening for no reason. The interval is
  // longer than the flip, so waiting a full beat covers it.
  const firstDrawAt = holeFlipAt + DRAW_INTERVAL_MS

  const drawAt: number[] = []
  let at = firstDrawAt

  for (let index = 0; index < drawnCards; index++) {
    drawAt.push(at)
    at += DRAW_INTERVAL_MS
  }

  const lastEvent = drawAt[drawAt.length - 1] ?? holeFlipAt
  // The result waits for the final card to settle, not merely to be dealt.
  const completeAt = lastEvent + FLIP_DURATION_MS

  return { holeFlipAt, drawAt, completeAt }
}
