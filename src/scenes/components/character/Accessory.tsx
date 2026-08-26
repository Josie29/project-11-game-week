import { useMemo } from 'react'
import type { ShopItem } from '../../../character/catalog'
import { itemParts } from '../../../character/itemParts'
import { itemPalette } from '../../../character/partPalette'
import type { BodyProportions } from '../../../character/proportions'
import { Parts } from './Parts'

/*
 * Everything The Gilded Hanger sells, drawn at the component's own origin.
 *
 * Placement is deliberately *not* here — the caller positions each item at
 * `anchorFor(item.slot, silhouette)`, or parents it to a moving joint group.
 * Shape is not here either any more: it lives in `src/character/itemParts.ts`,
 * where a test can assert that a pendant's stone is actually joined to the
 * chain it hangs from rather than floating below it, which is what it was.
 */

interface AccessoryProps {
  item: ShopItem
  /** Needed by the items sized against the body: jackets and gowns. */
  body: BodyProportions
  /**
   * Shortens anything floor-length.
   *
   * Set while the figure is on a stool. A full-length gown skirt hangs through
   * the seat and the thighs when the hips drop and the legs fold forward, which
   * is only visible from the table camera — never from the strip.
   */
  compact?: boolean | undefined
}

export function Accessory({ item, body, compact = false }: AccessoryProps) {
  const parts = useMemo(() => itemParts(item, body, compact), [item, body, compact])
  const palette = useMemo(() => itemPalette(item), [item])

  return <Parts parts={parts} palette={palette} namePrefix={`item:${item.id}`} />
}
