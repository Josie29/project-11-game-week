import { useMemo } from 'react'
import { HairStyle } from '../../../character/appearance'
import { hairParts } from '../../../character/hairParts'
import { hairPalette } from '../../../character/partPalette'
import type { BodyProportions } from '../../../character/proportions'
import { Parts } from './Parts'

/*
 * The eight styles on `art/refs/hair_sheet.png`.
 *
 * The shapes moved out to `src/character/hairParts.ts`, which is pure and
 * asserted. That was not a tidy-up: the ponytail shipped as a capsule floating
 * eight centimetres behind the skull with a gather bead beside it, and no test
 * in the repository could see it, because the only geometry assertion the
 * character had looked at the slot's anchor rather than the shape hanging off
 * it. `hairParts.test.ts` now fails if any strand comes adrift of the head.
 *
 * What is left here is the placement of the list, and nothing else. Hair is
 * authored in the head's own frame — origin at the centre of the skull — so the
 * caller puts this group there and the numbers inside stay readable.
 */

interface HairProps {
  style: HairStyle
  color: string
  body: BodyProportions
}

export function Hair({ style, color, body }: HairProps) {
  const parts = useMemo(() => hairParts(style, body), [style, body])
  const palette = useMemo(() => hairPalette(color), [color])

  return <Parts parts={parts} palette={palette} namePrefix="hair" />
}
