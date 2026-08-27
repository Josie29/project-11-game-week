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
