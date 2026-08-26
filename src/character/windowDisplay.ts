/*
 * What is in The Gilded Hanger's window this season.
 *
 * Lifted out of `ShopFront.tsx`, which is where it started, because the window
 * is now visible from two places: the street, through the glass, and the shop
 * floor, from behind. Three mannequins in a jacket the shop does not stock is
 * the sort of detail that costs nothing to get right and reads as carelessness
 * when it is wrong — and two copies of the list is exactly how it would go
 * wrong, quietly, months later.
 *
 * Pure, like the rest of `src/character/`. `shopLayout.test.ts` asserts these
 * are the three outerwear pieces the shop actually sells.
 */

import { Garment, HairStyle, type Appearance } from './appearance'
import { Slot, type EquippedItems } from './catalog'
import { Silhouette } from './proportions'

export interface DressedForm {
  readonly appearance: Appearance
  readonly equipped: EquippedItems
}

/**
 * The three window forms, in the order they stand: left to right on the street,
 * and left to right along the interior platform.
 */
export const WINDOW_DISPLAY: readonly DressedForm[] = [
  {
    appearance: {
      silhouette: Silhouette.Masculine,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.Suit,
      garmentColor: 'charcoal',
    },
    equipped: { [Slot.Outerwear]: 'sequin-jacket', [Slot.Feet]: 'oxblood-oxfords' },
  },
  {
    appearance: {
      silhouette: Silhouette.Feminine,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.CocktailDress,
      garmentColor: 'crimson',
    },
    equipped: { [Slot.Outerwear]: 'crimson-gown', [Slot.Feet]: 'gold-heels' },
  },
  {
    appearance: {
      silhouette: Silhouette.Androgynous,
      hairStyle: HairStyle.Buzz,
      hairColor: 'jet',
      skinTone: 'honey',
      garment: Garment.Suit,
      garmentColor: 'midnight',
    },
    equipped: { [Slot.Outerwear]: 'ivory-tuxedo', [Slot.Feet]: 'oxblood-oxfords' },
  },
]

/** The outerwear each form is wearing, which is what the window is selling. */
export const WINDOW_OUTERWEAR: readonly string[] = WINDOW_DISPLAY.map(
  (form) => form.equipped[Slot.Outerwear] ?? '',
)
