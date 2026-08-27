/*
 * "Do the thing I am standing at", as an event.
 *
 * The keyboard spells it `F` and `useActionKey` owns that key. A phone has no
 * keyboard, and the thing a player taps instead is the prompt already on screen
 * — it names what is on offer and what accepting it will do, which makes it the
 * only honest button for the job.
 *
 * A module-level event rather than a store field. The four scenes that accept
 * the offer close over scene-local state and pass a fresh handler on every
 * render; `useActionKey` already holds that in a ref for exactly that reason,
 * and this reaches the same ref by the same route. Nothing renders when it
 * fires, which is right — pressing F does not re-render the world either.
 */

let listeners: (() => void)[] = []

/** Called by the HUD when the prompt is tapped. */
export function fireInteract(): void {
  for (const listener of listeners) listener()
}

/** Subscribes to taps. Returns the unsubscribe. */
export function onInteract(listener: () => void): () => void {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((each) => each !== listener)
  }
}
