import { create } from 'zustand'
import {
  canPlaceCrapsBet,
  canTakeDownCrapsBet,
  createCrapsGame,
  placeCrapsBet,
  rollCraps,
  stakeReturnedByRoll,
  takeDownCrapsBet,
  totalCrapsPayout,
  totalCrapsStake,
} from '../games/craps/engine'
import type { CrapsState } from '../games/craps/types'
import type { CrapsBet } from '../scenes/crapsFeltLayout'
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
const DICE_SETTLE_MS = 2100

interface CrapsStore {
  game: CrapsState
  /** Increments on every throw; the dice watch this to restart their tumble. */
  rollId: number
  /** True while the dice are in the air and the result is withheld. */
  isRolling: boolean

  wager: (bet: CrapsBet, amount: number) => void
  /** Calls a bet down and hands the stake back. */
  takeDown: (bet: CrapsBet) => void
  throwDice: () => void
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

  function cancelSettle(): void {
    settle?.cancel()
    settle = null
  }

  return {
    game: createCrapsGame(freshSeed()),
    rollId: 0,
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

    throwDice: () => {
      const { game, isRolling } = get()
      if (isRolling) return

      // The engine resolves immediately; the store simply withholds the result
      // until the dice have finished tumbling.
      const next = rollCraps(game)
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
