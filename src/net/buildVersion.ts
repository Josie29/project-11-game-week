/*
 * Notices a deploy that happened while this tab was open.
 *
 * A tab keeps the bundle it loaded until somebody refreshes it, so every
 * deploy strands every open session on the previous build — which is how two
 * players sat at a dead blackjack table on a bug that production had already
 * fixed. There is no version endpoint and none is needed: Vite stamps a
 * content hash into the bundle filename and `index.html` is served no-cache,
 * so the hashed script path in a fresh copy of the page *is* the version id.
 * A different path means a different build, with zero build tooling.
 */

/** Matches the hashed entry bundle Vite writes into a production index.html. */
const BUNDLE_PATTERN = /\/assets\/index-[\w-]+\.js/

/**
 * The hashed entry-bundle path in an HTML document, or null when there is
 * none — the dev server serves unhashed sources, and an error page has no
 * bundle at all. Null means "nothing to compare", never "a new build".
 */
export function extractBundlePath(html: string): string | null {
  const match = BUNDLE_PATTERN.exec(html)
  return match?.[0] ?? null
}

/**
 * Five minutes. Slow enough that a tab costs the host next to nothing, fast
 * enough that two people at one table converge on the same build within a
 * hand or two — and the visibility re-check covers the case that actually
 * matters, a tab coming back from the background.
 */
export const CHECK_INTERVAL_MS = 5 * 60_000

export interface BuildWatchHandlers {
  /** Fetches a fresh copy of the page this tab was loaded from. */
  readonly getHtml: () => Promise<string>
  /** The hashed bundle path this tab is actually running. */
  readonly currentBundle: string
  /** Fired once, ever: a newer build exists. It cannot un-happen. */
  readonly onNewBuild: () => void
  readonly intervalMs?: number
}

export interface BuildWatcher {
  /** An immediate check, for moments worth one — a tab becoming visible. */
  readonly check: () => Promise<void>
  readonly stop: () => void
}

/** Polls for a build newer than the one this tab is running. */
export function watchForNewBuild(handlers: BuildWatchHandlers): BuildWatcher {
  const intervalMs = handlers.intervalMs ?? CHECK_INTERVAL_MS
  let done = false

  async function check(): Promise<void> {
    if (done) return

    let html: string
    try {
      html = await handlers.getHtml()
    } catch {
      /*
       * Silent, and still polling. A failed check must never be louder than
       * the staleness it exists to report — a player on flaky wifi should see
       * a game, not a version checker complaining about the wifi.
       */
      return
    }

    // A slow response can land after stop(), or after another check already
    // announced; a second banner-that-cannot-un-happen would be a double fire.
    if (done) return

    const bundle = extractBundlePath(html)
    if (bundle === null || bundle === handlers.currentBundle) return

    done = true
    clearInterval(timer)
    handlers.onNewBuild()
  }

  const timer = setInterval(() => void check(), intervalMs)

  return {
    check,
    stop: () => {
      done = true
      clearInterval(timer)
    },
  }
}
