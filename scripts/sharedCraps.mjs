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

// Ten seconds minus the five already spent, plus slack for the boundary.
await a.waitForTimeout(9000)
// A come-out natural settles and returns the line bet, and an empty rail may
// not roll — re-stake so the only thing that could hold the button is the
// window itself.
await S.evaluate(() => {
  const store = window.crapsStore.getState()
  if (Object.values(store.game.bets).every((amount) => !amount)) store.wager('pass-line', 10)
})
await a.waitForTimeout(400)
const reopened = await S.getByRole('button', { name: /Roll the dice/ }).isEnabled().catch(() => false)
console.log('after the window, shooter button enabled:', reopened)

await browser.close()
const same = sa.roll && so.roll && JSON.stringify(sa.roll) === JSON.stringify(so.roll)
console.log(same ? '\nPASS: both settled the same roll' : '\nFAIL: rolls differ')
console.log(windowShown ? 'PASS: shooter held to the betting window' : 'FAIL: no countdown on the shooter')
console.log(windowShared ? 'PASS: the rail watches the same countdown' : 'FAIL: no countdown for the rail')
console.log(reopened ? 'PASS: the dice fly again after the window' : 'FAIL: button never re-enabled')
process.exit(same && windowShown && windowShared && reopened ? 0 : 1)
