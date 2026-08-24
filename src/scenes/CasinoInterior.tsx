import { PerspectiveCamera } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { DoubleSide, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { getCasino, type CasinoId } from '../world/casinos'
import { BlackjackTable } from './components/BlackjackTable'
import { CasinoCharacter, Outfit } from './components/CasinoCharacter'
import { CasinoFloor } from './components/CasinoFloor'
import { Stool } from './components/Stool'

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

/*
 * Offset well to the left of the player's stool. A camera sitting directly
 * behind them puts their back across the middle of the felt; swinging it wide
 * pushes the figure into the corner and leaves the betting area clear.
 */
const CAMERA_POSITION: readonly [number, number, number] = [-1.85, 3.95, 7.1]
const CAMERA_TARGET: readonly [number, number, number] = [0.15, 1.05, 0.45]

/**
 * Aims the fixed table camera.
 *
 * Uses `lookAt` rather than hand-authored Euler angles: the framing has to
 * clear the seated player's head while keeping their cards in shot, and
 * deriving that pitch by hand is how you end up an eighth of a radian out.
 */
function TableCamera() {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const defaultCamera = useThree((state) => state.camera)

  useEffect(() => {
    const camera = cameraRef.current ?? defaultCamera
    camera.position.set(...CAMERA_POSITION)
    camera.lookAt(new Vector3(...CAMERA_TARGET))
    camera.updateProjectionMatrix()
  }, [defaultCamera])

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={45} />
}

/**
 * The casino floor, framed over the seated player's shoulder.
 *
 * The player does not walk indoors, so the camera is fixed: it sits behind and
 * left of their stool, which puts their signalling right arm on the near side
 * rather than hidden behind their own body.
 */
export function CasinoInterior({ casinoId }: CasinoInteriorProps) {
  const casino = getCasino(casinoId)

  return (
    <>
      <color attach="background" args={['#0b0611']} />
      {/* Haze that swallows the far tables and keeps focus on the felt. */}
      <fog attach="fog" args={['#0b0611', 9, 26]} />

      <TableCamera />

      {/* Lifted well above a realistic level: at 0.32 the table's cast shadow
          went solid black and swallowed the whole foreground. */}
      <ambientLight intensity={0.5} color="#b9a7d8" />

      {/* Overhead lamp — the warm pool of light does most of the work. Hung
          high so the table's shadow stays close to its own footprint. */}
      <spotLight
        position={[0, 7.2, 0.5]}
        angle={0.68}
        penumbra={0.85}
        intensity={205}
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
        <mesh castShadow>
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
      <BlackjackTable />
    </>
  )
}
