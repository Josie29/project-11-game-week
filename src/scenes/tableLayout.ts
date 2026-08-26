/**
 * Where everything sits on the blackjack table.
 *
 * Pulled out of the scene component so the anchors can be unit-tested against
 * the felt outline. Positions here were derived by hand from the felt texture's
 * printed markings, and hand-derived table geometry has already produced two
 * bugs on this project — cards landing on the chip rack, and a dealing shoe
 * hanging over the edge. Testable is cheaper than another screenshot round.
 */

/** Half the table's width, at its widest. */
export const HALF_WIDTH = 3.1
/** How far the felt reaches toward the player from the centre line. */
export const PLAYER_DEPTH = 2
/** How far it bulges behind the dealer. */
export const DEALER_DEPTH = 0.85

export const SLAB_THICKNESS = 0.16
export const TABLE_TOP_Y = 1

/** Anything resting on the felt sits a hair above it to avoid z-fighting. */
export const SURFACE_Y = TABLE_TOP_Y + 0.016

export const DEALER_ROW_Z = -0.18
export const PLAYER_ROW_Z = 1.15
/** The centre betting spot printed on the felt. */
export const CHIP_ROW_Z = 1.6

/** How far each hand sits either side of centre once the player splits. */
export const SPLIT_OFFSET = 1.15

/**
 * Lateral nudge for the payout stack.
 *
 * Winnings land *on top of* the wager, offset just enough to read as a second
 * pile pushed against the first. Setting them fully beside the wager was the
 * obvious choice and it does not fit: with a split, the outer hand's payout
 * falls off the felt edge, and the inner hand's lands on the player's stash.
 */
export const PAYOUT_NUDGE_X = 0.055
export const PAYOUT_NUDGE_Z = 0.03

/** The dealer's chip rack — where losing wagers go. */
export const DEALER_RACK: readonly [number, number, number] = [0.15, TABLE_TOP_Y + 0.14, -0.63]

/**
 * The dealing shoe, at the dealer's left.
 *
 * `SHOE_MOUTH` is the lip cards actually emerge from, a little forward of the
 * body's centre — dealing from the middle of the box looks like cards
 * materialising inside it.
 */
export const SHOE_POSITION: readonly [number, number, number] = [-1.62, TABLE_TOP_Y, -0.42]
export const SHOE_ROTATION_Y = 0.3
export const SHOE_MOUTH: readonly [number, number, number] = [-1.36, TABLE_TOP_Y + 0.055, -0.24]

/**
 * The discard tray, at the dealer's right.
 *
 * Deliberately the opposite side from the shoe. It previously sat at x = -2.05,
 * alongside the shoe, which is not how any table is laid out: cards come off
 * the dealer's left and spent hands go down on their right.
 */
export const DISCARD_TRAY: readonly [number, number, number] = [2.05, TABLE_TOP_Y, -0.2]

/**
 * The five seats, **in the order they play**.
 *
 * Index 0 is first base and index 4 is third base, because casino blackjack
 * runs one player at a time from the dealer's left round to the dealer's right.
 * The engine takes the seats in ascending index order, so this array is the
 * only thing that makes its turn order and the room's furniture agree.
 *
 * Which side is the dealer's left is not a matter of opinion here: `SHOE_POSITION`
 * sits at their left at x = -1.62 and `DISCARD_TRAY` at their right at x = 2.05.
 * First base is therefore the most negative x, and this array must stay sorted
 * that way — `blackjackSeats.test.ts` holds it, because reversing it would deal
 * the table backwards in a way no screenshot would show.
 */
export const PLAYER_SEATS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -2.6, z: 2.5 },
  { x: -1.35, z: 2.85 },
  { x: 0, z: 2.95 },
  { x: 1.35, z: 2.85 },
  { x: 2.6, z: 2.5 },
]
export const DISCARD_ROTATION_Y = -0.34

/** Where spent cards are pushed as a round is cleared. */
export const DISCARD_POSITION: readonly [number, number, number] = [2.05, SURFACE_Y + 0.06, -0.2]

/**
 * Columns of the player's chip stash, tucked between the centre betting spot
 * and the near rail, on the side the player's signalling hand reaches from.
 *
 * The felt's player half is crowded — five printed spots plus two split
 * positions — so there is only a narrow band near the edge that is clear of
 * everything. Two columns fit; a third would collide with the left split hand.
 */
export const STASH_COLUMN_ANCHORS: readonly (readonly [number, number])[] = [
  [-0.39, 1.638],
  [-0.69, 1.562],
]

/**
 * A shallow chip well under the stash.
 *
 * Without it the stash and the wager are three similar stacks in a row and a
 * player cannot tell their money from their bet. The well is what says "these
 * are yours" — the same job the rail groove does on a real table.
 *
 * Sized so all four corners stay on the felt; see `stash rail` in the tests.
 */
export const STASH_RAIL = {
  center: [-0.54, 1.6] as const,
  rotationY: -0.245,
  length: 0.62,
  width: 0.32,
  /**
   * Height of the tray floor the chips rest on.
   *
   * A flat plate on the felt was too subtle to separate the stash from the
   * wager at this camera distance. Lifting the chips into a walled tray gives
   * a height difference, which reads where a colour difference did not.
   */
  wallHeight: 0.05,
} as const

/** The rail's four corners in world XZ, for bounds checking. */
export function stashRailCorners(): [number, number][] {
  const { center, rotationY, length, width } = STASH_RAIL
  const alongX = Math.cos(rotationY)
  const alongZ = -Math.sin(rotationY)

  const corners: [number, number][] = []
  for (const lengthwise of [-0.5, 0.5]) {
    for (const crosswise of [-0.5, 0.5]) {
      corners.push([
        center[0] + alongX * length * lengthwise - alongZ * width * crosswise,
        center[1] + alongZ * length * lengthwise + alongX * width * crosswise,
      ])
    }
  }
  return corners
}

/** Chips shown in the stash at once, across all its columns. */
export const MAX_STASH_CHIPS = 10

/** Anchor the stash travels to and from, for chips in flight. */
export const STASH_ORIGIN: readonly [number, number, number] = [
  STASH_COLUMN_ANCHORS[0]?.[0] ?? -0.4,
  SURFACE_Y,
  STASH_COLUMN_ANCHORS[0]?.[1] ?? 1.75,
]

/**
 * Tests whether a point lies on the felt.
 *
 * The table is two half-ellipses sharing a waist: a deep one toward the player
 * and a shallow bulge behind the dealer, so the depth used depends on which
 * side of the centre line the point falls.
 *
 * @param x Distance from the centre line, positive to the dealer's left.
 * @param z Distance along the table; positive toward the player.
 * @param margin How far inside the edge the point must sit, in world units.
 */
export function isOnFelt(x: number, z: number, margin = 0): boolean {
  const depth = z >= 0 ? PLAYER_DEPTH : DEALER_DEPTH
  const halfWidth = HALF_WIDTH - margin
  const halfDepth = depth - margin

  if (halfWidth <= 0 || halfDepth <= 0) return false

  return (x / halfWidth) ** 2 + (z / halfDepth) ** 2 <= 1
}

/**
 * Where a hand's cards and chips sit, given how many hands are in play.
 *
 * Spread evenly about the centre line, so two hands sit at ±`SPLIT_OFFSET` and
 * three add one back on the centre spot. The centre is deliberately the *last*
 * position filled: it is the only other spot on this felt that is both clear of
 * the player's stash and inside the edge at `CHIP_ROW_Z`, which is why a fourth
 * hand is not offered — see `MAX_HANDS`.
 *
 * @param handIndex Which hand, left to right as the player sees them.
 * @param handCount How many hands are in play.
 */
export function handAnchorX(handIndex: number, handCount: number): number {
  if (handCount <= 1) return 0

  const step = (SPLIT_OFFSET * 2) / (handCount - 1)
  return -SPLIT_OFFSET + handIndex * step
}

/**
 * The row five seats share, a little forward of where one player sits alone.
 *
 * The felt is an ellipse, so its usable width falls away as it goes back: 2.54
 * at the solo card row and only 1.86 at the solo chip row. Five seats do not
 * fit across the back of it — the cards go on and the chips fall off the table.
 * Moving the whole row forward by 0.16 and closing the gap between a seat's
 * cards and its chips is what buys the width, and it is the smallest change
 * that does: everything else tried either put the cards out by the dealer or
 * left a stack overhanging the rail.
 */
export const SHARED_ROW_Z = 0.99

/**
 * Where each seat's cards sit, first base to third base.
 *
 * Same order as `PLAYER_SEATS`, so the stool and the betting spot in front of
 * it belong to the same seat index — asserted, because a player sitting behind
 * somebody else's cards is the kind of thing that looks fine until two people
 * are actually at the table.
 *
 * Narrower than the stools they belong to: the seats span ±1.73 and the stools
 * ±2.6, so the outer players reach inward for their cards. That is what a real
 * table looks like, and it is also the only way five sets of chips stay on an
 * oval this size.
 */
export const SEAT_SPOTS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -1.73, z: SHARED_ROW_Z },
  { x: -0.86, z: SHARED_ROW_Z },
  { x: 0, z: SHARED_ROW_Z },
  { x: 0.86, z: SHARED_ROW_Z },
  { x: 1.73, z: SHARED_ROW_Z },
]

/**
 * How far a shared seat's split hands sit from its own spot.
 *
 * A quarter of the solo value, because a lone player owns the whole felt and a
 * seat at a full table owns about a fifth of it. Wide enough to read as two
 * hands, narrow enough that a resplit at the outer seats stays on the table.
 */
export const SEAT_SPLIT_OFFSET = 0.26

/** How far behind a seat's cards its chips sit, on a shared table. */
export const SEAT_CHIP_GAP = 0.25

/**
 * Where one hand belongs: which seat, and which of that seat's hands.
 *
 * A one-seat table returns exactly what it always did — `handAnchorX` about the
 * centre line at `PLAYER_ROW_Z` — so solo blackjack is unchanged down to the
 * pixel and every capture of it still holds. The arc only exists once somebody
 * else sits down.
 */
export function handAnchor(
  seatIndex: number,
  seatCount: number,
  handIndex: number,
  handCount: number,
): { x: number; z: number; chipZ: number } {
  if (seatCount <= 1) {
    return {
      x: handAnchorX(handIndex, handCount),
      z: PLAYER_ROW_Z,
      chipZ: CHIP_ROW_Z,
    }
  }

  const spot = SEAT_SPOTS[seatIndex] ?? SEAT_SPOTS[0]!
  const spread =
    handCount <= 1
      ? 0
      : -SEAT_SPLIT_OFFSET + handIndex * ((SEAT_SPLIT_OFFSET * 2) / (handCount - 1))

  return { x: spot.x + spread, z: spot.z, chipZ: spot.z + SEAT_CHIP_GAP }
}
