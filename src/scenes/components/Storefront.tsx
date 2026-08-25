import { DoubleSide, type Texture } from 'three'
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
  SIGN_MAX_Y,
  SIGN_MIN_Y,
  SIGN_OUT,
  storefrontFrame,
  STOREFRONT_MAX_Z,
  STOREFRONT_MIN_Z,
  WINDOW_MAX_Z,
  WINDOW_MIN_Z,
  WINDOW_SILL_Y,
  WINDOW_TOP_Y,
} from '../storefrontLayout'

/*
 * The shell every storefront on the strip shares: the frontage panels around
 * the openings, the window and its frame, the glass, the fascia sign, the door
 * and its surround, and the light it throws on the pavement.
 *
 * What goes *behind the glass* is the caller's, passed as children — mannequins
 * for the shop, blinds and a red cross for the clinic. That is the only real
 * difference between the two, and pulling the shell out is what stops the
 * clinic being a three-hundred-line copy of the shop that drifts from it.
 */

const WINDOW_CENTER_Z = (WINDOW_MIN_Z + WINDOW_MAX_Z) / 2
const WINDOW_WIDTH = WINDOW_MAX_Z - WINDOW_MIN_Z
const WINDOW_HEIGHT = WINDOW_TOP_Y - WINDOW_SILL_Y
const WINDOW_CENTER_Y = (WINDOW_SILL_Y + WINDOW_TOP_Y) / 2

const STOREFRONT_CENTER_Z = (STOREFRONT_MIN_Z + STOREFRONT_MAX_Z) / 2
const STOREFRONT_WIDTH = STOREFRONT_MAX_Z - STOREFRONT_MIN_Z

const SIGN_CENTER_Y = (SIGN_MIN_Y + SIGN_MAX_Y) / 2
const SIGN_HEIGHT = SIGN_MAX_Y - SIGN_MIN_Y

export interface Awning {
  readonly canopy: string
  readonly scallop: string
}

interface StorefrontProps {
  venue: VenueConfig
  /** How brightly the frontage burns, 0 to 1. Washes out in daylight. */
  neonLevel?: number | undefined
  /** The fascia sign, drawn to canvas by `signTexture.ts`. */
  signTexture: Texture
  /** Colour of the light spilling out of the window and the doorway. */
  interiorLight: string
  /** The frontage's own masonry. */
  frontageColor: string
  /** The band above the sign. */
  fasciaColor: string
  /** Omit for a flat frontage. The clinic has no awning; the shop does. */
  awning?: Awning | undefined
  /** What sits behind the glass. */
  children?: React.ReactNode
}

export function Storefront({
  venue,
  neonLevel = 1,
  signTexture,
  interiorLight,
  frontageColor,
  fasciaColor,
  awning,
  children,
}: StorefrontProps) {
  const [doorX, doorY, doorZ] = venue.doorPosition
  const { facing, at, facingStreet } = storefrontFrame(doorX)

  const trim = dimHex(venue.neonColor, neonLevel)

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
          <meshStandardMaterial color={frontageColor} roughness={0.85} />
        </mesh>
      ))}

      {/* Fascia band above the sign. */}
      <mesh
        position={at(FRONT_OUT + 0.03, SIGN_MAX_Y + 0.35, STOREFRONT_CENTER_Z)}
        rotation={facingStreet}
      >
        <planeGeometry args={[STOREFRONT_WIDTH, 0.5]} />
        <meshStandardMaterial color={fasciaColor} roughness={0.4} metalness={0.6} />
      </mesh>

      {children}

      {/*
        The glass. Drawn after the window's contents so it sits over them, and
        barely opaque — a stronger tint turns the window into a mirror and hides
        everything the display is for.
      */}
      <mesh
        position={at(FRONT_OUT + 0.01, WINDOW_CENTER_Y, WINDOW_CENTER_Z)}
        rotation={facingStreet}
      >
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
      {awning && (
        <>
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
            <meshStandardMaterial color={awning.canopy} roughness={0.75} />
          </mesh>
          {Array.from({ length: 10 }, (_, index) => {
            const span = WINDOW_WIDTH + 0.5
            const z = WINDOW_CENTER_Z - span / 2 + ((index + 0.5) / 10) * span

            return (
              <mesh key={index} position={at(AWNING_FRONT_OUT - 0.02, AWNING_FRONT_Y - 0.1, z)}>
                <cylinderGeometry args={[span / 20, span / 20, 0.05, 10, 1, false, 0, Math.PI]} />
                <meshStandardMaterial color={awning.scallop} roughness={0.75} side={DoubleSide} />
              </mesh>
            )
          })}
        </>
      )}

      {/* Fascia sign — not a bulb marquee, which is the casinos' vocabulary. */}
      <mesh position={at(SIGN_OUT, SIGN_CENTER_Y, STOREFRONT_CENTER_Z)} rotation={facingStreet}>
        <planeGeometry args={[STOREFRONT_WIDTH - 0.4, SIGN_HEIGHT]} />
        <meshBasicMaterial map={signTexture} toneMapped={false} transparent />
      </mesh>

      {/* Recessed glass door with a lit surround. */}
      <mesh position={at(FACADE_OUT + 0.02, DOOR_HEIGHT / 2, 0)} rotation={facingStreet}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2, DOOR_HEIGHT]} />
        <meshStandardMaterial
          color={interiorLight}
          emissive={interiorLight}
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
          <meshBasicMaterial color={trim} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={at(FRONT_OUT + 0.02, DOOR_HEIGHT + 0.12, 0)} rotation={facingStreet}>
        <planeGeometry args={[DOOR_HALF_WIDTH * 2 + 0.33, 0.09]} />
        <meshBasicMaterial color={trim} toneMapped={false} />
      </mesh>

      {/* The pool the window throws on the pavement. */}
      <pointLight
        position={at(FRONT_OUT + 0.9, 1.4, WINDOW_CENTER_Z)}
        color={interiorLight}
        intensity={9}
        distance={7}
        decay={2}
      />

      {/* Doorway spill, so the entrance still reads as a light source by day. */}
      <pointLight
        position={at(FRONT_OUT + 1.2, 2.2, 0)}
        color={trim}
        intensity={10 * (0.25 + 0.75 * neonLevel)}
        distance={10}
        decay={2}
      />
    </group>
  )
}
