import { useCallback, useRef } from 'react'

/*
 * How the emote picker knows where the bottom of the screen ends.
 *
 * The picker used to sit a fixed distance up — right while walking, where the
 * bottom holds one line of prompt, and wrong at a table, where `.table-ui` is
 * a stacked column whose height changes with the game (craps is the tallest)
 * and becomes a 45% sheet on a phone. No constant can be correct for all of
 * them, so the honest number is the measured one (issue #19).
 *
 * The control bar publishes how much of the viewport it occupies, from the
 * bottom edge to its own top, as `--say-floor` on the document element — the
 * same publish-to-CSS move `applySheetFraction` makes for `--sheet`, made per
 * frame of layout instead of once at start-up. `.emote-picker` and
 * `.invite-prompt` sit `calc(var(--say-floor, …) + gap)` above it, with a
 * fallback in the stylesheet that reproduces the walking placement whenever
 * no bar is mounted to say otherwise.
 */

/** The CSS custom property the bottom bar publishes and the picker reads. */
export const SAY_FLOOR_PROPERTY = '--say-floor'

/**
 * A ref for whatever owns the bottom of the screen, publishing its height.
 *
 * Attach to the `.table-ui` root. While the node is mounted, its occupied
 * height — viewport bottom up to the element's top, which folds in both the
 * bar's own height and whatever gap it floats above — is kept fresh through
 * a `ResizeObserver` plus a window resize listener (the observer sees the
 * element change size; only the listener sees the viewport change under it).
 * Unmounting removes the property, which is what hands the picker back its
 * stylesheet fallback.
 *
 * @returns A callback ref. Only one publisher exists at a time by
 *   construction — a player is at one table or none.
 */
export function useSayFloor(): (node: HTMLElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null)

  return useCallback((node) => {
    cleanup.current?.()
    cleanup.current = null
    if (!node) return

    function publish(): void {
      if (!node) return
      const top = node.getBoundingClientRect().top
      const occupied = Math.max(0, window.innerHeight - top)
      document.documentElement.style.setProperty(SAY_FLOOR_PROPERTY, `${Math.round(occupied)}px`)
    }

    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(node)
    window.addEventListener('resize', publish)

    cleanup.current = () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
      document.documentElement.style.removeProperty(SAY_FLOOR_PROPERTY)
    }
  }, [])
}
