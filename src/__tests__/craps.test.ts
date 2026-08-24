import { describe, expect, it } from 'vitest'
import {
  canPlaceCrapsBet,
  createCrapsGame,
  MAX_ODDS_MULTIPLE,
  oddsPayout,
  oddsRatio,
  placeCrapsBet,
  rollCraps,
  totalCrapsPayout,
  totalCrapsStake,
} from '../games/craps/engine'
import { type CrapsState, CrapsPhase, RollOutcome } from '../games/craps/types'
import { CrapsBet, POINT_NUMBERS } from '../scenes/crapsFeltLayout'

/**
 * Rolls until the dice show `total`, so a test can exercise one outcome without
 * hunting for a seed that produces it.
 *
 * @throws {Error} If the total does not come up, which would mean the generator
 *   is not producing the full range.
 */
function rollUntil(state: CrapsState, total: number, maxAttempts = 4000): CrapsState {
  let current = state
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const next = rollCraps(current)
    if (next.lastRoll?.total === total) return next
    // Keep the bets intact while searching; only the generator advances.
    current = { ...current, rngState: next.rngState }
  }
  throw new Error(`Never rolled ${total} in ${maxAttempts} attempts`)
}

describe('dice', () => {
  // Everything downstream assumes two fair six-sided dice. A generator that
  // could yield 0 or 13 would silently corrupt every rule below.
  it('only ever produces two six-sided dice', () => {
    let state = createCrapsGame(7)

    for (let i = 0; i < 500; i++) {
      state = rollCraps(state)
      const roll = state.lastRoll!

      expect(roll.first).toBeGreaterThanOrEqual(1)
      expect(roll.first).toBeLessThanOrEqual(6)
      expect(roll.second).toBeGreaterThanOrEqual(1)
      expect(roll.second).toBeLessThanOrEqual(6)
      expect(roll.total).toBe(roll.first + roll.second)
    }
  })

  // Determinism is what makes a demo replayable and these tests reproducible.
  it('replays identically from the same seed', () => {
    const rollFive = (seed: number) => {
      let state = createCrapsGame(seed)
      const totals: number[] = []
      for (let i = 0; i < 5; i++) {
        state = rollCraps(state)
        totals.push(state.lastRoll!.total)
      }
      return totals
    }

    expect(rollFive(99)).toEqual(rollFive(99))
    expect(rollFive(99)).not.toEqual(rollFive(100))
  })

  it('eventually produces every total from 2 to 12', () => {
    let state = createCrapsGame(3)
    const seen = new Set<number>()

    for (let i = 0; i < 2000; i++) {
      state = rollCraps(state)
      seen.add(state.lastRoll!.total)
    }

    for (let total = 2; total <= 12; total++) {
      expect(seen.has(total)).toBe(true)
    }
  })
})

describe('come-out roll', () => {
  // The two ways a come-out ends the bet immediately.
  it('pays the pass line on a natural and takes the don’t pass', () => {
    let state = placeCrapsBet(createCrapsGame(1), CrapsBet.PassLine, 10)
    state = placeCrapsBet(state, CrapsBet.DontPass, 10)
    state = rollUntil(state, 7)

    expect(state.lastOutcome).toBe(RollOutcome.Natural)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(20)
    expect(state.lastPayouts[CrapsBet.DontPass]).toBe(0)
    // Both are decided, so neither stays on the felt.
    expect(totalCrapsStake(state)).toBe(0)
  })

  it('takes the pass line on craps and pays the don’t pass', () => {
    let state = placeCrapsBet(createCrapsGame(1), CrapsBet.PassLine, 10)
    state = placeCrapsBet(state, CrapsBet.DontPass, 10)
    state = rollUntil(state, 3)

    expect(state.lastOutcome).toBe(RollOutcome.Craps)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(0)
    expect(state.lastPayouts[CrapsBet.DontPass]).toBe(20)
  })

  /*
   * Twelve is barred. Without it, betting against the shooter would carry a
   * player edge — this single rule is what makes don't pass a house bet, and
   * paying it out would quietly hand the player the best wager on the table.
   */
  it('pushes the don’t pass on a barred twelve', () => {
    let state = placeCrapsBet(createCrapsGame(1), CrapsBet.PassLine, 10)
    state = placeCrapsBet(state, CrapsBet.DontPass, 10)
    state = rollUntil(state, 12)

    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(0)
    // Stake back, nothing won.
    expect(state.lastPayouts[CrapsBet.DontPass]).toBe(10)
  })

  it('establishes a point on any box number', () => {
    for (const point of POINT_NUMBERS) {
      const state = rollUntil(createCrapsGame(5), point)

      expect(state.lastOutcome).toBe(RollOutcome.PointEstablished)
      expect(state.phase).toBe(CrapsPhase.Point)
      expect(state.point).toBe(point)
    }
  })

  // A line bet must ride until it is decided, not be quietly cleared when the
  // point is set — the player's money stays at risk, which is the whole game.
  it('leaves the pass line staked when a point is established', () => {
    const state = rollUntil(placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10), 6)

    expect(state.bets[CrapsBet.PassLine]).toBe(10)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(0)
  })
})

describe('point phase', () => {
  /** Sets a point of six with a pass line and odds behind it. */
  function withPointOfSix(): CrapsState {
    let state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)
    state = rollUntil(state, 6)
    return placeCrapsBet(state, CrapsBet.Odds, 10)
  }

  it('pays the line and the odds when the point is made', () => {
    const state = rollUntil(withPointOfSix(), 6)

    expect(state.lastOutcome).toBe(RollOutcome.PointMade)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(20)
    // Six pays 6:5, so ten returns the stake plus twelve.
    expect(state.lastPayouts[CrapsBet.Odds]).toBe(22)
    expect(state.phase).toBe(CrapsPhase.ComeOut)
    expect(state.point).toBeNull()
  })

  it('takes everything on a seven out and passes the dice', () => {
    const state = rollUntil(withPointOfSix(), 7)

    expect(state.lastOutcome).toBe(RollOutcome.SevenOut)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(0)
    expect(state.lastPayouts[CrapsBet.Odds]).toBe(0)
    expect(state.phase).toBe(CrapsPhase.ComeOut)
    expect(state.rollCount).toBe(0)
  })

  // The long middle of a craps hand: rolls that decide nothing and leave the
  // money where it is.
  it('leaves the line untouched on a no-decision roll', () => {
    const state = rollUntil(withPointOfSix(), 5)

    expect(state.lastOutcome).toBe(RollOutcome.NoDecision)
    expect(state.bets[CrapsBet.PassLine]).toBe(10)
    expect(state.bets[CrapsBet.Odds]).toBe(10)
    expect(totalCrapsPayout(state)).toBe(0)
  })
})

describe('free odds', () => {
  it('cannot be laid before there is a point to lay it against', () => {
    const state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)

    expect(canPlaceCrapsBet(state, CrapsBet.Odds, 10)).toBe(false)
    expect(() => placeCrapsBet(state, CrapsBet.Odds, 10)).toThrow(/Cannot place/)
  })

  it('cannot be laid without a pass line behind it', () => {
    const state = rollUntil(createCrapsGame(5), 8)

    expect(state.phase).toBe(CrapsPhase.Point)
    expect(canPlaceCrapsBet(state, CrapsBet.Odds, 10)).toBe(false)
  })

  it('is capped at a multiple of the line bet', () => {
    let state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)
    state = rollUntil(state, 4)

    expect(canPlaceCrapsBet(state, CrapsBet.Odds, 10 * MAX_ODDS_MULTIPLE)).toBe(true)
    expect(canPlaceCrapsBet(state, CrapsBet.Odds, 10 * MAX_ODDS_MULTIPLE + 10)).toBe(false)
  })

  /*
   * Free odds are the only bet on the table with no house edge, so the payout
   * has to be exactly true odds. Rounding any of these would quietly turn the
   * one fair bet in the casino into another house bet.
   */
  it('pays true odds for every point', () => {
    expect(oddsRatio(4)).toEqual({ numerator: 2, denominator: 1 })
    expect(oddsRatio(10)).toEqual({ numerator: 2, denominator: 1 })
    expect(oddsRatio(5)).toEqual({ numerator: 3, denominator: 2 })
    expect(oddsRatio(9)).toEqual({ numerator: 3, denominator: 2 })
    expect(oddsRatio(6)).toEqual({ numerator: 6, denominator: 5 })
    expect(oddsRatio(8)).toEqual({ numerator: 6, denominator: 5 })
  })

  /*
   * The same trap that produced "$537.5" in blackjack: 3:2 and 6:5 both give
   * fractions on the wrong stake. These are the stakes the table offers, so
   * every one of them has to pay whole dollars on every point.
   */
  it('pays whole dollars on every offered stake', () => {
    for (const stake of [10, 50, 100]) {
      for (const point of POINT_NUMBERS) {
        const payout = oddsPayout(stake, point)
        expect(Number.isInteger(payout)).toBe(true)
        // And exactly true odds, not merely a whole number near it.
        const { numerator, denominator } = oddsRatio(point)
        expect(payout).toBe(stake + (stake * numerator) / denominator)
      }
    }
  })
})

describe('field', () => {
  it('pays even money on the inside winners', () => {
    for (const total of [3, 4, 9, 10, 11]) {
      const state = rollUntil(placeCrapsBet(createCrapsGame(2), CrapsBet.Field, 10), total)
      expect(state.lastPayouts[CrapsBet.Field]).toBe(20)
    }
  })

  it('pays extra on two and twelve', () => {
    expect(
      rollUntil(placeCrapsBet(createCrapsGame(2), CrapsBet.Field, 10), 2).lastPayouts[
        CrapsBet.Field
      ],
    ).toBe(30)
    expect(
      rollUntil(placeCrapsBet(createCrapsGame(2), CrapsBet.Field, 10), 12).lastPayouts[
        CrapsBet.Field
      ],
    ).toBe(40)
  })

  it('loses on the numbers it does not cover', () => {
    for (const total of [5, 6, 7, 8]) {
      const state = rollUntil(placeCrapsBet(createCrapsGame(2), CrapsBet.Field, 10), total)
      expect(state.lastPayouts[CrapsBet.Field]).toBe(0)
    }
  })

  // A one-roll bet must never ride. If it stayed on the felt the player would
  // be re-betting it every throw without ever choosing to.
  it('never rides to the next roll', () => {
    for (const total of [4, 7]) {
      const state = rollUntil(placeCrapsBet(createCrapsGame(2), CrapsBet.Field, 10), total)
      expect(state.bets[CrapsBet.Field]).toBe(0)
    }
  })
})

describe('line bets', () => {
  it('cannot be added to once a point is set', () => {
    const state = rollUntil(placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10), 9)

    expect(canPlaceCrapsBet(state, CrapsBet.PassLine, 10)).toBe(false)
    expect(canPlaceCrapsBet(state, CrapsBet.DontPass, 10)).toBe(false)
  })

  it('rejects a non-positive stake', () => {
    const state = createCrapsGame(5)
    expect(canPlaceCrapsBet(state, CrapsBet.PassLine, 0)).toBe(false)
    expect(canPlaceCrapsBet(state, CrapsBet.PassLine, -10)).toBe(false)
  })
})
