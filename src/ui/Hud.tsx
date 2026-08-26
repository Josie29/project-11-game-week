import { findItem } from '../character/catalog'
import { approvalTotal, isFitting, onApproval } from '../character/fitting'
import { STANDING_TABLES, TABLE_LABELS } from '../scenes/casinoFloorLayout'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { Location, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { INTERACT_LABEL } from '../world/controls'
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
  const nearbyExit = useGameStore((state) => state.nearbyExit)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const nearbyDisplay = useGameStore((state) => state.nearbyDisplay)
  const nearbyMirror = useGameStore((state) => state.nearbyMirror)
  const atMirror = useGameStore((state) => state.atMirror)
  const equipped = useAppearanceStore((state) => state.equipped)
  const owned = useAppearanceStore((state) => state.owned)
  const fitting = useAppearanceStore((state) => state.fitting)
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)

  const nearby = nearbyVenue ? getVenue(nearbyVenue) : null
  const venue = activeVenue !== null ? getVenue(activeVenue) : null
  const atClinic = venue?.kind === VenueKind.Clinic
  const shopping = venue?.kind === VenueKind.Shop
  const seated = activeTable !== null || atChair !== null || atMirror

  /*
   * The item F is standing at, and whether it is already on.
   *
   * One key, and it toggles — so the prompt has to say which way it will go, or
   * walking up to something you are wearing offers to put it on again.
   */
  const display = findItem(nearbyDisplay ?? undefined)
  const wearing =
    display !== null && (fitting[display.slot] ?? equipped[display.slot]) === display.id

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
        {/*
          What you are walking around in but have not paid for.

          Nobody should reach the mirror surprised, and four things tried on
          across a room is easy to lose track of once the list that used to
          total them is gone.
        */}
        {isFitting(fitting) && (
          <span className="hud__approval">
            on approval {onApproval(fitting).length} · ${approvalTotal(fitting).toLocaleString()}
          </span>
        )}
      </div>

      {/* Deliberately still shown indoors, where a real casino would have none. */}
      <time className="hud__clock">{formatClock(minuteOfDay)}</time>

      {location === Location.Strip && (
        <div className="hud__hint">
          WASD to walk &middot; F at a door &middot; drag to look &middot; R to reset
        </div>
      )}

      {location === Location.Interior && (
        <div className="hud__hint">
          {/*
            The door is named here because it is the only way out — there is no
            Escape-from-anywhere. A player who cannot find it is stuck, so the
            standing hint says where to point F as well as the prompt at the
            door itself.
          */}
          {seated
            ? 'Drag to look · scroll to zoom · R to reset'
            : atClinic
              ? 'WASD to walk · F at a chair or the door · drag to look · R to reset'
              : shopping
                ? 'WASD to walk · F at a rail, the mirror or the door · drag to look · R to reset'
                : 'WASD to walk · F at a table or the door · drag to look · R to reset'}
        </div>
      )}

      {/*
        Every prompt below is the same shape on purpose: what you are standing
        at, and what F will do about it. There used to be two kinds — things
        that offered, and doors, which simply happened to you on contact and
        whose prompt therefore never painted at all.
      */}
      {nearbyTable !== null && activeTable === null && (
        <div className="hud__prompt">
          <strong>{TABLE_LABELS[nearbyTable]}</strong>
          <span>
            {/* You stand at craps and sit at blackjack, and the prompt should
                say which — offering a seat at a table that has none is the kind
                of small lie that makes the rest read as approximate. */}
            Press <kbd>{INTERACT_LABEL}</kbd> to{' '}
            {STANDING_TABLES.has(nearbyTable) ? 'take the rail' : 'sit'}
          </span>
        </div>
      )}

      {/* The same offer at a recliner. Without it the chairs look like scenery. */}
      {nearbyChair !== null && atChair === null && (
        <div className="hud__prompt">
          <strong>Donation chair</strong>
          <span>
            Press <kbd>{INTERACT_LABEL}</kbd> to sit
          </span>
        </div>
      )}

      {/*
        What is on the fixture in front of you, and what it costs.
        With the catalogue list gone this and the card on the fixture itself are
        the only two things that say either.
      */}
      {display !== null && !atMirror && (
        <div className="hud__prompt">
          <strong>{display.name}</strong>
          <span>
            {owned.includes(display.id) ? 'Yours' : `$${display.price.toLocaleString()}`} · Press{' '}
            <kbd>{INTERACT_LABEL}</kbd> to {wearing ? 'take it off' : 'try it on'}
          </span>
        </div>
      )}

      {/* The mirror is where the buying happens, so it has to be findable. */}
      {nearbyMirror && !atMirror && (
        <div className="hud__prompt">
          <strong>The fitting mirror</strong>
          <span>
            Press <kbd>{INTERACT_LABEL}</kbd> to see yourself
          </span>
        </div>
      )}

      {/* The way back out to the strip. The only way, so it has to be read. */}
      {nearbyExit && (
        <div className="hud__prompt">
          <strong>Out to the strip</strong>
          <span>
            Press <kbd>{INTERACT_LABEL}</kbd> to step out
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
            {nearby.available ? (
              <>
                Press <kbd>{INTERACT_LABEL}</kbd> to {nearby.invitation}
              </>
            ) : daylightAt(minuteOfDay) > 0.5 ? (
              'Closed today'
            ) : (
              'Closed tonight'
            )}
          </span>
        </div>
      )}
    </div>
  )
}
