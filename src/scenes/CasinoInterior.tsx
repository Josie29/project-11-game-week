import { PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { DEALER_APPEARANCE } from '../character/appearance'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { getVenue, type VenueId } from '../world/venues'
import {
  CAMERA_BOUNDS,
  DEALER_SPOTS,
  EXIT_DOOR,
  EXIT_RADIUS,
  SEATS,
  SIT_RADIUS,
  SIT_SPOTS,
  TABLE_FOOTPRINTS,
  TABLE_IDS,
  tableOrigin,
  TableId,
  WALK_BOUNDS,
} from './casinoFloorLayout'
import { BlackjackTable } from './components/BlackjackTable'
import { CasinoCharacter } from './components/CasinoCharacter'
import { CasinoRoom } from './components/CasinoRoom'
import { CrapsTable } from './components/CrapsTable'
import { Stool } from './components/Stool'
import { WalkingPlayer, type ProximityTarget } from './components/WalkingPlayer'
import { useOrbitInput } from './useOrbitInput'

interface CasinoInteriorProps {
  venueId: VenueId
}

/**
 * Stools around the blackjack table's arc, in the table's own local frame.
 *
 * Positioned to sit just outside the rail, roughly behind each betting spot
 * printed on the felt, so the seats line up with the places you can bet.
 */
const STOOLS: readonly { x: number; z: number }[] = [
  { x: -2.6, z: 2.5 },
  { x: -1.35, z: 2.85 },
  { x: 0, z: 2.95 },
  { x: 1.35, z: 2.85 },
  { x: 2.6, z: 2.5 },
]

/**
 * Where each table's camera looks, in that table's own local frame.
 *
 * These are the values the fixed camera used before the tables moved into a
 * room. The tables are translated and never rotated, so the world target is
 * just this plus the table's origin — which is what keeps the seated framing
 * identical to what shipped.
 */
const LOCAL_TARGETS: Record<TableId, readonly [number, number, number]> = {
  // Roughly the middle of the felt.
  [TableId.Blackjack]: [0.15, 1.05, 0.45],
  /*
   * The craps table is smaller and centred, and its printed layout is the game.
   * Aimed a little past the middle toward the boxman, because the control bar
   * covers the lower third of the screen and the pass line — the biggest, most
   * bet-on marking on the felt, and the one the layout is built around — sits
   * on the near edge. Centred on the felt it was half behind the HUD.
   */
  [TableId.Craps]: [0, 1.05, -0.22],
}

/*
 * Opening view, as an orbit rather than a position. Both closer and steeper
 * than the original fixed shot: at the old distance and eyeline a card was
 * about sixty pixels wide and seen near edge-on, which is legible in principle
 * and a squint in practice. The cards should be readable before anyone touches
 * the controls.
 */
const DEFAULT_YAW = -0.2925
const DEFAULT_PITCH = 0.52
const DEFAULT_DISTANCE = 5.8
const CRAPS_DISTANCE = 5.1
const CRAPS_PITCH = 0.72

/*
 * Limits. The near limit is set by the seated player, not by taste: closer than
 * this and the camera ends up inside their head, because they sit a good way
 * back from the felt. The pitch floor keeps the view above the rail, and the
 * yaw range lets you swing right around the player's side of the table without
 * ending up behind the dealer looking into the void.
 */
const MIN_DISTANCE = 4.3
const MAX_DISTANCE = 9.5
/*
 * Pitch floor is about readability, not taste. The cards lie flat on the felt,
 * so at a low enough eyeline they go edge-on and vanish — the first version
 * allowed almost table level and made them impossible to read. The ceiling is
 * generous because looking straight down is the best card-reading angle there
 * is.
 */
const MIN_PITCH = 0.3
const MAX_PITCH = 1.25
const YAW_RANGE = 1.4

/** Higher is snappier; keeps the camera from snapping between frames. */
const ORBIT_DAMPING = 12

/** Scratch vector, reused so the orbit loop allocates nothing. */
const DESIRED = new Vector3()

/**
 * Orbit camera over a table: drag to look, scroll to zoom, R to reset.
 *
 * Input handling is shared with the walking camera via `useOrbitInput`; only
 * the limits and what it looks at differ.
 */
function TableCamera({ table }: { table: TableId }) {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const defaultCamera = useThree((state) => state.camera)

  const isCraps = table === TableId.Craps

  const target = useMemo(() => {
    const [originX, , originZ] = tableOrigin(table)
    const [localX, localY, localZ] = LOCAL_TARGETS[table]
    return new Vector3(originX + localX, localY, originZ + localZ)
  }, [table])

  const { orbit } = useOrbitInput(
    {
      yaw: isCraps ? 0 : DEFAULT_YAW,
      pitch: isCraps ? CRAPS_PITCH : DEFAULT_PITCH,
      distance: isCraps ? CRAPS_DISTANCE : DEFAULT_DISTANCE,
    },
    {
      minPitch: MIN_PITCH,
      maxPitch: MAX_PITCH,
      minDistance: MIN_DISTANCE,
      maxDistance: MAX_DISTANCE,
      yawRange: YAW_RANGE,
    },
  )

  useFrame((_state, delta) => {
    const camera = cameraRef.current ?? defaultCamera
    const { yaw, pitch, distance } = orbit.current

    const horizontal = Math.cos(pitch) * distance
    const settle = 1 - Math.exp(-ORBIT_DAMPING * delta)

    camera.position.lerp(
      DESIRED.set(
        target.x + Math.sin(yaw) * horizontal,
        target.y + Math.sin(pitch) * distance,
        target.z + Math.cos(yaw) * horizontal,
      ),
      settle,
    )
    camera.lookAt(target)
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={45} />
}

/** The blackjack table with its stools, placed on the floor. */
function BlackjackPit() {
  const [x, , z] = tableOrigin(TableId.Blackjack)

  return (
    <group position={[x, 0, z]}>
      {STOOLS.map((stool) => (
        <Stool
          key={`${stool.x}-${stool.z}`}
          position={[stool.x, 0, stool.z]}
          // Turn each seat to face the middle of the table.
          rotationY={Math.atan2(-stool.x, -stool.z)}
        />
      ))}
      <BlackjackTable />
    </group>
  )
}

/**
 * The Golden Ace: a floor you walk, with a table at each end of it.
 *
 * Two modes. While `activeTable` is null the player controls their character
 * around the room and F sits them down; once seated the camera falls into the
 * table orbit and the game panel takes over, which is what this scene did for
 * its whole life before the room existed.
 */
export function CasinoInterior({ venueId }: CasinoInteriorProps) {
  const venue = getVenue(venueId)
  const appearance = useAppearanceStore((state) => state.appearance)
  const equipped = useAppearanceStore((state) => state.equipped)
  const activeTable = useGameStore((state) => state.activeTable)
  const floorPosition = useGameStore((state) => state.floorPosition)

  /**
   * F sits down at whatever the player is standing at.
   *
   * A plain listener rather than a `KeyboardControls` binding, because sitting
   * is an edge — holding F should seat you once, not every frame. Same pattern
   * as Escape in `ShopPanel`. Note F rather than E: E is already
   * `Control.OrbitRight`.
   */
  useEffect(() => {
    if (activeTable !== null) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() !== 'f') return

      const store = useGameStore.getState()
      if (store.nearbyTable !== null) store.sitAt(store.nearbyTable)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTable])

  const targets = useMemo<readonly ProximityTarget[]>(
    () => [
      ...TABLE_IDS.map((table) => ({
        id: table as string,
        position: SIT_SPOTS[table],
        radius: SIT_RADIUS,
      })),
      { id: 'exit', position: EXIT_DOOR, radius: EXIT_RADIUS },
    ],
    [],
  )

  const obstacles = useMemo(() => TABLE_IDS.map((table) => TABLE_FOOTPRINTS[table]), [])

  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()

    // The exit works on contact, like every other door in the game.
    if (id === 'exit') {
      store.leaveVenue()
      return
    }

    store.setNearbyTable((id as TableId | null) ?? null)
  }

  return (
    <>
      <CasinoRoom neonColor={venue.neonColor} />

      {/* Both tables are always in the room; only the camera moves. */}
      <BlackjackPit />
      <CrapsTable />

      {TABLE_IDS.map((table) => (
        <group key={table} position={[DEALER_SPOTS[table][0], 0, DEALER_SPOTS[table][2]]}>
          <CasinoCharacter
            appearance={DEALER_APPEARANCE}
            dealerPose
            staff
            // Only the table in play drives the dealer's hand signals; the other
            // one would mirror them for a game nobody is watching.
            {...(activeTable === table ? { gestureSource: 'dealer' as const } : {})}
          />
        </group>
      ))}

      {activeTable === null ? (
        <WalkingPlayer
          bounds={WALK_BOUNDS}
          spawn={floorPosition}
          // Facing into the room (-Z), with the exit behind them.
          facing={Math.PI}
          targets={targets}
          onNearest={handleNearest}
          obstacles={obstacles}
          // Tighter and higher than the strip: the room is twelve units deep,
          // and the strip's near-level seat buries the camera in the far wall.
          distance={5.6}
          pitch={0.42}
          cameraBounds={CAMERA_BOUNDS}
        />
      ) : (
        <>
          <TableCamera table={activeTable} />
          <group
            position={[SEATS[activeTable][0], 0, SEATS[activeTable][2]]}
            rotation={[0, Math.PI, 0]}
          >
            <CasinoCharacter
              appearance={appearance}
              equipped={equipped}
              seated
              gestureSource="player"
            />
          </group>
        </>
      )}
    </>
  )
}
