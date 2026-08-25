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
import { revealTimeline } from '../scenes/revealTimeline'
import { type RunningSequence, runSequence } from './sequence'
import { useGameStore } from './useGameStore'

/** What the chips on the felt are doing. */
export enum ChipPhase {
  /** Nothing in motion. */
  Idle = 'idle',
  /** The player's wager is travelling from the stash to the betting spot. */
  Wagering = 'wagering',
  /** The dealer is placing winnings on top of a wager. */
  Paying = 'paying',
  /** The round is being cleared: each hand's chips go home or to the house. */
  Settling = 'settling',
}

interface BlackjackStore {
  game: GameState
  /** Increments on every deal so card components can key their animations. */
  roundId: number

  /** Hand signal the player is performing, if any. */
  activeGesture: Gesture | null
  /** `performance.now()` at which the player's gesture began. */
  gestureStartedAt: number

  /** Hand signal the dealer is performing, if any. */
  dealerGesture: Gesture | null
  gestureStartedAtDealer: number

  /**
   * How many of the dealer's cards the table may show.
   *
   * The engine resolves the dealer's whole hand in one step, so without this
   * every card would appear at once. Gating on it lets the reveal play out.
   */
  dealerCardsShown: number
  /** Whether the hole card has turned over. */
  holeCardUp: boolean
  /** True once the hand is fully revealed and the result may be announced. */
  revealComplete: boolean

  chipPhase: ChipPhase
  /**
   * Winnings already credited to the bankroll but still sitting on the felt.
   *
   * Display only. The stash renders `bankroll - uncollectedPayout` so the same
   * chips are not shown in two places at once while they are being raked in.
   * The bankroll itself is credited on settlement exactly as before — moving
   * the real credit would mean walking away mid-payout could swallow it.
   */
  uncollectedPayout: number

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

/** How long the wager takes to travel from the stash to the spot. */
const WAGER_TRAVEL_MS = 420

/** How long the dealer's payout stays highlighted before the phase clears. */
const PAYOUT_TRAVEL_MS = 620

/**
 * Pause on "next hand" while the chips are cleared away.
 *
 * Long enough to read as chips being raked in or swept off, short enough not
 * to drag in a five-minute demo. This is the single dial for that trade-off.
 */
const SETTLE_TRAVEL_MS = 700

/** Seeds a shoe from the clock so successive sessions do not replay one shuffle. */
function freshSeed(): number {
  return Math.floor(Date.now() % 2147483647)
}

/**
 * Owns the live blackjack round, the money that moves with it, and the chip
 * choreography that makes the money visible.
 *
 * The round used to live in the panel's local state, but the 3D table needs to
 * read the same hands, so it belongs in a store. Keeping the bankroll writes
 * here too means a payout cannot be double-credited by a component re-render.
 */
export const useBlackjackStore = create<BlackjackStore>()((set, get) => {
  /**
   * The action waiting behind the player's hand signal.
   *
   * This one — and only this one — gates player input: while it is running, a
   * second action is ignored so mashing keys cannot queue two hits against the
   * same hand. Animation beats get their own handles for exactly that reason.
   */
  let pending: RunningSequence | null = null

  /** Cosmetic beat while a wager travels from the stash to the spot. */
  let wagerBeat: RunningSequence | null = null

  function cancelPending(): void {
    pending?.cancel()
    pending = null
  }

  /** True while an action is mid-flight and further input should be ignored. */
  function isBusy(): boolean {
    return pending?.isRunning() === true
  }

  /**
   * The dealer's reveal, as a cancellable sequence.
   *
   * Deliberately separate from `pending`, which gates player input. Parking an
   * animation on that handle is what previously swallowed every hit and stand
   * for the first 420ms of a round.
   */
  let reveal: RunningSequence | null = null

  function cancelReveal(): void {
    reveal?.cancel()
    reveal = null
  }

  /**
   * Plays the dealer's hand out over time: a beat, the hole card turning, then
   * each drawn card in turn.
   */
  function startReveal(settled: GameState): void {
    cancelReveal()

    const timeline = revealTimeline(settled.dealerHand.length)

    reveal = runSequence(
      [
        { at: timeline.holeFlipAt, run: () => set({ holeCardUp: true }) },
        ...timeline.drawAt.map((at, index) => ({
          at,
          // Index 0 is the third card, since two are already on the table.
          run: () => set({ dealerCardsShown: index + 3 }),
        })),
        {
          at: timeline.completeAt,
          run: () => {
            set({ revealComplete: true })

            // The dealer pays only once the hand is finished. Paying at
            // settlement put chips on the felt while they were still turning
            // cards over, which reads as the result being decided in advance.
            if (settled.totalPayout > 0) {
              set({
                chipPhase: ChipPhase.Paying,
                dealerGesture: Gesture.DealerPay,
                gestureStartedAtDealer: performance.now(),
              })

              payoutBeat?.cancel()
              payoutBeat = runSequence([
                {
                  at: PAYOUT_TRAVEL_MS,
                  run: () => {
                    if (get().chipPhase === ChipPhase.Paying) set({ chipPhase: ChipPhase.Idle })
                  },
                },
              ])
            }
          },
        },
      ],
      // The round may have been abandoned while the dealer was playing.
      { isStillValid: () => get().game === settled },
    )
  }

  /** Clears the Paying highlight once the chips have been placed. */
  let payoutBeat: RunningSequence | null = null

  /** Credits winnings the moment a round settles, and starts the payout beat. */
  function creditIfSettled(next: GameState): void {
    if (next.phase !== RoundPhase.Settled) return

    // The dealer plays their hand out before anything is announced.
    set({ dealerCardsShown: 2, holeCardUp: false, revealComplete: false })
    startReveal(next)

    if (next.totalPayout <= 0) return

    useGameStore.getState().adjustBankroll(next.totalPayout)

    // Held back from the stash until the chips are raked in. The chips
    // themselves are placed by the dealer at the end of the reveal, not here.
    set({ uncollectedPayout: next.totalPayout })
  }

  return {
    game: createGame(freshSeed()),
    roundId: 0,
    activeGesture: null,
    gestureStartedAt: 0,
    dealerGesture: null,
    gestureStartedAtDealer: 0,
    dealerCardsShown: 2,
    holeCardUp: false,
    revealComplete: false,
    chipPhase: ChipPhase.Idle,
    uncollectedPayout: 0,

    placeWager: (amount) => {
      const { game } = get()
      const { bankroll } = useGameStore.getState()

      if (game.phase !== RoundPhase.Betting || amount <= 0 || amount > bankroll) return
      if (isBusy()) return

      // Push the chips out first; the cards follow once they land.
      useGameStore.getState().adjustBankroll(-amount)
      set({
        game: placeBet(game, amount),
        roundId: get().roundId + 1,
        activeGesture: Gesture.PushChips,
        gestureStartedAt: performance.now(),
        chipPhase: ChipPhase.Wagering,
      })

      const dealt = get().game
      creditIfSettled(dealt)

      /*
       * Deliberately NOT the `pending` handle. That one gates player input, and
       * parking the wager's travel time on it meant any hit or stand inside the
       * first 420ms was silently swallowed. Clearing the phase is cosmetic, so
       * it must never block an action.
       */
      wagerBeat?.cancel()
      wagerBeat = runSequence(
        [
          {
            at: WAGER_TRAVEL_MS,
            run: () => {
              if (get().chipPhase === ChipPhase.Wagering) set({ chipPhase: ChipPhase.Idle })
            },
          },
        ],
        { isStillValid: () => get().game === dealt },
      )
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
      if (isBusy()) return

      set({ activeGesture: ACTION_GESTURES[action], gestureStartedAt: performance.now() })

      pending = runSequence(
        [
          {
            at: GESTURE_LEAD_IN_MS,
            run: () => {
              const next = act(game, action)

              // One rule covers both double and split: charge whatever the
              // total staked went up by.
              const extraStake = totalStaked(next) - totalStaked(game)
              if (extraStake > 0) useGameStore.getState().adjustBankroll(-extraStake)

              set({ game: next })
              creditIfSettled(next)
            },
          },
        ],
        // The round may have been reset or abandoned while the hand was moving.
        { isStillValid: () => get().game === game },
      )
    },

    nextRound: () => {
      const { game, revealComplete } = get()
      if (game.phase !== RoundPhase.Settled) return
      // Never clear the table while the dealer is still turning cards over.
      if (!revealComplete) return
      if (isBusy()) return

      cancelPending()
      cancelReveal()

      // Whoever is owed something reaches for it. With a split these can both
      // happen at once — one hand won, the other did not.
      const anyWon = game.hands.some((hand) => hand.payout > 0)
      const anyLost = game.hands.some((hand) => hand.payout <= 0)
      const now = performance.now()

      set({
        chipPhase: ChipPhase.Settling,
        activeGesture: anyWon ? Gesture.RakeChips : null,
        gestureStartedAt: now,
        dealerGesture: anyLost ? Gesture.DealerSweep : null,
        gestureStartedAtDealer: now,
      })

      pending = runSequence(
        [
          {
            at: SETTLE_TRAVEL_MS,
            run: () =>
              set({
                game: startNextRound(game, freshSeed()),
                chipPhase: ChipPhase.Idle,
                uncollectedPayout: 0,
                activeGesture: null,
                dealerGesture: null,
                dealerCardsShown: 2,
                holeCardUp: false,
                revealComplete: false,
              }),
          },
        ],
        { isStillValid: () => get().game === game },
      )
    },

    reset: () => {
      // Walking out mid-signal must not leave a timer that mutates a round
      // which no longer exists.
      cancelPending()
      cancelReveal()
      wagerBeat?.cancel()
      payoutBeat?.cancel()
      set({
        game: createGame(freshSeed()),
        roundId: 0,
        activeGesture: null,
        dealerGesture: null,
        dealerCardsShown: 2,
        holeCardUp: false,
        revealComplete: false,
        chipPhase: ChipPhase.Idle,
        uncollectedPayout: 0,
      })
    },
  }
})
