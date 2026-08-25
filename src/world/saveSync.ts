import { type Appearance, sanitizeAppearance } from '../character/appearance'
import { type EquippedItems, sanitizeEquipped, sanitizeOwned } from '../character/catalog'

/*
 * What a save is, and which of two of them wins.
 *
 * Pure, and tested, for the same reason the payout ratios are: this decides
 * where a bankroll goes when two devices disagree, and getting it wrong deletes
 * money silently rather than loudly. Nothing here imports React, Supabase or a
 * store — the sync layer in `src/store/saveSync.ts` does the talking, this only
 * does the arithmetic.
 */

/** Starting bankroll for a player with no save anywhere. */
export const STARTING_BANKROLL = 500

/**
 * The player's whole persisted state, flattened.
 *
 * Deliberately one object across both stores. They are persisted separately in
 * `localStorage` — two keys, so adding the wardrobe could not invalidate an
 * existing bankroll — but they travel as one row, because a save that is half
 * one device's and half another's is not a save anybody wants.
 */
export interface SaveData {
  readonly bankroll: number
  readonly debt: number
  readonly appearance: Appearance
  readonly owned: readonly string[]
  readonly equipped: EquippedItems
  readonly hasDesigned: boolean
  /**
   * Milliseconds since the epoch, from the clock of whichever device last
   * wrote. Both sides of `resolveSave` are the same kind of clock for that
   * reason — see the `updated_at` note in the migration.
   */
  readonly updatedAt: number
}

/** Which save won, and therefore what the caller has to do about it. */
export enum SaveResolution {
  /** The local save is newer, or the account is new. Push it up. */
  Push = 'push',
  /** The remote save is newer. Write it into the stores. */
  Pull = 'pull',
  /** Already in step. Touch nothing. */
  InSync = 'inSync',
}

export interface ResolvedSave {
  readonly resolution: SaveResolution
  /** The save that won. Always safe to render and always safe to store. */
  readonly save: SaveData
}

/** Clamps to a whole, non-negative, finite dollar amount. */
function sanitizeMoney(raw: unknown, fallback: number): number {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  // Money is whole dollars everywhere in this game; a fractional one cannot be
  // put on the felt as a chip.
  return Math.max(0, Math.floor(value))
}

/** Clamps to a finite epoch millisecond count, defaulting to the epoch. */
function sanitizeTimestamp(raw: unknown): number {
  const value = typeof raw === 'string' ? Date.parse(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

/**
 * Coerces anything at all into a save that is safe to play.
 *
 * Total: never throws, always returns something drawable and spendable. This is
 * the rule `sanitizeAppearance` and friends already follow for the wardrobe,
 * extended to the money — which had no coercion at all while it only ever came
 * from `localStorage`, and needs it now that it also arrives over a network.
 *
 * A save naming a since-removed hairstyle must produce a character with hair
 * rather than a hole, and a hand-edited bankroll of `"banana"` must produce a
 * playable number rather than a HUD reading `$NaN`.
 *
 * @param raw Whatever came back out of storage or the network.
 * @returns A complete, valid save.
 */
export function sanitizeSave(raw: unknown): SaveData {
  const candidate = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const owned = sanitizeOwned(candidate.owned)

  return {
    bankroll: sanitizeMoney(candidate.bankroll, STARTING_BANKROLL),
    debt: sanitizeMoney(candidate.debt, 0),
    appearance: sanitizeAppearance(candidate.appearance),
    owned,
    // Equipping something that was never bought is how a save edit turns into
    // free merchandise, so this is filtered against `owned` rather than trusted.
    equipped: sanitizeEquipped(candidate.equipped, owned),
    hasDesigned: candidate.hasDesigned === true,
    updatedAt: sanitizeTimestamp(candidate.updatedAt),
  }
}

/**
 * Decides which of the local and remote saves the player keeps.
 *
 * Later `updatedAt` wins, and a missing remote means a brand-new account, so
 * the local guest save goes up. That second half is the one that matters in
 * practice: without it, signing in for the first time would trade everything
 * earned as a guest for a fresh $500, which reads as being punished for making
 * an account.
 *
 * Ties resolve to `InSync` rather than to either side. A tie is what two
 * already-synced devices look like, and pushing on every tie would write to the
 * database on every page load.
 *
 * @param local The save on this device. Never null — a guest always has one.
 * @param remote The account's save, or `null` if the account has never saved.
 * @returns The winning save and what to do with it.
 */
export function resolveSave(local: SaveData, remote: SaveData | null): ResolvedSave {
  if (remote === null) return { resolution: SaveResolution.Push, save: local }

  if (remote.updatedAt > local.updatedAt) {
    return { resolution: SaveResolution.Pull, save: remote }
  }
  if (local.updatedAt > remote.updatedAt) {
    return { resolution: SaveResolution.Push, save: local }
  }

  return { resolution: SaveResolution.InSync, save: remote }
}

/** Column names as the `saves` table spells them, for the round trip. */
interface SaveRow {
  readonly bankroll: number
  readonly debt: number
  readonly appearance: unknown
  readonly owned: unknown
  readonly equipped: unknown
  readonly has_designed: boolean
  readonly updated_at: string
}

/**
 * Converts a database row into a save.
 *
 * Snake case to camel case, and everything through `sanitizeSave` on the way —
 * a row is no more trustworthy than a `localStorage` blob, because the client
 * that wrote it was somebody's browser.
 */
export function saveFromRow(row: unknown): SaveData {
  const candidate = (typeof row === 'object' && row !== null ? row : {}) as Partial<SaveRow>

  return sanitizeSave({
    bankroll: candidate.bankroll,
    debt: candidate.debt,
    appearance: candidate.appearance,
    owned: candidate.owned,
    equipped: candidate.equipped,
    hasDesigned: candidate.has_designed,
    updatedAt: candidate.updated_at,
  })
}

/**
 * Converts a save into a row ready to upsert.
 *
 * @param save The save to write.
 * @param userId The signed-in player's id, which is also the primary key.
 */
export function rowFromSave(save: SaveData, userId: string): SaveRow & { user_id: string } {
  return {
    user_id: userId,
    bankroll: save.bankroll,
    debt: save.debt,
    appearance: save.appearance,
    owned: save.owned,
    equipped: save.equipped,
    has_designed: save.hasDesigned,
    updated_at: new Date(save.updatedAt).toISOString(),
  }
}
