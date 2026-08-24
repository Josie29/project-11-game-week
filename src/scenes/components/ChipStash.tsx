import { MAX_STASH_CHIPS, STASH_COLUMN_ANCHORS, SURFACE_Y } from '../tableLayout'
import { packIntoColumns, stashBreakdown } from '../chipLayout'
import { ChipStack } from './ChipStack'

interface ChipStashProps {
  /** Bankroll to render, in dollars. */
  amount: number
}

/**
 * The player's own chips, sitting on the felt in front of their seat.
 *
 * This is the bankroll made physical. Wagers are pushed out of here and
 * winnings are raked back into it, so the number in the HUD always has a
 * visible counterpart on the table.
 *
 * Column positions come from `STASH_COLUMN_ANCHORS`, which is unit-tested to
 * stay on the felt and clear of both the betting spots and either split hand.
 */
export function ChipStash({ amount }: ChipStashProps) {
  const columns = packIntoColumns(
    stashBreakdown(amount, MAX_STASH_CHIPS),
    STASH_COLUMN_ANCHORS.length,
  )

  return (
    <group>
      {columns.map((column, index) => {
        const anchor = STASH_COLUMN_ANCHORS[index]
        if (!anchor) return null

        return (
          <ChipStack key={index} chips={column} position={[anchor[0], SURFACE_Y, anchor[1]]} />
        )
      })}
    </group>
  )
}
