import { describe, expect, it } from 'vitest'
import {
  act,
  canDouble,
  createGame,
  createGameFromShoe,
  createShoe,
  handValue,
  placeBet,
} from '../games/blackjack/engine'
import { type Card, PlayerAction, Rank, RoundOutcome, RoundPhase, Suit } from '../games/blackjack/types'

/** Terse card builder so stacked shoes stay readable. */
function card(rank: Rank, suit: Suit = Suit.Spades): Card {
  return { rank, suit }
}

/**
 * Builds a shoe that deals the given hands, then the listed follow-up cards.
 *
 * Deal order is player, dealer, player, dealer, so the opening four cards
 * interleave before any remaining draws.
 */
function stackedShoe(
  player: readonly [Card, Card],
  dealer: readonly [Card, Card],
  rest: readonly Card[] = [],
): Card[] {
  return [player[0], dealer[0], player[1], dealer[1], ...rest]
}

describe('handValue', () => {
  // Without demoting aces one at a time, A,A,9 scores 31 (bust) or 11 (too low).
  // Getting this wrong silently misprices every multi-ace hand the player draws.
  it('counts multiple aces so that A,A,9 totals 21', () => {
    expect(handValue([card(Rank.Ace), card(Rank.Ace), card(Rank.Nine)]).total).toBe(21)
  })

  // Soft/hard classification drives whether the dealer stands, so a hand that
  // stops being soft after a third card must be reported as hard.
  it('reports A,6 as soft 17 and A,6,10 as hard 17', () => {
    expect(handValue([card(Rank.Ace), card(Rank.Six)])).toEqual({ total: 17, isSoft: true })
    expect(handValue([card(Rank.Ace), card(Rank.Six), card(Rank.Ten)])).toEqual({
      total: 17,
      isSoft: false,
    })
  })
})

describe('dealer play', () => {
  // House rule is stand on soft 17. If the dealer hit here the house edge would
  // shift and the game would no longer match the rules shown to the player.
  it('stands on soft 17 rather than drawing', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)], // Player 18
      [card(Rank.Ace), card(Rank.Six)], // Dealer soft 17
      [card(Rank.Five)], // Would be drawn only if the dealer wrongly hit.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(2)
    expect(handValue(settled.dealerHand).total).toBe(17)
    expect(settled.outcome).toBe(RoundOutcome.PlayerWin)
  })

  // The mirror case: a hard 16 must be hit, otherwise the dealer stands short
  // and the player wins hands they should lose.
  it('hits hard 16', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)], // Player 18
      [card(Rank.Ten), card(Rank.Six)], // Dealer hard 16
      [card(Rank.Five)], // Dealer draws to 21.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(3)
    expect(handValue(settled.dealerHand).total).toBe(21)
    expect(settled.outcome).toBe(RoundOutcome.DealerWin)
  })
})

describe('settlement', () => {
  // A natural must pay 3:2. Paying even money is the single most player-visible
  // way to get blackjack wrong.
  it('pays a natural blackjack 3:2', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.King)], // Player natural 21
      [card(Rank.Nine), card(Rank.Seven)], // Dealer 16
    )

    const settled = placeBet(createGameFromShoe(shoe), 10)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(settled.outcome).toBe(RoundOutcome.PlayerBlackjack)
    // Stake (10) plus 3:2 winnings (15).
    expect(settled.payout).toBe(25)
  })

  // Two naturals is a push, not a player win. Players notice immediately when a
  // tied blackjack pays out.
  it('pushes when player and dealer both have naturals', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.King)],
      [card(Rank.Ace, Suit.Hearts), card(Rank.Queen)],
    )

    const settled = placeBet(createGameFromShoe(shoe), 10)

    expect(settled.outcome).toBe(RoundOutcome.Push)
    expect(settled.payout).toBe(10) // Stake refunded, nothing won.
  })

  // Busting ends the hand there and then. If the dealer kept drawing they could
  // bust too and wrongly hand the player a win on an already-lost hand.
  it('settles a player bust immediately without the dealer drawing', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Six)], // Player 16
      [card(Rank.Five), card(Rank.Six)], // Dealer 11, would draw if given the chance.
      [card(Rank.King), card(Rank.King)], // Player busts to 26; second King unused.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Hit)

    expect(settled.outcome).toBe(RoundOutcome.PlayerBust)
    expect(settled.payout).toBe(0)
    expect(settled.dealerHand).toHaveLength(2)
  })
})

describe('double down', () => {
  // Doubling must take exactly one card and then stop. Allowing further hits
  // would let the player draw unlimited cards at double stakes.
  it('doubles the wager, draws exactly one card, then ends the turn', () => {
    const shoe = stackedShoe(
      [card(Rank.Six), card(Rank.Five)], // Player 11
      [card(Rank.Ten), card(Rank.Seven)], // Dealer 17, stands.
      [card(Rank.Nine)], // Player doubles to 20.
    )

    const opened = placeBet(createGameFromShoe(shoe), 10)
    expect(canDouble(opened)).toBe(true)

    const settled = act(opened, PlayerAction.Double)

    expect(settled.bet).toBe(20)
    expect(settled.playerHand).toHaveLength(3)
    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(settled.outcome).toBe(RoundOutcome.PlayerWin)
    expect(settled.payout).toBe(40) // Doubled stake returned twice over.
  })

  // Doubling is an opening-two-cards move only; permitting it later would be a
  // rules break the player could exploit.
  it('refuses to double after the player has already hit', () => {
    const shoe = stackedShoe(
      [card(Rank.Two), card(Rank.Three)],
      [card(Rank.Ten), card(Rank.Seven)],
      [card(Rank.Four), card(Rank.Nine)],
    )

    const afterHit = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Hit)

    expect(canDouble(afterHit)).toBe(false)
    expect(() => act(afterHit, PlayerAction.Double)).toThrow(/opening two cards/)
  })
})

describe('shoe', () => {
  // Determinism is what makes every test above reproducible and lets a demo run
  // be replayed. If seeding broke, failures would become intermittent.
  it('produces an identical shoe for the same seed and a different one otherwise', () => {
    expect(createShoe(1234)).toEqual(createShoe(1234))
    expect(createShoe(1234)).not.toEqual(createShoe(5678))
  })

  it('builds a full six-deck shoe', () => {
    expect(createShoe(1).length).toBe(6 * 52)
  })

  // Guards the public entry point actually used by the UI, which the stacked-shoe
  // tests bypass.
  it('starts a seeded game awaiting a bet', () => {
    const game = createGame(42)
    expect(game.phase).toBe(RoundPhase.Betting)
    expect(game.playerHand).toHaveLength(0)
    expect(game.bet).toBe(0)
  })
})
