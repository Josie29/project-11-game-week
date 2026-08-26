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
