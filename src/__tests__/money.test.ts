import { describe, expect, it } from 'vitest'
import { DONATION_FEE, MARKER_AMOUNT, splitWinnings } from '../world/money'

/** A spread of realistic and awkward wins, including odd and tiny ones. */
const AMOUNTS = [0, 1, 2, 3, 5, 7, 10, 15, 25, 37, 50, 75, 99, 100, 125, 150, 375, 500, 1001, 2385]
const DEBTS = [0, 1, 2, 5, 25, 99, 100, 250, 499, 500, 1000]

describe('splitWinnings', () => {
  // Money on this project is whole dollars everywhere. A percentage split is
  // exactly where that breaks — it is the 6:5 payout bug again, and it would
  // reach the player as "$449.99999999999994" in the HUD.
  it('always divides into whole dollars', () => {
    for (const amount of AMOUNTS) {
      for (const debt of DEBTS) {
        const { toBankroll, toDebt } = splitWinnings(amount, debt)

        expect(Number.isInteger(toBankroll), `${amount}/${debt} bankroll`).toBe(true)
        expect(Number.isInteger(toDebt), `${amount}/${debt} debt`).toBe(true)
      }
    }
  })

  // Chips cannot appear or vanish in the split. If the two halves did not sum
  // back to the win, the panel's announced payout and the bankroll would
  // silently disagree by a dollar a hand.
  it('never creates or loses money', () => {
    for (const amount of AMOUNTS) {
      for (const debt of DEBTS) {
        const { toBankroll, toDebt } = splitWinnings(amount, debt)
        expect(toBankroll + toDebt, `${amount} split against ${debt}`).toBe(Math.max(0, amount))
      }
    }
  })

  // Overpaying a marker would hand the house free money and leave the player
  // with a negative debt to render.
  it('never repays more than is owed', () => {
    for (const amount of AMOUNTS) {
      for (const debt of DEBTS) {
        expect(splitWinnings(amount, debt).toDebt).toBeLessThanOrEqual(debt)
      }
    }
  })

  // The point of the whole exercise: a marker has to be escapable. Repeatedly
  // winning must land the debt on exactly zero, not a dollar short of it
  // forever.
  it('pays a marker down to exactly zero', () => {
    let debt = MARKER_AMOUNT
    let wins = 0

    while (debt > 0 && wins < 500) {
      debt -= splitWinnings(75, debt).toDebt
      wins += 1
    }

    expect(debt).toBe(0)
    expect(wins).toBeLessThan(500)
  })

  // The odd dollar goes to the player, not the house. A $1 win that vanished
  // entirely into a debt it cannot dent reads as the game stealing from you.
  it('gives the player the odd dollar', () => {
    expect(splitWinnings(1, 500)).toEqual({ toBankroll: 1, toDebt: 0 })
    expect(splitWinnings(3, 500)).toEqual({ toBankroll: 2, toDebt: 1 })
  })

  // With nothing owed the player keeps everything — the split has to be inert
  // for the overwhelmingly common case.
  it('passes the whole win through when nothing is owed', () => {
    for (const amount of AMOUNTS) {
      expect(splitWinnings(amount, 0)).toEqual({ toBankroll: amount, toDebt: 0 })
    }
  })
})

describe('the economy', () => {
  /*
   * A pint has to be worth the ten seconds in the chair and payable in chips.
   *
   * There is no upper bound here any more. There used to be one — the fee had
   * to stay well under the starting purse so the clinic could not out-earn the
   * tables — but with the daily cap gone that ship has sailed by design, and an
   * assertion pretending otherwise would just be a lie with a green tick.
   */
  it('pays a whole number of dollars, enough to bet with', () => {
    expect(Number.isInteger(DONATION_FEE)).toBe(true)
    expect(DONATION_FEE).toBeGreaterThanOrEqual(10)
  })

  it('lends a whole number of dollars', () => {
    expect(Number.isInteger(MARKER_AMOUNT)).toBe(true)
    expect(MARKER_AMOUNT).toBeGreaterThan(0)
  })

})
