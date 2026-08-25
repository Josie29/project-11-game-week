import { DoubleSide } from 'three'
import { Garment, HairStyle, type Appearance } from '../../character/appearance'
import { Slot, type EquippedItems } from '../../character/catalog'
import { Silhouette } from '../../character/proportions'
import { dimHex } from '../../world/timeOfDay'
import type { VenueConfig } from '../../world/venues'
import {
  AWNING_BACK_Y,
  AWNING_FRONT_OUT,
  AWNING_FRONT_Y,
  DOOR_HALF_WIDTH,
  DOOR_HEIGHT,
  FACADE_OUT,
  FRONT_OUT,
  FRONTAGE_PANELS,
  INTERIOR_OUT,
  MANNEQUIN_OUT,
  MANNEQUIN_PLATFORM_Y,
  MANNEQUIN_Z,
  SIGN_MAX_Y,
  SIGN_MIN_Y,
  SIGN_OUT,
  STOREFRONT_MAX_Z,
  STOREFRONT_MIN_Z,
  WINDOW_MAX_Z,
  WINDOW_MIN_Z,
  WINDOW_SILL_Y,
  WINDOW_TOP_Y,
} from '../shopFrontLayout'
import { getShopSignTexture } from '../signTexture'
import { CasinoCharacter } from './CasinoCharacter'

/*
 * The Gilded Hanger, from the street.
 *
 * Built to `art/refs/shop_exterior_wide.png`, which was generated to answer one
 * question: why does the shop read as a third casino? The answer was that it
 * was one — the same full-height tower, the same bulb marquee, the same blade
 * sign and the same flat door slab as the Golden Ace, differing only in hex
 * value.
 *
 * Five things fix that, and all five are in the reference:
 *
 * 1. A low two-storey frontage set against the base of the tower, where the
 *    casinos are full height. This is the silhouette change and it does most of
 *    the work.
 * 2. A plate-glass display window, which no casino on the strip has.
 * 3. Warm interior light spilling onto the pavement, against the casinos' cold
 *    saturated neon.
 * 4. Mannequins wearing the actual catalogue, so the window advertises what is
 *    inside.
 * 5. A neon box sign instead of a bulb marquee — a different sign language.
 *
 * Geometry comes from `shopFrontLayout.ts`, which is pure and tested.
 */

interface ShopFrontProps {
  venue: VenueConfig
  /** How brightly the neon burns, 0 to 1. Washes out in daylight. */
  neonLevel?: number
}

/** Warm shop light, as distinct from the strip's cold neon. */
const INTERIOR_LIGHT = '#ffd9a0'

/**
 * What is in the window this season.
 *
 * The three garments the reference puts on display, which are also three of the
 * outerwear items on sale inside. A window showing clothes the shop does not
 * stock is the sort of detail that costs nothing to get right and reads as
 * carelessness when it is wrong.
 */
const DISPLAY: readonly { appearance: Appearance; equipped: EquippedItems }[] = [
  {
    appearance: {
      silhouette: Silhouette.Masculine,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.Suit,
      garmentColor: 'charcoal',
    },
    equipped: { [Slot.Outerwear]: 'sequin-jacket', [Slot.Feet]: 'oxblood-oxfords' },
  },
  {
    appearance: {
      silhouette: Silhouette.Feminine,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.CocktailDress,
      garmentColor: 'crimson',
    },
    equipped: { [Slot.Outerwear]: 'crimson-gown', [Slot.Feet]: 'gold-heels' },
  },
  {
    appearance: {
      silhouette: Silhouette.Androgynous,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.Suit,
      garmentColor: 'midnight',
    },
    equipped: { [Slot.Outerwear]: 'ivory-tuxedo', [Slot.Feet]: 'oxblood-oxfords' },
  },
]

/** Garments hanging on the rails behind the display, as position and colour. */
const RAIL_STOCK: readonly { readonly z: number; readonly color: string }[] = [
  { z: -0.36, color: '#8c1030' },
  { z: -0.12, color: '#3a3f4a' },
  { z: 0.12, color: '#c9a227' },
  { z: 0.36, color: '#4a2a52' },
]

const WINDOW_CENTER_Z = (WINDOW_MIN_Z + WINDOW_MAX_Z) / 2
const WINDOW_WIDTH = WINDOW_MAX_Z - WINDOW_MIN_Z
const WINDOW_HEIGHT = WINDOW_TOP_Y - WINDOW_SILL_Y
const WINDOW_CENTER_Y = (WINDOW_SILL_Y + WINDOW_TOP_Y) / 2

const STOREFRONT_CENTER_Z = (STOREFRONT_MIN_Z + STOREFRONT_MAX_Z) / 2
const STOREFRONT_WIDTH = STOREFRONT_MAX_Z - STOREFRONT_MIN_Z

const SIGN_CENTER_Y = (SIGN_MIN_Y + SIGN_MAX_Y) / 2
const SIGN_HEIGHT = SIGN_MAX_Y - SIGN_MIN_Y

export function ShopFront({ venue, neonLevel = 1 }: ShopFrontProps) {
  const [doorX, doorY, doorZ] = venue.doorPosition
  // Venues on the left of the street face +X; those on the right face -X.
  const facing = doorX < 0 ? 1 : -1

  const neon = dimHex(venue.neonColor, neonLevel)
  const signTexture = getShopSignTexture(venue.name, venue.neonColor)

  /** Local `out` offsets become world X once the side of the street is known. */
  const at = (out: number, y: number, z: number): [number, number, number] => [
    facing * out,
    y,
    z,
  ]

  /** A panel facing the street, given its size in (along-street, height). */
  const facingStreet: [number, number, number] = [0, facing * Math.PI * 0.5, 0]

  return (
    <group position={[doorX, doorY, doorZ]}>
      {/*
        The frontage: a low block against the base of the tower, built as the
        wall *around* the window and the door rather than as one box with the
        glass laid on top of it. See `FRONTAGE_PANELS`.
      */}
      {FRONTAGE_PANELS.map((panel) => (
        <mesh
          key={`${panel.minZ}:${panel.minY}`}
          position={at(
            (FACADE_OUT + FRONT_OUT) / 2,
            (panel.minY + panel.maxY) / 2,
            (panel.minZ + panel.maxZ) / 2,
          )}
          castShadow
        >
          <boxGeometry
            args={[FRONT_OUT - FACADE_OUT, panel.maxY - panel.minY, panel.maxZ - panel.minZ]}
          />
          <meshStandardMaterial color="#2a1a2e" roughness={0.85} />
        </mesh>
      ))}

      {/* Gold pinstripe fascia, above the sign. */}
      <mesh position={at(FRONT_OUT + 0.03, SIGN_MAX_Y + 0.35, STOREFRONT_CENTER_Z)} rotation={facingStreet}>
        <planeGeometry args={[STOREFRONT_WIDTH, 0.5]} />
        <meshStandardMaterial color="#8a6a24" roughness={0.4} metalness={0.6} />
      </mesh>

      {/*
        The back of the display: a bright panel on the tower's own face.

        Shallow rather than a deep recessed room, and that is a constraint
        rather than a choice — see `INTERIOR_OUT`. Emissive so it reads as a lit
        shop even before the point light reaches it, which is what separates a
        window from a hole.
      */}
      <mesh position={at(INTERIOR_OUT + 0.02, WINDOW_CENTER_Y, WINDOW_CENTER_Z)} rotation={facingStreet}>
        <planeGeometry args={[WINDOW_WIDTH, WINDOW_HEIGHT]} />
        {/*
          Muted, and emissive only gently.

          The strip's night bloom threshold is set low so neon tubes glow, which
          means any pale lit surface blooms with them. A near-white panel at
          emissive 0.55 came back as a flare that ate the middle mannequin and
          turned the other two into silhouettes — the display lit, and nothing
          in it readable.
        */}
        <meshStandardMaterial
          color="#c9b795"
          emissive="#ffe0ad"
          emissiveIntensity={0.1}
          roughness={0.95}
        />
      </mesh>

      {/* Display platform the dummies stand on. */}
      <mesh
        position={at((INTERIOR_OUT + FRONT_OUT) / 2, WINDOW_SILL_Y + MANNEQUIN_PLATFORM_Y / 2, WINDOW_CENTER_Z)}
      >
        <boxGeometry args={[FRONT_OUT - INTERIOR_OUT, MANNEQUIN_PLATFORM_Y, WINDOW_WIDTH]} />
        <meshStandardMaterial color="#d8cbb0" roughness={0.8} />
      </mesh>

      {/* Stock hung flat against the back panel, either side of the dummies. */}
      {[-1.35, 1.35].map((offset) => (
        <group key={offset} position={at(INTERIOR_OUT + 0.1, WINDOW_SILL_Y, WINDOW_CENTER_Z + offset)}>
          <mesh position={[0, 1.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 0.62, 6]} />
            <meshStandardMaterial color="#c9a227" roughness={0.3} metalness={0.8} />
          </mesh>
          {RAIL_STOCK.map(({ z, color }) => (
            <mesh key={z} position={[0, 1.24, z * 0.56]}>
              <boxGeometry args={[0.06, 0.66, 0.11]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* The dummies. Faceless and hairless — the clothes are the point. */}
      {DISPLAY.map((dressed, index) => (
        <group
          key={index}
          position={at(MANNEQUIN_OUT, WINDOW_SILL_Y + MANNEQUIN_PLATFORM_Y, MANNEQUIN_Z[index] ?? 0)}
          // Turned to face the street, then angled slightly so the row does not
          // read as three identical cut-outs.
          rotation={[0, facing * Math.PI * 0.5 + (index - 1) * 0.22, 0]}
        >
          <CasinoCharacter appearance={dressed.appearance} equipped={dressed.equipped} mannequin />
        </group>
      ))}

      {/* Warm light inside the window, and the pool it throws on the pavement. */}
      {/*
        In front of the dummies rather than behind them. A light against the
        back panel lights the wall and leaves the display as a row of dark
        cut-outs; a shop window is lit from the glass inward.
      */}
      <pointLight
        position={at(FRONT_OUT - 0.05, WINDOW_TOP_Y - 0.3, WINDOW_CENTER_Z)}
        color={INTERIOR_LIGHT}
        intensity={4.5}
        distance={4.5}
        decay={2}
      />
      <pointLight
        position={at(FRONT_OUT + 0.9, 1.4, WINDOW_CENTER_Z)}
        color={INTERIOR_LIGHT}
        intensity={9}
        distance={7}
        decay={2}
      />

      {/*
        The glass. Last in the file so it draws over the interior, and barely
        opaque — a stronger tint turns the window into a mirror and hides
        everything the display is for.
      */}
      <mesh position={at(FRONT_OUT + 0.01, WINDOW_CENTER_Y, WINDOW_CENTER_Z)} rotation={facingStreet}>
        <planeGeometry args={[WINDOW_WIDTH, WINDOW_HEIGHT]} />
        <meshStandardMaterial
          color="#bcd8e4"
          roughness={0.08}
          metalness={0.1}
          transparent
          opacity={0.14}
        />
      </mesh>

      {/* Window frame: a sill, a head and two mullions. */}
      {[WINDOW_SILL_Y, WINDOW_TOP_Y].map((y) => (
        <mesh key={y} position={at(FRONT_OUT + 0.04, y, WINDOW_CENTER_Z)} rotation={facingStreet}>
          <planeGeometry args={[WINDOW_WIDTH + 0.2, 0.14]} />
          <meshStandardMaterial color="#1a1020" roughness={0.7} />
        </mesh>
      ))}
      {[WINDOW_MIN_Z, WINDOW_MAX_Z].map((z) => (
        <mesh key={z} position={at(FRONT_OUT + 0.04, WINDOW_CENTER_Y, z)} rotation={facingStreet}>
          <planeGeometry args={[0.14, WINDOW_HEIGHT + 0.14]} />
          <meshStandardMaterial color="#1a1020" roughness={0.7} />
        </mesh>
      ))}

      {/*
        Scalloped awning over the window. Ten tabs along a sloping panel; the
        scallop is what stops it reading as a shelf, and it is the one shape on
        the block that is neither a rectangle nor a tube.
      */}
      <mesh
        position={at(
          (FACADE_OUT + AWNING_FRONT_OUT) / 2,
          (AWNING_BACK_Y + AWNING_FRONT_Y) / 2,
          WINDOW_CENTER_Z,
        )}
        rotation={[0, 0, facing * -0.36]}
        castShadow
      >
        <boxGeometry args={[AWNING_FRONT_OUT - FACADE_OUT, 0.06, WINDOW_WIDTH + 0.5]} />
        <meshStandardMaterial color="#c2265f" roughness={0.75} />
      </mesh>
      {Array.from({ length: 10 }, (_, index) => {
        const span = WINDOW_WIDTH + 0.5
        const z = WINDOW_CENTER_Z - span / 2 + ((index + 0.5) / 10) * span

        return (
          <mesh key={index} position={at(AWNING_FRONT_OUT - 0.02, AWNING_FRONT_Y - 0.1, z)}>
            <cylinderGeometry args={[span / 20, span / 20, 0.05, 10, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color="#e8dcd0" roughness={0.75} side={DoubleSide} />
          </mesh>
        )
      })}

      {/* Neon fascia sign — a tube in a box, not a bulb marquee. */}
      <mesh position={at(SIGN_OUT, SIGN_CENTER_Y, STOREFRONT_CENTER_Z)} rotation={facingStreet}>
        <planeGeometry args={[STOREFRONT_WIDTH - 0.4, SIGN_HEIGHT]} />
        <meshBasicMaterial map={signTexture} toneMapped={false} transparent />
      </mesh>

      {/* Recessed glass door with a neon surround. */}
      <mesh position={at(FACADE_OUT + 0.02, DOOR_HEIGHT / 2, 0)} rotation={facingStreet}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2, DOOR_HEIGHT]} />
        <meshStandardMaterial
          color={INTERIOR_LIGHT}
          emissive={INTERIOR_LIGHT}
          emissiveIntensity={0.55}
          roughness={0.2}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={at(FRONT_OUT + 0.02, DOOR_HEIGHT / 2, side * (DOOR_HALF_WIDTH + 0.12))}
          rotation={facingStreet}
        >
          <planeGeometry args={[0.09, DOOR_HEIGHT + 0.24]} />
          <meshBasicMaterial color={neon} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={at(FRONT_OUT + 0.02, DOOR_HEIGHT + 0.12, 0)} rotation={facingStreet}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2 + 0.33, 0.09]} />
        <meshBasicMaterial color={neon} toneMapped={false} />
      </mesh>

      {/* Doorway spill, so the entrance still reads as a light source by day. */}
      <pointLight
        position={at(FRONT_OUT + 1.2, 2.2, 0)}
        color={neon}
        intensity={10 * (0.25 + 0.75 * neonLevel)}
        distance={10}
        decay={2}
      />
    </group>
  )
}
