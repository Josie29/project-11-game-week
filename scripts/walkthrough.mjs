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
 * Usage: node scripts/walkthrough.mjs [baseUrl] [outDir] [--touch]
 *
 * Keys have to be *held*. `page.keyboard.press` is down-and-up in a few
 * milliseconds, which at 7.5 units per second moves the player about a
 * centimetre — the first version of this looked like the controls were dead.
 *
 * `--touch` drives the same beats on a phone: a portrait viewport, and every
 * key replaced by the on-screen control that does the same job. The assertions
 * below are worded to hold in both — "at a chair or the door" rather than
 * "F at a chair or the door", because the room is the claim and the key is not. Only two
 * helpers know the difference — `walk` and `press` — so every assertion and
 * every capture below is shared, which is the point. A phone build that reaches
 * the same fifteen beats is a phone build that works, and nothing else in this
 * project can say so: `?boot=` links are stripped from production, and a
 * screenshot cannot tell a stick that walks from one that does not.
 */

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

/** Kept in step with `DONATION_FEE` in src/world/money.ts by hand. */
const DONATION_FEE = 100

const args = process.argv.slice(2)
const TOUCH = args.includes('--touch')
const positional = args.filter((arg) => !arg.startsWith('--'))

const baseUrl = positional[0] ?? 'http://localhost:5173'
const outDir = resolve(positional[1] ?? (TOUCH ? 'shots/walkthrough-touch' : 'shots/walkthrough'))

/** Long enough for a scene transition plus its settle animation. */
const SETTLE_MS = 2000

/**
 * Burst length for a leg that has to stop *at* a door.
 *
 * A door offers itself across about six units of kerb, and the player now has
 * to be inside that when a burst ends rather than merely to have crossed it
 * mid-burst — pressing F is a separate act from walking. Half a second is
 * 1.9 units at the three frames a second headless manages and 3.75 at sixty, so
 * neither end of that range can step over the window.
 */
const DOOR_BURST_MS = 500

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

const page = await browser.newPage(
  TOUCH
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1600, height: 900 } },
)

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
  /*
   * The key, in both modes, and deliberately.
   *
   * This press is scaffolding rather than a claim: movement is camera-relative
   * and the follow camera swings as you walk, so re-pinning the orbit before
   * each burst is what makes "hold left" mean the same thing on burst thirty as
   * on burst one. Going through the on-screen button instead put a Playwright
   * click — seconds, on a page this starved of frames — between every burst,
   * which changed how far a burst carried and made the two modes untunable
   * against each other. The button gets its own beat further down, which is
   * where a claim about it belongs.
   */
  /*
   * Sent to the body rather than to whatever happens to hold focus.
   *
   * `page.keyboard` delivers to the focused element, and by this point that is
   * whichever button the last beat clicked — or nothing at all, if the panel it
   * lived in has since unmounted. The listener is on `window` and a keypress
   * with no focused element still reaches it, but "still reaches it" is a
   * property of the page's focus state rather than of this call, and this call
   * is what every walking leg's frame of reference depends on.
   */
  await page.locator('body').press('KeyR')
  await page.waitForTimeout(40)

  if (TOUCH) {
    await pushStick(keys, ms)
    return
  }

  for (const key of keys) await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  for (const key of keys) await page.keyboard.up(key)
}

/** Which way each movement key points on the stick. Screen y runs downward. */
const STICK_DIRECTION = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
}

/**
 * Holds the on-screen stick in the direction those keys mean, for `ms`.
 *
 * Driven with the mouse rather than `page.touchscreen`, which can only tap.
 * The stick's handlers are written against pointer events and do not care which
 * device produced them, and `setPointerCapture` keeps delivering the moves
 * after the cursor leaves the stick — which it does immediately, because full
 * travel is the edge of the control.
 */
async function pushStick(keys, ms) {
  const box = await page.locator('.touch__stick').boundingBox()
  if (!box) throw new Error('the on-screen stick is not on screen')

  const centreX = box.x + box.width / 2
  const centreY = box.y + box.height / 2

  let x = 0
  let y = 0
  for (const key of keys) {
    const direction = STICK_DIRECTION[key]
    if (!direction) throw new Error(`no stick direction for ${key}`)
    x += direction[0]
    y += direction[1]
  }

  const length = Math.hypot(x, y) || 1
  const travel = Math.min(box.width, box.height) / 2

  /*
   * One move to full travel, not a swept drag.
   *
   * The stick is analog, so the intermediate positions would each ask for a
   * fraction of a walk — and each is a pointer event on a page already short of
   * frames. A player's thumb lands and stays; this does the same.
   */
  await page.mouse.move(centreX, centreY)
  await page.mouse.down()
  await page.mouse.move(centreX + (x / length) * travel, centreY + (y / length) * travel)
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

/**
 * A key, or the on-screen control that does the same job.
 *
 * Every one of these has a button because a phone has no keyboard, and that is
 * not a concession to this script — a player on a phone reaches every one of
 * them the same way. Where the mapping had nowhere to click, the fix was a
 * button in the game rather than a special case here.
 */
async function press(key) {
  if (!TOUCH) {
    await page.keyboard.press(key)
    return
  }

  if (key === 'KeyF') {
    /*
     * The prompt card is the accept key. Only ever one is up at a time.
     *
     * Generous, because Playwright will not click a moving target and this one
     * moves: the card is re-laid-out as the player walks the last stride into
     * range, and settling takes wall-clock seconds at the frame rate this
     * renders at. Eight seconds timed out on a card the log shows it had
     * already found.
     */
    await page.locator('.hud__prompt--tap').first().click({ timeout: 30000 })
    return
  }

  if (key === 'KeyM') {
    await page.locator('.hud__menu').click({ timeout: 8000 })
    return
  }

  if (key === 'Escape') {
    // "Leave the thing you are in", which each panel spells out in its own
    // words. Whichever is on screen is the one that is meant.
    const ways = ['Close', 'Get up', 'Step down', 'Step back', 'Leave table']
    for (const label of ways) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}`) }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        return
      }
    }

    /*
     * Nothing open, which is not a failure.
     *
     * Escape with no panel up is a no-op for a player at a keyboard, and this
     * script leans on that: several beats press it defensively, to close
     * whatever the previous beat might have left open. Throwing here made the
     * touch run fail at a beat the desktop run walks straight past.
     */
    return
  }

  if (key === 'Digit1') {
    /*
     * The first stake, whichever table is up.
     *
     * Blackjack's stakes are `.button--chip` and the craps rail's are `.chip`;
     * they look the same and are two different controls. Naming both here beats
     * clicking by label — the buttons carry their own shortcut in the text
     * ("$10 1"), and on touch that badge is hidden, so an exact-name click
     * would match in one mode and not the other.
     */
    await page.locator('.button--chip, .chip').first().click({ timeout: 15000 })
    return
  }

  if (key === 'Space') {
    await page.getByRole('button', { name: /Roll the dice/ }).first().click({ timeout: 8000 })
    return
  }

  throw new Error(`no on-screen equivalent for ${key}`)
}

async function isVisible(text) {
  return page.getByText(text, { exact: false }).first().isVisible()
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

/**
 * Walks until any one of `texts` appears, and reports which.
 *
 * For a leg whose destination is "a fixture" rather than one named fixture.
 * Strafing is camera-relative and the follow camera swings behind the player's
 * heading, so holding A means "west" for the first frame and "south-west" by
 * the third: the leg down the window platform drifts toward the front wall by
 * an amount that depends entirely on how many frames the burst covered. At
 * sixty it stops at the tuxedo; at the three a headless renderer manages it has
 * ended up jammed in the front-left corner, a metre and a half past every
 * prompt in the row.
 *
 * Naming one fixture made that a failure. Naming the row makes it a walk.
 */
async function walkUntilAny(keys, texts, { burstMs = 700, bursts = 30 } = {}) {
  for (let i = 0; i < bursts; i++) {
    for (const text of texts) {
      if (await isVisible(text)) return text
    }

    await walk(keys, burstMs)
    await page.waitForTimeout(120)
  }

  throw new Error(
    `walked ${bursts} bursts of ${keys.join('+')} without seeing any of ${texts.join(', ')}`,
  )
}

/**
 * Presses the interact key once, and waits for whatever it opened.
 *
 * A press rather than a hold. `useActionKey` ignores auto-repeat, so a hold
 * would act exactly once anyway — but a press is what a player does, and this is
 * the script that is supposed to behave like one.
 */
async function interact() {
  await press('KeyF')
  await page.waitForTimeout(900)
}

/** How many beats have been captured, for the line printed at the end. */
let captureCount = 0

async function capture(name) {
  await page.waitForTimeout(SETTLE_MS)
  /*
   * Generous, because the wait is for a *stable* frame under SwiftShader.
   * A loaded machine takes these scenes below one frame a second, and at that
   * rate the default thirty seconds reports a timeout for a renderer that is
   * merely slow — which reads as the walkthrough failing at whichever beat it
   * happened to reach.
   */
  await page.screenshot({ path: resolve(outDir, `${name}.png`), timeout: 120000 })
  captureCount += 1
  console.log(`ok   ${name}`)
}

/**
 * Fails loudly rather than screenshotting whatever happened to be on screen.
 *
 * A single `isVisible()` on purpose, and not the `waitFor({ state: 'visible' })`
 * it looks like it should be.
 *
 * `isVisible` is one of the few Playwright calls that does not auto-wait, which
 * reads like a bug here — it asks once, a fixed 900 ms after the keypress. It
 * was changed to a wait with an eight-second deadline and the walkthrough
 * immediately started failing at whichever beat crossed a door, on assertions
 * whose text the failure screenshot then showed on screen.
 *
 * The difference is what a deadline means when the main thread is blocked.
 * Entering or leaving a venue mounts a whole scene, and under SwiftShader that
 * is seconds of one synchronous task; a `waitFor` timer expires during it and
 * reports a timeout for a DOM that had already updated. `isVisible` has no
 * deadline: it is answered when the thread is free again, which is the moment
 * the answer becomes meaningful. Slower, and right.
 */
async function expectText(text, step) {
  const found = await page.getByText(text, { exact: false }).first().isVisible()
  if (!found) throw new Error(`${step}: expected to see "${text}"`)
}

/**
 * The HUD's bankroll, as a number.
 *
 * Up here rather than beside the clinic beat that first needed it: the shop's
 * counter checks the same figure now, and these two readings are the only
 * assertions in this script that money actually moved, rather than that a panel
 * said it had.
 */
const bankroll = () =>
  page
    .locator('.hud__amount')
    .first()
    .innerText()
    .then((text) => Number(text.replace(/[^0-9]/g, '')))

try {
  await page.goto(baseUrl, { waitUntil: 'load' })
  await page.waitForSelector('canvas', { timeout: 20000 })

  /*
   * 0. The welcome screen, which is the first thing a new player sees.
   *
   *    Clicked through rather than skipped with `?boot=`. Those links are
   *    stripped from production builds, and this script is the only check that
   *    runs against a deployed URL — bypassing the screen here would mean the
   *    one path nobody ever verifies is the one every real player takes.
   */
  await expectText('Neon Strip', 'welcome screen')
  await capture('0-welcome')
  await page.getByRole('button', { name: 'Enter the strip' }).click()

  // 1. First run opens the designer, not the street.
  await expectText('Who are you tonight?', 'first run')
  await page.getByRole('button', { name: 'Feminine' }).click()
  await page.getByRole('button', { name: 'Long' }).click()
  await page.getByRole('button', { name: 'Cocktail dress' }).click()
  await capture('1-designer')

  await page.getByRole('button', { name: 'Hit the strip' }).click()
  await expectText('at a door', 'leaving the designer')
  await capture('2-strip')

  /*
   * 1b. The settings panel, opened with the key and closed with Escape.
   *
   *     Both halves are covered on purpose. The key is the only way in that
   *     `?boot=settings` cannot prove — that link sets the panel open before
   *     the first render, so it would pass with the listener deleted. And
   *     Escape closing it is the claim that the key keeps its one meaning
   *     everywhere: leave the thing you are in.
   */
  // The one control a phone has and a desktop does not. Every walking leg
  // below drives it; this only says it arrived.
  if (TOUCH) {
    await page.locator('.touch__stick').waitFor({ state: 'visible', timeout: 20000 })
    console.log('     the stick is on screen')
  }

  await press('KeyM')
  await page.waitForTimeout(400)
  await expectText('Start over', 'opening settings with M')
  await capture('2b-settings')

  await press('Escape')
  await page.waitForTimeout(400)
  await expectText('at a door', 'closing settings with Escape')

  // 2. Head diagonally for the shop's side of the street. The player clamps at
  //    the kerb, so the D component stops mattering once they reach it and the
  //    W component carries them down the row of doors.
  for (let i = 0; i < 6; i++) await walk(['KeyW', 'KeyD'], 700)
  await capture('3-approaching')

  /*
   * 3. Stop at the shop's door and knock.
   *
   *    Walking past a venue used to be impossible — `Player` entered on contact,
   *    in the same frame it noticed the door, so the prompt below never once
   *    painted for an open venue. Waiting for it to paint and then pressing F is
   *    both what a player does now and what makes the rest of this script
   *    tractable: the legs that walk the length of the strip no longer have to
   *    be threaded between doorways that would swallow them.
   *
   *    Keyed on the venue's *name*, not on its action line. Every door now says
   *    "Press F to enter" — F opens a door and nothing else, whichever door it
   *    is — so the action line no longer tells the three apart, and a leg
   *    waiting for it would stop at whichever doorway it wandered into first.
   *    The name is the part that varies, and it is on the same prompt.
   */
  await walkUntil(['KeyW', 'KeyD'], 'The Gilded Hanger', { burstMs: DOOR_BURST_MS, bursts: 40 })
  await interact()

  //    Asserted on the standing hint, which is the shop's own: it is a room you
  //    walk now, and the hint names what F is for in it.
  await expectText('at a rail, the mirror, the till or the door', 'walking into the shop')
  await capture('4-shop')

  /*
   * 4. Walk the floor to a fixture and try something on without paying for it.
   *
   *    This is the shop's whole point and it is worth driving rather than
   *    asserting: nothing about the fitting is persisted, so a bug that leaked a
   *    borrowed jacket into the wardrobe — or one that quietly refused to put an
   *    unaffordable item on at all — would look identical in every unit test the
   *    layer has.
   */
  /*
   *    Along the front wall, not into the room.
   *
   *    The first version of this leg held W and walked the length of the shop
   *    without being offered a thing, because the middle of a shop is empty by
   *    design — the stock is against the walls. It ended up flat against the
   *    back wall having passed nothing. A scan has to hug a run of fixtures.
   *
   *    Named fixtures rather than the generic phrase, and four of them rather
   *    than one. Where a scan stops depends on how far a burst carries and on
   *    how far the camera swung while it did, which are different on a deployed
   *    build than on localhost — naming the whole left-hand row means the leg
   *    ends at whichever of them the walk actually reached, rather than failing
   *    because it was not the one that was named.
   *
   *    Which one it was does matter to the leg after this, and that leg reads
   *    it: the far end of the window platform is three metres wide of the
   *    mirror, and walking straight down the room from there arrives at the
   *    back wall having passed nothing.
   */
  const tried = await walkUntilAny(
    ['KeyA'],
    ['Ivory Tuxedo', 'Crimson Satin Gown', 'Sequin Jacket', 'Gold Rope Chain'],
    { burstMs: DOOR_BURST_MS, bursts: 30 },
  )
  await interact()
  await expectText('on approval', 'trying something on')
  console.log(`     tried on the ${tried}`)
  await capture('5-trying-on')

  /*
   * 5. Walk to the mirror and look at it.
   *
   *    No longer the till — paying happens at the counter — so this leg is now
   *    only the check that the mirror can be found, which still matters: it is
   *    the one place the fitting is visible on the body rather than as a line
   *    of text.
   */
  /*
   *    Down the room, and back toward its middle unless the walk stopped at
   *    the fixture nearest it.
   *
   *    The mirror offers from 2.6 of the plinth, which is generous and is still
   *    not the width of this room: held from the far end of the window platform,
   *    W alone runs down the left-hand wall and reaches the back of the shop
   *    three metres wide of it. Which of the four fixtures the leg above
   *    stopped at is the only thing that decides that, so it is the thing that
   *    picks the keys.
   */
  const toTheMiddle = tried === 'Ivory Tuxedo' ? ['KeyW'] : ['KeyW', 'KeyD']
  await walkUntil(toTheMiddle, 'to see yourself', { burstMs: DOOR_BURST_MS, bursts: 30 })
  await interact()
  await expectText('Take it to the counter to pay', 'standing at the mirror')
  await capture('6-mirror')
  await press('Escape')
  await page.waitForTimeout(600)

  /*
   * 6. Try to walk out in it, and get called back.
   *
   *    The one interaction in the building where F does not do what the prompt
   *    said a frame earlier, and the only check that it is a nudge rather than
   *    a lock. Every unit test around it asserts that leaving is free; what
   *    cannot be asserted anywhere else is that the second press exists at all.
   */
  await walkAtMost(['KeyS', 'KeyD'], 'to step out', { burstMs: DOOR_BURST_MS, bursts: 22 })
  await walkUntil(['KeyA'], 'to step out', { burstMs: DOOR_BURST_MS, bursts: 20 })
  await interact()
  await expectText('is not yours', 'trying to walk out in unpaid goods')
  await capture('7-called-back')

  /*
   * 7. Back to the counter, and pay for the lot.
   *
   *    Straight in, on one key. The leg that proves the till can be found from
   *    the door, which is the walk the clerk has just sent the player on — and
   *    the diagonal that seemed the obvious way to do it is what proved it
   *    could not: W+A crossed the room and ended at the jewellery case, which
   *    is how the till's radius turned out to be five centimetres too mean.
   *
   *    It also proves the bill is one number: the HUD bankroll has to fall, and
   *    a per-item regression would show up here as a partial charge.
   */
  /*
   *    In past the end of the counter, then back along the front of it.
   *
   *    Two legs because one will not do it from here. The counter stands
   *    between the door and the room, so walking straight in is walking into
   *    it, and which side the walk comes out on depends on which way it was
   *    drifting when it hit — the till is offered from the front only, because
   *    the door owns the floor at the near end and two prompts cannot share it.
   */
  await walkAtMost(['KeyW', 'KeyA'], 'to pay', { burstMs: DOOR_BURST_MS, bursts: 12 })
  await walkUntil(['KeyS', 'KeyD'], 'to pay', { burstMs: DOOR_BURST_MS, bursts: 20 })
  await interact()

  /*
   *    Either state of the one button, because which one this run gets is not
   *    the script's to choose.
   *
   *    The bankroll starts at $500 and the left-hand fixtures run from $180 to
   *    $650, so whether the bill can be settled depends on which of them the
   *    walk above stopped at — a run that stopped at the $520 gown is $20 short
   *    and there is no Pay button to click. Both outcomes are the feature
   *    working; failing on one of them would only be the script insisting on a
   *    fixture it cannot steer to.
   */
  const payable = page.getByRole('button', { name: /^Pay \$/ })
  const short = page.getByRole('button', { name: /short$/ })
  await Promise.race([
    payable.first().waitFor({ timeout: 8000 }),
    short.first().waitFor({ timeout: 8000 }),
  ])
  await capture('8-checkout')

  if ((await payable.count()) > 0) {
    const beforePaying = await bankroll()
    await payable.first().click()
    await page.waitForTimeout(900)
    const afterPaying = await bankroll()

    if (!(afterPaying < beforePaying)) {
      throw new Error(
        `paying at the counter: bankroll went from ${beforePaying} to ${afterPaying}, expected a debit`,
      )
    }
    console.log(`     paid, and the bankroll fell from ${beforePaying} to ${afterPaying}`)
  } else {
    // Short. The bill has to stay unpaid and the goods have to go back, which
    // is the other half of what the counter is for.
    const beforeGivingUp = await bankroll()
    await page.getByRole('button', { name: 'Put it all back' }).first().click()
    await page.waitForTimeout(900)

    if ((await bankroll()) !== beforeGivingUp) {
      throw new Error('putting the bill back charged the player for it')
    }
    console.log('     could not afford it, and put it all back')
  }

  await press('Escape')
  await page.waitForTimeout(600)

  /*
   * 8. Out of the door, and on down the same kerb to the clinic.
   *
   *    The door rather than Escape. The shop used to be a panel with no exit to
   *    stand at; it has one now, and stepping out through it is the only way
   *    this script covers the same path a player takes.
   *
   *    This leg used to be the worst thing in this file. Leaving a venue puts
   *    the player three and a half units into the road, the shop's door used to
   *    grab anything within two and a half, and the first step back toward the
   *    kerb was inside that — so the run would walk straight back into the shop
   *    it had just left, and the open panel would eat every keystroke remaining.
   *    Three different arrangements of counted bursts failed, in both directions.
   *    Now it is one scan: walk down the kerb until the clinic offers.
   */
  await press('Escape')
  await page.waitForTimeout(600)
  /*
   *    Up the room first, then a scan along the front wall.
   *
   *    One diagonal does not do it: held to the end it wedges the player in the
   *    front-right corner two metres past the door, which is outside its trigger
   *    and is where a single-leg version of this ended up. Approach, then sweep.
   */
  await walkAtMost(['KeyS', 'KeyD'], 'to step out', { burstMs: DOOR_BURST_MS, bursts: 22 })
  await walkUntil(['KeyA'], 'to step out', { burstMs: DOOR_BURST_MS, bursts: 20 })
  await interact()
  await expectText('at a door', 'stepping back onto the strip')
  // Out on the street in something that was tried on and then paid for — the
  // proof that a purchase survives the walk out of the room it was made in.
  await capture('9-out-in-it')

  await walkUntil(['KeyW', 'KeyD'], 'Red River Plasma', {
    burstMs: DOOR_BURST_MS,
    bursts: 45,
  })
  await interact()
  await expectText('at a chair or the door', 'walking into the clinic')
  await capture('10-clinic')

  // 6. Sell a pint. Ten seconds of nurse, and the bankroll is the proof.
  /*
   *    Walking in usually lands beside a recliner, but not always: which chair
   *    is nearest depends on where the door was crossed, and against a deployed
   *    URL this arrived one chair short often enough to fail a deploy check
   *    that had otherwise passed. So it walks up to one rather than assuming it
   *    is already standing at it. Costs nothing when the prompt is already up.
   */
  await walkAtMost(['KeyW'], 'Donation chair', { bursts: 8 })
  await expectText('Donation chair', 'arriving in the clinic')
  await press('KeyF')
  await page.waitForTimeout(700)
  await expectText('Donate', 'sitting in the chair')

  const before = await bankroll()
  await page.getByRole('button', { name: 'Donate' }).click()

  /*
   *    Caught partway through, which is the only moment the thing being built
   *    here exists: the nurse at the chair, the line running to her stand, and
   *    the bag part full. Half a second either side of the ten and there is
   *    nothing to see — before it, she is still walking over; after it, the bag
   *    has gone with her.
   */
  await page.waitForTimeout(6000)
  await page.screenshot({ path: resolve(outDir, '11-drawing.png'), timeout: 120000 })
  captureCount += 1
  console.log('ok   11-drawing')

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
  await capture('12-donated')

  /*
   * 7. Out of the clinic by its door, then across the street to the casino.
   *
   *    Escape stands the donor up; it does not leave the building. There is no
   *    Escape-from-anywhere for a room — the door is the only way out, which is
   *    the whole reason the exit carries a prompt and a lit sign.
   *
   *    S and D together because the door is at the far corner from the chairs:
   *    the recliners run down the left wall and the way out is centre-right.
   */
  await press('Escape')
  await page.waitForTimeout(700)

  await walkUntil(['KeyS', 'KeyD'], 'to step out', {
    burstMs: DOOR_BURST_MS,
    bursts: 40,
  })
  await interact()
  await expectText('at a door', 'stepping back onto the strip')

  /*
   *    Cross, then ride the kerb up to the casino's door.
   *
   *    The crossing is the leg that does not behave the same way twice. Movement
   *    is camera-relative and `walk` re-pins the camera each burst, so whether
   *    the player finishes it pinned square against the far kerb at the clinic's
   *    row or curls the last few units up level with the casino is decided by
   *    frame timing. Both were observed on the same machine minutes apart.
   *
   *    Hence a leg that tolerates either, followed by one that only has work to
   *    do in the first case. Going up the kerb rather than straight across also
   *    keeps the player off the diagonal, which reaches the casino's row while
   *    still out in the middle of the road, seven units short of the door.
   */
  await walkAtMost(['KeyA'], 'Golden Ace', { bursts: 20 })
  await walkUntil(['KeyS', 'KeyA'], 'Golden Ace', {
    burstMs: DOOR_BURST_MS,
    bursts: 60,
  })
  await interact()
  await expectText('at a table or the door', 'walking into the casino')

  /*
   *    Shorter bursts for the last few feet across the floor.
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
  await capture('13-at-the-table')

  // 8. Sit down and play a hand. F, not E — E is the camera orbit.
  await press('KeyF')
  await page.waitForTimeout(600)
  await expectText('Leave table', 'sitting down')
  await capture('14-seated')

  //    The stake keys are the primary control at the table, and the buttons
  //    carry their shortcut in the label ("$10 1"), which makes an exact-name
  //    click brittle. Press the key the HUD tells the player to press.
  await press('Digit1')
  await page.waitForTimeout(2000)
  await expectText('DEALER', 'dealing a hand')
  await capture('15-hand-dealt')

  // 9. Cross the floor to the other table. The casino stopped being a single
  //    table a while ago, and nothing walked from one to the other — which is
  //    the only part of the room a `?boot=` link cannot reach.
  await press('Escape')
  await page.waitForTimeout(800)
  await expectText('at a table or the door', 'standing back up')

  /*
   *    Straight across, at the depth the blackjack seat already put the player.
   *    The craps table reaches far enough to be caught mid-stride from here,
   *    which `casinoFloorLayout.test.ts` asserts — a narrower prompt had the
   *    player walk the length of the room without ever being offered the table.
   *
   *    The prompt names the table, so this waits for the right one rather than
   *    for any prompt at all.
   */
  await walkUntil(['KeyD'], 'Craps', { bursts: 30 })
  await capture('16-crossing-to-craps')

  // 10. Take the rail at craps and throw the dice. Nobody sits at craps, so
  //    this is a stand rather than a seat.
  await press('KeyF')
  await page.waitForTimeout(600)
  await expectText('Roll the dice', 'stepping up to craps')
  await capture('17-at-craps')

  /*
   *    Stake the pass line before throwing. The dice cannot be thrown with
   *    nothing at risk, so Space on an empty felt is a no-op — and the first
   *    version of this beat asserted on the HUD's "DICE" label, which is
   *    printed whether or not anything was rolled. It passed without a throw
   *    ever having happened.
   */
  //    By data attribute, not by name: a bet is one cell now, and its
  //    accessible name carries the terms alongside the label.
  await page.locator('[data-bet="pass-line"]').first().click()
  await page.waitForTimeout(400)

  await press('Space')
  //    Long enough for the tumble to settle and the dice to turn to their
  //    faces; the throw gives up after 2.2 seconds of its own accord.
  await page.waitForTimeout(3600)

  //    The outcome line only renders once the engine has settled a roll, which
  //    makes its presence the one thing on screen that cannot be true unless
  //    the dice were actually thrown.
  await page.waitForSelector('.table-ui__outcome', { timeout: 6000 })
  await capture('18-dice-thrown')

  if (failures.length > 0) {
    throw new Error(`page errors: ${failures.join(' | ')}`)
  }

  console.log(`\n${captureCount} beats → ${outDir}`)
} catch (error) {
  await page.screenshot({ path: resolve(outDir, 'failure.png'), timeout: 120000 })
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
