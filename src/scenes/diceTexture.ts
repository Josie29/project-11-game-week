import { CanvasTexture, SRGBColorSpace, type Texture } from 'three'

/**
 * Die faces drawn to canvas, the same approach the cards and felt use.
 *
 * Six small textures, generated once and cached.
 */
const SIZE = 256
const PIP_RADIUS = SIZE * 0.088
const FACE_COLOUR = '#f2f0ea'
const PIP_COLOUR = '#1a1118'
/** Casino dice are translucent red with sharp corners; this is the house red. */
const EDGE_COLOUR = '#b8202f'

/** Pip positions per face, in thirds of the face. */
const PIP_LAYOUTS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  1: [[0.5, 0.5]],
  2: [
    [0.28, 0.28],
    [0.72, 0.72],
  ],
  3: [
    [0.26, 0.26],
    [0.5, 0.5],
    [0.74, 0.74],
  ],
  4: [
    [0.28, 0.28],
    [0.72, 0.28],
    [0.28, 0.72],
    [0.72, 0.72],
  ],
  5: [
    [0.26, 0.26],
    [0.74, 0.26],
    [0.5, 0.5],
    [0.26, 0.74],
    [0.74, 0.74],
  ],
  6: [
    [0.28, 0.24],
    [0.72, 0.24],
    [0.28, 0.5],
    [0.72, 0.5],
    [0.28, 0.76],
    [0.72, 0.76],
  ],
}

const faceCache = new Map<number, Texture>()

function drawFace(value: number): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not acquire a 2D canvas context for a die face')
  }

  ctx.fillStyle = FACE_COLOUR
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Inset border, so the die reads as having edges at a glance.
  ctx.strokeStyle = EDGE_COLOUR
  ctx.lineWidth = SIZE * 0.045
  ctx.strokeRect(SIZE * 0.055, SIZE * 0.055, SIZE * 0.89, SIZE * 0.89)

  ctx.fillStyle = PIP_COLOUR
  for (const [x, y] of PIP_LAYOUTS[value] ?? []) {
    ctx.beginPath()
    ctx.arc(x * SIZE, y * SIZE, PIP_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Returns the cached texture for a die face, drawing it on first request. */
export function getDieFaceTexture(value: number): Texture {
  const cached = faceCache.get(value)
  if (cached) return cached

  const texture = drawFace(value)
  faceCache.set(value, texture)
  return texture
}

/**
 * Pip values per box face, in three.js material order `[+x, -x, +y, -y, +z, -z]`.
 *
 * Opposite faces sum to seven, as on a real die.
 */
export const DIE_FACE_VALUES: readonly number[] = [3, 4, 1, 6, 2, 5]

/**
 * Euler rotation that brings a given pip value to face upward.
 *
 * Derived from `DIE_FACE_VALUES`: the physics tumble decides where a die comes
 * to rest, but the engine has already decided what it shows, so the die is
 * turned to agree with the result rather than the result read off the die.
 */
export const FACE_UP_ROTATIONS: Readonly<Record<number, readonly [number, number, number]>> = {
  1: [0, 0, 0],
  6: [Math.PI, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
}
