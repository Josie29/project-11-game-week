import { chromium } from 'playwright-core'

/*
 * Drives the one thing no `?boot=` link can express: changing play mode
 * *during* a session.
 *
 * Both players join the strip in Multiplayer and see each other. Alice then
 * switches to Single. The check is what Bob sees: if Alice merely stopped
 * sending, she would still be in his roster and still be drawn, which is the
 * failure this exists to catch — "play alone" has to mean the socket is gone.
 *
 * It exists because the bug was latent and silent. `usePresenceRoom` did not
 * list `mode` among its dependencies, so switching to Single left the socket
 * open and switching back never reopened it, and neither direction showed up in
 * a screenshot or a test — the roster is only wrong on somebody else's machine.
 *
 * Usage: npm run mode-toggle [baseUrl]
 *
 * **Dev only.** It reaches through `window.sessionStore`, which is stripped
 * from production builds along with the rest of the dev bridge. Against a
 * deployed URL the equivalent is clicking the toggle in the settings panel by
 * hand. `npm run multiplayer` is the one that works on both.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] ?? 'http://localhost:5182'
const SETTLE_MS = 4000

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

async function open(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()
  await page.goto(`${BASE}/?boot=strip&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 20000 })

  await page.evaluate((playerName) => {
    window.sessionStore?.getState().completeWelcome('multiplayer')
    window.appearanceStore?.getState().setPlayerName(playerName)
  }, name)

  return page
}

const peersSeenBy = (page) =>
  page.evaluate(() => Object.values(window.presenceStore?.getState().peers ?? {}).map((p) => p.name))

const connectedOn = (page) =>
  page.evaluate(() => window.presenceStore?.getState().connected ?? false)

const alice = await open('Alice')
const bob = await open('Bob')

// Walking is what makes `shouldSend` transmit; a stationary player sends
// nothing on purpose, so standing still would look identical to being absent.
for (const page of [alice, bob]) {
  await page.keyboard.down('KeyW')
}
await alice.waitForTimeout(SETTLE_MS)
for (const page of [alice, bob]) {
  await page.keyboard.up('KeyW')
}

const before = await peersSeenBy(bob)
console.log(`bob sees, both in multiplayer: [${before.join(', ')}]`)

// Alice goes solo mid-session. This is the transition under test.
await alice.evaluate(() => window.sessionStore?.getState().setMode('single'))
await alice.waitForTimeout(SETTLE_MS)

const aliceConnected = await connectedOn(alice)
const after = await peersSeenBy(bob)
console.log(`alice socket after switching to single: connected=${aliceConnected}`)
console.log(`bob sees, after alice went single:      [${after.join(', ')}]`)

// And back again, because a toggle that only works one way is still broken.
await alice.evaluate(() => window.sessionStore?.getState().setMode('multiplayer'))
await alice.keyboard.down('KeyW')
await alice.waitForTimeout(SETTLE_MS)
await alice.keyboard.up('KeyW')

const rejoined = await connectedOn(alice)
const back = await peersSeenBy(bob)
console.log(`alice socket after switching back:      connected=${rejoined}`)
console.log(`bob sees, after alice rejoined:         [${back.join(', ')}]`)

await browser.close()

const ok =
  before.includes('Alice') && !aliceConnected && !after.includes('Alice') && rejoined
console.log(ok ? '\nPASS' : '\nFAIL')
process.exit(ok ? 0 : 1)
