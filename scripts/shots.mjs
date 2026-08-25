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
  { name: 'strip', path: '/', settleMs: 2400 },
  { name: 'blackjack-bet', path: '/?boot=casino', settleMs: 1800 },
  { name: 'blackjack-dealt', path: '/?boot=table', settleMs: 1800 },
  { name: 'blackjack-settled', path: '/?boot=settled', settleMs: 2600 },
  { name: 'blackjack-split', path: '/?boot=split', settleMs: 2000, keys: ['p'] },
  { name: 'blackjack-dealer-draws', path: '/?boot=draw', settleMs: 4200, keys: ['s'] },
  { name: 'craps-comeout', path: '/?boot=craps', settleMs: 1800 },
  { name: 'craps-rolled', path: '/?boot=craps', settleMs: 3400, keys: [' '] },
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

    // Confirm the renderer produced frames rather than capturing a blank canvas.
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
