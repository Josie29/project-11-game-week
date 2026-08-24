/**
 * Sidewalk dressing: palms and street lamps.
 *
 * Both are silhouette pieces. They read against the neon rather than being lit
 * themselves, so they stay cheap — no lights, no textures.
 */

const FROND_COUNT = 8

interface PalmTreeProps {
  position: readonly [number, number, number]
  height: number
  /** Rotates the crown so a row of palms does not look cloned. */
  spin: number
}

/** A palm in silhouette: tapered trunk with a crown of drooping fronds. */
export function PalmTree({ position, height, spin }: PalmTreeProps) {
  const [x, y, z] = position

  return (
    <group position={[x, y, z]} rotation={[0, spin, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.24, height, 8]} />
        <meshStandardMaterial color="#141024" roughness={0.9} />
      </mesh>

      <group position={[0, height, 0]}>
        {Array.from({ length: FROND_COUNT }, (_, index) => {
          const angle = (index / FROND_COUNT) * Math.PI * 2
          // Alternate the droop so the crown is not perfectly symmetrical.
          const droop = index % 2 === 0 ? 1.15 : 0.92
          return (
            // Rotate the group, then push the frond out along its own axis.
            // Rotating the mesh directly pivots about its centre, which buried
            // half of every frond inside the trunk.
            <group key={index} rotation={[droop, angle, 0]}>
              {/* Flattened along its thin axis so the cone reads as a broad
                  frond blade rather than a spike. */}
              <mesh position={[0, 1.5, 0]} scale={[1.7, 1, 0.22]} castShadow>
                <coneGeometry args={[0.3, 3, 5]} />
                <meshStandardMaterial color="#1d3a33" roughness={0.95} />
              </mesh>
            </group>
          )
        })}
      </group>
    </group>
  )
}

interface StreetLampProps {
  position: readonly [number, number, number]
}

/** A lamp post with a warm emissive head; bloom does the glow. */
export function StreetLamp({ position }: StreetLampProps) {
  const [x, y, z] = position

  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 4.4, 8]} />
        <meshStandardMaterial color="#191428" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshBasicMaterial color="#ffe6b0" toneMapped={false} />
      </mesh>
      <mesh position={[0, 4.75, 0]}>
        <coneGeometry args={[0.34, 0.28, 10]} />
        <meshStandardMaterial color="#191428" roughness={0.8} />
      </mesh>
    </group>
  )
}
