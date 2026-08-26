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
