import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/**
 * Vertical night-sky gradient for the sky dome.
 *
 * A flat black background made the towers read as holes cut out of nothing.
 * A deep blue that lifts toward a hazy horizon gives the strip its silhouette
 * back and is what the reference art trades on.
 */
const WIDTH = 4
const HEIGHT = 512

const ZENITH = '#070b22'
const UPPER = '#0f1738'
const MID = '#1c2a56'
const HORIZON = '#3a4a7d'
const HAZE = '#55608c'

let skyTexture: Texture | null = null

function drawSky(): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for the sky')
  }

  // Sphere UVs put v = 1 at the top, and the canvas top maps there via flipY.
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT)
  gradient.addColorStop(0, ZENITH)
  gradient.addColorStop(0.32, UPPER)
  gradient.addColorStop(0.6, MID)
  gradient.addColorStop(0.85, HORIZON)
  gradient.addColorStop(1, HAZE)

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function getSkyTexture(): Texture {
  skyTexture ??= drawSky()
  return skyTexture
}
