import { chromium } from 'playwright-core'

/*
 * Two players at one craps table, checking the only claim that matters: that
 * they settled the *same* roll.
 *
 * Invisible in a screenshot by construction. Two clients each running their own
 * engine on identical dice and two clients running their own engine on
 * different dice produce the same picture of a table with chips on it — the
 * difference is a number in a store, which is why this reads the store.
 *
 * Dev only: it reaches through the dev bridge, which production strips.
 *
 * Usage: node scripts/sharedCraps.mjs [baseUrl] [outPng]
 */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] ?? 'http://localhost:5182'
const browser = await chromium.launch({ executablePath: CHROME })
async function open(name) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  await page.goto(`${BASE}/?boot=craps&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.evaluate((n) => window.appearanceStore.getState().setPlayerName(n), name)
  return page
}
const view = (p) => p.evaluate(() => ({
  self: window.presenceStore.getState().selfId,
  shooter: window.presenceStore.getState().shooterId,
  roll: window.crapsStore.getState().game.lastRoll,
  phase: window.crapsStore.getState().game.phase,
  point: window.crapsStore.getState().game.point,
}))
const a = await open('Alice'); const b = await open('Bob')
await a.waitForTimeout(5000)
const av = await view(a), bv = await view(b)
console.log('alice:', JSON.stringify(av)); console.log('bob:  ', JSON.stringify(bv))
const shooterIsAlice = av.shooter === av.self
console.log('shooter:', shooterIsAlice ? 'alice' : 'bob')
const S = shooterIsAlice ? a : b, O = shooterIsAlice ? b : a
console.log('shooter button:', await S.getByRole('button', { name: /Roll the dice|Waiting/ }).innerText())
console.log('other button:  ', await O.getByRole('button', { name: /Roll the dice|Waiting/ }).innerText())

/*
 * Every player's bets on the felt (issue #18). Both booted with a pass line
 * down; each now places a distinct second bet, and each page's presence
 * store must end up holding the *other's* full record — which is exactly
 * what its felt draws. Cross-checked against the owner's own engine record,
 * because the claim is not "a record arrived" but "the right one did".
 */
// Field, not a place bet: the table boots on the come-out, where place bets
// are refused — the point of the beat is the wire, not the rulebook.
await S.evaluate(() => window.crapsStore.getState().wager('field', 15))
await O.evaluate(() => window.crapsStore.getState().wager('field', 10))
await a.waitForTimeout(2000)

const stakesSeen = (p, id) => p.evaluate(
  (peer) => window.presenceStore.getState().crapsStakes[peer] ?? null,
  id,
)
const ownBets = (p) => p.evaluate(() => window.crapsStore.getState().game.bets)

const sSeesO = await stakesSeen(S, shooterIsAlice ? bv.self : av.self)
const oSeesS = await stakesSeen(O, shooterIsAlice ? av.self : bv.self)
const sOwn = await ownBets(S), oOwn = await ownBets(O)
const betsMatch =
  JSON.stringify(sSeesO) === JSON.stringify(oOwn) &&
  JSON.stringify(oSeesS) === JSON.stringify(sOwn)
console.log('shooter sees other stakes:', JSON.stringify(sSeesO))
console.log('other sees shooter stakes:', JSON.stringify(oSeesS))
await S.screenshot({ path: '/tmp/craps2p-shooter-felt.png' })

/*
 * And a fresh arrival sees the felt as it stands: reload one page, whose only
 * picture of the other's stakes is now the welcome's roster.
 */
await O.reload({ waitUntil: 'networkidle' })
await O.waitForSelector('canvas', { timeout: 20000 })
await a.waitForTimeout(4000)
const afterReload = await stakesSeen(O, shooterIsAlice ? av.self : bv.self)
const welcomeCarried = JSON.stringify(afterReload) === JSON.stringify(sOwn)
console.log('after reload, other sees shooter stakes:', JSON.stringify(afterReload))

await S.getByRole('button', { name: /Roll the dice/ }).click()
await a.waitForTimeout(5000)
const sa = await view(S), so = await view(O)
console.log('shooter roll:', JSON.stringify(sa.roll), 'phase', sa.phase, 'point', sa.point)
console.log('other   roll:', JSON.stringify(so.roll), 'phase', so.phase, 'point', so.point)

/*
 * The table's betting window (issue #17). Five seconds after the click the
 * dice have settled and the ten seconds are running: the shooter's button
 * must be refusing with a countdown, the other rail must be watching the
 * same seconds, and once the window runs out the dice must fly again.
 */
const shooterMid = await S.getByRole('button', { name: /Roll|Waiting/ }).innerText()
const shooterDisabled = await S.getByRole('button', { name: /Roll|Waiting/ }).isDisabled()
const otherMid = await O.getByRole('button', { name: /Roll|Waiting/ }).innerText()
console.log('mid-window shooter button:', JSON.stringify(shooterMid), 'disabled:', shooterDisabled)
console.log('mid-window other button:  ', JSON.stringify(otherMid))
const windowShown = /Roll in \d+s/.test(shooterMid) && shooterDisabled
const windowShared = /bets open \d+s/.test(otherMid)

await O.screenshot({ path: process.argv[3] ?? '/tmp/craps2p.png' })

/*
 * The ready-up path: both rails say they are done betting, and the window
 * ends where it stands — well before the ten seconds would have.
 */
// A come-out natural settles and returns the line bet, and an empty rail may
// not roll — re-stake so the only thing that could hold the button is the
// window itself.
await S.evaluate(() => {
  const store = window.crapsStore.getState()
  if (Object.values(store.game.bets).every((amount) => !amount)) store.wager('pass-line', 10)
})
const readyButtons = /Ready up \d+\/\d+/
await S.getByRole('button', { name: readyButtons }).click({ timeout: 5000 })
await a.waitForTimeout(400)
const halfReady = await O.getByRole('button', { name: /Ready up 1\/2/ }).isVisible().catch(() => false)
console.log('other rail sees the count fill:', halfReady)
await O.getByRole('button', { name: readyButtons }).click({ timeout: 5000 })
await a.waitForTimeout(600)
const reopened = await S.getByRole('button', { name: /Roll the dice/ }).isEnabled().catch(() => false)
console.log('after both ready up, shooter button enabled:', reopened)

await browser.close()
const same = sa.roll && so.roll && JSON.stringify(sa.roll) === JSON.stringify(so.roll)
console.log(same ? '\nPASS: both settled the same roll' : '\nFAIL: rolls differ')
console.log(windowShown ? 'PASS: shooter held to the betting window' : 'FAIL: no countdown on the shooter')
console.log(windowShared ? 'PASS: the rail watches the same countdown' : 'FAIL: no countdown for the rail')
console.log(halfReady ? 'PASS: the ready count fills on every rail' : 'FAIL: ready count not shared')
console.log(reopened ? 'PASS: a full rail of readies frees the dice early' : 'FAIL: button never re-enabled')
console.log(betsMatch ? "PASS: each felt holds the other's exact bets" : "FAIL: stakes records diverge")
console.log(welcomeCarried ? 'PASS: a fresh arrival sees the standing bets' : 'FAIL: welcome dropped the stakes')
process.exit(same && windowShown && windowShared && halfReady && reopened && betsMatch && welcomeCarried ? 0 : 1)
