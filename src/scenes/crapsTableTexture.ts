import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/**
 * The craps table's surfaces, drawn to canvas at runtime like everything else
 * on this project: polished rail wood, the pyramid-rubber bumper inside the pit,
 * and the ridged chip channel cut into the rail.
 *
 * All three are tiled, so all three are drawn seamlessly — a pattern that wraps
 * on both axes, with nothing crossing the edge that does not also cross the
 * opposite edge. A tileable texture is the one kind of canvas work where a
 * mistake is invisible on the canvas and glaring on the mesh.
 *
 * Every pattern is laid out with a seeded generator rather than `Math.random`.
 * A capture has to be reproducible or a regression shot cannot be compared with
 * the one before it, and grain that moves between runs makes every diff a
 * false positive.
 */

/**
 * Deterministic 32-bit generator, so the grain is the same on every run.
 *
 * @param seed Any non-zero integer.
 * @returns A function yielding successive values in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    // mulberry32: cheap, well-distributed, and short enough to read.
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const WOOD_SIZE = 512

/** Mahogany, read off `art/refs/craps_table.png` where the rail catches the neon. */
const WOOD_BASE = '#6b3220'
const WOOD_DARK = '#3d1a10'
const WOOD_LIGHT = '#a35c36'

const BUMPER_SIZE = 256

/*
 * The bumper is well darker than the felt and barely lit. The first pass gave
 * it the felt's own green at the facet highlight and it read as bright mesh
 * fencing round the pit — in the reference it is a texture you notice only
 * because it catches a little of the pendant, not a pattern that competes with
 * the print.
 */
const BUMPER_BASE = '#0a2e1f'
const BUMPER_FACET_LIGHT = 'rgba(28, 76, 55, 0.9)'
const BUMPER_FACET_DARK = 'rgba(2, 14, 9, 0.9)'

/** Cells across the bumper tile. More reads finer; the reference is dense. */
const BUMPER_CELLS = 10

const CHANNEL_SIZE = 128

let woodTexture: Texture | null = null
let bumperTexture: Texture | null = null
let channelTexture: Texture | null = null

/**
 * Creates a canvas and its 2D context.
 *
 * @throws Error if a 2D context cannot be acquired.
 */
function createCanvas(
  width: number,
  height: number,
  label: string,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(`Could not acquire a 2D canvas context for the ${label}`)
  }
  return { canvas, ctx }
}

/** Wraps a canvas as a tiling texture in sRGB. */
function toTilingTexture(canvas: HTMLCanvasElement, anisotropy = 8): Texture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = anisotropy
  return texture
}

/**
 * Draws the rail's polished mahogany.
 *
 * Grain runs along the canvas's x axis, which the band and ring geometries map
 * to arc length — so the grain follows the rail round the table rather than
 * striping across it.
 */
function drawWood(): Texture {
  const { canvas, ctx } = createCanvas(WOOD_SIZE, WOOD_SIZE, 'rail wood')
  const random = seededRandom(0x5eed_10a1)

  ctx.fillStyle = WOOD_BASE
  ctx.fillRect(0, 0, WOOD_SIZE, WOOD_SIZE)

  // Broad tonal bands across the grain, giving the plank its varying depth.
  for (let band = 0; band < 26; band++) {
    const y = random() * WOOD_SIZE
    const height = 6 + random() * 26
    const toward = random() < 0.55 ? WOOD_DARK : WOOD_LIGHT
    ctx.fillStyle = toward
    ctx.globalAlpha = 0.05 + random() * 0.1
    ctx.fillRect(0, y, WOOD_SIZE, height)
    // Repeat anything that ran off the bottom at the top, so the tile wraps.
    if (y + height > WOOD_SIZE) {
      ctx.fillRect(0, y - WOOD_SIZE, WOOD_SIZE, height)
    }
  }
  ctx.globalAlpha = 1

  /*
   * Grain lines. Each is a sine wave that completes a whole number of cycles
   * across the tile, which is what makes the left and right edges meet — a
   * wave with a fractional period leaves a visible vertical seam every repeat.
   */
  for (let line = 0; line < 150; line++) {
    const y = random() * WOOD_SIZE
    const cycles = 1 + Math.floor(random() * 3)
    const amplitude = 1.5 + random() * 7
    const dark = random() < 0.62

    ctx.strokeStyle = dark ? WOOD_DARK : WOOD_LIGHT
    ctx.globalAlpha = 0.06 + random() * 0.16
    ctx.lineWidth = 0.6 + random() * 1.9

    ctx.beginPath()
    for (let x = 0; x <= WOOD_SIZE; x += 8) {
      const wave = Math.sin((x / WOOD_SIZE) * cycles * Math.PI * 2) * amplitude
      const at = y + wave
      if (x === 0) ctx.moveTo(x, at)
      else ctx.lineTo(x, at)
    }
    ctx.stroke()

    // The same line one tile up and down, so a wave that strays over an edge
    // arrives from the other side instead of being clipped.
    for (const shift of [-WOOD_SIZE, WOOD_SIZE]) {
      ctx.beginPath()
      for (let x = 0; x <= WOOD_SIZE; x += 8) {
        const wave = Math.sin((x / WOOD_SIZE) * cycles * Math.PI * 2) * amplitude
        const at = y + wave + shift
        if (x === 0) ctx.moveTo(x, at)
        else ctx.lineTo(x, at)
      }
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1

  return toTilingTexture(canvas, 16)
}

/**
 * Draws one pyramid: a light facet catching the room and a dark one in shadow.
 *
 * Drawn rather than lit. A real bumper is thousands of moulded pyramids, and
 * geometry for them would cost more than the whole rest of the table; two
 * triangles per cell with a fixed light direction reads the same at any distance
 * the camera can reach.
 */
function drawPyramid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const half = size / 2
  const cx = x + half
  const cy = y + half

  // Lit from the upper left, matching the pendant hanging over the table.
  ctx.fillStyle = BUMPER_FACET_LIGHT
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + size, y)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y + size)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = BUMPER_FACET_DARK
  ctx.beginPath()
  ctx.moveTo(x + size, y)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x, y + size)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fill()
}

/** Draws the pyramid-rubber bumper that lines the inside of the pit. */
function drawBumper(): Texture {
  const { canvas, ctx } = createCanvas(BUMPER_SIZE, BUMPER_SIZE, 'pit bumper')

  ctx.fillStyle = BUMPER_BASE
  ctx.fillRect(0, 0, BUMPER_SIZE, BUMPER_SIZE)

  const cell = BUMPER_SIZE / BUMPER_CELLS
  for (let row = 0; row < BUMPER_CELLS; row++) {
    for (let column = 0; column < BUMPER_CELLS; column++) {
      // Offset alternate rows by half a cell, which is how a real bumper is
      // moulded and what stops the pattern reading as a plain grid.
      const offset = row % 2 === 0 ? 0 : cell / 2
      drawPyramid(ctx, column * cell + offset - cell, row * cell, cell)
      drawPyramid(ctx, column * cell + offset, row * cell, cell)
    }
  }

  // Darken toward the bottom: the foot of the bumper sits in the pit's shadow.
  const shade = ctx.createLinearGradient(0, 0, 0, BUMPER_SIZE)
  shade.addColorStop(0, 'rgba(0, 0, 0, 0)')
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.45)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, BUMPER_SIZE, BUMPER_SIZE)

  return toTilingTexture(canvas)
}

/**
 * Draws the ridged floor of the chip channel.
 *
 * Slots rather than a plain groove: the ridges are what say "chips go here",
 * and painting them costs one texture where modelling them costs a divider mesh
 * every few centimetres all the way round the table.
 */
function drawChipChannel(): Texture {
  const { canvas, ctx } = createCanvas(CHANNEL_SIZE, CHANNEL_SIZE, 'chip channel')

  ctx.fillStyle = '#2a1208'
  ctx.fillRect(0, 0, CHANNEL_SIZE, CHANNEL_SIZE)

  // One slot per tile, so the repeat count sets the slot pitch directly.
  ctx.fillStyle = '#120802'
  ctx.fillRect(0, 0, CHANNEL_SIZE * 0.72, CHANNEL_SIZE)

  // Lit edge of the divider between slots.
  ctx.fillStyle = '#7a4326'
  ctx.fillRect(CHANNEL_SIZE * 0.72, 0, CHANNEL_SIZE * 0.1, CHANNEL_SIZE)

  return toTilingTexture(canvas, 4)
}

/** Returns the cached rail wood, drawing it on first request. */
export function getRailWoodTexture(): Texture {
  woodTexture ??= drawWood()
  return woodTexture
}

/** Returns the cached pit bumper, drawing it on first request. */
export function getPitBumperTexture(): Texture {
  bumperTexture ??= drawBumper()
  return bumperTexture
}

/** Returns the cached chip channel, drawing it on first request. */
export function getChipChannelTexture(): Texture {
  channelTexture ??= drawChipChannel()
  return channelTexture
}
