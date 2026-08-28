import { describe, expect, it } from 'vitest'
import {
  betChipSlot,
  CRAPS_BET_SLOTS,
  CrapsBet,
  hitTestCrapsFelt,
  PLACE_BETS,
  POINT_BOX_RECTS,
  POINT_NUMBERS,
  pointPuckSpot,
} from '../scenes/crapsFeltLayout'
import { CHIP_RADIUS, CRAPS_CHIP_SCALE } from '../scenes/chipLayout'
import { CRAPS_ORIGIN, TABLE_FOOTPRINTS, TableId } from '../scenes/casinoFloorLayout'
import {
  CHIP_CHANNEL_OFFSET,
  CHIP_CHANNEL_WIDTH,
  DICE_LINEAR_DAMPING,
  DICE_REST_POSITIONS,
  DICE_THROW_ORIGINS,
  DICE_THROW_VELOCITIES,
  DIE_HALF,
  DIE_RESTITUTION,
  DRINK_HOLDER_OFFSET,
  DRINK_HOLDER_RADIUS,
  DRINK_HOLDERS,
  feltShapeUv,
  feltToWorld,
  feltUvToLayout,
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
  WALL_RESTITUTION,
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
    // A resting die left inside a bumper does not look wrong, it looks absent —
    // this project has already lost a die to y = -18 once, and it took a
    // diagnostic to find it.
    for (const [x, , z] of DICE_REST_POSITIONS) {
      expect(isInCrapsPit(x, z, DIE_HALF)).toBe(true)
    }
  })

  it('releases both dice from over the felt, not over the rail', () => {
    // Released over the rail, a die drops onto wood and skitters off the table
    // instead of into the pit.
    for (const [x, , z] of DICE_THROW_ORIGINS) {
      expect(isInCrapsPit(x, z, DIE_HALF)).toBe(true)
    }
  })

  /*
   * The throw has to run the length of the table, which is the whole reason the
   * table was made long. Released in the middle, or aimed across the short
   * axis, the dice travel about a metre and stop — which reads as dropping them
   * rather than shooting them, and no screenshot of the settled dice shows it.
   */
  it('shoots from one end, down the long axis, at the far wall', () => {
    for (const [x] of DICE_THROW_ORIGINS) {
      // Released in the far third of the table's length...
      expect(x).toBeLessThan(-PIT_HALF_WIDTH * 0.66)
    }

    for (const [vx, , vz] of DICE_THROW_VELOCITIES) {
      // ...and thrown mostly along it, not across it.
      expect(vx).toBeGreaterThan(0)
      expect(Math.abs(vx)).toBeGreaterThan(Math.abs(vz) * 3)
    }

    // Fast enough to actually cross a table this long. At the old throw's speed
    // the dice died around the middle of it.
    const reach = Math.min(...DICE_THROW_VELOCITIES.map(([vx]) => vx))
    expect(reach).toBeGreaterThan(PIT_HALF_WIDTH)
  })

  /*
   * The other half of a craps throw: the dice strike the far wall and come
   * back down the table. Rapier's linear damping sheds speed at exactly
   * `dv/dx = -λ` along the flight, so the impact speed is arithmetic rather
   * than simulation — and the walls answering with restitution is what was
   * missing when the dice crossed the table and simply died at the far end.
   */
  it('reaches the far wall fast enough to bounce back', () => {
    for (const [index, [originX]] of DICE_THROW_ORIGINS.entries()) {
      const vx = DICE_THROW_VELOCITIES[index]![0]
      const impact = vx - DICE_LINEAR_DAMPING * (PIT_HALF_WIDTH - originX)

      // Arrives with real pace, not a crawl that taps the wall and stops.
      expect(impact).toBeGreaterThan(2)

      // Rapier averages the two surfaces' restitution in a contact, so the
      // rebound is that average of the die's and the wall's. Anything much
      // under 1.5 m/s reads as the wall absorbing the throw.
      const rebound = impact * ((DIE_RESTITUTION + WALL_RESTITUTION) / 2)
      expect(rebound).toBeGreaterThan(1.5)
    }
  })

  it('parks the OFF puck on the felt and clear of the resting dice', () => {
    // The puck and the dice are the only loose objects on the felt between
    // throws. Overlapping, the puck reads as a third die sitting under the two
    // real ones, which is not obviously wrong until you know what you are
    // looking at.
    const [puckX, puckZ] = PUCK_OFF_POSITION
    expect(isInCrapsPit(puckX, puckZ, PUCK_RADIUS)).toBe(true)

    for (const [dieX, , dieZ] of DICE_REST_POSITIONS) {
      const gap = Math.hypot(puckX - dieX, puckZ - dieZ)
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
  it("keeps every bet and all eight players' chips on the felt", () => {
    // `feltToWorld` scales by the pit, so a resized pit moves the print and the
    // chips together — but only if every stack was inside the felt to start
    // with. A chip stack overhanging the bumper is the craps table's version of
    // the payout that fell off the blackjack table's edge, and every bet now
    // seats eight players' stacks, so the slot at the very end of a band is
    // exactly the nudge that puts one over an edge without moving the print.
    const chipRadius = CHIP_RADIUS * CRAPS_CHIP_SCALE
    for (const bet of Object.values(CrapsBet)) {
      for (let slot = 0; slot < CRAPS_BET_SLOTS; slot++) {
        const { u, v } = betChipSlot(bet, slot)
        const [x, , z] = feltToWorld(u, v)
        expect(isInCrapsPit(x, z, chipRadius), `${bet} slot ${slot}`).toBe(true)
      }
    }
  })

  it('keeps the ON puck on the felt over every point it can be parked on', () => {
    for (const point of POINT_NUMBERS) {
      const { u, v } = pointPuckSpot(point)
      const [x, , z] = feltToWorld(u, v)
      expect(isInCrapsPit(x, z, PUCK_RADIUS)).toBe(true)
    }
  })

  /*
   * The point is usually a number the player has money on, so the puck and a
   * stack of chips want the same box. Overlapping, the puck buries the chips
   * and the felt stops saying how much is on the number it is sitting on.
   */
  it('keeps the puck clear of every slot of chips inside the same box', () => {
    const chipRadius = CHIP_RADIUS * CRAPS_CHIP_SCALE
    for (const point of POINT_NUMBERS) {
      const puck = pointPuckSpot(point)
      const [puckX, , puckZ] = feltToWorld(puck.u, puck.v)
      const rect = POINT_BOX_RECTS[point]

      // The puck itself stays inside its box.
      expect(puck.u).toBeGreaterThan(rect.u0)
      expect(puck.u).toBeLessThan(rect.u1)
      expect(puck.v).toBeGreaterThan(rect.v0)
      expect(puck.v).toBeLessThan(rect.v1)

      for (let slot = 0; slot < CRAPS_BET_SLOTS; slot++) {
        const chips = betChipSlot(PLACE_BETS[point], slot)
        const [chipX, , chipZ] = feltToWorld(chips.u, chips.v)

        expect(
          Math.hypot(puckX - chipX, puckZ - chipZ),
          `${point} slot ${slot}`,
        ).toBeGreaterThan(PUCK_RADIUS + chipRadius)

        // And every slot still inside the box it belongs to.
        expect(chips.u, `${point} slot ${slot} u`).toBeGreaterThan(rect.u0)
        expect(chips.u, `${point} slot ${slot} u`).toBeLessThan(rect.u1)
        expect(chips.v, `${point} slot ${slot} v`).toBeGreaterThan(rect.v0)
        expect(chips.v, `${point} slot ${slot} v`).toBeLessThan(rect.v1)
      }
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

describe('reading a click off the felt', () => {
  /*
   * The closed loop. A bet's chips are drawn at `betChipSpot`; a click landing
   * on those chips has to come back as the same bet.
   *
   * Three transforms sit between the two — the geometry's UVs are shape
   * coordinates in metres, the material rescales them in the shader, and the
   * texture's flipY runs the layout's v against the shape's. Each is invisible
   * on its own: get one wrong and the felt answers confidently about a
   * different bet, which looks like a mis-drawn table rather than a mis-read
   * click. This is the only thing that catches it.
   */
  it('brings a click on any slot of a bet back as that bet', () => {
    for (const bet of Object.values(CrapsBet)) {
      for (let slot = 0; slot < CRAPS_BET_SLOTS; slot++) {
        const spot = betChipSlot(bet, slot)
        const [x, , z] = feltToWorld(spot.u, spot.v)

        // Exactly what a raycast onto the felt reports.
        const raw = feltShapeUv(x, z)
        const layout = feltUvToLayout(raw.u, raw.v)

        expect(layout.u, `${bet} slot ${slot} u`).toBeCloseTo(spot.u)
        expect(layout.v, `${bet} slot ${slot} v`).toBeCloseTo(spot.v)
        expect(hitTestCrapsFelt(layout.u, layout.v), `${bet} slot ${slot}`).toBe(bet)
      }
    }
  })

  /*
   * And the direction is right, not merely self-consistent. A v-flip that was
   * missed cancels out in a round trip and only shows as the near half of the
   * table answering for the far half — so the ends are pinned to the edges they
   * belong to.
   */
  it('puts the shooter at v = 1 and the boxman at v = 0', () => {
    const near = feltShapeUv(0, PIT_HALF_DEPTH)
    expect(feltUvToLayout(near.u, near.v).v).toBeCloseTo(1)

    const far = feltShapeUv(0, -PIT_HALF_DEPTH)
    expect(feltUvToLayout(far.u, far.v).v).toBeCloseTo(0)

    const right = feltShapeUv(PIT_HALF_WIDTH, 0)
    expect(feltUvToLayout(right.u, right.v).u).toBeCloseTo(1)
  })
})
