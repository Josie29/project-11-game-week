import { DoubleSide } from 'three'
import { getAcanthusTexture, getBalustradeTexture, getUpperBayTexture } from '../casinoTexture'
import {
  COLUMN_RADIUS,
  COLUMN_X,
  COLUMNS,
  MEZZANINE_DEPTH,
  MEZZANINE_HEIGHT,
  ROOM,
  WALL_HEIGHT,
} from '../casinoFloorLayout'

/*
 * The gold order down the Golden Ace's long walls, and the balcony it carries.
 *
 * Both are laid out in `casinoFloorLayout.ts` and every column goes through
 * `clearsFloor` in the test before it is drawn here — the strip's colonnade
 * shipped as relief rather than as furniture and put a pillar in front of all
 * three venue doors, and this is the same shape of object in the same kind of
 * room.
 *
 * The balcony deliberately does not return across the far wall. A brass rail
 * over the top of the waterfall would cut the one thing the room is arranged
 * around, and the reference does not have one either.
 */

interface ColonnadeProps {
  /** House colour, for the strip of neon under the balcony. */
  neonColor: string
}

const ROOM_DEPTH = ROOM.maxZ - ROOM.minZ
const ROOM_CENTER_Z = (ROOM.minZ + ROOM.maxZ) / 2

/** How many four-bay screen panels the balcony's run gets. */
const BALUSTRADE_PANELS = Math.round(ROOM_DEPTH / 1.6)

/** Where the soffit downlights sit along each balcony, at the reference's spacing. */
const SOFFIT_SPACING = 2.4
const SOFFIT_Z: readonly number[] = Array.from(
  { length: Math.floor(ROOM_DEPTH / SOFFIT_SPACING) },
  (_, index) => ROOM.minZ + (index + 0.5) * SOFFIT_SPACING,
)

/**
 * One column, base to capital.
 *
 * The shaft is a low-segment cylinder with flat shading rather than modelled
 * flutes: at sixteen facets the silhouette is round and the faces catch the
 * pendants as a ring of separate highlights, which is the read fluting gives
 * from across a room. Actual flutes would be forty more faces for a difference
 * nobody standing at a table can resolve.
 */
function Column({ x, z }: { x: number; z: number }) {
  const shaftHeight = WALL_HEIGHT - 0.75

  return (
    <group position={[x, 0, z]}>
      {/* Plinth. */}
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[COLUMN_RADIUS * 2.5, 0.28, COLUMN_RADIUS * 2.5]} />
        <meshStandardMaterial color="#2a2130" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Torus base. */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[COLUMN_RADIUS * 1.22, COLUMN_RADIUS * 1.32, 0.24, 16]} />
        <meshStandardMaterial color="#8d6f30" roughness={0.35} metalness={0.85} />
      </mesh>

      {/* Shaft, tapered as a real one is. */}
      <mesh position={[0, 0.5 + shaftHeight / 2, 0]} castShadow>
        <cylinderGeometry args={[COLUMN_RADIUS * 0.86, COLUMN_RADIUS, shaftHeight, 16, 1]} />
        <meshStandardMaterial color="#a5813a" roughness={0.32} metalness={0.88} flatShading />
      </mesh>

      {/* Capital: a collar, a spreading bell and an abacus on top. */}
      <mesh position={[0, 0.5 + shaftHeight + 0.06, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 0.95, COLUMN_RADIUS * 0.86, 0.12, 16]} />
        <meshStandardMaterial color="#c9a34c" roughness={0.28} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.5 + shaftHeight + 0.32, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 1.42, COLUMN_RADIUS * 0.95, 0.4, 16]} />
        <meshStandardMaterial color="#c9a34c" roughness={0.26} metalness={0.9} flatShading />
      </mesh>
      {/*
        Acanthus, wrapped round the bell as a cut-out rather than modelled.

        Five leaves and two volutes per capital, times ten columns, is fifty
        extra meshes for foliage that is eight metres up and never seen closer
        than four. It is also the only part of a Corinthian order anybody
        actually recognises, so leaving it off is not an option either.
      */}
      <mesh position={[0, 0.5 + shaftHeight + 0.32, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 1.46, COLUMN_RADIUS * 0.99, 0.42, 16, 1, true]} />
        <meshStandardMaterial
          map={getAcanthusTexture()}
          alphaTest={0.35}
          roughness={0.3}
          metalness={0.85}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.5 + shaftHeight + 0.58, 0]}>
        <boxGeometry args={[COLUMN_RADIUS * 3, 0.14, COLUMN_RADIUS * 3]} />
        <meshStandardMaterial color="#d8b45c" roughness={0.24} metalness={0.9} />
      </mesh>
    </group>
  )
}

/** The balcony deck, its fascia, and the brass rail along its edge. */
function Balcony({ wallX, inward, neonColor }: { wallX: number; inward: number; neonColor: string }) {
  const edgeX = wallX + inward * MEZZANINE_DEPTH
  const deckCenterX = wallX + (inward * MEZZANINE_DEPTH) / 2

  return (
    <group>
      {/* Deck. */}
      <mesh position={[deckCenterX, MEZZANINE_HEIGHT, ROOM_CENTER_Z]} receiveShadow>
        <boxGeometry args={[MEZZANINE_DEPTH, 0.22, ROOM_DEPTH]} />
        <meshStandardMaterial color="#241a30" roughness={0.85} />
      </mesh>

      {/* Fascia along the deck's edge, in a lighter stone than the wall. */}
      <mesh position={[edgeX - inward * 0.08, MEZZANINE_HEIGHT - 0.22, ROOM_CENTER_Z]}>
        <boxGeometry args={[0.16, 0.42, ROOM_DEPTH]} />
        <meshStandardMaterial color="#6b5228" roughness={0.4} metalness={0.7} />
      </mesh>

      {/*
        Neon under the balcony rather than only at the ceiling.

        The room's coving is nearly eight metres up now and the walking camera
        looks *down*, so a line up there is out of frame for most of a crossing.
        This one sits at four, which is where the eye is.
      */}
      <mesh position={[edgeX - inward * 0.2, MEZZANINE_HEIGHT - 0.46, ROOM_CENTER_Z]}>
        <boxGeometry args={[0.08, 0.09, ROOM_DEPTH - 0.4]} />
        <meshBasicMaterial color={neonColor} toneMapped={false} />
      </mesh>

      {/* Top rail. */}
      <mesh position={[edgeX - inward * 0.1, MEZZANINE_HEIGHT + 1.06, ROOM_CENTER_Z]}>
        <boxGeometry args={[0.12, 0.09, ROOM_DEPTH]} />
        <meshStandardMaterial color="#b08c3e" roughness={0.3} metalness={0.9} />
      </mesh>

      {/*
        The balustrade, as the same pierced screen the pool uses.

        Seventeen turned balusters a side, thirty-four across the room, for a
        row of thin cylinders that at this distance is a row of thin cylinders.
        One cut-out plane a side gives the reference's openwork instead, and the
        two runs now match — they are the same balustrade in the same building.
      */}
      <mesh
        position={[edgeX - inward * 0.1, MEZZANINE_HEIGHT + 0.62, ROOM_CENTER_Z]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[ROOM_DEPTH, 0.9]} />
        <meshStandardMaterial
          map={getBalustradeTexture(BALUSTRADE_PANELS)}
          alphaTest={0.4}
          roughness={0.35}
          metalness={0.9}
          side={DoubleSide}
        />
      </mesh>

      {/*
        Recessed downlights in the balcony's soffit.

        The underside of the deck was a two-metre-deep dark shelf running the
        length of both walls, which is most of what the eye sees above the
        tables. Emissive discs for the fittings, and a *few* real lights rather
        than one per fitting — held well clear of the soffit they are set into,
        because a point light close to a lit surface is a visible object and
        this room has already grown three of those once.
      */}
      {SOFFIT_Z.map((z) => (
        <mesh
          key={z}
          position={[edgeX - inward * 0.85, MEZZANINE_HEIGHT - 0.12, z]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.2, 14]} />
          <meshBasicMaterial color="#ffd79a" toneMapped={false} />
        </mesh>
      ))}

      {/*
        One real light for the whole run, not one per fitting.

        Seven fittings a side with a light behind every other one put eight more
        point lights in a room that already had seven, and the scene went from
        rendering in under a second to timing out a thirty-second screenshot.
        Nothing was broken — every material in the room simply started looping
        over fifteen lights per fragment, which a machine without a GPU cannot
        do at any speed. The fittings are emissive discs, which cost nothing,
        and one lamp behind them lights the soffit they are set into.
      */}
      <pointLight
        position={[edgeX - inward * 0.85, MEZZANINE_HEIGHT - 1.3, ROOM_CENTER_Z]}
        color="#ffcf94"
        intensity={34}
        distance={16}
      />
    </group>
  )
}

export function Colonnade({ neonColor }: ColonnadeProps) {
  return (
    <group>
      {COLUMNS.map(([x, z]) => (
        <Column key={`${x}:${z}`} x={x} z={z} />
      ))}

      <Balcony wallX={ROOM.minX} inward={1} neonColor={neonColor} />
      <Balcony wallX={ROOM.maxX} inward={-1} neonColor={neonColor} />

      {/*
        The upper storey behind the balcony: an arcade of dark arched openings
        with a lamp burning in each, painted on the wall.

        It replaces eight emissive rectangles that read exactly like eight
        rectangles of white paper stuck to the plaster. Painted rather than
        built, because rooms the player can see into and never reach are a thing
        this project has already decided against — the old casino filled its
        background with tables receding into haze and it read as being kept away
        from them. Scenery four metres above head height reads as scenery.
      */}
      {COLUMN_X.map((wallX) => (
        <mesh
          key={wallX}
          position={[wallX + (wallX < 0 ? 0.12 : -0.12), MEZZANINE_HEIGHT + 1.75, ROOM_CENTER_Z]}
          rotation={[0, wallX < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <planeGeometry args={[ROOM_DEPTH, 3.5]} />
          <meshStandardMaterial map={getUpperBayTexture(3)} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}
