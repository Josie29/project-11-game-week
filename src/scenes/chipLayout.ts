export interface ChipDenomination {
  readonly value: number
  readonly color: string
  /** Inlay ring on the chip's top face. */
  readonly edge: string
}

/**
 * Denominations, largest first, following common casino colours.
 *
 * The $500 chip exists so a bankroll that runs up past a few hundred dollars
 * gets taller-value chips instead of an ever-growing tower of blacks.
 */
export const CHIP_DENOMINATIONS: readonly ChipDenomination[] = [
  { value: 500, color: '#6f3fa8', edge: '#e7dcf5' },
  { value: 100, color: '#2b2e45', edge: '#e6e9f5' },
  { value: 25, color: '#1a9159', edge: '#eaf3ec' },
  { value: 10, color: '#2f6ecb', edge: '#dce6f7' },
  { value: 5, color: '#cc2440', edge: '#f6dade' },
]

/**
 * The chip actually in hand, given the one the player picked.
 *
 * A bet can spend the bankroll below the denomination last chosen, and the
 * choice has to survive that without a correction step: two views read this —
 * the rack in the bar and the felt itself — and an effect reaching back to fix
 * the stored pick would let them disagree for a frame.
 *
 * @returns The picked value if it is still affordable, otherwise the largest
 *   that is, or 0 when nothing on the rack is.
 */
export function heldChipValue(picked: number, bankroll: number): number {
  if (picked <= bankroll) return picked

  const affordable = CHIP_DENOMINATIONS.filter((chip) => chip.value <= bankroll)
  return affordable[0]?.value ?? 0
}

/** Chips per column before the stack spills into the next one. */
export const MAX_CHIPS_PER_COLUMN = 5

/**
 * Breaks an amount into chips, largest denomination first.
 *
 * Amounts are rounded down to the nearest $5, the smallest chip on the table,
 * so an odd remainder cannot silently vanish into a fractional chip.
 *
 * @param amount Chips' worth in dollars. Non-positive amounts yield nothing.
 * @returns One entry per physical chip, largest first.
 */
export function chipBreakdown(amount: number): ChipDenomination[] {
  if (!Number.isFinite(amount) || amount <= 0) return []
  return breakdownUsing(amount, CHIP_DENOMINATIONS)
}

/**
 * Breaks an amount into chips chosen to look like a stash rather than a wager.
 *
 * Plain largest-first is right for a bet — $25 is one green chip, as it would
 * be on a real table — but wrong for a bankroll, where it renders $500 as a
 * single lonely chip. This picks the smallest denomination whose breakdown
 * still fits `maxChips`, giving the fullest-looking stash that stays inside the
 * space available, and it scales: a bankroll in the thousands quietly moves up
 * to purple $500 chips instead of growing without bound.
 *
 * @param amount Bankroll in dollars.
 * @param maxChips Most chips the stash has room to show.
 */
export function stashBreakdown(amount: number, maxChips: number): ChipDenomination[] {
  if (!Number.isFinite(amount) || amount <= 0 || maxChips <= 0) return []

  let fallback: ChipDenomination[] = []

  // Walk from the smallest denomination upward, taking the first that fits —
  // smaller denominations mean more chips, which is what we want.
  for (let start = CHIP_DENOMINATIONS.length - 1; start >= 0; start--) {
    const chips = breakdownUsing(amount, CHIP_DENOMINATIONS.slice(start))
    if (chips.length <= maxChips) return chips
    fallback = chips
  }

  // Larger than the biggest denomination can express in the space; show what
  // fits, highest value first, rather than nothing.
  return fallback.slice(0, maxChips)
}

/** Greedy largest-first breakdown over a given set of denominations. */
function breakdownUsing(
  amount: number,
  denominations: readonly ChipDenomination[],
): ChipDenomination[] {
  const chips: ChipDenomination[] = []
  let remaining = Math.floor(amount)

  for (const denomination of denominations) {
    const count = Math.floor(remaining / denomination.value)
    for (let i = 0; i < count; i++) chips.push(denomination)
    remaining -= count * denomination.value
  }

  return chips
}

/**
 * Packs chips into columns of at most `MAX_CHIPS_PER_COLUMN`.
 *
 * @param chips Chips in the order returned by `chipBreakdown`.
 * @param columnLimit Maximum number of columns. Chips beyond this are dropped,
 *   which keeps a very large bankroll from spilling across the whole felt; the
 *   highest denominations come first, so what survives is the valuable end.
 */
export function packIntoColumns(
  chips: readonly ChipDenomination[],
  columnLimit: number,
): ChipDenomination[][] {
  const columns: ChipDenomination[][] = []

  for (const chip of chips) {
    let column = columns[columns.length - 1]

    if (!column || column.length >= MAX_CHIPS_PER_COLUMN) {
      if (columns.length >= columnLimit) break
      column = []
      columns.push(column)
    }

    column.push(chip)
  }

  return columns
}

/** Total face value of a set of chips. */
export function chipsValue(chips: readonly ChipDenomination[]): number {
  return chips.reduce((sum, chip) => sum + chip.value, 0)
}

/** Height of a stack of `count` chips, for sitting one pile on top of another. */
export function stackHeight(count: number): number {
  return count * CHIP_THICKNESS
}

/** Thickness of a single chip, shared by the renderer and the stacking maths. */
export const CHIP_THICKNESS = 0.045
export const CHIP_RADIUS = 0.15

/**
 * How much smaller a craps chip draws than a blackjack chip.
 *
 * The craps felt now seats eight players' stacks per bet region (issue #18),
 * and eight full-size stacks cannot share a 0.60 x 0.45m place box — nor
 * could one full-size chip ever really sit inside the 0.126m-deep odds band
 * it overhung. Blackjack keeps `CHIP_RADIUS` unscaled: its felt gives every
 * seat its own patch.
 */
export const CRAPS_CHIP_SCALE = 0.35

/**
 * How far the ownership ring under a stack reaches past its chips, in metres
 * of felt (unscaled, so the lip stays readable on small chips).
 *
 * Bounded by the tightest slot pitch on the felt: two rings that touch read
 * as one player's chips, so `crapsFelt.test.ts` holds every pair of slots at
 * least two ring radii apart — the place grid's pitches in `betChipSlot`
 * were widened to make this lip affordable.
 */
export const RING_LIP = 0.018

/**
 * One ring tint per rail place, brightest first.
 *
 * Keyed by rail index rather than by the player's outfit, because outfits do
 * not separate people: everyone who never opens the wardrobe wears the same
 * default midnight, so garment-coloured rings matched exactly when telling
 * players apart mattered most. The rail index is already the felt's identity
 * — `betChipSlot` places stacks by it — so the ring says the same thing the
 * position says, twice.
 *
 * Index 0 is the shooter's slot, so the shooter's stacks always ride the
 * gold ring, whoever is shooting. None of these may match a denomination
 * colour (`CHIP_DENOMINATIONS`) — the ring must never read as one more chip.
 */
export const RAIL_RING_COLORS: readonly string[] = [
  '#e8b54d', // gold — the shooter
  '#40e0d0', // turquoise
  '#ff2d95', // magenta
  '#f2effa', // porcelain
  '#f28a30', // amber
  '#a8e34d', // lime
  '#b39df2', // lavender
  '#ff7d6b', // coral
]

/**
 * The tint of the ring drawn under the stacks at one rail place.
 *
 * Clamped, not modular: an out-of-range index is a transient lineup glitch,
 * and wrapping it would hand a ninth player the shooter's gold.
 */
export function railChipRing(railIndex: number): string {
  const clamped = Math.min(RAIL_RING_COLORS.length - 1, Math.max(0, Math.floor(railIndex)))
  return RAIL_RING_COLORS[clamped] ?? RAIL_RING_COLORS[0]!
}
