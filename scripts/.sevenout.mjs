import { chromium } from 'playwright-core'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5182'
const browser = await chromium.launch({ executablePath: CHROME })
async function open(name) {
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage()
  await page.goto(`${BASE}/?boot=craps&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 20000 })
  await page.evaluate((n) => window.appearanceStore.getState().setPlayerName(n), name)
  return page
}
const look = (p) => p.evaluate(() => ({
  self: (window.presenceStore.getState().selfId || '').slice(0, 6),
  shooter: (window.presenceStore.getState().shooterId || 'null').slice(0, 6),
  outcome: window.crapsStore.getState().game.lastOutcome,
  roll: window.crapsStore.getState().game.lastRoll?.total ?? null,
  point: window.crapsStore.getState().game.point,
}))
const a = await open('Alice'); const b = await open('Cristina')
await a.waitForTimeout(4000)
for (const p of [a, b]) { await p.getByText('Pass line').first().click().catch(()=>{}); await p.waitForTimeout(600) }
await a.waitForTimeout(2500)
const first = (await look(a)).shooter
console.log('shooter at the start:', first, '(alice is', (await look(a)).self + ')')
let sevened = false
for (let i = 0; i < 20; i++) {
  const s = await look(a)
  const p = s.shooter === s.self ? a : b
  await p.evaluate(() => window.presenceStore.getState().requestRoll())
  await a.waitForTimeout(3200)
  const t = await look(a)
  console.log(`  roll ${i+1}: ${t.roll} -> ${t.outcome} (point ${t.point})`)
  if (t.outcome === 'sevenOut') { sevened = true; break }
}
await a.waitForTimeout(3000)
const av = await look(a), bv = await look(b)
console.log('after alice   ', JSON.stringify(av))
console.log('after cristina', JSON.stringify(bv))
console.log(!sevened ? 'INCONCLUSIVE: no seven-out'
  : av.shooter !== first ? `PASS: dice passed from ${first} to ${av.shooter}`
  : 'FAIL: same shooter after a seven-out')
await browser.close()
