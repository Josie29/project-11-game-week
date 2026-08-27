import { useSyncExternalStore } from 'react'
import { DESKTOP_LAYOUT, layoutFor, type Layout } from './viewport'

/*
 * The live viewport shape, as one subscription shared by everything that reads
 * it.
 *
 * Not zustand, and not a hook per component. Every camera in the game reads
 * this, and a `resize` listener per camera would mean the shop's two cameras,
 * the clinic's, both tables' and the walking rig all recomputing the same two
 * numbers on every frame of a phone rotating. One listener, one cached
 * snapshot, and `useSyncExternalStore` to hand it out.
 *
 * The snapshot is cached by *value* because `useSyncExternalStore` compares
 * identity: returning a fresh object each call re-renders forever.
 */

const COARSE_POINTER = '(pointer: coarse)'
const CAN_HOVER = '(hover: hover)'

let snapshot: Layout = DESKTOP_LAYOUT
let listeners: (() => void)[] = []

/** Reads the DOM once and swaps the cached snapshot only if something moved. */
function measure(): void {
  const next = layoutFor(
    window.innerWidth,
    window.innerHeight,
    window.matchMedia(COARSE_POINTER).matches,
    window.matchMedia(CAN_HOVER).matches,
  )

  if (
    next.aspect === snapshot.aspect &&
    next.portrait === snapshot.portrait &&
    next.touch === snapshot.touch
  ) {
    return
  }

  snapshot = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  if (listeners.length === 0) {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
  }

  listeners = [...listeners, listener]

  return () => {
    listeners = listeners.filter((each) => each !== listener)

    if (listeners.length === 0) {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }
}

function getSnapshot(): Layout {
  return snapshot
}

/**
 * The current viewport shape.
 *
 * @returns The live layout, re-rendering the caller when it changes.
 */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
