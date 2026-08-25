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

/** Kept in step with `DONATION_FEE` in src/world/money.ts by hand. */
const DONATION_FEE = 100

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
  await page.waitForTimeout(40)

  for (const key of keys) await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  for (const key of keys) await page.keyboard.up(key)
}

async function isVisible(text) {
  return page.getByText(text, { exact: false }).first().isVisible()
}

/** Walks in short bursts until `text` is gone, or gives up. */
async function walkUntilGone(keys, text, { burstMs = 700, bursts = 30 } = {}) {
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
async function walkUntil(keys, text, { burstMs = 700, bursts = 30 } = {}) {
  for (let i = 0; i < bursts; i++) {
    if (await isVisible(text)) return
    await walk(keys, burstMs)
    await page.waitForTimeout(120)
  }

  throw new Error(`walked ${bursts} bursts of ${keys.join('+')} without seeing "${text}"`)
}

/**
 * Walks a fixed number of bursts, but gives up early if `text` appears.
 *
 * For legs that are getting into position rather than arriving, on a street
 * where getting into position sometimes arrives anyway. Crossing to the far kerb
 * lands beside the casino's door about half the time and slides into it, and the
 * other half stops dead against the kerb — so neither `walkUntil` (which would
 * throw on the half that stops) nor a bare count (which would spend the rest of
 * the count walking around inside) is right on its own. Unlike `walkUntil` this
 * never throws: not arriving is one of the two expected outcomes.
 */
async function walkAtMost(keys, text, { burstMs = 700, bursts = 20 } = {}) {
  for (let i = 0; i < bursts; i++) {
    if (await isVisible(text)) return
    await walk(keys, burstMs)
    await page.waitForTimeout(120)
  }
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
  for (let i = 0; i < 6; i++) await walk(['KeyW', 'KeyD'], 700)
  await capture('3-approaching')

  await walkUntil(['KeyW', 'KeyD'], 'The Gilded Hanger')
  await capture('4-shop')

  // 4. Buy the cheapest thing in the shop and put it on.
  await page.getByRole('button', { name: 'Buy' }).last().click()
  const wear = page.getByRole('button', { name: 'Wear' }).first()
  await wear.waitFor({ timeout: 5000 })
  await wear.click()
  await capture('5-wearing')

  // 5. Out of the shop and further down the same kerb to the clinic.
  //
  //    The clinic before the casino, deliberately: they are on the same side of
  //    the street with nothing between them, whereas walking back *up* from the
  //    casino means passing the shop's door, and a burst covers more ground
  //    than the door's trigger is wide.
  await page.keyboard.press('Escape')
  //    Long enough for the strip to be drawing frames again. The first burst
  //    after a scene change routinely covers no ground at all, and this leg has
  //    no slack to spend on it — see below.
  await page.waitForTimeout(1200)

  /*
   *    Down the kerb, shrugging the shop off if it grabs us on the way past.
   *
   *    Every counted version of this leg failed, and it is worth saying why,
   *    because the instinct is always to retune the count. Leaving a venue puts
   *    the player 3.5 units into the road against a trigger 2.6 wide, so the
   *    first step back toward the kerb is within half a unit of walking straight
   *    back in. Stepping *down* the street first fixes that — but the step has
   *    to be at least four units to clear the door and at most sixteen to stop
   *    short of the clinic, and a burst covers anywhere from half a unit to five
   *    depending on what the renderer managed. No fixed count lives in that
   *    window; two different ones failed in opposite directions.
   *
   *    So it does not count. It walks in steps small enough not to step over the
   *    clinic's trigger, and if the shop takes it, it leaves and carries on.
   *    Walking back into the shop is not a failure to prevent, just something to
   *    recover from — and it is recoverable, because leaving always puts the
   *    player in the same spot and the step down the street is pure forward,
   *    which is the one direction that reliably holds its line.
   */
  for (let i = 0; i < 40; i++) {
    if (await isVisible('F to use a chair')) break

    if (await isVisible('The Gilded Hanger')) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(900)
      await walk(['KeyW'], 700)
      continue
    }

    await walk(['KeyW', 'KeyD'], 350)
    await page.waitForTimeout(120)
  }

  await expectText('F to use a chair', 'walking down to the clinic')
  await capture('6-clinic')

  // 6. Sell a pint. Ten seconds of nurse, and the bankroll is the proof.
  await expectText('Donation chair', 'arriving in the clinic')
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(700)
  await expectText('Donate', 'sitting in the chair')

  const bankroll = () =>
    page
      .locator('.hud__amount')
      .first()
      .innerText()
      .then((text) => Number(text.replace(/[^0-9]/g, '')))

  const before = await bankroll()
  await page.getByRole('button', { name: 'Donate' }).click()

  await page.waitForFunction(
    (was) => {
      const shown = document.querySelector('.hud__amount')?.textContent ?? ''
      return Number(shown.replace(/[^0-9]/g, '')) > was
    },
    before,
    { timeout: 30000 },
  )

  const after = await bankroll()
  if (after - before !== DONATION_FEE) {
    throw new Error(`donation paid ${after - before}, expected ${DONATION_FEE}`)
  }
  console.log(`     the pint paid $${after - before}`)
  await capture('7-donated')

  // 7. Out of the clinic, across the street and up to the casino.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  await walkUntilGone(['KeyS'], 'F to use a chair', { bursts: 30 })

  /*
   *    Cross, then ride the kerb up to the door.
   *
   *    The crossing is the leg that does not behave the same way twice. Movement
   *    is camera-relative and `walk` re-pins the camera each burst, so whether
   *    the player finishes it pinned square against the far kerb at the clinic's
   *    row or curls the last few units up into the casino's doorway is decided
   *    by frame timing. Both were observed on the same machine minutes apart.
   *
   *    Hence a leg that tolerates either, followed by one that only has work to
   *    do in the first case. Going up rather than straight across also keeps the
   *    player off the diagonal, which reaches the casino's row while still out
   *    in the middle of the road, seven units short of the door.
   */
  await walkAtMost(['KeyA'], 'F to sit at a table', { bursts: 20 })
  await walkUntil(['KeyS', 'KeyA'], 'F to sit at a table', { burstMs: 350, bursts: 60 })

  /*
   *    Shorter bursts for the last few feet, and only here.
   *
   *    A counted leg cannot use them — under about 330 ms no frame lands and the
   *    player moves nothing, so shortening the burst only wastes the count. A
   *    leg that walks until it sees something does not care: a burst that moves
   *    nothing just checks again. And this approach needs the finer step. The
   *    table blocks the diagonal, so the player slides along its front edge, and
   *    the seat is offered across 3.6 units of that slide — which a full burst
   *    can step over in one go, ending against the far wall with no prompt ever
   *    having painted.
   */
  await walkUntil(['KeyW', 'KeyA'], 'Blackjack', { burstMs: 350, bursts: 40 })
  await capture('8-at-the-table')

  // 8. Sit down and play a hand. F, not E — E is the camera orbit.
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(600)
  await expectText('Leave table', 'sitting down')
  await capture('9-seated')

  //    The stake keys are the primary control at the table, and the buttons
  //    carry their shortcut in the label ("$10 1"), which makes an exact-name
  //    click brittle. Press the key the HUD tells the player to press.
  await page.keyboard.press('Digit1')
  await page.waitForTimeout(2000)
  await expectText('DEALER', 'dealing a hand')
  await capture('10-hand-dealt')

  if (failures.length > 0) {
    throw new Error(`page errors: ${failures.join(' | ')}`)
  }

  console.log(`\n10 beats → ${outDir}`)
} catch (error) {
  await page.screenshot({ path: resolve(outDir, 'failure.png') })
  console.error(`\nFAILED: ${error.message}`)

  /*
   * Where the player actually was, which a screenshot of a dark room does not
   * tell you. Every failure in this script so far has been the player being
   * somewhere other than where the burst counts assumed, and reading it off the
   * scene settled three of them in one run each after a day of guessing.
   *
   * Dev builds only — `devRender` is stripped from production, so against a
   * deployed URL this quietly prints nothing and the screenshot is all there is.
   */
  const at = await page
    .evaluate(() => window.devRender?.locate?.('player')?.[0]?.position ?? null)
    .catch(() => null)
  if (at) console.error(`Player was at [${at.map((n) => n.toFixed(2)).join(', ')}]`)

  console.error(`Last frame written to ${resolve(outDir, 'failure.png')}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
