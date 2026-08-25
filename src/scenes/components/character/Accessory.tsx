import { DoubleSide } from 'three'
import { ItemShape, type ShopItem } from '../../../character/catalog'
import type { BodyProportions } from '../../../character/proportions'

/*
 * Everything The Gilded Hanger sells, built as primitives and drawn at the
 * component's own origin.
 *
 * Placement is deliberately *not* here — the caller positions each item at
 * `anchorFor(item.slot, silhouette)`, or parents it to a moving joint group.
 * Keeping geometry and placement apart is what lets `characterAnchors.test.ts`
 * assert the positions without a renderer.
 */

interface AccessoryProps {
  item: ShopItem
  /** Needed by the items sized against the body: jackets and gowns. */
  body: BodyProportions
  /**
   * Shortens anything floor-length.
   *
   * Set while the figure is on a stool. A full-length gown skirt hangs through
   * the seat and the thighs when the hips drop and the legs fold forward, which
   * is only visible from the table camera — never from the strip.
   */
  compact?: boolean | undefined
}

export function Accessory({ item, body, compact = false }: AccessoryProps) {
  const { primary, secondary, accent } = item.colors

  // Jewellery reads as metal; cloth does not. Both are set per-shape below.
  const metal = <meshStandardMaterial color={primary} roughness={0.24} metalness={0.85} />

  /** Floor length standing; above the knee once the hips drop onto a stool. */
  const skirtLength = compact ? 0.34 : 0.95

  switch (item.shape) {
    case ItemShape.Fedora:
      return (
        <group>
          <mesh castShadow>
            <cylinderGeometry args={[body.headWidth * 0.95, body.headWidth * 0.95, 0.018, 16]} />
            <meshStandardMaterial color={primary} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.062, 0]} castShadow>
            <cylinderGeometry args={[body.headWidth * 0.44, body.headWidth * 0.48, 0.115, 12]} />
            <meshStandardMaterial color={primary} roughness={0.85} />
          </mesh>
          {/* The band, which is what stops the crown reading as a paper cup. */}
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[body.headWidth * 0.49, body.headWidth * 0.49, 0.028, 12]} />
            <meshStandardMaterial color={secondary} roughness={0.7} />
          </mesh>
        </group>
      )

    case ItemShape.Shades:
      return (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.048, 0, 0.004]}>
              <boxGeometry args={[0.062, 0.036, 0.014]} />
              <meshStandardMaterial
                color={primary}
                roughness={0.12}
                metalness={0.35}
                // Lenses are the one part that should look wet under neon.
                envMapIntensity={1.4}
              />
            </mesh>
          ))}
          <mesh position={[0, 0.004, 0.002]}>
            <boxGeometry args={[0.038, 0.011, 0.012]} />
            <meshStandardMaterial color={secondary} roughness={0.3} metalness={0.8} />
          </mesh>
        </group>
      )

    case ItemShape.Chain:
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.075, 0.011, 6, 20]} />
          {metal}
        </mesh>
      )

    case ItemShape.Pendant:
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.082, 0.008, 6, 20]} />
            {metal}
          </mesh>
          {/* The stone hangs below the chain, at the bottom of its loop. */}
          <mesh position={[0, -0.082, 0.012]} castShadow>
            <octahedronGeometry args={[0.028]} />
            <meshStandardMaterial
              color={accent}
              roughness={0.05}
              metalness={0.2}
              emissive={accent}
              emissiveIntensity={0.35}
            />
          </mesh>
        </group>
      )

    case ItemShape.Jacket:
      return (
        <group>
          {/* A shell a little larger than the torso, so it reads as worn over. */}
          <mesh castShadow>
            <boxGeometry
              args={[body.torsoWidth + 0.035, body.torsoHeight * 0.94, body.torsoDepth + 0.03]}
            />
            <meshStandardMaterial color={primary} roughness={0.55} metalness={0.25} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[
                side * body.torsoWidth * 0.27,
                body.torsoHeight * 0.2,
                body.torsoDepth / 2 + 0.022,
              ]}
              rotation={[0, 0, side * 0.28]}
            >
              <boxGeometry args={[0.1, 0.26, 0.014]} />
              <meshStandardMaterial color={secondary} roughness={0.5} />
            </mesh>
          ))}
          {/* Open front, showing the shirt beneath as a dark gap. */}
          <mesh position={[0, body.torsoHeight * 0.08, body.torsoDepth / 2 + 0.02]}>
            <boxGeometry args={[0.12, body.torsoHeight * 0.6, 0.012]} />
            <meshStandardMaterial color={secondary} roughness={0.6} />
          </mesh>
        </group>
      )

    case ItemShape.Gown:
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[body.torsoWidth + 0.02, body.torsoHeight * 0.9, body.torsoDepth + 0.02]} />
            <meshStandardMaterial color={primary} roughness={0.3} metalness={0.15} />
          </mesh>
          {/*
            Floor length, flaring toward the hem. The cone's top radius matches
            the hip so the skirt does not read as a separate object balanced on
            the waist.
          */}
          <mesh position={[0, -body.torsoHeight / 2 - skirtLength / 2, 0]} castShadow>
            <cylinderGeometry
              args={[body.torsoWidth * 0.42, body.torsoWidth * 0.62, skirtLength, 14, 1, true]}
            />
            <meshStandardMaterial
              color={primary}
              roughness={0.3}
              metalness={0.15}
              side={DoubleSide}
            />
          </mesh>
          <mesh position={[0, body.torsoHeight * 0.18, body.torsoDepth / 2 + 0.014]}>
            <boxGeometry args={[body.torsoWidth * 0.6, 0.03, 0.01]} />
            <meshStandardMaterial color={accent} roughness={0.25} metalness={0.3} />
          </mesh>
        </group>
      )

    case ItemShape.Watch:
      return (
        <group>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.036, 0.036, 0.022, 12]} />
            {metal}
          </mesh>
          <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.022, 0.022, 0.008, 12]} />
            <meshStandardMaterial color={accent} roughness={0.15} metalness={0.4} />
          </mesh>
        </group>
      )

    case ItemShape.Ring:
      return (
        <group>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.014, 0.005, 6, 12]} />
            {metal}
          </mesh>
          <mesh position={[0, 0, 0.014]}>
            <octahedronGeometry args={[0.013]} />
            <meshStandardMaterial
              color={accent}
              roughness={0.05}
              emissive={accent}
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>
      )

    case ItemShape.Oxford:
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.115, 0.07, 0.24]} />
            <meshStandardMaterial color={primary} roughness={0.18} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.036, 0]}>
            <boxGeometry args={[0.12, 0.018, 0.245]} />
            <meshStandardMaterial color={secondary} roughness={0.8} />
          </mesh>
          {/* Toe cap, a shade lighter, which is what makes it read as patent. */}
          <mesh position={[0, 0.006, 0.085]}>
            <boxGeometry args={[0.108, 0.058, 0.07]} />
            <meshStandardMaterial color={accent} roughness={0.12} metalness={0.25} />
          </mesh>
        </group>
      )

    case ItemShape.Heel:
      return (
        <group>
          <mesh position={[0, 0.01, 0.02]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.095, 0.055, 0.215]} />
            <meshStandardMaterial color={primary} roughness={0.2} metalness={0.6} />
          </mesh>
          {/* The heel post: the reason this is a different item, not a recolour. */}
          <mesh position={[0, -0.035, -0.075]}>
            <cylinderGeometry args={[0.012, 0.016, 0.075, 8]} />
            <meshStandardMaterial color={secondary} roughness={0.25} metalness={0.6} />
          </mesh>
        </group>
      )

    case ItemShape.Cane:
      return (
        <group>
          {/*
            Length is set by where the hand is, not by what looks right on its
            own: the grip sits at the held anchor, roughly 0.74 above the floor,
            so a longer shaft plants the tip underground and a shorter one
            leaves the cane dangling.
          */}
          <mesh position={[0, -0.35, 0]} castShadow>
            <cylinderGeometry args={[0.012, 0.014, 0.72, 8]} />
            <meshStandardMaterial color={primary} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.02, 0]} castShadow>
            <sphereGeometry args={[0.032, 10, 8]} />
            <meshStandardMaterial color={accent} roughness={0.2} metalness={0.85} />
          </mesh>
          {/* Ferrule at the tip; without it the cane looks cut off. */}
          <mesh position={[0, -0.725, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.04, 8]} />
            <meshStandardMaterial color={secondary} roughness={0.6} />
          </mesh>
        </group>
      )
  }
}
