import { PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_KEY } from '../world/controls'
import {
  CAMERA_BOUNDS,
  CHAIR_COUNT,
  CHAIR_IDS,
  CHAIR_X,
  CHAIR_Z,
  chairCameraAt,
  chairCameraTarget,
  chairIndex,
  chairSitSpot,
  DESK,
  DESK_DEPTH,
  DESK_HEIGHT,
  DESK_WIDTH,
  EXIT_DOOR,
  EXIT_RADIUS,
  IV_BAG_LOCAL,
  obstacles,
  RECLINER_TURN,
  ROOM,
  SIT_RADIUS,
  TRAY_LOCAL,
  VENDING,
  WAITING_X,
  WAITING_Z,
  WALK_BOUNDS,
  WALL_HEIGHT,
} from './clinicLayout'
import { CasinoCharacter } from './components/CasinoCharacter'
import { ClinicStaff } from './components/ClinicStaff'
import { ExitDoor } from './components/ExitDoor'
import { WalkingPlayer, type ProximityTarget } from './components/WalkingPlayer'
import { useActionKey } from './useActionKey'

/*
 * Red River Plasma's donation room.
 *
 * Built to `art/refs/clinic_interior.png`, and lit to be the opposite of the
 * casino floor next door: flat cold fluorescent panels, no warm pools, no
 * shadows to hide in. The casino flatters you; this room does not care.
 *
 * Walkable, and the same shape as `CasinoInterior` — `WalkingPlayer` with the
 * room's bounds, the recliners as proximity targets and as obstacles, and F to
 * sit down.
 */

const ROOM_WIDTH = ROOM.maxX - ROOM.minX
const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ
const ROOM_CENTER_X = (ROOM.minX + ROOM.maxX) / 2
const ROOM_CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2

/** Cold, and flat. The clinic's whole character is in this colour. */
const FLUORESCENT = '#dff0ff'
const CROSS_RED = '#d0323c'

interface ReclinerProps {
  z: number
  /**
   * Whether a draw is under way in this chair.
   *
   * The stand's own bag comes down for the duration, because the draw hangs the
   * one being filled in the same place. Two bags on one pole reads as a bug.
   */
  drawing?: boolean
}

/** One reclining donation chair with its IV stand and tray. */
function Recliner({ z, drawing = false }: ReclinerProps) {
  return (
    <group position={[CHAIR_X, 0, z]} rotation={[0, RECLINER_TURN, 0]}>
      {/* Base and seat. */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.16, 0.62]} />
        <meshStandardMaterial color="#2f5fa8" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.2, 0.28, 0.24]} />
        <meshStandardMaterial color="#2a3038" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Back, laid back a little as a donation chair is. */}
      <mesh position={[0, 0.66, -0.3]} rotation={[-0.32, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.78, 0.16]} />
        <meshStandardMaterial color="#2f5fa8" roughness={0.55} />
      </mesh>
      {/* Footrest, out. This is what makes the footprint long. */}
      <mesh position={[0, 0.32, 0.62]} rotation={[0.14, 0, 0]} castShadow>
        <boxGeometry args={[0.66, 0.12, 0.66]} />
        <meshStandardMaterial color="#2a5699" roughness={0.55} />
      </mesh>
      {/* Arm and tray, on the side the donor's arm goes. */}
      <mesh position={[0.42, 0.5, 0.02]} castShadow>
        <boxGeometry args={[0.14, 0.1, 0.6]} />
        <meshStandardMaterial color="#26478a" roughness={0.6} />
      </mesh>
      <mesh position={[...TRAY_LOCAL]}>
        <boxGeometry args={[0.3, 0.03, 0.36]} />
        <meshStandardMaterial color="#b9c2ca" roughness={0.35} metalness={0.6} />
      </mesh>

      {/* IV stand: a pole, feet and a bag. */}
      <mesh position={[-0.56, 0.85, -0.2]}>
        <cylinderGeometry args={[0.022, 0.022, 1.7, 8]} />
        <meshStandardMaterial color="#b9c2ca" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[-0.56, 0.02, -0.2]}>
        <cylinderGeometry args={[0.18, 0.18, 0.04, 10]} />
        <meshStandardMaterial color="#8f98a1" roughness={0.5} metalness={0.5} />
      </mesh>
      <mesh position={[...IV_BAG_LOCAL]} visible={!drawing}>
        <boxGeometry args={[0.14, 0.24, 0.06]} />
        <meshStandardMaterial
          color="#c9384a"
          roughness={0.3}
          transparent
          opacity={0.85}
        />
      </mesh>
    </group>
  )
}

/**
 * Fixed camera on the chair, aimed at the arm being worked on.
 *
 * No orbit: there is nothing to read on a felt here and nothing to line up. It
 * sits close, because what it has to show is small — a bag filling and a line
 * running to it — and from across the room all of that was a few pixels wide.
 *
 * Aimed with `lookAt` rather than a hand-set rotation, so the framing follows
 * the chair rather than being three Euler angles that happen to suit one of
 * them.
 */
function ChairCamera({ chair }: { chair: number }) {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)

  const target = useMemo(() => new Vector3(...chairCameraTarget(chair)), [chair])

  useFrame(() => {
    cameraRef.current?.lookAt(target)
  })

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={44}
      position={[...chairCameraAt(chair)]}
    />
  )
}

export function ClinicInterior() {
  const appearance = useAppearanceStore((state) => state.appearance)
  const equipped = useAppearanceStore((state) => state.equipped)
  const atChair = useGameStore((state) => state.atChair)
  const clinicPosition = useGameStore((state) => state.clinicPosition)
  const donation = useGameStore((state) => state.donation)

  /**
   * F acts on whatever the player is standing at: a recliner, or the way out.
   *
   * The same arrangement as the casino floor, and for the same reasons. Note
   * that it stays live while the player is in a chair: `leaveChair` is the Esc
   * on the donation panel, and the exit is never in range of a recliner, so
   * there is nothing here for a seated donor to trigger by accident.
   */
  useActionKey(INTERACT_KEY, () => {
    const store = useGameStore.getState()

    if (store.nearbyExit) store.leaveVenue()
    else if (store.atChair === null && store.nearbyChair !== null) {
      store.sitInChair(store.nearbyChair)
    }
  })

  const targets = useMemo<readonly ProximityTarget[]>(
    () => [
      ...Array.from({ length: CHAIR_COUNT }, (_, index) => ({
        id: CHAIR_IDS[index] ?? `chair-${index}`,
        position: chairSitSpot(index),
        radius: SIT_RADIUS,
      })),
      { id: 'exit', position: EXIT_DOOR, radius: EXIT_RADIUS },
    ],
    [],
  )

  const solids = useMemo(() => obstacles(), [])

  /*
   * The desk, checked separately from the chairs.
   *
   * On its own channel because `onNearest` reports only the closest match:
   * folding the desk in with the recliners would let standing at the desk
   * suppress a chair's sit prompt.
   */
  const glanceTargets = useMemo<readonly ProximityTarget[]>(
    () => [{ id: 'desk', position: [DESK[0], 0, DESK[2]], radius: 3.2 }],
    [],
  )

  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()

    store.setNearbyExit(id === 'exit')
    store.setNearbyChair(id === null || id === 'exit' ? null : chairIndex(id))
  }

  function handleGlance(id: string | null): void {
    useGameStore.getState().setNearDesk(id === 'desk')
  }

  return (
    <>
      <color attach="background" args={['#0d1218']} />

      {/*
        Flat and even. No spotlights, no pools, no falloff worth the name — a
        fluorescent ceiling lights everything equally badly, and that is the
        entire difference between this room and the casino floor.
      */}
      <ambientLight intensity={0.95} color="#dbe9f5" />
      {[-2.2, 1.4, 4.6].map((z) => (
        <group key={z}>
          <pointLight
            position={[ROOM_CENTER_X, WALL_HEIGHT - 0.3, z]}
            color={FLUORESCENT}
            intensity={10}
            distance={10}
          />
          {/*
            The panel itself, so the light has a visible source.

            Tone-mapped, unlike every neon surface in the game. An unmapped
            white panel exceeds the bloom threshold by miles and the three of
            them merged into one white sun across the ceiling — which is the
            opposite of the flat, even, joyless light this room is for.
          */}
          <mesh position={[ROOM_CENTER_X, WALL_HEIGHT - 0.06, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.4, 0.6]} />
            <meshBasicMaterial color="#eaf4ff" />
          </mesh>
        </group>
      ))}

      {/* The room. `BackSide` so only the inner faces draw. */}
      <mesh position={[ROOM_CENTER_X, WALL_HEIGHT / 2, ROOM_CENTER_Z]} receiveShadow>
        <boxGeometry args={[ROOM_WIDTH, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color="#ccd6de" roughness={0.95} side={BackSide} />
      </mesh>

      {/* Pale green tile, straight off the reference. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, 0.002, ROOM_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color="#b9cdae" roughness={0.9} />
      </mesh>

      {/* The cross on the wall above the chairs. */}
      <group position={[ROOM.minX + 0.06, 2.2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[0.22, 0.72]} />
          <meshBasicMaterial color={CROSS_RED} toneMapped={false} />
        </mesh>
        <mesh>
          <planeGeometry args={[0.72, 0.22]} />
          <meshBasicMaterial color={CROSS_RED} toneMapped={false} />
        </mesh>
      </group>

      {CHAIR_Z.map((z, index) => (
        <Recliner key={z} z={z} drawing={donation?.chair === index} />
      ))}

      <ClinicStaff />

      {/* Check-in desk, with a monitor on it. */}
      <group position={[DESK[0], 0, DESK[2]]}>
        <mesh position={[0, DESK_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[DESK_WIDTH, DESK_HEIGHT, DESK_DEPTH]} />
          <meshStandardMaterial color="#a9855a" roughness={0.7} />
        </mesh>
        <mesh position={[0, DESK_HEIGHT + 0.02, 0]}>
          <boxGeometry args={[DESK_WIDTH + 0.08, 0.05, DESK_DEPTH + 0.08]} />
          <meshStandardMaterial color="#8a6c48" roughness={0.6} />
        </mesh>
        <mesh position={[-0.5, DESK_HEIGHT + 0.24, 0]} rotation={[0, 0.3, 0]}>
          <boxGeometry args={[0.42, 0.3, 0.04]} />
          <meshStandardMaterial color="#20262c" roughness={0.4} />
        </mesh>
      </group>

      {/* Waiting chairs along the opposite wall. */}
      {WAITING_Z.map((z) => (
        <group key={z} position={[WAITING_X, 0, z]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.44, 0]} castShadow>
            <boxGeometry args={[0.46, 0.06, 0.44]} />
            <meshStandardMaterial color="#9aa3ac" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.68, -0.2]}>
            <boxGeometry args={[0.46, 0.42, 0.05]} />
            <meshStandardMaterial color="#9aa3ac" roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.08, 0.44, 0.08]} />
            <meshStandardMaterial color="#6d757d" roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}

      {/* Vending machine, the one warm-ish thing in the room. */}
      <group position={[VENDING[0], 0, VENDING[2]]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[0.5, 1.8, 1]} />
          <meshStandardMaterial color="#26456e" roughness={0.6} />
        </mesh>
        <mesh position={[-0.26, 1.05, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[0.8, 1.1]} />
          <meshBasicMaterial color="#ffd98a" toneMapped={false} />
        </mesh>
      </group>

      {/* The way out, back onto the strip. */}
      <ExitDoor position={EXIT_DOOR} accent="#8fa3b4" width={1.8} height={2.5} />

      {atChair === null ? (
        <WalkingPlayer
          bounds={WALK_BOUNDS}
          spawn={clinicPosition}
          // Facing into the room, with the door behind them.
          facing={Math.PI}
          targets={targets}
          onNearest={handleNearest}
          obstacles={solids}
          glanceTargets={glanceTargets}
          onGlance={handleGlance}
          distance={4.2}
          pitch={0.46}
          cameraBounds={CAMERA_BOUNDS}
        />
      ) : (
        <>
          <ChairCamera chair={atChair} />
          <group position={[CHAIR_X + 0.1, 0, CHAIR_Z[atChair] ?? 0]} rotation={[0, Math.PI / 2, 0]}>
            <CasinoCharacter appearance={appearance} equipped={equipped} seated />
          </group>
        </>
      )}
    </>
  )
}
