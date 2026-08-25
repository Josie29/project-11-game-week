import type { VenueConfig } from '../../world/venues'
import { getLightboxTexture } from '../signTexture'
import {
  FRONT_OUT,
  INTERIOR_OUT,
  storefrontFrame,
  WINDOW_MAX_Z,
  WINDOW_MIN_Z,
  WINDOW_SILL_Y,
  WINDOW_TOP_Y,
} from '../storefrontLayout'
import { Storefront } from './Storefront'

/*
 * Red River Plasma, from the street.
 *
 * Built to `art/refs/clinic_exterior.png`, whose entire design note is *cold*.
 * Every other frontage on the strip is warm neon selling you a good time; this
 * one is blue-white fluorescent glare through half-closed venetian blinds, a
 * plain backlit sign and a red cross. It has to look like the one building out
 * there that is not on your side — because it is the one you only walk into
 * when the tables have taken everything.
 *
 * Shares `Storefront` with the shop. The differences are all here: blinds
 * instead of a display, no awning, and a lightbox where the shop has neon.
 */

interface ClinicFrontProps {
  venue: VenueConfig
  neonLevel?: number
}

/** Fluorescent, not neon. The one cold light on the street. */
const INTERIOR_LIGHT = '#dff0ff'

/** The cross on the sign and on the glass. */
const CROSS_RED = '#d0323c'

/** How many slats fill the window. Enough to read as blinds, not as stripes. */
const SLAT_COUNT = 16

const WINDOW_CENTER_Z = (WINDOW_MIN_Z + WINDOW_MAX_Z) / 2
const WINDOW_WIDTH = WINDOW_MAX_Z - WINDOW_MIN_Z
const WINDOW_HEIGHT = WINDOW_TOP_Y - WINDOW_SILL_Y
const WINDOW_CENTER_Y = (WINDOW_SILL_Y + WINDOW_TOP_Y) / 2

export function ClinicFront({ venue, neonLevel = 1 }: ClinicFrontProps) {
  const { at, facingStreet } = storefrontFrame(venue.doorPosition[0])

  return (
    <Storefront
      venue={venue}
      neonLevel={neonLevel}
      signTexture={getLightboxTexture(venue.name, CROSS_RED)}
      interiorLight={INTERIOR_LIGHT}
      // Cheap render and off-white breeze block, against the shop's plum.
      frontageColor="#3b4048"
      fasciaColor="#6c7480"
      // No awning. A scalloped canopy is a shopfront saying "come in"; this
      // frontage has nothing to say.
    >
      {/*
        The lit room behind the glass. Flat and bright rather than the shop's
        muted warm panel — a fluorescent ceiling has no falloff, which is
        precisely what makes it feel unwelcoming.
      */}
      <mesh
        position={at(INTERIOR_OUT + 0.02, WINDOW_CENTER_Y, WINDOW_CENTER_Z)}
        rotation={facingStreet}
      >
        <planeGeometry args={[WINDOW_WIDTH, WINDOW_HEIGHT]} />
        <meshStandardMaterial
          color="#c6d8e4"
          emissive={INTERIOR_LIGHT}
          emissiveIntensity={0.07}
          roughness={0.95}
        />
      </mesh>

      {/*
        Venetian blinds, half closed. Horizontal slats across the window, which
        is the single detail that stops this reading as another shop window:
        you can tell there is light inside and not what it is lighting.
      */}
      {Array.from({ length: SLAT_COUNT }, (_, index) => {
        const y = WINDOW_SILL_Y + ((index + 0.5) / SLAT_COUNT) * WINDOW_HEIGHT

        return (
          <mesh
            key={index}
            position={at(INTERIOR_OUT + 0.14, y, WINDOW_CENTER_Z)}
            rotation={[0.42, facingStreet[1], 0]}
          >
            <boxGeometry args={[0.02, WINDOW_HEIGHT / SLAT_COUNT - 0.012, WINDOW_WIDTH - 0.1]} />
            <meshStandardMaterial color="#aebccb" roughness={0.85} />
          </mesh>
        )
      })}

      {/* A cross decal on the glass, as clinics put on their windows. */}
      <group position={at(FRONT_OUT + 0.03, WINDOW_CENTER_Y, WINDOW_MAX_Z - 0.55)}>
        <mesh rotation={facingStreet}>
          <planeGeometry args={[0.12, 0.4]} />
          <meshBasicMaterial color={CROSS_RED} toneMapped={false} />
        </mesh>
        <mesh rotation={facingStreet}>
          <planeGeometry args={[0.4, 0.12]} />
          <meshBasicMaterial color={CROSS_RED} toneMapped={false} />
        </mesh>
      </group>

      {/*
        A bench and a queue rail on the pavement outside — the two things in the
        reference that say people wait here, and the only warmth-free street
        furniture on the strip.
      */}
      <mesh position={at(FRONT_OUT + 0.55, 0.42, WINDOW_CENTER_Z + 0.4)} castShadow>
        <boxGeometry args={[0.4, 0.08, 1.6]} />
        <meshStandardMaterial color="#8d949c" roughness={0.7} metalness={0.3} />
      </mesh>
      {[-0.6, 0.6].map((offset) => (
        <mesh
          key={offset}
          position={at(FRONT_OUT + 0.55, 0.2, WINDOW_CENTER_Z + 0.4 + offset)}
          castShadow
        >
          <boxGeometry args={[0.06, 0.4, 0.06]} />
          <meshStandardMaterial color="#5e666e" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {[-0.5, 0.5].map((offset) => (
        <group key={offset} position={at(FRONT_OUT + 0.75, 0, -0.55 + offset)}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.05, 1, 8]} />
            <meshStandardMaterial color="#9aa2ab" roughness={0.45} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {/*
        Fluorescent glare from directly behind the blinds. Colder and harder
        than the shop's, and placed to blow through the slats rather than to
        light anything in particular — but only just. The strip's night bloom
        threshold is low, and at full strength this came back as one white blob
        with the slats lost inside it.
      */}
      <pointLight
        position={at(INTERIOR_OUT + 0.3, WINDOW_TOP_Y - 0.2, WINDOW_CENTER_Z)}
        color={INTERIOR_LIGHT}
        intensity={3.4}
        distance={4.5}
        decay={2}
      />
    </Storefront>
  )
}
