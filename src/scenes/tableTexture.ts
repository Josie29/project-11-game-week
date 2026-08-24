import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/**
 * The felt is drawn to a canvas for the same reason the cards are: it puts real
 * table text ("BLACKJACK PAYS 3 TO 2") on the surface without shipping a font
 * loader or an image asset.
 */
const SIZE = 1024

const FELT_CENTER = '#125c3e'
const FELT_INNER = '#166f4a'
const FELT_OUTER = '#0a3d29'
const GOLD = '#e8c069'
const GOLD_FAINT = 'rgba(232, 192, 105, 0.45)'

let feltTexture: Texture | null = null

/**
 * Draws text bent around a circular arc, centred on `centreAngle`.
 *
 * Canvas has no arc-text primitive, so each glyph is placed and rotated
 * individually around the circle.
 *
 * @param radius Distance from the canvas centre to the text baseline.
 * @param centreAngle Angle the middle of the string should sit at, in radians.
 * @param flip True to draw the glyphs facing inward, for text below the centre.
 */
function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  centreAngle: number,
  letterSpacing: number,
  flip: boolean,
): void {
  const chars = [...text]
  const totalAngle = chars.length * letterSpacing
  let angle = centreAngle - totalAngle / 2 + letterSpacing / 2

  for (const char of chars) {
    ctx.save()
    ctx.translate(SIZE / 2, SIZE / 2)
    ctx.rotate(angle)
    ctx.translate(0, flip ? radius : -radius)
    if (flip) ctx.rotate(Math.PI)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    angle += letterSpacing
  }
}

function drawFelt(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the table felt')
  }

  // Radial gradient so the table reads as lit from the overhead lamp.
  const gradient = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 40, SIZE / 2, SIZE / 2, SIZE / 2)
  gradient.addColorStop(0, FELT_INNER)
  gradient.addColorStop(0.55, FELT_CENTER)
  gradient.addColorStop(1, FELT_OUTER)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Twin gold rings near the rim.
  ctx.strokeStyle = GOLD_FAINT
  ctx.lineWidth = 5
  for (const radius of [SIZE * 0.46, SIZE * 0.43]) {
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // House rules, curved along the dealer side of the table.
  ctx.fillStyle = GOLD
  ctx.font = '700 46px Georgia, "Times New Roman", serif'
  drawArcText(ctx, 'BLACKJACK PAYS 3 TO 2', SIZE * 0.34, 0, 0.098, false)

  ctx.font = '600 30px Georgia, "Times New Roman", serif'
  ctx.fillStyle = GOLD_FAINT
  drawArcText(ctx, 'DEALER MUST STAND ON ALL 17s', SIZE * 0.25, 0, 0.088, false)

  // Betting circle on the player side.
  ctx.strokeStyle = GOLD_FAINT
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE * 0.68, SIZE * 0.085, 0, Math.PI * 2)
  ctx.stroke()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Returns the cached felt texture, drawing it on first request. */
export function getFeltTexture(): Texture {
  feltTexture ??= drawFelt()
  return feltTexture
}
