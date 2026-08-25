import { BackSide, DoubleSide } from 'three'
import {
  EXIT_DOOR,
  ROOM,
  tableOrigin,
  TABLE_IDS,
  WALL_HEIGHT,
} from '../casinoFloorLayout'

/*
 * The shell of the Golden Ace's floor: carpet, walls, coving and the way out.
 *
 * `CasinoFloor.tsx` used to fill the background with painted tables and pillars
 * receding into haze. That was right when the camera was pinned over one table
 * and could never approach them; now that the player walks the room, dressing
 * you can see but never reach reads as a wall you are being kept away from, so
 * this room is small and everything in it is real.
 */

interface CasinoRoomProps {
  /** House colour, from the venue config. */
  neonColor: string
}

const ROOM_WIDTH = ROOM.maxX - ROOM.minX
const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ
const ROOM_CENTER_X = (ROOM.minX + ROOM.maxX) / 2
const ROOM_CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2

const DOOR_WIDTH = 2.4
const DOOR_HEIGHT = 3

/** Warm pendant over a table, matching the one the fixed camera used to see. */
function Pendant({ position }: { position: readonly [number, number, number] }) {
  return (
    <group position={[position[0], 3.6, position[2]]}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 1.4, 6]} />
        <meshStandardMaterial color="#3a2f1c" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh>
        <coneGeometry args={[0.46, 0.34, 20, 1, true]} />
        <meshStandardMaterial color="#8a6a2f" roughness={0.35} metalness={0.75} side={DoubleSide} />
      </mesh>
      {/* Emissive disc across the shade's mouth, so the lamp reads as lit. */}
      <mesh position={[0, -0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.43, 20]} />
        <meshBasicMaterial color="#d9b273" toneMapped={false} />
      </mesh>

      {/* The pool of light under it. */}
      <spotLight
        position={[0, 0.2, 0]}
        angle={0.7}
        penumbra={0.85}
        intensity={70}
        distance={14}
        color="#ffe4b5"
        castShadow
        shadow-mapSize={[1024, 1024]}
        // Without a bias the near-flat felt self-shadows into a hard band.
        shadow-bias={-0.0008}
        shadow-normalBias={0.02}
      />
    </group>
  )
}

export function CasinoRoom({ neonColor }: CasinoRoomProps) {
  return (
    <>
      <color attach="background" args={['#0b0611']} />
      {/*
        Haze, pushed well past the room. The old scene faded everything beyond
        nine units because everything beyond nine units was painted backdrop;
        here the far wall is fourteen units from the entrance, and at the old
        setting it dissolved into the background colour — the room read as a
        void with two lit tables floating in it.
      */}
      <fog attach="fog" args={['#0b0611', 26, 60]} />

      {/*
        Brighter than the old fixed-camera scene, which could afford near-black
        everywhere but the one lit table because you could never walk into the
        dark. A room you cross has to be legible all the way across it.
      */}
      <ambientLight intensity={0.78} color="#b9a7d8" />

      {/* Cool fill from the entrance end, so the near side is not solid black. */}
      <pointLight
        position={[ROOM_CENTER_X, 3, ROOM.maxZ - 1.5]}
        color="#6f7ae0"
        intensity={45}
        distance={24}
      />
      {/* House colour washing the far wall behind the tables. */}
      <pointLight
        position={[ROOM_CENTER_X, 2.8, ROOM.minZ + 1]}
        color={neonColor}
        intensity={52}
        distance={22}
      />

      {/*
        The room as one inverted box. `BackSide` so only the inner faces draw —
        at `DoubleSide` the near wall sits between the camera and the room, the
        mistake the shop's display window already made once.
      */}
      <mesh
        position={[ROOM_CENTER_X, WALL_HEIGHT / 2, ROOM_CENTER_Z]}
        receiveShadow
      >
        <boxGeometry args={[ROOM_WIDTH, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color="#2e1c3d" roughness={0.95} side={BackSide} />
      </mesh>

      {/* Patterned carpet, a shade warmer than the walls. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, 0.002, ROOM_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color="#2a1030" roughness={0.95} />
      </mesh>

      {/* Neon coving down the two long walls, the strip's colours brought in. */}
      {[ROOM.minZ + 0.06, ROOM.maxZ - 0.06].map((z) => (
        <mesh key={z} position={[ROOM_CENTER_X, WALL_HEIGHT - 0.5, z]}>
          <boxGeometry args={[ROOM_WIDTH - 0.6, 0.12, 0.08]} />
          <meshBasicMaterial color={neonColor} toneMapped={false} />
        </mesh>
      ))}

      {TABLE_IDS.map((table) => (
        <Pendant key={table} position={tableOrigin(table)} />
      ))}

      {/* The way out, lit so it reads as an exit from across the room. */}
      <group position={[EXIT_DOOR[0], 0, EXIT_DOOR[2]]}>
        <mesh position={[0, DOOR_HEIGHT / 2, -0.04]}>
          <planeGeometry args={[DOOR_WIDTH, DOOR_HEIGHT]} />
          <meshBasicMaterial color="#2a1e3a" toneMapped={false} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (DOOR_WIDTH / 2 + 0.08), DOOR_HEIGHT / 2, -0.06]}>
            <planeGeometry args={[0.1, DOOR_HEIGHT + 0.2]} />
            <meshBasicMaterial color={neonColor} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, DOOR_HEIGHT + 0.1, -0.06]}>
          <planeGeometry args={[DOOR_WIDTH + 0.26, 0.1]} />
          <meshBasicMaterial color={neonColor} toneMapped={false} />
        </mesh>
        <pointLight position={[0, 2.2, -1.2]} color={neonColor} intensity={14} distance={9} />
      </group>
    </>
  )
}
