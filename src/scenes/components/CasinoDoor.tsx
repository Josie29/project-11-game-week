import type { CasinoConfig } from '../../world/casinos'
import { dimHex } from '../../world/timeOfDay'

interface CasinoDoorProps {
  casino: CasinoConfig
  /** How brightly the entrance burns, 0 to 1. Washes out in daylight. */
  neonLevel?: number
}

/**
 * Floor on the spill light, as a fraction of its night intensity.
 *
 * The doorway is the thing the player is looking for, so it keeps reading as a
 * light source even at noon — dimming it all the way out would leave the only
 * interactive object on the street indistinguishable from the facade.
 */
const SPILL_DAYLIGHT_FLOOR = 0.22

/**
 * The lit entrance the player walks into.
 *
 * Purely decorative — the actual entry is a proximity check in `Player`, so the
 * door never needs collision or interaction handlers.
 */
export function CasinoDoor({ casino, neonLevel = 1 }: CasinoDoorProps) {
  const [x, y, z] = casino.doorPosition
  // Doors on the left of the street face +X; those on the right face -X.
  const facing = x < 0 ? 1 : -1
  const color = dimHex(casino.available ? casino.neonColor : '#4a5070', neonLevel)

  const nightIntensity = casino.available ? 22 : 6
  const spill = nightIntensity * (SPILL_DAYLIGHT_FLOOR + (1 - SPILL_DAYLIGHT_FLOOR) * neonLevel)

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
        intensity={spill}
        distance={12}
        decay={2}
      />
    </group>
  )
}
