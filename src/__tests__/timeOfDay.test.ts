import { describe, expect, it } from 'vitest'
import {
  bloomAt,
  daylightAt,
  dimHex,
  formatClock,
  KEYFRAME_MINUTES,
  lerpHex,
  MINUTES_PER_DAY,
  NEON_DAYLIGHT_FLOOR,
  neonLevelAt,
  SKY_BUCKET_MINUTES,
  skyBucket,
  skyPaletteAt,
  lightingAt,
  wrapMinute,
} from '../world/timeOfDay'

const HEX = /^#[0-9a-f]{6}$/
const EVERY_MINUTE = Array.from({ length: MINUTES_PER_DAY }, (_, minute) => minute)

/** Largest per-channel jump between two colours, 0 to 255. */
function channelDistance(a: string, b: string): number {
  let worst = 0
  for (let offset = 1; offset < 7; offset += 2) {
    const left = Number.parseInt(a.slice(offset, offset + 2), 16)
    const right = Number.parseInt(b.slice(offset, offset + 2), 16)
    worst = Math.max(worst, Math.abs(left - right))
  }
  return worst
}

/** Rec. 709 relative luminance of a `#rrggbb` colour, 0 to 255. */
function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

function paletteDistance(minuteA: number, minuteB: number): number {
  const a = skyPaletteAt(minuteA)
  const b = skyPaletteAt(minuteB)
  return Math.max(
    channelDistance(a.zenith, b.zenith),
    channelDistance(a.upper, b.upper),
    channelDistance(a.mid, b.mid),
    channelDistance(a.horizon, b.horizon),
    channelDistance(a.haze, b.haze),
  )
}

describe('clock', () => {
  // The clock is the one piece of this feature the player reads literally. An
  // unpadded minute renders "21:7", and an hour past the end of the array
  // renders "NaN:NaN" — both are the kind of thing that only shows up on the
  // one run where the demo happens to cross that minute.
  it('reads as a zero-padded 24-hour clock at both ends of the day', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(MINUTES_PER_DAY - 1)).toBe('23:59')
    expect(formatClock(21 * 60 + 7)).toBe('21:07')
    expect(formatClock(12 * 60)).toBe('12:00')
  })

  // The clock advances forever, so it crosses midnight on any session longer
  // than a few minutes. Without a wrap it would read "24:00", then "25:00".
  it('wraps past midnight instead of running off the end of the day', () => {
    expect(wrapMinute(MINUTES_PER_DAY)).toBe(0)
    expect(wrapMinute(MINUTES_PER_DAY + 5)).toBe(5)
    expect(wrapMinute(2 * MINUTES_PER_DAY + 61)).toBe(61)
  })

  // A negative or non-finite minute reaching the formatter would render as
  // "NaN:NaN" on screen rather than throwing anywhere a test would see it.
  it('never produces a negative or non-finite minute', () => {
    expect(wrapMinute(-1)).toBe(MINUTES_PER_DAY - 1)
    expect(wrapMinute(-MINUTES_PER_DAY - 30)).toBe(MINUTES_PER_DAY - 30)
    expect(wrapMinute(Number.NaN)).toBe(0)
    expect(wrapMinute(Number.POSITIVE_INFINITY)).toBe(0)
    expect(formatClock(Number.NaN)).toBe('00:00')
  })
})

describe('sky palette', () => {
  /*
    The bug this exists for: the keyframe list ends at 22:00, so an
    implementation that clamps at the last entry instead of wrapping round to
    00:00 holds the 22:00 sky for two hours and then snaps. It is one frame at
    an hour nobody is watching, which is exactly why it would ship.

    The 22:00 keyframe is deliberately not identical to the 00:00 one — if it
    were, a clamping implementation would pass this test by accident.
  */
  it('crosses midnight without a seam', () => {
    expect(paletteDistance(MINUTES_PER_DAY - 1, 0)).toBeLessThan(3)
  })

  // Same failure, one segment earlier: an off-by-one in the bracketing search
  // shows up as a visible step at a keyframe rather than at midnight.
  it('has no step at any keyframe boundary', () => {
    for (const minute of KEYFRAME_MINUTES) {
      expect(paletteDistance(wrapMinute(minute - 1), minute)).toBeLessThan(6)
      expect(paletteDistance(minute, minute + 1)).toBeLessThan(6)
    }
  })

  // A malformed stop makes canvas silently ignore the gradient and fill black,
  // which reads as the sky dome having failed to load rather than as a colour bug.
  it('produces well-formed colours for every minute of the day', () => {
    for (const minute of EVERY_MINUTE) {
      const palette = skyPaletteAt(minute)
      expect(palette.zenith).toMatch(HEX)
      expect(palette.upper).toMatch(HEX)
      expect(palette.mid).toMatch(HEX)
      expect(palette.horizon).toMatch(HEX)
      expect(palette.haze).toMatch(HEX)
    }
  })

  // Half the point of the feature. If daylight and midnight resolve to similar
  // colours the cycle is running but invisible, and everything still "passes".
  it('makes noon visibly brighter than midnight', () => {
    expect(paletteDistance(12 * 60, 0)).toBeGreaterThan(60)
  })

  /*
    Found in the 07:00 capture. The facade repaint and the neon fade both run
    off `daylightAt`, which finishes at 08:00, but the sky is keyframed
    separately — and with nothing between dawn and noon the dome was still
    barely lit while the towers had gone fully daytime. The result was daylit
    buildings standing under a night sky.

    Two curves driving one impression have to arrive together, so this pins the
    sky to the same schedule the rest of the street is on.
  */
  it('brightens the sky in step with the buildings beneath it', () => {
    const midnight = 0
    const noon = 12 * 60
    const fullRange = paletteDistance(noon, midnight)

    for (const minute of [6 * 60, 7 * 60, 8 * 60]) {
      const skyProgress = 1 - paletteDistance(minute, noon) / fullRange
      const groundProgress = daylightAt(minute)
      expect(Math.abs(skyProgress - groundProgress)).toBeLessThan(0.35)
    }
  })
})

describe('lighting', () => {
  // A fog whose near plane has overtaken its far plane renders the world
  // inside out — geometry nearest the camera is the most fogged. Interpolating
  // two keyframes cannot cause it today, but retuning one of them silently can.
  it('keeps the fog near plane in front of its far plane all day', () => {
    for (const minute of EVERY_MINUTE) {
      const light = lightingAt(minute)
      expect(light.fogNear).toBeLessThan(light.fogFar)
      expect(light.fogNear).toBeGreaterThan(0)
    }
  })

  // A negative intensity subtracts light in three, so a mistuned keyframe
  // darkens the scene rather than failing outright.
  it('never asks for a negative light intensity', () => {
    for (const minute of EVERY_MINUTE) {
      const light = lightingAt(minute)
      expect(light.ambientIntensity).toBeGreaterThan(0)
      expect(light.keyIntensity).toBeGreaterThan(0)
      expect(light.roadColor).toMatch(HEX)
      expect(light.roadRoughness).toBeGreaterThan(0)
      expect(light.roadRoughness).toBeLessThanOrEqual(1)
    }
  })

  /*
    Found by looking at the noon capture: the road had been lightened past the
    kerb beside it, and a roadway paler than its own sidewalk stops reading as a
    road — it becomes a river running between the towers.

    Asserted only where the mirror is off, because `roadColor` is a base the
    reflection multiplies into rather than the colour that reaches the screen.
    At night that base is deliberately the lighter of the two so the neon
    survives the multiply, which is why this cannot be a whole-day rule.
  */
  it('keeps the road darker than its sidewalk once the mirror is off', () => {
    for (const minute of EVERY_MINUTE) {
      const { roadColor, sidewalkColor, roadMirror } = lightingAt(minute)
      if (roadMirror > 0.3) continue
      expect(luminance(roadColor)).toBeLessThan(luminance(sidewalkColor))
    }
  })

  /*
    Also from the noon capture. At full mirror the wet asphalt carries the neon,
    which is the whole look; left there under a bright sky it mirrors the sky
    instead and the street turns into a sheet of water.
  */
  it('stops mirroring the sky once the sun is up', () => {
    expect(lightingAt(12 * 60).roadMirror).toBeLessThan(0.3)
    expect(lightingAt(0).roadMirror).toBeGreaterThan(0.9)
    for (const minute of EVERY_MINUTE) {
      const { roadMirror, roadMetalness } = lightingAt(minute)
      expect(roadMirror).toBeGreaterThanOrEqual(0)
      expect(roadMirror).toBeLessThanOrEqual(1)
      expect(roadMetalness).toBeGreaterThanOrEqual(0)
      expect(roadMetalness).toBeLessThanOrEqual(1)
    }
  })
})

describe('neon level', () => {
  // Dropping the neon to zero turns every tower into a grey box and throws away
  // the thing the strip is recognised by. Real signage stays lit through the day.
  it('never switches the neon off, even at noon', () => {
    for (const minute of EVERY_MINUTE) {
      expect(neonLevelAt(minute)).toBeGreaterThanOrEqual(NEON_DAYLIGHT_FLOOR - 1e-9)
      expect(neonLevelAt(minute)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('burns at full strength through the night and at its floor at midday', () => {
    expect(neonLevelAt(2 * 60)).toBeCloseTo(1)
    expect(neonLevelAt(23 * 60)).toBeCloseTo(1)
    expect(neonLevelAt(12 * 60)).toBeCloseTo(NEON_DAYLIGHT_FLOOR)
  })

  // A non-monotonic fade reads as the signs flickering back on halfway through
  // sunset, which looks like a bug in the scene rather than in a curve.
  it('fades in one direction across sunrise and sunset', () => {
    for (let minute = 5 * 60; minute < 8 * 60; minute++) {
      expect(neonLevelAt(minute + 1)).toBeLessThanOrEqual(neonLevelAt(minute) + 1e-9)
    }
    for (let minute = 17 * 60; minute < 20 * 60; minute++) {
      expect(neonLevelAt(minute + 1)).toBeGreaterThanOrEqual(neonLevelAt(minute) - 1e-9)
    }
  })

  it('runs daylight from nothing at night to full at midday', () => {
    expect(daylightAt(3 * 60)).toBe(0)
    expect(daylightAt(22 * 60)).toBe(0)
    expect(daylightAt(12 * 60)).toBe(1)
  })
})

describe('bloom', () => {
  /*
    The composer is tuned so only toneMapped={false} neon crosses the
    threshold. Under a daylight rig an ordinary lit facade exceeds the night
    value too, and the whole frame blooms into white fog — the single most
    likely way this feature ships looking broken.
  */
  it('raises the bloom threshold as the sun comes up', () => {
    expect(bloomAt(12 * 60).luminanceThreshold).toBeGreaterThan(
      bloomAt(0).luminanceThreshold,
    )
    expect(bloomAt(12 * 60).intensity).toBeLessThan(bloomAt(0).intensity)
    expect(bloomAt(12 * 60).vignetteDarkness).toBeLessThan(bloomAt(0).vignetteDarkness)
  })

  // Above 1.0 the threshold excludes everything and the neon stops glowing
  // entirely; below 0 it includes everything and the frame blows out.
  it('keeps the threshold inside the range that has any effect', () => {
    for (const minute of EVERY_MINUTE) {
      const bloom = bloomAt(minute)
      expect(bloom.luminanceThreshold).toBeGreaterThan(0)
      expect(bloom.luminanceThreshold).toBeLessThan(1)
      expect(bloom.intensity).toBeGreaterThan(0)
    }
  })
})

describe('sky bucketing', () => {
  /*
    The sky texture is redrawn per bucket and the previous one disposed. If
    buckets did not partition the day evenly the redraw would either thrash —
    a new 512px canvas every frame — or stall on one palette for hours.
  */
  it('divides the day into evenly spaced steps', () => {
    const buckets = new Set(EVERY_MINUTE.map(skyBucket))
    expect(buckets.size).toBe(MINUTES_PER_DAY / SKY_BUCKET_MINUTES)
    expect(Math.min(...buckets)).toBe(0)
    expect(Math.max(...buckets)).toBe(MINUTES_PER_DAY / SKY_BUCKET_MINUTES - 1)
  })

  // Adjacent steps have to be close enough that the redraw is not a visible
  // pop; this is the number that justifies SKY_BUCKET_MINUTES being as coarse
  // as it is, and it moves the moment a keyframe is retuned.
  it('steps too little between buckets to be seen', () => {
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += SKY_BUCKET_MINUTES) {
      expect(paletteDistance(minute, minute + SKY_BUCKET_MINUTES)).toBeLessThan(14)
    }
  })
})

describe('colour helpers', () => {
  it('blends and dims to well-formed colours', () => {
    expect(lerpHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(lerpHex('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(dimHex('#ffffff', 0.5)).toBe('#808080')
    expect(dimHex('#ff2d95', 1)).toBe('#ff2d95')
  })

  // A dim level outside 0..1 would brighten a colour past white and wrap the
  // channel arithmetic, turning a washed-out sign an unrelated colour.
  it('clamps out-of-range dim levels instead of wrapping the channels', () => {
    expect(dimHex('#ff2d95', 2)).toBe('#ff2d95')
    expect(dimHex('#ff2d95', -1)).toBe('#000000')
  })
})
