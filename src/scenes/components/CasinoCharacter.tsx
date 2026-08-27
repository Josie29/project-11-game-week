import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Group, MathUtils } from 'three'
import { anchorFor, type Anchor } from '../../character/anchors'
import { resolveAppearance, type Appearance } from '../../character/appearance'
import {
  footParts,
  forearmParts,
  gripSeat,
  handParts,
  ringSeat,
  shinParts,
  thighParts,
  torsoParts,
  upperArmParts,
  type BodyOptions,
} from '../../character/bodyParts'
import { findItem, ItemShape, Slot, type EquippedItems } from '../../character/catalog'
import { figurePalette } from '../../character/partPalette'
import {
  metricsFor,
  PROPORTIONS,
  SEATED_LEG_PITCH,
  SeatedLegs,
} from '../../character/proportions'
import { useBlackjackStore } from '../../store/useBlackjackStore'
import { GESTURES, Gesture, REST_POSE } from '../gestures'
import { Accessory } from './character/Accessory'
import { Hair } from './character/Hair'
import { Parts } from './character/Parts'

/** Mirrors a seat authored on the right hand onto whichever hand wears it. */
function sideways(seat: readonly [number, number, number], side: 1 | -1): [number, number, number] {
  return [side * seat[0], seat[1], seat[2]]
}

/** A gesture and when it started, for a caller driving an arm themselves. */
export interface ArmSignal {
  readonly gesture: Gesture | null
  readonly startedAt: number
}

/**
 * How far the arms hang out from the body at rest.
 *
 * The sign matters and was inverted. Rotating a limb about Z by a positive
 * angle moves a point hanging below the joint toward +x, so the *right* arm
 * needs a positive roll to swing outward and the left a negative one — and the
 * rig had exactly the opposite. Both arms swung seven centimetres inward, which
 * put both hands inside the hips: the figure read as having no hands at all,
 * and `npm run locate` found them buried rather than missing.
 *
 * `REST_POSE.shoulderRoll` in `gestures.ts` has to agree, or the arm pops
 * across the body the instant a gesture finishes.
 */
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
  /** Sits the figure down: hips dropped to seat height, thighs forward. */
  seated?: boolean | undefined
  /**
   * How the legs are arranged once seated. Ignored when standing.
   *
   * Defaults to the stool, which is what every seat in the game was until the
   * clinic got recliners. See `SeatedLegs`.
   */
  legs?: SeatedLegs | undefined
  /** Adds the house name badge. House employees only. */
  staff?: boolean | undefined
  /**
   * Renders the figure as a shop-window dummy: one neutral form colour, no
   * face, no hair.
   *
   * The clothes are the point in a display window, and a mannequin with eyes
   * and a haircut reads as a person standing very still behind the glass.
   */
  mannequin?: boolean | undefined
  /**
   * Which signal stream drives the right arm.
   *
   * Player and dealer gesture independently — during a split settlement the
   * player rakes in a winning hand while the dealer sweeps the losing one — so
   * each reads its own pair of store fields.
   */
  gestureSource?: 'player' | 'dealer' | undefined
  /**
   * Drives the right arm directly, instead of from a store.
   *
   * A ref rather than a value, for the same reason `speedRef` is one: the frame
   * loop reads it every frame, and a plain prop would be whatever it was at the
   * last render — so a caller that changes it without re-rendering, which is the
   * entire point, would never be seen.
   */
  armSignal?: RefObject<ArmSignal> | undefined
}

/**
 * A casino figure assembled from primitives.
 *
 * Built in code rather than loaded as a rigged model for two reasons. The first
 * is the hand signals: driving named joint groups directly gives exact control
 * over a double finger-tap or a flat wave, which authoring against an imported
 * rig would not. The second arrived with the character designer — silhouette,
 * hair, garment and a dozen purchasable items combine into far more figures
 * than anyone would export by hand, and every one of them is free here.
 *
 * This component decides nothing about what the figure looks like. Measurements
 * come from `character/proportions.ts`, attachment points from
 * `character/anchors.ts`, and — since the rebuild — every shape from
 * `character/bodyParts.ts`, `hairParts.ts` and `itemParts.ts`. All of those are
 * pure and asserted. What is left here is the joint hierarchy and the animation
 * that drives it, which is the part a test cannot hold.
 */
export function CasinoCharacter({
  appearance,
  equipped,
  speedRef,
  dealerPose = false,
  seated = false,
  legs = SeatedLegs.Hanging,
  staff = false,
  mannequin = false,
  gestureSource,
  armSignal,
}: CasinoCharacterProps) {
  const resolved = resolveAppearance(appearance)
  const { silhouette, hairStyle, hair, colors } = resolved
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
    const signalled = armSignal?.current ?? null
    const store = gestureSource && !signalled ? useBlackjackStore.getState() : null
    const activeGesture = signalled
      ? signalled.gesture
      : gestureSource === 'dealer'
        ? (store?.dealerGesture ?? null)
        : (store?.activeGesture ?? null)
    const gestureStartedAt = signalled
      ? signalled.startedAt
      : gestureSource === 'dealer'
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
        driven ? pose.shoulderRoll : IDLE_ARM_SPLAY,
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
  /*
   * Seated: the thigh swings forward and the knee decides what happens next —
   * folded back down for a stool, barely bent for a recliner's footrest. The
   * angles live in `proportions.ts` so `seatedAnklePosition` can be held against
   * the furniture the legs are supposed to land on.
   */
  const seatPitch = SEATED_LEG_PITCH[legs]
  const thighPitch = seated ? seatPitch.thigh : 0
  const kneePitch = seated ? seatPitch.knee : 0
  const anklePitch = seated ? seatPitch.ankle : 0

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

  /*
   * A gown brings its own floor-length skirt, so the starter dress must not
   * draw a second one underneath it. Anything shorter must not suppress it:
   * suppressing on *any* outerwear put a jacket over a cocktail dress and left
   * the character in bare legs.
   */
  const options = useMemo<BodyOptions>(
    () => ({
      garment: resolved.garment,
      hasSkirt: colors.hasSkirt,
      seated,
      staff,
      mannequin,
      suppressSkirt: worn.outerwear?.shape === ItemShape.Gown,
      // A bought jacket or gown covers the starter garment's shirt and tie.
      coveredByOuterwear: worn.outerwear !== null,
      bareArms: worn.outerwear?.shape === ItemShape.Gown,
      // A solid lens is over them; drawing eyes behind it only invites the two
      // to fight for the same millimetre of face.
      eyesCovered: worn.eyes !== null,
    }),
    [resolved.garment, colors.hasSkirt, seated, staff, mannequin, worn.outerwear, worn.eyes],
  )

  const palette = useMemo(() => figurePalette(resolved, mannequin), [resolved, mannequin])

  /*
   * The arms take the jacket's colour when one is worn.
   *
   * Outerwear is a torso item — it has no sleeves of its own, because the arms
   * are separate animated segments. Left alone, an ivory tuxedo came out ivory
   * from the waist up and charcoal down both arms, which reads as a waistcoat
   * over someone else's suit. A gown is the other case and is handled by
   * `bareArms` above: it is sleeveless, so the arm shows skin.
   */
  const armPalette = useMemo(() => {
    const jacket = worn.outerwear?.shape === ItemShape.Jacket ? worn.outerwear : null
    if (!jacket) return palette

    return { ...palette, primary: jacket.colors.primary, shirt: palette.shirt }
  }, [palette, worn.outerwear])

  const torso = useMemo(() => torsoParts(body, options), [body, options])
  const thigh = useMemo(() => thighParts(body, options), [body, options])
  const shin = useMemo(() => shinParts(body, options), [body, options])
  const foot = useMemo(() => footParts(body), [body])
  const upperArm = useMemo(() => upperArmParts(body, options), [body, options])
  const forearm = useMemo(() => forearmParts(body, options), [body, options])

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

  /** One arm, from shoulder to fingertips. Refs are only wired to the right. */
  const renderArm = (side: 1 | -1): ReactNode => {
    const isLeft = side === -1

    return (
      <>
        <Parts parts={upperArm} palette={armPalette} namePrefix={`arm${side}`} />

        {/* `null` rather than `undefined`: under exactOptionalPropertyTypes an
            explicit undefined ref is not assignable. */}
        <group ref={side === 1 ? elbowRight : null} position={[0, -body.upperArm, 0]}>
          <Parts parts={forearm} palette={armPalette} namePrefix={`forearm${side}`} />

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

          <group name={`hand:${side === 1 ? 'right' : 'left'}`} position={[0, -body.forearm, 0]}>
            <Parts parts={handParts(side, body)} palette={palette} namePrefix={`hand${side}`} />

            {/*
              Both of these read their seat off `bodyParts.ts` rather than
              carrying a hand-typed triple. They used to carry one, written
              against a hand a third smaller than the restyle produced: the
              signet ring rendered as a white disc in the middle of the palm and
              the cane's knob sat beside an open hand rather than in it.
              `anchorFor` is derived from the same two functions, so the tested
              anchor and the rendered position cannot drift apart.
            */}
            {isLeft && worn.finger && (
              <group name="worn:finger" position={sideways(ringSeat(body), side)}>
                <Accessory item={worn.finger} body={body} />
              </group>
            )}

            {isLeft && worn.held && (
              <group name="worn:held" position={sideways(gripSeat(body), side)}>
                <Accessory item={worn.held} body={body} />
              </group>
            )}
          </group>
        </group>
      </>
    )
  }

  /*
   * One shoe, either the garment's own or a purchased pair — in the ankle's
   * frame, not the knee's.
   *
   * The offsets used to carry `-body.shin` so they read from the shin group's
   * own origin, which is the knee. That is fine while the ankle never bends —
   * and the moment it did, rotating the foot swung it through an arc a whole
   * shin long instead of turning it on the spot, which put both shoes inside
   * the footrest cushion. `footParts` is authored about the ankle for the same
   * reason, so these are small numbers about a foot rather than large ones
   * about a leg.
   */
  const renderShoe = (side: number): ReactNode =>
    worn.feet ? (
      <group name="worn:feet" position={[0, 0.035, 0.05]}>
        <Accessory item={worn.feet} body={body} />
      </group>
    ) : (
      <Parts parts={foot} palette={palette} namePrefix={`foot${side}`} />
    )

  return (
    <group ref={bodyRef}>
      {/* Legs, jointed at hip and knee so the figure can stand or sit. */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * body.hipWidth, hipY, 0]} rotation={[thighPitch, 0, 0]}>
          <Parts parts={thigh} palette={palette} namePrefix={`thigh${side}`} />

          <group position={[0, -body.thigh, 0]} rotation={[kneePitch, 0, 0]}>
            <Parts parts={shin} palette={palette} namePrefix={`shin${side}`} />

            {/*
              A bought pair of shoes replaces the bare foot rather than sitting
              over it, and both hang off the ankle so they turn with it.
            */}
            <group position={[0, -body.shin, 0]} rotation={[anklePitch, 0, 0]}>
              {renderShoe(side)}
            </group>
          </group>
        </group>
      ))}

      <group position={[0, hipY, 0]}>
        <Parts parts={torso} palette={palette} namePrefix="body" />

        {/*
          Hair, in the head's own frame — origin at the centre of the skull.
          A dummy has none, for the same reason it has no face.
        */}
        {!mannequin && (
          <group
            name="hair"
            position={[0, body.torsoHeight + body.neckHeight + body.headHeight / 2, 0]}
          >
            <Hair style={hairStyle} color={hair} body={body} />
          </group>
        )}

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
          rotation={[0, 0, -IDLE_ARM_SPLAY]}
        >
          {renderArm(-1)}
        </group>

        <group
          ref={shoulderRight}
          position={[body.shoulderX, metrics.shoulderYLocal, 0]}
          rotation={[0, 0, IDLE_ARM_SPLAY]}
        >
          {renderArm(1)}
        </group>
      </group>
    </group>
  )
}
