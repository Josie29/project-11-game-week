import { PerspectiveCamera } from '@react-three/drei'
import { getCasino, type CasinoId } from '../world/casinos'
import { BlackjackTable } from './components/BlackjackTable'

interface CasinoInteriorProps {
  casinoId: CasinoId
}

/**
 * The casino floor, framed on the table.
 *
 * The player does not walk indoors, so the camera is fixed and no player rig is
 * mounted. The framing is chosen to sit roughly where a seated player's eyeline
 * would be, with the dealer's cards at the top of frame.
 */
export function CasinoInterior({ casinoId }: CasinoInteriorProps) {
  const casino = getCasino(casinoId)

  return (
    <>
      <color attach="background" args={['#0a0713']} />
      <fog attach="fog" args={['#0a0713', 12, 30]} />

      <PerspectiveCamera makeDefault position={[0, 4.6, 7]} fov={45} rotation={[-0.48, 0, 0]} />

      <ambientLight intensity={0.35} />
      {/* Overhead lamp — the pool of light over the table does most of the work. */}
      <spotLight
        position={[0, 5.5, 0.4]}
        angle={0.75}
        penumbra={0.7}
        intensity={190}
        distance={20}
        color="#ffeccd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        // Without a bias the near-flat felt self-shadows into a hard band.
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
      {/* House-colour rim light from behind, separating the table from the room. */}
      <pointLight position={[0, 2.6, -4.2]} color={casino.neonColor} intensity={26} distance={14} />

      {/* Floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[34, 34]} />
        <meshStandardMaterial color="#1a0f26" roughness={0.9} />
      </mesh>

      {/* Back wall with a neon band, so the room has depth behind the dealer. */}
      <mesh position={[0, 4, -9]} receiveShadow>
        <planeGeometry args={[34, 8]} />
        <meshStandardMaterial color="#150d1f" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.6, -8.9]}>
        <planeGeometry args={[20, 0.16]} />
        <meshBasicMaterial color={casino.neonColor} toneMapped={false} />
      </mesh>

      <BlackjackTable />
    </>
  )
}
