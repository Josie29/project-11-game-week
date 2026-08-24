import type { CasinoConfig } from '../../world/casinos'

interface CasinoDoorProps {
  casino: CasinoConfig
}

/**
 * The lit entrance the player walks into.
 *
 * Purely decorative — the actual entry is a proximity check in `Player`, so the
 * door never needs collision or interaction handlers.
 */
export function CasinoDoor({ casino }: CasinoDoorProps) {
  const [x, y, z] = casino.doorPosition
  // Doors on the left of the street face +X; those on the right face -X.
  const facing = x < 0 ? 1 : -1
  const color = casino.available ? casino.neonColor : '#4a5070'

  return (
    <group position={[x, y, z]}>
      {/* Recessed doorway. */}
      <mesh position={[0, 1.6, 0]} rotation={[0, facing * Math.PI * 0.5, 0]}>
        <planeGeometry args={[3, 3.2]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Marquee band above the entrance. */}
      <mesh position={[0, 3.6, 0]} rotation={[0, facing * Math.PI * 0.5, 0]}>
        <planeGeometry args={[4.4, 0.55]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>

      {/* Spill light so the doorway reads as a light source on the pavement. */}
      <pointLight
        position={[facing * 1.5, 2.4, 0]}
        color={color}
        intensity={casino.available ? 22 : 6}
        distance={12}
        decay={2}
      />
    </group>
  )
}
