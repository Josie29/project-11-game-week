/*
 * The presence server: one Durable Object per room, and nothing else.
 *
 * Deliberately outside `src/`. It is not part of the Vite build, must never
 * reach the game bundle, and is deployed on its own with `wrangler deploy`.
 *
 * It knows nothing about blackjack, craps, money or saves. It relays poses
 * between the people currently in a room and forgets all of it the moment they
 * leave — which is the whole reason Tier 1 needs no authority and no database.
 *
 * The wire shapes below are deliberately duplicated rather than imported from
 * `src/`: this is a network boundary, the two sides deploy separately, and a
 * shared type would hide the fact that an old client can talk to a new server.
 */

/** How the client identifies itself and what it looks like. */
interface JoinMessage {
  readonly t: 'join'
  readonly name?: unknown
  readonly appearance?: unknown
  readonly owned?: unknown
  readonly equipped?: unknown
  readonly seated?: unknown
  readonly table?: unknown
}

interface MoveMessage {
  readonly t: 'move'
  readonly x?: unknown
  readonly z?: unknown
  readonly yaw?: unknown
  readonly speed?: unknown
}

interface SeatMessage {
  readonly t: 'seat'
  readonly seated?: unknown
  /**
   * Which table, relayed but never interpreted.
   *
   * The server does not know what a blackjack table is and does not need to.
   * It passes the value along so the clients can agree on who is standing at
   * which game, on the same rule as every other identity field here.
   */
  readonly table?: unknown
}

/**
 * "I am taking my turn." The room decides whether it is yours.
 *
 * The dice are the one thing the room generates rather than relays. A shooter
 * who rolled their own numbers and broadcast them could hit their point ten
 * times in a row in front of four strangers — which costs nobody money, since
 * every bet here is against the house, and ruins the only thing a craps table
 * is for.
 */
interface RollMessage {
  readonly t: 'roll'
}

/** "My turn is over." Why it is over is the client's business, not the room's. */
interface PassMessage {
  readonly t: 'pass'
}

/**
 * Table state, stored and relayed without ever being read.
 *
 * A player who walks up mid-hand has to start from the table as it stands
 * rather than from a fresh come-out. That is the only reason the room holds
 * anything at all, and it holds it as an opaque value: the clients agree what
 * is in there, and the room stays a relay that knows nothing about craps.
 */
interface StateMessage {
  readonly t: 'state'
  readonly value?: unknown
}

/** "Here is my wager." Held until every seat has one, then dealt on. */
interface BetMessage {
  readonly t: 'bet'
  readonly amount?: unknown
}

/**
 * "I hit / stand / double / split." Relayed in the order it arrives.
 *
 * The order *is* the protocol: one object processes messages serially, so the
 * sequence it broadcasts is a total order, and every client replaying that
 * sequence through the same pure engine consumes the same cards. The room does
 * not know what any of these words mean and does not check whose turn it is —
 * every client rejects an out-of-turn action identically, because the rule is
 * in the engine rather than here.
 */
interface ActionMessage {
  readonly t: 'action'
  readonly action?: unknown
}

type Incoming =
  | JoinMessage
  | MoveMessage
  | SeatMessage
  | RollMessage
  | PassMessage
  | StateMessage
  | BetMessage
  | ActionMessage

/**
 * What the server remembers about one connection.
 *
 * Held in the socket's attachment rather than a `Map`, because a hibernating
 * object loses its memory but keeps its sockets. A roster in a `Map` would come
 * back empty after the first lull and every player would vanish from everyone
 * else's screen while still connected.
 */
interface Attachment {
  readonly id: string
  identity: Record<string, unknown> | null
  pose: { x: number; z: number; yaw: number; speed: number } | null
  /**
   * When this player took their place at a table, for ordering the queue.
   *
   * In the attachment rather than a `Map` for the same reason as everything
   * else here: a hibernating object keeps its sockets and loses its memory, and
   * a queue that reset on the first lull would hand the dice to whoever
   * happened to move next.
   */
  tookTableAt: number | null
  /**
   * This player's wager for the round being gathered, or null if not in yet.
   *
   * On the attachment rather than in memory or in storage, for the reason the
   * whole file keeps repeating: a hibernating object keeps its sockets and
   * loses everything else. A `Map` of bets would come back empty after the
   * first lull and the table would deal a round nobody had staked.
   */
  bet: number | null
}

export interface Env {
  readonly ROOM: DurableObjectNamespace
}

/** Caps a room, so one object cannot be used to fan out to an arbitrary crowd. */
const MAX_OCCUPANTS = 32

/** Longest a single message may be. A pose is a few dozen bytes. */
const MAX_MESSAGE_BYTES = 4_096

/**
 * How many players can be in line for the dice at one table.
 *
 * The room holds 32, and 32 people queued for one pair of dice is a wait
 * through 31 other turns. Everyone beyond this still stands at the rail and
 * still bets their own board — they are simply not in line to shoot, which is
 * what a busy real table looks like too.
 */
const MAX_AT_TABLE = 8

/**
 * What the room should do when a turn clock runs out.
 *
 * The one place any game knowledge reaches the server, and it is here because a
 * closed tab cannot roll its own dice: somebody has to, and only the room is
 * still there. It is two words rather than a rule — throw, or say the turn is
 * over — and which one applies is chosen by the client that armed the clock.
 */
type ExpiryKind = 'roll' | 'turn'

/**
 * How long the holder of the dice has to roll before the room rolls for them.
 *
 * The room is not judging a game here — it does not know what a point is. It
 * knows only that somebody was handed the dice and has not thrown them, which
 * is enough to stop a closed tab freezing a table full of people.
 */
const ROLL_TIMEOUT_MS = 30_000

/**
 * One fair die.
 *
 * Rejection sampling rather than `% 6`: 256 is not divisible by six, so a
 * modulo would make ones and twos fractionally likelier than fives and sixes.
 * Nobody would ever notice, and it would still be a loaded die in a casino.
 */
/**
 * A 32-bit seed for a shoe, from the same source as the dice.
 *
 * `crypto.getRandomValues`, not `Math.random`: this decides the order of three
 * hundred and twelve cards that five people are about to be paid out of.
 */
function seed32(): number {
  const words = new Uint32Array(1)
  crypto.getRandomValues(words)
  return words[0]! >>> 0
}

/** Two dice, thrown together. */
function die2(): { first: number; second: number } {
  return { first: die(), second: die() }
}

function die(): number {
  const bytes = new Uint8Array(1)
  do {
    crypto.getRandomValues(bytes)
  } while (bytes[0]! >= 252)

  return (bytes[0]! % 6) + 1
}

export class Room implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    if (this.state.getWebSockets().length >= MAX_OCCUPANTS) {
      return new Response('Room is full', { status: 503 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    /*
     * `acceptWebSocket`, never `accept()`. The plain accept keeps the object
     * pinned in memory and bills duration for the entire time the socket is
     * open — which turns a free hibernating room into a rented server, from a
     * one-word difference.
     */
    this.state.acceptWebSocket(server)

    // `crypto.randomUUID` server-side on purpose: a client-supplied id could be
    // used to impersonate somebody already in the room.
    const attachment: Attachment = {
      id: crypto.randomUUID(),
      identity: null,
      pose: null,
      tookTableAt: null,
      bet: null,
    }
    server.serializeAttachment(attachment)

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return

    let message: Incoming
    try {
      message = JSON.parse(raw) as Incoming
    } catch {
      // A peer sending malformed JSON is ignored, not disconnected. Clients
      // reconnect on close, so dropping them turns one bad packet into a loop.
      return
    }

    const attachment = ws.deserializeAttachment() as Attachment | null
    if (!attachment) return

    switch (message.t) {
      case 'join': {
        attachment.identity = {
          name: message.name,
          appearance: message.appearance,
          owned: message.owned,
          equipped: message.equipped,
          seated: message.seated === true,
          table: typeof message.table === 'string' ? message.table : null,
        }
        attachment.tookTableAt = attachment.identity.table === null ? null : Date.now()
        ws.serializeAttachment(attachment)

        // Everyone already here, so the new arrival sees a populated room
        // rather than one that fills in as people happen to move.
        ws.send(
          JSON.stringify({
            t: 'welcome',
            id: attachment.id,
            peers: this.roster(ws),
          }),
        )

        /*
         * A player who walks up to a table mid-hand starts from the table as it
         * stands, not from a fresh come-out. Sent after the welcome so the
         * roster is already in place, and only when they arrived at a table at
         * all — most joins are somebody stepping onto the street.
         */
        const joinedTable = attachment.identity.table
        if (typeof joinedTable === 'string') {
          let stored: unknown = null
          try {
            stored = await this.state.storage.get(`state:${joinedTable}`)
          } catch {
            // A newcomer starting from a fresh come-out is a worse table than
            // one that starts mid-hand, and a far better one than no table.
          }
          ws.send(JSON.stringify({ t: 'state', table: joinedTable, value: stored ?? null }))
          await this.announceShooter(joinedTable)
        }

        this.broadcast(ws, { t: 'joined', player: { id: attachment.id, ...attachment.identity } })
        return
      }

      case 'move': {
        // Relayed verbatim. Every client re-sanitizes on receipt, so validating
        // here would be a second implementation of the same rule that could
        // drift from the one that actually protects the renderer.
        attachment.pose = {
          x: Number(message.x),
          z: Number(message.z),
          yaw: Number(message.yaw),
          speed: Number(message.speed),
        }
        ws.serializeAttachment(attachment)

        this.broadcast(ws, { t: 'moved', id: attachment.id, ...attachment.pose })
        return
      }

      case 'seat': {
        if (attachment.identity) {
          const table = typeof message.table === 'string' ? message.table : null
          // Only stamped on arrival, so re-announcing a wardrobe change while
          // stood at the table does not send the player to the back of a queue
          // they were already at the front of.
          if (table !== attachment.identity.table) {
            attachment.tookTableAt = table === null ? null : Date.now()
          }
          attachment.identity.seated = message.seated === true
          attachment.identity.table = table
          ws.serializeAttachment(attachment)
          this.broadcast(ws, {
            t: 'seated',
            id: attachment.id,
            seated: message.seated === true,
            table,
          })
        }
        return
      }

      case 'roll': {
        void this.throwFor(attachment)
        return
      }

      case 'pass': {
        void this.passDice(attachment)
        return
      }

      case 'bet': {
        const table = attachment.identity?.table
        if (typeof table !== 'string') return

        const amount = Number(message.amount)
        if (!Number.isInteger(amount) || amount < 0) return

        attachment.bet = amount
        ws.serializeAttachment(attachment)
        // Relayed as it lands so the felt can show chips arriving one at a
        // time, rather than five stacks appearing at the moment of the deal.
        this.sendAll({ t: 'bet', table, id: attachment.id, amount })

        void this.dealIfEverybodyHasBet(table)
        return
      }

      case 'action': {
        const table = attachment.identity?.table
        if (typeof table !== 'string') return
        if (typeof message.action !== 'string') return

        /*
         * Relayed without asking whose turn it is.
         *
         * Every client applies this through the same pure engine, which refuses
         * an out-of-turn action — so an illegal one is rejected identically
         * everywhere and the room never has to learn the rule. This is the same
         * bargain as the dice: the room orders, it does not referee.
         */
        this.sendAll({ t: 'action', table, id: attachment.id, action: message.action })
        void this.armTurnClock(table, 'turn')
        return
      }

      case 'state': {
        const table = attachment.identity?.table
        if (typeof table !== 'string') return
        // Stored without being read. The clients agree what is in here; the
        // room only has to hand it to whoever arrives next.
        void this.state.storage.put(`state:${table}`, message.value ?? null).catch(() => {})
        this.broadcast(ws, { t: 'state', table, value: message.value ?? null })
        return
      }
    }
  }

  /**
   * Everyone at one table, in the order they arrived, capped.
   *
   * The room does not know what the table id means — it groups by whatever
   * string the clients sent, which is what keeps it a relay rather than a
   * referee.
   */
  private queueFor(table: string): { id: string; socket: WebSocket }[] {
    const line: { id: string; socket: WebSocket; at: number }[] = []

    for (const socket of this.state.getWebSockets()) {
      const held = socket.deserializeAttachment() as Attachment | null
      if (!held?.identity || held.identity.table !== table) continue
      line.push({ id: held.id, socket, at: held.tookTableAt ?? 0 })
    }

    // Ties broken by id so every client and the room agree on the same order.
    line.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    return line.slice(0, MAX_AT_TABLE).map(({ id, socket }) => ({ id, socket }))
  }

  /**
   * Deals once every occupied seat has staked something.
   *
   * The only place the room waits for the whole table rather than relaying one
   * player's move, and it exists because one `placeBets` deals every seat at
   * once — unlike a roll, a deal cannot happen a player at a time.
   *
   * "Everybody" is a count of sockets at the table, not a rule about blackjack.
   */
  private async dealIfEverybodyHasBet(table: string): Promise<void> {
    const line = this.queueFor(table)
    if (line.length === 0) return

    const bets: { id: string; amount: number }[] = []
    for (const { id, socket } of line) {
      const held = socket.deserializeAttachment() as Attachment | null
      if (!held || held.bet === null) return
      bets.push({ id, amount: held.bet })
    }

    await this.dealRound(table, bets)
  }

  /**
   * Starts a round: one seed for the shoe, and the wagers in seat order.
   *
   * The seed rather than the cards, because every client already has
   * `createShoe` and building the same shoe from the same number is cheaper
   * than sending three hundred and twelve of them — and it keeps the room from
   * ever holding a deck.
   */
  private async dealRound(table: string, bets: { id: string; amount: number }[]): Promise<void> {
    this.sendAll({ t: 'deal', table, seed: seed32(), bets })

    // Cleared as the round starts, so the next gather begins from nobody.
    for (const socket of this.state.getWebSockets()) {
      const held = socket.deserializeAttachment() as Attachment | null
      if (held && held.identity?.table === table && held.bet !== null) {
        held.bet = null
        socket.serializeAttachment(held)
      }
    }

    await this.armTurnClock(table, 'turn')
  }

  /** Whoever currently holds the dice at a table, or null if nobody is there. */
  private shooterAt(table: string): { id: string; socket: WebSocket } | null {
    return this.queueFor(table)[0] ?? null
  }

  /**
   * Generates a roll and tells the room, if it is this player's turn.
   *
   * `crypto.getRandomValues` rather than `Math.random`, and rejection sampling
   * rather than a modulo: 256 does not divide by 6, so `% 6` would make ones
   * and twos fractionally likelier than fives and sixes. Nobody would ever see
   * it and it would still be a loaded die.
   */
  private async throwFor(attachment: Attachment): Promise<void> {
    const table = attachment.identity?.table
    if (typeof table !== 'string') return
    if (this.shooterAt(table)?.id !== attachment.id) return

    /*
     * Broadcast first, persist second, and never the other way round.
     *
     * The alarm is a convenience — it covers a shooter who wanders off. The
     * roll is the game. Awaiting storage before sending meant one storage
     * failure swallowed the throw for everybody at the table, which is a far
     * worse outcome than a missing timeout.
     */
    this.sendAll({ t: 'rolled', table, shooter: attachment.id, ...die2() })
    await this.armRollTimeout(table)
  }

  /** Moves the dice to the next player in line and tells everyone. */
  private async passDice(attachment: Attachment): Promise<void> {
    const table = attachment.identity?.table
    if (typeof table !== 'string') return
    if (this.shooterAt(table)?.id !== attachment.id) return

    // Sending them to the back is the whole rotation: the queue is ordered by
    // when each player took the table, so a fresh stamp is last place.
    attachment.tookTableAt = Date.now()
    for (const socket of this.state.getWebSockets()) {
      const held = socket.deserializeAttachment() as Attachment | null
      if (held?.id === attachment.id) socket.serializeAttachment(attachment)
    }

    await this.announceShooter(table)
  }

  /** Tells the room who holds the dice now, and starts their clock. */
  private async announceShooter(table: string): Promise<void> {
    const shooter = this.shooterAt(table)
    this.sendAll({ t: 'shooter', table, id: shooter?.id ?? null })
    await this.armRollTimeout(table)
  }

  /**
   * Sets the alarm that rolls for a shooter who has gone quiet.
   *
   * The alarm is the one thing here that can put the bill above zero, because
   * it wakes a hibernating object on purpose. It is armed only while somebody
   * holds the dice and cleared the moment nobody does — an alarm that can be
   * set at an empty table is a rented server by another route.
   */
  private async armTurnClock(table: string, kind: ExpiryKind): Promise<void> {
    try {
      await this.state.storage.put('alarmTable', table)
      await this.state.storage.put('alarmKind', kind)
      await this.state.storage.setAlarm(Date.now() + ROLL_TIMEOUT_MS)
    } catch {
      // Best-effort, like every other storage touch here. Losing the clock
      // costs a stalled seat; letting it throw would cost the whole relay.
    }
  }

  private async armRollTimeout(table: string): Promise<void> {
    /*
     * Best-effort, and deliberately so. Everything this room exists to do is a
     * broadcast; storage only makes the force-roll and the mid-hand handover
     * possible. A failure here must degrade those, never stop the relay — an
     * awaited storage call in front of a `send` is how one of them took the
     * whole table down.
     */
    try {
      if (this.shooterAt(table) === null) {
        await this.state.storage.deleteAlarm()
        return
      }

      await this.state.storage.put('alarmTable', table)
      await this.state.storage.put('alarmKind', 'roll')
      await this.state.storage.setAlarm(Date.now() + ROLL_TIMEOUT_MS)
    } catch {
      // No alarm. The table still plays; a vanished shooter just holds the dice
      // until somebody reloads.
    }
  }

  /**
   * The shooter did not throw. Throw for them.
   *
   * A table full of people with money on the felt must not be frozen by one
   * closed tab. The dice pass on the client's own seven-out, exactly as if the
   * absent player had rolled it themselves.
   */
  async alarm(): Promise<void> {
    let table: unknown = null
    try {
      table = await this.state.storage.get('alarmTable')
    } catch {
      return
    }
    if (typeof table !== 'string') return

    let kind: unknown = 'roll'
    try {
      kind = await this.state.storage.get('alarmKind')
    } catch {
      // Fall through on 'roll', which is the older of the two behaviours.
    }

    /*
     * A turn that ran out, at a table where nobody is waiting on dice.
     *
     * The room says only that the clock expired. Each client applies its own
     * rule — a stand, which can neither bust a hand the player might have kept
     * nor spend money they did not stake. The room still does not know what
     * standing is.
     */
    if (kind === 'turn') {
      this.sendAll({ t: 'expired', table })
      return
    }

    const shooter = this.shooterAt(table)
    if (!shooter) {
      await this.armRollTimeout(table)
      return
    }

    this.sendAll({ t: 'rolled', table, shooter: shooter.id, ...die2() })
    await this.armRollTimeout(table)
  }

  /** Sends to everyone including the sender — a roll is the same for all. */
  private sendAll(payload: unknown): void {
    const body = JSON.stringify(payload)

    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(body)
      } catch {
        // One socket gone must not stop the rest of the room hearing the roll.
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.announceDeparture(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.announceDeparture(ws)
  }

  private announceDeparture(ws: WebSocket): void {
    const attachment = ws.deserializeAttachment() as Attachment | null
    if (!attachment) return

    this.broadcast(ws, { t: 'left', id: attachment.id })

    /*
     * If the shooter is the one who left, the dice have to move before anybody
     * notices they are gone. The socket is already closing, so it is out of
     * `queueFor` by the time this runs and the next player is simply the head.
     */
    const table = attachment.identity?.table
    if (typeof table === 'string') void this.tableEmptied(table)
  }

  /**
   * Hands the dice on, and forgets the round once the last player has gone.
   *
   * A table that empties has to forget what it was doing. The state kept for a
   * mid-hand arrival is *only* useful while somebody is still playing the hand;
   * once nobody is, it becomes a lie told to whoever walks up next — a point of
   * 8 from a session that ended hours ago, which closes the pass line for a
   * player standing at an empty table wondering why they cannot make the one
   * bet the game opens with.
   *
   * Deliberately not cleared on a handover. One player leaving mid-point while
   * another is still there must leave the point exactly where it is.
   */
  private async tableEmptied(table: string): Promise<void> {
    if (this.queueFor(table).length > 0) {
      await this.announceShooter(table)
      return
    }

    this.sendAll({ t: 'shooter', table, id: null })

    try {
      await this.state.storage.delete(`state:${table}`)
      await this.state.storage.deleteAlarm()
    } catch {
      // Best-effort, like every storage touch here. A state that outlives its
      // table is a bad round; a throw here would be a dead relay.
    }
  }

  /** Everyone in the room except `self`, with whatever pose they last sent. */
  private roster(self: WebSocket): unknown[] {
    const peers: unknown[] = []

    for (const socket of this.state.getWebSockets()) {
      if (socket === self) continue

      const attachment = socket.deserializeAttachment() as Attachment | null
      // Someone mid-handshake has no identity yet; they will announce themselves.
      if (!attachment?.identity) continue

      peers.push({ id: attachment.id, ...attachment.identity, pose: attachment.pose })
    }

    return peers
  }

  /** Sends to everyone but the sender. Outgoing messages are not billed. */
  private broadcast(self: WebSocket, payload: unknown): void {
    const body = JSON.stringify(payload)

    for (const socket of this.state.getWebSockets()) {
      if (socket === self) continue
      try {
        socket.send(body)
      } catch {
        // A socket that has gone away mid-broadcast must not stop the rest of
        // the room hearing about it.
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 })
    }

    /*
     * /room/<name> — the name is the room, so the strip and each venue get
     * their own object without the server knowing what any of them are.
     *
     * Decoded before it is validated, and that is the whole bug this comment
     * exists for. Venue rooms are named `venue:golden-ace`, the client sends
     * them through `encodeURIComponent`, and the colon arrives as `%3A`. The
     * pattern allowed a literal `:` but not a `%`, so every indoor room 404'd
     * at the handshake and the client reconnected in a loop — for months, and
     * on every deploy, because the only room anybody ever tested was `strip`
     * and `strip` has no colon in it.
     *
     * The charset guard stays. It is what stops an arbitrary string becoming a
     * Durable Object name, and it now checks the string that actually gets
     * used rather than its wire spelling.
     */
    const encoded = /^\/room\/([^/]{1,96})$/.exec(url.pathname)?.[1]
    if (encoded === undefined) return new Response('Not found', { status: 404 })

    let room: string
    try {
      room = decodeURIComponent(encoded)
    } catch {
      // Malformed percent-encoding throws rather than returning anything, and
      // an unhandled throw here is a 500 for what is really a bad request.
      return new Response('Not found', { status: 404 })
    }

    if (!/^[A-Za-z0-9:_-]{1,64}$/.test(room)) {
      return new Response('Not found', { status: 404 })
    }

    const id = env.ROOM.idFromName(room)
    return env.ROOM.get(id).fetch(request)
  },
}
