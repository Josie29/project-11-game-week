import { describe, expect, it } from 'vitest'
import { HairStyle, PLAYER_GARMENTS } from '../character/appearance'
import { CATALOG } from '../character/catalog'
import { HAIR_COLORS, SKIN_TONES } from '../character/palette'
import { Silhouette } from '../character/proportions'
import {
  parseSheetKind,
  sheetColumns,
  sheetFigures,
  sheetPosition,
  SheetKind,
} from '../dev/contactSheet'

describe('contact sheets', () => {
  /*
   * A sheet that silently missed a row would be worse than no sheet.
   *
   * The whole claim a contact sheet makes is "this is all of them" — it is what
   * lets one capture stand in for twelve. A thirteenth item added to the
   * catalogue that quietly failed to appear would leave the audit passing while
   * covering less than it did before, which is the failure mode `npm run shots`
   * already has and the reason every scene needs its own `?boot=`.
   */
  it('covers every item in the catalogue', () => {
    const figures = sheetFigures(SheetKind.Items)

    expect(figures).toHaveLength(CATALOG.length)
    for (const item of CATALOG) {
      expect(figures.some((figure) => figure.equipped[item.slot] === item.id)).toBe(true)
    }
  })

  it('covers every hairstyle, garment and silhouette', () => {
    expect(sheetFigures(SheetKind.Hair)).toHaveLength(Object.values(HairStyle).length)
    expect(sheetFigures(SheetKind.Garments)).toHaveLength(PLAYER_GARMENTS.length)
    expect(sheetFigures(SheetKind.Builds)).toHaveLength(
      Object.values(Silhouette).length * PLAYER_GARMENTS.length,
    )
  })

  /** Every swatch has to appear, or the sheet cannot be used to judge a palette. */
  it('shows every skin tone and every hair colour', () => {
    const figures = sheetFigures(SheetKind.Skin)

    for (const tone of SKIN_TONES) {
      expect(figures.some((figure) => figure.appearance.skinTone === tone.id)).toBe(true)
    }
    for (const color of HAIR_COLORS) {
      expect(figures.some((figure) => figure.appearance.hairColor === color.id)).toBe(true)
    }
  })

  /*
   * Each figure varies one thing and holds the rest still.
   *
   * A hair sheet whose figures also differed in build would not show what a
   * hairstyle looks like; it would show eight unrelated characters.
   */
  it('varies one thing at a time', () => {
    const figures = sheetFigures(SheetKind.Hair, { silhouette: Silhouette.Feminine })

    const builds = new Set(figures.map((figure) => figure.appearance.silhouette))
    const garments = new Set(figures.map((figure) => figure.appearance.garment))
    const styles = new Set(figures.map((figure) => figure.appearance.hairStyle))

    expect(builds).toEqual(new Set([Silhouette.Feminine]))
    expect(garments.size).toBe(1)
    expect(styles.size).toBe(figures.length)
  })

  /*
   * No two figures may stand in the same place.
   *
   * A layout bug here reads as "one of the hairstyles is missing" — two
   * characters occupying one spot look like one character — which would send a
   * reader hunting in the geometry for a fault that is in the grid.
   */
  it('stands every figure somewhere different', () => {
    for (const kind of Object.values(SheetKind)) {
      const figures = sheetFigures(kind)
      const spots = figures.map((_, index) => sheetPosition(index, figures.length).join(','))

      expect(new Set(spots).size, `${kind} stacks two figures in one place`).toBe(figures.length)
    }
  })

  /*
   * And nobody may be so small in frame that the thing being judged is a smear.
   *
   * Twelve figures in one line is about a hundred pixels each at capture width,
   * which is under the size at which a ring or a pair of shades can be told
   * apart at all — and telling them apart is the whole point of the sheet.
   */
  it('never puts more than one row behind another', () => {
    for (const count of [1, 3, 4, 8, 9, 12, 20]) {
      const columns = sheetColumns(count)
      // Two rows at the very most: a third stands behind a second and cannot
      // be seen at all, which is what four-by-three did to the item sheet.
      expect(Math.ceil(count / columns), `${count} figures`).toBeLessThanOrEqual(2)
      expect(columns, `${count} figures`).toBeLessThanOrEqual(10)
      expect(sheetColumns(count)).toBeGreaterThan(0)
    }
  })

  it('accepts only the sheets that exist', () => {
    expect(parseSheetKind('hair')).toBe(SheetKind.Hair)
    expect(parseSheetKind('items')).toBe(SheetKind.Items)
    expect(parseSheetKind('nonsense')).toBeNull()
    expect(parseSheetKind(null)).toBeNull()
  })
})
