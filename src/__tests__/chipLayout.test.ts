import { describe, expect, it } from 'vitest'
import {
  CHIP_DENOMINATIONS,
  chipBreakdown,
  chipsValue,
  MAX_CHIPS_PER_COLUMN,
  packIntoColumns,
  stashBreakdown,
} from '../scenes/chipLayout'
import { MAX_HANDS } from '../games/blackjack/engine'
import {
  CHIP_ROW_Z,
  DEALER_RACK,
  DISCARD_POSITION,
  DISCARD_TRAY,
  handAnchorX,
  isOnFelt,
  PAYOUT_NUDGE_X,
  PAYOUT_NUDGE_Z,
  SHOE_MOUTH,
  SHOE_POSITION,
  STASH_COLUMN_ANCHORS,
  stashRailCorners,
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

  // Every hand a resplit can produce, not just the two a single split makes.
  // Raising MAX_HANDS without widening this is how a third betting spot ends
  // up hanging over the table edge.
  it('keeps every hand and its payout on the felt, up to MAX_HANDS', () => {
    for (let handCount = 1; handCount <= MAX_HANDS; handCount++) {
      for (let handIndex = 0; handIndex < handCount; handIndex++) {
        const x = handAnchorX(handIndex, handCount)
        expect(isOnFelt(x, CHIP_ROW_Z, 0.16)).toBe(true)
        // The payout sits on top of the wager rather than beside it — setting it
        // fully alongside pushed the outer hand's winnings off the table edge.
        expect(isOnFelt(x + PAYOUT_NUDGE_X, CHIP_ROW_Z + PAYOUT_NUDGE_Z, 0.16)).toBe(true)
      }
    }
    expect(handAnchorX(0, 1)).toBe(0)
  })

  // The stash lives in a narrow band between the centre spot and the rail. If
  // it drifted outward, or a hand drifted inward, they would share a patch of
  // felt — which is the whole reason a fourth hand is not offered.
  it('keeps the stash clear of every split hand', () => {
    for (const [x, z] of STASH_COLUMN_ANCHORS) {
      for (let handCount = 2; handCount <= MAX_HANDS; handCount++) {
        for (let handIndex = 0; handIndex < handCount; handIndex++) {
          const handX = handAnchorX(handIndex, handCount)
          expect(Math.hypot(x - handX, z - CHIP_ROW_Z)).toBeGreaterThan(0.34)
        }
      }
    }
  })

  // Two stacks of chips on the same spot read as one stack of the wrong size,
  // and a player cannot tell which hand they are looking at.
  it('separates neighbouring hands by more than a chip stack is wide', () => {
    for (let handCount = 2; handCount <= MAX_HANDS; handCount++) {
      for (let handIndex = 1; handIndex < handCount; handIndex++) {
        const gap = handAnchorX(handIndex, handCount) - handAnchorX(handIndex - 1, handCount)
        expect(gap).toBeGreaterThan(0.6)
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

describe('stash rail', () => {
  // The well sits right against the table edge, where there is barely room.
  // An earlier, larger version overhung the rail on two corners.
  it('keeps all four corners on the felt', () => {
    for (const [x, z] of stashRailCorners()) {
      expect(isOnFelt(x, z)).toBe(true)
    }
  })

  it('covers every stash column', () => {
    const corners = stashRailCorners()
    const minX = Math.min(...corners.map(([x]) => x))
    const maxX = Math.max(...corners.map(([x]) => x))

    for (const [x] of STASH_COLUMN_ANCHORS) {
      expect(x).toBeGreaterThan(minX)
      expect(x).toBeLessThan(maxX)
    }
  })
})

describe('stash tray clearance', () => {
  /*
   * The tray is much wider than the chip columns inside it, so clearing the
   * columns is not enough — an earlier size cleared every column but still had
   * a corner clipping the left split hand's wager.
   */
  it('keeps every tray corner clear of both split hands and the centre spot', () => {
    const CHIP_RADIUS_MARGIN = 0.16

    for (const [x, z] of stashRailCorners()) {
      for (const handX of [handAnchorX(0, 2), handAnchorX(1, 2), 0]) {
        expect(Math.hypot(x - handX, z - CHIP_ROW_Z)).toBeGreaterThan(CHIP_RADIUS_MARGIN)
      }
    }
  })
})

describe('dealer kit placement', () => {
  // The shoe overhung the table edge once already, and the discard tray used to
  // sit on the same side as the shoe — which no real table does.
  it('keeps the shoe and the discard tray on the felt', () => {
    expect(isOnFelt(SHOE_POSITION[0], SHOE_POSITION[2], 0.3)).toBe(true)
    expect(isOnFelt(SHOE_MOUTH[0], SHOE_MOUTH[2], 0.2)).toBe(true)
    expect(isOnFelt(DISCARD_TRAY[0], DISCARD_TRAY[2], 0.25)).toBe(true)
  })

  it('puts the shoe and the discard tray on opposite sides of the dealer', () => {
    expect(Math.sign(SHOE_POSITION[0])).not.toBe(Math.sign(DISCARD_TRAY[0]))
  })

  // The rack spans x -0.65..0.95; either piece of kit landing on it would clip.
  it('keeps both clear of the dealer’s chip rack', () => {
    for (const [x, , z] of [SHOE_POSITION, DISCARD_TRAY]) {
      expect(Math.hypot(x - DEALER_RACK[0], z - DEALER_RACK[2])).toBeGreaterThan(0.9)
    }
  })

  // Cards fly out of the mouth, so it has to be part of the shoe, not adrift.
  it('puts the shoe mouth within reach of the shoe body', () => {
    expect(
      Math.hypot(SHOE_MOUTH[0] - SHOE_POSITION[0], SHOE_MOUTH[2] - SHOE_POSITION[2]),
    ).toBeLessThan(0.45)
  })
})
