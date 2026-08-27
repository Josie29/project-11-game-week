import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { requireQuietMachine } from './machineLoad.mjs'

/**
 * Captures every scene in one run, so a change to one cannot silently break
 * another.
 *
 * Each of these has regressed at least once while something unrelated was
 * being worked on: bloom tuned for the strip made the blackjack cards
 * unreadable, and the craps camera was framed for a table of a different size.
 * A single command that renders all of them turns "did I break anything else"
 * from a hope into a check.
 *
 * Usage: npm run shots [outDir]
 *        npm run shots:mobile [outDir]
 *
 * `SHOTS_VIEWPORT=WIDTHxHEIGHT` captures the same list at another shape, and
 * `npm run shots:mobile` is that at a phone's. Not a cosmetic difference: a
 * field of view is stated vertically, so a portrait window sees under a third
 * as much across the screen, two of the panels become sheets that shorten the
 * canvas, and every fixed camera in the game reframes. None of it is visible in
 * a 1600x900 capture, which is why the same twenty-odd scenes are worth
 * rendering twice.
 */

requireQuietMachine('The scene captures')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.env.SHOTS_BASE_URL ?? 'http://localhost:5180'

/**
 * `keys` are pressed in order before capture; `settleMs` is the wait after,
 * long enough for that scene's animation to land.
 */
const SCENES = [
  // Every capture pins its hour and freezes it. The clock otherwise keeps
  // running through the settle delay, so two runs land on different skies —
  // and, since the HUD clock is on screen indoors too, on different digits in
  // the corner. Either way the comparison this file exists for stops meaning
  // anything.
  //
  // The strip captures pass `?boot=strip`. Each run gets a fresh browser
  // profile, so `hasDesigned` is false and a bare `/` opens the character
  // designer instead of the street — every strip regression shot would have
  // come back as a picture of a menu.
  /*
   * The welcome screen, held up rather than skipped.
   *
   * `?boot=welcome` resets `hasWelcomed` instead of merely declining to clear
   * it, which is redundant here — a fresh profile has it false already — and is
   * the whole point anywhere else. This is the one capture a human opens the
   * link for by hand, in a browser that has been through the screen before.
   */
  { name: 'welcome', path: '/?boot=welcome&time=21:00&freeze', settleMs: 2400 },
  // The settings panel, which is the only place the play mode can be changed
  // after the welcome screen has been through once.
  { name: 'settings', path: '/?boot=settings&time=21:00&freeze', settleMs: 2400 },
  { name: 'strip', path: '/?boot=strip&time=21:00&freeze', settleMs: 2400 },
  { name: 'strip-dawn', path: '/?boot=strip&time=05:30&freeze', settleMs: 2400 },
  { name: 'strip-noon', path: '/?boot=strip&time=12:00&freeze', settleMs: 2400 },
  { name: 'strip-dusk', path: '/?boot=strip&time=19:00&freeze', settleMs: 2400 },
  /*
   * Both ends of the street, at noon and at night.
   *
   * These are the acceptance shots for the junctions, and they exist because
   * the ends of the world were the worst-looking part of the strip for months
   * without ever appearing in a capture: the road and both pavements used to
   * stop in mid-air against open sky some way past the last building, and the
   * only way to see it was to drive a browser twenty-six bursts down the road
   * by hand. Noon is the merciless one — at night the fog hides a great deal.
   */
  { name: 'strip-south-end', path: '/?boot=southend&time=12:00&freeze', settleMs: 2600 },
  { name: 'strip-north-end', path: '/?boot=northend&look=180&time=12:00&freeze', settleMs: 2600 },
  { name: 'strip-south-end-night', path: '/?boot=southend&time=21:00&freeze', settleMs: 2600 },
  // Face-on, because the play camera sees every facade at a glancing angle and
  // a sliver of shop window cannot tell a built storefront from a broken one.
  { name: 'shopfront', path: '/?boot=shopfront&look=-90&time=21:00&freeze', settleMs: 2600 },
  { name: 'clinicfront', path: '/?boot=clinicfront&look=-90&time=21:00&freeze', settleMs: 2600 },
  { name: 'casinofront', path: '/?boot=casinofront&look=90&time=21:00&freeze', settleMs: 2600 },
  { name: 'clinic', path: '/?boot=clinic&time=21:00&freeze', settleMs: 2600 },
  { name: 'drawing', path: '/?boot=drawing&time=21:00&freeze', settleMs: 2600 },
  // Both exits looked into. They spent their whole life invisible — unrotated
  // planes facing away from the only person who needed to see them — so the
  // way out of each room is worth its own capture.
  { name: 'clinic-exit', path: '/?boot=clinic&look=180&time=21:00&freeze', settleMs: 2600 },
  { name: 'casino-exit', path: '/?boot=floor&look=180&time=21:00&freeze', settleMs: 2600 },
  // The two halves of being broke: a marker on offer, and a marker already
  // taken. Neither is reachable without actually losing everything.
  { name: 'broke', path: '/?boot=broke&time=21:00&freeze', settleMs: 1800 },
  { name: 'in-debt', path: '/?boot=debt&time=21:00&freeze', settleMs: 1800 },
  { name: 'designer', path: '/?boot=designer&time=21:00&freeze', settleMs: 2000 },
  // The back of the designer's figure, which no capture on this project could
  // reach until `?turn=` existed — and which is where the defects were.
  { name: 'designer-back', path: '/?boot=designer&turn=180&time=21:00&freeze', settleMs: 2000 },

  /*
   * The contact sheets: a whole sweep in one frame.
   *
   * These exist because the audit they serve was unphotographable. Eight
   * hairstyles, twelve items, four garments and three builds is roughly three
   * hundred states, and before `?sheet=` and `?turn=` not one of them could be
   * reached — there was no deep link for a hairstyle or an item, and `?freeze`
   * pinned the turntable at rotation zero, so every character capture ever
   * taken here was a front view. A ponytail shaped like a limb survived that
   * for months.
   *
   * The hair sheets run in platinum on midnight rather than the default jet on
   * charcoal: jet hair against a dark suit is legible on a screen you can turn
   * and unreadable in a still, and a regression shot nobody can read is not one.
   */
  { name: 'sheet-hair', path: '/?sheet=hair&haircolor=platinum&garmentcolor=midnight&time=21:00&freeze', settleMs: 2600 },
  { name: 'sheet-hair-back', path: '/?sheet=hair&turn=200&haircolor=platinum&garmentcolor=midnight&time=21:00&freeze', settleMs: 2600 },
  { name: 'sheet-items', path: '/?sheet=items&time=21:00&freeze', settleMs: 2800 },
  { name: 'sheet-items-back', path: '/?sheet=items&turn=180&time=21:00&freeze', settleMs: 2800 },
  { name: 'sheet-garments', path: '/?sheet=garments&time=21:00&freeze', settleMs: 2600 },
  { name: 'sheet-builds', path: '/?sheet=builds&time=21:00&freeze', settleMs: 2800 },
  { name: 'sheet-skin', path: '/?sheet=skin&time=21:00&freeze', settleMs: 2800 },
  /*
   * The shop is a room you walk now, so it takes three frames rather than one.
   *
   * `look=170` on the floor shots because the play camera trails the player down
   * the length of the room and the window platform — the three dressed
   * mannequins, the best thing in here — is behind it on arrival.
   */
  { name: 'shop', path: '/?boot=shop&look=170&time=21:00&freeze', settleMs: 2600 },
  { name: 'shop-display', path: '/?boot=display&time=21:00&freeze', settleMs: 2600 },
  { name: 'shop-mirror', path: '/?boot=mirror&time=21:00&freeze', settleMs: 3000 },
  /*
   * The counter, in both of the states its one button has.
   *
   * Two captures rather than one because the bill is settled whole: what a
   * player can and cannot afford is now a property of the total, and the
   * disabled case is the one that had to be designed rather than fallen into.
   */
  { name: 'shop-checkout', path: '/?boot=checkout&time=21:00&freeze', settleMs: 3000 },
  { name: 'shop-checkout-short', path: '/?boot=short&time=21:00&freeze', settleMs: 3000 },
  // ...and the clerk calling the player back, which is the second state of the
  // exit prompt and is reached by pressing F rather than by standing anywhere.
  // The longest settle of the three: this one arrives standing at the door with
  // the camera swung round behind it, and 2600 came back with nothing painted.
  { name: 'shop-held', path: '/?boot=held&time=21:00&freeze', settleMs: 3400 },
  { name: 'shop-dressed', path: '/?boot=shop&dressed&look=170&time=21:00&freeze', settleMs: 2600 },
  // The two places the wardrobe has to survive a pose rather than just stand
  // in it: a stool folds the legs under a floor-length hem, and the walk cycle
  // swings an arm holding a cane.
  { name: 'strip-dressed', path: '/?boot=strip&dressed&time=21:00&freeze', settleMs: 2400 },
  { name: 'blackjack-dressed', path: '/?boot=settled&dressed&time=21:00&freeze', settleMs: 5000 },
  // The walkable casino floor. Every other casino link sits the player at a
  // table, so without this the room itself is never captured.
  { name: 'casino-floor', path: '/?boot=floor&time=21:00&freeze', settleMs: 2600 },
  // ...and the far end of it. The waterfall is eighteen metres from the door,
  // and this script can press a key but not hold one, so `casino-floor` alone
  // would leave the thing the room is built around checked only from as far
  // away as it is possible to stand.
  { name: 'casino-water', path: '/?boot=water&time=21:00&freeze', settleMs: 2600 },
  // ...and the ceiling, which needs `?tilt=` for the same reason `casino-water`
  // needs its own boot link: the play camera looks *down*, so the vault is
  // above the top of the frame from every position a capture can reach.
  { name: 'casino-vault', path: '/?boot=floor&tilt=-6&time=21:00&freeze', settleMs: 2600 },
  { name: 'blackjack-bet', path: '/?boot=casino&time=21:00&freeze', settleMs: 1800 },
  // The opening deal is paced at a card a second (issue #3): the last of the
  // four opening cards leaves the shoe at 3.0s, so anything capturing a dealt
  // hand waits for the deal plus flip and settle.
  { name: 'blackjack-dealt', path: '/?boot=table&time=21:00&freeze', settleMs: 4500 },
  { name: 'blackjack-settled', path: '/?boot=settled&time=21:00&freeze', settleMs: 5000 },
  { name: 'blackjack-split', path: '/?boot=split&time=21:00&freeze', settleMs: 4500, keys: ['p'] },
  // The offer itself, and the settled round it releases when declined.
  { name: 'blackjack-insurance', path: '/?boot=insurance&time=21:00&freeze', settleMs: 4500 },
  // Bounded by `revealTimeline(7).completeAt < 7000` in revealTimeline.test.ts;
  // if the reveal outgrows the wait, that test fails before this truncates.
  { name: 'blackjack-dealer-draws', path: '/?boot=draw&time=21:00&freeze', settleMs: 7500, keys: ['s'] },
  { name: 'craps-comeout', path: '/?boot=craps&time=21:00&freeze', settleMs: 1800 },
  { name: 'craps-rolled', path: '/?boot=craps&time=21:00&freeze', settleMs: 3400, keys: [' '] },
]

/**
 * The page options for `SHOTS_VIEWPORT`, defaulting to the desktop shape.
 *
 * A narrow viewport also gets touch emulation, because the on-screen stick and
 * the tappable prompts key off the pointer type rather than the width — a
 * capture that only resized would show the desktop controls at a phone's shape,
 * which is the one combination no player ever sees.
 */
function pageOptions() {
  const spec = process.env.SHOTS_VIEWPORT
  if (!spec) return { viewport: { width: 1600, height: 900 } }

  const match = /^(\d+)x(\d+)$/.exec(spec)
  if (!match) throw new Error(`Bad SHOTS_VIEWPORT "${spec}" — expected WIDTHxHEIGHT`)

  const width = Number(match[1])
  const height = Number(match[2])
  if (width >= height) return { viewport: { width, height } }

  return { viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
}

const PAGE_OPTIONS = pageOptions()

const outDir = resolve(process.argv[2] ?? (process.env.SHOTS_VIEWPORT ? 'shots/mobile' : 'shots'))
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: [
    // SwiftShader gives headless Chrome a working WebGL stack without a GPU.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
  ],
})

const results = []

try {
  for (const scene of SCENES) {
    const page = await browser.newPage(PAGE_OPTIONS)

    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      // A 404 for the favicon is expected and not worth reporting.
      if (message.type() === 'error' && !message.text().includes('404')) {
        errors.push(message.text())
      }
    })

    await page.goto(`${BASE}${scene.path}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('canvas', { timeout: 60000 })

    // Let any ?boot= shortcut finish before typing; those go through the same
    // gesture lead-in as a real action.
    if (scene.keys?.length) {
      await page.waitForTimeout(800)
      for (const key of scene.keys) {
        await page.keyboard.press(key)
        await page.waitForTimeout(400)
      }
    }

    await page.waitForTimeout(scene.settleMs)

    /*
     * Confirm the renderer is producing frames, measured here rather than on
     * arrival.
     *
     * This used to run immediately after `goto`, which measured a scene still
     * compiling its shaders — under the load of twenty-odd captures in one
     * browser it reported four different scenes blank on two consecutive runs
     * while every image on disk was fine. A blank check that cries wolf is
     * worse than none, because it teaches you to ignore it.
     */
    const frames = await page.evaluate(
      () =>
        new Promise((resolveFrames) => {
          let count = 0
          const tick = () => {
            count++
            if (count < 12) requestAnimationFrame(tick)
            else resolveFrames(count)
          }
          requestAnimationFrame(tick)
          setTimeout(() => resolveFrames(count), 4000)
        }),
    )

    await page.screenshot({ path: `${outDir}/${scene.name}.png`, timeout: 120000 })
    await page.close()

    results.push({ scene: scene.name, frames, errors })
    console.log(`${frames > 0 ? 'ok  ' : 'BLANK'} ${scene.name}${errors.length ? `  (${errors.length} errors)` : ''}`)
  }
} finally {
  await browser.close()
}

const blank = results.filter((result) => result.frames === 0)
const broken = results.filter((result) => result.errors.length > 0)

console.log(`\n${results.length} scenes → ${outDir}`)
if (blank.length) console.log(`BLANK: ${blank.map((r) => r.scene).join(', ')}`)
if (broken.length) {
  for (const result of broken) console.log(`ERRORS in ${result.scene}:`, result.errors)
}

// Non-zero exit so this can gate a commit if it is ever wired into one.
process.exit(blank.length + broken.length > 0 ? 1 : 0)
