import { STICK_IDLE, type StickVector } from './touchInput'

/*
 * What the on-screen stick is asking for, right now, as a plain mutable value.
 *
 * Deliberately not in a store, for the reason `net/localTransform.ts` is not:
 * this changes on every pointer event while a thumb is down and is read on
 * every frame by the walk loop. Routing it through zustand would re-render the
 * world sixty times a second to move one figure — the same rule as the walk
 * cycle's `speedRef`.
 *
 * `TouchControls` writes it; `WalkingPlayer` reads it. Nothing subscribes.
 */

let current: StickVector = STICK_IDLE

/** Called from the stick's pointer handlers. */
export function setTouchMove(next: StickVector): void {
  current = next
}

/** Reads what the stick is asking for. `STICK_IDLE` when nothing is touching it. */
export function getTouchMove(): StickVector {
  return current
}

/**
 * "Put the camera back behind me", which the keyboard spells `R`.
 *
 * An event rather than a flag anybody polls. `useOrbitInput` already owns the
 * `R` key for every camera in the game — the walking rig and both tables share
 * it — so the button has to reach exactly the same handler, and a subscription
 * is the only shape that cannot drop a press between two frames.
 */
let listeners: (() => void)[] = []

export function requestRecentre(): void {
  for (const listener of listeners) listener()
}

/** Subscribes to the recentre button. Returns the unsubscribe. */
export function onRecentre(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((each) => each !== listener)
  }
}
