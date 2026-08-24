import { describe, expect, it } from 'vitest'
import {
  act,
  canDouble,
  canSplit,
  createGame,
  createGameFromShoe,
  createShoe,
  handValue,
  placeBet,
  totalStaked,
} from '../games/blackjack/engine'
import {
  type Card,
  type GameState,
  type Hand,
  PlayerAction,
  Rank,
  RoundOutcome,
  RoundPhase,
  Suit,
} from '../games/blackjack/types'

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

/** Reads a hand by index, failing loudly rather than returning undefined. */
function handAt(state: GameState, index: number): Hand {
  const hand = state.hands[index]
  if (!hand) throw new Error(`Expected a hand at index ${index}`)
  return hand
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
  // shift and the game would no longer match the rules printed on the felt.
  it('stands on soft 17 rather than drawing', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)], // Player 18
      [card(Rank.Ace), card(Rank.Six)], // Dealer soft 17
      [card(Rank.Five)], // Would be drawn only if the dealer wrongly hit.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(2)
    expect(handValue(settled.dealerHand).total).toBe(17)
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerWin)
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
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.DealerWin)
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
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerBlackjack)
    // Stake (10) plus 3:2 winnings (15).
    expect(settled.totalPayout).toBe(25)
  })

  // Two naturals is a push, not a player win. Players notice immediately when a
  // tied blackjack pays out.
  it('pushes when player and dealer both have naturals', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.King)],
      [card(Rank.Ace, Suit.Hearts), card(Rank.Queen)],
    )

    const settled = placeBet(createGameFromShoe(shoe), 10)

    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.Push)
    expect(settled.totalPayout).toBe(10) // Stake refunded, nothing won.
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

    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerBust)
    expect(settled.totalPayout).toBe(0)
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

    expect(handAt(settled, 0).bet).toBe(20)
    expect(handAt(settled, 0).cards).toHaveLength(3)
    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerWin)
    expect(settled.totalPayout).toBe(40) // Doubled stake returned twice over.
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

describe('split', () => {
  // The core promise of splitting: two independent hands, each carrying its own
  // wager. If the second stake were not taken the player would get a free hand.
  it('turns a pair into two hands and stakes each one', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)],
      [card(Rank.Three), card(Rank.Two)],
    )

    const opened = placeBet(createGameFromShoe(shoe), 10)
    expect(canSplit(opened)).toBe(true)
    expect(totalStaked(opened)).toBe(10)

    const split = act(opened, PlayerAction.Split)

    expect(split.hands).toHaveLength(2)
    expect(totalStaked(split)).toBe(20)
    expect(handAt(split, 0).cards).toHaveLength(2)
    expect(handAt(split, 1).cards).toHaveLength(2)
    expect(split.activeHandIndex).toBe(0)
  })

  // Equal value is not a pair. Allowing K,Q to split would be a rules break
  // obvious to anyone who plays, and it doubles the felt layout unexpectedly.
  it('refuses to split two ten-value cards of different rank', () => {
    const shoe = stackedShoe(
      [card(Rank.King), card(Rank.Queen)],
      [card(Rank.Ten), card(Rank.Six)],
    )

    expect(canSplit(placeBet(createGameFromShoe(shoe), 10))).toBe(false)
  })

  // Split aces take one card each and stand. Without this a pair of aces could
  // be drawn out indefinitely, which is far too strong for the player.
  it('deals split aces exactly one card each and stands them', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.Ace, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Seven)], // Dealer 17, stands.
      [card(Rank.Nine), card(Rank.Five)],
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)

    expect(handAt(settled, 0).cards).toHaveLength(2)
    expect(handAt(settled, 1).cards).toHaveLength(2)
    expect(settled.phase).toBe(RoundPhase.Settled)
  })

  // A 21 built from a split is an ordinary 21. Paying it 3:2 would hand the
  // player a bonus the house never offers.
  it('pays a split 21 even money rather than 3:2', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.Ace, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Seven)], // Dealer 17.
      [card(Rank.King), card(Rank.Two)], // First hand makes 21, second makes 13.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)
    const first = handAt(settled, 0)

    expect(handValue(first.cards).total).toBe(21)
    expect(first.outcome).toBe(RoundOutcome.PlayerWin)
    expect(first.payout).toBe(20) // Even money, not 25.
  })

  // Busting one hand must not forfeit the other. This is the bug that would
  // quietly cost the player a hand they still had every right to play.
  it('lets the second hand play on after the first busts', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)], // Dealer 16, draws.
      // Draw order after the split is: hand one, hand two, hand one's hit,
      // then the dealer.
      [
        card(Rank.Nine), // Hand one -> 17
        card(Rank.Ace, Suit.Clubs), // Hand two -> soft 19
        card(Rank.King), // Hand one hits to 27, bust.
        card(Rank.Two, Suit.Clubs), // Dealer draws to 18, under hand two.
      ],
    )

    const split = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)
    const afterBust = act(split, PlayerAction.Hit)

    expect(handAt(afterBust, 0).outcome).toBe(RoundOutcome.PlayerBust)
    // Control must have moved on rather than ending the round.
    expect(afterBust.phase).toBe(RoundPhase.PlayerTurn)
    expect(afterBust.activeHandIndex).toBe(1)

    const settled = act(afterBust, PlayerAction.Stand)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 1).outcome).toBe(RoundOutcome.PlayerWin)
    // Only the surviving hand pays; the busted one returns nothing.
    expect(settled.totalPayout).toBe(20)
  })

  // One split only. Without the cap the felt layout and betting UI have to
  // handle an unbounded number of hands.
  it('refuses a second split', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)],
      [card(Rank.Eight, Suit.Clubs), card(Rank.Eight, Suit.Diamonds)],
    )

    const split = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)

    expect(canSplit(split)).toBe(false)
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
    expect(game.hands).toHaveLength(0)
    expect(totalStaked(game)).toBe(0)
  })
})
