import { describe, expect, it } from 'vitest'
import { MAX_HANDS } from '../games/blackjack/engine'
import {
  CARD_HEIGHT,
  CARD_LIFT_STEP,
  CARD_SPACING,
  CARD_WIDTH,
  DEALER_ROW_Z,
  dealerCardPlacement,
  isOnFelt,
  SEAT_SPLIT_OFFSET,
  SEAT_SPOTS,
  seatAnchor,
  seatCardPlacements,
  soloCardPlacements,
  SPLIT_HAND_LIFT,
  type CardPlacement,
} from '../scenes/tableLayout'

/**
 * Card counts worth checking per hand. Eight is past any hand a shoe realistically
 * deals (seven small cards already bust or reach 21), so a layout that holds
 * to eight holds in play.
 */
const CARD_COUNTS = [1, 2, 3, 5, 8] as const
const MAX_CARDS = 8

/** Whether two cards, lying flat, overlap when seen from above. */
function overlapsInPlan(a: CardPlacement, b: CardPlacement): boolean {
  return Math.abs(a.x - b.x) < CARD_WIDTH && Math.abs(a.z - b.z) < CARD_HEIGHT
}

/** Every card a seat could be showing: all hands, `cards` cards in each. */
function seatCards(stool: number, handCount: number, cards: number): CardPlacement[] {
  return Array.from({ length: handCount }, (_, hand) =>
    seatCardPlacements(stool, hand, handCount, cards),
  ).flat()
}

describe('blackjack hand clearance', () => {
  /*
   * Issue #4: a four-card hand and its split partner ran into each other, and
   * before that a long unsplit hand could reach into the seat next door. Two
   * neighbouring players' cards mixing on the felt makes hands unreadable at
   * exactly the moment somebody is deciding over real chips.
   */
  it('keeps every hand clear of the neighbouring seat, at any size', () => {
    const conflicts: string[] = []

    for (let stool = 0; stool < SEAT_SPOTS.length - 1; stool++) {
      for (let handsHere = 1; handsHere <= MAX_HANDS; handsHere++) {
        for (let handsThere = 1; handsThere <= MAX_HANDS; handsThere++) {
          for (const cards of CARD_COUNTS) {
            const here = seatCards(stool, handsHere, cards)
            const there = seatCards(stool + 1, handsThere, cards)

            for (const a of here) {
              for (const b of there) {
                if (overlapsInPlan(a, b)) {
                  conflicts.push(
                    `stools ${stool}/${stool + 1}, ${handsHere}v${handsThere} hands of ` +
                      `${cards}: (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) meets ` +
                      `(${b.x.toFixed(2)}, ${b.z.toFixed(2)})`,
                  )
                }
              }
            }
          }
        }
      }
    }

    expect(conflicts, conflicts.join('; ')).toEqual([])
  })

  /*
   * The other half of issue #4: cards flickered where they stacked, because
   * every card sat on the same plane and overlapping coplanar quads z-fight.
   * Same spirit as `fightingSurfaces`: any two cards that overlap from above
   * must be separated by more height than the depth buffer's resolution
   * (~0.01mm at this camera distance; the smallest step here is 0.2mm).
   */
  it('never leaves two overlapping cards on the same plane', () => {
    const minimumGap = CARD_LIFT_STEP * SPLIT_HAND_LIFT
    const conflicts: string[] = []

    const layouts: { name: string; cards: CardPlacement[] }[] = []
    for (let stool = 0; stool < SEAT_SPOTS.length; stool++) {
      for (let hands = 1; hands <= MAX_HANDS; hands++) {
        layouts.push({ name: `stool ${stool}, ${hands} hands`, cards: seatCards(stool, hands, MAX_CARDS) })
      }
    }
    for (let hands = 1; hands <= MAX_HANDS; hands++) {
      layouts.push({
        name: `solo, ${hands} hands`,
        cards: Array.from({ length: hands }, (_, hand) =>
          soloCardPlacements(hand, hands, MAX_CARDS),
        ).flat(),
      })
    }
    layouts.push({
      name: 'dealer row',
      cards: Array.from({ length: MAX_CARDS }, (_, index) => dealerCardPlacement(index, MAX_CARDS)),
    })

    for (const { name, cards } of layouts) {
      for (let a = 0; a < cards.length; a++) {
        for (let b = a + 1; b < cards.length; b++) {
          const gap = Math.abs(cards[a]!.y - cards[b]!.y)
          if (overlapsInPlan(cards[a]!, cards[b]!) && gap < minimumGap - 1e-9) {
            conflicts.push(`${name}: cards ${a}/${b} share a plane (gap ${gap.toFixed(5)})`)
          }
        }
      }
    }

    expect(conflicts, conflicts.join('; ')).toEqual([])
  })

  // A layout that solves overlap by pushing cards off the cloth has not solved
  // anything: every corner of every card stays on the felt, at every seat.
  it('keeps every card of every layout on the felt', () => {
    const conflicts: string[] = []

    const check = (name: string, cards: CardPlacement[]): void => {
      for (const card of cards) {
        for (const cornerX of [-CARD_WIDTH / 2, CARD_WIDTH / 2]) {
          for (const cornerZ of [-CARD_HEIGHT / 2, CARD_HEIGHT / 2]) {
            if (!isOnFelt(card.x + cornerX, card.z + cornerZ)) {
              conflicts.push(`${name}: corner off the felt at (${(card.x + cornerX).toFixed(2)}, ${(card.z + cornerZ).toFixed(2)})`)
            }
          }
        }
      }
    }

    for (let stool = 0; stool < SEAT_SPOTS.length; stool++) {
      for (let hands = 1; hands <= MAX_HANDS; hands++) {
        for (const cards of CARD_COUNTS) {
          check(`stool ${stool}, ${hands} hands of ${cards}`, seatCards(stool, hands, cards))
        }
      }
    }
    for (let hands = 1; hands <= MAX_HANDS; hands++) {
      for (const cards of CARD_COUNTS) {
        check(
          `solo, ${hands} hands of ${cards}`,
          Array.from({ length: hands }, (_, hand) => soloCardPlacements(hand, hands, cards)).flat(),
        )
      }
    }

    expect(conflicts, conflicts.join('; ')).toEqual([])
  })

  // The cascade steps toward the dealer, and the dealer's own cards reach half
  // a length back toward the player. However long a split hand runs, the two
  // must never meet — a player's card sliding under the dealer's row reads as
  // the dealer taking it.
  it('holds the cascade short of the dealers row', () => {
    const dealersNearEdge = DEALER_ROW_Z + CARD_HEIGHT / 2

    for (let stool = 0; stool < SEAT_SPOTS.length; stool++) {
      for (let hands = 2; hands <= MAX_HANDS; hands++) {
        for (const card of seatCards(stool, hands, 12)) {
          expect(card.z - CARD_HEIGHT / 2, `stool ${stool}, ${hands} hands`).toBeGreaterThan(
            dealersNearEdge,
          )
        }
      }
    }
  })

  /*
   * The detector itself, fed an overlap it must find. A clearance suite whose
   * predicate returns "clear" for everything passes while proving nothing —
   * this is the layout that shipped the bug in issue #4: split hands at
   * ±SEAT_SPLIT_OFFSET, each fanned at full CARD_SPACING, four cards each.
   */
  it('would have caught the shipped overlap', () => {
    const shippedFan = (handIndex: number): CardPlacement[] => {
      const anchor = seatAnchor(0, handIndex, 2)
      return Array.from({ length: 4 }, (_, index) => ({
        x: anchor.x + (index - 1.5) * CARD_SPACING,
        y: 0,
        z: anchor.z,
      }))
    }

    const collisions = shippedFan(0).flatMap((a) =>
      shippedFan(1).filter((b) => overlapsInPlan(a, b)),
    )
    expect(collisions.length).toBeGreaterThan(0)
    // And with SEAT_SPLIT_OFFSET as shipped, the two hands truly crossed.
    expect(SEAT_SPLIT_OFFSET * 2).toBeLessThan(3 * CARD_SPACING + CARD_WIDTH)
  })
})
