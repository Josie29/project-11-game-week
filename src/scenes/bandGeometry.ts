import { BufferAttribute, BufferGeometry } from 'three'
import type { TablePoint } from './crapsTableLayout'

/**
 * Builds a vertical band that follows a closed outline — a wall, in other words.
 *
 * `TubeGeometry` sweeps a circle and `ExtrudeGeometry` writes shape coordinates
 * as UVs, and the craps table needs neither: its bumper and its apron are flat
 * vertical strips that have to carry a tiled texture without it stretching round
 * the corners. So the UVs here are arc length across and height up, which is the
 * only mapping under which a pyramid-rubber pattern stays square all the way
 * round the pit.
 *
 * @param points Outline, viewed from above, without the first point repeated.
 * @param bottomY Height of the band's lower edge.
 * @param topY Height of its upper edge.
 * @param options.inward Whether the band is seen from inside the outline, which
 *   flips both the winding and the normals.
 * @param options.tilesPerMetre How many texture repeats fit in a metre of
 *   outline. The vertical axis always spans exactly one repeat.
 * @returns A geometry with position, normal and uv attributes.
 * @throws Error if fewer than three outline points are given.
 */
export function buildBandGeometry(
  points: readonly TablePoint[],
  bottomY: number,
  topY: number,
  options: { inward: boolean; tilesPerMetre?: number },
): BufferGeometry {
  if (points.length < 3) {
    throw new Error(`A band needs at least three outline points, got ${points.length}`)
  }

  const { inward, tilesPerMetre = 1 } = options
  const facing = inward ? -1 : 1

  // Walk the outline once to place vertices, closing the loop by repeating the
  // first point with its accumulated arc length so the seam's UVs line up.
  const count = points.length + 1
  const positions = new Float32Array(count * 2 * 3)
  const normals = new Float32Array(count * 2 * 3)
  const uvs = new Float32Array(count * 2 * 2)

  let travelled = 0

  for (let index = 0; index < count; index++) {
    const point = points[index % points.length]!
    const previous = points[(index - 1 + points.length) % points.length]!
    const next = points[(index + 1) % points.length]!

    if (index > 0) {
      travelled += Math.hypot(point.x - previous.x, point.z - previous.z)
    }

    // Outward normal from the tangent through the neighbouring points, which
    // stays smooth round the corners where a per-segment normal would facet.
    const tangentX = next.x - previous.x
    const tangentZ = next.z - previous.z
    const length = Math.hypot(tangentX, tangentZ) || 1
    const normalX = (tangentZ / length) * facing
    const normalZ = (-tangentX / length) * facing

    const u = travelled * tilesPerMetre

    for (const [slot, y] of [
      [0, bottomY],
      [1, topY],
    ] as const) {
      const vertex = index * 2 + slot
      positions[vertex * 3] = point.x
      positions[vertex * 3 + 1] = y
      positions[vertex * 3 + 2] = point.z
      normals[vertex * 3] = normalX
      normals[vertex * 3 + 1] = 0
      normals[vertex * 3 + 2] = normalZ
      uvs[vertex * 2] = u
      uvs[vertex * 2 + 1] = slot
    }
  }

  const indices: number[] = []
  for (let index = 0; index < count - 1; index++) {
    const bottomLeft = index * 2
    const topLeft = bottomLeft + 1
    const bottomRight = bottomLeft + 2
    const topRight = bottomLeft + 3

    /*
     * Wound so the front face points the way the normals do. The outlines run
     * counter-clockwise in x/z, which reads clockwise looking down at the
     * table, so the outward-facing order is the reverse of what it looks like
     * it should be on paper. Getting this backwards renders the whole band
     * back-facing: the rail's outer wall vanishes and you see straight through
     * the table to the inside of its far side, which is not obviously a winding
     * bug when you are looking at it.
     */
    if (inward) {
      indices.push(bottomLeft, topRight, topLeft, bottomLeft, bottomRight, topRight)
    } else {
      indices.push(bottomLeft, topLeft, topRight, bottomLeft, topRight, bottomRight)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/**
 * Builds a flat horizontal ring between two concentric outlines.
 *
 * This is the rail's top face. The two outlines must have the same point count
 * and run the same way round, which `roundedRectOutline` guarantees for any two
 * calls with the same segment count.
 *
 * UVs run along the ring's arc length and across its width, so a wood grain can
 * be tiled lengthways and stay unstretched at the corners.
 *
 * @param inner Inner outline, viewed from above.
 * @param outer Outer outline, with the same number of points.
 * @param y Height of the ring.
 * @param tilesPerMetre Texture repeats per metre along the ring.
 * @throws Error if the two outlines do not have the same number of points.
 */
export function buildRingGeometry(
  inner: readonly TablePoint[],
  outer: readonly TablePoint[],
  y: number,
  tilesPerMetre = 1,
): BufferGeometry {
  if (inner.length !== outer.length) {
    throw new Error(
      `A ring needs matching outlines, got ${inner.length} inner and ${outer.length} outer`,
    )
  }

  const count = inner.length + 1
  const positions = new Float32Array(count * 2 * 3)
  const normals = new Float32Array(count * 2 * 3)
  const uvs = new Float32Array(count * 2 * 2)

  let travelled = 0

  for (let index = 0; index < count; index++) {
    const slot = index % inner.length
    const previousSlot = (index - 1 + inner.length) % inner.length
    const innerPoint = inner[slot]!
    const outerPoint = outer[slot]!

    if (index > 0) {
      const previous = outer[previousSlot]!
      travelled += Math.hypot(outerPoint.x - previous.x, outerPoint.z - previous.z)
    }

    const u = travelled * tilesPerMetre

    for (const [side, point] of [
      [0, innerPoint],
      [1, outerPoint],
    ] as const) {
      const vertex = index * 2 + side
      positions[vertex * 3] = point.x
      positions[vertex * 3 + 1] = y
      positions[vertex * 3 + 2] = point.z
      normals[vertex * 3 + 1] = 1
      uvs[vertex * 2] = u
      uvs[vertex * 2 + 1] = side
    }
  }

  const indices: number[] = []
  for (let index = 0; index < count - 1; index++) {
    const innerHere = index * 2
    const outerHere = innerHere + 1
    const innerNext = innerHere + 2
    const outerNext = innerHere + 3
    // Upward-facing, for the same reason the band's outward order is reversed.
    indices.push(innerHere, outerNext, outerHere, innerHere, innerNext, outerNext)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}
