/*
 * Every swatch here was read off the Comfy reference sheets in `art/refs/`:
 * skin and garment primaries from `character_sheet.png`, hair from
 * `hair_sheet.png`. They are stored as named swatches rather than bare hex
 * strings because a saved appearance refers to a swatch by id — reordering or
 * retuning a palette must not silently repaint a returning player's character.
 */

export interface Swatch {
  /** Stable key written into the save. Never renumber or reuse one. */
  readonly id: string
  readonly name: string
  readonly hex: string
}

export const SKIN_TONES: readonly Swatch[] = [
  { id: 'porcelain', name: 'Porcelain', hex: '#f0cdb4' },
  { id: 'sand', name: 'Sand', hex: '#e0b48d' },
  { id: 'honey', name: 'Honey', hex: '#c68a63' },
  { id: 'bronze', name: 'Bronze', hex: '#a9673f' },
  { id: 'umber', name: 'Umber', hex: '#7d4a2a' },
  { id: 'espresso', name: 'Espresso', hex: '#513021' },
]

export const HAIR_COLORS: readonly Swatch[] = [
  { id: 'jet', name: 'Jet', hex: '#1a1410' },
  { id: 'coffee', name: 'Coffee', hex: '#3a2418' },
  { id: 'chestnut', name: 'Chestnut', hex: '#6b3a1e' },
  { id: 'auburn', name: 'Auburn', hex: '#8c3a1f' },
  { id: 'blonde', name: 'Blonde', hex: '#d8b163' },
  { id: 'platinum', name: 'Platinum', hex: '#ded6c4' },
  { id: 'silver', name: 'Silver', hex: '#b9bcc2' },
  // The strip is a neon street; two unnatural colours belong on it.
  { id: 'magenta', name: 'Magenta', hex: '#d1279a' },
  { id: 'cyan', name: 'Cyan', hex: '#29c3d6' },
]

export const GARMENT_COLORS: readonly Swatch[] = [
  { id: 'charcoal', name: 'Charcoal', hex: '#3a3f4a' },
  { id: 'midnight', name: 'Midnight', hex: '#1e2436' },
  { id: 'crimson', name: 'Crimson', hex: '#b8203f' },
  { id: 'ivory', name: 'Ivory', hex: '#e6e3d8' },
  { id: 'olive', name: 'Olive', hex: '#55573c' },
  { id: 'plum', name: 'Plum', hex: '#4a2a52' },
  { id: 'teal', name: 'Teal', hex: '#1f5560' },
  { id: 'surgical', name: 'Surgical', hex: '#3f8f88' },
]

/** Six hex digits behind a hash. Three-digit shorthand is deliberately not accepted. */
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/

/**
 * Looks a swatch up by id, falling back to the palette's first entry.
 *
 * Falling back rather than throwing is the point: a save written before a
 * swatch was renamed must still produce a character, not a crash on boot.
 *
 * @param palette Palette to search. Must not be empty.
 * @param id Swatch id from a save, possibly stale or absent.
 * @returns The matching swatch, or the palette's first entry.
 * @throws {RangeError} If the palette is empty, which would leave nothing to fall back to.
 */
export function swatchOr(palette: readonly Swatch[], id: string | undefined): Swatch {
  const fallback = palette[0]
  if (!fallback) {
    throw new RangeError('swatchOr called with an empty palette')
  }
  return palette.find((swatch) => swatch.id === id) ?? fallback
}

/**
 * Moves a colour toward white or black by a fraction of the remaining distance.
 *
 * Used to derive a garment's lapel and trouser shades from its chosen primary,
 * so the palette stays one swatch per garment colour instead of one per
 * colour-and-role combination.
 *
 * @param hex Six-digit hex colour, e.g. `#3a3f4a`.
 * @param amount Positive lightens toward white, negative darkens toward black.
 *   Clamped to [-1, 1].
 * @returns A six-digit hex colour.
 * @throws {TypeError} If `hex` is not a six-digit hex colour.
 */
export function shadeHex(hex: string, amount: number): string {
  if (!HEX_PATTERN.test(hex)) {
    throw new TypeError(`shadeHex expected a six-digit hex colour, got "${hex}"`)
  }

  const ratio = Math.max(-1, Math.min(1, amount))
  const target = ratio >= 0 ? 255 : 0
  const weight = Math.abs(ratio)

  let out = '#'
  for (let offset = 1; offset < 7; offset += 2) {
    // Two hex digits per channel, so step the slice two at a time.
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16)
    const mixed = Math.round(channel + (target - channel) * weight)
    out += mixed.toString(16).padStart(2, '0')
  }
  return out
}

/**
 * Blends two hex colours.
 *
 * @param from Six-digit hex colour.
 * @param to Six-digit hex colour to move toward.
 * @param amount How far to move, clamped to [0, 1].
 * @returns A six-digit hex colour.
 * @throws {TypeError} If either argument is not a six-digit hex colour.
 */
export function mixHex(from: string, to: string, amount: number): string {
  if (!HEX_PATTERN.test(from) || !HEX_PATTERN.test(to)) {
    throw new TypeError(`mixHex expected six-digit hex colours, got "${from}" and "${to}"`)
  }

  const weight = Math.max(0, Math.min(1, amount))

  let out = '#'
  for (let offset = 1; offset < 7; offset += 2) {
    // Two hex digits per channel, so step the slice two at a time.
    const a = Number.parseInt(from.slice(offset, offset + 2), 16)
    const b = Number.parseInt(to.slice(offset, offset + 2), 16)
    out += Math.round(a + (b - a) * weight).toString(16).padStart(2, '0')
  }
  return out
}

/**
 * A lip colour that reads against the skin it is drawn on.
 *
 * Derived rather than fixed, and this is the second attempt at the problem. A
 * single hex was chosen dark enough to show on the pale skins and landed within
 * a shade of the two darkest ones — a face with eyes, brows and no mouth, on a
 * third of the swatches the designer offers. Darkening it further only moves
 * which skins it disappears on.
 *
 * Taking the skin down and then pulling it toward a warm red keeps the same
 * *relationship* on all six: always a step darker than the face, always more
 * saturated than the face, and never the same colour as it.
 *
 * @param skin Six-digit hex skin tone.
 * @returns A six-digit hex colour for the mouth.
 */
export function lipFor(skin: string): string {
  return mixHex(shadeHex(skin, -0.35), LIP_TINT, 0.45)
}

/** The warm red every lip is pulled toward. Read off `art/refs/`. */
const LIP_TINT = '#b04a52'
