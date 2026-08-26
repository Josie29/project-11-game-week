/**
 * The strip's clock, and every colour derived from it.
 *
 * The whole day — sky gradient, light rig, fog, road, neon brightness, bloom —
 * is a set of keyframes interpolated by minute. Kept pure, with zero rendering
 * imports, for the same reason the game engines are: the interesting failures
 * here are invisible in a screenshot. A palette that clamps at the last
 * keyframe instead of wrapping produces a one-frame seam at midnight, and a fog
 * whose near plane overtakes its far plane turns the world inside out. Both are
 * assertable; neither is something anyone would happen to be watching for.
 *
 * Scenes read these values. They never contain the curve.
 */

export const MINUTES_PER_DAY = 1440

/** Game minutes elapsed per real second: a full day runs in 24 real minutes. */
export const GAME_MINUTES_PER_REAL_SECOND = 1

/**
 * The hour the game opens on.
 *
 * 21:00 rather than midnight or a random hour, because the demo's first beat is
 * "spawn on the strip at night, neon lit" — opening in flat noon light throws
 * away the read the whole scene is built for.
 */
export const STARTING_MINUTE = 21 * 60

/**
 * Game minutes per sky-texture redraw.
 *
 * The sky is a canvas gradient, so it can only change in steps, and the step has
 * to stay under the size at which it reads as a pop rather than a change.
 *
 * Six, down from ten. Ten was fine for a day with four keyframes in it; adding
 * the 16:00 frame — so the afternoon stops sliding into dusk from lunchtime —
 * put more colour into less time, and the steepest legs either side of sunrise
 * and sunset then stepped far enough between buckets to be seen. The cost is a
 * redraw every six seconds instead of ten, on a 512px gradient. Fog and lights
 * vary continuously and cover the gap either way.
 */
export const SKY_BUCKET_MINUTES = 6

/** How dim the neon is allowed to get at noon. Vegas signs never switch off. */
export const NEON_DAYLIGHT_FLOOR = 0.3

/** Sunrise and sunset windows, over which daylight ramps between 0 and 1. */
const SUNRISE_START = 5 * 60
const SUNRISE_END = 8 * 60
const SUNSET_START = 17 * 60
const SUNSET_END = 20 * 60

/** The five vertical stops of the sky dome gradient, zenith to horizon haze. */
export interface SkyPalette {
  readonly zenith: string
  readonly upper: string
  readonly mid: string
  readonly horizon: string
  readonly haze: string
}

/** Everything about the outdoor scene that is not the sky itself. */
export interface Lighting {
  readonly ambientColor: string
  readonly ambientIntensity: number
  readonly keyColor: string
  readonly keyIntensity: number
  /**
   * Where the key light sits, so it tracks low at dawn and dusk.
   *
   * Kept under about 35 degrees of elevation at every hour, which is not where
   * a real midday sun is. Two reasons, and they point the same way. The play
   * camera trails the player at a shallow pitch and sees maybe forty degrees up,
   * so a body any higher than this is permanently off the top of the screen —
   * `Celestial` draws the sun and the moon along this exact direction, and a sun
   * nobody can ever see is not worth drawing. And a low sun throws long shadows
   * down the street, which is the whole reason the key was given `castShadow`.
   */
  readonly keyPosition: readonly [number, number, number]
  readonly fogColor: string
  readonly fogNear: number
  readonly fogFar: number
  /** Base colour of the reflective roadway; the shader multiplies into this. */
  readonly roadColor: string
  readonly roadRoughness: number
  /**
   * How much of the scene the roadway mirrors back.
   *
   * Near 1 the wet asphalt carries the neon, which is the look the strip is
   * built on. Left there in daylight it mirrors the sky instead and the street
   * reads as a canal running between the towers, so it drops away by noon.
   */
  readonly roadMirror: number
  readonly roadMetalness: number
  readonly roadMixStrength: number
  readonly sidewalkColor: string
}

export interface BloomSettings {
  readonly intensity: number
  readonly luminanceThreshold: number
  readonly vignetteDarkness: number
}

interface Keyframe {
  readonly minute: number
  readonly sky: SkyPalette
  readonly light: Lighting
}

/**
 * The day, in five poses.
 *
 * 00:00 is the night the strip shipped with, unchanged. 22:00 deliberately
 * differs from it — a little residual warmth still on the horizon — so the two
 * hours either side of midnight interpolate rather than sit flat, which is
 * also what makes the wrap-around segment testable.
 */
const KEYFRAMES: readonly Keyframe[] = [
  {
    minute: 0,
    sky: {
      zenith: '#070b22',
      upper: '#0f1738',
      mid: '#1c2a56',
      horizon: '#3a4a7d',
      haze: '#55608c',
    },
    light: {
      ambientColor: '#8ea0d8',
      ambientIntensity: 0.58,
      keyColor: '#93a6ff',
      keyIntensity: 0.55,
      keyPosition: [10, 9, 10],
      fogColor: '#202b50',
      fogNear: 26,
      fogFar: 125,
      roadColor: '#39406b',
      roadRoughness: 0.62,
      roadMirror: 1,
      roadMetalness: 0.45,
      roadMixStrength: 11,
      sidewalkColor: '#2c3049',
    },
  },
  {
    minute: 5 * 60 + 30,
    sky: {
      zenith: '#1b2350',
      upper: '#37356f',
      mid: '#6b4f83',
      horizon: '#d08a72',
      haze: '#f2b98c',
    },
    light: {
      ambientColor: '#b5a8c8',
      ambientIntensity: 0.76,
      keyColor: '#ffb98a',
      keyIntensity: 0.85,
      /*
       * Low, and very nearly straight down the street.
       *
       * It used to come from off to one side, which is a fine direction for a
       * light and a useless one for a sun: the strip is a canyon seventeen
       * metres wide between facades fifteen high, so anything below about sixty
       * degrees of elevation to either side is behind a building. The only two
       * lines of sight out of it are along the road, and they are narrow: eight
       * degrees off the axis and the disc is behind a tower again. It also has
       * to clear the closing block at the far junction — but only by four
       * degrees, so it can stay as low as a sunrise should be. Sunrise takes the
       * far sightline, which puts the disc at the end of the boulevard and
       * stretches every tower's shadow down it toward the player.
       */
      keyPosition: [-4, 7, -30],
      fogColor: '#7a6a86',
      fogNear: 30,
      fogFar: 138,
      roadColor: '#55566e',
      roadRoughness: 0.68,
      roadMirror: 0.92,
      roadMetalness: 0.42,
      roadMixStrength: 10,
      sidewalkColor: '#3c4059',
    },
  },
  {
    /*
      Sunrise proper.

      Exists because the sky and the buildings were arriving at different
      times: `daylightAt` finishes its ramp at 08:00, but with the next sky
      keyframe at noon the dome was barely a fifth of the way there, so 07:00
      showed daylit facades standing under a night sky. Whatever drives the
      towers has to be met by the sky at the same hour.
    */
    minute: 8 * 60,
    sky: {
      zenith: '#3f78c4',
      upper: '#5f95d8',
      mid: '#8fbce9',
      horizon: '#c8def2',
      haze: '#e6eff8',
    },
    light: {
      ambientColor: '#c6d8f0',
      ambientIntensity: 0.9,
      keyColor: '#ffeccd',
      keyIntensity: 2.1,
      // Risen, but still off to the east and not yet overhead.
      keyPosition: [-16, 12, 9],
      fogColor: '#c2d6ea',
      // Pulled in from 42. See the noon keyframe.
      fogNear: 24,
      fogFar: 150,
      roadColor: '#54575f',
      roadRoughness: 0.84,
      roadMirror: 0.2,
      roadMetalness: 0.08,
      roadMixStrength: 3,
      sidewalkColor: '#aca596',
    },
  },
  {
    minute: 12 * 60,
    sky: {
      zenith: '#2f6ecb',
      upper: '#4e8ddb',
      mid: '#7fb3e8',
      horizon: '#bcd8f2',
      haze: '#dfeaf6',
    },
    light: {
      /*
       * Ambient pulled back and the key pushed up.
       *
       * They used to be nearly equal, which is a lighting rig with no direction
       * in it: every face of every tower came out the same value and the street
       * read as a paper model under a softbox. Now that the key actually casts
       * — it never had `castShadow` at all — the contrast between a lit face and
       * a shaded one is what carries the daylight.
       */
      ambientColor: '#c3d2e8',
      // Enough fill that a shadow is a shade rather than a hole. Below about
      // this the closing block's shadow across the junction came out as a solid
      // black bar with no road under it.
      ambientIntensity: 0.95,
      keyColor: '#fff2d8',
      keyIntensity: 2.4,
      // Off to one side rather than overhead: a sun directly above throws its
      // shadows straight down, where nobody standing on the street can see them.
      keyPosition: [22, 17, 14],
      fogColor: '#cbdcee',
      /*
       * Pulled in hard from 44, which was further than the street is long.
       *
       * Haze is what gives a street depth, and at noon there was none of it on
       * anything the player could see: fog started 44 units out, the walkable
       * strip is 64 end to end, and the whole thing rendered crisp from one kerb
       * to the other like a model on a table. The daytime reference is hazy
       * enough at the far end to lose an entire block in it.
       */
      fogNear: 26,
      fogFar: 155,
      // Dry asphalt: mid-grey, and deliberately darker than the sidewalk beside
      // it. Pale enough to out-value the kerb and the roadway stops reading as a
      // road at all — it becomes a river running between the towers.
      roadColor: '#4e5158',
      roadRoughness: 0.86,
      roadMirror: 0.12,
      roadMetalness: 0.05,
      roadMixStrength: 2,
      sidewalkColor: '#b3ab9b',
    },
  },
  {
    /*
      Mid-afternoon, and the reason it exists is the mirror of why the 08:00
      frame does.

      `daylightAt` holds at 1 until 17:00 and only then begins to fall, but the
      next keyframe after noon used to be 19:00 — so from about one o'clock the
      sky, the fog and the road were already sliding into dusk while the facades
      and the neon were still flat mid-day. At 16:30 the street showed cream
      sunlit towers under a purple sky above a black wet road. Whatever drives
      the buildings and whatever drives the sky have to arrive together; this is
      the frame that holds the afternoon still until they both let go.

      At 16:00 rather than 17:00 so the run down to the 19:00 sunset has three
      hours to cover rather than two — `skyBucket` steps the gradient every ten
      minutes, and a leg this saturated crossed in two hours steps far enough
      per bucket to be seen as a jump. `timeOfDay.test.ts` holds that.
    */
    minute: 16 * 60,
    sky: {
      zenith: '#3568c0',
      upper: '#5a89d2',
      mid: '#8ab4e2',
      horizon: '#cdd9ea',
      haze: '#e6e6ea',
    },
    light: {
      ambientColor: '#c8d2e2',
      ambientIntensity: 0.92,
      keyColor: '#ffeccb',
      keyIntensity: 2.2,
      // Past the meridian and heading west, so the shadows have turned round.
      keyPosition: [-24, 15, -6],
      fogColor: '#cdd8e4',
      fogNear: 26,
      fogFar: 150,
      roadColor: '#4f5158',
      roadRoughness: 0.85,
      roadMirror: 0.16,
      roadMetalness: 0.06,
      roadMixStrength: 2.4,
      sidewalkColor: '#b0a898',
    },
  },
  {
    minute: 19 * 60,
    sky: {
      zenith: '#241a4e',
      upper: '#4a2168',
      mid: '#93316f',
      horizon: '#e2643f',
      haze: '#f7a25c',
    },
    light: {
      ambientColor: '#b98fb0',
      ambientIntensity: 0.82,
      keyColor: '#ff9a5c',
      keyIntensity: 0.9,
      // ...and sunset takes the near one, so it sits over the junction behind
      // you and the shadows run away down the street instead.
      keyPosition: [5, 7, 29],
      fogColor: '#6b3f63',
      fogNear: 28,
      fogFar: 142,
      roadColor: '#4e4470',
      roadRoughness: 0.7,
      roadMirror: 0.9,
      roadMetalness: 0.42,
      roadMixStrength: 9.5,
      sidewalkColor: '#4a4560',
    },
  },
  {
    minute: 22 * 60,
    sky: {
      zenith: '#080c24',
      upper: '#111a3c',
      mid: '#222d5c',
      horizon: '#4a4a80',
      haze: '#6b6690',
    },
    light: {
      ambientColor: '#9aa4d4',
      ambientIntensity: 0.62,
      keyColor: '#9aa8ff',
      keyIntensity: 0.6,
      keyPosition: [16, 10, 2],
      fogColor: '#262c52',
      fogNear: 27,
      fogFar: 128,
      roadColor: '#40446d',
      roadRoughness: 0.63,
      roadMirror: 1,
      roadMetalness: 0.45,
      roadMixStrength: 11,
      sidewalkColor: '#30344e',
    },
  },
]

/** The hours the day is posed at, for tests that walk the segment boundaries. */
export const KEYFRAME_MINUTES: readonly number[] = KEYFRAMES.map((frame) => frame.minute)

/** Normalises any minute — negative, or past midnight — into [0, 1440). */
export function wrapMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0
  const whole = Math.floor(minute)
  return ((whole % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

/** Zero-padded 24-hour clock, e.g. `21:07`. */
export function formatClock(minuteOfDay: number): string {
  const minute = wrapMinute(minuteOfDay)
  // Integer division for the hour, remainder for the minute within it.
  const hours = Math.floor(minute / 60)
  const minutes = minute % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Which sky-texture step this minute falls in, 0 to 143. */
export function skyBucket(minuteOfDay: number): number {
  return Math.floor(wrapMinute(minuteOfDay) / SKY_BUCKET_MINUTES)
}

/** Eased 0-to-1 ramp; zero gradient at both ends so keyframes never kink. */
function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function parseHex(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  // Shift and mask out each 8-bit channel from the packed 24-bit value.
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

function toHex(r: number, g: number, b: number): string {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/** Blends two `#rrggbb` colours channel-wise. */
export function lerpHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHex(from)
  const [r2, g2, b2] = parseHex(to)
  return toHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
}

/**
 * Scales a colour's brightness, keeping its hue.
 *
 * This is how neon dims for daylight. Applied to a material's `color`, which
 * three multiplies into any `map` — so a signage texture washes out without
 * being redrawn. Regenerating it instead would mint a new 512px canvas for
 * every sign on every step of the day, since `signTexture` caches per colour.
 */
export function dimHex(hex: string, level: number): string {
  const scale = Math.min(1, Math.max(0, level))
  const [r, g, b] = parseHex(hex)
  return toHex(r * scale, g * scale, b * scale)
}

interface Segment {
  readonly from: Keyframe
  readonly to: Keyframe
  readonly t: number
}

/**
 * Locates the keyframe pair bracketing a minute, and how far between them it is.
 *
 * The last keyframe wraps forward to the first rather than clamping, so 22:00
 * through 24:00 interpolates into the following midnight instead of freezing.
 */
function segmentAt(minuteOfDay: number): Segment {
  const minute = wrapMinute(minuteOfDay)
  const first = KEYFRAMES[0]
  if (!first) {
    throw new Error('timeOfDay has no keyframes')
  }

  let index = 0
  for (let i = 0; i < KEYFRAMES.length; i++) {
    const candidate = KEYFRAMES[i]
    if (candidate && candidate.minute <= minute) index = i
  }

  const from = KEYFRAMES[index] ?? first
  const to = KEYFRAMES[(index + 1) % KEYFRAMES.length] ?? first
  // Wrap the span so the final segment measures across midnight, not backwards.
  const span = (to.minute - from.minute + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const t = span === 0 ? 0 : smoothstep((minute - from.minute) / span)

  return { from, to, t }
}

export function skyPaletteAt(minuteOfDay: number): SkyPalette {
  const { from, to, t } = segmentAt(minuteOfDay)
  return {
    zenith: lerpHex(from.sky.zenith, to.sky.zenith, t),
    upper: lerpHex(from.sky.upper, to.sky.upper, t),
    mid: lerpHex(from.sky.mid, to.sky.mid, t),
    horizon: lerpHex(from.sky.horizon, to.sky.horizon, t),
    haze: lerpHex(from.sky.haze, to.sky.haze, t),
  }
}

export function lightingAt(minuteOfDay: number): Lighting {
  const { from, to, t } = segmentAt(minuteOfDay)
  const a = from.light
  const b = to.light
  const [ax, ay, az] = a.keyPosition
  const [bx, by, bz] = b.keyPosition

  return {
    ambientColor: lerpHex(a.ambientColor, b.ambientColor, t),
    ambientIntensity: lerp(a.ambientIntensity, b.ambientIntensity, t),
    keyColor: lerpHex(a.keyColor, b.keyColor, t),
    keyIntensity: lerp(a.keyIntensity, b.keyIntensity, t),
    keyPosition: [lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t)],
    fogColor: lerpHex(a.fogColor, b.fogColor, t),
    fogNear: lerp(a.fogNear, b.fogNear, t),
    fogFar: lerp(a.fogFar, b.fogFar, t),
    roadColor: lerpHex(a.roadColor, b.roadColor, t),
    roadRoughness: lerp(a.roadRoughness, b.roadRoughness, t),
    roadMirror: lerp(a.roadMirror, b.roadMirror, t),
    roadMetalness: lerp(a.roadMetalness, b.roadMetalness, t),
    roadMixStrength: lerp(a.roadMixStrength, b.roadMixStrength, t),
    sidewalkColor: lerpHex(a.sidewalkColor, b.sidewalkColor, t),
  }
}

/**
 * How much daylight is on the strip: 0 through the night, 1 in the middle of
 * the day, ramping across the sunrise and sunset windows.
 *
 * Neon brightness and bloom are both derived from this single curve so they can
 * never disagree about what time it is.
 */
export function daylightAt(minuteOfDay: number): number {
  const minute = wrapMinute(minuteOfDay)
  if (minute <= SUNRISE_START || minute >= SUNSET_END) return 0
  if (minute >= SUNRISE_END && minute <= SUNSET_START) return 1
  if (minute < SUNRISE_END) {
    return smoothstep((minute - SUNRISE_START) / (SUNRISE_END - SUNRISE_START))
  }
  return smoothstep((SUNSET_END - minute) / (SUNSET_END - SUNSET_START))
}

/** Neon brightness multiplier: full at night, washed out but never off by day. */
export function neonLevelAt(minuteOfDay: number): number {
  return 1 - (1 - NEON_DAYLIGHT_FLOOR) * daylightAt(minuteOfDay)
}

/**
 * How far out the sun and moon are drawn.
 *
 * Inside the sky dome's 220, so the disc is in front of the gradient rather
 * than clipped through the back of it.
 */
export const CELESTIAL_RADIUS = 180

/**
 * The direction the light comes from, as a unit vector.
 *
 * The sun and the moon are drawn along this, which is the entire reason it
 * exists as a function rather than each of them carrying its own arc: a visible
 * sun in one corner of the sky and shadows pointing out of another is the sort
 * of thing nobody consciously notices and everybody registers as wrong. It is
 * the same rule the chair camera and the draw line already follow — where two
 * things have to agree about a direction, only one of them gets to hold it.
 *
 * @param minuteOfDay Minute of the game day.
 * @returns The key light's direction, normalised. Never zero-length.
 */
export function keyDirection(minuteOfDay: number): readonly [number, number, number] {
  const [x, y, z] = lightingAt(minuteOfDay).keyPosition
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

/** Rounds to a step, so a continuous curve drives a prop only when it moves. */
export function quantize(value: number, step: number): number {
  return Math.round(value / step) * step
}

/**
 * Bloom and vignette for the hour.
 *
 * The composer is tuned so that only `toneMapped={false}` neon crosses the
 * threshold at night. Under a daylight rig ordinary lit facades exceed it too,
 * and the entire frame blooms out; raising the threshold and easing the
 * vignette is what keeps daytime looking like daytime rather than like fog.
 *
 * Quantized because these feed effect props: a continuous value would rewrite
 * them sixty times a second for no visible gain.
 */
export function bloomAt(minuteOfDay: number): BloomSettings {
  const daylight = daylightAt(minuteOfDay)
  return {
    intensity: quantize(lerp(1.0, 0.55, daylight), 0.02),
    luminanceThreshold: quantize(lerp(0.8, 0.96, daylight), 0.02),
    vignetteDarkness: quantize(lerp(0.62, 0.34, daylight), 0.02),
  }
}

/** Night-time bloom, held fixed for the windowless casino interiors. */
export const INTERIOR_BLOOM: BloomSettings = {
  intensity: 1.0,
  luminanceThreshold: 0.8,
  vignetteDarkness: 0.62,
}

/**
 * The clinic, which is the one bright room in a game tuned for dark ones.
 *
 * Every other interior is near-black with a few hot sources, so the threshold
 * sits low enough to catch a neon tube. A white room under flat fluorescent
 * light clears that threshold with its *walls*, and the first capture of the
 * donation room came back with a white sun burned across the far wall.
 */
export const CLINIC_BLOOM: BloomSettings = {
  intensity: 0.45,
  luminanceThreshold: 1.05,
  vignetteDarkness: 0.4,
}
