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
 * seven-card dealer hand past six seconds, and that cost is accepted for a
 * deal slow enough to be dramatic. The opening deal takes its stagger from
 * this same number, so the round is paced by one constant.
 */
export const DRAW_INTERVAL_MS = 1000

/** Cards dealt face down at the start of a round: the dealer's hole card. */
const OPENING_CARDS = 2

/**
 * When one of the opening cards leaves the shoe, in ms after the deal.
 *
 * A real table deals one card to the whole table at a time: first base round
 * to third base, then the dealer, then the same circuit again for the second
 * card. Engine seat order *is* play order — the room broadcasts wagers first
 * base first — so seat 0 here is the rightmost stool from the player's camera
 * and the deal visibly walks right to left.
 *
 * This is what stops a shared table dealing every seat's first card in
 * unison, which is what "delay by card index alone" did the moment there was
 * more than one player to deal to.
 *
 * @param cardIndex Which of the hand's opening two cards, 0 or 1.
 * @param seatIndex The engine seat being dealt; ignored for the dealer.
 * @param seatCount How many seats are in the round, dealer excluded.
 * @param isDealer Whether this card is the dealer's, who is dealt last each
 *   circuit.
 */
export function openingDealAt(
  cardIndex: number,
  seatIndex: number,
  seatCount: number,
  isDealer: boolean,
): number {
  // One circuit is every seat plus the dealer; the dealer holds the last slot.
  const circuit = seatCount + 1
  const slot = cardIndex * circuit + (isDealer ? seatCount : seatIndex)
  return slot * DRAW_INTERVAL_MS
}

/*
 * The dealer's opening move, timed here and drawn by the table.
 *
 * A casino dealer's first card goes down face down. The second card is not
 * simply placed: the dealer uses it to lever the first card face up, then
 * tucks it — still face down — beside the new upcard as the hole. The engine
 * knows nothing of this; `dealerHand[0]` is the upcard and `dealerHand[1]` the
 * hole throughout, and only the choreography below decides when each is seen.
 */

/** The hole card's travel from the shoe to the upcard's edge, before it turns it. */
export const WEDGE_PAUSE_MS = 450

/** The hole card's slide from the wedge to its own spot, once the upcard is over. */
export const HOLE_TUCK_MS = 250

/** When the face-down upcard is levered face up, in ms after the deal. */
export function openingUpcardFlipAt(seatCount: number): number {
  // Only once the second card has arrived to do the levering.
  return openingDealAt(1, 0, seatCount, true) + WEDGE_PAUSE_MS
}

/** When the hole card leaves the wedge for its own spot: the flip is finished. */
export function openingHoleRestAt(seatCount: number): number {
  return openingUpcardFlipAt(seatCount) + FLIP_DURATION_MS
}

/**
 * When the felt is settled and a reveal may begin.
 *
 * The reveal is scheduled from settlement, and a dealt natural settles the
 * instant the deal lands — unoffset, the hole card was being commanded face up
 * before it had even reached the wedge. `startReveal` holds itself behind this.
 */
export function openingDealEndsAt(seatCount: number): number {
  return openingHoleRestAt(seatCount) + HOLE_TUCK_MS
}

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
