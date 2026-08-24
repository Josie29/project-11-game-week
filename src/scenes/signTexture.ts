import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/**
 * Casino signage drawn to canvas, the same trick the cards and felt use.
 *
 * Real marquees are the strip's whole identity, and they need readable words.
 * Rendering them here keeps the neon vector-crisp, avoids a font loader, and
 * lets a casino's name come straight from its config entry.
 */

const MARQUEE_WIDTH = 1024
const MARQUEE_HEIGHT = 256

const BLADE_WIDTH = 256
const BLADE_HEIGHT = 1024

/** Warm bulbs chasing the edge of a marquee, as on a real theatre sign. */
const BULB_COLOR = '#ffdf9a'
const BULB_SPACING = 34
const BULB_RADIUS = 5

const marqueeCache = new Map<string, Texture>()
const bladeCache = new Map<string, Texture>()

function createContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for signage')
  }
  return ctx
}

function finish(ctx: CanvasRenderingContext2D): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Rings a rectangle with evenly spaced bulbs. */
function drawBulbBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.fillStyle = BULB_COLOR
  ctx.shadowColor = BULB_COLOR
  ctx.shadowBlur = 12

  const place = (cx: number, cy: number) => {
    ctx.beginPath()
    ctx.arc(cx, cy, BULB_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let cx = x; cx <= x + width; cx += BULB_SPACING) {
    place(cx, y)
    place(cx, y + height)
  }
  for (let cy = y; cy <= y + height; cy += BULB_SPACING) {
    place(x, cy)
    place(x + width, cy)
  }

  ctx.shadowBlur = 0
}

/**
 * Draws glowing text by stroking a wide halo before filling the core.
 *
 * A single fill reads as flat coloured text; the layered shadow is what makes
 * it look like a lit tube.
 */
function drawNeonText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.shadowColor = color
  ctx.strokeStyle = color
  ctx.lineWidth = 8

  // Two passes of decreasing blur build up the bloom around the glyphs.
  ctx.shadowBlur = 44
  ctx.strokeText(text, x, y)
  ctx.shadowBlur = 20
  ctx.strokeText(text, x, y)

  // Hot core, near-white so the tube looks over-driven.
  ctx.shadowBlur = 10
  ctx.fillStyle = '#fffdf5'
  ctx.fillText(text, x, y)
  ctx.shadowBlur = 0
}

/** Horizontal marquee: the casino's name above its entrance. */
export function getMarqueeTexture(name: string, color: string): Texture {
  const key = `${name}|${color}`
  const cached = marqueeCache.get(key)
  if (cached) return cached

  const ctx = createContext(MARQUEE_WIDTH, MARQUEE_HEIGHT)

  ctx.fillStyle = '#0b0a14'
  ctx.fillRect(0, 0, MARQUEE_WIDTH, MARQUEE_HEIGHT)

  // Inner panel, leaving a margin for the bulbs to sit in.
  ctx.fillStyle = '#131022'
  ctx.fillRect(26, 26, MARQUEE_WIDTH - 52, MARQUEE_HEIGHT - 52)

  drawBulbBorder(ctx, 26, 26, MARQUEE_WIDTH - 52, MARQUEE_HEIGHT - 52)

  // Shrink the type for longer names so they always fit the panel.
  const fontSize = name.length > 11 ? 96 : 120
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  drawNeonText(ctx, name.toUpperCase(), MARQUEE_WIDTH / 2, MARQUEE_HEIGHT / 2 + 4, color)

  const texture = finish(ctx)
  marqueeCache.set(key, texture)
  return texture
}

/** Vertical blade sign: the tall projecting sign beside an entrance. */
export function getBladeTexture(name: string, color: string): Texture {
  const key = `${name}|${color}`
  const cached = bladeCache.get(key)
  if (cached) return cached

  const ctx = createContext(BLADE_WIDTH, BLADE_HEIGHT)

  ctx.fillStyle = '#0b0a14'
  ctx.fillRect(0, 0, BLADE_WIDTH, BLADE_HEIGHT)
  ctx.fillStyle = '#131022'
  ctx.fillRect(18, 18, BLADE_WIDTH - 36, BLADE_HEIGHT - 36)

  drawBulbBorder(ctx, 18, 18, BLADE_WIDTH - 36, BLADE_HEIGHT - 36)

  // Letters stack down the blade, spaces collapsed out.
  const letters = [...name.toUpperCase().replace(/\s+/g, '')]
  const usableHeight = BLADE_HEIGHT - 120
  const step = usableHeight / letters.length
  const fontSize = Math.min(step * 0.82, 92)

  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`

  letters.forEach((letter, index) => {
    const y = 60 + step * (index + 0.5)
    drawNeonText(ctx, letter, BLADE_WIDTH / 2, y, color)
  })

  const texture = finish(ctx)
  bladeCache.set(key, texture)
  return texture
}
