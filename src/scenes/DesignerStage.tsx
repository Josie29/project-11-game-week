import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useTimeStore } from '../store/useTimeStore'
import { CasinoCharacter } from './components/CasinoCharacter'

/*
 * The dressing-room stage.
 *
 * Framed to match `art/refs/character_sheet.png`: a flat dark backdrop, even
 * key light from the front, and hot pink and cyan rim lights behind the figure.
 * That combination is what makes a low-poly silhouette readable, and it is the
 * same trick the strip plays with its signage.
 *
 * There is no world here on purpose — no street, no casino, nothing to walk
 * into. The designer is a menu that happens to be rendered in 3D.
 */

/** Seconds for one full turn. Slow enough to read the back of an outfit. */
const TURN_PERIOD = 14

const PLINTH_HEIGHT = 0.12

export function DesignerStage() {
  const appearance = useAppearanceStore((state) => state.appearance)
  const equipped = useAppearanceStore((state) => state.equipped)

  const turntable = useRef<Group>(null)

  useFrame((_state, delta) => {
    if (!turntable.current) return

    /*
     * `?freeze` holds the turntable as well as the clock. Without this every
     * capture of this scene lands on whatever angle the settle delay happened
     * to reach, so two runs disagree and the regression check is worthless —
     * the same reason the clock is freezable.
     */
    if (useTimeStore.getState().paused) {
      turntable.current.rotation.y = 0
      return
    }

    turntable.current.rotation.y += (delta * Math.PI * 2) / TURN_PERIOD
  })

  return (
    <>
      <color attach="background" args={['#0a0714']} />
      <fog attach="fog" args={['#0a0714', 5.5, 12]} />

      {/*
        Pulled back far enough to fit a 1.8-tall figure with air above and
        below, and aimed straight down -Z so the character faces the viewer.
        The figure is offset right rather than the camera left: the control
        panel occupies the left of the screen, and a centred figure sits behind
        it.
      */}
      <PerspectiveCamera makeDefault position={[0, 1.02, 4.3]} fov={40} />

      {/* Key light, front and slightly high, so the face is not in shadow. */}
      {/*
        Brighter than the strip's rig on purpose. The palette runs to charcoal
        and midnight, and under street lighting those garments read as one black
        slab — which makes half the colour swatches look identical in the one
        place the player is choosing between them.
      */}
      <ambientLight intensity={0.7} color="#8a93c8" />
      <directionalLight position={[1.4, 3.2, 3]} intensity={2.2} castShadow />

      {/* The two rim lights that separate the figure from the backdrop. */}
      <pointLight position={[-1.9, 1.6, -1.5]} intensity={9} distance={7} color="#ff2d95" />
      <pointLight position={[1.9, 1.6, -1.5]} intensity={9} distance={7} color="#22e0ff" />

      <group position={[0.48, 0, 0]}>
        <group ref={turntable} position={[0, PLINTH_HEIGHT, 0]}>
          <CasinoCharacter appearance={appearance} equipped={equipped} />
        </group>

        {/* Plinth. Gives the figure somewhere to stand and catches the rim light. */}
        <mesh position={[0, PLINTH_HEIGHT / 2, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.62, 0.68, PLINTH_HEIGHT, 32]} />
          <meshStandardMaterial color="#1b1730" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, PLINTH_HEIGHT + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.58, 0.62, 48]} />
          <meshBasicMaterial color="#ff2d95" toneMapped={false} />
        </mesh>
      </group>

      {/* Floor, dark and slightly reflective, as the reference sheet has it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#120d1f" roughness={0.42} metalness={0.35} />
      </mesh>

      {/* Backdrop, far enough back that the fog does most of the work. */}
      <mesh position={[0, 3, -4.2]}>
        <planeGeometry args={[24, 12]} />
        <meshStandardMaterial color="#151030" roughness={0.95} />
      </mesh>
    </>
  )
}
