import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils, Vector3 } from 'three'
import { useAppearanceStore, useFittedEquipped } from '../../store/useAppearanceStore'
import { useGameStore } from '../../store/useGameStore'
import { Control } from '../../world/controls'
import { useOrbitInput } from '../useOrbitInput'
import { setLocalTransform } from '../../net/localTransform'
import { CasinoCharacter } from './CasinoCharacter'
import { CAMERA_LOOK_HEIGHT } from '../../world/camera'

/*
 * The walking rig: a third-person character with a trailing, self-orienting
 * camera, plus whatever proximity checks the caller needs.
 *
 * Shared by the strip and the casino floor. It was the strip's alone until the
 * casino stopped being a single table and became a room you cross — and a
 * hundred and fifty lines of camera damping is exactly the sort of thing that
 * drifts apart the moment it exists twice.
 *
 * Movement is transform-based rather than physics-driven. Neither surface has
 * anything to fall off, so a physics engine would add a dependency and a pile
 * of tuning for no gain. Rapier stays scoped to the craps dice.
 */

const WALK_SPEED = 7.5

/**
 * Camera seat relative to the player, as an orbit.
 *
 * The strip's default is kept close to level on purpose. A higher, steeper seat
 * fills most of the frame with roadway; the near-horizontal view puts the
 * towers, their signage and the sky on screen, which is what the strip is worth
 * looking at. Indoors wants the opposite — see `CasinoFloorPlayer`.
 */
const DEFAULT_DISTANCE = 7.1
const DEFAULT_PITCH = 0.17

/*
 * Pitch limits. The floor is negative so the view can tilt up at the blade
 * signs overhead — they tower above the street and were previously out of
 * shot — but only just: any lower and the camera drops through the road.
 */
const MIN_PITCH = -0.1
const MAX_PITCH = 0.9
const MIN_DISTANCE = 4
const MAX_DISTANCE = 12

/**
 * How long a deliberate look-around is respected before the camera drifts back
 * behind the player. Without it, the view snaps out of your hands the moment
 * you let go of the mouse.
 */
const MANUAL_HOLD_MS = 1600

/** Exponential damping rates; higher is snappier. Frame-rate independent. */
const CAMERA_DAMPING = 6
const CAMERA_YAW_DAMPING = 2.6
const TURN_DAMPING = 14

/** Radians per second the camera orbits under manual Q/E control. */
const ORBIT_SPEED = 1.9

/**
 * Angular slack before the camera starts swinging back behind the player.
 *
 * Camera-relative input combined with a camera that chases the player's heading
 * is a feedback loop: turning moves the axes that the turn was measured
 * against, so holding a direction spins you on the spot. Only correcting the
 * *excess* beyond this dead zone breaks the loop — the camera lags through a
 * turn and settles behind afterwards.
 */
const FOLLOW_DEAD_ZONE = MathUtils.degToRad(35)

/**
 * Longest frame the walk integrates over, in seconds.
 *
 * Movement is `speed * delta`, so a single long frame moves the player by
 * however long it was — a stalled tab, a garbage-collection pause or a slow
 * machine teleports them across the map rather than slowing them down. A
 * scripted walkthrough hit this first: two seconds of held W put the player
 * past the end of the strip. Clamping trades a little lost ground on a bad
 * frame for never losing control of where you are.
 *
 * A quarter of a second, not a tenth. The tighter figure meant anyone rendering
 * below ten frames a second walked slower than intended — the game quietly got
 * harder on a weak machine — and it pinned the headless walkthrough, which runs
 * at about three, to a crawl. Four frames a second is still far below anything
 * a stall produces.
 */
const MAX_STEP_SECONDS = 0.25

/**
 * Longest distance the walk moves before checking what it has walked into.
 *
 * Obstacles are resolved by pushing the player back out of them, which only
 * works if they are *inside* one when it is checked. A frame that moves further
 * than an obstacle is deep steps clean over it and lands on the far side — the
 * player walks through a blackjack table or a row of recliners, and the slower
 * the machine the more reliably it happens.
 *
 * A quarter of a unit is comfortably under the thinnest thing in either room
 * (the clinic's desk, at 0.7 deep). This is the same class of bug the craps
 * dice have, and it has the same answer: substep rather than trust one big one.
 */
const MAX_SUBSTEP = 0.25

export interface WalkBounds {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

export interface ProximityTarget {
  readonly id: string
  readonly position: readonly [number, number, number]
  readonly radius: number
  /**
   * Stretches the target along x, making it a capsule rather than a circle.
   *
   * For things that are long: the craps rail is five metres of table, and a
   * circle big enough to be walkable into anywhere along it necessarily bulges
   * that far past both ends as well. Defaults to zero, which is a circle and is
   * what every other target is.
   */
  readonly halfLength?: number | undefined
}

/** A rectangle the player is pushed out of, such as a table. */
export interface Obstacle {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

interface WalkingPlayerProps {
  bounds: WalkBounds
  spawn: readonly [number, number, number]
  /** Runs the camera and the movement, but draws no figure. */
  hidden?: boolean | undefined
  /** Which way the character faces on arrival, in radians. */
  facing?: number | undefined
  /** Checked every frame; the nearest match is reported to `onNearest`. */
  targets?: readonly ProximityTarget[] | undefined
  /**
   * Called with the id of the nearest target in range, or `null`.
   *
   * Called from the render loop on every frame, so implementations must bail
   * out when the value has not changed rather than writing to a store.
   */
  onNearest?: ((id: string | null) => void) | undefined
  /** Rectangles the player cannot walk into. */
  obstacles?: readonly Obstacle[] | undefined
  /**
   * A second, independent set of proximity checks.
   *
   * Reported separately from `targets` because `onNearest` gives only the
   * closest match: folding the clinic's desk in with the recliners would let
   * standing near the desk suppress a chair's sit prompt. These are for things
   * that want to *notice* the player rather than offer them something.
   */
  glanceTargets?: readonly ProximityTarget[] | undefined
  onGlance?: ((id: string | null) => void) | undefined
  distance?: number | undefined
  pitch?: number | undefined
  /**
   * Keeps the camera inside a box.
   *
   * Only the indoor scenes need this. Outdoors the camera can trail as far
   * behind as it likes; in a room it ends up behind a wall, looking at the
   * back of the geometry it is supposed to be filming.
   */
  cameraBounds?:
    | { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number }
    | undefined
}

/** Wraps an angle to [-PI, PI] so turns always take the short way round. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * Pushes a point out of a rectangle along whichever axis it is least inside.
 *
 * A rectangle is enough for a table, and the shortest-axis push is what makes
 * it feel like sliding along an edge rather than being teleported around a
 * corner. Nothing in either scene is round enough to need better.
 */
function pushOut(obstacle: Obstacle, x: number, z: number): [number, number] {
  if (x <= obstacle.minX || x >= obstacle.maxX || z <= obstacle.minZ || z >= obstacle.maxZ) {
    return [x, z]
  }

  const toLeft = x - obstacle.minX
  const toRight = obstacle.maxX - x
  const toBack = z - obstacle.minZ
  const toFront = obstacle.maxZ - z
  const shortest = Math.min(toLeft, toRight, toBack, toFront)

  if (shortest === toLeft) return [obstacle.minX, z]
  if (shortest === toRight) return [obstacle.maxX, z]
  if (shortest === toBack) return [x, obstacle.minZ]
  return [x, obstacle.maxZ]
}

export function WalkingPlayer({
  bounds,
  spawn,
  hidden = false,
  facing = Math.PI,
  targets,
  onNearest,
  obstacles,
  glanceTargets,
  onGlance,
  distance = DEFAULT_DISTANCE,
  pitch = DEFAULT_PITCH,
  cameraBounds,
}: WalkingPlayerProps) {
  const groupRef = useRef<Group>(null)
  const [, getKeys] = useKeyboardControls<Control>()
  const appearance = useAppearanceStore((state) => state.appearance)
  /*
   * What is on the body, not what has been paid for.
   *
   * The shop lets anything be tried on without buying it, and the figure that
   * has to show it is this one — you walk the room in what you are trying. Away
   * from the shop the fitting is empty and this is `equipped` unchanged.
   */
  const equipped = useFittedEquipped()

  /*
   * Read once, at mount: this seeds the orbit rather than driving it.
   *
   * `?look=` writes it, and it is what lets a capture swing round to face a
   * frontage instead of seeing it at the glancing angle the play camera gives.
   * It was dropped when this rig was pulled out of `Player`, which left the
   * modifier set but never read — captures still ran and just quietly framed
   * the wrong thing.
   */
  const initialYaw = useGameStore.getState().initialCameraYaw
  // `?tilt=` overrides the scene's own pitch, and only ever does under a dev
  // deep link — it is null in every real session.
  const seededPitch = useGameStore.getState().initialCameraPitch

  // Drag to look, scroll to zoom, R to reset — the same control as the table,
  // sharing its implementation.
  const { orbit, lastInputAt } = useOrbitInput(
    { yaw: initialYaw, pitch: seededPitch ?? pitch, distance },
    {
      minPitch: MIN_PITCH,
      maxPitch: MAX_PITCH,
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      // Unbounded: the player can turn to face any direction, so the camera has
      // to be able to follow them all the way round.
      yawRange: null,
    },
  )

  // Current speed, handed to the avatar so its walk cycle can react without
  // re-rendering the figure every frame.
  const speedRef = useRef(0)

  // Scratch vectors reused every frame to keep the render loop allocation-free.
  const moveDirection = useRef(new Vector3())
  const desiredCameraPos = useRef(new Vector3())
  const lookTarget = useRef(new Vector3())

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const { forward, back, left, right, orbitLeft, orbitRight } = getKeys()

    const orbitInput = (orbitLeft ? 1 : 0) - (orbitRight ? 1 : 0)
    if (orbitInput !== 0) {
      orbit.current.yaw += orbitInput * ORBIT_SPEED * delta
      lastInputAt.current = performance.now()
    }

    const heldManually = performance.now() - lastInputAt.current < MANUAL_HOLD_MS
    const yaw = orbit.current.yaw
    const sinYaw = Math.sin(yaw)
    const cosYaw = Math.cos(yaw)

    // Movement axes derived from where the camera is looking, so "forward" is
    // always away from the viewer regardless of how far the camera has swung.
    const forwardInput = (forward ? 1 : 0) - (back ? 1 : 0)
    const rightInput = (right ? 1 : 0) - (left ? 1 : 0)

    const direction = moveDirection.current.set(
      -sinYaw * forwardInput + cosYaw * rightInput,
      0,
      -cosYaw * forwardInput - sinYaw * rightInput,
    )
    const isMoving = direction.lengthSq() > 0
    speedRef.current = isMoving ? WALK_SPEED : 0

    if (isMoving) {
      direction.normalize().multiplyScalar(WALK_SPEED * Math.min(delta, MAX_STEP_SECONDS))

      // Walked in substeps, resolving collisions after each. See `MAX_SUBSTEP`.
      const distance = Math.hypot(direction.x, direction.z)
      const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP))
      const stepX = direction.x / steps
      const stepZ = direction.z / steps

      for (let step = 0; step < steps; step++) {
        group.position.x += stepX
        group.position.z += stepZ

        group.position.x = MathUtils.clamp(group.position.x, bounds.minX, bounds.maxX)
        group.position.z = MathUtils.clamp(group.position.z, bounds.minZ, bounds.maxZ)

        // Then out of anything solid. Applied after the wall clamp so a table
        // pressed against a wall cannot push the player through it.
        if (obstacles) {
          for (const obstacle of obstacles) {
            const [pushedX, pushedZ] = pushOut(obstacle, group.position.x, group.position.z)
            group.position.x = pushedX
            group.position.z = pushedZ
          }
        }
      }

      const targetAngle = Math.atan2(direction.x, direction.z)
      const turn = wrapAngle(targetAngle - group.rotation.y)
      group.rotation.y += turn * (1 - Math.exp(-TURN_DAMPING * delta))

      // Swing back behind the player, but only past the dead zone, only while
      // walking, and only once a deliberate look-around has had its moment.
      if (!heldManually) {
        const desiredYaw = group.rotation.y + Math.PI
        const offBy = wrapAngle(desiredYaw - orbit.current.yaw)
        const excess = Math.abs(offBy) - FOLLOW_DEAD_ZONE

        if (excess > 0) {
          const correction = Math.sign(offBy) * excess
          orbit.current.yaw += correction * (1 - Math.exp(-CAMERA_YAW_DAMPING * delta))
        }
      }
    }

    /*
     * Publish where we are, for anyone else in the room.
     *
     * Written every frame into a plain mutable object rather than a store: the
     * presence sender samples it on its own much slower timer, and routing a
     * sixty-times-a-second transform through zustand would re-render the world
     * to move one figure. Costs nothing when multiplayer is off — nobody reads
     * it.
     */
    setLocalTransform(group.position.x, group.position.z, group.rotation.y, speedRef.current)

    // Trailing camera, seated on the orbit sphere around the player.
    const { pitch: orbitPitch, distance: orbitDistance } = orbit.current
    const horizontal = Math.cos(orbitPitch) * orbitDistance

    const desired = desiredCameraPos.current.set(
      group.position.x + Math.sin(orbit.current.yaw) * horizontal,
      group.position.y + CAMERA_LOOK_HEIGHT + Math.sin(orbitPitch) * orbitDistance,
      group.position.z + Math.cos(orbit.current.yaw) * horizontal,
    )
    if (cameraBounds) {
      desired.x = MathUtils.clamp(desired.x, cameraBounds.minX, cameraBounds.maxX)
      desired.z = MathUtils.clamp(desired.z, cameraBounds.minZ, cameraBounds.maxZ)
      desired.y = Math.min(desired.y, cameraBounds.maxY)
    }

    state.camera.position.lerp(desired, 1 - Math.exp(-CAMERA_DAMPING * delta))
    state.camera.lookAt(
      lookTarget.current.set(
        group.position.x,
        group.position.y + CAMERA_LOOK_HEIGHT,
        group.position.z,
      ),
    )

    /** The nearest match in range, or null. Nearest rather than first, so
        overlapping ranges resolve to the thing actually walked up to. */
    const nearestOf = (candidates: readonly ProximityTarget[]): string | null => {
      let bestId: string | null = null
      let bestGap = Infinity

      for (const target of candidates) {
        // Measured to the segment, which for a `halfLength` of zero is the
        // point itself. See `crapsPromptGap`, which applies the same rule.
        const dx = Math.max(
          0,
          Math.abs(group.position.x - target.position[0]) - (target.halfLength ?? 0),
        )
        const dz = group.position.z - target.position[2]
        const gap = Math.hypot(dx, dz)

        if (gap <= target.radius && gap < bestGap) {
          bestId = target.id
          bestGap = gap
        }
      }

      return bestId
    }

    if (onNearest) onNearest(nearestOf(targets ?? []))
    if (onGlance) onGlance(nearestOf(glanceTargets ?? []))
  })

  return (
    <group
      // Named so `npm run locate` can answer "where is the player actually
      // standing", which is otherwise unanswerable from outside the scene.
      name="player"
      ref={groupRef}
      position={[spawn[0], spawn[1], spawn[2]]}
      rotation={[0, facing, 0]}
    >
      {/*
        The rig still runs when hidden — only the figure goes.

        The welcome screen wants the play camera's framing of the street and no
        character stood in the middle of it, and those are the same object. The
        group keeps its name either way, so `npm run locate` can still answer
        where the player is.
      */}
      {!hidden && (
        <CasinoCharacter appearance={appearance} equipped={equipped} speedRef={speedRef} />
      )}
    </group>
  )
}
