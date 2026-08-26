import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { DoubleSide, type Texture } from 'three'
import { useTimeStore } from '../../store/useTimeStore'
import {
  AISLE_CENTER_X,
  CASCADE_WALL_WIDTH,
  POOL_LEVEL,
  POOL_RIM_HEIGHT,
  ROOM,
  WALL_HEIGHT,
  WATER_COURT,
  WATERFALL_TOP,
  WATERFALL_WIDTH,
} from '../casinoFloorLayout'
import {
  getBalustradeTexture,
  getMarbleTexture,
  getMistTexture,
  getStoneTexture,
  getWaterSheetTexture,
} from '../casinoTexture'

/*
 * The waterfall at the end of the Golden Ace, and the basin it lands in.
 *
 * This is the thing the room is looked at down the length of, so its size is
 * not a taste decision — `waterfallSubtendedAngle` in the layout module holds it
 * against the camera that has to see it. Everything here reads its geometry
 * from `WATER_COURT`, which is also what the player is kept out of; a pool you
 * can stand in the middle of is a painted rectangle.
 */

const COURT_WIDTH = WATER_COURT.maxX - WATER_COURT.minX
const COURT_DEPTH = WATER_COURT.maxZ - WATER_COURT.minZ
const COURT_CENTER_X = (WATER_COURT.minX + WATER_COURT.maxX) / 2
const COURT_CENTER_Z = (WATER_COURT.minZ + WATER_COURT.maxZ) / 2

/** How thick the marble kerb around the basin is. */
const COPING_WIDTH = 0.44

const FALL_HEIGHT = WATERFALL_TOP - POOL_LEVEL

/** The rail's height above the coping, and how tall the pierced screen is. */
const RAIL_HEIGHT = 0.78

const RAIL_LEFT_X = WATER_COURT.minX + COPING_WIDTH / 2
const RAIL_RIGHT_X = WATER_COURT.maxX - COPING_WIDTH / 2
const RAIL_FRONT_Z = WATER_COURT.maxZ - COPING_WIDTH / 2

/** How many four-bay panels a run of screen gets, at roughly 1.6m a panel. */
function panelsFor(run: number): number {
  return Math.max(1, Math.round(run / 1.6))
}

/**
 * How long the sheet takes to travel its own length, in seconds.
 *
 * Two sheets at different rates and different scales, one just in front of the
 * other: a single scrolling texture reads as wallpaper being pulled downward,
 * and the second layer is what turns it into water. The near one is faster
 * because it is nearer.
 */
const FAR_PERIOD = 1.35
const NEAR_PERIOD = 0.85

/** A scrolling sheet of falling water. */
function Cascade({
  texture,
  period,
  z,
  opacity,
}: {
  texture: Texture
  period: number
  z: number
  opacity: number
}) {
  useFrame((_state, delta) => {
    /*
     * `?freeze` holds the water as well as the clock and the turntables. An
     * unpinned cascade lands on a different offset every capture, so the shot
     * of this room would disagree with itself run to run for no reason anybody
     * could see.
     */
    if (useTimeStore.getState().paused) {
      texture.offset.y = 0
      return
    }

    /*
     * Downward on screen means *increasing* v, not decreasing it.
     *
     * The shader samples at `uv.y * repeat + offset`, so a feature at texture
     * coordinate F lands where `uv.y = (F - offset) / repeat`. Raise the offset
     * and every feature moves to a lower uv, which on a plane is further down.
     * Signed the other way — which is what shipped first — the whole cascade
     * runs up the wall, and it is the one thing about this room a still capture
     * cannot show. Wrapped to 0..1 so it does not grow without bound.
     */
    texture.offset.y = (texture.offset.y + delta / period) % 1
  })

  return (
    <mesh position={[AISLE_CENTER_X, POOL_LEVEL + FALL_HEIGHT / 2, z]}>
      <planeGeometry args={[WATERFALL_WIDTH, FALL_HEIGHT]} />
      {/*
        Basic and unlit, additive-ish through transparency: the sheet is the
        brightest thing in the room and nothing about it should respond to the
        pendants over the tables twelve metres away.
      */}
      <meshBasicMaterial
        map={texture}
        // Tinted, because an unlit sheet cannot take the colour from the teal
        // lights in the basin the way every other surface in the court does.
        color="#a9dcf0"
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * The spray where the cascade lands.
 *
 * Three overlapping puffs on billboards facing down the room, at low opacity.
 *
 * This is the trick that burned the shop's exit door, used deliberately and on
 * the one shape it survives as. What gave that door away was its *edge* — a
 * pale rectangle lying on a dark polished floor reads as a plank because you
 * can see exactly where it stops. A radial gradient that reaches zero alpha has
 * no edge to see. It also sits against black stone and a lit cascade rather
 * than on a floor, so there is nothing behind it for a seam to show against.
 */
function Mist() {
  const puff = useMemo(() => getMistTexture(), [])

  /*
   * Two puffs, not three, and smaller.
   *
   * Standing at the coping these fill the screen, and a full screen of blended
   * overdraw on top of two cascade sheets is what took the pool's own capture
   * from a frame to a thirty-second timeout. Spray reads from its softness, not
   * its size.
   */
  const puffs = [
    { x: AISLE_CENTER_X - 1.5, y: POOL_LEVEL + 0.45, size: 2.4, opacity: 0.3 },
    { x: AISLE_CENTER_X + 1.5, y: POOL_LEVEL + 0.55, size: 2.6, opacity: 0.34 },
  ]

  return (
    <group>
      {puffs.map((cloud) => (
        <mesh key={cloud.x} position={[cloud.x, cloud.y, ROOM.minZ + 0.9]}>
          <planeGeometry args={[cloud.size, cloud.size * 0.6]} />
          <meshBasicMaterial
            map={puff}
            transparent
            opacity={cloud.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export function WaterCourt() {
  const stone = useMemo(() => getStoneTexture(CASCADE_WALL_WIDTH / 2.6, WALL_HEIGHT / 2.6), [])
  const coping = useMemo(() => getMarbleTexture(COURT_WIDTH / 2, 1), [])

  /*
   * Two instances of the same drawing, at different repeats. The getter hands
   * back one shared texture, so a second call would retune the first sheet's
   * repeat and scroll — hence one clone, which shares the image and keeps its
   * own offset.
   */
  const farSheet = useMemo(() => getWaterSheetTexture(2.5, 1.6), [])
  const nearSheet = useMemo(() => {
    const clone = getWaterSheetTexture(2.5, 1.6).clone()
    clone.needsUpdate = true
    clone.repeat.set(1.7, 1.15)
    return clone
  }, [])

  return (
    <group>
      {/*
        The polished blockwork the water runs down.

        Unlit, on purpose. It is meant to be the darkest surface in the room and
        nothing about it needs to respond to a lamp — and a lit wall two metres
        from a point light grows a small very bright spot that the bloom pass
        turns into a glowing sphere floating in the middle of the cascade. The
        lights moved back once already for this; taking the wall out of their
        reach entirely is what actually settles it.
      */}
      <mesh position={[COURT_CENTER_X, WALL_HEIGHT / 2, ROOM.minZ + 0.04]}>
        <planeGeometry args={[CASCADE_WALL_WIDTH, WALL_HEIGHT]} />
        <meshBasicMaterial map={stone} />
      </mesh>

      {/* The lip, and the hard bright line of water leaving it. */}
      <mesh position={[AISLE_CENTER_X, WATERFALL_TOP + 0.12, ROOM.minZ + 0.28]}>
        <boxGeometry args={[WATERFALL_WIDTH + 0.5, 0.24, 0.5]} />
        <meshStandardMaterial color="#9a7c3a" roughness={0.3} metalness={0.85} />
      </mesh>
      <mesh position={[AISLE_CENTER_X, WATERFALL_TOP, ROOM.minZ + 0.5]}>
        <boxGeometry args={[WATERFALL_WIDTH, 0.07, 0.06]} />
        <meshBasicMaterial color="#dff6ff" toneMapped={false} />
      </mesh>

      <Cascade texture={farSheet} period={FAR_PERIOD} z={ROOM.minZ + 0.16} opacity={0.85} />
      <Cascade texture={nearSheet} period={NEAR_PERIOD} z={ROOM.minZ + 0.34} opacity={0.6} />

      {/*
        Foam at the waterline, kept to a hand's width.

        This is the one place in the room a flat quad stands in for light, and
        the shop's door already showed what that costs. The first version was
        twice this deep and pure white with a 95-intensity point light on top of
        it, and between them they burned a hole in the middle of the room: the
        basin, the coping and three metres of carpet in front of it all clipped
        to white. It survives at this size because the cascade directly above it
        is brighter still, so the eye reads it as where the water lands rather
        than as a lamp lying in the pool.
      */}
      <mesh position={[AISLE_CENTER_X, POOL_LEVEL + 0.03, ROOM.minZ + 0.42]}>
        <boxGeometry args={[WATERFALL_WIDTH, 0.06, 0.2]} />
        <meshBasicMaterial color="#9fd4e8" toneMapped={false} />
      </mesh>

      {/* The basin. Dark and nearly polished, so it carries the cascade. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[COURT_CENTER_X, POOL_LEVEL, COURT_CENTER_Z]}>
        <planeGeometry args={[COURT_WIDTH - COPING_WIDTH * 2, COURT_DEPTH - COPING_WIDTH]} />
        {/*
          Dark, and only half-polished.

          At 0.07 roughness the basin was a mirror pointed at the splash light,
          and the whole pool came back as one flat pale slab with no surface to
          it. At 0.26 it was still tight enough to return that light as a hard
          specular disc — a second small sun sitting on the water, which the
          bloom pass then doubled. Water this dark carries a cascade by
          reflecting a *lot* of it dimly, not a little of it brightly — and at
          0.45 the disc was still there from the blackjack seat, because the
          seat looks across the basin at a grazing angle and a grazing angle is
          where a specular lobe is widest. Matte, and let the two teal lights
          and the cascade above do the work.
        */}
        <meshStandardMaterial
          color="#06272f"
          roughness={0.78}
          metalness={0.05}
          side={DoubleSide}
        />
      </mesh>

      {/* Its floor, below the water, so the basin has a bottom to it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[COURT_CENTER_X, 0.01, COURT_CENTER_Z]}>
        <planeGeometry args={[COURT_WIDTH, COURT_DEPTH]} />
        <meshStandardMaterial color="#04161d" roughness={0.6} />
      </mesh>

      {/* Marble coping on three sides — the fourth is the cascade wall. */}
      {[
        {
          key: 'front',
          position: [COURT_CENTER_X, POOL_RIM_HEIGHT / 2, WATER_COURT.maxZ - COPING_WIDTH / 2],
          size: [COURT_WIDTH, POOL_RIM_HEIGHT, COPING_WIDTH],
        },
        {
          key: 'left',
          position: [WATER_COURT.minX + COPING_WIDTH / 2, POOL_RIM_HEIGHT / 2, COURT_CENTER_Z],
          size: [COPING_WIDTH, POOL_RIM_HEIGHT, COURT_DEPTH],
        },
        {
          key: 'right',
          position: [WATER_COURT.maxX - COPING_WIDTH / 2, POOL_RIM_HEIGHT / 2, COURT_CENTER_Z],
          size: [COPING_WIDTH, POOL_RIM_HEIGHT, COURT_DEPTH],
        },
      ].map((side) => (
        <mesh
          key={side.key}
          position={side.position as unknown as [number, number, number]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={side.size as unknown as [number, number, number]} />
          {/* Matte, on the same rule as the basin — see the material there. */}
          <meshStandardMaterial map={coping} roughness={0.74} />
        </mesh>
      ))}

      {/*
        The balustrade: a pierced gold screen on the coping, three sides.

        A cut-out on a plane, not a rail on posts. The reference's is a fine
        lyre-pattern screen, and eleven cylinders were both more meshes and less
        like it — what carries at four metres is the rhythm of the *holes*, and
        holes are the one thing a texture does better than geometry. Double
        sided, because you see the far run through the near one.
      */}
      {[
        {
          key: 'left',
          position: [RAIL_LEFT_X, POOL_RIM_HEIGHT + RAIL_HEIGHT / 2, COURT_CENTER_Z] as const,
          rotation: [0, Math.PI / 2, 0] as const,
          run: COURT_DEPTH,
        },
        {
          key: 'right',
          position: [RAIL_RIGHT_X, POOL_RIM_HEIGHT + RAIL_HEIGHT / 2, COURT_CENTER_Z] as const,
          rotation: [0, Math.PI / 2, 0] as const,
          run: COURT_DEPTH,
        },
        {
          key: 'front',
          position: [COURT_CENTER_X, POOL_RIM_HEIGHT + RAIL_HEIGHT / 2, RAIL_FRONT_Z] as const,
          rotation: [0, 0, 0] as const,
          run: COURT_WIDTH,
        },
      ].map((side) => (
        <mesh key={side.key} position={side.position} rotation={side.rotation}>
          <planeGeometry args={[side.run, RAIL_HEIGHT]} />
          {/*
            `alphaTest` without `transparent`, deliberately.

            A cut-out screen wants a hard edge, so the fragments it discards
            need no blending — and blending them is not free. Marked
            transparent, these planes join the sorted pass and cost a full
            screen of per-pixel blend wherever they overlap the cascade, which
            on a machine rasterising in software is the difference between a
            frame and a thirty-second timeout. Discard is what a pierced metal
            screen actually does anyway.
          */}
          <meshStandardMaterial
            map={getBalustradeTexture(panelsFor(side.run))}
            alphaTest={0.4}
            roughness={0.3}
            metalness={0.85}
            side={DoubleSide}
          />
        </mesh>
      ))}

      {/*
        A cove light along the inside of the coping, all three sides.

        The reference's pool is lit from its own edge and that line of light is
        most of what makes the water read as water rather than as a dark hole in
        the floor. Another flat quad standing in for light, and allowed on the
        same terms as the foam bar: a centimetre tall, tucked under the coping's
        lip where its own edge cannot be seen, and standing in for the basin
        uplight that is genuinely there.
      */}
      {[
        {
          key: 'left',
          position: [RAIL_LEFT_X + COPING_WIDTH / 2, POOL_RIM_HEIGHT - 0.05, COURT_CENTER_Z] as const,
          size: [0.05, 0.05, COURT_DEPTH - COPING_WIDTH] as const,
        },
        {
          key: 'right',
          position: [RAIL_RIGHT_X - COPING_WIDTH / 2, POOL_RIM_HEIGHT - 0.05, COURT_CENTER_Z] as const,
          size: [0.05, 0.05, COURT_DEPTH - COPING_WIDTH] as const,
        },
        {
          key: 'front',
          position: [COURT_CENTER_X, POOL_RIM_HEIGHT - 0.05, RAIL_FRONT_Z - COPING_WIDTH / 2] as const,
          size: [COURT_WIDTH - COPING_WIDTH, 0.05, 0.05] as const,
        },
      ].map((cove) => (
        <mesh key={cove.key} position={cove.position}>
          <boxGeometry args={cove.size} />
          <meshBasicMaterial color="#6fd8f0" toneMapped={false} />
        </mesh>
      ))}

      <Mist />

      {/*
        The light the water is actually made of.

        Held well off every surface, which is the whole trick. The first version
        put three point lights within a metre of the cascade wall and each one
        burned a small very bright spot into the blockwork that the bloom pass
        then blew into a glowing sphere — three cyan orbs hanging in a vertical
        line down the middle of the waterfall, which is not a lighting artefact
        anybody would go looking for in a lighting file. A point light close to
        a lit surface is a visible object.
      */}
      <pointLight
        position={[AISLE_CENTER_X, 1.4, ROOM.minZ + 2.4]}
        color="#7fe6ff"
        intensity={44}
        distance={15}
      />
      <pointLight
        position={[AISLE_CENTER_X, 3.1, WATER_COURT.maxZ + 1.2]}
        color="#5fbcd8"
        intensity={34}
        distance={14}
      />
    </group>
  )
}
