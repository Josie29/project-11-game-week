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
  /**
   * Whether the settings panel is up.
   *
   * Deliberately excluded from `partialize`. A reload that came back with the
   * menu open would be a menu the player never asked for, over a scene they had
   * already started playing.
   */
  settingsOpen: boolean
  /**
   * Whether the emote picker is up.
   *
   * Excluded from `partialize` on the same rule as `settingsOpen` — and read
   * by the table hotkeys, which yield their digits while it is open, so the
   * picker's numbers never double as a blackjack stake.
   */
  emotePickerOpen: boolean

  /** Records the choice and puts the player into the game. */
  completeWelcome: (mode: PlayMode) => void
  setMode: (mode: PlayMode) => void
  openSettings: () => void
  closeSettings: () => void
  toggleSettings: () => void
  toggleEmotePicker: () => void
  closeEmotePicker: () => void
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
    (set, get) => ({
      hasWelcomed: false,
      /*
       * Single until chosen otherwise, so nothing can open a socket on a player
       * who has never seen the screen that offers one. Every capture runs in a
       * fresh profile and would otherwise be the first to find out.
       */
      mode: PlayMode.Single,
      settingsOpen: false,
      emotePickerOpen: false,

      completeWelcome: (mode) => set({ hasWelcomed: true, mode }),
      setMode: (mode) => set({ mode }),

      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      toggleSettings: () => set({ settingsOpen: !get().settingsOpen }),
      toggleEmotePicker: () => set({ emotePickerOpen: !get().emotePickerOpen }),
      closeEmotePicker: () => set({ emotePickerOpen: false }),

      /*
       * Closes the panel on the way out.
       *
       * "Start over" is pressed inside the settings panel and its whole effect
       * is to put the welcome screen back up. Leaving `settingsOpen` true would
       * stack the menu on top of it, and dismissing that would drop the player
       * into a game they had just asked to restart.
       */
      reset: () =>
        set({
          hasWelcomed: false,
          mode: PlayMode.Single,
          settingsOpen: false,
          emotePickerOpen: false,
        }),
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
      /*
       * Only the two decisions, never the menu's own state.
       *
       * Without this every field is written, so a player who reloaded with the
       * settings panel open would come back to it open — a menu in front of a
       * game they were already playing.
       */
      partialize: (state) => ({ hasWelcomed: state.hasWelcomed, mode: state.mode }),
    },
  ),
)
