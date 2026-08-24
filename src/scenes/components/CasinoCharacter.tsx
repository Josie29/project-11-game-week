import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Group, MathUtils } from 'three'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { GESTURES, REST_POSE } from '../gestures'

export enum Outfit {
  /** Charcoal suit, white shirt, red tie — matches art/refs/blackjack_floor.png. */
  Dealer = 'dealer',
  /** Dark jacket, seen from behind on the strip. */
  Player = 'player',
}

interface OutfitColors {
  readonly jacket: string
  readonly shirt: string
  readonly accent: string
  readonly trousers: string
  readonly skin: string
  readonly hair: string
}

const OUTFITS: Record<Outfit, OutfitColors> = {
  [Outfit.Dealer]: {
    jacket: '#2f3440',
    shirt: '#eef1f8',
    accent: '#c0392b',
    trousers: '#23262f',
    skin: '#c68a63',
    hair: '#241a14',
  },
  [Outfit.Player]: {
    jacket: '#1e2438',
    shirt: '#38416a',
    accent: '#22e0ff',
    trousers: '#171b2c',
    skin: '#c68a63',
    hair: '#1a1410',
  },
}

/*
 * Proportions, in world units, for a figure roughly 1.75 tall. Joint offsets
 * are measured from their parent so each group rotates about a real pivot.
 */
const LEG_LENGTH = 0.85
const TORSO_HEIGHT = 0.62
const SHOULDER_Y = TORSO_HEIGHT * 0.86
const SHOULDER_X = 0.21
const UPPER_ARM = 0.28
const FOREARM = 0.26

/** Arms rest slightly out from the body rather than clipping through it. */
const IDLE_ARM_SPLAY = 0.12

/** Dealer stands with both hands forward over the chip rack. */
const DEALER_SHOULDER_PITCH = -1.15
const DEALER_ELBOW_PITCH = -0.5

const WALK_CYCLE_SPEED = 9
const WALK_SWING = 0.5

interface CasinoCharacterProps {
  outfit: Outfit
  /**
   * Live walking speed in units per second, read every frame.
   *
   * Passed as a ref rather than a prop value so the walk cycle can react
   * without re-rendering the figure sixty times a second.
   */
  speedRef?: RefObject<number> | undefined
  /** Poses the arms forward over the table, as a dealer stands. */
  dealerPose?: boolean | undefined
  /**
   * Drives the right arm from the table's active hand signal.
   *
   * The figure subscribes imperatively rather than taking a pose prop, so a
   * gesture animates without re-rendering the whole body every frame.
   */
  signalsGestures?: boolean | undefined
}

/**
 * A low-poly casino figure assembled from primitives.
 *
 * Built in code rather than loaded as a rigged model for one reason: the hand
 * signals. Driving named joint groups directly gives exact control over a
 * double finger-tap or a flat wave, which authoring against an imported rig
 * would not. It also matches the stylised look of the reference art and adds
 * no download.
 */
export function CasinoCharacter({
  outfit,
  speedRef,
  dealerPose = false,
  signalsGestures = false,
}: CasinoCharacterProps) {
  const colors = OUTFITS[outfit]

  const bodyRef = useRef<Group>(null)
  const armLeftRef = useRef<Group>(null)
  const shoulderRight = useRef<Group>(null)
  const elbowRight = useRef<Group>(null)

  const walkPhase = useRef(0)

  useFrame((_state, delta) => {
    const speed = speedRef?.current ?? 0
    const isWalking = speed > 0.1

    // Advance the cycle only while moving, so a standing figure holds still
    // instead of marching on the spot.
    if (isWalking) walkPhase.current += delta * WALK_CYCLE_SPEED

    const swing = isWalking ? Math.sin(walkPhase.current) * WALK_SWING : 0
    const settle = 1 - Math.exp(-10 * delta)

    if (bodyRef.current) {
      // Slight vertical bob at twice the stride frequency.
      const bob = isWalking ? Math.abs(Math.sin(walkPhase.current)) * 0.035 : 0
      bodyRef.current.position.y = MathUtils.lerp(bodyRef.current.position.y, bob, settle)
    }

    if (armLeftRef.current) {
      armLeftRef.current.rotation.x = MathUtils.lerp(
        armLeftRef.current.rotation.x,
        dealerPose ? DEALER_SHOULDER_PITCH : swing,
        settle,
      )
    }

    // Read the signal imperatively — subscribing would re-render the figure on
    // every gesture change for no benefit.
    const { activeGesture, gestureStartedAt } = signalsGestures
      ? useBlackjackStore.getState()
      : { activeGesture: null, gestureStartedAt: 0 }

    let pose = REST_POSE
    let driven = false

    if (activeGesture !== null) {
      const definition = GESTURES[activeGesture]
      const t = (performance.now() - gestureStartedAt) / definition.durationMs

      if (t < 1) {
        pose = definition.pose(t)
        driven = true
      }
    }

    if (shoulderRight.current) {
      const targetPitch = driven ? pose.shoulderPitch : dealerPose ? DEALER_SHOULDER_PITCH : -swing
      const targetRoll = driven ? pose.shoulderRoll : -IDLE_ARM_SPLAY

      // A gesture snaps in; the return to rest eases, so the arm does not
      // whip back the instant the animation ends.
      const rate = driven ? 1 - Math.exp(-26 * delta) : settle
      shoulderRight.current.rotation.x = MathUtils.lerp(
        shoulderRight.current.rotation.x,
        targetPitch,
        rate,
      )
      shoulderRight.current.rotation.z = MathUtils.lerp(
        shoulderRight.current.rotation.z,
        targetRoll,
        rate,
      )
    }

    if (elbowRight.current) {
      const targetElbow = driven ? pose.elbowPitch : dealerPose ? DEALER_ELBOW_PITCH : 0
      const rate = driven ? 1 - Math.exp(-26 * delta) : settle
      elbowRight.current.rotation.x = MathUtils.lerp(
        elbowRight.current.rotation.x,
        targetElbow,
        rate,
      )
    }
  })

  const armMaterial = <meshStandardMaterial color={colors.jacket} roughness={0.75} />

  return (
    <group ref={bodyRef}>
      {/* Legs */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.11, LEG_LENGTH / 2, 0]} castShadow>
          <capsuleGeometry args={[0.098, LEG_LENGTH - 0.2, 4, 8]} />
          <meshStandardMaterial color={colors.trousers} roughness={0.85} />
        </mesh>
      ))}

      <group position={[0, LEG_LENGTH, 0]}>
        {/* Torso */}
        <mesh position={[0, TORSO_HEIGHT / 2, 0]} castShadow>
          <boxGeometry args={[0.42, TORSO_HEIGHT, 0.24]} />
          <meshStandardMaterial color={colors.jacket} roughness={0.75} />
        </mesh>

        {/* Shirt panel and tie, only visible from the front. */}
        <mesh position={[0, TORSO_HEIGHT * 0.56, 0.126]}>
          <planeGeometry args={[0.15, TORSO_HEIGHT * 0.72]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.7} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT * 0.52, 0.131]}>
          <planeGeometry args={[0.05, TORSO_HEIGHT * 0.6]} />
          <meshStandardMaterial color={colors.accent} roughness={0.6} />
        </mesh>

        {/* Neck and head */}
        <mesh position={[0, TORSO_HEIGHT + 0.04, 0]}>
          <cylinderGeometry args={[0.055, 0.06, 0.09, 8]} />
          <meshStandardMaterial color={colors.skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT + 0.19, 0]} castShadow>
          <boxGeometry args={[0.2, 0.24, 0.2]} />
          <meshStandardMaterial color={colors.skin} roughness={0.8} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT + 0.29, -0.012]}>
          <boxGeometry args={[0.215, 0.1, 0.215]} />
          <meshStandardMaterial color={colors.hair} roughness={0.9} />
        </mesh>

        {/* Left arm — swings with the walk, or reaches forward as a dealer. */}
        <group ref={armLeftRef} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, IDLE_ARM_SPLAY]}>
          <mesh position={[0, -UPPER_ARM / 2, 0]} castShadow>
            <capsuleGeometry args={[0.055, UPPER_ARM - 0.08, 4, 8]} />
            {armMaterial}
          </mesh>
          <group position={[0, -UPPER_ARM, 0]}>
            <mesh position={[0, -FOREARM / 2, 0]} castShadow>
              <capsuleGeometry args={[0.05, FOREARM - 0.08, 4, 8]} />
              {armMaterial}
            </mesh>
            <mesh position={[0, -FOREARM - 0.04, 0]}>
              <boxGeometry args={[0.08, 0.09, 0.06]} />
              <meshStandardMaterial color={colors.skin} roughness={0.8} />
            </mesh>
          </group>
        </group>

        {/* Right arm — the one that signals. */}
        <group
          ref={shoulderRight}
          position={[SHOULDER_X, SHOULDER_Y, 0]}
          rotation={[0, 0, -IDLE_ARM_SPLAY]}
        >
          <mesh position={[0, -UPPER_ARM / 2, 0]} castShadow>
            <capsuleGeometry args={[0.055, UPPER_ARM - 0.08, 4, 8]} />
            {armMaterial}
          </mesh>

          <group ref={elbowRight} position={[0, -UPPER_ARM, 0]}>
            <mesh position={[0, -FOREARM / 2, 0]} castShadow>
              <capsuleGeometry args={[0.05, FOREARM - 0.08, 4, 8]} />
              {armMaterial}
            </mesh>

            <group position={[0, -FOREARM, 0]}>
              {/* Palm */}
              <mesh position={[0, -0.045, 0]}>
                <boxGeometry args={[0.085, 0.09, 0.05]} />
                <meshStandardMaterial color={colors.skin} roughness={0.8} />
              </mesh>
              {/* Index and middle fingers, extended for the tap and V signals. */}
              {[-0.022, 0.022].map((offset) => (
                <mesh key={offset} position={[offset, -0.115, 0.012]}>
                  <boxGeometry args={[0.02, 0.06, 0.022]} />
                  <meshStandardMaterial color={colors.skin} roughness={0.8} />
                </mesh>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
