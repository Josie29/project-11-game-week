import { PerspectiveCamera } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { DEALER_APPEARANCE } from '../character/appearance'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_KEY } from '../world/controls'
import { getVenue, type VenueId } from '../world/venues'
import {
  CAMERA_BOUNDS,
  DEALER_SPOTS,
  EXIT_DOOR,
  EXIT_RADIUS,
  SEATS,
  SIT_RADII,
  SIT_SPOTS,
  STANDING_TABLES,
  TABLE_FOOTPRINTS,
  TABLE_IDS,
  tableOrigin,
  TableId,
  WALK_BOUNDS,
  WALK_CAMERA,
  WATER_COURT,
} from './casinoFloorLayout'
import { BlackjackTable } from './components/BlackjackTable'
import { CasinoCharacter } from './components/CasinoCharacter'
import { CasinoRoom } from './components/CasinoRoom'
import { CrapsTable } from './components/CrapsTable'
import { useSharedCraps } from '../net/useSharedCraps'
import { Stool } from './components/Stool'
import { PLAYER_SEATS } from './tableLayout'
import { WalkingPlayer, type ProximityTarget } from './components/WalkingPlayer'
import { useActionKey } from './useActionKey'
import { useOrbitInput } from './useOrbitInput'

interface CasinoInteriorProps {
  venueId: VenueId
}


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
   * The craps table's printed layout is the game, so the camera looks at the
   * middle of it. Aimed a little past centre toward the boxman, because the
   * control bar covers the lower third of the screen and the pass line — the
   * biggest, most bet-on marking on the felt — sits on the near edge.
   */
  [TableId.Craps]: [0, 1.05, 0.04],
}

/*
 * Opening view, as an orbit rather than a position. Both closer and steeper
 * than the original fixed shot: at the old distance and eyeline a card was
 * about sixty pixels wide and seen near edge-on, which is legible in principle
 * and a squint in practice. The cards should be readable before anyone touches
 * the controls.
 */
const DEFAULT_YAW = -0.2925
/*
 * Raised with the figure.
 *
 * 0.52 framed a 24cm head at the near edge of the shot. The stylised head is a
 * third bigger, and at the old pitch the player's own crown sat across the
 * dealer/player totals in the HUD — the one line of text the whole hand is
 * about. A few degrees of lift clears it without changing what the shot is.
 */
const DEFAULT_PITCH = 0.58
const DEFAULT_DISTANCE = 5.8
/*
 * Further back and less steep than blackjack's. The craps table is over five
 * metres end to end now — more than twice its old width — and at the previous
 * distance both ends of the layout were off the sides of the screen.
 */
const CRAPS_DISTANCE = 5.9
const CRAPS_PITCH = 0.82
/*
 * Swung off the shooter's shoulder rather than square to the table. Square on,
 * the standing player is directly between the camera and the felt and reads as
 * a dark mass at the bottom of the frame; from here they stand in profile at
 * the near left, and the table runs away from them in the direction they throw.
 */
const CRAPS_YAW = 0.0

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
      yaw: isCraps ? CRAPS_YAW : DEFAULT_YAW,
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
      {PLAYER_SEATS.map((stool) => (
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
  // Where this player stands at the craps rail, and who has the dice.
  const craps = useSharedCraps()
  const floorPosition = useGameStore((state) => state.floorPosition)

  /**
   * F acts on whatever the player is standing at: a table, or the way out.
   *
   * The two cannot both be on offer — `WalkingPlayer` reports only the single
   * nearest target, and `venueDoors.test.ts` keeps the exit's radius clear of
   * every sit spot — so this needs no ranking. Disabled while seated, when the
   * only thing F could act on is a table you are already at.
   */
  useActionKey(INTERACT_KEY, activeTable !== null ? null : () => {
    const store = useGameStore.getState()

    if (store.nearbyExit) store.leaveVenue()
    else if (store.nearbyTable !== null) store.sitAt(store.nearbyTable)
  })

  const targets = useMemo<readonly ProximityTarget[]>(
    () => [
      ...TABLE_IDS.map((table) => ({
        id: table as string,
        position: SIT_SPOTS[table],
        radius: SIT_RADII[table],
      })),
      { id: 'exit', position: EXIT_DOOR, radius: EXIT_RADIUS },
    ],
    [],
  )

  /*
   * The tables, and the pool.
   *
   * The court is on this list for the same reason the tables are: it is a hole
   * in the floor, and a hole you can stand in the middle of is a rectangle
   * painted on the carpet. `pushOut` takes the nearest edge, and the court's
   * only open side faces the room, so walking into it puts you back on the
   * coping rather than through the wall behind it.
   */
  const obstacles = useMemo(
    () => [...TABLE_IDS.map((table) => TABLE_FOOTPRINTS[table]), WATER_COURT],
    [],
  )

  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()

    // The exit offers itself and waits, like every other door in the game. It
    // used to leave on contact, which made crossing the room a hazard.
    store.setNearbyExit(id === 'exit')
    store.setNearbyTable(id === 'exit' ? null : ((id as TableId | null) ?? null))
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
          /*
            Tighter and higher than the strip: the strip's near-level seat
            buries the camera in the far wall.

            These two came out of this file and into the layout module when the
            waterfall went in, because the waterfall's width is set by what this
            camera can see of it. A camera constant and the geometry sized
            against it, kept in two files, is the disagreement nobody thinks to
            look for.
          */
          distance={WALK_CAMERA.distance}
          pitch={WALK_CAMERA.pitch}
          cameraBounds={CAMERA_BOUNDS}
        />
      ) : (
        <>
          <TableCamera table={activeTable} />
          <group
            /*
             * Craps spreads people along the rail, with whoever holds the dice
             * at the shooter's end. Everybody used to be put on that one spot,
             * so two players stood inside each other and neither looked like
             * the shooter. Blackjack is still a single seat here.
             */
            position={
              activeTable === TableId.Craps
                ? [craps.railSpot[0], 0, craps.railSpot[2]]
                : [SEATS[activeTable][0], 0, SEATS[activeTable][2]]
            }
            rotation={[0, Math.PI, 0]}
          >
            {/*
              Standing at craps, seated at blackjack. Nobody sits at a craps
              table — you stand at the rail and throw over it — and the seated
              pose put the player's head below the rail they were supposedly
              throwing across, which read as them hiding behind the table.
            */}
            <CasinoCharacter
              appearance={appearance}
              equipped={equipped}
              seated={!STANDING_TABLES.has(activeTable)}
              gestureSource="player"
            />
          </group>
        </>
      )}
    </>
  )
}
