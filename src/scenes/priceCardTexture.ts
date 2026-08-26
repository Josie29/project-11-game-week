import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import type { ShopItem } from '../character/catalog'

/*
 * The little card clipped to each fixture, drawn to canvas.
 *
 * Same trick as the signage, the cards and the felt: no asset pipeline, crisp
 * at any resolution, and the text is guaranteed to be the item's real name and
 * its real price rather than a label written once and left behind when the
 * catalogue moved.
 *
 * It replaces the shop's list. With no panel to read, this is the only thing on
 * screen that says what a fixture is holding and what it costs, so it has to be
 * legible at walking distance — hence the size, the weight and the contrast.
 */

const WIDTH = 512
const HEIGHT = 288

const CARD = '#f4ead6'
const INK = '#2a1424'
const PRICE = '#8c1030'
const OWNED = '#4a6b3a'

const cache = new Map<string, Texture>()

function createContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for a price card')
  }
  return ctx
}

/**
 * Fits a line to the card by shrinking it until it does.
 *
 * "Crimson Satin Gown" overruns at the size "Signet Ring" wants, and a name
 * clipped by the edge of the card is worse than a smaller one.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number): number {
  let size = start

  do {
    ctx.font = `600 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`
    if (ctx.measureText(text).width <= maxWidth) break
    size -= 4
  } while (size > 24)

  return size
}

/**
 * The card for one item.
 *
 * @param item The catalogue entry on the fixture.
 * @param owned Whether the player has already bought it, which replaces the
 *   price with a word — a price on something already paid for reads as a second
 *   charge.
 * @returns A cached texture; the same item and state always returns the same one.
 */
export function getPriceCardTexture(item: ShopItem, owned: boolean): Texture {
  const key = `${item.id}:${owned ? 'owned' : 'for-sale'}`
  const cached = cache.get(key)
  if (cached) return cached

  const ctx = createContext(WIDTH, HEIGHT)

  ctx.fillStyle = CARD
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  // A hairline border, so the card has an edge against a cream case interior.
  ctx.strokeStyle = 'rgba(42, 20, 36, 0.35)'
  ctx.lineWidth = 6
  ctx.strokeRect(10, 10, WIDTH - 20, HEIGHT - 20)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = INK
  const nameSize = fitText(ctx, item.name, WIDTH - 72, 62)
  ctx.font = `600 ${nameSize}px "Helvetica Neue", Helvetica, Arial, sans-serif`
  ctx.fillText(item.name, WIDTH / 2, 104)

  ctx.fillStyle = owned ? OWNED : PRICE
  ctx.font = '700 84px "Helvetica Neue", Helvetica, Arial, sans-serif'
  ctx.fillText(owned ? 'Yours' : `$${item.price.toLocaleString()}`, WIDTH / 2, 196)

  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  cache.set(key, texture)
  return texture
}
