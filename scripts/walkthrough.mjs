import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

/**
 * Drives the app the way a player does, and captures each beat.
 *
 * `shots.mjs` jumps straight to a scene with `?boot=`, which is fast and exact
 * and cannot run against production — the deep links are stripped from
 * production builds. This walks instead: it clicks the buttons and holds the
 * movement keys, so it works against a deployed URL and proves the path between
 * the scenes as well as the scenes themselves.
 *
 * Usage: node scripts/walkthrough.mjs [baseUrl] [outDir]
 *
 * Keys have to be *held*. `page.keyboard.press` is down-and-up in a few
 * milliseconds, which at 7.5 units per second moves the player about a
 * centimetre — the first version of this looked like the controls were dead.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const baseUrl = process.argv[2] ?? 'http://localhost:5173'
const outDir = resolve(process.argv[3] ?? 'shots/walkthrough')

/** Long enough for a scene transition plus its settle animation. */
const SETTLE_MS = 2000

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    // SwiftShader gives headless Chrome a working WebGL stack without a GPU.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
})

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

const failures = []
page.on('pageerror', (error) => failures.push(String(error)))

/**
 * Holds keys down for `ms`, so the player actually travels.
 *
 * Resets the camera first. Movement is camera-relative and the follow camera
 * swings to sit behind the player's heading, so the axes move as you walk:
 * strafing right turns the player right, the camera follows, and the next
 * "forward" drives into the building. Pressing R re-pins the orbit to its
 * default, which makes W mean "down the street" every time.
 */
async function walk(keys, ms) {
  await page.keyboard.press('KeyR')
  await page.waitForTimeout(80)

  for (const key of keys) await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  for (const key of keys) await page.keyboard.up(key)
}

async function isVisible(text) {
  return page.getByText(text, { exact: false }).first().isVisible()
}

/** Walks in short bursts until `text` is gone, or gives up. */
async function walkUntilGone(keys, text, { burstMs = 320, bursts = 30 } = {}) {
  for (let i = 0; i < bursts; i++) {
    if (!(await isVisible(text))) return
    await walk(keys, burstMs)
    await page.waitForTimeout(120)
  }

  throw new Error(`walked ${bursts} bursts of ${keys.join('+')} still seeing "${text}"`)
}

/**
 * Walks in short bursts until `text` appears, or gives up.
 *
 * Fixed durations do not survive a headless renderer: frame times vary by an
 * order of magnitude between runs, so the same hold lands somewhere different
 * every time. Stepping and checking is slower and does not care.
 */
async function walkUntil(keys, text, { burstMs = 320, bursts = 30 } = {}) {
  for (let i = 0; i < bursts; i++) {
    if (await isVisible(text)) return
    await walk(keys, burstMs)
    await page.waitForTimeout(120)
  }

  throw new Error(`walked ${bursts} bursts of ${keys.join('+')} without seeing "${text}"`)
}

async function capture(name) {
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: resolve(outDir, `${name}.png`) })
  console.log(`ok   ${name}`)
}

/** Fails loudly rather than screenshotting whatever happened to be on screen. */
async function expectText(text, step) {
  const found = await page.getByText(text, { exact: false }).first().isVisible()
  if (!found) throw new Error(`${step}: expected to see "${text}"`)
}

try {
  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })

  // 1. First run opens the designer, not the street.
  await expectText('Who are you tonight?', 'first run')
  await page.getByRole('button', { name: 'Feminine' }).click()
  await page.getByRole('button', { name: 'Long' }).click()
  await page.getByRole('button', { name: 'Cocktail dress' }).click()
  await capture('1-designer')

  await page.getByRole('button', { name: 'Hit the strip' }).click()
  await expectText('WASD to walk', 'leaving the designer')
  await capture('2-strip')

  // 2. Head diagonally for the shop's side of the street. The player clamps at
  //    the kerb, so the D component stops mattering once they reach it and the
  //    W component carries them down to the door.
  //
  //    Note there is no waiting on the "Walk in to shop" prompt here. `Player`
  //    calls `enterVenue` in the same frame it sets `nearbyVenue`, so for an
  //    available venue the prompt is replaced by the interior before it ever
  //    paints — it only really shows for a venue that is closed.
  for (let i = 0; i < 6; i++) await walk(['KeyW', 'KeyD'], 320)
  await capture('3-approaching')

  await walkUntil(['KeyW', 'KeyD'], 'The Gilded Hanger')
  await capture('4-shop')

  // 4. Buy the cheapest thing in the shop and put it on.
  await page.getByRole('button', { name: 'Buy' }).last().click()
  const wear = page.getByRole('button', { name: 'Wear' }).first()
  await wear.waitFor({ timeout: 5000 })
  await wear.click()
  await capture('5-wearing')

  // 5. Out of the shop, across the strip and down to the casino.
  //
  //    Cross first, then walk down. Doing both at once traces a diagonal that
  //    crosses the casino's row while still out in the middle of the road, five
  //    units from its door and well outside the trigger.
  //
  //    Every leg below runs far more bursts than the distance needs, and the
  //    counts are sized for a deployed build rather than a local one — the same
  //    counts that cleared the crossing against localhost fell short against
  //    Vercel, where the frames are slower.
  //
  //    Every leg below runs more bursts than the distance needs. Ground covered
  //    per burst varies with the frame rate — the walk clamps its step at a
  //    10fps floor, so a slow headless frame moves the player a quarter of what
  //    a fast one does — and both the kerb and the walls clamp, which makes
  //    overshooting free. Counts tuned on one run failed on the next.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  for (let i = 0; i < 30; i++) await walk(['KeyA'], 320)
  await walkUntil(['KeyW'], 'F to sit at a table', { bursts: 45 })

  //    Inside now, and W plus A heads for the blackjack table.
  await walkUntil(['KeyW', 'KeyA'], 'Blackjack', { bursts: 20 })
  await capture('6-at-the-table')

  // 6. Sit down and play a hand. F, not E — E is the camera orbit.
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(600)
  await expectText('Leave table', 'sitting down')
  await capture('7-seated')

  //    The stake keys are the primary control at the table, and the buttons
  //    carry their shortcut in the label ("$10 1"), which makes an exact-name
  //    click brittle. Press the key the HUD tells the player to press.
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(2000)
  await expectText('DEALER', 'dealing a hand')
  await capture('8-hand-dealt')

  // 7. Out of the casino and down to the clinic, which is the answer to having
  //    lost it all. Leave the table, cross the floor to the exit, then cross
  //    the street and carry on down — the clinic is past the casino on the
  //    shop's side, so nothing else is walked through on the way.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  await walkUntilGone(['KeyS', 'KeyD'], 'F to sit at a table', { bursts: 30 })

  for (let i = 0; i < 34; i++) await walk(['KeyD'], 320)
  await walkUntil(['KeyW'], 'F to use a chair', { bursts: 45 })
  await capture('9-clinic')

  // 8. Sell a pint. This is the answer to going broke, so it has to work from
  //    the street and not only from a deep link.
  await walkUntil(['KeyW', 'KeyA'], 'Donation chair', { bursts: 20 })
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(700)
  await expectText('Donate', 'sitting in the chair')

  await page.getByRole('button', { name: 'Donate' }).click()
  await page.waitForTimeout(900)
  await expectText('already given today', 'after donating')
  await capture('10-donated')

  if (failures.length > 0) {
    throw new Error(`page errors: ${failures.join(' | ')}`)
  }

  console.log(`\n10 beats → ${outDir}`)
} catch (error) {
  await page.screenshot({ path: resolve(outDir, 'failure.png') })
  console.error(`\nFAILED: ${error.message}`)
  console.error(`Last frame written to ${resolve(outDir, 'failure.png')}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
