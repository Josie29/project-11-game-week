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
  type Seat,
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
 * Hands one seat may hold at once, so the pair split off a split hand can be
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

/** An empty seat, and the shape a seat is cleared back to between rounds. */
const EMPTY_SEAT: Seat = { hands: [], activeHandIndex: 0, totalPayout: 0 }

/**
 * Shared empty list, so `handsOf` on a seat that does not exist returns the
 * same reference every time and cannot make a memo or an effect fire.
 */
const NO_HANDS: readonly Hand[] = []

/*
 * Every reader below takes a seat index that defaults to the solo case, which
 * is what keeps the single-player call sites — the store, the panel, the felt
 * — reading exactly as they did before the table grew seats. Anything playing
 * more than one seat passes the index explicitly.
 */

/** One seat, or undefined if the table has no seat at that index. */
export function seatAt(
  state: GameState,
  seatIndex: number = state.activeSeatIndex,
): Seat | undefined {
  return state.seats[seatIndex]
}

/** A seat's hands, or an empty list if there is no such seat. */
export function handsOf(state: GameState, seatIndex = 0): readonly Hand[] {
  return state.seats[seatIndex]?.hands ?? NO_HANDS
}

/** Total currently staked across one seat's hands. */
export function totalStaked(state: GameState, seatIndex = 0): number {
  return handsOf(state, seatIndex).reduce((sum, hand) => sum + hand.bet, 0)
}

/** Chips returned to one seat, stakes included. Zero until settlement. */
export function totalPaid(state: GameState, seatIndex = 0): number {
  return state.seats[seatIndex]?.totalPayout ?? 0
}

/** The hand a seat is acting on, or undefined once its round is over. */
export function activeHand(
  state: GameState,
  seatIndex: number = state.activeSeatIndex,
): Hand | undefined {
  const seat = state.seats[seatIndex]
  if (seat === undefined) return undefined
  return seat.hands[seat.activeHandIndex]
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

/**
 * Creates a fresh table with a shuffled shoe, ready to accept wagers.
 *
 * @param seed Seed for the shuffle.
 * @param seatCount How many seats the table has. One is solo play.
 */
export function createGame(seed: number, seatCount = 1): GameState {
  return createGameFromShoe(createShoe(seed), seatCount)
}

/**
 * Creates a table from an explicit shoe.
 *
 * Exposed so tests can stack known cards instead of hunting for a seed that
 * produces a particular hand. Deal order runs across the seats and then the
 * dealer, twice — so at a one-seat table `shoe[0]` and `shoe[2]` reach the
 * player and `shoe[1]` and `shoe[3]` the dealer, exactly as before seats
 * existed.
 *
 * @param shoe Cards to deal from, in order.
 * @param seatCount How many seats the table has. Fixed for the table's life:
 *   `startNextRound` clears the seats rather than replacing them, so a seat
 *   index means the same player from one round to the next.
 * @throws {RangeError} If `seatCount` is not a positive integer.
 */
export function createGameFromShoe(shoe: readonly Card[], seatCount = 1): GameState {
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    throw new RangeError(`A table needs at least one seat, received ${seatCount}`)
  }

  return {
    phase: RoundPhase.Betting,
    shoe,
    shoeIndex: 0,
    dealerHand: [],
    seats: Array.from({ length: seatCount }, () => EMPTY_SEAT),
    activeSeatIndex: 0,
  }
}

/**
 * Reads a seat that the caller has already established must exist.
 *
 * @throws {RangeError} If there is no seat at that index, which means a bug
 *   rather than a state a player can reach.
 */
function requireSeat(state: GameState, seatIndex: number): Seat {
  const seat = state.seats[seatIndex]
  if (seat === undefined) {
    throw new RangeError(`No seat at index ${seatIndex} of ${state.seats.length}`)
  }
  return seat
}

/** Returns a copy of `state` with one seat replaced. */
function withSeat(state: GameState, seatIndex: number, seat: Seat): GameState {
  return { ...state, seats: state.seats.map((existing, i) => (i === seatIndex ? seat : existing)) }
}

/** Returns a copy of `state` with one hand of one seat replaced. */
function withHand(state: GameState, seatIndex: number, handIndex: number, hand: Hand): GameState {
  const seat = requireSeat(state, seatIndex)
  return withSeat(state, seatIndex, {
    ...seat,
    hands: seat.hands.map((existing, i) => (i === handIndex ? hand : existing)),
  })
}

/** Marks a hand done, optionally with a known result. */
function finishHand(hand: Hand, outcome: RoundOutcome | null, payout: number): Hand {
  return { ...hand, outcome, payout, isFinished: true }
}

/** Closes the round, summing what every hand returned for the seat that holds it. */
function settleRound(state: GameState): GameState {
  return {
    ...state,
    phase: RoundPhase.Settled,
    seats: state.seats.map((seat) => ({
      ...seat,
      totalPayout: seat.hands.reduce((sum, hand) => sum + hand.payout, 0),
    })),
  }
}

/**
 * Takes a wager from every seat and deals the opening cards.
 *
 * The deal runs across the seats and then to the dealer, twice, which is the
 * order a real table uses and the only order in which one shoe can serve
 * several players. At a one-seat table it reduces to player, dealer, player,
 * dealer — the same four cards off the same shoe as before seats existed.
 *
 * Naturals are settled here, before anyone acts. If that leaves no seat with a
 * hand to play — which at a one-seat table is any natural at all, and at a full
 * one is a dealer natural — the returned phase is already `Settled`.
 *
 * @param state Table in `RoundPhase.Betting`.
 * @param bets One wager per seat, in seat order. Each must be positive.
 * @throws {Error} If the table is not awaiting bets, if the number of wagers
 *   does not match the number of seats, or if any wager is not positive.
 */
export function placeBets(state: GameState, bets: readonly number[]): GameState {
  if (state.phase !== RoundPhase.Betting) {
    throw new Error(`Cannot bet during phase "${state.phase}"`)
  }
  if (bets.length !== state.seats.length) {
    throw new Error(`Expected ${state.seats.length} wagers, received ${bets.length}`)
  }
  for (const amount of bets) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Bet must be a positive number, received ${amount}`)
    }
  }

  let index = state.shoeIndex
  const seatCards: Card[][] = bets.map(() => [])
  const dealerHand: Card[] = []

  for (let pass = 0; pass < 2; pass++) {
    for (const cards of seatCards) {
      const toSeat = draw(state.shoe, index)
      cards.push(toSeat.card)
      index = toSeat.nextIndex
    }

    const toDealer = draw(state.shoe, index)
    dealerHand.push(toDealer.card)
    index = toDealer.nextIndex
  }

  const dealerNatural = isNaturalBlackjack(dealerHand)

  const seats = seatCards.map((cards, seatIndex): Seat => {
    // Every seat is dealt exactly one hand; splits come later.
    const bet = bets[seatIndex] ?? 0
    const hand: Hand = {
      cards,
      bet,
      outcome: null,
      payout: 0,
      fromSplit: false,
      isFinished: false,
    }

    let settled = hand
    if (isNaturalBlackjack(cards)) {
      settled = dealerNatural
        ? finishHand(hand, RoundOutcome.Push, bet)
        : finishHand(hand, RoundOutcome.PlayerBlackjack, blackjackPayout(bet))
    } else if (dealerNatural) {
      settled = finishHand(hand, RoundOutcome.DealerWin, 0)
    }

    return { hands: [settled], activeHandIndex: 0, totalPayout: 0 }
  })

  const dealt: GameState = {
    ...state,
    phase: RoundPhase.PlayerTurn,
    shoeIndex: index,
    dealerHand,
    seats,
    activeSeatIndex: 0,
  }

  // Hands the deal already decided leave nothing to act on, so the same
  // advance the player's turn uses settles the round without the dealer
  // drawing — a dealt natural never buys the dealer another card.
  return advanceOrResolve(dealt)
}

/**
 * Places the one wager at a solo table and deals.
 *
 * The single-seat shorthand for `placeBets`, and the only form the store, the
 * panel and the `?boot=` links use.
 *
 * @param state Table in `RoundPhase.Betting`, with exactly one seat.
 * @param amount Wager in chips. Must be positive.
 * @throws {Error} If the table has more than one seat, in which case the caller
 *   has to say what every seat is betting.
 */
export function placeBet(state: GameState, amount: number): GameState {
  if (state.seats.length !== 1) {
    throw new Error(`placeBet is for a one-seat table; this one has ${state.seats.length}`)
  }
  return placeBets(state, [amount])
}

/**
 * Plays out the dealer hand and scores every hand still in contention, at
 * every seat.
 *
 * The dealer draws while below 17 and stands on soft 17 — because `handValue`
 * already returns the best total, a plain `total < 17` test yields
 * stand-on-soft-17. If no hand anywhere at the table is still live the dealer
 * does not draw at all; there is nothing left to beat. That is a table-wide
 * test rather than a per-seat one, because there is one dealer hand: a seat
 * that busted out cannot decide whether the seat beside it sees another card.
 */
function resolveDealer(state: GameState): GameState {
  const contested = state.seats.some((seat) => seat.hands.some((hand) => hand.outcome === null))
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

  const seats = state.seats.map((seat) => ({
    ...seat,
    hands: seat.hands.map((hand) => {
      if (hand.outcome !== null) return hand // Already busted or settled on the deal.

      const playerTotal = handValue(hand.cards).total

      if (dealerBusted) return finishHand(hand, RoundOutcome.DealerBust, hand.bet * 2)
      if (playerTotal > dealerTotal) return finishHand(hand, RoundOutcome.PlayerWin, hand.bet * 2)
      if (playerTotal < dealerTotal) return finishHand(hand, RoundOutcome.DealerWin, 0)
      return finishHand(hand, RoundOutcome.Push, hand.bet)
    }),
  }))

  return settleRound({ ...state, seats, dealerHand, shoeIndex: index })
}

/**
 * Moves to the next hand awaiting a decision — at this seat if it has one, at
 * the next seat that does otherwise — or hands over to the dealer.
 *
 * Both searches start at the beginning rather than at the current position.
 * Play only ever moves forwards, so everything behind the active hand is
 * already finished and the first unfinished one is the right one; searching
 * from the front is also what makes a split correct, since the two hands it
 * splices in land at or after the index the player is on.
 */
function advanceOrResolve(state: GameState): GameState {
  const seatIndex = state.seats.findIndex((seat) => seat.hands.some((hand) => !hand.isFinished))
  if (seatIndex === -1) return resolveDealer(state)

  const seat = requireSeat(state, seatIndex)
  const handIndex = seat.hands.findIndex((hand) => !hand.isFinished)

  return {
    ...withSeat(state, seatIndex, { ...seat, activeHandIndex: handIndex }),
    activeSeatIndex: seatIndex,
  }
}

/** Returns true when a seat may double the hand it is acting on. */
export function canDouble(state: GameState, seatIndex: number = state.activeSeatIndex): boolean {
  const hand = activeHand(state, seatIndex)
  return state.phase === RoundPhase.PlayerTurn && hand !== undefined && hand.cards.length === 2
}

/**
 * Returns true when the hand a seat is acting on may be split.
 *
 * Requires an equal *rank* pair, not merely an equal value — a King and a Queen
 * are both worth ten but are not a pair, and treating them as one surprises
 * anyone who knows the game.
 */
export function canSplit(state: GameState, seatIndex: number = state.activeSeatIndex): boolean {
  const hand = activeHand(state, seatIndex)
  if (state.phase !== RoundPhase.PlayerTurn || hand === undefined) return false
  // The cap is per seat: three betting spots is what the felt in front of one
  // player holds, not what the table holds.
  if (handsOf(state, seatIndex).length >= MAX_HANDS) return false
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
  const seatIndex = state.activeSeatIndex
  const seat = requireSeat(state, seatIndex)
  const hand = activeHand(state, seatIndex)
  if (hand === undefined || !canSplit(state, seatIndex)) {
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

  const at = seat.activeHandIndex
  const hands = [
    ...seat.hands.slice(0, at),
    makeHand(first, firstDraw.card),
    makeHand(second, secondDraw.card),
    ...seat.hands.slice(at + 1),
  ]

  // The player carries on with the left half of what they just split, unless
  // aces finished it for them. Only this seat's hand list grows; the seats
  // either side of it are untouched, which is the same splice-in-place rule
  // one level up.
  const split = withSeat({ ...state, shoeIndex: index }, seatIndex, {
    ...seat,
    hands,
    activeHandIndex: at,
  })

  return advanceOrResolve(split)
}

/**
 * Applies a player action to the acting seat's active hand and advances the
 * round.
 *
 * Standing, busting or doubling finishes the active hand and moves on — to this
 * seat's next hand, then to the next seat with one; once no hand is left
 * awaiting a decision anywhere at the table the dealer plays and the round
 * settles.
 *
 * The action always applies to `activeSeatIndex`. Turn order is the engine's to
 * decide, not the caller's: a seat that could act out of turn would take a card
 * off the shoe that belongs to somebody else.
 *
 * **Shared tables call `actAs` instead.** `act` cannot be played out of turn
 * because it does not take a seat — but it also cannot *detect* being called by
 * the wrong player, and it would cheerfully play the active seat's hand for
 * somebody sitting three places away. `actAs` is the same call with the
 * caller's seat named, so that mistake becomes an error rather than a stolen
 * turn.
 *
 * Doubling and splitting both raise the amount staked. Callers should debit the
 * difference in `totalStaked` across the call rather than tracking either case
 * individually.
 *
 * @throws {Error} If the round is not in a player's turn, if doubling is
 *   attempted after the opening two cards, or if splitting is not permitted.
 */
/**
 * Acts on behalf of one named seat, and refuses if it is not that seat's turn.
 *
 * Casino blackjack runs one player at a time, starting at first base — the
 * dealer's left — and moving clockwise to third base. `advanceOrResolve`
 * already enforces the order; this enforces *who is asking*, which is the half
 * that only matters once more than one person is at the table.
 *
 * @param seatIndex The seat the caller is sitting in, not the seat they want
 *   to play.
 * @throws {Error} If it is another seat's turn.
 */
export function actAs(
  state: GameState,
  seatIndex: number,
  action: PlayerAction,
): GameState {
  if (seatIndex !== state.activeSeatIndex) {
    throw new Error(
      `Seat ${seatIndex} cannot act: it is seat ${state.activeSeatIndex}'s turn`,
    )
  }

  return act(state, action)
}

export function act(state: GameState, action: PlayerAction): GameState {
  if (state.phase !== RoundPhase.PlayerTurn) {
    throw new Error(`Cannot act during phase "${state.phase}"`)
  }

  const seatIndex = state.activeSeatIndex
  const hand = activeHand(state, seatIndex)
  if (hand === undefined) {
    throw new Error('No hand is awaiting a decision')
  }

  const index = requireSeat(state, seatIndex).activeHandIndex

  switch (action) {
    case PlayerAction.Hit: {
      const { card, nextIndex } = draw(state.shoe, state.shoeIndex)
      const cards = [...hand.cards, card]
      const drawn: GameState = { ...state, shoeIndex: nextIndex }

      // A bust ends this hand at once; the dealer never needs to beat it.
      const updated = isBust(cards)
        ? finishHand({ ...hand, cards }, RoundOutcome.PlayerBust, 0)
        : { ...hand, cards }

      const next = withHand(drawn, seatIndex, index, updated)
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

      return advanceOrResolve(
        withHand({ ...state, shoeIndex: nextIndex }, seatIndex, index, updated),
      )
    }

    case PlayerAction.Split:
      return splitActiveHand(state)

    case PlayerAction.Stand:
      return advanceOrResolve(withHand(state, seatIndex, index, finishHand(hand, null, 0)))
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
    dealerHand: [],
    // The seats are cleared, not rebuilt: a seat index has to mean the same
    // player from one round to the next.
    seats: state.seats.map(() => EMPTY_SEAT),
    activeSeatIndex: 0,
  }
}
