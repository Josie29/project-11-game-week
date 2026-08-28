import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/*
 * Speech bubbles drawn to canvas, the same trick as the nameplates — no font
 * loader, no image assets, crisp at any distance.
 *
 * Its own module rather than a parameter on `nameplateTexture.ts`, on the
 * one-surface-per-file rule that file and `labelTexture.ts` already follow.
 * The tint is deliberately not the nameplate's: a callout floating over a
 * head must read as speech, not as a second name.
 *
 * Keyed by the drawn label rather than the emote id, because typed text goes
 * through the same pill. That makes the cache unbounded the way the name
 * cache is — and bounded the same way in practice, by the rate limit and the
 * length of a session.
 */

const WIDTH = 512
const HEIGHT = 128

/** Corner radius of the bubble, in canvas pixels. */
const RADIUS = 56

const BACKGROUND = 'rgba(242, 239, 250, 0.92)'
const BORDER = 'rgba(64, 224, 208, 0.85)'
const TEXT = '#1b1130'

const cache = new Map<string, Texture>()

function createContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for a speech bubble')
  }
  return ctx
}

/**
 * Draws a line of speech into a rounded bubble.
 *
 * Only ever fed safe strings: a catalogue label of ours, or typed text that
 * has already been through `sanitizeSayText` — nothing arrives here straight
 * off the wire.
 *
 * Shrunk to fit, then truncated with an ellipsis at the floor: a preset label
 * always fits, but a typed line at `SAY_MAX_CHARS` can outrun any legible
 * font size, and text through the border reads as a rendering bug.
 *
 * @param label What the bubble says. Already sanitized.
 */
export function getBubbleTexture(label: string): Texture {
  const cached = cache.get(label)
  if (cached) return cached

  const ctx = createContext(WIDTH, HEIGHT)

  ctx.fillStyle = BACKGROUND
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.roundRect(4, 4, WIDTH - 8, HEIGHT - 8, RADIUS)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = TEXT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let size = 60
  const maxTextWidth = WIDTH - 72
  do {
    ctx.font = `700 ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
    if (ctx.measureText(label).width <= maxTextWidth) break
    size -= 4
  } while (size > 22)

  let drawn = label
  if (ctx.measureText(label).width > maxTextWidth) {
    while (drawn.length > 1 && ctx.measureText(`${drawn}…`).width > maxTextWidth) {
      drawn = drawn.slice(0, -1)
    }
    drawn = `${drawn}…` // Unicode ellipsis, one glyph.
  }

  ctx.fillText(drawn, WIDTH / 2, HEIGHT / 2 + 2)

  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(label, texture)
  return texture
}
