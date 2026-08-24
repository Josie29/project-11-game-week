import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CasinoId, getCasino, PLAYER_SPAWN } from '../world/casinos'

export enum Location {
  Strip = 'strip',
  Interior = 'interior',
}

export const STARTING_BANKROLL = 500

/** Pushes the player back from a door on exit so they do not instantly re-enter. */
const EXIT_OFFSET = 3.5

interface GameStore {
  bankroll: number
  location: Location
  activeCasino: CasinoId | null
  /** Casino the player is standing next to, for the HUD prompt. */
  nearbyCasino: CasinoId | null
  /** Where the player should appear when the strip mounts. */
  spawnPosition: readonly [number, number, number]

  enterCasino: (id: CasinoId) => void
  leaveCasino: () => void
  setNearbyCasino: (id: CasinoId | null) => void
  /** Adds `amount` to the bankroll. Negative values debit. */
  adjustBankroll: (amount: number) => void
  resetBankroll: () => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      bankroll: STARTING_BANKROLL,
      location: Location.Strip,
      activeCasino: null,
      nearbyCasino: null,
      spawnPosition: PLAYER_SPAWN,

      enterCasino: (id) => set({ location: Location.Interior, activeCasino: id, nearbyCasino: null }),

      leaveCasino: () => {
        const { activeCasino } = get()
        if (activeCasino === null) {
          set({ location: Location.Strip })
          return
        }

        const [x, y, z] = getCasino(activeCasino).doorPosition
        // Step back toward the centre of the street, away from the facade.
        const offsetX = x < 0 ? EXIT_OFFSET : -EXIT_OFFSET

        set({
          location: Location.Strip,
          activeCasino: null,
          nearbyCasino: null,
          spawnPosition: [x + offsetX, y, z],
        })
      },

      setNearbyCasino: (id) => {
        // Called from the render loop, so bail out unless the value actually changed.
        if (get().nearbyCasino === id) return
        set({ nearbyCasino: id })
      },

      adjustBankroll: (amount) => set({ bankroll: Math.max(0, get().bankroll + amount) }),

      resetBankroll: () => set({ bankroll: STARTING_BANKROLL }),
    }),
    {
      name: 'neon-strip-save',
      // Only the bankroll survives a reload; the player always respawns on the strip.
      partialize: (state) => ({ bankroll: state.bankroll }),
    },
  ),
)
