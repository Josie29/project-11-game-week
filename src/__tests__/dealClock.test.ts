import { describe, expect, it } from 'vitest'
import { DEAL_WINDOW_MS, secondsUntilDeal } from '../world/dealClock'

describe('the deal clock', () => {
  /*
   * Pins the mirrored constant to the worker's `ROLL_TIMEOUT_MS`. The worker
   * is outside the test suite's reach (`vite.config.ts` collects only
   * `src/__tests__`), so this line is the only guard the pair has: whoever
   * changes the room's window and not this number ships a countdown that
   * finishes early or hangs at zero, and this failure is what says so.
   */
  it('mirrors the room’s thirty-second window', () => {
    expect(DEAL_WINDOW_MS).toBe(30_000)
  })

  // Catches the off-by-one where a player sees 29 — or 31 — the moment their
  // stake lands, instead of the full window the room actually gives them.
  it('starts the count at the whole window', () => {
    expect(secondsUntilDeal(1_000, 1_000)).toBe(30)
  })

  /*
   * Ceiling, not floor: the display must read 1 all through the final second
   * and reach 0 exactly at the deadline. A floor shows 0 for a full second
   * while the room is still waiting, which reads as the deal having failed —
   * the issue's done-when is watching the number fall to zero *and* the hand
   * arrive.
   */
  it('shows one, not zero, through the final second', () => {
    expect(secondsUntilDeal(0, DEAL_WINDOW_MS - 1)).toBe(1)
    expect(secondsUntilDeal(0, DEAL_WINDOW_MS - 999)).toBe(1)
    expect(secondsUntilDeal(0, DEAL_WINDOW_MS)).toBe(0)
  })

  // The count must only ever fall as time passes — a tick that reads higher
  // than the one before it means the arithmetic, not the room, moved the deal.
  it('falls monotonically', () => {
    let previous = Number.POSITIVE_INFINITY
    for (let elapsed = 0; elapsed <= DEAL_WINDOW_MS; elapsed += 217) {
      const seconds = secondsUntilDeal(0, elapsed)
      expect(seconds).toBeLessThanOrEqual(previous)
      previous = seconds
    }
  })

  /*
   * The room's alarm carries ~250ms of slop and the deal still has a network
   * trip to make, so the clock is honestly at zero for a beat before the cards
   * land. It must sit at 0 through that beat, never go negative.
   */
  it('clamps at zero past the deadline', () => {
    expect(secondsUntilDeal(0, DEAL_WINDOW_MS + 1)).toBe(0)
    expect(secondsUntilDeal(0, DEAL_WINDOW_MS + 5_000)).toBe(0)
  })
})
