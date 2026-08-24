import type { CrapsBet, PointNumber } from '../../scenes/crapsFeltLayout'

export enum CrapsPhase {
  /** No point is set; the next roll is a come-out. */
  ComeOut = 'comeOut',
  /** A point is established; rolling for it, or for a seven. */
  Point = 'point',
}

/** What the most recent roll did. */
export enum RollOutcome {
  /** 7 or 11 on a come-out: pass wins immediately. */
  Natural = 'natural',
  /** 2, 3 or 12 on a come-out: pass loses immediately. */
  Craps = 'craps',
  /** 4, 5, 6, 8, 9 or 10 on a come-out: that number becomes the point. */
  PointEstablished = 'pointEstablished',
  /** The point was rolled again before a seven. */
  PointMade = 'pointMade',
  /** A seven arrived first. The shooter's turn is over. */
  SevenOut = 'sevenOut',
  /** A point is set and the roll changed nothing. */
  NoDecision = 'noDecision',
}

export interface DiceRoll {
  readonly first: number
  readonly second: number
  readonly total: number
}

/** Amount staked on each bet region. Zero means no bet. */
export type CrapsBets = Readonly<Record<CrapsBet, number>>

export interface CrapsState {
  readonly phase: CrapsPhase
  readonly point: PointNumber | null
  readonly bets: CrapsBets
  readonly lastRoll: DiceRoll | null
  readonly lastOutcome: RollOutcome | null
  /**
   * Chips returned by the most recent roll, per bet, stake included.
   *
   * Same convention as blackjack: the caller debits when a bet is placed and
   * credits this on resolution, so the two always net out. A bet that rides —
   * a pass line while a point is set — pays nothing and stays staked.
   */
  readonly lastPayouts: CrapsBets
  /** Carried mulberry32 state, so a seed replays a whole session of rolls. */
  readonly rngState: number
  /** Rolls made since the current shooter took the dice. */
  readonly rollCount: number
}
