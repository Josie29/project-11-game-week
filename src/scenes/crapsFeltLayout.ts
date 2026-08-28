/**
 * Craps felt geometry, in normalized texture coordinates.
 *
 * Kept free of `three` and DOM imports for two reasons: the drawing pass and
 * the pointer-picking pass must agree on where a bet region is or the felt
 * lights up somewhere the player did not click, and a pure module is testable
 * under the suite's `node` environment.
 *
 * `u` runs left to right, `v` runs from the boxman's edge (0) to the shooter's
 * edge (1) — the same top-is-dealer convention as the blackjack felt, so both
 * textures survive `flipY` the same way.
 */

/** A bet region, as an axis-aligned rectangle in texture space. */
export interface FeltRect {
  readonly u0: number
  readonly v0: number
  readonly u1: number
  readonly v1: number
}

/** The six numbers that can become the point, and be placed. */
export enum PointNumber {
  Four = 4,
  Five = 5,
  Six = 6,
  Eight = 8,
  Nine = 9,
  Ten = 10,
}

/**
 * The bets this table accepts.
 *
 * Still a deliberate subset — no come, hardway or proposition bets. Every one
 * omitted is one the player has no way to wager on, so drawing it would be a
 * lie the pointer picker has to work around.
 *
 * The place bets were the exception worth making. The six numbered boxes were
 * already printed across the boxman's end, because a craps layout is not
 * recognisable without them, and they sat there inert — the felt's largest,
 * most prominent markings did nothing. Making them live turned the table's
 * biggest piece of decoration into the bet most players actually make.
 */
export enum CrapsBet {
  PassLine = 'pass-line',
  DontPass = 'dont-pass',
  Odds = 'odds',
  Field = 'field',
  Place4 = 'place-4',
  Place5 = 'place-5',
  Place6 = 'place-6',
  Place8 = 'place-8',
  Place9 = 'place-9',
  Place10 = 'place-10',
}

/** Printed label for each bet region. */
export const CRAPS_BET_LABELS: Readonly<Record<CrapsBet, string>> = {
  [CrapsBet.PassLine]: 'PASS LINE',
  [CrapsBet.DontPass]: "DON'T PASS BAR",
  [CrapsBet.Odds]: 'FREE ODDS',
  [CrapsBet.Field]: 'FIELD',
  [CrapsBet.Place4]: 'PLACE 4',
  [CrapsBet.Place5]: 'PLACE 5',
  [CrapsBet.Place6]: 'PLACE 6',
  [CrapsBet.Place8]: 'PLACE 8',
  [CrapsBet.Place9]: 'PLACE 9',
  [CrapsBet.Place10]: 'PLACE 10',
}

/** Numbers printed inside the field band, in the order they appear. */
export const FIELD_NUMBERS: readonly number[] = [2, 3, 4, 9, 10, 11, 12]

/** Point numbers in printed order, left to right across the top of the felt. */
export const POINT_NUMBERS: readonly PointNumber[] = [
  PointNumber.Four,
  PointNumber.Five,
  PointNumber.Six,
  PointNumber.Eight,
  PointNumber.Nine,
  PointNumber.Ten,
]

/** The place bet on each number, so a roll can find the bet it settles. */
export const PLACE_BETS: Readonly<Record<PointNumber, CrapsBet>> = {
  [PointNumber.Four]: CrapsBet.Place4,
  [PointNumber.Five]: CrapsBet.Place5,
  [PointNumber.Six]: CrapsBet.Place6,
  [PointNumber.Eight]: CrapsBet.Place8,
  [PointNumber.Nine]: CrapsBet.Place9,
  [PointNumber.Ten]: CrapsBet.Place10,
}

/** Every place bet, for iterating settlement and the panel's controls. */
export const PLACE_BET_LIST: readonly CrapsBet[] = POINT_NUMBERS.map(
  (point) => PLACE_BETS[point],
)

const PLACE_NUMBERS: ReadonlyMap<CrapsBet, PointNumber> = new Map(
  POINT_NUMBERS.map((point) => [PLACE_BETS[point], point]),
)

/**
 * The number a place bet rides on, or `null` for any other bet.
 *
 * A lookup rather than parsing the enum's string value, so renaming a member
 * cannot silently turn a place bet into a line bet.
 */
export function placeBetNumber(bet: CrapsBet): PointNumber | null {
  return PLACE_NUMBERS.get(bet) ?? null
}

/** Whether a bet is one of the six place bets. */
export function isPlaceBet(bet: CrapsBet): boolean {
  return PLACE_NUMBERS.has(bet)
}

/** Horizontal inset shared by every band, leaving felt visible at the rails. */
const MARGIN_U = 0.055

/**
 * Where the six numbered boxes sit, across the boxman's end.
 *
 * Deeper than they were. The table is a long rectangle now rather than a
 * squarish one, so a box that keeps its share of the felt's depth is short and
 * very wide — and these carry a number, its odds and a stack of chips.
 */
const PLACE_BOX_V0 = 0.03
const PLACE_BOX_V1 = 0.28
/** Fraction of each box's slot left as a gap, so boxes read as separate. */
const PLACE_BOX_GAP = 0.1

/**
 * Builds the six numbered boxes as an evenly divided row.
 *
 * @returns One rect per point number, keyed for both the chips and the puck.
 */
function buildPointBoxRects(): Readonly<Record<PointNumber, FeltRect>> {
  const span = 1 - MARGIN_U * 2
  const slot = span / POINT_NUMBERS.length
  const gap = (slot * PLACE_BOX_GAP) / 2

  const rects = {} as Record<PointNumber, FeltRect>
  POINT_NUMBERS.forEach((point, index) => {
    const slotStart = MARGIN_U + slot * index
    rects[point] = {
      u0: slotStart + gap,
      v0: PLACE_BOX_V0,
      u1: slotStart + slot - gap,
      v1: PLACE_BOX_V1,
    }
  })
  return rects
}

/**
 * Where each point number is printed — and, since the boxes became bettable,
 * where its place bet lives.
 *
 * Exported so the scene can park the ON puck over the established point
 * instead of hard-coding a position that drifts the moment the layout is
 * retuned.
 */
export const POINT_BOX_RECTS = buildPointBoxRects()

/**
 * Bands stack from the boxman's edge to the shooter's.
 *
 * Ordering is the one thing here that is not cosmetic: pass line sits nearest
 * the player because that is the bet they place most, and free odds sits
 * directly behind it because odds are physically stacked behind a pass-line
 * bet on a real table.
 *
 * Nearest, but not against the wall. The whole layout is pulled toward the
 * boxman so the pass line stops a sixth of the felt short of the near bumper,
 * because the rail standing 0.3 above the felt hides everything within about
 * 0.28 of it at any camera pitch that still shows the table as a table — and
 * the pass line, the biggest and most-bet marking on a craps layout, was the
 * thing behind it. No camera fixes that; the print has to move.
 */
const LINE_RECTS: Readonly<Record<string, FeltRect>> = {
  [CrapsBet.Field]: { u0: MARGIN_U, v0: 0.31, u1: 1 - MARGIN_U, v1: 0.46 },
  [CrapsBet.DontPass]: { u0: MARGIN_U, v0: 0.49, u1: 1 - MARGIN_U, v1: 0.585 },
  [CrapsBet.Odds]: { u0: MARGIN_U, v0: 0.605, u1: 1 - MARGIN_U, v1: 0.675 },
  [CrapsBet.PassLine]: { u0: MARGIN_U, v0: 0.7, u1: 1 - MARGIN_U, v1: 0.84 },
}

function buildBetRects(): Readonly<Record<CrapsBet, FeltRect>> {
  const rects = { ...LINE_RECTS } as Record<CrapsBet, FeltRect>
  for (const point of POINT_NUMBERS) {
    rects[PLACE_BETS[point]] = POINT_BOX_RECTS[point]
  }
  return rects
}

const BET_RECTS = buildBetRects()

/**
 * Front-to-back pick order.
 *
 * Ordering the search from the player's edge inward means a band that overlaps
 * another resolves to the nearer — and more frequently wagered — bet rather
 * than whichever was declared first.
 */
const PICK_ORDER: readonly CrapsBet[] = [
  CrapsBet.PassLine,
  CrapsBet.Odds,
  CrapsBet.DontPass,
  CrapsBet.Field,
  ...PLACE_BET_LIST,
]

/** Returns the region a bet occupies. */
export function getCrapsBetRect(bet: CrapsBet): FeltRect {
  return BET_RECTS[bet]
}

/** Returns the centre of a rect, for parking a chip stack or a puck. */
export function rectCenter(rect: FeltRect): { u: number; v: number } {
  return { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }
}

/*
 * The puck and eight players' chips all want the same box the moment the point
 * is a number people have money on — which is the common case, since the point
 * is what most people back. So the box is split: the puck takes the upper
 * left, sitting over the printed number the way a real ON puck does, and the
 * lower half of the box belongs to the chips.
 */
const PUCK_BOX_U = 0.26
/** How far down the box the puck sits: over the number, above the chips. */
const PUCK_BOX_V = 0.22

/**
 * Where along a band the first player's chips sit.
 *
 * A line bet runs the whole width of the table because a whole rail of players
 * share it; each one's chips sit on the stretch in front of them, not in the
 * middle. Stacked centrally they land squarely on the band's own label — a $50
 * pass line put two green chips through the middle of the word PASS LINE — and
 * they read as belonging to nobody.
 *
 * Matched to where the shooter stands, so slot 0 — the shooter's slot, and the
 * only slot a solo table ever uses — puts the chips exactly where the one
 * player this table used to have put them.
 */
const SHOOTER_U = 0.16

/** How far apart neighbouring slots sit along a band, in u. 0.495m of felt. */
const LINE_SLOT_PITCH_U = 0.11

/**
 * One chip slot per rail spot.
 *
 * `crapsFelt.test.ts` pins this to `CRAPS_RAIL_SPOTS.length` — the felt and
 * the rail have to agree on how many people can bet, and this module stays
 * dependency-free, so the agreement is a test rather than an import.
 */
export const CRAPS_BET_SLOTS = 8

/**
 * Where the four columns and two rows of a place box's chip grid sit, as
 * fractions of the box. The grid fills the lower half; the number and the
 * puck keep the upper. Pitches are 0.147m across and 0.144m down at the box's
 * 0.60 x 0.45m — the tightest spacing anywhere on the felt, and what bounds
 * the ownership ring under a stack: two rings that touch read as one player,
 * so `crapsFelt.test.ts` holds every pitch at two ring radii (see the ring
 * lip in `ChipStack`).
 */
const PLACE_SLOT_COLS = [0.13, 0.375, 0.62, 0.865] as const
const PLACE_SLOT_ROWS = [0.56, 0.88] as const

/**
 * Where one player's chips are stacked on a bet.
 *
 * Every bet region owns `CRAPS_BET_SLOTS` slots, one per rail spot, so every
 * player at the table has their own patch of every bet — "whose stack is
 * whose" is answered by the felt the same way the rail answers it, by where
 * you stand. Line bands spread the slots along their width; place boxes pack
 * them as a four-by-two grid in the lower half, clear of the puck above.
 *
 * @param bet The bet region.
 * @param slot The player's rail index, clamped into `[0, CRAPS_BET_SLOTS)`.
 */
export function betChipSlot(bet: CrapsBet, slot: number): { u: number; v: number } {
  const clamped = Math.min(CRAPS_BET_SLOTS - 1, Math.max(0, Math.floor(slot)))
  const rect = getCrapsBetRect(bet)

  if (!isPlaceBet(bet)) {
    return { u: SHOOTER_U + LINE_SLOT_PITCH_U * clamped, v: (rect.v0 + rect.v1) / 2 }
  }

  // Column advances every slot, row switches after four: `% 4` walks the
  // columns, `>> 2` (integer division by four) picks the row.
  const col = PLACE_SLOT_COLS[clamped % PLACE_SLOT_COLS.length] ?? 0.5
  const row = PLACE_SLOT_ROWS[clamped >> 2] ?? 0.75
  return {
    u: rect.u0 + (rect.u1 - rect.u0) * col,
    v: rect.v0 + (rect.v1 - rect.v0) * row,
  }
}

/**
 * Where a bet's chips are stacked on a table with one bettor: slot 0.
 */
export function betChipSpot(bet: CrapsBet): { u: number; v: number } {
  return betChipSlot(bet, 0)
}

/**
 * Where the ON puck sits once a number is the point: the upper left of its own
 * box, over the printed number.
 *
 * Paired with `betChipSlot` — move one without the other and the puck lands on
 * somebody's chips, which reads as the point being unreadable exactly when it
 * matters. The pairing is held by test rather than trust: every slot in the
 * box must clear the puck by a puck radius plus a chip radius.
 */
export function pointPuckSpot(point: PointNumber): { u: number; v: number } {
  const rect = POINT_BOX_RECTS[point]
  return {
    u: rect.u0 + (rect.u1 - rect.u0) * PUCK_BOX_U,
    v: rect.v0 + (rect.v1 - rect.v0) * PUCK_BOX_V,
  }
}

function contains(rect: FeltRect, u: number, v: number): boolean {
  return u >= rect.u0 && u <= rect.u1 && v >= rect.v0 && v <= rect.v1
}

/**
 * Resolves a texture-space point to the bet region under it.
 *
 * @param u Horizontal texture coordinate, expected in [0, 1].
 * @param v Vertical texture coordinate, expected in [0, 1].
 * @returns The bet under the point, or `null` for bare felt or an off-texture
 *   coordinate. Non-finite input yields `null` rather than throwing, because
 *   this runs off raycast UVs, which are absent on a miss.
 */
export function hitTestCrapsFelt(u: number, v: number): CrapsBet | null {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    return null
  }

  for (const bet of PICK_ORDER) {
    if (contains(BET_RECTS[bet], u, v)) {
      return bet
    }
  }
  return null
}
