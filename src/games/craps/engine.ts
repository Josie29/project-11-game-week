import {
  CrapsBet,
  PLACE_BET_LIST,
  PLACE_BETS,
  placeBetNumber,
  type PointNumber,
  POINT_NUMBERS,
} from '../../scenes/crapsFeltLayout'
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
 * What a place bet pays, as a ratio.
 *
 * These are the house's numbers, not true odds — a place bet is the free odds
 * bet with the edge put back in, which is why it is offered without needing a
 * line bet behind it.
 *
 * Ratios again, never decimals, for the reason above: 7:6 as a decimal is
 * 1.1666..., and a six-dollar bet then pays 6.999999999999999.
 */
const PLACE_ODDS: Readonly<Record<PointNumber, Odds>> = {
  4: { numerator: 9, denominator: 5 },
  10: { numerator: 9, denominator: 5 },
  5: { numerator: 7, denominator: 5 },
  9: { numerator: 7, denominator: 5 },
  6: { numerator: 7, denominator: 6 },
  8: { numerator: 7, denominator: 6 },
}

/**
 * The smallest stake a place bet may be made in, per number.
 *
 * Not decoration and not house style — it is the money invariant. A place bet
 * pays in fifths on the outside numbers and sixths on the six and eight, so a
 * ten-dollar bet on the six pays $11.66 and the table either shortchanges the
 * player or invents a cent. A real table solves this by taking the six and
 * eight in sixes and everything else in fives, and so does this one: every
 * stake the panel offers is a multiple of this, which is what makes
 * `placePayout` exact rather than rounded.
 */
export const PLACE_UNITS: Readonly<Record<PointNumber, number>> = {
  4: 5,
  10: 5,
  5: 5,
  9: 5,
  6: 6,
  8: 6,
}

/**
 * What a winning place bet pays, not counting the stake.
 *
 * Winnings alone, because a place bet is paid and *left up* — it is the bet you
 * leave working, and taking it down after every hit would have the player
 * re-making it between throws. That makes it the one bet on this table whose
 * payout is not chips-returned-including-stake, which is why
 * `stakeReturnedByRoll` reads what left the felt rather than assuming.
 *
 * @param stake The amount on the number. Expected to be a multiple of that
 *   number's `PLACE_UNITS` entry, which every offered stake is.
 * @param point The number that was rolled.
 */
export function placeWinnings(stake: number, point: PointNumber): number {
  const { numerator, denominator } = PLACE_ODDS[point]
  return Math.floor((stake * numerator) / denominator)
}

/** The stake plus its winnings, for asserting the ratio divides exactly. */
export function placePayout(stake: number, point: PointNumber): number {
  return stake + placeWinnings(stake, point)
}

/** What a place bet on a number pays, as a ratio, for printing "pays 9 to 5". */
export function placeRatio(point: PointNumber): Odds {
  return PLACE_ODDS[point]
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
  [CrapsBet.Place4]: 0,
  [CrapsBet.Place5]: 0,
  [CrapsBet.Place6]: 0,
  [CrapsBet.Place8]: 0,
  [CrapsBet.Place9]: 0,
  [CrapsBet.Place10]: 0,
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

    default: {
      /*
       * A place bet needs a point, the same as free odds do.
       *
       * A real table takes one on the come-out and simply turns it off, which
       * is a distinction that needs a crew standing there to explain: the
       * player buys a bet, the dice roll their number, and nothing happens.
       * Requiring the point makes the rule visible instead — the buttons are
       * dead until there is something to bet into.
       *
       * The amount is the other half. The ratios are fifths and sixths, so
       * anything but a multiple of the number's unit would have the table
       * paying out a fraction of a chip.
       */
      if (state.phase !== CrapsPhase.Point) return false

      const number = placeBetNumber(bet)
      if (number === null) return false
      return amount % PLACE_UNITS[number] === 0
    }
  }
}

/**
 * What one chip of `chipValue` actually commits on a bet right now.
 *
 * The whole betting interface hangs off this. The bar used to be a grid of
 * stake against bet, which drew every bet once per amount it was willing to
 * offer — so the pass line was three separate buttons, none of which *was* the
 * pass line, and no amount outside that grid could be wagered at all. Picking a
 * chip and putting it somewhere is both how a table works and how the amount
 * stops being a property of the button.
 *
 * A chip does not commit its face value everywhere:
 *
 * - **Free odds** are capped behind the line bet, so the chip is trimmed to
 *   whatever headroom is left rather than refused outright.
 * - **Place bets** are taken in the number's own unit — sixes on the six and
 *   eight, fives elsewhere — so a chip is rounded *down* to a whole number of
 *   units. A twenty-five on the six buys twenty-four, which the old grid had no
 *   way to express, and a five on the six buys nothing at all rather than
 *   quietly spending six.
 *
 * Never returns more than `chipValue`: you never spend more than you picked up.
 * Never returns an amount `canPlaceCrapsBet` would refuse, so the interface
 * cannot offer a press the engine throws on. Both are asserted.
 *
 * @returns The amount to wager, or 0 if this chip buys nothing on this bet.
 */
export function chipStake(state: CrapsState, bet: CrapsBet, chipValue: number): number {
  if (!Number.isFinite(chipValue) || chipValue <= 0) return 0

  const amount = intendedStake(state, bet, chipValue)
  if (amount <= 0) return 0

  // The single gate. Everything above only chooses an amount to ask about;
  // whether it is allowed at all is the engine's existing answer.
  return canPlaceCrapsBet(state, bet, amount) ? amount : 0
}

/** The amount a chip is worth on a bet, before asking whether it is allowed. */
function intendedStake(state: CrapsState, bet: CrapsBet, chipValue: number): number {
  if (bet === CrapsBet.Odds) {
    const headroom =
      state.bets[CrapsBet.PassLine] * MAX_ODDS_MULTIPLE - state.bets[CrapsBet.Odds]
    return Math.min(chipValue, Math.max(0, headroom))
  }

  const number = placeBetNumber(bet)
  if (number !== null) {
    const unit = PLACE_UNITS[number]
    return Math.floor(chipValue / unit) * unit
  }

  return chipValue
}

/**
 * Whether a bet can be taken back off the felt.
 *
 * Everything except the pass line. That is the one true contract bet: once it
 * is out it rides to a decision, which is what makes free odds behind it a fair
 * bet in the first place. Don't pass, free odds, the field and the place
 * numbers can all be called down at a real table whenever the player likes.
 *
 * Worth having at all because place bets ride until a seven now, so a player
 * who backs a number can otherwise only get out by leaving the table — which
 * hands back everything, including the bets they meant to keep.
 */
export function canTakeDownCrapsBet(state: CrapsState, bet: CrapsBet): boolean {
  if (state.bets[bet] <= 0) return false
  return bet !== CrapsBet.PassLine
}

/**
 * Takes a bet off the felt, leaving every other bet where it is.
 *
 * @returns The state without that bet. The caller is responsible for handing
 *   the stake back — it is the player's own money returning, not a payout, so
 *   it goes through the bankroll directly and the marker has no claim on it.
 * @throws {Error} If the bet cannot be taken down. Callers should check
 *   `canTakeDownCrapsBet` first; this throws rather than silently no-op so a UI
 *   bug surfaces instead of quietly pocketing the stake.
 */
export function takeDownCrapsBet(state: CrapsState, bet: CrapsBet): CrapsState {
  if (!canTakeDownCrapsBet(state, bet)) {
    throw new Error(`Cannot take down "${bet}" holding ${state.bets[bet]}`)
  }

  return { ...state, bets: { ...state.bets, [bet]: 0 } }
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

  /**
   * Pays the place bet on a number the shooter has just hit.
   *
   * Paid and left up, which is how the bet works: you place the six and it
   * keeps earning until a seven takes it. Only the winnings are credited —
   * the stake never leaves the felt.
   *
   * Only ever called while a point is on. On the come-out the place bets are
   * off, so a number rolling there neither pays nor takes.
   */
  function settlePlace(rolled: number): void {
    if (!isPointNumber(rolled)) return

    const bet = PLACE_BETS[rolled]
    const stake = bets[bet]
    if (stake === 0) return

    payouts[bet] = placeWinnings(stake, rolled)
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
      /*
       * Twelve is barred: don't pass neither wins nor loses, it pushes. Without
       * the bar, betting against the shooter would carry a player edge.
       *
       * A push leaves the bet standing rather than handing it back. The
       * come-out has not been resolved — twelve is a craps number, so the
       * shooter comes out again — and a bet that came down would have to be
       * re-made to carry on the wager it never lost.
       */
      outcome = RollOutcome.Craps
      settle(CrapsBet.PassLine, 0)
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
    settlePlace(total)
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
    // The seven takes every place bet with it. This is the whole risk of the
    // bet and the reason it pays better than free odds.
    for (const bet of PLACE_BET_LIST) settle(bet, 0)
    phase = CrapsPhase.ComeOut
    point = null
  } else {
    outcome = RollOutcome.NoDecision
    settlePlace(total)
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

/**
 * How much of the last roll's payout was the player's own stake coming back.
 *
 * Payouts are chips returned *including* the stake, so the winnings are the
 * remainder. A bet that lost returned nothing and gets no stake back, which is
 * why this reads the payout rather than simply summing what left the felt.
 *
 * Needed because the marker takes a share of winnings only. Splitting the gross
 * would charge the player for a bet merely coming home — a barred twelve on
 * don't pass is a push, and it must cost nothing.
 *
 * @param before The state the roll was made from, which still holds the stakes.
 * @param after The state `rollCraps` returned.
 */
export function stakeReturnedByRoll(before: CrapsState, after: CrapsState): number {
  return Object.entries(after.lastPayouts).reduce((sum, [bet, payout]) => {
    if (payout <= 0) return sum

    /*
     * What actually left the felt, rather than what the payout looks like it
     * contains. A place bet is paid and left standing, so its payout is
     * winnings alone and no stake came home — reading the payout would have
     * counted those winnings as the player's own money and let the marker's
     * share slip past on the one bet designed to be left working.
     */
    const key = bet as CrapsBet
    return sum + (before.bets[key] - after.bets[key])
  }, 0)
}

/** True odds for a point, as a ratio, for printing "pays 6 to 5". */
export function oddsRatio(point: PointNumber): Odds {
  return TRUE_ODDS[point]
}

/**
 * What a winning field number pays above the stake, as a multiple.
 *
 * Exported so the felt can print its own terms from the same table the payout
 * is computed from. A layout that says a number pays double while the engine
 * pays triple is a correctness bug wearing a texture, and the felt is where a
 * player goes to check.
 *
 * @param total The dice total.
 * @returns The multiple, or 0 for a total the field does not pay on.
 */
export function fieldMultiplier(total: number): number {
  if (!FIELD_WINNERS.has(total)) return 0
  return FIELD_MULTIPLIERS[total] ?? 1
}
