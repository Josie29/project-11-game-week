import { create } from 'zustand'
import { getLocalTransform } from '../net/localTransform'
import { TableId } from '../scenes/casinoFloorLayout'
import { openingDealEndsAt } from '../scenes/revealTimeline'
import { PlayerAction } from '../games/blackjack/types'
import { useBlackjackStore } from './useBlackjackStore'
import { useCrapsStore } from './useCrapsStore'
import { useGameStore } from './useGameStore'
import {
  isMultiplayerConfigured,
  joinRoom,
  type LocalIdentity,
  type RoomConnection,
} from '../net/room'
import {
  type Pose,
  pruneBuffer,
  type RemoteIdentity,
  type Snapshot,
  shouldSend,
  STALE_AFTER_MS,
} from '../world/presence'
import type { WalkBounds } from '../scenes/components/WalkingPlayer'
import {
  EMOTE_LABELS,
  type EmoteId,
  inviteTable,
  type Said,
  sanitizeSaid,
  sanitizeSayText,
  SAY_PREFIX,
} from '../world/emotes'
import { PlayMode, useSessionStore } from './useSessionStore'

/*
 * Who else is in the room.
 *
 * Two halves on purpose. The *roster* — names, outfits, seated or not — changes
 * rarely and lives in the store, so React re-renders when somebody arrives.
 * The *poses* change twelve times a second per player and live in a plain Map
 * outside it, read directly in `useFrame`. Putting poses in the store would
 * re-render every figure in the scene on every packet.
 */

/** How often a pose is sent, at most. Twelve is smooth once interpolated. */
const SEND_INTERVAL_MS = 1_000 / 12

/** Pose history per player, keyed by id. Not state: read every frame. */
const buffers = new Map<string, Snapshot[]>()

/** Reads a player's snapshot buffer. Empty array if they have sent nothing. */
export function poseBuffer(id: string): readonly Snapshot[] {
  return buffers.get(id) ?? []
}

interface PresenceStore {
  /** Everyone else in the room, keyed by id. */
  peers: Record<string, RemoteIdentity>
  /** True while the socket is up. False also means "multiplayer is off". */
  connected: boolean

  enterRoom: (roomId: string, bounds: WalkBounds, identity: LocalIdentity) => void
  leaveRoom: () => void
  /** Re-announces after a wardrobe or name change. */
  updateIdentity: (identity: LocalIdentity) => void
  /** Who holds the dice at the craps table, or null if nobody is there. */
  shooterId: string | null
  /** Everyone at the table, in arrival order, for placing them along the rail. */
  lineup: readonly string[]
  /**
   * The same, per table, because a casino has two of them.
   *
   * A single `lineup` is whichever table announced last, so the craps rail and
   * the blackjack seats overwrote each other and people were placed at whichever
   * game they were not standing at.
   */
  lineups: Readonly<Record<string, readonly string[]>>
  shooters: Readonly<Record<string, string | null>>
  /**
   * Who is in which seat, per table, as the room settled it.
   *
   * The authority on where a seated figure is drawn — for peers *and* for this
   * player. It used to be read off the deal's bet order, which meant nobody had
   * a seat until a round was dealt: two people who sat down and were still
   * choosing a stake were both drawn at their last walking pose, on the same
   * square of carpet beside the table.
   */
  seats: Readonly<Record<string, Readonly<Record<number, string>>>>
  /**
   * Wagers staked for the round being gathered, per table, keyed by player.
   *
   * The room relays every bet as it lands precisely so the felt can show chips
   * arriving one at a time. Dropping them on the floor is what made the bet
   * buttons look broken: in a shared game nothing whatever happens when you
   * click one until the whole table is in, which can be half a minute.
   */
  bets: Readonly<Record<string, Readonly<Record<string, number>>>>
  /**
   * When the latest wager landed, per table, on `performance.now()`.
   *
   * The face of the room's deal clock: the worker re-arms its own window on
   * exactly this event, so "latest bet plus `DEAL_WINDOW_MS`" is the deadline
   * without the deadline ever crossing the wire. Lives and dies with `bets` —
   * stamped where a bet lands, cleared where the deal clears them — so the
   * two cannot disagree about whether a gather is running.
   */
  betClocks: Readonly<Record<string, number>>
  /**
   * When the acting seat's turn last began, per table, on `performance.now()`.
   *
   * The face of the room's turn clock, on the same rule as `betClocks`: the
   * worker arms its fifteen-second window at the deal, on every action it
   * relays, and on the expiry it announces — and every one of those events
   * reaches every client, so "latest of them plus `TURN_WINDOW_MS`" is the
   * deadline without the deadline ever crossing the wire.
   */
  turnClocks: Readonly<Record<string, number>>
  /**
   * When each table's dice last flew, on `performance.now()`.
   *
   * The face of the room's roll window, third instance of the `betClocks`
   * rule: the worker refuses the next throw until the tumble and the table's
   * ten-second betting window have run, and it opens that window on the
   * `rolled` broadcast every client receives — so "that roll plus the window"
   * is the deadline without the deadline ever crossing the wire (issue #17).
   */
  rollClocks: Readonly<Record<string, number>>
  /**
   * Who has said "done betting" in the current roll window, per table.
   *
   * The count every rail watches fill: when it covers the lineup the room has
   * already ended the window, and the clients see the same skips it counted.
   * Reset by the next roll, which opens a fresh window and a fresh question.
   */
  rollSkips: Readonly<Record<string, readonly string[]>>
  /** Tells the room this player is done betting in the roll window. */
  skipRollWait: () => void
  /** This player's own id in the room, so the HUD can say "your roll". */
  selfId: string | null
  /** Asks the room to throw. It refuses unless it is this player's turn. */
  requestRoll: () => void
  /** Gives up the dice after a seven-out. */
  passDice: () => void
  /** Publishes the table for whoever walks up next. */
  publishTable: (value: unknown) => void
  /** Puts a blackjack wager in. The room deals once every seat has one. */
  sendBet: (amount: number) => void
  /** Says whether this player may take a turn at their table. */
  sendReady: (ready: boolean) => void
  /** Sends a blackjack action for the room to order and echo back. */
  sendAction: (action: string) => void
  setSeated: (seated: boolean, table: TableId | null, seat: number | null) => void
  /**
   * What each peer last said, stamped with when it arrived.
   *
   * In the store rather than a buffer because an emote is rare and *should*
   * re-render — a bubble has to mount. Only the stamp is stored; whether the
   * bubble is still up is derived per frame against `EMOTE_TTL_MS`, the same
   * timestamp-in, deadline-out rule as `betClocks`.
   */
  emotes: Readonly<Record<string, Said & { readonly at: number }>>
  /**
   * What this player last said, for the bubble over their own head.
   *
   * Its own field rather than an entry in `emotes`: that map is everyone
   * *else*, keyed by ids the room assigned, and the room never echoes an
   * emote back to its sender — so the only place a local echo can come from
   * is the send itself. Without it, pressing an emote is a button that
   * visibly does nothing on the sender's own screen.
   */
  selfEmote: (Said & { readonly at: number }) | null
  /**
   * An invitation waiting for an answer, or null.
   *
   * One at a time, latest wins: the response card is modal enough that a
   * queue of them would be a queue of interruptions. Cleared by answering,
   * dismissing, the asker leaving, or `INVITE_WINDOW_MS` running out.
   */
  invite: { readonly from: string; readonly table: TableId; readonly at: number } | null
  clearInvite: () => void
  /** Says something over this player's head. The room relays and rate-limits. */
  sendEmote: (emote: EmoteId) => void
  /** Says something typed. Sanitized before it is echoed or sent anywhere. */
  sendSay: (text: string) => void
}

/**
 * The least a client waits between its own emotes.
 *
 * Politeness, not enforcement — the room's window is the limit that holds.
 * This only keeps an ordinary player from ever meeting it: spaced like this, a
 * held key stays inside the room's burst and nothing is silently dropped.
 */
const EMOTE_MIN_GAP_MS = 1_000

/**
 * True while a `?boot=` link is driving the game and has not opted back in.
 *
 * Those links exist to make a capture reproducible, and a stranger wandering
 * into a regression shot is precisely the opposite — so a boot link disables
 * multiplayer by default, which is what keeps `npm run shots` and
 * `npm run walkthrough` unchanged.
 *
 * `?mp=1` opts back in, and exists for exactly one caller: `npm run
 * multiplayer`, which needs `?boot=strip` to skip the first-run designer *and*
 * needs the socket. Dev-only, so always false in a production build.
 *
 * Exported so the leaderboard's own connection obeys the same rule — a shot of
 * a junction must not have live strangers ranked across its billboard.
 */
export function isPresenceSuppressed(): boolean {
  if (!import.meta.env.DEV) return false

  const params = new URLSearchParams(window.location.search)
  return params.has('boot') && params.get('mp') !== '1'
}

export const usePresenceStore = create<PresenceStore>()((set) => {
  let connection: RoomConnection | null = null
  let sender: ReturnType<typeof setInterval> | null = null
  let lastSent: Pose | null = null
  let currentRoom: string | null = null
  let lastEmoteAt = 0

  function stop(): void {
    if (sender !== null) clearInterval(sender)
    sender = null
    connection?.close()
    connection = null
    lastSent = null
    currentRoom = null
    buffers.clear()
    set({ peers: {}, connected: false, emotes: {}, selfEmote: null, invite: null, rollClocks: {}, rollSkips: {} })
  }

  return {
    peers: {},
    connected: false,
    shooterId: null,
    lineup: [],
    lineups: {},
    shooters: {},
    seats: {},
    bets: {},
    betClocks: {},
    turnClocks: {},
    rollClocks: {},
    rollSkips: {},
    selfId: null,
    emotes: {},
    selfEmote: null,
    invite: null,

    clearInvite: () => set({ invite: null }),

    requestRoll: () => connection?.requestRoll(),
    skipRollWait: () => connection?.skipRollWait(),
    passDice: () => connection?.passDice(),
    publishTable: (value) => connection?.publishTable(value),
    sendBet: (amount) => connection?.sendBet(amount),
    sendReady: (ready) => connection?.sendReady(ready),
    sendAction: (action) => connection?.sendAction(action),

    sendEmote: (emote) => {
      const now = performance.now()
      if (now - lastEmoteAt < EMOTE_MIN_GAP_MS) return
      if (!connection) return
      lastEmoteAt = now
      connection.sendEmote(emote)
      /*
       * The local echo. The room broadcasts to everyone but the sender, so
       * nothing ever comes back to say this landed — the send is the only
       * event there is. Stamped only when one actually went out, which keeps
       * the feedback honest against the gap above; the room's own limit can
       * still drop it for everyone else, which the sender cannot know.
       */
      set({ selfEmote: { emote, text: EMOTE_LABELS[emote], at: now } })
    },

    sendSay: (raw) => {
      /*
       * Sanitized before it goes anywhere — including the local echo, so the
       * sender's own bubble shows exactly what everyone else will see rather
       * than the raw keystrokes. The receivers re-sanitize on the usual rule;
       * this is courtesy plus a refusal to put junk on the wire at all.
       */
      const text = sanitizeSayText(raw)
      if (text === null) return

      const now = performance.now()
      if (now - lastEmoteAt < EMOTE_MIN_GAP_MS) return
      if (!connection) return
      lastEmoteAt = now
      connection.sendEmote(`${SAY_PREFIX}${text}`)
      set({ selfEmote: { emote: null, text, at: now } })
    },

    enterRoom: (roomId, bounds, identity) => {
      /*
       * The mode check is deliberately here rather than in the scene that calls
       * this. "Play alone" has to mean no socket was ever opened — not peers
       * hidden after connecting — or `shouldSend`'s cost model stops describing
       * what a single-player session actually costs.
       */
      if (useSessionStore.getState().mode !== PlayMode.Multiplayer) return
      if (!isMultiplayerConfigured || isPresenceSuppressed()) return
      // Re-entering the same room on a re-render must not churn the socket.
      if (currentRoom === roomId) return

      stop()
      currentRoom = roomId

      connection = joinRoom(roomId, bounds, identity, {
        onIdentity: (person) => {
          set((state) => {
            // Never yourself, whatever socket the message came off. Your own
            // figure is drawn by the controller; a peer copy would be a ghost.
            if (person.id === state.selfId) return state
            return { peers: { ...state.peers, [person.id]: person } }
          })
        },

        /*
         * The welcome's snapshot replaces the roster outright.
         *
         * Whoever it does not name is not in the room, and this is the only
         * cleanup that can reach a peer stranded by a `left` broadcast while
         * this client was between sockets — nothing else ever removes one.
         */
        onRoster: (people) => {
          set((state) => ({
            peers: Object.fromEntries(
              people.filter((person) => person.id !== state.selfId)
                .map((person) => [person.id, person]),
            ),
          }))
        },

        onPose: (id, snapshot) => {
          const buffer = buffers.get(id) ?? []
          // Prune as we append, so a long session does not accumulate one
          // object per player per packet for its whole length.
          buffers.set(id, [...pruneBuffer(buffer, snapshot.at - STALE_AFTER_MS), snapshot])
        },

        onLeave: (id) => {
          buffers.delete(id)
          set((state) => {
            const peers = { ...state.peers }
            delete peers[id]
            // Their last words go with them; a bubble must not outlive the
            // figure it hangs over — and neither must their invitation, which
            // there is nobody left to accept.
            const emotes = { ...state.emotes }
            delete emotes[id]
            return {
              peers,
              emotes,
              invite: state.invite?.from === id ? null : state.invite,
            }
          })
        },

        onConnectedChange: (connected) => set({ connected }),

        /*
         * Somebody said something. Coerced here, at the seam where wire
         * strings become state — the room relays without reading, so this is
         * the only gate between a hostile peer and a canvas texture. Both
         * kinds of speech come through it: a catalogue id resolves to its
         * label, `say:`-prefixed text is sanitized as prose.
         */
        onEmote: (id, emote) => {
          const said = sanitizeSaid(emote)
          if (said === null) return
          const table = said.emote !== null ? inviteTable(said.emote) : null
          set((state) => ({
            emotes: { ...state.emotes, [id]: { ...said, at: performance.now() } },
            // An invite raises the response card; latest asker wins.
            ...(table !== null
              ? { invite: { from: id, table, at: performance.now() } }
              : {}),
          }))
        },

        /*
         * The room threw. Every client at the table settles the same numbers
         * with its own engine, which is what makes shared craps affordable:
         * `phase` and `point` depend only on the roll, never on anybody's bets,
         * so identical rolls give identical tables without the room knowing
         * what a point is.
         */
        onRolled: (table, roll) => {
          useCrapsStore.getState().applyRoll({ ...roll, total: roll.first + roll.second })
          /*
           * Stamped per table, guarded on craps — the cross-table lesson
           * `onExpired` records: only the craps table has dice, and a clock
           * keyed on whatever string arrived would let one table's roll close
           * the other's betting.
           */
          if (table === TableId.Craps) {
            set((state) => {
              // A fresh window is a fresh question — the skips empty with it.
              const rollSkips = { ...state.rollSkips }
              delete rollSkips[table]
              return {
                rollClocks: { ...state.rollClocks, [table]: performance.now() },
                rollSkips,
              }
            })
          }
        },

        onSkipped: (table, id) => {
          if (table !== TableId.Craps) return
          set((state) => {
            const skipped = state.rollSkips[table] ?? []
            if (skipped.includes(id)) return state
            return { rollSkips: { ...state.rollSkips, [table]: [...skipped, id] } }
          })
        },

        onSelf: (id) => set({ selfId: id }),

        /*
         * The blackjack table, dealt from a seed every client shares.
         *
         * Routed straight through rather than held here: the presence store
         * knows who is in the room, and what a shoe is belongs in the game
         * store that already owns one.
         */
        onDeal: (table, seed, bets) => {
          if (table !== TableId.Blackjack) return
          // The gather is over; the chips on the felt are the dealt hands now,
          // and the deal clock they were counting against is spent with them.
          // The turn clock takes their place — stamped for when the deal
          // *animation* ends, not for now: the room grants the same grace
          // (`dealGraceMs`, its mirror of `openingDealEndsAt`), so nobody's
          // fifteen seconds tick away while the cards are still flying.
          set((state) => {
            const betClocks = { ...state.betClocks }
            delete betClocks[table]
            return {
              bets: { ...state.bets, [table]: {} },
              betClocks,
              turnClocks: {
                ...state.turnClocks,
                [table]: performance.now() + openingDealEndsAt(bets.length),
              },
            }
          })
          useBlackjackStore.getState().applyDeal(seed, bets, usePresenceStore.getState().selfId)
        },

        onAction: (table, id, action) => {
          if (table !== TableId.Blackjack) return

          // The room re-arms its turn window on every action it relays — an
          // action buys the next decision a fresh fifteen — so the face shown
          // for it restarts on exactly the same event.
          set((state) => ({ turnClocks: { ...state.turnClocks, [table]: performance.now() } }))

          /*
           * Insurance rides the action channel as `insure:<amount>` — the room
           * relays action strings without reading them, so a new decision
           * needs no new message and no worker deploy. Parsed here because
           * this is the seam where wire strings become engine calls.
           */
          if (action.startsWith('insure:')) {
            const amount = Number(action.slice('insure:'.length))
            if (Number.isInteger(amount) && amount >= 0) {
              useBlackjackStore.getState().applyInsurance(id, amount)
            }
            return
          }

          useBlackjackStore.getState().applyAction(id, action as PlayerAction)
        },

        /*
         * Every wager as it lands, so a click has something to show for itself.
         *
         * Kept here rather than pushed into the blackjack store because it is
         * not a hand: it is what the *room* is holding for a round that has not
         * been dealt, and half of it belongs to other people.
         */
        onBet: (table, id, amount) =>
          set((state) => ({
            bets: { ...state.bets, [table]: { ...(state.bets[table] ?? {}), [id]: amount } },
            // Every bet restarts the room's deal window, so every bet restarts
            // the face shown for it — a countdown that visibly resets when a
            // second player stakes is telling the truth.
            betClocks: { ...state.betClocks, [table]: performance.now() },
          })),

        onSeats: (table, seats) => set((state) => ({ seats: { ...state.seats, [table]: seats } })),

        /*
         * Which table ran out of time, which this ignored entirely.
         *
         * A craps shooter letting their clock expire made every blackjack
         * player at the other table stand — a hand ended, by somebody who was
         * not playing it, in a different game.
         */
        onExpired: (table) => {
          if (table !== TableId.Blackjack) return
          // The expiry hands the turn to the next seat, and the room re-arms
          // its window as it announces it — restart the face to match.
          set((state) => ({ turnClocks: { ...state.turnClocks, [table]: performance.now() } }))
          useBlackjackStore.getState().applyExpiry()
        },

        onShooter: (table, id, lineup) =>
          set((state) => ({
            shooterId: id,
            lineup,
            lineups: { ...state.lineups, [table]: lineup },
            shooters: { ...state.shooters, [table]: id },
          })),

        /*
         * The table as it stood when somebody last published it. Only adopted
         * when this client has not rolled yet — otherwise a late packet would
         * drag a table that has moved on back to an older hand.
         */
        onTableState: (table, value) => {
          // Craps only. A blackjack join is answered with a blackjack snapshot,
          // and handing that to the craps store is a point set by another game.
          if (table !== TableId.Craps) return
          useCrapsStore.getState().adoptTable(value)
        },
      })

      if (!connection) {
        currentRoom = null
        return
      }

      /*
       * The send loop. Deliberately a timer sampling a mutable transform rather
       * than a subscription: the transform changes every frame and this has to
       * be the thing that decides how often that becomes a packet.
       *
       * `shouldSend` is what keeps the running cost at zero — a player stood at
       * a table sends nothing, so the room hibernates.
       */
      sender = setInterval(() => {
        /*
         * A seated player transmits nothing at all.
         *
         * `WalkingPlayer` unmounts when you sit down, so the transform it feeds
         * this loop stops being written — and for somebody who arrived already
         * seated it was never written at all, leaving it at the origin. The
         * craps table is deliberately *at* the world origin, so the result was
         * a figure standing in the middle of the felt.
         *
         * `shouldSend` already keeps a stationary player quiet; this keeps a
         * seated one honest, and costs nothing either way.
         */
        const game = useGameStore.getState()
        if (game.activeTable !== null || game.atChair !== null) return

        const pose = getLocalTransform()
        if (!shouldSend(lastSent, pose)) return

        /*
         * Only recorded once it has actually gone out.
         *
         * The first tick fires about eighty milliseconds after joining, which
         * beats a real WebSocket handshake but not a local one. Recording the
         * pose regardless meant `shouldSend` went quiet for ever afterwards, so
         * a player who connected and stood still was never transmitted at all —
         * invisible to the room until they happened to walk. It passed against
         * a local worker and failed against a deployed one.
         */
        if (connection?.send(pose) === true) lastSent = { ...pose }
      }, SEND_INTERVAL_MS)
    },

    leaveRoom: stop,

    updateIdentity: (identity) => connection?.announce(identity),

    // Not mirrored into `peers`: that roster is everyone *else*, and we never
    // draw ourselves from it.
    setSeated: (seated, table, seat) => connection?.setSeated(seated, table, seat),
  }
})
