/*
 * The two things only the room can be asked about.
 *
 * A seat is exclusive and a betting window has to survive the traffic around
 * it, and neither is decidable on a client: two players can each believe they
 * took the same stool, and the clock that deals the table lives in a Durable
 * Object. Both shipped broken and neither was visible from the game.
 *
 * Talks to the room over a raw socket rather than through two browsers, because
 * both claims are about *timing* — two messages inside one round trip, and a
 * thirty-second window interrupted at second seven. `sharedBlackjack.mjs` drives
 * the real UI; this drives the wire.
 *
 * Against a deployed worker is the run that counts. `wrangler dev` is miniflare
 * with no network in front of it, so anything racing the handshake passes there
 * and fails in production.
 *
 * Usage: node scripts/seatClaims.mjs [wss://host]
 */

const BASE = process.argv[2] ?? 'wss://neon-strip-presence.twobearslabs.workers.dev'
const TABLE = 'blackjack'

/** The room's own window before it deals to whoever has staked, plus slack. */
const DEAL_WINDOW_MS = 30_000
const SLACK_MS = 6_000

const failures = []
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * One connected player, with everything the room has told them.
 *
 * `seats` and `deals` are last-write-wins rather than a log: every assertion
 * below is about the state the room settled on, not the order it got there.
 */
function connect(room) {
  const socket = new WebSocket(`${BASE}/room/${encodeURIComponent(room)}`)
  const player = { socket, id: null, seats: {}, deals: [], bets: [] }

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)

    if (message.t === 'welcome') player.id = message.id
    if (message.t === 'seats' && message.table === TABLE) player.seats = message.seats
    if (message.t === 'deal' && message.table === TABLE) player.deals.push(message)
    if (message.t === 'bet' && message.table === TABLE) player.bets.push(message)
  })

  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(player))
    socket.addEventListener('error', () => reject(new Error('socket failed to open')))
  })
}

/** Announces identity, which is also how a seat is claimed and released. */
function announce(player, { name, seat, table = TABLE }) {
  player.socket.send(
    JSON.stringify({
      t: 'join',
      name,
      appearance: {},
      owned: [],
      equipped: {},
      seated: seat !== null,
      table,
      seat,
    }),
  )
}

/** Which seat the room says a player holds, or null. */
const seatOf = (player, id) =>
  Object.keys(player.seats).find((seat) => player.seats[seat] === id) ?? null

const room = (suffix) => `venue:seatcheck-${process.pid}-${suffix}`

/* ------------------------------------------------------------------ claims */

{
  const a = await connect(room('claim'))
  const b = await connect(room('claim'))

  // Both reach for seat 2 without waiting for the other, which is what two
  // players walking up to one stool and pressing F actually looks like.
  announce(a, { name: 'Aaa', seat: 2 })
  announce(b, { name: 'Bbb', seat: 2 })
  await wait(1500)

  const holder = a.seats['2'] ?? null
  check('one stool, one player', holder !== null && a.seats['2'] === b.seats['2'], JSON.stringify(a.seats))
  check(
    'both clients agree who got it',
    JSON.stringify(a.seats) === JSON.stringify(b.seats),
    `${JSON.stringify(a.seats)} vs ${JSON.stringify(b.seats)}`,
  )
  check('the loser is left seatless', Object.keys(a.seats).length === 1, JSON.stringify(a.seats))

  // The one who missed out takes a different stool, which is the whole point of
  // being told: their client stands them up and they walk to a free one.
  const loser = holder === a.id ? b : a
  announce(loser, { name: 'Loser', seat: 4 })
  await wait(1200)

  check('the loser can take a free seat', a.seats['4'] === loser.id, JSON.stringify(a.seats))
  check('and the winner keeps theirs', a.seats['2'] === holder, JSON.stringify(a.seats))

  /*
   * A re-announce is a wardrobe change, not a fresh claim. Treated as one it
   * would evict the player from the seat they are sitting in every time they
   * put a jacket on.
   */
  announce(loser, { name: 'Loser', seat: 4 })
  await wait(800)
  check('a re-announce does not evict you', a.seats['4'] === loser.id, JSON.stringify(a.seats))

  // Standing up hands the stool back. Without this the table fills up with
  // seats held by people who left the room hours ago.
  announce(loser, { name: 'Loser', seat: null, table: null })
  await wait(1000)
  check('standing up frees the stool', a.seats['4'] === undefined, JSON.stringify(a.seats))

  // ...and so does closing the tab, which is the commoner way to leave.
  const winner = holder === a.id ? a : b
  const watcher = holder === a.id ? b : a
  winner.socket.close()
  await wait(1200)
  check('a dropped socket frees the stool', watcher.seats['2'] === undefined, JSON.stringify(watcher.seats))

  a.socket.close()
  b.socket.close()
}

/* ---------------------------------------------------------- the deal window */

{
  const a = await connect(room('window'))
  const b = await connect(room('window'))

  announce(a, { name: 'Aaa', seat: 0 })
  announce(b, { name: 'Bbb', seat: 1 })
  await wait(1200)

  a.socket.send(JSON.stringify({ t: 'bet', amount: 10 }))
  await wait(1000)

  check('a wager is relayed as it lands', a.bets.length === 1, `${a.bets.length} relayed`)
  check('and everybody else sees it too', b.bets.length === 1, `${b.bets.length} relayed`)
  check('nothing is dealt while a seat is still thinking', a.deals.length === 0)

  /*
   * The bug this file exists for.
   *
   * One player has staked and the room has armed its betting window. Anything
   * else that happens at either table re-announces a shooter, and a shooter
   * announcement used to delete *the* alarm — a Durable Object has exactly one,
   * and it was held as one table and one kind. The deal never fired. Not in
   * thirty seconds; ever. From the player's chair it read as the bet buttons
   * having stopped working.
   */
  announce(b, { name: 'Bbb', seat: 1 })
  await wait(800)
  check('the wager survives somebody else re-announcing', a.deals.length === 0)

  console.log(`     waiting out the ${DEAL_WINDOW_MS / 1000}s betting window…`)
  await wait(DEAL_WINDOW_MS + SLACK_MS)

  check('the window still closes and the table deals', a.deals.length === 1, `${a.deals.length} deals`)
  check('dealt to whoever backed a hand', a.deals[0]?.bets.length === 1, JSON.stringify(a.deals[0]?.bets))
  // Seat order, not arrival order: a table deals from one end round to the
  // other, so the wagers have to go out in the order the hands will be played.
  check('each wager carries its own stool', a.deals[0]?.bets[0]?.seat === 0, JSON.stringify(a.deals[0]?.bets))

  a.socket.close()
  b.socket.close()
}

console.log(failures.length === 0 ? '\nall seat checks passed' : `\n${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
