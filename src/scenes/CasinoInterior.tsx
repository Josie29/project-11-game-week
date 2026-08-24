import { PerspectiveCamera } from '@react-three/drei'
import { getCasino, type CasinoId } from '../world/casinos'
import { BlackjackTable } from './components/BlackjackTable'
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

      <PerspectiveCamera makeDefault position={[0, 4.15, 6.1]} fov={46} rotation={[-0.5, 0, 0]} />

      <ambientLight intensity={0.32} color="#b9a7d8" />

      {/* Overhead lamp — the warm pool of light does most of the work. */}
      <spotLight
        position={[0, 5.4, 0.5]}
        angle={0.82}
        penumbra={0.75}
        intensity={210}
        distance={17}
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

      <CasinoFloor />
      <BlackjackTable />
    </>
  )
}
