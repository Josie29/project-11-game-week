import { chromium } from 'playwright-core'

/**
 * Prints the world position of every named object matching a prefix.
 *
 * The companion to `shot.mjs`, for the case a screenshot cannot answer: an
 * object that was never created looks exactly like one placed off screen, or
 * behind another, or below the floor. This asks the scene graph instead of the
 * camera.
 *
 * It was written for the wardrobe. A lacquered cane came back invisible in
 * every capture and the two possibilities — never rendered, or rendered dark on
 * dark — needed different fixes. `worn:held` turned out to be exactly where
 * `anchorFor` said it should be, so the fix was the colour, not the anchor.
 *
 * Usage: node scripts/locate.mjs <url> [prefix]
 *
 * Names currently published to it:
 * - `worn:<slot>` — every equipped wardrobe item on a character.
 *
 * Development builds only; it depends on `window.devRender` from `DevBridge`.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SETTLE_FRAMES = 120

const [, , url, prefix = ''] = process.argv

if (!url) {
  console.error('Usage: node scripts/locate.mjs <url> [prefix]')
  process.exit(1)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

try {
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => 'devRender' in window, null, { timeout: 15000 })

  // Step the loop by hand: a headless tab never paints, so anything positioned
  // by an animation is still at its initial transform until the frames run.
  await page.evaluate((frames) => window.devRender.step(frames), SETTLE_FRAMES)

  const found = await page.evaluate((p) => window.devRender.locate(p), prefix)

  console.log(
    JSON.stringify(
      {
        url,
        prefix,
        count: found.length,
        objects: found.map(({ name, position }) => ({
          name,
          // Three decimals is about a millimetre, which is finer than anything
          // here is placed to and keeps the output one line per object.
          position: position.map((value) => Number(value.toFixed(3))),
        })),
      },
      null,
      1,
    ),
  )
} finally {
  await browser.close()
}
