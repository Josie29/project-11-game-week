import { Location, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { getVenue } from '../world/venues'
import { daylightAt, formatClock } from '../world/timeOfDay'

/** Persistent overlay: bankroll, clock, movement hint, and the door prompt. */
export function Hud() {
  const bankroll = useGameStore((state) => state.bankroll)
  const location = useGameStore((state) => state.location)
  const nearbyVenue = useGameStore((state) => state.nearbyVenue)
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
        <div className="hud__hint">Drag to look &middot; scroll to zoom &middot; R to reset</div>
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
