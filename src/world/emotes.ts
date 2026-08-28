import { TableId } from '../scenes/casinoFloorLayout'

/*
 * The things a player can say, and where they can say them.
 *
 * Chosen from a list, never typed: no free text to moderate and nothing to
 * localise. The wire carries the id, every client owns the label — so what a
 * peer sends can only ever render as something this build already knows.
 *
 * Pure, like `rooms.ts`: the set on offer is derived from state the game
 * already keeps (which table the player is at), not stored anywhere.
 */

export enum EmoteId {
  Wave = 'wave',
  Hello = 'hello',
  GoodLuck = 'good-luck',
  NiceOne = 'nice-one',
  NiceHit = 'nice-hit',
  TableWin = 'table-win',
  ToughBreak = 'tough-break',
  GoodCall = 'good-call',
  SevenOut = 'seven-out',
  HotShooter = 'hot-shooter',
  DiceAreOn = 'dice-are-on',
  HardWay = 'hard-way',
}

/** What the bubble says. The id crosses the wire; this never does. */
export const EMOTE_LABELS: Readonly<Record<EmoteId, string>> = {
  [EmoteId.Wave]: '👋 Hey!',
  [EmoteId.Hello]: 'Hello there',
  [EmoteId.GoodLuck]: 'Good luck!',
  [EmoteId.NiceOne]: 'Nice one!',
  [EmoteId.NiceHit]: 'Nice hit!',
  [EmoteId.TableWin]: 'Table win!',
  [EmoteId.ToughBreak]: 'Tough break',
  [EmoteId.GoodCall]: 'Good call',
  [EmoteId.SevenOut]: 'Seven out!',
  [EmoteId.HotShooter]: 'Hot shooter!',
  [EmoteId.DiceAreOn]: 'Dice are on',
  [EmoteId.HardWay]: 'The hard way!',
}

/** How long a bubble stays up. Derived at render, never sent. */
export const EMOTE_TTL_MS = 4_000

/**
 * Four per set, exactly: the picker numbers its entries 1-4, so a longer list
 * would offer an emote no digit can reach.
 */
const GENERAL_SET: readonly EmoteId[] = [
  EmoteId.Wave,
  EmoteId.Hello,
  EmoteId.GoodLuck,
  EmoteId.NiceOne,
]

const BLACKJACK_SET: readonly EmoteId[] = [
  EmoteId.NiceHit,
  EmoteId.TableWin,
  EmoteId.ToughBreak,
  EmoteId.GoodCall,
]

const CRAPS_SET: readonly EmoteId[] = [
  EmoteId.SevenOut,
  EmoteId.HotShooter,
  EmoteId.DiceAreOn,
  EmoteId.HardWay,
]

/**
 * The list on offer where the player is standing.
 *
 * Keyed on the table, not the venue: the general set covers the strip, the
 * shop, the clinic *and* the casino floor between tables, because "craps talk"
 * only makes sense with dice in view.
 *
 * @param table The table the player is at, from `useGameStore.activeTable`.
 */
export function emoteSetFor(table: TableId | null): readonly EmoteId[] {
  if (table === TableId.Blackjack) return BLACKJACK_SET
  if (table === TableId.Craps) return CRAPS_SET
  return GENERAL_SET
}

const ALL_EMOTES = new Set<string>(Object.values(EmoteId))

/**
 * Coerces a wire value into a known emote, or null.
 *
 * Total, like every sanitizer in `presence.ts`: the id was chosen by another
 * client and relayed unread by the room, so an unknown value has to read as
 * "said nothing" rather than reaching a canvas texture. Accepts the whole
 * catalogue regardless of the receiver's room — a blackjack callout seen from
 * the floor is still a callout.
 */
export function sanitizeEmote(value: unknown): EmoteId | null {
  return typeof value === 'string' && ALL_EMOTES.has(value) ? (value as EmoteId) : null
}
