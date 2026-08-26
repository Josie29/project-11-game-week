import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { lerpHex } from '../world/timeOfDay'

/*
 * The roadway surface: asphalt, lane markings and a crossing, one block's worth.
 *
 * There used to be a comment in `Strip.tsx` explaining why the strip had no
 * centre line — that the reflector multiplies the captured reflection into the
 * base colour, so a flat-shaded stripe laid on top of the road came out brighter
 * than the road itself and pulled the eye off the neon. That was a correct
 * observation about the wrong approach. Markings belong in the roadway's own
 * `map`, where the multiply takes them along with everything else: on a wet
 * night the reflection drags the white into streaks exactly the way it drags the
 * neon, which is what a wet road actually does to paint.
 *
 * One tile is one block, and the crossing is painted across the middle of it.
 * That is the whole reason `BLOCK_DEPTH` is written down: the towers step on it
 * and the doors sit on it, so a crossing lands outside every door without anyone
 * maintaining a second list of where the doors are.
 */

/** Pixels across the tile. The road is 10 wide and one block deep. */
const WIDTH = 512
const HEIGHT = 512

/**
 * Night and day surfaces.
 *
 * Asphalt does not change colour at midnight, but the texture is multiplied into
 * a base tint that does, and paint that reads at noon glows at night. The day
 * values come off `art/refs/strip_exterior_day.png`, where the markings are
 * noticeably duller than white — sun-bleached, not fresh.
 */
const NIGHT = {
  asphalt: '#4a4a55',
  patch: '#42424d',
  joint: '#3b3b46',
  paintWhite: '#9d9db0',
  paintYellow: '#9d8a4e',
} as const

const DAY = {
  asphalt: '#8e8c8a',
  patch: '#85837f',
  joint: '#7a7874',
  paintWhite: '#e8e6e0',
  paintYellow: '#e0bd52',
} as const

interface RoadPalette {
  readonly asphalt: string
  readonly patch: string
  readonly joint: string
  readonly paintWhite: string
  readonly paintYellow: string
}

function paletteFor(daylight: number): RoadPalette {
  const t = Math.min(1, Math.max(0, daylight))
  return {
    asphalt: lerpHex(NIGHT.asphalt, DAY.asphalt, t),
    patch: lerpHex(NIGHT.patch, DAY.patch, t),
    joint: lerpHex(NIGHT.joint, DAY.joint, t),
    paintWhite: lerpHex(NIGHT.paintWhite, DAY.paintWhite, t),
    paintYellow: lerpHex(NIGHT.paintYellow, DAY.paintYellow, t),
  }
}

/** Deterministic value hash in [0, 1), so the patching never reshuffles. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 71.9 + y * 219.3) * 34761.913
  return n - Math.floor(n)
}

function drawRoad(target: HTMLCanvasElement, daylight: number): void {
  const ctx = target.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the roadway')
  }

  const palette = paletteFor(daylight)

  ctx.fillStyle = palette.asphalt
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  /*
   * Mottling and patched repairs, before any paint goes down.
   *
   * The road was one flat grey, and a flat grey plane under a reflection reads
   * as a mirror rather than as tarmac. These are barely visible individually and
   * are the whole difference between a surface and a fill.
   */
  for (let i = 0; i < 220; i++) {
    const roll = hash(i, 1)
    const size = 4 + roll * 26
    ctx.fillStyle = roll > 0.5 ? palette.patch : palette.joint
    ctx.globalAlpha = 0.16 + hash(i, 2) * 0.2
    ctx.fillRect(hash(i, 3) * WIDTH, hash(i, 4) * HEIGHT, size, size * (0.4 + hash(i, 5)))
  }

  // A couple of larger resurfaced squares, with a visible seam.
  ctx.globalAlpha = 0.3
  for (const [px, py, pw, ph] of [
    [0.08, 0.18, 0.22, 0.14],
    [0.62, 0.55, 0.3, 0.2],
  ] as const) {
    ctx.fillStyle = palette.patch
    ctx.fillRect(px * WIDTH, py * HEIGHT, pw * WIDTH, ph * HEIGHT)
    ctx.strokeStyle = palette.joint
    ctx.lineWidth = 3
    ctx.strokeRect(px * WIDTH, py * HEIGHT, pw * WIDTH, ph * HEIGHT)
  }
  ctx.globalAlpha = 1

  /*
   * Double yellow down the centre, then a lane dash either side of it, then a
   * solid white edge line inboard of each kerb. Four lanes, which is what the
   * ten metres between the kerbs will carry.
   */
  const centre = WIDTH / 2
  const yellowGap = WIDTH * 0.012
  const yellowWidth = WIDTH * 0.012

  ctx.fillStyle = palette.paintYellow
  ctx.fillRect(centre - yellowGap - yellowWidth, 0, yellowWidth, HEIGHT)
  ctx.fillRect(centre + yellowGap, 0, yellowWidth, HEIGHT)

  ctx.fillStyle = palette.paintWhite
  const edgeInset = WIDTH * 0.06
  ctx.fillRect(edgeInset, 0, WIDTH * 0.01, HEIGHT)
  ctx.fillRect(WIDTH - edgeInset - WIDTH * 0.01, 0, WIDTH * 0.01, HEIGHT)

  /*
   * Lane dashes. Three to a block, so the rhythm reads as movement down the
   * street rather than as a repeating tile — the crossing below already gives
   * the tile away once per block, and a single dash per tile would give it away
   * twice.
   */
  const dashCount = 3
  const dashLength = HEIGHT / (dashCount * 2.4)
  for (const laneX of [WIDTH * 0.26, WIDTH * 0.74]) {
    for (let i = 0; i < dashCount; i++) {
      const y = (i / dashCount) * HEIGHT + dashLength * 0.2
      ctx.fillRect(laneX, y, WIDTH * 0.01, dashLength)
    }
  }

  /*
   * The crossing, across the middle of the tile.
   *
   * Centred because `roadTextureOffset` phases the tile so its centre lands on a
   * block line, and a block line is where the doors are. The bars stop short of
   * the kerbs, as they do in the reference.
   */
  const barCount = 9
  const zebraTop = HEIGHT * 0.42
  const zebraHeight = HEIGHT * 0.16
  const zebraFrom = WIDTH * 0.07
  const zebraTo = WIDTH * 0.93
  const barPitch = (zebraTo - zebraFrom) / barCount

  // Paint over the lane markings first: they do not run through a crossing.
  ctx.fillStyle = palette.asphalt
  ctx.fillRect(0, zebraTop - 4, WIDTH, zebraHeight + 8)

  ctx.fillStyle = palette.paintWhite
  for (let i = 0; i < barCount; i++) {
    ctx.fillRect(zebraFrom + i * barPitch, zebraTop, barPitch * 0.55, zebraHeight)
  }

  // Stop lines either side of it.
  ctx.fillRect(centre + yellowGap, zebraTop - HEIGHT * 0.05, WIDTH / 2 - yellowGap, HEIGHT * 0.014)
  ctx.fillRect(0, zebraTop + zebraHeight + HEIGHT * 0.036, centre - yellowGap, HEIGHT * 0.014)
}

let canvas: HTMLCanvasElement | null = null
let roadTexture: Texture | null = null
let drawnBucket: number | null = null

/**
 * The shared roadway texture, drawn on first request.
 *
 * One canvas, repainted in place, for the same reason the facade is: the road is
 * a single mesh but the cross streets share the surface, and handing out fresh
 * textures would re-upload the lot on every step of the day.
 */
export function getRoadTexture(): Texture {
  if (roadTexture && canvas) return roadTexture

  canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  drawRoad(canvas, 0)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 8
  roadTexture = texture
  drawnBucket = null
  return texture
}

/**
 * Repaints the roadway for the hour, if it has moved on.
 *
 * @param bucket Step of the day, so a repeat call within one step is free.
 * @param daylight 0 through the night, 1 at midday.
 */
export function setRoadDaylight(bucket: number, daylight: number): void {
  if (drawnBucket === bucket) return

  const texture = getRoadTexture()
  if (!canvas) return

  drawRoad(canvas, daylight)
  drawnBucket = bucket
  texture.needsUpdate = true
}
