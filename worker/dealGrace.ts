/**
 * How long the opening deal takes to play out on every client's screen.
 *
 * The room arms the first turn clock of a round in the same breath as the
 * deal broadcast, but the felt spends several seconds actually dealing —
 * a card a second around the table twice, then the dealer's hole-card
 * move — and a fifteen-second decision that starts while cards are still
 * flying is a nine-second decision. The first window gets this added on
 * top, so the fifteen starts when the last card settles.
 *
 * A mirror of `openingDealEndsAt` in `src/scenes/revealTimeline.ts`, term
 * by term — the network boundary stays a boundary, so the formula is
 * duplicated rather than imported, and `turnClock.test.ts` pins the two
 * against each other the same way it pins the window itself. Change the
 * choreography, and that test says so.
 */
export function dealGraceMs(seatCount: number): number {
  // One card per beat, one circuit per opening card, dealer last: the hole
  // card is slot 2 * (seatCount + 1) - 1. Then the wedge pause, the upcard's
  // flip, and the hole card's tuck home.
  const DRAW_INTERVAL_MS = 1000
  const WEDGE_PAUSE_MS = 450
  const FLIP_DURATION_MS = 650
  const HOLE_TUCK_MS = 250

  const holeCardAt = (2 * (seatCount + 1) - 1) * DRAW_INTERVAL_MS
  return holeCardAt + WEDGE_PAUSE_MS + FLIP_DURATION_MS + HOLE_TUCK_MS
}
