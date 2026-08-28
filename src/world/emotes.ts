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
  /** "Come play" — the two emotes that raise a response card on arrival. */
  BlackjackInvite = 'blackjack-invite',
  CrapsInvite = 'craps-invite',
  /** The answers the response card offers. Plain emotes on the wire. */
  ImIn = 'im-in',
  NotNow = 'not-now',
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
  [EmoteId.BlackjackInvite]: 'Blackjack?',
  [EmoteId.CrapsInvite]: 'Craps?',
  [EmoteId.ImIn]: "I'm in!",
  [EmoteId.NotNow]: 'Not now',
}

/** How long a bubble stays up. Derived at render, never sent. */
export const EMOTE_TTL_MS = 4_000

/** How long an arriving invite keeps its response card up. */
export const INVITE_WINDOW_MS = 12_000

/** The most characters a typed message may carry, before and after the wire. */
export const SAY_MAX_CHARS = 48

/**
 * The wire prefix that marks a typed message, as opposed to a catalogue id.
 *
 * Free text rides the same `emote` channel the way insurance rides `action`
 * as `insure:<amount>` — the room relays strings without reading them, so a
 * new kind of speech needs no new message. The prefix is what keeps the two
 * apart on receipt: no catalogue id contains a colon.
 */
export const SAY_PREFIX = 'say:'

/**
 * Never longer than nine per set: the picker numbers its entries, and a tenth
 * would be an emote no digit can reach.
 */
const GENERAL_SET: readonly EmoteId[] = [
  EmoteId.Wave,
  EmoteId.Hello,
  EmoteId.GoodLuck,
  EmoteId.NiceOne,
  // The invites live here, not at the tables: you ask from the street or the
  // floor, and once you are seated the asking is done.
  EmoteId.BlackjackInvite,
  EmoteId.CrapsInvite,
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

/**
 * What the response card offers when an invite arrives.
 *
 * Not part of any picker set: they only make sense as answers, and a "Not
 * now" with nothing to decline reads as rudeness at random.
 */
export const INVITE_RESPONSES: readonly EmoteId[] = [EmoteId.ImIn, EmoteId.NotNow]

/**
 * Which table an emote is an invitation to, or null for everything else.
 *
 * Total on the same rule as the sanitizers: any emote can be asked of it, and
 * "not an invite" must come out as null rather than as a third state.
 */
export function inviteTable(emote: EmoteId): TableId | null {
  if (emote === EmoteId.BlackjackInvite) return TableId.Blackjack
  if (emote === EmoteId.CrapsInvite) return TableId.Craps
  return null
}

/** What one player said: a catalogue id where there was one, and the label. */
export interface Said {
  /** The catalogue id, or null for typed text. */
  readonly emote: EmoteId | null
  /** What the bubble draws. Already safe: a label of ours, or sanitized text. */
  readonly text: string
}

/**
 * Coerces typed text into something safe to draw, or null for nothing.
 *
 * The same rules as `sanitizePlayerName`, for the same reason: this is
 * drawn to a canvas over somebody's head on other people's screens. Control
 * characters are stripped rather than escaped, whitespace collapses, and the
 * cap is what keeps a ten-thousand-character paste from being a denial of
 * service against the renderer.
 */
export function sanitizeSayText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const cleaned = Array.from(raw)
    // C0/C1 control characters become spaces rather than vanishing: a name
    // can afford to lose them outright, but in prose a pasted newline is a
    // word break, and dropping it would weld the words on either side.
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0
      return code > 0x1f && !(code >= 0x7f && code <= 0x9f) ? ch : ' '
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SAY_MAX_CHARS)

  return cleaned.length > 0 ? cleaned : null
}

/**
 * Coerces anything off the wire into something a bubble can draw, or null.
 *
 * The one gate for both kinds of speech: a catalogue id resolves to its
 * label, a `say:`-prefixed string is sanitized as typed text, and everything
 * else reads as silence. Every receiving client runs this — the room relays
 * without reading, so this is the only thing between a hostile peer and a
 * canvas texture.
 */
export function sanitizeSaid(value: unknown): Said | null {
  if (typeof value !== 'string') return null

  if (value.startsWith(SAY_PREFIX)) {
    const text = sanitizeSayText(value.slice(SAY_PREFIX.length))
    return text === null ? null : { emote: null, text }
  }

  const emote = sanitizeEmote(value)
  return emote === null ? null : { emote, text: EMOTE_LABELS[emote] }
}
