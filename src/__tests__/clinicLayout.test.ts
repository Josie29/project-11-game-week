import { describe, expect, it } from 'vitest'
import {
  seatedAnklePosition,
  SeatedLegs,
  Silhouette,
} from '../character/proportions'
import { footprintsOverlap, isInside } from '../scenes/casinoFloorLayout'
import {
  benchFootprint,
  CEILING_COLUMNS,
  CEILING_ROWS,
  CEILING_TILE,
  ceilingTileCenter,
  CHAIR_COUNT,
  CHAIR_IDS,
  CHAIR_Z,
  chairIndex,
  chairPosition,
  chairSitSpot,
  ClinicWall,
  ENTRANCE,
  EXIT_DOOR,
  EXIT_DOOR_CLEARANCE,
  EXIT_RADIUS,
  footrestSurfaceY,
  isOnClinicFloor,
  isOnFootrest,
  obstacles,
  ROOM,
  SEATED_DONOR_Z,
  SIT_RADIUS,
  TROFFER_LENGTH,
  TROFFER_WIDTH,
  troffers,
  VENDING,
  VENDING_DEPTH,
  vendingFootprint,
  WALK_BOUNDS,
  WALL_HEIGHT,
  WALL_PROPS,
  wallPropPosition,
} from '../scenes/clinicLayout'

function gap(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

const CHAIRS = Array.from({ length: CHAIR_COUNT }, (_, index) => index)

describe('clinic layout', () => {
  // Four recliners in a row is the reference's whole composition. Overlapping
  // ones would interpenetrate, and the player would be pushed out of one into
  // the next with nowhere to stand between them.
  it('keeps the recliners and the desk apart', () => {
    const solids = obstacles()

    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]
        const b = solids[j]
        if (!a || !b) continue

        expect(footprintsOverlap(a, b), `obstacles ${i} and ${j} overlap`).toBe(false)
      }
    }
  })

  /*
   * The prompts deliberately overlap, so what has to hold is that they resolve
   * unambiguously: standing beside a chair must offer *that* chair.
   *
   * The earlier rule here was that they must not overlap at all, which forced
   * the radii small enough to leave dead patches of floor between the chairs —
   * walking the row stepped over the prompt instead of into it.
   */
  it('offers the nearest chair from anywhere along the row', () => {
    for (let index = 0; index < CHAIR_COUNT; index++) {
      const [x, , z] = chairSitSpot(index)

      for (let other = 0; other < CHAIR_COUNT; other++) {
        if (other === index) continue
        expect(
          gap([x, 0, z], chairSitSpot(index)),
          `chair ${other}'s prompt wins where chair ${index}'s should`,
        ).toBeLessThan(gap([x, 0, z], chairSitSpot(other)))
      }
    }
  })

  // ...and no dead floor between them: every point along the row has to be in
  // range of something, or there are places you can stand where the chairs look
  // like scenery.
  it('leaves no dead floor between one chair and the next', () => {
    for (let index = 1; index < CHAIR_COUNT; index++) {
      expect(
        gap(chairSitSpot(index), chairSitSpot(index - 1)),
        `a dead patch between chairs ${index - 1} and ${index}`,
      ).toBeLessThan(SIT_RADIUS * 2)
    }
  })

  // You have to be able to stand where the prompt appears. A sit spot inside
  // its own chair is unreachable, so that chair can never be used.
  it('puts every sit spot on clear, walkable floor', () => {
    const solids = obstacles()

    for (const index of CHAIRS) {
      const [x, , z] = chairSitSpot(index)

      expect(isOnClinicFloor(x, z, 0.6), `chair ${index} sit spot is in a wall`).toBe(true)
      expect(x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ)

      for (const solid of solids) {
        expect(isInside(solid, x, z), `chair ${index} sit spot is inside a solid`).toBe(false)
      }
    }
  })

  // The chair a prompt offers has to be the one beside you, not across the room.
  it('stands each sit spot beside its own chair', () => {
    for (const index of CHAIRS) {
      expect(gap(chairSitSpot(index), chairPosition(index))).toBeLessThan(2)

      for (const other of CHAIRS) {
        if (other === index) continue
        expect(gap(chairSitSpot(index), chairPosition(index))).toBeLessThan(
          gap(chairSitSpot(index), chairPosition(other)),
        )
      }
    }
  })

  // Walking in should put something on offer straight away — a room of four
  // chairs that makes you cross it before anything happens is a walk that says
  // nothing.
  it('spawns the player within reach of a chair', () => {
    const [x, , z] = ENTRANCE
    const nearest = Math.min(...CHAIRS.map((index) => gap(ENTRANCE, chairSitSpot(index))))

    expect(nearest, `nothing within reach of (${x}, ${z})`).toBeLessThan(SIT_RADIUS)
  })

  // Arriving inside the exit's own trigger bounces the player straight back out
  // to the street: walk in, get thrown out, repeat.
  it('spawns the player clear of the exit and of the furniture', () => {
    expect(gap(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)

    const [x, , z] = ENTRANCE
    expect(isOnClinicFloor(x, z, 0.6)).toBe(true)
    for (const solid of obstacles()) {
      expect(isInside(solid, x, z)).toBe(false)
    }
  })

  // ...and the exit still has to be reachable from inside the walkable bounds.
  it('leaves the exit reachable', () => {
    const [, , exitZ] = EXIT_DOOR
    expect(Math.abs(exitZ - Math.min(exitZ, WALK_BOUNDS.maxZ))).toBeLessThan(EXIT_RADIUS)
  })

  // Chair ids are what the proximity target and the seat state agree on. A
  // mismatch seats the player in a chair that is not the one they walked to.
  it('round-trips every chair id', () => {
    expect(CHAIR_IDS).toHaveLength(CHAIR_COUNT)
    expect(CHAIR_Z).toHaveLength(CHAIR_COUNT)

    for (const index of CHAIRS) {
      expect(chairIndex(CHAIR_IDS[index] ?? '')).toBe(index)
    }
    expect(chairIndex('chair-nope')).toBe(-1)
  })

  // The fifth of these predicates, and the fifth to get this guard.
  it('rejects points outside the room', () => {
    expect(isOnClinicFloor(ROOM.minX - 1, 0)).toBe(false)
    expect(isOnClinicFloor(0, ROOM.maxZ + 1)).toBe(false)
    expect(isOnClinicFloor(0, 0, 100)).toBe(false)
  })

  /*
   * Both of these stood inside `WALK_BOUNDS` and were absent from `obstacles()`,
   * so the player walked straight through a 1.9 m vending machine and through
   * four occupied seats. It never showed up because a figure passing through a
   * solid is only wrong in motion and every capture of this room is a still.
   */
  it('keeps the player out of the machine and the bench', () => {
    for (const [name, solid] of [
      ['vending machine', vendingFootprint()],
      ['bench', benchFootprint()],
    ] as const) {
      expect(obstacles(), `the ${name} is not an obstacle`).toContainEqual(solid)

      // ...and it has to actually be in the way, or listing it proves nothing.
      expect(solid.minX, `the ${name} is out of reach anyway`).toBeLessThan(WALK_BOUNDS.maxX)
    }
  })

  // A machine that hangs off the wall is a bollard in the middle of the floor.
  // Its x is derived from the wall for this reason, so this pins the derivation.
  it('stands the vending machine flush against the wall', () => {
    expect(vendingFootprint().maxX).toBeCloseTo(ROOM.maxX, 6)
    expect(VENDING[0]).toBeCloseTo(ROOM.maxX - VENDING_DEPTH / 2, 6)
  })

  // The bench sits near the end of the recliner row and on the way to the door.
  // Overlapping either prompt would take a working offer away from the player.
  it('leaves the bench clear of every prompt', () => {
    const bench = benchFootprint()
    const corners = [
      [bench.minX, bench.minZ],
      [bench.minX, bench.maxZ],
      [bench.maxX, bench.minZ],
      [bench.maxX, bench.maxZ],
    ] as const

    for (const [x, z] of corners) {
      expect(gap([x, 0, z], EXIT_DOOR), 'the bench is inside the exit prompt').toBeGreaterThan(
        EXIT_RADIUS,
      )

      for (let index = 0; index < CHAIR_COUNT; index++) {
        expect(
          gap([x, 0, z], chairSitSpot(index)),
          `the bench is inside chair ${index}'s prompt`,
        ).toBeGreaterThan(SIT_RADIUS)
      }
    }
  })

  // A grid that does not divide the room leaves a row of slivers against one
  // wall, which reads as a seam in the render rather than a mistake in a number.
  it('tiles the ceiling in whole tiles', () => {
    expect(CEILING_COLUMNS * CEILING_TILE.x).toBeCloseTo(ROOM.maxX - ROOM.minX, 6)
    expect(CEILING_ROWS * CEILING_TILE.z).toBeCloseTo(ROOM.maxZ - ROOM.minZ, 6)

    // ...and the grid starts and ends at the walls. An off-by-one in the tile
    // count is the way this goes wrong, and it puts the last row half outside
    // the room, where it is invisible — so the ceiling comes up a tile short at
    // the other end and nothing says why.
    const [firstX, firstZ] = ceilingTileCenter(0, 0)
    expect(firstX).toBeCloseTo(ROOM.minX + CEILING_TILE.x / 2, 6)
    expect(firstZ).toBeCloseTo(ROOM.minZ + CEILING_TILE.z / 2, 6)

    const [lastX, lastZ] = ceilingTileCenter(CEILING_COLUMNS - 1, CEILING_ROWS - 1)
    expect(lastX).toBeCloseTo(ROOM.maxX - CEILING_TILE.x / 2, 6)
    expect(lastZ).toBeCloseTo(ROOM.maxZ - CEILING_TILE.z / 2, 6)
  })

  /*
   * The fittings are derived from the grid rather than typed, and this is why:
   * three hand-set z values and a tiled ceiling are two unrelated sets of
   * numbers that look right apart and put every fitting across a tile seam
   * together.
   */
  it('lets every light fitting into the ceiling grid', () => {
    const fittings = troffers()
    expect(fittings.length).toBeGreaterThan(0)

    for (const [x, z] of fittings) {
      // Wholly inside the room, with its ends clear of the walls.
      expect(isOnClinicFloor(x - TROFFER_LENGTH / 2, z - TROFFER_WIDTH / 2, 0.1)).toBe(true)
      expect(isOnClinicFloor(x + TROFFER_LENGTH / 2, z + TROFFER_WIDTH / 2, 0.1)).toBe(true)

      // A fitting replaces whole tiles, so both its ends fall on a tile
      // boundary. Asserted on the ends rather than the centre: a centre lands on
      // the grid for any even span, so it would go on passing with a fitting
      // whose *length* was not a whole number of tiles — which is the way this
      // actually goes wrong.
      for (const end of [x - TROFFER_LENGTH / 2, x + TROFFER_LENGTH / 2]) {
        const offset = (end - ROOM.minX) / CEILING_TILE.x
        expect(offset, `a fitting ends at x ${end}, part-way across a tile`).toBeCloseTo(
          Math.round(offset),
          6,
        )
      }

      // ...and it sits on a tile row's centre line rather than across the seam
      // between two, which is what a one-tile-wide fitting does.
      const offsetZ = (z - ROOM.minZ) / CEILING_TILE.z
      expect(offsetZ - Math.floor(offsetZ), `fitting at z ${z} straddles a tile row`).toBeCloseTo(
        0.5,
        6,
      )
    }
  })

  // Every fitting has to be over floor the player can stand on, or it lights the
  // top of a wall. They are the room's only real light source.
  it('hangs every light fitting over walkable floor', () => {
    for (const [x, z] of troffers()) {
      expect(x).toBeGreaterThan(WALK_BOUNDS.minX)
      expect(x).toBeLessThan(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThan(WALK_BOUNDS.minZ)
      expect(z).toBeLessThan(WALK_BOUNDS.maxZ)
    }
  })

  /*
   * The colonnade bug, in this room. Everything hung on the back wall is laid
   * out on the room's rhythm and the doorway is laid out on its own, so the two
   * collide without either file looking wrong — on the strip that put a 3.4 m
   * pillar across all three venue doors and shipped.
   */
  it('keeps everything on a wall clear of the doorway', () => {
    for (const prop of WALL_PROPS) {
      if (prop.wall !== ClinicWall.Back) continue

      const nearEdge = Math.abs(prop.along) - prop.width / 2
      expect(nearEdge, `${prop.id} is across the doorway`).toBeGreaterThan(EXIT_DOOR_CLEARANCE)
    }
  })

  // ...and on the wall at all. A prop hung past the end of its wall floats in
  // the corner of the room, or outside it.
  it('hangs every wall prop on its own wall, inside the room', () => {
    expect(WALL_PROPS.length).toBeGreaterThan(0)

    for (const prop of WALL_PROPS) {
      const [x, y, z] = wallPropPosition(prop)

      expect(isOnClinicFloor(x, z), `${prop.id} is outside the room`).toBe(true)

      // Off the floor and under the ceiling, ends included.
      expect(y - prop.height / 2, `${prop.id} is through the floor`).toBeGreaterThan(0)
      expect(y + prop.height / 2, `${prop.id} is through the ceiling`).toBeLessThan(WALL_HEIGHT)

      // Both ends of it on the wall it claims to be on.
      const [low, high] =
        prop.wall === ClinicWall.Left
          ? [ROOM.minZ, ROOM.maxZ]
          : [ROOM.minX, ROOM.maxX]

      expect(prop.along - prop.width / 2, `${prop.id} runs off its wall`).toBeGreaterThan(low)
      expect(prop.along + prop.width / 2, `${prop.id} runs off its wall`).toBeLessThan(high)
    }
  })

  /*
   * The recliner is the one seat in the game with a footrest, and the seated
   * pose was authored for a casino stool — where the shins hang straight down
   * and the feet reach a footring. Used unchanged here it ran both of the
   * donor's legs down through the footrest cushion, in the one view of this
   * room the player actually sits and looks at.
   *
   * Three silhouettes with three different leg lengths means "the legs reach the
   * footrest" is three separate claims, and a single capture only ever shows one
   * of them.
   */
  it('rests every silhouette\'s legs on the footrest', () => {
    for (const silhouette of Object.values(Silhouette)) {
      const [z, y] = seatedAnklePosition(silhouette, SeatedLegs.Extended, SEATED_DONOR_Z)

      expect(
        isOnFootrest(z, y),
        `${silhouette} ankle at z ${z.toFixed(3)}, y ${y.toFixed(3)} misses the footrest ` +
          `(surface is at ${footrestSurfaceY(z).toFixed(3)})`,
      ).toBe(true)
    }
  })

  /*
   * ...and the guard, which is the pose this replaced.
   *
   * A predicate that accepted the stool pose too would have passed on the bug it
   * exists to catch: those shins finish a quarter of a metre under the cushion.
   */
  it('rejects the stool pose on a recliner', () => {
    for (const silhouette of Object.values(Silhouette)) {
      const [z, y] = seatedAnklePosition(silhouette, SeatedLegs.Hanging, SEATED_DONOR_Z)

      expect(isOnFootrest(z, y), `${silhouette} hanging shins pass as resting`).toBe(false)
    }

    // ...and it rejects a point well past the end of the footrest, so "on the
    // footrest" cannot be satisfied by hanging in the air beyond it.
    expect(isOnFootrest(3, footrestSurfaceY(3))).toBe(false)
  })

  // Two things on the same wall at the same height overlap into one smear.
  it('keeps wall props off each other', () => {
    for (let i = 0; i < WALL_PROPS.length; i++) {
      for (let j = i + 1; j < WALL_PROPS.length; j++) {
        const a = WALL_PROPS[i]
        const b = WALL_PROPS[j]
        if (!a || !b || a.wall !== b.wall) continue

        const alongApart =
          Math.abs(a.along - b.along) > (a.width + b.width) / 2
        const upApart = Math.abs(a.y - b.y) > (a.height + b.height) / 2

        expect(alongApart || upApart, `${a.id} and ${b.id} overlap on the wall`).toBe(true)
      }
    }
  })
})
