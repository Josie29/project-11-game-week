import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils } from 'three'
import { getCardBackTexture, getCardFaceTexture } from '../../games/blackjack/cardTexture'
import type { Card } from '../../games/blackjack/types'

export const CARD_WIDTH = 0.42
export const CARD_HEIGHT = 0.59
const CARD_THICKNESS = 0.012

/**
 * Where cards fly in from. Must track the shoe mesh in `BlackjackTable`, which
 * sits at the dealer's left on the far edge of the felt.
 */
export const SHOE_POSITION: readonly [number, number, number] = [-1.55, 1.09, -0.4]

/** Lying flat with the printed face toward the ceiling. */
const FACE_UP_PITCH = -Math.PI / 2
const FACE_DOWN_PITCH = Math.PI / 2

/** Higher is snappier. Position settles faster than the flip so cards land, then turn. */
const MOVE_DAMPING = 7
const FLIP_DAMPING = 9

interface PlayingCardProps {
  card: Card
  faceUp: boolean
  position: readonly [number, number, number]
  /** Seconds to hold at the shoe before dealing, so hands deal one card at a time. */
  delay: number
  /** Drives a small deterministic tilt so a hand does not look machine-stacked. */
  seatIndex: number
}

/**
 * One animated card.
 *
 * Position and pitch are eased every frame toward props rather than driven by a
 * timeline, so the same component handles dealing, sliding along as a hand
 * grows, and the hole card turning over at settlement.
 */
export function PlayingCard({ card, faceUp, position, delay, seatIndex }: PlayingCardProps) {
  const groupRef = useRef<Group>(null)
  const elapsed = useRef(0)

  const faceTexture = getCardFaceTexture(card)
  const backTexture = getCardBackTexture()

  // Alternating half-degree tilt; deterministic so a hand looks the same each render.
  const restingYaw = (seatIndex % 2 === 0 ? 1 : -1) * 0.035 * ((seatIndex % 3) + 1)

  useFrame((_state, delta) => {
    const group = groupRef.current
    if (!group) return

    elapsed.current += delta
    const dealt = elapsed.current >= delay

    const [targetX, targetY, targetZ] = dealt ? position : SHOE_POSITION
    group.position.x = MathUtils.damp(group.position.x, targetX, MOVE_DAMPING, delta)
    group.position.y = MathUtils.damp(group.position.y, targetY, MOVE_DAMPING, delta)
    group.position.z = MathUtils.damp(group.position.z, targetZ, MOVE_DAMPING, delta)

    // Cards leave the shoe face down and turn over once they are on their spot.
    const targetPitch = dealt && faceUp ? FACE_UP_PITCH : FACE_DOWN_PITCH
    group.rotation.x = MathUtils.damp(group.rotation.x, targetPitch, FLIP_DAMPING, delta)
    group.rotation.z = MathUtils.damp(group.rotation.z, dealt ? restingYaw : 0, MOVE_DAMPING, delta)
  })

  return (
    <group
      ref={groupRef}
      position={[SHOE_POSITION[0], SHOE_POSITION[1], SHOE_POSITION[2]]}
      rotation={[FACE_DOWN_PITCH, 0, 0]}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS]} />
        {/*
          Box material slots run [+x, -x, +y, -y, +z, -z]. The printed face is
          +z and the back is -z; the four edges are plain card stock.
        */}
        <meshStandardMaterial attach="material-0" color="#e9eaf2" roughness={0.7} />
        <meshStandardMaterial attach="material-1" color="#e9eaf2" roughness={0.7} />
        <meshStandardMaterial attach="material-2" color="#e9eaf2" roughness={0.7} />
        <meshStandardMaterial attach="material-3" color="#e9eaf2" roughness={0.7} />
        <meshStandardMaterial attach="material-4" map={faceTexture} roughness={0.55} />
        <meshStandardMaterial attach="material-5" map={backTexture} roughness={0.55} />
      </mesh>
    </group>
  )
}
