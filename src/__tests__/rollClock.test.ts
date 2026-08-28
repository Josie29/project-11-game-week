import { describe, expect, it } from 'vitest'
import { ROLL_SETTLE_MS, ROLL_WINDOW_MS as WORKER_ROLL_WINDOW_MS, rollWindowMs } from '../../worker/rollWindow'
import { DICE_SETTLE_MS as STORE_SETTLE_MS } from '../store/useCrapsStore'
import { DICE_SETTLE_MS, ROLL_WINDOW_MS, secondsUntilRoll } from '../world/rollClock'

describe('the roll clock', () => {
  /*
   * Pins the client's window to the worker's. `worker/rollWindow.ts` is an
   * importable sibling — the `dealGrace` arrangement — so unlike the deal and
   * turn clocks this pair can actually be held together, and is: whoever
   * changes the room's window and not this number ships a countdown that
   * finishes early or hangs at zero, and this failure is what says so.
   */
  it('mirrors the room’s ten-second window', () => {
    expect(ROLL_WINDOW_MS).toBe(10_000)
    expect(WORKER_ROLL_WINDOW_MS).toBe(ROLL_WINDOW_MS)
  })

  /*
   * Nobody's ten seconds start while the dice are still in the air. The
   * room's refusal and the client's countdown both carry the tumble in front
   * of the window, each from its own mirror of the store's settle clock —
   * three copies, and this equality is the only thing holding them together.
   * A drift here is a shooter refused after their countdown hit zero, or a
   * window that quietly opened mid-tumble.
   */
  it('grants the room the same tumble the dice actually take', () => {
    expect(DICE_SETTLE_MS).toBe(STORE_SETTLE_MS)
    expect(ROLL_SETTLE_MS).toBe(STORE_SETTLE_MS)
    expect(rollWindowMs()).toBe(DICE_SETTLE_MS + ROLL_WINDOW_MS)
  })

  // Catches the off-by-one where the table sees 9 — or 11 — the moment the
  // dice settle, instead of the full window the room actually holds.
  it('starts the count at the whole window once the dice settle', () => {
    expect(secondsUntilRoll(1_000, 1_000 + DICE_SETTLE_MS)).toBe(10)
  })

  /*
   * The face is stamped at the roll broadcast, so mid-tumble the arithmetic
   * reads above the whole window — which is what the panel keys on to show
   * no number at all until the dice have landed.
   */
  it('reads above the window while the dice are still tumbling', () => {
    expect(secondsUntilRoll(0, 0)).toBeGreaterThan(ROLL_WINDOW_MS / 1000)
    expect(secondsUntilRoll(0, DICE_SETTLE_MS)).toBe(ROLL_WINDOW_MS / 1000)
  })

  /*
   * Ceiling, not floor: the display must read 1 all through the final second
   * and reach 0 exactly at the deadline. A floor shows 0 for a full second
   * while the room is still refusing, which reads as the dice having stuck —
   * the issue's done-when is watching the number fall to zero *and* the dice
   * then leaving the shooter's hand.
   */
  it('shows one, not zero, through the final second', () => {
    const deadline = DICE_SETTLE_MS + ROLL_WINDOW_MS
    expect(secondsUntilRoll(0, deadline - 1)).toBe(1)
    expect(secondsUntilRoll(0, deadline - 999)).toBe(1)
    expect(secondsUntilRoll(0, deadline)).toBe(0)
  })

  /*
   * The room's refusal carries ~250ms of slop plus a network trip, so the
   * clock honestly sits at zero for a beat before the button truly works.
   * Never negative.
   */
  it('clamps at zero past the deadline', () => {
    expect(secondsUntilRoll(0, DICE_SETTLE_MS + ROLL_WINDOW_MS + 1)).toBe(0)
    expect(secondsUntilRoll(0, DICE_SETTLE_MS + ROLL_WINDOW_MS + 5_000)).toBe(0)
  })
})
