import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import { type Card, Rank, Suit } from './types'

/**
 * Card faces are drawn to a canvas at runtime rather than loaded as images.
 *
 * Fifty-two hand-authored PNGs would be an asset pipeline and a download; a
 * canvas costs nothing, stays crisp at any resolution, and lets the rank and
 * suit come straight from the same enums the engine uses.
 */
const CARD_WIDTH = 512
const CARD_HEIGHT = 716 // Standard 2.5:3.5 poker ratio.
const CORNER_RADIUS = 36

/*
 * Deliberately well below white. A brighter face reads as clean card stock in
 * isolation, but under the table lamp it clips and bloom smears the highlight
 * across the pips until the rank is unreadable.
 */
const FACE_BACKGROUND = '#bcc2d0'
const BLACK_INK = '#0d0f1a'
const RED_INK = '#a8172c'

const BACK_BASE = '#1b1f3d'
const BACK_LATTICE = '#3a4180'
const BACK_BORDER = '#f7f8fb'

const SUIT_GLYPH: Record<Suit, string> = {
  [Suit.Clubs]: '♣', // ♣
  [Suit.Diamonds]: '♦', // ♦
  [Suit.Hearts]: '♥', // ♥
  [Suit.Spades]: '♠', // ♠
}

/** Cache keyed by "RankSuit" so each distinct card is rasterised at most once. */
const faceCache = new Map<string, Texture>()
let backTexture: Texture | null = null

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`
}

function isRedSuit(suit: Suit): boolean {
  return suit === Suit.Hearts || suit === Suit.Diamonds
}

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for card rendering')
  }

  return { canvas, ctx }
}

/** Traces a rounded rectangle path; the caller fills or clips it. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

/** Draws a rank/suit pair in a corner, optionally rotated for the far corner. */
function drawCorner(
  ctx: CanvasRenderingContext2D,
  card: Card,
  ink: string,
  rotated: boolean,
): void {
  ctx.save()

  if (rotated) {
    ctx.translate(CARD_WIDTH, CARD_HEIGHT)
    ctx.rotate(Math.PI)
  }

  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Tens need a narrower face to fit the same column as single-character ranks.
  const rankFontSize = card.rank === Rank.Ten ? 84 : 100
  ctx.font = `700 ${rankFontSize}px Georgia, "Times New Roman", serif`
  ctx.fillText(card.rank, 74, 84)

  ctx.font = '700 76px Georgia, "Times New Roman", serif'
  ctx.fillText(SUIT_GLYPH[card.suit], 74, 176)

  ctx.restore()
}

/** Renders one card face and returns a texture ready to use as a colour map. */
function drawFace(card: Card): Texture {
  const { canvas, ctx } = createCanvas()
  const ink = isRedSuit(card.suit) ? RED_INK : BLACK_INK

  roundedRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS)
  ctx.fillStyle = FACE_BACKGROUND
  ctx.fill()

  drawCorner(ctx, card, ink, false)
  drawCorner(ctx, card, ink, true)

  // Centre emblem: court cards get their letter, pip cards get a large suit.
  ctx.fillStyle = ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const isCourt =
    card.rank === Rank.Jack || card.rank === Rank.Queen || card.rank === Rank.King

  if (isCourt) {
    ctx.font = '700 260px Georgia, "Times New Roman", serif'
    ctx.fillText(card.rank, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10)
    ctx.font = '700 110px Georgia, "Times New Roman", serif'
    ctx.fillText(SUIT_GLYPH[card.suit], CARD_WIDTH / 2, CARD_HEIGHT / 2 + 190)
  } else {
    ctx.font = '700 300px Georgia, "Times New Roman", serif'
    ctx.fillText(SUIT_GLYPH[card.suit], CARD_WIDTH / 2, CARD_HEIGHT / 2)
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Renders the shared card back: a lattice pattern inside a light border. */
function drawBack(): Texture {
  const { canvas, ctx } = createCanvas()

  roundedRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS)
  ctx.fillStyle = BACK_BORDER
  ctx.fill()

  const inset = 22
  roundedRectPath(ctx, inset, inset, CARD_WIDTH - inset * 2, CARD_HEIGHT - inset * 2, 22)
  ctx.fillStyle = BACK_BASE
  ctx.fill()
  ctx.save()
  ctx.clip() // Keep the lattice inside the inner panel.

  ctx.strokeStyle = BACK_LATTICE
  ctx.lineWidth = 7

  // Diagonals in both directions produce a woven diamond pattern.
  for (let offset = -CARD_HEIGHT; offset < CARD_WIDTH + CARD_HEIGHT; offset += 34) {
    ctx.beginPath()
    ctx.moveTo(offset, 0)
    ctx.lineTo(offset + CARD_HEIGHT, CARD_HEIGHT)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(offset, CARD_HEIGHT)
    ctx.lineTo(offset + CARD_HEIGHT, 0)
    ctx.stroke()
  }

  ctx.restore()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Returns the cached face texture for a card, rendering it on first request. */
export function getCardFaceTexture(card: Card): Texture {
  const key = cardKey(card)
  const cached = faceCache.get(key)
  if (cached) return cached

  const texture = drawFace(card)
  faceCache.set(key, texture)
  return texture
}

/** Returns the shared card-back texture. */
export function getCardBackTexture(): Texture {
  backTexture ??= drawBack()
  return backTexture
}
