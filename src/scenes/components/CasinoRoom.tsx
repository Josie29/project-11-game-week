import { useMemo } from 'react'
import { BackSide, DoubleSide } from 'three'
import { Colonnade } from './Colonnade'
import { ExitDoor } from './ExitDoor'
import { PottedPalm } from './PottedPalm'
import { WaterCourt } from './WaterCourt'
import {
  AISLE_CENTER_X,
  AISLE_WIDTH,
  CARPET_FIELDS,
  CEILING_HEIGHT,
  COVING_GAP,
  COVING_X,
  COVING_Y,
  EXIT_DOOR,
  PALMS,
  RIB_COUNT_ACROSS,
  RIB_SPACING_Z,
  ROOM,
  tableOrigin,
  TABLE_IDS,
  VAULT_CENTER_Y,
  VAULT_HALF_ANGLE,
  VAULT_RADIUS,
  VAULT_RISE,
  vaultHeightAt,
  WALL_HEIGHT,
  WATER_COURT,
} from '../casinoFloorLayout'
import {
  getCofferNormalTexture,
  getCofferTexture,
  getMarbleTexture,
  getRugTexture,
  getStoneFloorTexture,
} from '../casinoTexture'

/*
 * The shell of the Golden Ace's floor: carpet, walls, the order, the water and
 * the way out.
 *
 * `CasinoFloor.tsx` used to fill the background with painted tables and pillars
 * receding into haze. That was right when the camera was pinned over one table
 * and could never approach them; now that the player walks the room, dressing
 * you can see but never reach reads as a wall you are being kept away from, so
 * everything in this room is real and can be walked up to.
 *
 * What it was *not* was grand. Four flat colours and a lid two and a half
 * metres above a pendant is a box, and it read as one: two lit tables floating
 * in a purple void. The room is two storeys now, with a colonnade carrying a
 * balcony down each long wall and a waterfall at the end of it. Every piece is
 * placed from `casinoFloorLayout.ts` and asserted there.
 */

interface CasinoRoomProps {
  /** House colour, from the venue config. */
  neonColor: string
}

const ROOM_WIDTH = ROOM.maxX - ROOM.minX
const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ
const ROOM_CENTER_X = (ROOM.minX + ROOM.maxX) / 2
const ROOM_CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2

/** The runner, from the door to the coping. */
const AISLE_LENGTH = ROOM.maxZ - WATER_COURT.maxZ
const AISLE_CENTER_Z = (ROOM.maxZ + WATER_COURT.maxZ) / 2

/**
 * The room's four walls.
 *
 * Four planes rather than one inverted box, and the box had to go: it draws its
 * own lid, which would sit between the camera and the vault. Planes also let
 * the back wall run past the springing line and fill the arch behind the vault,
 * which a box's wall cannot do — it stops where the lid starts.
 *
 * `BackSide` on each, facing inward.
 */
function Shell() {
  const walls: readonly {
    key: string
    position: [number, number, number]
    rotation: [number, number, number]
    width: number
  }[] = [
    {
      key: 'back',
      position: [ROOM_CENTER_X, CEILING_HEIGHT / 2, ROOM.minZ],
      rotation: [0, Math.PI, 0],
      width: ROOM_WIDTH,
    },
    {
      key: 'front',
      position: [ROOM_CENTER_X, CEILING_HEIGHT / 2, ROOM.maxZ],
      rotation: [0, 0, 0],
      width: ROOM_WIDTH,
    },
    {
      key: 'left',
      position: [ROOM.minX, CEILING_HEIGHT / 2, ROOM_CENTER_Z],
      rotation: [0, -Math.PI / 2, 0],
      width: ROOM_DEPTH,
    },
    {
      key: 'right',
      position: [ROOM.maxX, CEILING_HEIGHT / 2, ROOM_CENTER_Z],
      rotation: [0, Math.PI / 2, 0],
      width: ROOM_DEPTH,
    },
  ]

  return (
    <group>
      {walls.map((wall) => (
        <mesh key={wall.key} position={wall.position} rotation={wall.rotation} receiveShadow>
          <planeGeometry args={[wall.width, CEILING_HEIGHT]} />
          <meshStandardMaterial color="#2e1c3d" roughness={0.95} side={BackSide} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The barrel vault, and the ribs that make it read as coffered.
 *
 * A cylinder segment lying along z, seen from inside. The ribs are geometry
 * because a rib is silhouette — it breaks the ceiling's edge against the neon
 * running along the springing, and shading cannot do that. Everything inside a
 * rib is flat and lives in the texture instead, which is what keeps this to
 * twenty-one meshes rather than a coffer box per bay.
 */
function Vault() {
  const bays = RIB_COUNT_ACROSS - 1
  const rows = Math.round(ROOM_DEPTH / RIB_SPACING_Z)

  const panels = useMemo(() => getCofferTexture(bays, rows), [bays, rows])
  const panelNormal = useMemo(() => getCofferNormalTexture(bays, rows), [bays, rows])

  /** Each longitudinal rib's angle round the vault, springing to springing. */
  const ribAngles = useMemo(
    () =>
      Array.from(
        { length: RIB_COUNT_ACROSS },
        (_, index) => -VAULT_HALF_ANGLE + (index / (RIB_COUNT_ACROSS - 1)) * VAULT_HALF_ANGLE * 2,
      ),
    [],
  )

  const transverseZ = useMemo(
    () => Array.from({ length: rows + 1 }, (_, index) => ROOM.minZ + index * RIB_SPACING_Z),
    [rows],
  )

  // A flat ceiling is a legitimate configuration — see VAULT_RISE — and a
  // cylinder of radius zero is not, so the whole vault degrades to a plane.
  if (VAULT_RISE <= 0) {
    return (
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, WALL_HEIGHT, ROOM_CENTER_Z]}
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial map={panels} normalMap={panelNormal} roughness={0.85} />
      </mesh>
    )
  }

  return (
    <group position={[ROOM_CENTER_X, VAULT_CENTER_Y, ROOM_CENTER_Z]}>
      {/*
        The vault surface. Rotated so the cylinder's axis lies along z, and
        `thetaStart` swung so the segment sits overhead rather than to one side.

        The swing is `Math.PI`, not `Math.PI / 2`, and the difference is a
        quarter turn of ceiling. A cylinder vertex is `(r·sinθ, y, r·cosθ)`, and
        the rotation maps local `-z` to world up — so the segment is overhead
        where `cosθ = -1`, at θ = π, and edge-on at θ = π/2. Set to π/2 the
        whole surface stood off to one side of the room while the ribs, which
        are placed by their own trigonometry, arched correctly overhead. The
        result looked like a vault: what showed between the ribs was the wall
        behind them.
      */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry
          args={[
            VAULT_RADIUS,
            VAULT_RADIUS,
            ROOM_DEPTH,
            48,
            1,
            true,
            Math.PI - VAULT_HALF_ANGLE,
            VAULT_HALF_ANGLE * 2,
          ]}
        />
        <meshStandardMaterial
          map={panels}
          normalMap={panelNormal}
          roughness={0.88}
          side={BackSide}
        />
      </mesh>

      {/*
        Two lamps washing the vault along its length.

        The chandelier lights the bay it hangs in and nothing else, so past
        about the middle of the room the coffers went dark and the ceiling
        stopped at a soft line across it. These sit low in the vault and well
        out from the springing on both counts — two metres below the surface
        they light and two metres in from the wall — because a lamp any closer
        to either grows a bright spot the bloom pass turns into a floating orb.
      */}
      {[-ROOM_DEPTH * 0.3, ROOM_DEPTH * 0.3].map((z) => (
        <pointLight
          key={z}
          position={[0, VAULT_RADIUS - VAULT_RISE - 0.6, z]}
          color="#e8d6b4"
          intensity={30}
          distance={17}
        />
      ))}

      {/* Longitudinal ribs: straight mouldings running the room's length. */}
      {ribAngles.map((angle) => (
        <mesh
          key={angle}
          position={[
            Math.sin(angle) * (VAULT_RADIUS - 0.07),
            Math.cos(angle) * (VAULT_RADIUS - 0.07),
            0,
          ]}
          rotation={[0, 0, -angle]}
        >
          <boxGeometry args={[0.16, 0.14, ROOM_DEPTH]} />
          <meshStandardMaterial color="#cbbea3" roughness={0.7} />
        </mesh>
      ))}

      {/* Transverse ribs: arcs across it, as torus segments on the same radius. */}
      {transverseZ.map((z) => (
        <mesh
          key={z}
          position={[0, 0, z - ROOM_CENTER_Z]}
          rotation={[0, 0, Math.PI / 2 - VAULT_HALF_ANGLE]}
        >
          <torusGeometry args={[VAULT_RADIUS - 0.07, 0.07, 6, 40, VAULT_HALF_ANGLE * 2]} />
          <meshStandardMaterial color="#cbbea3" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * The floor, in bands: polished stone everywhere, two rugs, a marble runner.
 *
 * The reference's floor is four materials in strips and ours was one carpet
 * edge to edge, which is what made nineteen metres of room read as a single rug
 * with furniture standing on it. Every band's extent comes from
 * `casinoFloorLayout.ts`; nothing here is placed by eye.
 */
function Floor() {
  const stone = useMemo(
    () => getStoneFloorTexture(Math.round(ROOM_WIDTH / 2.4), Math.round(ROOM_DEPTH / 2.4)),
    [],
  )
  const aisle = useMemo(() => getMarbleTexture(1, Math.round(AISLE_LENGTH / 2.4)), [])

  return (
    <group>
      {/* The ground: polished stone under the whole room. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROOM_CENTER_X, 0.002, ROOM_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial map={stone} roughness={0.32} metalness={0.28} />
      </mesh>

      {/* A rug per table, each drawn at its own size so its border fits it. */}
      {TABLE_IDS.map((table) => {
        const field = CARPET_FIELDS[table]
        const width = field.maxX - field.minX
        const depth = field.maxZ - field.minZ

        return (
          <mesh
            key={table}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[(field.minX + field.maxX) / 2, 0.006, (field.minZ + field.maxZ) / 2]}
            receiveShadow
          >
            <planeGeometry args={[width, depth]} />
            <meshStandardMaterial map={getRugTexture(width, depth)} roughness={0.94} />
          </mesh>
        )
      })}

      {/*
        The marble runner, in the gap the two tables leave. Its width is
        `AISLE_WIDTH`, which is that gap — see the layout module. It sits on the
        stone rather than on a rug, so it needs no edging to separate it from
        anything: `AISLE_MARGIN` of stone does that on both sides.
      */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[AISLE_CENTER_X, 0.008, AISLE_CENTER_Z]}
        receiveShadow
      >
        <planeGeometry args={[AISLE_WIDTH, AISLE_LENGTH]} />
        {/* Matte. A polished runner mirrors the chandelier straight back up. */}
        <meshStandardMaterial map={aisle} roughness={0.88} />
      </mesh>

      {/* Brass inlay along the joint between marble and stone. */}
      {[AISLE_CENTER_X - AISLE_WIDTH / 2, AISLE_CENTER_X + AISLE_WIDTH / 2].map((x) => (
        <mesh key={x} position={[x, 0.014, AISLE_CENTER_Z]}>
          <boxGeometry args={[0.05, 0.02, AISLE_LENGTH]} />
          <meshStandardMaterial color="#9c7c36" roughness={0.35} metalness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** Warm pendant over a table, matching the one the fixed camera used to see. */
function Pendant({ position }: { position: readonly [number, number, number] }) {
  /*
   * The drop is measured from the ceiling at this lamp's own x, not written
   * down. It used to be `WALL_HEIGHT - 3.6` — one number, correct under a flat
   * lid and wrong everywhere but the centre line under a curved one. The
   * blackjack pendant sits at `x = -7.5`, four metres off centre, where the
   * vault is a good half-metre lower than at the crown; a fixed cable there
   * either stops short in mid-air or disappears up through the ceiling.
   */
  const dropHeight = vaultHeightAt(position[0]) - 3.6

  return (
    <group position={[position[0], 3.6, position[2]]}>
      <mesh position={[0, dropHeight / 2, 0]}>
        <cylinderGeometry args={[0.018, 0.018, dropHeight, 6]} />
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

/**
 * The chandelier over the aisle.
 *
 * Emissive rings rather than modelled drops, and one light. It hangs above the
 * walking camera's eyeline and is caught at the top of the frame on the way in
 * — a hundred glass beads would be a hundred meshes for something nobody ever
 * looks straight at.
 */
function Chandelier() {
  const tiers = [
    { radius: 0.95, y: 0, count: 14 },
    { radius: 0.68, y: -0.42, count: 10 },
    { radius: 0.36, y: -0.78, count: 6 },
  ]

  return (
    <group position={[AISLE_CENTER_X, WALL_HEIGHT - 1.5, 2.2]}>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.9, 6]} />
        <meshStandardMaterial color="#3a2f1c" roughness={0.6} metalness={0.6} />
      </mesh>

      {tiers.map((tier) => (
        <group key={tier.radius} position={[0, tier.y, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[tier.radius, 0.022, 6, 24]} />
            <meshStandardMaterial color="#c9a34c" roughness={0.25} metalness={0.95} />
          </mesh>
          {Array.from({ length: tier.count }, (_, index) => {
            const angle = (index / tier.count) * Math.PI * 2
            return (
              <mesh
                key={angle}
                position={[
                  Math.cos(angle) * tier.radius,
                  -0.12,
                  Math.sin(angle) * tier.radius,
                ]}
              >
                <octahedronGeometry args={[0.075]} />
                <meshBasicMaterial color="#ffe9bd" toneMapped={false} />
              </mesh>
            )
          })}
        </group>
      ))}

      <pointLight position={[0, -0.3, 0]} color="#ffdca8" intensity={26} distance={11} />
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
        the far wall is now eighteen units from the entrance, and at the old
        setting it dissolved into the background colour — the room read as a
        void with two lit tables floating in it.
      */}
      <fog attach="fog" args={['#0b0611', 30, 72]} />

      {/*
        Brighter than the old fixed-camera scene, which could afford near-black
        everywhere but the one lit table because you could never walk into the
        dark. A room you cross has to be legible all the way across it.
      */}
      <ambientLight intensity={0.62} color="#b9a7d8" />

      {/* Cool fill from the entrance end, so the near side is not solid black. */}
      <pointLight
        position={[ROOM_CENTER_X, 3, ROOM.maxZ - 1.5]}
        color="#6f7ae0"
        intensity={45}
        distance={24}
      />
      {/*
        House colour washing the side walls at the far end. It used to sit a
        metre off the back wall, which is now the cascade — putting a magenta
        wash directly behind the one cool-lit thing in the room.
      */}
      <pointLight
        position={[ROOM_CENTER_X, 3.4, WATER_COURT.maxZ + 3]}
        color={neonColor}
        intensity={48}
        distance={20}
      />

      <Shell />
      <Vault />
      <Floor />

      <Colonnade neonColor={neonColor} />
      <WaterCourt />
      <Chandelier />

      {PALMS.map(([x, z], index) => (
        <PottedPalm key={`${x}:${z}`} position={[x, z]} rotation={index * 0.7} />
      ))}

      {/*
        Neon coving along the springing, on both long walls.

        It used to run across the room on the two short walls, which put it on
        the wall the camera faces and the one behind it — the two a player
        walking the length of the room looks at least. Two lines rather than
        one: a single strip reads as a strip light, and a pair reads as neon.
      */}
      {COVING_X.map((x) =>
        [
          { offset: 0, color: neonColor },
          { offset: COVING_GAP, color: '#5ee8ff' },
        ].map(({ offset, color }) => (
          <mesh
            key={`${x}:${offset}`}
            position={[x + (x < ROOM_CENTER_X ? 0.06 : -0.06), COVING_Y - offset, ROOM_CENTER_Z]}
          >
            <boxGeometry args={[0.09, 0.1, ROOM_DEPTH - 0.5]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        )),
      )}

      {TABLE_IDS.map((table) => (
        <Pendant key={table} position={tableOrigin(table)} />
      ))}

      {/* The way out, back onto the strip. */}
      <ExitDoor position={EXIT_DOOR} accent={neonColor} />
    </>
  )
}
