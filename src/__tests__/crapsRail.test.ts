import { describe, expect, it } from 'vitest'
import {
  CRAPS_RAIL_SPOTS,
  crapsRailFacing,
  crapsRailHasRoom,
  crapsRailSpot,
  SEATED_TARGET,
  SEATED_VIEW,
  seatedCameraAt,
  SEATS,
  TABLE_FOOTPRINTS,
  TableId,
} from '../scenes/casinoFloorLayout'
import {
  DICE_REST_POSITIONS,
  OUTER_HALF_DEPTH,
  OUTER_HALF_WIDTH,
  PIT_HALF_DEPTH,
} from '../scenes/crapsTableLayout'
import {
  framedFractionY,
  frameWidth,
  LANDSCAPE_ASPECT,
  subtendedAngle,
} from '../world/camera'

describe('crapsRailSpot', () => {
  // A lone player is the shooter, and the shooter's spot and the solo spot must
  // be the same place — beside the resting dice at the short end — or the throw
  // reads as somebody else's the moment a second player arrives.
  it('leaves a single player on the shooter spot', () => {
    expect(CRAPS_RAIL_SPOTS[0]).toEqual(SEATS[TableId.Craps])
    expect(crapsRailSpot('a', 'a', ['a'])).toEqual(SEATS[TableId.Craps])
  })

  // Whoever holds the dice stands at the shooter's end, whether they arrived
  // first or last — the throw has to read as theirs.
  it('puts the shooter at the shooter end regardless of arrival order', () => {
    expect(crapsRailSpot('c', 'c', ['a', 'b', 'c'])).toEqual(CRAPS_RAIL_SPOTS[0])
    expect(crapsRailSpot('a', 'a', ['a', 'b', 'c'])).toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // Everybody else spreads along the rail rather than stacking on one spot,
  // which is the bug two players found by standing inside each other.
  it('gives everyone else their own place', () => {
    const lineup = ['a', 'b', 'c', 'd']
    const spots = lineup.map((id) => crapsRailSpot(id, 'b', lineup))

    expect(new Set(spots.map((s) => s[0])).size).toBe(lineup.length)
    expect(spots[1]).toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // The lineup arrives over a socket and can lag a join. Somebody it has not
  // caught up with must not be dropped on top of the shooter.
  it('does not stack an unknown player on the shooter', () => {
    expect(crapsRailSpot('stranger', 'a', ['a', 'b'])).not.toEqual(CRAPS_RAIL_SPOTS[0])
  })

  // The spec's cap is eight players, and every one of them must have their own
  // place at the rail — the rail used to stop at five spots, so the back three
  // of a full line stood inside each other at the far end.
  it('gives a full table of eight a distinct spot each', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const spots = eight.map((id) => crapsRailSpot(id, 'a', eight))

    expect(CRAPS_RAIL_SPOTS).toHaveLength(eight.length)
    expect(new Set(spots.map((spot) => spot.join(','))).size).toBe(eight.length)
  })

  // A lineup momentarily larger than the rail — a race the socket can produce —
  // must clamp to a real place rather than crash or land off the table.
  it('never returns a place that does not exist', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    for (const id of many) {
      expect(CRAPS_RAIL_SPOTS).toContain(crapsRailSpot(id, 'a', many))
    }
  })
})

describe('crapsRailFacing', () => {
  // Every spot must look at the felt. A near-rail spot faces across -z, the
  // two around the far end face across -x, and the shooter's end faces across
  // +x — a player facing away from the table they are betting on is the
  // seated-figure equivalent of a wrong seat.
  it('faces every spot at the table', () => {
    for (const spot of CRAPS_RAIL_SPOTS) {
      const pastTheFarEnd = spot[0] > OUTER_HALF_WIDTH
      const pastTheShooterEnd = spot[0] < -OUTER_HALF_WIDTH
      expect(crapsRailFacing(spot)).toBe(
        pastTheShooterEnd ? Math.PI / 2 : pastTheFarEnd ? -Math.PI / 2 : Math.PI,
      )
      // And a near-rail spot stands off the table, not inside the woodwork.
      if (!pastTheFarEnd && !pastTheShooterEnd) {
        expect(spot[2]).toBeGreaterThan(OUTER_HALF_DEPTH)
      }
    }
  })

  // The throw flies down the table toward +x, and the figure it has to read as
  // belonging to must face the same way — a shooter with their back to the
  // dice is the picture this pins against.
  it('faces the shooter down the length of the table', () => {
    expect(crapsRailFacing(CRAPS_RAIL_SPOTS[0]!)).toBe(Math.PI / 2)
  })
})

describe('the shooter spot', () => {
  // The spec: the shooter throws "from a fixed spot at a short end of the
  // table". The figure must stand past the woodwork at the same end the dice
  // wait at, close enough that the pair on the felt reads as theirs — the spot
  // used to be a metre away around the corner on the long rail.
  it('stands the shooter at the short end beside the resting dice', () => {
    const [x, , z] = SEATS[TableId.Craps]

    expect(x).toBeLessThan(-OUTER_HALF_WIDTH)
    expect(Math.abs(z)).toBeLessThan(PIT_HALF_DEPTH)

    for (const [dieX, , dieZ] of DICE_REST_POSITIONS) {
      expect(Math.sign(dieX)).toBe(Math.sign(x))
      expect(Math.hypot(x - dieX, z - dieZ)).toBeLessThan(1.2)
    }
  })

  // The footprint is what keeps the walking player out of the table, and it
  // has to cover the people standing at it too — the far-end spots sat outside
  // it for a while, so a walker could stand inside a figure at the rail.
  it('keeps every rail spot inside the table keep-out', () => {
    const box = TABLE_FOOTPRINTS[TableId.Craps]

    for (const [x, , z] of CRAPS_RAIL_SPOTS) {
      expect(x).toBeGreaterThan(box.minX)
      expect(x).toBeLessThan(box.maxX)
      expect(z).toBeGreaterThan(box.minZ)
      expect(z).toBeLessThan(box.maxZ)
    }
  })

  /*
   * The fixed table camera has to hold the new spot. Width across the view is
   * measured from the look target, which sits at the centre of the frame by
   * construction, so "inside the horizontal frame" is an angle against half
   * the frame's width — and height is checked separately, because width says
   * nothing about whether something is on screen (the waterfall lesson).
   */
  it('keeps the shooter inside the fixed table camera frame', () => {
    const view = SEATED_VIEW[TableId.Craps]
    const target = SEATED_TARGET[TableId.Craps]
    const camera = seatedCameraAt(view, target)
    const spot = CRAPS_RAIL_SPOTS[0]!

    // The far shoulder at hip height and the top of the head: the extremities
    // most likely to leave by the left edge or the top of the frame.
    const extremities: readonly (readonly [number, number, number])[] = [
      [spot[0] - 0.4, 1.0, spot[2]],
      [spot[0] - 0.4, 1.8, spot[2]],
    ]

    const halfFrame = frameWidth(view.fov, LANDSCAPE_ASPECT) / 2
    for (const point of extremities) {
      expect(subtendedAngle(camera, [target, point])).toBeLessThan(halfFrame)

      const fraction = framedFractionY(camera, target, view.fov, point)
      expect(fraction).toBeGreaterThan(0)
      expect(fraction).toBeLessThan(1)
    }
  })
})

describe('crapsRailHasRoom', () => {
  // The spec: eight players maximum, joining allowed while there is room. A
  // ninth walking up must not be offered a rail with nowhere to stand.
  it('refuses a stranger when every spot is spoken for', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(crapsRailHasRoom('stranger', eight)).toBe(false)
    expect(crapsRailHasRoom('stranger', eight.slice(0, 7))).toBe(true)
  })

  // A re-announce from somebody already at the table races the lineup. Reading
  // them as a ninth player would evict a player for changing their jacket.
  it('always has room for a player already in the lineup', () => {
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(crapsRailHasRoom('e', eight)).toBe(true)
  })
})
