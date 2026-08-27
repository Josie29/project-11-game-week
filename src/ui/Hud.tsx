import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { findItem } from '../character/catalog'
import { approvalTotal, isFitting, onApproval } from '../character/fitting'
import { STANDING_TABLES, TABLE_LABELS } from '../scenes/casinoFloorLayout'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useSessionStore } from '../store/useSessionStore'
import { Location, useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { SettingsPanel } from './SettingsPanel'
import { INTERACT_LABEL, SETTINGS_KEY, SETTINGS_LABEL } from '../world/controls'
import { fireInteract } from '../world/interact'
import { useLayout } from '../world/useLayout'
import { getVenue, VenueKind } from '../world/venues'
import { daylightAt, formatClock } from '../world/timeOfDay'

/**
 * How the player says yes: the key, or the tap.
 *
 * "Press F" on a phone is an instruction nobody can follow, and it appeared in
 * all eight prompts. The verb after it stays where it was — "Tap to sit",
 * "Tap again to leave it behind" — so each prompt still says what accepting
 * actually does.
 */
function Accept() {
  const { touch } = useLayout()

  if (touch) return <>Tap</>

  return (
    <>
      Press <kbd>{INTERACT_LABEL}</kbd>
    </>
  )
}

/**
 * The standing hint, in the parts that vary and the parts that do not.
 *
 * The middle of it — "at a chair or the door" — is the *room*, and it is the
 * same sentence whichever way the player is holding the thing. That is not
 * tidiness: it is the only part of this line that carries information rather
 * than instruction, it is what tells somebody walking into the clinic that
 * there are chairs in it, and it is what `walkthrough.mjs` asserts on to know
 * which room it is standing in. A touch build that dropped it would be a build
 * where nothing checks the player ever arrived.
 *
 * @param targets What is worth walking up to in this room.
 * @param touch Whether there is a keyboard.
 */
function walkHint(targets: string, touch: boolean): string {
  return touch
    ? `Stick to walk \u00b7 tap ${targets} \u00b7 drag to look \u00b7 pinch to zoom`
    : `WASD to walk \u00b7 ${INTERACT_LABEL} ${targets} \u00b7 drag to look \u00b7 R to reset`
}

/**
 * One offer, and what accepting it will do.
 *
 * A `div` with a mouse and a `button` with a thumb, because on a phone this
 * *is* the accept key: `F` does not exist there, and the game only ever offers
 * one thing at a time, which is exactly what makes the prompt itself the
 * honest button. It already names the thing and the verb.
 *
 * `.hud` is `pointer-events: none` so the canvas underneath keeps the drags;
 * the tappable variant opts itself back in.
 */
function Prompt({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties | undefined
}) {
  const { touch } = useLayout()

  if (!touch) {
    return (
      <div className="hud__prompt" style={style}>
        {children}
      </div>
    )
  }

  return (
    <button type="button" className="hud__prompt hud__prompt--tap" style={style} onClick={fireInteract}>
      {children}
    </button>
  )
}

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
  const nearbyDesk = useGameStore((state) => state.nearbyDesk)
  const atCheckout = useGameStore((state) => state.atCheckout)
  const heldAtDoor = useGameStore((state) => state.heldAtDoor)
  const equipped = useAppearanceStore((state) => state.equipped)
  const owned = useAppearanceStore((state) => state.owned)
  const fitting = useAppearanceStore((state) => state.fitting)
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)
  const { touch } = useLayout()
  const settingsOpen = useSessionStore((state) => state.settingsOpen)
  const toggleSettings = useSessionStore((state) => state.toggleSettings)

  /*
   * The settings key, owned here rather than inside the panel.
   *
   * The panel is unmounted while closed, so a listener living in it could only
   * ever close the thing that was already open. The HUD is up for the whole of
   * play, which makes it the only place that can hear the key that opens it.
   *
   * `event.repeat` is guarded on the same rule as `useActionKey`: a held key
   * would otherwise open and close the panel several times a second.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return
      if (event.key.toLowerCase() === SETTINGS_KEY) toggleSettings()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSettings])

  const nearby = nearbyVenue ? getVenue(nearbyVenue) : null
  const venue = activeVenue !== null ? getVenue(activeVenue) : null
  const atClinic = venue?.kind === VenueKind.Clinic
  const shopping = venue?.kind === VenueKind.Shop
  const seated = activeTable !== null || atChair !== null || atMirror || atCheckout
  const owing = approvalTotal(fitting)

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
            on approval {onApproval(fitting).length} · ${owing.toLocaleString()}
          </span>
        )}
        {/*
          The way into the one menu.

          A button rather than only a key, because a key nobody is told about is
          a key nobody presses — and the label carries the shortcut, so finding
          it once is enough. It lives under the money because that is the corner
          the player already reads.
        */}
        <button type="button" className="hud__menu" onClick={toggleSettings}>
          Menu <kbd>{SETTINGS_LABEL}</kbd>
        </button>
      </div>

      {/* Deliberately still shown indoors, where a real casino would have none. */}
      <time className="hud__clock">{formatClock(minuteOfDay)}</time>

      {location === Location.Strip && (
        <div className="hud__hint">{walkHint('at a door', touch)}</div>
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
            ? touch
              ? 'Drag to look · pinch to zoom'
              : 'Drag to look · scroll to zoom · R to reset'
            : atClinic
              ? walkHint('at a chair or the door', touch)
              : shopping
                ? walkHint('at a rail, the mirror, the till or the door', touch)
                : walkHint('at a table or the door', touch)}
        </div>
      )}

      {/*
        Every prompt below is the same shape on purpose: what you are standing
        at, and what F will do about it. There used to be two kinds — things
        that offered, and doors, which simply happened to you on contact and
        whose prompt therefore never painted at all.
      */}
      {nearbyTable !== null && activeTable === null && (
        <Prompt>
          <strong>{TABLE_LABELS[nearbyTable]}</strong>
          <span>
            {/* You stand at craps and sit at blackjack, and the prompt should
                say which — offering a seat at a table that has none is the kind
                of small lie that makes the rest read as approximate.

                Which stool it is, though, is not worth naming. Calling the ends
                first base and third base and the middle three "this seat" reads
                as three of them being unnamed rather than as a row of five, and
                the terms mean nothing to a player who has not played before.
                The prompt follows the stool you are standing at; it does not
                have to say its name for that to be true. */}
            <Accept /> to{' '}
            {STANDING_TABLES.has(nearbyTable) ? 'take the rail' : 'sit at this seat'}
          </span>
        </Prompt>
      )}

      {/* The same offer at a recliner. Without it the chairs look like scenery. */}
      {nearbyChair !== null && atChair === null && (
        <Prompt>
          <strong>Donation chair</strong>
          <span>
            <Accept /> to sit
          </span>
        </Prompt>
      )}

      {/*
        What is on the fixture in front of you, and what it costs.
        With the catalogue list gone this and the card on the fixture itself are
        the only two things that say either.
      */}
      {display !== null && !atMirror && !atCheckout && (
        <Prompt>
          <strong>{display.name}</strong>
          <span>
            {owned.includes(display.id) ? 'Yours' : `$${display.price.toLocaleString()}`} ·{' '}
            <Accept /> to {wearing ? 'take it off' : 'try it on'}
          </span>
        </Prompt>
      )}

      {/* The mirror: where you look at what you have on, not where you pay. */}
      {nearbyMirror && !atMirror && (
        <Prompt>
          <strong>The fitting mirror</strong>
          <span>
            <Accept /> to see yourself
          </span>
        </Prompt>
      )}

      {/*
        The till, which is where the buying happens, so it has to be findable —
        and it carries the total, because "pay" is a different offer depending
        on whether you are standing there in $1,420 of unpaid clothes or none.
      */}
      {nearbyDesk && !atCheckout && (
        <Prompt>
          <strong>Checkout</strong>
          <span>
            {isFitting(fitting) ? `$${owing.toLocaleString()} to pay · ` : 'Nothing to pay for · '}
            <Accept /> to step up
          </span>
        </Prompt>
      )}

      {/*
        The way back out to the strip. The only way, so it has to be read.

        In the shop it doubles as the clerk calling you back: the first press
        while wearing something unpaid for changes this prompt instead of
        leaving, and says what walking out would cost you.
      */}
      {nearbyExit && (
        <Prompt>
          <strong>{heldAtDoor ? 'The clerk clears her throat' : 'Out to the strip'}</strong>
          <span>
            {heldAtDoor ? (
              <>
                ${owing.toLocaleString()} of that is not yours · <Accept />{' '}
                again to leave it behind
              </>
            ) : (
              <>
                <Accept /> to step out
              </>
            )}
          </span>
        </Prompt>
      )}

      {nearby && (
        <Prompt style={{ borderColor: nearby.neonColor }}>
          <strong style={{ color: nearby.neonColor }}>{nearby.name}</strong>
          {/*
            "Closed tonight" was written when the strip was permanently dark.
            It survived unchanged into a noon sky, which is the sort of line a
            player reads once and stops trusting the rest of the screen over.
          */}
          <span>
            {nearby.available ? (
              <>
                {/*
                  "enter", not the verb for what is inside.

                  Each venue used to carry its own — "shop", "play", "donate" —
                  and the line promised something F does not do: F opens the
                  door, and buying, betting or donating all take a second action
                  once you are through it. The name above says what the place
                  is, which is the part that has to vary; the action line says
                  what the key does, which does not.
                */}
                <Accept /> to enter
              </>
            ) : daylightAt(minuteOfDay) > 0.5 ? (
              'Closed today'
            ) : (
              'Closed tonight'
            )}
          </span>
        </Prompt>
      )}

      {/* Last, so it layers over every prompt above rather than under them. */}
      {settingsOpen && <SettingsPanel />}
    </div>
  )
}
