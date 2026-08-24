import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * Tiling hotel-tower facade: lit window rows between vertical pilasters.
 *
 * The grey-box pass used flat dark boxes, which read as voids between the neon.
 * Windows give the towers scale and a sense of occupancy, and cost one texture
 * shared by every building.
 */
const SIZE = 512

const WALL_DARK = '#211f3f'
const WALL_LIGHT = '#2b284f'
const PILASTER = '#3a3568'

const WINDOW_COLUMNS = 8
const WINDOW_ROWS = 10

/** Warm interior tones; a few windows stay dark so the grid is not uniform. */
const WINDOW_LIT = ['#ffd89a', '#ffc978', '#f7e3bd', '#e8b978'] as const
const WINDOW_DARK = '#0f0e1f'

let facadeTexture: Texture | null = null

/**
 * Deterministic value hash in [0, 1).
 *
 * A seeded pattern keeps the lit windows identical on every load, so the strip
 * does not flicker between reloads or shuffle mid-demo.
 */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

function drawFacade(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the facade')
  }

  ctx.fillStyle = WALL_DARK
  ctx.fillRect(0, 0, SIZE, SIZE)

  const cellWidth = SIZE / WINDOW_COLUMNS
  const cellHeight = SIZE / WINDOW_ROWS

  for (let column = 0; column < WINDOW_COLUMNS; column++) {
    // Alternating bands of wall tone break up the flat surface.
    ctx.fillStyle = column % 2 === 0 ? WALL_DARK : WALL_LIGHT
    ctx.fillRect(column * cellWidth, 0, cellWidth, SIZE)

    // Vertical pilaster between window columns.
    ctx.fillStyle = PILASTER
    ctx.fillRect(column * cellWidth - 2, 0, 4, SIZE)

    for (let row = 0; row < WINDOW_ROWS; row++) {
      const roll = hash(column, row)
      const isLit = roll > 0.38

      ctx.fillStyle = isLit
        ? (WINDOW_LIT[Math.floor(roll * 1000) % WINDOW_LIT.length] ?? WINDOW_LIT[0])
        : WINDOW_DARK

      const x = column * cellWidth + cellWidth * 0.24
      const y = row * cellHeight + cellHeight * 0.22
      ctx.fillRect(x, y, cellWidth * 0.52, cellHeight * 0.46)
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 8
  return texture
}

/** Returns the shared facade texture, drawing it on first request. */
export function getFacadeTexture(): Texture {
  facadeTexture ??= drawFacade()
  return facadeTexture
}
