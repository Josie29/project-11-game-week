import { PerspectiveCamera } from '@react-three/drei'
import { getCasino, type CasinoId } from '../world/casinos'

interface CasinoInteriorProps {
  casinoId: CasinoId
}

/**
 * Grey-box casino floor.
 *
 * The player does not walk indoors, so the camera is fixed on the table and no
 * player rig is mounted. Tuesday replaces the placeholder table with the real
 * 3D blackjack layout; the fixed framing is already the shot that will use.
 */
export function CasinoInterior({ casinoId }: CasinoInteriorProps) {
  const casino = getCasino(casinoId)

  return (
    <>
      <color attach="background" args={['#0a0713']} />
      <fog attach="fog" args={['#0a0713', 10, 34]} />

      <PerspectiveCamera makeDefault position={[0, 3.4, 5.2]} fov={50} rotation={[-0.42, 0, 0]} />

      <ambientLight intensity={0.3} />
      {/* Overhead lamp — the classic pool of light over a casino table. */}
      <spotLight
        position={[0, 6, 1]}
        angle={0.7}
        penumbra={0.6}
        intensity={140}
        distance={22}
        color="#ffe9c4"
        castShadow
      />
      <pointLight position={[0, 2.4, 4]} color={casino.neonColor} intensity={18} distance={14} />

      {/* Floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#1a0f26" roughness={0.9} />
      </mesh>

      {/* Back wall with a neon band, so the room has depth behind the table. */}
      <mesh position={[0, 4, -9]} receiveShadow>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#150d1f" roughness={0.95} />
      </mesh>
      <mesh position={[0, 2.6, -8.9]}>
        <planeGeometry args={[18, 0.16]} />
        <meshBasicMaterial color={casino.neonColor} toneMapped={false} />
      </mesh>

      {/* Placeholder felt table. */}
      <group position={[0, 0, -0.5]}>
        <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.6, 2.6, 0.16, 48]} />
          <meshStandardMaterial color="#0f5136" roughness={0.85} />
        </mesh>
        {/* Rail around the felt. */}
        <mesh position={[0, 1.02, 0]}>
          <torusGeometry args={[2.6, 0.1, 12, 64]} />
          <meshStandardMaterial color="#3a2418" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.8, 1.1, 0.85, 24]} />
          <meshStandardMaterial color="#241528" roughness={0.8} />
        </mesh>
      </group>
    </>
  )
}
