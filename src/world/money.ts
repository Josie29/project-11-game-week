/*
 * The two ways back from broke, and the arithmetic behind them.
 *
 * Pure, and tested, for the same reason the payout ratios are: money on this
 * project is whole dollars everywhere, and a debt that repays a *fraction* of
 * every win is exactly the shape of the bug that got a 6:5 blackjack paying
 * `22.000000000000004`. Nothing here returns a number the HUD cannot print.
 */

/** What a marker hands over, and therefore what you owe for it. */
export const MARKER_AMOUNT = 500

/**
 * What a pint pays.
 *
 * There is no cooldown: you can give as often as you are willing to sit through
 * it, and the only cost is the ten seconds it takes. That makes the clinic a
 * reliable income rather than a floor to fall back on — worth knowing when
 * tuning the tables against it.
 */
export const DONATION_FEE = 100

/**
 * The house's cut of every win while a marker is outstanding.
 *
 * Half. Enough that a marker is felt on every hand until it is square, and not
 * so much that climbing out is hopeless.
 */
export const REPAY_SHARE = 0.5

export interface WinningsSplit {
  /** What actually reaches the player. */
  readonly toBankroll: number
  /** What the house keeps against the marker. */
  readonly toDebt: number
}

/**
 * Splits a win between the player and their outstanding marker.
 *
 * Integer throughout. `Math.floor` on the house's share rather than the
 * player's is deliberate: the odd dollar goes to the player, and a $1 win pays
 * the player $1 rather than vanishing into a debt it cannot dent.
 *
 * @param amount Chips being credited. Must be a non-negative whole number.
 * @param debt What is currently owed. Must be a non-negative whole number.
 * @returns How the amount divides. The two parts always sum to `amount`.
 */
export function splitWinnings(amount: number, debt: number): WinningsSplit {
  if (amount <= 0 || debt <= 0) {
    return { toBankroll: Math.max(0, amount), toDebt: 0 }
  }

  const toDebt = Math.min(debt, Math.floor(amount * REPAY_SHARE))
  return { toBankroll: amount - toDebt, toDebt }
}
