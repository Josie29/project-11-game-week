import { describe, expect, it } from 'vitest'
import {
  BLOCK_DEPTH,
  BUILDING_DEPTH,
  BUILDING_ROWS,
  clearsDoorways,
  colonnadeColumns,
  hasColonnade,
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
  APPROACH_CLEARANCE,
  APPROACH_TALL,
  clearsApproach,
  LAMP_HEIGHT,
  PALM_HEIGHT_LEFT,
  PALM_HEIGHT_RIGHT,
  BILLBOARD_PANEL_CENTER_Y,
  BILLBOARD_PANEL_HEIGHT,
  BILLBOARD_PANEL_TOP_Y,
  BILLBOARD_X,
  billboardHeadroom,
  billboardSubtendedAngle,
  billboardZ,
  END_BLOCK_FRONT_HEIGHTS,
  END_BLOCK_X,
} from '../scenes/stripLayout'
import {
  FRAME_MARGIN,
  frameWidth,
  LANDSCAPE_ASPECT,
  playFov,
  PORTRAIT_ASPECT,
} from '../world/camera'
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

describe('the high rollers boards', () => {
  const SIDES = [1, -1] as const

  /*
   * The decision the feature rests on: the boards are scenery that talk about
   * the players, and nothing on this strip happens to a player because they
   * walked somewhere — a board inside the walk bounds would owe them a prompt.
   */
  it('stands each board past the kerb, where nobody can walk', () => {
    for (const side of SIDES) {
      expect(
        isOnStrip(BILLBOARD_X, billboardZ(side)),
        `the side-${side} board stands where the player can reach it`,
      ).toBe(false)
    }

    // The predicate is not simply refusing everything at the junctions: one
    // step inside the kerb is still the street.
    expect(isOnStrip(BILLBOARD_X, STREET_BOUNDS.maxZ)).toBe(true)
    expect(isOnStrip(BILLBOARD_X, STREET_BOUNDS.minZ)).toBe(true)
  })

  /*
   * The board reads as a skyline sign only while it breaks the skyline. The
   * centre tower of the closing block stands directly behind the pylon, and a
   * panel that stops below its roofline is a poster on a building, unreadable
   * against the tower's own windows at night.
   */
  it('lifts the panel clear of the tower standing behind it', () => {
    const tower = END_BLOCK_FRONT_HEIGHTS[END_BLOCK_X.indexOf(BILLBOARD_X)] ?? 0

    expect(tower, 'the closing block lost its centre tower').toBeGreaterThan(0)
    expect(
      BILLBOARD_PANEL_TOP_Y,
      'the panel top sits at or below the tower roofline',
    ).toBeGreaterThan(tower)
    // And the panel's own bottom is above head height: the pylon is what makes
    // it a billboard rather than a wall across the pavement.
    expect(BILLBOARD_PANEL_CENTER_Y - BILLBOARD_PANEL_HEIGHT / 2).toBeGreaterThan(2.2)
  })

  /*
   * The waterfall lesson, applied before shipping instead of after: the walking
   * camera tilts down and can barely tilt up, so the real framing risk for a
   * tall panel is the top of the screen, not the sides. Asserted at both ends
   * and both aspects because "portrait only ever gains headroom" is a claim
   * about playFov, not a law.
   */
  it('keeps the whole panel under the top of the frame from the kerb', () => {
    for (const side of SIDES) {
      expect(
        billboardHeadroom(side, LANDSCAPE_ASPECT),
        `the side-${side} board is cropped on a desktop`,
      ).toBeGreaterThan(0.5)
      expect(
        billboardHeadroom(side, PORTRAIT_ASPECT),
        `the side-${side} board is cropped on a phone`,
      ).toBeGreaterThan(0.5)
    }
  })

  // The legibility half: three rows of text need width across the view, and a
  // panel subtending a few degrees is a landmark rather than a leaderboard.
  it('fills the frame from the kerb without overflowing it', () => {
    for (const side of SIDES) {
      const subtended = billboardSubtendedAngle(side)

      expect(
        subtended,
        `the side-${side} board is too small to read from the kerb`,
      ).toBeGreaterThan((15 * Math.PI) / 180)

      for (const aspect of [LANDSCAPE_ASPECT, PORTRAIT_ASPECT]) {
        expect(
          subtended * FRAME_MARGIN,
          `the side-${side} board overflows the frame at aspect ${aspect.toFixed(2)}`,
        ).toBeLessThanOrEqual(frameWidth(playFov(aspect), aspect) + 1e-9)
      }
    }
  })

  // Symmetry, so a change to one junction cannot quietly strand the other:
  // both boards stand the same distance past their own kerb.
  it('stands both boards the same distance past their kerbs', () => {
    expect(billboardZ(1) - CROSS_NORTH_KERB).toBeCloseTo(-(billboardZ(-1) - CROSS_SOUTH_KERB), 10)
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

  /*
   * The colonnade is street furniture too, and for months it was the one piece
   * that never went through this rule.
   *
   * Every tower carries a column on its own centre line and every venue door is
   * on a tower's centre line, so all three entrances had a 3.4-metre column
   * standing 55cm in front of them: the shop's display window and the clinic's
   * blinds were each split down the middle, and a third of the Golden Ace's lit
   * doorway was behind a pillar. The canopy above them crossed the casino's
   * marquee band and the bottom of both fascia signs.
   */
  it('keeps every colonnade column clear of a doorway', () => {
    for (const row of BUILDING_ROWS) {
      for (const side of [1, -1] as const) {
        if (!hasColonnade(row.z, side)) continue

        for (const [x, z] of colonnadeColumns(row.z, side)) {
          expect(
            clearsDoorways(x, z),
            `a column at ${x}, ${z} stands in a doorway`,
          ).toBe(true)
        }
      }
    }
  })

  // ...and the paired negative. A rule that switched the colonnade off
  // everywhere would pass the test above while stripping the street of the one
  // piece of relief the player walks right past.
  it('leaves the colonnade on every tower without a venue in it', () => {
    const venueFaces = new Set(
      VENUES.map((venue) => `${venue.doorPosition[2]}:${Math.sign(venue.doorPosition[0])}`),
    )

    for (const row of BUILDING_ROWS) {
      for (const side of [1, -1] as const) {
        expect(hasColonnade(row.z, side), `row ${row.z} on side ${side}`).toBe(
          !venueFaces.has(`${row.z}:${side}`),
        )
      }
    }
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

describe('the approach to a doorway', () => {
  /** Every tall prop the street actually places, with the rules applied. */
  function placedTallProps(): { x: number; z: number; height: number }[] {
    const candidates = [
      ...PALM_ROW_Z.flatMap((z) => [
        { x: -7.6, z, height: PALM_HEIGHT_LEFT },
        { x: 7.6, z: z - 4, height: PALM_HEIGHT_RIGHT },
      ]),
      ...LAMP_ROW_Z.flatMap((z) => [
        { x: -6.6, z, height: LAMP_HEIGHT },
        { x: 6.6, z: z - 6, height: LAMP_HEIGHT },
      ]),
    ]

    return candidates.filter(
      (prop) => clearsDoorways(prop.x, prop.z) && clearsApproach(prop.x, prop.z, prop.height),
    )
  }

  /*
   * Nothing tall may stand between the camera and a door.
   *
   * `clearsDoorways` is a radius, and a radius is the wrong shape: the play
   * camera trails the player *along* the street, so what hides an entrance is
   * not something standing near it but something standing up-street of it. A
   * seven-metre palm four units from the Golden Ace passed the radius check and
   * filled the middle of the frame at the moment the door prompt appeared —
   * four separate props did it to that one entrance.
   */
  it('leaves every doorway visible from its own approach', () => {
    for (const prop of placedTallProps()) {
      for (const venue of VENUES) {
        const [doorX, , doorZ] = venue.doorPosition
        if (Math.sign(prop.x) !== Math.sign(doorX)) continue

        expect(
          Math.abs(prop.z - doorZ),
          `a ${prop.height}m prop at z = ${prop.z} hides ${venue.id}`,
        ).toBeGreaterThan(APPROACH_CLEARANCE)
      }
    }
  })

  /*
   * The rhythms cannot be re-phased out of this, and that is why the rule
   * removes furniture instead of moving it.
   *
   * Doors fall every `BLOCK_DEPTH`, so within one period nothing can be further
   * than half a block from a door — which is already well inside the corridor.
   * If this ever stops being true the cheaper fix becomes available, and this
   * test is where somebody would find that out.
   */
  it('cannot be solved by moving the rows', () => {
    expect(BLOCK_DEPTH / 2).toBeLessThan(APPROACH_CLEARANCE)
  })

  // Low things are below the camera's line to the door and may stand anywhere,
  // or clearing the corridor would strip the street of benches and bollards too.
  it('lets low furniture stand anywhere', () => {
    const [doorX, , doorZ] = VENUES[0]!.doorPosition
    expect(clearsApproach(doorX, doorZ, APPROACH_TALL)).toBe(true)
    expect(clearsApproach(doorX, doorZ, APPROACH_TALL + 0.1)).toBe(false)
  })

  // The far pavement never occludes: the camera and the player share a side.
  it('ignores the other side of the street', () => {
    const [doorX, , doorZ] = VENUES[0]!.doorPosition
    expect(clearsApproach(-doorX, doorZ, 9)).toBe(true)
  })

  // ...and the street still has furniture on it. A rule that removed everything
  // would pass every assertion above and leave a bare road.
  it('keeps most of the street furniture', () => {
    expect(placedTallProps().length).toBeGreaterThan(12)
  })
})
