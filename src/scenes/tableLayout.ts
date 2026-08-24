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

/** Spent cards are pushed aside here as a round is cleared. */
export const DISCARD_POSITION: readonly [number, number, number] = [-2.05, SURFACE_Y, -0.15]

/**
 * Columns of the player's chip stash, tucked between the centre betting spot
 * and the near rail, on the side the player's signalling hand reaches from.
 *
 * The felt's player half is crowded — five printed spots plus two split
 * positions — so there is only a narrow band near the edge that is clear of
 * everything. Two columns fit; a third would collide with the left split hand.
 */
export const STASH_COLUMN_ANCHORS: readonly (readonly [number, number])[] = [
  [-0.4, 1.75],
  [-0.74, 1.67],
]

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

/** Where a hand's cards and chips sit, given how many hands are in play. */
export function handAnchorX(handIndex: number, handCount: number): number {
  if (handCount <= 1) return 0
  return handIndex === 0 ? -SPLIT_OFFSET : SPLIT_OFFSET
}
