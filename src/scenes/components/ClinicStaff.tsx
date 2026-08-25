import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MathUtils } from 'three'
import { NURSE_APPEARANCE, RECEPTIONIST_APPEARANCE } from '../../character/appearance'
import { useGameStore } from '../../store/useGameStore'
import { CHAIR_Z, DESK } from '../clinicLayout'
import {
  donationTimeline,
  NURSE_HOME,
  NURSE_PATROL,
  nurseStationFor,
  NurseTask,
  PATROL_LEG_MS,
  PATROL_PAUSE_MS,
} from '../clinicRoutine'
import { Gesture } from '../gestures'
import { CasinoCharacter, type ArmSignal } from './CasinoCharacter'

/*
 * The two people who work at Red River Plasma.
 *
 * Both are transform-driven, like everything else outside the craps dice. The
 * nurse's path is a lerp between waypoints rather than a physics body or a
 * navmesh — the room is a rectangle with four chairs in it, and anything more
 * would be machinery for a problem that does not exist.
 *
 * Where she walks comes from `clinicRoutine.ts`, which is pure and asserted:
 * a waypoint inside a recliner is exactly the kind of thing that looks fine
 * until she strolls through the furniture.
 */

/** How fast the staff turn to face something. Frame-rate independent. */
const TURN_DAMPING = 3.4

/** How briskly the nurse gets back to her round once she is done. */
const RETURN_MS = 2400

function lerpAngle(from: number, to: number, t: number): number {
  // Wrap the delta so a turn always takes the short way round.
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * t
}

/**
 * The receptionist, seated behind the desk.
 *
 * Faces her terminal until the player comes near, then turns to look at them —
 * the only acknowledgement anybody gets in this building.
 */
function Receptionist() {
  const groupRef = useRef<Group>(null)
  const nearDesk = useGameStore((state) => state.nearDesk)

  /** Facing the terminal, which sits across the desk from the door. */
  const atWork = Math.PI * 0.72
  /** Turned out toward whoever has just walked in. */
  const atPlayer = Math.PI * 1.02

  useFrame((_state, delta) => {
    if (!groupRef.current) return

    groupRef.current.rotation.y = lerpAngle(
      groupRef.current.rotation.y,
      nearDesk ? atPlayer : atWork,
      1 - Math.exp(-TURN_DAMPING * delta),
    )
  })

  return (
    <group name="clinic:receptionist" position={[DESK[0] + 0.1, 0, DESK[2] - 0.85]}>
      <group ref={groupRef} rotation={[0, atWork, 0]}>
        <CasinoCharacter appearance={RECEPTIONIST_APPEARANCE} seated staff />
      </group>

      {/* Her chair, which the seated pose needs something to sit on. */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[0.46, 0.06, 0.44]} />
        <meshStandardMaterial color="#3a4048" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.05, 0.16, 0.4, 8]} />
        <meshStandardMaterial color="#2a3038" roughness={0.7} metalness={0.3} />
      </mesh>
    </group>
  )
}

/**
 * The nurse.
 *
 * Walks a round when nobody needs her, comes over when somebody sits down and
 * presses Donate, swabs, sets the needle, and goes back to her round.
 *
 * Travel to a chair is a fixed *duration* rather than a fixed speed, because
 * the payout is scheduled against `donationTimeline` — at a fixed speed she
 * would still be walking when the money landed for the far chairs and be stood
 * waiting for the near ones.
 */
function Nurse() {
  const groupRef = useRef<Group>(null)
  const donation = useGameStore((state) => state.donation)
  const task = useGameStore((state) => state.nurseTask)

  const speedRef = useRef(0)
  /** Where the current leg started, and when. */
  const legFrom = useRef<[number, number]>([NURSE_HOME[0], NURSE_HOME[1]])
  const legStartedAt = useRef(performance.now())
  const patrolIndex = useRef(0)
  const lastTask = useRef(task)

  const signal = useRef<ArmSignal>({ gesture: null, startedAt: 0 })

  useFrame((_state, delta) => {
    const group = groupRef.current
    if (!group) return

    const now = performance.now()
    const timeline = donationTimeline()

    // Starting a new leg whenever the task changes keeps the eases continuous:
    // she always sets off from wherever she actually is.
    if (lastTask.current !== task) {
      legFrom.current = [group.position.x, group.position.z]
      legStartedAt.current = now
      lastTask.current = task
    }

    let target: readonly [number, number]
    let legMs: number

    if (task === NurseTask.Patrolling) {
      const here = NURSE_PATROL[patrolIndex.current % NURSE_PATROL.length] ?? NURSE_HOME
      target = here
      legMs = PATROL_LEG_MS

      // Advance to the next waypoint once she has arrived and had her beat.
      if (now - legStartedAt.current > PATROL_LEG_MS + PATROL_PAUSE_MS) {
        legFrom.current = [group.position.x, group.position.z]
        legStartedAt.current = now
        patrolIndex.current += 1
      }
    } else if (task === NurseTask.Approaching) {
      target = nurseStationFor(donation?.chair ?? 0)
      legMs = timeline.arriveAt
    } else if (task === NurseTask.Working) {
      /*
       * Working means arrived. Held rather than eased, so a scene that opens
       * straight into the draw — `?boot=drawing` — has her at the chair on the
       * first frame instead of somewhere along the walk. It also stops a slow
       * frame leaving her stranded halfway with the needle already in.
       */
      target = nurseStationFor(donation?.chair ?? 0)
      legMs = 1
    } else {
      target = NURSE_PATROL[patrolIndex.current % NURSE_PATROL.length] ?? NURSE_HOME
      legMs = RETURN_MS

      // Once she is back on her round, resume it.
      if (now - legStartedAt.current > RETURN_MS) {
        useGameStore.setState({ nurseTask: NurseTask.Patrolling })
      }
    }

    const t = Math.min(1, (now - legStartedAt.current) / legMs)
    // Ease in and out, so she does not start and stop like a lift.
    const eased = t * t * (3 - 2 * t)

    const [fromX, fromZ] = legFrom.current
    const nextX = MathUtils.lerp(fromX, target[0], eased)
    const nextZ = MathUtils.lerp(fromZ, target[1], eased)

    const movedX = nextX - group.position.x
    const movedZ = nextZ - group.position.z
    const travelled = Math.hypot(movedX, movedZ)

    group.position.x = nextX
    group.position.z = nextZ

    // Feeds the walk cycle. Below a threshold she reads as standing still,
    // which is what she should do at a waypoint and at the chair.
    speedRef.current = delta > 0 ? travelled / delta : 0

    if (travelled > 0.0004) {
      group.rotation.y = lerpAngle(
        group.rotation.y,
        Math.atan2(movedX, movedZ),
        1 - Math.exp(-TURN_DAMPING * delta),
      )
    } else if (task === NurseTask.Working && donation) {
      // Stood at the chair, she turns to face the donor rather than the wall.
      group.rotation.y = lerpAngle(
        group.rotation.y,
        -Math.PI / 2,
        1 - Math.exp(-TURN_DAMPING * delta),
      )
    }

    /*
     * The draw itself, as two gestures off the shared timeline.
     *
     * Read from the elapsed time rather than scheduled with their own timers:
     * one clock for the sequence means the arm cannot drift out of step with
     * the payout, and getting up mid-draw stops both at once.
     */
    if (donation) {
      const elapsed = now - donation.startedAt

      if (elapsed >= timeline.needleAt) {
        if (signal.current.gesture !== Gesture.InsertNeedle) {
          signal.current = { gesture: Gesture.InsertNeedle, startedAt: now }
        }
      } else if (elapsed >= timeline.swabAt) {
        if (signal.current.gesture !== Gesture.SwabArm) {
          signal.current = { gesture: Gesture.SwabArm, startedAt: now }
        }
      }
    } else if (signal.current.gesture !== null) {
      signal.current = { gesture: null, startedAt: 0 }
    }
  })

  return (
    <group
      name="clinic:nurse"
      ref={groupRef}
      position={[NURSE_HOME[0], 0, NURSE_HOME[1]]}
    >
      <CasinoCharacter
        appearance={NURSE_APPEARANCE}
        speedRef={speedRef}
        staff
        armSignal={signal}
      />
    </group>
  )
}

/**
 * The collection bag on the chair's tray, which only exists during a draw.
 *
 * Mounted and unmounted rather than hidden, so getting up mid-needle takes it
 * with you — a bag left sitting on an empty chair is worse than no bag.
 *
 * On the near end of the tray rather than the far one: the nurse works from the
 * far side and stood squarely in front of it.
 */
function DrawBag() {
  const donation = useGameStore((state) => state.donation)
  if (!donation) return null

  return (
    <group name="clinic:draw" position={[-3.55, 0.72, (CHAIR_Z[donation.chair] ?? 0) - 0.18]}>
      <mesh>
        <boxGeometry args={[0.15, 0.2, 0.07]} />
        <meshStandardMaterial color="#8f1f2c" roughness={0.4} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.07, 0.05, 0.05]} />
        <meshStandardMaterial color="#cfd8de" roughness={0.5} />
      </mesh>
    </group>
  )
}

export function ClinicStaff() {
  return (
    <>
      <Receptionist />
      <Nurse />
      <DrawBag />
    </>
  )
}
