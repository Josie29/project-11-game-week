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
}

export enum RoundPhase {
  /** Awaiting a wager. No cards are on the table. */
  Betting = 'betting',
  /** Cards are dealt and the player is choosing actions. */
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

export interface GameState {
  readonly phase: RoundPhase
  readonly shoe: readonly Card[]
  /** Index of the next card to be dealt from `shoe`. */
  readonly shoeIndex: number
  readonly playerHand: readonly Card[]
  readonly dealerHand: readonly Card[]
  /** Current wager. Doubling down increases this mid-round. */
  readonly bet: number
  readonly outcome: RoundOutcome | null
  /**
   * Chips returned to the player on settlement, stake included.
   *
   * Even money pays `2 * bet`, a natural blackjack pays `2.5 * bet`, a push
   * refunds `bet`, and a loss pays 0. Because the stake is included here, the
   * caller debits `bet` when the wager is placed and credits `payout` on
   * settlement — the two always net out correctly.
   */
  readonly payout: number
}
