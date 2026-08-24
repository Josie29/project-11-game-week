import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/**
 * The felt is drawn to a canvas for the same reason the cards are: it puts real
 * table markings — house rules and betting spots — on the surface without
 * shipping a font loader or an image asset.
 *
 * Canvas top is the dealer's edge and canvas bottom is the player's, matching
 * the texture's default flipY so the layout reads the same way it is drawn.
 */
const WIDTH = 1400
const HEIGHT = 640

const FELT_LIT = '#1e8055'
const FELT_MID = '#136448'
const FELT_EDGE = '#093423'
const GOLD = '#f2cd6b'
const GOLD_SOFT = 'rgba(242, 205, 107, 0.62)'

/**
 * Every marking is concentric about a point above the dealer's edge, which is
 * what gives a real table its fanned-out look: the spots and the printed rules
 * all bow away from the dealer along the same set of circles.
 */
const ARC_CENTER_X = WIDTH / 2
const ARC_CENTER_Y = 40

const HEADLINE_RADIUS = 250
const SUBLINE_RADIUS = 306
const DIVIDER_RADIUS = 356
const SPOT_RADIUS = 470

/** Angles, in radians, at which the betting spots sit along their arc. */
const SPOT_ANGLES = [-0.74, -0.37, 0, 0.37, 0.74] as const

const SPOT_RX = 62
const SPOT_RY = 34

let feltTexture: Texture | null = null

/**
 * Draws text bent around a circular arc, centred on the arc's lowest point.
 *
 * Canvas has no arc-text primitive, so each glyph is positioned and rotated
 * individually. Glyphs sit below the centre and are flipped upright, which
 * bows the line away from the dealer the way table print actually runs.
 *
 * @param radius Distance from the arc centre to the text baseline.
 * @param letterSpacing Angular step between glyphs, in radians.
 */
function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  letterSpacing: number,
): void {
  const chars = [...text]
  // Positive angles land left of centre, so start high and step down to read
  // left-to-right. Centred about straight-down from the arc centre.
  let angle = ((chars.length - 1) * letterSpacing) / 2

  for (const char of chars) {
    ctx.save()
    ctx.translate(ARC_CENTER_X, ARC_CENTER_Y)
    ctx.rotate(angle)
    // Below the centre the rotated frame already stands each glyph upright with
    // its top pointing back at the arc centre, so no further flip is needed.
    ctx.translate(0, radius)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    angle -= letterSpacing
  }
}

/** Strokes an arc concentric with the table markings. */
function strokeMarkingArc(
  ctx: CanvasRenderingContext2D,
  radius: number,
  halfSpread: number,
  lineWidth: number,
  style: string,
): void {
  ctx.strokeStyle = style
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  // Canvas angles run from +x; straight-down is PI/2.
  ctx.arc(
    ARC_CENTER_X,
    ARC_CENTER_Y,
    radius,
    Math.PI / 2 - halfSpread,
    Math.PI / 2 + halfSpread,
  )
  ctx.stroke()
}

/** Draws one betting spot: a gold ellipse tilted to follow its arc. */
function drawBettingSpot(ctx: CanvasRenderingContext2D, angle: number): void {
  ctx.save()
  ctx.translate(ARC_CENTER_X, ARC_CENTER_Y)
  ctx.rotate(angle)
  ctx.translate(0, SPOT_RADIUS)

  ctx.strokeStyle = GOLD
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.ellipse(0, 0, SPOT_RX, SPOT_RY, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Faint inner fill so the spot reads as a laid-in patch, not just an outline.
  ctx.fillStyle = 'rgba(242, 205, 107, 0.07)'
  ctx.fill()

  ctx.restore()
}

function drawFelt(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the table felt')
  }

  // Pool of lamp light centred on the players' half of the table.
  const gradient = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT * 0.52,
    30,
    WIDTH / 2,
    HEIGHT * 0.52,
    WIDTH * 0.62,
  )
  gradient.addColorStop(0, FELT_LIT)
  gradient.addColorStop(0.45, FELT_MID)
  gradient.addColorStop(1, FELT_EDGE)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = GOLD
  ctx.font = '700 62px Georgia, "Times New Roman", serif'
  drawArcText(ctx, 'BLACKJACK PAYS 3 TO 2', HEADLINE_RADIUS, 0.116)

  ctx.font = '600 38px Georgia, "Times New Roman", serif'
  ctx.fillStyle = GOLD_SOFT
  drawArcText(ctx, 'INSURANCE PAYS 2 TO 1', SUBLINE_RADIUS, 0.0625)

  // Rule line separating the printed terms from the betting area.
  strokeMarkingArc(ctx, DIVIDER_RADIUS, 0.86, 4, GOLD_SOFT)
  strokeMarkingArc(ctx, DIVIDER_RADIUS - 10, 0.86, 2, 'rgba(242, 205, 107, 0.3)')

  for (const angle of SPOT_ANGLES) {
    drawBettingSpot(ctx, angle)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** Returns the cached felt texture, drawing it on first request. */
export function getFeltTexture(): Texture {
  feltTexture ??= drawFelt()
  return feltTexture
}
