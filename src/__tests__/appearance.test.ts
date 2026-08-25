import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  Garment,
  garmentPalette,
  HairStyle,
  resolveAppearance,
  sanitizeAppearance,
} from '../character/appearance'
import { GARMENT_COLORS, HAIR_COLORS, shadeHex, SKIN_TONES, swatchOr } from '../character/palette'
import { Silhouette } from '../character/proportions'

const HEX = /^#[0-9a-f]{6}$/

describe('sanitizeAppearance', () => {
  // A player who designed a character, then came back after a build that
  // renamed a hairstyle or dropped a swatch, must still load a character with
  // hair and clothes on rather than a bald figure or a crash on boot.
  it('replaces unknown members and swatch ids field by field', () => {
    const stale = {
      silhouette: 'nonbinary-v1',
      hairStyle: 'mohawk',
      hairColor: 'neon-lime',
      skinTone: 'sand',
      garment: Garment.CocktailDress,
      garmentColor: 'crimson',
    }

    const clean = sanitizeAppearance(stale)

    expect(clean.silhouette).toBe(DEFAULT_APPEARANCE.silhouette)
    expect(clean.hairStyle).toBe(DEFAULT_APPEARANCE.hairStyle)
    expect(clean.hairColor).toBe(DEFAULT_APPEARANCE.hairColor)
    // The three fields that were still valid survive untouched — a single bad
    // field must not reset the whole character.
    expect(clean.skinTone).toBe('sand')
    expect(clean.garment).toBe(Garment.CocktailDress)
    expect(clean.garmentColor).toBe('crimson')
  })

  // localStorage is user-writable and can hold anything at all.
  it('never throws, whatever it is handed', () => {
    for (const junk of [null, undefined, 42, 'hello', [], { silhouette: { nested: true } }]) {
      expect(() => sanitizeAppearance(junk)).not.toThrow()
      expect(sanitizeAppearance(junk).hairStyle).toBeDefined()
    }
  })
})

describe('resolveAppearance', () => {
  // Every combination is reachable from the designer, so every combination has
  // to paint. A missing colour renders as three.js's default white, which on a
  // dark strip reads as a glowing hole in the character.
  it('produces a full hex palette for every silhouette, hairstyle and garment', () => {
    for (const silhouette of Object.values(Silhouette)) {
      for (const hairStyle of Object.values(HairStyle)) {
        for (const garment of Object.values(Garment)) {
          for (const swatch of GARMENT_COLORS) {
            const resolved = resolveAppearance({
              silhouette,
              hairStyle,
              hairColor: 'magenta',
              skinTone: 'umber',
              garment,
              garmentColor: swatch.id,
            })

            expect(resolved.hair).toMatch(HEX)
            expect(resolved.skin).toMatch(HEX)
            for (const role of ['primary', 'primaryTrim', 'secondary', 'shirt', 'accent', 'shoes'] as const) {
              expect(resolved.colors[role]).toMatch(HEX)
            }
          }
        }
      }
    }
  })

  // Silhouette gates nothing: a masculine figure can wear the gown and a
  // feminine one the suit. Gating it would be a worse product and an easy bug
  // to introduce later.
  it('lets any silhouette wear any garment', () => {
    const masculineInADress = resolveAppearance({
      ...DEFAULT_APPEARANCE,
      silhouette: Silhouette.Masculine,
      garment: Garment.CocktailDress,
    })

    expect(masculineInADress.colors.hasSkirt).toBe(true)
  })
})

describe('garmentPalette', () => {
  // The lapels and trousers are derived from the chosen primary rather than
  // stored, so a garment whose trim matched its body would look like a flat
  // slab under the strip's rim lighting — which is exactly how the jacket read
  // before the trim existed.
  it('separates trim and trousers from the suit body', () => {
    const suit = garmentPalette(Garment.Suit, '#3a3f4a')

    expect(suit.primaryTrim).not.toBe(suit.primary)
    expect(suit.secondary).not.toBe(suit.primary)
    expect(suit.hasSkirt).toBe(false)
  })

  // Jeans are denim whatever the player picked. "Olive jeans" is not a look,
  // and the tee is the garment colour in that outfit.
  it('holds jeans at denim regardless of the chosen colour', () => {
    const olive = garmentPalette(Garment.TeeAndJeans, swatchOr(GARMENT_COLORS, 'olive').hex)
    const plum = garmentPalette(Garment.TeeAndJeans, swatchOr(GARMENT_COLORS, 'plum').hex)

    expect(olive.secondary).toBe(plum.secondary)
    expect(olive.primary).not.toBe(plum.primary)
  })
})

describe('shadeHex', () => {
  // The whole derived-palette scheme rests on this staying in range. A channel
  // that overflowed past ff would wrap and paint a lightened jacket black.
  it('stays inside the hex range at both extremes', () => {
    expect(shadeHex('#000000', 1)).toBe('#ffffff')
    expect(shadeHex('#ffffff', -1)).toBe('#000000')
    // Beyond the ends, it clamps rather than wrapping.
    expect(shadeHex('#ffffff', 4)).toBe('#ffffff')
    expect(shadeHex('#3a3f4a', 0.5)).toMatch(HEX)
  })

  it('rejects anything that is not a six-digit hex colour', () => {
    expect(() => shadeHex('#fff', 0.2)).toThrow(TypeError)
    expect(() => shadeHex('red', 0.2)).toThrow(TypeError)
  })
})

describe('palettes', () => {
  // Swatch ids are written into saves. A duplicate id makes the lookup pick
  // whichever came first, so the player's chosen colour silently becomes
  // another one.
  it('have unique ids and valid hex values', () => {
    for (const palette of [SKIN_TONES, HAIR_COLORS, GARMENT_COLORS]) {
      const ids = palette.map((swatch) => swatch.id)
      expect(new Set(ids).size).toBe(ids.length)

      for (const swatch of palette) {
        expect(swatch.hex).toMatch(HEX)
      }
    }
  })
})
