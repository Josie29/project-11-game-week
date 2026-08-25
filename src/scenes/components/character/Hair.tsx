import { HairStyle } from '../../../character/appearance'
import type { BodyProportions } from '../../../character/proportions'

/*
 * The eight styles on `art/refs/hair_sheet.png`, built as primitives.
 *
 * Every position here is expressed as a fraction of the head's own dimensions,
 * not as a constant, because the three silhouettes have different heads. A
 * fringe authored against one head is buried in the brow of a smaller one —
 * which is the whole reason `proportions.ts` exists.
 *
 * Rendered in the torso group's local frame, origin at the hip.
 */

interface HairProps {
  style: HairStyle
  color: string
  body: BodyProportions
}

export function Hair({ style, color, body }: HairProps) {
  const { torsoHeight, neckHeight, headWidth: hw, headHeight: hh, headDepth: hd } = body

  const headCenterY = torsoHeight + neckHeight + hh / 2
  const crownY = torsoHeight + neckHeight + hh

  const material = <meshStandardMaterial color={color} roughness={0.9} />

  /** The skull cap every style is built on top of. */
  const cap = (height: number, lift = 0) => (
    <mesh position={[0, crownY - hh * 0.16 + lift, -hd * 0.04]} castShadow>
      <boxGeometry args={[hw * 1.08, height, hd * 1.08]} />
      {material}
    </mesh>
  )

  /** Hair falling over the brow. */
  const fringe = (height: number) => (
    <mesh position={[0, crownY - hh * 0.14, hd * 0.45]}>
      <boxGeometry args={[hw * 1.06, height, hd * 0.22]} />
      {material}
    </mesh>
  )

  /** A panel down each side of the head; `drop` is how far below the ear it reaches. */
  const sides = (thickness: number, height: number, drop: number) =>
    [-1, 1].map((side) => (
      <mesh key={side} position={[side * hw * 0.51, headCenterY - drop, -hd * 0.05]}>
        <boxGeometry args={[thickness, height, hd * 0.95]} />
        {material}
      </mesh>
    ))

  switch (style) {
    case HairStyle.Buzz:
      // Barely more than a shadow on the scalp; no fringe, no sides.
      return <>{cap(hh * 0.3)}</>

    case HairStyle.Crop:
      return (
        <>
          {cap(hh * 0.36)}
          {fringe(hh * 0.23)}
          {sides(hw * 0.09, hh * 0.58, hh * 0.08)}
        </>
      )

    case HairStyle.Pompadour:
      return (
        <>
          {cap(hh * 0.36)}
          {/* The volume that makes the style: a slab swept up and forward. */}
          <mesh position={[0, crownY + hh * 0.14, hd * 0.16]} rotation={[-0.22, 0, 0]} castShadow>
            <boxGeometry args={[hw * 0.92, hh * 0.34, hd * 0.62]} />
            {material}
          </mesh>
          {sides(hw * 0.1, hh * 0.72, hh * 0.02)}
        </>
      )

    case HairStyle.Bob:
      return (
        <>
          {cap(hh * 0.4)}
          {fringe(hh * 0.3)}
          {/* Squared off at the jaw, which is what separates a bob from long. */}
          {sides(hw * 0.16, hh * 1.05, hh * 0.3)}
        </>
      )

    case HairStyle.Long:
      return (
        <>
          {cap(hh * 0.4)}
          {fringe(hh * 0.26)}
          {sides(hw * 0.17, hh * 1.7, hh * 0.62)}
          {/* The fall down the back, which is what reads from the strip camera. */}
          <mesh position={[0, headCenterY - hh * 0.95, -hd * 0.52]} castShadow>
            <boxGeometry args={[hw * 0.98, hh * 2.1, hd * 0.2]} />
            {material}
          </mesh>
        </>
      )

    case HairStyle.Ponytail:
      return (
        <>
          {cap(hh * 0.34)}
          {sides(hw * 0.08, hh * 0.5, hh * 0.02)}
          {/* Gathered at the back of the crown, then hanging behind. */}
          <mesh position={[0, crownY - hh * 0.1, -hd * 0.56]}>
            <sphereGeometry args={[hw * 0.2, 8, 6]} />
            {material}
          </mesh>
          <mesh position={[0, headCenterY - hh * 0.45, -hd * 0.7]} rotation={[0.3, 0, 0]} castShadow>
            <capsuleGeometry args={[hw * 0.14, hh * 0.85, 4, 8]} />
            {material}
          </mesh>
        </>
      )

    case HairStyle.Updo:
      return (
        <>
          {cap(hh * 0.34)}
          {sides(hw * 0.07, hh * 0.42, 0)}
          {/* Pinned high and back — the bun is the whole silhouette. */}
          <mesh position={[0, crownY + hh * 0.12, -hd * 0.3]} castShadow>
            <sphereGeometry args={[hw * 0.34, 10, 8]} />
            {material}
          </mesh>
        </>
      )

    case HairStyle.Coils:
      return (
        <>
          {cap(hh * 0.42)}
          {/*
            A ring of coils around the crown. Built from a loop rather than
            listed out so the count can be tuned in one place; eight is the
            fewest that still reads as a texture instead of as lumps.
          */}
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index / 8) * Math.PI * 2
            return (
              <mesh
                key={index}
                position={[
                  Math.sin(angle) * hw * 0.5,
                  crownY - hh * 0.02,
                  Math.cos(angle) * hd * 0.5 - hd * 0.04,
                ]}
                castShadow
              >
                <sphereGeometry args={[hw * 0.17, 6, 6]} />
                {material}
              </mesh>
            )
          })}
          <mesh position={[0, crownY + hh * 0.04, -hd * 0.04]}>
            <sphereGeometry args={[hw * 0.42, 8, 6]} />
            {material}
          </mesh>
        </>
      )
  }
}
