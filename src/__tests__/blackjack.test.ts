import { describe, expect, it } from 'vitest'
import {
  act,
  canDouble,
  canSplit,
  createGame,
  createGameFromShoe,
  createShoe,
  canInsure,
  handValue,
  handsOf,
  maxInsurance,
  placeBet,
  actAs,
  placeBets,
  startNextRound,
  takeInsurance,
  totalPaid,
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

/**
 * Builds a shoe for a table of several seats.
 *
 * Deal order runs across the seats and then the dealer, twice, so each seat's
 * two cards are a whole pass apart in the shoe. Written out per seat here
 * because a stacked shoe that has to be interleaved by hand is unreadable, and
 * an unreadable stacked shoe is a test asserting the wrong thing.
 */
function stackedTableShoe(
  seats: readonly (readonly [Card, Card])[],
  dealer: readonly [Card, Card],
  rest: readonly Card[] = [],
): Card[] {
  return [
    ...seats.map((seat) => seat[0]),
    dealer[0],
    ...seats.map((seat) => seat[1]),
    dealer[1],
    ...rest,
  ]
}

/** Reads a seat's hand by index, failing loudly rather than returning undefined. */
function handAt(state: GameState, index: number, seatIndex = 0): Hand {
  const hand = handsOf(state, seatIndex)[index]
  if (!hand) throw new Error(`Expected a hand at index ${index} of seat ${seatIndex}`)
  return hand
}

/** Which hand a seat is acting on. */
function activeHandIndexAt(state: GameState, seatIndex = 0): number {
  const seat = state.seats[seatIndex]
  if (!seat) throw new Error(`Expected a seat at index ${seatIndex}`)
  return seat.activeHandIndex
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
  // The spec says the dealer hits soft 17. Standing on it — which is what a
  // plain `total < 17` test does — shifts the house edge and silently plays a
  // different game from the one the rules describe.
  it('hits soft 17 rather than standing', () => {
    // Six up, ace in the hole: the same soft 17, dealt in the order that does
    // not open an insurance window in a test about drawing.
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)], // Player 18
      [card(Rank.Six), card(Rank.Ace)], // Dealer soft 17
      [card(Rank.Ten, Suit.Hearts)], // The soft 17 draws, and hardens to 17.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(3)
    expect(handValue(settled.dealerHand)).toEqual({ total: 17, isSoft: false })
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerWin)
  })

  // The boundary the rule turns on: hard 17 stands even though soft 17 hits.
  // Hitting both would bust the dealer far too often and pay hands that lost.
  it('stands on hard 17', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)], // Player 18
      [card(Rank.Ten, Suit.Hearts), card(Rank.Seven)], // Dealer hard 17
      [card(Rank.Four)], // Would be drawn only if the dealer wrongly hit.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(2)
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerWin)
  })

  // Soft 18 stands: the hit-soft-17 rule reaches exactly one total and no
  // further, or the dealer draws on hands the rules say are made.
  it('stands on soft 18', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Nine)], // Player 19
      [card(Rank.Seven), card(Rank.Ace)], // Dealer soft 18
      [card(Rank.Five)], // Would be drawn only on a wrongly hit soft 18.
    )

    const settled = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Stand)

    expect(settled.dealerHand).toHaveLength(2)
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
    expect(totalPaid(settled)).toBe(25)
  })

  // Two naturals is a push, not a player win. Players notice immediately when a
  // tied blackjack pays out.
  it('pushes when player and dealer both have naturals', () => {
    // Queen up, ace in the hole, so the peek settles it at the deal — the
    // ace-up version of this push goes through the insurance window instead,
    // and has its own test there.
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.King)],
      [card(Rank.Queen), card(Rank.Ace, Suit.Hearts)],
    )

    const settled = placeBet(createGameFromShoe(shoe), 10)

    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.Push)
    expect(totalPaid(settled)).toBe(10) // Stake refunded, nothing won.
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
    expect(totalPaid(settled)).toBe(0)
    expect(settled.dealerHand).toHaveLength(2)
  })
})

/*
 * Money on this table has to land on whole dollars, because there is no
 * half-dollar chip to put on the felt for the remainder. 3:2 held as the
 * decimal 2.5 divides evenly for the three stakes currently offered and stops
 * doing so the moment a fourth is added, which is the same shape as the 6:5
 * bug that paid 22.000000000000004.
 */
describe('payout arithmetic', () => {
  it('pays a whole number of dollars on a natural, at every stake', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace), card(Rank.King)],
      [card(Rank.Nine), card(Rank.Six)],
    )

    for (let bet = 1; bet <= 200; bet++) {
      const { payout } = handAt(placeBet(createGameFromShoe(shoe), bet), 0)

      expect(Number.isInteger(payout)).toBe(true)
      // The stake always comes back whole; only the winnings round, and they
      // round the house's way.
      expect(payout).toBe(bet + Math.floor((bet * 3) / 2))
    }
  })

  it('pays a whole number of dollars on every ordinary outcome', () => {
    // Player 20 against a dealer 19: an even-money win, doubled and split too.
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Ten, Suit.Hearts)],
      [card(Rank.Ten, Suit.Clubs), card(Rank.Nine)],
      [card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Clubs)],
    )

    for (const bet of [1, 3, 5, 7, 25, 33, 99]) {
      const settled = act(placeBet(createGameFromShoe(shoe), bet), PlayerAction.Stand)

      expect(Number.isInteger(totalPaid(settled))).toBe(true)
      expect(totalPaid(settled)).toBe(bet * 2)
    }
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
    expect(totalPaid(settled)).toBe(40) // Doubled stake returned twice over.
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

    expect(handsOf(split)).toHaveLength(2)
    expect(totalStaked(split)).toBe(20)
    expect(handAt(split, 0).cards).toHaveLength(2)
    expect(handAt(split, 1).cards).toHaveLength(2)
    expect(activeHandIndexAt(split)).toBe(0)
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
    expect(activeHandIndexAt(afterBust)).toBe(1)

    const settled = act(afterBust, PlayerAction.Stand)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 1).outcome).toBe(RoundOutcome.PlayerWin)
    // Only the surviving hand pays; the busted one returns nothing.
    expect(totalPaid(settled)).toBe(20)
  })

  /*
   * Resplitting, which the table refused outright for a long time: a player
   * dealt 8,8, splitting, and catching a third eight was told no. It is the
   * single most standard resplit in the game and the reason this block exists.
   */

  // Splitting the pair that a split just dealt. Without this the player is
  // stuck playing a hard 16 they were entitled to break up.
  it('splits a pair dealt onto a split hand', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)], // Dealer 16, must draw.
      [
        card(Rank.Eight, Suit.Clubs), // Hand one -> 8,8 again.
        card(Rank.Three), // Hand two -> 8,3.
        card(Rank.Two), // Resplit: hand one -> 8,2.
        card(Rank.Ten, Suit.Hearts), // Resplit: hand two -> 8,10.
        card(Rank.Ten, Suit.Diamonds), // Dealer draws to 26, bust.
      ],
    )

    const split = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)
    expect(canSplit(split)).toBe(true)

    const resplit = act(split, PlayerAction.Split)

    expect(handsOf(resplit)).toHaveLength(3)
    expect(totalStaked(resplit)).toBe(30)
    expect(activeHandIndexAt(resplit)).toBe(0)

    // The hand that was not being split must come through untouched. Rebuilding
    // the hand list from the split instead of splicing into it destroyed it.
    expect(handAt(resplit, 2).cards.map((c) => c.rank)).toEqual([Rank.Eight, Rank.Three])

    const settled = [PlayerAction.Stand, PlayerAction.Stand, PlayerAction.Stand].reduce(
      act,
      resplit,
    )

    expect(settled.phase).toBe(RoundPhase.Settled)
    // Three hands, three dealer busts, even money on each.
    expect(totalPaid(settled)).toBe(60)
  })

  // Splitting a hand that is not the first one. This is where rebuilding the
  // hand list sent the player back to a hand they had already stood on, and
  // silently discarded the result of it.
  it('splits the second hand without disturbing the first', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)],
      [
        card(Rank.Ten, Suit.Diamonds), // Hand one -> 18, stood on.
        card(Rank.Eight, Suit.Clubs), // Hand two -> 8,8, splittable.
        card(Rank.Nine), // Resplit: hand two -> 17.
        card(Rank.Two), // Resplit: hand three -> 10.
      ],
    )

    const split = act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split)
    const onSecond = act(split, PlayerAction.Stand)

    expect(activeHandIndexAt(onSecond)).toBe(1)
    expect(canSplit(onSecond)).toBe(true)

    const resplit = act(onSecond, PlayerAction.Split)

    expect(handsOf(resplit)).toHaveLength(3)
    // The stood-on hand keeps its cards and stays finished.
    expect(handAt(resplit, 0).cards.map((c) => c.rank)).toEqual([Rank.Eight, Rank.Ten])
    expect(handAt(resplit, 0).isFinished).toBe(true)
    // And play resumes on the split, not back at the top of the list.
    expect(activeHandIndexAt(resplit)).toBe(1)
  })

  // Three hands, not four: the fourth betting spot lands on the player's stash.
  // The cap has to hold somewhere or `handAnchorX` starts stacking chips.
  it('refuses a third split', () => {
    const shoe = stackedShoe(
      [card(Rank.Eight), card(Rank.Eight, Suit.Hearts)],
      [card(Rank.Ten), card(Rank.Six)],
      [
        card(Rank.Eight, Suit.Clubs),
        card(Rank.Three),
        card(Rank.Eight, Suit.Diamonds), // A fourth eight, and still no split.
        card(Rank.Ten, Suit.Hearts),
      ],
    )

    const resplit = act(act(placeBet(createGameFromShoe(shoe), 10), PlayerAction.Split), PlayerAction.Split)

    expect(handsOf(resplit)).toHaveLength(3)
    expect(handValue(handAt(resplit, 0).cards).total).toBe(16) // 8,8 — a pair.
    expect(canSplit(resplit)).toBe(false)
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
    expect(handsOf(game)).toHaveLength(0)
    expect(totalStaked(game)).toBe(0)
  })
})

/*
 * Nothing below is reachable from the game yet — one player sits at the table
 * and every test above it is the one-seat case. They are here because the shoe
 * is the thing several players have to share and the thing no screenshot can
 * check: a table dealing two players the same card, or paying one seat out of
 * another's stake, renders exactly like a table doing it right.
 */
describe('seats', () => {
  // The whole reason the table holds seats rather than a hand list. If two
  // seats drew from the same index, two players would be dealt the same card
  // and each would see a different table.
  it('deals every seat its own cards from the one shoe', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.Eight, Suit.Spades)], // Seat one, 18.
        [card(Rank.Nine, Suit.Hearts), card(Rank.Two, Suit.Hearts)], // Seat two, 11.
      ],
      [card(Rank.Ten, Suit.Diamonds), card(Rank.Seven, Suit.Diamonds)], // Dealer 17.
    )

    const dealt = placeBets(createGameFromShoe(shoe, 2), [10, 25])

    expect(handAt(dealt, 0, 0).cards).toEqual([
      card(Rank.Ten, Suit.Spades),
      card(Rank.Eight, Suit.Spades),
    ])
    expect(handAt(dealt, 0, 1).cards).toEqual([
      card(Rank.Nine, Suit.Hearts),
      card(Rank.Two, Suit.Hearts),
    ])
    // Six cards off the shoe and no card dealt twice: two seats, two rounds of
    // the table, plus the dealer's two.
    expect(dealt.shoeIndex).toBe(6)
    expect(new Set(shoe.slice(0, 6).map((c) => `${c.rank}${c.suit}`)).size).toBe(6)
  })

  // Each seat carries its own wager. Reading the table's total staked as one
  // seat's would charge a player for a hand somebody else is holding.
  it('stakes each seat separately', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.Eight, Suit.Spades)],
        [card(Rank.Nine, Suit.Hearts), card(Rank.Two, Suit.Hearts)],
      ],
      [card(Rank.Ten, Suit.Diamonds), card(Rank.Seven, Suit.Diamonds)],
    )

    const dealt = placeBets(createGameFromShoe(shoe, 2), [10, 25])

    expect(totalStaked(dealt, 0)).toBe(10)
    expect(totalStaked(dealt, 1)).toBe(25)
  })

  // Splitting grows one seat's hand list. Splicing into the table's would put
  // the extra hand in front of whoever happened to sit next, and would move the
  // hand indices out from under every seat after it.
  it('splits one seat without disturbing the next', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Eight, Suit.Spades), card(Rank.Eight, Suit.Hearts)], // Seat one splits.
        [card(Rank.Ten, Suit.Diamonds), card(Rank.Nine, Suit.Diamonds)], // Seat two, 19.
      ],
      [card(Rank.Ten, Suit.Clubs), card(Rank.Seven, Suit.Clubs)], // Dealer 17, stands.
      [card(Rank.Three), card(Rank.Four)], // The two cards the split draws.
    )

    const split = act(placeBets(createGameFromShoe(shoe, 2), [10, 25]), PlayerAction.Split)

    expect(handsOf(split, 0)).toHaveLength(2)
    expect(totalStaked(split, 0)).toBe(20)

    // Seat two is untouched: one hand, the cards it was dealt, its own stake.
    expect(handsOf(split, 1)).toHaveLength(1)
    expect(handAt(split, 0, 1).cards).toEqual([
      card(Rank.Ten, Suit.Diamonds),
      card(Rank.Nine, Suit.Diamonds),
    ])
    expect(totalStaked(split, 1)).toBe(25)

    // And the split did not hand the turn over, either.
    expect(split.activeSeatIndex).toBe(0)
  })

  // Turn order is the engine's to keep. A seat acting early takes the card off
  // the shoe that belongs to the seat before it, which is a card two players
  // have now both been promised.
  it('passes the turn along only once a seat has finished', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.Eight, Suit.Spades)], // Seat one, 18.
        [card(Rank.Nine, Suit.Hearts), card(Rank.Two, Suit.Hearts)], // Seat two, 11.
      ],
      [card(Rank.Ten, Suit.Diamonds), card(Rank.Seven, Suit.Diamonds)], // Dealer 17.
      [card(Rank.Five, Suit.Clubs)], // Seat two hits to 16.
    )

    const dealt = placeBets(createGameFromShoe(shoe, 2), [10, 25])
    expect(dealt.activeSeatIndex).toBe(0)

    const passed = act(dealt, PlayerAction.Stand)
    expect(passed.activeSeatIndex).toBe(1)

    // The action lands on the seat whose turn it is, not on the first seat.
    const hit = act(passed, PlayerAction.Hit)
    expect(handAt(hit, 0, 1).cards).toHaveLength(3)
    expect(handAt(hit, 0, 0).cards).toHaveLength(2)
  })

  // Money is settled per seat. Summing the table's payouts into one figure is
  // how a losing player gets paid out of the winner's stake.
  it('settles each seat against the dealer on its own', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.King, Suit.Spades)], // Seat one, 20 — beats 18.
        [card(Rank.Ten, Suit.Hearts), card(Rank.Five, Suit.Hearts)], // Seat two, 15 — loses.
      ],
      [card(Rank.Ten, Suit.Diamonds), card(Rank.Eight, Suit.Diamonds)], // Dealer 18, stands.
    )

    const dealt = placeBets(createGameFromShoe(shoe, 2), [10, 25])
    const settled = act(act(dealt, PlayerAction.Stand), PlayerAction.Stand)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 0, 0).outcome).toBe(RoundOutcome.PlayerWin)
    expect(handAt(settled, 0, 1).outcome).toBe(RoundOutcome.DealerWin)
    expect(totalPaid(settled, 0)).toBe(20) // Stake back, even money on it.
    expect(totalPaid(settled, 1)).toBe(0) // And nothing of it goes to seat two.
  })

  // A natural is settled where it is dealt, and the table plays on. Ending the
  // round on it — which is exactly what one seat does — would take the other
  // players' hands away before they had a decision.
  it('lets the table play on when one seat is dealt a natural', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ace, Suit.Spades), card(Rank.King, Suit.Spades)], // Seat one, natural.
        [card(Rank.Ten, Suit.Hearts), card(Rank.Six, Suit.Hearts)], // Seat two, 16.
      ],
      [card(Rank.Nine, Suit.Clubs), card(Rank.Seven, Suit.Clubs)], // Dealer 16, must draw.
      [card(Rank.Five, Suit.Diamonds)], // Dealer draws to 21.
    )

    const dealt = placeBets(createGameFromShoe(shoe, 2), [10, 25])

    expect(dealt.phase).toBe(RoundPhase.PlayerTurn)
    expect(dealt.activeSeatIndex).toBe(1) // Straight past the seat with nothing to decide.
    expect(handAt(dealt, 0, 0).outcome).toBe(RoundOutcome.PlayerBlackjack)

    const settled = act(dealt, PlayerAction.Stand)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(settled.dealerHand).toHaveLength(3)
    expect(totalPaid(settled, 0)).toBe(25) // 3:2 on 10, stake included.
    expect(totalPaid(settled, 1)).toBe(0)
  })

  // A dealer natural takes every seat at once and buys the dealer no cards.
  it('settles the whole table on a dealer natural', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.Six, Suit.Spades)],
        [card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Clubs)],
      ],
      // King up, ace in the hole: an ace up would open the insurance window,
      // which is not what this test is about.
      [card(Rank.King, Suit.Diamonds), card(Rank.Ace, Suit.Diamonds)],
    )

    const settled = placeBets(createGameFromShoe(shoe, 2), [10, 25])

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 0, 0).outcome).toBe(RoundOutcome.DealerWin)
    expect(handAt(settled, 0, 1).outcome).toBe(RoundOutcome.DealerWin)
    expect(settled.shoeIndex).toBe(6) // The dealer never drew.
  })

  // A seat index has to mean the same player next round, so the table clears
  // its seats rather than rebuilding them. Rebuilding from the wagers would
  // reseat everybody the moment one player sat a round out.
  it('keeps its seats between rounds', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.King, Suit.Spades)],
        [card(Rank.Ten, Suit.Hearts), card(Rank.Five, Suit.Hearts)],
      ],
      [card(Rank.Ten, Suit.Diamonds), card(Rank.Eight, Suit.Diamonds)],
    )

    const settled = act(
      act(placeBets(createGameFromShoe(shoe, 2), [10, 25]), PlayerAction.Stand),
      PlayerAction.Stand,
    )
    const next = startNextRound(settled, 1)

    expect(next.seats).toHaveLength(2)
    expect(handsOf(next, 0)).toHaveLength(0)
    expect(handsOf(next, 1)).toHaveLength(0)
    expect(totalPaid(next, 0)).toBe(0)
  })

  // Refusing the ambiguous call rather than guessing. `placeBet` naming one
  // amount at a table of five would either bet for everyone or deal four
  // players in for nothing, and both are worse than an error.
  it('refuses a wager that does not say what every seat is betting', () => {
    const table = createGameFromShoe(createShoe(7), 2)

    expect(() => placeBet(table, 10)).toThrow(/one-seat table/)
    expect(() => placeBets(table, [10])).toThrow(/Expected 2 wagers/)
  })
})

describe('turn order', () => {
  // Casino blackjack is one player at a time, first base to third base. A
  // client whose turn it is not could otherwise call `act` and play the
  // active seat's hand from three places away — the hand is not theirs, and
  // the card it draws comes off a shoe everybody shares.
  it('refuses a seat that is not the one acting', () => {
    const state = placeBets(createGame(7, 3), [25, 25, 25])
    expect(state.activeSeatIndex).toBe(0)

    expect(() => actAs(state, 1, PlayerAction.Hit)).toThrow(/seat 0/)
    expect(() => actAs(state, 2, PlayerAction.Stand)).toThrow(/seat 0/)
    expect(() => actAs(state, 0, PlayerAction.Stand)).not.toThrow()
  })

  // The turn moves on only when a seat has no hand left awaiting a decision,
  // which is what makes a split whole: you finish both halves before the next
  // player is dealt to, exactly as at a real table.
  it('passes to the next seat in order, once the seat before it is done', () => {
    let state = placeBets(createGame(7, 3), [25, 25, 25])

    state = actAs(state, 0, PlayerAction.Stand)
    expect(state.activeSeatIndex).toBe(1)
    expect(() => actAs(state, 0, PlayerAction.Hit)).toThrow()

    state = actAs(state, 1, PlayerAction.Stand)
    expect(state.activeSeatIndex).toBe(2)
  })
})

describe('insurance', () => {
  /** An ace-up deal for one seat: player 16 against a dealer natural. */
  function aceUpWithNatural(bet = 10) {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Six)], // Player 16
      [card(Rank.Ace), card(Rank.King)], // Ace up, ten in the hole: a natural.
    )
    return placeBets(createGameFromShoe(shoe), [bet])
  }

  /** An ace-up deal for one seat where the hole card is a brick. */
  function aceUpNoNatural(player: readonly [Rank, Rank] = [Rank.Ten, Rank.Eight]) {
    const shoe = stackedShoe(
      [card(player[0]), card(player[1], Suit.Hearts)],
      [card(Rank.Ace), card(Rank.Nine)], // Ace up, no natural underneath.
    )
    return placeBets(createGameFromShoe(shoe), [10])
  }

  // The window is the feature: an ace up must pause the round for a decision.
  // Without it the felt advertises a bet the game never offers.
  it('opens an insurance window on an ace upcard, before anything settles', () => {
    const offered = aceUpWithNatural()

    expect(offered.phase).toBe(RoundPhase.Insurance)
    expect(canInsure(offered, 0)).toBe(true)
    expect(maxInsurance(offered, 0)).toBe(5)
    // The dealer has not peeked: nothing is settled while the window is open.
    expect(handAt(offered, 0).outcome).toBeNull()
    // And nobody can play a hand through it.
    expect(() => act(offered, PlayerAction.Hit)).toThrow(/insurance/)
  })

  // A ten upcard peeks immediately and offers nothing, exactly as before
  // insurance existed — the window is the ace's alone.
  it('does not offer insurance on a ten-value upcard', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Six)],
      [card(Rank.King), card(Rank.Ace)], // Dealer natural, ten showing.
    )

    const settled = placeBets(createGameFromShoe(shoe), [10])

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(canInsure(settled, 0)).toBe(false)
  })

  // The issue's own acceptance test: insurance is a side bet sized so that a
  // dealer natural against a fully insured hand is a wash.
  it('nets exactly zero when a fully insured hand loses to a dealer natural', () => {
    const settled = takeInsurance(aceUpWithNatural(10), 0, 5)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.DealerWin)
    // The hand lost 10; the 5 of insurance came back as 15. Stakes were
    // 10 + 5, chips returned 15: the round moved nothing.
    expect(totalPaid(settled)).toBe(15)
    expect(totalStaked(settled)).toBe(15)
    expect(settled.dealerHand).toHaveLength(2) // A natural buys no cards.
  })

  it('loses only the stake when insurance is declined against a natural', () => {
    const settled = takeInsurance(aceUpWithNatural(10), 0, 0)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(totalPaid(settled)).toBe(0)
    expect(totalStaked(settled)).toBe(10)
  })

  // The premium is simply lost when the hole card is a brick — and the round
  // then plays out exactly as if the window had never opened.
  it('forfeits the premium and plays on when the dealer has no natural', () => {
    // Player 20 against ace-nine: the dealer's soft 20 pushes the hand, so
    // the round's whole cost is the premium — the assertable difference
    // between "insurance lost" and "insurance never happened".
    const opened = takeInsurance(aceUpNoNatural([Rank.Ten, Rank.Ten]), 0, 5)

    expect(opened.phase).toBe(RoundPhase.PlayerTurn)

    const settled = act(opened, PlayerAction.Stand)

    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.Push)
    expect(totalPaid(settled)).toBe(10) // The stake back, the premium gone.
    expect(totalStaked(settled)).toBe(15)
  })

  // A player natural waits out the window like everyone else, then pays 3:2 —
  // settling it at the deal would sell insurance after the peek.
  it('holds a player natural through the window and then pays it 3:2', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace, Suit.Hearts), card(Rank.King, Suit.Hearts)], // Player natural
      [card(Rank.Ace), card(Rank.Nine)], // Ace up, no natural.
    )
    const offered = placeBets(createGameFromShoe(shoe), [10])

    expect(offered.phase).toBe(RoundPhase.Insurance)
    expect(handAt(offered, 0).outcome).toBeNull()

    const settled = takeInsurance(offered, 0, 0)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.PlayerBlackjack)
    expect(totalPaid(settled)).toBe(25)
  })

  // Insured naturals against a dealer natural: the hand pushes and the
  // insurance pays, which is where "even money" actually comes from.
  it('pushes an insured natural against a dealer natural and pays the insurance', () => {
    const shoe = stackedShoe(
      [card(Rank.Ace, Suit.Hearts), card(Rank.King, Suit.Hearts)],
      [card(Rank.Ace), card(Rank.Queen)],
    )
    const settled = takeInsurance(placeBets(createGameFromShoe(shoe), [10]), 0, 5)

    expect(handAt(settled, 0).outcome).toBe(RoundOutcome.Push)
    expect(totalPaid(settled)).toBe(25) // Stake refunded, 15 for the insurance.
    expect(totalStaked(settled)).toBe(15)
  })

  // The whole-dollar rule, applied to the offer itself: at every stake the
  // cap is a whole amount and both outcomes pay whole dollars.
  it('offers and pays whole dollars at every stake', () => {
    for (let bet = 2; bet <= 200; bet++) {
      const offered = aceUpWithNatural(bet)
      const cap = maxInsurance(offered, 0)

      expect(Number.isInteger(cap)).toBe(true)
      expect(cap).toBe(Math.floor(bet / 2))

      const settled = takeInsurance(offered, 0, cap)
      const insurancePaid = totalPaid(settled) // The hand itself pays 0 here.

      expect(Number.isInteger(insurancePaid)).toBe(true)
      expect(insurancePaid).toBe(cap * 3) // Stake back plus 2:1, in integers.
    }
  })

  // A $1 stake cannot buy a whole dollar of insurance, so the seat is
  // declined for it — a window waiting on a decision with no possible yes
  // would stall a shared table forever.
  it('declines for a seat whose stake is too small to insure', () => {
    const shoe = stackedShoe(
      [card(Rank.Ten), card(Rank.Eight)],
      [card(Rank.Ace), card(Rank.Nine)],
    )

    const dealt = placeBets(createGameFromShoe(shoe), [1])

    // Straight past the window: the only seat had no decision to make.
    expect(dealt.phase).toBe(RoundPhase.PlayerTurn)
    expect(canInsure(dealt, 0)).toBe(false)
  })

  it('refuses a second decision, an oversized premium, and fractional dollars', () => {
    const offered = aceUpWithNatural(10)

    expect(() => takeInsurance(offered, 0, 6)).toThrow(/between 0 and 5/)
    expect(() => takeInsurance(offered, 0, 2.5)).toThrow(/whole dollars/)
    expect(() => takeInsurance(offered, 0, -1)).toThrow(/whole dollars/)

    const decided = takeInsurance(aceUpNoNatural(), 0, 5)
    expect(() => takeInsurance(decided, 0, 0)).toThrow()
  })

  // The window is the deal window's shape: it waits for every seat and closes
  // on the last decision, whichever seat that happens to be.
  it('waits for every seat and closes on the last decision', () => {
    const shoe = stackedTableShoe(
      [
        [card(Rank.Ten, Suit.Spades), card(Rank.Six, Suit.Spades)],
        [card(Rank.Nine, Suit.Hearts), card(Rank.Nine, Suit.Clubs)],
      ],
      [card(Rank.Ace, Suit.Diamonds), card(Rank.King, Suit.Diamonds)], // Natural under the ace.
    )
    const offered = placeBets(createGameFromShoe(shoe, 2), [10, 25])

    expect(offered.phase).toBe(RoundPhase.Insurance)

    // Seat two answers first: order is arrival, not position.
    const oneDecided = takeInsurance(offered, 1, 12)

    expect(oneDecided.phase).toBe(RoundPhase.Insurance)
    expect(canInsure(oneDecided, 1)).toBe(false)
    expect(canInsure(oneDecided, 0)).toBe(true)

    const settled = takeInsurance(oneDecided, 0, 0)

    expect(settled.phase).toBe(RoundPhase.Settled)
    expect(totalPaid(settled, 0)).toBe(0) // Uninsured: the stake is gone.
    expect(totalPaid(settled, 1)).toBe(36) // 12 back plus 2:1 on it.
    expect(totalStaked(settled, 1)).toBe(37)
  })
})
