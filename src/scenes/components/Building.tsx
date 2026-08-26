import { useMemo } from 'react'
import { DoubleSide, RepeatWrapping } from 'three'
import { dimHex, lerpHex } from '../../world/timeOfDay'
import { getFacadeTexture } from '../facadeTexture'
import { getBladeTexture, getMarqueeTexture } from '../signTexture'

interface BuildingProps {
  position: readonly [number, number, number]
  width: number
  height: number
  depth: number
  neonColor: string
  /** Which way the lit facade faces: 1 for buildings on -X, -1 for those on +X. */
  facing: 1 | -1
  /** When set, the tower carries a named marquee and a projecting blade sign. */
  signName?: string | undefined
  /** How brightly the neon burns, 0 to 1. Washes the signage out in daylight. */
  neonLevel?: number
  /** 0 through the night, 1 at midday. Tints the stonework of the relief. */
  daylight?: number
  /**
   * Whether the tower carries cornices, a canopy and a parapet.
   *
   * On for the strip, off for the scenery behind the junctions. Relief is what
   * stops a tower reading as a painted box the moment the sun is up — a painted
   * cornice has no shadow — but it is wasted on a wall of buildings the player
   * can never get closer to than forty units.
   */
  relief?: boolean
}

/**
 * Stonework, night and day.
 *
 * The relief is lit by the scene rather than emissive, so it needs a colour that
 * survives both ends of the clock: too dark and it vanishes into the facade at
 * night, too light and it is a row of pale ledges under the neon.
 */
const TRIM_NIGHT = '#3a3568'
const TRIM_DAY = '#d8ccb4'

/** Daylight haze, laid over signage that is a black panel by night. */
const WASH = '#dfe3e2'

/** Heights, as a fraction of the tower, at which neon bands wrap the facade. */
const BAND_HEIGHTS = [0.28, 0.52, 0.78] as const

/** Fractions of the depth at which vertical neon tubes run up the facade. */
const PILASTER_OFFSETS = [-0.36, -0.12, 0.12, 0.36] as const

/**
 * A hotel tower on the strip.
 *
 * Windows and neon banding come from shared canvas textures, so a building is
 * still just a box plus a few planes — cheap enough to line the whole street
 * with while carrying the signage the strip is recognised by.
 */
export function Building({
  position,
  width,
  height,
  depth,
  neonColor,
  facing,
  signName,
  neonLevel = 1,
  daylight = 0,
  relief = true,
}: BuildingProps) {
  const [x, y, z] = position
  // Nudge lit geometry clear of the wall so it never z-fights with the facade.
  const litX = x + facing * (width / 2 + 0.06)
  const facadeRotation: [number, number, number] = [0, facing * Math.PI * 0.5, 0]

  const litNeon = dimHex(neonColor, neonLevel)
  /*
    Signage dims by tinting the material rather than by redrawing the texture.
    `getMarqueeTexture` caches per name and colour, so handing it a dimmed
    colour would mint a fresh 512px canvas for every sign on every step of the
    day. three multiplies `color` into `map` for free instead.
  */
  const signTint = dimHex('#ffffff', neonLevel)

  const trim = lerpHex(TRIM_NIGHT, TRIM_DAY, Math.min(1, Math.max(0, daylight)))

  /*
   * How far the relief projects.
   *
   * Small numbers on purpose. What the relief is for is catching the key light
   * at a different angle from the wall behind it, and a ledge twenty centimetres
   * proud does that as well as one a metre proud while leaving the silhouette
   * alone — these towers line a ten-metre street and are seen at a glancing
   * angle, where anything deeper reads as a mistake.
   */
  const PROUD = 0.22

  const facade = useMemo(() => {
    const texture = getFacadeTexture().clone()
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    // One texture tile per ~7 world units keeps window size consistent across
    // towers of different heights.
    texture.repeat.set(Math.max(1, Math.round(depth / 7)), Math.max(1, Math.round(height / 7)))
    texture.needsUpdate = true
    return texture
  }, [depth, height])

  return (
    <group>
      <mesh position={[x, y + height / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial map={facade} roughness={0.8} metalness={0.1} />
      </mesh>

      {relief && (
        <>
          {/*
            Parapet and cornice at the top, a string course a third of the way
            up, and a canopy over the pavement at the bottom. Four boxes, and
            between them they are the difference between a building and a
            painted rectangle under a noon sun.
          */}
          <mesh position={[x, y + height + 0.35, z]} castShadow receiveShadow>
            <boxGeometry args={[width + PROUD, 0.7, depth + PROUD]} />
            <meshStandardMaterial color={trim} roughness={0.85} />
          </mesh>
          <mesh position={[x, y + height - 0.55, z]} castShadow receiveShadow>
            <boxGeometry args={[width + PROUD * 2, 0.5, depth + PROUD * 2]} />
            <meshStandardMaterial color={trim} roughness={0.85} />
          </mesh>
          <mesh position={[x, y + height * 0.34, z]} castShadow receiveShadow>
            <boxGeometry args={[width + PROUD, 0.32, depth + PROUD]} />
            <meshStandardMaterial color={trim} roughness={0.85} />
          </mesh>

          {/*
            The colonnade at street level, from the daytime reference: a deep
            canopy with the wall set back in shadow behind it. It is the one
            piece of relief the player walks right past, so it is the one that
            has to be more than a ledge.
          */}
          <mesh
            position={[x + facing * (width / 2 + 0.5), y + 3.6, z]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[1.2, 0.45, depth]} />
            <meshStandardMaterial color={trim} roughness={0.85} />
          </mesh>
          {[-0.34, 0, 0.34].map((offset) => (
            <mesh
              key={offset}
              position={[x + facing * (width / 2 + 0.85), y + 1.7, z + depth * offset]}
              castShadow
            >
              <boxGeometry args={[0.42, 3.4, 0.42]} />
              <meshStandardMaterial color={trim} roughness={0.85} />
            </mesh>
          ))}
        </>
      )}

      {BAND_HEIGHTS.map((fraction) => (
        <mesh
          key={fraction}
          position={[litX, y + height * fraction, z]}
          rotation={facadeRotation}
        >
          <planeGeometry args={[depth * 0.92, 0.16]} />
          <meshBasicMaterial color={litNeon} toneMapped={false} />
        </mesh>
      ))}

      {/* Vertical pilaster tubes running the height of the tower — the strongest
          single motif in the reference, and what gives the towers their scale. */}
      {PILASTER_OFFSETS.map((offset) => (
        <mesh
          key={offset}
          position={[litX, y + height * 0.55 + 1.2, z + depth * offset]}
          rotation={facadeRotation}
        >
          <planeGeometry args={[0.13, height * 0.8]} />
          <meshBasicMaterial color={litNeon} toneMapped={false} />
        </mesh>
      ))}

      {/* Crown band so the skyline has a lit edge against the night sky. */}
      <mesh position={[litX, y + height - 0.4, z]} rotation={facadeRotation}>
        <planeGeometry args={[depth * 0.8, 0.22]} />
        <meshBasicMaterial color={litNeon} toneMapped={false} />
      </mesh>

      {signName && (
        <>
          {/*
            Daylight wash over the sign.

            A marquee is a black panel with lit letters on it, and `neonLevel`
            dims the letters by tinting the material — which is a multiply, so it
            can only ever make the panel darker. Under a noon sky the signs were
            the darkest thing on the street: three black rectangles hanging over
            a sunlit boulevard. This lifts the panel toward the haze instead, so
            by midday it reads as a pale board with washed-out neon on it, which
            is what `art/refs/strip_exterior_day.png` shows and what a marquee
            actually looks like in the sun.
          */}
          {daylight > 0.02 && (
            <mesh position={[litX + facing * 0.02, y + 4.4, z]} rotation={facadeRotation}>
              <planeGeometry args={[depth * 0.98, depth * 0.245]} />
              <meshBasicMaterial
                color={WASH}
                transparent
                opacity={daylight * 0.3}
                toneMapped={false}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* Marquee across the facade above the entrance. Sized generously and
              hung low, since it is the thing a player reads to find the door. */}
          <mesh position={[litX, y + 4.4, z]} rotation={facadeRotation}>
            <planeGeometry args={[depth * 0.98, depth * 0.245]} />
            <meshBasicMaterial
              map={getMarqueeTexture(signName, neonColor)}
              color={signTint}
              toneMapped={false}
            />
          </mesh>

          {/*
            Blade sign projecting out over the sidewalk. It faces down the
            street rather than across it, so it is readable while walking —
            which is the whole point of a blade sign.
          */}
          <mesh position={[x + facing * (width / 2 + 1.5), y + 9.5, z]}>
            <planeGeometry args={[1.9, 7.6]} />
            <meshBasicMaterial
              map={getBladeTexture(signName, neonColor)}
              color={signTint}
              toneMapped={false}
              side={DoubleSide}
            />
          </mesh>
          {/* The blade gets the same wash, and needs it more: it is the tallest
              black thing on the street and it faces down the road, so at noon it
              was a column of shadow standing against a bright sky. */}
          {daylight > 0.02 && (
            <mesh position={[x + facing * (width / 2 + 1.5), y + 9.5, z]}>
              <planeGeometry args={[1.9, 7.6]} />
              <meshBasicMaterial
                color={WASH}
                transparent
                opacity={daylight * 0.3}
                toneMapped={false}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
          )}

          {/* Bracket tying the blade back to the tower. */}
          <mesh position={[x + facing * (width / 2 + 0.75), y + 9.5, z]}>
            <boxGeometry args={[1.5, 0.16, 0.16]} />
            <meshStandardMaterial color="#241f38" roughness={0.7} />
          </mesh>
        </>
      )}
    </group>
  )
}
