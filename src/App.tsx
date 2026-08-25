import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { DevBridge } from './dev/DevBridge'
import { CasinoInterior } from './scenes/CasinoInterior'
import { TimeDriver } from './scenes/components/TimeDriver'
import { DesignerStage } from './scenes/DesignerStage'
import { ShopInterior } from './scenes/ShopInterior'
import { Strip } from './scenes/Strip'
import { useAppearanceStore } from './store/useAppearanceStore'
import { Location, useGameStore } from './store/useGameStore'
import { useTimeStore } from './store/useTimeStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { CharacterDesigner } from './ui/CharacterDesigner'
import { CrapsPanel } from './ui/CrapsPanel'
import { Hud } from './ui/Hud'
import { ShopPanel } from './ui/ShopPanel'
import { GameKind, getVenue, VenueKind } from './world/venues'
import { KEYBOARD_MAP } from './world/controls'
import { bloomAt, INTERIOR_BLOOM } from './world/timeOfDay'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeVenue = useGameStore((state) => state.activeVenue)
  const hasDesigned = useAppearanceStore((state) => state.hasDesigned)

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

  /*
    The composer is global, so the hour has to be resolved here rather than
    inside the scene. Casinos are windowless by design and keep the night
    values; only the strip follows the clock.
  */
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)
  // The designer stage is lit like an interior — its own rig, no sky.
  const bloom = isIndoors || isDesigning ? INTERIOR_BLOOM : bloomAt(minuteOfDay)

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

      {indoorVenue && activeVenue && (
        isShopping ? (
          <ShopPanel venueId={activeVenue} />
        ) : indoorVenue.game === GameKind.Craps ? (
          <CrapsPanel venueId={activeVenue} />
        ) : (
          <BlackjackPanel venueId={activeVenue} />
        )
      )}
    </KeyboardControls>
  )
}
