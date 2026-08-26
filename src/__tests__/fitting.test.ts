import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeEquipped, Slot } from '../character/catalog'
import {
  approvalTotal,
  fitted,
  isFitting,
  NO_FITTING,
  onApproval,
  payFor,
  withoutSlot,
} from '../character/fitting'
import { DESK_STAND } from '../scenes/shopLayout'
import { CheckoutResult, useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'
import { VenueId } from '../world/venues'

/*
 * Trying anything on for free, buying only what you can afford.
 *
 * None of this is visible in a screenshot: a borrowed gown and a bought gown
 * render identically, and the difference only shows up on the next page load or
 * out on the street. So it is all asserted here.
 */

const TUXEDO = 'ivory-tuxedo'
const GOWN = 'crimson-gown'
const PENDANT = 'solitaire-pendant'
const FEDORA = 'felt-fedora'

describe('fitted', () => {
  // The whole point of the layer: what you see on the body is what you own,
  // plus what you are trying on, with the borrowed item on top.
  it('lays the fitting over what is owned, slot by slot', () => {
    const equipped = { [Slot.Outerwear]: TUXEDO, [Slot.Head]: FEDORA }
    const on = fitted(equipped, { [Slot.Outerwear]: GOWN, [Slot.Neck]: PENDANT })

    expect(on[Slot.Outerwear]).toBe(GOWN)
    expect(on[Slot.Head]).toBe(FEDORA)
    expect(on[Slot.Neck]).toBe(PENDANT)
  })

  // Outside the shop the fitting is empty, and the walking rig reads this for
  // every scene in the game. Anything other than a pass-through would change
  // what the player looks like on the strip.
  it('is what is equipped when nothing is on approval', () => {
    const equipped = { [Slot.Feet]: 'gold-heels' }
    expect(fitted(equipped, NO_FITTING)).toEqual(equipped)
    expect(isFitting(NO_FITTING)).toBe(false)
  })
})

describe('onApproval', () => {
  // The mirror panel is built from this. A price that is not a whole dollar, or
  // an item counted twice, is a bill the player cannot check.
  it('totals the unpaid items in whole dollars', () => {
    const fitting = { [Slot.Outerwear]: GOWN, [Slot.Neck]: PENDANT }

    expect(onApproval(fitting).map((item) => item.id)).toEqual([GOWN, PENDANT])
    expect(approvalTotal(fitting)).toBe(520 + 900)
    expect(Number.isInteger(approvalTotal(fitting))).toBe(true)
  })

  it('drops ids this build does not know', () => {
    expect(onApproval({ [Slot.Head]: 'gold-monocle' })).toHaveLength(0)
    expect(approvalTotal(NO_FITTING)).toBe(0)
  })
})

describe('payFor', () => {
  /*
   * The bill, over every basket the shop can produce.
   *
   * Money on this project is whole dollars all the way through, and every time
   * that has broken it was a single value nobody thought to check — a 6:5 payout
   * held as 1.2 returning $22.000000000000004. A bill is a sum of catalogue
   * prices, so the arithmetic is safe by construction; what this asserts is that
   * it stays a sum, and that nothing is charged for twice.
   */
  it('charges the sum of what is on approval, in whole dollars', () => {
    const baskets = [
      { [Slot.Outerwear]: GOWN },
      { [Slot.Outerwear]: GOWN, [Slot.Neck]: PENDANT },
      { [Slot.Outerwear]: TUXEDO, [Slot.Neck]: PENDANT, [Slot.Head]: FEDORA },
      NO_FITTING,
    ]

    for (const basket of baskets) {
      const settled = payFor({}, [], basket)
      const items = onApproval(basket)

      expect(Number.isInteger(settled.total)).toBe(true)
      expect(settled.total).toBe(items.reduce((sum, item) => sum + item.price, 0))
      expect(settled.owned).toHaveLength(items.length)
      expect(new Set(settled.owned).size).toBe(settled.owned.length)
    }
  })

  // Paying for a jacket over a jacket you own leaves you in the one you just
  // paid for. The other order charges for the new one and shows the old one.
  it('keeps the item that was on top on top', () => {
    const settled = payFor({ [Slot.Outerwear]: TUXEDO }, [TUXEDO], { [Slot.Outerwear]: GOWN })

    expect(settled.equipped[Slot.Outerwear]).toBe(GOWN)
    expect(settled.owned).toEqual([TUXEDO, GOWN])
    expect(settled.total).toBe(520)
  })
})

describe('the shop floor', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
    useGameStore.getState().resetBankroll()
  })

  // The feature, in one line: everything in the shop goes on the body without
  // being paid for. Before this, five of the twelve items could not be seen on
  // the character at all until they had been bought.
  it('lets anything be tried on without spending a penny', () => {
    const store = useAppearanceStore.getState()
    const before = useGameStore.getState().bankroll

    store.tryOn(PENDANT)

    expect(useAppearanceStore.getState().fitting[Slot.Neck]).toBe(PENDANT)
    expect(useGameStore.getState().bankroll).toBe(before)
    expect(useAppearanceStore.getState().owned).not.toContain(PENDANT)
  })

  /*
   * The guard the whole layer exists to protect.
   *
   * `equipped` is persisted and means "paid for". A borrowed item that leaked
   * into it would survive a reload, and `sanitizeEquipped` would then be the
   * only thing standing between the player and a free $900 pendant.
   */
  it('never lets an unpaid item into what is equipped', () => {
    useAppearanceStore.getState().tryOn(PENDANT)

    const { equipped, owned } = useAppearanceStore.getState()
    expect(equipped[Slot.Neck]).toBeUndefined()
    expect(sanitizeEquipped({ [Slot.Neck]: PENDANT }, owned)[Slot.Neck]).toBeUndefined()
  })

  // Taking off a borrowed jacket over one you own should leave you in your own
  // jacket, not bare-chested. The alternative loses a purchase to a keypress.
  it('takes the borrowed layer off first', () => {
    const store = useAppearanceStore.getState()
    useGameStore.getState().adjustBankroll(1000)

    store.tryOn(TUXEDO)
    store.checkout()
    store.tryOn(GOWN)
    expect(useAppearanceStore.getState().fitting[Slot.Outerwear]).toBe(GOWN)

    store.takeOff(Slot.Outerwear)
    const after = useAppearanceStore.getState()
    expect(after.fitting[Slot.Outerwear]).toBeUndefined()
    expect(after.equipped[Slot.Outerwear]).toBe(TUXEDO)

    // ...and only then does the owned one come off.
    store.takeOff(Slot.Outerwear)
    expect(useAppearanceStore.getState().equipped[Slot.Outerwear]).toBeUndefined()
  })

  // Paying for what you have on must not move it. A purchase that took the
  // jacket back off would read as the transaction having failed.
  it('leaves a bought item on the body and off the bill', () => {
    const store = useAppearanceStore.getState()
    useGameStore.getState().adjustBankroll(1000)
    const before = useGameStore.getState().bankroll

    store.tryOn(GOWN)
    expect(store.checkout()).toBe(CheckoutResult.Paid)

    const after = useAppearanceStore.getState()
    expect(after.owned).toContain(GOWN)
    expect(after.equipped[Slot.Outerwear]).toBe(GOWN)
    expect(after.fitting[Slot.Outerwear]).toBeUndefined()
    expect(approvalTotal(after.fitting)).toBe(0)
    expect(useGameStore.getState().bankroll).toBe(before - 520)
  })

  /*
   * The counter takes the bill or it takes nothing.
   *
   * This is what moving the till out of the mirror changed. The old per-item
   * Buy let a player with $600 walk out owning the gown and still wearing an
   * unpaid pendant; a bill is one number, and a bankroll that will not cover it
   * buys none of it. Without this, "Pay" would part-succeed and the player
   * would be charged for a purchase they did not agree to.
   */
  it('refuses the whole bill when the bankroll will not cover it', () => {
    const store = useAppearanceStore.getState()
    // $500 to start. The gown is $520 and the pendant $900 — $1,420 in all, and
    // the gown alone would have gone through under the old per-item rule.
    useGameStore.getState().adjustBankroll(400)
    store.tryOn(GOWN)
    store.tryOn(PENDANT)
    const before = useGameStore.getState().bankroll

    expect(store.checkout()).toBe(CheckoutResult.TooExpensive)
    expect(useGameStore.getState().bankroll).toBe(before)
    expect(useAppearanceStore.getState().owned).toHaveLength(0)
    // Still on the body, which is the whole point of a fitting room.
    expect(useAppearanceStore.getState().fitting[Slot.Neck]).toBe(PENDANT)
    expect(useAppearanceStore.getState().fitting[Slot.Outerwear]).toBe(GOWN)

    // ...and putting the dear one back makes the rest affordable.
    store.takeOff(Slot.Neck)
    expect(store.checkout()).toBe(CheckoutResult.Paid)
    expect(useGameStore.getState().bankroll).toBe(before - 520)
    expect(useAppearanceStore.getState().owned).toEqual([GOWN])
  })

  // Pressing Pay with an empty bill must not debit a penny. The panel hides the
  // button, but the player can also reach the counter with nothing on approval.
  it('charges nothing when there is no bill', () => {
    const store = useAppearanceStore.getState()
    const before = useGameStore.getState().bankroll

    expect(store.checkout()).toBe(CheckoutResult.NothingOwing)
    expect(useGameStore.getState().bankroll).toBe(before)
  })

  /*
   * Four things at once, which is what a counter is for and what the per-item
   * Buy button never had to handle.
   *
   * The failure this catches is a slot collision: two of these cover slots the
   * player already owns something in, and an ordering bug would leave the old
   * item equipped while the new one was charged for.
   */
  it('settles a whole basket in one charge', () => {
    const store = useAppearanceStore.getState()
    useGameStore.getState().adjustBankroll(3000)
    const before = useGameStore.getState().bankroll

    store.tryOn(GOWN)
    store.tryOn(PENDANT)
    store.tryOn(FEDORA)
    const owing = approvalTotal(useAppearanceStore.getState().fitting)

    expect(store.checkout()).toBe(CheckoutResult.Paid)

    const after = useAppearanceStore.getState()
    expect(useGameStore.getState().bankroll).toBe(before - owing)
    expect(after.owned).toEqual(expect.arrayContaining([GOWN, PENDANT, FEDORA]))
    expect(after.equipped[Slot.Outerwear]).toBe(GOWN)
    expect(after.equipped[Slot.Neck]).toBe(PENDANT)
    expect(after.equipped[Slot.Head]).toBe(FEDORA)
    expect(isFitting(after.fitting)).toBe(false)
  })

  /*
   * Walking out has to hand everything back.
   *
   * The scene clears the fitting on unmount. Without it an unpaid $900 pendant
   * walks onto the strip and into the casino, because the walking rig draws the
   * fitting the same way the mirror does.
   */
  it('leaves nothing unpaid on the body when the fitting is cleared', () => {
    const store = useAppearanceStore.getState()
    store.tryOn(PENDANT)
    store.tryOn(GOWN)

    store.clearFitting()

    const after = useAppearanceStore.getState()
    expect(isFitting(after.fitting)).toBe(false)

    for (const id of Object.values(fitted(after.equipped, after.fitting))) {
      expect(after.owned, `${id} is on the body without being owned`).toContain(id)
    }
  })

  // Wearing something you own has to clear whatever was borrowed over it, or
  // the borrowed item goes on covering the one that was just put on.
  it('clears the borrowed layer when an owned item is worn', () => {
    const store = useAppearanceStore.getState()
    useGameStore.getState().adjustBankroll(1000)

    store.tryOn(TUXEDO)
    store.checkout()
    store.tryOn(GOWN)
    store.equip(TUXEDO)

    const after = useAppearanceStore.getState()
    expect(after.fitting[Slot.Outerwear]).toBeUndefined()
    expect(fitted(after.equipped, after.fitting)[Slot.Outerwear]).toBe(TUXEDO)
  })

  /*
   * The counter's state is a place you stand, and only one place at a time.
   *
   * Both the mirror and the counter unmount the walking player and take the
   * camera, so a state that was somehow both would mount two cameras and leave
   * `makeDefault` to pick. Entering the shop from anywhere has to land on
   * neither, which is what these two actions and the venue reset guarantee.
   */
  it('stands the player at one till at a time, and at neither on arrival', () => {
    const store = useGameStore.getState()

    store.enterVenue(VenueId.GildedHanger)
    expect(useGameStore.getState().atCheckout).toBe(false)
    expect(useGameStore.getState().atMirror).toBe(false)

    store.standAtCheckout()
    expect(useGameStore.getState().atCheckout).toBe(true)
    expect(useGameStore.getState().atMirror).toBe(false)
    // ...and it takes the prompts down with it, or F at the counter would find
    // a stale display still in range.
    expect(useGameStore.getState().nearbyDesk).toBe(false)
    expect(useGameStore.getState().nearbyDisplay).toBeNull()

    useGameStore.getState().leaveCheckout()
    expect(useGameStore.getState().atCheckout).toBe(false)
    // Stepped back onto the customer's side of the counter rather than the door.
    expect(useGameStore.getState().shopPosition).toEqual(DESK_STAND)

    useGameStore.getState().leaveVenue()
    expect(useGameStore.getState().atCheckout).toBe(false)
    expect(useGameStore.getState().heldAtDoor).toBe(false)
  })

  /*
   * Walking out in unpaid goods costs nothing and never traps anybody.
   *
   * Two invariants in one, and both are invisible: the clerk's refusal must not
   * charge the player, and it must not be a state they cannot leave. The second
   * is the one that would ship — a broke player wearing a $900 pendant would be
   * held at the door by a check they have no way to satisfy.
   */
  it('hands unpaid goods back at the door without charging for them', () => {
    const store = useAppearanceStore.getState()
    // Through the door rather than by setting state: `leaveVenue` short-circuits
    // when there is no venue to leave, and the reset being asserted here is on
    // the other branch.
    useGameStore.getState().enterVenue(VenueId.GildedHanger)
    store.tryOn(PENDANT)
    const before = useGameStore.getState().bankroll

    // The scene's handler holds on the first press and leaves on the second;
    // what the store has to guarantee is that leaving is always available and
    // always free.
    useGameStore.getState().setHeldAtDoor(true)
    expect(useGameStore.getState().heldAtDoor).toBe(true)

    useGameStore.getState().leaveVenue()
    store.clearFitting()

    expect(useGameStore.getState().bankroll).toBe(before)
    expect(useGameStore.getState().heldAtDoor).toBe(false)
    expect(isFitting(useAppearanceStore.getState().fitting)).toBe(false)
    expect(useAppearanceStore.getState().owned).not.toContain(PENDANT)
  })

  // withoutSlot is the pure half of takeOff, and returning the same object for
  // a slot that was already empty is what stops a no-op press re-rendering.
  it('leaves the fitting alone when a slot was already bare', () => {
    const fitting = { [Slot.Neck]: PENDANT }
    expect(withoutSlot(fitting, Slot.Head)).toBe(fitting)
    expect(withoutSlot(fitting, Slot.Neck)[Slot.Neck]).toBeUndefined()
  })
})
