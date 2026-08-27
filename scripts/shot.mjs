import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright-core'

/**
 * Screenshots the running dev server headlessly.
 *
 * Driving a visible Chrome window is unreliable for this: when the window is
 * not frontmost the browser throttles requestAnimationFrame to zero, three.js
 * never paints, and every capture comes back black. Headless Chrome renders
 * regardless of window focus, so visual checks stop depending on what else is
 * on screen.
 *
 * Usage: node scripts/shot.mjs <url> <output.png> [settleMs] [keys] [viewport]
 *
 * `keys` is a comma-separated list pressed in order before the capture, so an
 * interaction can be verified headlessly — e.g. "p" to split, "h,h" to hit twice.
 *
 * `viewport` is `WIDTHxHEIGHT`, defaulting to the 1600x900 every existing
 * capture was composed at. `390x844` is a phone held upright, and it is not a
 * cosmetic difference: a field of view is stated vertically, so that shape sees
 * less than a third as much across the screen and every fixed camera in the
 * game frames something different. A phone viewport also turns on touch
 * emulation, because the on-screen controls key off the pointer type.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const [, , url, output, settleArg, keysArg, viewportArg] = process.argv

if (!url || !output) {
  console.error(
    'Usage: node scripts/shot.mjs <url> <output.png> [settleMs] [keys] [WIDTHxHEIGHT]',
  )
  process.exit(1)
}

/**
 * The page options for a viewport argument.
 *
 * A narrow viewport gets `hasTouch` and `isMobile` as well as the size. The
 * game decides whether to draw its on-screen stick from `(pointer: coarse) and
 * (hover: none)`, so a capture that only resized the window would come back
 * showing the desktop controls at a phone's shape — which is the one
 * combination no player ever sees.
 */
function pageOptions(spec) {
  if (!spec) return { viewport: { width: 1600, height: 900 } }

  const match = /^(\d+)x(\d+)$/.exec(spec)
  if (!match) {
    console.error(`Bad viewport "${spec}" — expected WIDTHxHEIGHT, e.g. 390x844`)
    process.exit(1)
  }

  const width = Number(match[1])
  const height = Number(match[2])
  if (width >= height) return { viewport: { width, height } }

  return {
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  }
}

const keys = keysArg ? keysArg.split(',').filter(Boolean) : []

// Long enough for the deal animation to ease into place before capture.
const settleMs = Number(settleArg ?? 2500)

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

try {
  const page = await browser.newPage(pageOptions(viewportArg))

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 60000 })

  // Confirm the renderer actually produced frames rather than capturing a
  // blank canvas and calling it a pass.
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
        setTimeout(() => resolveFrames(count), 2000)
      }),
  )

  // Let any ?boot= shortcut finish before typing. Those go through the same
  // gesture lead-in as a real action, so a key pressed immediately would land
  // while the round is still mid-transition and be ignored.
  if (keys.length > 0) await page.waitForTimeout(800)

  for (const key of keys) {
    await page.keyboard.press(key)
    // Short enough to still catch a hand gesture mid-swing; use settleMs to wait
    // for the resulting deal to land.
    await page.waitForTimeout(400)
  }

  await page.waitForTimeout(settleMs)

  const target = resolve(output)
  await mkdir(dirname(target), { recursive: true })
  /*
   * Generous, because the wait is for a *stable* frame and this renders on
   * SwiftShader. A loaded machine takes this scene below one frame a second,
   * at which point the default thirty seconds is not the renderer failing —
   * it is the renderer being slow, and the two look identical from here.
   * `framesRendered` above is what distinguishes a slow capture from a blank
   * one.
   */
  await page.screenshot({ path: target, timeout: 120000 })

  console.log(JSON.stringify({ url, output: target, framesRendered: frames, consoleErrors }, null, 1))
} finally {
  await browser.close()
}
