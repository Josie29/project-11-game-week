import { create } from 'zustand'
import {
  canPlaceCrapsBet,
  canTakeDownCrapsBet,
  createCrapsGame,
  drawDiceRoll,
  placeCrapsBet,
  settleCrapsRoll,
  stakeReturnedByRoll,
  takeDownCrapsBet,
  totalCrapsPayout,
  totalCrapsStake,
} from '../games/craps/engine'
import { CrapsPhase, type CrapsState, type DiceRoll } from '../games/craps/types'
import { type CrapsBet, POINT_NUMBERS, type PointNumber } from '../scenes/crapsFeltLayout'
import { type RunningSequence, runSequence } from './sequence'
import { useGameStore } from './useGameStore'

/**
 * How long the dice tumble before the result is announced.
 *
 * Matches the dice component's own settle window. The money moves when the
 * dice stop, not when the engine resolves — announcing a seven-out while the
 * dice were still in the air would give the result away early, the same
 * mistake the blackjack reveal made.
 */
/*
 * Exported for one reader: `rollClock.test.ts`, which pins this against the
 * worker's `ROLL_SETTLE_MS` so the betting window opens when the dice land on
 * every screen, not when the numbers were decided.
 */
export const DICE_SETTLE_MS = 2100

/** The chip in hand on walking up: a green quarter, the table's middle stake. */
const DEFAULT_CHIP = 25

interface CrapsStore {
  game: CrapsState
  /** Increments on every throw; the dice watch this to restart their tumble. */
  rollId: number
  /** True while the dice are in the air and the result is withheld. */
  isRolling: boolean

  /**
   * The denomination the player has picked up.
   *
   * In the store rather than the panel because two things bet with it now: the
   * rack in the bar, and the felt itself.
   */
  heldChip: number
  holdChip: (value: number) => void

  wager: (bet: CrapsBet, amount: number) => void
  /** Calls a bet down and hands the stake back. */
  takeDown: (bet: CrapsBet) => void
  throwDice: () => void
  /**
   * Settles a roll, whoever produced it.
   *
   * Public because in shared play the dice come from the room: the socket layer
   * hands the roll here and everything downstream — the tumble, the payout, the
   * marker's share — is identical to a roll thrown at this table.
   */
  applyRoll: (roll: DiceRoll, rngState?: number) => void
  /**
   * Starts this table from the hand already in progress.
   *
   * Only the shared fields are adopted — the phase, the point and the last
   * roll. Bets are never taken from the wire: they are this player's money, and
   * a packet that could set them is a packet that could spend them.
   */
  adoptTable: (value: unknown) => void
  /** The shared fields, for publishing to whoever walks up next. */
  tableSnapshot: () => unknown
  /** Clears the table when the player walks out. */
  reset: () => void
}

function freshSeed(): number {
  return Math.floor(Date.now() % 2147483647)
}

/**
 * Owns the live craps game and the money on it.
 *
 * Mirrors `useBlackjackStore`: the engine stays pure, the store holds the
 * bankroll writes so a payout cannot be double-credited by a re-render, and
 * one cancellable timer gates the reveal.
 */
export const useCrapsStore = create<CrapsStore>()((set, get) => {
  let settle: RunningSequence | null = null

  /**
   * Rolls that arrived while the dice were still moving.
   *
   * Outside the store on purpose, like the settle handle beside it: this is a
   * queue of work, not something the table draws, and putting it in state would
   * re-render the scene every time a packet landed.
   */
  const queued: { roll: DiceRoll; rngState?: number | undefined }[] = []

  function cancelSettle(): void {
    settle?.cancel()
    settle = null
  }

  return {
    game: createCrapsGame(freshSeed()),
    rollId: 0,
    heldChip: DEFAULT_CHIP,
    isRolling: false,

    wager: (bet, amount) => {
      const { game, isRolling } = get()
      const { bankroll } = useGameStore.getState()

      // No betting while the dice are in the air, exactly as at a real table.
      if (isRolling) return
      if (amount > bankroll) return
      if (!canPlaceCrapsBet(game, bet, amount)) return

      useGameStore.getState().adjustBankroll(-amount)
      set({ game: placeCrapsBet(game, bet, amount) })
    },

    holdChip: (value) => set({ heldChip: value }),

    takeDown: (bet) => {
      const { game, isRolling } = get()

      // Nothing comes off the felt while the dice are in the air, exactly as at
      // a real table.
      if (isRolling) return
      if (!canTakeDownCrapsBet(game, bet)) return

      /*
       * `adjustBankroll`, not `creditWinnings`: this is the player's own stake
       * coming home, already debited when the bet went out. Running it through
       * the winnings path would hand the marker a share of money nobody won.
       */
      const stake = game.bets[bet]
      useGameStore.getState().adjustBankroll(stake)
      set({ game: takeDownCrapsBet(game, bet) })
    },

    /*
     * The table as it stands, minus anything that is this player's alone.
     *
     * Deliberately not the whole `CrapsState`. Sending bets would put one
     * player's stake on another player's felt, and sending `rngState` would
     * hand over a seeded generator that only the solo path has any use for.
     */
    tableSnapshot: () => {
      const { game } = get()
      return {
        phase: game.phase,
        point: game.point,
        lastRoll: game.lastRoll,
        lastOutcome: game.lastOutcome,
        rollCount: game.rollCount,
      }
    },

    adoptTable: (value) => {
      if (typeof value !== 'object' || value === null) return
      const shared = value as Record<string, unknown>

      const phase = shared.phase === CrapsPhase.Point ? CrapsPhase.Point : CrapsPhase.ComeOut
      const point = POINT_NUMBERS.includes(shared.point as PointNumber)
        ? (shared.point as PointNumber)
        : null

      /*
       * A point with no number, or a number with no point, would be a table in
       * a state the engine has no rule for. Coerced as a pair rather than field
       * by field, so the two can never disagree.
       */
      if (phase === CrapsPhase.Point && point === null) return

      set({
        game: {
          ...get().game,
          phase,
          point,
          rollCount: typeof shared.rollCount === 'number' ? shared.rollCount : 0,
        },
      })
    },

    throwDice: () => {
      const { game, isRolling } = get()
      if (isRolling) return

      /*
       * The store throws the dice; the engine only settles them. Solo, that
       * means drawing from the table's own seeded generator here and carrying
       * the advanced state forward with the roll — identical numbers to before,
       * and still reproducible from a seed.
       *
       * Shared, the room throws instead and `applyRoll` is what it calls. The
       * split is exactly here because everything below it — the settle clock,
       * the payout, the marker's share — is the same either way.
       */
      const { roll, rngState } = drawDiceRoll(game.rngState)
      get().applyRoll(roll, rngState)
    },

    /*
     * Settles a roll this table did not necessarily throw.
     *
     * `rngState` is passed rather than read so the solo path can carry its
     * advanced generator forward while a shared roll leaves it exactly where it
     * was: a client that switches between the two must not find its seeded
     * sequence has moved underneath it.
     */
    applyRoll: (roll, rngState) => {
      const { game, isRolling } = get()

      /*
       * A roll that arrives mid-tumble waits its turn; it is never dropped.
       *
       * Dropping it is what this used to do, and at a shared table that is
       * corruption rather than a missed frame: the room throws for everybody at
       * once, so a client that ignores one roll has a different point, a
       * different shoe of luck and a different idea of who won — permanently,
       * and with no way back. Twenty-two rolls in a row went missing this way
       * while the table sat on the same point.
       *
       * Solo it cannot happen: `canRoll` is false while the dice are moving, so
       * there is nothing to queue.
       */
      if (isRolling) {
        queued.push({ roll, rngState })
        return
      }

      const next = settleCrapsRoll({ ...game, rngState: rngState ?? game.rngState }, roll)
      cancelSettle()

      set({ game: next, rollId: get().rollId + 1, isRolling: true })

      settle = runSequence(
        [
          {
            at: DICE_SETTLE_MS,
            run: () => {
              const payout = totalCrapsPayout(next)
              // Stake back whole, marker's share out of the winnings only.
              if (payout > 0) {
                useGameStore.getState().creditWinnings(payout, stakeReturnedByRoll(game, next))
              }
              set({ isRolling: false })

              // Whatever came in while these were tumbling, in the order the
              // room sent it.
              const waiting = queued.shift()
              if (waiting) get().applyRoll(waiting.roll, waiting.rngState)
            },
          },
        ],
        // Leaving the table mid-roll must not credit into the next session.
        { isStillValid: () => get().game === next },
      )
    },

    reset: () => {
      cancelSettle()

      /*
       * Hand back whatever is still on the felt. Place bets ride until a seven
       * takes them, so a player can walk away from the table with real money
       * standing on four numbers — and clearing the game without returning it
       * quietly confiscated the lot. `adjustBankroll` rather than
       * `creditWinnings`: a returned stake is the player's own money coming
       * home, already debited when the bet went out, and the marker has no
       * claim on it.
       */
      const staked = totalCrapsStake(get().game)
      if (staked > 0) useGameStore.getState().adjustBankroll(staked)

      set({ game: createCrapsGame(freshSeed()), rollId: 0, isRolling: false })
    },
  }
})
