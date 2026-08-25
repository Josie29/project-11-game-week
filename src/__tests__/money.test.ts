import { describe, expect, it } from 'vitest'
import {
  canDonate,
  DONATION_FEE,
  MARKER_AMOUNT,
  nextDonationClock,
  splitWinnings,
} from '../world/money'
import { STARTING_BANKROLL } from '../store/useGameStore'

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

describe('canDonate', () => {
  // Once per day is the entire mechanic. Without the gate the clinic is an ATM
  // and going broke stops meaning anything again.
  it('allows one donation per day', () => {
    expect(canDonate(3, null)).toBe(true)
    expect(canDonate(3, 3)).toBe(false)
    expect(canDonate(4, 3)).toBe(true)
  })

  // The day counter is monotonic precisely so this keeps working across the
  // 1440-minute wrap; a check derived from `minuteOfDay` would reset every time
  // the clock passed midnight, which happens every 24 real minutes.
  it('keeps working across many days', () => {
    for (let day = 1; day < 40; day++) {
      expect(canDonate(day, day - 1)).toBe(true)
      expect(canDonate(day, day)).toBe(false)
    }
  })
})

describe('the economy', () => {
  // A pint has to be worth walking there for and not worth farming. Below the
  // smallest chip it buys nothing; anywhere near the starting purse and the
  // tables stop mattering.
  it('pays enough to bet with and not enough to live on', () => {
    expect(DONATION_FEE).toBeGreaterThanOrEqual(10)
    expect(DONATION_FEE).toBeLessThan(STARTING_BANKROLL / 5)
    expect(Number.isInteger(DONATION_FEE)).toBe(true)
  })

  it('lends a whole number of dollars', () => {
    expect(Number.isInteger(MARKER_AMOUNT)).toBe(true)
    expect(MARKER_AMOUNT).toBeGreaterThan(0)
  })

  it('quotes a real clock time in the refusal', () => {
    expect(nextDonationClock()).toMatch(/^\d{2}:\d{2}$/)
  })
})
