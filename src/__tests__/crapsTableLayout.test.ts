import { describe, expect, it } from 'vitest'
import { CrapsBet, getCrapsBetRect, POINT_BOX_RECTS, POINT_NUMBERS, rectCenter } from '../scenes/crapsFeltLayout'
import { CRAPS_ORIGIN, TABLE_FOOTPRINTS, TableId } from '../scenes/casinoFloorLayout'
import {
  CHIP_CHANNEL_OFFSET,
  CHIP_CHANNEL_WIDTH,
  DICE_REST_POSITION,
  DICE_REST_SPACING,
  DICE_THROW_ORIGIN,
  DICE_THROW_SPACING,
  DIE_HALF,
  DRINK_HOLDER_OFFSET,
  DRINK_HOLDER_RADIUS,
  DRINK_HOLDERS,
  feltToWorld,
  INNER_CORNER_RADIUS,
  isInCrapsPit,
  isOnCrapsRail,
  isOnCrapsTable,
  OUTER_CORNER_RADIUS,
  OUTER_HALF_DEPTH,
  OUTER_HALF_WIDTH,
  outerOutline,
  outlineLength,
  PIT_HALF_DEPTH,
  PIT_HALF_WIDTH,
  pitOutline,
  PUCK_OFF_POSITION,
  PUCK_RADIUS,
  RAIL_WIDTH,
  roundedRectOutline,
} from '../scenes/crapsTableLayout'

describe('the pit predicate', () => {
  it('accepts the middle of the felt and rejects a point past the bumper', () => {
    // A predicate that returned true everywhere would leave every test below
    // passing while proving nothing, which is why each one here is paired with
    // a point it must refuse.
    expect(isInCrapsPit(0, 0)).toBe(true)
    expect(isInCrapsPit(PIT_HALF_WIDTH + 0.05, 0)).toBe(false)
    expect(isInCrapsPit(0, PIT_HALF_DEPTH + 0.05)).toBe(false)
  })

  it('rounds the corners rather than squaring them off', () => {
    // The square corner of the bounding box, which the rounded pit cuts away.
    // Without this the predicate is just a rectangle test and the chamfered
    // physics walls it is meant to describe would not match the felt.
    expect(isInCrapsPit(PIT_HALF_WIDTH - 0.01, PIT_HALF_DEPTH - 0.01)).toBe(false)
    // The same distance in along the flat, which is still on the felt.
    expect(isInCrapsPit(PIT_HALF_WIDTH - 0.01, 0)).toBe(true)
  })

  it('shrinks by the margin, so a die can be asked to fit rather than a point', () => {
    const nearWall = PIT_HALF_WIDTH - DIE_HALF / 2
    expect(isInCrapsPit(nearWall, 0)).toBe(true)
    expect(isInCrapsPit(nearWall, 0, DIE_HALF)).toBe(false)
  })
})

describe('the table on the casino floor', () => {
  it('fits inside the footprint the player is kept out of', () => {
    // The rail more than doubled in width to match the reference. Grow it and
    // the table quietly starts poking through the box that stops the player
    // walking into it — they would clip through a corner of solid mahogany,
    // and nothing but this would say so.
    const footprint = TABLE_FOOTPRINTS[TableId.Craps]
    const [originX, , originZ] = CRAPS_ORIGIN

    expect(originX - OUTER_HALF_WIDTH).toBeGreaterThan(footprint.minX)
    expect(originX + OUTER_HALF_WIDTH).toBeLessThan(footprint.maxX)
    expect(originZ - OUTER_HALF_DEPTH).toBeGreaterThan(footprint.minZ)
    expect(originZ + OUTER_HALF_DEPTH).toBeLessThan(footprint.maxZ)
  })

  it('keeps the moulding a constant width all the way round', () => {
    // Set the two corner radii independently and the rail pinches at the
    // corners — thinner there than along the flats, which reads as a warped
    // table and is invisible from the play camera's angle.
    expect(OUTER_CORNER_RADIUS - INNER_CORNER_RADIUS).toBeCloseTo(RAIL_WIDTH)
    expect(OUTER_HALF_WIDTH - PIT_HALF_WIDTH).toBeCloseTo(RAIL_WIDTH)
    expect(OUTER_HALF_DEPTH - PIT_HALF_DEPTH).toBeCloseTo(RAIL_WIDTH)
  })
})

describe('what is let into the rail', () => {
  it('lands every drink holder on wood, clear of both edges', () => {
    // A holder half a centimetre inboard cuts a hole through the chip channel;
    // half a centimetre outboard and the brass collar hangs off the table.
    for (const holder of DRINK_HOLDERS) {
      expect(isOnCrapsRail(holder.x, holder.z, DRINK_HOLDER_RADIUS)).toBe(true)
    }
  })

  it('refuses a holder placed over the felt', () => {
    expect(isOnCrapsRail(0, 0, DRINK_HOLDER_RADIUS)).toBe(false)
    // And one placed off the outer edge entirely.
    expect(isOnCrapsRail(OUTER_HALF_WIDTH + 0.1, 0, DRINK_HOLDER_RADIUS)).toBe(false)
  })

  it('keeps the drink holders clear of the chip channel', () => {
    // Both are measured outward from the pit edge, so this is a one-dimensional
    // check and the corners follow from the outlines being concentric.
    const channelOuterEdge = CHIP_CHANNEL_OFFSET + CHIP_CHANNEL_WIDTH / 2
    const holderInnerEdge = DRINK_HOLDER_OFFSET - DRINK_HOLDER_RADIUS

    expect(holderInnerEdge).toBeGreaterThan(channelOuterEdge)
  })

  it('keeps the chip channel on the rail rather than over the felt', () => {
    expect(CHIP_CHANNEL_OFFSET - CHIP_CHANNEL_WIDTH / 2).toBeGreaterThan(0)
    expect(DRINK_HOLDER_OFFSET + DRINK_HOLDER_RADIUS).toBeLessThan(RAIL_WIDTH)
  })
})

describe('the dice', () => {
  it('parks both dice inside the pit with a die width to spare', () => {
    // The pit shrank to make room for a thicker rail. A resting die left inside
    // a bumper does not look wrong, it looks absent — this project has already
    // lost a die to y = -18 once, and it took a diagnostic to find it.
    for (let index = 0; index < 2; index++) {
      const x = DICE_REST_POSITION[0] + index * DICE_REST_SPACING
      expect(isInCrapsPit(x, DICE_REST_POSITION[2], DIE_HALF)).toBe(true)
    }
  })

  it('releases both dice from over the felt, not over the rail', () => {
    // Released over the rail, a die drops onto wood and skitters off the table
    // instead of into the pit.
    for (let index = 0; index < 2; index++) {
      const x = DICE_THROW_ORIGIN[0] + index * DICE_THROW_SPACING
      expect(isInCrapsPit(x, DICE_THROW_ORIGIN[2], DIE_HALF)).toBe(true)
    }
  })

  it('parks the OFF puck on the felt and clear of the resting dice', () => {
    // The puck and the dice are the only loose objects on the felt between
    // throws. Overlapping, the puck reads as a third die sitting under the two
    // real ones, which is not obviously wrong until you know what you are
    // looking at.
    const [puckX, puckZ] = PUCK_OFF_POSITION
    expect(isInCrapsPit(puckX, puckZ, PUCK_RADIUS)).toBe(true)

    for (let index = 0; index < 2; index++) {
      const dieX = DICE_REST_POSITION[0] + index * DICE_REST_SPACING
      const gap = Math.hypot(puckX - dieX, puckZ - DICE_REST_POSITION[2])
      expect(gap).toBeGreaterThan(PUCK_RADIUS + DIE_HALF)
    }
  })

  it('parks the OFF puck clear of every point box it could be mistaken for', () => {
    // A puck sitting half over a printed number reads as the point being on
    // that number while the table is still coming out, which is the one thing
    // the puck exists to say and the one thing it must not say wrongly.
    const [puckX, puckZ] = PUCK_OFF_POSITION

    for (const point of POINT_NUMBERS) {
      const rect = POINT_BOX_RECTS[point]
      const [minX, , minZ] = feltToWorld(rect.u0, rect.v0)
      const [maxX, , maxZ] = feltToWorld(rect.u1, rect.v1)

      const overlaps =
        puckX + PUCK_RADIUS > minX &&
        puckX - PUCK_RADIUS < maxX &&
        puckZ + PUCK_RADIUS > minZ &&
        puckZ - PUCK_RADIUS < maxZ

      expect(overlaps).toBe(false)
    }
  })
})

describe('the printed layout on the felt', () => {
  it('keeps every bet and its chips on the felt', () => {
    // `feltToWorld` scales by the pit, so a resized pit moves the print and the
    // chips together — but only if every band was inside the felt to start
    // with. A chip stack overhanging the bumper is the craps table's version of
    // the payout that fell off the blackjack table's edge.
    for (const bet of Object.values(CrapsBet)) {
      const { u, v } = rectCenter(getCrapsBetRect(bet))
      const [x, , z] = feltToWorld(u, v)
      expect(isInCrapsPit(x, z, 0.12)).toBe(true)
    }
  })

  it('keeps the ON puck on the felt over every point it can be parked on', () => {
    for (const point of POINT_NUMBERS) {
      const { u, v } = rectCenter(POINT_BOX_RECTS[point])
      const [x, , z] = feltToWorld(u, v)
      expect(isInCrapsPit(x, z, 0.1)).toBe(true)
    }
  })

  it('maps the felt corners to the pit corners', () => {
    const [nearX, , nearZ] = feltToWorld(0, 0)
    expect(nearX).toBeCloseTo(-PIT_HALF_WIDTH)
    expect(nearZ).toBeCloseTo(-PIT_HALF_DEPTH)

    const [farX, , farZ] = feltToWorld(1, 1)
    expect(farX).toBeCloseTo(PIT_HALF_WIDTH)
    expect(farZ).toBeCloseTo(PIT_HALF_DEPTH)
  })
})

describe('the outlines the geometry is swept along', () => {
  it('traces a closed loop that stays on its own boundary', () => {
    // The bumper and the rail are separate meshes swept along these. If the
    // outline strayed off the shape the predicates describe, the felt and the
    // colliders would disagree and the dice would bounce off nothing.
    for (const point of pitOutline(12)) {
      expect(isInCrapsPit(point.x, point.z, -0.001)).toBe(true)
      expect(isInCrapsPit(point.x, point.z, 0.001)).toBe(false)
    }
    for (const point of outerOutline(12)) {
      expect(isOnCrapsTable(point.x, point.z, -0.001)).toBe(true)
      expect(isOnCrapsTable(point.x, point.z, 0.001)).toBe(false)
    }
  })

  it('gives both outlines the same point count, so a ring can span them', () => {
    // `buildRingGeometry` pairs them index for index and throws otherwise; the
    // rail top is exactly that ring.
    expect(outerOutline(12)).toHaveLength(pitOutline(12).length)
  })

  it('measures a rounded rectangle as its flats plus one full circle', () => {
    // Arc length is what the textures tile against, so a wrong length shows up
    // as wood grain that stretches round the corners.
    const halfWidth = 2
    const halfDepth = 1.2
    const radius = 0.5
    const expected =
      (halfWidth - radius) * 4 + (halfDepth - radius) * 4 + 2 * Math.PI * radius

    // Loose: the corners are traced as line segments, which cut the arc very
    // slightly short. Sixty segments a corner is well inside a millimetre.
    expect(outlineLength(roundedRectOutline(halfWidth, halfDepth, radius, 60))).toBeCloseTo(
      expected,
      2,
    )
  })
})
