/*
 * What goes on a contact sheet, as data.
 *
 * The audit this was written for is roughly three hundred states — three builds
 * by eight hairstyles, four garments, twelve items on and off, front and back —
 * and before this existed *none* of them could be photographed. There was no
 * deep link for a hairstyle or an item, `?boot=designer` rendered whatever
 * happened to be in `localStorage`, and `?freeze` pinned the turntable at
 * rotation zero, so no capture in the whole regression suite had ever seen the
 * back of a character. A ponytail shaped like a limb is exactly the defect that
 * survives that.
 *
 * A sheet puts one row of figures in a single frame, so eight hairstyles is one
 * capture rather than eight. Pure and tested, on the same grounds as the rest of
 * `src/character/`: "the items sheet shows every item in the catalogue" is a
 * claim worth holding to, since a thirteenth item that quietly failed to appear
 * would make the sheet lie about coverage rather than fail.
 */

import {
  DEFAULT_APPEARANCE,
  Garment,
  HairStyle,
  PLAYER_GARMENTS,
  type Appearance,
} from '../character/appearance'
import { CATALOG, type EquippedItems } from '../character/catalog'
import { GARMENT_COLORS, HAIR_COLORS, SKIN_TONES } from '../character/palette'
import { Silhouette } from '../character/proportions'

/** Which sweep a sheet shows. */
export enum SheetKind {
  Hair = 'hair',
  Items = 'items',
  Garments = 'garments',
  Builds = 'builds',
  Skin = 'skin',
}

export interface SheetFigure {
  /** Printed under the figure. What a reader needs to name the one that is wrong. */
  readonly label: string
  readonly appearance: Appearance
  readonly equipped: EquippedItems
}

/** The base figure a sheet varies one thing against. */
const BASE: Appearance = {
  ...DEFAULT_APPEARANCE,
  silhouette: Silhouette.Androgynous,
  hairStyle: HairStyle.Crop,
  garment: Garment.Suit,
  garmentColor: 'charcoal',
}

/**
 * Every figure on one sheet.
 *
 * @param kind Which sweep to lay out.
 * @param base Overrides for the figure everything else is held constant at, so
 *   `?sheet=hair&build=feminine` shows the eight styles on that silhouette.
 * @returns The figures, in the order they stand left to right.
 */
export function sheetFigures(
  kind: SheetKind,
  base: Partial<Appearance> = {},
): readonly SheetFigure[] {
  const start: Appearance = { ...BASE, ...base }

  switch (kind) {
    case SheetKind.Hair:
      return Object.values(HairStyle).map((hairStyle) => ({
        label: hairStyle,
        appearance: { ...start, hairStyle },
        equipped: {},
      }))

    /*
     * One figure per item, wearing that item and nothing else.
     *
     * Not all twelve at once: `?dressed` already does that, and it is the wrong
     * capture for an audit because a hat, shades and a cane in one frame hide
     * each other. One item per figure is what makes a single bad one findable.
     */
    case SheetKind.Items:
      return CATALOG.map((item) => ({
        label: item.name,
        appearance: start,
        equipped: { [item.slot]: item.id },
      }))

    case SheetKind.Garments:
      return PLAYER_GARMENTS.map((garment) => ({
        label: garment,
        appearance: { ...start, garment },
        equipped: {},
      }))

    case SheetKind.Builds:
      return Object.values(Silhouette).flatMap((silhouette) =>
        PLAYER_GARMENTS.map((garment) => ({
          label: `${silhouette} / ${garment}`,
          appearance: { ...start, silhouette, garment },
          equipped: {},
        })),
      )

    /*
     * Skin and hair colour together.
     *
     * Six tones and nine hair colours do not divide, so this walks both lists
     * at once and stops at the longer — every swatch appears, which is the
     * point, and the pairings are arbitrary, which does not matter.
     */
    case SheetKind.Skin: {
      const count = Math.max(SKIN_TONES.length, HAIR_COLORS.length, GARMENT_COLORS.length)

      return Array.from({ length: count }, (_, index) => {
        const skin = SKIN_TONES[index % SKIN_TONES.length]
        const hair = HAIR_COLORS[index % HAIR_COLORS.length]
        const garment = GARMENT_COLORS[index % GARMENT_COLORS.length]

        return {
          label: `${skin?.name ?? ''} / ${hair?.name ?? ''}`,
          appearance: {
            ...start,
            skinTone: skin?.id ?? start.skinTone,
            hairColor: hair?.id ?? start.hairColor,
            garmentColor: garment?.id ?? start.garmentColor,
          },
          equipped: {},
        }
      })
    }
  }
}

/**
 * How many figures to a row.
 *
 * Wide enough to fill a 16:9 frame and no wider — a sheet of twelve laid out in
 * one line puts each figure across about a hundred pixels, which is under the
 * size at which a ring or a pair of shades can be judged at all, and judging
 * them is the entire purpose.
 *
 * @param count How many figures the sheet holds.
 * @returns Figures per row.
 */
export function sheetColumns(count: number): number {
  /*
   * One row wherever it fits, and never more than two.
   *
   * A second row is the enemy of the whole exercise: it stands behind the
   * first, so half of it is hidden by the half in front. Twelve items laid out
   * four-by-three had eight of the twelve partly obscured. Even staggered, a
   * back row is the reason the long fall and the ponytail could not be judged
   * on the sheet that was supposed to be judging them.
   *
   * Eight across is small — about two hundred pixels a figure at capture width
   * — but small and whole beats large and half behind someone else, and the
   * appearance deep links are there for a close look at any one of them.
   */
  if (count <= 8) return count
  return Math.ceil(count / 2)
}

/** How far apart figures stand across a row. */
export const SHEET_SPACING = 1.5
/** How far back each row stands from the one in front of it. */
export const SHEET_ROW_DEPTH = 3.0

/**
 * Where one figure stands on the sheet, in world units.
 *
 * Rows are staggered by half a space. Squared up, the back row stands directly
 * behind the front one and is almost entirely hidden — the first capture of the
 * hair sheet showed four hairstyles and four pairs of shoulders behind them,
 * plus four captions with nowhere to go. Half a space is enough to see every
 * figure down the gaps.
 */
export function sheetPosition(
  index: number,
  count: number,
  spacing = SHEET_SPACING,
  rowDepth = SHEET_ROW_DEPTH,
): readonly [number, number, number] {
  const columns = sheetColumns(count)
  const column = index % columns
  const row = Math.floor(index / columns)
  const rows = Math.ceil(count / columns)

  // Split either side of centre rather than pushed one way, or the block's
  // right-hand edge walks out of frame — which cropped the last figure on the
  // first sheet that used it.
  const stagger = (row % 2 === 1 ? 1 : -1) * (spacing / 4)

  return [
    (column - (columns - 1) / 2) * spacing + stagger,
    0,
    // Later rows stand further back, and the whole block is centred on the origin.
    -(row - (rows - 1) / 2) * rowDepth,
  ]
}

/** How wide and deep the whole block of figures is, for framing a camera on it. */
export function sheetExtent(count: number): { halfWidth: number; halfDepth: number } {
  const columns = sheetColumns(count)
  const rows = Math.ceil(count / columns)

  return {
    // Half a space of stagger, plus a figure's own width either side.
    halfWidth: ((columns - 1) * SHEET_SPACING) / 2 + SHEET_SPACING / 4 + 0.85,
    halfDepth: ((rows - 1) * SHEET_ROW_DEPTH) / 2,
  }
}

/** Parses `?sheet=`, returning `null` for anything that is not a sheet. */
export function parseSheetKind(raw: string | null): SheetKind | null {
  const kinds = Object.values(SheetKind)
  return kinds.includes(raw as SheetKind) ? (raw as SheetKind) : null
}
