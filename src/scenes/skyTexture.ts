import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'
import type { SkyPalette } from '../world/timeOfDay'

/**
 * Vertical sky gradient for the sky dome, drawn for a given hour.
 *
 * A flat black background made the towers read as holes cut out of nothing.
 * A deep blue that lifts toward a hazy horizon gives the strip its silhouette
 * back and is what the reference art trades on. The same five stops carry the
 * whole day; only the colours change.
 */
const WIDTH = 4
const HEIGHT = 512

interface CachedSky {
  readonly bucket: number
  readonly texture: Texture
}

/**
 * One texture alive at a time.
 *
 * The palette changes every few seconds, so caching by key would accumulate a
 * gradient per step of the day and leak the lot. Time only moves forward, so
 * the previous step is never wanted again — dispose it and redraw.
 */
let cached: CachedSky | null = null

function drawSky(palette: SkyPalette): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the sky')
  }

  // Sphere UVs put v = 1 at the top, and the canvas top maps there via flipY.
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, palette.zenith)
  gradient.addColorStop(0.32, palette.upper)
  gradient.addColorStop(0.6, palette.mid)
  gradient.addColorStop(0.85, palette.horizon)
  gradient.addColorStop(1, palette.haze)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

/**
 * The sky for a step of the day.
 *
 * @param bucket Identifies the step, so repeat calls within one reuse the
 *   texture rather than redrawing it every render.
 * @param palette Colours for that step.
 */
export function getSkyTexture(bucket: number, palette: SkyPalette): Texture {
  if (cached && cached.bucket === bucket) return cached.texture

  cached?.texture.dispose()
  cached = { bucket, texture: drawSky(palette) }
  return cached.texture
}
