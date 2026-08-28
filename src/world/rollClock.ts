/*
 * How long the craps table gets to bet between rolls.
 *
 * Pure on the same rule as `dealClock.ts` and `turnClock.ts`: the room decides
 * when the dice may fly again, this only says what to print while it decides.
 * The room's clock never leaves the worker — but the event that arms it does:
 * the `rolled` broadcast reaches every client, so "that roll plus the tumble
 * plus the window" is the deadline, derivable from a message a client already
 * has, accurate to a network round trip (issue #17).
 */

/**
 * The table's betting window, open from the moment the dice settle.
 *
 * A mirror of `ROLL_WINDOW_MS` in `worker/rollWindow.ts` — change one, change
 * both. `rollClock.test.ts` pins the pair, and can, because that worker module
 * is an importable sibling kept outside `worker/index.ts` for exactly this.
 */
export const ROLL_WINDOW_MS = 10_000

/**
 * The tumble between the `rolled` broadcast and the dice actually settling.
 *
 * A mirror of `DICE_SETTLE_MS` in `src/store/useCrapsStore.ts` and
 * `ROLL_SETTLE_MS` in `worker/rollWindow.ts`, pinned by the same test. The
 * window "after a roll resolves" starts when the dice land, not when the
 * numbers were decided, so the countdown carries the tumble in front of it.
 */
export const DICE_SETTLE_MS = 2100

/**
 * Whole seconds left before the shooter may throw, for display.
 *
 * Ceiling, not floor, exactly as `secondsUntilDeal`: the moment the dice
 * settle this reads a full 10, the last second reads 1, and 0 appears only at
 * the deadline — clamped there, because the worker's refusal carries ~250ms of
 * slop plus a network trip, and a countdown must never read negative while a
 * roll is in flight.
 *
 * While the dice are still tumbling this reads *above* `ROLL_WINDOW_MS /
 * 1000`; the panel hides those values, the same trick the turn countdown uses
 * to stay quiet through the opening deal.
 *
 * @param rolledAt When the `rolled` broadcast reached this client, in the same
 *   clock as `now`.
 * @param now The current time on that clock.
 */
export function secondsUntilRoll(rolledAt: number, now: number): number {
  const remaining = rolledAt + DICE_SETTLE_MS + ROLL_WINDOW_MS - now

  return Math.max(0, Math.ceil(remaining / 1000))
}

/**
 * How long an absent shooter holds the dice before the room rolls for them.
 *
 * A mirror of `ROLL_TIMEOUT_MS` in `worker/rollWindow.ts`, pinned by
 * `rollClock.test.ts` — an actually held pair, unlike `dealClock.ts`'s literal
 * copy of the same number, because the worker keeps it in the importable
 * sibling now.
 */
export const AUTO_ROLL_MS = 30_000

/**
 * Whole seconds until the room rolls for the shooter, for display.
 *
 * The room arms this clock with the betting window as grace and re-arms it on
 * every shooter announcement — and both of those events reach every client, so
 * "the latest of them plus the lot" is the deadline, the same wire-less rule
 * as every clock here.
 *
 * Reads above `AUTO_ROLL_MS / 1000` while the tumble and the betting window
 * are still running; the panel hides those values, so the auto-roll count
 * appears only once the dice are genuinely free and going unthrown.
 *
 * @param armedAt When the latest arming event — a roll or a shooter
 *   announcement — reached this client, in the same clock as `now`.
 * @param now The current time on that clock.
 */
export function secondsUntilForcedRoll(armedAt: number, now: number): number {
  const remaining = armedAt + DICE_SETTLE_MS + ROLL_WINDOW_MS + AUTO_ROLL_MS - now

  return Math.max(0, Math.ceil(remaining / 1000))
}
