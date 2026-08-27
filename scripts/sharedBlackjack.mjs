import { chromium } from 'playwright-core'
import { requireQuietMachine } from './machineLoad.mjs'

/*
 * Two players at one blackjack table, sharing one shoe.
 *
 * The claim worth checking is not that both see cards — it is that they see
 * *consistent* cards drawn from a single deck. Two clients each dealing
 * themselves from a private shoe look identical on screen and are a different
 * game, so this reads the store: same dealer upcard, different player cards,
 * and above all the same `shoeIndex` after somebody hits.
 *
 * Dev only: it reaches through the dev bridge, which production strips.
 *
 * Usage: node scripts/sharedBlackjack.mjs [baseUrl] [outPng]
 */

// Two browser contexts on a software renderer, which is twice the most CPU-
// hungry thing in the repository — and the assertions here are about *timing*,
// so a loaded machine does not merely make it slow.
requireQuietMachine('The shared blackjack check')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] ?? 'http://localhost:5182'
const browser = await chromium.launch({ executablePath: CHROME })

const failures = []
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

/*
 * Each player takes a *named* stool.
 *
 * Without `?seat=` both links claim the same one, the room refuses the second
 * player and their client stands them up — correct behaviour, and a check that
 * would then be testing one player and an empty chair.
 */
async function open(name, seat) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  await page.goto(`${BASE}/?boot=casino&mp=1&seat=${seat}&time=21:00&freeze`, {
    waitUntil: 'networkidle',
  })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.evaluate((n) => window.appearanceStore.getState().setPlayerName(n), name)
  return page
}

/*
 * Stakes by clicking the button a player clicks.
 *
 * Deliberately not `sendBet`. This check used to reach past the panel straight
 * into the presence store, which is exactly why it went on passing while the
 * buttons themselves did nothing a player could see: a wager placed in a shared
 * game changes nothing locally until the whole table is in, and nothing said so.
 *
 * @param slot 0, 1 or 2 — the $10, $50 and $100 chips.
 */
async function stake(page, slot) {
  const clicked = await page.evaluate((index) => {
    const button = document.querySelectorAll('.button--chip')[index]
    if (!button || button.disabled) return false
    button.click()
    return true
  }, slot)

  check(`the $${[10, 50, 100][slot]} chip is clickable`, clicked)
}

/** What the panel is telling this player right now. */
const prompt = (page) =>
  page.evaluate(() => document.querySelector('.table-ui__prompt')?.textContent ?? '')

/** Which stool each player holds, as the room settled it. */
const seatMap = (page) =>
  page.evaluate(() => window.presenceStore.getState().seats.blackjack ?? {})

const view = (p) => p.evaluate(() => {
  const g = window.crapsStore ? window.blackjackStore.getState() : null
  return {
    phase: g.game.phase,
    shoeIndex: g.game.shoeIndex,
    dealerUp: g.game.dealerHand[0] ? `${g.game.dealerHand[0].rank}${g.game.dealerHand[0].suit}` : null,
    seats: g.game.seats.map((s) => s.hands.map((h) => h.cards.map((c) => `${c.rank}${c.suit}`).join(' '))),
    mySeat: g.mySeatIndex,
    active: g.game.activeSeatIndex,
  }
})

// First base and third base, so nobody is sitting on anybody.
const a = await open('Alice', 0)
const b = await open('Bob', 4)
await a.waitForTimeout(4000)

/*
 * Two players, two stools.
 *
 * The bug this whole check exists downstream of: every player was drawn on the
 * middle stool whatever seat they held, and before a round was dealt a seated
 * peer had no seat at all — so two people at one table were rendered inside
 * each other while they chose their stakes.
 */
const seats = await seatMap(a)
const held = Object.keys(seats).sort()
check('both are seated, on different stools', held.length === 2, JSON.stringify(seats))
check('and both clients agree who is where', JSON.stringify(seats) === JSON.stringify(await seatMap(b)))

// Both stake, by clicking. The room deals only once the whole table is in.
await stake(a, 0)
await a.waitForTimeout(1200)
const halfway = await view(a)
check('no deal until every seat has bet', halfway.phase === 'betting', halfway.phase)

/*
 * ...and the player who staked can see that they did.
 *
 * A shared wager goes to the room, so nothing local moves: no chips, no
 * bankroll change, and the buttons sit there looking untouched. With nothing
 * said, half a minute of waiting for a slow table is indistinguishable from the
 * buttons being broken, which is exactly how it was reported.
 */
const waiting = await prompt(a)
check('the panel says the wager is in', waiting.includes('in —'), waiting)
check('and says who it is waiting for', waiting.includes('waiting for the table'), waiting)
check('the other player is still asked to bet', (await prompt(b)).includes('Place your bet'))

await stake(b, 1)
await a.waitForTimeout(2500)

const av = await view(a)
const bv = await view(b)
console.log('alice:', JSON.stringify(av))
console.log('bob:  ', JSON.stringify(bv))

check('both were dealt', av.phase === 'playerTurn' && bv.phase === 'playerTurn', `${av.phase}/${bv.phase}`)
check('same dealer upcard', av.dealerUp === bv.dealerUp, `${av.dealerUp} vs ${bv.dealerUp}`)
check('same shoe position', av.shoeIndex === bv.shoeIndex, `${av.shoeIndex} vs ${bv.shoeIndex}`)
check('same cards at every seat', JSON.stringify(av.seats) === JSON.stringify(bv.seats))
check('seats are distinct hands', JSON.stringify(av.seats[0]) !== JSON.stringify(av.seats[1]))
check('they hold different seats', av.mySeat !== bv.mySeat, `${av.mySeat} vs ${bv.mySeat}`)

/*
 * The engine's seats are compact; the stools are not.
 *
 * Two players at first base and third base are engine seats 0 and 1, and their
 * cards belong at felt spots 0 and 4 with three empty spots between them. If
 * this map were dropped the hands would be dealt into the middle of the table
 * in front of nobody, which looks perfectly plausible until you notice the
 * cards are not where the people are.
 *
 * Engine seat order is play order, and play runs first base first — the
 * *highest* stool number (the dealer's left; see `worker/playOrder.ts`) — so
 * the map is the held stools descending, not in the order they were claimed.
 */
const stools = await a.evaluate(() => window.blackjackStore.getState().seatStools)
const playOrder = held.map(Number).sort((x, y) => y - x)
check('each hand knows its own stool', JSON.stringify(stools) === JSON.stringify(playOrder), `${JSON.stringify(stools)} vs ${JSON.stringify(playOrder)}`)

// Out of turn is refused, identically, on both clients.
const notMine = av.mySeat === av.active ? b : a
const before = await view(notMine)
await notMine.evaluate(() => window.presenceStore.getState().sendAction('hit'))
await a.waitForTimeout(2000)
const after = await view(notMine)
check('out-of-turn action changes nothing', before.shoeIndex === after.shoeIndex, `${before.shoeIndex} -> ${after.shoeIndex}`)

/*
 * Issue #10: each action gets fifteen seconds and the whole table watches one
 * clock. The deadline never crosses the wire — every client restarts a local
 * window on the deal, on every relayed action, and on the expiry itself — so
 * these read that window's face, then the DOM both players actually see.
 */
const clockOf = (page) =>
  page.evaluate(() => window.presenceStore.getState().turnClocks.blackjack ?? null)
const secondsShown = (text) => Number(/ — (\d+)s/.exec(text)?.[1] ?? NaN)

check('both players hold a running turn clock', (await clockOf(a)) !== null && (await clockOf(b)) !== null)

const clockBeforeHit = await clockOf(a)

// The player whose turn it is hits, and the shoe moves for everybody.
const mine = av.mySeat === av.active ? a : b
await mine.evaluate(() => window.presenceStore.getState().sendAction('hit'))
await a.waitForTimeout(2500)
const a2 = await view(a)
const b2 = await view(b)
check('a legal hit advances the shoe', a2.shoeIndex > av.shoeIndex, `${av.shoeIndex} -> ${a2.shoeIndex}`)
check('both agree after the hit', a2.shoeIndex === b2.shoeIndex && JSON.stringify(a2.seats) === JSON.stringify(b2.seats))

// Every action buys the next decision a fresh fifteen.
const clockAfterHit = await clockOf(a)
check('a hit resets the turn clock', clockAfterHit !== null && clockAfterHit > clockBeforeHit)

if (a2.phase === 'playerTurn') {
  // Whoever holds the turn sees the count by their buttons; the other player
  // sees it beside the name of whoever they are waiting on — and the two
  // numbers are the same clock, a network trip and a render apart.
  const actor = a2.mySeat === a2.active ? a : b
  const waiter = a2.mySeat === a2.active ? b : a
  const actorPrompt = await prompt(actor)
  const waitingLine = await waiter.evaluate(
    () => document.querySelector('.blackjack__waiting')?.textContent ?? '',
  )
  check('the acting player sees the clock by their buttons', / — \d+s/.test(actorPrompt), actorPrompt)
  check('the waiting player sees who and how long', /Waiting on .+ — \d+s/.test(waitingLine), waitingLine)
  const drift = Math.abs(secondsShown(actorPrompt) - secondsShown(waitingLine))
  check('both watch the same number fall', drift <= 3, `${actorPrompt} vs ${waitingLine}`)

  // Left alone, the room stands the hand at zero — on every client at once.
  await a.waitForTimeout(20_000)
  const a3 = await view(a)
  const b3 = await view(b)
  check(
    'the hand stands itself at zero',
    a3.phase !== 'playerTurn' || a3.active !== a2.active,
    `phase ${a3.phase}, active ${a2.active} -> ${a3.active}`,
  )
  check(
    'both agree after the expiry',
    a3.phase === b3.phase && JSON.stringify(a3.seats) === JSON.stringify(b3.seats),
    `${a3.phase}/${b3.phase}`,
  )
}

await b.screenshot({ path: process.argv[3] ?? '/tmp/shared-blackjack.png' })
await browser.close()
console.log(failures.length === 0 ? '\nPASS' : `\n${failures.length} failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
