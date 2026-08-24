import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { DevBridge } from './dev/DevBridge'
import { CasinoInterior } from './scenes/CasinoInterior'
import { Strip } from './scenes/Strip'
import { Location, useGameStore } from './store/useGameStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { CrapsPanel } from './ui/CrapsPanel'
import { Hud } from './ui/Hud'
import { GameKind, getCasino } from './world/casinos'
import { KEYBOARD_MAP } from './world/controls'

export function App() {
  const location = useGameStore((state) => state.location)
  const activeCasino = useGameStore((state) => state.activeCasino)

  const isIndoors = location === Location.Interior && activeCasino !== null

  return (
    // KeyboardControls sits outside the Canvas and provides context to the
    // player rig inside it — the pattern drei documents for R3F scenes.
    <KeyboardControls map={[...KEYBOARD_MAP]}>
      <Canvas shadows camera={{ position: [0, 5.2, 17.5], fov: 55 }}>
        {import.meta.env.DEV && <DevBridge />}
        {isIndoors && activeCasino ? <CasinoInterior casinoId={activeCasino} /> : <Strip />}

        {/*
          Bloom is what turns emissive planes into neon. The materials are all
          drawn with toneMapped={false} so they exceed 1.0 and cross the
          luminance threshold, leaving unlit geometry untouched.
        */}
        <EffectComposer>
          <Bloom intensity={1.0} luminanceThreshold={0.8} luminanceSmoothing={0.25} mipmapBlur />
          <Vignette offset={0.28} darkness={0.62} />
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
