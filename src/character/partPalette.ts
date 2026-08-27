/*
 * Turning a role into a colour.
 *
 * A part list says `Primary`, never `#c9a227`, because the same list is painted
 * differently depending on what is wearing it: the gown's parts take the item's
 * own colours on a shop fixture and the same colours on a player, while the
 * torso's take whatever garment colour the designer last set. Keeping the two
 * apart is what lets one `Accessory` draw a chain on a neck and in a glass case.
 *
 * Pure, like the rest of `src/character/`.
 */

import { lipFor } from './palette'
import type { ShopItem } from './catalog'
import type { ResolvedAppearance } from './appearance'

/** Every colour a part list can ask for, resolved to hex. */
export interface PartPalette {
  readonly primary: string
  readonly secondary: string
  readonly accent: string
  readonly trim: string
  readonly shirt: string
  readonly shoes: string
  readonly skin: string
  readonly hair: string
  readonly sclera: string
  readonly pupil: string
  readonly lip: string
}

/**
 * Moulded ivory, as the dummies in `art/refs/shop_exterior_wide.png` are.
 *
 * Deliberately duller than a shop dummy really is: at a brighter cream the
 * forms were the lightest thing in the shop once each fixture got its own
 * downlight — three white heads pulling the eye off the clothes they exist to
 * show. Still reads as cream through the window from the street.
 */
export const MANNEQUIN_FORM = '#c6b9a6'

/*
 * Warm and slightly off-white, not paper.
 *
 * At `#f4f2ee` the two eyes were the brightest thing on the whole figure —
 * brighter than any skin in the palette and brighter than most garments — so
 * they pulled the eye before the face did and read as googly. An eye white is
 * in shadow under a brow; this is what that looks like.
 */
const SCLERA = '#ded6cd'
const PUPIL = '#20161a'

/** What an item's or a hairpiece's mouth would be, if either had one. */
const LIP = '#5c2f2c'

/**
 * The palette for a figure: its garment, its skin and its hair.
 *
 * @param appearance The resolved appearance, swatch ids already hex.
 * @param mannequin True for a shop dummy, which is one moulded colour
 *   throughout — hands and head included.
 */
export function figurePalette(
  appearance: ResolvedAppearance,
  mannequin = false,
): PartPalette {
  const { colors } = appearance
  const skin = mannequin ? MANNEQUIN_FORM : appearance.skin

  return {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    trim: colors.primaryTrim,
    shirt: colors.shirt,
    shoes: colors.shoes,
    skin,
    hair: mannequin ? MANNEQUIN_FORM : appearance.hair,
    sclera: SCLERA,
    pupil: PUPIL,
    // Derived from the skin, so the mouth reads on all six — see `lipFor`.
    lip: lipFor(skin),
  }
}

/**
 * The palette for one catalogue item.
 *
 * An item carries three colours, so the roles a body uses — skin, shirt, hair —
 * fall back to its primary rather than to anything of the wearer's. An item
 * that borrowed the wearer's skin tone for a strap would change colour with
 * whoever put it on.
 */
export function itemPalette(item: ShopItem): PartPalette {
  const { primary, secondary, accent } = item.colors

  return {
    primary,
    secondary,
    accent,
    trim: secondary,
    shirt: primary,
    shoes: primary,
    skin: primary,
    hair: primary,
    sclera: SCLERA,
    pupil: PUPIL,
    lip: LIP,
  }
}

/** The palette for hair, which is one colour and needs no more. */
export function hairPalette(hair: string): PartPalette {
  return {
    primary: hair,
    secondary: hair,
    accent: hair,
    trim: hair,
    shirt: hair,
    shoes: hair,
    skin: hair,
    hair,
    sclera: SCLERA,
    pupil: PUPIL,
    lip: LIP,
  }
}
