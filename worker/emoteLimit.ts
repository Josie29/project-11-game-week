/*
 * The emote rate limit, as arithmetic.
 *
 * Nothing else a client sends is spammable by holding a key: poses are gated
 * by shouldSend, and every table message is answered by game state. An emote
 * is fired at will and relayed to the whole room, so it is the one message a
 * held key could turn into a flood — and the room is the only party every
 * client is forced to go through, which makes it the only place the limit is
 * real.
 *
 * Pure and kept beside `dice.ts` for the same reason: the worker is outside
 * the vitest suite, so the rule lives here where `src/__tests__` can import
 * it by relative path.
 */

/** The window a burst is measured over. */
export const EMOTE_WINDOW_MS = 10_000

/** How many emotes fit in one window. */
export const EMOTE_BURST = 3

/** The verdict, and the pruned history to write back to the attachment. */
export interface EmoteAdmission {
  readonly ok: boolean
  readonly sent: readonly number[]
}

/**
 * Admits or denies an emote against a player's recent history.
 *
 * A sliding window rather than a fixed one: three quick callouts land, the
 * fourth waits until the oldest of the three is a window old. The pruned list
 * is returned in both cases so the caller always writes back a bounded array —
 * the history can never grow past `EMOTE_BURST` entries, which matters because
 * it is serialized into the socket attachment on every emote.
 *
 * `undefined` is a real input, not an error: an attachment serialized before
 * this field existed comes back without it after hibernation, and a deploy
 * must not turn a live room's first emote into a crash.
 *
 * @param sent Timestamps of this player's admitted emotes, oldest first.
 * @param now The room's clock, `Date.now()`.
 */
export function admitEmote(sent: readonly number[] | undefined, now: number): EmoteAdmission {
  const recent = (sent ?? []).filter((at) => now - at < EMOTE_WINDOW_MS)
  if (recent.length >= EMOTE_BURST) return { ok: false, sent: recent }
  return { ok: true, sent: [...recent, now] }
}
