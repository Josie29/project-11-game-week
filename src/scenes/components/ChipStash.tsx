import {
  MAX_STASH_CHIPS,
  STASH_COLUMN_ANCHORS,
  STASH_RAIL,
  TABLE_TOP_Y,
} from '../tableLayout'
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
      {/*
        The tray the chips sit in. This is what separates the player's own money
        from the wager out on the spot — at this camera distance a flat marking
        on the felt was invisible, so the tray has real walls and the chips sit
        up inside it.
      */}
      <group
        position={[STASH_RAIL.center[0], TABLE_TOP_Y, STASH_RAIL.center[1]]}
        rotation={[0, STASH_RAIL.rotationY, 0]}
      >
        {/* Outer body. */}
        <mesh position={[0, STASH_RAIL.wallHeight / 2, 0]} castShadow receiveShadow>
          <boxGeometry
            args={[
              STASH_RAIL.length + 0.08,
              STASH_RAIL.wallHeight,
              STASH_RAIL.width + 0.08,
            ]}
          />
          <meshStandardMaterial color="#43291a" roughness={0.55} metalness={0.1} />
        </mesh>
        {/* Recessed floor, so the walls read as a lip around the chips. */}
        <mesh position={[0, STASH_RAIL.wallHeight - 0.006, 0]} receiveShadow>
          <boxGeometry args={[STASH_RAIL.length, 0.012, STASH_RAIL.width]} />
          <meshStandardMaterial color="#150c07" roughness={0.95} />
        </mesh>
      </group>

      {columns.map((column, index) => {
        const anchor = STASH_COLUMN_ANCHORS[index]
        if (!anchor) return null

        return (
          <ChipStack
            key={index}
            chips={column}
            position={[anchor[0], TABLE_TOP_Y + STASH_RAIL.wallHeight, anchor[1]]}
          />
        )
      })}
    </group>
  )
}
