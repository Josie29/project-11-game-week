import { RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Euler, Group, Quaternion } from 'three'
import type { DiceRoll } from '../../games/craps/types'
import {
  DICE_REST_POSITIONS,
  DICE_THROW_ORIGINS,
  DICE_THROW_VELOCITIES,
  DIE_HALF,
} from '../crapsTableLayout'
import { DIE_FACE_VALUES, FACE_UP_ROTATIONS, getDieFaceTexture } from '../diceTexture'

/*
 * Where the dice start, where they rest and how hard they are thrown all live
 * in `../crapsTableLayout`, where they are asserted against the pit. They are
 * pit-relative in a way that is easy to miss: resizing the table is precisely
 * the change that buries a resting die in a bumper, and a die inside a wall is
 * a die that is simply not there.
 */
const DIE_SIZE = DIE_HALF * 2

/** Give up waiting for the tumble to settle after this long. */
const MAX_TUMBLE_MS = 2200

/** Below this speed the dice are treated as at rest. */
const REST_SPEED = 0.35

/** How quickly a settled die turns to show its face. */
const SETTLE_DAMPING = 9

interface CrapsDiceProps {
  /** The roll to display, or null before the first throw. */
  roll: DiceRoll | null
  /** Increments on every throw, which is what restarts the tumble. */
  rollId: number
}

/**
 * Two dice, thrown with physics and landed on the result the engine chose.
 *
 * The engine is the authority on what was rolled — it is pure, seeded and
 * tested, and reading a value back off a physics body would make the money
 * depend on a simulation. So the tumble is real and the landing is directed:
 * once the dice come to rest they turn to show the faces that were already
 * decided. Fast enough that the correction is not visible, and it means the
 * dice can never disagree with the payout.
 */
export function CrapsDice({ roll, rollId }: CrapsDiceProps) {
  const bodyA = useRef<RapierRigidBody>(null)
  const bodyB = useRef<RapierRigidBody>(null)
  const visualA = useRef<Group>(null)
  const visualB = useRef<Group>(null)

  const bodies = [bodyA, bodyB] as const
  const visuals = [visualA, visualB] as const

  const startedAt = useRef(0)
  const [settled, setSettled] = useState(true)

  useEffect(() => {
    if (rollId === 0) return

    startedAt.current = performance.now()
    setSettled(false)

    bodies.forEach((body, index) => {
      const rigid = body.current
      if (!rigid) return

      const origin = DICE_THROW_ORIGINS[index] ?? DICE_THROW_ORIGINS[0]!
      const velocity = DICE_THROW_VELOCITIES[index] ?? DICE_THROW_VELOCITIES[0]!

      // Reset, then throw down-table with a tumble on every axis.
      rigid.setTranslation({ x: origin[0], y: origin[1], z: origin[2] }, true)
      rigid.setLinvel({ x: 0, y: 0, z: 0 }, true)
      rigid.setAngvel({ x: 0, y: 0, z: 0 }, true)
      rigid.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)

      /*
       * Velocity, not impulse. A 0.16 cube at rapier's default density masses
       * about four grams, so an impulse of the magnitude that looks reasonable
       * on paper accelerates it to several hundred metres per second and the
       * dice leave the table before the first frame renders. Setting velocity
       * directly is mass-independent and lands in a range you can reason about.
       */
      rigid.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, true)
      // Tumbling mostly about the axes across the throw, so the dice roll along
      // their travel rather than spinning on the spot like a coin.
      rigid.setAngvel({ x: -6 - index * 2, y: -9 + index * 3, z: -17 + index * 4 }, true)
    })
    // Bodies live in refs, so the throw depends only on the roll counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId])

  useFrame((_state, delta) => {
    if (!settled) {
      const elapsed = performance.now() - startedAt.current
      const stopped = bodies.every((body) => {
        const rigid = body.current
        if (!rigid) return false
        const velocity = rigid.linvel()
        return Math.hypot(velocity.x, velocity.y, velocity.z) < REST_SPEED
      })

      // Only trust stillness once the dice have had time to actually travel.
      if ((stopped && elapsed > 700) || elapsed > MAX_TUMBLE_MS) {
        setSettled(true)
        bodies.forEach((body) => body.current?.sleep())
      }
      return
    }

    if (!roll) return

    // Turn each die to the face the engine rolled. Applied to the mesh inside
    // the body, so the physics transform still supplies the resting position.
    const values = [roll.first, roll.second]
    visuals.forEach((visual, index) => {
      const group = visual.current
      const body = bodies[index]?.current
      const value = values[index]
      if (!group || !body || value === undefined) return

      const target = FACE_UP_ROTATIONS[value] ?? [0, 0, 0]
      // Counter the body's own rotation, so the face ends up level with the
      // felt rather than level with however the die happened to land.
      const bodyRotation = body.rotation()
      const inverse = new Quaternion(
        bodyRotation.x,
        bodyRotation.y,
        bodyRotation.z,
        bodyRotation.w,
      ).invert()
      const desired = inverse.multiply(
        new Quaternion().setFromEuler(new Euler(target[0], target[1], target[2])),
      )

      group.quaternion.slerp(desired, 1 - Math.exp(-SETTLE_DAMPING * delta))
    })
  })

  return (
    <>
      {[bodyA, bodyB].map((body, index) => (
        <RigidBody
          key={index}
          ref={body}
          colliders="cuboid"
          // Continuous collision detection: a die is small and fast enough to
          // step past a wall between frames without it.
          ccd
          restitution={0.42}
          friction={0.85}
          linearDamping={0.35}
          angularDamping={0.4}
          position={[...(DICE_REST_POSITIONS[index] ?? DICE_REST_POSITIONS[0]!)]}
        >
          <group ref={index === 0 ? visualA : visualB} name={`craps-die-${index}`}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
              {DIE_FACE_VALUES.map((value, face) => (
                <meshStandardMaterial
                  key={face}
                  attach={`material-${face}`}
                  map={getDieFaceTexture(value)}
                  roughness={0.3}
                  metalness={0.05}
                />
              ))}
            </mesh>
          </group>
        </RigidBody>
      ))}
    </>
  )
}

