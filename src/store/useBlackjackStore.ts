import { create } from 'zustand'
import { act, createGame, placeBet, startNextRound } from '../games/blackjack/engine'
import { type GameState, type PlayerAction, RoundPhase } from '../games/blackjack/types'
import { useGameStore } from './useGameStore'

interface BlackjackStore {
  game: GameState
  /** Increments on every deal so card components can key their animations. */
  roundId: number

  placeWager: (amount: number) => void
  takeAction: (action: PlayerAction) => void
  nextRound: () => void
  /** Clears the table when the player walks out mid-round. */
  reset: () => void
}

/** Seeds a shoe from the clock so successive sessions do not replay one shuffle. */
function freshSeed(): number {
  return Math.floor(Date.now() % 2147483647)
}

/**
 * Owns the live blackjack round and the money that moves with it.
 *
 * The round used to live in the panel's local state, but the 3D table needs to
 * read the same hands, so it belongs in a store. Keeping the bankroll writes
 * here too means a payout cannot be double-credited by a component re-render.
 */
export const useBlackjackStore = create<BlackjackStore>()((set, get) => {
  /** Credits winnings the moment a round settles. */
  function creditIfSettled(next: GameState): void {
    if (next.phase === RoundPhase.Settled && next.payout > 0) {
      useGameStore.getState().adjustBankroll(next.payout)
    }
  }

  return {
    game: createGame(freshSeed()),
    roundId: 0,

    placeWager: (amount) => {
      const { game } = get()
      const { bankroll, adjustBankroll } = useGameStore.getState()

      if (game.phase !== RoundPhase.Betting || amount <= 0 || amount > bankroll) return

      adjustBankroll(-amount)
      const next = placeBet(game, amount)
      creditIfSettled(next)
      set({ game: next, roundId: get().roundId + 1 })
    },

    takeAction: (action) => {
      const { game } = get()
      if (game.phase !== RoundPhase.PlayerTurn) return

      const next = act(game, action)
      // Doubling raises the wager mid-round; charge the difference.
      if (next.bet > game.bet) {
        useGameStore.getState().adjustBankroll(-(next.bet - game.bet))
      }
      creditIfSettled(next)
      set({ game: next })
    },

    nextRound: () => {
      const { game } = get()
      if (game.phase !== RoundPhase.Settled) return
      set({ game: startNextRound(game, freshSeed()) })
    },

    reset: () => set({ game: createGame(freshSeed()), roundId: 0 }),
  }
})
