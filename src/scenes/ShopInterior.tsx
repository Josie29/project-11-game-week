import { MeshReflectorMaterial, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { findItem, ItemShape, type ShopItem } from '../character/catalog'
import { isFitting, wornInSlot } from '../character/fitting'
import { WINDOW_DISPLAY } from '../character/windowDisplay'
import { useAppearanceStore, useFittedEquipped } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { INTERACT_KEY } from '../world/controls'
import { getVenue, type VenueId } from '../world/venues'
import { PROPORTIONS, Silhouette } from '../character/proportions'
import { Accessory } from './components/character/Accessory'
import { CasinoCharacter } from './components/CasinoCharacter'
import { ExitDoor } from './components/ExitDoor'
import { ShopClerk, CLERK_GLANCE_RADIUS } from './components/ShopClerk'
import { WalkingPlayer, type ProximityTarget } from './components/WalkingPlayer'
import {
  CABINET_HEIGHT,
  CABINET_SHELVES,
  CAMERA_BOUNDS,
  BACK_SHELF,
  BACK_SHELF_HEIGHT,
  CASE_DECK_THICKNESS,
  CASE_DECK_Y,
  CASE_GLASS_Y,
  CASE_HEIGHT,
  CASE_PIECE_BASE_Y,
  CASE_PIECE_HEIGHT,
  CLERK_STAND,
  COUNTER,
  COUNTER_HEIGHT,
  DESK_CAMERA_AT,
  DESK_CAMERA_TARGET,
  DESK_FACING,
  DESK_RADIUS,
  DESK_STAND,
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
  nicheShelfY,
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
import {
  getShopFloorTexture,
  getShopWallTexture,
  getVelvetNormalTexture,
} from './shopTexture'
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
const BRASS = '#c9a227'
const BRASS_LIT = '#e6c765'
const CASE_GLOW = '#f5e6c8'
const CASE_GLASS = '#cfe4ee'
/** Darker velvet, so metal on a bust has something to read against. */
const BUST = '#6d5a49'
const WOOD = '#7a4a2a'
const RUG = '#8e7a66'
const PLINTH_TOP = '#a08b7a'
const PANEL = '#2c0e28'
const CEILING = '#241d28'
/** The field behind the window dummies, read off the reference's blue panel. */
const BACKDROP = '#1d2a4d'

/**
 * The body an item on a fixture is drawn against.
 *
 * `Accessory` sizes jackets and gowns from a set of proportions, so a display
 * needs one even with nobody in it. The androgynous figure is the middle of the
 * three, which is what a shop dummy is.
 */
const DUMMY_BODY = PROPORTIONS[Silhouette.Androgynous]

/**
 * How tall the window's backdrop panel stands above the platform.
 *
 * Tall enough to be behind the dummies' heads — a panel that stops at the
 * shoulder frames the clothes and decapitates the figure.
 */
const BACKDROP_HEIGHT = 2.05

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
function PriceCard({
  item,
  owned,
  tilt = -0.55,
}: {
  item: ShopItem
  owned: boolean
  tilt?: number
}) {
  const texture = useMemo(() => getPriceCardTexture(item, owned), [item, owned])

  return (
    <group rotation={[tilt, 0, 0]}>
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
  /*
   * Everything here is measured up from the deck the piece stands on.
   *
   * It used to be measured down from `CASE_HEIGHT`, which put it inside the
   * solid box that lit the case — so the bust and the piece were both sealed in
   * a cream slab, in the one fixture whose entire purpose is being looked into.
   * `isOnShowInCase` holds the stack between the deck and the glass now.
   */
  const bustHeight = CASE_PIECE_HEIGHT * 0.52

  return (
    <group position={[0, CASE_PIECE_BASE_Y, 0]}>
      {/*
        The bust, in a darker velvet than the deck it stands on.

        It was the same cream as the deck, which meant a gold chain sat on a
        cream bust on a cream deck under a cream light — three values of the
        same colour, and nothing to see. What a jeweller does is put the metal
        against something darker, so that is what this does.
      */}
      <mesh position={[0, bustHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.11, bustHeight, 12]} />
        <meshStandardMaterial color={BUST} roughness={0.88} />
      </mesh>
      {/* A shallow plinth under it, so the bust is stood on something. */}
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.13, 0.14, 0.024, 14]} />
        <meshStandardMaterial color="#5b4a3c" roughness={0.9} />
      </mesh>
      {/*
        Two ways to show a piece, because there are two kinds of piece.

        A chain and a pendant are drawn as a torus lying flat — correct on a
        body, where it circles a neck. Perched on top of a bust it is a hoop seen
        edge-on from every angle a player can stand at, which is a thin line and
        reads as nothing at all. Dropped down the bust it does what it does on a
        neck: sits *around* it. The bust tapers, so at a little over half height
        its radius is under the chain's and the chain hangs on it.

        A ring and a watch are the opposite problem — a signet ring is a
        fourteen-millimetre torus and simply cannot be seen across a shop. Those
        sit up on the bust and are scaled well past life size, which is what a
        jeweller's display magnifier is for.

        Either way `isOnShowInCase` bounds the stack under the glass.
      */}
      {(() => {
        const drapes = item.shape === ItemShape.Chain || item.shape === ItemShape.Pendant
        return (
          <group
            position={[0, drapes ? bustHeight * 0.58 : bustHeight + 0.04, 0]}
            scale={drapes ? 1.35 : 3.1}
          >
            <Accessory item={item} body={DUMMY_BODY} compact />
          </group>
        )
      })()}
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
      // On the fascia, below the glass. See `cardReach`.
      return CASE_DECK_Y - 0.08
    case Fixture.Niche:
      return 1.42
    case Fixture.Stand:
      return 1.08
    case Fixture.Rack:
      return 0.88
  }
}

/**
 * How far in front of a fixture its card is clipped, and how far it lies back.
 *
 * The glass cases get their own answer, and it is the whole point of this
 * function. Their cards used to hang above the glass and lean back over it, so
 * every one of them sat directly between the player and the piece it was naming
 * — four items in the one fixture whose entire purpose is being looked into,
 * labelled by the thing covering them.
 *
 * On the fascia instead: below the glass line, standing nearly upright against
 * the case front, where a jeweller puts a ticket. Nothing is in front of the
 * goods any more.
 */
function cardReach(display: Display): { z: number; tilt: number } {
  return display.fixture === Fixture.Pedestal
    ? { z: 0.4, tilt: -0.12 }
    : { z: 0.34, tilt: -0.55 }
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
        <ShoeNiche item={item} height={nicheShelfY(display.itemId)} />
      )}
      {display.fixture === Fixture.Stand && <HatStand item={item} />}
      {display.fixture === Fixture.Rack && <CaneRack item={item} />}

      <group position={[0, cardHeight(display), cardReach(display).z]}>
        <PriceCard item={item} owned={owned} tilt={cardReach(display).tilt} />
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

/**
 * The fixed camera used at the counter.
 *
 * Over the customer's shoulder rather than square on to the counter: the shot
 * has to hold the player, what they are wearing, and the person about to charge
 * them for it. `counterSubtendedAngle` is what keeps it from looking down the
 * counter's length, which frames two people either side of a post.
 */
function DeskCamera() {
  const cameraRef = useRef<PerspectiveCameraImpl>(null)
  const target = useMemo(() => new Vector3(...DESK_CAMERA_TARGET), [])

  useFrame(() => {
    cameraRef.current?.lookAt(target)
  })

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={42} position={[...DESK_CAMERA_AT]} />
}

/**
 * The checkout counter: a case, a brass-edged top, and a till on it.
 *
 * Boxes, in the clinic desk's idiom — the overhang on the top is what makes a
 * box read as a counter. The one thing worth noting is that its footprint in
 * `shopLayout.ts` is wider than this geometry: the staff side behind it is not
 * walkable, so the player cannot end up standing inside the clerk.
 */
function Counter() {
  const width = COUNTER.maxX - COUNTER.minX
  const depth = COUNTER.maxZ - COUNTER.minZ
  const centerX = (COUNTER.minX + COUNTER.maxX) / 2
  const centerZ = (COUNTER.minZ + COUNTER.maxZ) / 2

  return (
    <group name="shop:counter" position={[centerX, 0, centerZ]}>
      {/* The case, panelled to match the dado rather than the fixtures. */}
      <mesh position={[0, COUNTER_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, COUNTER_HEIGHT, depth]} />
        <meshStandardMaterial color={PANEL} roughness={0.55} />
      </mesh>

      {/* A band of wood at knee height, so the case is not one flat slab. */}
      <mesh position={[-width / 2 - 0.01, 0.34, 0]}>
        <boxGeometry args={[0.03, 0.5, depth - 0.16]} />
        <meshStandardMaterial color={WOOD} roughness={0.7} />
      </mesh>

      {/* A brass reveal along the customer's side, under the overhang. */}
      <mesh position={[-width / 2 - 0.012, COUNTER_HEIGHT - 0.09, 0]}>
        <boxGeometry args={[0.02, 0.03, depth - 0.08]} />
        <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.75} />
      </mesh>

      {/*
        The customer's half of the counter: a card reader on a little stand, a
        wrapped parcel waiting to be handed over, and a service bell.

        Spread along the counter, and deliberately *not* opposite either person
        standing at it. The first placement put all three on the near side "where
        the player stands", which is exactly where the player then stood: the
        clerk is at local z -0.55 and the player at -0.4, so everything was
        behind one or the other of them in the checkout shot.
      */}
      <group position={[-0.1, COUNTER_HEIGHT + 0.07, 0.34]} rotation={[0, 0.3, 0]}>
        <mesh position={[0, 0.03, 0]}>
          <boxGeometry args={[0.14, 0.06, 0.12]} />
          <meshStandardMaterial color="#2a2029" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.11, -0.02]} rotation={[-0.65, 0, 0]}>
          <boxGeometry args={[0.12, 0.16, 0.025]} />
          <meshStandardMaterial color="#1d1a24" roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.125, -0.008]} rotation={[-0.65, 0, 0]}>
          <planeGeometry args={[0.09, 0.11]} />
          <meshStandardMaterial color="#3d5f57" roughness={0.3} />
        </mesh>
      </group>

      {/* A wrapped parcel, ribboned, because this is where things leave. */}
      <group position={[0.02, COUNTER_HEIGHT + 0.07, -0.98]} rotation={[0, -0.35, 0]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.3, 0.12, 0.22]} />
          <meshStandardMaterial color="#e6dccb" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.061, 0]}>
          <boxGeometry args={[0.05, 0.125, 0.225]} />
          <meshStandardMaterial color={BRASS} roughness={0.5} metalness={0.5} />
        </mesh>
      </group>

      {/* Service bell. */}
      <group position={[-0.16, COUNTER_HEIGHT + 0.07, -0.04]}>
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.07, 0.075, 0.024, 14]} />
          <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.055, 0]}>
          <sphereGeometry args={[0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={BRASS_LIT} roughness={0.28} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <sphereGeometry args={[0.016, 8, 6]} />
          <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.8} />
        </mesh>
      </group>

      {/* The top, overhanging on every side. This is the part that reads. */}
      <mesh position={[0, COUNTER_HEIGHT + 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.12, 0.07, depth + 0.12]} />
        <meshStandardMaterial color={BRASS} roughness={0.32} metalness={0.85} />
      </mesh>

      {/*
        The till, on the clerk's half, angled back toward her — and up at the
        far end of the counter, out of the line the checkout camera takes to the
        two people using it. The first capture had it on the customer's head and
        the second had it in front of the clerk.
      */}
      <group position={[0.16, COUNTER_HEIGHT + 0.07, 0.78]} rotation={[0, -0.22, 0]}>
        <mesh position={[0, 0.11, 0]} castShadow>
          <boxGeometry args={[0.34, 0.22, 0.4]} />
          <meshStandardMaterial color="#241a20" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.24, -0.06]} rotation={[-0.5, 0, 0]}>
          <boxGeometry args={[0.3, 0.18, 0.03]} />
          <meshStandardMaterial
            color="#2b2230"
            emissive={CASE_GLOW}
            emissiveIntensity={0.35}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* A tray of tissue paper, because a counter with nothing on it is a wall. */}
      <mesh position={[-0.1, COUNTER_HEIGHT + 0.1, -0.68]} castShadow>
        <boxGeometry args={[0.42, 0.07, 0.32]} />
        <meshStandardMaterial color={RUG} roughness={0.85} />
      </mesh>
    </group>
  )
}

/**
 * The back shelf behind the counter: stock boxes on open shelves.
 *
 * Drawn because it is walked into. It exists to close the staff side of the
 * counter, and an obstacle a player is pushed out of with nothing where it
 * stands is the invisible wall this project has managed to avoid so far.
 */
function BackShelf() {
  const width = BACK_SHELF.maxX - BACK_SHELF.minX
  const depth = BACK_SHELF.maxZ - BACK_SHELF.minZ
  const centerX = (BACK_SHELF.minX + BACK_SHELF.maxX) / 2
  const centerZ = (BACK_SHELF.minZ + BACK_SHELF.maxZ) / 2

  return (
    <group name="shop:back-shelf" position={[centerX, 0, centerZ]}>
      <mesh position={[0, BACK_SHELF_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, BACK_SHELF_HEIGHT, depth]} />
        <meshStandardMaterial color={PANEL} roughness={0.6} />
      </mesh>

      {/*
        A reveal where this runs up to the shoe cabinet.

        The two are flush by design — `COUNTER_FOOTPRINT` spans them as one box
        so the player cannot walk the seam between them — and two flush surfaces
        of similar colour read as one lump of furniture rather than as a shelf
        beside a cabinet. A shadow gap is what a fitter would put there, and it
        costs one mesh.
      */}
      <mesh position={[width / 2 - 0.012, BACK_SHELF_HEIGHT / 2, 0]}>
        <boxGeometry args={[0.024, BACK_SHELF_HEIGHT - 0.06, depth + 0.02]} />
        <meshStandardMaterial color="#150612" roughness={0.9} />
      </mesh>

      {/* Brass capping, matching the counter's top and the dado. */}
      <mesh position={[0, BACK_SHELF_HEIGHT + 0.02, 0]} castShadow>
        <boxGeometry args={[width + 0.05, 0.045, depth + 0.05]} />
        <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.8} />
      </mesh>

      {/* Two shelves of boxed stock, facing the room over the counter. */}
      {[0.52, 1.06].map((height) => (
        <group key={height}>
          <mesh position={[-width / 2 + 0.02, height, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[depth - 0.12, 0.42]} />
            <meshStandardMaterial color={WOOD} roughness={0.8} />
          </mesh>
          {[-0.62, 0, 0.62].map((offset) => (
            <mesh
              key={offset}
              position={[-width / 2 + 0.16, height + 0.02, offset]}
              rotation={[0, 0.18 * offset, 0]}
              castShadow
            >
              <boxGeometry args={[0.24, 0.3, 0.42]} />
              <meshStandardMaterial color={offset === 0 ? RUG : BRASS_LIT} roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}

      {/* A brass rail capping it, matching the dado and the counter's top. */}
      <mesh position={[0, BACK_SHELF_HEIGHT + 0.03, 0]}>
        <boxGeometry args={[width + 0.08, 0.06, depth + 0.08]} />
        <meshStandardMaterial color={BRASS} roughness={0.32} metalness={0.85} />
      </mesh>
    </group>
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
  const atCheckout = useGameStore((state) => state.atCheckout)
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
   * F acts on whatever the player is standing at: a display, the mirror, the
   * counter, or the way out.
   *
   * No ranking, because there is never more than one: `WalkingPlayer` reports
   * the single nearest target, and the mirror's, the counter's and the door's
   * radii are held clear of each other and of every display by
   * `shopLayout.test.ts` and `venueDoors.test.ts`.
   *
   * It stays live at the mirror and at the counter so F steps back off either,
   * which is the same shape as the clinic's chairs.
   */
  useActionKey(INTERACT_KEY, () => {
    const store = useGameStore.getState()
    const wardrobe = useAppearanceStore.getState()

    if (store.atMirror) {
      store.leaveMirror()
      return
    }

    if (store.atCheckout) {
      store.leaveCheckout()
      return
    }

    if (store.nearbyExit) {
      /*
       * The clerk calls you back, once.
       *
       * The only place in the game where F does not do what the prompt said a
       * frame ago, which is why the prompt changes rather than the key going
       * quiet: the first press spends itself on being told what you are
       * carrying, the second leaves anyway and the goods go back on the rail.
       *
       * Not a lock. The way to settle or drop a bill is at the counter, and a
       * player who has walked to the door with more on than they can afford is
       * exactly the player who would be stuck there.
       */
      if (isFitting(wardrobe.fitting) && !store.heldAtDoor) {
        store.setHeldAtDoor(true)
        return
      }

      store.leaveVenue()
      return
    }

    if (store.nearbyMirror) {
      store.standAtMirror()
      return
    }

    if (store.nearbyDesk) {
      store.standAtCheckout()
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
      { id: 'desk', position: DESK_STAND, radius: DESK_RADIUS },
      { id: 'exit', position: EXIT_DOOR, radius: EXIT_RADIUS },
    ],
    [],
  )

  /*
   * What the clerk notices, which is not what F acts on.
   *
   * A separate channel because `onNearest` reports only the closest target:
   * folding the clerk in would mean standing where she can see you takes the
   * prompt off whatever you are actually standing at. The clinic's desk learned
   * this first. It is also wider than the till's own radius, so she looks up
   * before the prompt appears rather than at the same moment.
   */
  const glanceTargets = useMemo<readonly ProximityTarget[]>(
    () => [{ id: 'clerk', position: CLERK_STAND, radius: CLERK_GLANCE_RADIUS }],
    [],
  )

  const velvet = getVelvetNormalTexture()
  const floorTexture = getShopFloorTexture()

  const solids = useMemo(() => obstacles(), [])

  function handleNearest(id: string | null): void {
    const store = useGameStore.getState()

    store.setNearbyExit(id === 'exit')
    store.setNearbyMirror(id === 'mirror')
    store.setNearbyDesk(id === 'desk')
    store.setNearbyDisplay(id === null ? null : displayItemId(id))

    // Walking away from the door takes the clerk's line down with it, so a
    // press at some other fixture later cannot be the one that leaves.
    if (id !== 'exit') store.setHeldAtDoor(false)
  }

  function handleGlance(id: string | null): void {
    useGameStore.getState().setNearbyClerk(id === 'clerk')
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

      {/*
        The walls as four planes rather than one inverted box.

        The box was one draw and one material, which is cheaper — and one
        material means one flat colour across the largest surface in the room.
        The reference's walls darken toward the floor and carry gold at the
        cornice and the dado, and none of that is expressible on a shared
        material. Three extra draw calls, no extra lights, which is the trade
        this room can actually afford.
      */}
      {[
        { key: 'left', position: [-HALF_WIDTH, WALL_HEIGHT / 2, 0], rotation: [0, Math.PI / 2, 0], size: [ROOM_DEPTH, WALL_HEIGHT] },
        { key: 'right', position: [HALF_WIDTH, WALL_HEIGHT / 2, 0], rotation: [0, -Math.PI / 2, 0], size: [ROOM_DEPTH, WALL_HEIGHT] },
        { key: 'back', position: [0, WALL_HEIGHT / 2, -HALF_DEPTH], rotation: [0, 0, 0], size: [ROOM_WIDTH, WALL_HEIGHT] },
        { key: 'front', position: [0, WALL_HEIGHT / 2, HALF_DEPTH], rotation: [0, Math.PI, 0], size: [ROOM_WIDTH, WALL_HEIGHT] },
      ].map(({ key, position, rotation, size }) => (
        <mesh
          key={key}
          position={position as [number, number, number]}
          rotation={rotation as [number, number, number]}
          receiveShadow
        >
          <planeGeometry args={size as [number, number]} />
          {/* Sized from the wall's own length, so a bay is the same width on
              the long walls and the short ones and no panel is sliced. */}
          <meshStandardMaterial map={getShopWallTexture(size[0] ?? 0)} roughness={0.92} />
        </mesh>
      ))}

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
        {/*
          Pigment only. The `roughnessMap` went back.

          Varying the polish across the floor was the nicest thing on it and the
          most expensive: a second texture sample on the largest plane in the
          room, which fills most of the screen. Beat 8 of the walkthrough — the
          walk to the till — is a fixed number of key bursts, so slower frames
          cover less ground and the player walks straight past the counter. That
          beat failed here and passed on main, twice each, until this came out.

          No `color` alongside the map either: a colour multiplies the map, and
          both were the floor's dark plum, so keeping it darkened the floor twice
          and sank the room.
        */}
        <meshStandardMaterial map={floorTexture} roughness={0.48} metalness={0.22} />
      </mesh>

      {/*
        Neon coving where the walls meet the ceiling, doubled as on the sheet.

        Two runs, down the long walls, each tucked under a shelf.

        The reference's cove goes round all four and it was built that way, then
        cut back: this room renders at about one frame a second headless, and
        four runs plus their shelves was six more draw calls than it could carry.
        The shelf is what earns its place — a bare stripe near the ceiling reads
        as paint, and the same stripe with a reveal above it reads as a recess.
      */}
      {[
        { key: 'left', at: [-(HALF_WIDTH - 0.05), 0] as const, span: ROOM_DEPTH - 0.5, along: 'z' as const },
        { key: 'right', at: [HALF_WIDTH - 0.05, 0] as const, span: ROOM_DEPTH - 0.5, along: 'z' as const },
      ].map(({ key, at, span, along }) => {
        const tube: [number, number, number] = along === 'z' ? [0.06, 0.08, span] : [span, 0.08, 0.06]
        const trim: [number, number, number] = along === 'z' ? [0.05, 0.05, span] : [span, 0.05, 0.05]
        const shelf: [number, number, number] =
          along === 'z' ? [0.2, 0.04, span] : [span, 0.04, 0.2]

        return (
          <group key={key} position={[at[0], 0, at[1]]}>
            {/* The shelf the tube is tucked under. */}
            <mesh position={[0, WALL_HEIGHT - 0.2, 0]}>
              <boxGeometry args={shelf} />
              <meshStandardMaterial color={PANEL} roughness={0.8} />
            </mesh>
            <mesh position={[0, WALL_HEIGHT - 0.3, 0]}>
              <boxGeometry args={tube} />
              <meshBasicMaterial color={venue.neonColor} toneMapped={false} />
            </mesh>
            <mesh position={[0, WALL_HEIGHT - 0.46, 0]}>
              <boxGeometry args={trim} />
              <meshBasicMaterial color={BRASS_LIT} toneMapped={false} />
            </mesh>
            {/*
              What the tube actually throws. Kept dim and short-range: this is a
              wash on the wall it is fixed to, and four of them at any strength
              would light the room the plum walls exist to keep dark.
            */}
            {/*
              No lamp on the cove, deliberately.

              A pointLight here washed the wall beautifully and cost two of this
              room's light slots, and the shop cannot afford them: three.js
              forward-renders every light into every shader, and adding lights
              here slowed the headless render enough that the walkthrough's
              scripted walk stopped reaching the mirror — the failure
              `MIRROR_RADIUS` already carries a note about. The tube is emissive
              and the shelf above it casts the reveal; that is the whole look.
            */}
          </group>
        )
      })}

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

        {/*
          The backdrop the dummies stand against.

          Three dark figures in front of a dark plum wall is three silhouettes
          with nothing behind them to be silhouettes against — the reference puts
          a lit blue field in a wood surround behind its window, and that panel
          is most of why the clothes read at all. Faces into the room, so it
          catches the platform's own downlights.
        */}
        {/*
          Behind the dummies means the *far* side of the platform.

          The player stands out in the room at a lower z and looks toward the
          front wall, so "behind" is +z. Put on the near side it is not a
          backdrop, it is a hoarding: the first version stood a two-metre wood
          panel between the camera and all three outfits and hid the entire
          window.
        */}
        <group position={[0, 0, (WINDOW_PLATFORM.maxZ - WINDOW_PLATFORM.minZ) / 2 + 0.04]}>
          <mesh position={[0, BACKDROP_HEIGHT / 2 + 0.05, 0.03]}>
            <boxGeometry
              args={[WINDOW_PLATFORM.maxX - WINDOW_PLATFORM.minX + 0.24, BACKDROP_HEIGHT + 0.2, 0.07]}
            />
            <meshStandardMaterial color={WOOD} roughness={0.65} />
          </mesh>
          {/* The blue field, turned to face back into the room. */}
          <mesh position={[0, BACKDROP_HEIGHT / 2 + 0.05, -0.012]} rotation={[0, Math.PI, 0]}>
            <planeGeometry
              args={[WINDOW_PLATFORM.maxX - WINDOW_PLATFORM.minX + 0.02, BACKDROP_HEIGHT]}
            />
            <meshStandardMaterial color={BACKDROP} roughness={0.85} />
          </mesh>
          {/* A brass reveal where the panel meets its surround. */}
          <mesh position={[0, BACKDROP_HEIGHT + 0.16, -0.02]}>
            <boxGeometry
              args={[WINDOW_PLATFORM.maxX - WINDOW_PLATFORM.minX + 0.26, 0.035, 0.05]}
            />
            <meshStandardMaterial color={BRASS} roughness={0.35} metalness={0.8} />
          </mesh>
        </group>
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
            The deck the pieces stand on — and the whole of what used to be
            wrong.

            This was a *solid* emissive box filling the glazed volume, on the
            reasoning that a case is lit from inside. It is, but a lit solid is
            not a lit space: `CasePiece` puts its bust and the piece itself in
            here, so every one of the four items sold from these cases was
            sealed inside a featureless cream slab. A case with nothing in it and
            a case with a necklace hidden in it are the same picture, which is
            why it survived.

            A thin lit deck. Emissive rather than a lamp inside the case, and
            that is a performance decision rather than an aesthetic one: this
            room forward-renders about thirteen downlights already, and adding
            real lamps to the cases took the headless frame rate from seven
            frames in eighteen seconds to zero. The emissive was never what was
            wrong — a solid emissive *volume* containing the goods was.
          */}
          <mesh position={[0, CASE_DECK_Y, 0]} receiveShadow>
            <boxGeometry
              args={[
                box.maxX - box.minX - 0.06,
                CASE_DECK_THICKNESS,
                box.maxZ - box.minZ - 0.06,
              ]}
            />
            <meshStandardMaterial
              color={CASE_GLOW}
              roughness={0.85}
              emissive={CASE_GLOW}
              emissiveIntensity={0.22}
            />
          </mesh>

          {/*
            Glass: a top and two long sides, so a case seen from the floor is a
            box you look into rather than a lid on a plinth.

            `depthWrite={false}` on every pane. A transparent surface that writes
            depth occludes whatever is drawn after it — which, for the panes
            nearest the camera, is the jewellery directly behind them.
          */}
          <mesh position={[0, CASE_GLASS_Y, 0]}>
            <boxGeometry args={[box.maxX - box.minX, 0.03, box.maxZ - box.minZ]} />
            <meshStandardMaterial
              color={CASE_GLASS}
              roughness={0.06}
              metalness={0.2}
              transparent
              opacity={0.24}
              depthWrite={false}
            />
          </mesh>
          {/*
            Glass on the top only, not the sides.

            The sides looked better and cost four transparent draws per case,
            and transparency is the expensive kind: no early-z, and blending
            every fragment behind it. On a loaded machine that was the
            difference between the walkthrough reaching the till at beat 8 and
            walking past it — that beat is the most frame-rate-sensitive in the
            suite, because the walk is a fixed number of key bursts and slower
            frames cover less ground. The brass frame and the lit deck are what
            say "case"; the side glass was saying it a second time.
          */}
          {/* Brass corner posts, joining the edge rails into a frame. */}
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`post-${sx}:${sz}`}
                position={[
                  (sx * (box.maxX - box.minX)) / 2,
                  (CASE_DECK_Y + CASE_GLASS_Y) / 2,
                  (sz * (box.maxZ - box.minZ)) / 2,
                ]}
              >
                <boxGeometry args={[0.04, CASE_GLASS_Y - CASE_DECK_Y, 0.04]} />
                <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.7} />
              </mesh>
            )),
          )}
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
        {/*
          Four shelves, each with its own lit back and a visible front edge.

          It was two backs at `emissiveIntensity` 0.5, which in the darkest room
          in the game blew to one flat gold sheet with no shelves in it at all —
          a wall of shoes reading as a lamp. Four backs at a lower value gives
          the same total light spread over four readable shelves instead of one
          blown slab, and costs no extra lights: this room cannot afford any.
        */}
        {CABINET_SHELVES.map((height) => (
          <group key={height}>
            <mesh
              position={[CABINET_DEPTH / 2 - 0.09, height + 0.24, 0]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <planeGeometry args={[CABINET_WIDTH - 0.16, 0.48]} />
              <meshStandardMaterial
                color={CASE_GLOW}
                roughness={0.92}
                emissive={CASE_GLOW}
                emissiveIntensity={0.34}
              />
            </mesh>
            {/* The shelf itself, and its brass nosing. */}
            <mesh position={[0, height - 0.02, 0]} receiveShadow>
              <boxGeometry args={[CABINET_DEPTH - 0.12, 0.04, CABINET_WIDTH - 0.14]} />
              <meshStandardMaterial color={WOOD} roughness={0.7} />
            </mesh>
            <mesh position={[-CABINET_DEPTH / 2 + 0.07, height - 0.01, 0]}>
              <boxGeometry args={[0.03, 0.025, CABINET_WIDTH - 0.14]} />
              <meshStandardMaterial color={BRASS} roughness={0.4} metalness={0.7} />
            </mesh>
          </group>
        ))}

        {/*
          Stock, so the unit reads as a wall of shoes rather than two pairs and
          two bare ledges.

          One box per *pair*, not per shoe. The first attempt at this drew both
          shoes of every pair and cost sixteen boxes for two shelves, in the room
          that could not complete a screenshot inside thirty seconds with them
          in. At the distance this cabinet is seen from, a pair is a single
          shape; the two catalogue pairs are drawn properly because those are the
          ones you walk over to look at.
        */}
        {CABINET_SHELVES.map((height, shelf) => {
          // The two middle shelves carry the catalogue; stock fills round it.
          const isCatalogue = shelf === 1 || shelf === 2
          const slots = isCatalogue ? [-0.95, 0.95] : [-1.05, -0.35, 0.35, 1.05]

          return slots.map((offset) => (
            <mesh
              key={`stock-${height}-${offset}`}
              position={[0.02, height + 0.07, offset]}
              rotation={[0, offset > 0 ? 0.1 : -0.08, 0]}
              castShadow
            >
              <boxGeometry args={[0.3, 0.1, 0.24]} />
              <meshStandardMaterial
                color={offset < 0 ? '#3a2418' : '#4a2f1e'}
                roughness={0.42}
              />
            </mesh>
          ))
        })}
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
        {/* The rug takes the nap too, so plinth and rug read as one material
            rather than as two flat discs of slightly different brown. */}
        <meshStandardMaterial color={RUG} roughness={0.96} normalMap={velvet} />
      </mesh>
      <group position={[FITTING[0], 0, FITTING[1]]}>
        <mesh position={[0, FITTING_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[FITTING_RADIUS, FITTING_RADIUS + 0.05, FITTING_HEIGHT, 40]} />
          {/*
            Velvet, which is what you stand on to be looked at.

            A normal map rather than more geometry or another light: this room
            forward-renders thirteen point lights already and cannot carry a
            fourteenth, but a texture is free. See `shopTexture.ts`.
          */}
          <meshStandardMaterial color={PLINTH_TOP} roughness={0.85} normalMap={velvet} />
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
        The counter, its own light, and the person behind it.

        The light is not optional. Every fixture in this room carries one
        because the room is dark everywhere it is not selling something, and a
        counter without one is a black slab with a lit shop behind it — which is
        exactly what the first capture showed.
      */}
      <Counter />
      <BackShelf />
      <pointLight
        position={[(COUNTER.minX + COUNTER.maxX) / 2, LIGHT_HEIGHT, (COUNTER.minZ + COUNTER.maxZ) / 2]}
        color="#ffe0b8"
        intensity={16}
        distance={6.5}
      />
      <mesh
        position={[
          (COUNTER.minX + COUNTER.maxX) / 2,
          WALL_HEIGHT - 0.04,
          (COUNTER.minZ + COUNTER.maxZ) / 2,
        ]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[0.09, 16]} />
        <meshBasicMaterial color="#c9a678" />
      </mesh>
      <ShopClerk />

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

      {/*
        Three ways to be in this room: on the plinth, at the counter, or walking.
        The first two unmount the walk entirely, which is what stops a proximity
        check running against a player who is not on their own feet.
      */}
      {atMirror && (
        <>
          <MirrorCamera />
          <group position={[FITTING[0], FITTING_HEIGHT, FITTING[1]]} rotation={[0, Math.PI, 0]}>
            <CasinoCharacter appearance={appearance} equipped={worn} />
          </group>
        </>
      )}

      {atCheckout && (
        <>
          <DeskCamera />
          <group position={[DESK_STAND[0], 0, DESK_STAND[2]]} rotation={[0, DESK_FACING, 0]}>
            <CasinoCharacter appearance={appearance} equipped={worn} />
          </group>
        </>
      )}

      {!atMirror && !atCheckout && (
        <WalkingPlayer
          bounds={WALK_BOUNDS}
          spawn={shopPosition}
          facing={shopFacing}
          targets={targets}
          onNearest={handleNearest}
          glanceTargets={glanceTargets}
          onGlance={handleGlance}
          obstacles={solids}
          distance={4.4}
          pitch={0.42}
          cameraBounds={CAMERA_BOUNDS}
        />
      )}
    </>
  )
}
