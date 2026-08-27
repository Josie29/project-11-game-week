/*
 * How long a blackjack seat has to act before the room stands them.
 *
 * Pure on the same rule as `dealClock.ts`: the room decides when a turn
 * expires, this only says what to print while it decides. The room's clock
 * never leaves the worker — but every event that arms it does: it is armed at
 * the deal, re-armed on every relayed action, and re-armed again on the
 * expiry it broadcasts. Each of those reaches every client, so "last of
 * those plus the window" is the deadline, derivable from messages a client
 * already has, accurate to a network round trip.
 */

/**
 * The room's window before it declares a turn over.
 *
 * A mirror of `TURN_TIMEOUT_MS` in `worker/index.ts` — change one, change
 * both. The worker cannot be imported from here (or covered by the test
 * suite at all), so `turnClock.test.ts` pins this value as the pair's only
 * guard.
 */
export const TURN_WINDOW_MS = 15_000

/**
 * Whole seconds left on a turn, for display.
 *
 * Ceiling, not floor, exactly as `secondsUntilDeal`: a fresh turn reads a
 * full 15, the last second reads 1, and 0 appears only at the deadline
 * itself — clamped there, because the worker's alarm carries ~250ms of slop
 * plus a network trip, and a countdown must never read negative while the
 * stand is in flight.
 *
 * @param armedAt When the arming event — deal, action, or expiry — reached
 *   this client, in the same clock as `now`.
 * @param now The current time on that clock.
 */
export function secondsUntilStand(armedAt: number, now: number): number {
  const remaining = armedAt + TURN_WINDOW_MS - now

  return Math.max(0, Math.ceil(remaining / 1000))
}
