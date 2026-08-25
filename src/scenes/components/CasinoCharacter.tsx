import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode, type RefObject } from 'react'
import { DoubleSide, Group, MathUtils } from 'three'
import { anchorFor, type Anchor } from '../../character/anchors'
import { Garment, resolveAppearance, type Appearance } from '../../character/appearance'
import { findItem, ItemShape, Slot, type EquippedItems } from '../../character/catalog'
import { metricsFor, PROPORTIONS } from '../../character/proportions'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { GESTURES, REST_POSE } from '../gestures'
import { Accessory } from './character/Accessory'
import { Hair } from './character/Hair'

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
  /** Who this figure is. The dealer passes a frozen preset; the player passes their save. */
  appearance: Appearance
  /** Purchased items being worn, keyed by slot. */
  equipped?: EquippedItems | undefined
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
  /** Adds the house name badge. House employees only. */
  staff?: boolean | undefined
  /**
   * Which signal stream drives the right arm.
   *
   * Player and dealer gesture independently — during a split settlement the
   * player rakes in a winning hand while the dealer sweeps the losing one — so
   * each reads its own pair of store fields.
   *
   * The figure subscribes imperatively rather than taking a pose prop, so a
   * gesture animates without re-rendering the whole body every frame.
   */
  gestureSource?: 'player' | 'dealer' | undefined
}

/**
 * A low-poly casino figure assembled from primitives.
 *
 * Built in code rather than loaded as a rigged model for two reasons. The first
 * is the hand signals: driving named joint groups directly gives exact control
 * over a double finger-tap or a flat wave, which authoring against an imported
 * rig would not. The second arrived with the character designer — silhouette,
 * hair, garment and a dozen purchasable items combine into far more figures
 * than anyone would export by hand, and every one of them is free here.
 *
 * All measurements come from `character/proportions.ts` and all attachment
 * points from `character/anchors.ts`, both of which are pure and tested. This
 * component decides nothing about where things go; it only draws them.
 */
export function CasinoCharacter({
  appearance,
  equipped,
  speedRef,
  dealerPose = false,
  seated = false,
  staff = false,
  gestureSource,
}: CasinoCharacterProps) {
  const { silhouette, hairStyle, hair, skin, garment, colors } = resolveAppearance(appearance)
  const body = PROPORTIONS[silhouette]
  const metrics = metricsFor(silhouette)

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
    const store = gestureSource ? useBlackjackStore.getState() : null
    const activeGesture =
      gestureSource === 'dealer' ? (store?.dealerGesture ?? null) : (store?.activeGesture ?? null)
    const gestureStartedAt =
      gestureSource === 'dealer'
        ? (store?.gestureStartedAtDealer ?? 0)
        : (store?.gestureStartedAt ?? 0)

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
      const restShoulderRight = dealerPose || seated ? restShoulder : -swing

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

  const hipY = seated ? body.seatedHipY : metrics.hipY
  // Seated: thigh swings forward and the knee folds it back down.
  const thighPitch = seated ? -Math.PI / 2 : 0
  const kneePitch = seated ? Math.PI / 2 : 0

  const worn = {
    head: findItem(equipped?.[Slot.Head]),
    eyes: findItem(equipped?.[Slot.Eyes]),
    neck: findItem(equipped?.[Slot.Neck]),
    outerwear: findItem(equipped?.[Slot.Outerwear]),
    wrist: findItem(equipped?.[Slot.Wrist]),
    finger: findItem(equipped?.[Slot.Finger]),
    feet: findItem(equipped?.[Slot.Feet]),
    held: findItem(equipped?.[Slot.Held]),
  }

  /**
   * Rebases a root-frame anchor into the torso group, which sits at the hip.
   *
   * Anchors are authored and tested in the root frame; the torso is a child of
   * it. Doing the subtraction here rather than storing a second set of numbers
   * is what keeps the tested anchors and the rendered positions the same values.
   */
  const inTorso = (anchor: Anchor): [number, number, number] => [
    anchor[0],
    anchor[1] - metrics.hipY,
    anchor[2],
  ]

  /*
   * A gown brings its own floor-length skirt, so the starter dress must not
   * draw a second one underneath it. Anything shorter must not suppress it:
   * suppressing on *any* outerwear put a jacket over a cocktail dress and left
   * the character in bare legs.
   */
  const wearsSkirt = colors.hasSkirt && worn.outerwear?.shape !== ItemShape.Gown
  const legColor = colors.hasSkirt ? skin : colors.secondary

  const jacketMaterial = <meshStandardMaterial color={colors.primary} roughness={0.75} />
  const skinMaterial = <meshStandardMaterial color={skin} roughness={0.8} />

  /** One arm, from shoulder to fingertips. Refs are only wired to the right. */
  const renderArm = (side: 1 | -1) => {
    const isLeft = side === -1

    return (
      <>
        <mesh position={[0, -body.upperArm / 2, 0]} castShadow>
          <capsuleGeometry args={[0.055, body.upperArm - 0.08, 4, 8]} />
          {jacketMaterial}
        </mesh>

        {/* `null` rather than `undefined`: under exactOptionalPropertyTypes an
            explicit undefined ref is not assignable. */}
        <group ref={side === 1 ? elbowRight : null} position={[0, -body.upperArm, 0]}>
          <mesh position={[0, -body.forearm / 2, 0]} castShadow>
            <capsuleGeometry args={[0.05, body.forearm - 0.08, 4, 8]} />
            {jacketMaterial}
          </mesh>

          {/* Shirt cuff showing past the jacket sleeve. */}
          <mesh position={[0, -body.forearm + 0.03, 0]}>
            <cylinderGeometry args={[0.052, 0.052, 0.045, 8]} />
            <meshStandardMaterial color={colors.shirt} roughness={0.7} />
          </mesh>

          {/*
            Worn items go on the left arm on purpose. The right one carries the
            hand signals, and a watch or a cane whipping through a double
            finger-tap is the sort of thing nobody notices until it is recorded.
          */}
          {isLeft && worn.wrist && (
            <group name="worn:wrist" position={[0, -body.forearm + 0.03, 0]}>
              <Accessory item={worn.wrist} body={body} />
            </group>
          )}

          <group position={[0, -body.forearm, 0]}>
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

            {isLeft && worn.finger && (
              // Nudged onto a finger rather than the palm's centre line.
              <group name="worn:finger" position={[0.022, -0.06, 0.014]}>
                <Accessory item={worn.finger} body={body} />
              </group>
            )}

            {isLeft && worn.held && (
              <group name="worn:held" position={[side * 0.06, -0.09, 0.05]}>
                <Accessory item={worn.held} body={body} />
              </group>
            )}
          </group>
        </group>
      </>
    )
  }

  /** One shoe, either the garment's own or a purchased pair. */
  const renderShoe = (): ReactNode =>
    worn.feet ? (
      <group name="worn:feet" position={[0, -body.shin + 0.035, 0.05]}>
        <Accessory item={worn.feet} body={body} />
      </group>
    ) : (
      <mesh position={[0, -body.shin + 0.02, 0.05]} castShadow>
        <boxGeometry args={[0.115, 0.07, 0.22]} />
        <meshStandardMaterial color={colors.shoes} roughness={0.45} />
      </mesh>
    )

  return (
    <group ref={bodyRef}>
      {/* Legs, jointed at hip and knee so the figure can stand or sit. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * body.hipWidth, hipY, 0]}
          rotation={[thighPitch, 0, 0]}
        >
          <mesh position={[0, -body.thigh / 2, 0]} castShadow>
            <capsuleGeometry args={[0.095, body.thigh - 0.1, 4, 8]} />
            <meshStandardMaterial color={legColor} roughness={0.85} />
          </mesh>

          <group position={[0, -body.thigh, 0]} rotation={[kneePitch, 0, 0]}>
            <mesh position={[0, -body.shin / 2, 0]} castShadow>
              <capsuleGeometry args={[0.085, body.shin - 0.1, 4, 8]} />
              <meshStandardMaterial color={legColor} roughness={0.85} />
            </mesh>
            {renderShoe()}
          </group>
        </group>
      ))}

      <group position={[0, hipY, 0]}>
        {/* Torso */}
        <mesh position={[0, body.torsoHeight / 2, 0]} castShadow>
          <boxGeometry args={[body.torsoWidth, body.torsoHeight, body.torsoDepth]} />
          {jacketMaterial}
        </mesh>

        {/*
          The starter dress's or skirt's own hem. Suppressed when a gown is
          equipped, since that item draws a longer one of its own.
        */}
        {wearsSkirt && (
          <mesh position={[0, seated ? -0.06 : -0.16, 0]} castShadow>
            <cylinderGeometry
              args={[
                body.torsoWidth * 0.4,
                body.torsoWidth * 0.58,
                seated ? 0.2 : 0.38,
                14,
                1,
                true,
              ]}
            />
            <meshStandardMaterial color={colors.secondary} roughness={0.6} side={DoubleSide} />
          </mesh>
        )}

        {/*
          Shirt panel down the chest — the shirt showing between the lapels.
          Only the outfits that actually have a shirt under something: on a tee
          or a dress it reads as a bib stuck to the front of the figure.
        */}
        {(garment === Garment.Suit || garment === Garment.ShirtAndSkirt) && (
          <mesh position={[0, body.torsoHeight * 0.56, body.torsoDepth / 2 + 0.002]}>
            <boxGeometry args={[0.16, body.torsoHeight * 0.72, 0.012]} />
            <meshStandardMaterial color={colors.shirt} roughness={0.7} />
          </mesh>
        )}

        {/* Lapels and tie belong to the suit, not to a tee or a dress. */}
        {garment === Garment.Suit && (
          <>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 0.115, body.torsoHeight * 0.7, body.torsoDepth / 2 + 0.008]}
                rotation={[0, 0, side * 0.28]}
              >
                <boxGeometry args={[0.1, 0.26, 0.014]} />
                <meshStandardMaterial color={colors.primaryTrim} roughness={0.7} />
              </mesh>
            ))}

            <mesh position={[0, body.torsoHeight * 0.87, body.torsoDepth / 2 + 0.013]}>
              <boxGeometry args={[0.045, 0.05, 0.016]} />
              <meshStandardMaterial color={colors.accent} roughness={0.55} />
            </mesh>
            <mesh position={[0, body.torsoHeight * 0.6, body.torsoDepth / 2 + 0.011]}>
              <boxGeometry args={[0.052, body.torsoHeight * 0.46, 0.012]} />
              <meshStandardMaterial color={colors.accent} roughness={0.55} />
            </mesh>
          </>
        )}

        {/* Shoulder seams, catching a little more light than the garment body. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * body.torsoWidth * 0.4, body.torsoHeight * 0.93, 0]}
          >
            <boxGeometry args={[0.09, 0.05, body.torsoDepth - 0.005]} />
            <meshStandardMaterial color={colors.primaryTrim} roughness={0.7} />
          </mesh>
        ))}

        {/*
          Back of the garment: a collar band and a centre seam. The player is
          seen almost entirely from behind, so without these the figure is a
          featureless dark slab in the foreground.
        */}
        <mesh position={[0, body.torsoHeight * 0.93, -body.torsoDepth / 2 - 0.001]}>
          <boxGeometry args={[body.torsoWidth * 0.72, 0.06, 0.014]} />
          <meshStandardMaterial color={colors.primaryTrim} roughness={0.7} />
        </mesh>
        <mesh position={[0, body.torsoHeight * 0.34, -body.torsoDepth / 2 - 0.001]}>
          <boxGeometry args={[0.016, body.torsoHeight * 0.55, 0.012]} />
          <meshStandardMaterial color={colors.primaryTrim} roughness={0.7} />
        </mesh>
        {/* Shirt collar showing above the garment at the back of the neck. */}
        <mesh position={[0, body.torsoHeight + 0.012, -body.torsoDepth * 0.35]}>
          <boxGeometry args={[0.15, 0.055, 0.05]} />
          <meshStandardMaterial color={colors.shirt} roughness={0.7} />
        </mesh>

        {/* House name badge, as worn on the floor. */}
        {staff && (
          <mesh position={[-0.13, body.torsoHeight * 0.52, body.torsoDepth / 2 + 0.006]}>
            <boxGeometry args={[0.07, 0.024, 0.01]} />
            <meshStandardMaterial color="#d9c48a" roughness={0.4} metalness={0.6} />
          </mesh>
        )}

        {/* Shirt collar, two wings either side of the neck. */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.055, body.torsoHeight + 0.005, body.torsoDepth * 0.4]}
            rotation={[0, 0, side * 0.42]}
          >
            <boxGeometry args={[0.055, 0.075, 0.03]} />
            <meshStandardMaterial color={colors.shirt} roughness={0.7} />
          </mesh>
        ))}

        {/* Neck and head */}
        <mesh position={[0, body.torsoHeight + body.neckHeight / 2, 0]}>
          <cylinderGeometry args={[0.055, 0.06, body.neckHeight + 0.03, 8]} />
          {skinMaterial}
        </mesh>
        <mesh
          position={[0, body.torsoHeight + body.neckHeight + body.headHeight / 2, 0]}
          castShadow
        >
          <boxGeometry args={[body.headWidth, body.headHeight, body.headDepth]} />
          {skinMaterial}
        </mesh>

        {/* Eyes and brows. Small, but they are what stop the head reading as a
            featureless block at this distance. */}
        {[-1, 1].map((side) => {
          const eyeY = body.torsoHeight + body.neckHeight + body.headHeight * 0.62
          const faceZ = body.headDepth / 2 + 0.001

          return (
            <group key={side}>
              <mesh position={[side * 0.048, eyeY, faceZ]}>
                <boxGeometry args={[0.038, 0.022, 0.008]} />
                <meshStandardMaterial color="#f4f2ee" roughness={0.5} />
              </mesh>
              <mesh position={[side * 0.048, eyeY, faceZ + 0.005]}>
                <boxGeometry args={[0.016, 0.018, 0.008]} />
                <meshStandardMaterial color="#20161a" roughness={0.4} />
              </mesh>
              <mesh position={[side * 0.05, eyeY + 0.031, faceZ - 0.001]}>
                <boxGeometry args={[0.05, 0.014, 0.01]} />
                <meshStandardMaterial color={hair} roughness={0.9} />
              </mesh>
            </group>
          )
        })}

        {/* Nose and mouth. */}
        <mesh
          position={[
            0,
            body.torsoHeight + body.neckHeight + body.headHeight * 0.5,
            body.headDepth / 2 + 0.007,
          ]}
        >
          <boxGeometry args={[0.026, 0.045, 0.022]} />
          {skinMaterial}
        </mesh>
        <mesh
          position={[
            0,
            body.torsoHeight + body.neckHeight + body.headHeight * 0.28,
            body.headDepth / 2 + 0.001,
          ]}
        >
          <boxGeometry args={[0.05, 0.011, 0.008]} />
          <meshStandardMaterial color="#8a4f45" roughness={0.6} />
        </mesh>

        <Hair style={hairStyle} color={hair} body={body} />

        {/* Worn items that hang off the torso and head. */}
        {worn.outerwear && (
          <group name="worn:outerwear" position={inTorso(anchorFor(Slot.Outerwear, silhouette))}>
            <Accessory item={worn.outerwear} body={body} compact={seated} />
          </group>
        )}
        {worn.neck && (
          <group name="worn:neck" position={inTorso(anchorFor(Slot.Neck, silhouette))}>
            <Accessory item={worn.neck} body={body} />
          </group>
        )}
        {worn.head && (
          <group name="worn:head" position={inTorso(anchorFor(Slot.Head, silhouette))}>
            <Accessory item={worn.head} body={body} />
          </group>
        )}
        {worn.eyes && (
          <group name="worn:eyes" position={inTorso(anchorFor(Slot.Eyes, silhouette))}>
            <Accessory item={worn.eyes} body={body} />
          </group>
        )}

        {/* Arms. The right one carries the joint refs the gestures drive. */}
        <group
          ref={armLeftRef}
          position={[-body.shoulderX, metrics.shoulderYLocal, 0]}
          rotation={[0, 0, IDLE_ARM_SPLAY]}
        >
          {renderArm(-1)}
        </group>

        <group
          ref={shoulderRight}
          position={[body.shoulderX, metrics.shoulderYLocal, 0]}
          rotation={[0, 0, -IDLE_ARM_SPLAY]}
        >
          {renderArm(1)}
        </group>
      </group>
    </group>
  )
}
