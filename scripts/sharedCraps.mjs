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
  await page.goto(`${BASE}/?boot=placed&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
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
await O.screenshot({ path: process.argv[3] ?? '/tmp/craps2p.png' })
await browser.close()
const same = sa.roll && so.roll && JSON.stringify(sa.roll) === JSON.stringify(so.roll)
console.log(same ? '\nPASS: both settled the same roll' : '\nFAIL')
process.exit(same ? 0 : 1)
