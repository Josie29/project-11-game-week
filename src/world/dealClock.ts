/*
 * How long the table will wait before dealing to whoever has staked.
 *
 * Pure on the same rule as `revealTimeline.ts`: the room decides when to deal,
 * this only says what to print while it decides. The room's clock never leaves
 * the worker — but the event that arms it does, because arming happens on
 * exactly one thing, a bet landing, and every bet is broadcast to every
 * client. "Last bet plus the window" is therefore the deadline, derivable
 * from messages a client already has, accurate to a network round trip.
 */

/**
 * The room's window before it deals to whoever has staked.
 *
 * A mirror of `ROLL_TIMEOUT_MS` in `worker/rollWindow.ts` — change one, change
 * both. The worker cannot be imported from here (or covered by the test
 * suite at all), so `dealClock.test.ts` pins this value as the pair's only
 * guard. `scripts/seatClaims.mjs` mirrors the same number for the same
 * reason.
 */
export const DEAL_WINDOW_MS = 30_000

/**
 * Whole seconds left on the deal clock, for display.
 *
 * Ceiling, not floor: the count starts at a full 30 the moment a stake
 * lands, reads 1 all through the final second, and reaches 0 exactly at the
 * deadline — so the player watches the number fall to zero and the hand
 * arrive, rather than staring at a lingering 0 for a second beforehand.
 * Clamped at zero because the worker's alarm carries ~250ms of slop plus a
 * network trip, and a countdown must never read negative while the deal is
 * in flight.
 *
 * @param lastBetAt When the most recent bet reached this client, in the same
 *   clock as `now`. Every bet restarts the window, because the room re-arms
 *   its own clock the same way.
 * @param now The current time on that clock.
 */
export function secondsUntilDeal(lastBetAt: number, now: number): number {
  const remaining = lastBetAt + DEAL_WINDOW_MS - now

  return Math.max(0, Math.ceil(remaining / 1000))
}
