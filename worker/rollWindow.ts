/**
 * How long after a roll the dice must stay in the shooter's hand.
 *
 * Two spans, added: the tumble every client is still watching, and then the
 * ten seconds the whole table gets to put bets down before the next throw
 * (issue #17). `throwFor` refuses a roll inside the sum, and the absent-shooter
 * timeout is armed with the sum as grace so an idle table cannot force-roll
 * into a window nobody could bet in.
 *
 * Mirrors of the client's numbers, term by term — `DICE_SETTLE_MS` in
 * `src/store/useCrapsStore.ts` and `ROLL_WINDOW_MS` in `src/world/rollClock.ts`
 * — duplicated rather than imported because the network boundary stays a
 * boundary, and pinned against each other by `rollClock.test.ts` the way
 * `turnClock.test.ts` pins `dealGraceMs`.
 */

/** The dice tumble this long on every screen before the roll has "resolved". */
export const ROLL_SETTLE_MS = 2100

/** The table's betting window, open from the moment the dice settle. */
export const ROLL_WINDOW_MS = 10_000

/** How long after a `rolled` broadcast the next throw is refused. */
export function rollWindowMs(): number {
  return ROLL_SETTLE_MS + ROLL_WINDOW_MS
}

/**
 * How long an absent shooter holds the dice before the room rolls for them.
 *
 * Armed with `rollWindowMs()` as grace, so the thirty seconds start where the
 * betting window ends. Here rather than in `worker/index.ts` so the client's
 * mirror in `src/world/rollClock.ts` can actually be pinned against it —
 * `dealClock.ts` mirrors this same number for the blackjack gather and can
 * only pin a literal.
 */
export const ROLL_TIMEOUT_MS = 30_000
