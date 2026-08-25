import { describe, expect, it } from 'vitest'
import {
  CrapsBet,
  isPlaceBet,
  PLACE_BETS,
  POINT_BOX_RECTS,
  POINT_NUMBERS,
  PointNumber,
  getCrapsBetRect,
  hitTestCrapsFelt,
  rectCenter,
} from '../scenes/crapsFeltLayout'

/** Every bet the felt draws, so a new region cannot skip these checks. */
const ALL_BETS = Object.values(CrapsBet)

describe('craps felt hit testing', () => {
  /**
   * Catches the bug where a band's own centre does not resolve to that band —
   * the player clicks the middle of PASS LINE and the chip lands on nothing,
   * or worse, on don't-pass.
   */
  it('resolves the centre of every band to that band', () => {
    for (const bet of ALL_BETS) {
      const { u, v } = rectCenter(getCrapsBetRect(bet))
      expect(hitTestCrapsFelt(u, v)).toBe(bet)
    }
  })

  /**
   * Catches the bug where bands are declared with overlapping v-ranges. An
   * overlap makes a click near a seam resolve to whichever band the pick order
   * happens to reach first, which looks like a random misplacement to the
   * player and is near-impossible to reproduce by hand.
   */
  it('gives every band an exclusive region', () => {
    for (const bet of ALL_BETS) {
      const rect = getCrapsBetRect(bet)
      for (const other of ALL_BETS) {
        if (other === bet) continue
        const otherRect = getCrapsBetRect(other)
        const overlapsU = rect.u0 < otherRect.u1 && otherRect.u0 < rect.u1
        const overlapsV = rect.v0 < otherRect.v1 && otherRect.v0 < rect.v1
        expect(overlapsU && overlapsV).toBe(false)
      }
    }
  })

  /**
   * Catches the bug where bare felt registers as a bet. Without this, walking
   * the cursor across the table places phantom wagers in the gaps between
   * bands and the bankroll drains with no visible chip.
   */
  it('returns null for bare felt and off-texture points', () => {
    // Gap between the field band and the don't-pass bar.
    expect(hitTestCrapsFelt(0.5, 0.475)).toBeNull()
    // Outside the horizontal margin, level with the pass line.
    expect(hitTestCrapsFelt(0.02, 0.77)).toBeNull()
    // The strip of felt between the place boxes and the field band.
    expect(hitTestCrapsFelt(0.5, 0.295)).toBeNull()
    // The apron of bare felt the print is held back from, at the near bumper.
    expect(hitTestCrapsFelt(0.5, 0.95)).toBeNull()
    // The gap between two place boxes. Worth its own case now the boxes take
    // money: a click that lands between the six and the eight must buy
    // nothing, not the nearer of the two.
    expect(hitTestCrapsFelt(0.5, 0.2)).toBeNull()
    expect(hitTestCrapsFelt(-0.3, 0.5)).toBeNull()
    expect(hitTestCrapsFelt(1.4, 0.5)).toBeNull()
  })

  /**
   * Catches the bug where a numbered box stops resolving to the place bet on
   * that number — a click on the 6 buying the 8, which spends real money on the
   * wrong wager and looks like the felt simply mispainted.
   */
  it('resolves each numbered box to the place bet on that number', () => {
    for (const point of POINT_NUMBERS) {
      const { u, v } = rectCenter(POINT_BOX_RECTS[point])
      expect(hitTestCrapsFelt(u, v)).toBe(PLACE_BETS[point])
    }
  })

  /**
   * Catches the bug where a raycast miss crashes the pointer handler. Three.js
   * leaves `uv` undefined when nothing is hit, and `undefined` arithmetic
   * yields NaN rather than throwing, so this would surface as a silent dead
   * table rather than an error.
   */
  it('returns null for non-finite coordinates', () => {
    expect(hitTestCrapsFelt(Number.NaN, 0.5)).toBeNull()
    expect(hitTestCrapsFelt(0.5, Number.NaN)).toBeNull()
    expect(hitTestCrapsFelt(Number.POSITIVE_INFINITY, 0.5)).toBeNull()
  })

  /**
   * Catches the bug where the pass line stops being the region nearest the
   * player. The demo script's craps beat is a pass-line bet, and reordering
   * the bands so it is no longer reachable at the table's near edge would
   * break the one interaction that has to work.
   */
  it('keeps the pass line nearest the player edge', () => {
    const passLine = getCrapsBetRect(CrapsBet.PassLine)
    for (const bet of ALL_BETS) {
      if (bet === CrapsBet.PassLine) continue
      expect(getCrapsBetRect(bet).v1).toBeLessThanOrEqual(passLine.v0)
    }
  })
})

describe('craps point boxes', () => {
  /**
   * Catches the bug where the ON puck is placed off the felt or on top of a
   * bet region — the player cannot tell what the point is, which makes the
   * come-out to point-resolution sequence unreadable.
   */
  it('places every point box inside the felt and clear of the line bands', () => {
    // Measured against the line bets only. The boxes are themselves bets now,
    // so including them would compare the row with itself and pass whatever it
    // was given.
    const topmostLineBet = Math.min(
      ...ALL_BETS.filter((bet) => !isPlaceBet(bet)).map((bet) => getCrapsBetRect(bet).v0),
    )

    for (const point of POINT_NUMBERS) {
      const rect = POINT_BOX_RECTS[point]
      expect(rect.u0).toBeGreaterThanOrEqual(0)
      expect(rect.u1).toBeLessThanOrEqual(1)
      expect(rect.v1).toBeLessThan(topmostLineBet)
    }
  })

  /**
   * Catches the bug where the boxes are laid out with overlapping or
   * out-of-order slots, which would print the numbers on top of each other.
   */
  it('lays the boxes out left to right without overlapping', () => {
    const rects = POINT_NUMBERS.map((point) => POINT_BOX_RECTS[point])
    for (let index = 1; index < rects.length; index++) {
      expect(rects[index]!.u0).toBeGreaterThan(rects[index - 1]!.u1)
    }
  })

  /** The six box numbers are the six that can be the point — 7 is never one. */
  it('covers exactly the six point numbers', () => {
    expect([...POINT_NUMBERS]).toEqual([
      PointNumber.Four,
      PointNumber.Five,
      PointNumber.Six,
      PointNumber.Eight,
      PointNumber.Nine,
      PointNumber.Ten,
    ])
  })
})
