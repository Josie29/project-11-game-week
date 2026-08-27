import {
  blackjackSeatFacing,
  blackjackSeatSpot,
  CRAPS_ORIGIN,
  crapsRailFacing,
  crapsRailSpot,
  TableId,
} from '../scenes/casinoFloorLayout'
import { CHAIR_X, CHAIR_Z, RECLINER_TURN, SEATED_DONOR_Z } from '../scenes/clinicLayout'
import type { RemoteIdentity } from './presence'
import { type SeatMap, seatOf } from './seating'

/*
 * Where a seated peer is drawn. Moved out of `RemotePlayers.tsx` when the
 * clinic branch was added (issue #6), because every branch of it is a claim
 * about hand-placed coordinates — exactly the kind of thing this project tests
 * — and a function living in a component can only be proven by a screenshot.
 */

/**
 * Where a seated peer belongs, or null if they are not sitting anywhere known.
 *
 * A seated player deliberately sends no poses — that is what keeps the room
 * hibernating and the bill at zero — so there is nothing to interpolate and the
 * figure has to be placed rather than tracked.
 *
 * The stool comes from the room's seat map. It used to come from the roster the
 * *deal* was dealt against, which does not exist until a round is dealt: two
 * people who had sat down and were still choosing a stake had no seats at all,
 * so both were drawn at their last walking pose — the patch of carpet beside
 * the table they had each walked to, one inside the other.
 */
export function seatedAt(
  player: RemoteIdentity,
  seats: SeatMap,
  crapsLineup: readonly string[],
  crapsShooter: string | null,
): { at: readonly [number, number, number]; facing: number } | null {
  if (!player.seated) return null

  /*
   * A clinic recliner. Placed exactly where `ClinicInterior` places the local
   * donor — same forward offset, same quarter turn — so two people in the
   * room agree about what a chair looks like occupied. Before the chair index
   * crossed the wire, this fell through to the walking-pose fallback and drew
   * the donor standing-sat on the floor beside the chair (issue #6).
   */
  if (player.chair !== null) {
    const z = CHAIR_Z[player.chair]
    // A chair the clinic does not have draws nobody, rather than somebody in
    // recliner zero on top of whoever is actually in it.
    if (z === undefined) return null
    return { at: [CHAIR_X + SEATED_DONOR_Z, 0, z], facing: RECLINER_TURN }
  }

  /*
   * Craps: standing at the rail, with whoever holds the dice at the shooter's
   * end. This was missing entirely, so anybody at the craps table was invisible
   * — they send no poses while they are standing still, and nothing else knew
   * where to draw them. Two people at one table could not see each other, which
   * is most of the point of being at one.
   */
  if (player.table === TableId.Craps) {
    const spot = crapsRailSpot(player.id, crapsShooter, crapsLineup)
    return {
      at: [CRAPS_ORIGIN[0] + spot[0], 0, CRAPS_ORIGIN[2] + spot[2]],
      // At the felt — square to it on the near rail, side-on from the two
      // spots around the table's end. Same function as the local player.
      facing: crapsRailFacing(spot),
    }
  }

  if (player.table !== TableId.Blackjack) return null

  const seat = seatOf(seats, player.id)
  if (seat === null) return null

  // Turned to the middle of the table, by the same function that turns the
  // stool and the local player. At third base, square to the dealer seats
  // somebody side-on to their own cards.
  return { at: blackjackSeatSpot(seat), facing: blackjackSeatFacing(seat) }
}
