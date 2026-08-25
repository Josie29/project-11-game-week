import { describe, expect, it } from 'vitest'
import {
  CATALOG,
  equippedItems,
  findItem,
  itemsInSlot,
  sanitizeEquipped,
  sanitizeOwned,
  Slot,
  SLOT_LABELS,
  SLOT_ORDER,
} from '../character/catalog'
import { STARTING_BANKROLL } from '../store/useGameStore'

const HEX = /^#[0-9a-f]{6}$/

describe('CATALOG', () => {
  // Item ids are written into the save. A duplicate makes the lookup return
  // whichever came first, so a player who bought one item ends up wearing
  // another — and the one they paid for can never be equipped.
  it('has unique ids', () => {
    const ids = CATALOG.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Money on this project is whole dollars everywhere. A fractional price would
  // debit a fractional bankroll and then render as "$449.99999999999994" in the
  // HUD, which is the exact class of bug the 6:5 payout test was written for.
  it('prices everything in whole positive dollars', () => {
    for (const item of CATALOG) {
      expect(Number.isInteger(item.price), `${item.id} costs ${item.price}`).toBe(true)
      expect(item.price).toBeGreaterThan(0)
    }
  })

  // A shop whose cheapest item costs more than the player has ever had is dead
  // content: they walk in, read the prices and walk out, and the whole building
  // was wasted. The cheapest item has to be reachable from the starting purse.
  it('sells something affordable on the starting bankroll', () => {
    const cheapest = Math.min(...CATALOG.map((item) => item.price))
    expect(cheapest).toBeLessThan(STARTING_BANKROLL / 2)
  })

  // ...and equally, something to actually play toward. If every item were
  // pocket change the shop would be finished in one visit.
  it('sells something that takes a winning session to reach', () => {
    const dearest = Math.max(...CATALOG.map((item) => item.price))
    expect(dearest).toBeGreaterThan(STARTING_BANKROLL)
  })

  // Colours feed straight into meshStandardMaterial. An unparseable value there
  // renders as white, which on a night strip is a glowing hole.
  it('gives every item three valid hex colours', () => {
    for (const item of CATALOG) {
      expect(item.colors.primary).toMatch(HEX)
      expect(item.colors.secondary).toMatch(HEX)
      expect(item.colors.accent).toMatch(HEX)
    }
  })

  // The shop lists items by slot. An item in a slot the list does not cover
  // would be bought-able only through a save edit, and invisible in the UI.
  it('places every item in a listed, labelled slot', () => {
    for (const item of CATALOG) {
      expect(SLOT_ORDER).toContain(item.slot)
    }
    for (const slot of Object.values(Slot)) {
      expect(SLOT_ORDER).toContain(slot)
      expect(SLOT_LABELS[slot]).toBeTruthy()
      // An empty rack in the shop reads as a bug rather than as a category.
      expect(itemsInSlot(slot).length).toBeGreaterThan(0)
    }
  })
})

describe('sanitizeOwned', () => {
  // The wardrobe save is user-writable localStorage. Ids from an older build
  // must be dropped rather than kept and then failing to resolve at render.
  it('drops unknown ids, duplicates and non-strings', () => {
    const owned = sanitizeOwned(['felt-fedora', 'felt-fedora', 'gold-monocle', 42, null])

    expect(owned).toEqual(['felt-fedora'])
    expect(sanitizeOwned('not-an-array')).toEqual([])
    expect(sanitizeOwned(undefined)).toEqual([])
  })
})

describe('sanitizeEquipped', () => {
  // The owned list is the record of what was actually paid for. A save that
  // equips something unpurchased — hand-edited, or written by a half-finished
  // transaction — must not hand the player a $900 pendant for free.
  it('refuses to equip anything the player does not own', () => {
    const equipped = sanitizeEquipped(
      { [Slot.Neck]: 'solitaire-pendant', [Slot.Head]: 'felt-fedora' },
      ['felt-fedora'],
    )

    expect(equipped[Slot.Neck]).toBeUndefined()
    expect(equipped[Slot.Head]).toBe('felt-fedora')
  })

  // Slot and item have to agree, or an item renders at another slot's anchor —
  // a hat attached at the foot anchor, which is precisely the failure the
  // anchor tests cannot see because the anchor itself is fine.
  it('drops an item filed under the wrong slot', () => {
    const equipped = sanitizeEquipped({ [Slot.Head]: 'gold-heels' }, ['gold-heels'])
    expect(equipped[Slot.Head]).toBeUndefined()
  })

  it('never throws on malformed input', () => {
    for (const junk of [null, undefined, 7, 'hat', []]) {
      expect(() => sanitizeEquipped(junk, [])).not.toThrow()
      expect(sanitizeEquipped(junk, [])).toEqual({})
    }
  })
})

describe('equippedItems', () => {
  // Two items in one slot would render on top of each other. The equipped map
  // is keyed by slot precisely so that cannot happen, and this is what proves
  // the resolver preserves that.
  it('resolves at most one item per slot', () => {
    const items = equippedItems({
      [Slot.Head]: 'felt-fedora',
      [Slot.Feet]: 'gold-heels',
      [Slot.Outerwear]: 'sequin-jacket',
    })

    expect(items).toHaveLength(3)
    expect(new Set(items.map((item) => item.slot)).size).toBe(items.length)
  })

  it('skips ids this build no longer knows', () => {
    expect(equippedItems({ [Slot.Head]: 'gold-monocle' })).toHaveLength(0)
    expect(findItem('gold-monocle')).toBeNull()
    expect(findItem(undefined)).toBeNull()
  })
})
