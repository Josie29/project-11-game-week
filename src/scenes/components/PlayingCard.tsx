import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils } from 'three'
import { getCardBackTexture, getCardFaceTexture } from '../../games/blackjack/cardTexture'
import type { Card } from '../../games/blackjack/types'
import { CARD_HEIGHT, CARD_WIDTH, SHOE_MOUTH } from '../tableLayout'

// Re-exported so the components that lay cards out need only this module; the
// sizes themselves live with the rest of the table geometry, where the felt's
// own clearances can be asserted against them.
export { CARD_HEIGHT, CARD_WIDTH }

const CARD_THICKNESS = 0.011

/** Lying flat with the printed face toward the ceiling. */
const FACE_UP_PITCH = -Math.PI / 2
const FACE_DOWN_PITCH = Math.PI / 2

/** Higher is snappier. Frame-rate independent. */
const MOVE_DAMPING = 7

/** How far the card rises off the felt at the midpoint of a turn. */
const FLIP_LIFT = 0.085

/**
 * Smooth 0-1 ramp with zero velocity at both ends.
 *
 * A linear turn looks mechanical; easing in and out is what makes it read as a
 * hand turning the card rather than a mesh rotating.
 */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

interface PlayingCardProps {
  card: Card
  faceUp: boolean
  position: readonly [number, number, number]
  /** Seconds to hold at the shoe before dealing, so hands deal one card at a time. */
  delay: number
  /** Drives a small deterministic tilt so a hand does not look machine-stacked. */
  seatIndex: number
  /**
   * How long the turn takes.
   *
   * Short while dealing, so the deal stays brisk; long for the dealer's hole
   * card, which is the one moment worth drawing out.
   */
  flipDurationMs?: number | undefined
}

const DEFAULT_FLIP_MS = 280

/**
 * One animated card.
 *
 * Position is eased toward props every frame, so the same component handles
 * dealing from the shoe, sliding along as a hand grows, and being pushed to the
 * discard tray at the end of a round.
 *
 * The turn is a timed animation rather than damping, because damping cannot
 * express a lift — and a card that rises off the felt as it turns is what makes
 * the reveal look like a dealer's hand instead of a rotating rectangle.
 */
export function PlayingCard({
  card,
  faceUp,
  position,
  delay,
  seatIndex,
  flipDurationMs = DEFAULT_FLIP_MS,
}: PlayingCardProps) {
  const groupRef = useRef<Group>(null)
  const elapsed = useRef(0)

  /** Progress of the current turn, 0 face down through 1 face up. */
  const flip = useRef(0)

  const faceTexture = getCardFaceTexture(card)
  const backTexture = getCardBackTexture()

  // Alternating half-degree tilt; deterministic so a hand looks the same each render.
  const restingYaw = (seatIndex % 2 === 0 ? 1 : -1) * 0.035 * ((seatIndex % 3) + 1)

  useFrame((_state, delta) => {
    const group = groupRef.current
    if (!group) return

    elapsed.current += delta
    const dealt = elapsed.current >= delay

    // Queued cards wait invisibly. The table now deals a shared round one card
    // at a time, so several cards can be waiting their turn — rendered, they
    // are a coplanar stack flickering at the shoe's lip for seconds.
    group.visible = dealt

    // Cards leave the shoe face down and only turn once they are on their spot.
    const wantsFaceUp = dealt && faceUp
    const step = delta / (flipDurationMs / 1000)
    flip.current = MathUtils.clamp(flip.current + (wantsFaceUp ? step : -step), 0, 1)

    const turn = easeInOut(flip.current)
    // Peaks at the midpoint: the card is highest when it is on its edge.
    const lift = Math.sin(turn * Math.PI) * FLIP_LIFT

    const [targetX, targetY, targetZ] = dealt ? position : SHOE_MOUTH
    group.position.x = MathUtils.damp(group.position.x, targetX, MOVE_DAMPING, delta)
    group.position.y = MathUtils.damp(group.position.y, targetY + lift, MOVE_DAMPING * 2, delta)
    group.position.z = MathUtils.damp(group.position.z, targetZ, MOVE_DAMPING, delta)

    group.rotation.x = MathUtils.lerp(FACE_DOWN_PITCH, FACE_UP_PITCH, turn)
    group.rotation.z = MathUtils.damp(group.rotation.z, dealt ? restingYaw : 0, MOVE_DAMPING, delta)
  })

  return (
    <group
      ref={groupRef}
      position={[SHOE_MOUTH[0], SHOE_MOUTH[1], SHOE_MOUTH[2]]}
      rotation={[FACE_DOWN_PITCH, 0, 0]}
      // Hidden until dealt; the first frame callback keeps this in step.
      visible={false}
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
