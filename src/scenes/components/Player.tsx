import { useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils, Vector3 } from 'three'
import { useGameStore } from '../../store/useGameStore'
import { CASINOS, DOOR_TRIGGER_RADIUS, STREET_BOUNDS } from '../../world/casinos'
import { Control } from '../../world/controls'

const WALK_SPEED = 7.5

/**
 * Camera seat relative to the player: behind and just above head height.
 *
 * Kept close to level on purpose. A higher, steeper seat fills most of the
 * frame with roadway; the near-horizontal view puts the towers, their signage
 * and the sky on screen, which is what the strip is worth looking at.
 */
const CAMERA_OFFSET = new Vector3(0, 3.4, 7)
const CAMERA_LOOK_HEIGHT = 2.2

/** Exponential damping rates; higher is snappier. Frame-rate independent. */
const CAMERA_DAMPING = 6
const TURN_DAMPING = 14

const CAPSULE_RADIUS = 0.35
const CAPSULE_LENGTH = 1
const CAPSULE_CENTER_Y = CAPSULE_RADIUS + CAPSULE_LENGTH / 2

/** Wraps an angle to [-PI, PI] so turns always take the short way round. */
function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

/**
 * The player avatar: a grey-box capsule driven by WASD with a trailing camera.
 *
 * Movement is transform-based rather than physics-driven. The strip is flat and
 * the only interaction is walking into a doorway, so a physics engine would add
 * a dependency and a pile of tuning for no gain. Rapier arrives later scoped
 * solely to the craps dice.
 *
 * The visual is isolated in the returned `<mesh>` block so a rigged character
 * model can replace it without touching the movement or camera logic.
 */
export function Player() {
  const groupRef = useRef<Group>(null)
  const [, getKeys] = useKeyboardControls<Control>()
  const spawnPosition = useGameStore((state) => state.spawnPosition)

  // Scratch vectors reused every frame to keep the render loop allocation-free.
  const moveDirection = useRef(new Vector3())
  const desiredCameraPos = useRef(new Vector3())
  const lookTarget = useRef(new Vector3())

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const { forward, back, left, right } = getKeys()

    // Screen-relative axes: the camera never rotates, so -Z is always "away".
    const inputX = (right ? 1 : 0) - (left ? 1 : 0)
    const inputZ = (back ? 1 : 0) - (forward ? 1 : 0)

    const direction = moveDirection.current.set(inputX, 0, inputZ)
    const isMoving = direction.lengthSq() > 0

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
    }

    // Trailing camera.
    const desired = desiredCameraPos.current.copy(group.position).add(CAMERA_OFFSET)
    state.camera.position.lerp(desired, 1 - Math.exp(-CAMERA_DAMPING * delta))
    state.camera.lookAt(
      lookTarget.current.set(group.position.x, group.position.y + CAMERA_LOOK_HEIGHT, group.position.z),
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
      {/* Swap this block for the rigged character GLB; nothing above depends on it. */}
      <mesh position={[0, CAPSULE_CENTER_Y, 0]} castShadow>
        <capsuleGeometry args={[CAPSULE_RADIUS, CAPSULE_LENGTH, 8, 16]} />
        <meshStandardMaterial color="#f2f4ff" roughness={0.5} />
      </mesh>

      {/* Facing marker so the grey-box capsule visibly turns. */}
      <mesh position={[0, CAPSULE_CENTER_Y + 0.25, CAPSULE_RADIUS * 0.9]}>
        <boxGeometry args={[0.3, 0.12, 0.18]} />
        <meshBasicMaterial color="#22e0ff" toneMapped={false} />
      </mesh>
    </group>
  )
}
