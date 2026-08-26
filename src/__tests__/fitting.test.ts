import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeEquipped, Slot } from '../character/catalog'
import {
  approvalTotal,
  fitted,
  isFitting,
  NO_FITTING,
  onApproval,
  withoutSlot,
} from '../character/fitting'
import { useAppearanceStore } from '../store/useAppearanceStore'
import { useGameStore } from '../store/useGameStore'

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

    store.buy(TUXEDO)
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
    store.buy(GOWN)

    const after = useAppearanceStore.getState()
    expect(after.owned).toContain(GOWN)
    expect(after.equipped[Slot.Outerwear]).toBe(GOWN)
    expect(after.fitting[Slot.Outerwear]).toBeUndefined()
    expect(approvalTotal(after.fitting)).toBe(0)
    expect(useGameStore.getState().bankroll).toBe(before - 520)
  })

  // The other half of the ask: try anything, buy only what you can afford. The
  // shop's Buy button is disabled on the same comparison, but the store is what
  // has to hold if it ever is not.
  it('refuses a purchase the bankroll will not cover, and still shows it on', () => {
    const store = useAppearanceStore.getState()
    // Starting bankroll is $500; the pendant is $900.
    store.tryOn(PENDANT)
    const before = useGameStore.getState().bankroll

    expect(store.buy(PENDANT)).toBe('too-expensive')
    expect(useGameStore.getState().bankroll).toBe(before)
    expect(useAppearanceStore.getState().owned).not.toContain(PENDANT)
    // Still on the body, which is the whole point of a fitting room.
    expect(useAppearanceStore.getState().fitting[Slot.Neck]).toBe(PENDANT)
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

    store.buy(TUXEDO)
    store.tryOn(GOWN)
    store.equip(TUXEDO)

    const after = useAppearanceStore.getState()
    expect(after.fitting[Slot.Outerwear]).toBeUndefined()
    expect(fitted(after.equipped, after.fitting)[Slot.Outerwear]).toBe(TUXEDO)
  })

  // withoutSlot is the pure half of takeOff, and returning the same object for
  // a slot that was already empty is what stops a no-op press re-rendering.
  it('leaves the fitting alone when a slot was already bare', () => {
    const fitting = { [Slot.Neck]: PENDANT }
    expect(withoutSlot(fitting, Slot.Head)).toBe(fitting)
    expect(withoutSlot(fitting, Slot.Neck)[Slot.Neck]).toBeUndefined()
  })
})
