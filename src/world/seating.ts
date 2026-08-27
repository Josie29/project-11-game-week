import {
  BLACKJACK_SEAT_COUNT,
  DEFAULT_BLACKJACK_SEAT,
  isBlackjackSeat,
} from '../scenes/casinoFloorLayout'

/*
 * Who is sitting where, as arithmetic over the room's seat map.
 *
 * Pure and tested, on the same rule as `presence.ts` and the game engines, and
 * for the same reason: none of it survives a screenshot. Two figures drawn one
 * inside the other and two figures drawn on their own stools are the same still
 * image right up until you count the chairs, and every bug this file exists to
 * prevent is of that kind.
 *
 * The map itself is the room's, and the room is the only thing that can produce
 * it — two clients can each believe they took the same stool and no shared rule
 * separates them. What is here is everything a client does *with* the answer.
 */

/** Who holds each seat at one table, keyed by seat index. */
export type SeatMap = Readonly<Record<number, string>>

/**
 * Which seat a player is in, or null if they are not seated.
 *
 * @param seats The room's map for one table.
 * @param playerId Whose seat to find.
 */
export function seatOf(seats: SeatMap, playerId: string): number | null {
  for (const [seat, id] of Object.entries(seats)) {
    if (id === playerId) return Number(seat)
  }
  return null
}

/**
 * Seats held by somebody other than this player.
 *
 * This player's own seat is deliberately not "taken": they are on it. Including
 * it would leave a player who stood up staring at a stool the game insisted was
 * occupied by a stranger — and that stranger would be them.
 *
 * @param seats The room's map for one table.
 * @param selfId This player's id, or null when there is no room at all.
 */
export function takenSeats(seats: SeatMap, selfId: string | null): ReadonlySet<number> {
  const taken = new Set<number>()

  for (const [seat, id] of Object.entries(seats)) {
    if (id !== selfId) taken.add(Number(seat))
  }

  return taken
}

/**
 * Seats a player may walk up to and take, in order.
 *
 * Playing alone this is every seat, which is what leaves a solo game exactly as
 * it was: no room, no map, nothing taken.
 */
export function freeSeats(seats: SeatMap, selfId: string | null): readonly number[] {
  const taken = takenSeats(seats, selfId)

  return Array.from({ length: BLACKJACK_SEAT_COUNT }, (_, seat) => seat).filter(
    (seat) => !taken.has(seat),
  )
}

/**
 * Whether the room turned down this player's claim.
 *
 * Two people can walk up to one stool and press F inside the same round trip.
 * Both clients believe they are sitting until the map comes back, and the one
 * the room did not seat has to notice: otherwise they spend the round drawn
 * inside somebody else, holding a panel that will never be given a turn.
 *
 * An empty map is not a refusal. It is a table nobody has reported on yet —
 * treating it as one would stand every player up in the gap between sitting
 * down and the room answering.
 *
 * @param seats The room's map for one table.
 * @param claimed The seat this client believes it holds, or null.
 * @param selfId This player's id in the room, or null before the room says.
 */
export function claimRefused(
  seats: SeatMap,
  claimed: number | null,
  selfId: string | null,
): boolean {
  if (claimed === null || selfId === null) return false
  if (Object.keys(seats).length === 0) return false

  return seats[claimed] !== selfId
}

/**
 * Which stool to draw a player on when the room has not said.
 *
 * Playing alone, or before the first map arrives. `DEFAULT_BLACKJACK_SEAT` is
 * the seat one player has always taken, so a solo table — and every capture of
 * one — is unchanged.
 */
export function seatOrDefault(seat: number | null): number {
  return isBlackjackSeat(seat) ? seat : DEFAULT_BLACKJACK_SEAT
}
