import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { type ArcCenter, drawArcText, strokeMarkingArc } from './arcText'

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

const FELT_LIT = '#1a7a4f'
const FELT_MID = '#0f5b41'
const FELT_EDGE = '#062a1c'
const GOLD = '#f2cd6b'
const GOLD_SOFT = 'rgba(242, 205, 107, 0.62)'

/**
 * Every marking is concentric about a point above the dealer's edge, which is
 * what gives a real table its fanned-out look: the spots and the printed rules
 * all bow away from the dealer along the same set of circles.
 */
/*
 * The centre sits far above the canvas on purpose. A nearby centre gives a
 * tight arc that swings the ends of each line hundreds of pixels upward; real
 * table print is only gently bowed, which needs a large radius.
 */
const ARC_CENTER: ArcCenter = { x: WIDTH / 2, y: -900 }

const HEADLINE_RADIUS = 1200
const SUBLINE_RADIUS = 1265
const DIVIDER_RADIUS = 1320
const SPOT_RADIUS = 1450

/**
 * Angular step between glyphs, in radians.
 *
 * Must exceed glyph width / radius or the letters overlap and the line becomes
 * unreadable — at these radii that is roughly 35px and 28px of arc per glyph.
 */
const HEADLINE_SPACING = 0.029
const SUBLINE_SPACING = 0.0221

/** Angles, in radians, at which the betting spots sit along their arc. */
const SPOT_ANGLES = [-0.276, -0.138, 0, 0.138, 0.276] as const

const SPOT_RX = 58
const SPOT_RY = 30

let feltTexture: Texture | null = null

/*
 * Arc text and arc rules live in `./arcText` now, because the craps felt bows
 * its PASS LINE the same way. The constants passed below are the ones this
 * felt has always used, so what it draws is unchanged.
 */

/** Draws one betting spot: a gold ellipse tilted to follow its arc. */
function drawBettingSpot(ctx: CanvasRenderingContext2D, angle: number): void {
  ctx.save()
  ctx.translate(ARC_CENTER.x, ARC_CENTER.y)
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
    HEIGHT * 0.55,
    30,
    WIDTH / 2,
    HEIGHT * 0.55,
    WIDTH * 0.38,
  )
  gradient.addColorStop(0, FELT_LIT)
  gradient.addColorStop(0.45, FELT_MID)
  gradient.addColorStop(1, FELT_EDGE)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = GOLD
  ctx.font = '700 46px Georgia, "Times New Roman", serif'
  drawArcText(ctx, 'BLACKJACK PAYS 3 TO 2', ARC_CENTER, HEADLINE_RADIUS, HEADLINE_SPACING)

  ctx.font = '600 30px Georgia, "Times New Roman", serif'
  ctx.fillStyle = GOLD_SOFT
  drawArcText(ctx, 'INSURANCE PAYS 2 TO 1', ARC_CENTER, SUBLINE_RADIUS, SUBLINE_SPACING)

  // Rule line separating the printed terms from the betting area.
  strokeMarkingArc(ctx, ARC_CENTER, DIVIDER_RADIUS, 0.3, 4, GOLD_SOFT)
  strokeMarkingArc(ctx, ARC_CENTER, DIVIDER_RADIUS - 9, 0.3, 2, 'rgba(242, 205, 107, 0.3)')

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
