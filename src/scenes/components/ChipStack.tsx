import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils } from 'three'
import {
  type ChipDenomination,
  CHIP_RADIUS,
  CHIP_THICKNESS,
  chipBreakdown,
  RING_LIP,
} from '../chipLayout'

/** Higher is snappier. Frame-rate independent. */
const TRAVEL_DAMPING = 7

interface ChipStackProps {
  /** Wager in dollars, or explicit chips when the caller has already chosen them. */
  amount?: number | undefined
  chips?: readonly ChipDenomination[] | undefined
  /** Resting place. Eased toward every frame. */
  position: readonly [number, number, number]
  /**
   * Where the stack appears from on mount.
   *
   * This is what makes a bet look like a push and a payout look like the dealer
   * placing it: a stack that mounts at the stash and targets the betting spot
   * *is* the push, with no separate animation system.
   */
  origin?: readonly [number, number, number] | undefined
  /** Lifts the stack so it can rest on top of another pile. */
  baseHeight?: number | undefined
  /**
   * Uniform scale on the chips themselves, not the travel.
   *
   * The craps felt draws at `CRAPS_CHIP_SCALE` so eight players' stacks fit a
   * bet region; blackjack leaves it at 1. Applied to an inner group so the
   * per-chip y-offsets scale with the discs and a stack stays a stack.
   */
  scale?: number | undefined
  /**
   * A flat ring drawn on the felt under the stack, tinted per player.
   *
   * The second half of "whose stack is whose" on a shared craps table —
   * position by rail spot is the first. Kept inside the travelling group so
   * the ring pushes and settles with its chips.
   */
  ring?: string | undefined
}

/** A stack of chips on the felt, easing between wherever it is and where it belongs. */
export function ChipStack({
  amount,
  chips,
  position,
  origin,
  baseHeight = 0,
  scale = 1,
  ring,
}: ChipStackProps) {
  const groupRef = useRef<Group>(null)
  const hasMounted = useRef(false)

  const resolved = chips ?? chipBreakdown(amount ?? 0)

  useFrame((_state, delta) => {
    const group = groupRef.current
    if (!group) return

    const [targetX, targetY, targetZ] = position
    group.position.x = MathUtils.damp(group.position.x, targetX, TRAVEL_DAMPING, delta)
    group.position.y = MathUtils.damp(group.position.y, targetY + baseHeight, TRAVEL_DAMPING, delta)
    group.position.z = MathUtils.damp(group.position.z, targetZ, TRAVEL_DAMPING, delta)
  })

  if (resolved.length === 0) return null

  // Only the very first render starts at the origin; afterwards the group keeps
  // whatever position it has eased to, so a re-render mid-flight does not snap
  // the stack back to where it set off from.
  const start = hasMounted.current ? position : (origin ?? position)
  hasMounted.current = true

  return (
    <group ref={groupRef} position={[start[0], start[1] + baseHeight, start[2]]}>
      {ring && (
        // On the felt under the bottom chip, raised a hair against z-fighting.
        // Gently emissive: at a 0.07m outer radius the play camera gives this
        // a few pixels, and an unlit ring at that size reads as shadow.
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[CHIP_RADIUS * scale + RING_LIP * 0.45, CHIP_RADIUS * scale + RING_LIP, 32]}
          />
          <meshStandardMaterial color={ring} roughness={0.5} emissive={ring} emissiveIntensity={0.35} />
        </mesh>
      )}
      <group scale={scale}>
        {resolved.map((chip, index) => (
          <group
            key={index}
            position={[0, index * CHIP_THICKNESS, 0]}
            // Slight alternating spin so the stack does not look extruded.
            rotation={[0, index * 0.4, 0]}
          >
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[CHIP_RADIUS, CHIP_RADIUS, CHIP_THICKNESS, 24]} />
              <meshStandardMaterial color={chip.color} roughness={0.55} />
            </mesh>
            {/*
              Inlay disc on the top face rather than a band around the rim: a
              vertical rim only ever catches grazing light from the overhead
              lamp, so it read as a dark ring instead of a highlight.

              On an owned stack the inlay wears the owner's hue instead of the
              denomination's pale edge. The top face is the one surface the
              play camera actually sees of a small chip, and every inlay was
              near-white anyway — the *body* colour is what says how much, so
              the ownership badge costs the denomination nothing. Wider than
              the neutral inlay, and lightly emissive, for the same reason
              the ground ring is: a few pixels have to carry the answer to
              "whose chips are those".
            */}
            <mesh position={[0, CHIP_THICKNESS / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry
                args={ring ? [CHIP_RADIUS * 0.42, CHIP_RADIUS * 0.8, 24] : [CHIP_RADIUS * 0.58, CHIP_RADIUS * 0.74, 24]}
              />
              <meshStandardMaterial
                color={ring ?? chip.edge}
                roughness={0.6}
                emissive={ring ?? '#000000'}
                emissiveIntensity={ring ? 0.35 : 0}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}
