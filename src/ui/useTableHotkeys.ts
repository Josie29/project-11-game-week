import { useEffect, useRef } from 'react'

export interface TableHotkeyHandlers {
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onSplit: () => void
  onNextRound: () => void
  onLeave: () => void
  /** Picks a stake by position: 0 for the first chip button, and so on. */
  onBet: (slot: number) => void
  /** Takes the offered insurance. No-op outside an insurance window. */
  onInsure?: () => void
  /** Declines the offered insurance. No-op outside an insurance window. */
  onDeclineInsurance?: () => void
}

/**
 * Binds the table's keyboard shortcuts while the panel is mounted.
 *
 * Real players signal with their hands rather than reaching for a mouse, so the
 * keys are the primary control and the buttons are the discoverable fallback.
 *
 * No conflict with the strip's WASD: `Player` only mounts outdoors, so "S"
 * cannot mean both "walk back" and "stand" at the same time.
 */
export function useTableHotkeys(handlers: TableHotkeyHandlers): void {
  // Held in a ref so the listener is bound once rather than being torn down and
  // rebuilt on every render as the handlers close over new state.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // Leave browser and OS shortcuts alone.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const current = handlersRef.current

      switch (event.key.toLowerCase()) {
        case 'h':
          current.onHit()
          break
        case 's':
          current.onStand()
          break
        case 'd':
          current.onDouble()
          break
        case 'p':
          current.onSplit()
          break
        case ' ':
          // Space would otherwise scroll, or re-fire a focused button.
          event.preventDefault()
          current.onNextRound()
          break
        case 'escape':
          current.onLeave()
          break
        case 'i':
          current.onInsure?.()
          break
        case 'n':
          current.onDeclineInsurance?.()
          break
        case '1':
        case '2':
        case '3':
          current.onBet(Number(event.key) - 1)
          break
        default:
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
