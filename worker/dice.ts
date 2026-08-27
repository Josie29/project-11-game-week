/**
 * One player's standing in the line for the dice, as the room sees it.
 *
 * Pure and socket-free so the rule below is testable without a Durable Object:
 * the worker builds these from its attachments and a test builds them from
 * literals, and both get the same answer.
 */
export interface DiceStanding {
  readonly id: string
  /** Whether this player already holds the dice. */
  readonly holdsDice: boolean
  /** Whether they may be offered them, as their own client reported. */
  readonly canShoot: boolean
}

/**
 * Who holds the dice at a table, handing them out only when nobody does.
 *
 * The holder keeps them whether or not they are still eligible. Eligibility is
 * "I have a line bet down", and a line bet is not a constant — it is absent
 * before the come-out and cleared the moment it resolves. Deciding the shooter
 * from eligibility alone walked the dice away from the person mid-hand every
 * time their bet paid; holding is state, and only a seven-out, a departure or
 * a table change may clear it.
 *
 * Eligibility decides exactly one thing: who is offered a loose pair — the
 * first player in line who says they can shoot.
 *
 * @param line Everyone at the table, in queue order.
 * @returns The id of the player who holds the dice, or null if nobody can.
 */
export function resolveDiceHolder(line: readonly DiceStanding[]): string | null {
  const holder = line.find((player) => player.holdsDice)
  if (holder) return holder.id

  return line.find((player) => player.canShoot)?.id ?? null
}
