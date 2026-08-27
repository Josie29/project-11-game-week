/**
 * Orders staked wagers into the sequence the hands will be played.
 *
 * First base plays first, and first base is the dealer's left — the stool with
 * the *highest* seat number, since `PLAYER_SEATS` is numbered ascending in x
 * and the dealer stands at negative z facing the players, putting their left
 * at positive x. From the player's camera that is the right-hand stool, and
 * the round walks right to left, exactly as a real table plays.
 *
 * Descending seat number, therefore. A player with no seat sorts last —
 * craps, where there are no seats and nothing is dealt, and a client that
 * never claimed one — and `Array.prototype.sort` is stable, so the arrival
 * queue still breaks ties among the unseated.
 *
 * Pure and dependency-free so the direction can be unit-tested; reversing
 * this comparator deals the whole table backwards in a way no screenshot
 * shows.
 */
export function byPlayOrder(
  a: { seat: number | null },
  b: { seat: number | null },
): number {
  // Nulls become -Infinity: last in a descending sort.
  return (b.seat ?? -Infinity) - (a.seat ?? -Infinity)
}
