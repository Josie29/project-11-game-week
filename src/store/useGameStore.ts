import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ENTRANCE, SIT_SPOTS, TableId } from '../scenes/casinoFloorLayout'
import { ENTRANCE as CLINIC_ENTRANCE, chairSitSpot } from '../scenes/clinicLayout'
import {
  DESK_FACING,
  DESK_STAND,
  ENTRANCE as SHOP_ENTRANCE,
  MIRROR_STAND,
} from '../scenes/shopLayout'
import { donationTimeline, NurseTask } from '../scenes/clinicRoutine'
import { runSequence, type RunningSequence } from './sequence'
import { DONATION_FEE, MARKER_AMOUNT, splitWinnings } from '../world/money'
import { VenueId, getVenue, PLAYER_SPAWN } from '../world/venues'

export enum Location {
  Strip = 'strip',
  Interior = 'interior',
  /** The dressing-room stage: no world, just the character on a plinth. */
  Designer = 'designer',
}

export const STARTING_BANKROLL = 500

/**
 * How far out onto the pavement leaving a venue puts the player.
 *
 * It was 3.5, which is out in the road, and it was 3.5 because a door opened on
 * contact: anything less and stepping out put you straight back in. Now that
 * going in takes a keypress, the number is free to be what it should always
 * have been — a step outside the door, close enough that the prompt to go back
 * in is still up, so leaving is visibly undoable rather than a shove into
 * traffic.
 */
const EXIT_OFFSET = 2.4

/** Down the length of the shop, with the door behind you. */
const FACING_INTO_SHOP = Math.PI
/** Back at the mirror, having just stepped off its plinth. */
const FACING_MIRROR = Math.PI

interface GameStore {
  bankroll: number
  /**
   * What is owed on an outstanding marker.
   *
   * Persisted with the bankroll. A debt you could clear by reloading the page
   * would not be a debt, and the whole point of replacing the free reset is
   * that losing has to cost something.
   */
  debt: number
  location: Location
  activeVenue: VenueId | null
  /** Venue the player is standing at the door of, for the HUD prompt. */
  nearbyVenue: VenueId | null
  /**
   * Whether the player is standing at the way out of the room they are in.
   *
   * A flag rather than an id because a room has exactly one door. It exists at
   * all because the exit used to work on contact: walking within three units of
   * the clinic's door put you back on the street, which is a distance that also
   * covers the end recliner. The way out now offers itself and waits, like every
   * other thing F acts on.
   */
  nearbyExit: boolean
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
  /**
   * The clinic recliner the player is in, or `null` while walking its floor.
   *
   * Separate from `activeTable` rather than a shared "seat": the two rooms have
   * different panels, different cameras and different rules about standing up,
   * and collapsing them would mean every reader having to work out which
   * building a seat belongs to.
   */
  atChair: number | null
  /** The recliner F would put them in, for the floor prompt. */
  nearbyChair: number | null
  /** Where the player should appear when the clinic floor mounts. */
  clinicPosition: readonly [number, number, number]
  /**
   * Whether the player is on the shop's fitting plinth.
   *
   * The shop's version of `atChair`: standing at the mirror swaps the trailing
   * camera for a fixed one and opens the till. Separate from the clinic's and
   * the casino's seats for the same reason those are separate from each other.
   */
  atMirror: boolean
  /**
   * Whether the player is standing at the shop's counter.
   *
   * The other half of `atMirror`, and separate from it because they are two
   * different rooms-within-a-room: the mirror is where you look at yourself and
   * the counter is where you pay, and no state can be both.
   */
  atCheckout: boolean
  /** The item F would try on, as a catalogue id, for the display prompt. */
  nearbyDisplay: string | null
  /** Whether F would step onto the fitting plinth. */
  nearbyMirror: boolean
  /** Whether F would step up to the counter. */
  nearbyDesk: boolean
  /**
   * Whether the player is close enough for the clerk to look up.
   *
   * Wider than `nearbyDesk` and fed by a separate proximity channel, because
   * being noticed and being offered the till are different questions — see the
   * `glanceTargets` note in `WalkingPlayer`.
   */
  nearbyClerk: boolean
  /**
   * Whether the clerk has just called the player back from the door.
   *
   * The one place in the game where F does not do the thing the prompt said
   * last frame, so it is a state rather than a branch: the first press at the
   * door while wearing unpaid goods spends itself on being told, the prompt
   * changes to say so, and the second press leaves anyway.
   *
   * A refusal that could not be overridden would be a trap — the way to clear a
   * bill you cannot pay is back at the counter, which is where a player who has
   * given up walking to the door is not.
   */
  heldAtDoor: boolean
  /** Where the player should appear when the shop floor mounts. */
  shopPosition: readonly [number, number, number]
  /**
   * Which way they face when they get there, in radians.
   *
   * Paired with `shopPosition` because the shop is the one room where where you
   * are standing implies what you are looking at: stepping off the plinth should
   * leave you facing the mirror, and a deep link that puts you at a fixture
   * should have you facing the fixture rather than the far wall.
   */
  shopFacing: number
  /**
   * The draw in progress, or `null`.
   *
   * `startedAt` drives the nurse's animation and the panel's wording; the
   * payout is a scheduled step rather than anything derived from it.
   */
  donation: { readonly chair: number; readonly startedAt: number } | null
  /** What the nurse is doing right now. */
  nurseTask: NurseTask
  /** Whether the player is at the clinic's desk, so the receptionist looks up. */
  nearDesk: boolean
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
  setNearbyExit: (near: boolean) => void
  sitAt: (table: TableId) => void
  standUp: () => void
  setNearbyTable: (table: TableId | null) => void
  sitInChair: (index: number) => void
  leaveChair: () => void
  setNearbyChair: (index: number | null) => void
  standAtMirror: () => void
  leaveMirror: () => void
  standAtCheckout: () => void
  leaveCheckout: () => void
  setNearbyDisplay: (itemId: string | null) => void
  setNearbyMirror: (near: boolean) => void
  setNearbyDesk: (near: boolean) => void
  setNearbyClerk: (near: boolean) => void
  /** The clerk's line at the door. Cleared by leaving, paying, or walking off. */
  setHeldAtDoor: (held: boolean) => void
  /** Calls the nurse over and starts the draw. Pays only when she finishes. */
  beginDonation: () => void
  setNearDesk: (near: boolean) => void
  openDesigner: () => void
  closeDesigner: () => void
  setNearbyVenue: (id: VenueId | null) => void
  /**
   * Adds `amount` to the bankroll. Negative values debit.
   *
   * The raw mover: wagers, shop purchases and the clinic's payout. Table
   * winnings go through `creditWinnings` instead.
   */
  adjustBankroll: (amount: number) => void
  /**
   * Credits a table settlement, paying down any marker out of the winnings.
   *
   * Deliberately separate from `adjustBankroll` rather than a branch inside it.
   * The clinic's payout is also a positive amount, and skimming that would mean
   * a player in debt earns nothing from donating — a trap rather than a
   * mechanic, and the one thing that must always work when you are broke.
   *
   * @param amount Chips returned, stake included — what the engines pay.
   * @param stakeReturned How much of `amount` is the player's own stake coming
   *   back. The marker takes its share of the *winnings*, never of this: it is
   *   the player's money, it was already debited when the bet went out, and
   *   skimming it made a push cost half the stake and a win pay nothing at all.
   * @returns What actually reached the bankroll, which is less than `amount`
   *   while a marker is outstanding. Callers showing chips travelling to the
   *   stash need this rather than the gross, or they show money twice.
   */
  creditWinnings: (amount: number, stakeReturned: number) => number
  /** Borrows `MARKER_AMOUNT` from the house. Refused if one is outstanding. */
  takeMarker: () => void
  /** Sells a pint. No cooldown — the ten seconds in the chair is the cost. */
  donate: () => void
  resetBankroll: () => void
}

/**
 * The draw in flight, held outside the store.
 *
 * A timer handle is not state anything renders from, and putting it in the
 * store would mean every tick of it re-rendering the room.
 */
let draw: RunningSequence | null = null

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      bankroll: STARTING_BANKROLL,
      debt: 0,
      location: Location.Strip,
      activeVenue: null,
      nearbyVenue: null,
      nearbyExit: false,
      activeTable: null,
      nearbyTable: null,
      floorPosition: ENTRANCE,
      atChair: null,
      nearbyChair: null,
      clinicPosition: CLINIC_ENTRANCE,
      atMirror: false,
      atCheckout: false,
      nearbyDisplay: null,
      nearbyMirror: false,
      nearbyDesk: false,
      nearbyClerk: false,
      heldAtDoor: false,
      shopPosition: SHOP_ENTRANCE,
      shopFacing: FACING_INTO_SHOP,
      donation: null,
      nurseTask: NurseTask.Patrolling,
      nearDesk: false,
      spawnPosition: PLAYER_SPAWN,
      designerReturnTo: Location.Strip,
      initialCameraYaw: 0,

      enterVenue: (id) =>
        set({
          location: Location.Interior,
          activeVenue: id,
          nearbyVenue: null,
          // Arriving is never also standing at the way out — see the exit
          // radius assertions in `venueDoors.test.ts`.
          nearbyExit: false,
          // Always arrive on your feet at the door, never already seated.
          activeTable: null,
          nearbyTable: null,
          floorPosition: ENTRANCE,
          atChair: null,
          nearbyChair: null,
          clinicPosition: CLINIC_ENTRANCE,
          atMirror: false,
          atCheckout: false,
          nearbyDisplay: null,
          nearbyMirror: false,
          nearbyDesk: false,
          nearbyClerk: false,
          heldAtDoor: false,
          shopPosition: SHOP_ENTRANCE,
          shopFacing: FACING_INTO_SHOP,
          donation: null,
          nurseTask: NurseTask.Patrolling,
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

      sitInChair: (index) => set({ atChair: index, nearbyChair: null }),

      beginDonation: () => {
        const { atChair, donation } = get()
        if (atChair === null || donation !== null) return

        const timeline = donationTimeline()
        const chair = atChair

        draw?.cancel()
        set({
          donation: { chair, startedAt: performance.now() },
          nurseTask: NurseTask.Approaching,
        })

        draw = runSequence(
          [
            { at: timeline.arriveAt, run: () => set({ nurseTask: NurseTask.Working }) },
            {
              at: timeline.completeAt,
              run: () => {
                /*
                 * Paid and stamped together, at the end.
                 *
                 * Stamping the day up front would burn it for nothing when
                 * somebody stands up mid-needle. Doing both here means leaving
                 * early costs exactly nothing, which is what makes staying a
                 * choice rather than a formality.
                 */
                get().donate()
                set({ donation: null, nurseTask: NurseTask.Returning })
              },
            },
          ],
          // Getting out of the chair abandons the rest. Without this the money
          // arrives after the player has walked off, from a nurse who is no
          // longer beside anybody.
          { isStillValid: () => get().atChair === chair && get().donation !== null },
        )
      },

      /** Stands the player up beside the chair they were in, cancelling any draw. */
      leaveChair: () => {
        const { atChair } = get()

        draw?.cancel()
        draw = null

        set({
          atChair: null,
          nearbyChair: null,
          donation: null,
          nurseTask: NurseTask.Returning,
          clinicPosition: atChair === null ? CLINIC_ENTRANCE : chairSitSpot(atChair),
        })
      },

      setNearbyChair: (index) => {
        if (get().nearbyChair === index) return
        set({ nearbyChair: index })
      },

      standAtMirror: () => set({ atMirror: true, nearbyMirror: false, nearbyDisplay: null }),

      /**
       * Steps back off the plinth, onto the floor in front of it.
       *
       * Not back to the door: being returned to the entrance for looking in the
       * mirror is the same complaint the casino's `standUp` fixed.
       */
      leaveMirror: () =>
        set({ atMirror: false, shopPosition: MIRROR_STAND, shopFacing: FACING_MIRROR }),

      standAtCheckout: () =>
        set({ atCheckout: true, nearbyDesk: false, nearbyDisplay: null, nearbyExit: false }),

      /** Steps back off the counter, onto the customer's side of it. */
      leaveCheckout: () =>
        set({ atCheckout: false, shopPosition: DESK_STAND, shopFacing: DESK_FACING }),

      setNearbyDisplay: (itemId) => {
        // Called from the render loop, so bail out unless it actually changed.
        if (get().nearbyDisplay === itemId) return
        set({ nearbyDisplay: itemId })
      },

      setNearbyMirror: (near) => {
        if (get().nearbyMirror === near) return
        set({ nearbyMirror: near })
      },

      setNearbyDesk: (near) => {
        if (get().nearbyDesk === near) return
        set({ nearbyDesk: near })
      },

      setNearbyClerk: (near) => {
        if (get().nearbyClerk === near) return
        set({ nearbyClerk: near })
      },

      setHeldAtDoor: (held) => {
        if (get().heldAtDoor === held) return
        set({ heldAtDoor: held })
      },

      setNearDesk: (near) => {
        // Called from the render loop, so bail out unless it actually changed.
        if (get().nearDesk === near) return
        set({ nearDesk: near })
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
        // Out toward the middle of the road, whichever side the door is on.
        const offsetX = x < 0 ? EXIT_OFFSET : -EXIT_OFFSET

        set({
          location: Location.Strip,
          activeVenue: null,
          nearbyVenue: null,
          nearbyExit: false,
          activeTable: null,
          nearbyTable: null,
          atChair: null,
          nearbyChair: null,
          atMirror: false,
          atCheckout: false,
          nearbyDisplay: null,
          nearbyMirror: false,
          nearbyDesk: false,
          nearbyClerk: false,
          heldAtDoor: false,
          shopPosition: SHOP_ENTRANCE,
          shopFacing: FACING_INTO_SHOP,
          donation: null,
          nurseTask: NurseTask.Patrolling,
          spawnPosition: [x + offsetX, y, z],
        })
      },

      setNearbyExit: (near) => {
        // Called from the render loop, so bail out unless it actually changed.
        if (get().nearbyExit === near) return
        set({ nearbyExit: near })
      },

      setNearbyVenue: (id) => {
        // Called from the render loop, so bail out unless the value actually changed.
        if (get().nearbyVenue === id) return
        set({ nearbyVenue: id })
      },

      adjustBankroll: (amount) => set({ bankroll: Math.max(0, get().bankroll + amount) }),

      creditWinnings: (amount, stakeReturned) => {
        const { bankroll, debt } = get()

        // Only what the player is up on the round is the house's to split.
        const stake = Math.min(Math.max(0, stakeReturned), Math.max(0, amount))
        const { toBankroll, toDebt } = splitWinnings(amount - stake, debt)

        const credited = stake + toBankroll
        set({ bankroll: Math.max(0, bankroll + credited), debt: debt - toDebt })

        return credited
      },

      takeMarker: () => {
        // One marker at a time. Easy to state, easy to test, and it stops the
        // player burying themselves somewhere the clinic cannot dig them out of.
        if (get().debt > 0) return
        set({ bankroll: get().bankroll + MARKER_AMOUNT, debt: MARKER_AMOUNT })
      },

      donate: () => {
        // Straight to the bankroll, not through `creditWinnings`: see the note
        // there. A donation has to reach the player whatever they owe.
        set({ bankroll: get().bankroll + DONATION_FEE })
      },

      resetBankroll: () => set({ bankroll: STARTING_BANKROLL, debt: 0 }),
    }),
    {
      name: 'neon-strip-save',
      // Only the bankroll survives a reload; the player always respawns on the strip.
      partialize: (state) => ({
        bankroll: state.bankroll,
        debt: state.debt,
      }),
    },
  ),
)
