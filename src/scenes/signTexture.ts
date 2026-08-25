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

const SHOP_SIGN_WIDTH = 1024
const SHOP_SIGN_HEIGHT = 192

const marqueeCache = new Map<string, Texture>()
const bladeCache = new Map<string, Texture>()
const shopSignCache = new Map<string, Texture>()
const lightboxCache = new Map<string, Texture>()

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

  /*
   * Fit the type to the panel by measuring it.
   *
   * This was a two-step guess on `name.length`, which held for as long as every
   * venue was a two-word casino and then put "GOLDED HANGE" over the shop's
   * door — the ends of the name ran off both sides of the sign. Measuring costs
   * one extra `measureText` per sign, and signs are cached.
   */
  const text = name.toUpperCase()
  /** Panel width less the bulb border and a little breathing room. */
  const usableWidth = MARQUEE_WIDTH - 120

  let fontSize = 120
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  const measured = ctx.measureText(text).width

  if (measured > usableWidth) {
    fontSize = Math.floor(fontSize * (usableWidth / measured))
    ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  }

  drawNeonText(ctx, text, MARQUEE_WIDTH / 2, MARQUEE_HEIGHT / 2 + 4, color)

  const texture = finish(ctx)
  marqueeCache.set(key, texture)
  return texture
}

/**
 * Shop fascia sign: a neon tube in a plain box, no bulbs.
 *
 * A deliberately different sign language from `getMarqueeTexture`. The bulb
 * border is the strip's casino vocabulary, and a boutique wearing it was most
 * of why the shop read as a third casino from the street — see
 * `art/refs/shop_exterior_wide.png`, where the shop is the only frontage on the
 * block without chasing bulbs.
 */
export function getShopSignTexture(name: string, color: string): Texture {
  const key = `${name}|${color}`
  const cached = shopSignCache.get(key)
  if (cached) return cached

  const ctx = createContext(SHOP_SIGN_WIDTH, SHOP_SIGN_HEIGHT)

  // A dark box, so the tube inside it is the only thing that glows.
  ctx.fillStyle = '#140a18'
  ctx.fillRect(0, 0, SHOP_SIGN_WIDTH, SHOP_SIGN_HEIGHT)

  // A single neon rule inset from the edge, standing in for the tube that
  // outlines the panel on the reference.
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 26
  ctx.lineWidth = 5
  ctx.strokeRect(20, 20, SHOP_SIGN_WIDTH - 40, SHOP_SIGN_HEIGHT - 40)
  ctx.shadowBlur = 0

  const text = name.toUpperCase()
  /** Panel width less the neon rule and a little breathing room. */
  const usableWidth = SHOP_SIGN_WIDTH - 130

  let fontSize = 96
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  const measured = ctx.measureText(text).width

  if (measured > usableWidth) {
    fontSize = Math.floor(fontSize * (usableWidth / measured))
    ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  }

  drawNeonText(ctx, text, SHOP_SIGN_WIDTH / 2, SHOP_SIGN_HEIGHT / 2 + 2, color)

  const texture = finish(ctx)
  shopSignCache.set(key, texture)
  return texture
}

/**
 * Lightbox sign: dark type on a lit white panel, with a red cross.
 *
 * Deliberately the dullest sign on the strip. Every other frontage out there is
 * a glowing tube selling you a good time; the clinic is a backlit plastic box,
 * and that difference is the whole reason the exterior reads as somewhere you
 * only go when you have to. See `art/refs/clinic_exterior.png`.
 */
export function getLightboxTexture(name: string, accent: string): Texture {
  const key = `${name}|${accent}`
  const cached = lightboxCache.get(key)
  if (cached) return cached

  const ctx = createContext(SHOP_SIGN_WIDTH, SHOP_SIGN_HEIGHT)

  // The lit panel itself. Slightly off-white so it reads as a fluorescent box
  // rather than as a hole punched in the frontage.
  ctx.fillStyle = '#f2f6fa'
  ctx.fillRect(0, 0, SHOP_SIGN_WIDTH, SHOP_SIGN_HEIGHT)
  ctx.fillStyle = '#c9d4de'
  ctx.fillRect(0, SHOP_SIGN_HEIGHT - 12, SHOP_SIGN_WIDTH, 12)

  const text = name.toUpperCase()
  /** Panel width less the cross and a margin either side. */
  const usableWidth = SHOP_SIGN_WIDTH - 300

  let fontSize = 92
  ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  const measured = ctx.measureText(text).width

  if (measured > usableWidth) {
    fontSize = Math.floor(fontSize * (usableWidth / measured))
    ctx.font = `700 ${fontSize}px Georgia, "Times New Roman", serif`
  }

  // Flat fill, no glow. `drawNeonText` would make this a tube, which is exactly
  // what it must not be.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#1d2733'
  ctx.fillText(text, SHOP_SIGN_WIDTH / 2 - 90, SHOP_SIGN_HEIGHT / 2)

  // The cross, to the right of the type as on the reference.
  const armLength = 118
  const armWidth = 38
  const crossX = SHOP_SIGN_WIDTH - 150
  const crossY = SHOP_SIGN_HEIGHT / 2

  ctx.fillStyle = accent
  ctx.fillRect(crossX - armWidth / 2, crossY - armLength / 2, armWidth, armLength)
  ctx.fillRect(crossX - armLength / 2, crossY - armWidth / 2, armLength, armWidth)

  const texture = finish(ctx)
  lightboxCache.set(key, texture)
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
