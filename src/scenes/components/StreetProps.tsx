/**
 * Sidewalk dressing: palms and street lamps.
 *
 * Both are silhouette pieces. They read against the neon rather than being lit
 * themselves, so they stay cheap — no lights, no textures.
 */

import { dimHex, lerpHex } from '../../world/timeOfDay'

const FROND_COUNT = 8

/** The lamp head at full night brightness. */
const BULB_LIT = '#ffe6b0'

/** Trunk and frond at night, when both read as pure silhouette. */
const TRUNK_NIGHT = '#141024'
const FROND_NIGHT = '#1d3a33'

/** By day the same pieces catch the sun rather than blocking it. */
const TRUNK_DAY = '#6b5a4a'
const FROND_DAY = '#3f7a5c'

/** Lamp post, likewise. */
const POST_NIGHT = '#191428'
const POST_DAY = '#5a5566'

interface PalmTreeProps {
  position: readonly [number, number, number]
  height: number
  /** 0 through the night, 1 at midday. */
  daylight?: number
  /** Rotates the crown so a row of palms does not look cloned. */
  spin: number
}

/** A palm in silhouette: tapered trunk with a crown of drooping fronds. */
export function PalmTree({ position, height, spin, daylight = 0 }: PalmTreeProps) {
  const [x, y, z] = position
  const trunk = lerpHex(TRUNK_NIGHT, TRUNK_DAY, daylight)
  const frond = lerpHex(FROND_NIGHT, FROND_DAY, daylight)

  return (
    <group position={[x, y, z]} rotation={[0, spin, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.24, height, 8]} />
        <meshStandardMaterial color={trunk} roughness={0.9} />
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
                <meshStandardMaterial color={frond} roughness={0.95} />
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
  /** How brightly the head burns, 0 to 1. Dims to nothing in daylight. */
  neonLevel?: number
  /** 0 through the night, 1 at midday. */
  daylight?: number
}

/** A lamp post with a warm emissive head; bloom does the glow. */
export function StreetLamp({ position, neonLevel = 1, daylight = 0 }: StreetLampProps) {
  const [x, y, z] = position
  const post = lerpHex(POST_NIGHT, POST_DAY, daylight)
  /*
    Unlike the marquees, a street lamp genuinely does switch off at sunrise, so
    this is squared to drop away faster than the signage and reaches the bare
    unlit globe by midday rather than staying stubbornly warm.
  */
  const bulb = dimHex(BULB_LIT, neonLevel * neonLevel)

  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 4.4, 8]} />
        <meshStandardMaterial color={post} roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <sphereGeometry args={[0.24, 12, 12]} />
        <meshBasicMaterial color={bulb} toneMapped={false} />
      </mesh>
      <mesh position={[0, 4.75, 0]}>
        <coneGeometry args={[0.34, 0.28, 10]} />
        <meshStandardMaterial color={post} roughness={0.8} />
      </mesh>
    </group>
  )
}
