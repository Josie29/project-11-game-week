import { describe, expect, it } from 'vitest'
import {
  canPlaceCrapsBet,
  canTakeDownCrapsBet,
  chipStake,
  createCrapsGame,
  MAX_ODDS_MULTIPLE,
  oddsPayout,
  oddsRatio,
  placeCrapsBet,
  placePayout,
  placeRatio,
  placeWinnings,
  stakeReturnedByRoll,
  takeDownCrapsBet,
  PLACE_UNITS,
  rollCraps,
  totalCrapsPayout,
  totalCrapsStake,
} from '../games/craps/engine'
import { type CrapsState, CrapsPhase, RollOutcome } from '../games/craps/types'
import { CrapsBet, PLACE_BETS, POINT_NUMBERS } from '../scenes/crapsFeltLayout'
import { CHIP_DENOMINATIONS } from '../scenes/chipLayout'

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
  /*
   * A push leaves the bet standing. Twelve is a craps number, so the come-out
   * has not been resolved and the shooter comes out again — handing the stake
   * back would make the player re-make a wager that never lost, and the line
   * bet cannot be re-made once it has been taken down.
   */
  it('pushes the don’t pass on a barred twelve, leaving it up', () => {
    let state = placeCrapsBet(createCrapsGame(1), CrapsBet.PassLine, 10)
    state = placeCrapsBet(state, CrapsBet.DontPass, 10)
    state = rollUntil(state, 12)

    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(0)
    // Neither won nor lost, and still on the felt for the next come-out.
    expect(state.lastPayouts[CrapsBet.DontPass]).toBe(0)
    expect(state.bets[CrapsBet.DontPass]).toBe(10)
    expect(state.phase).toBe(CrapsPhase.ComeOut)
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

describe('place bets', () => {
  /*
   * The house numbers, not true odds. A place bet is the free-odds bet with the
   * edge put back in, and getting these backwards would hand the player a
   * better-than-fair bet on the six and eight — the two numbers they will bet
   * most.
   */
  it('pays the house ratio for every number', () => {
    expect(placeRatio(4)).toEqual({ numerator: 9, denominator: 5 })
    expect(placeRatio(10)).toEqual({ numerator: 9, denominator: 5 })
    expect(placeRatio(5)).toEqual({ numerator: 7, denominator: 5 })
    expect(placeRatio(9)).toEqual({ numerator: 7, denominator: 5 })
    expect(placeRatio(6)).toEqual({ numerator: 7, denominator: 6 })
    expect(placeRatio(8)).toEqual({ numerator: 7, denominator: 6 })
  })

  /*
   * The same trap that produced "$537.5" in blackjack and "22.000000000000004"
   * in free odds, and worse here: 7:6 gives a fraction on every stake that is
   * not a multiple of six, and $10 is not. These are the stakes the panel
   * offers, so every one has to pay exactly.
   */
  it('pays whole dollars on every stake a chip can buy', () => {
    const state = rollUntil(createCrapsGame(5), 4)

    for (const point of POINT_NUMBERS) {
      for (const denomination of CHIP_DENOMINATIONS) {
        const stake = chipStake(state, PLACE_BETS[point], denomination.value)
        if (stake === 0) continue

        const winnings = placeWinnings(stake, point)
        expect(Number.isInteger(winnings)).toBe(true)

        // And exactly the ratio, not merely a whole number near it.
        const { numerator, denominator } = placeRatio(point)
        expect(winnings).toBe((stake * numerator) / denominator)
        expect(placePayout(stake, point)).toBe(stake + winnings)
      }
    }
  })

  /*
   * The guard that keeps the above true. Without it the panel is the only thing
   * standing between the player and a stake that pays a fraction, and a panel
   * is exactly the layer that gets restyled by someone who does not know why
   * the six is taken in sixes.
   */
  it('refuses a stake that is not a multiple of the number\'s unit', () => {
    const state = rollUntil(createCrapsGame(5), 4)

    expect(canPlaceCrapsBet(state, CrapsBet.Place6, 10)).toBe(false)
    expect(canPlaceCrapsBet(state, CrapsBet.Place6, 12)).toBe(true)
    expect(canPlaceCrapsBet(state, CrapsBet.Place5, 6)).toBe(false)
    expect(canPlaceCrapsBet(state, CrapsBet.Place5, 25)).toBe(true)

    expect(PLACE_UNITS[6]).toBe(6)
    expect(PLACE_UNITS[5]).toBe(5)
  })

  /*
   * Paid and left standing, which is the whole character of the bet: you place
   * the six and it keeps earning until a seven takes it. Taken down on every
   * hit, the player would be re-making it between throws — and the winnings
   * would be wrong too, because the stake never came home to be re-credited.
   */
  it('pays its winnings and stays up when its number is rolled', () => {
    let before = rollUntil(createCrapsGame(5), 4)
    expect(before.phase).toBe(CrapsPhase.Point)
    expect(before.point).toBe(4)

    before = placeCrapsBet(before, CrapsBet.Place6, 6)
    const state = rollUntil(before, 6)

    // 7 to 6 on a six-dollar bet: seven dollars, and the six stays on the felt.
    expect(state.lastPayouts[CrapsBet.Place6]).toBe(7)
    expect(state.bets[CrapsBet.Place6]).toBe(6)
    // A six that is not the point leaves the point alone.
    expect(state.point).toBe(4)

    /*
     * And the marker takes its cut of all of it. The stake never left the
     * felt, so none of that seven dollars is the player's own money coming
     * home — reading the payout as though it contained the stake would let the
     * winnings past the marker on the one bet meant to be left working.
     */
    expect(stakeReturnedByRoll(before, state)).toBe(0)
  })

  /*
   * A place bet on the point number is settled by the same roll that makes the
   * point. Missing this would silently swallow the place bet on the one number
   * the shooter is most likely to be chasing.
   */
  it('pays when the number rolled is also the point', () => {
    let state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)
    state = rollUntil(state, 6)
    expect(state.point).toBe(6)

    state = placeCrapsBet(state, CrapsBet.Place6, 6)
    state = rollUntil(state, 6)

    expect(state.lastOutcome).toBe(RollOutcome.PointMade)
    expect(state.lastPayouts[CrapsBet.Place6]).toBe(7)
    expect(state.lastPayouts[CrapsBet.PassLine]).toBe(20)
  })

  it('is taken by the seven, on every number at once', () => {
    let state = rollUntil(createCrapsGame(5), 4)

    for (const point of POINT_NUMBERS) {
      state = placeCrapsBet(state, PLACE_BETS[point], PLACE_UNITS[point])
    }
    expect(totalCrapsStake(state)).toBe(32)

    state = rollUntil(state, 7)

    expect(state.lastOutcome).toBe(RollOutcome.SevenOut)
    expect(totalCrapsStake(state)).toBe(0)
    expect(totalCrapsPayout(state)).toBe(0)
  })

  /*
   * Off on the come-out, which is the house default and the reason it is worth
   * asserting: without it a natural seven would pay the pass line and wipe
   * every place bet in the same roll, which reads as the table cheating.
   */
  /*
   * Cannot be laid until there is a point. A real table takes one on the
   * come-out and turns it off, which needs a crew standing there to explain:
   * the player buys a bet, the dice roll their number, and nothing happens.
   */
  it('cannot be laid before a point is established', () => {
    const state = createCrapsGame(5)
    expect(state.phase).toBe(CrapsPhase.ComeOut)

    expect(canPlaceCrapsBet(state, CrapsBet.Place6, 6)).toBe(false)
    expect(() => placeCrapsBet(state, CrapsBet.Place6, 6)).toThrow(/Cannot place/)
  })

  /*
   * A bet already standing rides through the next come-out without acting —
   * off, as the house has it. Without this a natural seven would pay the pass
   * line and take every place bet in the same roll, which reads as the table
   * helping itself.
   */
  it('neither wins nor loses on a come-out roll', () => {
    let state = placeCrapsBet(rollUntil(createCrapsGame(5), 4), CrapsBet.Place6, 6)

    // Make the point, which hands the dice back to a come-out with the six
    // still standing on the felt.
    state = rollUntil(state, 4)
    expect(state.phase).toBe(CrapsPhase.ComeOut)
    expect(state.bets[CrapsBet.Place6]).toBe(6)

    const afterSix = rollUntil(state, 6)
    expect(afterSix.bets[CrapsBet.Place6]).toBe(6)
    expect(afterSix.lastPayouts[CrapsBet.Place6]).toBe(0)

    const afterSeven = rollUntil(state, 7)
    expect(afterSeven.bets[CrapsBet.Place6]).toBe(6)
    expect(afterSeven.lastPayouts[CrapsBet.Place6]).toBe(0)
  })
})

/**
 * Every bet the bar draws, and every chip the rack offers, in the two states
 * the table is ever in. `chipStake` is the only thing standing between a chip
 * and a wager, so it is checked exhaustively rather than by example.
 */
const ALL_BETS = Object.values(CrapsBet)
const ALL_CHIPS = CHIP_DENOMINATIONS.map((chip) => chip.value)

function bothPhases(): CrapsState[] {
  const comeOut = createCrapsGame(5)
  // A point, a line bet behind it, and something already on a number, so the
  // odds cap and the stacking case are both exercised.
  let point = placeCrapsBet(comeOut, CrapsBet.PassLine, 10)
  point = rollUntil(point, 4)
  point = placeCrapsBet(point, CrapsBet.Place6, 6)
  return [comeOut, point]
}

describe('what a chip buys', () => {
  /*
   * The interface must never offer a press the engine throws on. `placeCrapsBet`
   * refuses anything `canPlaceCrapsBet` rejects, so a disagreement here is a
   * crash on click rather than a wrong number somewhere.
   */
  it('never returns an amount the engine would refuse', () => {
    for (const state of bothPhases()) {
      for (const bet of ALL_BETS) {
        for (const chip of ALL_CHIPS) {
          const stake = chipStake(state, bet, chip)
          if (stake === 0) continue

          expect(canPlaceCrapsBet(state, bet, stake), `${bet} @ $${chip}`).toBe(true)
          expect(() => placeCrapsBet(state, bet, stake)).not.toThrow()
        }
      }
    }
  })

  /* You never spend more than the chip you picked up. */
  it('never spends more than the chip', () => {
    for (const state of bothPhases()) {
      for (const bet of ALL_BETS) {
        for (const chip of ALL_CHIPS) {
          expect(chipStake(state, bet, chip), `${bet} @ $${chip}`).toBeLessThanOrEqual(chip)
        }
      }
    }
  })

  /*
   * This is what lets the rack own the bankroll check and every cell ignore it:
   * a chip you can afford can always be afforded wherever it lands. It holds
   * because nothing here ever rounds a stake *up*. Break that and the cells
   * start offering bets that overdraw.
   */
  it('never turns an affordable chip into an unaffordable bet', () => {
    for (const state of bothPhases()) {
      for (const bet of ALL_BETS) {
        for (const chip of ALL_CHIPS) {
          expect(chipStake(state, bet, chip)).toBeLessThanOrEqual(chip)
        }
      }
    }
  })

  /*
   * The whole point of the rack. The old grid could only offer the amounts it
   * had drawn, so a $25 chip on the six — $24, four sixes — was unreachable.
   */
  it('rounds a place bet down to whole units of that number', () => {
    const [, point] = bothPhases()

    expect(chipStake(point!, CrapsBet.Place6, 25)).toBe(24)
    expect(chipStake(point!, CrapsBet.Place8, 100)).toBe(96)
    expect(chipStake(point!, CrapsBet.Place5, 25)).toBe(25)

    // A chip smaller than one unit buys nothing rather than quietly spending
    // more than the player picked up.
    expect(chipStake(point!, CrapsBet.Place6, 5)).toBe(0)
  })

  it('trims free odds to the headroom behind the line', () => {
    let state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)
    state = rollUntil(state, 4)

    // 3x on a ten-dollar line is thirty, so a hundred-dollar chip lays thirty.
    expect(chipStake(state, CrapsBet.Odds, 100)).toBe(10 * MAX_ODDS_MULTIPLE)
    expect(chipStake(state, CrapsBet.Odds, 10)).toBe(10)

    // And nothing at all once the cap is reached.
    const maxed = placeCrapsBet(state, CrapsBet.Odds, 10 * MAX_ODDS_MULTIPLE)
    expect(chipStake(maxed, CrapsBet.Odds, 5)).toBe(0)
  })

  it('buys nothing on a closed bet', () => {
    const [comeOut, point] = bothPhases()

    // The numbers are shut until there is a point.
    expect(chipStake(comeOut!, CrapsBet.Place6, 100)).toBe(0)
    // And the line is shut once there is one.
    expect(chipStake(point!, CrapsBet.PassLine, 100)).toBe(0)
  })
})

describe('taking a bet down', () => {
  /*
   * Place bets ride until a seven now, so without this the only way out of a
   * number is to leave the table — which hands back every other bet with it.
   */
  it('hands back exactly that bet and leaves the rest alone', () => {
    let state = rollUntil(createCrapsGame(5), 4)
    state = placeCrapsBet(state, CrapsBet.Place6, 12)
    state = placeCrapsBet(state, CrapsBet.Place8, 6)

    expect(canTakeDownCrapsBet(state, CrapsBet.Place6)).toBe(true)

    const after = takeDownCrapsBet(state, CrapsBet.Place6)
    expect(after.bets[CrapsBet.Place6]).toBe(0)
    expect(after.bets[CrapsBet.Place8]).toBe(6)
    expect(totalCrapsStake(after)).toBe(totalCrapsStake(state) - 12)
  })

  /*
   * The pass line is the one true contract bet: once it is out it rides to a
   * decision, which is what makes free odds behind it a fair bet at all.
   */
  it('refuses the pass line, and allows everything else', () => {
    let state = placeCrapsBet(createCrapsGame(5), CrapsBet.PassLine, 10)
    state = placeCrapsBet(state, CrapsBet.DontPass, 10)

    expect(canTakeDownCrapsBet(state, CrapsBet.PassLine)).toBe(false)
    expect(() => takeDownCrapsBet(state, CrapsBet.PassLine)).toThrow(/Cannot take down/)

    expect(canTakeDownCrapsBet(state, CrapsBet.DontPass)).toBe(true)
  })

  it('refuses a bet with nothing on it', () => {
    const state = rollUntil(createCrapsGame(5), 4)

    expect(canTakeDownCrapsBet(state, CrapsBet.Place6)).toBe(false)
    expect(() => takeDownCrapsBet(state, CrapsBet.Place6)).toThrow(/Cannot take down/)
  })
})
