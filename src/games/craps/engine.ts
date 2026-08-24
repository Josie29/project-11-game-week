import { CrapsBet, type PointNumber, POINT_NUMBERS } from '../../scenes/crapsFeltLayout'
import { nextRandom } from '../rng'
import {
  type CrapsBets,
  CrapsPhase,
  type CrapsState,
  type DiceRoll,
  RollOutcome,
} from './types'

/**
 * Free odds pay true odds, which is the whole point of the bet — it is the only
 * wager on the table with no house edge.
 *
 * Held as ratios rather than decimals on purpose. 6:5 as a decimal is 1.2,
 * which is not representable in binary: a ten-dollar bet then pays
 * 22.000000000000004, and that dust ends up in the bankroll and in the chip
 * breakdown. Integer arithmetic keeps every payout exact.
 *
 * 4 and 10 are hardest to repeat so they pay most; 6 and 8 easiest, least.
 */
interface Odds {
  readonly numerator: number
  readonly denominator: number
}

const TRUE_ODDS: Readonly<Record<PointNumber, Odds>> = {
  4: { numerator: 2, denominator: 1 },
  10: { numerator: 2, denominator: 1 },
  5: { numerator: 3, denominator: 2 },
  9: { numerator: 3, denominator: 2 },
  6: { numerator: 6, denominator: 5 },
  8: { numerator: 6, denominator: 5 },
}

/**
 * Chips returned by a winning odds bet, stake included.
 *
 * Floors the winnings, as a casino does when a bet does not divide evenly —
 * though every stake this table offers divides exactly for every point.
 */
export function oddsPayout(stake: number, point: PointNumber): number {
  const { numerator, denominator } = TRUE_ODDS[point]
  return stake + Math.floor((stake * numerator) / denominator)
}

/**
 * Field pays even money except on the outside numbers.
 *
 * A one-roll bet: it is settled on every throw, win or lose, and never rides.
 */
const FIELD_MULTIPLIERS: Readonly<Record<number, number>> = { 2: 2, 12: 3 }
const FIELD_WINNERS = new Set([2, 3, 4, 9, 10, 11, 12])

/** Maximum odds backing, as a multiple of the pass-line bet. */
export const MAX_ODDS_MULTIPLE = 3

const NO_BETS: CrapsBets = {
  [CrapsBet.PassLine]: 0,
  [CrapsBet.DontPass]: 0,
  [CrapsBet.Odds]: 0,
  [CrapsBet.Field]: 0,
}

/** A fresh table, before the shooter's first come-out roll. */
export function createCrapsGame(seed: number): CrapsState {
  return {
    phase: CrapsPhase.ComeOut,
    point: null,
    bets: { ...NO_BETS },
    lastRoll: null,
    lastOutcome: null,
    lastPayouts: { ...NO_BETS },
    rngState: seed >>> 0,
    rollCount: 0,
  }
}

function isPointNumber(total: number): total is PointNumber {
  return (POINT_NUMBERS as readonly number[]).includes(total)
}

/**
 * Whether a bet can be placed right now.
 *
 * The phase restrictions are real rules, not UI convenience: pass and don't
 * pass are come-out bets, and free odds only exist to back a pass line once
 * there is a point to lay them against.
 */
export function canPlaceCrapsBet(state: CrapsState, bet: CrapsBet, amount: number): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false

  switch (bet) {
    case CrapsBet.PassLine:
    case CrapsBet.DontPass:
      // A line bet is contracted on the come-out and cannot be added to, or
      // taken down, once a point is set.
      return state.phase === CrapsPhase.ComeOut && state.bets[bet] === 0

    case CrapsBet.Odds: {
      if (state.phase !== CrapsPhase.Point) return false
      const line = state.bets[CrapsBet.PassLine]
      if (line === 0) return false
      return state.bets[CrapsBet.Odds] + amount <= line * MAX_ODDS_MULTIPLE
    }

    case CrapsBet.Field:
      // A one-roll bet, so it can be laid at any time.
      return true
  }
}

/**
 * Adds to a bet.
 *
 * @throws {Error} If the bet is not currently allowed. Callers should check
 *   `canPlaceCrapsBet` first; this throws rather than silently no-op so a UI
 *   bug surfaces instead of quietly swallowing a wager.
 */
export function placeCrapsBet(state: CrapsState, bet: CrapsBet, amount: number): CrapsState {
  if (!canPlaceCrapsBet(state, bet, amount)) {
    throw new Error(`Cannot place ${amount} on "${bet}" during phase "${state.phase}"`)
  }

  return { ...state, bets: { ...state.bets, [bet]: state.bets[bet] + amount } }
}

/** Total chips currently on the felt. */
export function totalCrapsStake(state: CrapsState): number {
  return Object.values(state.bets).reduce((sum, amount) => sum + amount, 0)
}

/** Rolls two dice from the carried generator state. */
function rollDice(rngState: number): { roll: DiceRoll; state: number } {
  const first = nextRandom(rngState)
  const second = nextRandom(first.state)

  const a = Math.floor(first.value * 6) + 1
  const b = Math.floor(second.value * 6) + 1

  return { roll: { first: a, second: b, total: a + b }, state: second.state }
}

/** What the field pays for a total, as chips returned including the stake. */
function fieldReturn(stake: number, total: number): number {
  if (!FIELD_WINNERS.has(total)) return 0
  return stake * (1 + (FIELD_MULTIPLIERS[total] ?? 1))
}

/**
 * Throws the dice and settles everything the roll decides.
 *
 * Bets that lose or win are cleared from the felt; a pass line riding through a
 * no-decision roll stays staked, which is what makes the wait for the point
 * feel like a wait.
 */
export function rollCraps(state: CrapsState): CrapsState {
  const { roll, state: rngState } = rollDice(state.rngState)
  const { total } = roll

  const bets = { ...state.bets }
  const payouts: Record<CrapsBet, number> = { ...NO_BETS }

  // The field is a one-roll bet and settles on every throw, regardless of what
  // the roll does to the line.
  if (bets[CrapsBet.Field] > 0) {
    payouts[CrapsBet.Field] = fieldReturn(bets[CrapsBet.Field], total)
    bets[CrapsBet.Field] = 0
  }

  let phase = state.phase
  let point = state.point
  let outcome: RollOutcome

  /** Clears a line bet and records what it returned. */
  function settle(bet: CrapsBet, multiplier: number): void {
    if (bets[bet] === 0) return
    payouts[bet] = bets[bet] * multiplier
    bets[bet] = 0
  }

  if (state.phase === CrapsPhase.ComeOut) {
    if (total === 7 || total === 11) {
      outcome = RollOutcome.Natural
      settle(CrapsBet.PassLine, 2)
      settle(CrapsBet.DontPass, 0)
    } else if (total === 2 || total === 3) {
      outcome = RollOutcome.Craps
      settle(CrapsBet.PassLine, 0)
      settle(CrapsBet.DontPass, 2)
    } else if (total === 12) {
      // Twelve is barred: don't pass neither wins nor loses, it pushes. Without
      // the bar, betting against the shooter would carry a player edge.
      outcome = RollOutcome.Craps
      settle(CrapsBet.PassLine, 0)
      settle(CrapsBet.DontPass, 1)
    } else if (isPointNumber(total)) {
      outcome = RollOutcome.PointEstablished
      phase = CrapsPhase.Point
      point = total
    } else {
      outcome = RollOutcome.NoDecision
    }
  } else if (point !== null && total === point) {
    const madePoint = point
    outcome = RollOutcome.PointMade
    settle(CrapsBet.PassLine, 2)
    settle(CrapsBet.DontPass, 0)
    // Computed rather than scaled, so the ratio stays exact.
    if (bets[CrapsBet.Odds] > 0) {
      payouts[CrapsBet.Odds] = oddsPayout(bets[CrapsBet.Odds], madePoint)
      bets[CrapsBet.Odds] = 0
    }
    phase = CrapsPhase.ComeOut
    point = null
  } else if (total === 7) {
    outcome = RollOutcome.SevenOut
    settle(CrapsBet.PassLine, 0)
    settle(CrapsBet.Odds, 0)
    settle(CrapsBet.DontPass, 2)
    phase = CrapsPhase.ComeOut
    point = null
  } else {
    outcome = RollOutcome.NoDecision
  }

  return {
    phase,
    point,
    bets,
    lastRoll: roll,
    lastOutcome: outcome,
    lastPayouts: payouts,
    rngState,
    // A seven-out passes the dice on, so the count restarts with the shooter.
    rollCount: outcome === RollOutcome.SevenOut ? 0 : state.rollCount + 1,
  }
}

/** Total returned by the most recent roll, across every bet. */
export function totalCrapsPayout(state: CrapsState): number {
  return Object.values(state.lastPayouts).reduce((sum, amount) => sum + amount, 0)
}

/** True odds for a point, as a ratio, for printing "pays 6 to 5". */
export function oddsRatio(point: PointNumber): Odds {
  return TRUE_ODDS[point]
}
