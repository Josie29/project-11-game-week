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
 * The plum wall, with its cornice and dado.
 *
 * Vertical only — four pixels wide, because nothing about it varies along the
 * wall. Mapped to a plane the full height of the room, so `v` runs floor to
 * ceiling and the two gold lines land where joinery would put them.
 *
 * The reference's walls are not one flat colour: they darken toward the floor,
 * lift at eye level where the fittings are, and carry gold at the cornice and
 * again at the dado. Flat plum is what made this room read as a purple box with
 * furniture in it, and it is the largest single surface the player ever sees.
 */
function drawWall(): Texture {
  const height = 512
  const ctx = context(4, height)

  // Canvas y runs downward and so does v after the default flipY, so row 0 is
  // the bottom of the wall.
  const wash = ctx.createLinearGradient(0, 0, 0, height)
  wash.addColorStop(0, '#24091f')
  wash.addColorStop(0.18, '#340f2f')
  wash.addColorStop(0.52, '#45163d')
  wash.addColorStop(0.86, '#3a1235')
  wash.addColorStop(1, '#2a0c26')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, 4, height)

  /** Paints a horizontal band at a fraction of the wall's height. */
  const band = (at: number, thickness: number, fill: string): void => {
    ctx.fillStyle = fill
    ctx.fillRect(0, height - at * height - thickness / 2, 4, thickness)
  }

  // Dado, about a metre up, with a shadow under it so it reads as a moulding
  // rather than as a stripe.
  band(0.3, 5, '#8a6a24')
  band(0.288, 4, 'rgba(20, 6, 18, 0.55)')

  // Cornice, just under the ceiling.
  band(0.93, 7, '#a07f2c')
  band(0.915, 5, 'rgba(20, 6, 18, 0.5)')

  return finish(ctx)
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

export function getShopWallTexture(): Texture {
  wall ??= drawWall()
  return wall
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
