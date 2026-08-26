import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'

/*
 * Every surface in the donation room that needs detail below the level of a
 * mesh, drawn to canvas at runtime like the felt, the cards and the facades.
 *
 * The room is the closest the player ever stands to a wall in this game — the
 * chair camera sits 2.7 m from the recliner and looks at an arm — so flat
 * colours that survive at casino distances do not survive here. What that buys
 * over a shipped image is the usual: no asset pipeline, crisp at any resolution,
 * and a palette that can be read straight off `art/refs/clinic_interior.png`.
 *
 * Nothing in here uses `Math.random`. A texture that differs between page loads
 * makes every capture of this room a different picture, which is the same reason
 * `?freeze` exists.
 */

/** The neutral byte for a normal map: exactly flat, pointing straight out. */
const NORMAL_NEUTRAL = 128
/**
 * Range either side of neutral.
 *
 * 127 rather than 128 so that a flat height field encodes to *exactly*
 * `NORMAL_NEUTRAL` with no rounding. A normal map whose flat regions sit a byte
 * off neutral tilts the entire surface a fraction of a degree, which reads as a
 * faint overall sheen that no amount of material tweaking removes.
 */
const NORMAL_RANGE = 127

/**
 * Converts a height field into a tangent-space normal map.
 *
 * Pure, and separated from the canvas for it: the test environment is `node`,
 * and this is the one piece of arithmetic here that can fail silently. A
 * conversion that returns flat normals everywhere leaves the room looking
 * exactly as untextured as it does today while every other assertion passes.
 *
 * Sampling wraps at the edges, because everything this is used on tiles.
 *
 * @param height Per-pixel heights in 0..1, row-major, `width * depth` long.
 * @param width Row length in pixels.
 * @param depth Number of rows.
 * @param strength How far the slopes tilt. 0 gives a flat map.
 * @returns RGBA bytes, `width * depth * 4` long, ready for an `ImageData`.
 * @throws RangeError If `height` is not exactly `width * depth` long.
 */
export function heightToNormal(
  height: readonly number[],
  width: number,
  depth: number,
  strength: number,
): Uint8ClampedArray<ArrayBuffer> {
  if (height.length !== width * depth) {
    throw new RangeError(
      `height field is ${height.length} long, expected ${width * depth} (${width}x${depth})`,
    )
  }

  // Backed by an explicit `ArrayBuffer` rather than sized directly: the default
  // widens to `ArrayBufferLike`, which `ImageData` will not accept.
  const out = new Uint8ClampedArray(new ArrayBuffer(width * depth * 4))

  // Modulo rather than clamping, so a tiling texture's slopes meet at the seam.
  const at = (x: number, y: number): number =>
    height[((y + depth) % depth) * width + ((x + width) % width)] ?? 0

  for (let y = 0; y < depth; y++) {
    for (let x = 0; x < width; x++) {
      // Central differences: the slope across this pixel in each direction.
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength

      // The surface normal is perpendicular to both slopes, hence the negation.
      const length = Math.hypot(dx, dy, 1)
      const index = (y * width + x) * 4

      out[index] = Math.round((-dx / length) * NORMAL_RANGE + NORMAL_NEUTRAL)
      out[index + 1] = Math.round((-dy / length) * NORMAL_RANGE + NORMAL_NEUTRAL)
      out[index + 2] = Math.round((1 / length) * NORMAL_RANGE + NORMAL_NEUTRAL)
      out[index + 3] = 255
    }
  }

  return out
}

/**
 * A small deterministic generator, so the stipple is the same every load.
 *
 * mulberry32. Seeded per texture rather than shared, so adding a texture cannot
 * shift the noise in one already drawn.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D canvas context for a clinic texture')

  return ctx
}

function finish(ctx: CanvasRenderingContext2D, repeat?: readonly [number, number]): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8

  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }

  return texture
}

/**
 * Wraps a height field as a normal-map texture.
 *
 * Linear rather than sRGB: a normal map holds directions, and putting it through
 * the sRGB transfer curve bends every one of them.
 */
function normalTexture(
  height: readonly number[],
  width: number,
  depth: number,
  strength: number,
  repeat?: readonly [number, number],
): Texture {
  const ctx = context(width, depth)
  ctx.putImageData(new ImageData(heightToNormal(height, width, depth, strength), width, depth), 0, 0)

  const texture = new CanvasTexture(ctx.canvas)
  texture.anisotropy = 4

  if (repeat) {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }

  return texture
}

/*
 * Two tiles by two, rather than one repeated.
 *
 * A single tile repeated twenty times across a ceiling is visibly one tile
 * repeated twenty times: the eye finds the period immediately. Four distinct
 * tiles in the block quarters the frequency for the same texture memory.
 */
const TILE_PX = 256
const BLOCK_PX = TILE_PX * 2

/** The metal runner the tiles sit in, drawn on the tile edges. */
const RUNNER = '#aeb7bb'
const TILE_FACE = '#dde3e5'
const TILE_FISSURE = 'rgba(150, 162, 168, 0.55)'

/** Acoustic ceiling tile on its grid, as a repeating two-by-two block. */
function drawCeiling(): Texture {
  const ctx = context(BLOCK_PX, BLOCK_PX)
  const random = seeded(0x51c1)

  ctx.fillStyle = TILE_FACE
  ctx.fillRect(0, 0, BLOCK_PX, BLOCK_PX)

  for (let tile = 0; tile < 4; tile++) {
    // Floor division and modulo to walk the 2x2 block: column, then row.
    const originX = (tile % 2) * TILE_PX
    const originY = Math.floor(tile / 2) * TILE_PX

    ctx.save()
    ctx.beginPath()
    ctx.rect(originX, originY, TILE_PX, TILE_PX)
    ctx.clip()

    // Each tile sits a shade off its neighbours, as a real ceiling does.
    ctx.fillStyle = `rgba(${168 + tile * 3}, ${178 + tile * 3}, ${184 + tile * 3}, 0.09)`
    ctx.fillRect(originX, originY, TILE_PX, TILE_PX)

    /*
     * Fissures: short wandering scratches, which is what mineral fibre reads as.
     *
     * Kept faint and short. At full strength they are individually legible from
     * the floor, and a ceiling with legible marks on it reads as dirty or as
     * cracked rather than as textured — the first pass looked like hairs had
     * been dropped on it.
     */
    ctx.strokeStyle = TILE_FISSURE
    ctx.lineCap = 'round'
    for (let i = 0; i < 55; i++) {
      const x = originX + random() * TILE_PX
      const y = originY + random() * TILE_PX
      const angle = random() * Math.PI * 2
      const length = 4 + random() * 14

      ctx.lineWidth = 0.6 + random() * 0.9
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * length * 0.6,
        y + Math.sin(angle) * length * 0.6 + (random() - 0.5) * 8,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      )
      ctx.stroke()
    }

    // Pinholes.
    ctx.fillStyle = 'rgba(140, 152, 158, 0.22)'
    for (let i = 0; i < 220; i++) {
      ctx.beginPath()
      ctx.arc(originX + random() * TILE_PX, originY + random() * TILE_PX, 0.9, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  /*
   * The T-bar grid, on the tile edges. Drawn last so nothing stipples over it.
   *
   * The runner is *darker* than the tile it holds, and that is the whole look: a
   * suspended ceiling is a field of pale tile divided by shadow lines. Drawn the
   * other way — a bright metal line on a pale field — the grid becomes the
   * brightest thing on the ceiling and the room reads as a lit lattice. The
   * first pass had a half-opacity white highlight down each runner for exactly
   * that "reads as metal" reason and it put a glowing grid over the entire room.
   */
  ctx.strokeStyle = RUNNER
  ctx.lineWidth = 4
  ctx.strokeRect(0, 0, BLOCK_PX, BLOCK_PX)
  ctx.beginPath()
  ctx.moveTo(TILE_PX, 0)
  ctx.lineTo(TILE_PX, BLOCK_PX)
  ctx.moveTo(0, TILE_PX)
  ctx.lineTo(BLOCK_PX, TILE_PX)
  ctx.stroke()

  // Just enough of a catch along one edge to say the runner has a face, well
  // under the tile's own value so it never becomes the brightest thing up there.
  ctx.strokeStyle = 'rgba(232, 238, 240, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(TILE_PX - 2.5, 0)
  ctx.lineTo(TILE_PX - 2.5, BLOCK_PX)
  ctx.moveTo(0, TILE_PX - 2.5)
  ctx.lineTo(BLOCK_PX, TILE_PX - 2.5)
  ctx.stroke()

  return finish(ctx)
}

const FLOOR_BASE = '#b7ccaa'
const GROUT = '#93a88b'

/** Pale green tile with grout, the floor straight off the reference. */
function drawFloor(): Texture {
  const ctx = context(BLOCK_PX, BLOCK_PX)
  const random = seeded(0xf100)

  ctx.fillStyle = GROUT
  ctx.fillRect(0, 0, BLOCK_PX, BLOCK_PX)

  const grout = 5

  for (let tile = 0; tile < 4; tile++) {
    const originX = (tile % 2) * TILE_PX
    const originY = Math.floor(tile / 2) * TILE_PX

    ctx.save()
    ctx.beginPath()
    ctx.rect(originX + grout, originY + grout, TILE_PX - grout * 2, TILE_PX - grout * 2)
    ctx.clip()

    ctx.fillStyle = FLOOR_BASE
    ctx.fillRect(originX, originY, TILE_PX, TILE_PX)

    // Vinyl-composition mottling: pale flecks through the body of the tile.
    for (let i = 0; i < 900; i++) {
      const shade = random()
      ctx.fillStyle =
        shade > 0.55
          ? `rgba(226, 236, 216, ${0.1 + random() * 0.22})`
          : `rgba(126, 146, 116, ${0.08 + random() * 0.18})`

      ctx.beginPath()
      ctx.ellipse(
        originX + random() * TILE_PX,
        originY + random() * TILE_PX,
        1 + random() * 3.4,
        1 + random() * 2.2,
        random() * Math.PI,
        0,
        Math.PI * 2,
      )
      ctx.fill()
    }

    /*
     * A soft sheen toward one corner of each tile.
     *
     * The reference's floor is polished and catches the ceiling; without this
     * the tiles read as matt lino and the room loses the one bright surface it
     * has. Different corner per tile so it does not become a visible period.
     */
    const sheenX = originX + (tile % 2 === 0 ? TILE_PX * 0.3 : TILE_PX * 0.72)
    const sheenY = originY + (tile < 2 ? TILE_PX * 0.34 : TILE_PX * 0.68)
    const sheen = ctx.createRadialGradient(sheenX, sheenY, 4, sheenX, sheenY, TILE_PX * 0.62)
    sheen.addColorStop(0, 'rgba(246, 252, 240, 0.3)')
    sheen.addColorStop(1, 'rgba(246, 252, 240, 0)')
    ctx.fillStyle = sheen
    ctx.fillRect(originX, originY, TILE_PX, TILE_PX)

    ctx.restore()
  }

  return finish(ctx)
}

/** Height field for the floor: the grout channels sit below the tile faces. */
function floorHeights(): number[] {
  const size = 128
  const heights = new Array<number>(size * size)
  const grout = 3
  const half = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Position within this tile, so both tiles in the block get a channel.
      const withinX = x % half
      const withinY = y % half
      const inGrout =
        withinX < grout || withinX >= half - grout || withinY < grout || withinY >= half - grout

      heights[y * size + x] = inGrout ? 0 : 1
    }
  }

  return heights
}

/** Height field for the ceiling: the runners stand proud of the tile faces. */
function ceilingHeights(): number[] {
  const size = 128
  const heights = new Array<number>(size * size)
  const runner = 3
  const half = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const withinX = x % half
      const withinY = y % half
      const onRunner =
        withinX < runner || withinX >= half - runner || withinY < runner || withinY >= half - runner

      heights[y * size + x] = onRunner ? 1 : 0.35
    }
  }

  return heights
}

/**
 * Height field for upholstery vinyl.
 *
 * Two crossed sine waves rather than noise: vinyl is embossed with a regular
 * pattern, and noise reads as dirt.
 */
function vinylHeights(): number[] {
  const size = 128
  const heights = new Array<number>(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Eight cycles across the tile, which lands at roughly 4 mm on a cushion.
      const grain =
        Math.sin((x / size) * Math.PI * 16) * Math.sin((y / size) * Math.PI * 16) * 0.5 + 0.5
      heights[y * size + x] = grain
    }
  }

  return heights
}

const VENDING_W = 512
const VENDING_H = 820

/**
 * Assorted product, read off the reference's shelves.
 *
 * Pulled back from full saturation. At full strength, six columns of pure hue in
 * neat rows read as a colour chart rather than as things on a shelf — the first
 * pass looked like a pixel-art palette had been hung in the corner.
 */
const PRODUCT_COLOURS = [
  '#c25349',
  '#cf9a4b',
  '#4f7cbe',
  '#57996a',
  '#b34f5c',
  '#c6bb5c',
  '#8a63a8',
  '#c07b4e',
] as const

/**
 * The vending machine's lit front.
 *
 * Deliberately kept off white. `CLINIC_BLOOM` runs a luminance threshold of
 * 1.05 because this room's *walls* clear a normal one, and the front this
 * replaces was a flat `#ffd98a` quad that went straight through it and bloomed
 * into a lamp in the corner of every capture.
 */
function drawVendingFront(): Texture {
  const ctx = context(VENDING_W, VENDING_H)
  const random = seeded(0x7e4d)

  const bezel = 26
  const columnX = VENDING_W * 0.7

  ctx.fillStyle = '#14294a'
  ctx.fillRect(0, 0, VENDING_W, VENDING_H)

  // The glass, lit from within.
  const glass = ctx.createLinearGradient(0, bezel, 0, VENDING_H - bezel)
  glass.addColorStop(0, '#cfe2ee')
  glass.addColorStop(0.55, '#aec7d8')
  glass.addColorStop(1, '#8fa9bd')
  ctx.fillStyle = glass
  ctx.fillRect(bezel, bezel, columnX - bezel * 1.5, VENDING_H - bezel * 2)

  // Three shelves of product.
  const shelfTop = bezel + 18
  const shelfGap = (VENDING_H - bezel * 2 - 40) / 3
  const shelfWidth = columnX - bezel * 1.5

  for (let shelf = 0; shelf < 3; shelf++) {
    const y = shelfTop + shelf * shelfGap
    const itemHeight = shelfGap * 0.62
    const columns = 6
    const itemWidth = (shelfWidth - 20) / columns

    // The dark of the cabinet behind the stock, so the front row reads as
    // standing in a lit box rather than as squares painted on the glass.
    ctx.fillStyle = 'rgba(24, 44, 62, 0.42)'
    ctx.fillRect(bezel + 4, y - 6, shelfWidth - 8, itemHeight + 10)

    for (let i = 0; i < columns; i++) {
      const colour = PRODUCT_COLOURS[Math.floor(random() * PRODUCT_COLOURS.length)] ?? '#c25349'
      const x = bezel + 10 + i * itemWidth

      /*
       * Each column a different size and standing at a different height.
       *
       * Six identical rectangles on a regular pitch is what made the first pass
       * read as a grid. Real stock is cans beside bottles beside a gap where
       * something sold, and the irregularity is the entire difference.
       */
      const width = itemWidth * (0.62 + random() * 0.22)
      const height = itemHeight * (0.72 + random() * 0.28)
      const top = y + (itemHeight - height)
      const inset = (itemWidth - width) / 2

      ctx.fillStyle = colour
      ctx.fillRect(x + inset, top, width, height)

      // A pale band across each, which is what a label reads as at this size.
      ctx.fillStyle = 'rgba(236, 240, 243, 0.72)'
      ctx.fillRect(x + inset, top + height * 0.4, width, height * 0.17)

      // ...and a highlight down one edge, so they read as cylinders.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.fillRect(x + inset + 2, top, width * 0.2, height)

      // A cap, which is most of what says "bottle" at this size.
      ctx.fillStyle = 'rgba(30, 40, 52, 0.5)'
      ctx.fillRect(x + inset + width * 0.3, top - 4, width * 0.4, 5)
    }

    // The shelf lip.
    ctx.fillStyle = 'rgba(46, 62, 78, 0.62)'
    ctx.fillRect(bezel + 4, y + itemHeight, shelfWidth - 8, 6)
  }

  // Selection column: keypad, coin slot, card reader.
  ctx.fillStyle = '#1d3559'
  ctx.fillRect(columnX, bezel, VENDING_W - columnX - bezel, VENDING_H - bezel * 2)

  const padX = columnX + 14
  const padWidth = VENDING_W - columnX - bezel - 28

  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const buttonWidth = padWidth / 3 - 5
      ctx.fillStyle = '#3d5a80'
      ctx.fillRect(padX + col * (buttonWidth + 5), bezel + 190 + row * 34, buttonWidth, 26)
    }
  }

  // A small amber readout, the one warm thing in the room and still under bloom.
  ctx.fillStyle = '#0b1524'
  ctx.fillRect(padX, bezel + 120, padWidth, 46)
  ctx.fillStyle = '#e0a13c'
  ctx.font = '600 30px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$1.25', padX + padWidth / 2, bezel + 143)

  // Coin slot and card reader.
  ctx.fillStyle = '#0d1c30'
  ctx.fillRect(padX + padWidth * 0.3, bezel + 380, padWidth * 0.4, 12)
  ctx.fillRect(padX, bezel + 410, padWidth, 30)

  // The dispensing flap, across the full width at the bottom.
  ctx.fillStyle = '#0b1728'
  ctx.fillRect(bezel, VENDING_H - bezel - 96, VENDING_W - bezel * 2, 84)
  ctx.fillStyle = 'rgba(120, 140, 160, 0.28)'
  ctx.fillRect(bezel + 6, VENDING_H - bezel - 90, VENDING_W - bezel * 2 - 12, 8)

  return finish(ctx)
}

/**
 * A wall: pale, with the top in shadow under the ceiling.
 *
 * The gradient is the whole point. A wall of one flat colour reads as cardboard
 * at any distance, and this room is the closest the player ever gets to one —
 * the chair camera sits under three metres from the wall behind the recliners.
 * The reference has the same falloff and it is doing most of the work there too.
 *
 * Four pixels wide, because nothing varies horizontally.
 */
function drawWall(): Texture {
  const ctx = context(4, 512)

  // Canvas y runs downward and so does the texture's v after the default flipY,
  // so row 0 is the bottom of the wall.
  const wash = ctx.createLinearGradient(0, 0, 0, 512)
  wash.addColorStop(0, '#c3ced6')
  wash.addColorStop(0.22, '#dae3ea')
  wash.addColorStop(0.72, '#d3dde5')
  wash.addColorStop(1, '#aab7c2')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, 4, 512)

  return finish(ctx)
}

/**
 * Desk laminate: a light wood, grained along its length.
 *
 * The reference's desk is a woodgrain laminate, and a single flat tan was most
 * of why the one here read as a crate rather than as joinery. The grain does not
 * have to be legible — at this distance it only has to stop the surface being
 * one value.
 */
function drawLaminate(): Texture {
  const ctx = context(512, 256)
  const random = seeded(0xd35c)

  const base = ctx.createLinearGradient(0, 0, 0, 256)
  base.addColorStop(0, '#b08a5c')
  base.addColorStop(0.5, '#a67f52')
  base.addColorStop(1, '#9a7449')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 512, 256)

  // Grain, as long wandering strokes along the board rather than noise.
  ctx.lineCap = 'round'
  for (let i = 0; i < 150; i++) {
    const y = random() * 256
    const dark = random() > 0.45

    ctx.strokeStyle = dark
      ? `rgba(112, 82, 48, ${0.08 + random() * 0.16})`
      : `rgba(206, 174, 130, ${0.06 + random() * 0.14})`
    ctx.lineWidth = 0.8 + random() * 2.6

    ctx.beginPath()
    ctx.moveTo(-10, y)
    // Three gentle waves across the board; a straight line reads as a scratch.
    ctx.bezierCurveTo(
      170,
      y + (random() - 0.5) * 14,
      340,
      y + (random() - 0.5) * 14,
      522,
      y + (random() - 0.5) * 8,
    )
    ctx.stroke()
  }

  return finish(ctx)
}

/** The clipboard hanging by the desk, as in the reference. */
function drawWallNotice(): Texture {
  const ctx = context(256, 344)

  ctx.fillStyle = '#8d949a'
  ctx.fillRect(0, 0, 256, 344)

  // The paper.
  ctx.fillStyle = '#e9ebe4'
  ctx.fillRect(14, 40, 228, 288)

  // The clip.
  ctx.fillStyle = '#b9c1c7'
  ctx.fillRect(88, 6, 80, 40)
  ctx.fillStyle = '#7d868d'
  ctx.fillRect(96, 14, 64, 10)

  // A heading rule and a page of ruled lines. Nothing legible at this size, and
  // legible text would only invite reading it.
  ctx.fillStyle = '#4b5560'
  ctx.fillRect(34, 66, 120, 9)

  ctx.fillStyle = '#aeb6bd'
  for (let line = 0; line < 13; line++) {
    ctx.fillRect(34, 98 + line * 17, line % 4 === 3 ? 120 : 188, 4)
  }

  return finish(ctx)
}

let ceiling: Texture | null = null
let ceilingNormal: Texture | null = null
let floor: Texture | null = null
let floorNormal: Texture | null = null
let vinylNormal: Texture | null = null
let vendingFront: Texture | null = null
let wallNotice: Texture | null = null
let wall: Texture | null = null
let laminate: Texture | null = null

/**
 * Acoustic ceiling tile.
 *
 * @param columns How many tiles across the room, which the caller derives from
 *   `CEILING_COLUMNS` — the texture holds two, so the repeat is half.
 * @param rows The same along z.
 */
export function getCeilingTexture(columns: number, rows: number): Texture {
  ceiling ??= drawCeiling()
  ceiling.repeat.set(columns / 2, rows / 2)
  ceiling.wrapS = RepeatWrapping
  ceiling.wrapT = RepeatWrapping
  return ceiling
}

export function getCeilingNormalTexture(columns: number, rows: number): Texture {
  // Gently. The runners stand a few millimetres proud of the tile, and at any
  // more than this they catch the fittings hard enough to relight the grid that
  // the texture above was just toned down to hide.
  ceilingNormal ??= normalTexture(ceilingHeights(), 128, 128, 1.3)
  ceilingNormal.repeat.set(columns / 2, rows / 2)
  ceilingNormal.wrapS = RepeatWrapping
  ceilingNormal.wrapT = RepeatWrapping
  return ceilingNormal
}

export function getFloorTexture(columns: number, rows: number): Texture {
  floor ??= drawFloor()
  floor.repeat.set(columns / 2, rows / 2)
  floor.wrapS = RepeatWrapping
  floor.wrapT = RepeatWrapping
  return floor
}

export function getFloorNormalTexture(columns: number, rows: number): Texture {
  floorNormal ??= normalTexture(floorHeights(), 128, 128, 3.2)
  floorNormal.repeat.set(columns / 2, rows / 2)
  floorNormal.wrapS = RepeatWrapping
  floorNormal.wrapT = RepeatWrapping
  return floorNormal
}

/** Embossed vinyl, for the recliners. Tiled tightly — a cushion is small. */
export function getVinylNormalTexture(): Texture {
  vinylNormal ??= normalTexture(vinylHeights(), 128, 128, 1.1, [3, 3])
  return vinylNormal
}

export function getVendingFrontTexture(): Texture {
  vendingFront ??= drawVendingFront()
  return vendingFront
}

export function getWallNoticeTexture(): Texture {
  wallNotice ??= drawWallNotice()
  return wallNotice
}

/**
 * Desk laminate.
 *
 * @param repeat How many times the board tiles across the surface, so a 2.6 m
 *   desk front and a 0.26 m counter edge get grain at the same scale rather
 *   than the same number of stripes.
 */
export function getLaminateTexture(repeat: readonly [number, number] = [1, 1]): Texture {
  laminate ??= drawLaminate()
  laminate.wrapS = RepeatWrapping
  laminate.wrapT = RepeatWrapping
  laminate.repeat.set(repeat[0], repeat[1])
  return laminate
}

/**
 * A wall, shaded top to bottom.
 *
 * Shared by all four walls, which is safe only because it does not vary
 * horizontally: the same texture stretched across a 12 m wall and an 11 m one
 * gives both the same gradient, which is what a ceiling above both would do.
 */
export function getWallTexture(): Texture {
  wall ??= drawWall()
  return wall
}
