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

/** Gap before the first card the dealer draws. */
export const DRAW_INTERVAL_MS = 620

/**
 * How much each successive gap shortens.
 *
 * A dealer grinding up to seventeen picks up speed, and at a fixed interval a
 * seven-card hand ran to 4.2 seconds — long enough that a presenter would have
 * to talk over it. Accelerating keeps the tail watchable and happens to be what
 * a real dealer does.
 */
const DRAW_INTERVAL_DECAY = 0.82

/** However fast it accelerates, cards never blur together. */
const MIN_DRAW_INTERVAL_MS = 320

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
  // mid-flip reads as two things happening for no reason.
  const firstDrawAt = holeFlipAt + FLIP_DURATION_MS

  const drawAt: number[] = []
  let at = firstDrawAt

  for (let index = 0; index < drawnCards; index++) {
    drawAt.push(at)
    const gap = Math.max(MIN_DRAW_INTERVAL_MS, DRAW_INTERVAL_MS * DRAW_INTERVAL_DECAY ** index)
    at += gap
  }

  const lastEvent = drawAt[drawAt.length - 1] ?? holeFlipAt
  // The result waits for the final card to settle, not merely to be dealt.
  const completeAt = lastEvent + FLIP_DURATION_MS

  return { holeFlipAt, drawAt, completeAt }
}
