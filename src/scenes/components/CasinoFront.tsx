import { DoubleSide } from 'three'
import type { VenueConfig } from '../../world/venues'
import { dimHex } from '../../world/timeOfDay'
import {
  ACE_CENTER_Y,
  ACE_HEIGHT,
  ACE_OUT,
  ACE_WIDTH,
  BAY_HALF_Z,
  BAY_HEIGHT,
  BAY_OUT,
  CANOPY_HALF_Z,
  CANOPY_OUT,
  CANOPY_TOP_Y,
  CANOPY_THICKNESS,
  CANOPY_UNDER_Y,
  CARPET_FROM_OUT,
  CARPET_HALF_Z,
  CARPET_TO_OUT,
  COLUMN_OUT,
  COLUMN_RADIUS,
  COLUMN_Z,
  DOWNLIGHT_OUT,
  DOWNLIGHT_RADIUS,
  DOWNLIGHT_SPACING_Z,
  DRUM_HEIGHT,
  DRUM_OUT,
  DRUM_RADIUS,
  GLASS_OUT,
  LEAF_HALF_Z,
  LEAF_HEIGHT,
  LEAF_Z,
  PALM_OUT,
  PALM_RADIUS,
  PALM_Z,
  PINSTRIPE_TOP_Y,
  PINSTRIPE_WIDTH,
  PINSTRIPE_Z,
  ROPE_Y,
  STANCHION_HEIGHT,
  STANCHION_OUT,
  STANCHION_Z,
  TIE_ROD_RADIUS,
  TIE_ROD_TOP_Y,
} from '../casinoFrontLayout'
import { getAceTexture } from '../signTexture'
import { SIDEWALK_HEIGHT } from '../stripLayout'
import { storefrontFrame } from '../storefrontLayout'

/*
 * The Golden Ace's entrance on the strip.
 *
 * Built to `art/refs/casino_exterior.png`, and it replaces two emissive
 * rectangles: a 3 x 3.2 slab standing in for a door and a 4.4 x 0.55 band
 * standing in for a canopy. The grandest building on the street had the least
 * on it, and everything a player used to find it — the marquee, the blade sign
 * — belongs to the tower rather than to the entrance.
 *
 * Every measurement comes from `casinoFrontLayout.ts`, which also holds the two
 * things that can silently go wrong here: the canopy fits under a marquee laid
 * out in another file, and nothing may hang over the road.
 *
 * Still decorative. Entering is a proximity check in `Player`, so none of this
 * needs collision or a handler.
 */

interface CasinoFrontProps {
  casino: VenueConfig
  /** How brightly the entrance burns, 0 to 1. Washes out in daylight. */
  neonLevel?: number
}

/**
 * Floor on the spill light, as a fraction of its night intensity.
 *
 * The doorway is the thing the player is looking for, so it keeps reading as a
 * light source even at noon — dimming it all the way out would leave the only
 * interactive object on the street indistinguishable from the facade.
 */
const SPILL_DAYLIGHT_FLOOR = 0.22

const GOLD = '#c9a34c'
const DARK_GOLD = '#8a6a2f'
const BRASS = '#d8b45c'

/** A fluted gold column, as the interior's colonnade builds them. */
function CanopyColumn({
  at,
  z,
}: {
  at: (out: number, y: number, z: number) => [number, number, number]
  z: number
}) {
  /*
   * Engaged: half a column, against the wall.
   *
   * It reads as a column from the street and never stands on the pavement,
   * which is the whole reason it moved — see `COLUMN_OUT` in the layout.
   */
  const shaft = CANOPY_UNDER_Y - 0.62

  return (
    <group position={at(COLUMN_OUT, 0, z)}>
      <mesh position={[0, 0.16, 0]}>
        <boxGeometry args={[COLUMN_RADIUS * 1.9, 0.32, COLUMN_RADIUS * 2.7]} />
        <meshStandardMaterial color="#2a2130" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 1.2, COLUMN_RADIUS * 1.34, 0.2, 14]} />
        <meshStandardMaterial color={DARK_GOLD} roughness={0.35} metalness={0.85} />
      </mesh>
      {/*
        Sixteen facets with flat shading rather than modelled flutes — the
        silhouette stays round and the faces catch the entrance light as a ring
        of separate highlights, which is what fluting reads as from the street.
      */}
      <mesh position={[0, 0.52 + shaft / 2, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 0.88, COLUMN_RADIUS, shaft, 16, 1]} />
        <meshStandardMaterial color={GOLD} roughness={0.32} metalness={0.9} flatShading />
      </mesh>
      <mesh position={[0, CANOPY_UNDER_Y - 0.06, 0]}>
        <cylinderGeometry args={[COLUMN_RADIUS * 1.3, COLUMN_RADIUS * 0.88, 0.22, 16]} />
        <meshStandardMaterial color={BRASS} roughness={0.28} metalness={0.9} flatShading />
      </mesh>
    </group>
  )
}

/** A brass post with a velvet rope slung to the next one. */
function Stanchion({
  at,
  out,
  z,
  ropeTo,
}: {
  at: (out: number, y: number, z: number) => [number, number, number]
  out: number
  z: number
  ropeTo: number | null
}) {
  return (
    <group>
      <mesh position={at(out, STANCHION_HEIGHT / 2, z)}>
        <cylinderGeometry args={[0.035, 0.045, STANCHION_HEIGHT, 8]} />
        <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.92} />
      </mesh>
      <mesh position={at(out, STANCHION_HEIGHT + 0.04, z)}>
        <sphereGeometry args={[0.06, 10, 8]} />
        <meshStandardMaterial color={BRASS} roughness={0.25} metalness={0.95} />
      </mesh>

      {/*
        The rope, as a slack-less bar between two posts.

        A real one hangs in a catenary and this does not, which at a metre long
        and seventy centimetres up nobody reads as wrong — but a rope drawn to
        the *next* post rather than a fixed length means the spacing can change
        without leaving ropes ending in mid-air.
      */}
      {ropeTo !== null && (
        <mesh position={at((out + ropeTo) / 2, ROPE_Y, z)} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.028, 0.028, Math.abs(ropeTo - out), 6]} />
          <meshStandardMaterial color="#8e1424" roughness={0.85} />
        </mesh>
      )}
    </group>
  )
}

/** A palm in a brass planter, flanking the doors under the canopy. */
function EntrancePalm({
  at,
  z,
}: {
  at: (out: number, y: number, z: number) => [number, number, number]
  z: number
}) {
  const potHeight = 0.44
  const trunk = 1.05

  return (
    <group position={at(PALM_OUT, 0, z)}>
      <mesh position={[0, potHeight / 2, 0]}>
        <cylinderGeometry args={[PALM_RADIUS * 0.8, PALM_RADIUS * 0.6, potHeight, 12]} />
        <meshStandardMaterial color={DARK_GOLD} roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position={[0, potHeight + trunk / 2, 0]}>
        <cylinderGeometry args={[0.05, 0.08, trunk, 8]} />
        <meshStandardMaterial color="#4a3a22" roughness={0.9} />
      </mesh>
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2
        const length = index % 3 === 0 ? 1.05 : 0.85

        return (
          <group key={angle} position={[0, potHeight + trunk, 0]} rotation={[0, angle, 0.95]}>
            <mesh position={[0, length / 2, 0]} scale={[1, 1, 0.12]}>
              <coneGeometry args={[0.19, length, 5]} />
              <meshStandardMaterial
                color={index % 2 === 0 ? '#1c4a28' : '#2d6a3a'}
                roughness={0.85}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

export function CasinoFront({ casino, neonLevel = 1 }: CasinoFrontProps) {
  const [x, y, z] = casino.doorPosition
  const { at, facing, facingStreet } = storefrontFrame(x)

  const accent = dimHex(casino.available ? casino.neonColor : '#4a5070', neonLevel)
  const warm = dimHex(casino.available ? '#ffd79a' : '#4a5070', neonLevel)
  /* The lobby's own tone: warm, and dim enough that the doorway keeps its detail. */
  const lobby = dimHex(casino.available ? '#8a6633' : '#2b3048', neonLevel)

  const nightIntensity = casino.available ? 22 : 6
  const spill = nightIntensity * (SPILL_DAYLIGHT_FLOOR + (1 - SPILL_DAYLIGHT_FLOOR) * neonLevel)

  const downlightZ = Array.from(
    { length: Math.floor((CANOPY_HALF_Z * 2) / DOWNLIGHT_SPACING_Z) },
    (_, index) => -CANOPY_HALF_Z + (index + 0.5) * DOWNLIGHT_SPACING_Z,
  )

  return (
    <group position={[x, y + SIDEWALK_HEIGHT, z]}>
      {/* The recess the doors sit in, nearly black so the glass reads as lit. */}
      <mesh position={at(BAY_OUT, BAY_HEIGHT / 2, 0)} rotation={facingStreet}>
        <planeGeometry args={[BAY_HALF_Z * 2, BAY_HEIGHT]} />
        <meshStandardMaterial color="#0d0a16" roughness={0.9} />
      </mesh>

      {/*
        The lit lobby behind the glass.

        Tone-mapped, and a good deal darker than the light it stands for. The
        first version was `#ffd79a` unlit with `toneMapped={false}` — four square
        metres of the brightest colour the renderer has, which the bloom pass
        turned into a single white sun hanging in the doorway. Everything the
        entrance is made of, the drum and the mullions included, was lost inside
        it. A lobby is a bright *room*, not a light source.
      */}
      <mesh position={at(GLASS_OUT, BAY_HEIGHT / 2 - 0.15, 0)} rotation={facingStreet}>
        <planeGeometry args={[BAY_HALF_Z * 2 - 0.5, BAY_HEIGHT - 0.65]} />
        <meshBasicMaterial color={lobby} />
      </mesh>

      {/* Mullions across it, which is what turns a lit slab into glazing. */}
      {[-2.6, -1.3, 0, 1.3, 2.6].map((mullionZ) => (
        <mesh key={mullionZ} position={at(GLASS_OUT + 0.03, BAY_HEIGHT / 2 - 0.15, mullionZ)}>
          <boxGeometry args={[0.05, BAY_HEIGHT - 0.65, 0.07]} />
          <meshStandardMaterial color={DARK_GOLD} roughness={0.4} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={at(GLASS_OUT + 0.03, BAY_HEIGHT - 0.62, 0)}>
        <boxGeometry args={[0.05, 0.09, BAY_HALF_Z * 2 - 0.5]} />
        <meshStandardMaterial color={DARK_GOLD} roughness={0.4} metalness={0.8} />
      </mesh>

      {/* The revolving door: a brass drum with its quadrants inside. */}
      <group position={at(DRUM_OUT, 0, 0)}>
        <mesh position={[0, DRUM_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[DRUM_RADIUS, DRUM_RADIUS, DRUM_HEIGHT, 20, 1, true]} />
          {/*
            Roughened, and much less of a mirror than brass wants to be.

            At 0.22 roughness and 0.95 metalness this drum was a curved mirror a
            metre from the entrance lamp, and it returned it as one enormous
            specular highlight that the bloom pass blew into a sun sitting in
            the doorway — the third time this project has grown a light out of a
            surface put too close to one. A revolving door reads from its
            uprights and its collar, not from its shine.
          */}
          <meshStandardMaterial
            color={BRASS}
            roughness={0.5}
            metalness={0.55}
            side={DoubleSide}
            transparent
            opacity={0.42}
          />
        </mesh>
        {/* Two wings, crossed, seen through the drum. */}
        {[0, Math.PI / 2].map((angle) => (
          <mesh key={angle} position={[0, DRUM_HEIGHT / 2, 0]} rotation={[0, angle, 0]}>
            <boxGeometry args={[DRUM_RADIUS * 1.9, DRUM_HEIGHT - 0.12, 0.05]} />
            <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, DRUM_HEIGHT + 0.06, 0]}>
          <cylinderGeometry args={[DRUM_RADIUS + 0.07, DRUM_RADIUS + 0.07, 0.12, 20]} />
          <meshStandardMaterial color={BRASS} roughness={0.25} metalness={0.95} />
        </mesh>
      </group>

      {/* A hinged leaf either side of the drum. */}
      {LEAF_Z.map((leafZ) => (
        <mesh key={leafZ} position={at(GLASS_OUT + 0.12, LEAF_HEIGHT / 2, leafZ)}>
          <boxGeometry args={[0.07, LEAF_HEIGHT, LEAF_HALF_Z * 2]} />
          <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.9} />
        </mesh>
      ))}

      {/* ------------------------------------------------ the porte-cochere */}

      <mesh position={at(CANOPY_OUT / 2 - 0.15, CANOPY_UNDER_Y + CANOPY_THICKNESS / 2, 0)}>
        <boxGeometry args={[CANOPY_OUT + 0.3, CANOPY_THICKNESS, CANOPY_HALF_Z * 2]} />
        <meshStandardMaterial color={GOLD} roughness={0.34} metalness={0.6} emissive="#3a2c10" />
      </mesh>
      {/* Its dark soffit, so the downlights have something to sit in. */}
      <mesh
        position={at(CANOPY_OUT / 2 - 0.15, CANOPY_UNDER_Y - 0.01, 0)}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[CANOPY_OUT + 0.3, CANOPY_HALF_Z * 2]} />
        {/*
          Lighter than it looks like it should be. Nothing shines *up* at a
          canopy soffit, so a genuinely dark underside renders as a black slab
          with the gold roof invisible behind it — from the pavement the whole
          porte-cochere read as a hole in the facade.
        */}
        <meshStandardMaterial color="#4a3a22" roughness={0.85} side={DoubleSide} />
      </mesh>
      {/* A brass fascia along its front edge, catching the street light. */}
      <mesh position={at(CANOPY_OUT + 0.13, CANOPY_UNDER_Y + CANOPY_THICKNESS / 2, 0)}>
        <boxGeometry args={[0.08, CANOPY_THICKNESS + 0.12, CANOPY_HALF_Z * 2 + 0.1]} />
        <meshStandardMaterial color={BRASS} roughness={0.24} metalness={0.94} />
      </mesh>
      {/* A lit reveal under the fascia, so the canopy has an edge at night. */}
      <mesh position={at(CANOPY_OUT + 0.09, CANOPY_UNDER_Y - 0.05, 0)}>
        <boxGeometry args={[0.06, 0.07, CANOPY_HALF_Z * 2]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {downlightZ.map((lightZ) =>
        DOWNLIGHT_OUT.map((out) => (
          <mesh
            key={`${lightZ}:${out}`}
            position={at(out, CANOPY_UNDER_Y - 0.02, lightZ)}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[DOWNLIGHT_RADIUS, 12]} />
            <meshBasicMaterial color="#ffe6bb" toneMapped={false} side={DoubleSide} />
          </mesh>
        )),
      )}

      {COLUMN_Z.map((columnZ) => (
        <CanopyColumn key={columnZ} at={at} z={columnZ} />
      ))}

      {/*
        Tie-rods to the canopy's outer corners, standing in for the posts the
        reference has out on the pavement. Five centimetres thick, because the
        camera looks along this street and has to see the door past them.
      */}
      {COLUMN_Z.map((rodZ) => {
        const run = Math.hypot(CANOPY_OUT - COLUMN_OUT, TIE_ROD_TOP_Y - CANOPY_TOP_Y)
        const lean = Math.atan2(CANOPY_OUT - COLUMN_OUT, TIE_ROD_TOP_Y - CANOPY_TOP_Y)

        return (
          <mesh
            key={`rod-${rodZ}`}
            position={at(
              (COLUMN_OUT + CANOPY_OUT) / 2,
              (CANOPY_TOP_Y + TIE_ROD_TOP_Y) / 2,
              rodZ,
            )}
            rotation={[0, 0, facing * lean]}
          >
            <cylinderGeometry args={[TIE_ROD_RADIUS, TIE_ROD_RADIUS, run, 6]} />
            <meshStandardMaterial color={BRASS} roughness={0.3} metalness={0.9} />
          </mesh>
        )
      })}

      {/* ---------------------------------------------------- the red carpet */}

      <mesh
        position={at((CARPET_FROM_OUT + CARPET_TO_OUT) / 2, 0.012, 0)}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[CARPET_TO_OUT - CARPET_FROM_OUT, CARPET_HALF_Z * 2]} />
        <meshStandardMaterial color="#7d1420" roughness={0.95} />
      </mesh>
      {/* Gold edging, which is what stops it reading as a stain on the paving. */}
      {[-CARPET_HALF_Z, CARPET_HALF_Z].map((edgeZ) => (
        <mesh
          key={edgeZ}
          position={at((CARPET_FROM_OUT + CARPET_TO_OUT) / 2, 0.02, edgeZ)}
        >
          <boxGeometry args={[CARPET_TO_OUT - CARPET_FROM_OUT, 0.02, 0.08]} />
          <meshStandardMaterial color={DARK_GOLD} roughness={0.4} metalness={0.85} />
        </mesh>
      ))}

      {STANCHION_Z.map((stanchionZ) =>
        STANCHION_OUT.map((out, index) => (
          <Stanchion
            key={`${stanchionZ}:${out}`}
            at={at}
            out={out}
            z={stanchionZ}
            ropeTo={STANCHION_OUT[index + 1] ?? null}
          />
        )),
      )}

      {PALM_Z.map((palmZ) => (
        <EntrancePalm key={palmZ} at={at} z={palmZ} />
      ))}

      {/* --------------------------------------------------------- signage */}

      {/*
        The ace, standing above the marquee and facing the street.

        Cut out rather than drawn on a panel: the silhouette is the whole point,
        and a spade on a rectangle is a playing card. `alphaTest` without
        `transparent` because the edge is hard and blending it is not free.
      */}
      <mesh name="front:ace" position={at(ACE_OUT, ACE_CENTER_Y, 0)} rotation={facingStreet}>
        <planeGeometry args={[ACE_WIDTH, ACE_HEIGHT]} />
        <meshBasicMaterial
          map={getAceTexture()}
          color={dimHex('#ffffff', neonLevel)}
          alphaTest={0.4}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>

      {/* Gold neon running up the facade either side of the bay. */}
      {PINSTRIPE_Z.map((stripeZ) => (
        <mesh
          key={stripeZ}
          position={at(BAY_OUT + 0.06, PINSTRIPE_TOP_Y / 2, stripeZ)}
          rotation={facingStreet}
        >
          <planeGeometry args={[PINSTRIPE_WIDTH, PINSTRIPE_TOP_Y]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}

      {/* ----------------------------------------------------------- light */}

      {/*
        Two sources, both held off the surfaces they light.

        The lobby throws warm light out across the pavement, and one lamp under
        the canopy stands in for every downlight in its soffit. One light per
        fitting is fourteen more lights on a street that already has a lamp
        every few metres — and a point light close to the surface it is set into
        is a visible object, which this project has paid for twice already.

        Both are held well out from the doors for that second reason. The spill
        lamp started a metre in front of the revolving drum and turned it into a
        mirror pointed at the street.
      */}
      <pointLight position={at(2.3, 2.75, 0)} color={warm} intensity={spill * 0.8} distance={13} />
      <pointLight
        position={at(CANOPY_OUT * 0.85, CANOPY_UNDER_Y - 1.25, 0)}
        color={warm}
        intensity={spill * 0.55}
        distance={9}
      />
    </group>
  )
}
