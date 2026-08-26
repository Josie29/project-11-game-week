import type { PlayerAction } from '../games/blackjack/types'
import { TableId } from '../scenes/casinoFloorLayout'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'

/** What the blackjack table needs to know about the people sitting at it. */
export interface SharedBlackjack {
  /** True when the room is dealing this table rather than this client. */
  readonly shared: boolean
  /** True when it is this player's turn, or they are playing alone. */
  readonly isMyTurn: boolean
  /** Puts a wager in — locally when alone, into the gather when not. */
  readonly wager: (amount: number) => void
  /** Hits, stands, doubles or splits. */
  readonly act: (action: PlayerAction) => void
}

/**
 * Turns a solo blackjack table into a shared one, without the table knowing.
 *
 * The sibling of `useSharedCraps`, and above both stores for the same reason:
 * presence already reaches into the game stores to deliver a deal, and the game
 * stores reaching back would close a cycle between modules that both load at
 * boot.
 *
 * The difference from craps is the deal. A roll happens a player at a time, but
 * one `placeBets` deals every seat at once — so a wager is not applied when it
 * is made, it is handed to the room, and the round starts when the room says
 * every seat has staked something.
 */
export function useSharedBlackjack(): SharedBlackjack {
  const mode = useSessionStore((state) => state.mode)
  const connected = usePresenceStore((state) => state.connected)
  const sendBet = usePresenceStore((state) => state.sendBet)
  const sendAction = usePresenceStore((state) => state.sendAction)

  const activeTable = useGameStore((state) => state.activeTable)
  const placeWager = useBlackjackStore((state) => state.placeWager)
  const takeAction = useBlackjackStore((state) => state.takeAction)
  const mySeatIndex = useBlackjackStore((state) => state.mySeatIndex)
  const activeSeatIndex = useBlackjackStore((state) => state.game.activeSeatIndex)

  const shared =
    mode === PlayMode.Multiplayer && connected && activeTable === TableId.Blackjack

  // Alone, every turn is yours. Shared, the engine decides the order and this
  // only reports it — the refusal itself lives in `actAs`.
  const isMyTurn = !shared || mySeatIndex === activeSeatIndex

  return {
    shared,
    isMyTurn,

    wager: (amount) => {
      if (shared) sendBet(amount)
      else placeWager(amount)
    },

    act: (action) => {
      /*
       * Sent, not applied. The room's order is the order every client uses, so
       * acting locally first would put this player's move in a different place
       * in the sequence from everybody else's and the shoe would drift apart on
       * the first hit. This client applies its own action when it comes back.
       */
      if (shared) sendAction(action)
      else takeAction(action)
    },
  }
}
