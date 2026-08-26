import { useEffect, useRef } from 'react'

/**
 * Runs `onPress` once per physical press of a key.
 *
 * Three scenes had grown their own copy of this listener with their own copy of
 * the modifier guard, and a fourth was about to. It is one hook now, and it
 * carries the guard none of the copies had:
 *
 * **A held key repeats.** The browser fires `keydown` over and over while a key
 * is down, and with the same key on both sides of a door — F to go in, F to step
 * out — one leant-on press would enter a venue, leave it, and enter it again
 * several times a second. `event.repeat` is the difference between a door and a
 * turnstile.
 *
 * The handler is held in a ref so a caller can pass a fresh closure every render
 * without the listener being torn down and rebuilt each time; a listener that
 * remounts mid-press can miss the keyup and strand the guard.
 *
 * @param key The key to watch, compared case-insensitively against `event.key`.
 * @param onPress Called on the leading edge of each press. Pass `null` to
 *   disable, which is how a scene stops listening while the player is seated.
 */
export function useActionKey(key: string, onPress: (() => void) | null): void {
  const handler = useRef(onPress)
  handler.current = onPress

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // A modified press is a browser shortcut, not a game input.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.repeat) return
      if (event.key.toLowerCase() !== key.toLowerCase()) return

      handler.current?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key])
}
