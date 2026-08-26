import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { CatmullRomCurve3, Group, MathUtils, Mesh, TubeGeometry, Vector3 } from 'three'
import { NURSE_APPEARANCE, RECEPTIONIST_APPEARANCE, resolveAppearance } from '../../character/appearance'
import { PROPORTIONS } from '../../character/proportions'
import { useGameStore } from '../../store/useGameStore'
import { useTimeStore } from '../../store/useTimeStore'
import {
  DRAW_LINE_PATH,
  ivBagAt,
  RECEPTION_CHAIR,
  receptionFootringY,
} from '../clinicLayout'
import {
  donationTimeline,
  drawProgress,
  frozenDrawElapsed,
  NURSE_HOME,
  NURSE_PATROL,
  nurseStationFor,
  NurseTask,
  PATROL_LEG_MS,
  PATROL_PAUSE_MS,
} from '../clinicRoutine'
import { GESTURES, Gesture } from '../gestures'
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

  /*
   * Her chair, sized from her.
   *
   * `seatHeight` is her hip height, which the rig sets from `seatedHipY`, and
   * `footringY` is where her feet actually finish. Both are derived rather than
   * typed, because a ring drawn at a guessed height is a ring her shoes hang
   * above — which is the bug this chair replaced.
   */
  const seatHeight = PROPORTIONS[resolveAppearance(RECEPTIONIST_APPEARANCE).silhouette].seatedHipY
  const footringY = receptionFootringY()

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
    <group name="clinic:receptionist" position={[RECEPTION_CHAIR[0], 0, RECEPTION_CHAIR[1]]}>
      <group ref={groupRef} rotation={[0, atWork, 0]}>
        {/*
          A draughtsman's chair, because this desk is counter height.

          She used to sit on a box on a cone with her feet dangling in mid-air.
          Dropping her to a task chair fixes the dangle and breaks something
          worse — at that height her head clears the transaction counter by two
          centimetres, so the person you have come to talk to is a hairstyle
          behind a worktop. The seat height was never the problem. The footring
          under her feet was missing.
        */}
        <CasinoCharacter appearance={RECEPTIONIST_APPEARANCE} seated staff />

        {/*
          The half of the chair that swivels with her: seat, back and arms.

          The base below does not, because a task chair's castors stay put while
          its occupant turns — and she turns every time the player walks up.
        */}
        <mesh position={[0, seatHeight - 0.075, 0.01]} castShadow>
          <boxGeometry args={[0.46, 0.09, 0.46]} />
          <meshStandardMaterial color="#39404a" roughness={0.75} />
        </mesh>
        <mesh position={[0, seatHeight + 0.02, -0.24]}>
          <boxGeometry args={[0.08, 0.16, 0.1]} />
          <meshStandardMaterial color="#2a3038" roughness={0.6} />
        </mesh>
        <mesh position={[0, seatHeight + 0.28, -0.28]} rotation={[-0.16, 0, 0]} castShadow>
          <boxGeometry args={[0.44, 0.5, 0.08]} />
          <meshStandardMaterial color="#39404a" roughness={0.75} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.27, seatHeight + 0.11, -0.02]}>
            <boxGeometry args={[0.06, 0.05, 0.3]} />
            <meshStandardMaterial color="#2a3038" roughness={0.7} />
          </mesh>
        ))}
      </group>

      {/* Five-star base on castors, and the gas lift. Both stay where they are. */}
      {[0, 1, 2, 3, 4].map((spoke) => (
        <group key={spoke} rotation={[0, (spoke / 5) * Math.PI * 2, 0]}>
          <mesh position={[0, 0.055, 0.13]}>
            <boxGeometry args={[0.045, 0.03, 0.26]} />
            <meshStandardMaterial color="#23282e" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.028, 0.26]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.028, 0.028, 0.022, 10]} />
            <meshStandardMaterial color="#15181c" roughness={0.8} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, seatHeight * 0.42, 0]}>
        <cylinderGeometry args={[0.032, 0.045, seatHeight * 0.84, 10]} />
        <meshStandardMaterial color="#3c434b" roughness={0.45} metalness={0.5} />
      </mesh>

      {/*
        The footring, at exactly the height her shoes finish.

        `receptionFootringY` derives it from her own leg rather than from a
        number typed here, which is the entire point: a ring at a guessed height
        is a ring her feet hang above, and that is indistinguishable from having
        no ring at all.
      */}
      <mesh position={[0, footringY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.26, 0.014, 6, 20]} />
        <meshStandardMaterial color="#9aa3ab" roughness={0.35} metalness={0.55} />
      </mesh>
      {[0, 1, 2, 3].map((strut) => (
        <group key={strut} rotation={[0, (strut / 4) * Math.PI * 2 + Math.PI / 4, 0]}>
          <mesh position={[0, footringY, 0.13]}>
            <boxGeometry args={[0.02, 0.016, 0.26]} />
            <meshStandardMaterial color="#9aa3ab" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
      ))}
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

    /*
     * Where she is looking, decided by what she is doing rather than by whether
     * she happened to move this frame.
     *
     * Working used to be the `else` of "did she travel", which meant the single
     * big step onto the station counted as travel and left her facing the way
     * she arrived — turned out into the room, reaching at nothing, while the
     * panel said she was drawing blood.
     */
    if (task === NurseTask.Working) {
      /*
       * Snapped square to the chair, not eased into it.
       *
       * Working is a held state she arrives already turned for, and easing made
       * the facing depend on how many frames elapsed — at the three frames a
       * second headless rendering manages, she was still side-on to the donor
       * when the screenshot was taken, reaching at nothing.
       */
      group.rotation.y = -Math.PI / 2
    } else if (travelled > 0.0004) {
      group.rotation.y = lerpAngle(
        group.rotation.y,
        Math.atan2(movedX, movedZ),
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
      const elapsed = elapsedSince(donation.startedAt)
      const wanted =
        elapsed >= timeline.needleAt
          ? Gesture.InsertNeedle
          : elapsed >= timeline.swabAt
            ? Gesture.SwabArm
            : null

      /*
       * Under `?freeze` the gesture is re-stamped every frame at a fixed offset
       * so the arm holds one pose.
       *
       * Otherwise a frozen capture still runs the gesture clock: the arm
       * reaches, finishes and drops back to her side while the bag is
       * supposedly still filling, and which of those the screenshot catches
       * depends on how long the page took to load.
       */
      const frozen = useTimeStore.getState().paused

      if (wanted !== null && (frozen || signal.current.gesture !== wanted)) {
        const hold = frozen ? GESTURES[wanted].durationMs * 0.5 : 0
        signal.current = { gesture: wanted, startedAt: now - hold }
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
 * How far into a draw we are, holding still under `?freeze`.
 *
 * Both the bag's level and the nurse's gestures read from this, so a frozen
 * capture shows the same frame every time and the two cannot disagree about
 * where the procedure has got to.
 */
function elapsedSince(startedAt: number): number {
  return useTimeStore.getState().paused ? frozenDrawElapsed() : performance.now() - startedAt
}

/** Outside dimensions of the collection bag. */
const BAG_WIDTH = 0.15
const BAG_HEIGHT = 0.2
const BAG_DEPTH = 0.07

/**
 * The line from the donor's arm up to the bag on the stand.
 *
 * Drawn as a tube along a curve rather than a straight cylinder: a taut line
 * between two points reads as a strut, and the slack is the only thing that says
 * this is soft tubing. Points are local to the bag.
 *
 * The route matters as much as the shape. Two earlier versions were geometrically
 * fine and invisible: the first sagged straight down into the tray mesh, and the
 * second, which arced above it, ran from the arm to a bag sitting a few
 * centimetres away — almost exactly along the camera's own axis, so a line 65 cm
 * long projected to about nine pixels and read as a red post standing on the
 * tray. Hanging the bag on the stand is what fixes it: the line now crosses most
 * of the frame diagonally, and nothing about it depends on the viewing angle.
 */
const LINE_PATH = new CatmullRomCurve3(
  DRAW_LINE_PATH.map(([x, y, z]) => new Vector3(x, y, z)),
)

/**
 * The collection bag on the chair's IV stand, and the line running to it.
 *
 * Mounted and unmounted with the draw rather than hidden, so getting up
 * mid-needle takes it with you — a bag left hanging over an empty chair is
 * worse than no bag.
 *
 * It hangs exactly where the stand's own bag does, and `Recliner` takes that one
 * down for the duration. Two bags on one pole reads as a mistake, and the swap
 * is what lets the line be long enough to see.
 */
function DrawBag() {
  const donation = useGameStore((state) => state.donation)

  const shellRef = useRef<Group>(null)
  const fillRef = useRef<Mesh>(null)

  const line = useMemo(() => new TubeGeometry(LINE_PATH, 20, 0.019, 6, false), [])

  useFrame(() => {
    if (!donation) return

    const elapsed = elapsedSince(donation.startedAt)
    const { needleAt } = donationTimeline()

    /*
     * Nothing is hung until the needle is actually in.
     *
     * The bag used to appear the moment Donate was pressed — full, while the
     * nurse was still walking over — which gave away that it was a prop rather
     * than the thing being filled.
     */
    if (shellRef.current) shellRef.current.visible = elapsed >= needleAt

    if (fillRef.current) {
      const progress = drawProgress(elapsed)

      // Grown from the bottom: scaling a centred box stretches it both ways, so
      // the base has to be walked down by half of whatever it gained.
      fillRef.current.scale.y = Math.max(0.0001, progress)
      fillRef.current.position.y = -BAG_HEIGHT / 2 + (BAG_HEIGHT * progress) / 2
    }
  })

  if (!donation) return null

  return (
    <group
      name="clinic:draw"
      ref={shellRef}
      visible={false}
      position={[...ivBagAt(donation.chair)]}
    >
      {/* The empty pouch: near-clear, so what is in it is the only thing read. */}
      <mesh>
        <boxGeometry args={[BAG_WIDTH, BAG_HEIGHT, BAG_DEPTH]} />
        <meshStandardMaterial
          color="#dbe6ee"
          roughness={0.25}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>

      {/* What has been drawn so far. Starts at nothing and rises. */}
      <mesh ref={fillRef} position={[0, -BAG_HEIGHT / 2, 0]}>
        <boxGeometry args={[BAG_WIDTH - 0.012, BAG_HEIGHT, BAG_DEPTH - 0.008]} />
        <meshStandardMaterial color="#8f1f2c" roughness={0.35} />
      </mesh>

      {/* The hook it hangs by, over the top of the stand. */}
      <mesh position={[0, BAG_HEIGHT / 2 + 0.04, 0]}>
        <boxGeometry args={[0.05, 0.08, 0.04]} />
        <meshStandardMaterial color="#cfd8de" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Thick enough to read. At a realistic gauge it was two pixels wide and
          might as well not have been drawn. */}
      <mesh geometry={line}>
        <meshStandardMaterial color="#a52735" roughness={0.3} />
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
