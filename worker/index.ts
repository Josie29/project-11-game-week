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
}

type Incoming = JoinMessage | MoveMessage | SeatMessage

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
}

export interface Env {
  readonly ROOM: DurableObjectNamespace
}

/** Caps a room, so one object cannot be used to fan out to an arbitrary crowd. */
const MAX_OCCUPANTS = 32

/** Longest a single message may be. A pose is a few dozen bytes. */
const MAX_MESSAGE_BYTES = 4_096

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
    const attachment: Attachment = { id: crypto.randomUUID(), identity: null, pose: null }
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
        }
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
          attachment.identity.seated = message.seated === true
          ws.serializeAttachment(attachment)
          this.broadcast(ws, { t: 'seated', id: attachment.id, seated: message.seated === true })
        }
        return
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
    if (attachment) this.broadcast(ws, { t: 'left', id: attachment.id })
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

    // /room/<name> — the name is the room, so the strip and each venue get
    // their own object without the server knowing what any of them are.
    const match = /^\/room\/([A-Za-z0-9:_-]{1,64})$/.exec(url.pathname)
    if (!match?.[1]) return new Response('Not found', { status: 404 })

    const id = env.ROOM.idFromName(match[1])
    return env.ROOM.get(id).fetch(request)
  },
}
