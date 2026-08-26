import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { lerpHex } from '../world/timeOfDay'

/**
 * Tiling hotel-tower facade: window rows between vertical pilasters.
 *
 * The grey-box pass used flat dark boxes, which read as voids between the neon.
 * Windows give the towers scale and a sense of occupancy, and cost one texture
 * shared by every building.
 *
 * The palette follows the hour. This is not decoration: the walls are painted
 * dark enough for a night scene that no amount of daylight in the rig lifts
 * them, so under a noon sky the whole street stayed a row of night towers with
 * their lights on. Lighting alone cannot fix a texture authored for one hour.
 */
const SIZE = 512

/** Night palette — the strip as it shipped. */
const NIGHT = {
  wallDark: '#211f3f',
  wallLight: '#2b284f',
  pilaster: '#3a3568',
  /** Warm interior tones; a few windows stay dark so the grid is not uniform. */
  windowLit: ['#ffd89a', '#ffc978', '#f7e3bd', '#e8b978'],
  windowDark: '#0f0e1f',
} as const

/**
 * Day palette — pale concrete, and glass instead of glow.
 *
 * The windows deliberately converge on one another by day: an interior light is
 * invisible against the sun, so what a tower actually shows is a flat grid of
 * reflective glazing.
 */
const DAY = {
  /*
   * Warm stone, not cold concrete.
   *
   * These were lavender-greys, and under a blue sky with a blue ambient the
   * whole street came out the colour of a rain cloud. `strip_exterior_day.png`
   * is cream and sand with the shadows doing the cooling — the sky tints the
   * shaded faces on its own, and the wall does not need to help.
   */
  wallDark: '#b8ac97',
  wallLight: '#cfc3ab',
  pilaster: '#e0d6c2',
  windowLit: ['#6d7f9e', '#62748f', '#7688a6', '#5b6d8a'],
  windowDark: '#4e5f7d',
} as const

const WINDOW_COLUMNS = 8
const WINDOW_ROWS = 10

interface FacadePalette {
  readonly wallDark: string
  readonly wallLight: string
  readonly pilaster: string
  readonly windowLit: readonly string[]
  readonly windowDark: string
}

function paletteFor(daylight: number): FacadePalette {
  const t = Math.min(1, Math.max(0, daylight))
  return {
    wallDark: lerpHex(NIGHT.wallDark, DAY.wallDark, t),
    wallLight: lerpHex(NIGHT.wallLight, DAY.wallLight, t),
    pilaster: lerpHex(NIGHT.pilaster, DAY.pilaster, t),
    windowLit: NIGHT.windowLit.map((lit, index) =>
      lerpHex(lit, DAY.windowLit[index] ?? DAY.windowLit[0], t),
    ),
    windowDark: lerpHex(NIGHT.windowDark, DAY.windowDark, t),
  }
}

/**
 * One canvas, redrawn in place.
 *
 * Every building clones the texture to set its own `repeat`, and a clone shares
 * the underlying image source — so repainting this canvas and flagging it once
 * updates all sixteen towers off a single upload. Handing out fresh textures
 * instead would re-upload a megabyte per tower on every step of the day.
 */
let canvas: HTMLCanvasElement | null = null
let facadeTexture: Texture | null = null
let drawnBucket: number | null = null

function drawFacade(target: HTMLCanvasElement, daylight: number): void {
  const ctx = target.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the facade')
  }

  const palette = paletteFor(daylight)

  ctx.fillStyle = palette.wallDark
  ctx.fillRect(0, 0, SIZE, SIZE)

  const cellWidth = SIZE / WINDOW_COLUMNS
  const cellHeight = SIZE / WINDOW_ROWS

  for (let column = 0; column < WINDOW_COLUMNS; column++) {
    // Alternating bands of wall tone break up the flat surface.
    ctx.fillStyle = column % 2 === 0 ? palette.wallDark : palette.wallLight
    ctx.fillRect(column * cellWidth, 0, cellWidth, SIZE)

    // Vertical pilaster between window columns.
    ctx.fillStyle = palette.pilaster
    ctx.fillRect(column * cellWidth - 2, 0, 4, SIZE)

    for (let row = 0; row < WINDOW_ROWS; row++) {
      const roll = hash(column, row)
      const isLit = roll > 0.38

      ctx.fillStyle = isLit
        ? (palette.windowLit[Math.floor(roll * 1000) % palette.windowLit.length] ??
          palette.windowDark)
        : palette.windowDark

      const x = column * cellWidth + cellWidth * 0.24
      const y = row * cellHeight + cellHeight * 0.22
      ctx.fillRect(x, y, cellWidth * 0.52, cellHeight * 0.46)
    }
  }
}

/**
 * Deterministic value hash in [0, 1).
 *
 * A seeded pattern keeps the lit windows identical on every load, so the strip
 * does not flicker between reloads or shuffle mid-demo — and, since the same
 * rolls are replayed on every repaint, a window does not change its mind about
 * whether it is lit as the day goes by.
 */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Returns the shared facade texture, drawing it on first request. */
export function getFacadeTexture(): Texture {
  if (facadeTexture && canvas) return facadeTexture

  canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  drawFacade(canvas, 0)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 8
  facadeTexture = texture
  drawnBucket = null
  return texture
}

/**
 * Repaints the facade for the hour, if it has moved on.
 *
 * @param bucket Step of the day, so a repeat call within one step is free.
 * @param daylight 0 through the night, 1 at midday.
 */
export function setFacadeDaylight(bucket: number, daylight: number): void {
  if (drawnBucket === bucket) return

  const texture = getFacadeTexture()
  if (!canvas) return

  drawFacade(canvas, daylight)
  drawnBucket = bucket
  // Bumps the shared image source, so every cloned texture re-uploads with it.
  texture.needsUpdate = true
}
