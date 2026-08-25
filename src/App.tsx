import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { DevBridge } from './dev/DevBridge'
import { CasinoInterior } from './scenes/CasinoInterior'
import { TimeDriver } from './scenes/components/TimeDriver'
import { Strip } from './scenes/Strip'
import { Location, useGameStore } from './store/useGameStore'
import { useTimeStore } from './store/useTimeStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { CrapsPanel } from './ui/CrapsPanel'
import { Hud } from './ui/Hud'
import { GameKind, getCasino } from './world/casinos'
import { KEYBOARD_MAP } from './world/controls'
import { bloomAt, INTERIOR_BLOOM } from './world/timeOfDay'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeCasino = useGameStore((state) => state.activeCasino)

  const isIndoors = location === Location.Interior && activeCasino !== null

  /*
    The composer is global, so the hour has to be resolved here rather than
    inside the scene. Casinos are windowless by design and keep the night
    values; only the strip follows the clock.
  */
  const minuteOfDay = useTimeStore((state) => state.minuteOfDay)
  const bloom = isIndoors ? INTERIOR_BLOOM : bloomAt(minuteOfDay)

  return (
    // KeyboardControls sits outside the Canvas and provides context to the
    // player rig inside it — the pattern drei documents for R3F scenes.
    <KeyboardControls map={[...KEYBOARD_MAP]}>
      <Canvas shadows camera={{ position: [0, 5.2, 17.5], fov: 55 }}>
        {import.meta.env.DEV && <DevBridge />}
        <TimeDriver />
        {isIndoors && activeCasino ? <CasinoInterior casinoId={activeCasino} /> : <Strip />}

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

      <Hud />
      {isIndoors && activeCasino && (
        getCasino(activeCasino).game === GameKind.Craps ? (
          <CrapsPanel casinoId={activeCasino} />
        ) : (
          <BlackjackPanel casinoId={activeCasino} />
        )
      )}
    </KeyboardControls>
  )
}
