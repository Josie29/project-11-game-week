import { useMemo } from 'react'
import { DoubleSide, RepeatWrapping } from 'three'
import { getFacadeTexture } from '../facadeTexture'
import { getBladeTexture, getMarqueeTexture } from '../signTexture'

interface BuildingProps {
  position: readonly [number, number, number]
  width: number
  height: number
  depth: number
  neonColor: string
  /** Which way the lit facade faces: 1 for buildings on -X, -1 for those on +X. */
  facing: 1 | -1
  /** When set, the tower carries a named marquee and a projecting blade sign. */
  signName?: string | undefined
}

/** Heights, as a fraction of the tower, at which neon bands wrap the facade. */
const BAND_HEIGHTS = [0.28, 0.52, 0.78] as const

/** Fractions of the depth at which vertical neon tubes run up the facade. */
const PILASTER_OFFSETS = [-0.36, -0.12, 0.12, 0.36] as const

/**
 * A hotel tower on the strip.
 *
 * Windows and neon banding come from shared canvas textures, so a building is
 * still just a box plus a few planes — cheap enough to line the whole street
 * with while carrying the signage the strip is recognised by.
 */
export function Building({
  position,
  width,
  height,
  depth,
  neonColor,
  facing,
  signName,
}: BuildingProps) {
  const [x, y, z] = position
  // Nudge lit geometry clear of the wall so it never z-fights with the facade.
  const litX = x + facing * (width / 2 + 0.06)
  const facadeRotation: [number, number, number] = [0, facing * Math.PI * 0.5, 0]

  const facade = useMemo(() => {
    const texture = getFacadeTexture().clone()
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    // One texture tile per ~7 world units keeps window size consistent across
    // towers of different heights.
    texture.repeat.set(Math.max(1, Math.round(depth / 7)), Math.max(1, Math.round(height / 7)))
    texture.needsUpdate = true
    return texture
  }, [depth, height])

  return (
    <group>
      <mesh position={[x, y + height / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial map={facade} roughness={0.8} metalness={0.1} />
      </mesh>

      {BAND_HEIGHTS.map((fraction) => (
        <mesh
          key={fraction}
          position={[litX, y + height * fraction, z]}
          rotation={facadeRotation}
        >
          <planeGeometry args={[depth * 0.92, 0.16]} />
          <meshBasicMaterial color={neonColor} toneMapped={false} />
        </mesh>
      ))}

      {/* Vertical pilaster tubes running the height of the tower — the strongest
          single motif in the reference, and what gives the towers their scale. */}
      {PILASTER_OFFSETS.map((offset) => (
        <mesh
          key={offset}
          position={[litX, y + height * 0.55 + 1.2, z + depth * offset]}
          rotation={facadeRotation}
        >
          <planeGeometry args={[0.13, height * 0.8]} />
          <meshBasicMaterial color={neonColor} toneMapped={false} />
        </mesh>
      ))}

      {/* Crown band so the skyline has a lit edge against the night sky. */}
      <mesh position={[litX, y + height - 0.4, z]} rotation={facadeRotation}>
        <planeGeometry args={[depth * 0.8, 0.22]} />
        <meshBasicMaterial color={neonColor} toneMapped={false} />
      </mesh>

      {signName && (
        <>
          {/* Marquee across the facade above the entrance. Sized generously and
              hung low, since it is the thing a player reads to find the door. */}
          <mesh position={[litX, y + 4.4, z]} rotation={facadeRotation}>
            <planeGeometry args={[depth * 0.98, depth * 0.245]} />
            <meshBasicMaterial map={getMarqueeTexture(signName, neonColor)} toneMapped={false} />
          </mesh>

          {/*
            Blade sign projecting out over the sidewalk. It faces down the
            street rather than across it, so it is readable while walking —
            which is the whole point of a blade sign.
          */}
          <mesh position={[x + facing * (width / 2 + 1.5), y + 9.5, z]}>
            <planeGeometry args={[1.9, 7.6]} />
            <meshBasicMaterial
              map={getBladeTexture(signName, neonColor)}
              toneMapped={false}
              side={DoubleSide}
            />
          </mesh>
          {/* Bracket tying the blade back to the tower. */}
          <mesh position={[x + facing * (width / 2 + 0.75), y + 9.5, z]}>
            <boxGeometry args={[1.5, 0.16, 0.16]} />
            <meshStandardMaterial color="#241f38" roughness={0.7} />
          </mesh>
        </>
      )}
    </group>
  )
}
