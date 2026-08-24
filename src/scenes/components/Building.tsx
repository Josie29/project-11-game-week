interface BuildingProps {
  position: readonly [number, number, number]
  width: number
  height: number
  depth: number
  neonColor: string
  /** Which way the lit facade faces: -1 for buildings on the +X side, 1 for -X. */
  facing: 1 | -1
}

/**
 * Fractions of the building depth at which vertical neon strips sit.
 *
 * Several narrow strips read as signage; one wide panel just reads as a
 * coloured wall, which is what the first pass looked like.
 */
const STRIP_DEPTH_OFFSETS = [-0.3, -0.1, 0.12, 0.32] as const

const STRIP_WIDTH = 0.2

/**
 * A grey-box tower with neon signage down the facade.
 *
 * Deliberately primitives-only for the Monday slice — narrow emissive strips
 * plus scene fog carry most of the night-strip mood at zero asset cost.
 */
export function Building({ position, width, height, depth, neonColor, facing }: BuildingProps) {
  const [x, y, z] = position
  // Nudge the neon just clear of the wall so it does not z-fight with the facade.
  const neonX = x + facing * (width / 2 + 0.06)
  const facadeRotation: [number, number, number] = [0, facing * Math.PI * 0.5, 0]

  return (
    <group>
      <mesh position={[x, y + height / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#232845" roughness={0.8} metalness={0.15} />
      </mesh>

      {STRIP_DEPTH_OFFSETS.map((offset, index) => {
        // Alternate the strip lengths so the facade is not a uniform comb.
        const stripHeight = height * (index % 2 === 0 ? 0.66 : 0.44)
        return (
          <mesh
            key={offset}
            position={[neonX, y + 2 + stripHeight / 2, z + depth * offset]}
            rotation={facadeRotation}
          >
            <planeGeometry args={[STRIP_WIDTH, stripHeight]} />
            <meshBasicMaterial color={neonColor} toneMapped={false} />
          </mesh>
        )
      })}

      {/* Marquee band at street level, the brightest thing at eye height. */}
      <mesh position={[neonX, y + 1.5, z]} rotation={facadeRotation}>
        <planeGeometry args={[depth * 0.8, 0.22]} />
        <meshBasicMaterial color={neonColor} toneMapped={false} />
      </mesh>

      {/* Crown band so the skyline has a lit edge against the night sky. */}
      <mesh position={[neonX, y + height - 0.5, z]} rotation={facadeRotation}>
        <planeGeometry args={[depth * 0.7, 0.16]} />
        <meshBasicMaterial color={neonColor} toneMapped={false} />
      </mesh>

      {/*
        No per-building light here on purpose: sixteen point lights would force
        a forward-rendering pass the frame budget cannot afford. Bloom
        post-processing is the cheap way to make these strips actually glow.
      */}
    </group>
  )
}
