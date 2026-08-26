import { MeshReflectorMaterial, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { findItem, type ShopItem } from '../character/catalog'
import { wornInSlot } from '../character/fitting'
import { WINDOW_DISPLAY } from '../character/windowDisplay'
import { useAppearanceStore, useFittedEquipped } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_KEY } from '../world/controls'
import { getVenue, type VenueId } from '../world/venues'
import { PROPORTIONS, Silhouette } from '../character/proportions'
import { Accessory } from './components/character/Accessory'
import { CasinoCharacter } from './components/CasinoCharacter'
import { ExitDoor } from './components/ExitDoor'
import { WalkingPlayer, type ProximityTarget } from './components/WalkingPlayer'
import {
  CABINET_HEIGHT,
  CAMERA_BOUNDS,
  CASE_HEIGHT,
  DISPLAYS,
  displayId,
  displayItemId,
  EXIT_DOOR,
  EXIT_RADIUS,
  EYEWEAR_CASE,
  FITTING,
  FITTING_HEIGHT,
  FITTING_RADIUS,
  Fixture,
  HALF_DEPTH,
  HALF_WIDTH,
  JEWELLERY_CASE,
  MIRROR,
  MIRROR_CAMERA_AT,
  MIRROR_CAMERA_TARGET,
  MIRROR_HEIGHT,
  MIRROR_RADIUS,
  MIRROR_SILL,
  MIRROR_STAND,
  MIRROR_WIDTH,
  obstacles,
  SHOE_CABINET,
  TRY_RADIUS,
  WALK_BOUNDS,
  WALL_HEIGHT,
  WINDOW_PLATFORM,
  WINDOW_PLATFORM_HEIGHT,
  type Display,
} from './shopLayout'
import { getPriceCardTexture } from './priceCardTexture'
import { useActionKey } from './useActionKey'

/*
 * The Gilded Hanger.
 *
 * Built to `art/refs/shop_interior.png` and `art/refs/shop_fixtures.png`: plum
 * walls, a dark polished floor, brass everywhere, and one warm pool of light per
 * fixture against an otherwise dark room.
 *
 * It is a room you walk now, not a diorama with a list beside it. Every item in
 * the catalogue is on a fixture, F tries it on for nothing, and the mirror at
 * the back is where you find out what any of it costs. All of the placement is
 * in `shopLayout.ts`, which is pure and asserted — fourteen prompts in one room
 * is exactly the sort of thing that is fine until it is not.
 */

/** Read off the reference. Nothing here is a hex value chosen at a keyboard. */
const WALL = '#3d1338'
const FLOOR = '#241d29'
const BRASS = '#c9a227'
const BRASS_LIT = '#e6c765'
const CASE_GLOW = '#f5e6c8'
const CASE_GLASS = '#cfe4ee'
const WOOD = '#7a4a2a'
const RUG = '#8e7a66'
const PLINTH_TOP = '#a08b7a'
const PANEL = '#2c0e28'
const CEILING = '#241d28'

/**
 * The body an item on a fixture is drawn against.
 *
 * `Accessory` sizes jackets and gowns from a set of proportions, so a display
 * needs one even with nobody in it. The androgynous figure is the middle of the
 * three, which is what a shop dummy is.
 */
const DUMMY_BODY = PROPORTIONS[Silhouette.Androgynous]

/** Where a fixture's own downlight hangs. */
const LIGHT_HEIGHT = WALL_HEIGHT - 0.35

interface ShopInteriorProps {
  venueId: VenueId
}

/* ------------------------------------------------------------------ pieces */

/**
 * The name and price card clipped to a fixture.
 *
 * Drawn to canvas like every other text surface in the game, and angled up
 * toward the player rather than lying flat: a card flat on a case reads as a
 * bright smear from standing height.
 */
function PriceCard({ item, owned }: { item: ShopItem; owned: boolean }) {
  const texture = useMemo(() => getPriceCardTexture(item, owned), [item, owned])

  return (
    <group rotation={[-0.55, 0, 0]}>
      <mesh>
        <planeGeometry args={[0.66, 0.37]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
      {/* The brass clip it sits in, straight off the fixtures sheet. */}
      <mesh position={[0, -0.21, -0.01]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
      </mesh>
    </group>
  )
}

/** A dressed dummy on the window platform. */
function Mannequin({ index }: { index: number }) {
  const dressed = WINDOW_DISPLAY[index]
  if (!dressed) return null

  return (
    <group position={[0, WINDOW_PLATFORM_HEIGHT, 0]}>
      <CasinoCharacter appearance={dressed.appearance} equipped={dressed.equipped} mannequin />
    </group>
  )
}

/**
 * A small item on a lit bust inside the glass case.
 *
 * `Accessory` draws the real thing rather than a coloured block — the whole
 * reason to walk over is to see which of the two chains is which.
 */
function CasePiece({ item }: { item: ShopItem }) {
  return (
    <group position={[0, CASE_HEIGHT - 0.34, 0]}>
      {/* The cream bust the piece is displayed on. */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.13, 0.26, 12]} />
        <meshStandardMaterial color={CASE_GLOW} roughness={0.8} />
      </mesh>
      <group position={[0, 0.24, 0]} scale={1.35}>
        <Accessory item={item} body={DUMMY_BODY} compact />
      </group>
    </group>
  )
}

/** A pair of shoes in a lit cubby of the tall cabinet. */
function ShoeNiche({ item, height }: { item: ShopItem; height: number }) {
  return (
    <group position={[0, height, 0]}>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[0.62, 0.05, 0.6]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>
      {/* Two of them, because a single shoe on a shelf reads as a mistake. */}
      {[-0.12, 0.12].map((offset) => (
        <group key={offset} position={[0.02, 0.02, offset]} scale={1.2}>
          <Accessory item={item} body={DUMMY_BODY} compact />
        </group>
      ))}
    </group>
  )
}

/** The turned pole the fedora sits on. */
function HatStand({ item }: { item: ShopItem }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.06, 16]} />
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 1.38, 12]} />
        <meshStandardMaterial color={WOOD} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.16, 0.13, 0.06, 16]} />
        <meshStandardMaterial color={WOOD} roughness={0.55} />
      </mesh>
      <group position={[0, 1.5, 0]} scale={1.15}>
        <Accessory item={item} body={DUMMY_BODY} compact />
      </group>
    </group>
  )
}

/** The brass basket the cane leans in. */
function CaneRack({ item }: { item: ShopItem }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.24, 0.26, 0.04, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <torusGeometry args={[0.22, 0.018, 6, 20]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
      </mesh>
      {[0, Math.PI * 0.67, Math.PI * 1.33].map((angle) => (
        <mesh key={angle} position={[Math.cos(angle) * 0.22, 0.27, Math.sin(angle) * 0.22]}>
          <cylinderGeometry args={[0.014, 0.014, 0.52, 6]} />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
        </mesh>
      ))}
      {/* Leaning, as a cane in a stand does. */}
      <group position={[0.04, 0.62, 0]} rotation={[0, 0, 0.13]} scale={1.1}>
        <Accessory item={item} body={DUMMY_BODY} compact />
      </group>
    </group>
  )
}

/** Height above the floor a fixture's price card is clipped at. */
function cardHeight(display: Display): number {
  switch (display.fixture) {
    case Fixture.Mannequin:
      return WINDOW_PLATFORM_HEIGHT + 0.22
    case Fixture.Pedestal:
      return CASE_HEIGHT + 0.12
    case Fixture.Niche:
      return 1.42
    case Fixture.Stand:
      return 1.08
    case Fixture.Rack:
      return 0.88
  }
}

/** One display: its fixture, its item, its card and its own pool of light. */
function DisplayFixture({ display, index, owned }: {
  display: Display
  index: number
  owned: boolean
}) {
  const item = findItem(display.itemId)
  if (!item) return null

  const [x, z] = display.at

  return (
    <group position={[x, 0, z]} rotation={[0, display.facing, 0]}>
      {display.fixture === Fixture.Mannequin && <Mannequin index={index} />}
      {display.fixture === Fixture.Pedestal && <CasePiece item={item} />}
      {display.fixture === Fixture.Niche && (
        <ShoeNiche item={item} height={display.itemId === 'gold-heels' ? 0.72 : 1.36} />
      )}
      {display.fixture === Fixture.Stand && <HatStand item={item} />}
      {display.fixture === Fixture.Rack && <CaneRack item={item} />}

      <group position={[0, cardHeight(display), 0.34]}>
        <PriceCard item={item} owned={owned} />
      </group>
    </group>
  )
}

/**
 * The fixed camera used while the player is on the fitting plinth.
 *
 * Both ends of it come from `shopLayout.ts`, because a camera and the surface it
 * has to frame that disagree is not something a later reader would think to
 * check — and this one has an assertion holding it to a mirror wide enough to
 * see a reflection in.
 */
function MirrorCamera() {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const target = useMemo(() => new Vector3(...MIRROR_CAMERA_TARGET), [])

  useFrame(() => {
    cameraRef.current?.lookAt(target)
  })

  return (
    <PerspectiveCamera ref={cameraRef} makeDefault fov={42} position={[...MIRROR_CAMERA_AT]} />
  )
}

/* ------------------------------------------------------------------- scene */

const CABINET_DEPTH = SHOE_CABINET.maxX - SHOE_CABINET.minX
const CABINET_WIDTH = SHOE_CABINET.maxZ - SHOE_CABINET.minZ

const ROOM_WIDTH = HALF_WIDTH * 2
const ROOM_DEPTH = HALF_DEPTH * 2

export function ShopInterior({ venueId }: ShopInteriorProps) {
  const venue = getVenue(venueId)
  const appearance = useAppearanceStore((state) => state.appearance)
  const owned = useAppearanceStore((state) => state.owned)
  const clearFitting = useAppearanceStore((state) => state.clearFitting)
  const worn = useFittedEquipped()
  const atMirror = useGameStore((state) => state.atMirror)
  const shopPosition = useGameStore((state) => state.shopPosition)
  const shopFacing = useGameStore((state) => state.shopFacing)

  /*
   * Everything on approval is handed back on the way out.
   *
   * Not in `leaveVenue`: `useAppearanceStore` already imports `useGameStore`,
   * and the reverse would be a cycle. Unmounting the room is the same event and
   * it also covers the routes out that are not the door — the designer, a boot
   * shortcut, a hot reload.
   */
  useEffect(() => clearFitting, [clearFitting])

  /**
   * F acts on whatever the player is standing at: a display, the mirror, or the
   * way out.
   *
   * No ranking, because there is never more than one: `WalkingPlayer` reports
   * the single nearest target, and the mirror's and the door's radii are held
   * clear of every display by `shopLayout.test.ts` and `venueDoors.test.ts`.
   *
   * It stays live on the plinth so F steps back off it, which is the same shape
   * as the clinic's chairs.
   */
  useActionKey(INTERACT_KEY, () => {
    const store = useGameStore.getState()
    const wardrobe = useAppearanceStore.getState()

    if (store.atMirror) {
      store.leaveMirror()
      return
    }

    if (store.nearbyExit) {
      store.leaveVenue()
      return
    }

    if (store.nearbyMirror) {
      store.standAtMirror()
      return
    }

    const item = findItem(store.nearbyDisplay ?? undefined)
    if (!item) return

    // One key, and it toggles: standing at what you are already wearing, F is
    // the way to take it off again. Two keys for on and off would be the only
    // place in the game with two.
    const alreadyOn = wornInSlot(wardrobe.equipped, wardrobe.fitting, item.slot) === item.id
    if (alreadyOn) wardrobe.takeOff(item.slot)
    else wardrobe.tryOn(item.id)
  })

  const targets = useMemo<readonly ProximityTarget[]>(
    () => [
      ...DISPLAYS.map((display) => ({
        id: displayId(display.itemId),
        position: display.standAt,
        radius: TRY_RADIUS,
      })),
      { id: 'mirror', position: MIRROR_STAND, radius: MIRROR_RADIUS },
      { id: 'exit', position: EXIT_DOOR, radius: EXIT_RADIUS },
    ],
    [],
  )

  const solids = useMemo(() => obstacles(), [])

  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()

    store.setNearbyExit(id === 'exit')
    store.setNearbyMirror(id === 'mirror')
    store.setNearbyDisplay(id === null ? null : displayItemId(id))
  }

  return (
    <>
      <color attach="background" args={['#0f0912']} />

      {/*
        Dim overall, with the light where the stock is. A boutique is dark
        everywhere it is not selling something, which is the difference between
        this room and the casino floor's even wash.
      */}
      <ambientLight intensity={0.55} color="#c0a8d8" />

      {/*
        One warm downlight per fixture. This is what makes it read as retail
        rather than as a dark room with objects in it.

        Point lights rather than spots, deliberately. A `spotLight` aims at its
        `target`, and a target that is not added to the scene graph stays at the
        origin — twelve spots all pointing at the middle of the floor, which is
        exactly what the first capture of this room showed: dim smudges on the
        carpet and unlit fixtures above them. A recessed can over the stock is
        what the reference has and it needs no target at all.
      */}
      {DISPLAYS.map((display) => (
        <group key={display.itemId} position={[display.at[0], 0, display.at[1]]}>
          <pointLight position={[0, LIGHT_HEIGHT, 0.75]} color="#ffe0b8" intensity={13} distance={5.5} />
          {/*
            The can itself, so the light has a visible source in the ceiling.

            Tone-mapped, like the clinic's fluorescent panels and for the same
            reason: an unmapped warm disc sails past the bloom threshold and
            comes back as a hot pink smear the size of a dinner plate, which is
            what the first capture of this room showed along the whole ceiling.
          */}
          <mesh position={[0, WALL_HEIGHT - 0.04, 0.75]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 16]} />
            <meshBasicMaterial color="#c9a678" />
          </mesh>
        </group>
      ))}

      {/* The mirror's own key light, hung well clear of the glass. */}
      <spotLight
        position={[FITTING[0], LIGHT_HEIGHT, FITTING[1] + 1.1]}
        target-position={[FITTING[0], 1, FITTING[1]]}
        angle={0.7}
        penumbra={0.8}
        intensity={20}
        distance={10}
        color="#ffe6c2"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
      />
      {/*
        House pink, kept low and tucked up against the mirror wall.

        At any strength worth the name it was the only colour in the fitting
        area: the gown, the plinth, the rug and the player's own face all came
        back the same hot pink, and a mirror you cannot judge an outfit in is
        not doing the one job it has. It lights the wall behind the frame now,
        and the warm key does the figure.
      */}
      <pointLight
        position={[0, WALL_HEIGHT - 0.5, MIRROR[1] + 0.5]}
        color={venue.neonColor}
        intensity={3}
        distance={5}
      />
      {/* Fill from the camera side of the plinth, so the outfit is lit face-on. */}
      <pointLight
        position={[FITTING[0] + 0.7, 2.0, FITTING[1] + 1.7]}
        color="#ffdcb0"
        intensity={17}
        distance={6.5}
      />
      <pointLight position={[0, 2.4, HALF_DEPTH - 1.2]} color="#6f7ae0" intensity={7} distance={12} />

      {/* The room as a single inverted box: cheaper than six planes. */}
      <mesh position={[0, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[ROOM_WIDTH, WALL_HEIGHT, ROOM_DEPTH]} />
        <meshStandardMaterial color={WALL} roughness={0.92} side={BackSide} />
      </mesh>

      {/*
        A ceiling of its own, rather than the top face of the room box.

        The box is plum on all six sides, and a warm downlight pooling on a plum
        ceiling comes back pink — twelve pink discs overhead, which read as the
        neon rather than as the shop lights they are. A near-neutral ceiling
        keeps a warm light warm.
      */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, WALL_HEIGHT - 0.01, 0]}>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color={CEILING} roughness={0.95} />
      </mesh>

      {/*
        The floor, dark and polished as in the reference. Low roughness rather
        than a second reflector: the neon smears down it convincingly and it
        costs nothing.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        {/*
          Dark and polished, but not so polished that nothing lands on it.

          At roughness 0.34 and metalness 0.35 the floor reflected rather than
          caught the light: twelve downlights and a key over the plinth left no
          visible pools at all, and the only bright thing near the door was the
          flat quad the exit paints there — which then read as a plank.
        */}
        <meshStandardMaterial color={FLOOR} roughness={0.48} metalness={0.22} />
      </mesh>

      {/* Neon coving where the walls meet the ceiling, doubled as on the sheet. */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (HALF_WIDTH - 0.05), WALL_HEIGHT - 0.3, 0]}>
            <boxGeometry args={[0.06, 0.08, ROOM_DEPTH - 0.5]} />
            <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
          </mesh>
          <mesh position={[side * (HALF_WIDTH - 0.05), WALL_HEIGHT - 0.46, 0]}>
            <boxGeometry args={[0.05, 0.05, ROOM_DEPTH - 0.5]} />
            <meshBasicMaterial color={BRASS_LIT} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Brass dado rail along both side walls, above the cases. */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (HALF_WIDTH - 0.12), 1.55, 0]}>
          <boxGeometry args={[0.05, 0.05, ROOM_DEPTH - 2.4]} />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
        </mesh>
      ))}

      {/* The raised window platform, along the front wall beside the door. */}
      <group
        position={[
          (WINDOW_PLATFORM.minX + WINDOW_PLATFORM.maxX) / 2,
          0,
          (WINDOW_PLATFORM.minZ + WINDOW_PLATFORM.maxZ) / 2,
        ]}
      >
        <mesh position={[0, WINDOW_PLATFORM_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry
            args={[
              WINDOW_PLATFORM.maxX - WINDOW_PLATFORM.minX,
              WINDOW_PLATFORM_HEIGHT,
              WINDOW_PLATFORM.maxZ - WINDOW_PLATFORM.minZ,
            ]}
          />
          <meshStandardMaterial color={PANEL} roughness={0.7} />
        </mesh>
        <mesh position={[0, WINDOW_PLATFORM_HEIGHT + 0.012, 0]}>
          <boxGeometry
            args={[
              WINDOW_PLATFORM.maxX - WINDOW_PLATFORM.minX + 0.06,
              0.03,
              WINDOW_PLATFORM.maxZ - WINDOW_PLATFORM.minZ + 0.06,
            ]}
          />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
        </mesh>
      </group>

      {/* The two glass cases down the left wall. */}
      {[JEWELLERY_CASE, EYEWEAR_CASE].map((box) => (
        <group
          key={box.minZ}
          position={[(box.minX + box.maxX) / 2, 0, (box.minZ + box.maxZ) / 2]}
        >
          <mesh position={[0, CASE_HEIGHT / 2 - 0.18, 0]} castShadow receiveShadow>
            <boxGeometry args={[box.maxX - box.minX, CASE_HEIGHT - 0.36, box.maxZ - box.minZ]} />
            <meshStandardMaterial color={WOOD} roughness={0.6} />
          </mesh>
          {/*
            Lit from inside, which is what makes a case read as a case.

            Tone-mapped and emissive rather than `meshBasicMaterial`, for the
            reason the clinic's ceiling panels are: an unmapped cream box this
            size sails past the bloom threshold and comes back as one white slab
            with the jewellery invisible inside it.
          */}
          <mesh position={[0, CASE_HEIGHT - 0.19, 0]}>
            <boxGeometry
              args={[box.maxX - box.minX - 0.06, 0.38, box.maxZ - box.minZ - 0.06]}
            />
            <meshStandardMaterial
              color={CASE_GLOW}
              roughness={0.9}
              emissive={CASE_GLOW}
              emissiveIntensity={0.18}
            />
          </mesh>
          <mesh position={[0, CASE_HEIGHT + 0.02, 0]}>
            <boxGeometry args={[box.maxX - box.minX, 0.04, box.maxZ - box.minZ]} />
            <meshStandardMaterial
              color={CASE_GLASS}
              roughness={0.06}
              metalness={0.2}
              transparent
              opacity={0.35}
            />
          </mesh>
          {/*
            A brass frame around the glass, not a lid over it.

            It was a single box the full footprint of the case, which is a solid
            brass sheet laid over the top: under three downlights it came back as
            one blown gold slab six metres long, and nothing inside the case
            could be seen at all. Four thin edge bars is what a display case
            actually has.
          */}
          {[-1, 1].map((side) => (
            <mesh
              key={`long-${side}`}
              position={[(side * (box.maxX - box.minX)) / 2, CASE_HEIGHT + 0.05, 0]}
            >
              <boxGeometry args={[0.05, 0.04, box.maxZ - box.minZ + 0.05]} />
              <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.7} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <mesh
              key={`end-${side}`}
              position={[0, CASE_HEIGHT + 0.05, (side * (box.maxZ - box.minZ)) / 2]}
            >
              <boxGeometry args={[box.maxX - box.minX + 0.05, 0.04, 0.05]} />
              <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* The tall lit shoe cabinet opposite. */}
      <group
        position={[
          (SHOE_CABINET.minX + SHOE_CABINET.maxX) / 2,
          0,
          (SHOE_CABINET.minZ + SHOE_CABINET.maxZ) / 2,
        ]}
      >
        {/*
          Built as a back, two sides and a top rather than a solid box.

          A closed box is what the first capture of this room showed: a two-metre
          slab of unlit panel with the shoes sealed inside it. A cabinet has to
          be open on the side you look into.
        */}
        <mesh position={[CABINET_DEPTH / 2 - 0.04, CABINET_HEIGHT / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.08, CABINET_HEIGHT, CABINET_WIDTH]} />
          <meshStandardMaterial color={PANEL} roughness={0.75} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[0, CABINET_HEIGHT / 2, (side * CABINET_WIDTH) / 2]}
            castShadow
          >
            <boxGeometry args={[CABINET_DEPTH, CABINET_HEIGHT, 0.08]} />
            <meshStandardMaterial color={PANEL} roughness={0.75} />
          </mesh>
        ))}
        <mesh position={[0, CABINET_HEIGHT - 0.04, 0]}>
          <boxGeometry args={[CABINET_DEPTH, 0.08, CABINET_WIDTH]} />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
        </mesh>
        {/* The lit back of each shelf, seen through the open front. */}
        {[0.72, 1.36].map((height) => (
          <mesh
            key={height}
            position={[CABINET_DEPTH / 2 - 0.09, height + 0.26, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[CABINET_WIDTH - 0.16, 0.52]} />
            <meshStandardMaterial
              color={CASE_GLOW}
              roughness={0.9}
              emissive={CASE_GLOW}
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>

      {DISPLAYS.map((display, index) => (
        <DisplayFixture
          key={display.itemId}
          display={display}
          index={index}
          owned={owned.includes(display.itemId)}
        />
      ))}

      {/* The rug and the plinth in front of the mirror. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[FITTING[0], 0.006, FITTING[1]]} receiveShadow>
        <circleGeometry args={[FITTING_RADIUS + 0.55, 40]} />
        <meshStandardMaterial color={RUG} roughness={0.96} />
      </mesh>
      <group position={[FITTING[0], 0, FITTING[1]]}>
        <mesh position={[0, FITTING_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[FITTING_RADIUS, FITTING_RADIUS + 0.05, FITTING_HEIGHT, 40]} />
          <meshStandardMaterial color={PLINTH_TOP} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[FITTING_RADIUS + 0.055, FITTING_RADIUS + 0.055, 0.06, 40]} />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.85} />
        </mesh>
      </group>

      {/* The mirror: a neon frame round an actual reflection. */}
      <group position={[MIRROR[0], MIRROR_SILL + MIRROR_HEIGHT / 2, MIRROR[1]]}>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[MIRROR_WIDTH + 0.14, MIRROR_HEIGHT + 0.14, 0.05]} />
          <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[MIRROR_WIDTH + 0.07, MIRROR_HEIGHT + 0.07, 0.05]} />
          <meshBasicMaterial color={PANEL} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <boxGeometry args={[MIRROR_WIDTH + 0.02, MIRROR_HEIGHT + 0.02, 0.04]} />
          <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
        </mesh>
        {/*
          A real reflection, not a tinted panel.

          The last attempt at a mirror here was a `meshStandardMaterial` with
          high metalness and no environment map, which had nothing to reflect and
          came back as a black void with two specular dots. This is a genuine
          render-to-texture pass, scoped to this one surface in this one room,
          and it is worth the cost because seeing yourself in it is the reason
          the room exists. Blurred and half-resolution to keep it to one.
        */}
        <mesh position={[0, 0, 0.055]}>
          <planeGeometry args={[MIRROR_WIDTH, MIRROR_HEIGHT]} />
          <MeshReflectorMaterial
            resolution={512}
            mirror={0.92}
            blur={[220, 90]}
            mixBlur={0.7}
            mixStrength={2.4}
            depthScale={0}
            minDepthThreshold={0.9}
            color="#8f8aa8"
            metalness={0.55}
            roughness={0.45}
          />
        </mesh>
      </group>

      {/*
        No floor pool: the shop's floor is lit well enough to catch the
        doorway's own light, and the painted stand-in read as a plank on it.
      */}
      <ExitDoor
        position={EXIT_DOOR}
        accent={venue.neonColor}
        width={1.7}
        height={2.5}
        floorPool={false}
      />

      {atMirror ? (
        <>
          <MirrorCamera />
          <group position={[FITTING[0], FITTING_HEIGHT, FITTING[1]]} rotation={[0, Math.PI, 0]}>
            <CasinoCharacter appearance={appearance} equipped={worn} />
          </group>
        </>
      ) : (
        <WalkingPlayer
          bounds={WALK_BOUNDS}
          spawn={shopPosition}
          facing={shopFacing}
          targets={targets}
          onNearest={handleNearest}
          obstacles={solids}
          distance={4.4}
          pitch={0.42}
          cameraBounds={CAMERA_BOUNDS}
        />
      )}
    </>
  )
}
