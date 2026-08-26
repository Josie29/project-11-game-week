import { describe, expect, it } from 'vitest'
import { heightToNormal } from '../scenes/clinicTexture'

const SIZE = 8

/** A field of one constant height. */
function flat(value: number): number[] {
  return new Array<number>(SIZE * SIZE).fill(value)
}

/** A field that climbs left to right. */
function rampX(): number[] {
  const heights = new Array<number>(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) heights[y * SIZE + x] = x / (SIZE - 1)
  }
  return heights
}

/** Reads one pixel back out as an `[r, g, b]` triple. */
function pixel(rgba: Uint8ClampedArray, x: number, y: number): [number, number, number] {
  const index = (y * SIZE + x) * 4
  return [rgba[index] ?? 0, rgba[index + 1] ?? 0, rgba[index + 2] ?? 0]
}

/** Turns an encoded byte triple back into a direction. */
function decode([r, g, b]: [number, number, number]): [number, number, number] {
  return [(r - 128) / 127, (g - 128) / 127, (b - 128) / 127]
}

describe('heightToNormal', () => {
  /*
   * The whole point of the function, and the failure it is here to catch: a
   * normal map whose flat regions are a byte off neutral tilts every surface it
   * is applied to by a fraction of a degree. That reads as a faint sheen across
   * the floor and the ceiling that no material tweak removes, because the
   * material is not what is wrong.
   */
  it('encodes a flat field as exactly neutral', () => {
    const rgba = heightToNormal(flat(0.5), SIZE, SIZE, 3)

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        expect(pixel(rgba, x, y), `pixel ${x},${y} is not neutral`).toEqual([128, 128, 255])
      }
    }
  })

  /*
   * ...and the opposite failure, which is the one that actually shipped in this
   * project's history under a different name: a conversion that returns neutral
   * for *everything* leaves the clinic's floor and ceiling looking exactly as
   * untextured as before while every other assertion in the suite passes.
   */
  it('does not return neutral for a field that is not flat', () => {
    const rgba = heightToNormal(rampX(), SIZE, SIZE, 3)
    const tilted = Array.from({ length: SIZE }, (_, x) => pixel(rgba, x, 0)).filter(
      ([r, g]) => r !== 128 || g !== 128,
    )

    expect(tilted.length, 'every normal came back flat').toBeGreaterThan(0)
  })

  // A map that tilts the wrong way lights the surface from the wrong side, which
  // looks like a lighting bug and sends the search to the wrong file.
  it('tilts away from rising ground', () => {
    const rgba = heightToNormal(rampX(), SIZE, SIZE, 3)

    // Mid-row, clear of the wrap seam: the ground climbs toward +x, so the
    // surface faces back toward -x.
    const [x] = decode(pixel(rgba, SIZE / 2, SIZE / 2))
    expect(x).toBeLessThan(0)

    // ...and nothing varies along y, so that axis stays neutral.
    const [, y] = decode(pixel(rgba, SIZE / 2, SIZE / 2))
    expect(y).toBeCloseTo(0, 5)
  })

  /*
   * Sampling wraps, and this is the assertion that says so. Everything this
   * feeds is a repeating texture: clamping at the edge instead flattens the
   * outermost pixel of every tile, which draws a faint grid over the whole
   * ceiling — the exact artefact the tiling was meant to hide.
   */
  it('samples across the seam rather than clamping at it', () => {
    // Flat except for one raised column at the far edge, so column 0 only has a
    // slope at all if it can see across the wrap.
    const heights = flat(0)
    for (let y = 0; y < SIZE; y++) heights[y * SIZE + (SIZE - 1)] = 1

    const [r] = pixel(heightToNormal(heights, SIZE, SIZE, 3), 0, 0)
    expect(r, 'column 0 came back flat, so the edge clamped').not.toBe(128)
  })

  // A non-unit normal scales the lighting response, brightening or dimming the
  // surface for reasons that look like a material problem.
  it('encodes unit-length directions', () => {
    const rgba = heightToNormal(rampX(), SIZE, SIZE, 6)

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [nx, ny, nz] = decode(pixel(rgba, x, y))
        // Loose, because the encoding is eight bits per axis.
        expect(Math.hypot(nx, ny, nz), `pixel ${x},${y}`).toBeCloseTo(1, 1)
      }
    }
  })

  // Silently producing a wrong-sized buffer would put a garbled texture on the
  // floor rather than fail, and a garbled texture reads as a drawing mistake.
  it('rejects a height field that does not match its dimensions', () => {
    expect(() => heightToNormal(flat(0.5), SIZE, SIZE + 1, 3)).toThrow(RangeError)
  })
})
