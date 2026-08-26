import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { DevBridge } from './dev/DevBridge'
import { CasinoInterior } from './scenes/CasinoInterior'
import { TimeDriver } from './scenes/components/TimeDriver'
import { DesignerStage } from './scenes/DesignerStage'
import { ClinicInterior } from './scenes/ClinicInterior'
import { ShopInterior } from './scenes/ShopInterior'
import { Strip } from './scenes/Strip'
import { useAppearanceStore } from './store/useAppearanceStore'
import { TableId } from './scenes/casinoFloorLayout'
import { Location, useGameStore } from './store/useGameStore'
import { useTimeStore } from './store/useTimeStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { CharacterDesigner } from './ui/CharacterDesigner'
import { CrapsPanel } from './ui/CrapsPanel'
import { Hud } from './ui/Hud'
import { ClinicPanel } from './ui/ClinicPanel'
import { CheckoutPanel } from './ui/CheckoutPanel'
import { FittingPanel } from './ui/FittingPanel'
import { getVenue, VenueKind } from './world/venues'
import { KEYBOARD_MAP } from './world/controls'
import { bloomAt, CLINIC_BLOOM, INTERIOR_BLOOM } from './world/timeOfDay'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const hasDesigned = useAppearanceStore((state) => state.hasDesigned)
  const activeTable = useGameStore((state) => state.activeTable)
  const atChair = useGameStore((state) => state.atChair)
  const atMirror = useGameStore((state) => state.atMirror)
  const atCheckout = useGameStore((state) => state.atCheckout)

  /*
   * A player who has never designed a character gets the designer instead of
   * the street, without the store having to be seeded across two persisted
   * slices at boot — `location` is never persisted, so it always starts on the
   * strip and this derives the first run from the wardrobe save instead.
   */
  const isDesigning = location === Location.Designer || (!hasDesigned && location === Location.Strip)
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
      <Canvas shadows camera={{ position: [0, 5.2, 17.5], fov: 55 }}>
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
      {!isDesigning && <Hud />}
      {isDesigning && <CharacterDesigner />}

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
