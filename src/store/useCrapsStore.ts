import { create } from 'zustand'
import {
  canPlaceCrapsBet,
  createCrapsGame,
  placeCrapsBet,
  rollCraps,
  totalCrapsPayout,
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
              if (payout > 0) useGameStore.getState().creditWinnings(payout)
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
      set({ game: createCrapsGame(freshSeed()), rollId: 0, isRolling: false })
    },
  }
})
