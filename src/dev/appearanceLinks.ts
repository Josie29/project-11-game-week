/*
 * Reading an appearance out of the query string.
 *
 * `?build=feminine&hair=ponytail&garment=cocktail-dress&wear=crimson-gown`
 *
 * These exist because the audit that prompted them was unreachable. There was
 * no way to photograph a named hairstyle or a single item: `?boot=designer`
 * rendered whatever was in `localStorage`, and `?dressed` was one hardcoded
 * outfit covering every slot at once, which is the wrong capture for judging
 * any single piece because a hat, shades and a cane hide each other.
 *
 * Pure and tested, unlike the rest of `bootShortcut.ts`, because it is the part
 * with rules: an unknown hairstyle must fall back rather than throw, and a
 * `?wear=` naming an item this build no longer sells must be dropped rather
 * than handed to the renderer. That is the same guarantee `sanitizeAppearance`
 * gives a save, for the same reason — both are strings from outside.
 */

import { Garment, HairStyle, type Appearance } from '../character/appearance'
import { findItem } from '../character/catalog'
import { GARMENT_COLORS, HAIR_COLORS, SKIN_TONES, type Swatch } from '../character/palette'
import { Silhouette } from '../character/proportions'

function member<T extends string>(values: readonly T[], raw: string | null): T | undefined {
  return raw !== null && values.includes(raw as T) ? (raw as T) : undefined
}

function swatch(palette: readonly Swatch[], raw: string | null): string | undefined {
  return raw !== null && palette.some((entry) => entry.id === raw) ? raw : undefined
}

/**
 * The appearance fields named in the query string.
 *
 * @param params The page's query parameters.
 * @returns Only the fields actually given and actually valid, so the caller can
 *   spread them over whatever they already have. An unrecognised value is
 *   dropped rather than defaulted — a typo in `?hair=` should leave the
 *   hairstyle alone, not silently reset the whole figure.
 */
export function appearanceOverrides(params: URLSearchParams): Partial<Appearance> {
  const silhouette = member(Object.values(Silhouette), params.get('build'))
  const hairStyle = member(Object.values(HairStyle), params.get('hair'))
  const garment = member(Object.values(Garment), params.get('garment'))
  const hairColor = swatch(HAIR_COLORS, params.get('haircolor'))
  const skinTone = swatch(SKIN_TONES, params.get('skin'))
  const garmentColor = swatch(GARMENT_COLORS, params.get('garmentcolor'))

  /*
   * Built by spreading rather than by assignment.
   *
   * `Appearance` is readonly throughout — a save feeds geometry directly, and
   * the fields being immutable is part of why `sanitizeAppearance` can promise
   * what it promises. Spreading only the keys that are actually present keeps
   * that, and keeps an absent parameter distinguishable from an explicit one.
   */
  return {
    ...(silhouette ? { silhouette } : {}),
    ...(hairStyle ? { hairStyle } : {}),
    ...(garment ? { garment } : {}),
    ...(hairColor ? { hairColor } : {}),
    ...(skinTone ? { skinTone } : {}),
    ...(garmentColor ? { garmentColor } : {}),
  }
}

/**
 * The catalogue ids named by `?wear=`, comma separated.
 *
 * @param params The page's query parameters.
 * @returns Real item ids, in the order given, with unknown ones dropped and
 *   duplicates removed.
 */
export function wornItems(params: URLSearchParams): string[] {
  const raw = params.get('wear')
  if (raw === null) return []

  const seen = new Set<string>()
  for (const id of raw.split(',')) {
    const trimmed = id.trim()
    if (findItem(trimmed)) seen.add(trimmed)
  }

  return [...seen]
}

/** Whether the query string asks for any appearance override at all. */
export function hasAppearanceOverride(params: URLSearchParams): boolean {
  return Object.keys(appearanceOverrides(params)).length > 0 || params.has('wear')
}

/**
 * `?turn=DEGREES` as radians, or `null` if it is absent or unreadable.
 *
 * Positive turns the view toward the figure's left, so `?turn=180` is the back
 * — which is the angle no capture in this project had ever been taken from.
 */
export function turnRadians(params: URLSearchParams): number | null {
  const raw = params.get('turn')
  if (raw === null) return null

  const degrees = Number(raw)
  if (!Number.isFinite(degrees)) return null

  return (degrees * Math.PI) / 180
}
