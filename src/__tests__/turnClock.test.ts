import { describe, expect, it } from 'vitest'
import { secondsUntilStand, TURN_WINDOW_MS } from '../world/turnClock'

describe('the turn clock', () => {
  /*
   * Pins the mirrored constant to the worker's `TURN_TIMEOUT_MS`. The worker
   * is outside the test suite's reach (`vite.config.ts` collects only
   * `src/__tests__`), so this line is the only guard the pair has: whoever
   * changes the room's window and not this number ships a countdown that
   * finishes early or hangs at zero, and this failure is what says so.
   */
  it('mirrors the room’s fifteen-second window', () => {
    expect(TURN_WINDOW_MS).toBe(15_000)
  })

  // Catches the off-by-one where the acting player sees 14 — or 16 — the
  // moment the deal lands, instead of the full turn the room actually gives.
  it('starts the count at the whole window', () => {
    expect(secondsUntilStand(1_000, 1_000)).toBe(15)
  })

  /*
   * Ceiling, not floor: the display must read 1 all through the final second
   * and reach 0 exactly at the deadline. A floor shows 0 for a full second
   * while the room is still waiting, which reads as the stand having failed —
   * the issue's done-when is watching the number fall to zero *and* the hand
   * stand itself.
   */
  it('shows one, not zero, through the final second', () => {
    expect(secondsUntilStand(0, TURN_WINDOW_MS - 1)).toBe(1)
    expect(secondsUntilStand(0, TURN_WINDOW_MS - 999)).toBe(1)
    expect(secondsUntilStand(0, TURN_WINDOW_MS)).toBe(0)
  })

  /*
   * The room's alarm carries ~250ms of slop and the expiry still has a
   * network trip to make, so the clock honestly sits at zero for a beat
   * before every client stands the hand. Never negative.
   */
  it('clamps at zero past the deadline', () => {
    expect(secondsUntilStand(0, TURN_WINDOW_MS + 1)).toBe(0)
    expect(secondsUntilStand(0, TURN_WINDOW_MS + 5_000)).toBe(0)
  })
})
