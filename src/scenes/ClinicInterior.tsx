import { PerspectiveCamera, RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector2, Vector3 } from 'three'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_KEY } from '../world/controls'
import {
  BENCH_DEPTH,
  BENCH_OVERHANG,
  CAMERA_BOUNDS,
  CEILING_COLUMNS,
  CEILING_ROWS,
  CHAIR_COUNT,
  CHAIR_IDS,
  CHAIR_X,
  CHAIR_Z,
  chairCameraAt,
  chairCameraTarget,
  chairIndex,
  chairSitSpot,
  ClinicWall,
  DESK,
  DESK_DEPTH,
  DESK_HEIGHT,
  DESK_WIDTH,
  EXIT_DOOR,
  EXIT_DOOR_HEIGHT,
  EXIT_DOOR_WIDTH,
  EXIT_RADIUS,
  IV_BAG_LOCAL,
  obstacles,
  RECLINER_TURN,
  ROOM,
  SIT_RADIUS,
  SKIRTING_DEPTH,
  SKIRTING_HEIGHT,
  TRAY_LOCAL,
  TROFFER_LENGTH,
  TROFFER_WIDTH,
  troffers,
  VENDING,
  VENDING_DEPTH,
  VENDING_HEIGHT,
  VENDING_WIDTH,
  WAITING_X,
  WAITING_Z,
  WALK_BOUNDS,
  WALL_HEIGHT,
  WALL_PROPS,
  wallPropPosition,
} from './clinicLayout'
import {
  getCeilingNormalTexture,
  getCeilingTexture,
  getFloorNormalTexture,
  getFloorTexture,
  getVendingFrontTexture,
  getVinylNormalTexture,
  getWallNoticeTexture,
  getWallTexture,
} from './clinicTexture'
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
 *
 * Everything here is drawn from `clinicLayout.ts`. The rule that earned that is
 * the usual one: this room has a fixed camera on every chair and a suspended
 * ceiling over the whole floor, and geometry that has to agree with a camera or
 * with a grid cannot live in two files that each look correct.
 */

const ROOM_WIDTH = ROOM.maxX - ROOM.minX
const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ
const ROOM_CENTER_X = (ROOM.minX + ROOM.maxX) / 2
const ROOM_CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2

/** Cold, and flat. The clinic's whole character is in this colour. */
const FLUORESCENT = '#dff0ff'
const CROSS_RED = '#a8232f'

/** Upholstery: a lit face and a shadowed side, so a cushion is not one slab. */
const VINYL = '#2f5fa8'
const VINYL_DEEP = '#24487f'
const CHASSIS = '#2a3038'
const CHROME = '#b9c2ca'
const LAMINATE = '#a9855a'

/**
 * How hard the embossed vinyl reads.
 *
 * A module constant rather than a literal in the JSX because `normalScale` is a
 * `Vector2`: written inline it allocates a new one on every render of every
 * cushion, sixty times a second, for a value that never changes.
 */
const VINYL_NORMAL_SCALE = new Vector2(0.4, 0.4)

/**
 * Steel: the trays, the IV stands, the bench frame.
 *
 * `metalness` is a parameter and not a constant because there is no environment
 * map in this scene. A fully metallic surface reflects its surroundings and
 * nothing else, so with nothing to reflect it renders black — which is exactly
 * what the bench did: four seat pans at 0.72 came back as black slabs against a
 * pale wall. Thin parts get away with it because their highlight is most of what
 * you see of them; a flat pan the size of a seat does not.
 */
function Steel({ tint = CHROME, metalness = 0.7 }: { tint?: string; metalness?: number }) {
  return <meshStandardMaterial color={tint} roughness={0.32} metalness={metalness} />
}

/** Broad steel surfaces, which need something diffuse to sit on. */
const SHEET_METALNESS = 0.28

interface ReclinerProps {
  z: number
  /**
   * Whether a draw is under way in this chair.
   *
   * The stand's own bags come down for the duration, because the draw hangs the
   * one being filled in the same place. Two bags on one pole reads as a bug.
   */
  drawing?: boolean
}

/**
 * The stand beside a recliner, in the chair's own space.
 *
 * Split out of `Recliner` because it is half the part count of the chair and
 * none of it is the chair — and because the bag it carries is the one thing in
 * here whose position other files depend on.
 */
function IvStand({ drawing }: { drawing: boolean }) {
  const [bagX, bagY, bagZ] = IV_BAG_LOCAL
  // The pole stands a little behind the bag, which hangs off the hook toward
  // the chair. `IV_BAG_LOCAL` is fixed — `ivBagAt` and the draw line are both
  // written against it — so the pole is placed relative to the bag, not the
  // other way round.
  const poleX = bagX - 0.06
  const poleZ = bagZ
  const poleTop = 1.72

  return (
    <group position={[poleX, 0, poleZ]}>
      {/* Five-star base with casters, as a real stand has. */}
      {[0, 1, 2, 3, 4].map((spoke) => {
        const angle = (spoke / 5) * Math.PI * 2
        return (
          <group key={spoke} rotation={[0, angle, 0]}>
            <mesh position={[0, 0.055, 0.1]}>
              <boxGeometry args={[0.035, 0.03, 0.2]} />
              <Steel tint="#8f98a1" />
            </mesh>
            <mesh position={[0, 0.028, 0.2]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.028, 0.028, 0.022, 10]} />
              <meshStandardMaterial color="#2c3238" roughness={0.75} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.05, 0.062, 0.06, 12]} />
        <Steel tint="#98a1a9" />
      </mesh>

      {/* Pole, in two stages with a collar, which is what makes it read as
          adjustable rather than as a broom handle. */}
      <mesh position={[0, poleTop / 2, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.019, poleTop, 10]} />
        <Steel />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <cylinderGeometry args={[0.027, 0.027, 0.05, 10]} />
        <Steel tint="#8b949c" />
      </mesh>

      {/* The hook at the top: a crossbar with a drop at each end. */}
      <mesh position={[0, poleTop, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.22, 8]} />
        <Steel />
      </mesh>
      {[-0.1, 0.1].map((offset) => (
        <mesh key={offset} position={[offset, poleTop - 0.035, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.07, 6]} />
          <Steel />
        </mesh>
      ))}

      {/*
        Two bags of collection fluid, hanging where the reference's do.

        Pale straw rather than red, and that is a legibility fix as much as an
        accuracy one: every chair used to carry a red bag, so the one actually
        being filled — the only thing happening in the room — did not stand out
        from the three that were not.

        Both come down during a draw. `DrawBag` hangs the bag being filled at
        exactly `IV_BAG_LOCAL`, and a second bag beside it would crowd the line
        running to it, which took three attempts to make visible at all.
      */}
      {!drawing &&
        [0, 1].map((slot) => (
          <group
            key={slot}
            // 0.17 apart for bags 0.13 wide: at a gap equal to the width they
            // sit edge to edge and read as one wide slab rather than two bags.
            position={[bagX - poleX + (slot === 0 ? 0 : -0.17), bagY, bagZ - poleZ]}
          >
            <mesh>
              <boxGeometry args={[0.13, 0.23, 0.055]} />
              <meshStandardMaterial
                color="#e2dcb4"
                roughness={0.22}
                transparent
                opacity={0.72}
              />
            </mesh>
            {/* The label band, which is most of what says "bag" at a distance. */}
            <mesh position={[0, 0.02, -0.031]}>
              <planeGeometry args={[0.115, 0.07]} />
              <meshStandardMaterial color="#dfe6ea" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.145, 0]}>
              <boxGeometry args={[0.04, 0.05, 0.03]} />
              <Steel tint="#cfd8de" />
            </mesh>
            {/* Drip chamber under the outlet. */}
            <mesh position={[0, -0.16, 0]}>
              <cylinderGeometry args={[0.017, 0.017, 0.075, 8]} />
              <meshStandardMaterial
                color="#dfe8ee"
                roughness={0.15}
                transparent
                opacity={0.55}
              />
            </mesh>
          </group>
        ))}
    </group>
  )
}

/** One reclining donation chair with its IV stand and tray. */
function Recliner({ z, drawing = false }: ReclinerProps) {
  const vinyl = getVinylNormalTexture()

  /*
   * The seat back and the headrest share a recline, so they are written once.
   *
   * They used to be two hand-set rotations that happened to be equal, which is
   * the sort of thing that stops being equal the first time one of them is
   * nudged and leaves a headrest floating off the back of the chair.
   */
  const recline = -0.3

  return (
    <group position={[CHAIR_X, 0, z]} rotation={[0, RECLINER_TURN, 0]}>
      {/* Pedestal and casters. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}:${sz}`} position={[sx * 0.24, 0.035, sz * 0.22]}>
            <cylinderGeometry args={[0.035, 0.035, 0.03, 10]} />
            <meshStandardMaterial color="#23282e" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[0.24, 0.2, 0.28]} />
        <meshStandardMaterial color={CHASSIS} roughness={0.7} metalness={0.3} />
      </mesh>
      <RoundedBox args={[0.64, 0.12, 0.56]} radius={0.035} smoothness={2} position={[0, 0.28, 0]}>
        <meshStandardMaterial color={CHASSIS} roughness={0.65} metalness={0.25} />
      </RoundedBox>

      {/* Seat cushion. */}
      <RoundedBox
        args={[0.68, 0.19, 0.6]}
        radius={0.065}
        smoothness={3}
        position={[0, 0.42, 0.02]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={VINYL}
          roughness={0.48}
          normalMap={vinyl}
          normalScale={VINYL_NORMAL_SCALE}
        />
      </RoundedBox>
      {/* The seam across it. A single unbroken cushion reads as a block. */}
      <mesh position={[0, 0.515, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.6, 0.012]} />
        <meshStandardMaterial color={VINYL_DEEP} roughness={0.6} />
      </mesh>

      {/* Back, laid back a little as a donation chair is. */}
      <RoundedBox
        args={[0.68, 0.78, 0.19]}
        radius={0.065}
        smoothness={3}
        position={[0, 0.86, -0.29]}
        rotation={[recline, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={VINYL}
          roughness={0.48}
          normalMap={vinyl}
          normalScale={VINYL_NORMAL_SCALE}
        />
      </RoundedBox>
      {/* Headrest: narrower than the back, which is what makes it read as one. */}
      <RoundedBox
        args={[0.56, 0.24, 0.17]}
        radius={0.06}
        smoothness={3}
        position={[0, 1.32, -0.42]}
        rotation={[recline, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={VINYL_DEEP}
          roughness={0.45}
          normalMap={vinyl}
          normalScale={VINYL_NORMAL_SCALE}
        />
      </RoundedBox>

      {/* Footrest, out. This is what makes the footprint long. */}
      <RoundedBox
        args={[0.62, 0.15, 0.6]}
        radius={0.055}
        smoothness={3}
        position={[0, 0.38, 0.62]}
        rotation={[0.12, 0, 0]}
        castShadow
      >
        <meshStandardMaterial
          color={VINYL_DEEP}
          roughness={0.5}
          normalMap={vinyl}
          normalScale={VINYL_NORMAL_SCALE}
        />
      </RoundedBox>
      {/* Its linkage, so it is hinged to the chair rather than beside it. */}
      <mesh position={[0, 0.32, 0.34]}>
        <boxGeometry args={[0.5, 0.07, 0.16]} />
        <meshStandardMaterial color={CHASSIS} roughness={0.7} metalness={0.3} />
      </mesh>

      {/* Armrests. */}
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          args={[0.14, 0.12, 0.62]}
          radius={0.05}
          smoothness={3}
          position={[side * 0.4, 0.56, 0.03]}
          castShadow
        >
          <meshStandardMaterial
            color={VINYL_DEEP}
            roughness={0.45}
            normalMap={vinyl}
            normalScale={VINYL_NORMAL_SCALE}
          />
        </RoundedBox>
      ))}
      {/* The release lever, on the side away from the arm being worked on. */}
      <mesh position={[-0.44, 0.48, 0.2]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.011, 0.011, 0.16, 8]} />
        <Steel />
      </mesh>

      {/*
        The arm tray, on the side the donor's arm goes.

        `TRAY_LOCAL` is fixed: the chair camera is aimed just above it and the
        draw line's needle end is written to reach it. Everything here is placed
        around that point rather than the point being moved to suit the tray.
      */}
      <mesh position={[0.5, TRAY_LOCAL[1] - 0.08, TRAY_LOCAL[2]]}>
        <boxGeometry args={[0.16, 0.05, 0.09]} />
        <Steel tint="#9aa3ab" />
      </mesh>
      <RoundedBox
        args={[0.32, 0.022, 0.4]}
        radius={0.01}
        smoothness={2}
        position={[...TRAY_LOCAL]}
        castShadow
      >
        <Steel tint="#c3ccd3" metalness={SHEET_METALNESS} />
      </RoundedBox>
      {/* Its raised lip, which is the difference between a tray and a plate. */}
      {[
        { offset: [0.155, 0.018, 0] as const, size: [0.012, 0.032, 0.4] as const },
        { offset: [-0.155, 0.018, 0] as const, size: [0.012, 0.032, 0.4] as const },
        { offset: [0, 0.018, 0.195] as const, size: [0.32, 0.032, 0.012] as const },
        { offset: [0, 0.018, -0.195] as const, size: [0.32, 0.032, 0.012] as const },
      ].map(({ offset, size }, index) => (
        <mesh
          key={index}
          position={[
            TRAY_LOCAL[0] + offset[0],
            TRAY_LOCAL[1] + offset[1],
            TRAY_LOCAL[2] + offset[2],
          ]}
        >
          <boxGeometry args={[...size]} />
          <Steel tint="#c3ccd3" />
        </mesh>
      ))}

      <IvStand drawing={drawing} />
    </group>
  )
}

/** The check-in desk, with a monitor, a phone and some paperwork on it. */
function CheckInDesk() {
  return (
    <group position={[DESK[0], 0, DESK[2]]}>
      {/* Carcass, standing on a recessed kick so it does not meet the floor
          as one slab. */}
      <mesh position={[0, (DESK_HEIGHT - 0.12) / 2 + 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[DESK_WIDTH, DESK_HEIGHT - 0.12, DESK_DEPTH]} />
        <meshStandardMaterial color={LAMINATE} roughness={0.68} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[DESK_WIDTH - 0.12, 0.12, DESK_DEPTH - 0.1]} />
        <meshStandardMaterial color="#2b2723" roughness={0.85} />
      </mesh>
      {/* A reveal across the front panel, so it reads as joinery. */}
      <mesh position={[0, DESK_HEIGHT - 0.3, -DESK_DEPTH / 2 - 0.002]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[DESK_WIDTH - 0.1, 0.02]} />
        <meshStandardMaterial color="#8a6c48" roughness={0.7} />
      </mesh>

      {/* The top, overhanging on every side. */}
      <RoundedBox
        args={[DESK_WIDTH + 0.1, 0.055, DESK_DEPTH + 0.1]}
        radius={0.018}
        smoothness={2}
        position={[0, DESK_HEIGHT + 0.02, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#8a6c48" roughness={0.5} />
      </RoundedBox>

      {/* Monitor: foot, neck, panel, and a screen inset in its bezel. */}
      <group position={[-0.52, DESK_HEIGHT + 0.05, 0]} rotation={[0, 0.34, 0]}>
        <mesh position={[0, 0.012, 0]}>
          <boxGeometry args={[0.22, 0.018, 0.14]} />
          <meshStandardMaterial color="#1b2026" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.09, 0]}>
          <boxGeometry args={[0.05, 0.16, 0.04]} />
          <meshStandardMaterial color="#1b2026" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.31, 0]} rotation={[-0.08, 0, 0]}>
          <boxGeometry args={[0.46, 0.3, 0.03]} />
          <meshStandardMaterial color="#20262c" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.311, 0.017]} rotation={[-0.08, 0, 0]}>
          <planeGeometry args={[0.42, 0.26]} />
          {/* Dim, and not emissive. A bright screen in this room becomes the
              second light source and the eye goes to it instead of the desk. */}
          <meshStandardMaterial color="#38505f" roughness={0.25} />
        </mesh>
      </group>

      {/* Phone. */}
      <group position={[0.72, DESK_HEIGHT + 0.05, 0.06]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.2, 0.04, 0.16]} />
          <meshStandardMaterial color="#22282e" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.055, -0.05]}>
          <boxGeometry args={[0.21, 0.05, 0.05]} />
          <meshStandardMaterial color="#2a3138" roughness={0.55} />
        </mesh>
      </group>

      {/* Paperwork, fanned. Three sheets at slightly different angles, because
          one perfectly square stack reads as a block of plastic. */}
      {[0.1, -0.16, 0.03].map((turn, index) => (
        <mesh
          key={turn}
          position={[0.18 + index * 0.012, DESK_HEIGHT + 0.052 + index * 0.004, -0.1]}
          rotation={[0, turn, 0]}
        >
          <boxGeometry args={[0.21, 0.003, 0.28]} />
          <meshStandardMaterial color="#e7e9e3" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Beam seating along the right-hand wall. */
function WaitingBench() {
  const first = WAITING_Z[0] ?? 0
  const last = WAITING_Z[WAITING_Z.length - 1] ?? 0
  const length = last - first + BENCH_OVERHANG * 2
  const middle = (first + last) / 2

  return (
    <group position={[WAITING_X, 0, 0]}>
      {/* One rail carrying every seat, which is what beam seating is — and
          twelve loose boxes is what it was. */}
      <mesh position={[0.06, 0.34, middle]}>
        <boxGeometry args={[0.09, 0.09, length]} />
        <Steel tint="#98a1a9" />
      </mesh>

      {/* Two feet, at the ends. */}
      {[first - BENCH_OVERHANG * 0.5, last + BENCH_OVERHANG * 0.5].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0.06, 0.17, 0]}>
            <boxGeometry args={[0.05, 0.34, 0.05]} />
            <Steel tint="#98a1a9" />
          </mesh>
          <mesh position={[0, 0.015, 0]}>
            <boxGeometry args={[BENCH_DEPTH * 0.8, 0.03, 0.07]} />
            <Steel tint="#8a939b" />
          </mesh>
        </group>
      ))}

      {WAITING_Z.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {/* Seat pan, dished by tilting it back a few degrees. */}
          <RoundedBox
            args={[BENCH_DEPTH * 0.82, 0.05, 0.46]}
            radius={0.02}
            smoothness={2}
            position={[-0.02, 0.42, 0]}
            rotation={[0, 0, 0.05]}
            castShadow
          >
            <Steel tint="#b6bfc7" metalness={SHEET_METALNESS} />
          </RoundedBox>
          {/* Back, raked toward the wall. */}
          <RoundedBox
            args={[0.05, 0.4, 0.44]}
            radius={0.018}
            smoothness={2}
            position={[0.22, 0.63, 0]}
            rotation={[0, 0, 0.16]}
            castShadow
          >
            <Steel tint="#b6bfc7" metalness={SHEET_METALNESS} />
          </RoundedBox>
          {/* The bracket down to the rail. */}
          <mesh position={[0.04, 0.38, 0]}>
            <boxGeometry args={[0.16, 0.06, 0.06]} />
            <Steel tint="#8a939b" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** The vending machine in the corner, the one lit thing that is not a ceiling. */
function VendingMachine() {
  const front = getVendingFrontTexture()

  return (
    <group position={[VENDING[0], 0, VENDING[2]]}>
      <RoundedBox
        args={[VENDING_DEPTH, VENDING_HEIGHT - 0.1, VENDING_WIDTH]}
        radius={0.03}
        smoothness={2}
        position={[0, (VENDING_HEIGHT - 0.1) / 2 + 0.1, 0]}
        castShadow
      >
        <meshStandardMaterial color="#1c3459" roughness={0.55} metalness={0.2} />
      </RoundedBox>
      {/* Plinth, inset, so the cabinet does not grow out of the floor. */}
      <mesh position={[0.02, 0.05, 0]}>
        <boxGeometry args={[VENDING_DEPTH - 0.08, 0.1, VENDING_WIDTH - 0.06]} />
        <meshStandardMaterial color="#12203a" roughness={0.8} />
      </mesh>

      {/*
        The front, facing back into the room.

        `meshBasicMaterial` because the inside of the cabinet is lit and the room
        is not lighting it — but tone-mapped, unlike the neon on the strip. The
        quad this replaces was an untone-mapped `#ffd98a` that went straight
        through `CLINIC_BLOOM`'s threshold and bloomed into a lamp in the corner
        of every capture of this room.
      */}
      <mesh
        position={[-VENDING_DEPTH / 2 - 0.006, VENDING_HEIGHT / 2 + 0.02, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      >
        <planeGeometry args={[VENDING_WIDTH * 0.94, VENDING_HEIGHT * 0.92]} />
        <meshBasicMaterial map={front} />
      </mesh>
    </group>
  )
}

/** Everything hung on a wall, placed from `WALL_PROPS`. */
function WallProps() {
  const notice = getWallNoticeTexture()

  return (
    <>
      {WALL_PROPS.map((prop) => {
        const facing: [number, number, number] =
          prop.wall === ClinicWall.Left ? [0, Math.PI / 2, 0] : [0, Math.PI, 0]

        if (prop.id === 'cross') {
          const [x, y, z] = wallPropPosition(prop, 0.04)
          const arm = prop.width * 0.31

          /*
           * A relief, not a decal.
           *
           * It was two unlit planes with `toneMapped={false}`, which is how the
           * neon on the strip is drawn — and on a wall, in a room with no neon
           * in it, that reads as a sticker rather than as an object. Standing it
           * off the wall and letting it take the room's own light is the whole
           * fix.
           */
          return (
            <group key={prop.id} position={[x, y, z]} rotation={facing}>
              <RoundedBox args={[arm, prop.height, 0.055]} radius={0.012} smoothness={2} castShadow>
                <meshStandardMaterial color={CROSS_RED} roughness={0.42} />
              </RoundedBox>
              <RoundedBox args={[prop.width, arm, 0.055]} radius={0.012} smoothness={2} castShadow>
                <meshStandardMaterial color={CROSS_RED} roughness={0.42} />
              </RoundedBox>
            </group>
          )
        }

        if (prop.id === 'clipboard') {
          return (
            <mesh
              key={prop.id}
              position={[...wallPropPosition(prop, 0.03)]}
              rotation={facing}
              castShadow
            >
              <planeGeometry args={[prop.width, prop.height]} />
              <meshStandardMaterial map={notice} roughness={0.8} />
            </mesh>
          )
        }

        // The light switch. Small, and there because the reference has one:
        // a wall with nothing on it at all is what says "untextured box".
        const [x, y, z] = wallPropPosition(prop, 0.012)
        return (
          <group key={prop.id} position={[x, y, z]} rotation={facing}>
            <mesh>
              <boxGeometry args={[prop.width, prop.height, 0.014]} />
              <meshStandardMaterial color="#e6e9ea" roughness={0.6} />
            </mesh>
            {[-0.028, 0.028].map((offset) => (
              <mesh key={offset} position={[offset, 0, 0.011]}>
                <boxGeometry args={[0.036, 0.07, 0.012]} />
                <meshStandardMaterial color="#f2f4f5" roughness={0.5} />
              </mesh>
            ))}
          </group>
        )
      })}
    </>
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

  const ceiling = getCeilingTexture(CEILING_COLUMNS, CEILING_ROWS)
  const ceilingNormal = getCeilingNormalTexture(CEILING_COLUMNS, CEILING_ROWS)
  const floor = getFloorTexture(CEILING_COLUMNS, CEILING_ROWS)
  const floorNormal = getFloorNormalTexture(CEILING_COLUMNS, CEILING_ROWS)
  const wall = getWallTexture()

  const fittings = useMemo(() => troffers(), [])

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

        Ambient came down from 0.95 when the fittings went in. At 0.95 the room
        was evenly lit in the sense that a sheet of paper is: every surface got
        the same value regardless of which way it faced, so a rounded cushion and
        a flat one rendered identically. The panels do the work now, and the room
        is still cold, still shadowless and still nobody's idea of flattering.
      */}
      <ambientLight intensity={0.55} color="#dbe9f5" />
      {fittings.map(([x, z]) => (
        <group key={`${x}:${z}`}>
          {/*
            The lamp hangs well below the tile it is let into.

            At 0.28 under the ceiling — which is where a recessed fitting
            physically is — each lamp was scorching its own ceiling: irradiance
            goes as the inverse square, so at that range the tile around every
            fitting washed to flat white and the grid disappeared into six hot
            pools. Dropping it to 0.6 cuts what the ceiling receives by about
            four fifths and barely changes what the floor does, because the floor
            is three metres away either way. The fitting the player sees is still
            in the ceiling; only the light source moved.
          */}
          <pointLight
            position={[x, WALL_HEIGHT - 0.6, z]}
            color={FLUORESCENT}
            intensity={9}
            distance={9}
          />
          {/*
            The fitting itself, so the light has a visible source: a housing
            let into the grid, with the lens inset into it.

            Tone-mapped, unlike every neon surface in the game. An unmapped white
            panel exceeds the bloom threshold by miles and the three of them
            merged into one white sun across the ceiling — which is the opposite
            of the flat, even, joyless light this room is for.
          */}
          <mesh position={[x, WALL_HEIGHT - 0.03, z]}>
            <boxGeometry args={[TROFFER_LENGTH + 0.07, 0.06, TROFFER_WIDTH + 0.07]} />
            <meshStandardMaterial color="#9aa4aa" roughness={0.4} metalness={0.5} />
          </mesh>
          <mesh position={[x, WALL_HEIGHT - 0.062, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[TROFFER_LENGTH - 0.04, TROFFER_WIDTH - 0.04]} />
            <meshBasicMaterial color="#eaf4ff" />
          </mesh>
        </group>
      ))}

      {/*
        The room, as six surfaces rather than one `BackSide` box.

        The box was one draw and one material, which meant one flat colour on
        every wall, the ceiling and the floor alike. Splitting it is what lets
        the ceiling carry tile, the floor carry grout and the walls carry a
        gradient — and a wall of one flat colour is the single thing that reads
        most loudly as an untextured box.
      */}
      {[
        { key: 'left', position: [ROOM.minX, WALL_HEIGHT / 2, ROOM_CENTER_Z], rotation: [0, Math.PI / 2, 0], size: [ROOM_DEPTH, WALL_HEIGHT] },
        { key: 'right', position: [ROOM.maxX, WALL_HEIGHT / 2, ROOM_CENTER_Z], rotation: [0, -Math.PI / 2, 0], size: [ROOM_DEPTH, WALL_HEIGHT] },
        { key: 'back', position: [ROOM_CENTER_X, WALL_HEIGHT / 2, ROOM.maxZ], rotation: [0, Math.PI, 0], size: [ROOM_WIDTH, WALL_HEIGHT] },
        { key: 'front', position: [ROOM_CENTER_X, WALL_HEIGHT / 2, ROOM.minZ], rotation: [0, 0, 0], size: [ROOM_WIDTH, WALL_HEIGHT] },
      ].map(({ key, position, rotation, size }) => (
        <mesh
          key={key}
          position={position as [number, number, number]}
          rotation={rotation as [number, number, number]}
          receiveShadow
        >
          <planeGeometry args={size as [number, number]} />
          <meshStandardMaterial map={wall} roughness={0.94} />
        </mesh>
      ))}

      {/* Skirting, at the wall/floor join. Nothing in the reference draws the
          eye to it and its absence is exactly why the walls met the floor in a
          hard seam. */}
      {[
        { key: 'left', position: [ROOM.minX + SKIRTING_DEPTH / 2, SKIRTING_HEIGHT / 2, ROOM_CENTER_Z], size: [SKIRTING_DEPTH, SKIRTING_HEIGHT, ROOM_DEPTH] },
        { key: 'right', position: [ROOM.maxX - SKIRTING_DEPTH / 2, SKIRTING_HEIGHT / 2, ROOM_CENTER_Z], size: [SKIRTING_DEPTH, SKIRTING_HEIGHT, ROOM_DEPTH] },
        { key: 'back', position: [ROOM_CENTER_X, SKIRTING_HEIGHT / 2, ROOM.maxZ - SKIRTING_DEPTH / 2], size: [ROOM_WIDTH, SKIRTING_HEIGHT, SKIRTING_DEPTH] },
        { key: 'front', position: [ROOM_CENTER_X, SKIRTING_HEIGHT / 2, ROOM.minZ + SKIRTING_DEPTH / 2], size: [ROOM_WIDTH, SKIRTING_HEIGHT, SKIRTING_DEPTH] },
      ].map(({ key, position, size }) => (
        <mesh key={key} position={position as [number, number, number]}>
          <boxGeometry args={size as [number, number, number]} />
          <meshStandardMaterial color="#96a1aa" roughness={0.7} />
        </mesh>
      ))}

      {/* Suspended acoustic tile on its grid. */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, WALL_HEIGHT - 0.004, ROOM_CENTER_Z]}
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial map={ceiling} normalMap={ceilingNormal} roughness={0.96} />
      </mesh>

      {/* Pale green tile, straight off the reference. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, 0.002, ROOM_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial map={floor} normalMap={floorNormal} roughness={0.62} metalness={0.05} />
      </mesh>

      <WallProps />

      {CHAIR_Z.map((z, index) => (
        <Recliner key={z} z={z} drawing={donation?.chair === index} />
      ))}

      <ClinicStaff />

      <CheckInDesk />
      <WaitingBench />
      <VendingMachine />

      {/*
        The way out, back onto the strip.

        Its spill is turned down hard here. This is the only interior with a lit
        ceiling, and the doorway's warm lamp sits 1.4 m under pale tile: at the
        casino's settings it washed a third of the ceiling tan and the room read
        as pine panelling rather than as a clinic. Turned down it does what it is
        for — a warm patch at the door in a cold room — without redecorating.
      */}
      <ExitDoor
        position={EXIT_DOOR}
        accent="#8fa3b4"
        width={EXIT_DOOR_WIDTH}
        height={EXIT_DOOR_HEIGHT}
        spillIntensity={4.5}
        spillDistance={4.5}
        /*
         * ...and no painted pool on the floor.
         *
         * This is the case the prop was added for, arriving a room late. The
         * pool is a flat quad standing in for light, and a flat quad only
         * survives on a surface bright enough to hide its edges. It survived on
         * the clinic's old floor because that floor was one flat green; on
         * tile with grout lines and a sheen it came back as a tan plank lying in
         * front of the door, exactly as it did on the shop's polished boards.
         */
        floorPool={false}
      />

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
