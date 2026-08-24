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
 * Usage: node scripts/shot.mjs <url> <output.png> [settleMs] [keys]
 *
 * `keys` is a comma-separated list pressed in order before the capture, so an
 * interaction can be verified headlessly — e.g. "p" to split, "h,h" to hit twice.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const [, , url, output, settleArg, keysArg] = process.argv

if (!url || !output) {
  console.error('Usage: node scripts/shot.mjs <url> <output.png> [settleMs] [keys]')
  process.exit(1)
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas', { timeout: 15000 })

  for (const key of keys) {
    await page.keyboard.press(key)
    // Short enough to still catch a hand gesture mid-swing; use settleMs to wait
    // for the resulting deal to land.
    await page.waitForTimeout(400)
  }

  await page.waitForTimeout(settleMs)

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

  const target = resolve(output)
  await mkdir(dirname(target), { recursive: true })
  await page.screenshot({ path: target })

  console.log(JSON.stringify({ url, output: target, framesRendered: frames, consoleErrors }, null, 1))
} finally {
  await browser.close()
}
