import { PALM_RADIUS } from '../casinoFloorLayout'

/*
 * A potted palm, for the corners of the water court.
 *
 * Procedural primitives like everything else that stands in a room here. The
 * fronds are flattened cones on a fan of rotations rather than modelled leaves:
 * what a palm contributes at this distance is a ragged silhouette against a lit
 * wall, and a ragged silhouette is cheap.
 *
 * Its footprint is `PALM_RADIUS`, and the layout test puts every position
 * through `clearsFloor` — a plant standing in a betting spot is the same bug as
 * a pillar standing in a doorway.
 */

interface PottedPalmProps {
  position: readonly [number, number]
  /**
   * Turns the fan, so four palms drawn from the same eight fronds do not read
   * as one plant copied four times.
   */
  rotation?: number
}

/*
 * Two tiers rather than one ring.
 *
 * Nine fronds on a single ring read as a spiky star — a green asterisk on a
 * stick. What makes a palm a palm is an upper crown standing up and an outer
 * crown drooping past it, so there are two rings at different heights, lengths
 * and droops.
 */
const TIERS: readonly { count: number; tilt: number; length: number; y: number }[] = [
  { count: 7, tilt: 0.55, length: 1.15, y: 0.34 },
  { count: 9, tilt: 1.15, length: 1.7, y: 0 },
]

const TRUNK_HEIGHT = 1.45
const POT_HEIGHT = 0.6

export function PottedPalm({ position, rotation = 0 }: PottedPalmProps) {
  const [x, z] = position

  return (
    <group position={[x, 0, z]} rotation={[0, rotation, 0]}>
      {/* Pot. */}
      <mesh position={[0, POT_HEIGHT / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[PALM_RADIUS * 0.82, PALM_RADIUS * 0.62, POT_HEIGHT, 14]} />
        <meshStandardMaterial color="#6b4a22" roughness={0.5} metalness={0.55} />
      </mesh>
      {/* Rim, catching the water light. */}
      <mesh position={[0, POT_HEIGHT - 0.03, 0]}>
        <cylinderGeometry args={[PALM_RADIUS * 0.88, PALM_RADIUS * 0.88, 0.09, 14]} />
        <meshStandardMaterial color="#9c7c36" roughness={0.3} metalness={0.9} />
      </mesh>
      {/* Soil, so the pot is not open onto its own inside. */}
      <mesh position={[0, POT_HEIGHT - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[PALM_RADIUS * 0.8, 14]} />
        <meshStandardMaterial color="#1d1408" roughness={1} />
      </mesh>

      <mesh position={[0, POT_HEIGHT + TRUNK_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, TRUNK_HEIGHT, 8]} />
        <meshStandardMaterial color="#4a3a22" roughness={0.9} />
      </mesh>

      {TIERS.flatMap((tier, tierIndex) =>
        Array.from({ length: tier.count }, (_, index) => {
          // Offset each tier by half a step, so the upper crown shows through
          // the gaps in the lower one instead of hiding behind it.
          const angle = ((index + tierIndex * 0.5) / tier.count) * Math.PI * 2
          // Alternating droop and length within a tier, so no two neighbouring
          // fronds are the same shape.
          const tilt = tier.tilt + (index % 2 === 0 ? 0.14 : -0.1)
          const length = tier.length * (index % 3 === 0 ? 1.14 : 0.94)

          return (
            <group
              key={`${tierIndex}:${angle}`}
              position={[0, POT_HEIGHT + TRUNK_HEIGHT + tier.y, 0]}
              rotation={[0, angle, tilt]}
            >
              <mesh position={[0, length / 2, 0]} scale={[1, 1, 0.12]} castShadow>
                <coneGeometry args={[0.26, length, 5]} />
                <meshStandardMaterial
                  color={index % 2 === 0 ? '#1c4a28' : '#2d6a3a'}
                  roughness={0.85}
                />
              </mesh>
            </group>
          )
        }),
      )}
    </group>
  )
}
