import { WINDOW_DISPLAY } from '../../character/windowDisplay'
import type { VenueConfig } from '../../world/venues'
import { getShopSignTexture } from '../signTexture'
import {
  FRONT_OUT,
  INTERIOR_OUT,
  MANNEQUIN_OUT,
  MANNEQUIN_PLATFORM_Y,
  MANNEQUIN_Z,
  storefrontFrame,
  WINDOW_MAX_Z,
  WINDOW_MIN_Z,
  WINDOW_SILL_Y,
  WINDOW_TOP_Y,
} from '../storefrontLayout'
import { CasinoCharacter } from './CasinoCharacter'
import { Storefront } from './Storefront'

/*
 * The Gilded Hanger, from the street.
 *
 * Built to `art/refs/shop_exterior_wide.png`, which was generated to answer one
 * question: why does the shop read as a third casino? The answer was that it
 * was one — the same full-height tower, the same bulb marquee, the same blade
 * sign and the same flat door slab as the Golden Ace, differing only in hex
 * value.
 *
 * The frontage, window, glass, sign and door are `Storefront`, shared with the
 * clinic. What is left here is the only part that is actually a clothes shop:
 * three mannequins wearing the catalogue, and rails of stock behind them.
 */

interface ShopFrontProps {
  venue: VenueConfig
  neonLevel?: number
}

/** Warm shop light, as distinct from the strip's cold neon. */
const INTERIOR_LIGHT = '#ffd9a0'

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

export function ShopFront({ venue, neonLevel = 1 }: ShopFrontProps) {
  const { facing, at, facingStreet } = storefrontFrame(venue.doorPosition[0])

  return (
    <Storefront
      venue={venue}
      neonLevel={neonLevel}
      signTexture={getShopSignTexture(venue.name, venue.neonColor)}
      interiorLight={INTERIOR_LIGHT}
      frontageColor="#2a1a2e"
      fasciaColor="#8a6a24"
      awning={{ canopy: '#c2265f', scallop: '#e8dcd0' }}
    >
      {/*
        The back of the display: a bright panel on the tower's own face.

        Muted, and emissive only gently. The strip's night bloom threshold is
        set low so neon tubes glow, which means any pale lit surface blooms with
        them — a near-white panel came back as a flare that ate the middle
        mannequin and turned the other two into silhouettes.
      */}
      <mesh
        position={at(INTERIOR_OUT + 0.02, WINDOW_CENTER_Y, WINDOW_CENTER_Z)}
        rotation={facingStreet}
      >
        <planeGeometry args={[WINDOW_WIDTH, WINDOW_HEIGHT]} />
        <meshStandardMaterial
          color="#c9b795"
          emissive="#ffe0ad"
          emissiveIntensity={0.1}
          roughness={0.95}
        />
      </mesh>

      {/* Display platform the dummies stand on. */}
      <mesh
        position={at(
          (INTERIOR_OUT + FRONT_OUT) / 2,
          WINDOW_SILL_Y + MANNEQUIN_PLATFORM_Y / 2,
          WINDOW_CENTER_Z,
        )}
      >
        <boxGeometry args={[FRONT_OUT - INTERIOR_OUT, MANNEQUIN_PLATFORM_Y, WINDOW_WIDTH]} />
        <meshStandardMaterial color="#d8cbb0" roughness={0.8} />
      </mesh>

      {/* Stock hung flat against the back panel, either side of the dummies. */}
      {[-1.35, 1.35].map((offset) => (
        <group
          key={offset}
          position={at(INTERIOR_OUT + 0.1, WINDOW_SILL_Y, WINDOW_CENTER_Z + offset)}
        >
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
      {WINDOW_DISPLAY.map((dressed, index) => (
        <group
          key={index}
          position={at(
            MANNEQUIN_OUT,
            WINDOW_SILL_Y + MANNEQUIN_PLATFORM_Y,
            MANNEQUIN_Z[index] ?? 0,
          )}
          // Turned to face the street, then angled slightly so the row does not
          // read as three identical cut-outs.
          rotation={[0, facing * Math.PI * 0.5 + (index - 1) * 0.22, 0]}
        >
          <CasinoCharacter appearance={dressed.appearance} equipped={dressed.equipped} mannequin />
        </group>
      ))}

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
    </Storefront>
  )
}
