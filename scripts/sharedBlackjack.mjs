import { chromium } from 'playwright-core'

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

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] ?? 'http://localhost:5182'
const browser = await chromium.launch({ executablePath: CHROME })

const failures = []
const check = (label, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failures.push(label)
}

async function open(name) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  await page.goto(`${BASE}/?boot=casino&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.evaluate((n) => window.appearanceStore.getState().setPlayerName(n), name)
  return page
}

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

const a = await open('Alice')
const b = await open('Bob')
await a.waitForTimeout(4000)

// Both stake. The room deals only once the whole table is in.
await a.evaluate(() => window.presenceStore.getState().sendBet(25))
await a.waitForTimeout(1200)
const halfway = await view(a)
check('no deal until every seat has bet', halfway.phase === 'betting', halfway.phase)

await b.evaluate(() => window.presenceStore.getState().sendBet(50))
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

// Out of turn is refused, identically, on both clients.
const notMine = av.mySeat === av.active ? b : a
const before = await view(notMine)
await notMine.evaluate(() => window.presenceStore.getState().sendAction('hit'))
await a.waitForTimeout(2000)
const after = await view(notMine)
check('out-of-turn action changes nothing', before.shoeIndex === after.shoeIndex, `${before.shoeIndex} -> ${after.shoeIndex}`)

// The player whose turn it is hits, and the shoe moves for everybody.
const mine = av.mySeat === av.active ? a : b
await mine.evaluate(() => window.presenceStore.getState().sendAction('hit'))
await a.waitForTimeout(2500)
const a2 = await view(a)
const b2 = await view(b)
check('a legal hit advances the shoe', a2.shoeIndex > av.shoeIndex, `${av.shoeIndex} -> ${a2.shoeIndex}`)
check('both agree after the hit', a2.shoeIndex === b2.shoeIndex && JSON.stringify(a2.seats) === JSON.stringify(b2.seats))

await b.screenshot({ path: process.argv[3] ?? '/tmp/shared-blackjack.png' })
await browser.close()
console.log(failures.length === 0 ? '\nPASS' : `\n${failures.length} failed: ${failures.join(', ')}`)
process.exit(failures.length === 0 ? 0 : 1)
