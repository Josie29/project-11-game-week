import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Whether this player wants other people in their game.
 *
 * An enum rather than a boolean because it crosses module boundaries — the
 * welcome screen writes it, the presence store reads it — and `mode ===
 * PlayMode.Single` says what it means where `!multiplayer` does not.
 */
export enum PlayMode {
  /** No socket is opened at all. Not "peers hidden": never connected. */
  Single = 'single',
  Multiplayer = 'multiplayer',
}

interface SessionStore {
  /**
   * False until the welcome screen has been through once.
   *
   * Deliberately not folded into `hasDesigned`. Designing is skippable, so
   * "has been welcomed" and "has built a character" are genuinely different
   * states — sharing one flag would either show the welcome screen for ever to
   * anyone who skipped the designer, or skip it for anyone who designed.
   */
  hasWelcomed: boolean
  mode: PlayMode

  /** Records the choice and puts the player into the game. */
  completeWelcome: (mode: PlayMode) => void
  setMode: (mode: PlayMode) => void
  /** Reopens the welcome screen. Dev and "start over" only. */
  reset: () => void
}

/**
 * Coerces anything at all into a `PlayMode`, defaulting to playing alone.
 *
 * Exported for its test rather than for callers. It fails closed on purpose:
 * anything unrecognised is `Single`, so the worst a hand-edited save can do is
 * decline to open a socket. The other direction would open one on a player who
 * never asked for it.
 */
export function sanitizeMode(value: unknown): PlayMode {
  return value === PlayMode.Multiplayer ? PlayMode.Multiplayer : PlayMode.Single
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      hasWelcomed: false,
      /*
       * Single until chosen otherwise, so nothing can open a socket on a player
       * who has never seen the screen that offers one. Every capture runs in a
       * fresh profile and would otherwise be the first to find out.
       */
      mode: PlayMode.Single,

      completeWelcome: (mode) => set({ hasWelcomed: true, mode }),
      setMode: (mode) => set({ mode }),
      reset: () => set({ hasWelcomed: false, mode: PlayMode.Single }),
    }),
    {
      // Its own key, on the same rule as the wardrobe: adding this must not
      // invalidate an existing player's bankroll or their character.
      name: 'neon-strip-session',
      /*
       * `localStorage` is user-writable and `mode` decides whether a socket
       * opens, so it is coerced back into one of two known values on the way in
       * rather than trusted. A save saying `mode: "multiplayer "` must not read
       * as neither value and leave the game in a third state.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SessionStore>

        return {
          ...current,
          hasWelcomed: saved.hasWelcomed === true,
          mode: sanitizeMode(saved.mode),
        }
      },
    },
  ),
)
