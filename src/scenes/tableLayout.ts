/**
 * Where everything sits on the blackjack table.
 *
 * Pulled out of the scene component so the anchors can be unit-tested against
 * the felt outline. Positions here were derived by hand from the felt texture's
 * printed markings, and hand-derived table geometry has already produced two
 * bugs on this project — cards landing on the chip rack, and a dealing shoe
 * hanging over the edge. Testable is cheaper than another screenshot round.
 */

// The one thing this module takes from anywhere else, and it takes it rather
// than restating it: how much felt a chip covers decides how far a wager has to
// sit behind the cards it belongs to. `chipLayout` imports nothing at all.
import { CHIP_RADIUS } from './chipLayout'

/** Half the table's width, at its widest. */
export const HALF_WIDTH = 3.1
/** How far the felt reaches toward the player from the centre line. */
export const PLAYER_DEPTH = 2
/** How far it bulges behind the dealer. */
export const DEALER_DEPTH = 0.85

export const SLAB_THICKNESS = 0.16
export const TABLE_TOP_Y = 1

/**
 * A playing card, lying flat on the felt.
 *
 * Here rather than in `PlayingCard.tsx` because the felt has to make room for
 * it: how far back a seat's chips sit is the card's own length plus a chip, and
 * a size kept in the component is a size no layout test can reach. It was, and
 * every shared hand's wager sat a centimetre and a half on top of its cards.
 */
export const CARD_WIDTH = 0.34
export const CARD_HEIGHT = 0.48

/**
 * How far apart a fanned hand's cards sit, centre to centre, at full spread.
 *
 * Less than a card's width on purpose — a fan overlaps — which is also why
 * every fanned hand needs `CARD_LIFT_STEP`: overlapping quads on one plane
 * z-fight.
 */
export const CARD_SPACING = CARD_WIDTH * 0.82

/**
 * How much higher each successive card in a hand sits than the one before.
 *
 * Cards in a fan overlap, and two overlapping quads on the same plane flicker:
 * the depth buffer resolves about 0.01mm at this camera distance, so any two
 * cards that can overlap in plan view must differ in height by more than that.
 * 0.8mm per card is far above the threshold and invisible at table scale.
 *
 * Hands at one seat can overlap each other too (a resplit's columns sit closer
 * than a card is wide), so a hand's cards are additionally offset by a fraction
 * of a step per hand — see `SPLIT_HAND_LIFT` — keeping every overlappable pair
 * of cards on its own plane.
 */
export const CARD_LIFT_STEP = 0.0008

/**
 * The per-hand share of `CARD_LIFT_STEP` separating split hands' cards.
 *
 * Any divisor above the most hands a seat can hold keeps `cardIndex +
 * handIndex * SPLIT_HAND_LIFT` unique per card, so no two cards anywhere at a
 * seat share a plane. The smallest resulting gap is a quarter step — 0.2mm,
 * still well clear of what the depth buffer can resolve.
 */
export const SPLIT_HAND_LIFT = 1 / 4

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
 * The five stools, numbered ascending in x — the player's left to right.
 *
 * Numbering, not play order: seat numbers go over the wire, so which stool a
 * number means must never change. The order the seats *play* is the room's
 * `byPlayOrder` in `worker/playOrder.ts` — first base first, and first base is
 * the dealer's left, which is the *highest* index here: the dealer stands at
 * negative z facing the players, putting their left at positive x. From the
 * player's camera the round therefore starts at the right-hand stool and walks
 * left, as a real table plays.
 *
 * This array must stay sorted ascending in x — `blackjackSeats.test.ts` holds
 * both that and the play direction, because flipping either deals the table
 * backwards in a way no screenshot would show.
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
 * How far out the felt reaches on the player's side, at a given x.
 *
 * The table outline itself, solved for z — the same ellipse `isOnFelt` tests
 * against and `createTableShape` draws.
 */
export function feltEdgeZ(x: number): number {
  const across = Math.min(1, Math.abs(x) / HALF_WIDTH)
  return PLAYER_DEPTH * Math.sqrt(1 - across ** 2)
}

/**
 * Where a seated player's chips travel from: the rail in front of their stool.
 *
 * The tray at `STASH_ORIGIN` is the other half of this pair, and it belongs to
 * the middle stool alone — it is authored in the one band of the player's half
 * that is clear of everything, and that band is in front of the middle seat.
 * Anywhere else a player watched their wager fly out of a tray parked in front
 * of nobody, and at the centre seat of a shared table it landed on their own
 * cards.
 *
 * So a shared table has no tray, and each player's chips come from where a real
 * player's rack is. Derived from the table outline rather than chosen beside
 * it: the felt is an ellipse, so how far the rail reaches depends on how far
 * out the seat is, and third base has a good 34cm less table in front of it
 * than the middle seat does.
 *
 * @param stool Which of `SEAT_SPOTS` this player is at.
 */
export function seatChipsOrigin(stool: number): readonly [number, number, number] {
  const spot = SEAT_SPOTS[stool] ?? SEAT_SPOTS[0]!
  // Held far enough in from the edge that the whole stack is on the cloth
  // rather than half of it hanging over the rail.
  return [spot.x, SURFACE_Y, feltEdgeZ(spot.x) - SEAT_RAIL_INSET]
}

/**
 * How far in from the rail a seat's own chips are held.
 *
 * More than a chip's radius, because the edge is a curve: a stack set a radius
 * in from the boundary still crosses it either side of its own centre, and the
 * outer seats sit where that curve is turning hardest.
 */
export const SEAT_RAIL_INSET = 0.22

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
 *
 * Forward again by another 0.15 since, and for the same reason from the other
 * end. `SEAT_CHIP_GAP` is now the card's own half-length plus a chip's radius
 * rather than a number somebody picked, which is a centimetre and a half more
 * than it was — and at the old row depth that pushed the outer seats' split
 * wagers over the rail. Moving the cards forward keeps the chips exactly where
 * they were and takes the extra room out of the empty felt in front of the
 * dealer, which is the only place there is any.
 */
export const SHARED_ROW_Z = 0.84

/**
 * Where each seat's cards sit, one betting spot per stool.
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
/**
 * The middle stool, and the one a lone player takes by default.
 *
 * Lives here rather than beside the seats on the floor because it is a fact
 * about the felt: it is the only stool whose betting spot is on the centre
 * line, which is what makes the solo layout below possible at all.
 * `DEFAULT_BLACKJACK_SEAT` is this, so the two cannot drift apart.
 */
export const CENTER_SEAT = 2

/**
 * Whether this player has the felt to themselves *and* is sat in the middle of
 * it — the only case where the wide solo layout is geometrically possible.
 *
 * The one place the table chooses between its two layouts, so it is the one
 * place that has to be right. Three ways of being wrong, all of which shipped:
 *
 * Being alone is not enough. A lone player who walked to third base still had
 * their cards dealt to the centre line, a metre and a half from where they were
 * sitting, in front of two empty stools.
 *
 * Following the seat is not enough either, because the solo layout spends the
 * whole width of the table: it puts split hands at ±`SPLIT_OFFSET`, and that
 * offset carried out to third base lands the outer hand at about x = 2.9, on a
 * felt that is 1.86 wide by the time it reaches the chip row. So the middle
 * stool keeps the generous layout and every other stool takes its own spot,
 * exactly as it would with somebody sitting next to it.
 *
 * And `seatCount` alone cannot say whether anybody is here at all: the engine
 * holds a one-seat game for an empty table just as it does for a lone player.
 * A `null` seat is what separates them, which is why this takes one — a player
 * who is not at this table owns nothing on it.
 *
 * @param seat Which of `SEAT_SPOTS` this player is at, or null if they are not
 *   at this table.
 * @param seatCount How many hands are in play.
 */
export function ownsTheFelt(seat: number | null, seatCount: number): boolean {
  return seatCount <= 1 && seat === CENTER_SEAT
}

export const SEAT_SPOTS: readonly { readonly x: number; readonly z: number }[] = [
  { x: -1.73, z: SHARED_ROW_Z },
  { x: -0.86, z: SHARED_ROW_Z },
  { x: 0, z: SHARED_ROW_Z },
  { x: 0.86, z: SHARED_ROW_Z },
  { x: 1.73, z: SHARED_ROW_Z },
]

/**
 * The distance between neighbouring betting spots, at its narrowest.
 *
 * The narrowest, because the spots are not evenly spaced — the middle gaps are
 * a centimetre tighter than the outer ones — and everything clamped by a
 * seat's share of the felt has to fit the seat with the least of it. Derived
 * from the spots themselves so the clamps below cannot disagree with where
 * the seats actually are.
 */
export const SEAT_PITCH = SEAT_SPOTS.slice(1).reduce(
  (narrowest, spot, index) => Math.min(narrowest, spot.x - SEAT_SPOTS[index]!.x),
  Infinity,
)

/** Daylight a clamped layout keeps between itself and whatever bounds it. */
const FAN_CLEARANCE = 0.02

/**
 * How far a shared seat's split hands sit from its own spot.
 *
 * Derived, not chosen: as far out as a card-wide column can sit while its edge
 * stays clear of the seat boundary. Any further and two neighbouring seats'
 * split hands meet edge to edge — which is exactly what the hand-picked 0.26
 * that used to live here did across the table's narrower middle gaps.
 */
export const SEAT_SPLIT_OFFSET = SEAT_PITCH / 2 - CARD_WIDTH / 2 - FAN_CLEARANCE

/**
 * How far behind a seat's cards its chips sit, on a shared table.
 *
 * Derived, not chosen. A card lies flat and reaches half its own length back
 * from its anchor, and a chip stack reaches its own radius forward — so the two
 * touch at exactly the sum, and anything less puts the wager on top of the
 * cards. At the 0.25 that was here it did, by a centimetre and a half, on every
 * seat of every shared hand.
 */
export const SEAT_CHIP_GAP = CARD_HEIGHT / 2 + CHIP_RADIUS

/** Where one hand's cards and its wager sit on the cloth. */
export interface HandAnchor {
  readonly x: number
  readonly z: number
  readonly chipZ: number
}

/*
 * The felt has two layouts, and they are two functions rather than one with a
 * flag. Only one place in the game chooses between them at run time; everywhere
 * else — the pending wagers, every test — already knows which it wants, and had
 * been saying so by passing a seat count it did not mean.
 */

/**
 * The whole cloth, for one player sitting in the middle of it.
 *
 * Exactly what solo blackjack has always drawn — `handAnchorX` about the centre
 * line at `PLAYER_ROW_Z` — so every capture of a hand still holds. Only legal
 * when `ownsTheFelt`, because it spends the full width of the table.
 */
export function soloAnchor(handIndex: number, handCount: number): HandAnchor {
  return { x: handAnchorX(handIndex, handCount), z: PLAYER_ROW_Z, chipZ: CHIP_ROW_Z }
}

/**
 * One spot per stool, for a table with people sitting at it.
 *
 * The argument is which *stool*, not which of the engine's seats. The two were
 * the same thing while the room handed seats out in the order people bet; now
 * that a player picks their own, they are not — a table with two people at
 * first base and third base has two engine seats and five felt spots, and the
 * cards belong in front of the person who staked them.
 *
 * @param stool Which of `SEAT_SPOTS`, first base to third base.
 */
export function seatAnchor(stool: number, handIndex: number, handCount: number): HandAnchor {
  const spot = SEAT_SPOTS[stool] ?? SEAT_SPOTS[0]!
  const spread =
    handCount <= 1
      ? 0
      : -SEAT_SPLIT_OFFSET + handIndex * ((SEAT_SPLIT_OFFSET * 2) / (handCount - 1))

  return { x: spot.x + spread, z: spot.z, chipZ: spot.z + SEAT_CHIP_GAP }
}

/**
 * How far each card past the first steps toward the dealer in a split hand.
 *
 * Split hands cascade in depth rather than fanning sideways, the way a real
 * dealer lays them: a seat is `SEAT_PITCH` wide and a card `CARD_WIDTH`, so
 * two sideways fans of any size cannot fit and a cascaded column never
 * widens at all — cross-seat clearance holds by construction, at any card
 * count.
 */
export const SPLIT_CASCADE_Z = 0.12

/**
 * The nearest a cascaded card's centre may come to the dealer's row: the
 * dealer's cards reach half a length toward the player and the cascading card
 * half a length back, plus daylight.
 */
const CASCADE_FLOOR_Z = DEALER_ROW_Z + CARD_HEIGHT + 2 * FAN_CLEARANCE

/** Steps a cascade may take before it must hold; later cards stack in place. */
const CASCADE_MAX_STEPS = Math.floor((SHARED_ROW_Z - CASCADE_FLOOR_Z) / SPLIT_CASCADE_Z)

/** One card's centre on the cloth. */
export interface CardPlacement {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Centre-to-centre spacing for a fan that must stay inside `halfBudget` of
 * its anchor, card edges included. Full `CARD_SPACING` until the hand grows
 * enough to need tightening.
 */
export function fanSpacing(cardCount: number, halfBudget: number): number {
  if (cardCount <= 1) return CARD_SPACING
  const fits = (2 * (halfBudget - CARD_WIDTH / 2)) / (cardCount - 1)
  return Math.min(CARD_SPACING, Math.max(0, fits))
}

/** Every card in a hand lifted clear of every other it could overlap. */
function cardY(handIndex: number, cardIndex: number): number {
  return SURFACE_Y + (cardIndex + handIndex * SPLIT_HAND_LIFT) * CARD_LIFT_STEP
}

/** An x-fan of `cardCount` cards centred on `anchorX`. */
function fanPlacements(
  anchorX: number,
  z: number,
  handIndex: number,
  cardCount: number,
  halfBudget: number,
): CardPlacement[] {
  const spacing = fanSpacing(cardCount, halfBudget)
  return Array.from({ length: cardCount }, (_, index) => ({
    x: anchorX + (index - (cardCount - 1) / 2) * spacing,
    y: cardY(handIndex, index),
    z,
  }))
}

/**
 * Where each of a hand's cards sits at a shared seat.
 *
 * One hand fans sideways, clamped to its seat's half-pitch so even a long
 * hand never crosses into the neighbouring seat — unclamped, a four-card fan
 * already did. Split hands become fixed-x columns at the `seatAnchor` spread
 * and cascade toward the dealer instead, holding short of the dealer's row.
 */
export function seatCardPlacements(
  stool: number,
  handIndex: number,
  handCount: number,
  cardCount: number,
): CardPlacement[] {
  const anchor = seatAnchor(stool, handIndex, handCount)

  if (handCount <= 1) {
    return fanPlacements(anchor.x, anchor.z, handIndex, cardCount, SEAT_PITCH / 2 - FAN_CLEARANCE)
  }

  return Array.from({ length: cardCount }, (_, index) => ({
    x: anchor.x,
    y: cardY(handIndex, index),
    z: anchor.z - Math.min(index, CASCADE_MAX_STEPS) * SPLIT_CASCADE_Z,
  }))
}

/**
 * Where each of a hand's cards sits for the lone player who owns the felt.
 *
 * Always a fan — the solo layout has `SPLIT_OFFSET` of room per hand, so the
 * clamp only bites on hands too long to see in play — bounded by half the gap
 * to the neighbouring hand once there is one.
 */
export function soloCardPlacements(
  handIndex: number,
  handCount: number,
  cardCount: number,
): CardPlacement[] {
  const anchor = soloAnchor(handIndex, handCount)
  const neighbourBudget =
    handCount <= 1 ? SPLIT_OFFSET : SPLIT_OFFSET / (handCount - 1) - FAN_CLEARANCE
  // The felt is an ellipse, and the solo layout spends enough of its width
  // that a long outer hand can fan past the rail: the edge here is wherever
  // the cloth is narrowest across the card's own depth — its near corner.
  const feltAcross = HALF_WIDTH * Math.sqrt(1 - ((anchor.z + CARD_HEIGHT / 2) / PLAYER_DEPTH) ** 2)
  const feltBudget = feltAcross - Math.abs(anchor.x) - FAN_CLEARANCE
  return fanPlacements(anchor.x, anchor.z, handIndex, cardCount, Math.min(neighbourBudget, feltBudget))
}

/** The dealer's fan: centred on the table, lifted per card like any other. */
export function dealerCardPlacement(index: number, count: number): CardPlacement {
  return {
    x: (index - (count - 1) / 2) * CARD_SPACING,
    y: cardY(0, index),
    z: DEALER_ROW_Z,
  }
}

/** How far onto the upcard the second card rests while levering it over. */
const WEDGE_OVERLAP_X = CARD_WIDTH * 0.45

/** Clearly on top of the upcard, not fighting its surface. */
const WEDGE_LIFT_Y = 0.006

/**
 * Where the dealer's second card pauses to flip the first one face up.
 *
 * On the upcard's inner edge and a hair above it, so the moment reads as one
 * card levering the other over — the casino hole-card move — before it slides
 * to its own spot in the row. `count` is the cards shown while the move
 * happens, which during the opening is always two.
 */
export function dealerHoleWedge(count: number): CardPlacement {
  const upcard = dealerCardPlacement(0, count)
  return { x: upcard.x + WEDGE_OVERLAP_X, y: upcard.y + WEDGE_LIFT_Y, z: upcard.z }
}
