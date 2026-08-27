import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  DoubleSide,
  Group,
  MathUtils,
  PerspectiveCamera as PerspectiveCameraImpl,
  Vector3,
} from 'three'
import { resolveAppearance } from '../character/appearance'
import { metricsFor } from '../character/proportions'
import { useAppearanceStore, useFittedEquipped } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { useTimeStore } from '../store/useTimeStore'
import { CasinoCharacter } from './components/CasinoCharacter'
import { useCanvasAspect } from '../world/useCanvasAspect'
import { StageLighting } from './components/StageLighting'
import { useOrbitInput } from './useOrbitInput'

/*
 * The dressing-room stage.
 *
 * There is no world here on purpose — no street, no casino, nothing to walk
 * into. The designer is a menu that happens to be rendered in 3D.
 *
 * It is a menu you can now pick up and turn, which is the change that matters.
 * It used to be a fourteen-second turntable you could only watch, and `?freeze`
 * pinned it at rotation zero — so every capture of a character in this
 * project's history was taken from the front, and the ponytail that reads as a
 * limb from behind survived months of regression shots. Drag to orbit, scroll
 * to zoom, R to reset, and `?turn=` for a capture at a fixed angle.
 */

/** Seconds for one full turn. Slow enough to read the back of an outfit. */
const TURN_PERIOD = 14

/**
 * How long after letting go before the turntable picks up again.
 *
 * Long enough to study a hat without the figure walking out from under the
 * cursor, short enough that the stage does not read as having seized. It eases
 * back in rather than snapping, for the same reason.
 */
const IDLE_BEFORE_RESUME_MS = 4000

/** How long the spin takes to come back up to speed once it does resume. */
const RESUME_RAMP_MS = 1400

const PLINTH_HEIGHT = 0.12

/**
 * Where the camera looks when it is stood well back, as a fraction of height.
 *
 * Just above the waist, so a full-length figure sits centred in frame.
 */
const FULL_LENGTH_TARGET = 0.56

/**
 * Distance at which the camera has finished rising to frame the head.
 *
 * Pulling in on a character creator should end up on the face — that is what
 * the zoom is *for*, and it is the one thing the contact sheets cannot give:
 * eight figures across a frame leaves each head about forty pixels, enough to
 * say the hair is there and not enough to say it is right. Below this the look
 * target is the head; above it, the whole figure.
 */
const HEAD_FRAMING_DISTANCE = 2.4

const ORBIT_DEFAULTS = { yaw: 0, pitch: 0.06, distance: 4.3 }
const ORBIT_LIMITS = {
  minPitch: -0.45,
  maxPitch: 0.95,
  minDistance: 1.5,
  maxDistance: 7,
  // Unbounded: the whole point is to be able to walk round the back.
  yawRange: null,
}

export function DesignerStage() {
  const appearance = useAppearanceStore((state) => state.appearance)
  /*
   * What is on the body, borrowed items included.
   *
   * It read `equipped` alone, which is why "Change your look" at the shop's
   * mirror used to strip whatever you were trying on: opening the designer
   * unmounts the shop, the fitting is handed back, and a gown you were standing
   * in vanished with no warning. The fitting survives that now, and this shows
   * it.
   */
  const equipped = useFittedEquipped()

  const initialYaw = useGameStore((state) => state.designerYaw)
  const initialPitch = useGameStore((state) => state.designerPitch)
  const initialDistance = useGameStore((state) => state.designerDistance)

  const turntable = useRef<Group>(null)
  const portrait = useCanvasAspect() < 1
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const target = useMemo(() => new Vector3(0, 1, 0), [])

  /*
   * The two heights the camera looks at, read off the figure being shown.
   *
   * Typed in, these would be two more constants that quietly disagree with
   * `proportions.ts` the next time the stylisation moves — which is exactly how
   * a pair of sunglasses ended up worn on a forehead.
   */
  const framing = useMemo(() => {
    const metrics = metricsFor(resolveAppearance(appearance).silhouette)

    return {
      full: metrics.totalHeight * FULL_LENGTH_TARGET + PLINTH_HEIGHT,
      head: metrics.headCenterY + PLINTH_HEIGHT,
    }
  }, [appearance])

  /*
   * The deep links win over the defaults, and are clamped by the same limits
   * the pointer is. A `?pitch=` outside the orbit's own range would put the
   * capture somewhere no player can reach, which makes it useless as evidence.
   */
  const defaults = useMemo(
    () => ({
      yaw: initialYaw,
      pitch:
        initialPitch === null
          ? ORBIT_DEFAULTS.pitch
          : MathUtils.clamp(initialPitch, ORBIT_LIMITS.minPitch, ORBIT_LIMITS.maxPitch),
      distance:
        initialDistance === null
          ? ORBIT_DEFAULTS.distance
          : MathUtils.clamp(
              initialDistance,
              ORBIT_LIMITS.minDistance,
              ORBIT_LIMITS.maxDistance,
            ),
    }),
    [initialYaw, initialPitch, initialDistance],
  )
  const { orbit, lastInputAt } = useOrbitInput(defaults, ORBIT_LIMITS)

  /** The turntable's own contribution, kept apart from what the pointer set. */
  const spin = useRef(0)

  useFrame((_state, delta) => {
    const camera = cameraRef.current
    if (!camera) return

    const paused = useTimeStore.getState().paused

    /*
     * `?freeze` holds the turntable as well as the clock, and holds it at
     * whatever `?turn=` asked for rather than at zero. Without this every
     * capture of this scene lands on the angle the settle delay happened to
     * reach, so two runs disagree and the regression check is worthless — the
     * same reason the clock is freezable.
     */
    if (paused) {
      spin.current = 0
    } else {
      const idleFor = performance.now() - lastInputAt.current

      if (idleFor > IDLE_BEFORE_RESUME_MS) {
        // Eases back up to speed instead of snapping into motion.
        const ramp = Math.min(1, (idleFor - IDLE_BEFORE_RESUME_MS) / RESUME_RAMP_MS)
        spin.current += ((delta * Math.PI * 2) / TURN_PERIOD) * ramp
      }
    }

    const yaw = orbit.current.yaw + spin.current
    const { pitch, distance } = orbit.current

    /*
     * The look target rises as the camera comes in.
     *
     * Held at the waist from far away and at the head up close, easing between
     * the two. Without it, zooming in on a face frames the collarbone and the
     * head leaves the top of the screen — which is what made every head-level
     * capture in the character audit a scripted drag rather than a link.
     */
    const closeness = MathUtils.clamp(
      (HEAD_FRAMING_DISTANCE - distance) /
        (HEAD_FRAMING_DISTANCE - ORBIT_LIMITS.minDistance),
      0,
      1,
    )
    target.y = MathUtils.lerp(framing.full, framing.head, closeness)

    /*
     * The camera orbits; the figure stays put.
     *
     * Turning the figure instead would turn its plinth and its lighting with
     * it, and the rim lights are what make a dark garment readable at all.
     */
    const horizontal = Math.cos(pitch) * distance
    camera.position.set(
      target.x + Math.sin(yaw) * horizontal,
      target.y + Math.sin(pitch) * distance + 0.15,
      target.z + Math.cos(yaw) * horizontal,
    )
    camera.lookAt(target)

    if (turntable.current) {
      // Held level: the figure never turns, so a gesture or a hem reads the
      // same however the camera has been moved.
      turntable.current.rotation.y = MathUtils.lerp(turntable.current.rotation.y, 0, 0.2)
    }
  })

  return (
    <>
      <color attach="background" args={['#0a0714']} />
      <fog attach="fog" args={['#0a0714', 5.5, 12]} />

      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.02, 4.3]} fov={40} />

      <StageLighting />

      {/*
        Offset right of centre, because the control panel is on the left.

        Only while it *is* on the left. On a phone the panel is a sheet across
        the bottom and the whole width is the figure's, so the same nudge just
        stands them off to one side of an empty stage.

        The plinth travels with the figure. It stood at the world origin while
        the offset was on the turntable alone, which put the character beside
        their own plinth rather than on it.
      */}
      <group position={[portrait ? 0 : 0.48, 0, 0]}>
        <group ref={turntable} position={[0, PLINTH_HEIGHT, 0]}>
          <CasinoCharacter appearance={appearance} equipped={equipped} />
        </group>

        {/* Plinth. Gives the figure somewhere to stand and catches the rim light. */}
        <mesh position={[0, PLINTH_HEIGHT / 2, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.62, 0.68, PLINTH_HEIGHT, 40]} />
          <meshStandardMaterial color="#1b1730" roughness={0.6} metalness={0.2} />
        </mesh>
        <mesh position={[0, PLINTH_HEIGHT + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.58, 0.62, 48]} />
          <meshBasicMaterial color="#ff2d95" toneMapped={false} />
        </mesh>
      </group>

      {/* Floor, dark and slightly reflective, as the reference sheet has it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#120d1f" roughness={0.42} metalness={0.35} />
      </mesh>

      {/*
        Backdrop, as a cylinder rather than a plane.
        The camera can walk all the way round now, and a flat panel behind the
        figure meant three quarters of that orbit looked out into empty fog.
      */}
      <mesh position={[0, 5, 0]}>
        <cylinderGeometry args={[9, 9, 14, 32, 1, true]} />
        <meshBasicMaterial color="#171236" side={DoubleSide} />
      </mesh>
    </>
  )
}
