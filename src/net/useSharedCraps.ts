import { useEffect } from 'react'
import { RollOutcome } from '../games/craps/types'
import { TableId } from '../scenes/casinoFloorLayout'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'

/** What the craps table needs to know about the people around it. */
export interface SharedCraps {
  /** True when other people are at this table and the room owns the dice. */
  readonly shared: boolean
  /** True when this player holds the dice. Always true playing alone. */
  readonly isShooter: boolean
  /** Whether anything is stopping a throw right now. */
  readonly canRoll: boolean
  /** Throws — locally when alone, by asking the room when not. */
  readonly roll: () => void
}

/**
 * Turns a solo craps table into a shared one, without the table knowing.
 *
 * Deliberately a hook rather than logic inside `useCrapsStore`. The presence
 * store already reaches into the craps store to deliver a roll, and having the
 * craps store reach back would close a cycle between two modules that both load
 * at boot. This sits above both and depends on each.
 *
 * The engine is untouched by any of it: `phase` and `point` come only from the
 * roll, never from anybody's bets, so every client fed the same numbers derives
 * the same table on its own. That is what lets the room stay a relay that has
 * never heard of a point.
 */
export function useSharedCraps(): SharedCraps {
  const mode = useSessionStore((state) => state.mode)
  const connected = usePresenceStore((state) => state.connected)
  const shooterId = usePresenceStore((state) => state.shooterId)
  const selfId = usePresenceStore((state) => state.selfId)
  const requestRoll = usePresenceStore((state) => state.requestRoll)
  const passDice = usePresenceStore((state) => state.passDice)
  const publishTable = usePresenceStore((state) => state.publishTable)

  const activeTable = useGameStore((state) => state.activeTable)
  const throwDice = useCrapsStore((state) => state.throwDice)
  const isRolling = useCrapsStore((state) => state.isRolling)
  const game = useCrapsStore((state) => state.game)

  const shared =
    mode === PlayMode.Multiplayer && connected && activeTable === TableId.Craps

  /*
   * Alone, the dice are always yours. `shooterId` is null until the room says
   * otherwise, and treating that as "not your turn" would leave a solo player
   * unable to roll at their own table.
   */
  const isShooter = !shared || (selfId !== null && shooterId === selfId)

  /*
   * Hands the dice on, and tells the room the table as it now stands.
   *
   * Both are driven by the outcome the engine just produced rather than by a
   * timer, because the engine is the only thing that knows a seven-out has
   * happened — the room deliberately does not.
   */
  useEffect(() => {
    if (!shared) return

    publishTable(useCrapsStore.getState().tableSnapshot())
    if (game.lastOutcome === RollOutcome.SevenOut) passDice()
  }, [shared, game.lastOutcome, game.lastRoll, publishTable, passDice])

  return {
    shared,
    isShooter,
    canRoll: !isRolling && isShooter,
    roll: () => {
      if (isRolling) return
      // Asking rather than throwing. The room refuses if it is not your turn,
      // so the check above is a courtesy to the player and this is the rule.
      if (shared) requestRoll()
      else throwDice()
    },
  }
}
