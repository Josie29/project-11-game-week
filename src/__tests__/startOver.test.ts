import { beforeEach, describe, expect, it } from 'vitest'
import { CrapsBet } from '../scenes/crapsFeltLayout'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { startNewRun } from '../world/startOver'

/*
 * Starting over has to reach every store a run touches.
 *
 * The reset used to be assembled by hand in the settings panel's click handler,
 * and when the table games arrived nobody added them to it. Wiping everything
 * cleared the money, the character and the session, and left a dealt hand lying
 * on the blackjack felt: two cards face up, a chip on the betting spot and the
 * dealer holding, with nobody sitting at the table. The next run walked in and
 * found it.
 *
 * That is a bug you can see in a screenshot, but only if you happen to take one
 * after a reset, in the casino, having played a hand before it. These assert it
 * directly.
 */
describe('starting over', () => {
  beforeEach(() => {
    useBlackjackStore.getState().reset()
    useCrapsStore.getState().reset()
  })

  it('leaves no hand on the blackjack table', () => {
    useBlackjackStore.getState().placeWager(25)

    // Guard: the wager has to have actually dealt something, or this test
    // passes by testing nothing.
    const dealt = useBlackjackStore.getState().game
    expect(dealt.seats.some((seat) => seat.hands.some((hand) => hand.cards.length > 0))).toBe(true)

    startNewRun()

    const after = useBlackjackStore.getState().game
    expect(after.dealerHand).toHaveLength(0)
    for (const seat of after.seats) {
      for (const hand of seat.hands) {
        expect(hand.cards, 'a hand survived the reset').toHaveLength(0)
        expect(hand.bet, 'a bet survived the reset').toBe(0)
      }
    }
  })

  it('leaves no bets or point on the craps table', () => {
    useCrapsStore.getState().wager(CrapsBet.PassLine, 25)

    const staked = useCrapsStore.getState().game
    expect(staked.bets[CrapsBet.PassLine], 'the wager did not land').toBeGreaterThan(0)

    startNewRun()

    const after = useCrapsStore.getState().game
    expect(after.point, 'a point survived the reset').toBeNull()
    for (const amount of Object.values(after.bets)) {
      expect(amount, 'a bet survived the reset').toBe(0)
    }
  })

  // The reason the money was never the bug: it was already on the list. Kept so
  // that shrinking the list is as loud as forgetting to grow it.
  it('puts the bankroll back to the starting stake', () => {
    useGameStore.getState().adjustBankroll(-400)
    expect(useGameStore.getState().bankroll).toBeLessThan(500)

    startNewRun()

    expect(useGameStore.getState().bankroll).toBe(500)
  })
})
