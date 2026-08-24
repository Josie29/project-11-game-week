import { useMemo } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape } from 'three'
import {
  DISCARD_ROTATION_Y,
  DISCARD_TRAY,
  SHOE_POSITION,
  SHOE_ROTATION_Y,
} from '../tableLayout'

/** Smoked acrylic, as most modern shoes and trays are moulded from. */
const ACRYLIC = '#1a1526'
const ACRYLIC_EDGE = '#2e2742'
const CARD_EDGE = '#d8dae6'
const BRUSHED_METAL = '#6d7285'

const SHOE_WIDTH = 0.46
const SHOE_LENGTH = 0.66
/** Tall at the back where the deck loads, low at the front lip. */
const SHOE_BACK_HEIGHT = 0.26
const SHOE_FRONT_HEIGHT = 0.075

const TRAY_WIDTH = 0.44
const TRAY_LENGTH = 0.5
const TRAY_HEIGHT = 0.3

interface DealerKitProps {
  /**
   * How much of the shoe is still undealt, 0 to 1.
   *
   * Drives the visible card block in both pieces, so the shoe empties and the
   * tray fills as the shoe is played down. Derived from the engine's existing
   * `shoeIndex` — no new state.
   */
  shoeRemaining: number
}

/**
 * The dealer's kit: the dealing shoe and the discard tray.
 *
 * Both were placeholders — the shoe a featureless box, the tray a bare
 * coordinate that cards flew to and vanished at. They are the two objects a
 * player looks at between hands, so they are worth building properly.
 */
export function DealerKit({ shoeRemaining }: DealerKitProps) {
  /**
   * Side profile of the shoe: a wedge sloping from the loading end down to the
   * lip cards are drawn from.
   */
  const shoeBody = useMemo(() => {
    const profile = new Shape()
    profile.moveTo(-SHOE_LENGTH / 2, 0)
    profile.lineTo(SHOE_LENGTH / 2, 0)
    profile.lineTo(SHOE_LENGTH / 2, SHOE_FRONT_HEIGHT)
    profile.lineTo(-SHOE_LENGTH / 2, SHOE_BACK_HEIGHT)
    profile.closePath()

    const geometry = new ExtrudeGeometry(profile, { depth: SHOE_WIDTH, bevelEnabled: false })
    // Extrusion runs along +z from the profile plane; centre it on the anchor.
    geometry.translate(0, 0, -SHOE_WIDTH / 2)
    return geometry
  }, [])

  const cardBlockHeight = 0.02 + shoeRemaining * (SHOE_BACK_HEIGHT - 0.09)
  const discardHeight = 0.02 + (1 - shoeRemaining) * (TRAY_HEIGHT - 0.08)

  return (
    <group>
      {/* Dealing shoe. */}
      <group position={[...SHOE_POSITION]} rotation={[0, SHOE_ROTATION_Y, 0]}>
        <mesh geometry={shoeBody} castShadow receiveShadow>
          <meshStandardMaterial
            color={ACRYLIC}
            roughness={0.35}
            metalness={0.2}
            transparent
            opacity={0.92}
            side={DoubleSide}
          />
        </mesh>

        {/* The undealt deck, seen through the side of the shoe. */}
        <mesh position={[-0.07, cardBlockHeight / 2 + 0.012, 0]} castShadow>
          <boxGeometry args={[SHOE_LENGTH * 0.62, cardBlockHeight, SHOE_WIDTH * 0.78]} />
          <meshStandardMaterial color={CARD_EDGE} roughness={0.85} />
        </mesh>

        {/* Weighted pusher resting on the deck, angled with the wedge. */}
        <mesh position={[-0.07, cardBlockHeight + 0.03, 0]} rotation={[0, 0, -0.12]} castShadow>
          <boxGeometry args={[SHOE_LENGTH * 0.5, 0.03, SHOE_WIDTH * 0.7]} />
          <meshStandardMaterial color={BRUSHED_METAL} roughness={0.3} metalness={0.8} />
        </mesh>

        {/* Front lip the cards are drawn over. */}
        <mesh position={[SHOE_LENGTH / 2 - 0.015, SHOE_FRONT_HEIGHT / 2, 0]}>
          <boxGeometry args={[0.03, SHOE_FRONT_HEIGHT, SHOE_WIDTH]} />
          <meshStandardMaterial color={ACRYLIC_EDGE} roughness={0.4} metalness={0.25} />
        </mesh>
      </group>

      {/* Discard tray, at the dealer's other hand. */}
      <group position={[...DISCARD_TRAY]} rotation={[0, DISCARD_ROTATION_Y, 0]}>
        {/* Four walls rather than a solid block, so the stack inside shows. */}
        {[
          { position: [0, TRAY_HEIGHT / 2, TRAY_WIDTH / 2] as const, size: [TRAY_LENGTH, TRAY_HEIGHT, 0.02] as const },
          { position: [0, TRAY_HEIGHT / 2, -TRAY_WIDTH / 2] as const, size: [TRAY_LENGTH, TRAY_HEIGHT, 0.02] as const },
          { position: [TRAY_LENGTH / 2, TRAY_HEIGHT / 2, 0] as const, size: [0.02, TRAY_HEIGHT, TRAY_WIDTH] as const },
          { position: [-TRAY_LENGTH / 2, TRAY_HEIGHT / 2, 0] as const, size: [0.02, TRAY_HEIGHT, TRAY_WIDTH] as const },
        ].map((wall, index) => (
          <mesh key={index} position={[...wall.position]} castShadow>
            <boxGeometry args={[...wall.size]} />
            <meshStandardMaterial
              color={ACRYLIC}
              roughness={0.3}
              metalness={0.2}
              transparent
              opacity={0.78}
              side={DoubleSide}
            />
          </mesh>
        ))}

        <mesh position={[0, 0.01, 0]} receiveShadow>
          <boxGeometry args={[TRAY_LENGTH, 0.02, TRAY_WIDTH]} />
          <meshStandardMaterial color={ACRYLIC_EDGE} roughness={0.5} />
        </mesh>

        {/* Spent cards, rising as the shoe is played down. */}
        <mesh position={[0, discardHeight / 2 + 0.02, 0]} castShadow>
          <boxGeometry args={[TRAY_LENGTH * 0.88, discardHeight, TRAY_WIDTH * 0.88]} />
          <meshStandardMaterial color={CARD_EDGE} roughness={0.85} />
        </mesh>
      </group>
    </group>
  )
}
