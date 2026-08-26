import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

/**
 * Drives two players at once and checks they can see each other.
 *
 * `npm run walkthrough` drives a single browser and therefore cannot observe
 * any of this: a room that never connects, a peer that joins and never moves,
 * and a peer that moves perfectly all look identical from one seat.
 *
 * Two browser *contexts* rather than two pages, so each has its own
 * `localStorage` — otherwise both tabs share one saved character and one
 * player id, and the second is indistinguishable from the first reloading.
 *
 * Usage: node scripts/multiplayer.mjs [baseUrl]
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv[2] ?? 'http://localhost:5180'
const OUT = resolve('shots/multiplayer')

/** Long enough for the socket to open, announce, and exchange a roster. */
const CONNECT_MS = 4_000

/**
 * How long the walker holds W.
 *
 * Deliberately short. At 7.5 units a second a longer walk puts the two players
 * most of a street apart, which still proves they moved but makes the captures
 * useless for judging the thing that is easiest to get wrong — whether the
 * nameplate is legible at conversational distance. Five units is far enough to
 * be unambiguous movement and close enough to read.
 */
const WALK_MS = 700

const failures = []

function check(label, condition, detail) {
  if (condition) {
    console.log(`ok   ${label}`)
  } else {
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

/** Reads the presence store out of a page, via the dev bridge. */
async function peers(page) {
  return page.evaluate(() => {
    const store = window.presenceStore
    if (!store) return { error: 'presenceStore not exposed' }
    const state = store.getState()
    return {
      connected: state.connected,
      ids: Object.keys(state.peers),
      names: Object.values(state.peers).map((p) => p.name),
      poses: Object.keys(state.peers).map((id) => window.peerPose?.(id) ?? null),
    }
  })
}

async function openPlayer(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  // `?boot=strip` skips the first-run designer, which a fresh profile would
  // otherwise open instead of the street.
  await page.goto(`${BASE}/?boot=strip&mp=1&time=21:00&freeze`, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 15_000 })

  // Name them apart, so the nameplate is checkable and not just the count.
  await page.evaluate((playerName) => {
    window.appearanceStore?.getState().setPlayerName(playerName)
  }, name)

  return { context, page }
}

async function main() {
  await mkdir(dirname(`${OUT}/x`), { recursive: true })

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })

  const alice = await openPlayer(browser, 'Alice')
  const bob = await openPlayer(browser, 'Bob')

  await alice.page.waitForTimeout(CONNECT_MS)

  const aliceSees = await peers(alice.page)
  const bobSees = await peers(bob.page)

  check('alice connected', aliceSees.connected === true, JSON.stringify(aliceSees))
  check('bob connected', bobSees.connected === true, JSON.stringify(bobSees))
  check('alice sees one peer', aliceSees.ids?.length === 1, JSON.stringify(aliceSees.ids))
  check('bob sees one peer', bobSees.ids?.length === 1, JSON.stringify(bobSees.ids))
  check('alice sees bob by name', aliceSees.names?.includes('Bob'), JSON.stringify(aliceSees.names))
  check('bob sees alice by name', bobSees.names?.includes('Alice'), JSON.stringify(bobSees.names))

  // Alice walks. Bob's copy of her has to move — a roster entry that never
  // changes position is a connection that joined and then went silent.
  const before = await bob.page.evaluate(() => window.peerPose?.(Object.keys(window.presenceStore.getState().peers)[0]))

  await alice.page.keyboard.down('w')
  await alice.page.waitForTimeout(WALK_MS)
  await alice.page.keyboard.up('w')
  await bob.page.waitForTimeout(1_000)

  const after = await bob.page.evaluate(() => window.peerPose?.(Object.keys(window.presenceStore.getState().peers)[0]))

  const moved =
    before && after && Math.hypot(after.x - before.x, after.z - before.z) > 0.5
  check('bob saw alice move', moved, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

  await alice.page.screenshot({ path: `${OUT}/alice.png` })
  await bob.page.screenshot({ path: `${OUT}/bob.png` })

  await browser.close()

  console.log(`\n2 players → ${OUT}`)
  if (failures.length > 0) {
    console.log(`${failures.length} failed: ${failures.join(', ')}`)
    process.exit(1)
  }
}

await main()
