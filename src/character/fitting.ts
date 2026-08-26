/*
 * Trying something on without paying for it.
 *
 * The wardrobe has one hard rule and it is worth keeping: `equip` refuses
 * anything not in `owned`, and `sanitizeEquipped` drops any saved id that is
 * not owned, so no save and no tampered `localStorage` can hand out a $900
 * pendant. The shop still has to let you see what the pendant looks like on.
 *
 * The answer is a second, thinner layer rather than a hole in the first. The
 * fitting is what is on the body *on approval*: session-only, never persisted,
 * and cleared when you leave the shop. `equipped` continues to mean "paid for".
 *
 * Pure, like the rest of `src/character/` — no store and no rendering imports,
 * so what happens when you take off a borrowed jacket over a jacket you own is
 * assertable rather than something to be discovered in a screenshot.
 */

import {
  findItem,
  SLOT_ORDER,
  type EquippedItems,
  type ShopItem,
  type Slot,
} from './catalog'

/** The wardrobe after a bill is settled, and what it came to. */
export interface Settlement {
  /** Item ids paid for, in catalogue order. Never contains a duplicate. */
  readonly owned: readonly string[]
  /** What is worn and paid for afterwards — the approval layer folded in. */
  readonly equipped: EquippedItems
  /** What was charged, in whole dollars. */
  readonly total: number
}

/**
 * Items on the body that have not been paid for, one per slot.
 *
 * Shaped exactly like `EquippedItems` on purpose: the two are overlaid, and a
 * slot can never hold both a borrowed item and an owned one at once.
 */
export type Fitting = EquippedItems

export const NO_FITTING: Fitting = {}

/**
 * What the character actually wears: owned kit, with the fitting over the top.
 *
 * @param equipped What the player owns and has on. Persisted.
 * @param fitting What they are trying on. Session only.
 * @returns One item id per occupied slot, the fitting winning where both hold
 *   something.
 */
export function fitted(equipped: EquippedItems, fitting: Fitting): EquippedItems {
  return { ...equipped, ...fitting }
}

/**
 * What is on a slot right now: the borrowed item if there is one, else the owned.
 *
 * This is what F at a display compares against to decide whether it is putting
 * something on or taking it off. Reading only `equipped` would make the key
 * offer to try on the gown you are already standing there wearing.
 */
export function wornInSlot(
  equipped: EquippedItems,
  fitting: Fitting,
  slot: Slot,
): string | undefined {
  return fitting[slot] ?? equipped[slot]
}

/** Whether anything is on approval at all. */
export function isFitting(fitting: Fitting): boolean {
  return SLOT_ORDER.some((slot) => fitting[slot] !== undefined)
}

/**
 * The unpaid items currently on the body, in the order the shop lists slots.
 *
 * Unknown ids are dropped rather than thrown on, for the same reason
 * `equippedItems` drops them: a fitting is built from clicks in this session,
 * but the code that reads it should not be the place a bad id first surfaces.
 */
export function onApproval(fitting: Fitting): readonly ShopItem[] {
  return SLOT_ORDER.map((slot) => findItem(fitting[slot])).filter(
    (item): item is ShopItem => item !== null,
  )
}

/** What it would cost to walk out in what you have on. Whole dollars. */
export function approvalTotal(fitting: Fitting): number {
  return onApproval(fitting).reduce((total, item) => total + item.price, 0)
}

/**
 * The fitting with one slot given up.
 *
 * Returned rather than mutated so the store's `set` gets a fresh object and the
 * scene re-renders. Taking off a slot the fitting does not hold is a no-op, and
 * the caller then unequips whatever is owned in it — two presses of F, the
 * first returning the borrowed jacket, the second removing your own.
 */
export function withoutSlot(fitting: Fitting, slot: Slot): Fitting {
  if (fitting[slot] === undefined) return fitting

  const next = { ...fitting }
  delete next[slot]
  return next
}

/** The fitting with an item added, replacing whatever was borrowed in its slot. */
export function withItem(fitting: Fitting, item: ShopItem): Fitting {
  return { ...fitting, [item.slot]: item.id }
}

/**
 * The whole bill, settled in one move: everything on approval becomes owned.
 *
 * Pure, and returned rather than applied, because this is the one place in the
 * shop where money and geometry meet and both have to be right. The store's job
 * afterwards is two lines — debit `total`, take this wardrobe — and neither of
 * them can half-happen.
 *
 * The old per-item `buy` could not express the thing the counter is for. Paying
 * for four things one at a time is four chances to end up owning two of them
 * with the bankroll spent, which is only a shop if you squint; a bill is either
 * settled or it is not.
 *
 * Whole dollars throughout: prices are integers and this only ever sums them,
 * so no ratio can get in. Unknown ids are dropped by `onApproval` rather than
 * charged for.
 *
 * @param equipped What is already owned and worn.
 * @param owned Every item id already paid for.
 * @param fitting What is on the body on approval.
 * @returns The wardrobe as it stands once the bill is paid, and the amount.
 */
export function payFor(
  equipped: EquippedItems,
  owned: readonly string[],
  fitting: Fitting,
): Settlement {
  const bought = onApproval(fitting)

  // A slot's borrowed item wins over what was under it, which is what the
  // player is looking at in the mirror — paying for something must not swap it
  // for the thing it was covering.
  const nextEquipped: EquippedItems = { ...equipped }
  for (const item of bought) {
    nextEquipped[item.slot] = item.id
  }

  // `includes` rather than a Set: the catalogue is twelve items, and a
  // duplicate id in `owned` would show as a duplicate row in the wardrobe.
  const nextOwned = [...owned]
  for (const item of bought) {
    if (!nextOwned.includes(item.id)) nextOwned.push(item.id)
  }

  return {
    owned: nextOwned,
    equipped: nextEquipped,
    total: bought.reduce((sum, item) => sum + item.price, 0),
  }
}
