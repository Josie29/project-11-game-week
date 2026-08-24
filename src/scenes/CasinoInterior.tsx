import { PerspectiveCamera } from '@react-three/drei'
import { DoubleSide } from 'three'
import { getCasino, type CasinoId } from '../world/casinos'
import { BlackjackTable } from './components/BlackjackTable'
import { CasinoCharacter, Outfit } from './components/CasinoCharacter'
import { CasinoFloor } from './components/CasinoFloor'

interface CasinoInteriorProps {
  casinoId: CasinoId
}

/**
 * The casino floor, framed on the table.
 *
 * The player does not walk indoors, so the camera is fixed and no player rig is
 * mounted. The framing sits roughly where a standing player's eyeline would be,
 * with the dealer's kit across the top of frame.
 */
export function CasinoInterior({ casinoId }: CasinoInteriorProps) {
  const casino = getCasino(casinoId)

  return (
    <>
      <color attach="background" args={['#0b0611']} />
      {/* Haze that swallows the far tables and keeps focus on the felt. */}
      <fog attach="fog" args={['#0b0611', 9, 26]} />

      {/*
        Seated over the player's shoulder. The distance is set by geometry
        rather than taste: any closer and the player's head rises above the
        table's near edge and covers their own cards.
      */}
      <PerspectiveCamera makeDefault position={[0, 4.2, 7.2]} fov={45} rotation={[-0.45, 0, 0]} />

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

      {/* The dealer, standing behind the table facing the player. */}
      <group position={[0, 0, -1.35]}>
        <CasinoCharacter outfit={Outfit.Dealer} dealerPose />
      </group>

      {/*
        The player, back to camera. Placed to the RIGHT deliberately: turned to
        face the dealer, their signalling right arm swings toward world -X, so
        standing them on the left would push that arm off the edge of frame.
      */}
      <group position={[1.7, 0, 3]} rotation={[0, Math.PI, 0]}>
        <CasinoCharacter outfit={Outfit.Player} signalsGestures />
      </group>

      <CasinoFloor />
      <BlackjackTable />
    </>
  )
}
