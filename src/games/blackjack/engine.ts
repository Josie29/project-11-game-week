import { createRng, shuffle } from './rng'
import {
  type Card,
  type GameState,
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

/** Natural blackjack pays 3:2, so the player gets their stake back plus 1.5x. */
const BLACKJACK_PAYOUT_MULTIPLIER = 2.5

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
 * @param hand Cards to score.
 * @returns The best total not exceeding 21 where possible, and whether an ace
 *   is still counted as 11.
 */
export function handValue(hand: readonly Card[]): HandValue {
  let total = 0
  let acesCountedHigh = 0

  for (const card of hand) {
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
export function isNaturalBlackjack(hand: readonly Card[]): boolean {
  return hand.length === 2 && handValue(hand).total === BLACKJACK
}

export function isBust(hand: readonly Card[]): boolean {
  return handValue(hand).total > BLACKJACK
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
    playerHand: [],
    dealerHand: [],
    bet: 0,
    outcome: null,
    payout: 0,
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
  const playerHand: Card[] = []
  const dealerHand: Card[] = []

  // Standard deal order: player, dealer, player, dealer.
  for (let i = 0; i < 2; i++) {
    const toPlayer = draw(state.shoe, index)
    playerHand.push(toPlayer.card)
    index = toPlayer.nextIndex

    const toDealer = draw(state.shoe, index)
    dealerHand.push(toDealer.card)
    index = toDealer.nextIndex
  }

  const dealt: GameState = {
    ...state,
    phase: RoundPhase.PlayerTurn,
    shoeIndex: index,
    playerHand,
    dealerHand,
    bet: amount,
    outcome: null,
    payout: 0,
  }

  const playerNatural = isNaturalBlackjack(playerHand)
  const dealerNatural = isNaturalBlackjack(dealerHand)

  if (playerNatural && dealerNatural) {
    return settle(dealt, RoundOutcome.Push, dealt.bet)
  }
  if (playerNatural) {
    return settle(dealt, RoundOutcome.PlayerBlackjack, dealt.bet * BLACKJACK_PAYOUT_MULTIPLIER)
  }
  if (dealerNatural) {
    return settle(dealt, RoundOutcome.DealerWin, 0)
  }

  return dealt
}

/** Marks a round finished with the given outcome and payout. */
function settle(state: GameState, outcome: RoundOutcome, payout: number): GameState {
  return { ...state, phase: RoundPhase.Settled, outcome, payout }
}

/**
 * Plays out the dealer hand and settles the round.
 *
 * The dealer draws while below 17 and stands on soft 17 — because `handValue`
 * already returns the best total, a plain `total < 17` test yields stand-on-soft-17.
 */
function resolveDealer(state: GameState): GameState {
  const dealerHand = [...state.dealerHand]
  let index = state.shoeIndex

  while (handValue(dealerHand).total < DEALER_STANDS_AT) {
    const { card, nextIndex } = draw(state.shoe, index)
    dealerHand.push(card)
    index = nextIndex
  }

  const resolved: GameState = { ...state, dealerHand, shoeIndex: index }
  const playerTotal = handValue(state.playerHand).total
  const dealerTotal = handValue(dealerHand).total

  if (dealerTotal > BLACKJACK) {
    return settle(resolved, RoundOutcome.DealerBust, resolved.bet * 2)
  }
  if (playerTotal > dealerTotal) {
    return settle(resolved, RoundOutcome.PlayerWin, resolved.bet * 2)
  }
  if (playerTotal < dealerTotal) {
    return settle(resolved, RoundOutcome.DealerWin, 0)
  }
  return settle(resolved, RoundOutcome.Push, resolved.bet)
}

/**
 * Applies a player action and advances the round.
 *
 * Standing, busting, or doubling all hand control to the dealer, so those
 * actions return a fully settled state.
 *
 * After a double the returned `bet` is twice the previous wager; the caller is
 * responsible for debiting the additional stake, i.e. `next.bet - prev.bet`.
 *
 * @throws {Error} If the round is not in the player's turn, or if doubling is
 *   attempted after the opening two cards.
 */
export function act(state: GameState, action: PlayerAction): GameState {
  if (state.phase !== RoundPhase.PlayerTurn) {
    throw new Error(`Cannot act during phase "${state.phase}"`)
  }

  switch (action) {
    case PlayerAction.Hit: {
      const { card, nextIndex } = draw(state.shoe, state.shoeIndex)
      const playerHand = [...state.playerHand, card]
      const hit: GameState = { ...state, playerHand, shoeIndex: nextIndex }

      // A bust settles at once — the dealer never draws, since the hand is already lost.
      return isBust(playerHand) ? settle(hit, RoundOutcome.PlayerBust, 0) : hit
    }

    case PlayerAction.Double: {
      if (state.playerHand.length !== 2) {
        throw new Error('Doubling down is only allowed on the opening two cards')
      }

      const { card, nextIndex } = draw(state.shoe, state.shoeIndex)
      const playerHand = [...state.playerHand, card]
      const doubled: GameState = {
        ...state,
        playerHand,
        shoeIndex: nextIndex,
        bet: state.bet * 2,
      }

      // Doubling buys exactly one card, then the turn ends automatically.
      return isBust(playerHand)
        ? settle(doubled, RoundOutcome.PlayerBust, 0)
        : resolveDealer(doubled)
    }

    case PlayerAction.Stand:
      return resolveDealer(state)
  }
}

/** Returns true when the player may still double, i.e. holds exactly two cards. */
export function canDouble(state: GameState): boolean {
  return state.phase === RoundPhase.PlayerTurn && state.playerHand.length === 2
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
    playerHand: [],
    dealerHand: [],
    bet: 0,
    outcome: null,
    payout: 0,
  }
}
