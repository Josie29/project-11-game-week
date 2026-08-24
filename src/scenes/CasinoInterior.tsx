import { PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { GameKind, getCasino, type CasinoId } from '../world/casinos'
import { BlackjackTable } from './components/BlackjackTable'
import { CasinoCharacter, Outfit } from './components/CasinoCharacter'
import { CasinoFloor } from './components/CasinoFloor'
import { CrapsTable } from './components/CrapsTable'
import { Stool } from './components/Stool'
import { useOrbitInput } from './useOrbitInput'

interface CasinoInteriorProps {
  casinoId: CasinoId
}

/**
 * Stools around the player's arc of the table.
 *
 * Positioned to sit just outside the rail, roughly behind each betting spot
 * printed on the felt, so the seats line up with the places you can bet.
 */
const STOOLS: readonly { x: number; z: number }[] = [
  { x: -2.6, z: 2.5 },
  { x: -1.35, z: 2.85 },
  { x: 0, z: 2.95 },
  { x: 1.35, z: 2.85 },
  { x: 2.6, z: 2.5 },
]

/** The seat the player occupies — the centre spot, where their cards land. */
const PLAYER_SEAT = STOOLS[2] ?? { x: 0, z: 2.95 }

/** Point the camera orbits and looks at — roughly the middle of the felt. */
const BLACKJACK_TARGET = new Vector3(0.15, 1.05, 0.45)
/** The craps table is smaller and centred, and its printed layout is the game. */
const CRAPS_TARGET = new Vector3(0, 1.05, 0)

/*
 * Opening view, as an orbit rather than a position. Both closer and steeper
 * than the original fixed shot: at the old distance and eyeline a card was
 * about sixty pixels wide and seen near edge-on, which is legible in principle
 * and a squint in practice. The cards should be readable before anyone touches
 * the controls.
 */
const DEFAULT_YAW = -0.2925
const DEFAULT_PITCH = 0.52
const DEFAULT_DISTANCE = 5.8
const CRAPS_DISTANCE = 4.5
const CRAPS_PITCH = 0.68

/*
 * Limits. The near limit is set by the seated player, not by taste: closer than
 * this and the camera ends up inside their head, because they sit a good way
 * back from the felt. The pitch floor keeps the view above the rail, and the
 * yaw range lets you swing right around the player's side of the table without
 * ending up behind the dealer looking into the void.
 */
const MIN_DISTANCE = 4.3
const MAX_DISTANCE = 9.5
/*
 * Pitch floor is about readability, not taste. The cards lie flat on the felt,
 * so at a low enough eyeline they go edge-on and vanish — the first version
 * allowed almost table level and made them impossible to read. The ceiling is
 * generous because looking straight down is the best card-reading angle there
 * is.
 */
const MIN_PITCH = 0.3
const MAX_PITCH = 1.25
const YAW_RANGE = 1.4

/** Higher is snappier; keeps the camera from snapping between frames. */
const ORBIT_DAMPING = 12

/**
 * Orbit camera over the table: drag to look, scroll to zoom, R to reset.
 *
 * Input handling is shared with the strip camera via `useOrbitInput`; only the
 * limits and what it looks at differ.
 */
function TableCamera({ game }: { game: GameKind }) {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const defaultCamera = useThree((state) => state.camera)

  const isCraps = game === GameKind.Craps
  const target = isCraps ? CRAPS_TARGET : BLACKJACK_TARGET

  const { orbit } = useOrbitInput(
    {
      yaw: isCraps ? 0 : DEFAULT_YAW,
      pitch: isCraps ? CRAPS_PITCH : DEFAULT_PITCH,
      distance: isCraps ? CRAPS_DISTANCE : DEFAULT_DISTANCE,
    },
    {
      minPitch: MIN_PITCH,
      maxPitch: MAX_PITCH,
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      yawRange: YAW_RANGE,
    },
  )

  useFrame((_state, delta) => {
    const camera = cameraRef.current ?? defaultCamera
    const { yaw, pitch, distance } = orbit.current

    const horizontal = Math.cos(pitch) * distance
    const settle = 1 - Math.exp(-ORBIT_DAMPING * delta)

    camera.position.lerp(
      DESIRED.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(yaw) * horizontal,
      ),
      settle,
    )
    camera.lookAt(target)
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={45} />
}

/** Scratch vector, reused so the orbit loop allocates nothing. */
const DESIRED = new Vector3()

/**
 * The casino floor, framed over the seated player's shoulder.
 *
 * The opening view sits behind and left of their stool, which puts the
 * signalling right arm on the near side rather than hidden behind their own
 * body. From there the player can orbit and zoom freely — see `TableCamera`.
 */
export function CasinoInterior({ casinoId }: CasinoInteriorProps) {
  const casino = getCasino(casinoId)

  return (
    <>
      <color attach="background" args={['#0b0611']} />
      {/* Haze that swallows the far tables and keeps focus on the felt. */}
      <fog attach="fog" args={['#0b0611', 9, 26]} />

      <TableCamera game={casino.game} />

      {/* Lifted well above a realistic level: at 0.32 the table's cast shadow
          went solid black and swallowed the whole foreground. */}
      <ambientLight intensity={0.5} color="#b9a7d8" />

      {/* Overhead lamp — the warm pool of light does most of the work. Hung
          high so the table's shadow stays close to its own footprint. */}
      <spotLight
        position={[0, 7.2, 0.5]}
        angle={0.68}
        penumbra={0.85}
        intensity={155}
        distance={20}
        color="#ffe4b5"
        castShadow
        shadow-mapSize={[2048, 2048]}
        // Without a bias the near-flat felt self-shadows into a hard band.
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />

      {/* House-colour rim from behind the dealer, separating table from room. */}
      <pointLight position={[0, 3, -3.6]} color={casino.neonColor} intensity={30} distance={11} />
      {/* Cool fill from the player's side so the near rail is not solid black. */}
      <pointLight position={[0, 2.4, 5]} color="#6f7ae0" intensity={14} distance={12} />

      {/* Patterned carpet. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color="#2a1030" roughness={0.95} />
      </mesh>

      {/* Back wall with a neon band, so the room has depth behind the dealer. */}
      <mesh position={[0, 4.5, -17]} receiveShadow>
        <planeGeometry args={[48, 9]} />
        <meshStandardMaterial color="#170e21" roughness={0.95} />
      </mesh>
      <mesh position={[0, 3.1, -16.9]}>
        <planeGeometry args={[26, 0.18]} />
        <meshBasicMaterial color={casino.neonColor} toneMapped={false} />
      </mesh>

      {/* Brass pendant over the table, per art/refs/blackjack_floor.png. It
          gives the overhead spotlight a visible source. */}
      <group position={[0, 3.9, 0.2]}>
        <mesh position={[0, 0.8, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 1.6, 6]} />
          <meshStandardMaterial color="#3a2f1c" roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh>
          <coneGeometry args={[0.46, 0.34, 20, 1, true]} />
          <meshStandardMaterial color="#8a6a2f" roughness={0.35} metalness={0.75} side={DoubleSide} />
        </mesh>
        {/* Emissive disc across the shade's mouth, so the lamp reads as lit. */}
        <mesh position={[0, -0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.43, 20]} />
          <meshBasicMaterial color="#d9b273" toneMapped={false} />
        </mesh>
      </group>

      {STOOLS.map((stool) => (
        <Stool
          key={`${stool.x}-${stool.z}`}
          position={[stool.x, 0, stool.z]}
          // Turn each seat to face the middle of the table.
          rotationY={Math.atan2(-stool.x, -stool.z)}
        />
      ))}

      {/* The dealer, standing behind the table facing the player. */}
      <group position={[0, 0, -1.35]}>
        <CasinoCharacter outfit={Outfit.Dealer} dealerPose gestureSource="dealer" />
      </group>

      {/* The player, seated at the centre spot with their back to the camera. */}
      <group position={[PLAYER_SEAT.x, 0, PLAYER_SEAT.z]} rotation={[0, Math.PI, 0]}>
        <CasinoCharacter outfit={Outfit.Player} seated gestureSource="player" />
      </group>

      <CasinoFloor />
      {casino.game === GameKind.Craps ? <CrapsTable /> : <BlackjackTable />}
    </>
  )
}
