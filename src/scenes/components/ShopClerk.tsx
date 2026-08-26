import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'
import { CLERK_APPEARANCE } from '../../character/appearance'
import { useGameStore } from '../../store/useGameStore'
import { CLERK_FACING, CLERK_STAND } from '../shopLayout'
import { CasinoCharacter } from './CasinoCharacter'

/*
 * The one person who works at The Gilded Hanger.
 *
 * Standing rather than seated, which is the whole of the difference from the
 * clinic's receptionist: a counter you pay at is a counter somebody is stood
 * behind, and a seated pose would need a chair drawn under it as hers does.
 *
 * She turns to face whoever comes near, on the same damped lerp and for the
 * same reason — it is the only acknowledgement the shop gives, and without it
 * a figure holding one pose reads as a second mannequin.
 */

/** How fast she turns to face someone. Frame-rate independent. */
const TURN_DAMPING = 3.4

/**
 * How far away she notices.
 *
 * Wider than `DESK_RADIUS`, deliberately: looking up only once the prompt is
 * already on screen is a beat too late to read as noticing. This is why the
 * shop passes `glanceTargets` as well as `targets` — the two answer different
 * questions, and folding them together would let standing near the counter
 * take a fixture's prompt away.
 */
export const CLERK_GLANCE_RADIUS = 3.4

function lerpAngle(from: number, to: number, t: number): number {
  // Wrap the delta so a turn always takes the short way round.
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * t
}

/** The clerk, behind the till. */
export function ShopClerk() {
  const groupRef = useRef<Group>(null)
  const nearby = useGameStore((state) => state.nearbyClerk)
  const atCheckout = useGameStore((state) => state.atCheckout)

  /** Squared away with the stock behind her, half-turned from the room. */
  const atWork = CLERK_FACING + 0.42
  /** Straight across the counter at whoever is standing at it. */
  const atCustomer = CLERK_FACING

  useFrame((_state, delta) => {
    if (!groupRef.current) return

    groupRef.current.rotation.y = lerpAngle(
      groupRef.current.rotation.y,
      nearby || atCheckout ? atCustomer : atWork,
      1 - Math.exp(-TURN_DAMPING * delta),
    )
  })

  return (
    <group name="shop:clerk" position={[CLERK_STAND[0], 0, CLERK_STAND[2]]}>
      <group ref={groupRef} rotation={[0, atWork, 0]}>
        <CasinoCharacter appearance={CLERK_APPEARANCE} staff />
      </group>
    </group>
  )
}
