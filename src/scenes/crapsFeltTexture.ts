import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { placeRatio, fieldMultiplier } from '../games/craps/engine'
import { type ArcCenter, drawArcText, fillMarkingBand, strokeMarkingArc } from './arcText'
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
 * Matched to `art/refs/craps_table.png`. The first version drew every region as
 * an identical rounded rectangle stacked down the felt, which read as a web form
 * laid on grass: nothing about it said craps. A real layout is white rule work
 * with gold print, place boxes ruled like a grid, and a PASS LINE bowed round
 * the shooter's end of the table — so that is what this draws now.
 *
 * The canvas is retained after the first draw so a hover can repaint one band
 * in place. Repainting the whole felt costs a few hundred microseconds and
 * avoids a second texture plus a shader branch to composite it.
 */

/*
 * Sized to the pit's 4.5 x 1.8 aspect. A texture drawn squarer than the surface
 * it lands on stretches, and stretched print is the one flaw on a felt that
 * cannot be blamed on the lighting — which is why this is re-cut whenever the
 * table's proportions change rather than left to `repeat` to paper over.
 */
const WIDTH = 2400
const HEIGHT = 960

const FELT_LIT = '#1f7d54'
const FELT_MID = '#136045'
const FELT_EDGE = '#062a1e'

const GOLD = '#f5cf6e'
const GOLD_SOFT = 'rgba(245, 207, 110, 0.68)'
const GOLD_FAINT = 'rgba(245, 207, 110, 0.16)'
/*
 * Faint. The felt is lit by a pendant and then bloomed, so a fill that looks
 * like a gentle tint on the canvas arrives on screen as a slab of light with
 * the print washed out of it — and the print is what the player is hovering to
 * read. An outline carries "this one" on its own.
 */
const HIGHLIGHT_FILL = 'rgba(245, 207, 110, 0.16)'

/** Rule work on a real layout is white; the print inside it is gold or red. */
const RULE = 'rgba(238, 244, 240, 0.9)'
const RULE_SOFT = 'rgba(238, 244, 240, 0.45)'

/** Don't-pass markings print red on a real layout; keeping that reads as craps. */
const CRIMSON = '#e04b62'
const CRIMSON_SOFT = 'rgba(224, 75, 98, 0.6)'

const RULE_WIDTH = 4
const HEAVY_RULE_WIDTH = 6

const SERIF = 'Georgia, "Times New Roman", serif'

/**
 * The arc every marking on the shooter's end is concentric about.
 *
 * Far below the canvas, so the PASS LINE bows gently round the near edge the
 * way it does in the reference rather than curling into a horseshoe. Same
 * reasoning as the blackjack felt's centre, mirrored: this felt's near edge is
 * the bottom, so the centre sits above it and the print hangs below.
 */
const ARC_CENTER: ArcCenter = { x: WIDTH / 2, y: -7000 }

/*
 * Radii are set from the band rects they stand in for: at the centre of the
 * felt a radius lands at `ARC_CENTER.y + radius` pixels down the canvas, so the
 * pass line's band runs from v 0.855 to v 0.985 and free odds from 0.745 to
 * 0.825.
 *
 * The centre sits much further above the canvas than the blackjack felt's. Two
 * and a half to one leaves each band about a hundred pixels deep, and toward
 * the ends an arc climbs by `radius * (1 - cos(spread))` — at a tighter radius
 * that rise is more than a band is tall, and the pass line's ends bow up
 * through the free odds. A long radius keeps the bow to something the band can
 * absorb while still reading as bowed.
 */
const PASS_OUTER_RADIUS = 7806
const PASS_INNER_RADIUS = 7672
const PASS_TEXT_RADIUS = 7739
const PASS_SPREAD = 0.1372
/** Angular step between PASS LINE glyphs. Below glyph width / radius they touch. */
const PASS_SPACING = 0.0213

const ODDS_OUTER_RADIUS = 7648
const ODDS_INNER_RADIUS = 7581
const ODDS_TEXT_RADIUS = 7614
const ODDS_SPREAD = 0.14
const ODDS_SPACING = 0.0158

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

/**
 * Draws a small diamond, the layout's own bullet point.
 *
 * They mark the ends of the field and the corners of the pass line on every
 * real table, and they are most of what makes a bare band read as printed
 * rather than drawn.
 */
function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  style: string,
): void {
  ctx.strokeStyle = style
  ctx.lineWidth = RULE_WIDTH
  ctx.beginPath()
  ctx.moveTo(x, y - size)
  ctx.lineTo(x + size * 0.68, y)
  ctx.lineTo(x, y + size)
  ctx.lineTo(x - size * 0.68, y)
  ctx.closePath()
  ctx.stroke()
}

/** Strokes a sharp-cornered region, optionally filling it first. */
function drawRuledBox(
  ctx: CanvasRenderingContext2D,
  rect: FeltRect,
  stroke: string,
  fill: string | null,
  lineWidth = RULE_WIDTH,
): void {
  const { x, y, width, height } = toPixels(rect)

  if (fill) {
    ctx.fillStyle = fill
    ctx.fillRect(x, y, width, height)
  }

  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.strokeRect(x, y, width, height)
}

/**
 * Lays a fine weave over the whole felt.
 *
 * A flat gradient reads as painted card, and at the angle the play camera holds
 * it fills half the screen. The weave is a fixed lattice rather than noise so a
 * regression capture is byte-comparable with the one before it.
 */
function drawWeave(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.globalAlpha = 0.05

  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x < WIDTH; x += 4) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, HEIGHT)
  }
  ctx.stroke()

  ctx.strokeStyle = '#ffffff'
  ctx.globalAlpha = 0.03
  ctx.beginPath()
  for (let y = 0; y < HEIGHT; y += 4) {
    ctx.moveTo(0, y)
    ctx.lineTo(WIDTH, y)
  }
  ctx.stroke()

  ctx.restore()
}

/**
 * Draws the six numbered boxes across the boxman's end, ruled as one grid.
 *
 * These are the place bets, so each box has to state its own terms: what it
 * pays and what it is taken in. Both are read off the engine rather than typed
 * here — the six and eight pay sevenths and are taken in sixes, everything else
 * pays fifths and is taken in fives, and a felt that printed those the other
 * way round would be advertising a bet the table does not offer.
 *
 * The unit each number is taken in is not printed — it is on the buttons, and
 * at this size on the felt it was a smudge rather than a fact.
 */
function drawPlaceBoxes(ctx: CanvasRenderingContext2D): void {
  for (const point of POINT_NUMBERS) {
    const rect = POINT_BOX_RECTS[point]
    const { x, y, width, height } = toPixels(rect)

    drawRuledBox(ctx, rect, RULE, 'rgba(4, 32, 22, 0.32)', HEAVY_RULE_WIDTH)

    /*
     * Number and odds side by side across the top, chips and puck below them.
     *
     * Stacked — number over odds over chips — nothing fits: a box on this table
     * is about 0.6 wide and 0.45 deep, and a chip stack is 0.3 across, so it
     * covers two thirds of the box's depth on its own. Centred, it hid the
     * number; moved up, it hid the odds. Across the top there is width to spare
     * and the stack sits under both.
     */
    ctx.fillStyle = GOLD
    ctx.font = `700 80px ${SERIF}`
    ctx.fillText(String(point), x + width * 0.3, y + height * 0.3)

    const { numerator, denominator } = placeRatio(point)
    ctx.fillStyle = RULE
    ctx.font = `600 27px ${SERIF}`
    ctx.fillText(`PAYS ${numerator}`, x + width * 0.69, y + height * 0.22)
    ctx.fillText(`TO ${denominator}`, x + width * 0.69, y + height * 0.4)
  }
}

/**
 * Draws the field band: its label between two diamonds, above the numbers it
 * pays on, with the two that pay more than even circled.
 *
 * Ringing 2 and 12 is not decoration — they are the only numbers in the band
 * that pay differently, and a field printed without that distinction is a felt
 * that misstates its own terms. Which of them is which comes from the engine:
 * the two pays double and the twelve triple, and the line underneath says so
 * rather than leaving a player to guess that a ring means one thing.
 */
function drawField(ctx: CanvasRenderingContext2D): void {
  const rect = getCrapsBetRect(CrapsBet.Field)
  const { x, y, width, height } = toPixels(rect)

  drawRuledBox(ctx, rect, GOLD_SOFT, GOLD_FAINT, HEAVY_RULE_WIDTH)

  const labelY = y + height * 0.28
  ctx.font = `700 46px ${SERIF}`
  ctx.fillStyle = GOLD
  ctx.fillText(CRAPS_BET_LABELS[CrapsBet.Field], x + width / 2, labelY)

  drawDiamond(ctx, x + width * 0.34, labelY, 20, GOLD_SOFT)
  drawDiamond(ctx, x + width * 0.66, labelY, 20, GOLD_SOFT)

  const step = width / (FIELD_NUMBERS.length + 1)
  const numberY = y + height * 0.68

  const bonuses: string[] = []

  FIELD_NUMBERS.forEach((value, index) => {
    const at = x + step * (index + 1)
    const multiplier = fieldMultiplier(value)
    const bonus = multiplier > 1

    if (bonus) {
      bonuses.push(`${value} PAYS ${multiplier} TO 1`)
      ctx.strokeStyle = GOLD
      ctx.lineWidth = RULE_WIDTH
      ctx.beginPath()
      ctx.arc(at, numberY, 30, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.font = `600 38px ${SERIF}`
    ctx.fillStyle = bonus ? GOLD : GOLD_SOFT
    ctx.fillText(String(value), at, numberY)
  })

  ctx.font = `600 22px ${SERIF}`
  ctx.fillStyle = RULE_SOFT
  ctx.fillText(bonuses.join('   ·   '), x + width / 2, y + height * 0.92)
}

/**
 * Draws the don't-pass bar: red rule work, and the barred number that names it.
 *
 * "BAR 12" is the whole point of the bet's printed name — a twelve on the come
 * out pushes rather than winning — so the felt says so in the same place a real
 * one does.
 */
function drawDontPass(ctx: CanvasRenderingContext2D): void {
  const rect = getCrapsBetRect(CrapsBet.DontPass)
  const { x, y, width, height } = toPixels(rect)

  drawRuledBox(ctx, rect, CRIMSON_SOFT, 'rgba(64, 12, 24, 0.22)', RULE_WIDTH)

  const middle = y + height / 2
  ctx.font = `700 40px ${SERIF}`
  ctx.fillStyle = CRIMSON
  ctx.fillText(CRAPS_BET_LABELS[CrapsBet.DontPass], x + width * 0.44, middle)

  // The barred twelve, boxed and struck through, set after the label.
  const boxX = x + width * 0.72
  const boxWidth = 96
  const boxHeight = height * 0.56

  ctx.strokeStyle = CRIMSON_SOFT
  ctx.lineWidth = RULE_WIDTH
  ctx.strokeRect(boxX, middle - boxHeight / 2, boxWidth, boxHeight)

  ctx.fillStyle = CRIMSON
  ctx.font = `700 38px ${SERIF}`
  ctx.fillText('12', boxX + boxWidth / 2, middle)

  ctx.beginPath()
  ctx.moveTo(boxX + 8, middle)
  ctx.lineTo(boxX + boxWidth - 8, middle)
  ctx.stroke()

  drawDiamond(ctx, x + width * 0.06, middle, 16, CRIMSON_SOFT)
  drawDiamond(ctx, x + width * 0.94, middle, 16, CRIMSON_SOFT)
}

/**
 * Draws the two bowed bands at the shooter's end: free odds, then the pass line.
 *
 * These are the felt's signature. Everything else on a craps layout is ruled
 * square; the pass line sweeps round the players' edge, and drawing it as one
 * more horizontal stripe was the single biggest thing separating this table from
 * the reference.
 */
function drawPassLine(ctx: CanvasRenderingContext2D): void {
  fillMarkingBand(
    ctx,
    ARC_CENTER,
    ODDS_INNER_RADIUS,
    ODDS_OUTER_RADIUS,
    ODDS_SPREAD,
    'rgba(245, 207, 110, 0.06)',
  )
  strokeMarkingArc(ctx, ARC_CENTER, ODDS_OUTER_RADIUS, ODDS_SPREAD, RULE_WIDTH, GOLD_SOFT)
  strokeMarkingArc(ctx, ARC_CENTER, ODDS_INNER_RADIUS, ODDS_SPREAD, RULE_WIDTH, GOLD_SOFT)

  ctx.font = `600 34px ${SERIF}`
  ctx.fillStyle = GOLD_SOFT
  drawArcText(ctx, CRAPS_BET_LABELS[CrapsBet.Odds], ARC_CENTER, ODDS_TEXT_RADIUS, ODDS_SPACING)

  fillMarkingBand(
    ctx,
    ARC_CENTER,
    PASS_INNER_RADIUS,
    PASS_OUTER_RADIUS,
    PASS_SPREAD,
    'rgba(245, 207, 110, 0.09)',
  )
  strokeMarkingArc(ctx, ARC_CENTER, PASS_OUTER_RADIUS, PASS_SPREAD, HEAVY_RULE_WIDTH + 2, GOLD)
  strokeMarkingArc(ctx, ARC_CENTER, PASS_INNER_RADIUS, PASS_SPREAD, HEAVY_RULE_WIDTH + 2, GOLD)

  ctx.font = `700 96px ${SERIF}`
  ctx.fillStyle = GOLD
  drawArcText(ctx, CRAPS_BET_LABELS[CrapsBet.PassLine], ARC_CENTER, PASS_TEXT_RADIUS, PASS_SPACING)
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

  drawWeave(ctx)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  drawPlaceBoxes(ctx)
  drawField(ctx)
  drawDontPass(ctx)
  drawPassLine(ctx)

  if (highlighted) {
    const rect = getCrapsBetRect(highlighted)
    const { x, y, width, height } = toPixels(rect)
    ctx.fillStyle = HIGHLIGHT_FILL
    ctx.fillRect(x, y, width, height)
    // The outline does the work, not the fill: a bright edge says "this one"
    // without putting light over the print the player is hovering to read.
    ctx.strokeStyle = GOLD
    ctx.lineWidth = HEAVY_RULE_WIDTH + 4
    ctx.strokeRect(x, y, width, height)
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
  feltTexture.anisotropy = 16
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
