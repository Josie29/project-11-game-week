import { useEffect } from 'react'
import { RollOutcome } from '../games/craps/types'
import { crapsRailSpot, TableId } from '../scenes/casinoFloorLayout'
import { CrapsBet } from '../scenes/crapsFeltLayout'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'

/** What the craps table needs to know about the people around it. */
export interface SharedCraps {
  /** True when the room owns the dice, whether or not it is reachable now. */
  readonly shared: boolean
  /** False while the socket is down; the table waits rather than playing alone. */
  readonly connected: boolean
  /** True when this player holds the dice. Always true playing alone. */
  readonly isShooter: boolean
  /** "You", a name, or null when nobody holds the dice. */
  readonly shooterName: string | null
  /** Which place at the rail this player stands in. */
  readonly railSpot: readonly [number, number, number]
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
  const sendReady = usePresenceStore((state) => state.sendReady)
  const lineup = usePresenceStore((state) => state.lineup)
  const peers = usePresenceStore((state) => state.peers)
  const passDice = usePresenceStore((state) => state.passDice)
  const publishTable = usePresenceStore((state) => state.publishTable)

  const activeTable = useGameStore((state) => state.activeTable)
  const throwDice = useCrapsStore((state) => state.throwDice)
  const isRolling = useCrapsStore((state) => state.isRolling)
  const game = useCrapsStore((state) => state.game)

  /*
   * Keyed on the mode the player chose, never on whether the socket happens to
   * be up this instant.
   *
   * `connected` is false for a moment every time the room changes — `enterRoom`
   * stops the old socket before opening the new one — and it goes false again
   * on any drop. With `connected` in here, a player who reached the rail during
   * that window silently fell through to the solo path: `isShooter` is
   * `!shared`, so the roll button went live for everybody at the table at once.
   * That is the bug two people found by standing at one table and both being
   * able to throw.
   *
   * Failing closed is also the honest behaviour. Somebody who chose Multiplayer
   * should wait for the room, not quietly be given a private game they did not
   * ask for and cannot tell apart.
   */
  const shared = mode === PlayMode.Multiplayer && activeTable === TableId.Craps

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
  /*
   * Tells the room whether this player may shoot.
   *
   * A casino will not hand you the dice without a line bet, so the eligibility
   * is exactly "is there something on the pass line or the don't pass bar".
   * Sent as a bare boolean: the room skips players who say no when it picks a
   * shooter, and never learns that it is a bet it is skipping them over.
   */
  const hasLineBet =
    (game.bets[CrapsBet.PassLine] ?? 0) > 0 || (game.bets[CrapsBet.DontPass] ?? 0) > 0

  useEffect(() => {
    if (!shared) return
    sendReady(hasLineBet)
  }, [shared, hasLineBet, sendReady])

  useEffect(() => {
    if (!shared) return

    publishTable(useCrapsStore.getState().tableSnapshot())
    if (game.lastOutcome === RollOutcome.SevenOut) passDice()
  }, [shared, game.lastOutcome, game.lastRoll, publishTable, passDice])

  /** Who has the dice, in words, so nobody wonders what they are waiting for. */
  const shooterName =
    shooterId === null
      ? null
      : shooterId === selfId
        ? 'You'
        : (peers[shooterId]?.name ?? 'Another player')

  return {
    shared,
    shooterName,
    /** Where this player stands at the rail, shooter's end included. */
    railSpot: crapsRailSpot(selfId ?? '', shooterId, lineup),
    /** True while the room is reachable. False means the table is waiting. */
    connected,
    isShooter,
    canRoll: !isRolling && isShooter && (!shared || connected),
    roll: () => {
      if (isRolling) return
      // Nothing to ask, and nothing to throw locally: a shared table that has
      // lost its room waits for it rather than dealing itself a private game.
      if (shared && !connected) return
      // Asking rather than throwing. The room refuses if it is not your turn,
      // so the check above is a courtesy to the player and this is the rule.
      if (shared) requestRoll()
      else throwDice()
    },
  }
}
