import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { DevBridge } from './dev/DevBridge'
import { usePresenceRoom } from './net/usePresenceRoom'
import { RemotePlayers } from './scenes/components/RemotePlayers'
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
import { WelcomeScreen } from './ui/WelcomeScreen'
import { ClinicPanel } from './ui/ClinicPanel'
import { CheckoutPanel } from './ui/CheckoutPanel'
import { FittingPanel } from './ui/FittingPanel'
import { getVenue, VenueKind } from './world/venues'
import { KEYBOARD_MAP } from './world/controls'
import { PLAY_FOV } from './world/camera'
import { bloomAt, CLINIC_BLOOM, INTERIOR_BLOOM } from './world/timeOfDay'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const hasDesigned = useAppearanceStore((state) => state.hasDesigned)
  const hasWelcomed = useSessionStore((state) => state.hasWelcomed)
  const activeTable = useGameStore((state) => state.activeTable)

  // Joins whichever room the player is standing in, and leaves it on the way
  // out. A no-op when multiplayer is unconfigured.
  usePresenceRoom()
  const atChair = useGameStore((state) => state.atChair)
  const atMirror = useGameStore((state) => state.atMirror)
  const atCheckout = useGameStore((state) => state.atCheckout)

  /*
   * The welcome screen comes before everything, including the designer, and
   * short-circuits it: while it is up the Canvas shows the strip behind the
   * panel rather than the dressing-room stage, so the first thing anyone sees
   * is the game rather than a menu in front of a menu.
   */
  const isWelcoming = !hasWelcomed

  /*
   * A player who has never designed a character gets the designer instead of
   * the street, without the store having to be seeded across two persisted
   * slices at boot — `location` is never persisted, so it always starts on the
   * strip and this derives the first run from the wardrobe save instead.
   */
  const isDesigning =
    !isWelcoming && (location === Location.Designer || (!hasDesigned && location === Location.Strip))
  const isIndoors = !isDesigning && location === Location.Interior && activeVenue !== null
  const indoorVenue = isIndoors && activeVenue ? getVenue(activeVenue) : null
  const isShopping = indoorVenue?.kind === VenueKind.Shop
  const isAtClinic = indoorVenue?.kind === VenueKind.Clinic

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
    : isIndoors || isDesigning
      ? INTERIOR_BLOOM
      : bloomAt(minuteOfDay)

  return (
    // KeyboardControls sits outside the Canvas and provides context to the
    // player rig inside it — the pattern drei documents for R3F scenes.
    <KeyboardControls map={[...KEYBOARD_MAP]}>
      <Canvas shadows camera={{ position: [0, 5.2, 17.5], fov: PLAY_FOV }}>
        {import.meta.env.DEV && <DevBridge />}
        <TimeDriver />
        {isDesigning ? (
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

      {/* The designer is a menu, not a place — the world HUD has no business there. */}
      {!isDesigning && !isWelcoming && <Hud />}
      {isDesigning && <CharacterDesigner />}
      {isWelcoming && <WelcomeScreen />}

      {/*
        The panel follows the table, not the venue: one casino now holds both
        games, and while the player is walking its floor there is no game to
        show controls for.
      */}
      {indoorVenue && activeVenue && (
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
