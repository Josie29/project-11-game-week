import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import {
  CRAPS_BET_LABELS,
  CrapsBet,
  FIELD_NUMBERS,
  type FeltRect,
  POINT_BOX_RECTS,
  POINT_NUMBERS,
  getCrapsBetRect,
} from './crapsFeltLayout'

/**
 * The craps felt, drawn to a canvas for the same reason the blackjack felt is:
 * it puts exact, legible markings on the table without a font loader or an
 * image asset — and unlike a generated texture, the text is guaranteed correct.
 *
 * The canvas is retained after the first draw so a hover can repaint one band
 * in place. Repainting the whole felt costs a few hundred microseconds and
 * avoids a second texture plus a shader branch to composite it.
 */
const WIDTH = 1536
const HEIGHT = 1024

const FELT_LIT = '#1a7a4f'
const FELT_MID = '#0f5b41'
const FELT_EDGE = '#062a1c'

const GOLD = '#f2cd6b'
const GOLD_SOFT = 'rgba(242, 205, 107, 0.62)'
const GOLD_FAINT = 'rgba(242, 205, 107, 0.12)'
const HIGHLIGHT_FILL = 'rgba(242, 205, 107, 0.22)'

/** Don't-pass markings print red on a real layout; keeping that reads as craps. */
const CRIMSON = '#d9455f'
const CRIMSON_SOFT = 'rgba(217, 69, 95, 0.55)'

const BAND_LINE_WIDTH = 5
const BOX_CORNER_RADIUS = 14

let canvas: HTMLCanvasElement | null = null
let context: CanvasRenderingContext2D | null = null
let feltTexture: Texture | null = null
let highlighted: CrapsBet | null = null

/** Converts a normalized rect to canvas pixels. */
function toPixels(rect: FeltRect): {
  x: number
  y: number
  width: number
  height: number
} {
  return {
    x: rect.u0 * WIDTH,
    y: rect.v0 * HEIGHT,
    width: (rect.u1 - rect.u0) * WIDTH,
    height: (rect.v1 - rect.v0) * HEIGHT,
  }
}

/** Strokes a rounded band, optionally filling it first. */
function drawBand(
  ctx: CanvasRenderingContext2D,
  rect: FeltRect,
  stroke: string,
  fill: string | null,
): void {
  const { x, y, width, height } = toPixels(rect)

  ctx.beginPath()
  ctx.roundRect(x, y, width, height, BOX_CORNER_RADIUS)

  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }

  ctx.strokeStyle = stroke
  ctx.lineWidth = BAND_LINE_WIDTH
  ctx.stroke()
}

/** Draws a band's label, centred, with the given font and colour. */
function drawBandLabel(
  ctx: CanvasRenderingContext2D,
  rect: FeltRect,
  label: string,
  font: string,
  color: string,
): void {
  const { x, y, width, height } = toPixels(rect)
  ctx.font = font
  ctx.fillStyle = color
  ctx.fillText(label, x + width / 2, y + height / 2)
}

/**
 * Draws the field band: its label above a row of the numbers it pays on.
 *
 * The numbers are what make the field readable as a field rather than another
 * anonymous stripe, and they are the only place a player can check the bet's
 * terms without leaving the table.
 */
function drawField(ctx: CanvasRenderingContext2D): void {
  const rect = getCrapsBetRect(CrapsBet.Field)
  const { x, y, width, height } = toPixels(rect)

  drawBand(ctx, rect, GOLD_SOFT, GOLD_FAINT)

  ctx.font = '700 40px Georgia, "Times New Roman", serif'
  ctx.fillStyle = GOLD
  ctx.fillText(CRAPS_BET_LABELS[CrapsBet.Field], x + width / 2, y + height * 0.3)

  ctx.font = '600 34px Georgia, "Times New Roman", serif'
  ctx.fillStyle = GOLD_SOFT
  const step = width / (FIELD_NUMBERS.length + 1)
  FIELD_NUMBERS.forEach((value, index) => {
    ctx.fillText(String(value), x + step * (index + 1), y + height * 0.68)
  })
}

/** Draws the six point-number boxes across the boxman's end of the felt. */
function drawPointBoxes(ctx: CanvasRenderingContext2D): void {
  ctx.font = '700 52px Georgia, "Times New Roman", serif'

  for (const point of POINT_NUMBERS) {
    const rect = POINT_BOX_RECTS[point]
    drawBand(ctx, rect, GOLD_SOFT, GOLD_FAINT)

    const { x, y, width, height } = toPixels(rect)
    ctx.fillStyle = GOLD
    ctx.fillText(String(point), x + width / 2, y + height / 2)
  }
}

/** Repaints the whole felt, lighting the currently highlighted band. */
function drawFelt(ctx: CanvasRenderingContext2D): void {
  // Pool of lamp light centred on the players' half, matching the blackjack felt.
  const gradient = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT * 0.6,
    40,
    WIDTH / 2,
    HEIGHT * 0.6,
    WIDTH * 0.62,
  )
  gradient.addColorStop(0, FELT_LIT)
  gradient.addColorStop(0.45, FELT_MID)
  gradient.addColorStop(1, FELT_EDGE)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  drawPointBoxes(ctx)
  drawField(ctx)

  drawBand(ctx, getCrapsBetRect(CrapsBet.DontPass), CRIMSON_SOFT, null)
  drawBandLabel(
    ctx,
    getCrapsBetRect(CrapsBet.DontPass),
    CRAPS_BET_LABELS[CrapsBet.DontPass],
    '700 38px Georgia, "Times New Roman", serif',
    CRIMSON,
  )

  drawBand(ctx, getCrapsBetRect(CrapsBet.Odds), GOLD_FAINT, null)
  drawBandLabel(
    ctx,
    getCrapsBetRect(CrapsBet.Odds),
    CRAPS_BET_LABELS[CrapsBet.Odds],
    '600 30px Georgia, "Times New Roman", serif',
    GOLD_SOFT,
  )

  drawBand(ctx, getCrapsBetRect(CrapsBet.PassLine), GOLD, GOLD_FAINT)
  drawBandLabel(
    ctx,
    getCrapsBetRect(CrapsBet.PassLine),
    CRAPS_BET_LABELS[CrapsBet.PassLine],
    '700 68px Georgia, "Times New Roman", serif',
    GOLD,
  )

  if (highlighted) {
    const rect = getCrapsBetRect(highlighted)
    const { x, y, width, height } = toPixels(rect)
    ctx.beginPath()
    ctx.roundRect(x, y, width, height, BOX_CORNER_RADIUS)
    ctx.fillStyle = HIGHLIGHT_FILL
    ctx.fill()
    ctx.strokeStyle = GOLD
    ctx.lineWidth = BAND_LINE_WIDTH * 2
    ctx.stroke()
  }
}

/**
 * Returns the cached craps felt texture, drawing it on first request.
 *
 * @throws Error if a 2D canvas context cannot be acquired.
 */
export function getCrapsFeltTexture(): Texture {
  if (feltTexture) {
    return feltTexture
  }

  canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not acquire a 2D canvas context for the craps felt')
  }

  drawFelt(context)

  feltTexture = new CanvasTexture(canvas)
  feltTexture.colorSpace = SRGBColorSpace
  feltTexture.anisotropy = 8
  return feltTexture
}

/**
 * Lights the given bet region, or clears the highlight when passed `null`.
 *
 * No-ops when the highlight is unchanged, so this is safe to call from a
 * per-frame pointer-move handler without repainting the felt every frame.
 *
 * @param bet The region to light, or `null` to clear.
 */
export function setCrapsFeltHighlight(bet: CrapsBet | null): void {
  if (bet === highlighted) {
    return
  }
  highlighted = bet

  // Nothing to repaint until the texture has been requested at least once.
  if (!context || !feltTexture) {
    return
  }

  drawFelt(context)
  feltTexture.needsUpdate = true
}
