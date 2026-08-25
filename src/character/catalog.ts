/*
 * What The Gilded Hanger sells.
 *
 * Every item is one of the twelve pieces laid out in
 * `art/refs/wardrobe_sheet.png`, and the colours below were read off it.
 *
 * Items are cosmetic. Nothing here touches odds, payouts or table minimums —
 * the blackjack and craps engines never import this file, and the only money
 * this module knows about is a whole-dollar price.
 */

export enum Slot {
  Head = 'head',
  Eyes = 'eyes',
  Neck = 'neck',
  Outerwear = 'outerwear',
  Wrist = 'wrist',
  Finger = 'finger',
  Feet = 'feet',
  /** Carried in the off hand rather than worn. */
  Held = 'held',
}

/**
 * Which primitive assembly renders an item.
 *
 * Separate from the slot because one slot holds several shapes — a rope chain
 * and a solitaire pendant are both `Neck` but are built differently.
 */
export enum ItemShape {
  Fedora = 'fedora',
  Shades = 'shades',
  Chain = 'chain',
  Pendant = 'pendant',
  Jacket = 'jacket',
  Gown = 'gown',
  Watch = 'watch',
  Ring = 'ring',
  Oxford = 'oxford',
  Heel = 'heel',
  Cane = 'cane',
}

export interface ItemColors {
  readonly primary: string
  /** Band, sole, strap — the darker second material. */
  readonly secondary: string
  /** Stone, buckle or glint. Left equal to `primary` when there is none. */
  readonly accent: string
}

export interface ShopItem {
  /** Stable key written into the save. Never reuse one for a different item. */
  readonly id: string
  readonly name: string
  readonly slot: Slot
  readonly shape: ItemShape
  /** Whole dollars, debited from the same bankroll the tables use. */
  readonly price: number
  readonly colors: ItemColors
  /** One line of shop copy, shown under the name. */
  readonly blurb: string
}

const GOLD = '#e0b64a'
const DEEP_GOLD = '#a8802a'
const DIAMOND = '#dfeaf5'

export const CATALOG: readonly ShopItem[] = [
  {
    id: 'felt-fedora',
    name: 'Felt Fedora',
    slot: Slot.Head,
    shape: ItemShape.Fedora,
    price: 45,
    colors: { primary: '#8a7a68', secondary: '#4b4038', accent: '#8a7a68' },
    blurb: 'Wide brim. Casts a shadow you can hide a tell in.',
  },
  {
    id: 'blackout-shades',
    name: 'Blackout Shades',
    slot: Slot.Eyes,
    shape: ItemShape.Shades,
    price: 60,
    colors: { primary: '#241f22', secondary: GOLD, accent: '#241f22' },
    blurb: 'Nobody reads your eyes through these. Nobody reads the cards either.',
  },
  {
    id: 'oxblood-oxfords',
    name: 'Oxblood Oxfords',
    slot: Slot.Feet,
    shape: ItemShape.Oxford,
    price: 130,
    colors: { primary: '#4a1620', secondary: '#241016', accent: '#6d2130' },
    blurb: 'Patent leather. Holds the neon like a puddle does.',
  },
  {
    id: 'gold-heels',
    name: 'Gold Heels',
    slot: Slot.Feet,
    shape: ItemShape.Heel,
    price: 150,
    colors: { primary: '#d9a94a', secondary: DEEP_GOLD, accent: '#f2d489' },
    blurb: 'Four inches of confidence. Walks the strip anyway.',
  },
  {
    id: 'lacquer-cane',
    name: 'Lacquer Cane',
    slot: Slot.Held,
    shape: ItemShape.Cane,
    price: 95,
    // Lighter than the reference sheet's near-black lacquer on purpose: at
    // #2b1810 the shaft was invisible against a dark room, and `npm run locate`
    // had to be written to prove the cane was being rendered at all.
    colors: { primary: '#5a3420', secondary: '#141014', accent: GOLD },
    blurb: 'Entirely decorative. That is the point.',
  },
  {
    id: 'gold-rope-chain',
    name: 'Gold Rope Chain',
    slot: Slot.Neck,
    shape: ItemShape.Chain,
    price: 180,
    colors: { primary: GOLD, secondary: DEEP_GOLD, accent: '#f5dc9a' },
    blurb: 'Heavy enough to be heard before it is seen.',
  },
  {
    id: 'signet-ring',
    name: 'Signet Ring',
    slot: Slot.Finger,
    shape: ItemShape.Ring,
    price: 220,
    colors: { primary: GOLD, secondary: DEEP_GOLD, accent: DIAMOND },
    blurb: 'A stone the size of a chip. A $100 chip.',
  },
  {
    id: 'ivory-tuxedo',
    name: 'Ivory Tuxedo',
    slot: Slot.Outerwear,
    shape: ItemShape.Jacket,
    price: 400,
    colors: { primary: '#f0ead0', secondary: '#1a1a1e', accent: '#d8d0b4' },
    blurb: 'Dinner jacket, black bow. The house treats you differently.',
  },
  {
    id: 'crimson-gown',
    name: 'Crimson Satin Gown',
    slot: Slot.Outerwear,
    shape: ItemShape.Gown,
    price: 520,
    colors: { primary: '#cc1f4a', secondary: '#8c1030', accent: '#e8386f' },
    blurb: 'Floor length. Moves like the felt does when a dealer sweeps it.',
  },
  {
    id: 'sequin-jacket',
    name: 'Gold Sequin Jacket',
    slot: Slot.Outerwear,
    shape: ItemShape.Jacket,
    price: 650,
    colors: { primary: '#c9a227', secondary: DEEP_GOLD, accent: '#ff6ec7' },
    blurb: 'Ten thousand sequins, each one catching a different sign.',
  },
  {
    id: 'bracelet-watch',
    name: 'Gold Bracelet Watch',
    slot: Slot.Wrist,
    shape: ItemShape.Watch,
    price: 750,
    colors: { primary: GOLD, secondary: DEEP_GOLD, accent: '#f7f2e4' },
    blurb: 'Tells the time. On the strip that is close to a superpower.',
  },
  {
    id: 'solitaire-pendant',
    name: 'Solitaire Pendant',
    slot: Slot.Neck,
    shape: ItemShape.Pendant,
    price: 900,
    colors: { primary: GOLD, secondary: DEEP_GOLD, accent: DIAMOND },
    blurb: 'The most expensive thing in the window, and it knows it.',
  },
]

/** Items in the order the shop lists them, cheapest first within each slot. */
export const SLOT_ORDER: readonly Slot[] = [
  Slot.Outerwear,
  Slot.Head,
  Slot.Eyes,
  Slot.Neck,
  Slot.Wrist,
  Slot.Finger,
  Slot.Feet,
  Slot.Held,
]

export const SLOT_LABELS: Record<Slot, string> = {
  [Slot.Outerwear]: 'Outerwear',
  [Slot.Head]: 'Hats',
  [Slot.Eyes]: 'Eyewear',
  [Slot.Neck]: 'Necklaces',
  [Slot.Wrist]: 'Watches',
  [Slot.Finger]: 'Rings',
  [Slot.Feet]: 'Shoes',
  [Slot.Held]: 'Accessories',
}

/** What the player is wearing, as one item id per slot. */
export type EquippedItems = Partial<Record<Slot, string>>

const BY_ID: ReadonlyMap<string, ShopItem> = new Map(CATALOG.map((item) => [item.id, item]))

/** Looks an item up by id, or `null` if the id is unknown to this build. */
export function findItem(id: string | undefined): ShopItem | null {
  return (id === undefined ? undefined : BY_ID.get(id)) ?? null
}

export function itemsInSlot(slot: Slot): readonly ShopItem[] {
  return CATALOG.filter((item) => item.slot === slot).sort((a, b) => a.price - b.price)
}

/** The equipped items, resolved and with anything unknown dropped. */
export function equippedItems(equipped: EquippedItems): readonly ShopItem[] {
  return SLOT_ORDER.map((slot) => findItem(equipped[slot])).filter(
    (item): item is ShopItem => item !== null,
  )
}

/**
 * Drops ids the current build no longer knows about.
 *
 * Runs on rehydrate for the same reason `sanitizeAppearance` does: a save
 * naming a since-removed item must not leave the character with an invisible
 * hat that still counts as occupying the slot.
 */
export function sanitizeEquipped(raw: unknown, owned: readonly string[]): EquippedItems {
  if (typeof raw !== 'object' || raw === null) return {}

  const candidate = raw as Record<string, unknown>
  const clean: EquippedItems = {}

  for (const slot of SLOT_ORDER) {
    const id = candidate[slot]
    if (typeof id !== 'string') continue

    const item = findItem(id)
    // Equipped but not owned means a tampered or half-written save; the owned
    // list is the record of what was actually paid for, so it wins.
    if (item?.slot === slot && owned.includes(id)) {
      clean[slot] = id
    }
  }

  return clean
}

export function sanitizeOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && BY_ID.has(id)))]
}
