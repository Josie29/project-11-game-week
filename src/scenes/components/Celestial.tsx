import { useTimeStore } from '../../store/useTimeStore'
import {
  CELESTIAL_RADIUS,
  daylightAt,
  keyDirection,
  quantize,
  SKY_BUCKET_MINUTES,
  skyBucket,
} from '../../world/timeOfDay'

/**
 * The sun and the moon, on the same arc the key light swings along.
 *
 * `keyDirection` is where both of these live, and neither of them is allowed a
 * copy of it. A sun painted into one corner of the sky while the shadows fall
 * out of another is the kind of mistake that reads as "something is off" without
 * anyone being able to say what — the same failure the chair camera and the
 * blood line already have rules about.
 *
 * Drawn as spheres rather than billboards. A sphere is round from every angle
 * without any per-frame work, and at this distance it is a disc.
 */

/** Sun and moon, and the soft halo each carries. */
const SUN_RADIUS = 9
const MOON_RADIUS = 6
const HALO_SCALE = 2.6

const SUN_COLOR = '#fff4d6'
const SUN_HALO = '#ffdc9a'
const MOON_COLOR = '#e8ecff'
const MOON_HALO = '#9fb0e0'

interface DiscProps {
  /** `sky:sun` or `sky:moon`, so `npm run locate` can find them. */
  name: string
  position: readonly [number, number, number]
  radius: number
  color: string
  halo: string
  /** 0 hides it entirely; the two discs cross-fade rather than snap over. */
  opacity: number
}

function Disc({ name, position, radius, color, halo, opacity }: DiscProps) {
  if (opacity <= 0.01) return null

  return (
    <group name={name} position={[position[0], position[1], position[2]]}>
      {/*
        The body. `fog={false}` because it is beyond the fog's far plane and
        would otherwise be erased by it, and `toneMapped={false}` so it stays the
        brightest thing on screen and the bloom pass has something to catch —
        which is what makes it read as a light source rather than a pale circle.
      */}
      <mesh>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>

      {/* Halo, which is most of what sells the sun in the daytime reference. */}
      <mesh>
        <sphereGeometry args={[radius * HALO_SCALE, 24, 16]} />
        <meshBasicMaterial
          color={halo}
          transparent
          opacity={opacity * 0.16}
          fog={false}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export function Celestial() {
  /*
   * Stepped with the sky rather than run off the raw minute.
   *
   * The disc moves about a degree a minute, which is invisible, and re-rendering
   * two spheres every second to achieve it is not free. The sky gradient already
   * steps at this rate and the two are seen together.
   */
  const bucket = useTimeStore((state) => skyBucket(state.minuteOfDay))
  const minute = bucket * SKY_BUCKET_MINUTES
  const daylight = quantize(daylightAt(minute), 0.05)

  console.log('[celestial]', { minute, daylight, dir: keyDirection(minute) })
  const [dx, dy, dz] = keyDirection(minute)
  const at: readonly [number, number, number] = [
    dx * CELESTIAL_RADIUS,
    dy * CELESTIAL_RADIUS,
    dz * CELESTIAL_RADIUS,
  ]

  return (
    // Named, so `npm run locate sky:` can answer "is it not drawing, or is it
    // drawing somewhere I cannot see?" — which are the same screenshot.
    <group name="sky:celestial">
      <Disc
        name="sky:sun"
        position={at}
        radius={SUN_RADIUS}
        color={SUN_COLOR}
        halo={SUN_HALO}
        opacity={daylight}
      />
      <Disc
        name="sky:moon"
        position={at}
        radius={MOON_RADIUS}
        color={MOON_COLOR}
        halo={MOON_HALO}
        opacity={1 - daylight}
      />
    </group>
  )
}
