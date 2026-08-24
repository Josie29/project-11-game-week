import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { CasinoId } from '../world/casinos'

/** Wager staked automatically when deep-linking to a dealt table. */
const DEMO_BET = 25

/**
 * Honours a `?boot=` query parameter so a scene can be opened directly.
 *
 * Walking the strip every time you want to look at the table is a slow loop
 * when iterating on the felt or the card art, and it makes rehearsing the demo
 * from a specific point awkward. Development builds only.
 *
 * - `?boot=casino` opens The Mirage at the betting prompt.
 * - `?boot=table` opens The Mirage with a hand already dealt.
 */
export function applyBootShortcut(): void {
  const boot = new URLSearchParams(window.location.search).get('boot')
  if (!boot) return

  if (boot === 'casino' || boot === 'table') {
    useGameStore.getState().enterCasino(CasinoId.Mirage)
  }

  if (boot === 'table') {
    useBlackjackStore.getState().placeWager(DEMO_BET)
  }
}
