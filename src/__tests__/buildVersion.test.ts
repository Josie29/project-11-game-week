import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_INTERVAL_MS, extractBundlePath, watchForNewBuild } from '../net/buildVersion'

/*
 * The staleness detector. A tab open across a deploy keeps running the old
 * bundle until somebody refreshes it, and nothing used to say so — which is
 * how two players sat at a dead blackjack table on a bug production had
 * already fixed. These tests hold the detector to firing exactly when the
 * served bundle hash differs from the one the tab loaded, and never
 * otherwise: a false "new version" banner teaches players to ignore it.
 */

/** A production index.html, the shape Vite actually emits. */
function prodHtml(bundle: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="UTF-8" />',
    `<script type="module" crossorigin src="${bundle}"></script>`,
    '</head><body><div id="root"></div></body></html>',
  ].join('\n')
}

const RUNNING = '/assets/index-dciOx4NK.js'
const NEWER = '/assets/index-Bq7xW2aa.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('extractBundlePath', () => {
  it('finds the hashed bundle in production HTML', () => {
    expect(extractBundlePath(prodHtml(RUNNING))).toBe(RUNNING)
  })

  /*
   * The dev server serves unhashed sources. Reading that as a new build would
   * pop the banner on every `npm run dev` session, permanently.
   */
  it('returns null for the dev-server page and for garbage', () => {
    const dev = '<script type="module" src="/src/main.tsx"></script>'
    expect(extractBundlePath(dev)).toBeNull()
    expect(extractBundlePath('<html>Bad Gateway</html>')).toBeNull()
    expect(extractBundlePath('')).toBeNull()
  })
})

describe('watchForNewBuild', () => {
  /*
   * The quiet case is the common case. A banner that appears when nothing was
   * deployed is a cried wolf, and this is the assertion that stops one.
   */
  it('never fires while the served bundle matches the running one', async () => {
    const onNewBuild = vi.fn()
    const watcher = watchForNewBuild({
      getHtml: () => Promise.resolve(prodHtml(RUNNING)),
      currentBundle: RUNNING,
      onNewBuild,
    })

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 10)

    expect(onNewBuild).not.toHaveBeenCalled()
    watcher.stop()
  })

  /*
   * The reason the module exists: a deploy while the tab is open surfaces
   * within one interval. Once is enough — a new build cannot un-happen, so
   * polling on after the announcement would only waste the host's bandwidth
   * and risk a second banner.
   */
  it('fires once on a changed bundle, then stops polling', async () => {
    const onNewBuild = vi.fn()
    const getHtml = vi.fn(() => Promise.resolve(prodHtml(NEWER)))
    watchForNewBuild({ getHtml, currentBundle: RUNNING, onNewBuild })

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(onNewBuild).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 5)
    expect(onNewBuild).toHaveBeenCalledTimes(1)
    expect(getHtml).toHaveBeenCalledTimes(1)
  })

  /*
   * Flaky wifi at the casino. A failed fetch must cost the player nothing —
   * no banner, no error — and must not kill the watcher, or one bad moment
   * on the train leaves the tab unwatched for the rest of the session.
   */
  it('swallows a failed fetch and still catches a later deploy', async () => {
    const onNewBuild = vi.fn()
    const getHtml = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(prodHtml(NEWER))
    watchForNewBuild({ getHtml, currentBundle: RUNNING, onNewBuild })

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(onNewBuild).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(onNewBuild).toHaveBeenCalledTimes(1)
  })

  /*
   * A response with no bundle in it — an error page, a captive portal — says
   * nothing about versions. "Different from mine" must mean a hash was found
   * and it differs, or hotel wifi would pop the refresh banner mid-hand.
   */
  it('treats a response with no bundle path as no change', async () => {
    const onNewBuild = vi.fn()
    const watcher = watchForNewBuild({
      getHtml: () => Promise.resolve('<html>Sign in to Casino Guest WiFi</html>'),
      currentBundle: RUNNING,
      onNewBuild,
    })

    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3)

    expect(onNewBuild).not.toHaveBeenCalled()
    watcher.stop()
  })

  /*
   * The unmount path. A stopped watcher that kept fetching would pile up one
   * interval per mount across a session of React strict-mode remounts.
   */
  it('stops checking once stopped', async () => {
    const onNewBuild = vi.fn()
    const getHtml = vi.fn(() => Promise.resolve(prodHtml(NEWER)))
    const watcher = watchForNewBuild({ getHtml, currentBundle: RUNNING, onNewBuild })

    watcher.stop()
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 3)

    expect(getHtml).not.toHaveBeenCalled()
    expect(onNewBuild).not.toHaveBeenCalled()
  })

  /*
   * A response already in flight when stop() lands must not announce — the
   * component that asked is unmounted, and the announcement cannot un-happen.
   */
  it('ignores a response that arrives after stop', async () => {
    const onNewBuild = vi.fn()
    let respond: (html: string) => void = () => {}
    const watcher = watchForNewBuild({
      getHtml: () => new Promise<string>((resolve) => (respond = resolve)),
      currentBundle: RUNNING,
      onNewBuild,
    })

    const inFlight = watcher.check()
    watcher.stop()
    respond(prodHtml(NEWER))
    await inFlight

    expect(onNewBuild).not.toHaveBeenCalled()
  })

  /*
   * The visibility path: a tab coming back from the background checks now,
   * not up to five minutes from now — returning to the game is exactly the
   * moment a player is about to act on a stale table.
   */
  it('check() detects a new build without waiting for the interval', async () => {
    const onNewBuild = vi.fn()
    const watcher = watchForNewBuild({
      getHtml: () => Promise.resolve(prodHtml(NEWER)),
      currentBundle: RUNNING,
      onNewBuild,
    })

    await watcher.check()

    expect(onNewBuild).toHaveBeenCalledTimes(1)
  })
})
