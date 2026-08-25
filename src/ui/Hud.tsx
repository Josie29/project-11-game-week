import { AccountBadge } from './AccountBadge'
import { STANDING_TABLES, TABLE_LABELS } from '../scenes/casinoFloorLayout'
import { Location, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { getVenue, VenueKind } from '../world/venues'
import { daylightAt, formatClock } from '../world/timeOfDay'

/** Persistent overlay: bankroll, clock, movement hint, and the door prompt. */
export function Hud() {
  const bankroll = useGameStore((state) => state.bankroll)
  const debt = useGameStore((state) => state.debt)
  const location = useGameStore((state) => state.location)
  const nearbyVenue = useGameStore((state) => state.nearbyVenue)
  const nearbyTable = useGameStore((state) => state.nearbyTable)
  const activeTable = useGameStore((state) => state.activeTable)
  const atChair = useGameStore((state) => state.atChair)
  const nearbyChair = useGameStore((state) => state.nearbyChair)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)

  const nearby = nearbyVenue ? getVenue(nearbyVenue) : null
  const atClinic = activeVenue !== null && getVenue(activeVenue).kind === VenueKind.Clinic
  const seated = activeTable !== null || atChair !== null

  return (
    <div className="hud">
      <div className="hud__bankroll">
        <span className="hud__label">Bankroll</span>
        <span className="hud__amount">${bankroll.toLocaleString()}</span>
        {/*
          A debt the player cannot see is a bug report waiting to happen: half
          of every win goes somewhere, and this is the only thing that says
          where.
        */}
        {debt > 0 && (
          <span className="hud__debt">owes ${debt.toLocaleString()}</span>
        )}
        {/* Under the money, because that is what an account is for here. */}
        <AccountBadge />
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
          {seated
            ? 'Drag to look · scroll to zoom · R to reset'
            : atClinic
              ? 'WASD to walk · F to use a chair · drag to look · R to reset'
              : 'WASD to walk · F to sit at a table · drag to look · R to reset'}
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
            {/* You stand at craps and sit at blackjack, and the prompt should
                say which — offering a seat at a table that has none is the kind
                of small lie that makes the rest read as approximate. */}
            Press <kbd>F</kbd> to {STANDING_TABLES.has(nearbyTable) ? 'take the rail' : 'sit'}
          </span>
        </div>
      )}

      {/* The same offer at a recliner. Without it the chairs look like scenery. */}
      {nearbyChair !== null && atChair === null && (
        <div className="hud__prompt">
          <strong>Donation chair</strong>
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
