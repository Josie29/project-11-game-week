import { TABLE_LABELS } from '../scenes/casinoFloorLayout'
import { Location, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { getVenue } from '../world/venues'
import { daylightAt, formatClock } from '../world/timeOfDay'

/** Persistent overlay: bankroll, clock, movement hint, and the door prompt. */
export function Hud() {
  const bankroll = useGameStore((state) => state.bankroll)
  const location = useGameStore((state) => state.location)
  const nearbyVenue = useGameStore((state) => state.nearbyVenue)
  const nearbyTable = useGameStore((state) => state.nearbyTable)
  const activeTable = useGameStore((state) => state.activeTable)
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)

  const nearby = nearbyVenue ? getVenue(nearbyVenue) : null

  return (
    <div className="hud">
      <div className="hud__bankroll">
        <span className="hud__label">Bankroll</span>
        <span className="hud__amount">${bankroll.toLocaleString()}</span>
      </div>

      {/* Deliberately still shown indoors, where a real casino would have none. */}
      <time className="hud__clock">{formatClock(minuteOfDay)}</time>

      {location === Location.Strip && (
        <div className="hud__hint">
          WASD to walk &middot; drag to look &middot; scroll to zoom &middot; R to reset
        </div>
      )}

      {location === Location.Interior && (
        <div className="hud__hint">
          {activeTable === null
            ? 'WASD to walk · F to sit at a table · drag to look · R to reset'
            : 'Drag to look · scroll to zoom · R to reset'}
        </div>
      )}

      {/*
        The table prompt. Unlike the door prompt, this one actually paints —
        walking up to a table only offers the seat, it does not take it, so the
        player has time to read it.
      */}
      {nearbyTable !== null && activeTable === null && (
        <div className="hud__prompt">
          <strong>{TABLE_LABELS[nearbyTable]}</strong>
          <span>
            Press <kbd>F</kbd> to sit
          </span>
        </div>
      )}

      {nearby && (
        <div className="hud__prompt" style={{ borderColor: nearby.neonColor }}>
          <strong style={{ color: nearby.neonColor }}>{nearby.name}</strong>
          {/*
            "Closed tonight" was written when the strip was permanently dark.
            It survived unchanged into a noon sky, which is the sort of line a
            player reads once and stops trusting the rest of the screen over.
          */}
          <span>
            {nearby.available
              ? nearby.invitation
              : daylightAt(minuteOfDay) > 0.5
                ? 'Closed today'
                : 'Closed tonight'}
          </span>
        </div>
      )}
    </div>
  )
}
