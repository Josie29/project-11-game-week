import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ENTRANCE, SIT_SPOTS, TableId } from '../scenes/casinoFloorLayout'
import { VenueId, getVenue, PLAYER_SPAWN } from '../world/venues'

export enum Location {
  Strip = 'strip',
  Interior = 'interior',
  /** The dressing-room stage: no world, just the character on a plinth. */
  Designer = 'designer',
}

export const STARTING_BANKROLL = 500

/** Pushes the player back from a door on exit so they do not instantly re-enter. */
const EXIT_OFFSET = 3.5

interface GameStore {
  bankroll: number
  location: Location
  activeVenue: VenueId | null
  /** Casino the player is standing next to, for the HUD prompt. */
  nearbyVenue: VenueId | null
  /**
   * The table the player is sitting at, or `null` while walking the floor.
   *
   * The casino used to be a table; now it is a room with two of them, so being
   * inside a casino and being in a game are separate states. This is what picks
   * the panel and the camera.
   */
  activeTable: TableId | null
  /** The table F would seat them at, for the floor prompt. */
  nearbyTable: TableId | null
  /** Where the player should appear when the casino floor mounts. */
  floorPosition: readonly [number, number, number]
  /** Where the player should appear when the strip mounts. */
  spawnPosition: readonly [number, number, number]
  /**
   * Yaw the strip camera starts at, in radians.
   *
   * Zero puts it behind the player looking down the street, which is the play
   * position. The dev deep links move it so a facade can be captured face-on —
   * the storefronts are all seen at a glancing angle from the play camera, and
   * a sliver of shop window is not enough to tell a built one from a broken one.
   */
  initialCameraYaw: number
  /**
   * Where closing the designer returns to.
   *
   * The mirror can be reached from inside the shop as well as on first run, and
   * dumping a player back onto the street because they changed their hair would
   * make the shop's mirror feel like an exit.
   */
  designerReturnTo: Location

  enterVenue: (id: VenueId) => void
  leaveVenue: () => void
  sitAt: (table: TableId) => void
  standUp: () => void
  setNearbyTable: (table: TableId | null) => void
  openDesigner: () => void
  closeDesigner: () => void
  setNearbyVenue: (id: VenueId | null) => void
  /** Adds `amount` to the bankroll. Negative values debit. */
  adjustBankroll: (amount: number) => void
  resetBankroll: () => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      bankroll: STARTING_BANKROLL,
      location: Location.Strip,
      activeVenue: null,
      nearbyVenue: null,
      activeTable: null,
      nearbyTable: null,
      floorPosition: ENTRANCE,
      spawnPosition: PLAYER_SPAWN,
      designerReturnTo: Location.Strip,
      initialCameraYaw: 0,

      enterVenue: (id) =>
        set({
          location: Location.Interior,
          activeVenue: id,
          nearbyVenue: null,
          // Always arrive on your feet at the door, never already seated.
          activeTable: null,
          nearbyTable: null,
          floorPosition: ENTRANCE,
        }),

      sitAt: (table) => set({ activeTable: table, nearbyTable: null }),

      /**
       * Stands the player up beside the table they were at.
       *
       * Putting them back at the entrance would read as being thrown out of the
       * casino for leaving a table; the same reasoning as the door offset in
       * `leaveVenue`.
       */
      standUp: () => {
        const { activeTable } = get()
        set({
          activeTable: null,
          nearbyTable: null,
          floorPosition: activeTable ? SIT_SPOTS[activeTable] : ENTRANCE,
        })
      },

      setNearbyTable: (table) => {
        // Called from the render loop, so bail out unless it actually changed.
        if (get().nearbyTable === table) return
        set({ nearbyTable: table })
      },

      openDesigner: () => {
        const { location } = get()
        if (location === Location.Designer) return

        set({ location: Location.Designer, designerReturnTo: location })
      },

      closeDesigner: () => set({ location: get().designerReturnTo }),

      leaveVenue: () => {
        const { activeVenue } = get()
        if (activeVenue === null) {
          set({ location: Location.Strip })
          return
        }

        const [x, y, z] = getVenue(activeVenue).doorPosition
        // Step back toward the centre of the street, away from the facade.
        const offsetX = x < 0 ? EXIT_OFFSET : -EXIT_OFFSET

        set({
          location: Location.Strip,
          activeVenue: null,
          nearbyVenue: null,
          activeTable: null,
          nearbyTable: null,
          spawnPosition: [x + offsetX, y, z],
        })
      },

      setNearbyVenue: (id) => {
        // Called from the render loop, so bail out unless the value actually changed.
        if (get().nearbyVenue === id) return
        set({ nearbyVenue: id })
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
