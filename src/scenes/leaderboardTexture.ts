import { CanvasTexture, SRGBColorSpace } from 'three'
import { formatBankroll, truncateName, type LeaderboardEntry } from '../world/leaderboard'
import { drawBulbBorder, drawNeonText } from './signTexture'

/*
 * The HIGH ROLLERS board, drawn to canvas like every other sign — but redrawn.
 *
 * The marquees are draw-once-and-cache because a casino never changes its
 * name; this board exists to change. It follows `crapsFeltTexture`'s shape
 * instead: one module-level canvas, one texture, and a setter that repaints in
 * place and flips `needsUpdate` when the standings actually move. Both end
 * billboards share the single texture — the standings are the standings, and a
 * `.clone()` would double the upload and let the two ends drift.
 */

// 2:1, matching the 8×4 panel in `stripLayout.ts` so glyphs are not stretched.
const WIDTH = 1024
const HEIGHT = 512

/** Margin the bulb border runs in, like the marquee's. */
const FRAME_INSET = 26

const HEADER = 'HIGH ROLLERS'
const HEADER_COLOR = '#ffc63f'
const HEADER_SIZE = 92
const HEADER_Y = 108

/** Rank colours, top to bottom — the Golden Ace's gold, then the scenery neons. */
const ROW_COLORS = ['#ffc63f', '#ff2d95', '#22e0ff'] as const

const ROW_SIZE = 78
const ROW_TOP = 208
const ROW_SPACING = 110
const ROW_INSET = 90
/** Most characters a row's name may carry before the ellipsis. */
const NAME_MAX = 12

let canvas: HTMLCanvasElement | null = null
let context: CanvasRenderingContext2D | null = null
let texture: CanvasTexture | null = null

let rows: readonly LeaderboardEntry[] = []
let drawnSignature: string | null = null

/** What actually lands on the panel; repaint only when this moves. */
function signature(entries: readonly LeaderboardEntry[]): string {
  return entries.map((entry) => `${entry.name}|${entry.bankroll}`).join('~')
}

/**
 * One standing: rank and name from the left, dollars from the right.
 *
 * The same layered stroke-then-fill as `drawNeonText`, but edge-aligned — a
 * centred row turns three different-length names into a ragged column, and the
 * amounts are only comparable at a glance when their digits line up.
 */
function drawRow(
  ctx: CanvasRenderingContext2D,
  rank: number,
  entry: LeaderboardEntry,
  y: number,
  color: string,
): void {
  ctx.font = `700 ${ROW_SIZE}px Georgia, "Times New Roman", serif`
  ctx.textBaseline = 'middle'
  ctx.shadowColor = color
  ctx.strokeStyle = color
  ctx.lineWidth = 6

  const paint = (text: string, x: number, align: CanvasTextAlign) => {
    ctx.textAlign = align
    ctx.shadowBlur = 32
    ctx.strokeText(text, x, y)
    ctx.shadowBlur = 14
    ctx.strokeText(text, x, y)
    ctx.shadowBlur = 8
    ctx.fillStyle = '#fffdf5'
    ctx.fillText(text, x, y)
  }

  paint(`${rank}. ${truncateName(entry.name, NAME_MAX).toUpperCase()}`, ROW_INSET, 'left')
  paint(formatBankroll(entry.bankroll), WIDTH - ROW_INSET, 'right')
  ctx.shadowBlur = 0
}

function draw(ctx: CanvasRenderingContext2D): void {
  // Cabinet, then the darker LED panel the bulbs frame.
  ctx.shadowBlur = 0
  ctx.fillStyle = '#0b0a14'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = '#0d0b18'
  ctx.fillRect(FRAME_INSET, FRAME_INSET, WIDTH - FRAME_INSET * 2, HEIGHT - FRAME_INSET * 2)

  drawBulbBorder(ctx, FRAME_INSET, FRAME_INSET, WIDTH - FRAME_INSET * 2, HEIGHT - FRAME_INSET * 2)

  ctx.font = `700 ${HEADER_SIZE}px Georgia, "Times New Roman", serif`
  drawNeonText(ctx, HEADER, WIDTH / 2, HEADER_Y, HEADER_COLOR)

  // A thin rule under the header, like the marquee's divider between name and
  // slogan; it is what makes an empty board read as a board and not a fault.
  ctx.strokeStyle = HEADER_COLOR
  ctx.lineWidth = 3
  ctx.shadowBlur = 0
  ctx.beginPath()
  ctx.moveTo(ROW_INSET, HEADER_Y + 62)
  ctx.lineTo(WIDTH - ROW_INSET, HEADER_Y + 62)
  ctx.stroke()

  rows.slice(0, ROW_COLORS.length).forEach((entry, index) => {
    drawRow(ctx, index + 1, entry, ROW_TOP + index * ROW_SPACING, ROW_COLORS[index] ?? '#fffdf5')
  })

  drawnSignature = signature(rows)
}

/**
 * Returns the shared board texture, drawing it on first request.
 *
 * @throws Error if a 2D canvas context cannot be acquired.
 */
export function getLeaderboardTexture(): CanvasTexture {
  if (texture) return texture

  canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not acquire a 2D canvas context for the leaderboard')
  }

  draw(context)

  texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * Puts new standings up in lights, repainting only when they moved.
 *
 * Safe to call on every store change: standings that draw the same pixels —
 * same names, same dollars — are recognised by signature and skipped, so a
 * pose update or an equipped jacket never costs a texture upload.
 *
 * @param entries The board's rows, best first, at most three drawn.
 */
export function setLeaderboardRows(entries: readonly LeaderboardEntry[]): void {
  rows = entries
  if (!context || !texture) return
  if (signature(rows) === drawnSignature) return

  draw(context)
  texture.needsUpdate = true
}
