import {
  GARMENT_COLORS,
  HAIR_COLORS,
  shadeHex,
  SKIN_TONES,
  swatchOr,
  type Swatch,
} from './palette'
import { Silhouette } from './proportions'

/** The eight styles on `art/refs/hair_sheet.png`, in grid order. */
export enum HairStyle {
  Buzz = 'buzz',
  Crop = 'crop',
  Pompadour = 'pompadour',
  Bob = 'bob',
  Long = 'long',
  Ponytail = 'ponytail',
  Updo = 'updo',
  Coils = 'coils',
}

/** The four starter outfits on `art/refs/character_sheet.png`, plus a uniform. */
export enum Garment {
  Suit = 'suit',
  CocktailDress = 'cocktail-dress',
  ShirtAndSkirt = 'shirt-and-skirt',
  TeeAndJeans = 'tee-and-jeans',
  /** Clinic uniform. Staff only — see `PLAYER_GARMENTS`. */
  Scrubs = 'scrubs',
}

/**
 * What the designer offers.
 *
 * Explicit rather than `Object.values(Garment)`, because scrubs are a uniform.
 * A player in scrubs is indistinguishable from the nurse, and the designer
 * would have picked the new member up silently the moment it was added.
 */
export const PLAYER_GARMENTS: readonly Garment[] = [
  Garment.Suit,
  Garment.CocktailDress,
  Garment.ShirtAndSkirt,
  Garment.TeeAndJeans,
]

export interface Appearance {
  readonly silhouette: Silhouette
  readonly hairStyle: HairStyle
  /** Swatch id into `HAIR_COLORS`, not a hex value. */
  readonly hairColor: string
  /** Swatch id into `SKIN_TONES`. */
  readonly skinTone: string
  readonly garment: Garment
  /** Swatch id into `GARMENT_COLORS`. */
  readonly garmentColor: string
}

export const DEFAULT_APPEARANCE: Appearance = {
  silhouette: Silhouette.Androgynous,
  hairStyle: HairStyle.Crop,
  hairColor: 'jet',
  skinTone: 'honey',
  garment: Garment.TeeAndJeans,
  garmentColor: 'midnight',
}

/** Red River Plasma's receptionist, working the terminal behind the desk. */
export const RECEPTIONIST_APPEARANCE: Appearance = {
  silhouette: Silhouette.Feminine,
  hairStyle: HairStyle.Updo,
  hairColor: 'coffee',
  skinTone: 'umber',
  garment: Garment.Scrubs,
  garmentColor: 'surgical',
}

/**
 * The nurse who walks the room and does the draw.
 *
 * Deliberately unlike the receptionist in build, hair and skin. Two staff in
 * the same uniform read as one person duplicated unless everything else differs.
 */
export const NURSE_APPEARANCE: Appearance = {
  silhouette: Silhouette.Androgynous,
  // A ponytail rather than a bob: she is seen from behind for most of the
  // procedure, and a bob in a pale colour reads as a slab from back there.
  hairStyle: HairStyle.Ponytail,
  hairColor: 'silver',
  skinTone: 'sand',
  garment: Garment.Scrubs,
  garmentColor: 'teal',
}

/**
 * The Gilded Hanger's clerk, behind the counter.
 *
 * Not in a uniform, because the shop does not have one — she is dressed out of
 * her own stock, in the plum the room is painted. That is also what keeps her
 * apart from the other three: the two clinic staff are the only figures in
 * scrubs, the dealer is the only one in charcoal, and nothing else in the game
 * wears a bob.
 */
export const CLERK_APPEARANCE: Appearance = {
  silhouette: Silhouette.Feminine,
  hairStyle: HairStyle.Bob,
  hairColor: 'auburn',
  skinTone: 'porcelain',
  garment: Garment.Suit,
  garmentColor: 'plum',
}

/**
 * The dealer and the pit staff.
 *
 * Frozen as a preset rather than exposed in the designer: they are house
 * employees in uniform, and letting the player restyle them would make the
 * blackjack table stop reading as a casino.
 */
export const DEALER_APPEARANCE: Appearance = {
  silhouette: Silhouette.Masculine,
  hairStyle: HairStyle.Crop,
  hairColor: 'coffee',
  skinTone: 'honey',
  garment: Garment.Suit,
  garmentColor: 'charcoal',
}

/** Denim is a fixed colour; picking "olive jeans" is not a look anyone wants. */
const DENIM = '#2f3a52'
const SHIRT_WHITE = '#eef1f8'
const TIE_RED = '#c0392b'
const SHOE_BLACK = '#14161c'

/** Every colour role a garment paints, resolved from one chosen primary. */
export interface GarmentPalette {
  /** Jacket, dress bodice, or tee. */
  readonly primary: string
  /** Lapels, seams and collar band — a step lighter so edges catch the neon. */
  readonly primaryTrim: string
  /** Trousers, skirt or jeans. */
  readonly secondary: string
  readonly shirt: string
  readonly accent: string
  readonly shoes: string
  /** True when the lower body is a skirt or dress rather than two legs. */
  readonly hasSkirt: boolean
}

/**
 * Resolves a garment's full colour set from its primary.
 *
 * @param garment Which starter outfit is worn.
 * @param primary Six-digit hex colour chosen by the player.
 * @returns Every colour the rig needs to paint that garment.
 * @throws {TypeError} If `primary` is not a six-digit hex colour.
 */
export function garmentPalette(garment: Garment, primary: string): GarmentPalette {
  const trim = shadeHex(primary, 0.14)

  switch (garment) {
    case Garment.Suit:
      return {
        primary,
        primaryTrim: trim,
        secondary: shadeHex(primary, -0.22),
        shirt: SHIRT_WHITE,
        accent: TIE_RED,
        shoes: SHOE_BLACK,
        hasSkirt: false,
      }
    case Garment.CocktailDress:
      return {
        primary,
        primaryTrim: trim,
        // A dress is one piece; the skirt is the bodice colour continued down.
        secondary: primary,
        shirt: primary,
        accent: shadeHex(primary, 0.3),
        shoes: SHOE_BLACK,
        hasSkirt: true,
      }
    case Garment.ShirtAndSkirt:
      return {
        primary: SHIRT_WHITE,
        primaryTrim: shadeHex(SHIRT_WHITE, -0.12),
        secondary: primary,
        shirt: SHIRT_WHITE,
        accent: trim,
        shoes: SHOE_BLACK,
        hasSkirt: true,
      }
    case Garment.Scrubs:
      return {
        // Tunic and trousers the same colour, as a uniform is. No lapels, no
        // tie, no contrast panel — the whole point is that it is not an outfit.
        primary,
        primaryTrim: shadeHex(primary, -0.1),
        secondary: shadeHex(primary, -0.06),
        // The V-neck, a shade lighter so the neckline reads at all.
        shirt: shadeHex(primary, 0.18),
        accent: shadeHex(primary, -0.18),
        shoes: '#e8e6e0',
        hasSkirt: false,
      }

    case Garment.TeeAndJeans:
      return {
        primary,
        primaryTrim: trim,
        secondary: DENIM,
        // A tee has no shirt under it, so the "shirt" roles — crew neck, cuffs,
        // back collar — are the tee itself, lifted just enough to read as edges.
        // Left equal to the primary they vanish and the torso is a flat slab.
        shirt: trim,
        accent: trim,
        shoes: '#d8d3c6',
        hasSkirt: false,
      }
  }
}

/** Every colour the rig needs, with swatch ids already resolved to hex. */
export interface ResolvedAppearance {
  readonly silhouette: Silhouette
  readonly hairStyle: HairStyle
  readonly hair: string
  readonly skin: string
  readonly garment: Garment
  readonly colors: GarmentPalette
}

export function resolveAppearance(appearance: Appearance): ResolvedAppearance {
  const garmentSwatch = swatchOr(GARMENT_COLORS, appearance.garmentColor)

  return {
    silhouette: appearance.silhouette,
    hairStyle: appearance.hairStyle,
    hair: swatchOr(HAIR_COLORS, appearance.hairColor).hex,
    skin: swatchOr(SKIN_TONES, appearance.skinTone).hex,
    garment: appearance.garment,
    colors: garmentPalette(appearance.garment, garmentSwatch.hex),
  }
}

function memberOr<T extends string>(values: readonly T[], candidate: unknown, fallback: T): T {
  return values.includes(candidate as T) ? (candidate as T) : fallback
}

function swatchIdOr(palette: readonly Swatch[], candidate: unknown, fallback: string): string {
  return typeof candidate === 'string' && palette.some((swatch) => swatch.id === candidate)
    ? candidate
    : fallback
}

/**
 * Coerces anything read out of persisted storage into a renderable appearance.
 *
 * Deliberately total: it never throws and never returns a partial object. A
 * save written by an older build — an enum member since renamed, a swatch since
 * removed, or a hand-edited localStorage entry — must still produce a character
 * with hair, skin and clothes on.
 *
 * @param raw Whatever came back out of storage.
 * @returns A fully populated appearance, defaulting field by field.
 */
export function sanitizeAppearance(raw: unknown): Appearance {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_APPEARANCE

  const candidate = raw as Partial<Record<keyof Appearance, unknown>>

  return {
    silhouette: memberOr(
      Object.values(Silhouette),
      candidate.silhouette,
      DEFAULT_APPEARANCE.silhouette,
    ),
    hairStyle: memberOr(Object.values(HairStyle), candidate.hairStyle, DEFAULT_APPEARANCE.hairStyle),
    hairColor: swatchIdOr(HAIR_COLORS, candidate.hairColor, DEFAULT_APPEARANCE.hairColor),
    skinTone: swatchIdOr(SKIN_TONES, candidate.skinTone, DEFAULT_APPEARANCE.skinTone),
    garment: memberOr(Object.values(Garment), candidate.garment, DEFAULT_APPEARANCE.garment),
    garmentColor: swatchIdOr(
      GARMENT_COLORS,
      candidate.garmentColor,
      DEFAULT_APPEARANCE.garmentColor,
    ),
  }
}
