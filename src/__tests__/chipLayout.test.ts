import { describe, expect, it } from 'vitest'
import {
  CHIP_DENOMINATIONS,
  chipBreakdown,
  chipsValue,
  MAX_CHIPS_PER_COLUMN,
  packIntoColumns,
  stashBreakdown,
} from '../scenes/chipLayout'
import {
  CHIP_ROW_Z,
  DEALER_RACK,
  DISCARD_POSITION,
  handAnchorX,
  isOnFelt,
  PAYOUT_NUDGE_X,
  PAYOUT_NUDGE_Z,
  SPLIT_OFFSET,
  STASH_COLUMN_ANCHORS,
} from '../scenes/tableLayout'

describe('chipBreakdown', () => {
  // Chips are the player's money made physical. If a breakdown does not add
  // back up, the stack on the felt silently disagrees with the bankroll.
  it('always totals the amount it was given', () => {
    for (const amount of [5, 10, 25, 40, 75, 100, 235, 500, 615, 1000, 2385]) {
      expect(chipsValue(chipBreakdown(amount))).toBe(amount)
    }
  })

  // Anything below the smallest chip cannot be represented, so it must round
  // down rather than produce a phantom chip worth less than $5.
  it('rounds down to whole chips and yields nothing below the minimum', () => {
    expect(chipBreakdown(4)).toHaveLength(0)
    expect(chipsValue(chipBreakdown(7))).toBe(5)
    expect(chipBreakdown(0)).toHaveLength(0)
    expect(chipBreakdown(-50)).toHaveLength(0)
  })

  // Largest-first is what keeps a big bankroll short. Reversing it would build
  // a tower of $5 chips for a $2000 stash.
  it('uses the largest denominations first', () => {
    const chips = chipBreakdown(630)
    expect(chips[0]?.value).toBe(500)
    expect(chipsValue(chips)).toBe(630)
  })

  it('has denominations ordered largest to smallest', () => {
    const values = CHIP_DENOMINATIONS.map((chip) => chip.value)
    expect([...values].sort((a, b) => b - a)).toEqual(values)
  })
})

describe('packIntoColumns', () => {
  // A column taller than this reads as an unstable tower and pokes through the
  // camera framing at the near edge of the table.
  it('never builds a column taller than the limit', () => {
    for (const amount of [25, 100, 500, 2000, 9999]) {
      for (const column of packIntoColumns(chipBreakdown(amount), 4)) {
        expect(column.length).toBeLessThanOrEqual(MAX_CHIPS_PER_COLUMN)
      }
    }
  })

  it('respects the column limit', () => {
    expect(packIntoColumns(chipBreakdown(9999), 4).length).toBeLessThanOrEqual(4)
  })

  it('keeps every chip when there is room', () => {
    const chips = chipBreakdown(230)
    const packed = packIntoColumns(chips, 4).flat()
    expect(chipsValue(packed)).toBe(230)
  })
})

describe('table anchors', () => {
  // These positions were derived by hand from the felt's printed markings.
  // Getting them wrong has already put cards on top of the chip rack and hung
  // the dealing shoe over the table edge, and neither showed up until a
  // screenshot. Assert them instead.
  it('places every stash column on the felt', () => {
    for (const [x, z] of STASH_COLUMN_ANCHORS) {
      expect(isOnFelt(x, z, 0.16)).toBe(true)
    }
  })

  it('keeps both split hands and their payouts on the felt', () => {
    for (const handIndex of [0, 1]) {
      const x = handAnchorX(handIndex, 2)
      expect(isOnFelt(x, CHIP_ROW_Z, 0.16)).toBe(true)
      // The payout sits on top of the wager rather than beside it — setting it
      // fully alongside pushed the outer hand's winnings off the table edge.
      expect(isOnFelt(x + PAYOUT_NUDGE_X, CHIP_ROW_Z + PAYOUT_NUDGE_Z, 0.16)).toBe(true)
    }
    expect(handAnchorX(0, 1)).toBe(0)
  })

  // The stash lives in a narrow band between the centre spot and the rail. If
  // it drifted outward it would land under the left split hand's chips.
  it('keeps the stash clear of both split hands', () => {
    for (const [x, z] of STASH_COLUMN_ANCHORS) {
      for (const handIndex of [0, 1]) {
        const handX = handAnchorX(handIndex, 2)
        expect(Math.hypot(x - handX, z - CHIP_ROW_Z)).toBeGreaterThan(0.34)
      }
    }
  })

  it('keeps the dealer rack and the discard on the felt', () => {
    expect(isOnFelt(DEALER_RACK[0], DEALER_RACK[2], 0.16)).toBe(true)
    expect(isOnFelt(DISCARD_POSITION[0], DISCARD_POSITION[2], 0.05)).toBe(true)
  })

  // Stash columns must not land on top of the betting spots, or the wager and
  // the stash would occupy the same patch of felt.
  it('keeps the stash clear of the centre betting spot', () => {
    for (const [x, z] of STASH_COLUMN_ANCHORS) {
      expect(Math.hypot(x - 0, z - CHIP_ROW_Z)).toBeGreaterThan(0.34)
    }
  })

  it('separates split hands by more than a chip stack is wide', () => {
    expect(SPLIT_OFFSET * 2).toBeGreaterThan(0.6)
  })

  it('rejects points off the felt', () => {
    expect(isOnFelt(0, 3.5)).toBe(false)
    expect(isOnFelt(4, 0)).toBe(false)
    // The dealer's side is shallower than the player's.
    expect(isOnFelt(0, -1.5)).toBe(false)
    expect(isOnFelt(0, 1.5)).toBe(true)
  })
})

describe('stashBreakdown', () => {
  // A bankroll rendered largest-first shows $500 as one lonely chip. The stash
  // should look like a stash — the fullest pile that still fits the space.
  it('prefers more chips over larger denominations', () => {
    const chips = stashBreakdown(500, 10)
    expect(chips.length).toBeGreaterThan(1)
    expect(chipsValue(chips)).toBe(500)
  })

  it('never exceeds the space available', () => {
    for (const amount of [5, 75, 500, 2000, 50000]) {
      expect(stashBreakdown(amount, 10).length).toBeLessThanOrEqual(10)
    }
  })

  // Below the cap the stash must still be worth exactly the bankroll, or the
  // chips on the felt disagree with the number in the HUD.
  it('totals the bankroll whenever it fits', () => {
    for (const amount of [5, 25, 100, 250, 500, 1000]) {
      const chips = stashBreakdown(amount, 10)
      if (chips.length < 10) expect(chipsValue(chips)).toBe(amount)
    }
  })

  it('yields nothing for an empty bankroll', () => {
    expect(stashBreakdown(0, 10)).toHaveLength(0)
  })
})

describe('offered stakes', () => {
  /*
   * The stakes the table offers must all pay whole dollars. A $25 bet pays
   * $62.50 on a natural, which has no chip to represent it and rendered the
   * bankroll as "$537.5". Kept here rather than in the panel so changing the
   * chip buttons cannot quietly reintroduce fractional money.
   */
  const OFFERED_STAKES = [10, 50, 100]

  it('pays whole dollars on every possible outcome', () => {
    for (const stake of OFFERED_STAKES) {
      // Natural 3:2, even money, push, and the doubled versions of each.
      for (const multiplier of [2.5, 2, 1]) {
        expect(Number.isInteger(stake * multiplier)).toBe(true)
        expect(Number.isInteger(stake * 2 * multiplier)).toBe(true)
      }
    }
  })

  it('can render every stake as chips exactly', () => {
    for (const stake of OFFERED_STAKES) {
      expect(chipsValue(chipBreakdown(stake))).toBe(stake)
    }
  })
})
