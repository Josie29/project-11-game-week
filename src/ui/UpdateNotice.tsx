import { useEffect, useState } from 'react'
import { watchForNewBuild } from '../net/buildVersion'

/**
 * "A newer version is out — refresh." Nothing more.
 *
 * Deliberately passive: it never reloads on its own, because a refresh the
 * player did not ask for while they have money on the felt is worse than any
 * stale tab. It offers the reload and waits.
 *
 * The comparison key is the hashed bundle path in this document's own script
 * tag against the one in a freshly fetched copy of the page. In development
 * there is no hashed bundle, so the watcher never starts and the component is
 * inert — the banner is untestable from `npm run dev` by design; force it by
 * editing the served index.html under `vite preview` instead.
 */

/** The hashed bundle this tab is running, from its own script tag. */
function currentBundlePath(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/"]')
  if (script === null) return null
  return new URL(script.src, window.location.href).pathname
}

function useNewBuildAvailable(): boolean {
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    // The capture and walkthrough harnesses drive the app with `?boot=`; a
    // banner appearing mid-run would land in screenshots and steal clicks.
    if (new URLSearchParams(window.location.search).has('boot')) return

    const current = currentBundlePath()
    if (current === null) return

    const watcher = watchForNewBuild({
      getHtml: () => fetch('/', { cache: 'no-store' }).then((response) => response.text()),
      currentBundle: current,
      onNewBuild: () => setAvailable(true),
    })

    /*
     * A tab coming back from the background is the moment staleness peaks —
     * it has been ignoring deploys for as long as it was hidden — so it earns
     * a check right now rather than at the next interval.
     */
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void watcher.check()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      watcher.stop()
    }
  }, [])

  return available
}

export function UpdateNotice() {
  const available = useNewBuildAvailable()

  if (!available) return null

  return (
    <div className="update-notice">
      <span>A newer version of the game is out.</span>
      <button
        type="button"
        className="update-notice__refresh"
        onClick={() => window.location.reload()}
      >
        Refresh
      </button>
    </div>
  )
}
