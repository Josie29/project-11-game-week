/*
 * Who goes up on the HIGH ROLLERS boards, and in what order.
 *
 * Pure, and tested, because the billboard is the one place two players' money
 * is compared in public: the ordering must be deterministic under ties, the
 * board must never invent a player it cannot name, and every amount printed
 * must be a whole dollar the HUD would also print.
 */

/** How many rows the billboard has room for. */
export const LEADERBOARD_ROWS = 3

/** A player as the board ranks them, before any drawing concerns. */
export interface LeaderboardPlayer {
  readonly id: string
  readonly name: string
  readonly bankroll: number
}

/** One row of the board, ready to draw. */
export interface LeaderboardEntry extends LeaderboardPlayer {
  /** True when this row is the local player, so a scene may highlight it. */
  readonly isSelf: boolean
}

/**
 * Ranks the local player against the room and keeps the top of the list.
 *
 * Bankroll descending; ties break by name then id so two clients holding the
 * same roster always draw the same board. No padding: fewer players than rows
 * means fewer rows, and a self outside the top `limit` is dropped like anyone
 * else — the board is a leaderboard, not a mirror.
 *
 * @param self The local player. Never present in `peers`.
 * @param peers The current room's roster, already sanitized on receipt.
 * @param limit How many rows to keep. Defaults to the board's three.
 * @returns At most `limit` entries, best bankroll first.
 */
export function leaderboardRows(
  self: LeaderboardPlayer,
  peers: readonly LeaderboardPlayer[],
  limit: number = LEADERBOARD_ROWS,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [
    { id: self.id, name: self.name, bankroll: self.bankroll, isSelf: true },
    ...peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      bankroll: peer.bankroll,
      isSelf: false,
    })),
  ]

  entries.sort(
    (a, b) =>
      b.bankroll - a.bankroll ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  )

  return entries.slice(0, Math.max(0, limit))
}

/**
 * Formats a bankroll the way the board paints it: `$12,450`.
 *
 * Hand-rolled grouping rather than `toLocaleString` so the output is identical
 * in every runtime the tests and the canvas run in. Floors to a whole dollar;
 * anything negative reads as $0 because the store never holds one.
 *
 * @param amount Chips in hand.
 * @returns The dollar string, whole dollars, comma-grouped.
 */
export function formatBankroll(amount: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0))
  const digits = String(whole)
  let grouped = ''
  for (let i = 0; i < digits.length; i++) {
    // Insert a comma before each remaining group of three digits.
    const fromEnd = digits.length - i
    if (i > 0 && fromEnd % 3 === 0) grouped += ','
    grouped += digits[i]
  }
  return `$${grouped}`
}

/**
 * Bounds a name to what a board row can hold.
 *
 * @param name The display name, already sanitized on receipt.
 * @param max Most characters a row may carry. Must be at least 2.
 * @returns The name unchanged when it fits, else cut with a trailing ellipsis.
 */
export function truncateName(name: string, max: number): string {
  if (name.length <= max) return name
  return `${name.slice(0, Math.max(1, max - 1))}…` // … is a one-char ellipsis
}
