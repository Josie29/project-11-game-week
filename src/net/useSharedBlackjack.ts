import { useEffect, useMemo } from 'react'
import { RoundPhase, type PlayerAction } from '../games/blackjack/types'
import { TableId } from '../scenes/casinoFloorLayout'
import { useBlackjackStore } from '../store/useBlackjackStore'
import { useGameStore } from '../store/useGameStore'
import { usePresenceStore } from '../store/usePresenceStore'
import { PlayMode, useSessionStore } from '../store/useSessionStore'
import { claimRefused, sittingOut, takenSeats } from '../world/seating'

/** Stable empties, so a selector does not return a new object every render. */
const NO_SEATS: Readonly<Record<number, string>> = {}
const NO_BETS: Readonly<Record<string, number>> = {}

/** What the blackjack table needs to know about the people sitting at it. */
export interface SharedBlackjack {
  /** True when the room deals this table, whether or not it is reachable now. */
  readonly shared: boolean
  /**
   * Stools somebody else is on, so they are not offered to this player.
   *
   * Empty when playing alone, which is what leaves every seat free and every
   * capture of the room unchanged.
   */
  readonly takenSeats: ReadonlySet<number>
  /** What this player has staked into a round that has not been dealt yet. */
  readonly pendingBet: number
  /**
   * When the gather's latest wager landed, on `performance.now()`, or null
   * before anyone has staked. The room deals `DEAL_WINDOW_MS` after this.
   */
  readonly betClockStartedAt: number | null
  /** How many at the table have staked, and how many are being waited on. */
  readonly staked: number
  readonly seatedCount: number
  /**
   * When the acting seat's turn began, on `performance.now()`, or null when
   * the room has never dealt. The room stands them `TURN_WINDOW_MS` after.
   */
  readonly turnClockStartedAt: number | null
  /**
   * Who the table is waiting on: "You" for this player, the acting player's
   * name for anyone else, with the craps shooter's fallback for a peer the
   * roster has no name for.
   */
  readonly waitingOn: string | null
  /** False while the socket is down; the table waits rather than dealing itself. */
  readonly connected: boolean
  /** True while watching a round this player did not bet into. */
  readonly spectating: boolean
  /** True when it is this player's turn, or they are playing alone. */
  readonly isMyTurn: boolean
  /** Puts a wager in — locally when alone, into the gather when not. */
  readonly wager: (amount: number) => void
  /** Hits, stands, doubles or splits. */
  readonly act: (action: PlayerAction) => void
  /** Answers an insurance offer: an amount to take it, zero to decline. */
  readonly insure: (amount: number) => void
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
  const selfId = usePresenceStore((state) => state.selfId)
  const seatMap = usePresenceStore((state) => state.seats[TableId.Blackjack] ?? NO_SEATS)
  const roomBets = usePresenceStore((state) => state.bets[TableId.Blackjack] ?? NO_BETS)
  const betClockStartedAt = usePresenceStore(
    (state) => state.betClocks[TableId.Blackjack] ?? null,
  )
  const turnClockStartedAt = usePresenceStore(
    (state) => state.turnClocks[TableId.Blackjack] ?? null,
  )
  const peers = usePresenceStore((state) => state.peers)

  const activeTable = useGameStore((state) => state.activeTable)
  const activeSeat = useGameStore((state) => state.activeSeat)
  const standUp = useGameStore((state) => state.standUp)
  const placeWager = useBlackjackStore((state) => state.placeWager)
  const takeAction = useBlackjackStore((state) => state.takeAction)
  const decideInsurance = useBlackjackStore((state) => state.decideInsurance)
  const mySeatIndex = useBlackjackStore((state) => state.mySeatIndex)
  const activeSeatIndex = useBlackjackStore((state) => state.game.activeSeatIndex)
  const activeSeatId = useBlackjackStore(
    (state) => state.seatIds[state.game.activeSeatIndex] ?? null,
  )

  /*
   * Keyed on the chosen mode, not on whether the socket is up right now.
   *
   * `connected` drops to false for a moment on every room change, because
   * `enterRoom` stops the old socket before opening the new one. A wager placed
   * in that window took the solo path — applied locally instead of being handed
   * to the room — and from then on that client had a private game with its own
   * shoe. Two people sat at one table and played entirely separate hands, which
   * is precisely what that window buys you.
   *
   * Waiting is the honest failure. A player who chose Multiplayer should see a
   * table that is not ready yet, not a private game they cannot tell apart from
   * a shared one until somebody else's cards never appear.
   */
  const shared = mode === PlayMode.Multiplayer && activeTable === TableId.Blackjack

  const pendingBet = selfId === null ? 0 : (roomBets[selfId] ?? 0)
  // Subscribed, not read once: the banner has to come back the moment a deal
  // lands without this player in it, which is a phase change.
  const gatherOpen = useBlackjackStore((state) => state.game.phase === RoundPhase.Betting)

  /*
   * True when this player is watching a round they did not bet into. A wager
   * pending in the gather counts as being in — see `sittingOut` for the
   * banner-beside-the-deal-clock bug this distinction fixes.
   */
  const spectating = sittingOut(shared, mySeatIndex, gatherOpen, pendingBet)

  // Alone, every turn is yours. Shared, the engine decides the order and this
  // only reports it — the refusal itself lives in `actAs`. A spectator never
  // has a turn, because they have no hand to take one with.
  const isMyTurn = !shared || (!spectating && mySeatIndex === activeSeatIndex)

  // Both of these are arithmetic over the room's map, and both live in
  // `world/seating.ts` so they can be asserted — see the note at its head.
  const seats = useMemo(() => takenSeats(seatMap, selfId), [seatMap, selfId])

  /*
   * The room turned the claim down, so put the player back on their feet.
   *
   * Left alone, they spend the round drawn inside whoever did get the stool,
   * holding a panel that will never be given a turn.
   */
  const refused = shared && connected && claimRefused(seatMap, activeSeat, selfId)

  useEffect(() => {
    if (refused) standUp()
  }, [refused, standUp])

  // Who holds the turn, by name — the craps shooter's rule exactly: this
  // player is "You", the roster names the rest, and a peer who never gave a
  // name is still somebody rather than nobody.
  const waitingOn =
    !shared || activeSeatId === null
      ? null
      : activeSeatId === selfId
        ? 'You'
        : (peers[activeSeatId]?.name ?? 'Another player')

  return {
    shared,
    takenSeats: seats,
    pendingBet,
    betClockStartedAt,
    turnClockStartedAt,
    waitingOn,
    staked: Object.keys(roomBets).length,
    // Everyone the room has seated, which is who the deal is waiting on.
    seatedCount: Object.keys(seatMap).length,
    connected,
    spectating,
    isMyTurn,

    wager: (amount) => {
      // A shared table with no room does nothing at all. Betting locally here is
      // what forked the two players into separate games.
      if (shared && !connected) return
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
      if (shared && !connected) return
      if (shared) sendAction(action)
      else takeAction(action)
    },

    insure: (amount) => {
      /*
       * On the wire it is an action string — `insure:12` — because the room
       * relays those without reading them, and a decision that needs no new
       * message type needs no worker deploy either. Applied on the echo, like
       * every action, so the window closes at the same point in the room's
       * sequence on every client.
       */
      if (shared && !connected) return
      if (shared) sendAction(`insure:${amount}`)
      else decideInsurance(amount)
    },
  }
}
