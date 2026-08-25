/**
 * Text and rules bent around a circle, for felt markings.
 *
 * Real table print is laid out on concentric arcs about a point past the
 * dealer's edge — that fanned-out bow is most of what makes a felt read as a
 * felt rather than a form. Canvas has no arc-text primitive, so each glyph is
 * placed and rotated on its own.
 *
 * Extracted from `tableTexture.ts` when the craps felt needed the same treatment
 * for its PASS LINE. The blackjack felt passes exactly the constants it always
 * used, so its output is unchanged.
 */

/** The point every arc on a felt is concentric about, in canvas pixels. */
export interface ArcCenter {
  readonly x: number
  readonly y: number
}

/**
 * Draws text bent around a circular arc, centred on the arc's lowest point.
 *
 * Glyphs sit below the centre, where the rotated frame already stands each one
 * upright with its top pointing back at the centre — so the line bows away from
 * the dealer the way table print actually runs, with no further flip.
 *
 * Uses the context's current `font` and `fillStyle`, and assumes `textAlign` is
 * `center` and `textBaseline` is `middle`.
 *
 * @param center The point the arc is concentric about. Well above the canvas
 *   for a gentle bow; a nearby centre gives a tight arc that swings the ends of
 *   the line hundreds of pixels upward.
 * @param radius Distance from the centre to the text baseline.
 * @param letterSpacing Angular step between glyphs, in radians. Must exceed
 *   glyph width / radius or the letters overlap and the line stops being
 *   readable.
 */
export function drawArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  center: ArcCenter,
  radius: number,
  letterSpacing: number,
): void {
  const chars = [...text]
  // Positive angles land left of centre, so start high and step down to read
  // left-to-right. Centred about straight-down from the arc centre.
  let angle = ((chars.length - 1) * letterSpacing) / 2

  for (const char of chars) {
    ctx.save()
    ctx.translate(center.x, center.y)
    ctx.rotate(angle)
    ctx.translate(0, radius)
    ctx.fillText(char, 0, 0)
    ctx.restore()
    angle -= letterSpacing
  }
}

/**
 * Strokes an arc concentric with a felt's markings.
 *
 * @param halfSpread How far either side of straight-down the arc runs, in
 *   radians.
 */
export function strokeMarkingArc(
  ctx: CanvasRenderingContext2D,
  center: ArcCenter,
  radius: number,
  halfSpread: number,
  lineWidth: number,
  style: string,
): void {
  ctx.strokeStyle = style
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  // Canvas angles run from +x; straight-down is PI/2.
  ctx.arc(center.x, center.y, radius, Math.PI / 2 - halfSpread, Math.PI / 2 + halfSpread)
  ctx.stroke()
}

/**
 * Fills the ring between two concentric arcs — a bowed band.
 *
 * The outbound edge is traced along the outer radius and the return along the
 * inner, which closes the shape without a join artefact at either end.
 */
export function fillMarkingBand(
  ctx: CanvasRenderingContext2D,
  center: ArcCenter,
  innerRadius: number,
  outerRadius: number,
  halfSpread: number,
  style: string,
): void {
  ctx.fillStyle = style
  ctx.beginPath()
  ctx.arc(center.x, center.y, outerRadius, Math.PI / 2 - halfSpread, Math.PI / 2 + halfSpread)
  ctx.arc(center.x, center.y, innerRadius, Math.PI / 2 + halfSpread, Math.PI / 2 - halfSpread, true)
  ctx.closePath()
  ctx.fill()
}
