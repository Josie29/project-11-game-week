import {
  CanvasTexture,
  ClampToEdgeWrapping,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import { heightToNormal } from './clinicTexture'

/*
 * The Golden Ace's surfaces, drawn to canvas at runtime like the felt, the
 * cards, the facades and the clinic's tile.
 *
 * The room used to be four flat colours, and it read as four flat colours: a
 * purple box with two lit tables floating in it. Everything here exists to give
 * the eye something to land on between the tables, because the floor is most of
 * what the walking camera actually shows.
 *
 * Palette read off `art/refs/casino_interior.png`. Nothing generated ships —
 * the reference is reference.
 *
 * No `Math.random` anywhere in this file. A texture that differs between page
 * loads makes every capture of this room a different picture, which is the same
 * reason `?freeze` exists.
 */

/** Deterministic noise, so two page loads draw the same room. */
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
  if (!ctx) throw new Error('Could not acquire a 2D canvas context for a casino texture')

  return ctx
}

function finish(ctx: CanvasRenderingContext2D): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping

  return texture
}

/**
 * A texture that is drawn once at the size of the thing it goes on.
 *
 * `ClampToEdgeWrapping`, because the whole point of these is that they have
 * edges: a rug's border and a cut-out balustrade panel are single drawings, not
 * tiles, and a repeating wrap would fold the border back into the field.
 */
function finishOnce(ctx: CanvasRenderingContext2D): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping

  return texture
}

/**
 * Wraps a height field as a normal-map texture.
 *
 * Linear rather than sRGB: a normal map holds directions, and putting it
 * through the sRGB transfer curve bends every one of them.
 *
 * `heightToNormal` itself is the clinic's, reused rather than reimplemented —
 * it is pure, it is tested, and it is the one piece of arithmetic in this whole
 * area that fails silently. A conversion returning flat normals everywhere
 * leaves the ceiling looking exactly as untextured as it does now while every
 * other assertion passes.
 */
function normalTexture(
  height: readonly number[],
  width: number,
  depth: number,
  strength: number,
): Texture {
  const ctx = context(width, depth)
  ctx.putImageData(new ImageData(heightToNormal(height, width, depth, strength), width, depth), 0, 0)

  const texture = new CanvasTexture(ctx.canvas)
  texture.anisotropy = 4
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping

  return texture
}

/* ----------------------------------------------------------------- carpet */

const CARPET_GROUND = '#4a0f18'
const CARPET_FIGURE = '#7d1c22'
const CARPET_GOLD = 'rgba(196, 152, 74, 0.85)'
const CARPET_GOLD_FAINT = 'rgba(196, 152, 74, 0.32)'

/**
 * A gold quatrefoil with a dark red heart — the figure the rugs are woven from.
 *
 * Takes its lobe radius in pixels rather than a unitless scale. The two rugs in
 * this room are different sizes and are therefore drawn on canvases at
 * different pixels-per-metre, so a motif sized as a fraction of its canvas
 * comes out visibly bigger on one rug than the other. Given a radius, both
 * carry the same figure at the same size in the world.
 *
 * @param ctx Canvas to draw on.
 * @param cx Centre, in pixels.
 * @param cy Centre, in pixels.
 * @param lobe Radius of one petal's reach, in pixels.
 */
function medallion(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lobe: number,
): void {
  ctx.fillStyle = CARPET_FIGURE
  ctx.beginPath()
  ctx.arc(cx, cy, lobe * 1.55, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = CARPET_GOLD
  for (let petal = 0; petal < 4; petal++) {
    const angle = (petal * Math.PI) / 2 + Math.PI / 4
    ctx.beginPath()
    ctx.ellipse(
      cx + Math.cos(angle) * lobe * 0.85,
      cy + Math.sin(angle) * lobe * 0.85,
      lobe * 0.62,
      lobe * 0.34,
      angle,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }

  ctx.fillStyle = CARPET_GROUND
  ctx.beginPath()
  ctx.arc(cx, cy, lobe * 0.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = CARPET_GOLD
  ctx.lineWidth = Math.max(1, lobe * 0.12)
  ctx.beginPath()
  ctx.arc(cx, cy, lobe * 0.72, 0, Math.PI * 2)
  ctx.stroke()
}

/* ----------------------------------------------------------------- marble */

const MARBLE_PX = 512

/**
 * Warm travertine for the aisle and the pool coping.
 *
 * Veining is drawn as a handful of wandering strokes rather than as noise: the
 * aisle is a metre and a bit wide and runs eighteen metres away from the
 * camera, so anything at the noise scale disappears into a grey stripe by the
 * middle distance. Big veins survive perspective; grain does not.
 */
function drawMarble(): Texture {
  const ctx = context(MARBLE_PX, MARBLE_PX)
  const random = seeded(0x3a12)

  /*
   * Warm stone, not white.
   *
   * The first pass was near-white and the aisle blew out into a solid beam of
   * light running the length of the room: an eighteen-metre plane at 0.94
   * luminance, under a chandelier, in an otherwise dark room. What reads as
   * marble is the veining, not the brightness — so the ground tone comes down
   * to something the lighting has headroom above.
   */
  const wash = ctx.createLinearGradient(0, 0, MARBLE_PX, MARBLE_PX)
  wash.addColorStop(0, '#b3a68f')
  wash.addColorStop(0.5, '#a2937c')
  wash.addColorStop(1, '#bcb09a')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, MARBLE_PX, MARBLE_PX)

  for (let vein = 0; vein < 26; vein++) {
    const warm = vein % 3 === 0
    ctx.strokeStyle = warm
      ? `rgba(206, 176, 116, ${(0.16 + random() * 0.16).toFixed(3)})`
      : `rgba(72, 66, 60, ${(0.12 + random() * 0.18).toFixed(3)})`
    ctx.lineWidth = 1 + random() * 5

    let x = random() * MARBLE_PX
    let y = -20
    ctx.beginPath()
    ctx.moveTo(x, y)

    while (y < MARBLE_PX + 20) {
      x += (random() - 0.5) * 62
      y += 22 + random() * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  return finish(ctx)
}

/* ------------------------------------------------------------------ stone */

const STONE_W = 256
const STONE_H = 256

/**
 * The dark polished stone the water runs down: a stack bond of long blocks.
 *
 * Nearly black, because the water in front of it is the only thing on that wall
 * meant to be bright. A mid-grey wall put a second light-toned rectangle behind
 * the cascade and the two fought.
 */
function drawStone(): Texture {
  const ctx = context(STONE_W, STONE_H)
  const random = seeded(0x5701)

  ctx.fillStyle = '#161020'
  ctx.fillRect(0, 0, STONE_W, STONE_H)

  const courseHeight = STONE_H / 6

  for (let course = 0; course < 6; course++) {
    // Every other course steps half a block along, which is what stops the
    // joints stacking into a visible vertical line.
    const offset = course % 2 === 0 ? 0 : STONE_W / 6
    const y = course * courseHeight

    for (let block = -1; block < 4; block++) {
      const x = offset + (block * STONE_W) / 3
      const tone = 22 + Math.floor(random() * 16)
      ctx.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone + 10})`
      ctx.fillRect(x + 1.5, y + 1.5, STONE_W / 3 - 3, courseHeight - 3)

      // A single highlight along the top arris, which is all that polished
      // stone shows in a dark room.
      ctx.fillStyle = 'rgba(130, 146, 190, 0.16)'
      ctx.fillRect(x + 1.5, y + 1.5, STONE_W / 3 - 3, 1.5)
    }
  }

  return finish(ctx)
}

/* ------------------------------------------------------------------ water */

const WATER_W = 128
const WATER_H = 512

/**
 * A sheet of falling water, as vertical streaks on transparent black.
 *
 * Tiles along its own length so the material can scroll it downward forever;
 * the streaks are drawn with soft ends and wrapped, so the seam does not show
 * as a horizontal line travelling down the wall.
 *
 * Drawn white and left `toneMapped={false}` by the caller. Water is not a
 * colour here, it is a brightness — the teal comes from the light under it.
 */
function drawWaterSheet(): Texture {
  const ctx = context(WATER_W, WATER_H)
  const random = seeded(0x9a05)

  /*
   * Anything that does not run the full height of the canvas is drawn twice,
   * the second time translated up by one tile, so whatever crosses the bottom
   * edge arrives back at the top rather than being cut off. *Translated*, not
   * merely offset: a canvas gradient lives in user space, so a second
   * `fillRect` at shifted coordinates samples the gradient outside its range
   * and paints nothing — which is exactly the bug the first version had, and
   * why the cascade wore a hard horizontal seam per tile.
   */
  const wrappedVertically = (draw: () => void) => {
    draw()
    ctx.save()
    ctx.translate(0, -WATER_H)
    draw()
    ctx.restore()
  }

  /*
   * A body first, then the streaks on it.
   *
   * At a tenth of an alpha the first version read as rain in front of a wall
   * rather than as a sheet of water on one: the blockwork's joints were legible
   * straight through it. Falling water is mostly opaque and only the *surface*
   * of it is streaky.
   */
  ctx.fillStyle = 'rgba(158, 206, 228, 0.3)'
  ctx.fillRect(0, 0, WATER_W, WATER_H)

  /*
   * Broad density columns, full height so they tile vertically by
   * construction. A real cascade is not uniformly thick across its width — it
   * gathers into heavier and lighter falls — and this unevenness is most of
   * what stops the sheet reading as wallpaper. Soft-edged via a horizontal
   * gradient; a column crossing the right edge gets a wrapped copy on the left.
   */
  for (let column = 0; column < 10; column++) {
    const x = random() * WATER_W
    const width = 8 + random() * 20
    const alpha = 0.06 + random() * 0.14

    const soft = ctx.createLinearGradient(x, 0, x + width, 0)
    soft.addColorStop(0, 'rgba(190, 226, 244, 0)')
    soft.addColorStop(0.5, `rgba(190, 226, 244, ${alpha.toFixed(3)})`)
    soft.addColorStop(1, 'rgba(190, 226, 244, 0)')

    ctx.fillStyle = soft
    ctx.fillRect(x, 0, width, WATER_H)
    ctx.save()
    ctx.translate(-WATER_W, 0)
    ctx.fillRect(x, 0, width, WATER_H)
    ctx.restore()
  }

  /*
   * Ropes: a dozen bright full-height cords inside the heavier falls. These
   * are the individual strands of water the eye actually tracks moving; the
   * fine streaks below them are only shimmer on the surface.
   */
  for (let rope = 0; rope < 12; rope++) {
    const x = random() * WATER_W
    const width = 2.5 + random() * 5
    const alpha = 0.16 + random() * 0.26

    const cord = ctx.createLinearGradient(x, 0, x + width, 0)
    cord.addColorStop(0, 'rgba(226, 246, 255, 0)')
    cord.addColorStop(0.5, `rgba(226, 246, 255, ${alpha.toFixed(3)})`)
    cord.addColorStop(1, 'rgba(226, 246, 255, 0)')

    ctx.fillStyle = cord
    ctx.fillRect(x, 0, width, WATER_H)
    ctx.save()
    ctx.translate(-WATER_W, 0)
    ctx.fillRect(x, 0, width, WATER_H)
    ctx.restore()
  }

  for (let streak = 0; streak < 190; streak++) {
    const x = random() * WATER_W
    const width = 0.6 + random() * 3.2
    const top = random() * WATER_H
    const length = 40 + random() * 230
    const alpha = 0.1 + random() * 0.5

    const fade = ctx.createLinearGradient(0, top, 0, top + length)
    fade.addColorStop(0, 'rgba(255, 255, 255, 0)')
    fade.addColorStop(0.35, `rgba(228, 248, 255, ${alpha.toFixed(3)})`)
    fade.addColorStop(1, 'rgba(255, 255, 255, 0)')

    ctx.fillStyle = fade
    wrappedVertically(() => ctx.fillRect(x, top, width, length))
  }

  /*
   * A few dozen glints: very thin, very bright, and short. These are the
   * catchlights — the one part of the sheet that should sparkle rather than
   * pour, so they are the only strands allowed near full white.
   */
  for (let glint = 0; glint < 45; glint++) {
    const x = random() * WATER_W
    const width = 0.5 + random() * 1.1
    const top = random() * WATER_H
    const length = 24 + random() * 90
    const alpha = 0.4 + random() * 0.4

    const flash = ctx.createLinearGradient(0, top, 0, top + length)
    flash.addColorStop(0, 'rgba(255, 255, 255, 0)')
    flash.addColorStop(0.4, `rgba(244, 252, 255, ${alpha.toFixed(3)})`)
    flash.addColorStop(1, 'rgba(255, 255, 255, 0)')

    ctx.fillStyle = flash
    wrappedVertically(() => ctx.fillRect(x, top, width, length))
  }

  return finish(ctx)
}

/* ------------------------------------------------------------------- foam */

const FOAM_W = 256
const FOAM_H = 64

/**
 * The churn where the cascade meets the pool, as a band of soft overlapping
 * puffs on transparent black.
 *
 * Tiles horizontally so one drawing covers the whole waterline; the puffs sit
 * clear of the top and bottom edges, so the band needs no vertical wrap and
 * fades out on its own. Drawn near-white for the same reason as the sheet —
 * the teal is the light's job, not the texture's.
 */
function drawFoamBand(): Texture {
  const ctx = context(FOAM_W, FOAM_H)
  const random = seeded(0x50f4)

  for (let blob = 0; blob < 70; blob++) {
    const x = random() * FOAM_W
    const y = FOAM_H * (0.3 + random() * 0.4)
    const radius = 4 + random() * 10
    const alpha = 0.14 + random() * 0.3

    const puff = ctx.createRadialGradient(x, y, 0, x, y, radius)
    puff.addColorStop(0, `rgba(234, 250, 255, ${alpha.toFixed(3)})`)
    puff.addColorStop(1, 'rgba(234, 250, 255, 0)')

    ctx.fillStyle = puff
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)

    // The wrapped copy, for blobs crossing either vertical edge. Translated
    // rather than redrawn at an offset — see the note in `drawWaterSheet`.
    ctx.save()
    ctx.translate(x < FOAM_W / 2 ? FOAM_W : -FOAM_W, 0)
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    ctx.restore()
  }

  return finish(ctx)
}

/* ---------------------------------------------------------------- coffers */

const COFFER_PX = 256

/**
 * One coffer panel: a sunken square with a stepped surround and a rosette.
 *
 * This is the *shading* of a coffer, not its shape. The ribs between panels are
 * real geometry on the vault, because a rib is silhouette — it breaks the
 * ceiling's outline against the neon behind it and no amount of shading does
 * that. Everything inside a rib is flat and belongs here, which is the
 * difference between twenty-one meshes and a hundred and twenty.
 */
function drawCoffer(): Texture {
  const ctx = context(COFFER_PX, COFFER_PX)
  const mid = COFFER_PX / 2

  ctx.fillStyle = '#d8cdb4'
  ctx.fillRect(0, 0, COFFER_PX, COFFER_PX)

  // Three steps down into the panel, each a shade darker, which is what gives a
  // coffer its depth when the light is coming from below and to one side.
  const steps: readonly (readonly [number, string])[] = [
    [0.1, '#c6b99c'],
    [0.18, '#b0a288'],
    [0.26, '#9a8c74'],
  ]
  for (const [inset, tone] of steps) {
    const pad = COFFER_PX * inset
    ctx.fillStyle = tone
    ctx.fillRect(pad, pad, COFFER_PX - pad * 2, COFFER_PX - pad * 2)
  }

  // Highlight along the two edges the light reaches, shadow on the other two.
  ctx.strokeStyle = 'rgba(255, 246, 224, 0.4)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(COFFER_PX * 0.26, COFFER_PX * 0.74)
  ctx.lineTo(COFFER_PX * 0.26, COFFER_PX * 0.26)
  ctx.lineTo(COFFER_PX * 0.74, COFFER_PX * 0.26)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(40, 30, 20, 0.35)'
  ctx.beginPath()
  ctx.moveTo(COFFER_PX * 0.74, COFFER_PX * 0.26)
  ctx.lineTo(COFFER_PX * 0.74, COFFER_PX * 0.74)
  ctx.lineTo(COFFER_PX * 0.26, COFFER_PX * 0.74)
  ctx.stroke()

  // A gold rosette in the middle of each panel, as the reference has.
  ctx.fillStyle = 'rgba(186, 148, 74, 0.75)'
  for (let petal = 0; petal < 8; petal++) {
    const angle = (petal / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.ellipse(
      mid + Math.cos(angle) * COFFER_PX * 0.075,
      mid + Math.sin(angle) * COFFER_PX * 0.075,
      COFFER_PX * 0.055,
      COFFER_PX * 0.026,
      angle,
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(214, 178, 96, 0.9)'
  ctx.beginPath()
  ctx.arc(mid, mid, COFFER_PX * 0.035, 0, Math.PI * 2)
  ctx.fill()

  return finish(ctx)
}

/** The same panel as a height field, so the steps catch the light for real. */
function cofferHeights(): number[] {
  const size = 64
  const heights: number[] = []

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      // Distance from the panel's centre as a fraction of its half-width, on
      // the square (Chebyshev) metric — a coffer is a square recess, not a
      // round one, so the steps have to follow the larger of the two axes.
      const reach = Math.max(
        Math.abs(column / (size - 1) - 0.5),
        Math.abs(row / (size - 1) - 0.5),
      ) * 2

      if (reach > 0.8) heights.push(1)
      else if (reach > 0.64) heights.push(0.72)
      else if (reach > 0.48) heights.push(0.44)
      else heights.push(0.3)
    }
  }

  return heights
}

/* ------------------------------------------------------------ stone floor */

const STONE_FLOOR_PX = 512

/**
 * Dark polished stone, in large slabs, for the margins and the walkway.
 *
 * The reference's floor is bands of material — stone margin, bordered rug,
 * stone, marble aisle, and back out again. Ours was carpet edge to edge, which
 * is what made a nineteen-metre room read as one rug with furniture on it. This
 * is the ground everything else is laid on.
 */
function drawStoneFloor(): Texture {
  const ctx = context(STONE_FLOOR_PX, STONE_FLOOR_PX)
  const random = seeded(0x2f10)

  ctx.fillStyle = '#171021'
  ctx.fillRect(0, 0, STONE_FLOOR_PX, STONE_FLOOR_PX)

  // Two slabs by two, so the joint pattern's period is four tiles rather than
  // one — the same reason the clinic's ceiling holds four tiles per block.
  const slab = STONE_FLOOR_PX / 2
  for (let index = 0; index < 4; index++) {
    // Column, then row, walking the 2x2 block.
    const x = (index % 2) * slab
    const y = Math.floor(index / 2) * slab

    const tone = 22 + Math.floor(random() * 10)
    ctx.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone + 12})`
    ctx.fillRect(x + 1, y + 1, slab - 2, slab - 2)

    // A few pale drifts of vein, which is all that shows on stone this dark.
    for (let vein = 0; vein < 3; vein++) {
      ctx.strokeStyle = `rgba(120, 108, 150, ${(0.05 + random() * 0.07).toFixed(3)})`
      ctx.lineWidth = 1 + random() * 3
      ctx.beginPath()
      let vx = x + random() * slab
      let vy = y
      ctx.moveTo(vx, vy)
      while (vy < y + slab) {
        vx += (random() - 0.5) * 70
        vy += 20 + random() * 40
        ctx.lineTo(vx, vy)
      }
      ctx.stroke()
    }
  }

  return finish(ctx)
}

/* -------------------------------------------------------------------- rugs */

/**
 * A rug: the carpet field with a woven border drawn round its actual edge.
 *
 * Drawn once at the rug's own proportions rather than tiled, and that is the
 * whole point — a tiling texture cannot have a border, and the border is what
 * makes a rug read as a rug laid on a floor instead of as wall-to-wall
 * flooring. It is also why this takes metres rather than a repeat count: the
 * border has to be a constant width in the world, or the two rugs in this room
 * come out with visibly different frames.
 *
 * @param widthMeters How wide the rug is.
 * @param depthMeters How deep it is.
 */
function drawRug(widthMeters: number, depthMeters: number): Texture {
  // Pixels per metre, capped so a long rug does not produce an enormous canvas.
  const scale = Math.min(96, 2400 / Math.max(widthMeters, depthMeters))
  const width = Math.round(widthMeters * scale)
  const depth = Math.round(depthMeters * scale)

  const ctx = context(width, depth)
  const random = seeded(0x71a3)

  ctx.fillStyle = CARPET_GROUND
  ctx.fillRect(0, 0, width, depth)

  for (let i = 0; i < width * depth * 0.02; i++) {
    const shade = 0.05 + random() * 0.09
    ctx.fillStyle = `rgba(20, 4, 8, ${shade.toFixed(3)})`
    ctx.fillRect(random() * width, random() * depth, 2, 2)
  }

  const border = 0.42 * scale

  // The field, inside the border: the same medallion lattice as before, on a
  // grid sized in metres so both rugs carry the same motif at the same size.
  /*
   * The motif repeats every two-thirds of a metre.
   *
   * It was 1.05 and the rugs came out covered in gold flowers the size of a
   * dinner plate — the pattern was legible one motif at a time, which is what a
   * bedspread does, not a casino floor. What the reference has is a *texture*:
   * fine enough that the eye reads a woven surface rather than counting shapes.
   */
  const step = 0.66 * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(border * 1.6, border * 1.6, width - border * 3.2, depth - border * 3.2)
  ctx.clip()

  ctx.strokeStyle = CARPET_GOLD_FAINT
  ctx.lineWidth = 2
  for (const flip of [1, -1]) {
    ctx.beginPath()
    for (let line = -Math.ceil(depth / step); line <= Math.ceil(width / step) * 2; line++) {
      const offset = line * step
      ctx.moveTo(offset, flip > 0 ? 0 : depth)
      ctx.lineTo(offset + depth, flip > 0 ? depth : 0)
    }
    ctx.stroke()
  }

  for (let row = 0; row * step < depth + step; row++) {
    for (let column = 0; column * step < width + step; column++) {
      const cx = column * step
      const cy = row * step
      /*
       * Alternate big and small on the checker, so the field has a rhythm
       * rather than one motif stamped in a grid.
       *
       * Sized off `step`, which is the one thing here in pixels-per-metre. The
       * first version passed 0.9 and 0.5 — the *scale factors* the old tiled
       * carpet used — straight in as a radius, so every medallion on both rugs
       * was drawn sub-pixel and the fields came out plain red with a border
       * round them. Nothing failed; the rug simply had no pattern on it.
       */
      medallion(ctx, cx, cy, step * ((row + column) % 2 === 0 ? 0.3 : 0.17))
    }
  }
  ctx.restore()

  // The border: a dark ground, a gold guard line either side, and a running
  // scroll between them.
  ctx.fillStyle = '#3a0a12'
  ctx.fillRect(0, 0, width, border * 1.5)
  ctx.fillRect(0, depth - border * 1.5, width, border * 1.5)
  ctx.fillRect(0, 0, border * 1.5, depth)
  ctx.fillRect(width - border * 1.5, 0, border * 1.5, depth)

  ctx.strokeStyle = CARPET_GOLD
  ctx.lineWidth = Math.max(2, border * 0.1)
  for (const inset of [border * 0.28, border * 1.32]) {
    ctx.strokeRect(inset, inset, width - inset * 2, depth - inset * 2)
  }

  // The scroll itself, as regular gold ticks along the band.
  ctx.fillStyle = CARPET_GOLD
  const tick = Math.max(3, border * 0.18)
  const along = border * 0.8
  for (let x = border * 0.8; x < width - border * 0.8; x += border * 0.75) {
    ctx.fillRect(x, along - tick / 2, tick, tick)
    ctx.fillRect(x, depth - along - tick / 2, tick, tick)
  }
  for (let y = border * 0.8; y < depth - border * 0.8; y += border * 0.75) {
    ctx.fillRect(along - tick / 2, y, tick, tick)
    ctx.fillRect(width - along - tick / 2, y, tick, tick)
  }

  return finishOnce(ctx)
}

/* ------------------------------------------------------------- openwork */

const BALUSTRADE_PX = 256

/**
 * A gold openwork balustrade panel, drawn on transparent ground.
 *
 * A cut-out on a plane rather than a rail on modelled posts. The reference's
 * pool rail is a fine pierced screen — lyre-shaped openings between slender
 * uprights — and the eleven cylinders it replaces were both more meshes and
 * less like it. What matters at four metres is the *rhythm of the holes*, and
 * holes are exactly what a texture does better than geometry.
 */
function drawBalustrade(): Texture {
  const ctx = context(BALUSTRADE_PX, BALUSTRADE_PX)

  const gold = '#c2a052'
  const shadow = 'rgba(60, 44, 14, 0.85)'

  // Top and bottom rails run the full width; everything between is pierced.
  ctx.fillStyle = gold
  ctx.fillRect(0, 0, BALUSTRADE_PX, BALUSTRADE_PX * 0.11)
  ctx.fillRect(0, BALUSTRADE_PX * 0.88, BALUSTRADE_PX, BALUSTRADE_PX * 0.12)

  const bays = 4
  const bayWidth = BALUSTRADE_PX / bays

  for (let bay = 0; bay < bays; bay++) {
    const left = bay * bayWidth
    const mid = left + bayWidth / 2

    // The two uprights framing this bay.
    for (const x of [left, left + bayWidth]) {
      ctx.fillStyle = gold
      ctx.fillRect(x - bayWidth * 0.045, 0, bayWidth * 0.09, BALUSTRADE_PX)
    }

    // A lyre: two curves springing from the base and meeting under the rail.
    ctx.strokeStyle = gold
    ctx.lineWidth = bayWidth * 0.07
    for (const direction of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(mid + direction * bayWidth * 0.05, BALUSTRADE_PX * 0.88)
      ctx.bezierCurveTo(
        mid + direction * bayWidth * 0.42,
        BALUSTRADE_PX * 0.72,
        mid + direction * bayWidth * 0.42,
        BALUSTRADE_PX * 0.3,
        mid,
        BALUSTRADE_PX * 0.14,
      )
      ctx.stroke()
    }

    // A small ring where the two curves cross, as the reference has.
    ctx.beginPath()
    ctx.arc(mid, BALUSTRADE_PX * 0.5, bayWidth * 0.11, 0, Math.PI * 2)
    ctx.stroke()
  }

  // A shadow line under the top rail, so the screen has some thickness.
  ctx.fillStyle = shadow
  ctx.fillRect(0, BALUSTRADE_PX * 0.11, BALUSTRADE_PX, BALUSTRADE_PX * 0.018)

  return finish(ctx)
}

/* ------------------------------------------------------------- acanthus */

const CAPITAL_PX = 256

/**
 * Acanthus leaves for the column capitals, on transparent ground.
 *
 * The alternative was five more meshes per capital — fifty across the room —
 * for foliage nobody gets closer than four metres to and which is eight metres
 * up. Wrapped round the existing bell, this costs nothing and is the only part
 * of a Corinthian order anybody actually recognises.
 */
function drawAcanthus(): Texture {
  const ctx = context(CAPITAL_PX, CAPITAL_PX)

  /** One leaf, curling outward and back on itself. */
  const leaf = (cx: number, baseY: number, height: number, spread: number): void => {
    ctx.beginPath()
    ctx.moveTo(cx, baseY)
    ctx.bezierCurveTo(cx - spread, baseY - height * 0.5, cx - spread * 0.7, baseY - height, cx, baseY - height)
    ctx.bezierCurveTo(cx + spread * 0.7, baseY - height, cx + spread, baseY - height * 0.5, cx, baseY)
    ctx.fill()

    // The mid-rib, which is what makes it read as a leaf rather than a blob.
    ctx.strokeStyle = 'rgba(90, 68, 22, 0.7)'
    ctx.lineWidth = CAPITAL_PX * 0.008
    ctx.beginPath()
    ctx.moveTo(cx, baseY)
    ctx.lineTo(cx, baseY - height * 0.82)
    ctx.stroke()
  }

  // Lower row of eight, upper row of eight offset by half a step — the two
  // tiers of leaves a Corinthian capital is built from.
  const lower = 8
  for (let index = 0; index < lower; index++) {
    ctx.fillStyle = '#b08c3e'
    leaf(
      ((index + 0.5) / lower) * CAPITAL_PX,
      CAPITAL_PX * 0.98,
      CAPITAL_PX * 0.5,
      CAPITAL_PX * 0.052,
    )
  }
  for (let index = 0; index < lower; index++) {
    ctx.fillStyle = '#d4b256'
    leaf(
      ((index + 1) / lower) * CAPITAL_PX,
      CAPITAL_PX * 0.62,
      CAPITAL_PX * 0.42,
      CAPITAL_PX * 0.058,
    )
  }

  // Volutes: the little scrolls at the top corners of each face.
  ctx.strokeStyle = '#e0c26a'
  ctx.lineWidth = CAPITAL_PX * 0.016
  for (let index = 0; index < 4; index++) {
    const cx = ((index + 0.5) / 4) * CAPITAL_PX
    for (const direction of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(cx + direction * CAPITAL_PX * 0.09, CAPITAL_PX * 0.15, CAPITAL_PX * 0.05, 0, Math.PI * 1.6)
      ctx.stroke()
    }
  }

  return finish(ctx)
}

/* ------------------------------------------------------------ upper bays */

const BAY_PX = 512

/**
 * The upper storey behind the balcony: dark arched openings with a lamp in
 * each, painted on the wall.
 *
 * Geometry here would be rooms the player can see into and never reach, which
 * this project has already decided against once — the old casino filled its
 * background with tables receding into haze and it read as being kept away from
 * them. An arcade painted on a wall four metres above head height is scenery,
 * and reads as scenery, which is the honest version.
 */
function drawUpperBays(): Texture {
  const ctx = context(BAY_PX, BAY_PX / 2)
  const height = BAY_PX / 2

  ctx.fillStyle = '#2b1a38'
  ctx.fillRect(0, 0, BAY_PX, height)

  const bays = 4
  const bayWidth = BAY_PX / bays

  for (let bay = 0; bay < bays; bay++) {
    const cx = (bay + 0.5) * bayWidth
    const openingWidth = bayWidth * 0.56
    const springing = height * 0.42

    // The opening: a round-headed arch, nearly black.
    ctx.fillStyle = '#0d0716'
    ctx.beginPath()
    ctx.moveTo(cx - openingWidth / 2, height * 0.94)
    ctx.lineTo(cx - openingWidth / 2, springing)
    ctx.arc(cx, springing, openingWidth / 2, Math.PI, 0)
    ctx.lineTo(cx + openingWidth / 2, height * 0.94)
    ctx.closePath()
    ctx.fill()

    // Its surround, a shade lighter than the wall.
    ctx.strokeStyle = '#4a3355'
    ctx.lineWidth = BAY_PX * 0.012
    ctx.stroke()

    // A warm lamp deep inside, and the glow it throws on the reveal.
    const glow = ctx.createRadialGradient(cx, springing * 1.5, 0, cx, springing * 1.5, openingWidth)
    glow.addColorStop(0, 'rgba(255, 206, 138, 0.72)')
    glow.addColorStop(0.45, 'rgba(224, 158, 84, 0.22)')
    glow.addColorStop(1, 'rgba(224, 158, 84, 0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.moveTo(cx - openingWidth / 2, height * 0.94)
    ctx.lineTo(cx - openingWidth / 2, springing)
    ctx.arc(cx, springing, openingWidth / 2, Math.PI, 0)
    ctx.lineTo(cx + openingWidth / 2, height * 0.94)
    ctx.closePath()
    ctx.fill()
  }

  return finish(ctx)
}

/* ---------------------------------------------------------------- mist */

const MIST_PX = 128

/**
 * A soft round puff for the spray at the foot of the cascade.
 *
 * The one shape a flat quad standing in for light is allowed to be. What burned
 * the shop's exit door was a *hard edge* — a rectangle of pale grey lying on a
 * dark polished floor reads as a plank because you can see where it stops. A
 * radial gradient reaching zero alpha has no edge to see, which is why the same
 * trick that failed on a floor works against a wall of falling water.
 */
function drawMist(): Texture {
  const ctx = context(MIST_PX, MIST_PX)
  const mid = MIST_PX / 2

  const puff = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid)
  puff.addColorStop(0, 'rgba(220, 242, 252, 0.5)')
  puff.addColorStop(0.4, 'rgba(196, 228, 244, 0.2)')
  puff.addColorStop(1, 'rgba(196, 228, 244, 0)')

  ctx.fillStyle = puff
  ctx.fillRect(0, 0, MIST_PX, MIST_PX)

  return finish(ctx)
}

/* -------------------------------------------------------------- getters */

let marble: Texture | null = null
let stone: Texture | null = null
let stoneFloor: Texture | null = null
let coffer: Texture | null = null
let cofferNormal: Texture | null = null
let acanthus: Texture | null = null
let upperBays: Texture | null = null
let mist: Texture | null = null
let waterSheet: Texture | null = null
let foamBand: Texture | null = null

/**
 * One rug, drawn at its own size, cached per size.
 *
 * Keyed rather than singleton because these are not tiles: each rug's border is
 * drawn round its actual edge, so the two in this room are two different
 * drawings. There are exactly two, and the map keeps it that way across a
 * remount.
 *
 * @param widthMeters How wide the rug is in the world.
 * @param depthMeters How deep it is.
 */
const rugs = new Map<string, Texture>()

export function getRugTexture(widthMeters: number, depthMeters: number): Texture {
  const key = `${widthMeters.toFixed(2)}x${depthMeters.toFixed(2)}`

  let rug = rugs.get(key)
  if (!rug) {
    rug = drawRug(widthMeters, depthMeters)
    rugs.set(key, rug)
  }

  return rug
}

/**
 * Dark polished stone, for the floor's margins and the walkway.
 *
 * @param columns Repeats across the room.
 * @param rows Repeats along it.
 */
export function getStoneFloorTexture(columns: number, rows: number): Texture {
  stoneFloor ??= drawStoneFloor()
  stoneFloor.repeat.set(columns / 2, rows / 2)
  return stoneFloor
}

/**
 * Coffer panels for the vault, and the height that goes with them.
 *
 * @param columns One per rib bay across the vault.
 * @param rows One per rib bay along it.
 */
export function getCofferTexture(columns: number, rows: number): Texture {
  coffer ??= drawCoffer()
  coffer.repeat.set(columns, rows)
  return coffer
}

/**
 * The pierced gold screen, round the pool and along the balcony.
 *
 * Cached per repeat count, not shared like the others. Four runs use this at
 * three different lengths, and `repeat` lives on the texture — one shared
 * object means the last component to render sets the spacing for all of them,
 * which is the trap the two cascade sheets already had to be cloned to avoid.
 *
 * @param bays How many four-bay panels fit along the run.
 */
const balustrades = new Map<number, Texture>()

export function getBalustradeTexture(bays: number): Texture {
  let screen = balustrades.get(bays)
  if (!screen) {
    screen = drawBalustrade()
    screen.repeat.set(bays, 1)
    balustrades.set(bays, screen)
  }

  return screen
}

/** Acanthus for a capital. One wrap per column. */
export function getAcanthusTexture(): Texture {
  acanthus ??= drawAcanthus()
  acanthus.repeat.set(1, 1)
  return acanthus
}

/**
 * The painted arcade on the upper storey.
 *
 * @param runs How many four-bay stretches fit along the wall.
 */
export function getUpperBayTexture(runs: number): Texture {
  upperBays ??= drawUpperBays()
  upperBays.repeat.set(runs, 1)
  return upperBays
}

/** A soft puff of spray. Shared by every mist sprite. */
export function getMistTexture(): Texture {
  mist ??= drawMist()
  return mist
}

export function getCofferNormalTexture(columns: number, rows: number): Texture {
  // Gently. The steps of a coffer are a few centimetres deep on a ceiling ten
  // metres up; at any more than this the ceiling reads as quilted.
  cofferNormal ??= normalTexture(cofferHeights(), 64, 64, 1.6)
  cofferNormal.repeat.set(columns, rows)
  return cofferNormal
}

/**
 * Marble, for the aisle and the coping.
 *
 * @param columns Repeats across.
 * @param rows Repeats along.
 */
export function getMarbleTexture(columns: number, rows: number): Texture {
  marble ??= drawMarble()
  marble.repeat.set(columns, rows)
  return marble
}

/**
 * The cascade wall's polished blockwork.
 *
 * @param columns Repeats across.
 * @param rows Repeats up.
 */
export function getStoneTexture(columns: number, rows: number): Texture {
  stone ??= drawStone()
  stone.repeat.set(columns, rows)
  return stone
}

/**
 * The falling sheet. Shared, and scrolled by the caller through `offset.y`.
 *
 * @param columns Repeats across the cascade.
 * @param rows Repeats down it.
 */
export function getWaterSheetTexture(columns: number, rows: number): Texture {
  waterSheet ??= drawWaterSheet()
  waterSheet.repeat.set(columns, rows)
  return waterSheet
}

/**
 * The churn at the waterline. Shared, and drifted by the caller through
 * `offset.x`.
 *
 * @param columns Repeats along the waterline.
 */
export function getFoamBandTexture(columns: number): Texture {
  foamBand ??= drawFoamBand()
  foamBand.repeat.set(columns, 1)
  return foamBand
}
