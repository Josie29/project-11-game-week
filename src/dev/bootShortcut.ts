import { PlayerAction } from '../games/blackjack/types'
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
 * - `?boot=casino` opens the Golden Ace at the betting prompt.
 * - `?boot=table` opens the Golden Ace with a hand already dealt.
 * - `?boot=settled` plays that hand out, so the hole card is turned over.
 */
export function applyBootShortcut(): void {
  const boot = new URLSearchParams(window.location.search).get('boot')
  if (!boot) return

  if (boot !== 'casino' && boot !== 'table' && boot !== 'settled') return

  useGameStore.getState().enterCasino(CasinoId.GoldenAce)

  if (boot === 'table' || boot === 'settled') {
    useBlackjackStore.getState().placeWager(DEMO_BET)
  }

  if (boot === 'settled') {
    // Standing hands over to the dealer and resolves the round, which is the
    // only way to see the hole card flip without playing through by hand.
    useBlackjackStore.getState().takeAction(PlayerAction.Stand)
  }
}
