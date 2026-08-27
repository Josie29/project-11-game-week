/*
 * The secret that makes this tab the same player across reconnects.
 *
 * Sent in every `join`; the room hashes it into the public player id, so a
 * socket that drops and returns half a second later is the same person rather
 * than a freshly minted one — which is what left a seated ghost of the old
 * connection at the table. The token itself never appears on the wire to
 * anybody but the room, and never in the UI: peers only ever see the hash.
 *
 * Per *tab* on purpose, which is what `sessionStorage` is: two tabs are two
 * players, exactly as they are today, while a reload or reconnect in one tab
 * stays one player.
 */

const STORAGE_KEY = 'neon-strip-player-token'

/** Survives storage being denied entirely, at per-page-load scope. */
let inMemory: string | null = null

/**
 * This tab's secret, minting it on first use.
 *
 * @returns A random 128-bit token, stable for the life of the tab — or of the
 *   page, when storage is unavailable (private mode, or a non-browser test
 *   environment), which degrades to exactly the per-connection behaviour the
 *   room had before tokens existed.
 */
export function playerToken(): string {
  if (inMemory !== null) return inMemory

  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored !== null && stored.length >= 16) {
      inMemory = stored
      return stored
    }

    const minted = crypto.randomUUID()
    sessionStorage.setItem(STORAGE_KEY, minted)
    inMemory = minted
    return minted
  } catch {
    inMemory = crypto.randomUUID()
    return inMemory
  }
}
