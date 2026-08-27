import { describe, expect, it } from 'vitest'
import {
  AISLE_CENTER_X,
  AISLE_MARGIN,
  CARPET_FIELDS,
  CEILING_HEIGHT,
  COLONNADE_INNER_X,
  COVING_X,
  COVING_Y,
  type Footprint,
  VAULT_RISE,
  vaultHeightAt,
  AISLE_MAX_X,
  AISLE_MIN_X,
  AISLE_WIDTH,
  BLACKJACK_ORIGIN,
  clearsFloor,
  COLUMN_RADIUS,
  COLUMN_X,
  COLUMNS,
  CRAPS_ORIGIN,
  MEZZANINE_DEPTH,
  MEZZANINE_HEIGHT,
  PALM_RADIUS,
  PALMS,
  POOL_LEVEL,
  WALL_HEIGHT,
  WATER_COURT,
  WATERFALL_TOP,
  WATERFALL_WIDTH,
  waterfallHeadroom,
  waterfallSubtendedAngle,
  DEALER_SPOTS,
  ENTRANCE,
  EXIT_DOOR,
  EXIT_RADIUS,
  footprintsOverlap,
  isInside,
  isOnCasinoFloor,
  ROOM,
  SEATS,
  BLACKJACK_SEAT_RADIUS,
  CRAPS_PROMPT,
  crapsPromptGap,
  SIT_SPOTS,
  TABLE_FOOTPRINTS,
  TABLE_IDS,
  TABLE_LABELS,
  tableOrigin,
  TableId,
  WALK_BOUNDS,
} from '../scenes/casinoFloorLayout'
import { DEALER_DEPTH, HALF_WIDTH, PLAYER_DEPTH } from '../scenes/tableLayout'
import { OUTER_HALF_DEPTH, OUTER_HALF_WIDTH } from '../scenes/crapsTableLayout'

function distance2D(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))
}

describe('casino floor layout', () => {
  // The craps table carries its own physics world. Moving it off the origin
  // means a `<Physics>` provider under a translated parent, which is exactly
  // the kind of thing that works in one build and silently stops working in the
  // next — the dice would fall through the felt or land somewhere else entirely.
  it('leaves the craps table at the world origin', () => {
    expect(CRAPS_ORIGIN).toEqual([0, 0, 0])
    expect(tableOrigin(TableId.Craps)).toEqual([0, 0, 0])
  })

  // Both tables keep their own local axes so a table camera only adds an
  // offset. A rotated table would need the target rotated too, and the framing
  // that shipped would drift without anything failing.
  it('offsets the blackjack table along one axis only', () => {
    const [, y, z] = BLACKJACK_ORIGIN
    expect(y).toBe(0)
    expect(z).toBe(0)
  })

  // Two tables occupying the same floor is the whole feature. Overlapping ones
  // would interpenetrate, and the player would be pushed out of one into the
  // other with nowhere to stand.
  it('keeps the two table footprints apart', () => {
    expect(
      footprintsOverlap(
        TABLE_FOOTPRINTS[TableId.Blackjack],
        TABLE_FOOTPRINTS[TableId.Craps],
      ),
    ).toBe(false)
  })

  // The footprint is what the player is kept out of, so it has to actually
  // contain the table it stands for. A footprint smaller than its felt lets the
  // player walk into the table.
  it('covers each table with its own footprint', () => {
    const blackjack = TABLE_FOOTPRINTS[TableId.Blackjack]
    const [originX] = BLACKJACK_ORIGIN

    expect(isInside(blackjack, (originX ?? 0) - HALF_WIDTH + 0.05, 0)).toBe(true)
    expect(isInside(blackjack, (originX ?? 0) + HALF_WIDTH - 0.05, 0)).toBe(true)
    expect(isInside(blackjack, originX ?? 0, PLAYER_DEPTH - 0.05)).toBe(true)
    expect(isInside(blackjack, originX ?? 0, -DEALER_DEPTH + 0.05)).toBe(true)

    // ...and each table's own dealer stands inside it, so the player cannot
    // walk through the staff either.
    for (const table of TABLE_IDS) {
      const [dealerX, , dealerZ] = DEALER_SPOTS[table]
      expect(isInside(TABLE_FOOTPRINTS[table], dealerX, dealerZ)).toBe(true)
    }
  })

  // The sit prompt is a proximity check, and F sits you at whichever table is
  // nearest. If two sit radii overlapped there would be a patch of floor where
  // F is ambiguous and the player gets the table they did not walk up to.
  it('keeps the two sit prompts from overlapping', () => {
    const [standX, , standZ] = SIT_SPOTS[TableId.Blackjack]
    expect(crapsPromptGap(standX, standZ)).toBeGreaterThan(
      CRAPS_PROMPT.radius + BLACKJACK_SEAT_RADIUS,
    )
  })

  /*
   * A player crossing the room does it in strides, not along a continuous
   * track: movement is sampled per frame, so a held key carries them as far as
   * the frame took. The walkthrough holds each key for 700ms, which at full
   * walking speed is over five metres in one go.
   *
   * Asserted for craps alone, and for a reason: the player walks *into* the
   * blackjack table and is stopped by its own footprint, so its prompt cannot
   * be missed. Craps is passed alongside — the crossing runs the length of it
   * at the blackjack seat's depth — so its window has to be wider than a
   * stride or the table can be walked clean past and never offered. That is
   * exactly what happened when its spot moved to the near rail.
   */
  it('leaves craps a prompt window wider than one walking stride', () => {
    // WALK_SPEED 7.5 for the 700ms the walkthrough holds a key.
    const stride = 7.5 * 0.7

    const [spotX, , spotZ] = CRAPS_PROMPT.center
    const crossingZ = SIT_SPOTS[TableId.Blackjack][2]
    const offset = Math.abs(crossingZ - spotZ)
    const radius = CRAPS_PROMPT.radius

    /*
     * The segment's own length counts toward the window, and is most of it.
     * That is the point of the shape: the prompt is wide where the table is and
     * stops shortly after it ends, instead of being a circle whose only way to
     * cover five metres of rail is to reach five metres past it.
     */
    const halfWindow =
      CRAPS_PROMPT.halfLength + Math.sqrt(Math.max(0, radius * radius - offset * offset))
    expect(halfWindow * 2).toBeGreaterThan(stride)

    // And the crossing actually passes through it, rather than the window
    // sitting somewhere the player never walks.
    expect(spotX).toBeGreaterThan(WALK_BOUNDS.minX)
    expect(spotX).toBeLessThan(WALK_BOUNDS.maxX)
  })

  // You have to be able to stand where the prompt appears. A sit spot inside
  // its own table's footprint is unreachable, so the prompt never fires and the
  // table cannot be played at all.
  it('puts every sit spot on clear, walkable floor', () => {
    for (const table of TABLE_IDS) {
      const [x, , z] = SIT_SPOTS[table]

      expect(isOnCasinoFloor(x, z, 0.6), `${table} sit spot is in a wall`).toBe(true)
      expect(x).toBeGreaterThanOrEqual(WALK_BOUNDS.minX)
      expect(x).toBeLessThanOrEqual(WALK_BOUNDS.maxX)
      expect(z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ)
      expect(z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ)

      for (const other of TABLE_IDS) {
        expect(
          isInside(TABLE_FOOTPRINTS[other], x, z),
          `${table} sit spot is inside the ${other} table`,
        ).toBe(false)
      }
    }
  })

  // The seat is where the character is drawn once sitting, and it belongs at
  // the table rather than on the floor beside it.
  it('places each seat at its own table', () => {
    for (const table of TABLE_IDS) {
      const [seatX, , seatZ] = SEATS[table]
      const [originX, , originZ] = tableOrigin(table)

      expect(distance2D(SEATS[table], [originX, 0, originZ])).toBeLessThan(4)
      expect(isInside(TABLE_FOOTPRINTS[table], seatX, seatZ)).toBe(true)
    }
  })

  // Arriving inside the exit's own trigger would bounce the player straight
  // back onto the street — walk in, get thrown out, repeat. This is the same
  // trap `leaveVenue` avoids with its EXIT_OFFSET on the way out.
  it('spawns the player clear of the exit trigger', () => {
    expect(distance2D(ENTRANCE, EXIT_DOOR)).toBeGreaterThan(EXIT_RADIUS)

    const [x, , z] = ENTRANCE
    expect(isOnCasinoFloor(x, z, 0.6)).toBe(true)
    for (const table of TABLE_IDS) {
      expect(isInside(TABLE_FOOTPRINTS[table], x, z)).toBe(false)
    }
  })

  // ...but it must still be reachable: the player walks to the exit, so the
  // walkable bounds have to come within trigger range of it.
  it('leaves the exit reachable from inside the walkable bounds', () => {
    const [exitX, , exitZ] = EXIT_DOOR
    const nearestReachableZ = Math.min(exitZ, WALK_BOUNDS.maxZ)

    expect(Math.abs(exitZ - nearestReachableZ)).toBeLessThan(EXIT_RADIUS)
    expect(exitX).toBeGreaterThan(WALK_BOUNDS.minX)
    expect(exitX).toBeLessThan(WALK_BOUNDS.maxX)
  })

  // Every table needs a name for the prompt, or the player is told to press F
  // to sit at nothing.
  it('labels every table', () => {
    for (const table of TABLE_IDS) {
      expect(TABLE_LABELS[table]).toBeTruthy()
    }
    expect(TABLE_IDS).toHaveLength(Object.keys(TableId).length)
  })

  // The fourth of these predicates on the project, and the fourth to get this
  // guard: one that returned true everywhere would leave the file passing while
  // proving nothing.
  it('rejects points outside the room', () => {
    expect(isOnCasinoFloor(ROOM.minX - 1, 0)).toBe(false)
    expect(isOnCasinoFloor(ROOM.maxX + 1, 0)).toBe(false)
    expect(isOnCasinoFloor(0, ROOM.maxZ + 1)).toBe(false)
    expect(isInside(TABLE_FOOTPRINTS[TableId.Craps], 100, 100)).toBe(false)
  })
})

describe('the water court', () => {
  // The pool is a hole in the floor. If it overlapped a table the player would
  // be pushed out of one into the other with nowhere to stand, and the felt
  // would be sitting in the water.
  it('keeps the court clear of both tables', () => {
    for (const table of TABLE_IDS) {
      expect(footprintsOverlap(WATER_COURT, TABLE_FOOTPRINTS[table])).toBe(false)
    }
  })

  // The court has to be *inside* the room, and against the back wall rather
  // than floating a metre off it — the cascade is drawn on that wall, and a gap
  // behind the basin would show the water landing short of its own pool.
  it('sits against the back wall, inside the room', () => {
    expect(WATER_COURT.minZ).toBe(ROOM.minZ)
    expect(WATER_COURT.minX).toBeGreaterThan(ROOM.minX)
    expect(WATER_COURT.maxX).toBeLessThan(ROOM.maxX)
    expect(WATER_COURT.maxZ).toBeLessThan(ROOM.maxZ)
  })

  // The waterfall hangs on the back wall between the water and the ceiling. A
  // lip above the ceiling would be inside the room's own roof, and one below
  // the waterline would have the sheet starting underwater.
  it('fits the cascade between the pool and the ceiling', () => {
    expect(WATERFALL_TOP).toBeLessThan(WALL_HEIGHT)
    expect(WATERFALL_TOP).toBeGreaterThan(POOL_LEVEL + 2)
    expect(WATERFALL_WIDTH).toBeLessThanOrEqual(WATER_COURT.maxX - WATER_COURT.minX)
  })

  /*
   * The shop's mirror lesson, in a much bigger room.
   *
   * The room is eighteen metres deep and the waterfall is at the far end of it,
   * so seven metres of water says nothing on its own about whether the player
   * will see anything. This is the angle it actually subtends on walking in.
   * A camera pulled back or a room made deeper takes it under the bar, and the
   * answer to that is a wider waterfall, not a lower bar.
   */
  it('gives the waterfall a real share of the entrance view', () => {
    const degrees = (waterfallSubtendedAngle() * 180) / Math.PI

    expect(degrees).toBeGreaterThan(18)
  })

  /*
   * And the half of the question the angle above does not answer.
   *
   * This is here because the first version of the room passed the width test at
   * 22.6 degrees and shipped a waterfall the player could not see: the walking
   * camera looked down at 37 degrees, so the top of the frame landed on the
   * back wall at about `y = 1.5` and five of the cascade's six metres were
   * being drawn off the top of the screen every frame. Width is not framing.
   *
   * Anything that tilts the camera down, moves the spawn, narrows the field of
   * view or raises the lip takes this negative.
   */
  it('keeps the whole cascade inside the frame from the entrance', () => {
    expect(waterfallHeadroom()).toBeGreaterThan(0.5)
  })

  // The player is kept out of the pool by the obstacle list, but they must
  // still be able to get close enough for it to be worth looking at — a court
  // fenced off two metres early is a picture on a wall.
  it('lets the player walk up to the coping', () => {
    expect(WALK_BOUNDS.minZ).toBeLessThan(WATER_COURT.maxZ)
    expect(AISLE_CENTER_X).toBeGreaterThan(WATER_COURT.minX)
    expect(AISLE_CENTER_X).toBeLessThan(WATER_COURT.maxX)
  })
})

describe('the vault', () => {
  // The crown is over the aisle and the springing is at the walls. A vault that
  // peaked off-centre would put its ridge over a table, and the whole room is
  // arranged symmetrically about the aisle.
  it('crowns at the middle of the room and springs at both walls', () => {
    const middle = (ROOM.minX + ROOM.maxX) / 2

    expect(vaultHeightAt(middle)).toBeCloseTo(CEILING_HEIGHT, 6)
    expect(vaultHeightAt(ROOM.minX)).toBeCloseTo(WALL_HEIGHT, 6)
    expect(vaultHeightAt(ROOM.maxX)).toBeCloseTo(WALL_HEIGHT, 6)
  })

  // It has to stay between the two heights it is defined by, everywhere,
  // including outside the walls where a caller might reasonably land — the
  // square root goes imaginary a millimetre past the springing and a NaN drop
  // makes a lamp vanish rather than fail.
  it('never leaves the range between springing and crown', () => {
    for (let x = ROOM.minX - 3; x <= ROOM.maxX + 3; x += 0.25) {
      const height = vaultHeightAt(x)

      expect(Number.isFinite(height), `vault height at ${x} is not finite`).toBe(true)
      expect(height).toBeGreaterThanOrEqual(WALL_HEIGHT - 1e-9)
      expect(height).toBeLessThanOrEqual(CEILING_HEIGHT + 1e-9)
    }
  })

  /*
   * The pendants are the whole reason `vaultHeightAt` is exported.
   *
   * Their cable was one number — right under a flat lid, wrong at every x but
   * the centre under a curved one. The blackjack lamp hangs at x = -7.5, four
   * metres off the crown, where the ceiling is a good half-metre lower; a fixed
   * drop there either stops short in mid-air or runs up through the ceiling.
   * Neither is something anybody would think to check at one specific x.
   */
  it('gives every pendant a cable that reaches the ceiling above it', () => {
    const SHADE_HEIGHT = 3.6

    for (const table of TABLE_IDS) {
      const [x] = tableOrigin(table)
      const ceiling = vaultHeightAt(x)

      expect(ceiling - SHADE_HEIGHT, `${table} pendant hangs below its own shade`).toBeGreaterThan(0)
      // ...and the lamp is under the ceiling, not through it.
      expect(SHADE_HEIGHT).toBeLessThan(ceiling)
    }
  })

  // The vault must not eat the storey below it. A springing line under the
  // balcony rail would have the ceiling curving down through the balustrade.
  it('springs well above the balcony', () => {
    expect(WALL_HEIGHT).toBeGreaterThan(MEZZANINE_HEIGHT + 2)
    expect(VAULT_RISE).toBeGreaterThan(0)
  })

  // The coving is the vault's own edge lighting, so it belongs at the springing
  // and on the long walls — inside the room, or it lights the outside of it.
  it('runs the coving along the springing, inside the room', () => {
    expect(COVING_Y).toBeLessThanOrEqual(WALL_HEIGHT)
    expect(COVING_Y).toBeGreaterThan(MEZZANINE_HEIGHT)

    for (const x of COVING_X) {
      expect(x).toBeGreaterThan(ROOM.minX)
      expect(x).toBeLessThan(ROOM.maxX)
    }
  })
})

describe('the floor bands', () => {
  /*
   * A rug laid by eye is a rug a table ends up half on, and half on the carpet
   * and half on the stone reads as a rendering fault rather than a layout one.
   * Each field has to swallow its own table whole, stools and dealer included.
   */
  it('covers each table entirely with its own rug', () => {
    /*
     * Against the tables' *real* bodies, not their padded footprints.
     *
     * A footprint is deliberately bigger than the table it stands for — it is
     * what the player is kept out of, and being stopped a little early beats
     * walking through a dealer. The stone reveal beside the aisle lives inside
     * that padding, so asserting on the footprint would demand the rug reach a
     * place the table does not actually get to, and there is not enough floor
     * between our two tables to give it that.
     */
    const bodies: Record<TableId, Footprint> = {
      [TableId.Blackjack]: {
        minX: BLACKJACK_ORIGIN[0]! - HALF_WIDTH,
        maxX: BLACKJACK_ORIGIN[0]! + HALF_WIDTH,
        minZ: BLACKJACK_ORIGIN[2]! - DEALER_DEPTH,
        maxZ: BLACKJACK_ORIGIN[2]! + PLAYER_DEPTH,
      },
      [TableId.Craps]: {
        minX: CRAPS_ORIGIN[0]! - OUTER_HALF_WIDTH,
        maxX: CRAPS_ORIGIN[0]! + OUTER_HALF_WIDTH,
        minZ: CRAPS_ORIGIN[2]! - OUTER_HALF_DEPTH,
        maxZ: CRAPS_ORIGIN[2]! + OUTER_HALF_DEPTH,
      },
    }

    for (const table of TABLE_IDS) {
      const rug = CARPET_FIELDS[table]
      const body = bodies[table]

      expect(rug.minX, `${table} rug stops short of its table`).toBeLessThanOrEqual(body.minX)
      expect(rug.maxX, `${table} rug stops short of its table`).toBeGreaterThanOrEqual(body.maxX)
      expect(rug.minZ).toBeLessThanOrEqual(body.minZ)
      expect(rug.maxZ).toBeGreaterThanOrEqual(body.maxZ)
    }
  })

  /*
   * And the reveal has to fit in the padding it lives in.
   *
   * This is the constraint the test above found the hard way: the margin was
   * 0.85, which is a reasonable-looking number and three times more floor than
   * exists between the craps rail and the aisle. Widening it silently pulls a
   * rug out from under a table.
   */
  it('keeps the stone reveal inside the tables own padding', () => {
    // How much floor each footprint has beyond its table, on the aisle side.
    const blackjackPadding = Math.abs(AISLE_MIN_X - (BLACKJACK_ORIGIN[0]! + HALF_WIDTH))
    const crapsPadding = Math.abs(AISLE_MAX_X - (CRAPS_ORIGIN[0]! - OUTER_HALF_WIDTH))

    expect(AISLE_MARGIN).toBeLessThanOrEqual(blackjackPadding)
    expect(AISLE_MARGIN).toBeLessThanOrEqual(crapsPadding)
  })

  // The runner is hard flooring between two rugs. A rug overlapping it would
  // put carpet over marble at one edge and marble over carpet at the other,
  // depending on which was drawn last.
  it('keeps both rugs clear of the aisle and of each other', () => {
    const aisle: Footprint = {
      minX: AISLE_MIN_X - AISLE_MARGIN,
      maxX: AISLE_MAX_X + AISLE_MARGIN,
      minZ: ROOM.minZ,
      maxZ: ROOM.maxZ,
    }

    for (const table of TABLE_IDS) {
      expect(footprintsOverlap(CARPET_FIELDS[table], aisle), `${table} rug covers the aisle`).toBe(
        false,
      )
    }

    expect(
      footprintsOverlap(CARPET_FIELDS[TableId.Blackjack], CARPET_FIELDS[TableId.Craps]),
    ).toBe(false)
  })

  // And they are rugs on a floor, not wall-to-wall: they stop inside the room
  // and inside the colonnade, which is where the stone margin comes from.
  it('lays both rugs inside the colonnade', () => {
    for (const table of TABLE_IDS) {
      const rug = CARPET_FIELDS[table]

      expect(rug.minX).toBeGreaterThanOrEqual(COLONNADE_INNER_X.min)
      expect(rug.maxX).toBeLessThanOrEqual(COLONNADE_INNER_X.max)
      expect(isOnCasinoFloor(rug.minX, rug.minZ)).toBe(true)
      expect(isOnCasinoFloor(rug.maxX, rug.maxZ)).toBe(true)
      expect(rug.maxX).toBeGreaterThan(rug.minX)
      expect(rug.maxZ).toBeGreaterThan(rug.minZ)
    }
  })

  /*
   * The walk limit and the rug come off the same colonnade face now.
   *
   * Two unrelated numbers here is the strip's kerb bug indoors: the player gets
   * stopped standing on bare stone with the carpet ending short of their feet,
   * and nothing is broken enough for anything to fail.
   */
  it('stops the player inside the colonnade the rugs are laid to', () => {
    expect(WALK_BOUNDS.minX).toBeGreaterThan(COLONNADE_INNER_X.min)
    expect(WALK_BOUNDS.maxX).toBeLessThan(COLONNADE_INNER_X.max)
  })
})

describe('what stands on the floor', () => {
  /*
   * The strip's colonnade shipped as relief rather than as furniture and put a
   * 3.4-metre pillar in front of all three venue doors. This is the same object
   * in the same kind of room, so it goes through the same gate: every column,
   * every palm, against the tables, the sit spots, the door and the water.
   */
  it('keeps every column clear of everything else in the room', () => {
    expect(COLUMNS.length).toBeGreaterThan(0)

    for (const [x, z] of COLUMNS) {
      expect(clearsFloor(x, z, COLUMN_RADIUS)).toBe(true)
      expect(isOnCasinoFloor(x, z, COLUMN_RADIUS)).toBe(true)
    }
  })

  it('keeps every palm clear of everything else in the room', () => {
    expect(PALMS.length).toBeGreaterThan(0)

    for (const [x, z] of PALMS) {
      expect(clearsFloor(x, z, PALM_RADIUS)).toBe(true)
      expect(isOnCasinoFloor(x, z, PALM_RADIUS)).toBe(true)
    }
  })

  // A predicate that returned true everywhere would leave every assertion above
  // passing while proving nothing — the fifth one on this project to need this.
  it('rejects a column standing in a doorway or a table', () => {
    const [doorX, , doorZ] = EXIT_DOOR
    expect(clearsFloor(doorX, doorZ, COLUMN_RADIUS)).toBe(false)

    const [blackjackX, , blackjackZ] = tableOrigin(TableId.Blackjack)
    expect(clearsFloor(blackjackX, blackjackZ, COLUMN_RADIUS)).toBe(false)

    const [courtX, courtZ] = [
      (WATER_COURT.minX + WATER_COURT.maxX) / 2,
      (WATER_COURT.minZ + WATER_COURT.maxZ) / 2,
    ]
    expect(clearsFloor(courtX, courtZ, COLUMN_RADIUS)).toBe(false)
  })

  /*
   * The colonnade sets the side walls of the walkable floor now.
   *
   * Measured off the plaster instead, the limit lets the player stand inside a
   * column — and a column you can stand inside is a column that is not there.
   * This is the strip's kerb again: the walk limit and the last thing there is
   * to walk past have to be the same number.
   */
  it('stops the player short of the columns', () => {
    for (const [x] of COLUMNS) {
      expect(Math.abs(x) > Math.abs(WALK_BOUNDS.minX) || x > WALK_BOUNDS.maxX).toBe(true)
    }
    expect(WALK_BOUNDS.minX).toBeGreaterThan(COLUMN_X[0]! + COLUMN_RADIUS)
    expect(WALK_BOUNDS.maxX).toBeLessThan(COLUMN_X[1]! - COLUMN_RADIUS)
  })

  /*
   * The runner is the gap the tables leave, not a width somebody liked.
   *
   * Chosen by eye it runs under the craps rail, and marble showing through a
   * table is the first thing anybody would notice. Derived, the tables can move
   * and the aisle follows them.
   */
  it('lays the aisle in the gap between the tables', () => {
    expect(AISLE_WIDTH).toBeGreaterThan(0.9)
    expect(AISLE_MIN_X).toBeGreaterThanOrEqual(TABLE_FOOTPRINTS[TableId.Blackjack].maxX)
    expect(AISLE_MAX_X).toBeLessThanOrEqual(TABLE_FOOTPRINTS[TableId.Craps].minX)

    // And it has to line up with the door, or it is a runner to nowhere.
    const [doorX] = EXIT_DOOR
    expect(Math.abs(doorX - AISLE_CENTER_X)).toBeLessThan(AISLE_WIDTH / 2)
  })

  // The balcony oversails the long walls. Pushed too far in it would hang over
  // a table, which at four metres up is a ceiling dropped on the blackjack
  // dealer's head.
  it('keeps the balcony off the tables', () => {
    for (const table of TABLE_IDS) {
      expect(ROOM.minX + MEZZANINE_DEPTH).toBeLessThanOrEqual(TABLE_FOOTPRINTS[table].minX)
      expect(ROOM.maxX - MEZZANINE_DEPTH).toBeGreaterThanOrEqual(TABLE_FOOTPRINTS[table].maxX)
    }
    expect(MEZZANINE_HEIGHT).toBeLessThan(WALL_HEIGHT - 1)
  })
})
