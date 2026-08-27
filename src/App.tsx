import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { useMemo } from 'react'
import { appearanceOverrides } from './dev/appearanceLinks'
import { parseSheetKind } from './dev/contactSheet'
import { DevBridge } from './dev/DevBridge'
import { usePresenceRoom } from './net/usePresenceRoom'
import { PlayFov } from './scenes/components/PlayFov'
import { RemotePlayers } from './scenes/components/RemotePlayers'
import { ContactSheet } from './scenes/ContactSheet'
import { CasinoInterior } from './scenes/CasinoInterior'
import { TimeDriver } from './scenes/components/TimeDriver'
import { DesignerStage } from './scenes/DesignerStage'
import { ClinicInterior } from './scenes/ClinicInterior'
import { ShopInterior } from './scenes/ShopInterior'
import { Strip } from './scenes/Strip'
import { useAppearanceStore } from './store/useAppearanceStore'
import { useSessionStore } from './store/useSessionStore'
import { TableId } from './scenes/casinoFloorLayout'
import { Location, useGameStore } from './store/useGameStore'
import { useTimeStore } from './store/useTimeStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { CharacterDesigner } from './ui/CharacterDesigner'
import { CrapsPanel } from './ui/CrapsPanel'
import { Hud } from './ui/Hud'
import { TouchControls } from './ui/TouchControls'
import { WelcomeScreen } from './ui/WelcomeScreen'
import { ClinicPanel } from './ui/ClinicPanel'
import { CheckoutPanel } from './ui/CheckoutPanel'
import { FittingPanel } from './ui/FittingPanel'
import { getVenue, VenueKind } from './world/venues'
import { KEYBOARD_MAP } from './world/controls'
import { PLAY_FOV } from './world/camera'
import { useLayout } from './world/useLayout'
import { bloomAt, CLINIC_BLOOM, INTERIOR_BLOOM } from './world/timeOfDay'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const hasDesigned = useAppearanceStore((state) => state.hasDesigned)
  const hasWelcomed = useSessionStore((state) => state.hasWelcomed)
  const activeTable = useGameStore((state) => state.activeTable)

  /*
   * The shape of the screen, and what is pointing at it.
   *
   * Only the two things the DOM has to decide are read here — whether a panel
   * is a sheet, and whether to draw touch controls. Every *camera* sizes itself
   * against the canvas instead, via `useCanvasAspect`, because once a sheet is
   * up those are two different rectangles.
   */
  const layout = useLayout()

  // Joins whichever room the player is standing in, and leaves it on the way
  // out. A no-op when multiplayer is unconfigured.
  usePresenceRoom()
  const atChair = useGameStore((state) => state.atChair)
  const atMirror = useGameStore((state) => state.atMirror)
  const atCheckout = useGameStore((state) => state.atCheckout)

  /*
   * `?sheet=` replaces the whole app with a contact sheet.
   *
   * Development only, and it takes over rather than composing with `?boot=`,
   * because a sheet is not a place in the game — it is every hairstyle, or
   * every item, standing in a row so one capture can be looked at instead of
   * twelve. Read once: a query string does not change without a reload.
   */
  const sheet = useMemo(() => {
    if (!import.meta.env.DEV) return null
    return parseSheetKind(new URLSearchParams(window.location.search).get('sheet'))
  }, [])
  const sheetBase = useMemo(
    () => appearanceOverrides(new URLSearchParams(window.location.search)),
    [],
  )

  /*
   * The welcome screen comes before everything, including the designer, and
   * short-circuits it: while it is up the Canvas shows the strip behind the
   * panel rather than the dressing-room stage, so the first thing anyone sees
   * is the game rather than a menu in front of a menu.
   *
   * A sheet is the exception, because a sheet is not a session. Captures run
   * in a fresh browser profile where `hasWelcomed` is false — the same reason
   * `?boot=strip` exists — so without this every contact sheet this project
   * ever took would have been a picture of the welcome panel.
   */
  const isWelcoming = !hasWelcomed && sheet === null

  /*
   * A player who has never designed a character gets the designer instead of
   * the street, without the store having to be seeded across two persisted
   * slices at boot — `location` is never persisted, so it always starts on the
   * strip and this derives the first run from the wardrobe save instead.
   */
  const isDesigning =
    sheet === null &&
    !isWelcoming &&
    (location === Location.Designer || (!hasDesigned && location === Location.Strip))
  const isIndoors =
    sheet === null && !isDesigning && location === Location.Interior && activeVenue !== null
  const indoorVenue = isIndoors && activeVenue ? getVenue(activeVenue) : null
  const isShopping = indoorVenue?.kind === VenueKind.Shop
  const isAtClinic = indoorVenue?.kind === VenueKind.Clinic

  /*
   * Whether a full-width sheet is over the bottom of the screen.
   *
   * The designer, the shop's two stopping points, and the craps rail.
   *
   * The first three are side panels on a desktop, so becoming a sheet is barely
   * a change. Craps is here for a different reason and it is the one worth
   * writing down: its control bar carries a chip tray, four line bets and six
   * numbers, and on a phone that is most of the screen. Left as an overlay it
   * covered the felt almost entirely — including the pit the dice come to rest
   * in, which makes the one thing the player is waiting to see the one thing
   * they cannot. Blackjack's bar is four buttons and stays an overlay.
   *
   * The stylesheet decides whether a sheet is what these actually become; this
   * only says which panels are up, so the DOM and the CSS do not both have to
   * know what a phone is.
   */
  const hasSheet =
    isDesigning || (isShopping && (atMirror || atCheckout)) || activeTable === TableId.Craps

  /** Stopped somewhere: at a table, in a chair, on the plinth, at the till. */
  const seated = activeTable !== null || atChair !== null || atMirror || atCheckout

  /*
    The composer is global, so the hour has to be resolved here rather than
    inside the scene. Casinos are windowless by design and keep the night
    values; only the strip follows the clock.
  */
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)
  // The designer stage is lit like an interior — its own rig, no sky. The
  // clinic gets its own, because it is the only bright room in the game.
  const bloom = isAtClinic
    ? CLINIC_BLOOM
    : isIndoors || isDesigning || sheet !== null
      ? INTERIOR_BLOOM
      : bloomAt(minuteOfDay)

  return (
    // KeyboardControls sits outside the Canvas and provides context to the
    // player rig inside it — the pattern drei documents for R3F scenes.
    <KeyboardControls map={[...KEYBOARD_MAP]}>
      {/*
        The drawing surface, which a bottom sheet shortens rather than covers.

        On a phone the designer and the shop are sheets across the bottom of the
        screen, and the first portrait capture of the fitting room showed why
        this matters: the mirror was framed perfectly and the character was
        behind the panel. Overlaying a fixed-camera shot is a crop, and a crop
        no camera can see. Insetting the canvas instead means the scene is
        composed for the rectangle it actually gets — and it makes that
        rectangle a far saner shape, 390x464 rather than 390x844, which is most
        of why neither of those two cameras needed moving at all.
      */}
      <div className="stage" data-sheet={hasSheet}>
        <Canvas shadows camera={{ position: [0, 5.2, 17.5], fov: PLAY_FOV }}>
          {import.meta.env.DEV && <DevBridge />}
          {/* Matches the walking camera to the canvas it draws into. */}
          <PlayFov />
          <TimeDriver />
          {sheet !== null ? (
            <ContactSheet kind={sheet} base={sheetBase} />
          ) : isDesigning ? (
            <DesignerStage />
          ) : indoorVenue && activeVenue ? (
            isShopping ? (
              <ShopInterior venueId={activeVenue} />
            ) : isAtClinic ? (
              <ClinicInterior />
            ) : (
              <CasinoInterior venueId={activeVenue} />
            )
          ) : (
            <Strip />
          )}

          {/*
            Everyone else in the room, at the canvas root rather than inside a
            scene. Each scene has its own coordinate space and its own room id, so
            drawing peers here is correct for all of them — and it survives the
            local player sitting down, which unmounts `WalkingPlayer` but should
            certainly not empty the room.
          */}
          {!isDesigning && <RemotePlayers />}

          {/*
            Bloom is what turns emissive planes into neon. The materials are all
            drawn with toneMapped={false} so they exceed 1.0 and cross the
            luminance threshold, leaving unlit geometry untouched.

            The threshold has to climb with the sun. Under a daylight rig an
            ordinary lit facade already exceeds the night value, and the whole
            frame blooms out into fog.
          */}
          <EffectComposer>
            <Bloom
              intensity={bloom.intensity}
              luminanceThreshold={bloom.luminanceThreshold}
              luminanceSmoothing={0.25}
              mipmapBlur
            />
            <Vignette offset={0.28} darkness={bloom.vignetteDarkness} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* The designer is a menu, not a place — the world HUD has no business there. */}
      {!isDesigning && !isWelcoming && sheet === null && <Hud />}

      {/*
        The stick, on a device with no keyboard.

        Not while a menu is up, and not in the designer or at a table: there is
        nothing to walk in any of those, and a stick over a scene the player
        cannot move in is a control that lies. A contact sheet is not a session
        either — it is a row of characters standing still, on the same rule that
        keeps the HUD off it.
      */}
      {layout.touch && !isDesigning && !isWelcoming && sheet === null && !seated && (
        <TouchControls />
      )}
      {isDesigning && <CharacterDesigner />}
      {isWelcoming && <WelcomeScreen />}

      {/*
        The panel follows the table, not the venue: one casino now holds both
        games, and while the player is walking its floor there is no game to
        show controls for.
      */}
      {sheet === null && indoorVenue && activeVenue && (
        isShopping ? (
          // Only where the player has stopped: at the mirror to look, at the
          // counter to pay. Walking the floor is browsing, and the fixtures say
          // what they cost; there is nothing to put on screen until then.
          atCheckout ? (
            <CheckoutPanel venueId={activeVenue} />
          ) : atMirror ? (
            <FittingPanel venueId={activeVenue} />
          ) : null
        ) : isAtClinic ? (
          // Only once they are actually in a chair; walking the floor has no panel.
          atChair !== null ? <ClinicPanel /> : null
        ) : activeTable === TableId.Craps ? (
          <CrapsPanel venueId={activeVenue} />
        ) : activeTable === TableId.Blackjack ? (
          <BlackjackPanel venueId={activeVenue} />
        ) : null
      )}
    </KeyboardControls>
  )
}
