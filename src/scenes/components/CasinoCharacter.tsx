import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import { Group, MathUtils } from 'three'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { GESTURES, REST_POSE } from '../gestures'

export enum Outfit {
  /** Charcoal suit, white shirt, red tie — matches art/refs/blackjack_floor.png. */
  Dealer = 'dealer',
  /** Dark jacket over a shirt, seen from behind on the strip. */
  Player = 'player',
}

interface OutfitColors {
  readonly jacket: string
  /** Slightly lighter than the jacket, for lapels and shoulder seams. */
  readonly jacketTrim: string
  readonly shirt: string
  readonly accent: string
  readonly trousers: string
  readonly shoes: string
  readonly skin: string
  readonly hair: string
}

const OUTFITS: Record<Outfit, OutfitColors> = {
  [Outfit.Dealer]: {
    jacket: '#2f3440',
    jacketTrim: '#3d4352',
    shirt: '#eef1f8',
    accent: '#c0392b',
    trousers: '#23262f',
    shoes: '#14161c',
    skin: '#c68a63',
    hair: '#241a14',
  },
  [Outfit.Player]: {
    jacket: '#28304b',
    jacketTrim: '#38426a',
    shirt: '#8d97c4',
    accent: '#22e0ff',
    trousers: '#171b2c',
    shoes: '#101320',
    skin: '#c68a63',
    hair: '#1a1410',
  },
}

/*
 * Proportions, in world units, for a figure roughly 1.75 tall. Joint offsets
 * are measured from their parent so each group rotates about a real pivot.
 */
const THIGH = 0.42
const SHIN = 0.43
const STANDING_HIP_Y = THIGH + SHIN
const TORSO_HEIGHT = 0.62
const SHOULDER_Y = TORSO_HEIGHT * 0.86
const SHOULDER_X = 0.21
const UPPER_ARM = 0.28
const FOREARM = 0.26

/**
 * Hip height when seated.
 *
 * Casino stools are tall, so the shins hang clear of the floor and the feet
 * rest on the stool's footring rather than the carpet.
 */
const SEATED_HIP_Y = 0.62

/** Arms rest slightly out from the body rather than clipping through it. */
const IDLE_ARM_SPLAY = 0.12

/** Dealer stands with both hands forward over the chip rack. */
const DEALER_SHOULDER_PITCH = -1.15
const DEALER_ELBOW_PITCH = -0.5

/** A seated figure rests both forearms toward the table. */
const SEATED_SHOULDER_PITCH = -0.5
const SEATED_ELBOW_PITCH = -0.9

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
  /** Sits the figure on a stool: hips dropped, thighs forward, shins down. */
  seated?: boolean | undefined
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
  seated = false,
  signalsGestures = false,
}: CasinoCharacterProps) {
  const colors = OUTFITS[outfit]

  const bodyRef = useRef<Group>(null)
  const armLeftRef = useRef<Group>(null)
  const shoulderRight = useRef<Group>(null)
  const elbowRight = useRef<Group>(null)

  const walkPhase = useRef(0)

  useFrame((_state, delta) => {
    // A seated figure never walks, whatever the rig reports.
    const speed = seated ? 0 : (speedRef?.current ?? 0)
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

    /** Where an arm rests when no gesture is playing. */
    const restShoulder = dealerPose
      ? DEALER_SHOULDER_PITCH
      : seated
        ? SEATED_SHOULDER_PITCH
        : swing
    const restElbow = dealerPose ? DEALER_ELBOW_PITCH : seated ? SEATED_ELBOW_PITCH : 0

    if (armLeftRef.current) {
      armLeftRef.current.rotation.x = MathUtils.lerp(
        armLeftRef.current.rotation.x,
        restShoulder,
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

    // A gesture snaps in; the return to rest eases, so the arm does not whip
    // back the instant the animation ends.
    const rate = driven ? 1 - Math.exp(-26 * delta) : settle

    if (shoulderRight.current) {
      // Walking swings the arms in opposition; posed states move them together.
      const restShoulderRight =
        dealerPose || seated ? restShoulder : -swing

      shoulderRight.current.rotation.x = MathUtils.lerp(
        shoulderRight.current.rotation.x,
        driven ? pose.shoulderPitch : restShoulderRight,
        rate,
      )
      shoulderRight.current.rotation.z = MathUtils.lerp(
        shoulderRight.current.rotation.z,
        driven ? pose.shoulderRoll : -IDLE_ARM_SPLAY,
        rate,
      )
    }

    if (elbowRight.current) {
      elbowRight.current.rotation.x = MathUtils.lerp(
        elbowRight.current.rotation.x,
        driven ? pose.elbowPitch : restElbow,
        rate,
      )
    }
  })

  const hipY = seated ? SEATED_HIP_Y : STANDING_HIP_Y
  // Seated: thigh swings forward and the knee folds it back down.
  const thighPitch = seated ? -Math.PI / 2 : 0
  const kneePitch = seated ? Math.PI / 2 : 0

  const jacketMaterial = <meshStandardMaterial color={colors.jacket} roughness={0.75} />
  const skinMaterial = <meshStandardMaterial color={colors.skin} roughness={0.8} />

  /** One arm, from shoulder to fingertips. Refs are only wired to the right. */
  const renderArm = (side: 1 | -1) => (
    <>
      <mesh position={[0, -UPPER_ARM / 2, 0]} castShadow>
        <capsuleGeometry args={[0.055, UPPER_ARM - 0.08, 4, 8]} />
        {jacketMaterial}
      </mesh>

      {/* `null` rather than `undefined`: under exactOptionalPropertyTypes an
          explicit undefined ref is not assignable. */}
      <group ref={side === 1 ? elbowRight : null} position={[0, -UPPER_ARM, 0]}>
        <mesh position={[0, -FOREARM / 2, 0]} castShadow>
          <capsuleGeometry args={[0.05, FOREARM - 0.08, 4, 8]} />
          {jacketMaterial}
        </mesh>

        {/* Shirt cuff showing past the jacket sleeve. */}
        <mesh position={[0, -FOREARM + 0.03, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.045, 8]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.7} />
        </mesh>

        <group position={[0, -FOREARM, 0]}>
          {/* Palm */}
          <mesh position={[0, -0.05, 0]}>
            <boxGeometry args={[0.085, 0.09, 0.05]} />
            {skinMaterial}
          </mesh>
          {/* Index and middle fingers, extended for the tap and V signals. */}
          {[-0.022, 0.022].map((offset) => (
            <mesh key={offset} position={[offset, -0.12, 0.012]}>
              <boxGeometry args={[0.02, 0.06, 0.022]} />
              {skinMaterial}
            </mesh>
          ))}
          {/* Thumb, tucked across the side of the palm. */}
          <mesh position={[side * -0.05, -0.075, 0.018]} rotation={[0, 0, side * 0.5]}>
            <boxGeometry args={[0.019, 0.045, 0.021]} />
            {skinMaterial}
          </mesh>
        </group>
      </group>
    </>
  )

  return (
    <group ref={bodyRef}>
      {/* Legs, jointed at hip and knee so the figure can stand or sit. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.11, hipY, 0]} rotation={[thighPitch, 0, 0]}>
          <mesh position={[0, -THIGH / 2, 0]} castShadow>
            <capsuleGeometry args={[0.095, THIGH - 0.1, 4, 8]} />
            <meshStandardMaterial color={colors.trousers} roughness={0.85} />
          </mesh>

          <group position={[0, -THIGH, 0]} rotation={[kneePitch, 0, 0]}>
            <mesh position={[0, -SHIN / 2, 0]} castShadow>
              <capsuleGeometry args={[0.085, SHIN - 0.1, 4, 8]} />
              <meshStandardMaterial color={colors.trousers} roughness={0.85} />
            </mesh>
            <mesh position={[0, -SHIN + 0.02, 0.05]} castShadow>
              <boxGeometry args={[0.115, 0.07, 0.22]} />
              <meshStandardMaterial color={colors.shoes} roughness={0.45} />
            </mesh>
          </group>
        </group>
      ))}

      <group position={[0, hipY, 0]}>
        {/* Torso */}
        <mesh position={[0, TORSO_HEIGHT / 2, 0]} castShadow>
          <boxGeometry args={[0.42, TORSO_HEIGHT, 0.24]} />
          {jacketMaterial}
        </mesh>

        {/* Shirt panel down the chest. */}
        <mesh position={[0, TORSO_HEIGHT * 0.56, 0.122]}>
          <boxGeometry args={[0.16, TORSO_HEIGHT * 0.72, 0.012]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.7} />
        </mesh>

        {/* Jacket lapels, angled in toward the collar. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.115, TORSO_HEIGHT * 0.7, 0.128]}
            rotation={[0, 0, side * 0.28]}
          >
            <boxGeometry args={[0.1, 0.26, 0.014]} />
            <meshStandardMaterial color={colors.jacketTrim} roughness={0.7} />
          </mesh>
        ))}

        {/* Tie: knot at the collar, blade running down the shirt. */}
        <mesh position={[0, TORSO_HEIGHT * 0.87, 0.133]}>
          <boxGeometry args={[0.045, 0.05, 0.016]} />
          <meshStandardMaterial color={colors.accent} roughness={0.55} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT * 0.6, 0.131]}>
          <boxGeometry args={[0.052, TORSO_HEIGHT * 0.46, 0.012]} />
          <meshStandardMaterial color={colors.accent} roughness={0.55} />
        </mesh>

        {/* Shoulder seams, catching a little more light than the jacket body. */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.175, TORSO_HEIGHT * 0.93, 0]}>
            <boxGeometry args={[0.09, 0.05, 0.245]} />
            <meshStandardMaterial color={colors.jacketTrim} roughness={0.7} />
          </mesh>
        ))}

        {/*
          Back of the jacket: a collar band and a centre vent seam. The player
          is seen almost entirely from behind, so without these the figure is a
          featureless dark slab in the foreground.
        */}
        <mesh position={[0, TORSO_HEIGHT * 0.93, -0.124]}>
          <boxGeometry args={[0.31, 0.06, 0.014]} />
          <meshStandardMaterial color={colors.jacketTrim} roughness={0.7} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT * 0.34, -0.124]}>
          <boxGeometry args={[0.016, TORSO_HEIGHT * 0.55, 0.012]} />
          <meshStandardMaterial color={colors.jacketTrim} roughness={0.7} />
        </mesh>
        {/* Shirt collar showing above the jacket at the back of the neck. */}
        <mesh position={[0, TORSO_HEIGHT + 0.012, -0.088]}>
          <boxGeometry args={[0.15, 0.055, 0.05]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.7} />
        </mesh>

        {/* Dealer's name badge, as worn on the floor. */}
        {outfit === Outfit.Dealer && (
          <mesh position={[-0.13, TORSO_HEIGHT * 0.52, 0.126]}>
            <boxGeometry args={[0.07, 0.024, 0.01]} />
            <meshStandardMaterial color="#d9c48a" roughness={0.4} metalness={0.6} />
          </mesh>
        )}

        {/* Shirt collar, two wings either side of the neck. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.055, TORSO_HEIGHT + 0.005, 0.1]}
            rotation={[0, 0, side * 0.42]}
          >
            <boxGeometry args={[0.055, 0.075, 0.03]} />
            <meshStandardMaterial color={colors.shirt} roughness={0.7} />
          </mesh>
        ))}

        {/* Neck and head */}
        <mesh position={[0, TORSO_HEIGHT + 0.04, 0]}>
          <cylinderGeometry args={[0.055, 0.06, 0.09, 8]} />
          {skinMaterial}
        </mesh>
        <mesh position={[0, TORSO_HEIGHT + 0.19, 0]} castShadow>
          <boxGeometry args={[0.2, 0.24, 0.2]} />
          {skinMaterial}
        </mesh>

        {/* Eyes and brows. Small, but they are what stop the head reading as a
            featureless block at this distance. */}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.048, TORSO_HEIGHT + 0.215, 0.101]}>
              <boxGeometry args={[0.038, 0.022, 0.008]} />
              <meshStandardMaterial color="#f4f2ee" roughness={0.5} />
            </mesh>
            <mesh position={[side * 0.048, TORSO_HEIGHT + 0.215, 0.106]}>
              <boxGeometry args={[0.016, 0.018, 0.008]} />
              <meshStandardMaterial color="#20161a" roughness={0.4} />
            </mesh>
            <mesh position={[side * 0.05, TORSO_HEIGHT + 0.246, 0.1]}>
              <boxGeometry args={[0.05, 0.014, 0.01]} />
              <meshStandardMaterial color={colors.hair} roughness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Nose and mouth. */}
        <mesh position={[0, TORSO_HEIGHT + 0.185, 0.107]}>
          <boxGeometry args={[0.026, 0.045, 0.022]} />
          {skinMaterial}
        </mesh>
        <mesh position={[0, TORSO_HEIGHT + 0.132, 0.101]}>
          <boxGeometry args={[0.05, 0.011, 0.008]} />
          <meshStandardMaterial color="#8a4f45" roughness={0.6} />
        </mesh>

        {/* Hair: crown, a fringe over the brow, and sideburns. */}
        <mesh position={[0, TORSO_HEIGHT + 0.305, -0.008]} castShadow>
          <boxGeometry args={[0.215, 0.085, 0.215]} />
          <meshStandardMaterial color={colors.hair} roughness={0.9} />
        </mesh>
        <mesh position={[0, TORSO_HEIGHT + 0.272, 0.09]}>
          <boxGeometry args={[0.212, 0.055, 0.045]} />
          <meshStandardMaterial color={colors.hair} roughness={0.9} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.102, TORSO_HEIGHT + 0.225, -0.01]}>
            <boxGeometry args={[0.018, 0.14, 0.19]} />
            <meshStandardMaterial color={colors.hair} roughness={0.9} />
          </mesh>
        ))}

        {/* Arms. The right one carries the joint refs the gestures drive. */}
        <group ref={armLeftRef} position={[-SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, IDLE_ARM_SPLAY]}>
          {renderArm(-1)}
        </group>

        <group
          ref={shoulderRight}
          position={[SHOULDER_X, SHOULDER_Y, 0]}
          rotation={[0, 0, -IDLE_ARM_SPLAY]}
        >
          {renderArm(1)}
        </group>
      </group>
    </group>
  )
}
