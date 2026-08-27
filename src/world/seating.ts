import {
  BLACKJACK_SEAT_COUNT,
  DEFAULT_BLACKJACK_SEAT,
  isBlackjackSeat,
  TableId,
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
 * A refusal is somebody else's id in the claimed stool, and nothing less. A
 * stool absent from the map is a claim still in flight, not a claim denied —
 * and the map is already populated whenever anyone else at the table is
 * seated, so reading "not mine yet" as a refusal stood a player straight back
 * up every time they sat down at a table with company. The room only ever
 * refuses in favour of an incumbent, so the incumbent's id is what a real
 * refusal looks like when the map arrives.
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

  const holder = seats[claimed]
  return holder !== undefined && holder !== selfId
}

/**
 * The stool this player holds at the blackjack table, or null if they are not
 * at it.
 *
 * The one conversion the felt needs, and it deliberately keeps the `null`.
 * Laundering it into a stool is what put a tray of chips on an empty table:
 * both tables stay mounted for as long as the player is in the room, so the
 * felt asked "which stool is this player on" every frame and got "the middle
 * one" for somebody standing on the other side of the floor. A player who is
 * not at this table owns nothing on it, and that has to be sayable.
 *
 * A seated player with no stool of their own takes the middle one, which is
 * where a lone player has always sat and what every `?boot=` link relies on.
 * Total in the seat, because seat indices arrive off the wire.
 *
 * @param atTable The table the player is at, or null out on the floor.
 * @param seat The stool they claimed there, if any.
 */
export function ownSeat(atTable: TableId | null, seat: number | null): number | null {
  if (atTable !== TableId.Blackjack) return null

  return isBlackjackSeat(seat) ? seat : DEFAULT_BLACKJACK_SEAT
}
