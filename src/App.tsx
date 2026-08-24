import { KeyboardControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { DevBridge } from './dev/DevBridge'
import { CasinoInterior } from './scenes/CasinoInterior'
import { Strip } from './scenes/Strip'
import { Location, useGameStore } from './store/useGameStore'
import { BlackjackPanel } from './ui/BlackjackPanel'
import { Hud } from './ui/Hud'
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
      </Canvas>

      <Hud />
      {isIndoors && activeCasino && <BlackjackPanel casinoId={activeCasino} />}
    </KeyboardControls>
  )
}
