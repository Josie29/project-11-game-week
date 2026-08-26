import { MeshReflectorMaterial } from '@react-three/drei'
import { useMemo } from 'react'
import { RepeatWrapping } from 'three'
import { useTimeStore } from '../../store/useTimeStore'
import {
  lightingAt,
  quantize,
  daylightAt,
  SKY_BUCKET_MINUTES,
  skyBucket,
} from '../../world/timeOfDay'
import { getRoadTexture } from '../roadTexture'
import {
  BLOCK_DEPTH,
  BUILDING_DEPTH,
  BUILDING_WIDTH,
  CROSS_HALF_WIDTH,
  CROSS_NORTH_Z,
  CROSS_PAVEMENT,
  CROSS_REACH,
  crossFarKerb,
  CROSS_SOUTH_Z,
  END_BLOCK_X,
  endBlockRows,
  FACADE_X,
  SIDEWALK_HEIGHT,
} from '../stripLayout'
import { Building } from './Building'

/**
 * The junction at each end of the strip, and the block standing across it.
 *
 * This exists because the world used to stop. The last tower was at z = -46, the
 * player could walk to -52, and the roadway and both pavements then ran on
 * another thirty-eight units before ending in mid-air against open sky — from
 * down there the strip read as a runway to nowhere, which is a hard thing to
 * un-see once you have walked to the end of it.
 *
 * The fix is not a longer road, it is a reason to stop. A cross street runs away
 * left and right into the haze, and a wall of towers stands on the far side
 * looking back. The invisible wall now lands on a kerb, and there is no sightline
 * out of the world for it to spoil.
 */

interface StreetEndProps {
  /** 1 for the north end, -1 for the south. */
  side: 1 | -1
  neonLevel: number
}

/** Heights of the closing wall, fixed so the skyline never reshuffles. */
const FRONT_HEIGHTS = [8, 11, 7, 10, 8] as const
const BACK_HEIGHTS = [13, 9, 15, 7, 12] as const

export function StreetEnd({ side, neonLevel }: StreetEndProps) {
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))
  const light = lightingAt(bucket * SKY_BUCKET_MINUTES)
  const daylight = quantize(daylightAt(bucket * SKY_BUCKET_MINUTES), 0.05)

  const crossZ = side > 0 ? CROSS_NORTH_Z : CROSS_SOUTH_Z
  const rows = endBlockRows(side)
  const frontZ = rows[0] ?? 0
  const backZ = rows[1] ?? 0

  /*
   * The cross street's own surface, turned a quarter so its markings run across
   * the strip rather than along it. Same texture, same block rhythm — a junction
   * where the paint changes style is a junction between two different games.
   */
  const surface = useMemo(() => {
    const texture = getRoadTexture().clone()
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set((CROSS_HALF_WIDTH * 2) / BLOCK_DEPTH, CROSS_REACH / BLOCK_DEPTH)
    texture.needsUpdate = true
    return texture
  }, [])

  return (
    <group>
      {/*
        Carriageway, running well past the towers either side so it is visibly a
        road going somewhere rather than a rectangle of tarmac. The fog is what
        actually ends it.
      */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[0, 0.002, crossZ]} receiveShadow>
        <planeGeometry args={[CROSS_HALF_WIDTH * 2, CROSS_REACH]} />
        <MeshReflectorMaterial
          map={surface}
          resolution={256}
          mixBlur={1}
          mixStrength={light.roadMixStrength}
          blur={[300, 90]}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.25}
          color={light.roadColor}
          roughness={light.roadRoughness}
          metalness={light.roadMetalness}
          mirror={light.roadMirror}
        />
      </mesh>

      {/* Pavement on the far side, standing the closing block on the ground. */}
      <mesh
        position={[0, SIDEWALK_HEIGHT / 2, crossFarKerb(side) + (side * CROSS_PAVEMENT) / 2]}
        receiveShadow
      >
        <boxGeometry args={[CROSS_REACH, SIDEWALK_HEIGHT, CROSS_PAVEMENT]} />
        <meshStandardMaterial color={light.sidewalkColor} roughness={0.85} />
      </mesh>

      {/*
        Two rows of towers across the end.

        Five wide rather than the strip's two, because these have to close the
        view rather than line it — a gap between them is a hole straight out of
        the world, which is the thing being fixed. The back row is there so the
        skyline has somewhere to recede into instead of stopping at one flat
        wall.

        No signage on any of them. They are scenery you can never reach, and a
        marquee on an unreachable building is a promise the strip cannot keep.
      */}
      {END_BLOCK_X.map((x, index) => (
        <group key={x}>
          <Building
            position={[x, 0, frontZ]}
            width={BUILDING_WIDTH}
            height={FRONT_HEIGHTS[index] ?? 12}
            depth={BUILDING_DEPTH}
            neonColor="#5b6b8e"
            facing={side > 0 ? -1 : 1}
            neonLevel={neonLevel * 0.35}
            daylight={daylight}
            relief={false}
          />
          <Building
            position={[x + BUILDING_WIDTH / 2, 0, backZ]}
            width={BUILDING_WIDTH}
            height={BACK_HEIGHTS[index] ?? 16}
            depth={BUILDING_DEPTH}
            neonColor="#5b6b8e"
            facing={side > 0 ? -1 : 1}
            neonLevel={neonLevel * 0.25}
            daylight={daylight}
            relief={false}
          />
        </group>
      ))}

      {/*
        Kerb line at the near side, so the pavement visibly stops rather than
        merging into the road. This is the edge the player is held at.
      */}
      <mesh
        position={[0, SIDEWALK_HEIGHT, crossZ - side * CROSS_HALF_WIDTH]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[FACADE_X * 2, 0.3]} />
        <meshStandardMaterial color={light.sidewalkColor} roughness={0.7} />
      </mesh>
    </group>
  )
}
