import { useEffect } from 'react'
import { RollOutcome } from '../games/craps/types'
import {
  CRAPS_RAIL_SPOTS,
  crapsRailHasRoom,
  crapsRailSpot,
  TableId,
} from '../scenes/casinoFloorLayout'
import { CrapsBet } from '../scenes/crapsFeltLayout'
import { useCrapsStore } from '../store/useCrapsStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'

/** Stable empty array, so the selector does not hand back a new one each render. */
const EMPTY: readonly string[] = []

/**
 * The last stakes record put on the wire, as JSON, or null before any.
 *
 * Module-level and compared by content, because this hook mounts twice — the
 * panel and the interior — and each mount's effect fires on every change. A
 * per-hook ref would send everything twice; comparing the serialized record
 * lets both mounts share one answer to "has the room already heard this".
 * Null again whenever the socket drops, so a reconnect — a fresh attachment
 * on the worker, blank where the stakes were — is re-told rather than
 * assumed to remember.
 */
let lastStakesSent: string | null = null

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
  /**
   * Whether the table can take this player.
   *
   * The spec caps the table at eight, one per rail spot. Always true playing
   * alone, and always true for somebody already in the lineup — a full table
   * must not refuse a player it already holds.
   */
  readonly hasRoom: boolean
  /** Whether anything is stopping a throw right now. */
  readonly canRoll: boolean
  /**
   * When the room last threw the dice, on `performance.now()`, or null solo
   * or before any roll. The panel derives the table's betting-window countdown
   * from this with `secondsUntilRoll`; the worker is the authority and refuses
   * early throws regardless.
   */
  readonly rollClockStartedAt: number | null
  /** Everyone at the rail, self included. One means alone — and no window. */
  readonly tableSize: number
  /** How many at the rail have said they are done betting this window. */
  readonly readyCount: number
  /** Whether this player already said so. */
  readonly hasReadied: boolean
  /** Says it — once per window; the room counts, the next roll resets. */
  readonly readyUp: () => void
  /**
   * When the room's forced-roll clock was last armed, or null solo. Unlike
   * the betting window this applies to a lone shooter too — the room rolls
   * for anybody who goes quiet holding the dice.
   */
  readonly autoRollClockStartedAt: number | null
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
  // Read per table, so the blackjack lineup cannot answer a craps question.
  const shooterId = usePresenceStore((state) => state.shooters[TableId.Craps] ?? null)
  const selfId = usePresenceStore((state) => state.selfId)
  const requestRoll = usePresenceStore((state) => state.requestRoll)
  const sendReady = usePresenceStore((state) => state.sendReady)
  const lineup = usePresenceStore((state) => state.lineups[TableId.Craps] ?? EMPTY)
  const peers = usePresenceStore((state) => state.peers)
  const passDice = usePresenceStore((state) => state.passDice)
  const rollClocks = usePresenceStore((state) => state.rollClocks)
  const rollSkips = usePresenceStore((state) => state.rollSkips)
  const autoRollClocks = usePresenceStore((state) => state.autoRollClocks)
  const skipRollWait = usePresenceStore((state) => state.skipRollWait)
  const publishTable = usePresenceStore((state) => state.publishTable)
  const sendStakes = usePresenceStore((state) => state.sendStakes)

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

  /*
   * Tells the room the table as it now stands, the moment the roll arrives.
   *
   * Driven by the outcome the engine just produced rather than by a timer,
   * because the engine is the only thing that knows what the roll meant — the
   * room deliberately does not. Published immediately rather than on the
   * settle clock below: this is state for a late joiner, not presentation,
   * and a joiner mid-tumble should adopt the table the roll already decided.
   */
  useEffect(() => {
    if (!shared) return
    publishTable(useCrapsStore.getState().tableSnapshot())
  }, [shared, game.lastRoll, publishTable])

  /*
   * Publishes what this player has on the felt, so the others can draw it
   * (issue #18). Everything that moves money moves `game.bets` — a wager, a
   * take-down, a settle, walking away — so watching the record *is* watching
   * the felt, and no call site needs to remember to publish. An all-zero
   * record is a real message: it is how chips leave everyone else's table.
   */
  useEffect(() => {
    if (!shared || !connected) {
      // The room forgot us with the socket; say it all again on return.
      if (!connected) lastStakesSent = null
      return
    }
    const record = JSON.stringify(game.bets)
    if (record === lastStakesSent) return
    lastStakesSent = record
    sendStakes(game.bets)
  }, [shared, connected, game.bets, sendStakes])

  /*
   * Hands the dice on — when the player sees the seven, not when the engine
   * does.
   *
   * The engine registers the seven-out the moment the roll arrives, a full
   * tumble before the dice visibly land on it, and passing on that instant
   * rotated the whole rail while the pair was still in the air: the table
   * announced the outcome before the dice did. `isRolling` is the store's
   * settle clock — it flips false at the same moment the payout credits and
   * the result text unhides — so the pass rides the presentation everything
   * else at the table already follows. The engine stays untouched; only the
   * telling waits.
   */
  useEffect(() => {
    if (!shared || isRolling) return
    if (game.lastOutcome === RollOutcome.SevenOut) passDice()
  }, [shared, isRolling, game.lastOutcome, passDice])

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
    /*
     * Where this player stands at the rail.
     *
     * Alone, the shooter's end outright: the queue knows nothing of a solo
     * player — no self id, no lineup — and asking it anyway dropped them on
     * the *last* spot, standing at the far end of a table whose dice they were
     * throwing from the near one.
     */
    railSpot: shared ? crapsRailSpot(selfId ?? '', shooterId, lineup) : CRAPS_RAIL_SPOTS[0]!,
    /*
     * Checked in Multiplayer whether or not this player is at the table yet —
     * `shared` is false while they are still walking up, which is exactly when
     * the answer gates the offer. Alone, the table is theirs.
     */
    hasRoom: mode !== PlayMode.Multiplayer || crapsRailHasRoom(selfId ?? '', lineup),
    /** True while the room is reachable. False means the table is waiting. */
    connected,
    isShooter,
    canRoll: !isRolling && isShooter && (!shared || connected),
    /*
     * Null alone — solo dice answer to nobody's clock, and "alone" includes a
     * shared table with nobody else at the rail: the window exists so other
     * players can bet, and the worker skips its refusal on the same rule. The
     * panel does the ticking; the worker does the refusing.
     */
    rollClockStartedAt:
      shared && lineup.length > 1 ? (rollClocks[TableId.Craps] ?? null) : null,
    tableSize: shared ? lineup.length : 1,
    readyCount: (rollSkips[TableId.Craps] ?? EMPTY).length,
    hasReadied: selfId !== null && (rollSkips[TableId.Craps] ?? EMPTY).includes(selfId),
    readyUp: () => {
      if (shared && connected) skipRollWait()
    },
    autoRollClockStartedAt: shared ? (autoRollClocks[TableId.Craps] ?? null) : null,
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
