import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { EMOTE_LABELS, type EmoteId } from '../world/emotes'

/*
 * Emote bubbles drawn to canvas, the same trick as the nameplates — no font
 * loader, no image assets, crisp at any distance.
 *
 * Its own module rather than a parameter on `nameplateTexture.ts`, on the
 * one-surface-per-file rule that file and `labelTexture.ts` already follow.
 * The tint is deliberately not the nameplate's: a callout floating over a
 * head must read as speech, not as a second name.
 *
 * Cached by id, and the id set is the catalogue — so unlike the name cache,
 * this one is bounded by construction.
 */

const WIDTH = 512
const HEIGHT = 128

/** Corner radius of the bubble, in canvas pixels. */
const RADIUS = 56

const BACKGROUND = 'rgba(242, 239, 250, 0.92)'
const BORDER = 'rgba(64, 224, 208, 0.85)'
const TEXT = '#1b1130'

const cache = new Map<EmoteId, Texture>()

function createContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for an emote bubble')
  }
  return ctx
}

/**
 * Draws an emote's label into a rounded speech bubble.
 *
 * The text comes from `EMOTE_LABELS`, never from the wire — the id was
 * sanitized against the catalogue before it reached the store, so this can
 * only ever draw a string this build ships.
 *
 * @param emote A catalogued emote id.
 */
export function getEmoteTexture(emote: EmoteId): Texture {
  const cached = cache.get(emote)
  if (cached) return cached

  const ctx = createContext(WIDTH, HEIGHT)
  const label = EMOTE_LABELS[emote]

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

  // Shrunk to fit rather than clipped, exactly as the nameplate does: the
  // labels are ours, but "The hard way!" in wide glyphs still has to land
  // inside the pill rather than through its border.
  let size = 60
  const maxTextWidth = WIDTH - 72
  do {
    ctx.font = `700 ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
    if (ctx.measureText(label).width <= maxTextWidth) break
    size -= 4
  } while (size > 24)

  ctx.fillText(label, WIDTH / 2, HEIGHT / 2 + 2)

  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(emote, texture)
  return texture
}
