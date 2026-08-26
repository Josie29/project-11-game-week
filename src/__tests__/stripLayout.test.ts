import { describe, expect, it } from 'vitest'
import {
  BLOCK_DEPTH,
  BUILDING_DEPTH,
  BUILDING_ROWS,
  clearsDoorways,
  CROSS_NORTH_KERB,
  CROSS_NORTH_Z,
  CROSS_HALF_WIDTH,
  CROSS_SOUTH_KERB,
  CROSS_SOUTH_Z,
  endBlockRows,
  FACADE_X,
  isBlockLine,
  isOnStrip,
  LAMP_ROW_Z,
  PALM_ROW_Z,
  roadTextureOffset,
  STREET_BOUNDS,
  STRIP_SPAN,
} from '../scenes/stripLayout'
import { keyDirection, lightingAt, MINUTES_PER_DAY } from '../world/timeOfDay'
import { VENUES } from '../world/venues'

describe('the block rhythm', () => {
  /*
   * The rule `venues.ts` used to state in a comment and nobody checked: "z must
   * land on a `BUILDING_ROWS` entry in `Strip.tsx` or the venue gets a door with
   * no marquee above it — the sign lookup keys on the door's row."
   *
   * A door one unit off its row still opens, still shows its prompt and still
   * takes you inside. It just has a blank wall over it where the sign should be,
   * which is the kind of thing you notice in a capture six weeks later.
   */
  it('puts every venue door on a building row', () => {
    const rows = BUILDING_ROWS.map((row) => row.z)

    for (const venue of VENUES) {
      expect(rows, `${venue.name} has no tower to hang a sign on`).toContain(
        venue.doorPosition[2],
      )
    }
  })

  // ...and the rows themselves are on the rhythm the roadway is painted to, or
  // the crossings and the doors drift apart a block at a time.
  it('spaces the rows one block apart', () => {
    for (const row of BUILDING_ROWS) {
      expect(isBlockLine(row.z), `row ${row.z} is off the block line`).toBe(true)
    }
  })

  /*
   * The offset that phases the roadway texture. It is a fraction of a tile, so
   * "is it right" is not something you can eyeball in the number — but if it is
   * wrong every crossing lands mid-block and every door opens onto plain tarmac,
   * which is very visible and very confusing to trace back to a texture offset.
   */
  it('phases the roadway so a crossing lands on every block line', () => {
    const offset = roadTextureOffset()
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThan(1)

    for (const venue of VENUES) {
      const doorZ = venue.doorPosition[2]
      const tile = (doorZ - STRIP_SPAN.from) / BLOCK_DEPTH + offset
      // A crossing sits at the middle of its tile, so a door should land on a
      // half-integer number of tiles from the start of the run.
      const intoTile = ((tile % 1) + 1) % 1
      expect(Math.abs(intoTile - 0.5), `${venue.name} opens onto no crossing`).toBeLessThan(0.001)
    }
  })
})

describe('the ends of the street', () => {
  /*
   * The whole reason this module exists.
   *
   * The strip used to stop being a street well before it stopped being geometry:
   * the last tower stood at z = -46, the player could walk to -52, and the road
   * and both pavements ran on another thirty-eight units before ending in mid-air
   * against open sky. Nothing failed; it just looked like a diorama, and no test
   * could have told you because the two numbers had no relationship to assert.
   *
   * They do now. The walk limit is the kerb.
   */
  it('stops the player at a kerb, not in open road', () => {
    expect(STREET_BOUNDS.maxZ).toBe(CROSS_NORTH_KERB)
    expect(STREET_BOUNDS.minZ).toBe(CROSS_SOUTH_KERB)
  })

  // The pavement has to reach the kerb it stops at, or the last stride is over
  // a hole.
  it('lays pavement all the way to both limits', () => {
    expect(isOnStrip(0, STREET_BOUNDS.minZ)).toBe(true)
    expect(isOnStrip(0, STREET_BOUNDS.maxZ)).toBe(true)
    expect(isOnStrip(FACADE_X, STREET_BOUNDS.minZ)).toBe(true)
  })

  // The paired negative case. A predicate that returned true everywhere would
  // leave everything above passing while proving nothing.
  it('rejects a point off the end of the strip', () => {
    expect(isOnStrip(0, STREET_BOUNDS.maxZ + 2)).toBe(false)
    expect(isOnStrip(0, STREET_BOUNDS.minZ - 2)).toBe(false)
    expect(isOnStrip(FACADE_X + 4, 0)).toBe(false)
  })

  /*
   * The closing wall has to stand beyond the cross street, not in it. A tower
   * dropped into the carriageway is a building growing out of a road, and from
   * the player's end of the street it would be the most prominent thing in view.
   */
  it('stands the closing block clear of the junction', () => {
    for (const side of [1, -1] as const) {
      const crossZ = side > 0 ? CROSS_NORTH_Z : CROSS_SOUTH_Z
      const farKerb = crossZ + side * CROSS_HALF_WIDTH

      for (const rowZ of endBlockRows(side)) {
        const face = rowZ - side * (BUILDING_DEPTH / 2)
        expect(
          side > 0 ? face >= farKerb : face <= farKerb,
          `end block row ${rowZ} overhangs the junction`,
        ).toBe(true)
      }
    }
  })

  /*
   * Haze has to be doing some work down the length of the street, at every hour.
   *
   * This is the other half of not looking like a diorama. A street that is
   * perfectly crisp from one end to the other has no depth, and the daytime
   * reference — `art/refs/strip_exterior_day.png` — is hazy enough at the far
   * end to lose a whole block in it. If the fog only starts beyond the far kerb
   * then it never touches anything the player can see, which is what noon used
   * to do with `fogNear` at 44 over a street 64 long.
   */
  it('starts the fog inside the length of the street, at every hour', () => {
    const length = STREET_BOUNDS.maxZ - STREET_BOUNDS.minZ

    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 30) {
      const { fogNear, fogFar } = lightingAt(minute)

      expect(fogNear, `no haze on the street at ${minute} minutes`).toBeLessThan(length * 0.6)
      // ...and not so tight that the far end vanishes into a wall of it.
      expect(fogFar, `the street is lost in fog at ${minute} minutes`).toBeGreaterThan(length)
    }
  })
})

describe('street furniture', () => {
  // A palm stood squarely in front of both the shop and the clinic once, hiding
  // the entrance the player is meant to be walking toward.
  it('keeps every palm and lamp clear of a doorway', () => {
    for (const z of PALM_ROW_Z) {
      for (const [x, at] of [
        [-7.6, z],
        [7.6, z - 4],
      ] as const) {
        if (!clearsDoorways(x, at)) continue
        for (const venue of VENUES) {
          const [doorX, , doorZ] = venue.doorPosition
          expect(Math.hypot(x - doorX, at - doorZ)).toBeGreaterThan(3.5)
        }
      }
    }

    for (const z of LAMP_ROW_Z) {
      for (const [x, at] of [
        [-6.6, z],
        [6.6, z - 6],
      ] as const) {
        if (!clearsDoorways(x, at)) continue
        for (const venue of VENUES) {
          const [doorX, , doorZ] = venue.doorPosition
          expect(Math.hypot(x - doorX, at - doorZ)).toBeGreaterThan(3.5)
        }
      }
    }
  })

  // The predicate must actually reject: a door position is the clearest case.
  it('rejects a spot in a doorway', () => {
    const [doorX, , doorZ] = VENUES[0]?.doorPosition ?? [0, 0, 0]
    expect(clearsDoorways(doorX, doorZ)).toBe(false)
  })
})

describe('the sun and the moon', () => {
  /*
   * The disc in the sky and the shadows on the ground come off one direction.
   *
   * `Celestial` draws along `keyDirection` and the key light points along
   * `keyPosition`; if either ever grew its own arc, you would get a sun in one
   * corner of the sky and shadows falling out of another, which nobody
   * consciously notices and everybody registers as wrong.
   */
  it('draws the disc along the light it comes from', () => {
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 20) {
      const [dx, dy, dz] = keyDirection(minute)
      const [kx, ky, kz] = lightingAt(minute).keyPosition
      const length = Math.hypot(kx, ky, kz)

      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(1, 6)
      expect(dx).toBeCloseTo(kx / length, 6)
      expect(dy).toBeCloseTo(ky / length, 6)
      expect(dz).toBeCloseTo(kz / length, 6)
    }
  })

  // Never below the pavement. A sun rising out of the road would be worse than
  // no sun at all.
  it('keeps it above the horizon all day', () => {
    for (let minute = 0; minute < MINUTES_PER_DAY; minute += 10) {
      expect(keyDirection(minute)[1], `underground at ${minute} minutes`).toBeGreaterThan(0)
    }
  })

  // ...and it has to visibly travel, or it is a sticker rather than a sun.
  it('rides higher at midday than at dawn', () => {
    expect(keyDirection(12 * 60)[1]).toBeGreaterThan(keyDirection(6 * 60)[1])
    expect(keyDirection(12 * 60)[1]).toBeGreaterThan(keyDirection(19 * 60)[1])
  })
})
