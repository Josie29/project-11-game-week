import {
  resolveSave,
  rowFromSave,
  type SaveData,
  SaveResolution,
  sanitizeSave,
  saveFromRow,
} from '../world/saveSync'
import { type RunningSequence, runSequence } from './sequence'
import { useAppearanceStore } from './useAppearanceStore'
import { type Player, watchSession } from './useAuthStore'
import { useGameStore } from './useGameStore'
import { supabase } from './supabase'

/*
 * Carries the save between `localStorage` and the account.
 *
 * The important decision is what this is *not*: it is not zustand's persist
 * storage. Swapping that for an async adapter is the obvious implementation and
 * it breaks the game, because `applyBootShortcut` runs synchronously before the
 * first render — an async hydration resolves after it and overwrites whatever
 * the `?boot=` link just set up, taking `npm run shots` and `npm run
 * walkthrough` with it. `App.tsx` has the same problem from the other side: it
 * derives the first-run designer from persisted `hasDesigned`, which would
 * start false and flash the character designer on every load.
 *
 * So `localStorage` stays exactly what it was — synchronous, authoritative
 * locally — and this rides on top. Startup is unchanged, guest play is
 * unchanged, and offline play is durable because the local save never waits for
 * the network.
 */

/**
 * How long to wait after a change before writing to the database.
 *
 * A hand of blackjack moves the bankroll several times in a few seconds — the
 * wager out, the payout in, the marker's cut — and each is a state change.
 * Waiting for the dust to settle turns a round into one write instead of five.
 */
const PUSH_DEBOUNCE_MS = 2_000

/** Where the local save's timestamp lives. Its own key, like the other two. */
const SAVED_AT_KEY = 'neon-strip-saved-at'

let pushBeat: RunningSequence | null = null
let currentPlayer: Player | null = null

/** Reads the local save's last-written time, or 0 if it has never been stamped. */
function localSavedAt(): number {
  const raw = window.localStorage.getItem(SAVED_AT_KEY)
  const parsed = raw === null ? NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Gathers the two stores into one save. */
function readLocalSave(): SaveData {
  const game = useGameStore.getState()
  const wardrobe = useAppearanceStore.getState()

  return sanitizeSave({
    bankroll: game.bankroll,
    debt: game.debt,
    appearance: wardrobe.appearance,
    owned: wardrobe.owned,
    equipped: wardrobe.equipped,
    hasDesigned: wardrobe.hasDesigned,
    updatedAt: localSavedAt(),
  })
}

/**
 * Writes a save into both stores.
 *
 * `setState` rather than the stores' own actions on purpose: `adjustBankroll`
 * and `buy` are gameplay, with their own rules about debt and affordability,
 * and restoring a save is neither. The save has already been sanitized.
 */
function applySave(save: SaveData): void {
  useGameStore.setState({ bankroll: save.bankroll, debt: save.debt })
  useAppearanceStore.setState({
    appearance: save.appearance,
    owned: [...save.owned],
    equipped: save.equipped,
    hasDesigned: save.hasDesigned,
  })
  window.localStorage.setItem(SAVED_AT_KEY, String(save.updatedAt))
}

/** Upserts the current local save against the signed-in player's row. */
async function push(player: Player, save: SaveData): Promise<void> {
  if (!supabase) return

  const { error } = await supabase.from('saves').upsert(rowFromSave(save, player.id))
  if (error) {
    // Deliberately not thrown. A failed sync must never interrupt a hand — the
    // local save still has everything, and the next change tries again.
    console.warn('[saveSync] could not write the save:', error.message)
  }
}

/**
 * Reconciles the local and remote saves for a player who has just signed in.
 *
 * The whole reason `resolveSave` is pure and tested: this is where a bankroll
 * can be silently replaced by a different one.
 */
async function reconcile(player: Player): Promise<void> {
  if (!supabase) return

  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', player.id)
    .maybeSingle()

  if (error) {
    console.warn('[saveSync] could not read the save:', error.message)
    return
  }

  const local = readLocalSave()
  // `maybeSingle` gives null for a brand-new account, which is exactly the case
  // `resolveSave` treats as "upload the guest save".
  const { resolution, save } = resolveSave(local, data === null ? null : saveFromRow(data))

  if (resolution === SaveResolution.Pull) {
    applySave(save)
    return
  }
  if (resolution === SaveResolution.Push) {
    // Stamp the upload so the two sides agree afterwards, rather than pushing a
    // timestamp of 0 from a save written before accounts existed.
    const stamped = { ...save, updatedAt: Math.max(save.updatedAt, Date.now()) }
    window.localStorage.setItem(SAVED_AT_KEY, String(stamped.updatedAt))
    await push(player, stamped)
  }
}

/**
 * A signature of just the fields that are saved.
 *
 * Both stores hold far more than they persist — `location`, `nearbyVenue`,
 * `atChair` and the rest — and a plain `subscribe` fires on all of it.
 * `setNearbyVenue` is called from the render loop, so without this the save
 * would be stamped and uploaded on every step the player takes.
 *
 * Comparing the persisted slice rather than adding `subscribeWithSelector` to
 * both stores keeps the change here, where the reason for it is written down.
 */
function saveSignature(): string {
  const { bankroll, debt } = useGameStore.getState()
  const { appearance, owned, equipped, hasDesigned } = useAppearanceStore.getState()

  return JSON.stringify([bankroll, debt, appearance, owned, equipped, hasDesigned])
}

let lastSignature = ''

/** Stamps the local save and, if signed in, schedules a debounced upload. */
function onLocalChange(): void {
  const signature = saveSignature()
  if (signature === lastSignature) return
  lastSignature = signature

  const now = Date.now()
  window.localStorage.setItem(SAVED_AT_KEY, String(now))

  const player = currentPlayer
  if (!player) return

  pushBeat?.cancel()
  pushBeat = runSequence([
    {
      at: PUSH_DEBOUNCE_MS,
      run: () => {
        void push(player, { ...readLocalSave(), updatedAt: now })
      },
    },
  ])
}

/**
 * True while a `?boot=` shortcut is driving the game.
 *
 * Those links exist to make a capture reproducible, and a save arriving from
 * the network mid-capture is the opposite of that — it would overwrite the
 * stacked hand the link just dealt. Dev-only, so this is always false in a
 * production build.
 */
function isBootShortcutActive(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has('boot')
}

/**
 * Starts syncing. Call once, after `applyBootShortcut`.
 *
 * Safe to call with no Supabase configured, in which case it does nothing at
 * all and the game keeps its existing `localStorage` behaviour.
 */
export function startSaveSync(): void {
  if (!supabase) return

  const frozen = isBootShortcutActive()

  /*
   * The session is watched even behind a `?boot=` link, and only the *save* is
   * held back. Bailing out of this entirely left the badge reading "restoring"
   * for ever, because nothing else resolves that state — so every dev capture
   * carried a blank placeholder under the bankroll.
   */
  watchSession((player) => {
    if (frozen) return
    currentPlayer = player
    void reconcile(player)
  })

  if (frozen) return

  // Seed the signature from the save as it stands, so restoring a page does not
  // read as a change and stamp a fresh timestamp over an older, truer one.
  lastSignature = saveSignature()

  // Both stores feed one row, so both have to stamp it. Subscribing even as a
  // guest is deliberate: it keeps the local timestamp honest, so the save a
  // player signs in with carries the time they actually earned it.
  useGameStore.subscribe(onLocalChange)
  useAppearanceStore.subscribe(onLocalChange)
}
