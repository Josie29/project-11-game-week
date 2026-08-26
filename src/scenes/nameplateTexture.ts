import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/*
 * Player nameplates drawn to canvas, the same trick the signage, cards and felt
 * use. No font loader, no image assets, crisp at any distance, and the text is
 * guaranteed to say what it was given.
 *
 * Cached by name because a nameplate is redrawn only when somebody's name
 * changes, which is approximately never — and without the cache every remote
 * player would allocate a texture on each re-render of the roster.
 */

const WIDTH = 512
const HEIGHT = 128

/** Corner radius of the pill, in canvas pixels. */
const RADIUS = 40

const BACKGROUND = 'rgba(11, 7, 20, 0.72)'
const BORDER = 'rgba(255, 45, 149, 0.55)'
const TEXT = '#f2effa'

const cache = new Map<string, Texture>()

function createContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for a nameplate')
  }
  return ctx
}

function finish(ctx: CanvasRenderingContext2D): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Draws a name into a rounded pill.
 *
 * The font is shrunk to fit rather than the text being clipped: names are
 * already capped in length by `sanitizePlayerName`, but a capped name in wide
 * characters can still overrun, and a nameplate reading "Josieeeeeeeee" cut
 * mid-letter looks like a rendering bug rather than a long name.
 *
 * @param name An already-sanitized display name.
 */
export function getNameplateTexture(name: string): Texture {
  const cached = cache.get(name)
  if (cached) return cached

  const ctx = createContext(WIDTH, HEIGHT)

  ctx.fillStyle = BACKGROUND
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(4, 4, WIDTH - 8, HEIGHT - 8, RADIUS)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = TEXT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let size = 64
  const maxTextWidth = WIDTH - 64
  do {
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
    if (ctx.measureText(name).width <= maxTextWidth) break
    size -= 4
  } while (size > 24)

  ctx.fillText(name, WIDTH / 2, HEIGHT / 2 + 2)

  const texture = finish(ctx)
  cache.set(name, texture)
  return texture
}
