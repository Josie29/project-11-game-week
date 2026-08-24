/**
 * Craps felt geometry, in normalized texture coordinates.
 *
 * Kept free of `three` and DOM imports for two reasons: the drawing pass and
 * the pointer-picking pass must agree on where a bet region is or the felt
 * lights up somewhere the player did not click, and a pure module is testable
 * under the suite's `node` environment.
 *
 * `u` runs left to right, `v` runs from the boxman's edge (0) to the player's
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

/**
 * The bets this table accepts.
 *
 * Deliberately the SPEC's simplified set — no come, place, hardway or
 * proposition bets. A real layout carries roughly forty labelled regions;
 * every one omitted here is one the player has no way to wager on, so drawing
 * it would be a lie the pointer picker has to work around.
 */
export enum CrapsBet {
  PassLine = 'pass-line',
  DontPass = 'dont-pass',
  Odds = 'odds',
  Field = 'field',
}

/** The six numbers that can become the point. */
export enum PointNumber {
  Four = 4,
  Five = 5,
  Six = 6,
  Eight = 8,
  Nine = 9,
  Ten = 10,
}

/** Printed label for each bet region. */
export const CRAPS_BET_LABELS: Readonly<Record<CrapsBet, string>> = {
  [CrapsBet.PassLine]: 'PASS LINE',
  [CrapsBet.DontPass]: "DON'T PASS BAR",
  [CrapsBet.Odds]: 'FREE ODDS',
  [CrapsBet.Field]: 'FIELD',
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

/** Horizontal inset shared by every band, leaving felt visible at the rails. */
const MARGIN_U = 0.08

/**
 * Bands stack from the boxman's edge to the player's.
 *
 * Ordering is the one thing here that is not cosmetic: pass line sits nearest
 * the player because that is the bet they place most, and free odds sits
 * directly behind it because odds are physically stacked behind a pass-line
 * bet on a real table.
 */
const BET_RECTS: Readonly<Record<CrapsBet, FeltRect>> = {
  [CrapsBet.Field]: { u0: MARGIN_U, v0: 0.3, u1: 1 - MARGIN_U, v1: 0.5 },
  [CrapsBet.DontPass]: { u0: MARGIN_U, v0: 0.54, u1: 1 - MARGIN_U, v1: 0.66 },
  [CrapsBet.Odds]: { u0: MARGIN_U, v0: 0.68, u1: 1 - MARGIN_U, v1: 0.78 },
  [CrapsBet.PassLine]: { u0: MARGIN_U, v0: 0.8, u1: 1 - MARGIN_U, v1: 0.96 },
}

/**
 * Front-to-back pick order.
 *
 * The bands do not overlap today, but ordering the search from the player's
 * edge inward means a future band that does overlap resolves to the nearer —
 * and more frequently wagered — bet rather than whichever was declared first.
 */
const PICK_ORDER: readonly CrapsBet[] = [
  CrapsBet.PassLine,
  CrapsBet.Odds,
  CrapsBet.DontPass,
  CrapsBet.Field,
]

const POINT_BOX_V0 = 0.06
const POINT_BOX_V1 = 0.26
/** Fraction of each box's slot left as a gap, so boxes read as separate. */
const POINT_BOX_GAP = 0.14

/**
 * Builds the point-number boxes as an evenly divided row.
 *
 * @returns One rect per point number, keyed for puck placement.
 */
function buildPointBoxRects(): Readonly<Record<PointNumber, FeltRect>> {
  const span = 1 - MARGIN_U * 2
  const slot = span / POINT_NUMBERS.length
  const gap = (slot * POINT_BOX_GAP) / 2

  const rects = {} as Record<PointNumber, FeltRect>
  POINT_NUMBERS.forEach((point, index) => {
    const slotStart = MARGIN_U + slot * index
    rects[point] = {
      u0: slotStart + gap,
      v0: POINT_BOX_V0,
      u1: slotStart + slot - gap,
      v1: POINT_BOX_V1,
    }
  })
  return rects
}

/**
 * Where each point number is printed.
 *
 * Display only — these are not bettable in the SPEC's scope. Exported so the
 * scene can park the ON puck over the established point instead of hard-coding
 * a position that drifts the moment the layout is retuned.
 */
export const POINT_BOX_RECTS = buildPointBoxRects()

/** Returns the region a bet occupies. */
export function getCrapsBetRect(bet: CrapsBet): FeltRect {
  return BET_RECTS[bet]
}

/** Returns the centre of a rect, for parking a chip stack or a puck. */
export function rectCenter(rect: FeltRect): { u: number; v: number } {
  return { u: (rect.u0 + rect.u1) / 2, v: (rect.v0 + rect.v1) / 2 }
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
