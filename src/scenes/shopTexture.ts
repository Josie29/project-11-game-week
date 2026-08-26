import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { heightToNormal } from './clinicTexture'

/*
 * The Gilded Hanger's surfaces, drawn to canvas at runtime.
 *
 * Built after `clinicTexture.ts` and on the same rules, and it borrows that
 * module's `heightToNormal` rather than carrying a second copy — the arithmetic
 * is already pure and already tested.
 *
 * Everything here is a *texture*, which matters in this room specifically.
 * `ShopInterior` forward-renders about thirteen point lights and runs at roughly
 * one frame a second headless; adding more lights breaks the walkthrough outright
 * (see the note on the case deck). Textures cost none of that, so all of the
 * finish work below is pigment rather than illumination.
 */

function context(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D canvas context for a shop texture')

  return ctx
}

function finish(ctx: CanvasRenderingContext2D): Texture {
  const texture = new CanvasTexture(ctx.canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/**
 * One bay of plum wall: gradient, cornice, dado and a panelled wainscot.
 *
 * A bay is 1.6 m wide, which divides both of this room's wall lengths exactly —
 * 8 across the long walls and 7 across the short ones. That is the whole reason
 * for the number: a bay that does not divide leaves a sliced panel in a corner,
 * and a half-panel reads as a texture seam rather than as joinery.
 *
 * Mapped so `v` runs floor to ceiling over the room's full height, which is what
 * puts the gold lines where a joiner would.
 */
export const WALL_BAY_METRES = 1.6

const BAY_PX = 256
const WALL_PX = 512

function drawWall(): Texture {
  const ctx = context(BAY_PX, WALL_PX)

  // Canvas y runs downward and so does v after the default flipY, so row 0 is
  // the bottom of the wall.
  const wash = ctx.createLinearGradient(0, 0, 0, WALL_PX)
  wash.addColorStop(0, '#24091f')
  wash.addColorStop(0.18, '#340f2f')
  wash.addColorStop(0.52, '#45163d')
  wash.addColorStop(0.86, '#3a1235')
  wash.addColorStop(1, '#2a0c26')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, BAY_PX, WALL_PX)

  /** Canvas y for a height given as a fraction of the wall. */
  const rowAt = (at: number): number => WALL_PX - at * WALL_PX

  /** Paints a horizontal band across the bay at a fraction of the height. */
  const band = (at: number, thickness: number, fill: string): void => {
    ctx.fillStyle = fill
    ctx.fillRect(0, rowAt(at) - thickness / 2, BAY_PX, thickness)
  }

  /*
   * The wainscot: one recessed panel per bay, below the dado.
   *
   * Drawn rather than built. A moulded panel is four mitred lengths of timber
   * and would be four boxes per bay — 60 draw calls round this room, in the one
   * interior that has already had to give back a transparent pane and thirteen
   * lights to keep the walkthrough passing. Light comes from above here, so the
   * top and left edges of a recess are in shadow and the bottom and right catch
   * it; that pair of lines is what the eye reads as depth.
   */
  const panelTop = rowAt(0.285)
  const panelBottom = rowAt(0.055)
  const inset = 26
  const panelWidth = BAY_PX - inset * 2
  const panelHeight = panelBottom - panelTop

  // The field inside the panel sits a shade darker than the wall around it.
  ctx.fillStyle = 'rgba(16, 4, 14, 0.3)'
  ctx.fillRect(inset, panelTop, panelWidth, panelHeight)

  ctx.lineWidth = 3
  // Shadowed edges: top and left.
  ctx.strokeStyle = 'rgba(12, 3, 11, 0.75)'
  ctx.beginPath()
  ctx.moveTo(inset, panelBottom)
  ctx.lineTo(inset, panelTop)
  ctx.lineTo(inset + panelWidth, panelTop)
  ctx.stroke()
  // Catching edges: bottom and right.
  ctx.strokeStyle = 'rgba(150, 110, 150, 0.3)'
  ctx.beginPath()
  ctx.moveTo(inset + panelWidth, panelTop)
  ctx.lineTo(inset + panelWidth, panelBottom)
  ctx.lineTo(inset, panelBottom)
  ctx.stroke()

  // Skirting, where the wainscot meets the floor.
  band(0.028, 9, '#2a0b24')
  band(0.048, 3, 'rgba(150, 110, 150, 0.18)')

  // Dado, capping the wainscot, with a shadow under it so it reads as a
  // moulding rather than as a stripe.
  band(0.3, 5, '#8a6a24')
  band(0.288, 4, 'rgba(20, 6, 18, 0.55)')

  // Cornice, just under the ceiling.
  band(0.93, 7, '#a07f2c')
  band(0.915, 5, 'rgba(20, 6, 18, 0.5)')

  return finish(ctx)
}

const FLOOR_PX = 1024

/**
 * The dark polished floor, with a brass inlay following the walls.
 *
 * Mapped one-to-one over the whole floor rather than tiled: an inlay has to run
 * at a fixed distance from the walls, and a repeating texture has no idea where
 * the walls are.
 *
 * The variation is deliberately faint. `ShopInterior` records that at roughness
 * 0.34 the floor *reflected* rather than caught the light and every downlight
 * pool disappeared; the same is true of pigment. What this adds is enough tonal
 * drift that the floor stops being one flat value across twelve metres, and no
 * more.
 */
function drawFloor(): Texture {
  const ctx = context(FLOOR_PX, FLOOR_PX)

  ctx.fillStyle = '#241d29'
  ctx.fillRect(0, 0, FLOOR_PX, FLOOR_PX)

  /*
   * A slow drift across the slab, built from a few wide radial washes.
   *
   * Deterministic — fixed centres rather than a generator — because this is one
   * texture drawn once and a seeded loop would be machinery for four blobs.
   */
  for (const [cx, cy, radius, tint] of [
    [0.3, 0.28, 0.55, 'rgba(58, 44, 66, 0.5)'],
    [0.74, 0.62, 0.48, 'rgba(48, 36, 56, 0.45)'],
    [0.52, 0.86, 0.4, 'rgba(30, 24, 36, 0.5)'],
    [0.14, 0.78, 0.36, 'rgba(38, 28, 44, 0.4)'],
  ] as const) {
    const wash = ctx.createRadialGradient(
      cx * FLOOR_PX,
      cy * FLOOR_PX,
      8,
      cx * FLOOR_PX,
      cy * FLOOR_PX,
      radius * FLOOR_PX,
    )
    wash.addColorStop(0, tint as string)
    wash.addColorStop(1, 'rgba(36, 29, 41, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, FLOOR_PX, FLOOR_PX)
  }

  // The brass inlay: a line following the walls, as a gilded floor would have.
  const margin = Math.round(FLOOR_PX * 0.055)
  ctx.strokeStyle = 'rgba(168, 132, 46, 0.85)'
  ctx.lineWidth = 5
  ctx.strokeRect(margin, margin, FLOOR_PX - margin * 2, FLOOR_PX - margin * 2)
  ctx.strokeStyle = 'rgba(120, 92, 32, 0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(margin + 9, margin + 9, FLOOR_PX - margin * 2 - 18, FLOOR_PX - margin * 2 - 18)

  return finish(ctx)
}

/**
 * How polished the floor is, per point.
 *
 * A real polished floor is not uniformly polished: it is worn where people walk
 * and glassy where they do not, and that unevenness is most of what reads as
 * "polished" rather than "shiny". Fed to `roughnessMap`, where black is a mirror
 * and white is matt.
 */
function drawFloorRoughness(): Texture {
  const ctx = context(256, 256)

  /*
   * Near white, and varying only a little.
   *
   * `roughnessMap` *multiplies* the material's `roughness`, so a mid-grey map
   * does not mean "medium rough" — it halves whatever the material asked for.
   * A first pass at #6b6b6b took an intended 0.48 down to about 0.14, and the
   * floor did exactly what `ShopInterior` already has a note about: it
   * reflected instead of catching the light, every soft downlight pool
   * vanished, and what was left were two hard specular dots.
   *
   * White is "leave it alone". The range here is 0.84 to 1.0, which is a tenth
   * of a roughness unit either side of the value the material sets.
   */
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 256)

  // Very slightly glassier down the middle, where the floor is walked and
  // polished, than at the edges where the fixtures stand.
  const sheen = ctx.createRadialGradient(128, 128, 10, 128, 128, 150)
  sheen.addColorStop(0, '#d6d6d6')
  sheen.addColorStop(1, '#ffffff')
  ctx.fillStyle = sheen
  ctx.fillRect(0, 0, 256, 256)

  const texture = new CanvasTexture(ctx.canvas)
  texture.anisotropy = 4
  return texture
}

/**
 * Height field for a velvet nap: two crossed waves, fine and shallow.
 *
 * Velvet is not noise — it is a dense regular pile, and noise on the fitting
 * plinth reads as dirt on a carpet rather than as a fabric.
 */
function velvetHeights(): number[] {
  const size = 128
  const heights = new Array<number>(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Twenty-four cycles across the tile, which is a couple of millimetres of
      // pile once it is repeated over a plinth.
      const nap =
        Math.sin((x / size) * Math.PI * 48) * 0.5 + Math.sin((y / size) * Math.PI * 44) * 0.5
      heights[y * size + x] = nap * 0.5 + 0.5
    }
  }

  return heights
}

let wall: Texture | null = null
let velvet: Texture | null = null
let floor: Texture | null = null
let floorRoughness: Texture | null = null

/** The bays cached per wall length, so each wall keeps its own repeat. */
const wallByBays = new Map<number, Texture>()

/**
 * A run of wall, panelled into whole bays.
 *
 * Each wall needs its own repeat, and a `Texture` carries exactly one — so the
 * walls cannot share an instance. They share the *canvas*: `clone` reuses the
 * image and only the sampling settings differ, which is why this is cheap enough
 * to do per wall in a room that cannot afford much.
 *
 * @param lengthMetres How long the wall is, which sets how many bays it gets.
 */
export function getShopWallTexture(lengthMetres: number): Texture {
  wall ??= drawWall()

  const bays = Math.max(1, Math.round(lengthMetres / WALL_BAY_METRES))
  const cached = wallByBays.get(bays)
  if (cached) return cached

  const run = wall.clone()
  run.needsUpdate = true
  run.wrapS = RepeatWrapping
  run.wrapT = RepeatWrapping
  run.repeat.set(bays, 1)
  wallByBays.set(bays, run)

  return run
}

export function getShopFloorTexture(): Texture {
  floor ??= drawFloor()
  return floor
}

export function getShopFloorRoughnessTexture(): Texture {
  floorRoughness ??= drawFloorRoughness()
  return floorRoughness
}

/**
 * Velvet nap, for the fitting plinth, its rug and the window platform.
 *
 * Linear rather than sRGB: a normal map holds directions, and putting it through
 * the sRGB transfer curve bends every one of them.
 *
 * @param repeat How many times the nap tiles across the surface.
 */
export function getVelvetNormalTexture(repeat: readonly [number, number] = [6, 6]): Texture {
  if (!velvet) {
    const size = 128
    const ctx = context(size, size)
    ctx.putImageData(
      new ImageData(heightToNormal(velvetHeights(), size, size, 0.9), size, size),
      0,
      0,
    )

    velvet = new CanvasTexture(ctx.canvas)
    velvet.anisotropy = 4
    velvet.wrapS = RepeatWrapping
    velvet.wrapT = RepeatWrapping
  }

  velvet.repeat.set(repeat[0], repeat[1])
  return velvet
}
