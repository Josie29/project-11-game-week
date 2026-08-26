import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/*
 * The caption under a figure on a contact sheet.
 *
 * Drawn to canvas, like every other text surface in the game — the cards, the
 * felt, the signage and the shop's price cards. No asset pipeline, crisp at any
 * resolution, and the text is guaranteed to be the real enum member rather than
 * a label typed once and left behind when the catalogue moved.
 *
 * Dev-only: nothing on a contact sheet ships. It is here rather than in
 * `src/dev/` because it is a texture and this is where the textures live.
 */

const WIDTH = 512
const HEIGHT = 96

const INK = '#f2ecff'
const SHADOW = '#0a0714'

const cache = new Map<string, Texture>()

/**
 * A transparent strip with one line of text on it.
 *
 * @param text The caption. Long names are shrunk to fit rather than clipped —
 *   "Crimson Satin Gown" overruns at the size "Ring" wants, and a name cut off
 *   by the edge of its own label is worse than a smaller one.
 * @returns A cached texture. Repeated calls for the same text share one.
 * @throws {Error} If a 2D canvas context cannot be acquired.
 */
export function getLabelTexture(text: string): Texture {
  const cached = cache.get(text)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for a label')
  }

  let size = 54
  do {
    ctx.font = `600 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`
    if (ctx.measureText(text).width <= WIDTH - 32) break
    size -= 3
  } while (size > 20)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // A drop shadow, because a caption sits over whatever the backdrop is doing
  // and pale text on a dark stage still needs an edge to read against fog.
  ctx.fillStyle = SHADOW
  ctx.fillText(text, WIDTH / 2 + 3, HEIGHT / 2 + 3)
  ctx.fillStyle = INK
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  cache.set(text, texture)

  return texture
}
