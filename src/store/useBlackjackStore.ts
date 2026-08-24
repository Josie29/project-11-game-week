import { create } from 'zustand'
import {
  act,
  activeHand,
  createGame,
  placeBet,
  startNextRound,
  totalStaked,
} from '../games/blackjack/engine'
import { type GameState, PlayerAction, RoundPhase } from '../games/blackjack/types'
import { Gesture } from '../scenes/gestures'
import { useGameStore } from './useGameStore'

interface BlackjackStore {
  game: GameState
  /** Increments on every deal so card components can key their animations. */
  roundId: number

  /** Hand signal currently being performed, if any. */
  activeGesture: Gesture | null
  /** `performance.now()` at which the gesture began. */
  gestureStartedAt: number

  placeWager: (amount: number) => void
  takeAction: (action: PlayerAction) => void
  nextRound: () => void
  /** Clears the table when the player walks out mid-round. */
  reset: () => void
}

/** Hand signal that accompanies each action, as used at a real table. */
const ACTION_GESTURES: Record<PlayerAction, Gesture> = {
  [PlayerAction.Hit]: Gesture.TapTable,
  [PlayerAction.Stand]: Gesture.WaveFlat,
  [PlayerAction.Double]: Gesture.PointOne,
  [PlayerAction.Split]: Gesture.SpreadTwo,
}

/**
 * Delay between starting the signal and applying the action.
 *
 * Short enough not to feel laggy, long enough that the hand visibly moves
 * first — so the card looks like a response to the signal rather than
 * something that happened to coincide with it.
 */
const GESTURE_LEAD_IN_MS = 260

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
  /** Timer for the action waiting behind the current hand signal. */
  let pendingAction: ReturnType<typeof setTimeout> | null = null

  function cancelPendingAction(): void {
    if (pendingAction !== null) {
      clearTimeout(pendingAction)
      pendingAction = null
    }
  }

  /** Credits winnings the moment a round settles. */
  function creditIfSettled(next: GameState): void {
    if (next.phase === RoundPhase.Settled && next.totalPayout > 0) {
      useGameStore.getState().adjustBankroll(next.totalPayout)
    }
  }

  return {
    game: createGame(freshSeed()),
    roundId: 0,
    activeGesture: null,
    gestureStartedAt: 0,

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

      const { bankroll } = useGameStore.getState()

      // Doubling and splitting both put another wager on the felt, so refuse
      // outright when the bankroll cannot cover it rather than going negative.
      const needsSecondStake =
        action === PlayerAction.Double || action === PlayerAction.Split
      if (needsSecondStake && (activeHand(game)?.bet ?? 0) > bankroll) return

      // Ignore a second action while one is still resolving, so mashing keys
      // cannot queue up two hits against the same hand.
      if (pendingAction !== null) return

      set({ activeGesture: ACTION_GESTURES[action], gestureStartedAt: performance.now() })

      pendingAction = setTimeout(() => {
        pendingAction = null

        // The round may have been reset or abandoned while the hand was moving.
        // Identity-comparing against the captured state is an exact guard: any
        // change at all, from any source, cancels this.
        if (get().game !== game) return

        const next = act(game, action)

        // One rule covers both double and split: charge whatever the total
        // staked went up by.
        const extraStake = totalStaked(next) - totalStaked(game)
        if (extraStake > 0) useGameStore.getState().adjustBankroll(-extraStake)

        creditIfSettled(next)
        set({ game: next })
      }, GESTURE_LEAD_IN_MS)
    },

    nextRound: () => {
      const { game } = get()
      if (game.phase !== RoundPhase.Settled) return
      cancelPendingAction()
      set({ game: startNextRound(game, freshSeed()), activeGesture: null })
    },

    reset: () => {
      // Walking out mid-signal must not leave a timer that mutates a round
      // which no longer exists.
      cancelPendingAction()
      set({ game: createGame(freshSeed()), roundId: 0, activeGesture: null })
    },
  }
})
