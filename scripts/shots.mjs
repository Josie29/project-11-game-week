import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

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
 */

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
  { name: 'blackjack-dressed', path: '/?boot=settled&dressed&time=21:00&freeze', settleMs: 2600 },
  // The walkable casino floor. Every other casino link sits the player at a
  // table, so without this the room itself is never captured.
  { name: 'casino-floor', path: '/?boot=floor&time=21:00&freeze', settleMs: 2600 },
  { name: 'blackjack-bet', path: '/?boot=casino&time=21:00&freeze', settleMs: 1800 },
  { name: 'blackjack-dealt', path: '/?boot=table&time=21:00&freeze', settleMs: 1800 },
  { name: 'blackjack-settled', path: '/?boot=settled&time=21:00&freeze', settleMs: 2600 },
  { name: 'blackjack-split', path: '/?boot=split&time=21:00&freeze', settleMs: 2000, keys: ['p'] },
  { name: 'blackjack-dealer-draws', path: '/?boot=draw&time=21:00&freeze', settleMs: 4200, keys: ['s'] },
  { name: 'craps-comeout', path: '/?boot=craps&time=21:00&freeze', settleMs: 1800 },
  { name: 'craps-rolled', path: '/?boot=craps&time=21:00&freeze', settleMs: 3400, keys: [' '] },
]

const outDir = resolve(process.argv[2] ?? 'shots')
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

    const errors = []
    page.on('pageerror', (error) => errors.push(String(error)))
    page.on('console', (message) => {
      // A 404 for the favicon is expected and not worth reporting.
      if (message.type() === 'error' && !message.text().includes('404')) {
        errors.push(message.text())
      }
    })

    await page.goto(`${BASE}${scene.path}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('canvas', { timeout: 15000 })

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

    await page.screenshot({ path: `${outDir}/${scene.name}.png` })
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
