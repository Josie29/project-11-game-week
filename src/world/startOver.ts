import { useAppearanceStore } from '../store/useAppearanceStore'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { useSessionStore } from '../store/useSessionStore'

/**
 * Wipes everything and puts the welcome screen back up.
 *
 * This lives out here rather than inside `SettingsPanel` because the panel is
 * the wrong place to keep a *list*. Five stores hold a run between them, and
 * the reset was assembled by hand in a click handler — so when the two table
 * games arrived, nobody added them, and nothing said so. Starting over cleared
 * the money, the character and the session and left both games untouched: the
 * next run walked into the casino and found the previous one's hand still on
 * the blackjack felt, two cards face up and a chip on the spot, with nobody
 * sitting there. Craps kept its point and its bets the same way.
 *
 * A list in a module with a test against it is a list somebody has to keep
 * true. A list in a click handler is a list that quietly goes stale.
 *
 * Order matters in two places and only two:
 *
 * - `leaveVenue` runs first. `App` picks what the Canvas draws from `location`,
 *   and the welcome screen only replaces the DOM on top of it, so a reset
 *   pressed inside the shop would put the title card over the shop's interior.
 * - `useSessionStore.reset` runs last, because it is the one that closes the
 *   settings panel and raises the welcome screen.
 */
export function startNewRun(): void {
  useGameStore.getState().leaveVenue()

  useGameStore.getState().resetBankroll()
  useAppearanceStore.getState().reset()
  useBlackjackStore.getState().reset()
  useCrapsStore.getState().reset()

  useSessionStore.getState().reset()
}
