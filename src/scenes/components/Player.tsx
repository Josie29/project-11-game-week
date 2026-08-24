import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils, Vector3 } from 'three'
import { useGameStore } from '../../store/useGameStore'
import { CASINOS, DOOR_TRIGGER_RADIUS, STREET_BOUNDS } from '../../world/casinos'
import { Control } from '../../world/controls'
import { CasinoCharacter, Outfit } from './CasinoCharacter'

const WALK_SPEED = 7.5

/**
 * Camera seat relative to the player: behind and just above head height.
 *
 * Kept close to level on purpose. A higher, steeper seat fills most of the
 * frame with roadway; the near-horizontal view puts the towers, their signage
 * and the sky on screen, which is what the strip is worth looking at.
 */
const CAMERA_DISTANCE = 7
const CAMERA_HEIGHT = 3.4
const CAMERA_LOOK_HEIGHT = 2.2

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

/** Wraps an angle to [-PI, PI] so turns always take the short way round. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * The player avatar: a walking character with a trailing, self-orienting camera.
 *
 * Movement is transform-based rather than physics-driven. The strip is flat and
 * the only interaction is walking into a doorway, so a physics engine would add
 * a dependency and a pile of tuning for no gain. Rapier stays scoped to craps.
 */
export function Player() {
  const groupRef = useRef<Group>(null)
  const [, getKeys] = useKeyboardControls<Control>()
  const spawnPosition = useGameStore((state) => state.spawnPosition)

  /** Direction the camera looks, as a yaw about Y. Zero looks down -Z. */
  const cameraYaw = useRef(0)

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
      cameraYaw.current += orbitInput * ORBIT_SPEED * delta
    }

    const yaw = cameraYaw.current
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
      direction.normalize().multiplyScalar(WALK_SPEED * delta)
      group.position.x += direction.x
      group.position.z += direction.z

      // Clamp rather than collide — the street is a corridor with no obstacles.
      group.position.x = MathUtils.clamp(group.position.x, STREET_BOUNDS.minX, STREET_BOUNDS.maxX)
      group.position.z = MathUtils.clamp(group.position.z, STREET_BOUNDS.minZ, STREET_BOUNDS.maxZ)

      const targetAngle = Math.atan2(direction.x, direction.z)
      const turn = wrapAngle(targetAngle - group.rotation.y)
      group.rotation.y += turn * (1 - Math.exp(-TURN_DAMPING * delta))

      // Swing back behind the player, but only past the dead zone and only
      // while walking, so standing still never drifts the view.
      if (orbitInput === 0) {
        const desiredYaw = group.rotation.y + Math.PI
        const offBy = wrapAngle(desiredYaw - cameraYaw.current)
        const excess = Math.abs(offBy) - FOLLOW_DEAD_ZONE

        if (excess > 0) {
          const correction = Math.sign(offBy) * excess
          cameraYaw.current += correction * (1 - Math.exp(-CAMERA_YAW_DAMPING * delta))
        }
      }
    }

    // Trailing camera, seated on the orbit circle at the current yaw.
    const desired = desiredCameraPos.current.set(
      group.position.x + Math.sin(cameraYaw.current) * CAMERA_DISTANCE,
      group.position.y + CAMERA_HEIGHT,
      group.position.z + Math.cos(cameraYaw.current) * CAMERA_DISTANCE,
    )
    state.camera.position.lerp(desired, 1 - Math.exp(-CAMERA_DAMPING * delta))
    state.camera.lookAt(
      lookTarget.current.set(
        group.position.x,
        group.position.y + CAMERA_LOOK_HEIGHT,
        group.position.z,
      ),
    )

    // Door proximity. Reads the store imperatively so the render loop never
    // subscribes to state and re-renders on every frame.
    const store = useGameStore.getState()
    let nearest = null

    for (const casino of CASINOS) {
      const [doorX, , doorZ] = casino.doorPosition
      const dx = group.position.x - doorX
      const dz = group.position.z - doorZ

      if (Math.hypot(dx, dz) <= DOOR_TRIGGER_RADIUS) {
        nearest = casino
        break
      }
    }

    store.setNearbyCasino(nearest?.id ?? null)

    if (nearest?.available) {
      store.enterCasino(nearest.id)
    }
  })

  return (
    <group
      ref={groupRef}
      position={[spawnPosition[0], spawnPosition[1], spawnPosition[2]]}
      // Start facing down the street (-Z) rather than back at the camera.
      rotation={[0, Math.PI, 0]}
    >
      <CasinoCharacter outfit={Outfit.Player} speedRef={speedRef} />
    </group>
  )
}
