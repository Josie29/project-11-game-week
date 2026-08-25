import { createRng, shuffle } from '../rng'
import {
  type Card,
  type GameState,
  type Hand,
  type HandValue,
  PlayerAction,
  Rank,
  RoundOutcome,
  RoundPhase,
  Suit,
} from './types'

/** Number of 52-card decks in the shoe. */
export const DECK_COUNT = 6

/** Reshuffle once this fraction of the shoe has been dealt. */
const PENETRATION = 0.75

/** Dealer draws until reaching this total, standing on soft 17. */
const DEALER_STANDS_AT = 17

const BLACKJACK = 21

/**
 * Natural blackjack pays 3:2, held as numerator and denominator.
 *
 * Never as the decimal 2.5. The same shortcut on 6:5 shipped a payout of
 * `22.000000000000004`, and a ratio that only happens to divide evenly for the
 * stakes currently on offer is one denomination away from doing it again.
 */
const BLACKJACK_ODDS = { numerator: 3, denominator: 2 } as const

/**
 * Chips returned on a natural: the stake back plus 3:2 on it.
 *
 * Floors the winnings rather than the whole return, so the stake always comes
 * back whole. The house rounds down, which is what a real table does with a
 * half-dollar it has no chip for.
 */
function blackjackPayout(bet: number): number {
  return bet + Math.floor((bet * BLACKJACK_ODDS.numerator) / BLACKJACK_ODDS.denominator)
}

/**
 * Hands a player may hold at once, so the pair split off a split hand can be
 * split again.
 *
 * Three, not the four some houses allow, and the limit is the felt rather than
 * the rules: `handAnchorX` has to keep every hand's chips on the table and
 * clear of the player's stash, and a fourth betting spot lands on top of it.
 */
export const MAX_HANDS = 3

/**
 * Returns the base point value of a rank, counting aces high.
 *
 * Aces are demoted from 11 to 1 by `handValue` when a hand would otherwise bust.
 */
function rankValue(rank: Rank): number {
  switch (rank) {
    case Rank.Ace:
      return 11
    case Rank.Ten:
    case Rank.Jack:
    case Rank.Queen:
    case Rank.King:
      return 10
    default:
      return Number(rank)
  }
}

/**
 * Scores a hand, demoting aces from 11 to 1 only as far as needed.
 *
 * Counting every ace as 11 up front and then subtracting 10 per ace while the
 * total is bust is what makes multi-ace hands score correctly: A,A,9 totals 21
 * rather than 31 or 11.
 *
 * @param cards Cards to score.
 * @returns The best total not exceeding 21 where possible, and whether an ace
 *   is still counted as 11.
 */
export function handValue(cards: readonly Card[]): HandValue {
  let total = 0
  let acesCountedHigh = 0

  for (const card of cards) {
    total += rankValue(card.rank)
    if (card.rank === Rank.Ace) acesCountedHigh++
  }

  while (total > BLACKJACK && acesCountedHigh > 0) {
    total -= 10 // Demote one ace from 11 to 1.
    acesCountedHigh--
  }

  return { total, isSoft: acesCountedHigh > 0 }
}

/** Returns true when a hand is a natural: exactly two cards totalling 21. */
export function isNaturalBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === BLACKJACK
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > BLACKJACK
}

/** Total currently staked across every hand. */
export function totalStaked(state: GameState): number {
  return state.hands.reduce((sum, hand) => sum + hand.bet, 0)
}

/** The hand the player is acting on, or undefined once the round is over. */
export function activeHand(state: GameState): Hand | undefined {
  return state.hands[state.activeHandIndex]
}

/** Builds an ordered, unshuffled shoe of `deckCount` standard decks. */
function buildOrderedShoe(deckCount: number): Card[] {
  const cards: Card[] = []

  for (let deck = 0; deck < deckCount; deck++) {
    for (const suit of Object.values(Suit)) {
      for (const rank of Object.values(Rank)) {
        cards.push({ suit, rank })
      }
    }
  }

  return cards
}

/**
 * Builds a shuffled shoe.
 *
 * @param seed Seed for the shuffle. The same seed always produces the same shoe.
 * @param deckCount Number of decks. Defaults to `DECK_COUNT`.
 */
export function createShoe(seed: number, deckCount: number = DECK_COUNT): Card[] {
  return shuffle(buildOrderedShoe(deckCount), createRng(seed))
}

/**
 * Draws one card from the shoe.
 *
 * @throws {RangeError} If the shoe has been dealt past its end. Callers reshuffle
 *   at `PENETRATION`, so this indicates a bug rather than normal play.
 */
function draw(
  shoe: readonly Card[],
  index: number,
): { readonly card: Card; readonly nextIndex: number } {
  const card = shoe[index]
  if (card === undefined) {
    throw new RangeError(`Shoe exhausted: tried to draw index ${index} of ${shoe.length}`)
  }
  return { card, nextIndex: index + 1 }
}

/** Creates a fresh game with a shuffled shoe, ready to accept a wager. */
export function createGame(seed: number): GameState {
  return createGameFromShoe(createShoe(seed))
}

/**
 * Creates a game from an explicit shoe.
 *
 * Exposed so tests can stack known cards instead of hunting for a seed that
 * produces a particular hand. Deal order is player, dealer, player, dealer — so
 * `shoe[0]` and `shoe[2]` reach the player and `shoe[1]` and `shoe[3]` the dealer.
 */
export function createGameFromShoe(shoe: readonly Card[]): GameState {
  return {
    phase: RoundPhase.Betting,
    shoe,
    shoeIndex: 0,
    hands: [],
    activeHandIndex: 0,
    dealerHand: [],
    totalPayout: 0,
  }
}

/** Returns a copy of `state` with one hand replaced. */
function withHand(state: GameState, index: number, hand: Hand): GameState {
  return { ...state, hands: state.hands.map((existing, i) => (i === index ? hand : existing)) }
}

/** Marks a hand done, optionally with a known result. */
function finishHand(hand: Hand, outcome: RoundOutcome | null, payout: number): Hand {
  return { ...hand, outcome, payout, isFinished: true }
}

/** Closes the round, summing what every hand returned. */
function settleRound(state: GameState): GameState {
  return {
    ...state,
    phase: RoundPhase.Settled,
    totalPayout: state.hands.reduce((sum, hand) => sum + hand.payout, 0),
  }
}

/**
 * Places a wager and deals the opening four cards.
 *
 * If either side has a natural the round settles immediately without a player
 * turn, which is why the returned phase may already be `Settled`.
 *
 * @param state Game in `RoundPhase.Betting`.
 * @param amount Wager in chips. Must be positive.
 * @throws {Error} If the game is not awaiting a bet or the amount is not positive.
 */
export function placeBet(state: GameState, amount: number): GameState {
  if (state.phase !== RoundPhase.Betting) {
    throw new Error(`Cannot bet during phase "${state.phase}"`)
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Bet must be a positive number, received ${amount}`)
  }

  let index = state.shoeIndex
  const playerCards: Card[] = []
  const dealerHand: Card[] = []

  // Standard deal order: player, dealer, player, dealer.
  for (let i = 0; i < 2; i++) {
    const toPlayer = draw(state.shoe, index)
    playerCards.push(toPlayer.card)
    index = toPlayer.nextIndex

    const toDealer = draw(state.shoe, index)
    dealerHand.push(toDealer.card)
    index = toDealer.nextIndex
  }

  const hand: Hand = {
    cards: playerCards,
    bet: amount,
    outcome: null,
    payout: 0,
    fromSplit: false,
    isFinished: false,
  }

  const dealt: GameState = {
    ...state,
    phase: RoundPhase.PlayerTurn,
    shoeIndex: index,
    hands: [hand],
    activeHandIndex: 0,
    dealerHand,
    totalPayout: 0,
  }

  const playerNatural = isNaturalBlackjack(playerCards)
  const dealerNatural = isNaturalBlackjack(dealerHand)

  if (playerNatural && dealerNatural) {
    return settleRound(withHand(dealt, 0, finishHand(hand, RoundOutcome.Push, amount)))
  }
  if (playerNatural) {
    return settleRound(
      withHand(
        dealt,
        0,
        finishHand(hand, RoundOutcome.PlayerBlackjack, blackjackPayout(amount)),
      ),
    )
  }
  if (dealerNatural) {
    return settleRound(withHand(dealt, 0, finishHand(hand, RoundOutcome.DealerWin, 0)))
  }

  return dealt
}

/**
 * Plays out the dealer hand and scores every hand still in contention.
 *
 * The dealer draws while below 17 and stands on soft 17 — because `handValue`
 * already returns the best total, a plain `total < 17` test yields
 * stand-on-soft-17. If every player hand has already busted the dealer does not
 * draw at all; there is nothing left to beat.
 */
function resolveDealer(state: GameState): GameState {
  const contested = state.hands.some((hand) => hand.outcome === null)
  if (!contested) return settleRound(state)

  const dealerHand = [...state.dealerHand]
  let index = state.shoeIndex

  while (handValue(dealerHand).total < DEALER_STANDS_AT) {
    const { card, nextIndex } = draw(state.shoe, index)
    dealerHand.push(card)
    index = nextIndex
  }

  const dealerTotal = handValue(dealerHand).total
  const dealerBusted = dealerTotal > BLACKJACK

  const hands = state.hands.map((hand) => {
    if (hand.outcome !== null) return hand // Already busted or settled on the deal.

    const playerTotal = handValue(hand.cards).total

    if (dealerBusted) return finishHand(hand, RoundOutcome.DealerBust, hand.bet * 2)
    if (playerTotal > dealerTotal) return finishHand(hand, RoundOutcome.PlayerWin, hand.bet * 2)
    if (playerTotal < dealerTotal) return finishHand(hand, RoundOutcome.DealerWin, 0)
    return finishHand(hand, RoundOutcome.Push, hand.bet)
  })

  return settleRound({ ...state, hands, dealerHand, shoeIndex: index })
}

/**
 * Moves to the next hand awaiting a decision, or hands over to the dealer.
 */
function advanceOrResolve(state: GameState): GameState {
  const nextIndex = state.hands.findIndex((hand) => !hand.isFinished)
  if (nextIndex === -1) return resolveDealer(state)
  return { ...state, activeHandIndex: nextIndex }
}

/** Returns true when the player may double the active hand. */
export function canDouble(state: GameState): boolean {
  const hand = activeHand(state)
  return state.phase === RoundPhase.PlayerTurn && hand !== undefined && hand.cards.length === 2
}

/**
 * Returns true when the active hand may be split.
 *
 * Requires an equal *rank* pair, not merely an equal value — a King and a Queen
 * are both worth ten but are not a pair, and treating them as one surprises
 * anyone who knows the game.
 */
export function canSplit(state: GameState): boolean {
  const hand = activeHand(state)
  if (state.phase !== RoundPhase.PlayerTurn || hand === undefined) return false
  if (state.hands.length >= MAX_HANDS) return false
  if (hand.cards.length !== 2) return false

  const [first, second] = hand.cards
  return first !== undefined && second !== undefined && first.rank === second.rank
}

/**
 * Splits the active hand into two, dealing one card onto each.
 *
 * The two new hands replace the split hand *in place* rather than becoming the
 * whole hand list, which is what lets a resplit work: splitting the pair sitting
 * at index 1 must leave the finished hand at index 0 alone. Rebuilding the list
 * from scratch also reset `activeHandIndex` to 0, sending the player back to a
 * hand they had already stood on.
 *
 * Split aces receive exactly one card each and then stand, which is the
 * standard restriction; without it a pair of aces would be far too strong. It
 * also means split aces can never be resplit, since a finished hand is never
 * the active one.
 */
function splitActiveHand(state: GameState): GameState {
  const hand = activeHand(state)
  if (hand === undefined || !canSplit(state)) {
    throw new Error('The active hand cannot be split')
  }

  const [first, second] = hand.cards
  if (first === undefined || second === undefined) {
    throw new Error('A splittable hand must hold exactly two cards')
  }

  let index = state.shoeIndex
  const firstDraw = draw(state.shoe, index)
  index = firstDraw.nextIndex
  const secondDraw = draw(state.shoe, index)
  index = secondDraw.nextIndex

  const wereAces = first.rank === Rank.Ace

  const makeHand = (original: Card, drawn: Card): Hand => ({
    cards: [original, drawn],
    bet: hand.bet,
    outcome: null,
    payout: 0,
    fromSplit: true,
    // Aces stand on their single extra card; anything else is still playable.
    isFinished: wereAces,
  })

  const at = state.activeHandIndex
  const hands = [
    ...state.hands.slice(0, at),
    makeHand(first, firstDraw.card),
    makeHand(second, secondDraw.card),
    ...state.hands.slice(at + 1),
  ]

  // The player carries on with the left half of what they just split, unless
  // aces finished it for them.
  return advanceOrResolve({ ...state, shoeIndex: index, hands, activeHandIndex: at })
}

/**
 * Applies a player action to the active hand and advances the round.
 *
 * Standing, busting or doubling finishes the active hand and moves on; once no
 * hand is left awaiting a decision the dealer plays and the round settles.
 *
 * Doubling and splitting both raise the amount staked. Callers should debit the
 * difference in `totalStaked` across the call rather than tracking either case
 * individually.
 *
 * @throws {Error} If the round is not in the player's turn, if doubling is
 *   attempted after the opening two cards, or if splitting is not permitted.
 */
export function act(state: GameState, action: PlayerAction): GameState {
  if (state.phase !== RoundPhase.PlayerTurn) {
    throw new Error(`Cannot act during phase "${state.phase}"`)
  }

  const hand = activeHand(state)
  if (hand === undefined) {
    throw new Error('No hand is awaiting a decision')
  }

  const index = state.activeHandIndex

  switch (action) {
    case PlayerAction.Hit: {
      const { card, nextIndex } = draw(state.shoe, state.shoeIndex)
      const cards = [...hand.cards, card]
      const drawn: GameState = { ...state, shoeIndex: nextIndex }

      // A bust ends this hand at once; the dealer never needs to beat it.
      const updated = isBust(cards)
        ? finishHand({ ...hand, cards }, RoundOutcome.PlayerBust, 0)
        : { ...hand, cards }

      const next = withHand(drawn, index, updated)
      return updated.isFinished ? advanceOrResolve(next) : next
    }

    case PlayerAction.Double: {
      if (hand.cards.length !== 2) {
        throw new Error('Doubling down is only allowed on the opening two cards')
      }

      const { card, nextIndex } = draw(state.shoe, state.shoeIndex)
      const cards = [...hand.cards, card]
      const doubled: Hand = { ...hand, cards, bet: hand.bet * 2 }

      // Doubling buys exactly one card, then the hand is done either way.
      const updated = isBust(cards)
        ? finishHand(doubled, RoundOutcome.PlayerBust, 0)
        : finishHand(doubled, null, 0)

      return advanceOrResolve(withHand({ ...state, shoeIndex: nextIndex }, index, updated))
    }

    case PlayerAction.Split:
      return splitActiveHand(state)

    case PlayerAction.Stand:
      return advanceOrResolve(withHand(state, index, finishHand(hand, null, 0)))
  }
}

/**
 * Clears the table for another round, reshuffling once the shoe passes
 * `PENETRATION` so cards are not dealt to exhaustion.
 *
 * @param state A settled round.
 * @param reshuffleSeed Seed used if the shoe needs replacing.
 * @throws {Error} If the current round has not settled.
 */
export function startNextRound(state: GameState, reshuffleSeed: number): GameState {
  if (state.phase !== RoundPhase.Settled) {
    throw new Error(`Cannot start a new round during phase "${state.phase}"`)
  }

  const needsReshuffle = state.shoeIndex > state.shoe.length * PENETRATION

  return {
    phase: RoundPhase.Betting,
    shoe: needsReshuffle ? createShoe(reshuffleSeed) : state.shoe,
    shoeIndex: needsReshuffle ? 0 : state.shoeIndex,
    hands: [],
    activeHandIndex: 0,
    dealerHand: [],
    totalPayout: 0,
  }
}
