import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'
import { useCallback, useMemo, useRef } from 'react'
import { DoubleSide, ExtrudeGeometry, Shape } from 'three'
import { chipStake, totalCrapsStake } from '../../games/craps/engine'
import { useAppearanceStore } from '../../store/useAppearanceStore'
import { useCrapsStore } from '../../store/useCrapsStore'
import { useGameStore } from '../../store/useGameStore'
import { usePresenceStore } from '../../store/usePresenceStore'
import { crapsRailIndex, TableId } from '../casinoFloorLayout'
import { CRAPS_CHIP_SCALE, heldChipValue, playerChipRing } from '../chipLayout'
import { buildBandGeometry, buildRingGeometry } from '../bandGeometry'
import { ChipStack } from './ChipStack'
import { CrapsDice } from './CrapsDice'
import {
  betChipSlot,
  CrapsBet,
  hitTestCrapsFelt,
  pointPuckSpot,
} from '../crapsFeltLayout'
import { getCrapsFeltTexture, setCrapsFeltHighlight } from '../crapsFeltTexture'
import {
  APRON_BOTTOM_Y,
  BASE_MOULDING_BOTTOM_Y,
  CHIP_CHANNEL_DEPTH,
  CHIP_CHANNEL_OFFSET,
  CHIP_CHANNEL_WIDTH,
  DRINK_HOLDER_RADIUS,
  DRINK_HOLDERS,
  feltShapeUv,
  feltToWorld,
  feltUvToLayout,
  INNER_CORNER_RADIUS,
  OUTER_HALF_DEPTH,
  OUTER_HALF_WIDTH,
  outerOutline,
  PIT_HALF_DEPTH,
  PIT_HALF_WIDTH,
  PIT_WALL_HEIGHT,
  pitOutline,
  PLINTH_HEIGHT,
  PLINTH_INSET,
  PUCK_OFF_POSITION,
  PUCK_RADIUS,
  RAIL_TOP_Y,
  roundedRectOutline,
  SURFACE_Y,
  TABLE_TOP_Y,
  WALL_RESTITUTION,
} from '../crapsTableLayout'
import {
  getChipChannelTexture,
  getPitBumperTexture,
  getRailWoodTexture,
} from '../crapsTableTexture'

/*
 * The table's footprint, its rail and everything let into that rail live in
 * `../crapsTableLayout`, where they are asserted against the pit outline. Same
 * rule the blackjack table follows, and for the same reason: hand-derived
 * geometry on this project has produced real bugs, and a drink holder cutting
 * through the chip channel is not something a screenshot makes obvious.
 */

/** How many points round each corner of the outline. Higher is smoother. */
const CORNER_SEGMENTS = 14

/** Texture repeats per metre, chosen so nothing reads as obviously tiled. */
const BUMPER_TILES_PER_METRE = 3.4
const WOOD_TILES_PER_METRE = 0.62
const APRON_TILES_PER_METRE = 0.4
/** One repeat per chip slot, so this is the slot pitch in slots per metre. */
const CHANNEL_SLOTS_PER_METRE = 9

/** Physics wall segments, as half-extents with a rotation about y. */
interface WallSegment {
  readonly position: readonly [number, number, number]
  readonly halfExtents: readonly [number, number, number]
  readonly rotationY: number
}

/**
 * The colliders that keep the dice in the pit.
 *
 * The pit is a stadium now, so four straight walls no longer close it: a die in
 * a corner would find a wedge of open space between the end of one wall and the
 * start of the next and leave the table through it. The corners get their own
 * segments, angled across the diagonal, which is a flat chamfer rather than a
 * true arc — near enough at a 0.32 radius, and a chamfer is a cuboid, which
 * `CuboidCollider` can express and a rounded corner cannot.
 */
function buildWalls(height: number): WallSegment[] {
  const straightHalfX = PIT_HALF_WIDTH - INNER_CORNER_RADIUS
  const straightHalfZ = PIT_HALF_DEPTH - INNER_CORNER_RADIUS
  // Deep enough that a fast die cannot step past it between frames, on top of
  // the continuous collision detection the dice already run with.
  const thickness = 0.12
  const midY = TABLE_TOP_Y + height / 2

  const walls: WallSegment[] = [
    {
      position: [0, midY, -(PIT_HALF_DEPTH + thickness)],
      halfExtents: [straightHalfX, height / 2, thickness],
      rotationY: 0,
    },
    {
      position: [0, midY, PIT_HALF_DEPTH + thickness],
      halfExtents: [straightHalfX, height / 2, thickness],
      rotationY: 0,
    },
    {
      position: [-(PIT_HALF_WIDTH + thickness), midY, 0],
      halfExtents: [thickness, height / 2, straightHalfZ],
      rotationY: 0,
    },
    {
      position: [PIT_HALF_WIDTH + thickness, midY, 0],
      halfExtents: [thickness, height / 2, straightHalfZ],
      rotationY: 0,
    },
  ]

  // A chamfer across each corner, seated so its inner face touches the arc at
  // the 45 degree point and overlapping both straight walls at its ends.
  const chord = INNER_CORNER_RADIUS * Math.SQRT2
  const reach = INNER_CORNER_RADIUS * (1 - Math.SQRT1_2)

  for (const signX of [-1, 1]) {
    for (const signZ of [-1, 1]) {
      walls.push({
        position: [
          signX * (straightHalfX + INNER_CORNER_RADIUS - reach / 2 + thickness / 2),
          midY,
          signZ * (straightHalfZ + INNER_CORNER_RADIUS - reach / 2 + thickness / 2),
        ],
        halfExtents: [chord / 2 + thickness, height / 2, thickness],
        // The chamfer runs along the corner's diagonal; the sign pairing decides
        // which of the two diagonals.
        rotationY: (signX * signZ > 0 ? -1 : 1) * (Math.PI / 4),
      })
    }
  }

  return walls
}

/**
 * The rail: polished wood, a chip channel cut into it, and brass drink holders.
 *
 * Separated out because it is the table's whole silhouette. The old rail was
 * four brown slabs standing on a box; the reference is a moulding that wraps
 * the pit in one unbroken sweep, and the difference between those two is most
 * of what makes the table read as furniture.
 */
function TableRail() {
  const wood = useMemo(() => getRailWoodTexture(), [])
  const channelMap = useMemo(() => getChipChannelTexture(), [])

  const geometries = useMemo(() => {
    const inner = pitOutline(CORNER_SEGMENTS)
    const outer = outerOutline(CORNER_SEGMENTS)

    // The channel is modelled as a recessed floor between two shoulders rather
    // than cut out of the rail top, which would need a boolean. Two rings and a
    // band do the same job with geometry three.js can build directly.
    const channelInner = roundedRectOutline(
      PIT_HALF_WIDTH + CHIP_CHANNEL_OFFSET - CHIP_CHANNEL_WIDTH / 2,
      PIT_HALF_DEPTH + CHIP_CHANNEL_OFFSET - CHIP_CHANNEL_WIDTH / 2,
      INNER_CORNER_RADIUS + CHIP_CHANNEL_OFFSET - CHIP_CHANNEL_WIDTH / 2,
      CORNER_SEGMENTS,
    )
    const channelOuter = roundedRectOutline(
      PIT_HALF_WIDTH + CHIP_CHANNEL_OFFSET + CHIP_CHANNEL_WIDTH / 2,
      PIT_HALF_DEPTH + CHIP_CHANNEL_OFFSET + CHIP_CHANNEL_WIDTH / 2,
      INNER_CORNER_RADIUS + CHIP_CHANNEL_OFFSET + CHIP_CHANNEL_WIDTH / 2,
      CORNER_SEGMENTS,
    )

    return {
      innerShoulder: buildRingGeometry(inner, channelInner, RAIL_TOP_Y, WOOD_TILES_PER_METRE),
      outerShoulder: buildRingGeometry(channelOuter, outer, RAIL_TOP_Y, WOOD_TILES_PER_METRE),
      channelFloor: buildRingGeometry(
        channelInner,
        channelOuter,
        RAIL_TOP_Y - CHIP_CHANNEL_DEPTH,
        CHANNEL_SLOTS_PER_METRE,
      ),
      channelWalls: [
        buildBandGeometry(channelInner, RAIL_TOP_Y - CHIP_CHANNEL_DEPTH, RAIL_TOP_Y, {
          inward: false,
          tilesPerMetre: CHANNEL_SLOTS_PER_METRE,
        }),
        buildBandGeometry(channelOuter, RAIL_TOP_Y - CHIP_CHANNEL_DEPTH, RAIL_TOP_Y, {
          inward: true,
          tilesPerMetre: CHANNEL_SLOTS_PER_METRE,
        }),
      ],
      // The outer face of the moulding, down to where the apron takes over.
      outerFace: buildBandGeometry(outer, TABLE_TOP_Y - 0.02, RAIL_TOP_Y, {
        inward: false,
        tilesPerMetre: WOOD_TILES_PER_METRE,
      }),
      // The inner face, above the bumper, closing the gap to the rail top.
      innerFace: buildBandGeometry(inner, TABLE_TOP_Y + PIT_WALL_HEIGHT, RAIL_TOP_Y, {
        inward: true,
        tilesPerMetre: WOOD_TILES_PER_METRE,
      }),
    }
  }, [])

  return (
    <group>
      {[geometries.innerShoulder, geometries.outerShoulder, geometries.outerFace, geometries.innerFace].map(
        (geometry, index) => (
          <mesh key={index} geometry={geometry} castShadow receiveShadow>
            {/*
              Lacquered, not raw: the reference's rail is the one surface in the
              room that mirrors the neon, and a matte rail loses it. Not a
              mirror either — at roughness 0.22 the pendant burned a hard white
              blob into the near corner, which bloom then turned into a lamp.
            */}
            <meshStandardMaterial map={wood} roughness={0.34} metalness={0.12} />
          </mesh>
        ),
      )}

      <mesh geometry={geometries.channelFloor} receiveShadow>
        <meshStandardMaterial map={channelMap} roughness={0.6} metalness={0.05} />
      </mesh>
      {geometries.channelWalls.map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial map={channelMap} roughness={0.6} metalness={0.05} />
        </mesh>
      ))}

      {DRINK_HOLDERS.map((holder) => (
        <group key={`${holder.x},${holder.z}`} position={[holder.x, RAIL_TOP_Y, holder.z]}>
          {/* Brass collar, sunk flush with the rail top. */}
          <mesh position={[0, -0.004, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[DRINK_HOLDER_RADIUS, 0.012, 8, 24]} />
            <meshStandardMaterial color="#c9992f" roughness={0.24} metalness={0.9} />
          </mesh>
          {/* The well inside it, dark enough to read as a hole. */}
          <mesh position={[0, -0.035, 0]}>
            <cylinderGeometry args={[DRINK_HOLDER_RADIUS, DRINK_HOLDER_RADIUS * 0.9, 0.06, 20]} />
            <meshStandardMaterial color="#120a06" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * How far the pointer may travel between press and release and still be a bet.
 *
 * The table camera orbits on drag, so every click is also the start of a look.
 * Without a threshold, swinging the view round to read the far numbers drops a
 * chip on whatever happened to be under the cursor when the button came up.
 */
const CLICK_SLOP_PX = 5

/** Stable empty lineup, so a selector does not hand back a new one each render. */
const EMPTY_LINEUP: readonly string[] = []

/** The craps table: felt, rails, chips on the bets, and the dice in the pit. */
export function CrapsTable() {
  const game = useCrapsStore((state) => state.game)
  const rollId = useCrapsStore((state) => state.rollId)
  const isRolling = useCrapsStore((state) => state.isRolling)
  const wager = useCrapsStore((state) => state.wager)
  const pickedChip = useCrapsStore((state) => state.heldChip)
  const bankroll = useGameStore((state) => state.bankroll)

  /*
   * Who else has money on this felt, read straight from the presence store —
   * deliberately not through `useSharedCraps`, whose effects publish to the
   * room and are already mounted twice. Everything read here is display-only:
   * `crapsStakes` is other people's records, drawn and never spent.
   */
  const selfId = usePresenceStore((state) => state.selfId)
  const shooterId = usePresenceStore((state) => state.shooters[TableId.Craps] ?? null)
  const lineup = usePresenceStore((state) => state.lineups[TableId.Craps] ?? EMPTY_LINEUP)
  const crapsStakes = usePresenceStore((state) => state.crapsStakes)
  const peers = usePresenceStore((state) => state.peers)
  const ownAppearance = useAppearanceStore((state) => state.appearance)

  /*
   * This player's slot along every bet region: their rail index. Solo — no
   * self id, empty lineup — this is slot 0, which `betChipSlot` maps to
   * exactly the spot a lone bettor's chips have always sat on.
   */
  const mySlot =
    selfId !== null && lineup.includes(selfId) ? crapsRailIndex(selfId, shooterId, lineup) : 0

  /** Where the pointer went down, so a drag can be told from a click. */
  const pressedAt = useRef<{ x: number; y: number } | null>(null)

  /**
   * The bet under a raycast on the felt.
   *
   * The UV a raycast reports is the geometry's own attribute — shape
   * coordinates in metres — so it goes through `feltUvToLayout` before the hit
   * test, which is where the material's rescaling and the texture's flipY are
   * undone. Handing the raw value straight over answers about somewhere else on
   * the table.
   */
  const betUnder = useCallback((uv: { x: number; y: number } | undefined) => {
    if (!uv) return null
    const layout = feltUvToLayout(uv.x, uv.y)
    return hitTestCrapsFelt(layout.u, layout.v)
  }, [])

  const felt = useMemo(() => {
    const texture = getCrapsFeltTexture()
    // `ExtrudeGeometry` writes raw shape coordinates as cap UVs, so the repeat
    // and offset rescale them into 0..1 rather than rewriting the attribute —
    // the same trick the blackjack slab uses.
    texture.repeat.set(1 / (PIT_HALF_WIDTH * 2), 1 / (PIT_HALF_DEPTH * 2))
    texture.offset.set(0.5, 0.5)
    return texture
  }, [])

  const bumper = useMemo(() => getPitBumperTexture(), [])
  const wood = useMemo(() => getRailWoodTexture(), [])

  const feltGeometry = useMemo(() => {
    const shape = new Shape()
    pitOutline(CORNER_SEGMENTS).forEach((point, index) => {
      // Through `feltShapeUv`, which names this convention, so the geometry and
      // anything reading a raycast off it cannot drift apart.
      const { u, v } = feltShapeUv(point.x, point.z)
      if (index === 0) shape.moveTo(u, v)
      else shape.lineTo(u, v)
    })
    shape.closePath()
    return new ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false })
  }, [])

  const bumperGeometry = useMemo(
    () =>
      buildBandGeometry(pitOutline(CORNER_SEGMENTS), TABLE_TOP_Y, TABLE_TOP_Y + PIT_WALL_HEIGHT, {
        inward: true,
        tilesPerMetre: BUMPER_TILES_PER_METRE,
      }),
    [],
  )

  const apronGeometry = useMemo(
    () =>
      buildBandGeometry(outerOutline(CORNER_SEGMENTS), APRON_BOTTOM_Y, TABLE_TOP_Y - 0.02, {
        inward: false,
        tilesPerMetre: APRON_TILES_PER_METRE,
      }),
    [],
  )

  const baseMouldingGeometry = useMemo(
    () =>
      buildBandGeometry(outerOutline(CORNER_SEGMENTS), BASE_MOULDING_BOTTOM_Y, APRON_BOTTOM_Y, {
        inward: false,
        tilesPerMetre: WOOD_TILES_PER_METRE,
      }),
    [],
  )

  const walls = useMemo(() => buildWalls(PIT_WALL_HEIGHT + 0.16), [])

  return (
    <group>
      {/* The felt bed, filling the pit floor — and the betting surface. Every
          marking on it is already exactly where its bet is, which is what the
          hit test in `crapsFeltLayout` was written for. */}
      <mesh
        geometry={feltGeometry}
        position={[0, TABLE_TOP_Y - 0.1, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onPointerMove={(event) => {
          event.stopPropagation()
          setCrapsFeltHighlight(isRolling ? null : betUnder(event.uv))
        }}
        onPointerOut={() => setCrapsFeltHighlight(null)}
        onPointerDown={(event) => {
          pressedAt.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          const pressed = pressedAt.current
          pressedAt.current = null
          if (!pressed || isRolling) return

          // A look, not a bet.
          const travelled = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y)
          if (travelled > CLICK_SLOP_PX) return

          const bet = betUnder(event.uv)
          if (!bet) return

          // The same call the bar's cells make, through the same guard, so the
          // felt cannot lay a bet the panel would have refused.
          const stake = chipStake(game, bet, heldChipValue(pickedChip, bankroll))
          if (stake > 0) wager(bet, stake)
        }}
      >
        <meshStandardMaterial attach="material-0" map={felt} roughness={0.96} />
        <meshStandardMaterial attach="material-1" color="#0a2a1e" roughness={0.9} />
      </mesh>

      {/* Pyramid-rubber bumper: what the dice actually bounce off, and the one
          surface that says craps from across the room. */}
      <mesh geometry={bumperGeometry} receiveShadow>
        <meshStandardMaterial map={bumper} roughness={0.78} metalness={0.02} side={DoubleSide} />
      </mesh>

      <TableRail />

      {/* Apron: the table's body, below the rail and above the plinth. */}
      <mesh geometry={apronGeometry} castShadow receiveShadow>
        {/* Darker than the rail: the moulding is the polished piece, and an
            apron lit to match it flattens the table into one slab. */}
        <meshStandardMaterial map={wood} color="#4a3225" roughness={0.66} metalness={0.04} />
      </mesh>

      {/* Base moulding: the same lacquered wood as the rail, so the table has a
          bottom edge that reads from across the floor rather than dissolving
          into its own shadow. */}
      <mesh geometry={baseMouldingGeometry} castShadow receiveShadow>
        <meshStandardMaterial map={wood} roughness={0.36} metalness={0.1} />
      </mesh>

      {/* Underside, so the body does not read as a hollow shell from a low
          camera. */}
      <mesh position={[0, BASE_MOULDING_BOTTOM_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[OUTER_HALF_WIDTH * 2, OUTER_HALF_DEPTH * 2]} />
        <meshStandardMaterial color="#100a12" roughness={0.95} />
      </mesh>

      {/* Plinth, inset so the apron overhangs it and the table appears to
          stand rather than sit in a block. */}
      <mesh position={[0, PLINTH_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[
            (OUTER_HALF_WIDTH - PLINTH_INSET) * 2,
            PLINTH_HEIGHT,
            (OUTER_HALF_DEPTH - PLINTH_INSET) * 2,
          ]}
        />
        <meshStandardMaterial color="#150c18" roughness={0.9} />
      </mesh>

      {/* The ON puck, parked over the established point. Off to the side and
          face down while the table is coming out. Sits in the top half of the
          box, leaving the bottom half for whatever is placed on the number —
          which is usually the point, because the point is what people back. */}
      {(() => {
        const onPoint = game.point !== null
        const [x, z] = onPoint
          ? (() => {
              const spot = pointPuckSpot(game.point!)
              const world = feltToWorld(spot.u, spot.v)
              return [world[0], world[2]] as const
            })()
          : PUCK_OFF_POSITION

        return (
          <mesh position={[x, SURFACE_Y + 0.02, z]} castShadow>
            <cylinderGeometry args={[PUCK_RADIUS, PUCK_RADIUS, 0.035, 20]} />
            <meshStandardMaterial
              color={onPoint ? '#f2f0ea' : '#1a1118'}
              roughness={0.6}
              emissive={onPoint ? '#5a5348' : '#000000'}
              emissiveIntensity={0.35}
            />
          </mesh>
        )
      })()}

      {/* This player's chips, on their own slot of each bet — the engine's
          record, the one that actually holds their money. */}
      {Object.values(CrapsBet).map((bet) => {
        const amount = game.bets[bet]
        if (amount <= 0) return null

        const spot = betChipSlot(bet, mySlot)
        return (
          <ChipStack
            key={bet}
            amount={amount}
            position={feltToWorld(spot.u, spot.v)}
            scale={CRAPS_CHIP_SCALE}
            ring={playerChipRing(ownAppearance)}
          />
        )
      })}

      {/*
        Everyone else's chips, from the records they published (issue #18).
        Display-only: these amounts are drawn and never spent — the engine
        knows nothing of them, and the lineup gate means a player who walks
        away takes their stacks with them even before the room says `left`.
        Whose stack is whose reads two ways: the slot in front of the owner's
        rail spot, and the ring under it in the owner's garment colour.
      */}
      {Object.entries(crapsStakes).map(([id, stakes]) => {
        if (id === selfId || !lineup.includes(id)) return null
        const slot = crapsRailIndex(id, shooterId, lineup)
        const ring = peers[id] ? playerChipRing(peers[id].appearance) : undefined
        return Object.values(CrapsBet).map((bet) => {
          const amount = stakes[bet]
          if (amount <= 0) return null

          const spot = betChipSlot(bet, slot)
          return (
            <ChipStack
              key={`${id}:${bet}`}
              amount={amount}
              position={feltToWorld(spot.u, spot.v)}
              scale={CRAPS_CHIP_SCALE}
              ring={ring}
            />
          )
        })
      })}

      {/*
        Physics is scoped to this table alone. The strip's character and the
        blackjack table are transform-driven and never touch rapier, which is
        the boundary SPEC drew on day one and it has held.
      */}
      {/*
        Fixed timestep, not "vary". A varying step ties the simulation to the
        frame rate, and on a slow frame the dice travel further than they are
        thick and pass straight through the table — which is exactly what
        happened: one die was found at y = -18, having tunnelled out of the
        world entirely.
      */}
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
        {/*
          Explicit colliders rather than colliders inferred from meshes. The
          first version wrapped `visible={false}` meshes, which produced no
          colliders at all — the dice fell straight through the table and out
          of the world, and nothing on screen said so.
        */}
        <RigidBody type="fixed" colliders={false}>
          {/* Deep rather than thin: the surface is what matters, but the
              depth is cheap insurance against a fast die punching through. */}
          <CuboidCollider
            args={[OUTER_HALF_WIDTH, 0.4, OUTER_HALF_DEPTH]}
            position={[0, TABLE_TOP_Y - 0.4, 0]}
          />
          {walls.map((wall, index) => (
            <CuboidCollider
              key={index}
              args={[...wall.halfExtents]}
              position={[...wall.position]}
              rotation={[0, wall.rotationY, 0]}
              // The walls answer a throw, the felt does not: rapier averages
              // the two surfaces of a contact, and a wall left at the default
              // 0 halves the die's own restitution into a bounce that dies at
              // the far end instead of coming back down the table.
              restitution={WALL_RESTITUTION}
            />
          ))}
        </RigidBody>

        <CrapsDice roll={game.lastRoll} rollId={rollId} />
      </Physics>

      {/* Total on the felt, for the HUD to read against. */}
      <group userData={{ staked: totalCrapsStake(game) }} />
    </group>
  )
}
