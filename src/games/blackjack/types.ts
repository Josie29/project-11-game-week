export enum Suit {
  Clubs = 'C',
  Diamonds = 'D',
  Hearts = 'H',
  Spades = 'S',
}

export enum Rank {
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A',
}

export interface Card {
  readonly suit: Suit
  readonly rank: Rank
}

export enum PlayerAction {
  Hit = 'hit',
  Stand = 'stand',
  Double = 'double',
  Split = 'split',
}

export enum RoundPhase {
  /** Awaiting a wager. No cards are on the table. */
  Betting = 'betting',
  /** Cards are dealt and a seat is choosing actions. */
  PlayerTurn = 'playerTurn',
  /** The round is over and `outcome` and `payout` are populated. */
  Settled = 'settled',
}

export enum RoundOutcome {
  PlayerBlackjack = 'playerBlackjack',
  PlayerWin = 'playerWin',
  DealerWin = 'dealerWin',
  Push = 'push',
  PlayerBust = 'playerBust',
  DealerBust = 'dealerBust',
}

export interface HandValue {
  /** Best total that does not exceed 21, or the minimum total if the hand is bust. */
  readonly total: number
  /** True when an ace is still being counted as 11, so the hand cannot bust on one card. */
  readonly isSoft: boolean
}

/**
 * One player hand. A seat holds several of these once it splits.
 */
export interface Hand {
  readonly cards: readonly Card[]
  /** Wager on this hand. Doubling increases it mid-round. */
  readonly bet: number
  /**
   * Result once known.
   *
   * Busting sets this immediately; standing leaves it null until the dealer
   * has played, because the hand's fate is not decided yet.
   */
  readonly outcome: RoundOutcome | null
  /**
   * Chips returned for this hand on settlement, stake included.
   *
   * Even money pays `2 * bet`, a natural pays `2.5 * bet`, a push refunds
   * `bet`, and a loss pays 0. Because the stake is included, the caller debits
   * on wager and credits on settlement, and the two always net out.
   */
  readonly payout: number
  /**
   * True when this hand came from a split.
   *
   * A two-card 21 here is an ordinary 21, not a natural — it pays even money.
   */
  readonly fromSplit: boolean
  /** True once the player can no longer act on this hand. */
  readonly isFinished: boolean
}

/**
 * One position at the table: everything that belongs to a single player.
 *
 * A seat owns hands, not cards — the cards themselves come out of the table's
 * one shoe, which is the whole reason this type exists. Dice are independent of
 * decisions, so every craps client can run its own engine on the same roll and
 * agree; a shoe is not, because `shoeIndex` advances every time *anyone* hits,
 * doubles or splits. Five private engines would deal five different tables.
 */
export interface Seat {
  /** One entry before a split, two after. Empty until the deal. */
  readonly hands: readonly Hand[]
  /** Which of this seat's hands it is acting on. */
  readonly activeHandIndex: number
  /** Sum of this seat's hand payouts, populated at settlement. */
  readonly totalPayout: number
}

/**
 * The table: one shoe, one dealer, and the seats playing against them.
 *
 * Solo play is the one-seat case and nothing more — there is no separate
 * single-player path to drift out of step with the shared one.
 */
export interface GameState {
  readonly phase: RoundPhase
  readonly shoe: readonly Card[]
  /** Index of the next card to be dealt from `shoe`. */
  readonly shoeIndex: number
  readonly dealerHand: readonly Card[]
  /** Always at least one. Seat count is fixed when the table is created. */
  readonly seats: readonly Seat[]
  /** Which seat is currently acting. */
  readonly activeSeatIndex: number
}
