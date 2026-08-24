import { createGameFromShoe, createShoe, placeBet } from '../games/blackjack/engine'
import { PlayerAction, Rank, Suit } from '../games/blackjack/types'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { CasinoId } from '../world/casinos'

/** Wager staked automatically when deep-linking to a dealt table. */
const DEMO_BET = 50

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
 * - `?boot=split` deals a pair, which a random shoe will not reliably do.
 */
export function applyBootShortcut(): void {
  const boot = new URLSearchParams(window.location.search).get('boot')
  if (!boot) return

  if (boot !== 'casino' && boot !== 'table' && boot !== 'settled' && boot !== 'split') return

  useGameStore.getState().enterCasino(CasinoId.GoldenAce)

  if (boot === 'split') {
    // Stack a pair of eights against a dealer sixteen, then let the rest of the
    // shoe fall wherever. Deal order is player, dealer, player, dealer.
    const stacked = [
      { rank: Rank.Eight, suit: Suit.Spades },
      { rank: Rank.Ten, suit: Suit.Clubs },
      { rank: Rank.Eight, suit: Suit.Hearts },
      { rank: Rank.Six, suit: Suit.Diamonds },
      ...createShoe(7),
    ]

    useGameStore.getState().adjustBankroll(-DEMO_BET)
    useBlackjackStore.setState({ game: placeBet(createGameFromShoe(stacked), DEMO_BET) })
    return
  }

  if (boot === 'table' || boot === 'settled') {
    useBlackjackStore.getState().placeWager(DEMO_BET)
  }

  if (boot === 'settled') {
    // Standing hands over to the dealer and resolves the round, which is the
    // only way to see the hole card flip without playing through by hand.
    useBlackjackStore.getState().takeAction(PlayerAction.Stand)
  }
}
